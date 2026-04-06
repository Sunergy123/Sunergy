import React, { useState } from "react";

export default function ForgotPasswordModal({ onClose }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/forgot-password/send-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_account: email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data.detail || "寄送失敗");
        return;
      }

      setMsg(data.message || "驗證碼已寄出");
      setStep(2);
    } catch {
      setMsg("伺服器連線錯誤");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/forgot-password/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_account: email,
          code: code,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data.detail || "驗證失敗");
        return;
      }

      setMsg(data.message || "驗證成功");
      setStep(3);
    } catch {
      setMsg("伺服器連線錯誤");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setMsg("");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/forgot-password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_account: email,
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMsg(data.detail || "重設失敗");
        return;
      }

      setMsg(data.message || "密碼重設成功");

      setTimeout(() => {
        onClose?.();
      }, 1200);
    } catch {
      setMsg("伺服器連線錯誤");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-background-dark p-8 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-white/70"
        >
          ✕
        </button>

        <h2 className="text-2xl font-bold text-white mb-4">忘記密碼</h2>

        {msg && <p className="text-red-400 mb-3">{msg}</p>}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-white/80 text-sm">電子信箱</label>
              <input
                type="email"
                className="w-full rounded-lg bg-white/10 px-4 py-3 text-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="請輸入註冊信箱"
              />
            </div>

            <button
              onClick={sendCode}
              disabled={loading}
              className="w-full rounded-lg bg-primary py-3 text-background-dark font-bold"
            >
              寄出驗證碼
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-white/80 text-sm">驗證碼</label>
              <input
                type="text"
                className="w-full rounded-lg bg-white/10 px-4 py-3 text-white"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="請輸入信箱中的 6 碼驗證碼"
              />
            </div>

            <button
              onClick={verifyCode}
              disabled={loading}
              className="w-full rounded-lg bg-primary py-3 text-background-dark font-bold"
            >
              驗證
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-white/80 text-sm">新密碼</label>
              <input
                type="password"
                className="w-full rounded-lg bg-white/10 px-4 py-3 text-white"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="請輸入新密碼"
              />
            </div>

            <button
              onClick={resetPassword}
              disabled={loading}
              className="w-full rounded-lg bg-primary py-3 text-background-dark font-bold"
            >
              重設密碼
            </button>
          </div>
        )}
      </div>
    </div>
  );
}