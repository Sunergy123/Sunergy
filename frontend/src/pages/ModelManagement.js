import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';

export default function ModelManagement({
  onNavigateToDashboard,
  onNavigateToTrain,
  onNavigateToPredict,
  onNavigateToSites,
  onNavigateToModelMgmt,
  onNavigateToChangePassword,
  onLogout,
  activePage
}) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  // 搜尋 & 分頁
  const [searchQuery, setSearchQuery] = useState('');
  const PAGE_SIZE = 5;
  const [privatePage, setPrivatePage] = useState(1);
  const [publicPage, setPublicPage] = useState(1);


  const navProps = {
    onNavigateToDashboard,
    onNavigateToTrain,
    onNavigateToPredict,
    onNavigateToSites,
    onNavigateToModelMgmt,
    onNavigateToChangePassword,
    onLogout
  };

  useEffect(() => {
    fetchTrainedModels();
  }, []);

  const fetchTrainedModels = async () => {
    try {
      setLoading(true);

      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.user_id;

      if (!userId) {
        throw new Error('找不到登入資訊，請重新登入');
      }

      const res = await fetch(
        `http://127.0.0.1:8000/train/trained-models?user_id=${userId}`
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || '無法取得模型資料');
      }

      const data = await res.json();

      const mapped = data
        .sort((a, b) => b.model_id - a.model_id) 
        .map((item, index) => {
        const trainedDate = item.trained_at
          ? new Date(item.trained_at).toLocaleDateString('zh-TW')
          : '-';

        const metrics = {
          r2: item.r2,
          rmse: item.rmse,
          mae: item.mae,
          wmape: item.wmape
        };

        return {
          id: item.model_id,

          fileName: item.file_name || '未知檔案',

          siteDisplay:
            `${item.model_type || '-'}_${item.model_id} ` +
            (
              item.site_display ||
              (item.site_name && item.location
                ? `${item.site_name}[${item.location}]`
                : item.site_name
                  ? `[${item.site_name}]`
                  : '-')
            ),

          type: item.model_type || '-',

          date: item.trained_at
            ? new Date(item.trained_at).toLocaleString('zh-TW')
            : '-',

          metrics,

          isPublic: item.is_public,
        };
      });

      setModels(mapped);
    } catch (error) {
      console.error('取得模型列表失敗:', error);
      setModels([]);
      alert(error.message || '取得模型列表失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    // 公用模型前端也禁止刪除
    const model = models.find(m => m.id === id);
    if (model?.isPublic) {
      alert('公用模型不可刪除');
      return;
    }
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.user_id;

      const res = await fetch(
        `http://127.0.0.1:8000/train/trained-models/${id}?user_id=${userId}`,
        { method: 'DELETE' }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.detail || '刪除模型失敗');
      }

      setModels(prev => prev.filter(m => m.id !== id));
      setDeleteId(null);

    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.user_id;

      const res = await fetch(
        `http://127.0.0.1:8000/train/trained-models/batch-delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model_ids: selectedIds,
            user_id: userId
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || '批次刪除失敗');
      }

      setModels(prev =>
        prev.filter(m =>
          !(selectedIds.includes(m.id) && !m.isPublic)
        )
      );
      setSelectedIds([]);

    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  // 搜尋過濾（搜名稱、模型類型、檔名、日期）
  const filterModel = (model) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      model.siteDisplay.toLowerCase().includes(q) ||
      model.type.toLowerCase().includes(q) ||
      model.fileName.toLowerCase().includes(q) ||
      model.date.toLowerCase().includes(q)
    );
  };

  const privateModels = models.filter(m => !m.isPublic && filterModel(m));
  const publicModels  = models.filter(m =>  m.isPublic && filterModel(m));

  // 分頁計算
  const privateTotalPages = Math.max(1, Math.ceil(privateModels.length / PAGE_SIZE));
  const publicTotalPages  = Math.max(1, Math.ceil(publicModels.length  / PAGE_SIZE));
  const safePrivatePage = Math.min(privatePage, privateTotalPages);
  const safePublicPage  = Math.min(publicPage,  publicTotalPages);
  const privatePagedModels = privateModels.slice((safePrivatePage - 1) * PAGE_SIZE, safePrivatePage * PAGE_SIZE);
  const publicPagedModels  = publicModels.slice( (safePublicPage  - 1) * PAGE_SIZE, safePublicPage  * PAGE_SIZE);

  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col font-sans">
      <Navbar activePage="model-mgmt" {...navProps} />

      <main className="flex-1 w-full max-w-7xl mx-auto p-6 py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">模型管理中心</h1>
            <p className="text-white/40 text-sm mt-1">管理與追蹤所有已訓練完成的模型</p>
          </div>

          <div className="mt-4 md:mt-0 flex gap-4">
            <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-lg">
              <p className="text-[10px] text-white/40 uppercase font-bold">目前模型總數</p>
              <p className="text-xl font-black text-primary">{models.length}</p>
            </div>
          </div>
        </div>

        {/* 搜尋欄 */}
        <div className="mb-8">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-white/30 !text-xl pointer-events-none">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPrivatePage(1); setPublicPage(1); }}
              placeholder="搜尋模型名稱、類型、檔名…"
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-primary/50 focus:bg-white/[0.06] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setPrivatePage(1); setPublicPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
              >
                <span className="material-symbols-outlined !text-lg">close</span>
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-white/30 mt-2 pl-1">
              找到 {privateModels.length + publicModels.length} 筆結果（私人 {privateModels.length}、公用 {publicModels.length}）
            </p>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
            <p className="text-white/20 text-lg italic">資料載入中...</p>
          </div>
        ) : (
          <div className="space-y-10">

  {/* 我的模型 */}
  <section>
    <div className="flex items-center gap-3 mb-4">
      <span className="material-symbols-outlined text-primary">
        lock
      </span>

      <h2 className="text-xl font-bold">
        我的模型
      </h2>

      <span className="text-xs px-2 py-1 rounded bg-white/5 text-white/40">
        {privateModels.length} 筆
      </span>
      {searchQuery && privateModels.length !== models.filter(m => !m.isPublic).length && (
        <span className="text-xs text-primary/70">（已篩選）</span>
      )}
    </div>

    <div className="grid grid-cols-1 gap-4">
      {privateModels.length > 0 ? (
        privatePagedModels.map((model) => (
          <div
            key={model.id}
            className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between hover:bg-white/[0.04] transition-all group"
          >
            <div className="flex items-center gap-6">

              {/* checkbox */}
              <label className="cursor-pointer">
                <input
                  type="checkbox"
                  className="hidden"
                  checked={selectedIds.includes(model.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(prev => [...prev, model.id]);
                    } else {
                      setSelectedIds(prev =>
                        prev.filter(id => id !== model.id)
                      );
                    }
                  }}
                />

                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all
                  ${selectedIds.includes(model.id)
                    ? 'bg-primary border-primary'
                    : 'border-white/30 hover:border-white/60'}
                `}>
                  {selectedIds.includes(model.id) && (
                    <span className="material-symbols-outlined text-xs text-black">
                      check
                    </span>
                  )}
                </div>
              </label>

              <div className="size-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-background-dark transition-colors">
                <span className="material-symbols-outlined !text-3xl">
                  psychology
                </span>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">
                  {model.siteDisplay}
                </h3>

                <p className="text-xs text-white/40 mt-1.5 font-mono">
                  📄 {model.fileName} ｜ 🕒 {model.date}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between md:justify-end gap-10 mt-6 md:mt-0">

              <div className="text-right text-sm font-mono space-y-1">
                <p>R²：{model.metrics?.r2?.toFixed(3) ?? '-'}</p>
                <p>RMSE：{model.metrics?.rmse?.toFixed(3) ?? '-'}</p>
                <p>MAE：{model.metrics?.mae?.toFixed(3) ?? '-'}</p>
                <p className="text-yellow-400 font-bold">
                  WMAPE：{model.metrics?.wmape?.toFixed(4) ?? '-'}
                </p>
              </div>

              <div className="flex gap-2 border-l border-white/10 pl-6">

                {/* 查看 */}
                <button
                  title="查看詳情"
                  onClick={() => {
                    localStorage.setItem("predict_model_id", model.id);
                    onNavigateToPredict();
                  }}
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
                >
                  <span className="material-symbols-outlined">
                    visibility
                  </span>
                </button>

                {/* 刪除 */}
                <button
                  title="刪除模型"
                  onClick={() => setDeleteId(model.id)}
                  className="p-2.5 rounded-xl bg-red-500/5 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all"
                >
                  <span className="material-symbols-outlined">
                    delete
                  </span>
                </button>

              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="py-10 text-center border border-dashed border-white/10 rounded-2xl">
          <p className="text-white/30">
            {searchQuery ? '沒有符合搜尋條件的私人模型' : '尚無私人模型'}
          </p>
        </div>
      )}
    </div>

    {/* 私人模型分頁 */}
    {privateTotalPages > 1 && (
      <div className="flex items-center justify-center gap-2 mt-6">
        <button
          onClick={() => setPrivatePage(p => Math.max(1, p - 1))}
          disabled={safePrivatePage === 1}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
        >
          <span className="material-symbols-outlined !text-base align-middle">chevron_left</span>
        </button>
        {Array.from({ length: privateTotalPages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            onClick={() => setPrivatePage(p)}
            className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${safePrivatePage === p ? 'bg-primary text-black' : 'border border-white/10 text-white/40 hover:bg-white/5 hover:text-white'}`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => setPrivatePage(p => Math.min(privateTotalPages, p + 1))}
          disabled={safePrivatePage === privateTotalPages}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-white/40 hover:bg-white/5 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
        >
          <span className="material-symbols-outlined !text-base align-middle">chevron_right</span>
        </button>
        <span className="text-xs text-white/30 ml-2">{safePrivatePage} / {privateTotalPages} 頁</span>
      </div>
    )}
  </section>

  {/* 公用模型 */}
  <section>
    <div className="flex items-center gap-3 mb-4">
      <span className="material-symbols-outlined text-yellow-400">
        public
      </span>

      <h2 className="text-xl font-bold">
        公用模型
      </h2>

      <span className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-300 border border-yellow-500/20">
        {publicModels.length} 筆
      </span>
    </div>

    <div className="grid grid-cols-1 gap-4">
      {publicModels.length > 0 ? (
        publicPagedModels.map((model) => (
          <div
            key={model.id}
            className="bg-yellow-500/[0.03] border border-yellow-500/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between"
          >
            <div className="flex items-center gap-6">

              <div className="size-14 rounded-xl bg-yellow-500/10 text-yellow-300 flex items-center justify-center">
                <span className="material-symbols-outlined !text-3xl">
                  public
                </span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">
                    {model.siteDisplay}
                  </h3>

                  <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                    公用
                  </span>
                </div>

                <p className="text-xs text-white/40 mt-1.5 font-mono">
                  📄 {model.fileName} ｜ 🕒 {model.date}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-10 mt-6 md:mt-0">

              <div className="text-right text-sm font-mono space-y-1">
                <p>R²：{model.metrics?.r2?.toFixed(3) ?? '-'}</p>
                <p>RMSE：{model.metrics?.rmse?.toFixed(3) ?? '-'}</p>
                <p>MAE：{model.metrics?.mae?.toFixed(3) ?? '-'}</p>
                <p className="text-yellow-400 font-bold">
                  WMAPE：{model.metrics?.wmape?.toFixed(4) ?? '-'}
                </p>
              </div>

              <button
                title="查看詳情"
                onClick={() => {
                  localStorage.setItem("predict_model_id", model.id);
                  onNavigateToPredict();
                }}
                className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
              >
                <span className="material-symbols-outlined">
                  visibility
                </span>
              </button>

            </div>
          </div>
        ))
      ) : (
        <div className="py-10 text-center border border-dashed border-yellow-500/10 rounded-2xl">
          <p className="text-white/30">
            {searchQuery ? '沒有符合搜尋條件的公用模型' : '尚無公用模型'}
          </p>
        </div>
      )}
    </div>

    {/* 公用模型分頁 */}
    {publicTotalPages > 1 && (
      <div className="flex items-center justify-center gap-2 mt-6">
        <button
          onClick={() => setPublicPage(p => Math.max(1, p - 1))}
          disabled={safePublicPage === 1}
          className="px-3 py-1.5 rounded-lg border border-yellow-500/20 text-yellow-400/50 hover:bg-yellow-500/5 hover:text-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
        >
          <span className="material-symbols-outlined !text-base align-middle">chevron_left</span>
        </button>
        {Array.from({ length: publicTotalPages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            onClick={() => setPublicPage(p)}
            className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${safePublicPage === p ? 'bg-yellow-400 text-black' : 'border border-yellow-500/20 text-yellow-400/50 hover:bg-yellow-500/5 hover:text-yellow-300'}`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => setPublicPage(p => Math.min(publicTotalPages, p + 1))}
          disabled={safePublicPage === publicTotalPages}
          className="px-3 py-1.5 rounded-lg border border-yellow-500/20 text-yellow-400/50 hover:bg-yellow-500/5 hover:text-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"
        >
          <span className="material-symbols-outlined !text-base align-middle">chevron_right</span>
        </button>
        <span className="text-xs text-yellow-400/30 ml-2">{safePublicPage} / {publicTotalPages} 頁</span>
      </div>
    )}
  </section>

</div>
        )}
        {selectedIds.length >= 2 && (
          <div className="fixed bottom-0 left-0 w-full z-50">
            <div className="w-full bg-background-dark/95 backdrop-blur border-t border-white/10 px-8 py-4 flex items-center justify-between">

              {/* 左側 */}
              <div className="flex items-center gap-6">
                <p className="text-white">
                  已選擇 <span className="text-primary font-bold">{selectedIds.length}</span> 筆模型
                </p>

                <button
                  onClick={() => setSelectedIds(privateModels.map(m => m.id))}
                  className="text-sm text-white/60 hover:text-white underline"
                >
                  全選
                </button>

                <button
                  onClick={() => setSelectedIds([])}
                  className="text-sm text-white/60 hover:text-white underline"
                >
                  取消選取
                </button>
              </div>

              {/* 右側 */}
              <button
                onClick={() => setShowBatchConfirm(true)}
                className="px-6 py-2 bg-red-500 rounded-lg text-sm font-bold hover:bg-red-600 transition"
              >
                刪除選取項目
              </button>

            </div>
          </div>
        )}
      </main>

      {/* 單筆刪除 Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-background-dark border border-white/10 p-6 rounded-xl w-80">
            <h3 className="text-lg font-bold mb-4">
              確定要刪除模型 {deleteId} 嗎？
            </h3>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 bg-white/10 rounded-lg"
              >
                取消
              </button>

              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 bg-red-500 rounded-lg"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 批次刪除 Modal（放這裡） */}
      {showBatchConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-background-dark border border-white/10 p-6 rounded-xl w-80">
            <h3 className="text-lg font-bold mb-4">
              確定要刪除 {selectedIds.length} 筆模型嗎？
            </h3>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowBatchConfirm(false)}
                className="px-4 py-2 bg-white/10 rounded-lg"
              >
                取消
              </button>

              <button
                onClick={async () => {
                  await handleBatchDelete();
                  setShowBatchConfirm(false);
                }}
                className="px-4 py-2 bg-red-500 rounded-lg"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="p-8 text-center text-white/10 text-[10px] font-bold uppercase tracking-[0.4em]">
        © 2025 SUNERGY ANALYTICS CENTER
      </footer>
    </div>
  );
}