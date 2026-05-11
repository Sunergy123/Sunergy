# routers/realtime.py
# 即時預測：模擬器 push tick → 後端 in-memory deque → 前端輪詢 feed
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from collections import deque
from threading import RLock
from datetime import datetime
from pathlib import Path
import json as _json
import uuid
import numpy as np

from database import get_db
from models import TrainedModel
from routers.train_utils import HAS_XGBOOST, _to_native

if HAS_XGBOOST:
    import xgboost as xgb


router = APIRouter(prefix="/realtime", tags=["Realtime"])


# ═══════════════════════════════════════
#  In-memory state
# ═══════════════════════════════════════
class _RtState:
    BUFFER_MAX = 500

    def __init__(self):
        self.lock = RLock()
        self.buffer: deque = deque(maxlen=self.BUFFER_MAX)  # tick dicts
        self.next_id = 1
        self.last_push_at: Optional[str] = None
        self.pred_cache: dict = {}      # (tick_id, model_id) -> float
        self.model_cache: dict = {}     # model_id -> {model_type, feature_cols, target, model}
        self.session_id = uuid.uuid4().hex

    def reset(self):
        self.buffer.clear()
        self.next_id = 1
        self.last_push_at = None
        self.pred_cache.clear()
        self.session_id = uuid.uuid4().hex


_state = _RtState()


# ═══════════════════════════════════════
#  Schemas
# ═══════════════════════════════════════
class TickIn(BaseModel):
    the_date: Optional[str] = None     # "YYYY-MM-DD"
    the_hour: Optional[int] = None
    the_minute: Optional[int] = 0
    gi: float
    tm: float
    eac: Optional[float] = None        # 模擬器有實際值；真實即時情境下可為 None


# ═══════════════════════════════════════
#  Endpoints
# ═══════════════════════════════════════
@router.post("/push")
def push(tick: TickIn):
    """模擬器或實際即時資料來源呼叫此端點。"""
    with _state.lock:
        # 即將擠出最舊那筆 → 先清掉它的預測快取
        if len(_state.buffer) == _state.buffer.maxlen and _state.buffer:
            old_id = _state.buffer[0]["tick_id"]
            for k in list(_state.pred_cache.keys()):
                if k[0] == old_id:
                    del _state.pred_cache[k]

        tick_id = _state.next_id
        _state.next_id += 1
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        _state.buffer.append({
            "tick_id": tick_id,
            "received_at": ts,
            "the_date": tick.the_date,
            "the_hour": tick.the_hour,
            "the_minute": tick.the_minute or 0,
            "GI": float(tick.gi),
            "TM": float(tick.tm),
            "EAC": float(tick.eac) if tick.eac is not None else None,
        })
        _state.last_push_at = ts
        sz = len(_state.buffer)
    return {"ok": True, "tick_id": tick_id, "buffer_size": sz}


@router.post("/clear")
def clear():
    with _state.lock:
        _state.reset()
        sid = _state.session_id
    return {"ok": True, "session_id": sid}


@router.get("/status")
def status():
    with _state.lock:
        return {
            "buffer_size": len(_state.buffer),
            "last_push_at": _state.last_push_at,
            "session_id": _state.session_id,
            "next_id": _state.next_id,
        }


# ═══════════════════════════════════════
#  模型載入（cache）
# ═══════════════════════════════════════
def _ensure_model_loaded(model_id: int, db: Session) -> dict:
    if model_id in _state.model_cache:
        return _state.model_cache[model_id]

    tm = db.query(TrainedModel).filter(TrainedModel.model_id == model_id).first()
    if not tm:
        raise HTTPException(404, f"找不到模型 ID={model_id}")

    base_dir = Path(__file__).resolve().parent.parent
    artifact_path = base_dir / tm.file_path
    if not artifact_path.exists():
        raise HTTPException(404, f"模型檔案不存在: {artifact_path}")

    meta_path = artifact_path.with_suffix(".meta.json")
    if not meta_path.exists():
        raise HTTPException(400, f"模型 {model_id} 缺少 .meta.json")

    with open(meta_path, "r", encoding="utf-8") as fh:
        meta = _json.load(fh)
    feature_cols = meta.get("feature_cols_used") or ["GI", "TM"]
    target = meta.get("target") or "EAC"

    if artifact_path.suffix == ".json":
        if not HAS_XGBOOST:
            raise HTTPException(500, "xgboost not available")
        m = xgb.XGBRegressor()
        m.load_model(str(artifact_path))
    elif artifact_path.suffix == ".pt":
        raise HTTPException(400, "LSTM models 不再支援")
    else:
        import joblib as _joblib
        m = _joblib.load(artifact_path)

    info = {
        "model_type": tm.model_type,
        "feature_cols": feature_cols,
        "target": target,
        "model": m,
    }
    _state.model_cache[model_id] = info
    return info


