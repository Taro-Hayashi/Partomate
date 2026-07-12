import os
import sys
import json
from typing import Optional
from mcp.server.fastmcp import FastMCP

# Ensure the parent directory is in the python path to load app modules correctly
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models import Part, Product, ProductPart
from app.pricing import FALLBACK_RATE_TO_JPY

mcp = FastMCP("Partomate")

@mcp.tool()
def get_parts_list() -> str:
    """Get the list of all parts in the partomate inventory with their quantities, categories, purchase price, and currency."""
    db = SessionLocal()
    try:
        parts = db.query(Part).all()
        result = []
        for p in parts:
            name = " ".join(filter(None, [p.category2, p.category3, p.category1])).strip() or p.name
            result.append(
                f"Part ID: {p.id} | Name: {name} | Qty: {p.quantity} {p.unit} | "
                f"Price: {p.purchase_price} {p.currency} | "
                f"Categories: {p.category1} > {p.category2} > {p.category3}"
            )
        return "\n".join(result) if result else "No parts found in the inventory."
    finally:
        db.close()

@mcp.tool()
def update_part_quantity(part_id: int, quantity_change: float, absolute: bool = False) -> str:
    """Update the quantity of a specific part.
    If absolute is True, sets the quantity to quantity_change directly.
    If absolute is False (default), adds or subtracts quantity_change from the current quantity.
    """
    db = SessionLocal()
    try:
        part = db.query(Part).filter(Part.id == part_id).first()
        if not part:
            return f"Part with ID {part_id} not found."
        
        if absolute:
            part.quantity = quantity_change
        else:
            part.quantity += quantity_change
            
        if part.quantity < 0:
            part.quantity = 0.0
            
        db.commit()
        db.refresh(part)
        name = " ".join(filter(None, [part.category2, part.category3, part.category1])).strip() or part.name
        return f"Successfully updated '{name}' (ID: {part.id}). New quantity: {part.quantity} {part.unit}."
    except Exception as e:
        db.rollback()
        return f"Error updating part quantity: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def get_products() -> str:
    """Get the list of products registered in Partomate including calculated cost and required components."""
    db = SessionLocal()
    try:
        products = db.query(Product).all()
        result = []
        for prod in products:
            parts_list = []
            cost_jpy = 0.0
            for pp in prod.parts:
                part_name = " ".join(filter(None, [pp.part.category2, pp.part.category3, pp.part.category1])).strip() or pp.part.name
                parts_list.append(f"{part_name} (x{pp.quantity})")
                
                # Calculate cost in JPY
                price = pp.part.purchase_price
                price *= FALLBACK_RATE_TO_JPY.get(pp.part.currency, 1.0)
                cost_jpy += price * pp.quantity
                
            parts_str = ", ".join(parts_list) if parts_list else "No parts defined"
            result.append(
                f"Product ID: {prod.id} | Name: {prod.name} | Calculated Cost: {cost_jpy:.2f} JPY | "
                f"Components: {parts_str}"
            )
        return "\n".join(result) if result else "No products found."
    finally:
        db.close()

