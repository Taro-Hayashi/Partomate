import json
import logging
import re
import httpx
import datetime
from sqlalchemy.orm import Session
from .models import Setting, Part, Product
from .routers.settings import DEFAULT_SETTINGS, OPENAI_API_BASE_URL, OPENAI_API_PROVIDER, get_openai_api_key
from pydantic import BaseModel, RootModel
from typing import List, Optional, Literal, Union

logger = logging.getLogger(__name__)

# --- Pydantic Schemas for Ollama Structured Outputs ---

class MessageResponse(BaseModel):
    type: Literal["message"]
    message: str

# 1. Parts Mode Schemas
class PartItem(BaseModel):
    category1: str
    category2: Optional[str]
    category3: Optional[str]
    quantity: Optional[float]
    purchase_price: float
    total_price: Optional[float]
    currency: Optional[str]
    purchase_date: Optional[str]

class PartsAction(BaseModel):
    type: Literal["parts"]
    action: Literal["add", "consume", "price", "edit"]
    items: List[PartItem]

PartsModeResponseSchema = RootModel[Union[PartsAction, MessageResponse]]

# 2. Products Mode Schemas
class RecipePartItem(BaseModel):
    part_name: str
    quantity: float

class ChatProductItem(BaseModel):
    product_name: str
    product_count: float

class ChatProductAction(BaseModel):
    type: Literal["product"]
    action: Literal["consume"]
    items: List[ChatProductItem]

class ProductRecipeAction(BaseModel):
    type: Literal["product_recipe"]
    action: Literal["create", "update"]
    product_name: str
    description: Optional[str] = None
    parts: List[RecipePartItem]

ProductRecipeModeResponseSchema = RootModel[Union[ProductRecipeAction, ChatProductAction, MessageResponse]]

# 3. Settings Mode Schemas
class SettingsUpdates(BaseModel):
    theme_color: Optional[Literal["tomato", "ocean", "forest", "lemon"]] = None
    theme_wallpaper: Optional[Literal["light", "sand", "rose", "slate", "forest", "dark"]] = None
    background_image_mode: Optional[Literal["none", "dots", "stripes", "checks", "image"]] = None
    background_pattern_size: Optional[str] = None
    background_dot_size: Optional[str] = None
    background_stripe_width: Optional[str] = None
    background_check_size: Optional[str] = None
    background_image_layout: Optional[Literal["tile", "original", "fit"]] = None
    currency: Optional[Literal["JPY", "USD", "EUR"]] = None
    language: Optional[Literal["ja", "en"]] = None
    send_key: Optional[Literal["enter", "shift_enter", "ctrl_cmd_enter"]] = None
    llm_provider: Optional[Literal["openai", "ollama", "openai_api"]] = None
    llm_url: Optional[str] = None
    llm_model: Optional[str] = None
    user_nickname: Optional[str] = None
    ai_pronoun: Optional[str] = None
    allowed_hosts: Optional[str] = None

class SettingsAction(BaseModel):
    type: Literal["settings"]
    action: Literal["update"]
    updates: SettingsUpdates

SettingsModeResponseSchema = RootModel[Union[SettingsAction, MessageResponse]]

# 4. Default Chat Mode Schemas
class ChatToolCallArgs(BaseModel):
    category1: Optional[str] = None
    category2: Optional[str] = None
    category3: Optional[str] = None
    name: Optional[str] = None

class ChatToolCall(BaseModel):
    type: Literal["tool_call"]
    tool: Literal["get_parts_list", "get_products"]
    args: ChatToolCallArgs

ChatModeResponseSchema = RootModel[Union[PartsAction, ChatProductAction, MessageResponse, ChatToolCall]]


def normalize_string(s: str) -> str:
    if not s:
        return ""
    return re.sub(r'[\s\W_]', '', s.lower())

