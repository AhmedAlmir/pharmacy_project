from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import backend.models as models
import backend.schemas as schemas
from backend.database import engine, get_db

# This assumes tables are already created or will be manually created in SQL Server using your script.
# We won't call Base.metadata.create_all(bind=engine) since you have a specific DB creation script.

app = FastAPI(title="Pharmacy Internal API")

# Add CORS so our Vite frontend can communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with specific frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the static HTML frontend
app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
def home():
    return FileResponse("frontend/index.html")

# --- Medicine Endpoints ---
@app.get("/api/medicines", response_model=list[schemas.Medicine])
def get_medicines(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    medicines = db.query(models.Medicine).order_by(models.Medicine.id).offset(skip).limit(limit).all()
    return medicines

@app.post("/api/medicines", response_model=schemas.Medicine)
def create_medicine(medicine: schemas.MedicineCreate, db: Session = Depends(get_db)):
    db_medicine = models.Medicine(**medicine.model_dump())
    db.add(db_medicine)
    db.commit()
    db.refresh(db_medicine)
    return db_medicine

# --- Additional core endpoints (Sales, Users) ---

@app.get("/api/users", response_model=list[schemas.User])
def get_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    users = db.query(models.User).order_by(models.User.id).offset(skip).limit(limit).all()
    return users

@app.post("/api/register", response_model=schemas.User)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = models.User(
        name=user.name,
        email=user.email,
        mobile=user.mobile,
        role=user.role,
        password=user.password
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/api/login", response_model=schemas.User)
def login_user(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == login_data.email).first()
    if not db_user or db_user.password != login_data.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return db_user

@app.post("/api/sales", response_model=schemas.Sale)
def create_sale(sale: schemas.SaleCreate, db: Session = Depends(get_db)):
    # 1. Create the sale record
    # Calculate total price by verifying each medicine's price from DB
    total_price = 0
    sale_items = []

    for item in sale.items:
        medicine = db.query(models.Medicine).filter(models.Medicine.id == item.medicine_id).first()
        if not medicine:
            raise HTTPException(status_code=404, detail=f"Medicine {item.medicine_id} not found")
        if medicine.quantity < item.quantity:
            raise HTTPException(status_code=400, detail=f"Not enough stock for medicine {medicine.name}")
        
        # Deduct stock
        medicine.quantity -= item.quantity
        
        # Calculate cost
        item_cost = medicine.price * item.quantity
        total_price += item_cost
        
        sale_items.append(
            models.SaleItem(
                medicine_id=medicine.id,
                quantity=item.quantity,
                price=medicine.price
            )
        )

    # 2. Save Sale
    db_sale = models.Sale(
        user_id=sale.user_id,
        total_price=total_price,
        items=sale_items
    )
    
    db.add(db_sale)
    db.commit()
    db.refresh(db_sale)
    return db_sale

@app.get("/api/sales", response_model=list[schemas.Sale])
def get_sales(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    sales = db.query(models.Sale).order_by(models.Sale.id).offset(skip).limit(limit).all()
    return sales
