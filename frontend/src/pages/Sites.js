import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";

const API_BASE_URL = "http://localhost:8000";

export default function Sites({
  onNavigateToDashboard,
  onNavigateToPredict,
  onNavigateToSites,
  onLogout,
  onNavigateToModelMgmt,
  onNavigateToTrain,
  onOpenCreateSite,
  onOpenEditSite,
  onNavigateToChangePassword,
  onSelectSite,
  user,
}) {
  const [sites, setSites] = useState([]);
  const [expandedSiteId, setExpandedSiteId] = useState(null);
  const [selectedSiteIds, setSelectedSiteIds] = useState([]);
  const [confirmSiteId, setConfirmSiteId] = useState(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false); // ✅ 新增

  /* ===============================
     讀取案場列表
  =============================== */
  useEffect(() => {
    if (!user) return;

    const loadSites = () => {
      fetch(`${API_BASE_URL}/site/list?user_id=${user.user_id}`)
        .then((res) => res.json())
        .then(setSites)
        .catch(console.error);
    };

    loadSites();
    window.addEventListener("site-updated", loadSites);

    return () => {
      window.removeEventListener("site-updated", loadSites);
    };
  }, [user]);

  const toggleExpand = (id) => {
    setExpandedSiteId(expandedSiteId === id ? null : id);
  };

  const toggleSelect = (id) => {
    setSelectedSiteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleEditSiteSubmit = async (payload) => {
    try {
      const res = await fetch(`${API_BASE_URL}/site/${payload.site_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          site_code: payload.site_code,
          site_name: payload.site_name,
          location: payload.location,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "更新失敗");
      }

      // ✅ 關鍵：更新 sites state（React 才會立刻 re-render）
      setSites((prev) =>
        prev.map((s) =>
          s.site_id === payload.site_id
            ? {
                ...s,
                site_code: payload.site_code,
                site_name: payload.site_name,
                location: payload.location,
              }
            : s
        )
      );

      // ✅ 關閉編輯 Modal（一定要）
      onOpenEditSite(null);

    } catch (err) {
      throw err; // 給 Modal 顯示紅字錯誤
    }
  };

  /* ===============================
     批次刪除（只開 Modal）
  =============================== */
  const handleBatchDelete = () => {
    if (selectedSiteIds.length === 0) return;
    setConfirmBatchDelete(true);
  };

  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col">
      <Navbar
        activePage="sites"
        onNavigateToDashboard={onNavigateToDashboard}
        onNavigateToPredict={onNavigateToPredict}
        onNavigateToSites={onNavigateToSites}
        onNavigateToTrain={onNavigateToTrain}
        onNavigateToModelMgmt={onNavigateToModelMgmt}
        onNavigateToChangePassword={onNavigateToChangePassword}
        onLogout={onLogout}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto p-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
           <div>
            <h1 className="text-3xl font-bold tracking-tight">案場管理中心</h1>
            <p className="text-white/40 text-sm mt-1">新增刪除修改所有已建立的案場</p>
          </div>

          <button
            onClick={onOpenCreateSite}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-bold text-background-dark hover:scale-105 transition"
          >
            <span className="material-symbols-outlined">add</span>
            新增案場
          </button>
        </div>

        {/* List */}
        <div className="flex flex-col gap-4">
          {sites.map((site) => (
            <div
              key={site.site_id}
              className={`rounded-xl border transition ${
                expandedSiteId === site.site_id
                  ? "border-primary/50 bg-white/[.02]"
                  : "border-white/10 bg-white/[.01]"
              }`}
            >
              {/* 卡片標頭 */}
              <div className="flex items-center justify-between p-6">
                <div className="flex items-center gap-6">
                  {/* Checkbox */}
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedSiteIds.includes(site.site_id)}
                      onChange={() => toggleSelect(site.site_id)}
                      className="peer size-5 cursor-pointer appearance-none rounded
                                border border-white/30 bg-transparent
                                checked:border-primary checked:bg-primary"
                    />
                    <span
                      className="pointer-events-none material-symbols-outlined
                                absolute left-1/2 top-1/2
                                -translate-x-1/2 -translate-y-1/2
                                text-background-dark opacity-0
                                peer-checked:opacity-100
                                !text-base font-bold"
                    >
                      check
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="material-symbols-outlined !text-3xl">
                        solar_power
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold">{site.site_name}</h3>
                      <p className="text-sm text-white/50">
                        {site.location}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 操作 */}
                <div className="flex items-center gap-3">
                  {/* 👁 查看 / 訓練 */}
                  <button
                    onClick={() => {
                      localStorage.setItem("selectedSiteId", String(site.site_id));
                      localStorage.setItem("selectedSiteName", site.site_name);
                      onSelectSite?.(site);
                      onNavigateToTrain();
                    }}
                    className="material-symbols-outlined text-white/60 hover:text-primary transition"
                  >
                    visibility
                  </button>

                  {/* ✏️ 編輯 */}
                  <button
                    onClick={() => onOpenEditSite?.(site)}
                    className="material-symbols-outlined text-white/60 hover:text-primary transition"
                  >
                    edit
                  </button>

                  {/* ⬇️ 展開 */}
                  <button
                    onClick={() => toggleExpand(site.site_id)}
                    className={`material-symbols-outlined transition ${
                      expandedSiteId === site.site_id ? "rotate-180" : ""
                    }`}
                  >
                    expand_more
                  </button>
                </div>
              </div>

              {/* 展開 */}
              {expandedSiteId === site.site_id && (
                <div className="border-t border-white/10 p-6">
                  <div className="grid md:grid-cols-3 gap-6 mb-6">
                    <div>
                      <p className="text-xs text-white/40">地點</p>
                      <p>{site.location}</p>
                    </div>

                    <div>
                      <p className="text-xs text-white/40">案場代號</p>
                      <p className="font-mono">{site.site_code}</p>
                    </div>

                    <div>
                      <p className="text-xs text-white/40">建立時間</p>
                      <p className="font-mono">
                        {new Date(site.created_at).toLocaleDateString("zh-TW")}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setConfirmSiteId(site.site_id)}
                      className="px-4 py-2 text-xs border border-red-400/50 text-red-400 rounded"
                    >
                      刪除案場
                    </button>

                    {/* <button
                      onClick={() => {
                        // 1. 先將選擇的案場 ID 存入快取，讓後續流程知道要用哪個案場
                        localStorage.setItem("lastSelectedSite", site.site_id);
                        // 2. 導向訓練流程的第一步 (data-guide)
                        onNavigateToTrain(); 
                      }}
                      className="px-4 py-2 text-xs bg-primary text-background-dark font-bold rounded hover:scale-105 transition"
                    >
                      以此案場進行訓練模型 →
                    </button> */}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* 單筆刪除 Modal */}
      {confirmSiteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1E1E1E] rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-2">確認刪除</h3>
            <p className="text-sm text-white/60 mb-6">
              確定要刪除此案場嗎？此操作無法復原。
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmSiteId(null)}
                className="px-4 py-2 bg-white/10 rounded"
              >
                取消
              </button>

              <button
                onClick={async () => {
                  console.log("API_BASE_URL =", API_BASE_URL);
                  console.log("confirmSiteId =", confirmSiteId);

                  if (!confirmSiteId) {
                    alert("confirmSiteId 是空的");
                    return;
                  }

                  try {
                    const url = `${API_BASE_URL}/site/${confirmSiteId}`;
                    console.log("DELETE URL =", url);

                    const res = await fetch(url, {
                      method: "DELETE",
                      headers: {
                        "Content-Type": "application/json",
                      },
                    });

                    console.log("DELETE status =", res.status);

                    if (!res.ok) {
                      const text = await res.text();
                      console.error("DELETE failed:", text);
                      alert(`刪除失敗 (${res.status})`);
                      return;
                    }

                    const data = await res.json();
                    console.log("DELETE success:", data);

                    // ✅ 只有後端真的成功，才更新前端
                    setSites((prev) =>
                      prev.filter((s) => s.site_id !== confirmSiteId)
                    );
                    setConfirmSiteId(null);

                  } catch (err) {
                    console.error("FETCH ERROR:", err);
                    alert("fetch 失敗，請看 console");
                  }
                }}
                className="px-4 py-2 bg-red-500 rounded font-bold"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/*  批次刪除 Modal（重點） */}
      {confirmBatchDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1E1E1E] rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-2 text-red-400">
              確認批次刪除
            </h3>

            <p className="text-sm text-white/60 mb-6">
              確定要刪除
              <span className="text-primary font-bold mx-1">
                {selectedSiteIds.length}
              </span>
              個案場嗎？<br />
              此操作無法復原。
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmBatchDelete(false)}
                className="px-4 py-2 bg-white/10 rounded"
              >
                取消
              </button>

              <button
                onClick={async () => {
                  try {
                    await Promise.all(
                      selectedSiteIds.map(async (id) => {
                        const res = await fetch(`${API_BASE_URL}/site/${id}`, {
                          method: "DELETE",
                          headers: {
                            "Content-Type": "application/json",
                          },
                        });

                        if (!res.ok) {
                          throw new Error(`刪除失敗 site_id=${id}`);
                        }
                      })
                    );

                    setSites((prev) =>
                      prev.filter((s) => !selectedSiteIds.includes(s.site_id))
                    );
                    setSelectedSiteIds([]);
                    setConfirmBatchDelete(false);

                  } catch (err) {
                    console.error(err);
                    alert("批次刪除失敗，請看 console");
                  }
                }}
                className="px-4 py-2 bg-red-500 rounded font-bold"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 3. Footer */}
      <footer className="p-8 text-center text-white/10 text-[10px] font-bold uppercase tracking-[0.4em]">
        © 2025 SUNERGY ANALYTICS CENTER
      </footer>
      {/* Sticky Footer */}
      {selectedSiteIds.length > 0 && (
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="text-sm">
              已選取
              <span className="text-primary font-bold mx-1">
                {selectedSiteIds.length}
              </span>
              個案場
            </div>

            {selectedSiteIds.length >= 1 && (
              <div className="fixed bottom-0 left-0 w-full z-50">
                <div className="w-full bg-background-dark/95 backdrop-blur border-t border-white/10 px-8 py-4 flex items-center justify-between">

                  {/* 左側 */}
                  <div className="flex items-center gap-6">
                    <p className="text-white">
                      已選擇 <span className="text-primary font-bold">{selectedSiteIds.length}</span> 個案場
                    </p>

                    <button
                      onClick={() => setSelectedSiteIds(sites.map(s => s.site_id))}
                      className="text-sm text-white/60 hover:text-white underline"
                    >
                      全選
                    </button>

                    <button
                      onClick={() => setSelectedSiteIds([])}
                      className="text-sm text-white/60 hover:text-white underline"
                    >
                      取消選取
                    </button>
                  </div>

                  {/* 右側 */}
                  <button
                    onClick={() => setConfirmBatchDelete(true)}
                    className="px-6 py-2 bg-red-500 rounded-lg text-sm font-bold hover:bg-red-600"
                  >
                    刪除選取項目
                  </button>

                </div>
              </div>
            )}
          </div>
      )}
    </div>
  );
}
