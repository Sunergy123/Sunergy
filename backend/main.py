# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from database import Base, engine
import models

from routers.auth import router as auth_router
from routers.site import router as site_router
from routers.visualize import router as visualize_router
from routers.train import router as train_router
from routers.predict import router as predict_router
from routers.realtime import router as realtime_router
from routers.physics import router as physics_router
from routers import solar

Base.metadata.create_all(bind=engine)


# ── 冪等補欄位：舊 DB 沒有 site.capacity_kwp 時自動加上 ──
def _ensure_columns():
    try:
        insp = inspect(engine)
        cols = {c["name"] for c in insp.get_columns("site")}
        if "capacity_kwp" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE site ADD COLUMN capacity_kwp FLOAT"))
            print("[migrate] added column site.capacity_kwp")
    except Exception as e:
        print(f"[migrate] capacity_kwp check failed: {e}")

_ensure_columns()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(site_router)
app.include_router(visualize_router)
app.include_router(train_router)
app.include_router(predict_router)
app.include_router(realtime_router)
app.include_router(physics_router)
app.include_router(solar.router)

@app.get("/")
def root():
    return {"message": "Backend running!"}