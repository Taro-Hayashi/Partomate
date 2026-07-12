import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)  # admin, user
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Part(Base):
    __tablename__ = "parts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    category1 = Column(String, index=True, nullable=True)
    category2 = Column(String, index=True, nullable=True)
    category3 = Column(String, index=True, nullable=True)
    quantity = Column(Float, default=0.0, nullable=False)  # Supports decimal quantity (meters, volume)
    unit = Column(String, default="pcs", nullable=False)    # e.g., pcs, m, ml
    purchase_price = Column(Float, default=0.0, nullable=False)
    currency = Column(String, default="JPY", nullable=False) # e.g., JPY, USD, EUR
    purchase_date = Column(String, nullable=True)           # YYYY-MM-DD
    price_input_type = Column(String, default="unit", nullable=False) # unit, total
    purchase_quantity = Column(Float, nullable=True)
    original_unit_price = Column(Float, nullable=True)
    original_total_price = Column(Float, nullable=True)
    original_currency = Column(String, nullable=True)
    exchange_rate = Column(Float, nullable=True)
    alert_threshold = Column(Float, default=0.0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Product(Base):
    __tablename__ = "products"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    parts = relationship("ProductPart", back_populates="product", cascade="all, delete-orphan")

class ProductPart(Base):
    __tablename__ = "product_parts"
    
    product_id = Column(Integer, ForeignKey("products.id"), primary_key=True)
    part_id = Column(Integer, ForeignKey("parts.id"), primary_key=True)
    quantity = Column(Float, nullable=False)
    
    product = relationship("Product", back_populates="parts")
    part = relationship("Part")

class ExchangeRate(Base):
    __tablename__ = "exchange_rates"
    
    currency = Column(String, primary_key=True, index=True)  # JPY, USD, EUR, etc.
    rate_to_jpy = Column(Float, default=1.0, nullable=False)
    
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Setting(Base):
    __tablename__ = "settings"
    
    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=True)
