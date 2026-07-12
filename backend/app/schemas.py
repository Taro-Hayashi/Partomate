from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# Auth Schemas
class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str
    role: Optional[str] = "user"  # "admin" or "user"
    # Initial UI language detected from the setup client's browser (setup only)
    language: Optional[str] = None

class UserResponse(UserBase):
    id: int
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: str

# Part Schemas
class PartBase(BaseModel):
    name: str
    category1: Optional[str] = None
    category2: Optional[str] = None
    category3: Optional[str] = None
    quantity: float = 0.0
    unit: str = "pcs"
    purchase_price: float = 0.0
    currency: str = "JPY"
    purchase_date: Optional[str] = None
    price_input_type: str = "unit"
    purchase_quantity: Optional[float] = None
    original_unit_price: Optional[float] = None
    original_total_price: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    alert_threshold: float = 0.0

class PartCreate(PartBase):
    pass

class PartUpdate(BaseModel):
    name: Optional[str] = None
    category1: Optional[str] = None
    category2: Optional[str] = None
    category3: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    purchase_price: Optional[float] = None
    currency: Optional[str] = None
    purchase_date: Optional[str] = None
    price_input_type: Optional[str] = None
    purchase_quantity: Optional[float] = None
    original_unit_price: Optional[float] = None
    original_total_price: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate: Optional[float] = None
    alert_threshold: Optional[float] = None

class PartResponse(PartBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ProductPart Schemas
class ProductPartCreate(BaseModel):
    part_id: int
    quantity: float

class ProductPartResponse(BaseModel):
    part_id: int
    quantity: float
    part: Optional[PartResponse] = None

    class Config:
        from_attributes = True

# Product Schemas
class ProductBase(BaseModel):
    name: str
    description: Optional[str] = None

class ProductCreate(ProductBase):
    parts: List[ProductPartCreate] = []

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parts: Optional[List[ProductPartCreate]] = None

class ProductResponse(ProductBase):
    id: int
    parts: List[ProductPartResponse]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Desktop Schemas
class DesktopConfig(BaseModel):
    external_access: bool
