import httpx
import os
import time
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import Dict, Any

from ..database import get_db, BASE_DIR
from ..models import Setting
from ..auth import get_current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

OPENAI_API_PROVIDER = "openai_api"
OPENAI_API_BASE_URL = "https://api.openai.com"
OPENAI_API_KEY_SETTING = "openai_api_key"
RECOMMENDED_OPENAI_API_MODELS = ["gpt-5.4-mini", "gpt-5.4-nano"]
UPLOADS_DIR = Path(os.getenv("PARTOMATE_UPLOADS_DIR", Path(BASE_DIR) / "uploads"))
BACKGROUND_UPLOAD_DIR = UPLOADS_DIR / "settings"
BACKGROUND_IMAGE_PREFIX = "background_image"
ALLOWED_BACKGROUND_IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
RESPONSE_ONLY_SETTING_KEYS = {
    "default_system_prompt",
    "default_system_prompts",
    "system_prompts",
    "system_prompt_modes",
    "openai_api_key_configured",
    "openai_api_key_source",
}

PROMPT_SETTING_KEYS = {
    "chat": {"ja": "system_prompt", "en": "system_prompt_chat_en"},
    "parts": {"ja": "system_prompt_parts_ja", "en": "system_prompt_parts_en"},
    "products": {"ja": "system_prompt_products_ja", "en": "system_prompt_products_en"},
    "settings": {"ja": "system_prompt_settings_ja", "en": "system_prompt_settings_en"},
}
PROMPT_MODE_KEYS = {
    page: {
        lang: f"{prompt_key}_mode"
        for lang, prompt_key in lang_keys.items()
    }
    for page, lang_keys in PROMPT_SETTING_KEYS.items()
}
PROMPT_MODE_SETTING_KEYS = {
    mode_key
    for page_modes in PROMPT_MODE_KEYS.values()
    for mode_key in page_modes.values()
}
BACKGROUND_IMAGE_MODES = {"none", "dots", "stripes", "checks", "image"}

DEFAULT_SETTINGS = {
    "llm_enabled": "true",
    "llm_provider": "openai",
    "llm_url": "http://localhost:1234",  # LM Studio default port
    "llm_model": "",
    "user_nickname": "ユーザー",
    "ai_pronoun": "私",
    "currency": "JPY",
    "system_prompt": (
        "あなたは部品在庫管理のAIアシスタントです。ユーザーのメッセージを解析し、以下のいずれかのJSONのみを返してください。余計な説明やマークダウンは一切含めないでください。\n\n"
        "【解析ルール】\n"
        "- 部品の記述で追加か消費か曖昧な場合は「追加 (add)」、商品の記述は「消費 (consume)」とします。\n"
        "- トップチャットで扱う部品操作は在庫の追加 (add) と消費 (consume) のみです。単価調整や部品編集は部品ページのチャットで扱います。\n"
        "- 「ネジ 10」のように規格・サイズが不明な場合は、category1を「ネジ」、数量を10とし、category2, category3はnullにしてください。\n"
        "- 「商品A 5」や「handyman2」、「Cannonball 1」のように商品名と数値が並んでいる、または連結している場合で、登録商品名（例:「Handyman」）と一致する部分があるときは、一致した部分を商品名とし、残りの数値を数量（product_count）として解釈してください。\n"
        "- 質問を受けてデータベースから検索する場合のみ「tool_call」を使用してください。\n"
        "- 雑談や質問は type: \"message\" とし、二人称「{user_nickname}」、一人称「{ai_pronoun}」で回答してください。\n\n"
        "【出力形式】\n"
        "1. 部品在庫の追加・消費。items内のキーは必ず全て出力します。\n"
        "{\n"
        "  \"type\": \"parts\",\n"
        "  \"action\": \"add\" | \"consume\",\n"
        "  \"items\": [{\n"
        "    \"category1\": \"種類 (例: ネジ)\",\n"
        "    \"category2\": \"規格 (例: M2) ※なければ null\",\n"
        "    \"category3\": \"サイズ (例: 8mm) ※なければ null\",\n"
        "    \"quantity\": \"数量。不明なら0\",\n"
        "    \"purchase_price\": \"単価。なければ0\",\n"
        "    \"total_price\": \"総額。なければnull\",\n"
        "    \"currency\": \"JPY・USD・EUR。なければnull\",\n"
        "    \"purchase_date\": \"購入日。なければnull\"\n"
        "  }]\n"
        "}\n\n"
        "2. 商品の組み立て (構成部品の消費)\n"
        "{\n"
        "  \"type\": \"product\",\n"
        "  \"action\": \"consume\",\n"
        "  \"items\": [\n"
        "    {\n"
        "      \"product_name\": \"商品名\",\n"
        "      \"product_count\": 数量\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "3. 問い合わせや雑談などの対話\n"
        "{\n"
        "  \"type\": \"message\",\n"
        "  \"message\": \"回答（二人称は「{user_nickname}」、一人称は「{ai_pronoun}」を使用）\"\n"
        "}\n\n"
        "4. データベースの照会\n"
        "{\n"
        "  \"type\": \"tool_call\",\n"
        "  \"tool\": \"get_parts_list\" | \"get_products\",\n"
        "  \"args\": {\n"
        "    \"category1\": \"値\", \"category2\": \"値\", \"category3\": \"値\", \"name\": \"商品名\"\n"
        "  } /* args内は任意 */\n"
        "}"
    ),
    "language": "ja",
    "theme_color": "tomato",
    "theme_wallpaper": "default",
    "background_image_mode": "none",
    "background_pattern_size": "10",
    "background_dot_size": "10",
    "background_stripe_width": "16",
    "background_check_size": "32",
    "background_image_data": "",
    "background_image_url": "",
    "background_image_filename": "",
    "background_image_layout": "fit",
    "send_key": "shift_enter",
    "system_prompt_version": "19",
    "allowed_hosts": ""
}