@mcp.tool()
def create_product(name: str, parts_json: str, description: str = "") -> str:
    """
    Create a new product configuration with required component parts.
    parts_json: A JSON string containing a list of part mappings, e.g., '[{"part_id": 1, "quantity": 4.0}]'
    description: Optional product description.
    """
    db = SessionLocal()
    try:
        # Check if product already exists
        existing = db.query(Product).filter(Product.name == name).first()
        if existing:
            return f"Product '{name}' already exists (ID: {existing.id})."
        
        try:
            parts = json.loads(parts_json)
        except Exception:
            return "Invalid parts_json format. Must be a valid JSON array, e.g., '[{\"part_id\": 1, \"quantity\": 4.0}]'"
            
        new_prod = Product(name=name, description=description)
        db.add(new_prod)
        db.flush() # Get product ID
        
        for p in parts:
            part_id = p.get("part_id")
            qty = p.get("quantity", 0.0)
            
            # Verify part exists
            part = db.query(Part).filter(Part.id == part_id).first()
            if not part:
                raise ValueError(f"Part ID {part_id} does not exist in inventory.")
            
            prod_part = ProductPart(product_id=new_prod.id, part_id=part_id, quantity=qty)
            db.add(prod_part)
            
        db.commit()
        return f"Successfully created product '{name}' (ID: {new_prod.id}) with {len(parts)} component parts."
    except Exception as e:
        db.rollback()
        return f"Error creating product: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def update_product_components(product_id: int, parts_json: str) -> str:
    """
    Update the components of an existing product.
    parts_json: A JSON string containing a list of part mappings, e.g., '[{"part_id": 1, "quantity": 4.0}]'
    """
    db = SessionLocal()
    try:
        # Check if product exists
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return f"Product with ID {product_id} not found."
        
        try:
            parts = json.loads(parts_json)
        except Exception:
            return "Invalid parts_json format. Must be a valid JSON array, e.g., '[{\"part_id\": 1, \"quantity\": 4.0}]'"
            
        # Delete existing component relations
        db.query(ProductPart).filter(ProductPart.product_id == product_id).delete()
        
        # Add new component relations
        for p in parts:
            part_id = p.get("part_id")
            qty = p.get("quantity", 0.0)
            
            # Verify part exists
            part = db.query(Part).filter(Part.id == part_id).first()
            if not part:
                raise ValueError(f"Part ID {part_id} does not exist in inventory.")
            
            prod_part = ProductPart(product_id=product_id, part_id=part_id, quantity=qty)
            db.add(prod_part)
            
        db.commit()
        return f"Successfully updated product components for '{product.name}' (ID: {product.id}) with {len(parts)} component parts."
    except Exception as e:
        db.rollback()
        return f"Error updating product components: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def assemble_product(product_id: int, count: float = 1.0) -> str:
    """
    Assemble a specific product by consuming its component parts from the inventory.
    product_id: The ID of the product to assemble.
    count: The number of product units to assemble (default is 1.0).
    """
    db = SessionLocal()
    try:
        # 1. Find the product
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return f"Product with ID {product_id} not found."
        
        # 2. Check if product has parts
        if not product.parts:
            return f"Product '{product.name}' (ID: {product_id}) has no component parts defined."
        
        # 3. Check stock availability for all parts
        insufficient_parts = []
        for pp in product.parts:
            required_qty = pp.quantity * count
            part = pp.part
            if not part:
                return f"Internal error: Part relation missing for product component associated with part_id {pp.part_id}."
            if part.quantity < required_qty:
                insufficient_parts.append(
                    f"'{part.name}' (ID: {part.id}) - Required: {required_qty} {part.unit}, Available: {part.quantity} {part.unit}"
                )
        
        if insufficient_parts:
            parts_str = "; ".join(insufficient_parts)
            return f"Cannot assemble '{product.name}' due to insufficient stock: {parts_str}"
        
        # 4. Deduct components from stock
        deducted_details = []
        low_stock_alerts = []
        for pp in product.parts:
            required_qty = pp.quantity * count
            part = pp.part
            part.quantity -= required_qty
            deducted_details.append(f"'{part.name}': -{required_qty} {part.unit} (New Qty: {part.quantity} {part.unit})")
            
            # Check alert threshold
            if part.alert_threshold > 0.0 and part.quantity <= part.alert_threshold:
                low_stock_alerts.append(f"'{part.name}' (Qty: {part.quantity} <= Threshold: {part.alert_threshold})")
        
        db.commit()
        details_str = ", ".join(deducted_details)
        alert_str = ""
        if low_stock_alerts:
            alert_str = " WARNING: The following parts are now at or below their alert threshold: " + ", ".join(low_stock_alerts)
            
        return f"Successfully assembled {count} units of '{product.name}' (ID: {product.id}). Component stock deducted: {details_str}.{alert_str}"
    except Exception as e:
        db.rollback()
        return f"Error assembling product: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def set_part_alert_threshold(part_id: int, threshold: float) -> str:
    """
    Set the minimum stock alert threshold for a specific part.
    If threshold is 0.0, the alert is disabled.
    """
    db = SessionLocal()
    try:
        part = db.query(Part).filter(Part.id == part_id).first()
        if not part:
            return f"Part with ID {part_id} not found."
        part.alert_threshold = threshold
        db.commit()
        db.refresh(part)
        name = " ".join(filter(None, [part.category2, part.category3, part.category1])).strip() or part.name
        return f"Successfully set alert threshold for '{name}' (ID: {part.id}) to {threshold} {part.unit}."
    except Exception as e:
        db.rollback()
        return f"Error setting alert threshold: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def get_low_stock_parts() -> str:
    """
    Get the list of parts where the current stock quantity is less than or equal to the alert threshold.
    Parts with an alert threshold of 0.0 (disabled) are excluded.
    """
    db = SessionLocal()
    try:
        parts = db.query(Part).filter(Part.alert_threshold > 0.0, Part.quantity <= Part.alert_threshold).all()
        result = []
        for p in parts:
            name = " ".join(filter(None, [p.category2, p.category3, p.category1])).strip() or p.name
            result.append(
                f"Part ID: {p.id} | Name: {name} | Qty: {p.quantity} {p.unit} | "
                f"Threshold: {p.alert_threshold} {p.unit}"
            )
        return "\n".join(result) if result else "No low stock parts found."
    except Exception as e:
        return f"Error fetching low stock parts: {str(e)}"
    finally:
        db.close()

