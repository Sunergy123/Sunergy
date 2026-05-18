from functools import lru_cache
from fastapi import APIRouter, HTTPException, Query
import requests

router = APIRouter()

# 2024 年台灣電力排碳係數 (kgCO₂e/kWh)
CARBON_FACTOR = 0.474

NASA_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point"
NASA_TIMEOUT_SEC = 15


@lru_cache(maxsize=512)
def _fetch_annual_irradiance(lat_key: float, lon_key: float) -> float:
    # NASA POWER 氣候平均對同一座標是常數,可長期快取
    try:
        response = requests.get(
            NASA_URL,
            params={
                "parameters": "ALLSKY_SFC_SW_DWN",
                "community": "RE",
                "longitude": lon_key,
                "latitude": lat_key,
                "format": "JSON",
            },
            timeout=NASA_TIMEOUT_SEC,
        )
        response.raise_for_status()
    except requests.Timeout:
        raise HTTPException(status_code=504, detail="NASA POWER API 連線逾時")
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"NASA POWER API 連線失敗: {e}")

    try:
        return response.json()["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["ANN"]
    except (KeyError, ValueError):
        raise HTTPException(status_code=502, detail="NASA POWER API 回應格式異常")


@router.get("/solar/estimate")
def estimate(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    capacity: float = Query(..., gt=0, description="裝置容量 kWp"),
    pr: float = Query(0.8, gt=0, le=1, description="系統效率 (Performance Ratio)"),
):
    # 對座標四捨五入到 0.01 度 (約 1 km) 以提升快取命中,對日照估算精度影響可忽略
    H = _fetch_annual_irradiance(round(lat, 2), round(lon, 2))

    daily_energy = capacity * H * pr
    year_energy = daily_energy * 365
    annual_carbon = year_energy * CARBON_FACTOR

    return {
        "H": round(H, 2),
        "daily_energy": round(daily_energy, 2),
        "year_energy": round(year_energy, 2),
        "annual_carbon_reduction": round(annual_carbon, 2),
        "carbon_factor": CARBON_FACTOR,
    }
