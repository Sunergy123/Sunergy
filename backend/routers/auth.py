import random
import string
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.responses import HTMLResponse  # <--- 重要：新增這個匯入
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
import secrets
import models, schemas, database

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# --- SMTP 設定 ---
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = "sunergylab123@gmail.com" 
SMTP_PASS = "jejlxoedhlacqbhq"  

# 專門寄送 HTML 驗證連結的函式
def send_html_email(to_email: str, subject: str, html_content: str):
    msg = MIMEText(html_content, "html", "utf-8") # 指定格式為 html
    msg["Subject"] = subject
    msg["From"] = SMTP_USER
    msg["To"] = to_email

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
        server.set_debuglevel(1)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS.replace(" ", ""))
        server.send_message(msg)
        server.quit()
    except Exception as e:
        print(f"SMTP Error: {e}")
        raise RuntimeError(f"郵件發送失敗: {e}")

# --- Pydantic 輔助格式 ---
class EmailRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    verification_code: str
    new_password: str

# --- API 路由 ---

@router.post("/register")
def register(user: schemas.RegisterUser, db: Session = Depends(database.get_db)):
    # 1. 檢查帳號重複
    exists = db.query(models.User).filter(models.User.user_account == user.user_account.lower()).first()
    if exists:
        raise HTTPException(status_code=400, detail="此電子信箱已被註冊")

    # 2. 產生驗證 Token (有效期限 24 小時)
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=24)

    # 3. 建立使用者 (初始為未驗證)
    new_user = models.User(
        user_name=user.user_name,
        user_account=user.user_account.lower(),
        user_pw=pwd_context.hash(user.user_pw),
        email_verified=False,
        verify_token=token,
        verify_token_expires_at=expires
    )
    db.add(new_user)
    db.commit()

    # 4. 寄送 HTML 驗證信
    verify_link = f"http://127.0.0.1:8000/auth/verify-email?token={token}"
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #333; text-align: center;">歡迎加入日光預 Sunergy</h2>
        <p style="font-size: 16px; color: #555;">感謝您註冊帳號。請點擊下方按鈕以完成電子信箱驗證：</p>
        <div style="text-align: center; margin: 30px 0;">
            <a href="{verify_link}" style="background-color: #FACC15; color: #000; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 5px; display: inline-block;">驗證電子信箱</a>
        </div>
        <p style="font-size: 14px; color: #999;">此連結將於 24 小時後失效。如果按鈕無法點擊，請複製以下連結至瀏覽器貼上：<br>{verify_link}</p>
    </div>
    """
    
    try:
        send_html_email(user.user_account, "日光預 - 帳號驗證", html_content)
        return {"message": "註冊成功！請至信箱點擊驗證連結以啟用帳號"}
    except Exception as e:
        # 若信件寄送失敗，可以考慮把剛建立的 user 刪除，避免產生無法驗證的死帳號
        db.delete(new_user)
        db.commit()
        print(f"Mail error: {e}")
        raise HTTPException(status_code=500, detail="驗證信寄送失敗，請確認信箱是否正確")

# 驗證 Email 的 API (使用者點擊信件連結後會觸發這支 API)
@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.verify_token == token).first()
    
    # 失敗的情況
    if not user:
        return HTMLResponse("""
            <div style='text-align: center; margin-top: 50px; font-family: sans-serif;'>
                <h2 style='color: red;'>驗證連結無效或已失效</h2>
                <p>請嘗試重新註冊或聯繫管理員。</p>
            </div>
        """, status_code=400)
    
    # 過期的情況
    if user.verify_token_expires_at < datetime.utcnow():
        return HTMLResponse("""
            <div style='text-align: center; margin-top: 50px; font-family: sans-serif;'>
                <h2 style='color: red;'>驗證連結已過期</h2>
                <p>請重新註冊以取得新的驗證連結。</p>
            </div>
        """, status_code=400)

    # 驗證成功邏輯
    user.email_verified = True
    user.verify_token = None
    db.commit()
    
    # 設定跳轉的目標網址 (通常 React 是 3000 埠)
    frontend_login_url = "http://localhost:3000" 

    return HTMLResponse(f"""
        <div style='text-align: center; margin-top: 50px; font-family: sans-serif;'>
            <h2 style='color: #4CAF50;'>信箱驗證成功！</h2>
            <p>即將在 <span id="countdown">3</span> 秒後自動跳轉至登入頁面...</p>
            <p>如果沒有自動跳轉，請 <a href="{frontend_login_url}">點擊此處</a>。</p>
        </div>
        <script>
            let seconds = 3;
            const countdownEl = document.getElementById('countdown');
            const interval = setInterval(() => {{
                seconds--;
                countdownEl.innerText = seconds;
                if (seconds <= 0) {{
                    clearInterval(interval);
                    window.location.href = "{frontend_login_url}";
                }}
            }}, 1000);
        </script>
    """)
# 3. 登入
@router.post("/login")
async def login(payload: schemas.LoginUser, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.user_account == payload.user_account.lower()).first()
    if not user:
        raise HTTPException(status_code=400, detail="帳號不存在")
    
    if not pwd_context.verify(payload.user_pw, user.user_pw):
        raise HTTPException(status_code=400, detail="密碼錯誤")

    return {
        "message": "登入成功",
        "user_id": user.user_id,
        "user_name": user.user_name,
        "user_account": user.user_account
    }

# 4. 忘記密碼 (重設密碼)
@router.post("/forgot-password/send-code")
def forgot_password_send_code(request: schemas.ForgotPasswordSendCodeRequest, db: Session = Depends(database.get_db)):
    # 1. 尋找使用者
    user = db.query(models.User).filter(models.User.user_account == request.user_account.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="找不到此電子信箱")

    # 2. 生成 6 位數代碼並寫入 User 資料表
    code = ''.join(random.choices(string.digits, k=6))
    user.reset_code = code
    user.reset_code_expires_at = datetime.utcnow() + timedelta(minutes=10) # 10分鐘有效
    user.reset_code_verified = False
    db.commit()

    # 3. 寄出 HTML 驗證信
    html_content = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #333; text-align: center;">重設密碼驗證碼</h2>
        <p style="font-size: 16px; color: #555;">您正在嘗試重設日光預的密碼。請在網頁中輸入以下 6 位數驗證碼：</p>
        <div style="text-align: center; margin: 30px 0;">
            <span style="background-color: #FACC15; color: #000; padding: 12px 24px; font-size: 24px; font-weight: bold; letter-spacing: 5px; border-radius: 5px;">{code}</span>
        </div>
        <p style="font-size: 14px; color: #999;">此驗證碼將於 10 分鐘後失效。若非本人操作，請忽略此信。</p>
    </div>
    """
    try:
        send_html_email(user.user_account, "日光預 - 重設密碼驗證碼", html_content)
        return {"message": "驗證碼已寄出"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="寄信失敗，請稍後再試")


