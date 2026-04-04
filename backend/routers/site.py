# routers/site.py
from fastapi import APIRouter, UploadFile, File, Query, HTTPException, Depends
from sqlalchemy.orm import Session
from io import BytesIO
import pandas as pd
import re
import time

from database import get_db
from models import User, Site, SiteData, AfterData, TrainedModel, Upload
from schemas import CreateSite, UpdateSite

router = APIRouter(prefix="/site", tags=["Site"])


# =========================
#  案場列表
# =========================
@router.get("/list")
def list_sites(user_id: int, db: Session = Depends(get_db)):
    sites = (
        db.query(Site)
        .filter(Site.user_id == user_id)
        .order_by(Site.created_at.desc())
        .all()
    )

    return [
        {
            "site_id": s.site_id,
            "site_code": s.site_code,
            "site_name": s.site_name,
            "location": s.location,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "user_id": s.user_id,
        }
        for s in sites
    ]


# =========================
#  建立案場
# =========================
@router.post("/create")
def create_site(payload: CreateSite, db: Session = Depends(get_db)):

    # ✅ 1. 欄位完整性檢查（避免空字串）
    if not payload.site_code or not payload.site_name or not payload.location:
        raise HTTPException(
            status_code=400,
            detail="請完整填寫案場代號、案場名稱與地點"
        )

    # ✅ 2. 確認使用者存在
    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="使用者不存在")

    # ✅ 3. 檢查「同一使用者 + 案場代號」是否重複
    exists = (
        db.query(Site)
        .filter(
            Site.user_id == payload.user_id,
            Site.site_code == payload.site_code
        )
        .first()
    )

    if exists:
        raise HTTPException(
            status_code=400,
            detail="此案場代號已被建立"
        )

    # ✅ 4. 建立案場
    new_site = Site(
        site_code=payload.site_code,
        site_name=payload.site_name,
        location=payload.location,
        user_id=payload.user_id,
    )

    db.add(new_site)
    db.commit()
    db.refresh(new_site)

    return {
        "message": "案場建立成功",
        "site_id": new_site.site_id
    }

# =========================
#  上傳資料（重點）
# =========================
@router.post("/upload-data")
async def upload_site_data(
    site_id: int = Query(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    # 1️⃣ 檢查 site 是否存在
    site = db.query(Site).filter(Site.site_id == site_id).first()
    if not site:
        raise HTTPException(status_code=400, detail="site_id 不存在")
    
    # 2️⃣ 讀檔前
    filename = file.filename.lower()

    if not (filename.endswith(".csv") or filename.endswith(".xlsx")):
        raise HTTPException(
            status_code=400,
            detail="檔案格式錯誤，請上傳.xlsx或.csv格式檔案"
        )

    # 2️⃣ 讀檔
    content = await file.read()
    bio = BytesIO(content)

    try:
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(bio)
        else:
            df = pd.read_excel(bio)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"檔案解析失敗: {e}")

    # =========================
    # 3️⃣ 欄位辨識（保留原始欄位）
    # =========================
    original_columns = list(df.columns)  # ✅ 原始欄位（完全不動）

    def normalize(col: str) -> str:
        return re.sub(r"[^a-z0-9]", "", col.lower())

    normalized_map = {normalize(c): c for c in df.columns}

    def find_column(keyword: str):
        for norm, original in normalized_map.items():
            if keyword in norm:
                return original
        return None

    date_col = find_column("date")
    hour_col = find_column("hour")
    gi_col   = find_column("gi")
    tm_col   = find_column("tm")
    eac_col  = find_column("eac")

    missing = []
    if not date_col: missing.append("date")
    if not hour_col: missing.append("hour")
    if not gi_col:   missing.append("gi")
    if not tm_col:   missing.append("tm")
    if not eac_col:  missing.append("eac")

    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"檔案未含必要欄位（缺少: {', '.join(missing)}）"
        )

    # =========================
    # 4️⃣ rename 成系統內部欄位
    # =========================
    df = df.rename(
        columns={
            date_col: "the_date",
            hour_col: "the_hour",
            gi_col: "gi",
            tm_col: "tm",
            eac_col: "eac",
        }
    )

    new_upload = Upload(
        file_name=file.filename,
        site_id=site_id
    )

    db.add(new_upload)
    db.commit()
    db.refresh(new_upload)

    upload_id = new_upload.upload_id
    
    # 5️⃣ 日期轉換
    try:
        df["the_date"] = pd.to_datetime(df["the_date"], errors="raise").dt.date
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="the_date 欄位無法轉換為日期格式 (YYYY-MM-DD)",
        )

    # =========================
    # 6️⃣ 建立 ORM 物件（hour 安全解析）
    # =========================
    entries = []

    for idx, row in df.iterrows():
        raw_hour = row["the_hour"]

        if isinstance(raw_hour, (int, float)):
            hour = int(raw_hour)
        elif isinstance(raw_hour, str):
            try:
                hour = int(raw_hour.split(":")[0])
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail=f"第 {idx+1} 列 hour 格式錯誤，收到: {raw_hour}",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"第 {idx+1} 列 hour 型態錯誤，收到: {raw_hour}",
            )

        if not (0 <= hour <= 23):
            raise HTTPException(
                status_code=400,
                detail=f"第 {idx+1} 列 hour 必須介於 0~23，收到: {hour}",
            )

        entry = SiteData(
            site_id=site_id,
            upload_id=upload_id,
            the_date=row["the_date"],
            the_hour=hour,
            gi=float(row["gi"]),
            tm=float(row["tm"]),
            eac=float(row["eac"]),
            data_name=file.filename,
        )
        entries.append(entry)

    # 7️⃣ 一次寫入
    db.add_all(entries)
    db.commit()
    db.refresh(entries[0])

    # =========================
    # 8️⃣ 回傳（🔥 重點在這）
    # =========================
    return {
        "message": "上傳成功",
        "rows": len(entries),
        "site_id": site_id,
        "data_id": entries[0].data_id,
        "upload_id": upload_id,
        "file_name": file.filename,

        # ✅ 原始欄位（你要顯示的）
        "original_features": original_columns,

        # ✅ 系統實際使用欄位
        "features": ["the_date", "the_hour", "gi", "tm", "eac"],
    }


