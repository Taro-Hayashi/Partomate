from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from ..database import get_db
from ..models import Product, ProductPart, Part
from ..auth import get_current_user
from ..schemas import ProductCreate, ProductUpdate, ProductResponse
from ..llm import get_setting_value
from ..pricing import serialize_product

router = APIRouter(prefix="/api/products", tags=["products"])


def aggregate_product_parts(parts):
    aggregated = {}
    for part_item in parts:
        aggregated[part_item.part_id] = aggregated.get(part_item.part_id, 0.0) + part_item.quantity
    return aggregated.items()

@router.get("", response_model=List[ProductResponse])
def get_products(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # Fetch all products along with their mapped parts using eager loading
    products = db.query(Product).options(
        joinedload(Product.parts).joinedload(ProductPart.part)
    ).all()
    display_currency = get_setting_value(db, "currency") or "JPY"
    return [serialize_product(product, display_currency) for product in products]

@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    existing = db.query(Product).filter(Product.name == product_in.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product name already exists."
        )
    
    db_product = Product(
        name=product_in.name,
        description=product_in.description
    )
    db.add(db_product)
    db.commit()
    db.refresh(db_product)

    # Insert associated recipe parts
    for part_id, quantity in aggregate_product_parts(product_in.parts):
        part_exists = db.query(Part).filter(Part.id == part_id).first()
        if not part_exists:
            # Rollback creation of product
            db.delete(db_product)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Part with id {part_id} does not exist."
            )
        
        db_prod_part = ProductPart(
            product_id=db_product.id,
            part_id=part_id,
            quantity=quantity
        )
        db.add(db_prod_part)
    
    db.commit()
    # Return eagerly loaded product
    return get_product(product_id=db_product.id, db=db, current_user=current_user)

@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    product = db.query(Product).options(
        joinedload(Product.parts).joinedload(ProductPart.part)
    ).filter(Product.id == product_id).first()
    
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found"
        )
    display_currency = get_setting_value(db, "currency") or "JPY"
    return serialize_product(product, display_currency)

@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_in: ProductUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found"
        )

    # Update basic fields
    if product_in.name is not None:
        existing = db.query(Product).filter(Product.name == product_in.name, Product.id != product_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Product name already exists."
            )
        product.name = product_in.name
    
    if product_in.description is not None:
        product.description = product_in.description

    # Update associated parts relationships
    if product_in.parts is not None:
        # Delete old relations
        db.query(ProductPart).filter(ProductPart.product_id == product_id).delete()
        
        # Write new relations
        for part_id, quantity in aggregate_product_parts(product_in.parts):
            part_exists = db.query(Part).filter(Part.id == part_id).first()
            if not part_exists:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Part with id {part_id} does not exist."
                )
            
            db_prod_part = ProductPart(
                product_id=product_id,
                part_id=part_id,
                quantity=quantity
            )
            db.add(db_prod_part)

    db.commit()
    
    # Reload and return eagerly loaded object
    return get_product(product_id=product_id, db=db, current_user=current_user)

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found"
        )
    db.delete(product)
    db.commit()
    return