def extract_match_keywords(message: str) -> list:
    if not message:
        return []
    
    keywords = []
    
    # helper to add normalized keyword safely
    def add_kw(w):
        nw = normalize_string(w)
        # Skip purely numeric strings to avoid matching all items containing "1", "2" etc.
        if nw.isdigit():
            return
        if nw and nw not in keywords:
            keywords.append(nw)
            
    # 1. Full normalized message
    add_kw(message)
    
    # 2. Remove trailing digits from full normalized message
    norm = normalize_string(message)
    no_trailing_digits = re.sub(r'\d+$', '', norm)
    add_kw(no_trailing_digits)
    
    # 3. Clean common Japanese particles / counter suffixes from message and add
    cleaned = re.sub(r'[\d\s]*(を|個|つ|本|枚|台|pcs|g|ml|m|個口|セット|パック|袋|箱|点)+$', '', message.strip().lower())
    add_kw(cleaned)
    
    # 4. Extract English blocks, Japanese blocks, and number blocks
    # This splits "handymanを1個" -> ["handyman", "を", "1", "個"]
    tokens = re.findall(r'[a-z0-9]+|[\u3040-\u30ff\u4e00-\u9faf]+', message.lower())
    
    # Stop words / particles that shouldn't be treated as separate keywords (when single tokens)
    stop_words = {"を", "の", "に", "が", "は", "と", "で", "も", "か", "や", "し", "個", "つ", "本", "枚", "台", "pcs"}
    
    for t in tokens:
        if t in stop_words or t.isdigit():
            continue
        # Strip trailing digits from token if it's alphanumeric (e.g., "handyman1" -> "handyman")
        t_clean = re.sub(r'\d+$', '', t)
        
        if len(t_clean) > 1:
            add_kw(t_clean)
        add_kw(t)
        
    return keywords

# Page-specific System Prompts
# ... (PARTS_SYSTEM_PROMPT, PRODUCTS_SYSTEM_PROMPT, SETTINGS_SYSTEM_PROMPT remain unchanged) ...
CHAT_SYSTEM_PROMPT_EN = """
You are an AI assistant for a parts inventory management system. Analyze the user's message and return only one of the following JSON objects. Do not include extra explanation or Markdown.

[Analysis rules]
- If a part entry is ambiguous between adding and consuming inventory, treat it as add. Product entries are treated as consume.
- Top chat part operations are limited to adding inventory and consuming inventory. Price adjustments and part editing are handled by the parts-page chat.
- If the user writes something like "screw 10" and the spec/size is unknown, set category1 to "screw", quantity to 10, and category2/category3 to null.
- If a product name and number are adjacent or concatenated, such as "Product A 5", "handyman2", or "Cannonball 1", and part of the text matches a registered product name such as "Handyman", treat the matched portion as product_name and the remaining number as product_count.
- Use tool_call only when answering a question requires searching the database.
- For small talk or questions, return type: "message" and answer using "{user_nickname}" as the second-person reference and "{ai_pronoun}" as the first-person reference.

[Output format]
1. Part action. Always include every item key; use null or 0 when unknown.
{
  "type": "parts",
  "action": "add" | "consume",
  "items": [{
    "category1": "Type (example: screw)",
    "category2": "Spec (example: M2), or null",
    "category3": "Size (example: 8mm), or null",
    "quantity": "Quantity, or 0 if unknown",
    "purchase_price": "Unit price, or 0",
    "total_price": "Total price, or null",
    "currency": "JPY, USD, EUR, or null",
    "purchase_date": "Purchase date, or null"
  }]
}

2. Build products and consume component parts
{
  "type": "product",
  "action": "consume",
  "items": [
    {
      "product_name": "Product name",
      "product_count": quantity
    }
  ]
}

3. Conversation or question
{
  "type": "message",
  "message": "Answer text. Use {user_nickname} as the second-person reference and {ai_pronoun} as the first-person reference."
}

4. Database lookup
{
  "type": "tool_call",
  "tool": "get_parts_list" | "get_products",
  "args": {
    "category1": "value", "category2": "value", "category3": "value", "name": "product name"
  }
}
"""

PARTS_SYSTEM_PROMPT = """
あなたは部品在庫・単価調整AIです。ユーザーの入力を解析し、部品の追加・購入(add)、消費・削減(consume)、単価調整(price)、部品の編集(edit)、または対話(message)を判定し、JSONのみを返してください。

【解析ルール】
- 在庫数を変えず単価・総額・通貨・購入日を変更する場合は price とし、quantity は 0にしてください。
- 部品編集フォームを開く依頼は edit とし、対象カテゴリ以外の値は推測しないでください。
- 情報なしで新規登録フォームを求められた場合は add とし、空カテゴリ、quantity 1、価格0の雛形を返してください。
- 数量と金額が同時に示された場合、その金額は total_price とし、purchase_price は総額÷数量にしてください。
- 通貨表現は JPY・USD・EURへ変換してください。日付は年を推測せず、入力された範囲で purchase_date に設定してください。
- 雑談や質問は type: "message" とし、二人称「{user_nickname}」、一人称「{ai_pronoun}」で回答してください。

【出力形式】
1. 部品操作。items内のキーは必ず全て出力し、不明値はnullまたは0にしてください。
{
  "type": "parts",
  "action": "add" | "consume" | "price" | "edit",
  "items": [{
    "category1": "種類 (例: ネジ)",
    "category2": "規格、なければ null",
    "category3": "サイズ、なければ null",
    "quantity": "数量。price/editで不明なら0",
    "purchase_price": "単価、なければ0",
    "total_price": "総額、なければnull",
    "currency": "JPY・USD・EUR、なければnull",
    "purchase_date": "購入日、なければnull"
  }]
}

2. 対話
{
  "type": "message",
  "message": "回答テキスト"
}
"""

