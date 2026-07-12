import difflib
import re
import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from ..database import get_db
from ..models import Part, Product, ProductPart, Setting
from ..auth import get_current_user
from ..llm import analyze_message, get_setting_value, is_llm_enabled, normalize_string
from ..pricing import FALLBACK_RATE_TO_JPY, serialize_part

router = APIRouter(prefix="/api/chat", tags=["chat"])
AI_SETTINGS_UPDATE_DENYLIST = {
    "background_image_data",
    "background_image_url",
    "background_image_filename",
    "openai_api_key",
    # Client-side only virtual key (localStorage); must never be persisted as a setting
    "clear_delete_confirm_skips",
}


def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_optional_float(val):
    if val in (None, ""):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def normalize_part_action_shape(result: Dict[str, Any]) -> Dict[str, Any]:
    result_type = result.get("type")
    if result_type in ("edit", "price"):
        result["type"] = "parts"
        result["action"] = result_type
        result.setdefault("items", [])
    elif result_type == "parts" and result.get("action") == "update_metadata":
        result["action"] = "price"
    return result


def llm_disabled_message(db: Session) -> Dict[str, str]:
    language = get_setting_value(db, "language") or "ja"
    return {
        "type": "message",
        "message": (
            "AI (LLM) settings are turned off. AI features are unavailable until they are turned on in Settings."
            if language == "en"
            else "AI（LLM）設定がオフになっています。AI機能を使うには設定ページでオンにしてください。"
        ),
    }


def extract_explicit_part_categories(db: Session, message: str) -> Dict[str, Any]:
    normalized_message = normalize_string(message)
    categories: Dict[str, Any] = {}
    for key in ("category1", "category2", "category3"):
        values = {
            value
            for (value,) in db.query(getattr(Part, key)).distinct().all()
            if value
        }
        matches = [
            value
            for value in values
            if normalize_string(value) and normalize_string(value) in normalized_message
        ]
        if matches:
            categories[key] = max(matches, key=lambda value: len(normalize_string(value)))
    return categories


def normalize_purchase_date(date_str: str) -> str:
    if not date_str:
        return None
    
    date_str = str(date_str).strip()
    
    # 1. YYYY-MM-DD or YYYY/MM/DD
    match = re.match(r'^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$', date_str)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))
        try:
            return datetime.date(year, month, day).strftime("%Y-%m-%d")
        except ValueError:
            return None
            
    # 2. YY/MM/DD or YY-MM-DD
    match = re.match(r'^(\d{2})[-/](\d{1,2})[-/](\d{1,2})$', date_str)
    if match:
        year = 2000 + int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))
        try:
            return datetime.date(year, month, day).strftime("%Y-%m-%d")
        except ValueError:
            return None

    # 3. MM/DD or MM-DD or M月D日
    cleaned = date_str.replace("月", "/").replace("日", "")
    match = re.match(r'^(\d{1,2})[-/](\d{1,2})$', cleaned)
    if match:
        month = int(match.group(1))
        day = int(match.group(2))
        
        now = datetime.datetime.now()
        try:
            candidate = datetime.date(now.year, month, day)
            if candidate > now.date():
                candidate = datetime.date(now.year - 1, month, day)
            return candidate.strftime("%Y-%m-%d")
        except ValueError:
            return None

    return None


def find_closest_part(db: Session, c1: str, c2: str, c3: str) -> tuple:
    existing_parts = db.query(Part).all()
    if not existing_parts:
        return None, 0.0

    c1_str = str(c1) if c1 is not None else None
    c2_str = str(c2) if c2 is not None else None
    c3_str = str(c3) if c3 is not None else None

    target_str = " ".join(filter(None, [c2_str, c3_str, c1_str])).strip().lower()
    if not target_str:
        return None, 0.0

    # Try exact match (normalized) first
    normalized_target = normalize_string(target_str)
    for part in existing_parts:
        part_str = " ".join(filter(None, [part.category2, part.category3, part.category1])).strip().lower()
        if normalize_string(part_str) == normalized_target:
            return part, 1.0

    best_match = None
    highest_ratio = 0.0

    for part in existing_parts:
        part_str = " ".join(filter(None, [part.category2, part.category3, part.category1])).strip().lower()
        
        if target_str == part_str:
            return part, 1.0
            
        ratio = difflib.SequenceMatcher(None, target_str, part_str).ratio()
        
        # Give a boost for partial match
        if len(target_str) > 2 and len(part_str) > 2:
            if target_str in part_str or part_str in target_str:
                ratio = max(ratio, 0.8)
            norm_part = normalize_string(part_str)
            if normalized_target in norm_part or norm_part in normalized_target:
                ratio = max(ratio, 0.8)
                
        if ratio > highest_ratio:
            highest_ratio = ratio
            best_match = part

    if highest_ratio >= 0.65:
        return best_match, highest_ratio
    return None, 0.0


