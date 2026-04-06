from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from datetime import datetime, timedelta
from email.mime.text import MIMEText
import os
import secrets
import smtplib
import random

from database import get_db
from models import User
from schemas import (
    RegisterUser,
    LoginUser,
    ForgotPasswordSendCodeRequest,
    ForgotPasswordVerifyCodeRequest,
    ForgotPasswordResetRequest,
)

router = APIRouter(prefix="/auth", tags=["Auth"])
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def send_email(to_email: str, subject: str, html: str):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        raise RuntimeError("SMTP 設定未完成，請先設定 .env")

    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, [to_email], msg.as_string())


def generate_verify_token():
    return secrets.token_urlsafe(32)


def generate_reset_code():
    return str(random.randint(100000, 999999))


@router.post("/register")
def register(user: RegisterUser, db: Session = Depends(get_db)):
    email = user.user_account.lower().strip()

    exists = db.query(User).filter(User.user_account == email).first()
    if exists:
        raise HTTPException(status_code=400, detail="此電子信箱已被註冊")

    hashed_pw = pwd_context.hash(user.user_pw)
    verify_token = generate_verify_token()

    new_user = User(
        user_name=user.user_name,
        user_account=email,
        user_pw=hashed_pw,
        email_verified=False,
        verify_token=verify_token,
        verify_token_expires_at=datetime.utcnow() + timedelta(hours=24),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    verify_link = f"{BACKEND_URL}/auth/verify-email?token={verify_token}"

    try:
        send_email(
            to_email=email,
            subject="Sunergy 帳號驗證信",
            html=f"""
            <h2>歡迎註冊 Sunergy</h2>
            <p>請點擊下方連結完成信箱驗證：</p>
            <p><a href="{verify_link}">{verify_link}</a></p>
            <p>此連結將於 24 小時後失效。</p>
            """,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"帳號已建立，但驗證信寄送失敗：{str(e)}")

    return {
        "message": "註冊成功，請至信箱收取驗證信後再登入",
        "user_id": new_user.user_id,
    }


@router.get("/verify-email", response_class=HTMLResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.verify_token == token).first()

    if not user:
        return HTMLResponse("<h2>驗證連結無效</h2>", status_code=400)

    if not user.verify_token_expires_at or user.verify_token_expires_at < datetime.utcnow():
        return HTMLResponse("<h2>驗證連結已過期，請重新註冊或重新發送驗證信</h2>", status_code=400)

    user.email_verified = True
    user.verify_token = None
    user.verify_token_expires_at = None
    db.commit()

    return HTMLResponse("""
        <h2>信箱驗證成功</h2>
        <p>你現在可以回到 Sunergy 登入。</p>
    """)


@router.post("/login")
def login(user: LoginUser, db: Session = Depends(get_db)):
    email = user.user_account.lower().strip()
    u = db.query(User).filter(User.user_account == email).first()

    if not u or not pwd_context.verify(user.user_pw, u.user_pw):
        raise HTTPException(status_code=400, detail="電子信箱或密碼錯誤")

    if not u.email_verified:
        raise HTTPException(status_code=403, detail="此帳號尚未完成信箱驗證，請先至信箱點擊驗證連結")

    return {
        "message": "登入成功",
        "user_id": u.user_id,
        "user_name": u.user_name,
        "user_account": u.user_account,
    }


@router.post("/forgot-password/send-code")
def forgot_password_send_code(payload: ForgotPasswordSendCodeRequest, db: Session = Depends(get_db)):
    email = payload.user_account.lower().strip()
    user = db.query(User).filter(User.user_account == email).first()

    if user:
        code = generate_reset_code()
        user.reset_code = code
        user.reset_code_expires_at = datetime.utcnow() + timedelta(minutes=10)
        user.reset_code_verified = False
        db.commit()

        try:
            send_email(
                to_email=email,
                subject="Sunergy 忘記密碼驗證碼",
                html=f"""
                <h2>Sunergy 忘記密碼驗證</h2>
                <p>您的驗證碼為：</p>
                <h1 style="letter-spacing: 4px;">{code}</h1>
                <p>此驗證碼將於 10 分鐘後失效。</p>
                """,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"驗證碼寄送失敗：{str(e)}")

    return {"message": "若該信箱存在，系統已寄出驗證碼"}


@router.post("/forgot-password/verify-code")
def forgot_password_verify_code(payload: ForgotPasswordVerifyCodeRequest, db: Session = Depends(get_db)):
    email = payload.user_account.lower().strip()
    user = db.query(User).filter(User.user_account == email).first()

    if not user:
        raise HTTPException(status_code=400, detail="驗證碼錯誤或帳號不存在")

    if not user.reset_code or not user.reset_code_expires_at:
        raise HTTPException(status_code=400, detail="尚未申請驗證碼")

    if user.reset_code_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="驗證碼已過期")

    if user.reset_code != payload.code.strip():
        raise HTTPException(status_code=400, detail="驗證碼錯誤")

    user.reset_code_verified = True
    db.commit()

    return {"message": "驗證成功"}


@router.post("/forgot-password/reset")
def forgot_password_reset(payload: ForgotPasswordResetRequest, db: Session = Depends(get_db)):
    email = payload.user_account.lower().strip()
    user = db.query(User).filter(User.user_account == email).first()

    if not user:
        raise HTTPException(status_code=400, detail="帳號不存在")

    if not user.reset_code_verified:
        raise HTTPException(status_code=403, detail="請先完成驗證碼驗證")

    user.user_pw = pwd_context.hash(payload.new_password)
    user.reset_code = None
    user.reset_code_expires_at = None
    user.reset_code_verified = False
    db.commit()

    return {"message": "密碼已重設成功，請使用新密碼登入"}