PARTS_SYSTEM_PROMPT_EN = """
You are an AI for parts inventory and pricing. Classify the request as add, consume, price, edit, or message, and return JSON only.

[Analysis rules]
- Use price for price, total, currency, or purchase date changes without inventory changes; set quantity to 0.
- Use edit to open the full part edit form. Do not invent values other than identifying categories.
- A vague new registration request uses add with blank categories, quantity 1, and price 0.
- A price stated with a quantity is total_price; purchase_price is total divided by quantity.
- Normalize currencies to JPY, USD, or EUR. Do not invent a missing year in purchase_date.
- For small talk or questions, return type: "message" and answer using "{user_nickname}" as the second-person reference and "{ai_pronoun}" as the first-person reference.

[Output format]
1. Part action. Always include every item key; use null or 0 when unknown.
{
  "type": "parts",
  "action": "add" | "consume" | "price" | "edit",
  "items": [{
    "category1": "Type (example: screw)",
    "category2": "Spec (example: M2), or null",
    "category3": "Size (example: 8mm), or null",
    "quantity": quantity,
    "purchase_price": "Unit price, or 0.0 if unknown",
    "total_price": "Total amount if the user gave a total price, otherwise null",
    "currency": "Currency code such as USD, EUR, JPY, or null",
    "purchase_date": "Purchase date, or null"
  }]
}

2. Conversation
{
  "type": "message",
  "message": "Answer text"
}
"""

PRODUCTS_SYSTEM_PROMPT = """
あなたは商品構成（レシピ）管理AIです。ユーザーの入力を解析し, レシピの新規登録(create), 更新(update), 商品の組み立てによる構成部品の消費(consume), またはその他対話(message)を判定し、JSONのみを返してください。説明やマークダウンは不要です。

【解析ルール】
- 部品名は、利用可能部品名一覧と最もよく一致する正確な名称を指定してください。
- 新しい商品の登録フォームを表示したい、あるいは具体的な構成情報がないまま「商品を登録したい」「新規商品を登録したい」「レシピを作りたい」といった登録を希望する意図があった場合は、空の登録用の雛形を生成するために action: "create" とし、product_name: ""、description: null、parts: []（空配列）を設定した JSON を返してください。
- 「商品Aを3個作る」「商品Aを3個組み立てる」「商品A 3」「商品Aを消費」のように、登録済み商品の組み立て・消費・作成数を指定する意図は type: "product", action: "consume" としてください。数量が不明な場合は product_count: 1 としてください。
- 雑談や質問は type: "message" とし、回答テキストを返してください。

【出力形式】
1. レシピの新規登録・更新
{
  "type": "product_recipe",
  "action": "create" | "update",
  "product_name": "商品名",
  "description": "商品の説明 (なければ null)",
  "parts": [{
    "part_name": "部品の完全名 (例: ネジ M2 8mm)",
    "quantity": 数量
  }]
}

2. 商品の組み立てによる構成部品の消費
{
  "type": "product",
  "action": "consume",
  "items": [{
    "product_name": "商品名",
    "product_count": 数量
  }]
}

3. 対話
{
  "type": "message",
  "message": "回答テキスト"
}
"""