def find_exact_parts(db: Session, c1: str, c2: str, c3: str) -> List[Part]:
    target = tuple(normalize_string(value or "") for value in (c1, c2, c3))
    if not any(target):
        return []
    return [
        part
        for part in db.query(Part).all()
        if tuple(
            normalize_string(value or "")
            for value in (part.category1, part.category2, part.category3)
        ) == target
    ]


def find_closest_part_by_name(db: Session, name: str) -> Part:
    existing_parts = db.query(Part).all()
    if not existing_parts:
        return None

    target_str = name.strip().lower()
    if not target_str:
        return None

    # Try exact match (normalized) first
    normalized_target = normalize_string(target_str)
    for part in existing_parts:
        if normalize_string(part.name) == normalized_target:
            return part

    best_match = None
    highest_ratio = 0.0

    for part in existing_parts:
        part_name = part.name.strip().lower()
        if target_str == part_name:
            return part

        ratio = difflib.SequenceMatcher(None, target_str, part_name).ratio()

        if len(target_str) > 2 and len(part_name) > 2:
            if target_str in part_name or part_name in target_str:
                ratio = max(ratio, 0.8)
            norm_part = normalize_string(part_name)
            if normalized_target in norm_part or norm_part in normalized_target:
                ratio = max(ratio, 0.8)

        if ratio > highest_ratio:
            highest_ratio = ratio
            best_match = part

    if highest_ratio >= 0.70:
        return best_match
    return None

def find_closest_product(db: Session, product_name: str) -> Product:
    existing_products = db.query(Product).all()
    if not existing_products:
        return None

    target_str = product_name.strip().lower()
    if not target_str:
        return None

    # Try exact match (normalized) first
    normalized_target = normalize_string(target_str)
    for prod in existing_products:
        if normalize_string(prod.name) == normalized_target:
            return prod

    best_match = None
    highest_ratio = 0.0

    for prod in existing_products:
        prod_str = prod.name.strip().lower()
        if target_str == prod_str:
            return prod

        ratio = difflib.SequenceMatcher(None, target_str, prod_str).ratio()

        if len(target_str) > 2 and len(prod_str) > 2:
            if target_str in prod_str or prod_str in target_str:
                ratio = max(ratio, 0.8)
            norm_prod = normalize_string(prod_str)
            if normalized_target in norm_prod or norm_prod in normalized_target:
                ratio = max(ratio, 0.8)

        if ratio > highest_ratio:
            highest_ratio = ratio
            best_match = prod

    if highest_ratio >= 0.70:
        return best_match
    return None

def find_exact_product_by_name(db: Session, product_name: str) -> Product:
    target = normalize_string((product_name or "").strip())
    if not target:
        return None

    return next(
        (
            product
            for product in db.query(Product).all()
            if normalize_string(product.name) == target
        ),
        None,
    )

