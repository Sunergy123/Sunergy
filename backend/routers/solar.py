from fastapi import APIRouter
import requests

router = APIRouter()

@router.get("/solar/estimate")
def estimate(
    lat: float,
    lon: float,
    capacity: float,
    pr: float = 0.8
):


    url = (
        "https://power.larc.nasa.gov/api/temporal/climatology/point"
        f"?parameters=ALLSKY_SFC_SW_DWN"
        f"&community=RE"
        f"&longitude={lon}"
        f"&latitude={lat}"
        f"&format=JSON"
    )

    response = requests.get(url)

    data = response.json()

    H = data["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]["ANN"]

    daily_energy = capacity * H * pr

    year_energy = daily_energy * 365

    return {
        "H": round(H, 2),
        "daily_energy": round(daily_energy, 2),
        "year_energy": round(year_energy, 2)
    }