PRODUCTS_SYSTEM_PROMPT_EN = """
You are an AI for managing product recipes. Analyze the user's input and decide whether it is a new recipe registration (create), recipe update (update), product assembly that consumes component stock (consume), or ordinary conversation (message). Return JSON only. Do not include explanation or Markdown.

[Analysis rules]
- For part names, choose the exact available part name that best matches the user's wording.
- If the user wants to show a new product registration form, or says something vague like "register a product", "add a new product", or "create a recipe" without concrete recipe details, return an empty create template with product_name: "", description: null, and parts: [].
- If the user asks to make, assemble, build, consume, or produce a registered product with a quantity, such as "assemble 3 Product A", "build Product A 3", or "consume Product A", return type: "product" and action: "consume". If the quantity is unclear, use product_count: 1.
- For small talk or questions, return type: "message" and answer with text.

[Output format]
1. Create or update a recipe
{
  "type": "product_recipe",
  "action": "create" | "update",
  "product_name": "Product name",
  "description": "Product description, or null",
  "parts": [{
    "part_name": "Full part name (example: screw M2 8mm)",
    "quantity": quantity
  }]
}

2. Assemble product and consume component stock
{
  "type": "product",
  "action": "consume",
  "items": [{
    "product_name": "Product name",
    "product_count": quantity
  }]
}

3. Conversation
{
  "type": "message",
  "message": "Answer text"
}
"""

SETTINGS_SYSTEM_PROMPT = """
あなたはシステム設定管理AIです。ユーザーの入力を解析し、設定値の更新(update)またはその他対話(message)を判定し、JSONのみを返してください。説明やマークダウンは不要です。

【解析ルール】
- 変更可能な設定項目と、それぞれの有効な値は以下の通りです：
  - theme_color (テーマカラー): "tomato" (Flesh Tomato), "ocean" (Ocean Blue), "forest" (Forest Green), "lemon" (Sunny Lemon)
  - theme_wallpaper (背景スタイル): "light" (Light), "sand" (Sand), "rose" (Rose), "slate" (Slate), "forest" (Forest), "dark" (Dark)
  - background_image_mode (背景画像): "none" (無し), "dots" (水玉), "stripes" (斜線), "checks" (チェック柄), "image" (画像指定)
  - background_dot_size (水玉の大きさ): "4"〜"192"の数値文字列（例: "10"）
  - background_stripe_width (斜線の太さ): "8"〜"96"の数値文字列（例: "16"）
  - background_check_size (チェック柄の間隔): "8"〜"192"の数値文字列（例: "32"）
  - background_image_layout (背景画像の表示方式): "tile" (タイル), "original" (等倍), "fit" (フィッティング)
  - currency (通貨): "JPY", "USD", "EUR"
  - language (言語): "ja" (日本語), "en" (英語)
  - send_key (送信キー): "enter", "shift_enter", "ctrl_cmd_enter"
  - llm_provider (LLMプロバイダ): "openai", "ollama", "openai_api"
  - llm_url (API URL): 任意のURL文字列
  - llm_model (モデル名): 任意のモデル名文字列
  - user_nickname (ユーザー呼称): 任意の文字列
  - ai_pronoun (AIの一人称): 任意の文字列
  - allowed_hosts (アクセス許可ホスト): 任意のカンマ区切り文字列
  - clear_delete_confirm_skips (削除確認メッセージの表示状況クリア): "true" のみ。部品在庫・商品構成の削除確認で「今後表示しない」を選んだ状態をリセットし、確認メッセージを再び表示させる（例：「削除の確認をまた表示して」「削除確認の表示状況をクリアして」）
- ユーザーの指示が設定変更に該当する場合、対応する項目名と新しい値を `updates` に含めてください。
- 値は上記の「有効な値」に厳密に変換してください（例：「背景を暗くして」→ theme_wallpaperを"dark"に設定、「背景画像を水玉にして」→ background_image_modeを"dots"に設定、「背景画像を斜線にして」→ background_image_modeを"stripes"に設定、「背景画像をチェック柄にして」→ background_image_modeを"checks"に設定、「背景画像を無しにして」→ background_image_modeを"none"に設定、「水玉を大きくして」→ background_dot_sizeを現在値より大きい数値文字列に設定、「斜線を太くして」→ background_stripe_widthを現在値より大きい数値文字列に設定、「チェック柄の間隔を広くして」→ background_check_sizeを現在値より大きい数値文字列に設定、「画像をタイル表示にして」→ background_image_layoutを"tile"に設定、「画像を等倍表示にして」→ background_image_layoutを"original"に設定、「画像を画面に合わせて」→ background_image_layoutを"fit"に設定、「テーマを青にして」→ theme_colorを"ocean"に設定、「テーマをレモンにして」→ theme_colorを"lemon"に設定、「送信キーをエンターのみに」→ send_keyを"enter"に設定、「送信キーをCtrl/Cmd+Enterに」→ send_keyを"ctrl_cmd_enter"に設定）。
- 変更を指示された項目のみ `updates` に含めてください。
- background_image_url、background_image_data、background_image_filename はAIで生成・更新しないでください。画像指定はファイルアップロードでのみ行います。
- 雑談や質問は type: "message" とし、二人称「{user_nickname}」、一人称「{ai_pronoun}」で回答してください。

【出力形式】
1. 設定更新
{
  "type": "settings",
  "action": "update",
  "updates": {
    "項目名": "新しい設定値"
  }
}

2. 対話
{
  "type": "message",
  "message": "回答テキスト"
}
"""