def _build_feature_vector(tick: dict, feature_cols: list) -> np.ndarray:
    """根據訓練時用的 feature_cols 從 tick 組出對應特徵向量。"""
    vals = []
    h = tick.get("the_hour")
    if h is None:
        h = 0
    d = tick.get("the_date")
    for c in feature_cols:
        if c == "GI":
            vals.append(tick.get("GI", 0.0) or 0.0)
        elif c == "TM":
            vals.append(tick.get("TM", 0.0) or 0.0)
        elif c == "hour":
            vals.append(int(h))
        elif c == "dayofweek":
            try:
                vals.append(datetime.strptime(d, "%Y-%m-%d").weekday())
            except Exception:
                vals.append(0)
        elif c == "month":
            try:
                vals.append(datetime.strptime(d, "%Y-%m-%d").month)
            except Exception:
                vals.append(0)
        elif c == "hour_sin":
            vals.append(float(np.sin(2 * np.pi * int(h) / 24)))
        elif c == "hour_cos":
            vals.append(float(np.cos(2 * np.pi * int(h) / 24)))
        else:
            # 未知欄位用 0 代替（保險）
            vals.append(0.0)
    return np.array([vals], dtype=float)


def _predict_for_tick(tick: dict, model_info: dict) -> float:
    X = _build_feature_vector(tick, model_info["feature_cols"])
    y = model_info["model"].predict(X)
    val = float(y[0])
    if not np.isfinite(val):
        return 0.0
    return max(val, 0.0)  # 發電量不可能為負


