# routers/predict.py
# 預測相關端點：POST /train/predict、POST /train/predict-file
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional

from database import get_db
from models import AfterData, TrainedModel
from schemas import PredictRequest
from routers.train_utils import (
    HAS_SKLEARN, HAS_XGBOOST,
    _models_dir, _load_cleaned_csv, _to_native, _ensure_time_features,
)

# conditional imports (already guarded by HAS_* flags)
if HAS_XGBOOST:
    import xgboost as xgb

router = APIRouter(prefix="/train", tags=["Predict"])


def _build_ea_datetime(row, date_col, hour_col):
    """組出供前端 ErrorAnalysisPage 使用的 'YYYY-MM-DD HH:00' 字串。"""
    if not date_col or not hour_col:
        return None
    try:
        date_val = row[date_col]
        hour_val = row[hour_col]
        if pd.isna(date_val) or pd.isna(hour_val):
            return None
        dt_parsed = pd.to_datetime(str(date_val), errors='coerce')
        if pd.isna(dt_parsed):
            return None
        return f"{dt_parsed.year}-{dt_parsed.month:02d}-{dt_parsed.day:02d} {int(hour_val):02d}:00"
    except Exception:
        return None


# ───────────────────────────────────────
# POST /train/predict  — JSON 資料預測
# ───────────────────────────────────────
@router.post("/predict")
def predict(payload: PredictRequest, db: Session = Depends(get_db)):
    entry = db.query(AfterData).filter(AfterData.after_id == payload.source_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="after_id not found")

    # locate artifact
    models_dir = _models_dir(payload.data_id)
    artifact_path: Optional[Path] = None
    meta_path: Optional[Path] = None
    if payload.artifact:
        artifact_path = models_dir / payload.artifact
        if not artifact_path.exists():
            raise HTTPException(status_code=404, detail="artifact not found")
        if artifact_path.suffix in {".joblib", ".json"}:
            meta_path = artifact_path.with_suffix(".meta.json")
    else:
        # find by model_id + trained_at
        if not (payload.model_id and payload.trained_at):
            raise HTTPException(status_code=400, detail="provide artifact filename or (model_id + trained_at)")
        candidates = list(models_dir.glob(f"{payload.trained_at}_{payload.model_id}.*"))
        if not candidates:
            raise HTTPException(status_code=404, detail="artifact by model_id+trained_at not found")
        artifact_path = candidates[0]
        meta_path = artifact_path.with_suffix(".meta.json")

    # load metadata
    if not meta_path or not meta_path.exists():
        raise HTTPException(status_code=400, detail="missing meta sidecar for artifact")
    import json as _json
    with open(meta_path, "r", encoding="utf-8") as fh:
        meta = _json.load(fh)
    feature_cols = meta.get("feature_cols_used") or []
    target_col = meta.get("target") or "EAC"

    # build dataframe
    if payload.rows:
        df = pd.DataFrame(payload.rows)
    else:
        df = _load_cleaned_csv(entry)
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400, detail=f"missing feature columns: {','.join(missing)}")
    X = df[feature_cols].select_dtypes(include=[np.number]).values

    # dispatch by artifact type
    if artifact_path.suffix == ".json":
        if not HAS_XGBOOST:
            raise HTTPException(status_code=500, detail="xgboost not available to load json model")
        booster = xgb.XGBRegressor()
        booster.load_model(str(artifact_path))
        y_pred = booster.predict(X)
    elif artifact_path.suffix == ".pt":
        raise HTTPException(status_code=400, detail="LSTM models (.pt) are no longer supported")
    else:
        # joblib models (RF/SVR or XGB fallback)
        import joblib as _joblib
        model = _joblib.load(artifact_path)
        y_pred = model.predict(X)

    # 發電量不可能為負數，將負值截斷為 0
    y_pred = np.maximum(y_pred, 0)

    if payload.model_id:
        tm = db.query(TrainedModel).filter(
            TrainedModel.model_id == payload.model_id
        ).first()

        if tm:
            tm.usage_count = (tm.usage_count or 0) + 1
            db.commit()

    return _to_native({
        "artifact": artifact_path.name,
        "n": int(len(y_pred)),
        "target": target_col,
        "pred": [None if (isinstance(v, float) and np.isnan(v)) else v for v in y_pred.tolist()],
    })