SETTINGS_SYSTEM_PROMPT_EN = """
You are an AI for managing system settings. Analyze the user's input and decide whether it is a settings update (update) or ordinary conversation (message). Return JSON only. Do not include explanation or Markdown.

[Analysis rules]
- The configurable fields and valid values are:
  - theme_color: "tomato" (Flesh Tomato), "ocean" (Ocean Blue), "forest" (Forest Green), "lemon" (Sunny Lemon)
  - theme_wallpaper: "light" (Light), "sand" (Sand), "rose" (Rose), "slate" (Slate), "forest" (Forest), "dark" (Dark)
  - background_image_mode: "none" (None), "dots" (Dots), "stripes" (Diagonal Stripes), "checks" (Checkered), "image" (Custom Image)
  - background_dot_size: numeric string from "4" to "192" for dot size, e.g. "10"
  - background_stripe_width: numeric string from "8" to "96" for stripe width, e.g. "16"
  - background_check_size: numeric string from "8" to "192" for check spacing, e.g. "32"
  - background_image_layout: "tile" (Tile), "original" (Original), "fit" (Fit)
  - currency: "JPY", "USD", "EUR"
  - language: "ja" (Japanese), "en" (English)
  - send_key: "enter", "shift_enter", "ctrl_cmd_enter"
  - llm_provider: "openai", "ollama", "openai_api"
  - llm_url: any URL string
  - llm_model: any model name string
  - user_nickname: any string
  - ai_pronoun: any string
  - allowed_hosts: any comma-separated host string
  - clear_delete_confirm_skips: "true" only. Resets the "don't show again" state of the delete confirmation dialogs for parts inventory and product recipes so the confirmations are shown again (e.g. "show the delete confirmation again", "clear the delete confirmation status")
- If the user's instruction changes settings, include the corresponding keys and values in `updates`.
- Convert values strictly to the valid values above. For example, "make the background dark" -> theme_wallpaper: "dark", "use dots for the background image" -> background_image_mode: "dots", "use diagonal stripes" -> background_image_mode: "stripes", "use a checkered background" -> background_image_mode: "checks", "no background image" -> background_image_mode: "none", "make the dots larger" -> background_dot_size with a larger numeric string, "make the stripes thicker" -> background_stripe_width with a larger numeric string, "increase the check spacing" -> background_check_size with a larger numeric string, "tile the image" -> background_image_layout: "tile", "show the image at original size" -> background_image_layout: "original", "fit the image to the screen" -> background_image_layout: "fit", "make the theme blue" -> theme_color: "ocean", "lemon theme" -> theme_color: "lemon", "send with Enter only" -> send_key: "enter", "send with Ctrl/Cmd+Enter" -> send_key: "ctrl_cmd_enter".
- Include only the fields explicitly requested by the user.
- Do not generate or update background_image_url, background_image_data, or background_image_filename. Custom image selection is handled only by file upload.
- For small talk or questions, return type: "message" and answer using "{user_nickname}" as the second-person reference and "{ai_pronoun}" as the first-person reference.

[Output format]
1. Settings update
{
  "type": "settings",
  "action": "update",
  "updates": {
    "field_name": "new value"
  }
}

2. Conversation
{
  "type": "message",
  "message": "Answer text"
}
"""

def get_setting_value(db: Session, key: str) -> str:
    setting = db.query(Setting).filter(Setting.key == key).first()
    return setting.value if setting else DEFAULT_SETTINGS.get(key, "")

def is_llm_enabled(db: Session) -> bool:
    return get_setting_value(db, "llm_enabled").lower() != "false"

