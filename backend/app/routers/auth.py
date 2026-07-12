from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
)
from ..schemas import UserCreate, UserResponse, Token
from .settings import set_setting_value

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/setup", response_model=UserResponse)
def setup_admin(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if any user already exists
    existing_user = db.query(User).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Setup is already completed. Admin user already exists."
        )
    
    # Force first user to be admin
    hashed_password = get_password_hash(user_in.password)
    db_user = User(
        username=user_in.username,
        password_hash=hashed_password,
        role="admin"
    )
    db.add(db_user)
    if user_in.language in ("ja", "en"):
        set_setting_value(db, "language", user_in.language)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.get("/status")
def setup_status(db: Session = Depends(get_db)):
    user_exists = db.query(User).first() is not None
    return {"setup_required": not user_exists}

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
