import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';

export default function ModelManagement({
  onNavigateToDashboard,
  onNavigateToTrain,
  onNavigateToPredict,
  onNavigateToSites,
  onNavigateToModelMgmt,
  onLogout,
  activePage
}) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);

  const navProps = {
    onNavigateToDashboard,
    onNavigateToTrain,
    onNavigateToPredict,
    onNavigateToSites,
    onNavigateToModelMgmt,
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

        const bestAccuracy =
          item.parameters?.best_accuracy ??
          item.parameters?.r2 ??
          item.parameters?.accuracy ??
          null;

        return {
          id: item.model_id,

          fileName:
            item.file_name || '未知檔案',
      
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
          date: trainedDate,
          accuracy: bestAccuracy !== null ? `${bestAccuracy}` : '-',
          status: index === 0 ? '已部署' : '閒置中',
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

      setModels(prev => prev.filter(m => !selectedIds.includes(m.id)));
      setSelectedIds([]);

    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col font-sans">
      <Navbar activePage="model-mgmt" {...navProps} />

      <main className="flex-1 w-full max-w-7xl mx-auto p-6 py-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 border-b border-white/10 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">模型管理中心</h1>
            <p className="text-white/40 text-sm mt-1">管理與追蹤所有已訓練完成的 AI 預測模型</p>
          </div>

          <div className="mt-4 md:mt-0 flex gap-4">
            <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-lg">
              <p className="text-[10px] text-white/40 uppercase font-bold">目前模型總數</p>
              <p className="text-xl font-black text-primary">{models.length}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
            <p className="text-white/20 text-lg italic">資料載入中...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {models.length > 0 ? (
              models.map((model) => (
                <div
                  key={model.id}
                  className="bg-white/[0.02] border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between hover:bg-white/[0.04] transition-all group"
                >
                  <div className="flex items-center gap-6">
                    <label className="cursor-pointer">
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={selectedIds.includes(model.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => [...prev, model.id]);
                          } else {
                            setSelectedIds(prev => prev.filter(id => id !== model.id));
                          }
                        }}
                      />

                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all
                        ${selectedIds.includes(model.id)
                          ? 'bg-primary border-primary'
                          : 'border-white/30 hover:border-white/60'}
                      `}>
                        {selectedIds.includes(model.id) && (
                          <span className="material-symbols-outlined text-xs text-black">check</span>
                        )}
                      </div>
                    </label>
                    <div className="size-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-background-dark transition-colors">
                      <span className="material-symbols-outlined !text-3xl">psychology</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-white group-hover:text-primary transition-colors">
                          {model.siteDisplay}
                        </h3>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${
                            model.status === '已部署'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-white/10 text-white/40'
                          }`}
                        >
                          {model.status}
                        </span>
                      </div>

                      <p className="text-xs text-white/40 mt-1.5 font-mono">
                        {model.fileName || '未知檔案'} | 算法: {model.type} | 訓練日期: {model.date}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-10 mt-6 md:mt-0">
                    <div className="text-right">
                      <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest mb-1">
                        訓練表現
                      </p>
                      <p className="text-2xl font-black text-primary italic">
                        {model.accuracy}
                      </p>
                    </div>

                    <div className="flex gap-2 border-l border-white/10 pl-6">
                      <button
                        title="查看詳情"
                        onClick={() => {
                          localStorage.setItem("predict_model_id", model.id);
                          onNavigateToPredict();
                        }}
                        className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all"
                      >
                        <span className="material-symbols-outlined">visibility</span>
                      </button>

                      <button
                        title="刪除模型"
                        onClick={() => setDeleteId(model.id)}
                        className="p-2.5 rounded-xl bg-red-500/5 hover:bg-red-500/20 text-white/30 hover:text-red-400 transition-all"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
                <p className="text-white/20 text-lg italic">目前尚無可顯示的模型</p>
              </div>
            )}
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
                  onClick={() => setSelectedIds(models.map(m => m.id))}
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