# routers/physics.py
# 物理式光電估算：P ≈ (GI/1000) × kWp × PR × η_T(TM)
# 用於 (1) 預測（無歷史資料的新案場 / 與 ML 比對） (2) 訓練前合理性檢查
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from database import get_db
from models import Site, SiteData, Upload


router = APIRouter(prefix="/physics", tags=["Physics"])


# ═══════════════════════════════════════
#  核心公式
# ═══════════════════════════════════════
DEFAULT_PR = 0.80          # Performance Ratio 預設
DEFAULT_GAMMA = -0.004     # 晶矽板溫度係數 (1/°C)
T_REF = 25.0               # 標準測試溫度

def compute_physics_eac(
    gi: float,
    tm: Optional[float],
    kwp: float,
    pr: float = DEFAULT_PR,
    gamma: float = DEFAULT_GAMMA,
) -> float:
    """以 GI(W/m²)、TM(°C)、案場容量 kWp 估算單小時 EAC (kWh)。"""
    if gi is None or gi < 0:
        return 0.0
    if kwp is None or kwp <= 0:
        return 0.0
    eta_T = 1.0
    if tm is not None:
        eta_T = 1.0 + gamma * (float(tm) - T_REF)
        if eta_T < 0.5:
            eta_T = 0.5
    val = (float(gi) / 1000.0) * float(kwp) * float(pr) * eta_T
    return max(val, 0.0)


# ═══════════════════════════════════════
#  Sanity-check：訓練前資料合理性檢查
# ═══════════════════════════════════════
class SanityCheckRequest(BaseModel):
    upload_id: int
    capacity_kwp: Optional[float] = None   # 不傳就讀 site.capacity_kwp
    pr: Optional[float] = DEFAULT_PR


