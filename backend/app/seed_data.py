from sqlalchemy.orm import Session

from .models import Part, Product, ProductPart


INITIAL_PARTS = [
    {
        "key": "m2_6mm_screw",
        "name": "M2 6mm ネジ",
        "category1": "ネジ",
        "category2": "M2",
        "category3": "6mm",
        "quantity": 100.0,
    },
    {
        "key": "m2_nut",
        "name": "M2 ナット",
        "category1": "ナット",
        "category2": "M2",
        "category3": None,
        "quantity": 100.0,
    },
    {
        "key": "pro_micro",
        "name": "Pro Micro マイクロコントローラー",
        "category1": "マイクロコントローラー",
        "category2": "Pro Micro",
        "category3": None,
        "quantity": 1.0,
    },
    {
        "key": "1n4148_diode",
        "name": "リードタイプ 1N4148 ダイオード",
        "category1": "ダイオード",
        "category2": "リードタイプ",
        "category3": "1N4148",
        "quantity": 9.0,
    },
    {
        "key": "rubber_feet",
        "name": "ゴム足",
        "category1": "ゴム足",
        "category2": None,
        "category3": None,
        "quantity": 4.0,
    },
]

INITIAL_PRODUCTS = [
    {
        "name": "商品A",
        "description": "初期サンプル商品",
        "parts": [
            ("m2_6mm_screw", 4.0),
            ("m2_nut", 4.0),
            ("pro_micro", 1.0),
            ("1n4148_diode", 9.0),
            ("rubber_feet", 4.0),
        ],
    }
]


def seed_initial_data(db: Session) -> bool:
    if db.query(Part).first() or db.query(Product).first():
        return False

    try:
        parts_by_key = {}
        for item in INITIAL_PARTS:
            part = Part(
                name=item["name"],
                category1=item["category1"],
                category2=item["category2"],
                category3=item["category3"],
                quantity=item["quantity"],
                unit="個",
                purchase_price=0.0,
                currency="JPY",
                price_input_type="unit",
                original_unit_price=0.0,
                original_currency="JPY",
                exchange_rate=1.0,
                alert_threshold=0.0,
            )
            db.add(part)
            parts_by_key[item["key"]] = part

        db.flush()

        for item in INITIAL_PRODUCTS:
            product = Product(
                name=item["name"],
                description=item["description"],
            )
            db.add(product)
            db.flush()

            for part_key, quantity in item["parts"]:
                db.add(
                    ProductPart(
                        product_id=product.id,
                        part_id=parts_by_key[part_key].id,
                        quantity=quantity,
                    )
                )

        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
