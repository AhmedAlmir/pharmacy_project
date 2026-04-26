from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal

# --- Categories ---
class CategoryBase(BaseModel):
    name: str

class CategoryCreate(CategoryBase):
    pass

class Category(CategoryBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# --- Customers ---
class CustomerBase(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class Customer(CustomerBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Suppliers ---
class SupplierBase(BaseModel):
    name: str
    company_name: Optional[str] = None
    phone: Optional[str] = None

class SupplierCreate(SupplierBase):
    pass

class Supplier(SupplierBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Users ---
class UserBase(BaseModel):
    name: str
    email: str
    mobile: Optional[str] = None
    role: str

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class User(UserBase):
    id: int
    is_active: bool
    model_config = ConfigDict(from_attributes=True)

# --- Medicine Batches ---
class MedicineBatchBase(BaseModel):
    batch_number: Optional[str] = None
    expiry_date: date
    quantity: int
    cost_price: Decimal

class MedicineBatchCreate(MedicineBatchBase):
    medicine_id: int

class MedicineBatch(MedicineBatchBase):
    id: int
    medicine_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Medicines ---
class MedicineBase(BaseModel):
    name: str
    sell_price: Decimal
    cost_price: Decimal = Decimal('0')
    category_id: int
    barcode: Optional[str] = None
    min_stock_level: int = 5
    quantity: int = 0
    expiry_date: Optional[date] = None
    image_url: Optional[str] = None

class MedicineCreate(MedicineBase):
    pass

class Medicine(MedicineBase):
    id: int
    batches: List[MedicineBatch] = []
    category: Optional[Category] = None
    model_config = ConfigDict(from_attributes=True)


# --- Purchases ---
class PurchaseItemBase(BaseModel):
    medicine_id: int
    quantity: int
    cost_price: Decimal

class PurchaseItemCreate(PurchaseItemBase):
    expiry_date: date

class PurchaseItem(PurchaseItemBase):
    id: int
    purchase_id: int
    model_config = ConfigDict(from_attributes=True)

class PurchaseBase(BaseModel):
    supplier_id: Optional[int] = None
    total_cost: Decimal

class PurchaseCreate(PurchaseBase):
    items: List[PurchaseItemCreate]

class Purchase(PurchaseBase):
    id: int
    created_at: datetime
    items: List[PurchaseItem] = []
    model_config = ConfigDict(from_attributes=True)

# --- Sales ---
class SaleItemBase(BaseModel):
    medicine_id: int
    quantity: int

class SaleItemCreate(SaleItemBase):
    pass

class SaleItem(SaleItemBase):
    id: int
    sale_id: int
    batch_id: Optional[int] = None
    sell_price: Decimal
    cost_price: Decimal
    model_config = ConfigDict(from_attributes=True)

class SaleBase(BaseModel):
    user_id: int
    customer_id: Optional[int] = None
    payment_method: str = "Cash"
    discount: Decimal = Decimal('0')

class SaleCreate(SaleBase):
    items: List[SaleItemCreate]

class Sale(SaleBase):
    id: int
    total_price: Decimal
    created_at: datetime
    items: List[SaleItem] = []
    model_config = ConfigDict(from_attributes=True)

# --- Returns ---
class ReturnBase(BaseModel):
    sale_id: int
    medicine_id: int
    quantity: int
    reason: Optional[str] = None

class ReturnCreate(ReturnBase):
    pass

class Return(ReturnBase):
    id: int
    refund_amount: Decimal
    return_date: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)
