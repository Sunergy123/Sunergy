from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List


class RegisterUser(BaseModel):
    user_name: str
    user_account: EmailStr
    user_pw: str


class LoginUser(BaseModel):
    user_account: EmailStr
    user_pw: str


class ForgotPasswordSendCodeRequest(BaseModel):
    user_account: EmailStr


class ForgotPasswordVerifyCodeRequest(BaseModel):
    user_account: EmailStr
    code: str


class ForgotPasswordResetRequest(BaseModel):
    user_account: EmailStr
    new_password: str


# ===== Site =====
class CreateSite(BaseModel):
    site_code: str
    site_name: str
    location: str
    user_id: int


# ===== Data Process =====
class ProcessRequest(BaseModel):
    upload_id: int
    method: str
    params: Optional[Dict[str, Any]] = None


# ===== Update =====
class UpdateSite(BaseModel):
    site_code: str | None = None
    site_name: str | None = None
    location: str | None = None


# ===== Train =====
class TrainRequest(BaseModel):
    source_type: str
    source_id: int
    split_ratio: float = 0.8
    split_method: str = "random"
    models: List[str]
    strategy: str = "grid"
    params: Optional[Dict[str, Any]] = None
    features: Optional[List[str]] = None
    target: Optional[str] = "EAC"
    time_col: Optional[str] = None
    save_model: bool = True
    device: str = "auto"


class PredictRequest(BaseModel):
    source_type: str
    source_id: int
    artifact: Optional[str] = None
    model_id: Optional[str] = None
    trained_at: Optional[str] = None
    rows: Optional[List[Dict[str, Any]]] = None