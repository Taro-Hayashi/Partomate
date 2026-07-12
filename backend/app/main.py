from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import socket
import time
import logging
import os

from sqlalchemy.orm import Session
from fastapi import Depends
from .database import engine, Base, get_db, SessionLocal, BASE_DIR
from .models import User, Setting
from .pricing import FALLBACK_RATE_TO_JPY
from .routers import auth, parts, products, settings, chat, desktop
from .routers.settings import migrate_settings
from .seed_data import seed_initial_data

# Create tables in the SQLite database (runs on startup)
Base.metadata.create_all(bind=engine)

def run_migrations():
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns("parts")]
    with engine.begin() as conn:
        if "alert_threshold" not in columns:
            conn.execute(text("ALTER TABLE parts ADD COLUMN alert_threshold REAL DEFAULT 0.0"))
        if "price_input_type" not in columns:
            conn.execute(text("ALTER TABLE parts ADD COLUMN price_input_type TEXT DEFAULT 'unit' NOT NULL"))
        if "purchase_quantity" not in columns:
            conn.execute(text("ALTER TABLE parts ADD COLUMN purchase_quantity REAL"))
        if "original_unit_price" not in columns:
            conn.execute(text("ALTER TABLE parts ADD COLUMN original_unit_price REAL"))
            conn.execute(text("UPDATE parts SET original_unit_price = purchase_price WHERE original_unit_price IS NULL"))
        if "original_total_price" not in columns:
            conn.execute(text("ALTER TABLE parts ADD COLUMN original_total_price REAL"))
        if "original_currency" not in columns:
            conn.execute(text("ALTER TABLE parts ADD COLUMN original_currency TEXT"))
            conn.execute(text("UPDATE parts SET original_currency = currency WHERE original_currency IS NULL"))
        if "exchange_rate" not in columns:
            conn.execute(text("ALTER TABLE parts ADD COLUMN exchange_rate REAL"))
            rate_cases = " ".join(
                f"WHEN COALESCE(original_currency, currency) = '{currency}' THEN {rate} "
                for currency, rate in FALLBACK_RATE_TO_JPY.items()
                if currency != "JPY"
            )
            conn.execute(text(
                "UPDATE parts SET exchange_rate = CASE "
                f"{rate_cases}"
                "ELSE 1.0 END "
                "WHERE exchange_rate IS NULL"
            ))

run_migrations()

db = SessionLocal()
try:
    seed_initial_data(db)
    migrate_settings(db)
finally:
    db.close()

app = FastAPI(
    title="Partomate API",
    description="Backend API for Partomate Parts and Inventory Management System",
    version="0.1.0"
)

# Access restriction middleware (to allow specific Tailscale hosts/IPs)
logger = logging.getLogger(__name__)
dns_cache = {}  # hostname -> (ip, timestamp)

def resolve_host_cached(hostname: str):
    now = time.time()
    if hostname in dns_cache:
        ip, ts = dns_cache[hostname]
        if now - ts < 60:  # 60s cache
            return ip
    try:
        ip = socket.gethostbyname(hostname)
        dns_cache[hostname] = (ip, now)
        return ip
    except Exception as e:
        logger.warning(f"Failed to resolve host {hostname}: {e}")
        return None

@app.middleware("http")
async def host_restriction_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else None
    
    # Always allow local connections
    if client_ip in ("127.0.0.1", "localhost", "::1"):
        return await call_next(request)
        
    db = SessionLocal()
    allowed_hosts_str = ""
    try:
        allowed_hosts_setting = db.query(Setting).filter(Setting.key == "allowed_hosts").first()
        allowed_hosts_str = allowed_hosts_setting.value if allowed_hosts_setting else ""
    except Exception as e:
        logger.error(f"Failed to query allowed_hosts: {e}")
        allowed_hosts_str = ""
    finally:
        db.close()
        
    logger.debug(f"Client IP: {client_ip}, Allowed Hosts: '{allowed_hosts_str}'")
    
    if not allowed_hosts_str or allowed_hosts_str.strip() in ("", "*"):
        return await call_next(request)
        
    allowed_hosts = [h.strip() for h in allowed_hosts_str.split(",") if h.strip()]
    
    ip_allowed = False
    for host in allowed_hosts:
        if client_ip == host:
            ip_allowed = True
            break
        resolved_ip = resolve_host_cached(host)
        logger.debug(f"Checking host '{host}' (resolved: '{resolved_ip}') against client_ip '{client_ip}'")
        if resolved_ip and client_ip == resolved_ip:
            ip_allowed = True
            break
            
    logger.debug(f"Access allowed: {ip_allowed}")
    if not ip_allowed:
        logger.warning(f"Access denied for client IP: {client_ip}. Allowed hosts: {allowed_hosts_str}")
        return JSONResponse(
            status_code=403,
            content={"detail": f"Access denied. Client IP {client_ip} is not allowed."}
        )
        
    return await call_next(request)

# Configure CORS for frontend connections.
# Authentication uses Bearer tokens (Authorization header), not cookies, so
# allow_credentials stays False. This keeps the permissive default origin valid
# per the CORS spec (a wildcard origin is only invalid together with credentials).
# ALLOWED_ORIGINS (comma-separated) can restrict origins explicitly when needed.
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
allow_origins = (
    [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
    if allowed_origins_env
    else ["*"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = os.getenv("PARTOMATE_UPLOADS_DIR", os.path.join(BASE_DIR, "uploads"))
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Include routers
app.include_router(auth.router)
app.include_router(parts.router)
app.include_router(products.router)
app.include_router(settings.router)
app.include_router(chat.router)
app.include_router(desktop.router)

# Desktop build serves the frontend bundle from the same port. When enabled,
# the SPA takes over "/" and the API root JSON is replaced by /api/auth/status.
STATIC_DIR = os.getenv("PARTOMATE_STATIC_DIR", "").strip()

if STATIC_DIR and os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
else:
    @app.get("/")
    def read_root(db: Session = Depends(get_db)):
        user_exists = db.query(User).first() is not None
        return {
            "message": "Welcome to Partomate API.",
            "setup_required": not user_exists
        }