def preprocess_message_with_db_names(db: Session, message: str) -> str:
    if not message:
        return message

    names = []
    
    # 1. Collect all product names and their token parts
    product_names = db.query(Product.name).filter(Product.name.isnot(None)).all()
    for (prod_name,) in product_names:
        names.append(normalize_string(prod_name))
        for token in re.split(r'[\s\W_]+', prod_name.lower()):
            if len(token) > 2:
                names.append(normalize_string(token))

    # 2. Collect all parts categories and name tokens
    part_cols = db.query(Part.category1, Part.category2, Part.category3, Part.name).distinct().all()
    for cat1, cat2, cat3, name in part_cols:
        for cat in (cat1, cat2, cat3, name):
            if cat:
                names.append(normalize_string(cat))
                for token in re.split(r'[\s\W_]+', cat.lower()):
                    if len(token) > 2:
                        names.append(normalize_string(token))

    # 3. Filter unique keywords, keep only those with length > 2, and sort by length descending
    unique_names = sorted(list(set(filter(None, names))), key=len, reverse=True)
    if not unique_names:
        return message

    # 4. Construct a regex pattern matching any of these keywords followed directly by a digit
    pattern_str = "|".join(re.escape(name) for name in unique_names if len(name) > 2)
    if not pattern_str:
        return message

    pattern = re.compile(rf'(?<![a-zA-Z0-9])({pattern_str})(?=\d)', re.IGNORECASE)

    # 5. Insert space between matched keyword and the trailing digit
    return pattern.sub(r'\1 ', message)

