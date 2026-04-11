// src/components/Navbar.js
import React, { useState } from 'react';

export default function Navbar({ 
  activePage, 
  onNavigateToDashboard, 
  onNavigateToTrain, 
  onNavigateToPredict, 
  onNavigateToSites, 
  onNavigateToModelMgmt, 
  onNavigateToChangePassword,
  onLogout 
}) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // 統一選單樣式處理：確保新前端的所有頁面都能正確高亮
  const getLinkClass = (pageName) => {
    const baseClass = "text-sm font-medium transition-all duration-200 whitespace-nowrap";
    
    // 定義哪些 currentPage 狀態屬於「訓練模型」流程（五步驟）
    const trainFlowPages = [
      'data-guide',      // 步驟 1: 說明頁
      'start-predict',   // 步驟 2: 上傳
      'data-cleaning',   // 步驟 3: 清理
      'unit-adjustment', // 步驟 4: 單位
      'model-training'   // 步驟 5: 訓練
    ];

    let isActive = false;

    // 邏輯判斷：
    // 1. 如果是訓練流程中的任何一頁，則「訓練模型」按鈕高亮
    if (pageName === 'train-group') {
      isActive = trainFlowPages.includes(activePage);
    } else {
      // 2. 其他頁面（首頁、預測、案場、模型管理）進行直接比對
      isActive = activePage === pageName;
    }

    if (isActive) {
      return `${baseClass} text-primary font-bold`; 
    }
    return `${baseClass} text-white/70 hover:text-primary`;
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-center border-b border-solid border-white/10 bg-background-dark/80 px-4 py-3 backdrop-blur-sm sm:px-10">
      <div className="flex w-full max-w-7xl items-center justify-between">
        
        {/* Logo 區塊 */}
        <button onClick={onNavigateToDashboard} className="flex items-center gap-2.5 text-white transition-transform active:scale-95 shrink-0">
          <div className="size-8 overflow-hidden text-primary">
            <svg className="h-full w-full" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM12 4V20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4Z" fill="currentColor"></path>
            </svg>
          </div>
          <h2 className="text-lg font-bold leading-tight tracking-[-0.015em]">
            日光預
          </h2>
        </button>

        {/* 右側整合導航區塊 */}
        <div className="flex flex-1 items-center justify-end gap-10">
          
          {/* 主導航選單 (Desktop) */}
          <nav className="hidden items-center gap-8 md:flex">
            {/* 1. 首頁 */}
            <button onClick={onNavigateToDashboard} className={getLinkClass('dashboard')}>
              首頁
            </button>
            
            {/* 2. 訓練模型 (對應五步驟流程) */}
            <button onClick={onNavigateToTrain} className={getLinkClass('train-group')} >
              訓練模型
            </button>
            
            {/* 3. 預測發電量 (新獨立功能) */}
            <button onClick={onNavigateToPredict} className={getLinkClass('predict-solar')} >
              預測發電量
            </button>
            
            {/* 4. 案場管理 */}
            <button onClick={onNavigateToSites} className={getLinkClass('sites')}>
              案場管理
            </button>

            {/* 5. 模型管理 (新獨立功能) */}
            <button onClick={onNavigateToModelMgmt} className={getLinkClass('model-mgmt')}>
              模型管理
            </button>
          </nav>

          {/* 個人資料與登出按鈕 */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={`flex size-9 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:text-white ${isProfileOpen ? 'ring-2 ring-primary text-white' : ''}`}
            >
              <span className="material-symbols-outlined !text-2xl">person</span>
            </button>

            {isProfileOpen && (
              <>
                {/* 點擊空白處關閉選單 */}
                <div 
                  className="fixed inset-0 z-10 cursor-default" 
                  onClick={() => setIsProfileOpen(false)}
                ></div>

                <div className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#1E1E1E] shadow-xl backdrop-blur-xl">
                  <div className="flex flex-col p-1">
                    {/* 修改密碼按鈕 */}
                    <button 
                      onClick={() => {
                        onNavigateToChangePassword();
                        setIsProfileOpen(false);
                      }} 
                      className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm text-white/80 hover:bg-white/10 transition-colors"
                    >
                      <span className="material-symbols-outlined !text-[20px]">settings</span>
                      修改密碼
                    </button>

                    {/* 分隔線 */}
                    <div className="my-1 h-px bg-white/5"></div>
                    {/* 登出系統 - 串接 handleLogout */}
                    <button 
                      onClick={onLogout} 
                      className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <span className="material-symbols-outlined !text-[20px]">logout</span>
                      登出系統
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}