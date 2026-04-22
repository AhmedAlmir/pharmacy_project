from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, date

class MedicineBase(BaseModel):
    name: str
    category: Optional[str] = None
    price: float
    quantity: int
    expiry_date: Optional[date] = None

class MedicineCreate(MedicineBase):
    pass

class Medicine(MedicineBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

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
    model_config = ConfigDict(from_attributes=True)

class SaleItemBase(BaseModel):
    medicine_id: int
    quantity: int
    price: float

class SaleItemCreate(SaleItemBase):
    pass

class SaleItem(SaleItemBase):
    id: int
    sale_id: int
    model_config = ConfigDict(from_attributes=True)

class SaleBase(BaseModel):
    total_price: float
    user_id: int

class SaleCreate(BaseModel):
    user_id: int
    items: List[SaleItemCreate]

class Sale(SaleBase):
    id: int
    created_at: datetime
    items: List[SaleItem] = []
    model_config = ConfigDict(from_attributes=True)
