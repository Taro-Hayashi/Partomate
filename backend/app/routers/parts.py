from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Part, ProductPart, Product
from ..auth import get_current_user
from ..schemas import PartCreate, PartUpdate, PartResponse
from ..llm import get_setting_value
from ..pricing import serialize_part

router = APIRouter(prefix="/api/parts", tags=["parts"])

@router.get("", response_model=List[PartResponse])
def get_parts(
    category1: Optional[str] = None,
    category2: Optional[str] = None,
    category3: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    query = db.query(Part)
    if category1:
        query = query.filter(Part.category1 == category1)
    if category2:
        query = query.filter(Part.category2 == category2)
    if category3:
        query = query.filter(Part.category3 == category3)
    display_currency = get_setting_value(db, "currency") or "JPY"
    return [serialize_part(part, display_currency) for part in query.all()]

@router.post("", response_model=PartResponse, status_code=status.HTTP_201_CREATED)
def create_part(
    part_in: PartCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    db_part = Part(
        name=part_in.name,
        category1=part_in.category1,
        category2=part_in.category2,
        category3=part_in.category3,
        quantity=part_in.quantity,
        unit=part_in.unit,
        purchase_price=part_in.purchase_price,
        currency=part_in.currency,
        purchase_date=part_in.purchase_date,
        price_input_type=part_in.price_input_type,
        purchase_quantity=part_in.purchase_quantity,
        original_unit_price=part_in.original_unit_price if part_in.original_unit_price is not None else part_in.purchase_price,
        original_total_price=part_in.original_total_price,
        original_currency=part_in.original_currency or part_in.currency,
        exchange_rate=part_in.exchange_rate if part_in.exchange_rate is not None else 1.0,
        alert_threshold=part_in.alert_threshold
    )
    db.add(db_part)
    db.commit()
    db.refresh(db_part)
    display_currency = get_setting_value(db, "currency") or "JPY"
    return serialize_part(db_part, display_currency)

@router.get("/{part_id}", response_model=PartResponse)
def get_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Part not found"
        )
    display_currency = get_setting_value(db, "currency") or "JPY"
    return serialize_part(part, display_currency)

@router.put("/{part_id}", response_model=PartResponse)
def update_part(
    part_id: int,
    part_in: PartUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Part not found"
        )
        
    update_data = part_in.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(part, key, value)
    if "original_unit_price" not in update_data and "purchase_price" in update_data:
        part.original_unit_price = part.purchase_price
    if "original_currency" not in update_data and "currency" in update_data:
        part.original_currency = part.currency
        
    db.commit()
    db.refresh(part)
    display_currency = get_setting_value(db, "currency") or "JPY"
    return serialize_part(part, display_currency)

@router.delete("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Part not found"
        )
        
    # Check if the part is referenced in any product recipe
    referenced_products = (
        db.query(Product.name)
        .join(ProductPart, Product.id == ProductPart.product_id)
        .filter(ProductPart.part_id == part_id)
        .all()
    )
    if referenced_products:
        product_names = ", ".join(p_name for (p_name,) in referenced_products if p_name)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete part because it is used in the following product recipe(s): {product_names}"
        )
        
    db.delete(part)
    db.commit()
    return
