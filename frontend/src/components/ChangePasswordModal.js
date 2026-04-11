import React, { useState } from 'react';

export default function ChangePasswordModal({ onClose }) {
  const [formData, setFormData] = useState({
    old_pw: '',
    new_pw: '',
    confirm_new_pw: ''
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setMsg('');

    // 檢查新密碼一致性
    if (formData.new_pw !== formData.confirm_new_pw) {
      setMsg("新密碼與確認密碼不一致");
      return;
    }

    const userId = localStorage.getItem("user_id");
    if (!userId) {
      setMsg("連線逾時，請重新登入");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8000/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: parseInt(userId),
          old_pw: formData.old_pw,
          new_pw: formData.new_pw
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alert("密碼修改成功！");
        onClose();
      } else {
        setMsg(data.detail || "修改失敗");
      }
    } catch (error) {
      setMsg("無法連接至伺服器");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#1E1E1E] p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button className="absolute right-4 top-4 text-white/40 hover:text-white" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-3xl">lock</span>
          </div>
          <h2 className="text-2xl font-bold text-white">修改密碼</h2>
          <p className="mt-1 text-sm text-white/50">為了您的帳號安全，請定期更換密碼</p>
        </div>

        {msg && (
          <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-center text-sm font-medium text-red-400 border border-red-500/20">
            {msg}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">目前的密碼</label>
            <input
              type="password"
              name="old_pw"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              required
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">新密碼</label>
            <input
              type="password"
              name="new_pw"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              required
              onChange={handleChange}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/70">確認新密碼</label>
            <input
              type="password"
              name="confirm_new_pw"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              required
              onChange={handleChange}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-black shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "更新中..." : "確認修改"}
          </button>
        </form>
      </div>
    </div>
  );
}