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
    if (!email) return setMsg("請輸入電子信箱");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/forgot-password/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_account: email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.detail || "寄送失敗");
        return;
      }
      setMsg(""); // 清空錯誤
      alert(data.message || "驗證碼已寄出！");
      setStep(2);
    } catch {
      setMsg("伺服器連線錯誤");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setMsg("");
    if (!code) return setMsg("請輸入驗證碼");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/forgot-password/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_account: email, code: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.detail || "驗證失敗");
        return;
      }
      setMsg("");
      setStep(3);
    } catch {
      setMsg("伺服器連線錯誤");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    setMsg("");
    if (!newPassword) return setMsg("請輸入新密碼");
    setLoading(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_account: email, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.detail || "重設失敗");
        return;
      }
      
      alert("密碼重設成功！請使用新密碼登入。");
      onClose?.();
    } catch {
      setMsg("伺服器連線錯誤");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#1E1E1E] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white">
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-3xl">lock_reset</span>
          </div>
          <h2 className="text-2xl font-bold text-white">忘記密碼</h2>
          <p className="mt-1 text-sm text-white/50">
            {step === 1 && "請輸入您的註冊信箱以獲取驗證碼"}
            {step === 2 && "請輸入您信箱收到的 6 位數驗證碼"}
            {step === 3 && "請設定您的新密碼"}
          </p>
        </div>

        {msg && <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-center text-sm font-medium text-red-400 border border-red-500/20">{msg}</div>}

        <div className="space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/70">電子信箱</label>
                <input
                  type="email"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                />
              </div>
              <button onClick={sendCode} disabled={loading} className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-black shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:bg-primary/90 disabled:opacity-50">
                {loading ? "寄送中..." : "寄出驗證碼"}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/70">驗證碼</label>
                <input
                  type="text"
                  maxLength="6"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 text-center tracking-widest focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="------"
                />
              </div>
              <button onClick={verifyCode} disabled={loading} className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-black shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:bg-primary/90 disabled:opacity-50">
                {loading ? "驗證中..." : "確認驗證碼"}
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/70">新密碼</label>
                <input
                  type="password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="請輸入新密碼"
                />
              </div>
              <button onClick={resetPassword} disabled={loading} className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-black shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:bg-primary/90 disabled:opacity-50">
                {loading ? "處理中..." : "重設密碼"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}