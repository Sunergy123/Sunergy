import json
import sys
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
import xgboost as xgb

XLSX_PATH       = Path("CPC_D414Z01.xlsx")
BASE_MODELS_DIR = Path("uploads") / "models" / "base"
SPLIT_RATIO     = 0.8
RANDOM_STATE    = 42


def compute_metrics(y_true, y_pred):
    r2    = float(r2_score(y_true, y_pred))
    rmse  = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae   = float(mean_absolute_error(y_true, y_pred))
    eps   = 1e-6
    wmape = float(np.sum(np.abs(y_true - y_pred)) / (np.sum(np.abs(y_true)) + eps))
    return {"r2": round(r2, 4), "rmse": round(rmse, 4),
            "mae": round(mae, 4), "wmape": round(wmape, 6)}


def load_data(xlsx_path: Path):
    df = pd.read_excel(xlsx_path)
    df.columns = [c.upper() for c in df.columns]
    required = ["GI", "TM", "EAC"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Excel 缺少必要欄位：{missing}")
    df = df.dropna(subset=required)
    df = df[(df["GI"] >= 0) & (df["TM"] > -50) & (df["EAC"] >= 0)]
    X = df[["GI", "TM"]].values.astype(float)
    y = df["EAC"].values.astype(float)
    print(f"✅ 資料載入完成：{len(df)} 筆，GI / TM → EAC")
    return X, y


def train_all(X_train, y_train, X_test, y_test):
    results = {}

    print("\n🔧 訓練 SVR ...")
    model = Pipeline([
        ("scaler", StandardScaler()),
        ("svr", SVR(C=100.0, kernel="rbf", gamma="scale", epsilon=0.1, cache_size=500)),
    ])
    model.fit(X_train, y_train)
    y_pred = np.maximum(model.predict(X_test), 0)
    metrics = compute_metrics(y_test, y_pred)
    params  = {"C": 100.0, "kernel": "rbf", "gamma": "scale", "epsilon": 0.1}
    results["SVR"] = (model, metrics, params)
    print(f"   RMSE={metrics['rmse']:.4f}  R²={metrics['r2']:.4f}  WMAPE={metrics['wmape']:.6f}")

    print("\n🔧 訓練 RandomForest ...")
    model = RandomForestRegressor(n_estimators=200, max_depth=None, random_state=RANDOM_STATE, n_jobs=-1)
    model.fit(X_train, y_train)
    y_pred = np.maximum(model.predict(X_test), 0)
    metrics = compute_metrics(y_test, y_pred)
    params  = {"n_estimators": 200, "max_depth": None}
    results["RandomForest"] = (model, metrics, params)
    print(f"   RMSE={metrics['rmse']:.4f}  R²={metrics['r2']:.4f}  WMAPE={metrics['wmape']:.6f}")

    print("\n🔧 訓練 XGBoost ...")
    model = xgb.XGBRegressor(
        n_estimators=300, learning_rate=0.1, max_depth=6,
        subsample=0.8, colsample_bytree=0.8,
        random_state=RANDOM_STATE, n_jobs=-1, tree_method="hist"
    )
    model.fit(X_train, y_train)
    y_pred = np.maximum(model.predict(X_test), 0)
    metrics = compute_metrics(y_test, y_pred)
    params  = {"n_estimators": 300, "learning_rate": 0.1, "max_depth": 6,
               "subsample": 0.8, "colsample_bytree": 0.8}
    results["XGBoost"] = (model, metrics, params)
    print(f"   RMSE={metrics['rmse']:.4f}  R²={metrics['r2']:.4f}  WMAPE={metrics['wmape']:.6f}")

    return results


def save_artifacts(results, models_dir, timestamp):
    models_dir.mkdir(parents=True, exist_ok=True)
    artifact_paths = {}
    for model_name, (model, metrics, params) in results.items():
        if model_name == "XGBoost":
            path = models_dir / f"{timestamp}_{model_name}.json"
            try:
                model.save_model(str(path))
            except Exception:
                path = models_dir / f"{timestamp}_{model_name}.joblib"
                joblib.dump(model, path)
        else:
            path = models_dir / f"{timestamp}_{model_name}.joblib"
            joblib.dump(model, path)

        meta = {
            "model_id": model_name, "artifact": path.name,
            "feature_cols_used": ["GI", "TM"], "target": "EAC",
            "time_col": None, "split_method": "random",
            "trained_at": timestamp, "is_base_model": True,
            "source_file": "CPC_D414Z01.xlsx",
        }
        with open(models_dir / f"{timestamp}_{model_name}.meta.json", "w", encoding="utf-8") as fh:
            json.dump(meta, fh, ensure_ascii=False, indent=2)

        artifact_paths[model_name] = path
        print(f"   💾 {path.name}")
    return artifact_paths


def _print_manual_sql(results, artifact_paths, timestamp_dt):
    print("\n── 手動 SQL（請在資料庫執行）────────────────────────────")
    for model_name, (_, metrics, params) in results.items():
        rel = Path("uploads") / "models" / "base" / artifact_paths[model_name].name
        print(f"""INSERT INTO trained_model
  (upload_id, after_id, model_type, parameters, file_path,
   trained_at, rmse, r2, mae, wmape, metrics, is_public, usage_count)
VALUES
  (NULL, NULL, '{model_name}',
   '{json.dumps(params)}'::jsonb, '{rel}',
   '{timestamp_dt.isoformat()}',
   {metrics['rmse']}, {metrics['r2']}, {metrics['mae']}, {metrics['wmape']},
   '{json.dumps(metrics)}'::jsonb, TRUE, 0);""")


def insert_to_db(results, artifact_paths, timestamp_dt):
    try:
        from database import SessionLocal
        from models import TrainedModel
    except ImportError as e:
        print(f"\n⚠️  無法匯入資料庫模組（{e}）")
        _print_manual_sql(results, artifact_paths, timestamp_dt)
        return []

    db = SessionLocal()
    inserted = []
    try:
        for model_name, (_, metrics, params) in results.items():
            path = artifact_paths[model_name]
            tm = TrainedModel(
                upload_id   = None,      # ★ 路線 B：不掛任何使用者
                after_id    = None,      # ★ 路線 B：不掛任何使用者
                model_type  = model_name,
                parameters  = params,
                file_path   = str(Path("uploads") / "models" / "base" / path.name),
                trained_at  = timestamp_dt,
                rmse        = metrics["rmse"],
                r2          = metrics["r2"],
                mae         = metrics["mae"],
                wmape       = metrics["wmape"],
                metrics     = metrics,
                is_public   = True,
                usage_count = 0,
            )
            db.add(tm)
            inserted.append(model_name)
        db.commit()
        print(f"\n✅ 已寫入資料庫：{inserted}")
    except Exception as e:
        db.rollback()
        print(f"\n❌ 資料庫寫入失敗：{e}")
        print("   → 請確認已執行 migrate_base_model_constraint.sql")
        _print_manual_sql(results, artifact_paths, timestamp_dt)
        raise
    finally:
        db.close()
    return inserted


def main():
    print("=" * 60)
    print("  🌞 CPC_D414Z01 公用基礎模型訓練腳本（路線 B）")
    print("=" * 60)

    if not XLSX_PATH.exists():
        sys.exit(f"❌ 找不到 Excel 檔案：{XLSX_PATH}")

    X, y = load_data(XLSX_PATH)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=1 - SPLIT_RATIO, random_state=RANDOM_STATE
    )
    print(f"\n📊 訓練集：{len(y_train)} 筆　測試集：{len(y_test)} 筆")

    results = train_all(X_train, y_train, X_test, y_test)

    timestamp    = datetime.utcnow().strftime("%Y%m%d_%H%M%S000000")
    timestamp_dt = datetime.utcnow()
    print(f"\n💾 儲存模型至 {BASE_MODELS_DIR} ...")
    artifact_paths = save_artifacts(results, BASE_MODELS_DIR, timestamp)

    print("\n🗃  寫入 trained_model 資料表 ...")
    insert_to_db(results, artifact_paths, timestamp_dt)

    print("\n" + "=" * 60)
    print("  ✅ 完成！任何使用者登入皆可使用這三個公用模型。")
    print("=" * 60)


if __name__ == "__main__":
    main()