def get_prompt_setting_value(db: Session, page: str, language: str) -> str:
    prompt_keys = {
        ("chat", "ja"): "system_prompt",
        ("chat", "en"): "system_prompt_chat_en",
        ("parts", "ja"): "system_prompt_parts_ja",
        ("parts", "en"): "system_prompt_parts_en",
        ("products", "ja"): "system_prompt_products_ja",
        ("products", "en"): "system_prompt_products_en",
        ("settings", "ja"): "system_prompt_settings_ja",
        ("settings", "en"): "system_prompt_settings_en",
    }
    defaults = {
        ("chat", "ja"): DEFAULT_SETTINGS["system_prompt"],
        ("chat", "en"): CHAT_SYSTEM_PROMPT_EN,
        ("parts", "ja"): PARTS_SYSTEM_PROMPT,
        ("parts", "en"): PARTS_SYSTEM_PROMPT_EN,
        ("products", "ja"): PRODUCTS_SYSTEM_PROMPT,
        ("products", "en"): PRODUCTS_SYSTEM_PROMPT_EN,
        ("settings", "ja"): SETTINGS_SYSTEM_PROMPT,
        ("settings", "en"): SETTINGS_SYSTEM_PROMPT_EN,
    }
    lang = "en" if language == "en" else "ja"
    key = prompt_keys[(page, lang)]
    mode_setting = db.query(Setting).filter(Setting.key == f"{key}_mode").first()
    if mode_setting and mode_setting.value == "default":
        return defaults[(page, lang)]
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting and setting.value:
        if page == "parts" and "update_metadata" in setting.value:
            return defaults[(page, lang)]
        if page == "products" and '"type": "product"' not in setting.value:
            return defaults[(page, lang)]
        return setting.value
    return defaults[(page, lang)]

