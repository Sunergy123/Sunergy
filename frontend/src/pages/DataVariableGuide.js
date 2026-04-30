import React from 'react';
import Navbar from '../components/Navbar';

export default function DataVariableGuide({ 
  onBack, 
  onNext, 
  onNavigateToDashboard, 
  onNavigateToPredict,
  onNavigateToSites,
  onNavigateToTrain,     
  onNavigateToModelMgmt, 
  onNavigateToChangePassword,
  onLogout,
  restoredFromVisualization = false,
}) 
  {
  const requiredVariables = [
    { code: 'GI', name: 'Global Irradiance', desc: '全天空日照強度，是影響發電量的核心因素。', icon: 'wb_sunny' },
    { code: 'TM', name: 'Temperature', desc: '環境或模組溫度，用於校正光電轉換效率。', icon: 'device_thermostat' },
    { code: 'EAC', name: 'Energy AC', desc: '交流電發電量，作為模型訓練的目標標籤 (Label)。', icon: 'bolt' }
  ];

  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col">
      <Navbar 
        activePage="start-predict"
        onNavigateToDashboard={onNavigateToDashboard} 
        onNavigateToPredict={onNavigateToPredict}
        onNavigateToSites={onNavigateToSites}
        onLogout={onLogout}
        onNavigateToTrain={onNavigateToTrain} 
        onNavigateToModelMgmt={onNavigateToModelMgmt}
        onNavigateToChangePassword={onNavigateToChangePassword}
      />

      <main className="flex-1 w-full max-w-4xl mx-auto p-6 py-12 flex flex-col gap-10">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-white tracking-tight">數據準備指南</h1>
          <p className="text-white/60 text-lg leading-relaxed">
            為了確保預測模型的精準度與運算效率，系統在資料處理階段會進行自動篩選。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {requiredVariables.map((item) => (
            <div key={item.code} className="bg-white/[0.03] border border-white/10 p-6 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span className="material-symbols-outlined !text-6xl text-primary">{item.icon}</span>
              </div>
              <div className="size-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center mb-6">
                <span className="text-xl font-black">{item.code}</span>
              </div>
              <h3 className="text-lg font-bold mb-2">{item.name}</h3>
              <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 p-6 rounded-2xl flex gap-4 items-start">
          <span className="material-symbols-outlined text-yellow-500 !text-2xl">info</span>
          <div>
            <h4 className="font-bold text-yellow-500 mb-1 text-base">重要提示：變數自動過濾</h4>
            <p className="text-sm text-yellow-500/80 leading-relaxed">
              除了上述三個變數（GI, TM, EAC）外，上傳資料中的其餘變數（如風速、濕度、電流等）將被系統視為雜訊並<b>自動排除</b>，不會進入訓練流程。
              
              <br /><br />
              
              ⚠️ 時間格式需為<b>每小時一筆資料</b>（例如：00:00、01:00、02:00），
              不支援半小時（如 00:30）或更細粒度資料，否則可能影響模型訓練結果。
              
              <br /><br />
              
              請確保您的 CSV 或 Excel 檔案中包含這些必要欄位與正確的時間間隔。
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-4 border-t border-white/5 pt-10">
          <p className="text-sm text-white/40">點擊下方按鈕開始上傳您的案場數據</p>
          <div className="flex gap-4">
            <button onClick={onBack} className="rounded-lg border border-white/10 px-8 py-3 text-base font-bold text-white hover:bg-white/10 transition-colors">
              返回首頁
            </button>
            <button onClick={onNext} className="flex items-center justify-center gap-2 rounded-lg bg-primary px-10 py-3 text-base font-bold text-background-dark transition-transform hover:scale-105">
              我已了解，開始上傳
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
      </main>

      <footer className="p-8 text-center text-white/20 text-xs tracking-widest uppercase">
        Daylight Prediction System v2.0
      </footer>
    </div>
  );
}