# =========================
#  更新案場
# =========================
# =========================
#  更新案場
# =========================
@router.put("/{site_id}")
def update_site(site_id: int, payload: UpdateSite, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.site_id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="site not found")

    # ✅ 如果有傳 site_code，才檢查重複
    if payload.site_code and payload.site_code != site.site_code:
        exists = (
            db.query(Site)
            .filter(
                Site.user_id == site.user_id,
                Site.site_code == payload.site_code,
                Site.site_id != site.site_id   # 🔥 排除自己
            )
            .first()
        )

        if exists:
            raise HTTPException(
                status_code=400,
                detail="該案場代號已存在，請使用其他代號"
            )

    # ✅ 只更新有傳的欄位
    if payload.site_code is not None:
        site.site_code = payload.site_code

    if payload.site_name is not None:
        site.site_name = payload.site_name

    if payload.location is not None:
        site.location = payload.location

    db.commit()
    db.refresh(site)

    return {
        "message": "site updated",
        "site_id": site.site_id
    }


# =========================
#  刪除案場
# =========================
@router.delete("/{site_id}")
def delete_site(site_id: int, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.site_id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="找不到案場資料")

    try:
        # (A) 刪除 TrainedModel（用 join）
        models = (
            db.query(TrainedModel)
            .outerjoin(AfterData, TrainedModel.after_id == AfterData.after_id)
            .outerjoin(SiteData, TrainedModel.upload_id == SiteData.upload_id)
            .filter(
                (AfterData.site_id == site_id) |
                (SiteData.site_id == site_id)
            )
            .all()
        )
        for m in models:
            db.delete(m)

        # (B) 刪 AfterData
        db.query(AfterData).filter(AfterData.site_id == site_id).delete()

        # (C) 刪 SiteData
        db.query(SiteData).filter(SiteData.site_id == site_id).delete()

        # (D) 刪 Site
        db.delete(site)

        db.commit()

        return {
            "message": "案場及其所有關聯數據已成功刪除",
            "site_id": site_id
        }

    except Exception as e:
        db.rollback()
        print(f"刪除案場時發生錯誤: {str(e)}")
        raise HTTPException(status_code=500, detail=f"伺服器內部錯誤: {str(e)}")