def get_context_for_mode(db: Session, mode: str, message: str = "", language: str = "ja") -> str:
    is_en = language == "en"
    if mode == "parts":
        # Dump available parts
        parts = db.query(Part).limit(50).all()
        parts_list = []
        for p in parts:
            name_parts = [p.category2, p.category3, p.category1]
            display_name = " ".join(filter(None, name_parts)).strip() or p.name
            cat_info = []
            if p.category1: cat_info.append(f"category1:{p.category1}")
            if p.category2: cat_info.append(f"category2:{p.category2}")
            if p.category3: cat_info.append(f"category3:{p.category3}")
            cat_str = f" [{', '.join(cat_info)}]" if cat_info else ""
            parts_list.append(
                f"- {display_name} (ID:{p.id}){cat_str}"
            )
        parts_ctx = "\n".join(parts_list) if parts_list else ("No registered parts." if is_en else "登録されている部品はありません。")
        heading = "[Available part master list]" if is_en else "【利用可能な部品マスター一覧】"
        return f"{heading}\n{parts_ctx}"
        
    elif mode == "products":
        # Dump available parts
        parts = db.query(Part).limit(50).all()
        parts_list = [p.name for p in parts]
        parts_ctx = ", ".join(parts_list) if parts_list else ("None" if is_en else "なし")
        
        products = db.query(Product).limit(30).all()
        products_list = [f"- {pr.name}" for pr in products]
        products_ctx = "\n".join(products_list) if products_list else ("No registered products have recipe information." if is_en else "登録されている商品は構成情報がありません。")
        
        if is_en:
            return f"[Available part names]\n{parts_ctx}\n\n[Registered products]\n{products_ctx}"
        return f"【利用可能な部品名一覧】\n{parts_ctx}\n\n【登録されている商品一覧】\n{products_ctx}"
        
    elif mode == "settings":
        # Dump current settings
        hidden_setting_labels = {
            "background_image_data": "[uploaded image data hidden]",
            "background_image_url": "[uploaded image url hidden]",
            "background_image_filename": "[uploaded image filename hidden]",
            "openai_api_key": "[secret hidden]",
        }
        settings_dict = {}
        for key in DEFAULT_SETTINGS.keys():
            settings_dict[key] = hidden_setting_labels.get(key, get_setting_value(db, key))
        settings_ctx = json.dumps(settings_dict, ensure_ascii=False, indent=2)
        heading = "[Current settings]" if is_en else "【現在の設定値一覧】"
        return f"{heading}\n{settings_ctx}"
        
    elif mode == "chat" or not mode:
        # Top-level chat needs parts inventory to answer queries or perform updates
        # Filter based on message content to prevent context bloat and speed up LLM response
        if not message:
            return ""

        keywords = extract_match_keywords(message)
        if not keywords:
            return ""

        parts = db.query(Part).all()
        matched_parts = []
        for p in parts:
            name_parts = [p.category2, p.category3, p.category1]
            display_name = " ".join(filter(None, name_parts)).strip()
            
            norm_display = normalize_string(display_name)
            norm_name = normalize_string(p.name)
            norm_c1 = normalize_string(p.category1)
            norm_c2 = normalize_string(p.category2)
            norm_c3 = normalize_string(p.category3)

            matches = False
            for kw in keywords:
                if norm_display and (norm_display in kw or kw in norm_display):
                    matches = True
                    break
                if norm_name and (norm_name in kw or kw in norm_name):
                    matches = True
                    break
                if norm_c1 and (norm_c1 in kw or kw in norm_c1):
                    matches = True
                    break
                if norm_c2 and (norm_c2 in kw or kw in norm_c2):
                    matches = True
                    break
                if norm_c3 and (norm_c3 in kw or kw in norm_c3):
                    matches = True
                    break
                
            if matches:
                matched_parts.append(p)

        products = db.query(Product).all()
        matched_products = []
        for pr in products:
            if pr.name:
                norm_pr_name = normalize_string(pr.name)
                for kw in keywords:
                    if norm_pr_name in kw or kw in norm_pr_name:
                        matched_products.append(pr)
                        break

        # If no keywords matched, return empty context
        if not matched_parts and not matched_products:
            return ""

        # Limit sizes for the matched subsets
        matched_parts = matched_parts[:50]
        matched_products = matched_products[:30]

        parts_list = []
        for p in matched_parts:
            name_parts = [p.category2, p.category3, p.category1]
            display_name = " ".join(filter(None, name_parts)).strip() or p.name
            cat_info = []
            if p.category1: cat_info.append(f"category1:{p.category1}")
            if p.category2: cat_info.append(f"category2:{p.category2}")
            if p.category3: cat_info.append(f"category3:{p.category3}")
            cat_str = f" [{', '.join(cat_info)}]" if cat_info else ""
            parts_list.append(
                f"- {display_name} (ID:{p.id}){cat_str}"
            )
        parts_ctx = "\n".join(parts_list) if parts_list else ("No matching parts." if is_en else "マッチする部品はありません。")
        
        products_list = [f"- {pr.name}" for pr in matched_products]
        products_ctx = "\n".join(products_list) if products_list else ("No matching products." if is_en else "マッチする商品はありません。")
        
        if is_en:
            return f"[Current inventory part master list]\n{parts_ctx}\n\n[Current registered products]\n{products_ctx}"
        return f"【現在の在庫部品マスター一覧】\n{parts_ctx}\n\n【現在の登録商品一覧】\n{products_ctx}"
        
    return ""

