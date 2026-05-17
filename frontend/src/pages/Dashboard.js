import React, { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import SolarEstimationCard from '../components/SolarEstimationCard';

const CarbonReductionSection = ({ totalGeneration, onOpenModal }) => {
  // 2024年台灣電力排碳係數假設為 0.474 kgCO₂e/kWh (請依實際需求調整)
  const carbonFactor = 0.474; 
  const totalReduction = (totalGeneration * carbonFactor).toFixed(2);

  // 新增：控制顯示模式與單價的 State
  const [displayMode, setDisplayMode] = useState('carbon'); // 'carbon' (碳排) 或 'power' (發電量)
  const [unitPrice, setUnitPrice] = useState(''); // 預設空字串讓 placeholder 顯示

  // 根據目前模式，決定要顯示的數值、單位與標籤
  const currentValue = displayMode === 'carbon' ? totalReduction : (totalGeneration || 0).toFixed(2);
  const currentUnit = displayMode === 'carbon' ? 'kgCO₂e' : 'kWh';
  const currentLabel = displayMode === 'carbon' ? '目前已累積減碳貢獻' : '目前已累積發電量';
  const priceLabel = displayMode === 'carbon' ? '碳權單價 (元/kgCO₂e)' : '售電單價 (元/度)';
  
  // 計算總金額 (數值 * 單價)，並加上千分位逗號
  const totalRevenue = (Number(currentValue) * Number(unitPrice || 0)).toLocaleString('zh-TW', { maximumFractionDigits: 2 });

  return (
    <div className="flex flex-col gap-6">
      {/* A. SDG 7 說明卡片 */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-6 shadow-lg">
        <div className="flex items-center gap-2 mb-2">
          <div className="size-8 rounded-lg bg-[#F9AD13] text-white flex items-center justify-center font-bold text-xs">
            SDGs
          </div>
          <h3 className="text-base font-bold text-white/90">7 可負擔的潔淨能源</h3>
        </div>
        <p className="text-sm text-white/60 leading-relaxed">
          響應 <span className="text-[#F9AD13] font-bold">SDGs 7 永續發展目標</span>，本系統透過精準預測優化太陽能發電效率，確保人人皆可享有安全、永續且可負擔的潔淨能源，共同邁向淨零碳排。
        </p>
      </div>

      {/* B & C. 數據統計與收益換算 */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-gradient-to-br from-green-900/20 to-white/[0.03] p-6 shadow-lg">
        
        {/* 標題與操作按鈕區 */}
        <div className="flex justify-between items-center">
          <h3 className="text-base font-medium text-white/80 flex items-center gap-2">
            <span className={`material-symbols-outlined ${displayMode === 'carbon' ? 'text-green-400' : 'text-yellow-400'}`}>
              {displayMode === 'carbon' ? 'eco' : 'bolt'}
            </span>
            {displayMode === 'carbon' ? '環境減碳效益' : '發電量統計'}
          </h3>

          <div className="flex gap-2">
            {/* 單位切換 Toggle */}
            <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
              <button
                onClick={() => setDisplayMode('carbon')}
                className={`px-3 py-1 text-xs rounded-md transition ${displayMode === 'carbon' ? 'bg-green-500/20 text-green-400 font-bold' : 'text-white/60 hover:text-white'}`}
              >
                碳排
              </button>
              <button
                onClick={() => setDisplayMode('power')}
                className={`px-3 py-1 text-xs rounded-md transition ${displayMode === 'power' ? 'bg-yellow-500/20 text-yellow-400 font-bold' : 'text-white/60 hover:text-white'}`}
              >
                度數
              </button>
            </div>

            <button
              onClick={onOpenModal}
              className="text-xs bg-white/10 px-3 py-1 rounded-lg hover:bg-white/20"
            >
              選擇檔案
            </button>
          </div>
        </div>
        
        {/* 大數字顯示區 */}
        <div className="text-center my-2">
          <p className={`text-5xl font-black ${displayMode === 'carbon' ? 'text-green-400' : 'text-yellow-400'}`}>
            {currentValue} <span className="text-lg font-normal text-white/60">{currentUnit}</span>
          </p>
          <p className="text-xs text-white/40 mt-2 tracking-widest uppercase">
            {currentLabel}
          </p>
        </div>

        {/* 收益換算輸入與顯示區 */}
        <div className="flex items-center justify-between bg-black/30 rounded-xl p-4 mt-2 border border-white/5">
          <div className="flex flex-col gap-2 w-[45%]">
            <label className="text-[10px] text-white/50 uppercase font-bold tracking-wider">{priceLabel}</label>
            <div className="flex items-center gap-2">
              <span className="text-white/50 font-bold">$</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="0.0"
                className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 px-3 text-sm text-white focus:outline-none focus:border-green-400/50 transition-colors"
              />
            </div>
          </div>
          
          <div className="w-[1px] h-10 bg-white/10 mx-4"></div>

          <div className="flex flex-col items-end w-[45%]">
            <label className="text-[10px] text-white/50 uppercase font-bold tracking-wider">預估總價值 (NTD)</label>
            <p className="text-2xl font-black text-white mt-1">
              <span className="text-lg text-white/50 font-normal mr-1">$</span>
              {totalRevenue}
            </p>
          </div>
        </div>

        {/* 計算公式說明 */}
        <div className="mt-2 pt-4 border-t border-white/5">
          <p className="text-[10px] text-white/30 uppercase font-bold mb-2">計算公式說明</p>
          <div className="bg-black/20 rounded-lg p-3 font-mono text-[11px] text-white/50 space-y-1">
            {displayMode === 'carbon' ? (
              <>
                <p className="text-green-400/80">減碳量 (kgCO₂e) = 太陽能發電量(kWh) × 電力排碳係數({carbonFactor})</p>
                <p>總價值 = 減碳量 × 碳權單價</p>
              </>
            ) : (
              <>
                <p className="text-yellow-400/80">發電量 (kWh) = 選擇檔案中之太陽能總發電量加總</p>
                <p>總價值 = 發電量 × 售電單價</p>
              </>
            )}
          </div>
          
        </div>
          {/* 註解 */}
          <div className="text-[10px] text-white/30 mt-2 ml-1 leading-relaxed">
            <p>* 註：請留意兩者的計價單位不同，因此相同的單價數值會產生不同的總價值：</p>
            <p className="ml-6">- 售電計價：元 / 度 (kWh)</p>
            <p className="ml-6">- 碳權計價：元 / 公斤 (kgCO₂e)</p>
          </div>
      </div>
    </div>
  );
};

const SystemIntroduction = () => (
  <div className="w-full h-full min-h-[250px] bg-white/[0.03] rounded-2xl border border-white/10 p-8 flex flex-col justify-center">
    <div className="flex items-center gap-3 mb-4">
      <div className="size-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center">
        <span className="material-symbols-outlined font-bold">wb_sunny</span>
      </div>
      <h3 className="text-2xl font-black text-white tracking-tight">
        日光預(Sunergy Analytics Lab)：太陽能發電預測系統
      </h3>
    </div>

    <div className="space-y-4 text-white/70 leading-relaxed text-lg">
      <p>
        本系統整合了 <span className="text-primary font-bold">大數據分析</span> 與{' '}
        <span className="text-primary font-bold">機器學習技術</span>，
        專為太陽能案場設計。透過監測日照量、溫度及歷史發電數據，我們能精準預測電力產出，
        並透過自動化資料清洗流程，確保預測模型在不同格式下仍能維持其穩定性與準確度。
      </p>

      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h4 className="text-white font-bold mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">precision_manufacturing</span>
            自動化訓練
          </h4>
          <p className="text-sm opacity-60">一鍵啟動多模型並行訓練，尋找最佳超參數。</p>
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h4 className="text-white font-bold mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">show_chart</span>
            高精度預測
          </h4>
          <p className="text-sm opacity-60">採用 SVR 與 XGBoost 等演算法，將誤差降至最低。</p>
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h4 className="text-white font-bold mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">cleaning_services</span>
            智能資料清洗
          </h4>
          <p className="text-sm opacity-60">自動識別缺失值與異常偏離，確保模型訓練數據的純淨與穩定。</p>
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/5">
          <h4 className="text-white font-bold mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">settings_input_component</span>
            靈活模型配置
          </h4>
          <p className="text-sm opacity-60">支援多樣化的資料上傳與參數調整，針對不同地理條件快速建立專屬預測模型。</p>
        </div>

      </div>
    </div>
  </div>
);

export default function Dashboard({
  
  onLogout,
  onNavigateToTrain,
  onNavigateToDashboard,
  onNavigateToSites,
  onOpenCreateSite,
  onNavigateToPredict,
  onNavigateToRealtime,
  onNavigateToModelMgmt,
  onNavigateToChangePassword,
}) {
  // 尋找 const [searchTerm, setSearchTerm] = useState(''); 附近
  const [stats, setStats] = useState({ total_kwh: 0, total_carbon_reduction: 0 }); 
  const [searchTerm, setSearchTerm] = useState('');
  const [modelTab, setModelTab] = useState('all');
  const [allModels, setAllModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelError, setModelError] = useState('');

  const [sites, setSites] = useState([]); // 所有案場
  const [selectedSites, setSelectedSites] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [dataPage, setDataPage] = useState(1);

  const fetchSites = async () => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (!user?.user_id) return;

      const res = await fetch(`http://127.0.0.1:8000/train/sites?user_id=${user.user_id}`);
      const data = await res.json();

      console.log("API回傳:", data);

      // ⭐ 防呆
      if (Array.isArray(data)) {
        setSites(data);
      } else if (Array.isArray(data.sites)) {
        setSites(data.sites);
      } else {
        setSites([]);
      }

    } catch (err) {
      console.error("載入案場失敗", err);
      setSites([]);
    }
  };

  useEffect(() => {
    fetchSites();
  }, []);

  const selectedTotalKwh = datasets
    .flatMap(g => g.datasets || [])
    .filter(d => selectedDatasets.includes(d.id))
    .reduce((sum, d) => sum + (d.total_kwh || 0), 0);

  const handleConfirm = async () => {
    if (selectedDatasets.length === 0) {
      alert("請選擇資料");
      return;
    }

    const user = JSON.parse(localStorage.getItem("user"));

    const params = new URLSearchParams();

    params.append("user_id", user.user_id);

    // ⭐ 多個 site
    selectedSites.forEach(id => {
      params.append("site_ids", id);
    });

    // ⭐ 多個 dataset
    selectedDatasets.forEach(id => {
      params.append("upload_ids", id);
    });

    const url = `http://127.0.0.1:8000/train/dashboard-stats?${params.toString()}`;

    const res = await fetch(url);
    const data = await res.json();

    setStats(data);

    setIsModalOpen(false);
  };

  const handleDatasetToggle = (id) => {
    setSelectedDatasets(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const fetchModels = async () => {
      try {
        setLoadingModels(true);
        setModelError('');

        const user = JSON.parse(localStorage.getItem("user"));

        if (!user || !user.user_id) {
          throw new Error("找不到登入資訊，請重新登入");
        }

        const userId = user.user_id;

        const res = await fetch(
          `http://127.0.0.1:8000/train/trained-models?user_id=${userId}`
        );

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();

        const mapped = data.map((item) => {
          const trainedDate = item.trained_at
            ? new Date(item.trained_at).toLocaleDateString('zh-TW')
            : '—';

          const p = item.parameters || {};

          const performance = `
          R² ${p.r2 ?? '-'} ｜ 
          RMSE ${p.rmse ?? '-'} ｜ 
          MAE ${p.mae ?? '-'} ｜ 
          WMAPE ${p.wmape ?? '-'}
          `;

          return {
            id: item.model_id,
            name: `${item.model_type || '-'}_${item.model_id} ${
              item.site_name && item.location
                ? `${item.site_name}[${item.location}]`
                : item.site_name
                  ? `[${item.site_name}]`
                  : '-'
            }`.trim(),
            type: item.model_type || '-',
            date: trainedDate,
            status: '已建立',
            usage: item.usage_count ?? 0,
            acc: item.parameters?.r2 ?? '—',
            fileName: item.file_name || '未知檔案',
            r2: item.r2,
            wmape: item.wmape,
            rmse: item.rmse,
            mae: item.mae,
            dataId: item.data_id,
            filePath: item.file_path,
            parameters: item.parameters || {},
            isPublic: item.is_public,
          };
        });

        setAllModels(mapped);
      } catch (err) {
        console.error('讀取模型失敗:', err);
        setModelError(err.message || '模型資料載入失敗');
      } finally {
        setLoadingModels(false);
      }
    };

  useEffect(() => {
    fetchModels();
  }, []);
  
  // 在原本的 fetchModels(); 下方新增以下區塊
  useEffect(() => {
  const fetchDashboardStats = async () => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      if (!user?.user_id) return;

      // 呼叫你在 train.py 新增的端點
      const res = await fetch(`http://127.0.0.1:8000/train/dashboard-stats?user_id=${user.user_id}`);
      if (!res.ok) throw new Error("統計資料抓取失敗");
      
      const data = await res.json();
      setStats(data); // ⭐ 將後端計算的結果存入 State
    } catch (err) {
      console.error('讀取統計失敗:', err);
    }
  };

  fetchDashboardStats();
}, []); // 僅在頁面載入時執行一次

  const filteredModels = allModels.filter((model) => {
    const matchSearch = model.name
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    if (modelTab === 'public') {
      return matchSearch && model.isPublic;
    }

    return matchSearch;
  });

  const topModels = [...allModels]
    .sort((a, b) => (b.usage || 0) - (a.usage || 0))
    .slice(0, 3);

  return (
    <>
      <div className="flex min-h-screen w-full flex-col bg-background-dark text-white font-sans">
        <Navbar
          activePage="dashboard"
          onNavigateToDashboard={() => {
            fetchModels();   // ⭐ 關鍵
            onNavigateToDashboard();
          }}
          onNavigateToTrain={onNavigateToTrain}
          onNavigateToSites={onNavigateToSites}
          onNavigateToPredict={onNavigateToPredict}
          onNavigateToRealtime={onNavigateToRealtime}
          onNavigateToModelMgmt={onNavigateToModelMgmt}
          onNavigateToChangePassword={onNavigateToChangePassword}
          onLogout={onLogout}
        />

        <main className="flex-1 w-full max-w-7xl mx-auto p-6 sm:p-10">
          <div className="mb-8 flex items-end justify-between border-b border-white/10 pb-4">
            <div>
              <h1 className="text-3xl font-bold">首頁</h1>
              <p className="text-sm text-white/40">我的案場概況</p>
            </div>
            <button
              onClick={() => onNavigateToTrain({ fromSite: false })}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-background-dark text-sm font-bold transition-transform hover:scale-105"
            >
              <span className="material-symbols-outlined !text-lg font-bold">play_arrow</span>
              開始訓練模型
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 flex flex-col gap-16">
              <section>
                <h2 className="text-xl font-bold mb-4">系統願景</h2>
                <SystemIntroduction />
              </section>

              <section className="bg-white/[0.02] rounded-2xl p-6 border border-white/10">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">

                    <h2 className="text-xl font-bold">已建立模型</h2>

                    <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                      <button
                        onClick={() => setModelTab('all')}
                        className={`px-3 py-1 text-xs rounded-md transition ${
                          modelTab === 'all'
                            ? 'bg-primary text-black font-bold'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        全部
                      </button>

                      <button
                        onClick={() => setModelTab('public')}
                        className={`px-3 py-1 text-xs rounded-md transition ${
                          modelTab === 'public'
                            ? 'bg-primary text-black font-bold'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        公用模型
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="搜尋模型..."
                    className="bg-white/5 border border-white/10 rounded-lg py-1 px-4 text-xs focus:outline-none focus:border-primary/40 transition-all"
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {loadingModels ? (
                    <p className="text-sm text-white/50">模型載入中...</p>
                  ) : modelError ? (
                    <p className="text-sm text-red-400">{modelError}</p>
                  ) : filteredModels.length === 0 ? (
                    <p className="text-sm text-white/50">目前沒有已建立模型</p>
                  ) : (
                    filteredModels.map((model) => (
                      <div
                        key={model.id}
                        className="flex justify-between border-b border-white/5 pb-4 last:border-0"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold">{model.name}</h3>
                          </div>

                          <p className="text-xs text-white/30 mt-1 font-mono">
                            訓練日期: {model.date}
                          </p>
                          <p className="text-xs text-white/20 mt-1">
                            類型: {model.type} | 使用資料：{model.fileName}
                          </p>
                        </div>

                        
                      </div>
                    ))
                  )}
                </div>
              </section>
              <section>
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">leaderboard</span>
                  最常用模型排名
                </h2>

                <div className="flex flex-col gap-4">
                  {topModels.length === 0 ? (
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
                      <p className="text-white/40 text-sm">目前尚無模型資料</p>
                    </div>
                  ) : (
                    topModels.map((model, index) => (
                      <div
                        key={model.id}
                        className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 relative overflow-hidden group hover:border-primary/50 transition-all"
                      >
                        <div className="flex items-center gap-5">
                          <div
                            className={`text-2xl font-black italic ${
                              index === 0 ? 'text-primary' : 'text-white/20'
                            }`}
                          >
                            0{index + 1}
                          </div>

                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-1 gap-3 flex-wrap">
                              <h3 className="font-bold text-white text-lg min-w-0 flex-1 break-words leading-snug">{model.name}</h3>
                              <div className="flex flex-col items-end gap-1 flex-shrink-0 self-start">
                                {model.isPublic && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 whitespace-nowrap">
                                    公用
                                  </span>
                                )}
                                <div className="text-right">
                                  <span className="text-[9px] text-white/40 block uppercase leading-none mb-1 whitespace-nowrap">
                                    使用次數
                                  </span>
                                  <span className="text-primary font-mono font-bold text-base whitespace-nowrap">
                                    {model.usage} 次
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-center my-3">
                              <div className="w-4/5 h-[1px] bg-white/5"></div>
                            </div>

                            <div className="flex justify-between items-end">
                              {/* <div>
                                <p className="text-[10px] text-white/30 uppercase leading-none mb-1">
                                  歷史準確度
                                </p>
                                <p className="text-sm font-bold text-green-400">{model.acc}</p>
                              </div> */}
                              <div>
                                <p className="text-[10px] text-white/30 uppercase leading-none mb-1">
                                  模型資訊
                                </p>

                                <div className="text-sm text-white/70 font-mono space-y-1">

                                  {/* 第一行 */}
                                  <div className="break-words">
                                    {model.fileName} ｜ {model.date}
                                  </div>

                                  {/* 第三行：指標（重點🔥） */}
                                  <div className="grid grid-cols-2 gap-x-4 text-xs text-green-400">
                                    <span>R²: {model.r2 ?? '—'}</span>
                                    <span>WMAPE: {model.wmape ?? '—'}</span>
                                    <span>RMSE: {model.rmse ?? '—'}</span>
                                    <span>MAE: {model.mae ?? '—'}</span>
                                  </div>

                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* --- Dashboard.js 右側欄位 (lg:col-span-5) --- */}
            <div className="lg:col-span-5 flex flex-col gap-8">
              
              {/* 使用新封裝的減碳效益區塊，取代舊的兩個卡片 */}
              <CarbonReductionSection 
                totalGeneration={stats.total_kwh}
                onOpenModal={() => setIsModalOpen(true)}
              />

              <SolarEstimationCard />

            </div>
          </div>
        </main>
      </div>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-xl p-6 w-[400px]">

            {/* ===== 案場 ===== */}
            <h2 className="text-lg font-bold mb-2">選擇案場（可多選）</h2>

            {/* ✅ 只讓案場滾動 */}
            <div className="bg-black rounded p-2 max-h-[120px] overflow-y-auto space-y-2 mb-4">
              {sites.map(site => (
                <label key={site.site_id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSites.includes(site.site_id)}
                    onChange={async () => {
                      let newSelected;

                      if (selectedSites.includes(site.site_id)) {
                        newSelected = selectedSites.filter(id => id !== site.site_id);
                      } else {
                        newSelected = [...selectedSites, site.site_id];
                      }

                      setSelectedSites(newSelected);
                      setDataPage(1);
                      setSelectedDatasets([]);

                      try {
                        const requests = newSelected.map(id =>
                          fetch(`http://127.0.0.1:8000/train/site-datasets?site_id=${id}`)
                            .then(res => res.json())
                            .then(data => ({
                              site_id: id,
                              datasets: data
                            }))
                        );

                        const results = await Promise.all(requests);
                        setDatasets(results);
                      } catch (err) {
                        console.error("載入資料失敗", err);
                        setDatasets([]);
                      }
                    }}
                  />
                  <span>{site.site_name}（{site.location}）</span>
                </label>
              ))}
            </div>

            {/* ===== 資料 ===== */}
            <h2 className="text-lg font-bold mb-2">選擇資料</h2>

            {/* 已選擇 */}
            <div className="text-xs text-green-400 mb-2">
              已選擇：
              {selectedDatasets.length === 0
                ? " 無"
                : datasets
                    .flatMap(g => g.datasets || [])
                    .filter(d => selectedDatasets.includes(d.id))
                    .map(d => d.name)
                    .join("、")
              }
            </div>

            {/* ⭐ 分頁資料 */}
            <div className="bg-black rounded p-2 space-y-2">
              {(() => {
                const dataPerPage = 5;

                // ⭐ 1. 先攤平成一個陣列（帶 site_id）
                const allData = datasets
                  .flatMap(group =>
                    (group.datasets || []).map(d => ({
                      ...d,
                      site_id: group.site_id
                    }))
                  )
                  .sort((a, b) => {
                    // 先用 site_id 排
                    if (a.site_id !== b.site_id) {
                      return a.site_id - b.site_id;
                    }
                    // 再用時間排（新到舊）
                    return new Date(b.time) - new Date(a.time);
                  });

                // ⭐ 2. 再做分頁（全域分頁）
                const paginatedData = allData.slice(
                  (dataPage - 1) * dataPerPage,
                  dataPage * dataPerPage
                );

                // ⭐ 3. 再依 site 分組（只針對當頁）
                const grouped = paginatedData.reduce((acc, item) => {
                  if (!acc[item.site_id]) acc[item.site_id] = [];
                  acc[item.site_id].push(item);
                  return acc;
                }, {});

                // ⭐ 4. render
                return Object.entries(grouped).map(([site_id, items]) => {
                  const site = sites.find(s => s.site_id == site_id);

                  return (
                    <div key={site_id} className="mb-4">

                      {/* 案場名稱 */}
                      <div className="text-xs text-yellow-400 mb-1">
                        📍 {site?.site_name}（{site?.location}）
                      </div>

                      {/* 該案場資料 */}
                      {items.map(d => (
                        <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedDatasets.includes(d.id)}
                            onChange={() => handleDatasetToggle(d.id)}
                          />
                          <span>
                            {d.name} ｜ {d.time ? new Date(d.time).toLocaleString() : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>

            {/* ⭐ 分頁控制（👉 正確位置：資料下面） */}
            {(() => {
              const allData = datasets.flatMap(g => g.datasets || []);
              const dataPerPage = 5;
              const totalPage = Math.ceil(allData.length / dataPerPage);

              return (
                <div className="flex justify-between mt-2 text-xs">
                  <button
                    disabled={dataPage === 1}
                    onClick={() => setDataPage(p => p - 1)}
                    className="px-2 py-1 bg-white/10 rounded disabled:opacity-30"
                  >
                    上一頁
                  </button>

                  <span className="text-white/40">
                    第 {dataPage} / {totalPage || 1} 頁
                  </span>

                  <button
                    disabled={dataPage >= totalPage}
                    onClick={() => setDataPage(p => p + 1)}
                    className="px-2 py-1 bg-white/10 rounded disabled:opacity-30"
                  >
                    下一頁
                  </button>
                </div>
              );
            })()}

            {/* ===== 按鈕 ===== */}
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white/10 rounded-lg"
              >
                取消
              </button>

              <button onClick={handleConfirm}>
                確認
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}