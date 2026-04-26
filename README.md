# Pharmacy Management System

## Overview

This is a backend system for managing pharmacy operations, built using FastAPI and SQL Server.
The system is designed to handle medicines, users, and sales in a structured and scalable way.

---

## Features

* Manage medicines (create, update, delete, list)
* Manage users
* Sales system with invoice generation
* Automatic total price calculation
* Automatic stock updates after each sale
* RESTful API ready to integrate with any frontend

---

## Technologies

* Python
* FastAPI
* SQL Server
* SQLAlchemy (ORM)
* Pydantic (Data Validation)
* Uvicorn

---

## Database Structure

* Users
* Medicines
* Sales
* SaleItems

---

## Relationships

* One User can create multiple Sales
* Each Sale contains multiple SaleItems
* Each SaleItem is linked to one Medicine

---

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment variables

Create a `.env` file and add:

```env
DATABASE_URL=your_database_connection_string
```

### 3. Run the server

```bash
uvicorn backend.main:app --reload
```

---

## API Access

* Base URL:

```
http://127.0.0.1:8000
```

* API Documentation:

```
http://127.0.0.1:8000/docs
```

---

## Project Structure

```
pharmacy_project/
│
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│
├── frontend/
│
├── .env
├── requirements.txt
└── README.md
```

---

## Notes

* Do not upload the `.env` file to GitHub
* Use password hashing in production
* Authentication (JWT) can be added later

---

## Future Improvements

* Authentication and Authorization (JWT)
* Sales dashboard and analytics
* Expiry date notifications
* PDF invoice generation
* Deployment to a production server

---

## Author

Ahmed Elmer
