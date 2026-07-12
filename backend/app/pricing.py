from .models import Part, Product

FALLBACK_RATE_TO_JPY = {
    "JPY": 1.0,
    "USD": 155.0,
    "EUR": 165.0,
}


def rate_between(from_currency: str, to_currency: str) -> float:
    from_rate = FALLBACK_RATE_TO_JPY.get(from_currency or "JPY", 1.0)
    to_rate = FALLBACK_RATE_TO_JPY.get(to_currency or "JPY", 1.0)
    return from_rate / to_rate if to_rate else 1.0


def get_original_unit_price(part: Part) -> float:
    input_type = part.price_input_type or "unit"
    purchase_quantity = part.purchase_quantity

    if input_type == "total" and part.original_total_price is not None and purchase_quantity and purchase_quantity > 0:
        return part.original_total_price / purchase_quantity
    if part.original_unit_price is not None:
        return part.original_unit_price
    return part.purchase_price or 0.0


def keeps_original_currency(part: Part) -> bool:
    return (part.price_input_type or "unit") == "unit" and not part.purchase_date


def get_display_unit_price(part: Part, display_currency: str) -> float:
    target_currency = display_currency or part.currency or "JPY"
    original_currency = part.original_currency or part.currency or target_currency
    original_unit_price = get_original_unit_price(part)

    if keeps_original_currency(part):
        return original_unit_price
    if original_currency == target_currency:
        return original_unit_price
    if part.exchange_rate:
        price_jpy = original_unit_price * part.exchange_rate
        return price_jpy / FALLBACK_RATE_TO_JPY.get(target_currency, 1.0)
    return original_unit_price * rate_between(original_currency, target_currency)


def serialize_part(part: Part, display_currency: str) -> dict:
    currency = (
        part.original_currency or part.currency or "JPY"
        if keeps_original_currency(part)
        else display_currency or part.currency or "JPY"
    )
    return {
        "id": part.id,
        "name": part.name,
        "category1": part.category1,
        "category2": part.category2,
        "category3": part.category3,
        "quantity": part.quantity,
        "unit": part.unit,
        "purchase_price": round(get_display_unit_price(part, display_currency), 4),
        "currency": currency,
        "purchase_date": part.purchase_date,
        "price_input_type": part.price_input_type or "unit",
        "purchase_quantity": part.purchase_quantity,
        "original_unit_price": part.original_unit_price,
        "original_total_price": part.original_total_price,
        "original_currency": part.original_currency,
        "exchange_rate": part.exchange_rate,
        "alert_threshold": part.alert_threshold,
        "created_at": part.created_at,
        "updated_at": part.updated_at,
    }


def serialize_product(product: Product, display_currency: str) -> dict:
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
        "parts": [
            {
                "part_id": product_part.part_id,
                "quantity": product_part.quantity,
                "part": serialize_part(product_part.part, display_currency) if product_part.part else None,
            }
            for product_part in product.parts
        ],
    }