def set_setting_value(db: Session, key: str, value: str):
    db_setting = db.query(Setting).filter(Setting.key == key).first()
    if db_setting:
        db_setting.value = value
    else:
        db_setting = Setting(key=key, value=value)
        db.add(db_setting)

def get_openai_api_key(db: Session) -> str:
    env_key = os.getenv("OPENAI_API_KEY", "").strip()
    if env_key:
        return env_key
    setting = db.query(Setting).filter(Setting.key == OPENAI_API_KEY_SETTING).first()
    return setting.value.strip() if setting and setting.value else ""

def get_openai_api_key_source(db: Session) -> str:
    if os.getenv("OPENAI_API_KEY", "").strip():
        return "env"
    setting = db.query(Setting).filter(Setting.key == OPENAI_API_KEY_SETTING).first()
    if setting and setting.value:
        return "stored"
    return "none"

def get_default_prompt_map() -> Dict[str, Dict[str, str]]:
    from .. import llm as llm_module

    return {
        "chat": {
            "ja": DEFAULT_SETTINGS["system_prompt"],
            "en": llm_module.CHAT_SYSTEM_PROMPT_EN,
        },
        "parts": {
            "ja": llm_module.PARTS_SYSTEM_PROMPT,
            "en": llm_module.PARTS_SYSTEM_PROMPT_EN,
        },
        "products": {
            "ja": llm_module.PRODUCTS_SYSTEM_PROMPT,
            "en": llm_module.PRODUCTS_SYSTEM_PROMPT_EN,
        },
        "settings": {
            "ja": llm_module.SETTINGS_SYSTEM_PROMPT,
            "en": llm_module.SETTINGS_SYSTEM_PROMPT_EN,
        },
    }