@router.post("/sanity-check")
def sanity_check(payload: SanityCheckRequest, db: Session = Depends(get_db)):
    upload = db.query(Upload).filter(Upload.upload_id == payload.upload_id).first()
    if not upload:
        raise HTTPException(404, f"upload_id={payload.upload_id} 不存在")

    site = db.query(Site).filter(Site.site_id == upload.site_id).first()
    if not site:
        raise HTTPException(404, "案場不存在")

    kwp = payload.capacity_kwp if payload.capacity_kwp is not None else site.capacity_kwp
    if kwp is None or kwp <= 0:
        raise HTTPException(
            400,
            "案場尚未設定裝置容量 (kWp)，無法執行合理性檢查。請先到「案場管理」填入容量。",
        )

    pr = payload.pr if payload.pr is not None else DEFAULT_PR

    rows = (
        db.query(SiteData)
        .filter(SiteData.upload_id == payload.upload_id)
        .order_by(SiteData.the_date, SiteData.the_hour)
        .all()
    )
    if not rows:
        raise HTTPException(400, "此筆上傳沒有任何資料列")

    # 物理上限（最佳條件，PR=1）作為「不可能超過」的天花板
    flagged: List[dict] = []
    n_total = len(rows)
    n_high_gi_zero = 0       # GI 高但 EAC≈0
    n_exceeds_max = 0        # EAC 超過物理上限
    n_negative_eac = 0       # EAC < 0
    n_severely_low = 0       # 白天 GI 充足但 EAC 顯著低於物理估算
    sum_residual = 0.0
    sum_abs_residual = 0.0
    sum_actual = 0.0
    sum_predicted = 0.0
    n_with_pred = 0
    scatter: List[dict] = []  # 給前端畫散佈圖（GI vs EAC vs expected）

    for r in rows:
        gi = r.gi if r.gi is not None else 0.0
        tm = r.tm
        actual = r.eac if r.eac is not None else 0.0
        expected = compute_physics_eac(gi, tm, kwp, pr=pr)
        max_possible = compute_physics_eac(gi, tm, kwp, pr=1.0)  # PR=1 視為理論上限

        residual = actual - expected
        sum_predicted += expected
        sum_actual += actual
        sum_residual += residual
        sum_abs_residual += abs(residual)
        n_with_pred += 1

        flag_reasons = []
        if actual < 0:
            n_negative_eac += 1
            flag_reasons.append("負值 EAC")
        if gi > 200 and actual <= max(0.05 * expected, 0.01):
            n_high_gi_zero += 1
            flag_reasons.append("高日照但發電≈0")
        if max_possible > 0 and actual > max_possible * 1.10:  # 10% 容差
            n_exceeds_max += 1
            flag_reasons.append("超過物理上限")
        # 「顯著偏低」：白天且實際 < 估算 × 0.4
        if gi > 300 and expected > 0 and actual < expected * 0.4 and "高日照但發電≈0" not in flag_reasons:
            n_severely_low += 1
            flag_reasons.append("發電顯著低於估算")

        if flag_reasons:
            flagged.append({
                "the_date": r.the_date.isoformat() if r.the_date else None,
                "the_hour": r.the_hour,
                "gi": round(float(gi), 2),
                "tm": round(float(tm), 2) if tm is not None else None,
                "eac": round(float(actual), 4),
                "expected": round(expected, 4),
                "max_possible": round(max_possible, 4),
                "reasons": flag_reasons,
            })

        # 散佈圖取樣（最多 800 點）
        if len(scatter) < 800:
            scatter.append({
                "gi": round(float(gi), 2),
                "actual": round(float(actual), 4),
                "expected": round(expected, 4),
            })

    n_flagged = len(flagged)
    flag_rate = round(n_flagged / n_total * 100, 2) if n_total > 0 else 0.0

    # WMAPE：以「白天且 actual>0」為基準
    sum_abs_err_day = 0.0
    sum_abs_act_day = 0.0
    for r in rows:
        if r.gi is not None and r.gi > 100 and r.eac is not None and r.eac > 0:
            exp = compute_physics_eac(r.gi, r.tm, kwp, pr=pr)
            sum_abs_err_day += abs(r.eac - exp)
            sum_abs_act_day += abs(r.eac)
    wmape = round(sum_abs_err_day / sum_abs_act_day * 100, 2) if sum_abs_act_day > 0 else None

    # 結論訊息
    if flag_rate <= 3.0:
        verdict = "looks_good"
        verdict_msg = "資料整體合理，可以進入訓練"
    elif flag_rate <= 15.0:
        verdict = "minor_issues"
        verdict_msg = "資料大致合理，但有少量可疑列，建議檢視"
    else:
        verdict = "suspicious"
        verdict_msg = "可疑資料比例偏高，建議檢查感測器/單位/時間對齊後再訓練"

    return {
        "upload_id": payload.upload_id,
        "site_id": upload.site_id,
        "site_name": site.site_name,
        "capacity_kwp": kwp,
        "pr": pr,
        "n_total": n_total,
        "n_flagged": n_flagged,
        "flag_rate": flag_rate,
        "wmape_vs_physics": wmape,
        "summary": {
            "negative_eac": n_negative_eac,
            "high_gi_zero_eac": n_high_gi_zero,
            "exceeds_max": n_exceeds_max,
            "severely_low": n_severely_low,
        },
        "verdict": verdict,
        "verdict_msg": verdict_msg,
        "flagged_rows": flagged[:200],   # 最多回 200 筆，避免 payload 過大
        "scatter": scatter,
    }


# ═══════════════════════════════════════
#  輕量端點：單點估算（前端做即時 preview 用）
# ═══════════════════════════════════════
class PointEstimateRequest(BaseModel):
    gi: float
    tm: Optional[float] = None
    capacity_kwp: float
    pr: Optional[float] = DEFAULT_PR


@router.post("/estimate")
def estimate(payload: PointEstimateRequest):
    val = compute_physics_eac(
        payload.gi, payload.tm, payload.capacity_kwp,
        pr=payload.pr if payload.pr is not None else DEFAULT_PR,
    )
    return {"expected_eac": round(val, 4)}