# ───────────────────────────────────────
# POST /train/predict-file  — 上傳檔案預測
# ───────────────────────────────────────
@router.post("/predict-file")
async def predict_file(
    file: UploadFile = File(...),
    model_id: int = Form(...),
    db: Session = Depends(get_db),
):
    tm = db.query(TrainedModel).filter(TrainedModel.model_id == model_id).first()
    if not tm:
        raise HTTPException(status_code=404, detail="trained model not found")

    base_dir = Path(__file__).resolve().parent.parent
    artifact_path = base_dir / tm.file_path
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail=f"artifact file missing: {artifact_path}")

    meta_path = artifact_path.with_suffix(".meta.json")
    if not meta_path.exists():
        raise HTTPException(status_code=400, detail="missing .meta.json sidecar for this model")

    import json as _json
    with open(meta_path, "r", encoding="utf-8") as fh:
        meta = _json.load(fh)

    feature_cols = meta.get("feature_cols_used") or []
    target_col = meta.get("target") or "EAC"

    import io
    contents = await file.read()
    fname = file.filename or ""

    if fname.lower().endswith(".xlsx") or fname.lower().endswith(".xls"):
        try:
            import openpyxl  # noqa: F401
            df = pd.read_excel(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"failed to read Excel file: {e}")
    else:
        try:
            df = pd.read_csv(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"failed to read CSV file: {e}")
    if df.empty:
        raise HTTPException(status_code=400, detail="uploaded file has no data")

    # 3. derive time features if needed (same logic as training)
    time_col = None
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            time_col = c
            break
        if df[c].dtype == object:
            parsed = pd.to_datetime(df[c], errors="coerce")
            if parsed.notna().sum() > len(df) * 0.5:
                time_col = c
                break
    df = _ensure_time_features(df, time_col)

    # Also map common column aliases to required feature names
    alias_map = {
        'hour': ['theHour', 'TheHour', 'THEHOUR', 'Hour'],
        'month': ['theDate', 'TheDate', 'THEDATE'],
    }
    for feat, aliases in alias_map.items():
        if feat in feature_cols and feat not in df.columns:
            for alias in aliases:
                if alias in df.columns:
                    if feat == 'month':
                        parsed = pd.to_datetime(df[alias], errors='coerce')
                        df['month'] = parsed.dt.month
                    else:
                        df[feat] = pd.to_numeric(df[alias], errors='coerce')
                    break

    # 4. validate feature columns
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400,
                            detail=f"uploaded file is missing required columns: {', '.join(missing)}. "
                                   f"Required: {feature_cols}")

    X = df[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0).values

    # 5. load model & predict
    y_pred: np.ndarray
    if artifact_path.suffix == ".json":
        if not HAS_XGBOOST:
            raise HTTPException(status_code=500, detail="xgboost not available")
        booster = xgb.XGBRegressor()
        booster.load_model(str(artifact_path))
        y_pred = booster.predict(X)
    elif artifact_path.suffix == ".pt":
        raise HTTPException(status_code=400, detail="LSTM models (.pt) are no longer supported")
    else:
        import joblib as _joblib
        model = _joblib.load(artifact_path)
        y_pred = model.predict(X)

    # 發電量不可能為負數，將負值截斷為 0
    y_pred = np.maximum(y_pred, 0)

    # 6. build response: every row from uploaded file + predicted_EAC + error %
    actual_eac = df[target_col].values if target_col in df.columns else None
    rows_out = []
    for i, row in df.iterrows():
        r = row.to_dict()
        pred_val = None if (isinstance(y_pred[i], float) and np.isnan(y_pred[i])) else round(float(y_pred[i]), 4)
        r["predicted_EAC"] = pred_val
        if actual_eac is not None and pred_val is not None:
            act = float(actual_eac[i]) if not pd.isna(actual_eac[i]) else None
            if act is not None:
                r["error_abs"] = round(pred_val - act, 4)
                if act != 0:
                    r["error_pct"] = round((pred_val - act) / abs(act) * 100, 2)
                elif pred_val == 0:
                    r["error_pct"] = 0.0
                else:
                    r["error_pct"] = None
            else:
                r["error_pct"] = None
                r["error_abs"] = None
        else:
            r["error_pct"] = None
            r["error_abs"] = None
        rows_out.append(r)

    # summary stats — WMAPE + MAE
    total_pred = round(sum(r["predicted_EAC"] for r in rows_out if r["predicted_EAC"] is not None), 2)
    total_actual = None
    avg_error = None
    avg_error_abs = None
    if actual_eac is not None:
        valid_acts = [float(a) for a in actual_eac if not pd.isna(a)]
        total_actual = round(sum(valid_acts), 2) if valid_acts else None
        abs_errs, abs_acts = [], []
        abs_diffs = []
        for idx, r in enumerate(rows_out):
            p = r.get("predicted_EAC")
            a = float(actual_eac[idx]) if not pd.isna(actual_eac[idx]) else None
            if p is not None and a is not None:
                abs_diffs.append(abs(p - a))
                if a != 0:
                    abs_errs.append(abs(p - a))
                    abs_acts.append(abs(a))
        if abs_acts:
            avg_error = round(sum(abs_errs) / sum(abs_acts) * 100, 2)
        if abs_diffs:
            avg_error_abs = round(sum(abs_diffs) / len(abs_diffs), 4)

    # Remove time-derived columns from output (they are internal features only)
    _hide = {'hour', 'dayofweek', 'month', 'hour_sin', 'hour_cos'}
    display_cols = [c for c in df.columns if c not in _hide]

    the_date_col = next((c for c in ['theDate', 'TheDate', 'the_date', 'date', 'Date'] if c in df.columns), None)
    the_hour_col = next((c for c in ['theHour', 'TheHour', 'the_hour', 'Hour'] if c in df.columns), None)

    for i, r in enumerate(rows_out):
        for h in _hide:
            r.pop(h, None)
        ea_dt = _build_ea_datetime(df.iloc[i], the_date_col, the_hour_col)
        if ea_dt is not None:
            r['_ea_datetime'] = ea_dt

    tm.usage_count = (tm.usage_count or 0) + 1
    db.commit()

    return _to_native({
        "model_type": tm.model_type,
        "model_id": tm.model_id,
        "total_rows": len(rows_out),
        "total_predicted_eac": total_pred,
        "total_actual_eac": total_actual,
        "avg_error_pct": avg_error,
        "avg_error_abs": avg_error_abs,
        "columns": display_cols + ["predicted_EAC", "error_pct", "error_abs"],
        "rows": rows_out,
    })