def migrate_settings(db: Session):
    """Apply one-time settings migrations. Meant to run at application startup,
    not on every read. Writes the migrated values to the database and commits."""
    db_settings = db.query(Setting).all()
    settings_dict = DEFAULT_SETTINGS.copy()
    db_settings_map = {s.key: s for s in db_settings}

    for s in db_settings:
        settings_dict[s.key] = s.value

    has_changes = False

    # Migrate theme_color values (default -> tomato, sunset -> lemon)
    theme_color_setting = db_settings_map.get("theme_color")
    if theme_color_setting:
        if theme_color_setting.value == "default":
            theme_color_setting.value = "tomato"
            db.add(theme_color_setting)
            settings_dict["theme_color"] = "tomato"
            has_changes = True
        elif theme_color_setting.value == "sunset":
            theme_color_setting.value = "lemon"
            db.add(theme_color_setting)
            settings_dict["theme_color"] = "lemon"
            has_changes = True
    else:
        theme_color_setting = Setting(key="theme_color", value="tomato")
        db.add(theme_color_setting)
        settings_dict["theme_color"] = "tomato"
        has_changes = True

    # Auto-migration based on version key to prevent overwriting user edits repeatedly
    prompt_ver_setting = db_settings_map.get("system_prompt_version")
    current_ver = prompt_ver_setting.value if prompt_ver_setting else "0"

    if current_ver < "10":
        sys_prompt_setting = db_settings_map.get("system_prompt")
        if sys_prompt_setting:
            sys_prompt_setting.value = DEFAULT_SETTINGS["system_prompt"]
            db.add(sys_prompt_setting)
            settings_dict["system_prompt"] = DEFAULT_SETTINGS["system_prompt"]
            has_changes = True
        else:
            sys_prompt_setting = Setting(key="system_prompt", value=DEFAULT_SETTINGS["system_prompt"])
            db.add(sys_prompt_setting)
            settings_dict["system_prompt"] = DEFAULT_SETTINGS["system_prompt"]
            has_changes = True
            
        if prompt_ver_setting:
            prompt_ver_setting.value = "10"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="10")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "10"
        has_changes = True

    if int(current_ver or "0") < 11:
        parts_prompt_setting = db_settings_map.get("system_prompt_parts_ja")
        old_intro = (
            "あなたは部品在庫・単価調整AIです。ユーザーの入力を解析し、"
            "部品の追加・購入(add), 消費・削減(consume), メタデータ更新(update_metadata), "
            "またはその他対話(message)を判定し、JSONのみを返してください。説明やマークダウンは不要です。"
        )
        if parts_prompt_setting and parts_prompt_setting.value.startswith(old_intro):
            parts_prompt_setting.value = get_default_prompt_map()["parts"]["ja"]
            db.add(parts_prompt_setting)
            settings_dict["system_prompt_parts_ja"] = parts_prompt_setting.value
            has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "11"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="11")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "11"
        has_changes = True

    if int(current_ver or "0") < 12:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt": (
                "あなたは部品在庫管理のAIアシスタントです。",
                "\"action\": \"add\" | \"consume\" | \"edit\"",
                defaults["chat"]["ja"],
            ),
            "system_prompt_chat_en": (
                "You are an AI assistant for a parts inventory management system.",
                "\"action\": \"add\" | \"consume\" | \"edit\"",
                defaults["chat"]["en"],
            ),
            "system_prompt_parts_ja": (
                "あなたは部品在庫・単価調整AIです。",
                "update_metadata",
                defaults["parts"]["ja"],
            ),
            "system_prompt_parts_en": (
                "You are an AI for",
                "update_metadata",
                defaults["parts"]["en"],
            ),
        }
        for key, (known_intro, legacy_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and legacy_marker in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "12"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="12")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "12"
        has_changes = True

    if int(current_ver or "0") < 13:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt": (
                "あなたは部品在庫管理のAIアシスタントです。",
                "\"price\" | \"edit\"",
                defaults["chat"]["ja"],
            ),
            "system_prompt_chat_en": (
                "You are an AI assistant for a parts inventory management system.",
                "\"price\" | \"edit\"",
                defaults["chat"]["en"],
            ),
        }
        for key, (known_intro, legacy_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and legacy_marker in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "13"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="13")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "13"
        has_changes = True

    if int(current_ver or "0") < 14:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt_settings_ja": (
                "あなたはシステム設定管理AIです。",
                "background_image_mode",
                defaults["settings"]["ja"],
            ),
            "system_prompt_settings_en": (
                "You are an AI for managing system settings.",
                "background_image_mode",
                defaults["settings"]["en"],
            ),
        }
        for key, (known_intro, new_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and new_marker not in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "14"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="14")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "14"
        has_changes = True

    if int(current_ver or "0") < 15:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt_settings_ja": (
                "あなたはシステム設定管理AIです。",
                "background_dot_size",
                defaults["settings"]["ja"],
            ),
            "system_prompt_settings_en": (
                "You are an AI for managing system settings.",
                "background_dot_size",
                defaults["settings"]["en"],
            ),
        }
        for key, (known_intro, new_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and new_marker not in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "15"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="15")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "15"
        has_changes = True

    if int(current_ver or "0") < 16:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt_settings_ja": (
                "あなたはシステム設定管理AIです。",
                "background_image_layout",
                defaults["settings"]["ja"],
            ),
            "system_prompt_settings_en": (
                "You are an AI for managing system settings.",
                "background_image_layout",
                defaults["settings"]["en"],
            ),
        }
        for key, (known_intro, new_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and new_marker not in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "16"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="16")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "16"
        has_changes = True

    if int(current_ver or "0") < 17:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt_settings_ja": (
                "あなたはシステム設定管理AIです。",
                "background_image_url",
                defaults["settings"]["ja"],
            ),
            "system_prompt_settings_en": (
                "You are an AI for managing system settings.",
                "background_image_url",
                defaults["settings"]["en"],
            ),
        }
        for key, (known_intro, new_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and new_marker not in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "17"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="17")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "17"
        has_changes = True

    if int(current_ver or "0") < 18:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt_settings_ja": (
                "あなたはシステム設定管理AIです。",
                "background_check_size",
                defaults["settings"]["ja"],
            ),
            "system_prompt_settings_en": (
                "You are an AI for managing system settings.",
                "background_check_size",
                defaults["settings"]["en"],
            ),
        }
        for key, (known_intro, new_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and new_marker not in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "18"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="18")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "18"
        has_changes = True

    if int(current_ver or "0") < 19:
        defaults = get_default_prompt_map()
        prompt_replacements = {
            "system_prompt_settings_ja": (
                "あなたはシステム設定管理AIです。",
                "background_image_data",
                defaults["settings"]["ja"],
            ),
            "system_prompt_settings_en": (
                "You are an AI for managing system settings.",
                "background_image_data",
                defaults["settings"]["en"],
            ),
        }
        for key, (known_intro, removed_marker, replacement) in prompt_replacements.items():
            setting = db_settings_map.get(key)
            if setting and setting.value.startswith(known_intro) and removed_marker in setting.value:
                setting.value = replacement
                db.add(setting)
                settings_dict[key] = replacement
                has_changes = True

        if prompt_ver_setting:
            prompt_ver_setting.value = "19"
        else:
            prompt_ver_setting = Setting(key="system_prompt_version", value="19")
            db.add(prompt_ver_setting)
        settings_dict["system_prompt_version"] = "19"
        has_changes = True

    default_prompts = get_default_prompt_map()
    for page, lang_keys in PROMPT_SETTING_KEYS.items():
        for lang, prompt_key in lang_keys.items():
            mode_key = PROMPT_MODE_KEYS[page][lang]
            mode_setting = db_settings_map.get(mode_key)
            if mode_setting and mode_setting.value in {"default", "custom"}:
                settings_dict[mode_key] = mode_setting.value
                continue

            stored_prompt = settings_dict.get(prompt_key)
            initial_mode = "default" if not stored_prompt or stored_prompt == default_prompts[page][lang] else "custom"
            if mode_setting:
                mode_setting.value = initial_mode
            else:
                mode_setting = Setting(key=mode_key, value=initial_mode)
                db.add(mode_setting)
            settings_dict[mode_key] = initial_mode
            has_changes = True

    if has_changes:
        db.commit()


