import os
import sys
from unittest.mock import patch, AsyncMock

# Append project root to PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set environment variable to use a temp database in /tmp for testing
os.environ["DATABASE_URL"] = "sqlite:////tmp/partomate_test.db"

# Ensure a SECRET_KEY is present before importing the app (required at import time)
os.environ.setdefault("SECRET_KEY", "test-secret-key")

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import engine, Base

client = TestClient(app)

def test_flow():
    # Clean database for clean testing environment
    engine.dispose()
    for ext in ["", "-wal", "-shm"]:
        db_file = f"/tmp/partomate_test.db{ext}"
        if os.path.exists(db_file):
            try:
                os.remove(db_file)
            except Exception:
                pass
    Base.metadata.create_all(bind=engine)

    # 1. Root endpoint test
    response = client.get("/")
    assert response.status_code == 200
    assert "Welcome" in response.json()["message"]
    print("✓ Root endpoint working")

    # 2. Setup Admin
    setup_data = {
        "username": "admin",
        "password": "adminpassword"
    }
    response = client.post("/api/auth/setup", json=setup_data)
    assert response.status_code == 200
    assert response.json()["username"] == "admin"
    assert response.json()["role"] == "admin"
    print("✓ Setup admin user working")

    # 3. Block double Setup
    response = client.post("/api/auth/setup", json=setup_data)
    assert response.status_code == 400
    print("✓ Duplicate setup blocked working")

    # 4. Login
    login_data = {
        "username": "admin",
        "password": "adminpassword"
    }
    response = client.post("/api/auth/login", data=login_data)
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    token = token_data["access_token"]
    print("✓ Login and token retrieval working")

    headers = {"Authorization": f"Bearer {token}"}

    # 5. Create Part
    part_data = {
        "name": "ネジ M2 8mm",
        "category1": "ネジ",
        "category2": "M2",
        "category3": "8mm",
        "quantity": 1000.5,
        "unit": "pcs",
        "purchase_price": 5.0,
        "currency": "JPY",
        "purchase_date": "2026-06-15"
    }
    response = client.post("/api/parts", json=part_data, headers=headers)
    assert response.status_code == 201
    part_id = response.json()["id"]
    assert response.json()["name"] == "ネジ M2 8mm"
    assert response.json()["quantity"] == 1000.5
    print("✓ Part creation working")

    # 6. Retrieve Parts
    response = client.get("/api/parts", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    print("✓ Get parts working")

    # 7. Update Part
    update_data = {
        "quantity": 950.0
    }
    response = client.put(f"/api/parts/{part_id}", json=update_data, headers=headers)
    assert response.status_code == 200
    assert response.json()["quantity"] == 950.0
    print("✓ Part update working")

    # 10. Create Product
    product_data = {
        "name": "商品A",
        "description": "お試し商品",
        "parts": [
            {
                "part_id": part_id,
                "quantity": 4.0
            },
            {
                "part_id": part_id,
                "quantity": 1.5
            }
        ]
    }
    response = client.post("/api/products", json=product_data, headers=headers)
    assert response.status_code == 201
    product_id = response.json()["id"]
    assert response.json()["name"] == "商品A"
    assert len(response.json()["parts"]) == 1
    assert response.json()["parts"][0]["quantity"] == 5.5
    assert response.json()["parts"][0]["part"]["id"] == part_id
    print("✓ Product creation working")

    # 11. Retrieve Products
    response = client.get("/api/products", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["parts"][0]["part"]["name"] == "ネジ M2 8mm"
    print("✓ Get products working")

    # 12. Update Product
    product_update = {
        "description": "更新されたお試し商品",
        "parts": [
            {
                "part_id": part_id,
                "quantity": 1.25
            },
            {
                "part_id": part_id,
                "quantity": 0.75
            }
        ]
    }
    response = client.put(f"/api/products/{product_id}", json=product_update, headers=headers)
    assert response.status_code == 200
    assert response.json()["description"] == "更新されたお試し商品"
    assert response.json()["parts"][0]["quantity"] == 2.0
    print("✓ Product update working")

    # 13. Delete Product
    response = client.delete(f"/api/products/{product_id}", headers=headers)
    assert response.status_code == 204
    print("✓ Delete product working")

    # 13.5. Chat product recipe must not create inventory parts for unresolved names
    response = client.post(
        "/api/chat/execute",
        json={
            "type": "product_recipe",
            "action": "create",
            "product_name": "チャット商品",
            "description": None,
            "parts": [
                {"part_id": part_id, "part_name": "ネジ M2 8mm", "quantity": 2.0},
                {"part_id": part_id, "part_name": "ネジ M2 8mm", "quantity": 1.0},
                {"part_id": None, "part_name": "存在しない部品", "quantity": 1.0},
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert len(response.json()["product"]["parts"]) == 1
    assert response.json()["product"]["parts"][0]["part_id"] == part_id
    assert response.json()["product"]["parts"][0]["quantity"] == 3.0

    response = client.get("/api/parts", headers=headers)

    # 13.6 Chat execution messages follow the selected UI language
    response = client.post(
        "/api/settings",
        json={"language": "en"},
        headers=headers,
    )
    assert response.status_code == 200

    response = client.post(
        "/api/chat/execute",
        json={"type": "settings", "updates": {"currency": "JPY"}},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "System settings updated."

    response = client.post(
        "/api/chat/execute",
        json={
            "type": "parts",
            "action": "add",
            "items": [
                {
                    "part_id": part_id,
                    "category1": "ネジ",
                    "category2": "M2",
                    "category3": "8mm",
                    "quantity": 1,
                    "unit": "pcs",
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Inventory updated."
    assert response.status_code == 200
    assert all(part["name"] != "存在しない部品" for part in response.json())

    response = client.get("/api/products", headers=headers)
    assert response.status_code == 200
    chat_product = next(product for product in response.json() if product["name"] == "チャット商品")
    assert len(chat_product["parts"]) == 1
    assert chat_product["parts"][0]["quantity"] == 3.0

    response = client.post(
        "/api/chat/execute",
        json={
            "type": "product_recipe",
            "action": "update",
            "product_name": "チャット商品2",
            "description": "似た名前の別商品",
            "parts": [
                {"part_id": part_id, "part_name": "ネジ M2 8mm", "quantity": 4.0},
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200

    response = client.get("/api/products", headers=headers)
    assert response.status_code == 200
    products_by_name = {product["name"]: product for product in response.json()}
    assert "チャット商品" in products_by_name
    assert "チャット商品2" in products_by_name
    assert products_by_name["チャット商品"]["parts"][0]["quantity"] == 3.0
    assert products_by_name["チャット商品2"]["parts"][0]["quantity"] == 4.0

    response = client.post(
        "/api/chat/execute",
        json={
            "type": "product_recipe",
            "action": "create",
            "product_name": "チャット商品2",
            "description": None,
            "parts": [{"part_id": part_id, "quantity": 1.0}],
        },
        headers=headers,
    )
    assert response.status_code == 400

    response = client.delete(f"/api/products/{products_by_name['チャット商品2']['id']}", headers=headers)
    assert response.status_code == 204
    response = client.delete(f"/api/products/{chat_product['id']}", headers=headers)
    assert response.status_code == 204
    print("✓ Chat product recipe skips unresolved part names and avoids fuzzy overwrites")

    # 14. Get Settings
    response = client.get("/api/settings", headers=headers)
    assert response.status_code == 200
    assert response.json()["llm_provider"] == "openai"
    print("✓ Get settings working")

    # 15. Update Settings
    response = client.post("/api/settings", json={"llm_model": "test-model-123"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["llm_model"] == "test-model-123"
    print("✓ Update settings working")

    response = client.post(
        "/api/settings",
        json={"background_image_mode": "checks", "background_check_size": "64"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["background_image_mode"] == "checks"
    assert response.json()["background_check_size"] == "64"
    response = client.get("/api/settings", headers=headers)
    assert response.status_code == 200
    assert response.json()["background_image_mode"] == "checks"
    assert response.json()["background_check_size"] == "64"
    print("✓ Background image mode settings persist")

    # 15.5. Prompt default/custom mode is stored independently from prompt text
    custom_prompt = "custom parts prompt"
    response = client.post(
        "/api/settings",
        json={
            "system_prompt_parts_ja": custom_prompt,
            "system_prompt_parts_ja_mode": "custom",
        },
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["system_prompt_modes"]["parts"]["ja"] == "custom"
    assert response.json()["system_prompts"]["parts"]["ja"] == custom_prompt

    response = client.post(
        "/api/settings",
        json={"system_prompt_parts_ja_mode": "default"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["system_prompt_modes"]["parts"]["ja"] == "default"
    assert (
        response.json()["system_prompts"]["parts"]["ja"]
        == response.json()["default_system_prompts"]["parts"]["ja"]
    )
    assert response.json()["system_prompt_parts_ja"] == custom_prompt
    print("✓ Prompt default/custom mode working")

    with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
        response = client.post(
            "/api/settings/models",
            json={"provider": "openai_api", "url": ""},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["models"][:2] == ["gpt-5.4-mini", "gpt-5.4-nano"]

        response = client.post(
            "/api/settings",
            json={"openai_api_key": "sk-test-secret"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["openai_api_key"] == ""
        assert response.json()["openai_api_key_configured"] is True
        assert response.json()["openai_api_key_source"] == "stored"
        assert "sk-test-secret" not in str(response.json())
    print("✓ OpenAI API key masking and fallback models working")

    # 16. Chat Analyze is skipped while LLM settings are off
    response = client.post("/api/settings", json={"llm_enabled": "false"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["llm_enabled"] == "false"
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        response = client.post("/api/chat/analyze", json={"message": "抵抗を200個追加して"}, headers=headers)
        assert response.status_code == 200
        assert response.json()["type"] == "message"
        assert "AI（LLM）設定がオフ" in response.json()["message"]
        mock_analyze.assert_not_called()
    response = client.post("/api/settings", json={"llm_enabled": "true"}, headers=headers)
    assert response.status_code == 200
    print("✓ Chat analyze is skipped when LLM is disabled")

    # 16.1. Chat Analyze (with Mock)
    mock_response = {
        "type": "parts",
        "action": "add",
        "items": [
            {
                "category1": "抵抗",
                "category2": "チップ",
                "category3": "10kΩ",
                "quantity": 200.0,
                "unit": "pcs",
                "purchase_price": 2.5,
                "currency": "JPY"
            }
        ]
    }
    
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = mock_response
        response = client.post("/api/chat/analyze", json={"message": "抵抗を200個追加して"}, headers=headers)
        assert response.status_code == 200
        assert response.json()["type"] == "parts"
        assert response.json()["items"][0]["quantity"] == 200.0
    print("✓ Chat analyze (mocked) working")

    # 16.5. Chat edit resolves exact parts and preserves unknown categories
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = {
            "type": "parts",
            "action": "edit",
            "items": [{
                "category1": "ネジ",
                "category2": "M2",
                "category3": "8mm",
                "quantity": 0.0,
            }],
        }
        response = client.post("/api/chat/analyze", json={"message": "M2 8mmのネジを編集"}, headers=headers)
        assert response.status_code == 200
        edit_item = response.json()["items"][0]
        assert edit_item["part_id"] == part_id
        assert edit_item["quantity"] == 950.0
        assert edit_item["purchase_price"] == 5.0

        mock_analyze.return_value = {
            "type": "parts",
            "action": "edit",
            "items": [{
                "category1": "ネジ",
                "category2": "M3",
                "category3": "12mm",
                "quantity": 0.0,
            }],
        }
        response = client.post("/api/chat/analyze", json={"message": "M3 12mmのネジを編集"}, headers=headers)
        assert response.status_code == 200
        new_edit_item = response.json()["items"][0]
        assert new_edit_item["part_id"] is None
        assert new_edit_item["category1"] == "ネジ"
        assert new_edit_item["category2"] == "M3"
        assert new_edit_item["category3"] == "12mm"
        assert new_edit_item["quantity"] == 0.0
        assert new_edit_item["purchase_price"] == 0.0
    print("✓ Chat edit resolves existing and new part forms")

    # 16.6. Legacy price actions and incomplete LLM JSON are normalized
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = {
            "type": "parts",
            "action": "update_metadata",
            "items": [{"category1": "未登録価格対象"}],
        }
        response = client.post("/api/chat/analyze", json={"message": "ネジの単価を変更"}, headers=headers)
        assert response.status_code == 200
        normalized = response.json()
        assert normalized["action"] == "price"
        assert normalized["items"][0] == {
            "category1": "未登録価格対象",
            "category2": None,
            "category3": None,
            "quantity": 0.0,
            "purchase_price": 0.0,
            "total_price": None,
            "currency": None,
            "purchase_date": None,
        }
    print("✓ Incomplete price JSON is normalized")

    # 16.7. Flat edit responses are normalized to parts/edit
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = {
            "type": "edit",
            "items": [{
                "category1": "ネジ",
                "category2": "M2",
                "category3": "8mm",
            }],
        }
        response = client.post("/api/chat/analyze", json={"message": "M2 8mm ネジ部品情報の編集"}, headers=headers)
        assert response.status_code == 200
        normalized_edit = response.json()
        assert normalized_edit["type"] == "parts"
        assert normalized_edit["action"] == "edit"
        assert normalized_edit["items"][0]["part_id"] == part_id
        assert normalized_edit["items"][0]["quantity"] == 950.0
    print("✓ Flat edit JSON is normalized")

    # 16.8. Edit responses without items recover explicit categories from the message
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.return_value = {"type": "edit"}
        response = client.post("/api/chat/analyze", json={"message": "ネジの編集"}, headers=headers)
        assert response.status_code == 200
        recovered_edit = response.json()
        assert recovered_edit["type"] == "parts"
        assert recovered_edit["action"] == "edit"
        assert recovered_edit["items"][0]["part_id"] is None
        assert recovered_edit["items"][0]["category1"] == "ネジ"
        assert recovered_edit["items"][0]["category2"] is None
        assert recovered_edit["items"][0]["category3"] is None
        assert recovered_edit["items"][0]["quantity"] == 0.0
    print("✓ Item-less edit JSON recovers explicit categories")

    # 17. Chat Execute (Parts Add)
    execute_payload = mock_response
    response = client.post("/api/chat/execute", json=execute_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Verify new parts created via chat
    response = client.get("/api/parts", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) == 2
    new_part = next(p for p in response.json() if "抵抗" in p["name"])
    assert new_part["name"] == "チップ 10kΩ 抵抗"
    assert new_part["quantity"] == 200.0
    print("✓ Chat execute (add parts) working")

    # 17.5. Direct unit price without a date clears the stored purchase date
    response = client.put(
        f"/api/parts/{new_part['id']}",
        json={"purchase_date": "2026-06-15"},
        headers=headers,
    )
    assert response.status_code == 200
    response = client.post(
        "/api/chat/execute",
        json={
            "type": "parts",
            "action": "price",
            "items": [
                {
                    "part_id": new_part["id"],
                    "category1": "抵抗",
                    "category2": "チップ",
                    "category3": "10kΩ",
                    "quantity": 200.0,
                    "unit": "pcs",
                    "purchase_price": 465.0,
                    "tempUnitPrice": 3.0,
                    "inputCurrency": "USD",
                    "exchangeRate": 155.0,
                    "purchase_date": None,
                    "isTotalInput": False,
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    response = client.get(f"/api/parts/{new_part['id']}", headers=headers)
    assert response.status_code == 200
    assert response.json()["purchase_date"] is None
    assert response.json()["purchase_price"] == 3.0
    assert response.json()["currency"] == "USD"
    print("✓ Direct unit price without purchase date clears stored date")

    # 17.6. Stock operations must not overwrite total-price metadata
    response = client.post(
        "/api/parts",
        json={
            "name": "総額テスト部品",
            "category1": "総額テスト",
            "category2": "標準",
            "category3": "A",
            "quantity": 10.0,
            "unit": "pcs",
            "purchase_price": 20.0,
            "currency": "JPY",
            "purchase_date": "2026-06-01",
            "price_input_type": "total",
            "purchase_quantity": 10.0,
            "original_unit_price": 20.0,
            "original_total_price": 200.0,
            "original_currency": "JPY",
            "exchange_rate": 1.0,
        },
        headers=headers,
    )
    assert response.status_code == 201
    total_part_id = response.json()["id"]

    response = client.post(
        "/api/chat/execute",
        json={
            "type": "parts",
            "action": "consume",
            "items": [
                {
                    "part_id": total_part_id,
                    "category1": "総額テスト",
                    "category2": "標準",
                    "category3": "A",
                    "quantity": 1.0,
                    "unit": "pcs",
                    "purchase_price": 0.0,
                    "tempUnitPrice": 0.0,
                    "inputCurrency": "JPY",
                    "exchangeRate": 1.0,
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    response = client.get(f"/api/parts/{total_part_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["quantity"] == 9.0
    assert response.json()["price_input_type"] == "total"
    assert response.json()["purchase_quantity"] == 10.0
    assert response.json()["original_total_price"] == 200.0
    assert response.json()["purchase_price"] == 20.0

    response = client.post(
        "/api/chat/execute",
        json={
            "type": "parts",
            "action": "price",
            "items": [
                {
                    "part_id": total_part_id,
                    "category1": "総額テスト",
                    "category2": "標準",
                    "category3": "A",
                    "quantity": 0.0,
                    "unit": "pcs",
                    "purchase_price": 0.0,
                    "tempTotalCost": 300.0,
                    "inputCurrency": "JPY",
                    "purchase_date": "2026-06-02",
                    "isTotalInput": True,
                }
            ],
        },
        headers=headers,
    )
    assert response.status_code == 200
    response = client.get(f"/api/parts/{total_part_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["price_input_type"] == "total"
    assert response.json()["purchase_quantity"] == 10.0
    assert response.json()["original_total_price"] == 300.0
    assert response.json()["purchase_price"] == 30.0

    response = client.put(
        f"/api/parts/{total_part_id}",
        json={"quantity": 5.0, "purchase_quantity": 10.0},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["quantity"] == 5.0
    assert response.json()["purchase_quantity"] == 10.0
    assert response.json()["purchase_price"] == 30.0
    print("✓ Stock changes preserve total-price purchase metadata")

    # 18. Chat Execute (Product Consume)
    response = client.get("/api/parts", headers=headers)
    assert response.status_code == 200
    screw_part = next(p for p in response.json() if "ネジ" in p["name"])
    screw_id = screw_part["id"]
    
    prod_data = {
        "name": "商品B",
        "description": "消費テスト用",
        "parts": [
            {
                "part_id": screw_id,
                "quantity": 10.0
            }
        ]
    }
    response = client.post("/api/products", json=prod_data, headers=headers)
    assert response.status_code == 201
    
    # Execute consume product via chat simulation
    product_consume_payload = {
        "type": "product",
        "action": "consume",
        "product_name": "商品B",
        "product_count": 5.0
    }
    response = client.post("/api/chat/execute", json=product_consume_payload, headers=headers)
    assert response.status_code == 200
    
    # Verify quantity decremented: 950.0 - (10.0 * 5) = 900.0
    response = client.get("/api/parts", headers=headers)
    updated_screw = next(p for p in response.json() if p["id"] == screw_id)
    assert updated_screw["quantity"] == 900.0
    print("✓ Chat execute (consume product recipe) working")
    
    # 18.5. Chat Execute (Multiple Products Consume)
    # Get the resistance part ID
    response = client.get("/api/parts", headers=headers)
    res_part = next(p for p in response.json() if "抵抗" in p["name"])
    res_id = res_part["id"]
    
    # We already have "商品B" which uses 10.0 screws. Let's create "商品C" which uses 5.0 screws and 2.0 resistance.
    prod_c_data = {
        "name": "商品C",
        "description": "複数消費テスト用",
        "parts": [
            {
                "part_id": screw_id,
                "quantity": 5.0
            },
            {
                "part_id": res_id,
                "quantity": 2.0
            }
        ]
    }
    response = client.post("/api/products", json=prod_c_data, headers=headers)
    assert response.status_code == 201
    
    # Execute multiple consume products via chat simulation
    multiple_product_consume_payload = {
        "type": "product",
        "action": "consume",
        "items": [
            {
                "product_name": "商品B",
                "product_count": 2.0  # consumes 2.0 * 10 = 20 screws
            },
            {
                "product_name": "商品C",
                "product_count": 5.0  # consumes 5.0 * 5 = 25 screws, 5 * 2 = 10 resistance
            }
        ]
    }
    response = client.post("/api/chat/execute", json=multiple_product_consume_payload, headers=headers)
    assert response.status_code == 200
    
    # Verify quantities:
    # screw: 900.0 - 20 (from B) - 25 (from C) = 855.0
    # resistance: 200.0 - 10 (from C) = 190.0
    response = client.get("/api/parts", headers=headers)
    updated_screw = next(p for p in response.json() if p["id"] == screw_id)
    updated_res = next(p for p in response.json() if p["id"] == res_id)
    assert updated_screw["quantity"] == 855.0
    assert updated_res["quantity"] == 190.0
    print("✓ Chat execute (multiple product recipes consume) working")

    print("\nAll backend integration tests passed successfully!")

def test_rag_and_tool_call():
    from backend.app.database import get_db
    from backend.app.models import Part, Setting
    db = next(get_db())

    # 1. Verify reasoning model parsing with <think> tag
    from backend.app.llm import parse_robust_json
    reasoning_text = "<think>Here is some chain of thought reasoning...\nLet's return a JSON.</think>\n```json\n{\"type\": \"message\", \"message\": \"Hello\"}\n```"
    parsed_res = parse_robust_json(reasoning_text)
    assert parsed_res["type"] == "message"
    assert parsed_res["message"] == "Hello"
    print("✓ Reasoning model <think> parsing working successfully")

    # 2. Verify that chat analyze and execute logic successfully handle float/int values in category fields
    from backend.app.routers.chat import find_closest_part
    # Direct function test with float/int
    part_obj, ratio = find_closest_part(db, "ネジ", None, 100.0)
    print("✓ find_closest_part handles float/int arguments successfully")

    # API test for chat_execute with float/int categories in payload simulation
    login_data = {
        "username": "admin",
        "password": "adminpassword"
    }
    response = client.post("/api/auth/login", data=login_data)
    token = response.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    execute_payload_with_numbers = {
        "type": "parts",
        "action": "add",
        "items": [
            {
                "category1": "テストネジ数",
                "category2": None,
                "category3": 100.0,
                "quantity": 10.0,
                "purchase_price": 0.0
            }
        ]
    }
    response = client.post("/api/chat/execute", json=execute_payload_with_numbers, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    print("✓ chat_execute handles float/int categories successfully")

    # Clean up test records
    db.query(Part).filter(Part.category1 == "テストネジ数").delete(synchronize_session=False)
    db.commit()

    # Test: chat_execute with part_id but mismatched categories should ignore part_id and create a new part
    # First, create a base part
    base_part = Part(
        name="ベース部品",
        category1="既存種類",
        category2="既存規格",
        category3="既存サイズ",
        quantity=5.0,
        unit="pcs"
    )
    db.add(base_part)
    db.commit()
    db.refresh(base_part)
    base_part_id = base_part.id

    # Execute payload with mismatched categories but same part_id
    mismatched_payload = {
        "type": "parts",
        "action": "add",
        "items": [
            {
                "part_id": base_part_id,
                "category1": "新規種類",
                "category2": None,
                "category3": None,
                "quantity": 10.0,
                "purchase_price": 0.0
            }
        ]
    }
    response = client.post("/api/chat/execute", json=mismatched_payload, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Verify that the original part was NOT updated
    db.refresh(base_part)
    assert base_part.quantity == 5.0 # should remain 5.0

    # Verify that a new part with "新規種類" was created instead
    new_part = db.query(Part).filter(Part.category1 == "新規種類").first()
    assert new_part is not None
    assert new_part.quantity == 10.0

    # Clean up test records
    db.delete(base_part)
    if new_part:
        db.delete(new_part)
    db.commit()
    print("✓ chat_execute ignores part_id and creates new part when categories do not match")

    # 3. Verify tool_call recursive backend execution
    from unittest.mock import patch, AsyncMock
    mock_responses = [
        {"type": "tool_call", "tool": "get_parts_list", "args": {"category2": "M2"}},
        {"type": "message", "message": "ネジ M2 8mmの在庫は900個あります"}
    ]
    
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = mock_responses
        response = client.post(
            "/api/chat/analyze", 
            json={"message": "M2ネジの在庫は？", "mode": "chat"}, 
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["type"] == "message"
        assert "900個" in response.json()["message"]
        assert mock_analyze.call_count == 2
        
        # Verify tool output was injected as extra_context
        second_call_kwargs = mock_analyze.call_args_list[1][1]
        assert "extra_context" in second_call_kwargs
        assert "M2" in second_call_kwargs["extra_context"]
        
    print("✓ chat_analyze recursively resolves tool_call successfully")

    # 4. Verify tool_call fallback logic (when LLM returns tool_call twice)
    mock_responses_fallback = [
        {"type": "tool_call", "tool": "get_parts_list", "args": {"category2": "M2"}},
        {"type": "tool_call", "tool": "get_parts_list", "args": {"category2": "M2"}}
    ]
    
    with patch("backend.app.routers.chat.analyze_message", new_callable=AsyncMock) as mock_analyze:
        mock_analyze.side_effect = mock_responses_fallback
        response = client.post(
            "/api/chat/analyze", 
            json={"message": "M2ネジの在庫は？", "mode": "chat"}, 
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["type"] == "message"
        assert "データベースを検索した結果" in response.json()["message"]
        
    print("✓ chat_analyze resolves tool_call fallback successfully")

    # 5. Verify system_prompt auto-migration incorporates the current prompt rule
    db.query(Setting).filter(Setting.key == "system_prompt").delete()
    db.commit()
    response = client.get("/api/settings", headers=auth_headers)
    assert response.status_code == 200
    prompt_val = response.json()["system_prompt"]
    assert "handyman2" in prompt_val
    assert "Cannonball 1" in prompt_val
    assert "iPhone111" not in prompt_val
    assert response.json()["system_prompt_version"] == "19"
    print("✓ system_prompt auto-migration with current prompt rule verified")

    # 6. Verify that chat_execute handles null quantity and purchase_price safely
    execute_payload_with_nulls = {
        "type": "parts",
        "action": "price",
        "items": [
            {
                "category1": "テスト用ネジ",
                "category2": None,
                "category3": None,
                "quantity": None,
                "purchase_price": None
            }
        ]
    }
    response = client.post("/api/chat/execute", json=execute_payload_with_nulls, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    db.query(Part).filter(Part.category1 == "テスト用ネジ").delete(synchronize_session=False)
    db.commit()
    print("✓ chat_execute handles null quantity and purchase_price successfully")

    # 7. Verify part delete restrictions
    # Create a temporary part
    temp_part_data = {
        "name": "一時テスト部品",
        "category1": "テスト",
        "category2": "Temp",
        "category3": "Part",
        "quantity": 10.0,
        "unit": "pcs",
        "purchase_price": 100.0,
        "currency": "JPY"
    }
    response = client.post("/api/parts", json=temp_part_data, headers=auth_headers)
    assert response.status_code == 201
    temp_part_id = response.json()["id"]

    # Create a product recipe that uses this part
    temp_product_data = {
        "name": "一時テスト商品",
        "description": "テスト用",
        "parts": [{"part_id": temp_part_id, "quantity": 1.0}]
    }
    response = client.post("/api/products", json=temp_product_data, headers=auth_headers)
    assert response.status_code == 201
    temp_product_id = response.json()["id"]

    # Try to delete the part (should fail because it's in use)
    response = client.delete(f"/api/parts/{temp_part_id}", headers=auth_headers)
    assert response.status_code == 400
    assert "used in the following" in response.json()["detail"]

    # Clean up product first
    response = client.delete(f"/api/products/{temp_product_id}", headers=auth_headers)
    assert response.status_code == 204

    # Now deleting the part should succeed
    response = client.delete(f"/api/parts/{temp_part_id}", headers=auth_headers)
    assert response.status_code == 204
    print("✓ part deletion restrictions and cascade safety verified successfully")

    print("✓ RAG and Tool Call integration tests passed successfully!")

def _get_admin_headers():
    """Ensure an admin exists and return auth headers. Safe to call after
    test_flow (which creates the admin) or standalone."""
    setup_data = {"username": "admin", "password": "adminpassword"}
    client.post("/api/auth/setup", json=setup_data)  # ignore if already set up
    response = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "adminpassword"},
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_desktop_config(tmp_path):
    import json as _json

    data_dir = str(tmp_path)
    config_path = os.path.join(data_dir, "config.json")
    saved = os.environ.get("PARTOMATE_DATA_DIR")

    try:
        headers = _get_admin_headers()

        # Not in desktop mode: env var unset -> both endpoints 404
        os.environ.pop("PARTOMATE_DATA_DIR", None)
        response = client.get("/api/desktop/config", headers=headers)
        assert response.status_code == 404
        response = client.put(
            "/api/desktop/config", json={"external_access": True}, headers=headers
        )
        assert response.status_code == 404
        print("✓ Desktop config 404 when PARTOMATE_DATA_DIR unset")

        # Enter desktop mode. No config.json yet -> external_access is False.
        os.environ["PARTOMATE_DATA_DIR"] = data_dir
        response = client.get("/api/desktop/config", headers=headers)
        assert response.status_code == 200
        assert response.json()["external_access"] is False
        print("✓ Desktop config GET defaults to external_access=false")

        # Seed a config.json with an unrelated key to verify it is preserved.
        with open(config_path, "w", encoding="utf-8") as f:
            _json.dump({"host": "127.0.0.1", "port": 18000}, f)

        # Enable external access: host becomes 0.0.0.0, port preserved.
        response = client.put(
            "/api/desktop/config", json={"external_access": True}, headers=headers
        )
        assert response.status_code == 200
        assert response.json()["external_access"] is True
        with open(config_path, "r", encoding="utf-8") as f:
            written = _json.load(f)
        assert written["host"] == "0.0.0.0"
        assert written["port"] == 18000  # unrelated key preserved
        # GET now reports external access.
        assert client.get("/api/desktop/config", headers=headers).json()["external_access"] is True
        print("✓ Desktop config PUT true sets host=0.0.0.0 and preserves port")

        # Disable again: host back to loopback, still preserving port.
        response = client.put(
            "/api/desktop/config", json={"external_access": False}, headers=headers
        )
        assert response.status_code == 200
        assert response.json()["external_access"] is False
        with open(config_path, "r", encoding="utf-8") as f:
            written = _json.load(f)
        assert written["host"] == "127.0.0.1"
        assert written["port"] == 18000
        print("✓ Desktop config PUT false sets host=127.0.0.1")

        # Unauthenticated requests are rejected before the 404 check.
        response = client.get("/api/desktop/config")
        assert response.status_code == 401
        response = client.put("/api/desktop/config", json={"external_access": True})
        assert response.status_code == 401
        print("✓ Desktop config requires authentication")
    finally:
        if saved is None:
            os.environ.pop("PARTOMATE_DATA_DIR", None)
        else:
            os.environ["PARTOMATE_DATA_DIR"] = saved

    print("✓ Desktop config tests passed successfully!")

def test_setup_language_initialization():
    # Fresh DB so /api/auth/setup can run again
    engine.dispose()
    for ext in ["", "-wal", "-shm"]:
        db_file = f"/tmp/partomate_test.db{ext}"
        if os.path.exists(db_file):
            try:
                os.remove(db_file)
            except Exception:
                pass
    Base.metadata.create_all(bind=engine)

    response = client.post("/api/auth/setup", json={
        "username": "admin",
        "password": "adminpassword",
        "language": "en",
    })
    assert response.status_code == 200

    response = client.post("/api/auth/login", data={
        "username": "admin",
        "password": "adminpassword",
    })
    assert response.status_code == 200
    headers = {"Authorization": f"Bearer {response.json()['access_token']}"}

    response = client.get("/api/settings", headers=headers)
    assert response.status_code == 200
    assert response.json()["language"] == "en"
    print("✓ Setup initializes language from client")

if __name__ == "__main__":
    test_flow()
    test_rag_and_tool_call()
    import tempfile
    with tempfile.TemporaryDirectory() as _d:
        test_desktop_config(_d)
    test_setup_language_initialization()
