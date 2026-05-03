from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from sqlalchemy.exc import IntegrityError
import backend.models as models
import backend.schemas as schemas
from backend.database import engine, get_db
from datetime import datetime, date
import pytz
from typing import List, Optional
import os
import shutil
import uuid

app = FastAPI(title="Elmer's & Partners Pharmacy API")

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    ext = file.filename.split(".")[-1]
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join("frontend", "images", filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"url": f"/static/images/{filename}"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Timezone converter
CAIRO_TZ = pytz.timezone('Africa/Cairo')
def to_cairo_time(dt: datetime):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = pytz.utc.localize(dt)
    return dt.astimezone(CAIRO_TZ)

# RBAC Dependencies
def get_current_user(x_user_id: int = Header(..., description="ID of the authenticated user"), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == x_user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is disabled")
    return user

def verify_owner(user: models.User = Depends(get_current_user)):
    if user.role.lower() not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Access restricted to Owner/Admin")
    return user

def verify_pharmacist_or_above(user: models.User = Depends(get_current_user)):
    if user.role.lower() not in ["owner", "admin", "pharmacist", "manager"]:
        raise HTTPException(status_code=403, detail="Access restricted")
    return user


# --- AUTHENTICATION ---
@app.post("/api/login", response_model=schemas.User)
def login_user(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == login_data.email).first()
    if not user or user.password != login_data.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    return user

@app.post("/api/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # Assuming only Owner can register, or we leave it open for first user
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    new_user = models.User(**user.model_dump())
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.get("/api/users", response_model=List[schemas.User])
def get_users(db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    return db.query(models.User).all()

@app.put("/api/users/{user_id}/toggle_active", response_model=schemas.User)
def toggle_user_active(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Prevent owner from deactivating themselves
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    # Prevent deactivating other Owner accounts
    if user.role.lower() == "owner":
        raise HTTPException(status_code=400, detail="Owner accounts cannot be deactivated")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return user

@app.put("/api/users/{user_id}", response_model=schemas.User)
def update_user(user_id: int, user_data: schemas.UserBase, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_user.name = user_data.name
    db_user.email = user_data.email
    db_user.mobile = user_data.mobile
    db_user.role = user_data.role
    db.commit()
    db.refresh(db_user)
    return db_user

@app.delete("/api/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.role.lower() == "owner":
        raise HTTPException(status_code=400, detail="Owner accounts cannot be deleted")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")
        
    sales_count = db.query(models.Sale).filter(models.Sale.user_id == user_id).count()
    if sales_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete staff with associated sales. Please deactivate them instead.")
        
    db.delete(db_user)
    db.commit()
    return {"detail": "User deleted"}


# --- MEDICINES & INVENTORY ---
@app.get("/api/categories", response_model=List[schemas.Category])
def get_categories(db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    return db.query(models.Category).all()

@app.get("/api/medicines", response_model=List[schemas.Medicine])
def get_medicines(db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    return db.query(models.Medicine).all()

@app.get("/api/medicines/search", response_model=List[schemas.Medicine])
def search_medicines(q: str, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    query = f"%{q}%"
    return db.query(models.Medicine).filter(
        (models.Medicine.name.ilike(query)) | (models.Medicine.barcode == q)
    ).all()

@app.post("/api/medicines", response_model=schemas.Medicine)
def add_medicine(medicine: schemas.MedicineCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    db_med = models.Medicine(**medicine.model_dump())
    db_med.price = float(medicine.sell_price)  # Keep legacy 'price' column in sync
    db.add(db_med)
    db.commit()
    db.refresh(db_med)
    return db_med

@app.put("/api/medicines/{medicine_id}", response_model=schemas.Medicine)
def update_medicine(medicine_id: int, medicine: schemas.MedicineCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_med = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not db_med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    for key, value in medicine.model_dump(exclude_unset=True).items():
        setattr(db_med, key, value)
    db_med.price = float(medicine.sell_price)  # Keep legacy 'price' column in sync
        
    db.commit()
    db.refresh(db_med)
    return db_med

@app.delete("/api/medicines/{medicine_id}")
def delete_medicine(medicine_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_med = db.query(models.Medicine).filter(models.Medicine.id == medicine_id).first()
    if not db_med:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    # Force delete related records
    db.query(models.MedicineBatch).filter(models.MedicineBatch.medicine_id == medicine_id).delete(synchronize_session=False)
    db.query(models.PurchaseItem).filter(models.PurchaseItem.medicine_id == medicine_id).delete(synchronize_session=False)
    db.query(models.SaleItem).filter(models.SaleItem.medicine_id == medicine_id).delete(synchronize_session=False)
    db.query(models.Return).filter(models.Return.medicine_id == medicine_id).delete(synchronize_session=False)
    
    db.delete(db_med)
    db.commit()
    return {"detail": "Medicine force deleted"}


# --- SUPPLIERS ---
@app.get("/api/suppliers", response_model=List[schemas.Supplier])
def get_suppliers(db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    return db.query(models.Supplier).order_by(models.Supplier.id.desc()).all()

@app.post("/api/suppliers", response_model=schemas.Supplier)
def create_supplier(supplier: schemas.SupplierCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_sup = models.Supplier(**supplier.model_dump())
    db.add(db_sup)
    db.commit()
    db.refresh(db_sup)
    return db_sup

@app.put("/api/suppliers/{supplier_id}", response_model=schemas.Supplier)
def update_supplier(supplier_id: int, supplier: schemas.SupplierCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_sup = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not db_sup:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    db_sup.name = supplier.name
    db_sup.company_name = supplier.company_name
    db_sup.phone = supplier.phone
    db.commit()
    db.refresh(db_sup)
    return db_sup

@app.delete("/api/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    sup = db.query(models.Supplier).filter(models.Supplier.id == supplier_id).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(sup)
    db.commit()
    return {"detail": "Supplier deleted"}


# --- CUSTOMERS ---
@app.get("/api/customers", response_model=List[schemas.Customer])
def get_customers(db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    return db.query(models.Customer).order_by(models.Customer.id.desc()).all()

@app.post("/api/customers", response_model=schemas.Customer)
def create_customer(customer: schemas.CustomerCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    db_cust = models.Customer(**customer.model_dump())
    db.add(db_cust)
    db.commit()
    db.refresh(db_cust)
    return db_cust

@app.put("/api/customers/{customer_id}", response_model=schemas.Customer)
def update_customer(customer_id: int, customer: schemas.CustomerCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    db_cust = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not db_cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    db_cust.name = customer.name
    db_cust.phone = customer.phone
    db_cust.address = customer.address
    db.commit()
    db.refresh(db_cust)
    return db_cust

@app.delete("/api/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_cust = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not db_cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Safe delete: Un-link sales so revenue is not lost
    db.query(models.Sale).filter(models.Sale.customer_id == customer_id).update({"customer_id": None}, synchronize_session=False)
    
    db.delete(db_cust)
    db.commit()
    return {"detail": "Customer deleted successfully"}


# --- CATEGORIES ---
@app.post("/api/categories", response_model=schemas.Category)
def create_category(category: schemas.CategoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    existing = db.query(models.Category).filter(models.Category.name == category.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Classification already exists")
    db_cat = models.Category(**category.model_dump())
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

@app.put("/api/categories/{category_id}", response_model=schemas.Category)
def update_category(category_id: int, category: schemas.CategoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_cat = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    existing = db.query(models.Category).filter(models.Category.name == category.name, models.Category.id != category_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Classification with this name already exists")
        
    db_cat.name = category.name
    db.commit()
    db.refresh(db_cat)
    return db_cat

@app.delete("/api/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    db_cat = db.query(models.Category).filter(models.Category.id == category_id).first()
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Cascade delete medicines in this category
    medicines = db.query(models.Medicine).filter(models.Medicine.category_id == category_id).all()
    for med in medicines:
        db.query(models.MedicineBatch).filter(models.MedicineBatch.medicine_id == med.id).delete(synchronize_session=False)
        db.query(models.PurchaseItem).filter(models.PurchaseItem.medicine_id == med.id).delete(synchronize_session=False)
        db.query(models.SaleItem).filter(models.SaleItem.medicine_id == med.id).delete(synchronize_session=False)
        db.query(models.Return).filter(models.Return.medicine_id == med.id).delete(synchronize_session=False)
        db.delete(med)
        
    db.delete(db_cat)
    db.commit()
    return {"detail": "Category and all associated medicines force deleted"}


# --- PURCHASES (RESTOCK) ---
@app.post("/api/purchases", response_model=schemas.Purchase)
def create_purchase(purchase: schemas.PurchaseCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    db_purchase = models.Purchase(
        supplier_id=purchase.supplier_id,
        total_cost=purchase.total_cost
    )
    db.add(db_purchase)
    db.flush()

    for item in purchase.items:
        # Create Purchase Item
        db_item = models.PurchaseItem(
            purchase_id=db_purchase.id,
            medicine_id=item.medicine_id,
            quantity=item.quantity,
            cost_price=item.cost_price
        )
        db.add(db_item)

        # Update Medicine Base cost_price to new price (or weighted average, depending on business rule, here using latest)
        med = db.query(models.Medicine).filter(models.Medicine.id == item.medicine_id).first()
        if med:
            med.cost_price = item.cost_price
            med.quantity += item.quantity
            
            # Create a New Batch for the purchased items using the provided expiry_date
            batch = models.MedicineBatch(
                medicine_id=item.medicine_id,
                batch_number=f"BATCH-{db_purchase.id}-{item.medicine_id}",
                expiry_date=item.expiry_date,
                quantity=item.quantity,
                cost_price=item.cost_price
            )
            db.add(batch)

    db.commit()
    db.refresh(db_purchase)
    
    # Adjust timezone
    db_purchase.created_at = to_cairo_time(db_purchase.created_at)
    return db_purchase


# --- SALES (CHECKOUT POS) ---

@app.post("/api/sales", response_model=schemas.Sale)
def create_sale(sale: schemas.SaleCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    total_price = 0
    sale_items = []

    for item in sale.items:
        med = db.query(models.Medicine).filter(models.Medicine.id == item.medicine_id).first()
        if not med:
            raise HTTPException(status_code=404, detail=f"Medicine ID {item.medicine_id} not found")
        if med.quantity < item.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {med.name}. Have {med.quantity}, need {item.quantity}")

        remaining_to_deduct = item.quantity
        item_total_cost = 0

        # FIFO Deduction of Batches
        # Get active batches ordered by expiry_date (nearest first)
        batches = db.query(models.MedicineBatch).filter(
            models.MedicineBatch.medicine_id == med.id,
            models.MedicineBatch.quantity > 0
        ).order_by(models.MedicineBatch.expiry_date.asc()).all()

        for batch in batches:
            if remaining_to_deduct <= 0:
                break
            
            deduct = min(batch.quantity, remaining_to_deduct)
            batch.quantity -= deduct
            remaining_to_deduct -= deduct
            
            # Record what was sold from this batch
            sold_from_batch_cost = deduct * batch.cost_price
            
            sale_items.append(models.SaleItem(
                medicine_id=med.id,
                batch_id=batch.id,
                quantity=deduct,
                sell_price=med.sell_price,
                cost_price=batch.cost_price
            ))

            total_price += deduct * med.sell_price

        if remaining_to_deduct > 0:
            # Reached end of batches but still need stock - means medicine.quantity was out of sync with batches.
            # We deduct the rest anyway using base cost_price
            sale_items.append(models.SaleItem(
                medicine_id=med.id,
                batch_id=None,
                quantity=remaining_to_deduct,
                sell_price=med.sell_price,
                cost_price=med.cost_price
            ))
            total_price += remaining_to_deduct * med.sell_price

        # Deduct total from medicine quantity
        med.quantity -= item.quantity

    # Apply discount
    final_total = total_price - sale.discount

    db_sale = models.Sale(
        user_id=current_user.id,
        customer_id=sale.customer_id,
        payment_method=sale.payment_method,
        discount=sale.discount,
        total_price=final_total
    )
    db.add(db_sale)
    db.flush()

    for s_item in sale_items:
        s_item.sale_id = db_sale.id
        db.add(s_item)

    db.commit()
    db.refresh(db_sale)
    db_sale.created_at = to_cairo_time(db_sale.created_at)
    return db_sale


# --- RETURNS ---
@app.post("/api/returns", response_model=schemas.Return)
def process_return(ret: schemas.ReturnCreate, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    sale = db.query(models.Sale).filter(models.Sale.id == ret.sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    s_items = db.query(models.SaleItem).filter(
        models.SaleItem.sale_id == ret.sale_id,
        models.SaleItem.medicine_id == ret.medicine_id
    ).all()

    if not s_items:
        raise HTTPException(status_code=400, detail="Medicine not found in this invoice")

    # simplified logic: we refund based on the total quantity sold in this invoice for this medicine
    total_sold = sum(i.quantity for i in s_items)
    already_returned = db.query(func.sum(models.Return.quantity)).filter(
        models.Return.sale_id == ret.sale_id,
        models.Return.medicine_id == ret.medicine_id
    ).scalar() or 0

    if ret.quantity > (total_sold - already_returned):
        raise HTTPException(status_code=400, detail="Return quantity exceeds allowed non-returned quantity")

    # Restore stock
    med = db.query(models.Medicine).filter(models.Medicine.id == ret.medicine_id).first()
    med.quantity += ret.quantity

    # Restore to the first batch found from sale items
    first_batch_id = s_items[0].batch_id
    if first_batch_id:
        batch = db.query(models.MedicineBatch).filter(models.MedicineBatch.id == first_batch_id).first()
        if batch:
            batch.quantity += ret.quantity

    refund_amount = ret.quantity * s_items[0].sell_price

    db_return = models.Return(
        sale_id=ret.sale_id,
        medicine_id=ret.medicine_id,
        quantity=ret.quantity,
        reason=ret.reason,
        refund_amount=refund_amount
    )
    db.add(db_return)
    db.commit()
    db.refresh(db_return)
    
    if db_return.return_date:
        db_return.return_date = to_cairo_time(db_return.return_date)
    return db_return


# --- DASHBOARD & REPORTS (ADMIN ONLY) ---
@app.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # 1. Total Sales Today
    sales_today = db.query(models.Sale).filter(models.Sale.created_at >= today_start).all()
    num_invoices = len(sales_today)
    total_revenue = sum(float(s.total_price) for s in sales_today)
    total_discount = sum(float(s.discount) for s in sales_today)
    
    # 2. Net Profit & Cost of Goods Sold
    net_profit = 0
    total_cogs = 0
    items_sold_count = {}  # medicine_id -> {name, qty, revenue}
    
    for s in sales_today:
        items_profit = 0
        for item in s.items:
            sell_total = float(item.sell_price) * item.quantity
            cost_total = float(item.cost_price) * item.quantity
            items_profit += sell_total - cost_total
            total_cogs += cost_total
            
            # Track most sold
            mid = item.medicine_id
            if mid not in items_sold_count:
                med = db.query(models.Medicine).filter(models.Medicine.id == mid).first()
                items_sold_count[mid] = {"name": med.name if med else f"ID:{mid}", "qty": 0, "revenue": 0}
            items_sold_count[mid]["qty"] += item.quantity
            items_sold_count[mid]["revenue"] += sell_total
            
        net_profit += (items_profit - float(s.discount))

    # Sort by qty to get top sellers
    top_sellers = sorted(items_sold_count.values(), key=lambda x: x["qty"], reverse=True)[:5]
    total_items_sold = sum(v["qty"] for v in items_sold_count.values())

    # 3. Smart Alerts
    low_stock = db.query(models.Medicine).filter(models.Medicine.quantity <= models.Medicine.min_stock_level).all()
    
    # Expiry in 1 month
    next_month = date.today().replace(month=(date.today().month % 12) + 1)
    expiring_soon = db.query(models.MedicineBatch).filter(
        models.MedicineBatch.expiry_date <= next_month,
        models.MedicineBatch.quantity > 0
    ).all()

    # Get recent sales (last 10) with pharmacist details and items
    recent_sales = db.query(models.Sale).order_by(models.Sale.created_at.desc()).limit(10).all()
    recent_sales_data = []
    for s in recent_sales:
        items_detail = []
        for item in s.items:
            med = db.query(models.Medicine).filter(models.Medicine.id == item.medicine_id).first()
            items_detail.append({
                "medicine_name": med.name if med else f"ID:{item.medicine_id}",
                "quantity": item.quantity,
                "sell_price": float(item.sell_price),
                "subtotal": float(item.sell_price) * item.quantity
            })
        recent_sales_data.append({
            "id": s.id,
            "total_price": float(s.total_price),
            "discount": float(s.discount),
            "payment_method": s.payment_method or "cash",
            "pharmacist": s.user.name if s.user else "Unknown",
            "time": to_cairo_time(s.created_at).strftime("%I:%M %p") if s.created_at else "",
            "date": to_cairo_time(s.created_at).strftime("%Y-%m-%d") if s.created_at else "",
            "items": items_detail
        })

    # Get recent returns
    recent_returns = db.query(models.Return).order_by(models.Return.return_date.desc()).limit(10).all()
    recent_returns_data = []
    for r in recent_returns:
        med = db.query(models.Medicine).filter(models.Medicine.id == r.medicine_id).first()
        recent_returns_data.append({
            "id": r.id,
            "sale_id": r.sale_id,
            "medicine_name": med.name if med else f"ID:{r.medicine_id}",
            "quantity": r.quantity,
            "refund_amount": float(r.refund_amount),
            "reason": r.reason or "",
            "date": to_cairo_time(r.return_date).strftime("%Y-%m-%d %I:%M %p") if r.return_date else ""
        })

    return {
        "revenue_today": total_revenue,
        "profit_today": net_profit,
        "invoices_today": num_invoices,
        "total_items_sold": total_items_sold,
        "total_discount": total_discount,
        "cost_of_goods": total_cogs,
        "top_sellers": top_sellers,
        "recent_sales": recent_sales_data,
        "recent_returns": recent_returns_data,
        "alerts": {
            "low_stock": [schemas.Medicine.model_validate(m) for m in low_stock],
            "expiring_soon": [schemas.MedicineBatch.model_validate(b) for b in expiring_soon]
        }
    }

@app.get("/api/dashboard/reports")
def get_dashboard_reports(db: Session = Depends(get_db), current_user: models.User = Depends(verify_owner)):
    # Daily reports for current month
    current_date = datetime.utcnow()
    daily_sales = db.query(
        extract('day', models.Sale.created_at).label('day'),
        func.sum(models.Sale.total_price).label('total')
    ).filter(
        extract('year', models.Sale.created_at) == current_date.year,
        extract('month', models.Sale.created_at) == current_date.month
    ).group_by(extract('day', models.Sale.created_at)).all()

    # Monthly reports for current year
    monthly_sales = db.query(
        extract('month', models.Sale.created_at).label('month'),
        func.sum(models.Sale.total_price).label('total')
    ).filter(
        extract('year', models.Sale.created_at) == current_date.year
    ).group_by(extract('month', models.Sale.created_at)).all()

    daily_data = [{"day": int(r.day), "revenue": float(r.total)} for r in daily_sales]
    monthly_data = [{"month": int(r.month), "revenue": float(r.total)} for r in monthly_sales]

    return {
        "daily": daily_data,
        "monthly": monthly_data
    }

@app.get("/api/sales/{sale_id}")
def get_sale_details(sale_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(verify_pharmacist_or_above)):
    sale = db.query(models.Sale).filter(models.Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    items_detail = []
    for item in sale.items:
        med = db.query(models.Medicine).filter(models.Medicine.id == item.medicine_id).first()
        items_detail.append({
            "medicine_id": item.medicine_id,
            "medicine_name": med.name if med else f"ID:{item.medicine_id}",
            "quantity": item.quantity,
            "sell_price": float(item.sell_price),
            "subtotal": float(item.sell_price) * item.quantity
        })
    
    returns = db.query(models.Return).filter(models.Return.sale_id == sale_id).all()
    returns_detail = []
    for r in returns:
        med = db.query(models.Medicine).filter(models.Medicine.id == r.medicine_id).first()
        returns_detail.append({
            "id": r.id,
            "medicine_id": r.medicine_id,
            "medicine_name": med.name if med else f"ID:{r.medicine_id}",
            "quantity": r.quantity,
            "refund_amount": float(r.refund_amount),
            "reason": r.reason or "",
            "date": to_cairo_time(r.return_date).strftime("%Y-%m-%d %I:%M %p") if r.return_date else ""
        })

    return {
        "id": sale.id,
        "total_price": float(sale.total_price),
        "discount": float(sale.discount),
        "payment_method": sale.payment_method or "cash",
        "pharmacist": sale.user.name if sale.user else "Unknown",
        "customer": sale.customer.name if sale.customer else "Walk-in",
        "date": to_cairo_time(sale.created_at).strftime("%Y-%m-%d %I:%M %p") if sale.created_at else "",
        "items": items_detail,
        "returns": returns_detail
    }

# Fallback for old static
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
def home():
    return FileResponse("frontend/index.html")