# ═══════════════════════════════════════
#  /realtime/feed — 拉取資料 + 預測
# ═══════════════════════════════════════
@router.get("/feed")
def feed(
    model_ids: str = Query("", description="逗號分隔的 model_id（可空，純物理式時）"),
    since: int = Query(0, description="只回傳 tick_id > since 的新資料"),
    physics_kwp: Optional[float] = Query(None),
    physics_pr: Optional[float] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        id_list = [int(x.strip()) for x in model_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "model_ids 格式錯誤")
    use_physics = physics_kwp is not None and physics_kwp > 0
    if not id_list and not use_physics:
        raise HTTPException(400, "至少需要一個 model_id 或啟用物理式")

    # load + cache 模型
    models_info = {}
    for mid in id_list:
        models_info[mid] = _ensure_model_loaded(mid, db)

    with _state.lock:
        all_ticks = list(_state.buffer)
        session_id = _state.session_id
        last_push_at = _state.last_push_at

    new_ticks = [t for t in all_ticks if t["tick_id"] > since]

    # 對每個新 tick 計算每個模型的預測（快取）
    rows_out = []
    for t in new_ticks:
        # 組裝顯示用時間字串
        dh = t.get("the_date")
        hh = t.get("the_hour")
        mm = t.get("the_minute")
        if dh is not None and hh is not None:
            time_str = f"{dh} {int(hh):02d}:{int(mm or 0):02d}"
        else:
            time_str = t.get("received_at") or ""

        r = {
            "tick_id": t["tick_id"],
            "time": time_str,
            "GI": round(t["GI"], 4),
            "TM": round(t["TM"], 4),
            "EAC": round(t["EAC"], 4) if t["EAC"] is not None else None,
        }
        for mid in id_list:
            mtype = models_info[mid]["model_type"]
            cache_key = (t["tick_id"], mid)
            with _state.lock:
                if cache_key not in _state.pred_cache:
                    _state.pred_cache[cache_key] = _predict_for_tick(t, models_info[mid])
                pred = _state.pred_cache[cache_key]
            pred_col = f"pred_{mtype}_{mid}"
            err_col = f"err_{mtype}_{mid}"
            eabs_col = f"eabs_{mtype}_{mid}"
            r[pred_col] = round(pred, 4)
            if t["EAC"] is not None:
                err_abs = pred - t["EAC"]
                r[eabs_col] = round(err_abs, 4)
                if abs(t["EAC"]) > 1e-6:
                    r[err_col] = round(err_abs / abs(t["EAC"]) * 100, 2)
                elif pred == 0:
                    r[err_col] = 0.0
                else:
                    r[err_col] = None
            else:
                r[eabs_col] = None
                r[err_col] = None

        # 物理式偽模型欄位
        if use_physics:
            from routers.physics import compute_physics_eac, DEFAULT_PR
            pr_v = float(physics_pr) if physics_pr is not None else DEFAULT_PR
            pv = round(compute_physics_eac(t["GI"], t.get("TM"), float(physics_kwp), pr=pr_v), 4)
            r["pred_physics_0"] = pv
            if t["EAC"] is not None:
                ea = round(pv - t["EAC"], 4)
                r["eabs_physics_0"] = ea
                if abs(t["EAC"]) > 1e-6:
                    r["err_physics_0"] = round(ea / abs(t["EAC"]) * 100, 2)
                elif pv == 0:
                    r["err_physics_0"] = 0.0
                else:
                    r["err_physics_0"] = None
            else:
                r["eabs_physics_0"] = None
                r["err_physics_0"] = None
        rows_out.append(r)

    # models_summary 對「整個 buffer」做累計（不只新進來那批）
    models_summary = []
    for mid in id_list:
        mtype = models_info[mid]["model_type"]
        total_pred = 0.0
        total_actual = 0.0
        n_with_actual = 0
        n_pred = 0
        sum_abs_diff = 0.0
        sum_abs_err = 0.0
        sum_abs_act = 0.0
        for t in all_ticks:
            cache_key = (t["tick_id"], mid)
            with _state.lock:
                if cache_key not in _state.pred_cache:
                    _state.pred_cache[cache_key] = _predict_for_tick(t, models_info[mid])
                pred = _state.pred_cache[cache_key]
            total_pred += pred
            n_pred += 1
            if t["EAC"] is not None:
                total_actual += t["EAC"]
                n_with_actual += 1
                d = abs(pred - t["EAC"])
                sum_abs_diff += d
                if abs(t["EAC"]) > 1e-6:
                    sum_abs_err += d
                    sum_abs_act += abs(t["EAC"])
        models_summary.append({
            "model_id": mid,
            "model_type": mtype,
            "status": "ok",
            "total_predicted_eac": round(total_pred, 2) if n_pred > 0 else None,
            "total_actual_eac": round(total_actual, 2) if n_with_actual > 0 else None,
            "avg_error_pct": round(sum_abs_err / sum_abs_act * 100, 2) if sum_abs_act > 0 else None,
            "avg_error_abs": round(sum_abs_diff / n_with_actual, 4) if n_with_actual > 0 else None,
        })

    base_cols = ["time", "GI", "TM", "EAC"]
    pred_cols = []
    for mid in id_list:
        mtype = models_info[mid]["model_type"]
        pred_cols += [f"pred_{mtype}_{mid}", f"err_{mtype}_{mid}", f"eabs_{mtype}_{mid}"]
    if use_physics:
        pred_cols += ["pred_physics_0", "err_physics_0", "eabs_physics_0"]

    # 物理式 summary
    if use_physics:
        from routers.physics import compute_physics_eac, DEFAULT_PR
        pr_v = float(physics_pr) if physics_pr is not None else DEFAULT_PR
        kwp_v = float(physics_kwp)
        sum_pred = sum_act = sum_abs_diff = sum_abs_err = sum_abs_act = 0.0
        n_pred = n_act = 0
        for t in all_ticks:
            pv = compute_physics_eac(t["GI"], t.get("TM"), kwp_v, pr=pr_v)
            sum_pred += pv
            n_pred += 1
            if t["EAC"] is not None:
                act = t["EAC"]
                sum_act += act
                n_act += 1
                d = abs(pv - act)
                sum_abs_diff += d
                if abs(act) > 1e-6:
                    sum_abs_err += d
                    sum_abs_act += abs(act)
        models_summary.append({
            "model_id": 0,
            "model_type": "physics",
            "status": "ok",
            "total_predicted_eac": round(sum_pred, 2) if n_pred > 0 else None,
            "total_actual_eac": round(sum_act, 2) if n_act > 0 else None,
            "avg_error_pct": round(sum_abs_err / sum_abs_act * 100, 2) if sum_abs_act > 0 else None,
            "avg_error_abs": round(sum_abs_diff / n_act, 4) if n_act > 0 else None,
            "physics_kwp": kwp_v,
            "physics_pr": pr_v,
        })

    new_cursor = new_ticks[-1]["tick_id"] if new_ticks else since

    return _to_native({
        "columns": base_cols + pred_cols,
        "rows": rows_out,
        "total_rows": len(all_ticks),
        "models_summary": models_summary,
        "new_cursor": new_cursor,
        "last_push_at": last_push_at,
        "session_id": session_id,
    })
