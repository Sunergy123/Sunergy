# schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List

# ===== Auth =====

class RegisterUser(BaseModel):
    user_name: str
    user_account: str 
    user_pw: str

class LoginUser(BaseModel):
    user_account: str
    user_pw: str


# ===== Site =====

class CreateSite(BaseModel):
    site_code: str
    site_name: str
    location: str
    user_id: int


# ===== Data Process =====

class ProcessRequest(BaseModel):
    upload_id: int
    method: str                 # 'iqr' | 'zscore' | 'isolation_forest' | 'default'
    params: Optional[Dict[str, Any]] = None


# ===== Update =====

class UpdateSite(BaseModel):
    site_code: str | None = None
    site_name: str | None = None
    location: str | None = None


# ===== Train =====

class TrainRequest(BaseModel):
    source_type: str   # "raw" 或 "cleaned"
    source_id: int     # upload_id 或 after_id
    split_ratio: float = 0.8
    split_method: str = "random"                        # "random" | "time"
    models: List[str]                                   # ["XGBoost", "SVR", ...]
    strategy: str = "grid"                              # "grid" | "bayes"
    params: Optional[Dict[str, Any]] = None
    features: Optional[List[str]] = None                # default ["GI", "TM"]
    target: Optional[str] = "EAC"
    time_col: Optional[str] = None
    save_model: bool = True
    device: str = "auto"                                # "cpu" | "cuda" | "auto"

class PredictRequest(BaseModel):
    source_type: str   # "raw" 或 "cleaned"
    source_id: int
    artifact: Optional[str] = None
    model_id: Optional[str] = None
    trained_at: Optional[str] = None
    rows: Optional[List[Dict[str, Any]]] = None
