import os
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()
url = os.getenv("DATABASE_URL")
print("Connecting to:", url)
try:
    engine = create_engine(url)
    connection = engine.connect()
    print("Success")
    connection.close()
except Exception as e:
    print("Error:", e)
