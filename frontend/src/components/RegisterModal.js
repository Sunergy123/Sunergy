import React, { useState } from 'react';

export default function RegisterModal({ onClose, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    user_name: '',
    user_account: '',
    user_pw: '',
    confirm_pw: ''
  });

  const [isRegistering, setIsRegistering] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (formData.user_pw !== formData.confirm_pw) {
      alert("密碼不一致");
      return;
    }

    setIsRegistering(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          user_name: formData.user_name,
          user_account: formData.user_account.toLowerCase(),
          user_pw: formData.user_pw
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alert("註冊成功！請至您的信箱點擊驗證連結以啟用帳號。");
        onSwitchToLogin(); // 註冊成功後切換回登入畫面
      } else {
        alert(data.detail || "註冊失敗");
      }
    } catch (error) {
      alert("無法連接到伺服器");
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-[500px] overflow-hidden rounded-2xl border border-white/10 bg-[#1E1E1E] p-8 shadow-2xl">
        <button className="absolute right-4 top-4 text-white/40 hover:text-white" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>
        
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-3xl">wb_sunny</span>
          </div>
          <h2 className="text-2xl font-bold text-white">加入日光預</h2>
          <p className="mt-1 text-sm text-white/50">建立帳號以管理您的太陽能案場</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {/* 使用者名稱 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">使用者名稱</label>
            <input
              type="text"
              name="user_name"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="您的姓名"
              onChange={handleChange}
              required
            />
          </div>

          {/* 電子信箱 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">電子信箱</label>
            <input
              type="email"
              name="user_account"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              placeholder="example@gmail.com"
              onChange={handleChange}
              required
            />
          </div>

          {/* 密碼 */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">設定密碼</label>
              <input
                type="password"
                name="user_pw"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/70">確認密碼</label>
              <input
                type="password"
                name="confirm_pw"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isRegistering}
            className="mt-2 w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-black shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:bg-primary/90 active:translate-y-0 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isRegistering ? "處理中..." : "立即註冊"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-white/40">
            已有帳號？ <span className="cursor-pointer font-medium text-primary hover:underline" onClick={onSwitchToLogin}>返回登入</span>
          </p>
        </div>
      </div>
    </div>
  );
}