@router.post("/forgot-password/verify-code")
def forgot_password_verify_code(request: schemas.ForgotPasswordVerifyCodeRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.user_account == request.user_account.lower()).first()
    
    if not user or user.reset_code != request.code:
        raise HTTPException(status_code=400, detail="驗證碼錯誤")
    
    if user.reset_code_expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="驗證碼已過期，請重新獲取")

    # 驗證成功，標記為已驗證
    user.reset_code_verified = True
    db.commit()
    return {"message": "驗證成功"}


@router.post("/forgot-password/reset")
def forgot_password_reset(request: schemas.ForgotPasswordResetRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.user_account == request.user_account.lower()).first()
    
    # 確保使用者存在，且已經通過了 verify-code 步驟
    if not user or not user.reset_code_verified:
        raise HTTPException(status_code=400, detail="未通過驗證或驗證已失效")

    # 更新密碼並清空重設紀錄
    user.user_pw = pwd_context.hash(request.new_password)
    user.reset_code = None
    user.reset_code_expires_at = None
    user.reset_code_verified = False
    db.commit()
    
    return {"message": "密碼重設成功"}

@router.post("/change-password")
def change_password(request: schemas.ChangePasswordRequest, db: Session = Depends(database.get_db)):
    # 1. 尋找使用者
    user = db.query(models.User).filter(models.User.user_id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="找不到使用者")

    # 2. 驗證舊密碼是否正確
    if not pwd_context.verify(request.old_pw, user.user_pw):
        raise HTTPException(status_code=400, detail="舊密碼輸入錯誤，請重新確認")

    # 3. 加密新密碼並存入資料庫
    user.user_pw = pwd_context.hash(request.new_pw)
    db.commit()
    
    return {"message": "密碼修改成功！"}