import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_current_user
from ..schemas import DesktopConfig

router = APIRouter(prefix="/api/desktop", tags=["desktop"])

logger = logging.getLogger(__name__)

CONFIG_FILENAME = "config.json"
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
EXTERNAL_HOST = "0.0.0.0"
LOOPBACK_HOST = "127.0.0.1"


def get_data_dir() -> str:
    """Return the desktop data directory, or raise 404 when not in desktop mode.

    Read at request time (not import time) so tests can toggle the environment
    variable per test without reimporting the module.
    """
    data_dir = os.getenv("PARTOMATE_DATA_DIR", "").strip()
    if not data_dir:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Desktop configuration is only available in the desktop build.",
        )
    return data_dir


def _config_path(data_dir: str) -> str:
    return os.path.join(data_dir, CONFIG_FILENAME)


def _read_config(data_dir: str) -> dict:
    """Load config.json, returning an empty dict when missing or unreadable."""
    try:
        with open(_config_path(data_dir), "r", encoding="utf-8") as f:
            config = json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError):
        logger.warning("Could not read desktop config.json; treating as empty.")
        return {}
    return config if isinstance(config, dict) else {}


def _is_external(config: dict) -> bool:
    host = config.get("host")
    if not host:
        return False
    return host not in LOOPBACK_HOSTS


@router.get("/config", response_model=DesktopConfig)
def get_desktop_config(current_user=Depends(get_current_user)):
    data_dir = get_data_dir()
    config = _read_config(data_dir)
    return DesktopConfig(external_access=_is_external(config))


@router.put("/config", response_model=DesktopConfig)
def update_desktop_config(
    payload: DesktopConfig,
    current_user=Depends(get_current_user),
):
    data_dir = get_data_dir()
    config = _read_config(data_dir)
    config["host"] = EXTERNAL_HOST if payload.external_access else LOOPBACK_HOST
    with open(_config_path(data_dir), "w", encoding="utf-8") as f:
        json.dump(config, f)
    return DesktopConfig(external_access=payload.external_access)