@router.post("/analyze")
async def chat_analyze(
    payload: Dict[str, str],
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    message = payload.get("message", "")
    mode = payload.get("mode", "chat")
    if not message:
        raise HTTPException(status_code=400, detail="Message is empty.")

    if not is_llm_enabled(db):
        return llm_disabled_message(db)
    
    # Preprocess message to separate database keywords from trailing digits
    message = preprocess_message_with_db_names(db, message)
    language = get_setting_value(db, "language") or "ja"
    is_en = language == "en"
    
    try:
        analysis_result = normalize_part_action_shape(
            await analyze_message(db, message, current_user.username, mode)
        )
        if (
            analysis_result.get("type") == "parts"
            and analysis_result.get("action") == "edit"
            and not analysis_result.get("items")
        ):
            analysis_result["items"] = [extract_explicit_part_categories(db, message)]
        
        # Handle tool_call dynamically on backend
        if analysis_result.get("type") == "tool_call":
            tool_name = analysis_result.get("tool")
            args = analysis_result.get("args") or {}
            
            tool_context = ""
            if tool_name == "get_parts_list":
                query = db.query(Part)
                if args.get("category1"):
                    query = query.filter(Part.category1.like(f"%{args['category1']}%"))
                if args.get("category2"):
                    query = query.filter(Part.category2.like(f"%{args['category2']}%"))
                if args.get("category3"):
                    query = query.filter(Part.category3.like(f"%{args['category3']}%"))
                
                parts = query.limit(50).all()
                parts_list = []
                for p in parts:
                    name_parts = [p.category2, p.category3, p.category1]
                    display_name = " ".join(filter(None, name_parts)).strip() or p.name
                    parts_list.append(
                        f"- {display_name} (ID:{p.id}, stock:{p.quantity} {p.unit}, unit price:{p.purchase_price} {p.currency})"
                        if is_en
                        else f"- {display_name} (ID:{p.id}, 在庫:{p.quantity} {p.unit}, 単価:{p.purchase_price} {p.currency})"
                    )
                parts_ctx = "\n".join(parts_list) if parts_list else ("No parts matched the conditions." if is_en else "条件に合う部品はありません。")
                tool_context = f"[Tool result (part search: {args})]\n{parts_ctx}" if is_en else f"【ツール実行結果（部品検索: {args}）】\n{parts_ctx}"
                
            elif tool_name == "get_products":
                query = db.query(Product)
                if args.get("name"):
                    query = query.filter(Product.name.like(f"%{args['name']}%"))
                products = query.limit(30).all()
                products_list = []
                for pr in products:
                    recipe_parts = []
                    for pp in pr.parts:
                        unknown_label = "Unknown" if is_en else "不明"
                        recipe_parts.append(f"{pp.part.name if pp.part else unknown_label} x {pp.quantity}")
                    products_list.append(f"- {pr.name} ({', '.join(recipe_parts)})")
                products_ctx = "\n".join(products_list) if products_list else ("No products matched the conditions." if is_en else "条件に合う商品はありません。")
                tool_context = f"[Tool result (product recipe search: {args})]\n{products_ctx}" if is_en else f"【ツール実行結果（商品構成検索: {args}）】\n{products_ctx}"
            
            enforced_context = tool_context
            # Re-run analyzer with the retrieved tool context
            analysis_result = normalize_part_action_shape(
                await analyze_message(db, message, current_user.username, mode, extra_context=enforced_context)
            )
            
            # Fallback if the LLM still returns a tool_call (or invalid response)
            if analysis_result.get("type") == "tool_call":
                fallback_msg = (
                    "The database search found the following information.\n\n"
                    if is_en
                    else "データベースを検索した結果、以下の情報が見つかりました。\n\n"
                ) + (
                    f"{parts_ctx if tool_name == 'get_parts_list' else products_ctx}"
                )
                analysis_result = {
                    "type": "message",
                    "message": fallback_msg
                }

        # Fuzzy Match Logic for Parts
        if analysis_result.get("type") == "parts":
            action = analysis_result.get("action")
            for item in analysis_result.get("items", []):
                item.setdefault("category1", "")
                item.setdefault("category2", None)
                item.setdefault("category3", None)
                item.setdefault("quantity", 0.0)
                item.setdefault("purchase_price", 0.0)
                item.setdefault("total_price", None)
                item.setdefault("currency", None)
                item.setdefault("purchase_date", None)

                # Normalize purchase_date on Python side
                raw_date = item.get("purchase_date")
                if raw_date:
                    item["purchase_date"] = normalize_purchase_date(raw_date)

                # Ensure all category fields are normalized to str or None
                for key in ["category1", "category2", "category3"]:
                    val = item.get(key)
                    if val is not None:
                        item[key] = str(val).strip()
                    else:
                        item[key] = None

                c1 = item.get("category1")
                c2 = item.get("category2")
                c3 = item.get("category3")

                if action == "edit":
                    exact_parts = find_exact_parts(db, c1, c2, c3)
                    if len(exact_parts) == 1:
                        matched_data = serialize_part(
                            exact_parts[0],
                            get_setting_value(db, "currency") or "JPY",
                        )
                        item.update(matched_data)
                        item["part_id"] = exact_parts[0].id
                    else:
                        item.update({
                            "part_id": None,
                            "quantity": 0.0,
                            "unit": "pcs",
                            "purchase_price": 0.0,
                            "currency": get_setting_value(db, "currency") or "JPY",
                            "purchase_date": None,
                            "price_input_type": "unit",
                            "purchase_quantity": None,
                            "original_unit_price": None,
                            "original_total_price": None,
                            "original_currency": None,
                            "exchange_rate": None,
                            "alert_threshold": 0.0,
                        })
                else:
                    matched_part, ratio = find_closest_part(db, c1, c2, c3)
                    if matched_part:
                        item["category1"] = matched_part.category1
                        item["category2"] = matched_part.category2
                        item["category3"] = matched_part.category3
                        item["part_id"] = matched_part.id
                    
        # Fuzzy Match Logic for Products
        elif analysis_result.get("type") == "product":
            # For backward compatibility, if LLM returns a single product format, convert to items array
            if "items" not in analysis_result and "product_name" in analysis_result:
                analysis_result["items"] = [{
                    "product_name": analysis_result["product_name"],
                    "product_count": analysis_result.get("product_count", 1)
                }]
            
            for item in analysis_result.get("items", []):
                p_name = item.get("product_name")
                if p_name:
                    matched_product = find_closest_product(db, p_name)
                    if matched_product:
                        item["product_name"] = matched_product.name
                        item["product_id"] = matched_product.id
                        item["parts"] = [
                            {
                                "part_id": pp.part_id,
                                "part_name": pp.part.name,
                                "quantity": pp.quantity,
                                "unit": pp.part.unit
                            }
                            for pp in matched_product.parts
                        ]
                    
        # Fuzzy Match Logic for Product Recipe Actions (Products mode)
        elif analysis_result.get("type") == "product_recipe":
            p_name = analysis_result.get("product_name")
            if p_name:
                matched_product = find_closest_product(db, p_name)
                if matched_product:
                    analysis_result["product_name"] = matched_product.name
                    analysis_result["action"] = "update"
                else:
                    analysis_result["action"] = "create"
            
            # Match each part inside recipe items
            for item in analysis_result.get("parts", []):
                part_name = item.get("part_name")
                if part_name:
                    matched_part = find_closest_part_by_name(db, part_name)
                    if matched_part:
                        item["part_id"] = matched_part.id
                        item["part_name"] = matched_part.name
                    else:
                        item["part_id"] = None
                        
        return analysis_result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute")
def chat_execute(
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    exec_type = payload.get("type")
    action = payload.get("action")
    if action == "update_metadata":
        action = "price"

    if exec_type == "parts":
        items = payload.get("items", [])
        updated_parts = []
        for item in items:
            part_id = item.get("part_id")
            
            # Ensure all category fields are normalized to str or None
            for key in ["category1", "category2", "category3"]:
                val = item.get(key)
                if val is not None:
                    item[key] = str(val).strip()
                else:
                    item[key] = None

            c1 = item.get("category1")
            c2 = item.get("category2")
            c3 = item.get("category3")
            qty = safe_float(item.get("quantity"), 0.0)
            unit = item.get("unit", "pcs")
            currency = get_setting_value(db, "currency") or "JPY"
            price_input_type = "total" if item.get("isTotalInput") else item.get("price_input_type", "unit")
            original_currency = item.get("inputCurrency") or item.get("original_currency") or item.get("currency") or currency
            purchase_quantity = safe_optional_float(
                item.get("purchase_quantity")
                if "purchase_quantity" in item
                else item.get("purchaseQuantity")
            )
            if purchase_quantity is None and action == "add" and qty > 0:
                purchase_quantity = qty
            original_total_price = safe_optional_float(item.get("tempTotalCost"))
            if original_total_price is None:
                original_total_price = safe_optional_float(item.get("total_price") or item.get("original_total_price"))
            original_unit_price = safe_optional_float(item.get("tempUnitPrice"))
            if original_unit_price is None:
                original_unit_price = safe_optional_float(item.get("original_unit_price"))
            has_price_metadata = (
                original_total_price is not None
                or original_unit_price is not None
                or safe_float(item.get("purchase_price"), 0.0) > 0
            )
            if action == "consume":
                has_price_metadata = False
            exchange_rate = safe_optional_float(item.get("exchangeRate") or item.get("exchange_rate"))
            if exchange_rate is None:
                exchange_rate = 1.0
            if original_currency == "JPY":
                exchange_rate_to_jpy = 1.0
            elif currency == "JPY":
                exchange_rate_to_jpy = exchange_rate
            else:
                exchange_rate_to_jpy = exchange_rate * FALLBACK_RATE_TO_JPY.get(currency, 1.0)

            if price_input_type == "total" and original_total_price is not None:
                if purchase_quantity and purchase_quantity > 0:
                    original_unit_price = original_total_price / purchase_quantity
            elif original_unit_price is None and has_price_metadata:
                original_unit_price = safe_float(item.get("purchase_price"), 0.0)
                original_total_price = None
                price_input_type = "unit"

            price = safe_float(item.get("purchase_price"), 0.0)
            if price <= 0 and original_unit_price is not None:
                price = original_unit_price * (exchange_rate_to_jpy / FALLBACK_RATE_TO_JPY.get(currency, 1.0))

            # Normalize categories (strip whitespaces, handle empty strings as None)
            c1 = c1.strip() if c1 else None
            c2 = c2.strip() if c2 else None
            c3 = c3.strip() if c3 else None

            # Generate part name using the ordering sequence: "[規格・形状] [値・サイズ] [種類]" -> [c2, c3, c1]
            generated_name = " ".join(filter(None, [c2, c3, c1])).strip()
            if not generated_name:
                continue

            # Query existing part by ID first, then by category specifications
            db_part = None
            if part_id:
                db_part = db.query(Part).filter(Part.id == part_id).first()
                if db_part:
                    p_c1 = db_part.category1.strip() if db_part.category1 else None
                    p_c2 = db_part.category2.strip() if db_part.category2 else None
                    p_c3 = db_part.category3.strip() if db_part.category3 else None
                    if p_c1 != c1 or p_c2 != c2 or p_c3 != c3:
                        db_part = None

            if not db_part:
                db_part = db.query(Part).filter(
                    Part.category1 == c1,
                    Part.category2 == c2,
                    Part.category3 == c3
                ).first()

            if db_part:
                if (
                    has_price_metadata
                    and price_input_type == "total"
                    and original_total_price is not None
                    and not (purchase_quantity and purchase_quantity > 0)
                ):
                    purchase_quantity = db_part.purchase_quantity
                    if purchase_quantity and purchase_quantity > 0:
                        original_unit_price = original_total_price / purchase_quantity

                if has_price_metadata and original_unit_price is not None:
                    price = original_unit_price * (
                        exchange_rate_to_jpy / FALLBACK_RATE_TO_JPY.get(currency, 1.0)
                    )

                # Adjust stock quantity
                if action == "add":
                    db_part.quantity += qty
                elif action == "consume":
                    db_part.quantity = max(0.0, db_part.quantity - qty)
                # Price-only updates do not touch inventory quantity.
                
                if has_price_metadata:
                    if price > 0:
                        db_part.purchase_price = price
                    db_part.currency = currency
                    db_part.price_input_type = price_input_type
                    db_part.purchase_quantity = purchase_quantity
                    db_part.original_unit_price = original_unit_price
                    db_part.original_total_price = original_total_price if price_input_type == "total" else None
                    db_part.original_currency = original_currency
                    db_part.exchange_rate = exchange_rate_to_jpy
                    purchase_date = item.get("purchase_date")
                    if price_input_type == "unit":
                        db_part.purchase_date = purchase_date or None
                    elif purchase_date:
                        db_part.purchase_date = purchase_date
                elif action == "price" and item.get("purchase_date"):
                    db_part.purchase_date = item["purchase_date"]
                
                alert_threshold = item.get("alert_threshold")
                if alert_threshold is not None:
                    db_part.alert_threshold = safe_float(alert_threshold, 0.0)
            else:
                # Instantiate new part only on "add" action
                if action == "add" or action == "price":
                    db_part = Part(
                        name=generated_name,
                        category1=c1,
                        category2=c2,
                        category3=c3,
                        quantity=qty if action == "add" else 0.0,
                        unit=unit,
                        purchase_price=price,
                        currency=currency,
                        purchase_date=item.get("purchase_date"),
                        price_input_type=price_input_type,
                        purchase_quantity=purchase_quantity,
                        original_unit_price=original_unit_price,
                        original_total_price=original_total_price if price_input_type == "total" else None,
                        original_currency=original_currency,
                        exchange_rate=exchange_rate_to_jpy,
                        alert_threshold=safe_float(item.get("alert_threshold"), 0.0)
                    )
                    db.add(db_part)
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Part '{generated_name}' not found for consume action."
                    )
            
            db.commit()
            if db_part:
                db.refresh(db_part)
                updated_parts.append(db_part)
        return {"status": "success", "message": "在庫を更新しました。", "parts": updated_parts}

    elif exec_type == "product":
        items = payload.get("items", [])
        # Backward compatibility
        if not items and payload.get("product_name"):
            items = [{
                "product_name": payload.get("product_name"),
                "product_count": payload.get("product_count", 1)
            }]

        if not items:
            raise HTTPException(status_code=400, detail="組み立てる商品が指定されていません。")

        results = []
        low_stock_alerts = []
        consumed_parts_summary = []

        for item in items:
            p_name = item.get("product_name")
            product_count = safe_float(item.get("product_count"), 1.0)

            if not p_name:
                continue

            product = find_closest_product(db, p_name)
            if not product:
                raise HTTPException(status_code=404, detail=f"商品「{p_name}」が登録されていません。")

            # Reduce stock quantities for each recipe component
            for prod_part in product.parts:
                part = prod_part.part
                required_qty = prod_part.quantity * product_count
                part.quantity = max(0.0, part.quantity - required_qty)
                consumed_parts_summary.append({
                    "part_name": part.name,
                    "consumed_quantity": required_qty,
                    "remaining_quantity": part.quantity,
                    "unit": part.unit
                })
                
                # Check alert threshold
                if part.alert_threshold > 0.0 and part.quantity <= part.alert_threshold:
                    low_stock_alerts.append(
                        f"・{part.name} (現在庫: {part.quantity} {part.unit} / 閾値: {part.alert_threshold} {part.unit})"
                    )

            results.append({
                "product_name": product.name,
                "product_count": product_count
            })

        db.commit()
        
        msg_parts = []
        for r in results:
            msg_parts.append(f"商品「{r['product_name']}」を{r['product_count']}個組み立て、構成部品を消費しました。")
        msg = "\n".join(msg_parts)

        if low_stock_alerts:
            # Deduplicate alerts
            low_stock_alerts = list(set(low_stock_alerts))
            msg += "\n\n⚠️ 【アラート】以下の部品の在庫が最低在庫数以下になりました：\n" + "\n".join(low_stock_alerts)

        return {
            "status": "success",
            "message": msg,
            "consumed_parts": consumed_parts_summary
        }

    elif exec_type == "product_recipe":
        product_name = (payload.get("product_name") or "").strip()
        product_id = payload.get("product_id")
        description = payload.get("description")
        recipe_parts = payload.get("parts", [])

        if not product_name:
            raise HTTPException(status_code=400, detail="Product name is required.")

        product = None
        if action == "update":
            if product_id:
                product_by_id = db.query(Product).filter(Product.id == product_id).first()
                if (
                    product_by_id
                    and normalize_string(product_by_id.name) == normalize_string(product_name)
                ):
                    product = product_by_id
            if not product:
                product = find_exact_product_by_name(db, product_name)
        else:
            existing_product = find_exact_product_by_name(db, product_name)
            if existing_product:
                raise HTTPException(status_code=400, detail="Product name already exists.")

        if not product:
            product = Product(name=product_name, description=description)
            db.add(product)
            db.commit()
            db.refresh(product)
        else:
            if "description" in payload:
                product.description = description

        # Clear existing recipe parts
        db.query(ProductPart).filter(ProductPart.product_id == product.id).delete()
        db.commit()

        # Add new recipe parts
        aggregated_parts = {}
        for rp in recipe_parts:
            part_id = rp.get("part_id")
            part_name = rp.get("part_name")
            qty = safe_float(rp.get("quantity"), 1.0)

            db_part = None
            if part_id:
                db_part = db.query(Part).filter(Part.id == part_id).first()
            if not db_part and part_name:
                db_part = find_closest_part_by_name(db, part_name)
            
            if db_part:
                if db_part.id in aggregated_parts:
                    aggregated_parts[db_part.id]["quantity"] += qty
                else:
                    aggregated_parts[db_part.id] = {
                        "part_id": db_part.id,
                        "part_name": db_part.name,
                        "quantity": qty
                    }

        added_parts = []
        for part_data in aggregated_parts.values():
            prod_part = ProductPart(
                product_id=product.id,
                part_id=part_data["part_id"],
                quantity=part_data["quantity"]
            )
            db.add(prod_part)
            added_parts.append(part_data)

        db.commit()
        db.refresh(product)
        return {
            "status": "success",
            "message": f"商品「{product.name}」の商品構成を登録・更新しました。",
            "product": {
                "id": product.id,
                "name": product.name,
                "description": product.description,
                "parts": added_parts
            }
        }

    elif exec_type == "settings":
        updates = payload.get("updates", {})
        for key, val in updates.items():
            if key in AI_SETTINGS_UPDATE_DENYLIST:
                continue
            db_setting = db.query(Setting).filter(Setting.key == key).first()
            if db_setting:
                db_setting.value = str(val) if val is not None else ""
            else:
                db_setting = Setting(key=key, value=str(val) if val is not None else "")
                db.add(db_setting)
        db.commit()
        return {"status": "success", "message": "システム設定を更新しました。"}

    else:
        raise HTTPException(status_code=400, detail="Invalid execution type.")