async def analyze_message(db: Session, message: str, username: str = "ユーザー", mode: str = "chat", extra_context: str = "") -> dict:
    if not is_llm_enabled(db):
        raise ValueError("LLM settings are turned off.")

    provider = get_setting_value(db, "llm_provider")
    url = get_setting_value(db, "llm_url").rstrip('/')
    model = get_setting_value(db, "llm_model")
    language = get_setting_value(db, "language") or "ja"
    is_en = language == "en"
    
    user_nickname = get_setting_value(db, "user_nickname") or username
    ai_pronoun = get_setting_value(db, "ai_pronoun") or "私"

    if provider == OPENAI_API_PROVIDER and not url:
        url = OPENAI_API_BASE_URL

    if not url:
        raise ValueError("LLM API URL is not configured.")
    if not model:
        raise ValueError("LLM Model is not selected.")
    if provider == OPENAI_API_PROVIDER and not get_openai_api_key(db):
        raise ValueError("OpenAI API key is not configured. Set OPENAI_API_KEY or enter an API key in Settings.")

    # Select prompt based on mode, or simplified prompt for recursive calls with extra_context
    if extra_context:
        # Simplifies recursive call prompt to avoid complex analysis rules and stick strictly to tool results
        if is_en:
            system_prompt = (
                "You are an AI assistant for a parts inventory management system. To answer the user's question, refer only to the following tool execution result.\n\n"
                f"{extra_context}\n\n"
                "Return only the following JSON. Do not include extra explanation or Markdown.\n"
                "{\n"
                "  \"type\": \"message\",\n"
                "  \"message\": \"Answer text. Use {user_nickname} as the second-person reference and {ai_pronoun} as the first-person reference.\"\n"
                "}"
            )
        else:
            system_prompt = (
                "あなたは部品在庫管理のAIアシスタントです。ユーザーの質問に回答するために、以下のツール実行結果のみを参照してください。\n\n"
                f"{extra_context}\n\n"
                "必ず以下のJSONのみを返してください。余計な説明やマークダウンは一切含めないでください。\n"
                "{\n"
                "  \"type\": \"message\",\n"
                "  \"message\": \"回答内容（二人称は「{user_nickname}」、一人称は「{ai_pronoun}」を使用）\"\n"
                "}"
            )
    else:
        if mode == "parts":
            system_prompt = get_prompt_setting_value(db, "parts", language)
        elif mode == "products":
            system_prompt = get_prompt_setting_value(db, "products", language)
        elif mode == "settings":
            system_prompt = get_prompt_setting_value(db, "settings", language)
        else:
            # Default chat assistant mode
            system_prompt = get_prompt_setting_value(db, "chat", language)

        # Append database contexts (only for non-recursive calls)
        db_context = get_context_for_mode(db, mode, message, language)
        if db_context:
            system_prompt = f"{system_prompt}\n\n{db_context}"

    now = datetime.datetime.now()
    current_date_str = now.strftime("%Y-%m-%d")

    system_prompt = system_prompt.replace("{user_nickname}", user_nickname).replace("{ai_pronoun}", ai_pronoun)
    system_prompt = system_prompt.replace("{current_date}", current_date_str)

    # Console debug output
    logger.debug("=== LLM REQUEST (Mode: %s) ===", mode)
    logger.debug("Provider: %s | Model: %s | URL: %s", provider, model, url)
    logger.debug("System Prompt:\n%s", system_prompt)
    logger.debug("User Message: %s", message)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if provider == "ollama":
                # Determine the response schema based on mode and extra_context
                if extra_context:
                    json_format = MessageResponse.model_json_schema()
                elif mode == "parts":
                    json_format = PartsModeResponseSchema.model_json_schema()
                elif mode == "products":
                    json_format = ProductRecipeModeResponseSchema.model_json_schema()
                elif mode == "settings":
                    json_format = SettingsModeResponseSchema.model_json_schema()
                else:
                    json_format = ChatModeResponseSchema.model_json_schema()

                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": message}
                    ],
                    "stream": False,
                    "options": {
                        "temperature": 0.1
                    },
                    "format": json_format  # Forces structured JSON schema constraint in Ollama
                }
                response = await client.post(f"{url}/api/chat", json=payload)
                if response.status_code != 200:
                    raise Exception(f"Ollama returned status code {response.status_code}: {response.text}")
                
                result = response.json()
                raw_json = result["message"]["content"]

            else:
                # OpenAI-compatible chat endpoint. Official OpenAI API adds Bearer auth only in openai_api mode.
                payload = {
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": message}
                    ],
                    "temperature": 0.1
                }
                headers = {}
                if provider == OPENAI_API_PROVIDER:
                    headers["Authorization"] = f"Bearer {get_openai_api_key(db)}"
                response = await client.post(f"{url}/v1/chat/completions", json=payload, headers=headers)
                if response.status_code != 200:
                    raise Exception(f"LLM Server returned status code {response.status_code}: {response.text}")
                
                result = response.json()
                raw_json = result["choices"][0]["message"]["content"]

            # Console debug output
            logger.debug("=== LLM RESPONSE ===")
            logger.debug("Raw Output:\n%s", raw_json)

            # Safely parse JSON
            return parse_robust_json(raw_json)

        except httpx.RequestError as e:
            raise Exception(f"Failed to connect to LLM server: {str(e)}")

def parse_robust_json(text: str) -> dict:
    text = text.strip()
    
    # Remove <think>...</think> tags generated by reasoning models (e.g. DeepSeek-R1)
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    
    # Regex extract json out of markdown wrapper code blocks if any
    match = re.search(r'```(?:json)?\s*(.*?)\s*```', text, re.DOTALL)
    if match:
        text = match.group(1).strip()
        
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback to outer braces extraction
        match_braces = re.search(r'(\{.*\})', text, re.DOTALL)
        if match_braces:
            try:
                return json.loads(match_braces.group(1))
            except json.JSONDecodeError:
                pass
        raise ValueError(f"AI returned invalid JSON: {text}")
