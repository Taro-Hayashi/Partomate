import os
import sys
import random
import datetime

# Add the parent directory to Python path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.database import SessionLocal
from backend.app.models import Part, Product, ProductPart

def generate_data():
    db = SessionLocal()
    try:
        print("Clearing existing parts and products data...")
        db.query(ProductPart).delete()
        db.query(Product).delete()
        db.query(Part).delete()
        db.commit()

        categories = {
            "ネジ類": [
                ("M2", "3mm", "pcs"), ("M2", "5mm", "pcs"), ("M2", "8mm", "pcs"), ("M2", "10mm", "pcs"),
                ("M3", "6mm", "pcs"), ("M3", "8mm", "pcs"), ("M3", "10mm", "pcs"), ("M3", "12mm", "pcs"),
                ("M2黒", "3mm", "pcs"), ("M2黒", "5mm", "pcs"), ("M2黒", "8mm", "pcs"), ("M2黒", "10mm", "pcs"),
                ("M3黒", "6mm", "pcs"), ("M3黒", "8mm", "pcs"), ("M3黒", "10mm", "pcs"), ("M3黒", "12mm", "pcs"),
                ("ナット M2", "", "pcs"), ("ナット M3", "", "pcs"),
                ("ナット M2黒", "", "pcs"), ("ナット M3黒", "", "pcs"),
                ("ワッシャー M2", "", "pcs"), ("ワッシャー M3", "", "pcs"),
                ("スプリングワッシャー M2", "", "pcs"), ("スプリングワッシャー M3", "", "pcs"),
                ("インサートナット", "M2 4mm", "pcs"), ("インサートナット", "M3 6mm", "pcs"),
                ("四角ナット", "M3", "pcs"), ("スペーサー", "FF3 3mm", "pcs"),
                ("スペーサー", "FF5 5mm", "pcs"), ("スペーサー", "FF8 8mm", "pcs")
            ],
            "電子部品": [
                ("抵抗", "10kΩ", "pcs"), ("抵抗", "1kΩ", "pcs"), ("抵抗", "2.2kΩ", "pcs"), ("抵抗", "4.7kΩ", "pcs"),
                ("抵抗", "470Ω", "pcs"), ("抵抗", "100Ω", "pcs"), ("抵抗", "330Ω", "pcs"),
                ("コンデンサ", "0.1uF", "pcs"), ("コンデンサ", "10uF", "pcs"), ("コンデンサ", "4.7uF", "pcs"),
                ("コンデンサ", "22pF", "pcs"), ("コンデンサ", "1uF", "pcs"),
                ("ダイオード", "1N4148", "pcs"), ("ダイオード", "BAT43", "pcs"),
                ("ソケット", "MXソケット", "pcs"), ("ソケット", "Chocソケット", "pcs"),
                ("LED", "SK6812MINI-E", "pcs"), ("LED", "WS2812B", "pcs"),
                ("ピンヘッダー", "40P", "pcs"), ("ピンソケット", "40P", "pcs"),
                ("ジャック", "TRRS 3.5mm", "pcs"), ("エンコーダー", "EC11 11mm", "pcs"),
                ("エンコーダー", "EC12 12mm", "pcs"), ("ノブ", "アルミ 15mm", "pcs"),
                ("OLED", "0.91インチ", "pcs"), ("OLED", "0.96インチ", "pcs"),
                ("スイッチ", "リセット", "pcs"), ("スイッチ", "スライド", "pcs"),
                ("スイッチ", "トグル", "pcs"), ("センサー", "PMW3360", "pcs"),
                ("レギュレーター", "3.3V", "pcs"), ("MOSFET", "BSS138", "pcs")
            ],
            "マイコン": [
                ("Raspberry Pi", "Pico", "pcs"), ("Raspberry Pi", "Pico W", "pcs"),
                ("RP2040", "Zero", "pcs"), ("Pro Micro", "type-C", "pcs"),
                ("Pro Micro", "micro-USB", "pcs"), ("ESP32", "WROOM-32E", "pcs")
            ],
            "非電子": [
                ("ゴム足", "丸型黒", "pcs"), ("ゴム足", "角型半透明", "pcs"),
                ("ベアリング", "MR62ZZ", "pcs"), ("キーキャップ", "DSA 1U", "pcs"),
                ("キーキャップ", "DSA 1.25U", "pcs"), ("ジョイスティックキャップ", "黒", "pcs")
            ],
            "アクリル&PCB": [
                ("Handymanアクリル", "プレートセット", "pcs"), ("HandymanPCB", "メインボード", "pcs"),
                ("Pop'n Top アクリル", "プレートセット", "pcs"), ("Pop'n Top PCB", "メインボード", "pcs"),
                ("Undertow アクリル", "プレートセット", "pcs"), ("Undertow PCB", "メインボード", "pcs"),
                ("Gherkinアクリル", "プレートセット", "pcs"), ("GherkinPCB", "メインボード", "pcs"),
                ("Cannonball LL PCB", "メインボード", "pcs"), ("Cannonball LL アクリル", "プレートセット", "pcs")
            ],
            "梱包材": [
                ("パコール袋", "A 50x70", "pcs"), ("パコール袋", "B 60x85", "pcs"),
                ("パコール袋", "C 70x100", "pcs"), ("パコール袋", "D 85x120", "pcs"),
                ("パコール袋", "E 100x140", "pcs"), ("パコール袋", "F 120x170", "pcs"),
                ("パコール袋", "G 140x200", "pcs"), ("パコール袋", "H 170x240", "pcs"),
                ("テープ袋", "小 50x80", "pcs"), ("テープ袋", "中 70x100", "pcs"),
                ("テープ袋", "大 110x160", "pcs"), ("ネコハコ", "A4サイズ", "pcs"),
                ("宅急便コンパクト", "専用箱", "pcs")
            ],
            "フィラメント": [
                ("PLA", "黒 1kg", "pcs"), ("PLA", "白 1kg", "pcs"),
                ("PETG", "透明 1kg", "pcs"), ("TPU", "黒 0.5kg", "pcs")
            ]
        }

        # 1. Generate 100 parts
        print("Generating 100 parts...")
        parts = []
        currencies = ["JPY", "USD", "EUR"]
        
        # We need exactly 100 parts. We will select randomly from our pool
        all_pool = []
        for cat1, items in categories.items():
            for c2, c3, unit in items:
                all_pool.append((cat1, c2, c3, unit))
                
        # If all_pool is less than 100, we duplicate with variations
        while len(all_pool) < 100:
            item = random.choice(all_pool)
            all_pool.append((item[0], f"{item[1]} v2", item[2], item[3]))
            
        random.shuffle(all_pool)
        selected_pool = all_pool[:100]

        for i, (cat1, c2, c3, unit) in enumerate(selected_pool):
            # Generate random numbers
            quantity = float(random.randint(50, 5000))
            if unit == "m":
                quantity = round(random.uniform(10.0, 500.0), 2)
                
            purchase_price = round(random.uniform(0.01, 5.0), 4) # Foreign currency
            currency = random.choice(currencies)
            if currency == "JPY":
                purchase_price = float(random.randint(1, 1000))
                
            purchase_date = (datetime.date.today() - datetime.timedelta(days=random.randint(1, 365))).strftime("%Y-%m-%d")
            alert_threshold = float(random.randint(10, 200))

            name_parts = [c2, c3, cat1]
            generated_name = " ".join(filter(None, name_parts)).strip()
            if not generated_name:
                generated_name = f"部品 {i+1}"

            part = Part(
                name=generated_name,
                category1=cat1,
                category2=c2 if c2 else None,
                category3=c3 if c3 else None,
                quantity=quantity,
                unit=unit,
                purchase_price=purchase_price,
                currency=currency,
                purchase_date=purchase_date,
                alert_threshold=alert_threshold
            )
            db.add(part)
            parts.append(part)
            
        db.commit()
        # Refresh parts to get IDs
        for p in parts:
            db.refresh(p)
        print(f"Successfully inserted {len(parts)} parts.")

        # 2. Generate 5 Products
        print("Generating 5 products...")
        product_names = [
            ("Killer Whale Keyboard", "左右分割型のエルゴノミクスキーボードキット"),
            ("Pop'n Top Keyboard", "持ち運びに適した超薄型40%メカニカルキーボード"),
            ("Handyman v2 Pad", "12キー＋3ロータリーエンコーダーのマクロパッド"),
            ("Cannonball LL Split", "トラックボールを内蔵した60%分割キーボード"),
            ("Gherkin 30Kit", "30キーのシンプルな格子配列キーボードキット")
        ]
        
        for name, desc in product_names:
            product = Product(name=name, description=desc)
            db.add(product)
            db.commit()
            db.refresh(product)
            
            # Select 10 to 50 parts for this product
            num_parts = random.randint(10, 50)
            chosen_parts = random.sample(parts, num_parts)
            
            print(f"Adding {num_parts} parts to recipe of '{name}'...")
            for p in chosen_parts:
                qty = float(random.randint(1, 20))
                if p.unit == "m":
                    qty = round(random.uniform(0.1, 2.0), 2)
                    
                prod_part = ProductPart(
                    product_id=product.id,
                    part_id=p.id,
                    quantity=qty
                )
                db.add(prod_part)
                
            db.commit()

        print("Data generation finished successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error occurred during generation: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    generate_data()
