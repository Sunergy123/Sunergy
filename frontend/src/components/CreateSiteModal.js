// src/components/CreateSiteModal.js
import React, { useState, useEffect } from "react";

export default function CreateSiteModal({ onClose, onSubmit }) {
  // 防止點擊內部時關閉
  const handleModalClick = (e) => {
    e.stopPropagation();
  };

  // 表單資料
  const [formData, setFormData] = useState({
    site_code: "",
    site_name: "",
    location: "",
    capacity_kwp: "",
  });

  // 錯誤訊息（⭐ 關鍵）
  const [msg, setMsg] = useState("");

  // Modal 打開時重置
  useEffect(() => {
    setFormData({
      site_code: "",
      site_name: "",
      location: "",
      capacity_kwp: "",
    });
    setMsg("");
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.id]: e.target.value,
    });
  };

  const handleSubmit = async () => {
    setMsg("");

    // ✅ 前端基本驗證（體驗好）
    if (!formData.site_code || !formData.site_name || !formData.location) {
      setMsg("請完整填寫案場代號、案場名稱與地點");
      return;
    }

    // kWp 可選；若有填則需是正數
    let kwpVal = null;
    if (formData.capacity_kwp !== "" && formData.capacity_kwp !== null) {
      const n = Number(formData.capacity_kwp);
      if (!Number.isFinite(n) || n <= 0) {
        setMsg("裝置容量必須是大於 0 的數字");
        return;
      }
      kwpVal = n;
    }

    try {
      /**
       * ⭐ onSubmit 必須回傳：
       * - { success: true }
       * - 或 { success: false, message: "錯誤訊息" }
       */
      const result = await onSubmit({
        ...formData,
        capacity_kwp: kwpVal,
      });

      if (!result?.success) {
        setMsg(result?.message || "該案場已被建立");
        return;
      }

      // ✅ 成功就關閉
      onClose();
    } catch {
      setMsg("伺服器連線錯誤");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border border-white/10 bg-[#1E1E1E] p-6 shadow-2xl"
        onClick={handleModalClick}
      >
        {/* 標題 */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">建立新的案場</h2>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ❌ 錯誤訊息 */}
        {msg && (
          <p className="mb-4 text-sm text-red-400">
            {msg}
          </p>
        )}

        {/* 表單 */}
        <div className="flex flex-col gap-4">
          {/* 案場代號 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/80">案場代號</label>
            <input
              id="site_code"
              value={formData.site_code}
              onChange={handleChange}
              placeholder="例如：A001"
              className="rounded-lg bg-black/20 px-4 py-3 text-white placeholder-white/30 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          {/* 案場名稱 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/80">案場名稱</label>
            <input
              id="site_name"
              value={formData.site_name}
              onChange={handleChange}
              placeholder="請輸入案場名稱"
              className="rounded-lg bg-black/20 px-4 py-3 text-white placeholder-white/30 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          {/* 地點 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/80">地點</label>
            <input
              id="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="例如：嘉義縣太保市"
              className="rounded-lg bg-black/20 px-4 py-3 text-white placeholder-white/30 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>

          {/* 裝置容量 (kWp) — 用於物理式估算 */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-white/80">
              裝置容量 (kWp) <span className="text-white/40 text-xs">（選填，用於物理式估算）</span>
            </label>
            <input
              id="capacity_kwp"
              type="number"
              step="0.1"
              min="0"
              value={formData.capacity_kwp}
              onChange={handleChange}
              placeholder="例如：10"
              className="rounded-lg bg-black/20 px-4 py-3 text-white placeholder-white/30 border border-white/10 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>

        {/* 按鈕 */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleSubmit}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-background-dark hover:scale-105 transition-transform"
          >
            確認新增
          </button>
        </div>
      </div>
    </div>
  );
}