@router.get("")
def get_settings(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_settings = db.query(Setting).all()
    settings_dict = DEFAULT_SETTINGS.copy()

    for s in db_settings:
        settings_dict[s.key] = s.value

    # Read-only defaulting: migrations run once at startup (see migrate_settings),
    # so here we only fill missing values on the response without writing to the DB.
    if settings_dict.get("theme_color") == "default":
        settings_dict["theme_color"] = "tomato"
    elif settings_dict.get("theme_color") == "sunset":
        settings_dict["theme_color"] = "lemon"

    default_prompts = get_default_prompt_map()
    for page, lang_keys in PROMPT_SETTING_KEYS.items():
        for lang, prompt_key in lang_keys.items():
            mode_key = PROMPT_MODE_KEYS[page][lang]
            mode_value = settings_dict.get(mode_key)
            if mode_value in {"default", "custom"}:
                continue
            stored_prompt = settings_dict.get(prompt_key)
            settings_dict[mode_key] = (
                "default"
                if not stored_prompt or stored_prompt == default_prompts[page][lang]
                else "custom"
            )

    if "user_nickname" not in settings_dict or not settings_dict["user_nickname"]:
        settings_dict["user_nickname"] = current_user.username

    # Inject default system prompts so frontend can reset page/language specific prompts.
    result = settings_dict.copy()
    result[OPENAI_API_KEY_SETTING] = ""
    result["openai_api_key_source"] = get_openai_api_key_source(db)
    result["openai_api_key_configured"] = result["openai_api_key_source"] != "none"
    result["default_system_prompt"] = DEFAULT_SETTINGS["system_prompt"]
    result["default_system_prompts"] = default_prompts
    result["system_prompts"] = {}
    result["system_prompt_modes"] = {}
    for page, lang_keys in PROMPT_SETTING_KEYS.items():
        result["system_prompts"][page] = {}
        result["system_prompt_modes"][page] = {}
        for lang, key in lang_keys.items():
            mode = settings_dict.get(PROMPT_MODE_KEYS[page][lang], "default")
            result["system_prompt_modes"][page][lang] = mode
            result["system_prompts"][page][lang] = (
                default_prompts[page][lang]
                if mode == "default"
                else settings_dict.get(key) or default_prompts[page][lang]
            )
    return result

@router.post("")
def update_settings(
    settings_in: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    for key, value in settings_in.items():
        if key in RESPONSE_ONLY_SETTING_KEYS:
            continue
        if key.endswith("_mode"):
            if key in PROMPT_MODE_SETTING_KEYS and value not in {"default", "custom"}:
                continue
            if key == "background_image_mode" and value not in BACKGROUND_IMAGE_MODES:
                continue
            if key not in PROMPT_MODE_SETTING_KEYS and key != "background_image_mode":
                continue
        if key == OPENAI_API_KEY_SETTING and not str(value or "").strip():
            continue
        set_setting_value(db, key, str(value) if value is not None else "")
    db.commit()
    return get_settings(db=db, current_user=current_user)

@router.post("/background-image")
async def upload_background_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    extension = ALLOWED_BACKGROUND_IMAGE_EXTENSIONS.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Unsupported image file type.")

    BACKGROUND_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for existing in BACKGROUND_UPLOAD_DIR.glob(f"{BACKGROUND_IMAGE_PREFIX}.*"):
        existing.unlink(missing_ok=True)

    filename = f"{BACKGROUND_IMAGE_PREFIX}{extension}"
    target_path = BACKGROUND_UPLOAD_DIR / filename
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Image file is empty.")
    target_path.write_bytes(contents)

    public_url = f"/uploads/settings/{filename}?v={int(time.time())}"
    set_setting_value(db, "background_image_mode", "image")
    set_setting_value(db, "background_image_url", public_url)
    set_setting_value(db, "background_image_filename", file.filename or filename)
    set_setting_value(db, "background_image_data", "")
    db.commit()
    return get_settings(db=db, current_user=current_user)

@router.post("/models")
async def get_models(
    payload: Dict[str, str],
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    provider = payload.get("provider", "openai")
    url = payload.get("url", "").rstrip('/')

    if provider == OPENAI_API_PROVIDER and not url:
        url = OPENAI_API_BASE_URL

    if not url:
        raise HTTPException(status_code=400, detail="API URL is required.")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if provider == "ollama":
                response = await client.get(f"{url}/api/tags")
                if response.status_code == 200:
                    data = response.json()
                    models = [m["name"] for m in data.get("models", [])]
                    return {"models": models}
                else:
                    raise HTTPException(status_code=response.status_code, detail="Failed to fetch models from Ollama.")
            elif provider == OPENAI_API_PROVIDER:
                api_key = get_openai_api_key(db)
                if not api_key:
                    return {
                        "models": RECOMMENDED_OPENAI_API_MODELS,
                        "warning": "OPENAI_API_KEY is not configured. Showing recommended models only.",
                    }
                response = await client.get(
                    f"{url}/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if response.status_code == 200:
                    data = response.json()
                    fetched_models = [m["id"] for m in data.get("data", [])]
                    models = list(dict.fromkeys(RECOMMENDED_OPENAI_API_MODELS + fetched_models))
                    return {"models": models}
                else:
                    raise HTTPException(response.status_code, detail="Failed to fetch models from OpenAI API.")
            else:
                response = await client.get(f"{url}/v1/models")
                if response.status_code == 200:
                    data = response.json()
                    models = [m["id"] for m in data.get("data", [])]
                    return {"models": models}
                else:
                    raise HTTPException(status_code=response.status_code, detail="Failed to fetch models from OpenAI compatible endpoint.")
        except httpx.RequestError as e:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Failed to connect to LLM server: {str(e)}")