@mcp.tool()
def create_part(
    name: str,
    category1: str,
    category2: Optional[str] = None,
    category3: Optional[str] = None,
    quantity: float = 0.0,
    unit: str = "pcs",
    purchase_price: float = 0.0,
    currency: str = "JPY",
    purchase_date: Optional[str] = None,
    alert_threshold: float = 0.0
) -> str:
    """
    Create/Register a new part in the inventory.
    If a part with the exact same name and categories (category1, 2, 3) already exists, it updates (adds) the quantity instead of creating a duplicate.
    name: The name of the part (required).
    category1: Major category (required, e.g., 'ネジ', '抵抗').
    category2: Middle category (optional, e.g., 'M3', 'チップ').
    category3: Minor category/size (optional, e.g., '10mm', '10kΩ').
    quantity: Initial quantity (default: 0.0).
    unit: Unit of measurement (default: 'pcs').
    purchase_price: Price per unit (default: 0.0).
    currency: Currency code (default: 'JPY').
    purchase_date: Purchase date in YYYY-MM-DD format (optional).
    alert_threshold: Minimum stock threshold for alerts (default: 0.0, disabled).
    """
    db = SessionLocal()
    try:
        # 1. Validation
        if not name or not name.strip():
            return "Error: Part name is required and cannot be empty."
        if not category1 or not category1.strip():
            return "Error: category1 (major category) is required."
            
        # Clean categories
        name = name.strip()
        cat1 = category1.strip()
        cat2 = category2.strip() if category2 and category2.strip() else None
        cat3 = category3.strip() if category3 and category3.strip() else None
        
        # 2. Check for duplicate (same name + category1 + category2 + category3)
        existing = db.query(Part).filter(
            Part.name == name,
            Part.category1 == cat1,
            Part.category2 == cat2,
            Part.category3 == cat3
        ).first()
        
        if existing:
            # Update (add) quantity
            old_qty = existing.quantity
            existing.quantity += quantity
            # Update other optional fields if provided
            if unit != "pcs":
                existing.unit = unit
            if purchase_price > 0:
                existing.purchase_price = purchase_price
                existing.currency = currency
            if purchase_date:
                existing.purchase_date = purchase_date
            if alert_threshold > 0:
                existing.alert_threshold = alert_threshold
                
            db.commit()
            db.refresh(existing)
            return f"Part '{name}' already exists (ID: {existing.id}) under the same categories. Increased quantity from {old_qty} to {existing.quantity}."
            
        # 3. Create new part
        new_part = Part(
            name=name,
            category1=cat1,
            category2=cat2,
            category3=cat3,
            quantity=quantity,
            unit=unit,
            purchase_price=purchase_price,
            currency=currency,
            purchase_date=purchase_date,
            alert_threshold=alert_threshold
        )
        db.add(new_part)
        db.commit()
        db.refresh(new_part)
        
        fullname = " ".join(filter(None, [cat2, cat3, cat1])).strip() or name
        return f"Successfully registered new part '{fullname}' (ID: {new_part.id}) with initial quantity {quantity} {unit}."
        
    except Exception as e:
        db.rollback()
        return f"Error registering new part: {str(e)}"
    finally:
        db.close()

if __name__ == "__main__":
    mcp.run()
