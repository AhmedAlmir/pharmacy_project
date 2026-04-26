from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Boolean, DECIMAL
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)

    medicines = relationship("Medicine", back_populates="category")

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    phone = Column(String(20))
    address = Column(String(300))
    created_at = Column(DateTime, default=datetime.utcnow)

    sales = relationship("Sale", back_populates="customer")

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    company_name = Column(String(200))
    phone = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)

    purchases = relationship("Purchase", back_populates="supplier")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(50), unique=True, nullable=False, index=True)
    mobile = Column(String(15))
    password = Column(String(100), nullable=False)
    role = Column(String(55), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    sales = relationship("Sale", back_populates="user")

class Medicine(Base):
    __tablename__ = "medicines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False)
    cost_price = Column(DECIMAL(10, 2), nullable=False, default=0)
    sell_price = Column(DECIMAL(10, 2), nullable=False, default=0)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    barcode = Column(String(50))
    min_stock_level = Column(Integer, nullable=False, default=5)
    quantity = Column(Integer, nullable=False, default=0)
    expiry_date = Column(Date) # Legacy field, can be kept for UI simple display
    image_url = Column(String(1000))

    category = relationship("Category", back_populates="medicines")
    batches = relationship("MedicineBatch", back_populates="medicine")
    sale_items = relationship("SaleItem", back_populates="medicine")

class MedicineBatch(Base):
    __tablename__ = "medicine_batches"

    id = Column(Integer, primary_key=True, index=True)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
    batch_number = Column(String(50))
    expiry_date = Column(Date, nullable=False)
    quantity = Column(Integer, nullable=False, default=0)
    cost_price = Column(DECIMAL(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    medicine = relationship("Medicine", back_populates="batches")

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    total_cost = Column(DECIMAL(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    supplier = relationship("Supplier", back_populates="purchases")
    items = relationship("PurchaseItem", back_populates="purchase")

class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    cost_price = Column(DECIMAL(10, 2), nullable=False)

    purchase = relationship("Purchase", back_populates="items")

class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True)
    total_price = Column(DECIMAL(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    payment_method = Column(String(20), nullable=False, default="Cash")
    discount = Column(DECIMAL(10, 2), nullable=False, default=0)

    user = relationship("User", back_populates="sales")
    customer = relationship("Customer", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale")

class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("medicine_batches.id"))
    quantity = Column(Integer, nullable=False)
    sell_price = Column(DECIMAL(10, 2), nullable=False)
    cost_price = Column(DECIMAL(10, 2), nullable=False)

    sale = relationship("Sale", back_populates="items")
    medicine = relationship("Medicine", back_populates="sale_items")

class Return(Base):
    __tablename__ = "returns"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False)
    medicine_id = Column(Integer, ForeignKey("medicines.id"), nullable=False)
    quantity = Column("quantity", Integer, nullable=False)  # DB column is 'quantity'
    refund_amount = Column(DECIMAL(10, 2), nullable=False)
    reason = Column(String(500))
    return_date = Column("return_date", DateTime, default=datetime.utcnow)  # DB column is 'return_date'

    sale = relationship("Sale")
    medicine = relationship("Medicine")