# ───────────────────────────────────────
# 內部工具：對單一模型做預測，回傳 y_pred array
# ───────────────────────────────────────
def _predict_with_model(artifact_path: Path, meta: dict, X: np.ndarray):
    """Load model from artifact_path and return y_pred numpy array."""
    if artifact_path.suffix == ".json":
        if not HAS_XGBOOST:
            raise HTTPException(status_code=500, detail="xgboost not available")
        booster = xgb.XGBRegressor()
        booster.load_model(str(artifact_path))
        y_pred = booster.predict(X)

    elif artifact_path.suffix == ".pt":
        raise HTTPException(status_code=400, detail="LSTM models (.pt) are no longer supported")

    else:
        import joblib as _joblib
        model = _joblib.load(artifact_path)
        y_pred = model.predict(X)

    # 發電量不可能為負數，將負值截斷為 0
    return np.maximum(y_pred, 0)


# ───────────────────────────────────────
# POST /train/predict-file-multi  — 多模型比對預測
# ───────────────────────────────────────
@router.post("/predict-file-multi")
async def predict_file_multi(
    file: UploadFile = File(...),
    model_ids: str = Form(""),           # 逗號分隔的 model_id，可留空（純物理式時）
    physics_kwp: Optional[float] = Form(None),
    physics_pr: Optional[float] = Form(None),
    db: Session = Depends(get_db),
):
    # 1. 解析 model_ids
    try:
        id_list = [int(x.strip()) for x in model_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="model_ids 格式錯誤，請用逗號分隔整數")

    use_physics = physics_kwp is not None and physics_kwp > 0

    if not id_list and not use_physics:
        raise HTTPException(status_code=400, detail="至少需要選擇一個模型（或啟用物理式估算）")

    # 2. 查詢所有模型紀錄
    models = []
    for mid in id_list:
        tm = db.query(TrainedModel).filter(TrainedModel.model_id == mid).first()
        if not tm:
            raise HTTPException(status_code=404, detail=f"找不到模型 ID={mid}")
        base_dir = Path(__file__).resolve().parent.parent
        artifact_path = base_dir / tm.file_path
        if not artifact_path.exists():
            raise HTTPException(status_code=404, detail=f"模型檔案不存在: model_id={mid}")
        meta_path = artifact_path.with_suffix(".meta.json")
        if not meta_path.exists():
            raise HTTPException(status_code=400, detail=f"模型 {mid} 缺少 .meta.json")
        import json as _json
        with open(meta_path, "r", encoding="utf-8") as fh:
            meta = _json.load(fh)
        models.append({"tm": tm, "artifact_path": artifact_path, "meta": meta})

    # 3. 讀取上傳檔案
    import io
    contents = await file.read()
    fname = file.filename or ""

    if fname.lower().endswith(".xlsx") or fname.lower().endswith(".xls"):
        try:
            import openpyxl  # noqa: F401
            df = pd.read_excel(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Excel 讀取失敗: {e}")
    else:
        try:
            df = pd.read_csv(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"CSV 讀取失敗: {e}")

    if df.empty:
        raise HTTPException(status_code=400, detail="上傳的檔案沒有資料")

    # 4. derive time features
    time_col = None
    for c in df.columns:
        if pd.api.types.is_datetime64_any_dtype(df[c]):
            time_col = c
            break
        if df[c].dtype == object:
            parsed = pd.to_datetime(df[c], errors="coerce")
            if parsed.notna().sum() > len(df) * 0.5:
                time_col = c
                break
    df = _ensure_time_features(df, time_col)

    # alias mapping
    alias_map = {
        'hour': ['theHour', 'TheHour', 'THEHOUR', 'Hour'],
        'month': ['theDate', 'TheDate', 'THEDATE'],
    }

    # 5. 對每個模型做預測
    _hide = {'hour', 'dayofweek', 'month', 'hour_sin', 'hour_cos'}
    display_cols = [c for c in df.columns if c not in _hide]

    models_summary = []
    pred_columns = []     # 新增欄位名稱（依序）
    all_predictions = {}  # col_name -> list of values

    for m_info in models:
        tm = m_info["tm"]
        artifact_path = m_info["artifact_path"]
        meta = m_info["meta"]
        feature_cols = meta.get("feature_cols_used") or []
        target_col = meta.get("target") or "EAC"

        # apply alias mapping for this model's features
        df_copy = df.copy()
        for feat, aliases in alias_map.items():
            if feat in feature_cols and feat not in df_copy.columns:
                for alias in aliases:
                    if alias in df_copy.columns:
                        if feat == 'month':
                            parsed = pd.to_datetime(df_copy[alias], errors='coerce')
                            df_copy['month'] = parsed.dt.month
                        else:
                            df_copy[feat] = pd.to_numeric(df_copy[alias], errors='coerce')
                        break

        missing = [c for c in feature_cols if c not in df_copy.columns]
        if missing:
            models_summary.append({
                "model_id": tm.model_id,
                "model_type": tm.model_type,
                "status": "error",
                "error": f"缺少欄位: {', '.join(missing)}",
                "total_predicted_eac": None,
                "avg_error_pct": None,
            })
            continue

        X = df_copy[feature_cols].apply(pd.to_numeric, errors="coerce").fillna(0).values

        # predict
        try:
            y_pred = _predict_with_model(artifact_path, meta, X)
        except Exception as e:
            models_summary.append({
                "model_id": tm.model_id,
                "model_type": tm.model_type,
                "status": "error",
                "error": str(e),
                "total_predicted_eac": None,
                "avg_error_pct": None,
            })
            continue

        # column names for this model
        pred_col = f"pred_{tm.model_type}_{tm.model_id}"
        err_col = f"err_{tm.model_type}_{tm.model_id}"
        eabs_col = f"eabs_{tm.model_type}_{tm.model_id}"
        pred_columns.extend([pred_col, err_col, eabs_col])

        # compute per-row predicted + error
        actual_eac = df_copy[target_col].values if target_col in df_copy.columns else None
        pred_vals = []
        err_vals = []
        eabs_vals = []
        for i in range(len(y_pred)):
            pv = None if (isinstance(y_pred[i], float) and np.isnan(y_pred[i])) else round(float(y_pred[i]), 4)
            pred_vals.append(pv)

            ep = None
            ea = None
            if actual_eac is not None and pv is not None:
                act = float(actual_eac[i]) if not pd.isna(actual_eac[i]) else None
                if act is not None:
                    ea = round(pv - act, 4)
                    if act != 0:
                        ep = round((pv - act) / abs(act) * 100, 2)
                    elif pv == 0:
                        ep = 0.0
            err_vals.append(ep)
            eabs_vals.append(ea)

        all_predictions[pred_col] = pred_vals
        all_predictions[err_col] = err_vals
        all_predictions[eabs_col] = eabs_vals

        # summary — WMAPE + MAE
        valid_preds = [p for p in pred_vals if p is not None]
        wmape = None
        mae = None
        total_act = None
        if actual_eac is not None:
            valid_acts = [float(a) for a in actual_eac if not pd.isna(a)]
            total_act = round(sum(valid_acts), 2) if valid_acts else None
            abs_errs, abs_acts = [], []
            abs_diffs = []
            for idx in range(len(pred_vals)):
                p = pred_vals[idx]
                a = float(actual_eac[idx]) if not pd.isna(actual_eac[idx]) else None
                if p is not None and a is not None:
                    abs_diffs.append(abs(p - a))
                    if a != 0:
                        abs_errs.append(abs(p - a))
                        abs_acts.append(abs(a))
            if abs_acts:
                wmape = round(sum(abs_errs) / sum(abs_acts) * 100, 2)
            if abs_diffs:
                mae = round(sum(abs_diffs) / len(abs_diffs), 4)
        models_summary.append({
            "model_id": tm.model_id,
            "model_type": tm.model_type,
            "status": "ok",
            "total_predicted_eac": round(sum(valid_preds), 2) if valid_preds else None,
            "total_actual_eac": total_act,
            "avg_error_pct": wmape,
            "avg_error_abs": mae,
        })

    # 5.5 物理式估算（偽模型，model_id=0、type=physics）
    if use_physics:
        from routers.physics import compute_physics_eac, DEFAULT_PR
        pr_val = float(physics_pr) if physics_pr is not None else DEFAULT_PR
        kwp_val = float(physics_kwp)
        pred_col = "pred_physics_0"
        err_col = "err_physics_0"
        eabs_col = "eabs_physics_0"
        pred_columns.extend([pred_col, err_col, eabs_col])

        gi_col = next((c for c in ['GI', 'gi', 'Gi'] if c in df.columns), None)
        tm_col = next((c for c in ['TM', 'tm', 'Tm'] if c in df.columns), None)
        eac_col = next((c for c in ['EAC', 'eac', 'Eac'] if c in df.columns), None)

        pred_vals_p, err_vals_p, eabs_vals_p = [], [], []
        sum_abs_diff = sum_abs_err = sum_abs_act = 0.0
        n_with_act = 0
        valid_preds_p = []
        total_act_p = 0.0
        n_act = 0

        for i, row in df.iterrows():
            try:
                gi_v = float(row[gi_col]) if gi_col and not pd.isna(row[gi_col]) else None
            except Exception:
                gi_v = None
            try:
                tm_v = float(row[tm_col]) if tm_col and not pd.isna(row[tm_col]) else None
            except Exception:
                tm_v = None
            if gi_v is None:
                pred_vals_p.append(None)
                err_vals_p.append(None)
                eabs_vals_p.append(None)
                continue
            pv = round(compute_physics_eac(gi_v, tm_v, kwp_val, pr=pr_val), 4)
            pred_vals_p.append(pv)
            valid_preds_p.append(pv)
            ep = ea = None
            if eac_col and not pd.isna(row[eac_col]):
                act = float(row[eac_col])
                total_act_p += act
                n_act += 1
                ea = round(pv - act, 4)
                sum_abs_diff += abs(pv - act)
                n_with_act += 1
                if act != 0:
                    sum_abs_err += abs(pv - act)
                    sum_abs_act += abs(act)
                    ep = round((pv - act) / abs(act) * 100, 2)
                elif pv == 0:
                    ep = 0.0
            err_vals_p.append(ep)
            eabs_vals_p.append(ea)

        all_predictions[pred_col] = pred_vals_p
        all_predictions[err_col] = err_vals_p
        all_predictions[eabs_col] = eabs_vals_p

        models_summary.append({
            "model_id": 0,
            "model_type": "physics",
            "status": "ok",
            "total_predicted_eac": round(sum(valid_preds_p), 2) if valid_preds_p else None,
            "total_actual_eac": round(total_act_p, 2) if n_act > 0 else None,
            "avg_error_pct": round(sum_abs_err / sum_abs_act * 100, 2) if sum_abs_act > 0 else None,
            "avg_error_abs": round(sum_abs_diff / n_with_act, 4) if n_with_act > 0 else None,
            "physics_kwp": kwp_val,
            "physics_pr": pr_val,
        })

    # 6. 組合 rows_out
    the_date_col = next((c for c in ['theDate', 'TheDate', 'the_date', 'date', 'Date'] if c in df.columns), None)
    the_hour_col = next((c for c in ['theHour', 'TheHour', 'the_hour', 'Hour'] if c in df.columns), None)

    rows_out = []
    for i, row in df.iterrows():
        r = {}
        for col in display_cols:
            val = row[col]
            if isinstance(val, float) and np.isnan(val):
                r[col] = None
            else:
                r[col] = val
        # append each model's prediction columns
        for pc in pred_columns:
            r[pc] = all_predictions[pc][i] if i < len(all_predictions.get(pc, [])) else None
        ea_dt = _build_ea_datetime(row, the_date_col, the_hour_col)
        if ea_dt is not None:
            r['_ea_datetime'] = ea_dt
        rows_out.append(r)

    return _to_native({
        "models_summary": models_summary,
        "total_rows": len(rows_out),
        "columns": display_cols + pred_columns,
        "rows": rows_out,
    })
