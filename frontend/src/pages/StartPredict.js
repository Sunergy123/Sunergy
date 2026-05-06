// src/pages/StartPredict.js
import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
const API_BASE_URL = "http://127.0.0.1:8000";

export default function StartPredict({
  onBack,
  onNext,
  onLazyFinish,
  onNavigateToDashboard,
  onNavigateToTrain,
  onNavigateToPredict,
  onNavigateToSites,
  onNavigateToModelMgmt,
  onNavigateToChangePassword,
  onLogout,
  restoredFromVisualization = false,
  fromSite = false,
}) {
  const [activeTab, setActiveTab] = useState("existing");
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState("");

  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteCode, setNewSiteCode] = useState("");
  const [newLocation, setNewLocation] = useState("");

  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");

  // 原始欄位（顯示用）
  const [originalFeatures, setOriginalFeatures] = useState([]);

  // 系統實際使用欄位（流程用）
  const [features, setFeatures] = useState([]);

  const [rows, setRows] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [siteError, setSiteError] = useState("");
  const [fileError, setFileError] = useState("");

  // 懶人模式（一鍵自動：清洗 → 訓練三模型 → 推薦最低 WMAPE → 進預測頁）
  const [lazyMode, setLazyMode] = useState(false);
  const [lazyStep, setLazyStep] = useState("idle"); // idle | cleaning | training | done | error
  const [lazyError, setLazyError] = useState("");
  const [lazyBest, setLazyBest] = useState(null);   // { model_id, model_type, wmape }

  const getUserId = () => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return user.user_id || 0;
  };

  const clearPredictCache = () => {
    localStorage.removeItem("lastUploadedFile");
    localStorage.removeItem("lastDataId");
    localStorage.removeItem("lastFeatures");
    localStorage.removeItem("lastOriginalFeatures");
    localStorage.removeItem("lastRows");
  };

  useEffect(() => {
    const savedSite = localStorage.getItem("selectedSiteId");

    // 👉 永遠優先用 localStorage
    if (savedSite) {
      setSelectedSite(savedSite);
    } else {
      setSelectedSite("");
    }

    // 👉 只有完全不是流程時才清
    if (!restoredFromVisualization) {
      clearPredictCache();

      setFile(null);
      setFileName("");
      setFeatures([]);
      setOriginalFeatures([]);
      setRows(null);
    }
  }, []);

  /* ==================== 載入案場列表 ==================== */
  useEffect(() => {
    const uid = getUserId();
    if (!uid) return;

    fetch(`http://127.0.0.1:8000/site/list?user_id=${uid}`)
      .then((res) => res.json())
      .then((data) => {
        setSites(Array.isArray(data) ? data : []);

        // ⭐ 只有從案場進來才還原
        if (fromSite) {
          const savedSite = localStorage.getItem("selectedSiteId");
          if (savedSite) {
            setSelectedSite(savedSite);
          }
        }
      })
      .catch(() => setSites([]));
  }, [fromSite]);

  /* ==================== 建立新案場 ==================== */
  const createNewSite = async () => {
    const uid = getUserId();

    // ✅ Scenario 2：欄位未填
    if (!newSiteName || !newSiteCode || !newLocation) {
      setSiteError("請完整填寫案場代號、案場名稱與地點");
      return;
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/site/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_name: newSiteName,
          site_code: newSiteCode,
          location: newLocation,
          user_id: uid,
        }),
      });

      const json = await res.json();

      // ✅ Scenario 3：後端錯誤（重複 or 其他）
      if (!res.ok) {
        setSiteError(json.detail || "新增案場失敗");
        return;
      }

      // ✅ 成功
      setSiteError(""); // 清錯誤
      setNewSiteName("");
      setNewSiteCode("");
      setNewLocation("");

      const res2 = await fetch(
        `http://127.0.0.1:8000/site/list?user_id=${uid}`
      );
      const siteList = await res2.json();

      setSites(siteList);
      setSelectedSite(json.site_id);
      setActiveTab("existing");

    } catch {
      setSiteError("無法連線到伺服器");
    }
  };

  /* ==================== 懶人模式：自動清洗 + 訓練三模型 ==================== */
  const buildDefaultTrainParams = () => {
    // 預設超參數範圍與 ModelTraining.js 一致；策略採 bayes，trials=30
    const trials = 30;
    return {
      XGBoost: {
        n_estimators: { start: 100, end: 500, step: 100 },
        max_depth: { start: 3, end: 8, step: 1 },
        learning_rate: { start: 0.01, end: 0.2, step: 0.01 },
        subsample: { start: 0.7, end: 1.0, step: 0.05 },
        colsample_bytree: { start: 0.7, end: 1.0, step: 0.05 },
        min_child_weight: { start: 1, end: 5, step: 1 },
        reg_lambda: { start: 0.5, end: 2, step: 0.1 },
        reg_alpha: { start: 0, end: 1, step: 0.1 },
        _max_combinations: 100,
        _trials: trials,
      },
      SVR: {
        C: { start: 1, end: 50, step: 10 },
        epsilon: { start: 0.01, end: 0.5, step: 0.05 },
        gamma: { values: ["scale", "auto"] },
        _trials: trials,
      },
      RandomForest: {
        n_estimators: { start: 100, end: 300, step: 50 },
        max_depth: { start: 5, end: 15, step: 1 },
        _trials: trials,
      },
    };
  };

  const runLazyMode = async ({ siteIdNum, fileNameStr, uploadIdNum }) => {
    setLazyError("");
    setLazyBest(null);

    // ── Step 1: 自動清洗 ──
    try {
      setLazyStep("cleaning");
      const cleanRes = await fetch("http://127.0.0.1:8000/save-cleaned-data/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteIdNum,
          file_name: fileNameStr,
          upload_id: uploadIdNum,
          apply_outlier: true,
          apply_gi_tm: true,
          remove_outliers: true,
          outlier_method: "iqr_comprehensive",
          iqr_factor: 2.0,
          z_threshold: 3.0,
          isolation_contamination: 0.05,
        }),
      });
      if (!cleanRes.ok) {
        const text = await cleanRes.text();
        throw new Error(`資料清洗失敗：${text || cleanRes.status}`);
      }
      const cleanJson = await cleanRes.json();
      if (!cleanJson.after_id) throw new Error("清洗回傳缺少 after_id");
      localStorage.setItem("afterDataId", cleanJson.after_id);

      // ── Step 2: 訓練三模型 ──
      setLazyStep("training");
      const trainRes = await fetch("http://127.0.0.1:8000/train/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "cleaned",
          source_id: Number(cleanJson.after_id),
          split_ratio: 0.8,
          models: ["XGBoost", "SVR", "RandomForest"],
          strategy: "bayes",
          params: buildDefaultTrainParams(),
          device: "auto",
        }),
      });
      const trainJson = await trainRes.json();
      if (!trainRes.ok) {
        throw new Error(trainJson?.detail || "模型訓練失敗");
      }
      const results = trainJson.results || {};
      const okList = Object.values(results).filter(
        (r) => r.status === "ok" && r.wmape !== undefined && r.wmape !== null
      );
      if (okList.length === 0) {
        throw new Error("三個模型皆訓練失敗，請檢查資料品質後重試");
      }

      // ── Step 3: 挑 WMAPE 最低者作為推薦 ──
      const winner = okList.reduce((best, r) =>
        Number(r.wmape) < Number(best.wmape) ? r : best
      );
      // /train/run 回應不含 model_id，需另外查 /train/trained-models。
      // /train/trained-models 已按 trained_at desc 排序、且只回傳該使用者的模型，
      // 所以 model_type 相符的第一筆即為剛訓練好的紀錄。
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = user.user_id;
      let winnerModelId = null;
      if (userId) {
        try {
          const listRes = await fetch(
            `http://127.0.0.1:8000/train/trained-models?user_id=${userId}`
          );
          const list = await listRes.json();
          if (Array.isArray(list)) {
            const matched = list
              .filter((m) => m.model_type === winner.id)
              .sort(
                (a, b) =>
                  new Date(b.trained_at || 0).getTime() -
                  new Date(a.trained_at || 0).getTime()
              );
            if (matched.length > 0) winnerModelId = matched[0].model_id;
          }
        } catch (e) {
          console.error("trained-models lookup failed:", e);
        }
      }
      if (!winnerModelId) {
        throw new Error("找不到推薦模型的 ID，請改用手動模式重新訓練");
      }

      const bestInfo = {
        model_id: winnerModelId,
        model_type: winner.id,
        wmape: Number(winner.wmape),
      };
      setLazyBest(bestInfo);
      // 給 PredictSolar 預選 + 顯示推薦徽章用
      localStorage.setItem("predict_model_id", String(winnerModelId));
      localStorage.setItem("lazyModeWinnerId", String(winnerModelId));
      localStorage.setItem(
        "lazyModeWinnerInfo",
        JSON.stringify(bestInfo)
      );

      setLazyStep("done");
      // 短暫顯示「完成」訊息後跳轉
      setTimeout(() => {
        if (typeof onLazyFinish === "function") onLazyFinish();
      }, 1200);
    } catch (err) {
      console.error("lazy mode error:", err);
      setLazyError(err.message || "懶人模式執行失敗");
      // 不切到 "error" 狀態，讓 lazyStep 停在失敗的階段；UI 用 lazyError 旗標標示為失敗
    }
  };

  /* ==================== 上傳檔案 ==================== */
  const handleFileSelect = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;

    // ✅ 檔案格式檢查
    const fileName = uploadedFile.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".csv")) {
      setFileError("檔案格式錯誤，請上傳.xlsx或.csv格式檔案");
      return;
    }

    setFileError("");
    setSiteError("");

    if (!selectedSite) {
      setSiteError("請先選擇案場！");
      return;
    }

    const formData = new FormData();
    formData.append("file", uploadedFile);

    try {
      setProcessing(true);

      const res = await fetch(
        `http://127.0.0.1:8000/site/upload-data?site_id=${selectedSite}`,
        { method: "POST", body: formData }
      );

      const json = await res.json();
      console.log("upload response:", json);

      if (!res.ok) {
        // ✅ 如果後端有傳明確錯誤
        if (json?.detail) {
          setFileError(json.detail);
        } else {
          setFileError("檔案未含必要欄位（如 date、hour、GI、TM、EAC）");
        }
        return;
      }

      if (!json.upload_id) {
        setFileError("上傳失敗，請確認檔案內容");
        return;
      }

      // ✅ 成功
      setFile({ name: uploadedFile.name, status: "上傳成功" });
      setFileName(json.file_name);
      setFeatures(json.features || []);
      setOriginalFeatures(json.original_features || []); // 🔥
      setRows(json.rows || null);

      // 存 localStorage
    const selectedSiteObj = sites.find(
      (s) => String(s.site_id) === String(selectedSite)
    );

    if (!selectedSiteObj) {
      console.warn("找不到 site，fallback 用 id");
      localStorage.setItem("selectedSiteName", `ID:${selectedSite}`);
    } else {
      localStorage.setItem("selectedSiteName", selectedSiteObj.site_name);
    }

    if (selectedSiteObj) {
      localStorage.setItem("selectedSiteName", selectedSiteObj.site_name);
      localStorage.setItem("selectedSiteId", selectedSiteObj.site_id);
    }
    localStorage.setItem("lastUploadedFile", json.file_name);
    localStorage.setItem("lastDataId", json.upload_id);
    localStorage.removeItem("afterDataId");
    localStorage.setItem("lastFeatures", JSON.stringify(json.features || []));
    localStorage.setItem(
      "lastOriginalFeatures",
      JSON.stringify(json.original_features || [])
    );
    localStorage.setItem("lastRows", json.rows || "");

    // 新增這三行
    localStorage.setItem("selectedSiteId", selectedSite);
    localStorage.setItem("lastSiteId", selectedSite);

    // 原本的也保留
    localStorage.setItem("lastSelectedSite", selectedSite);

    // 懶人模式：上傳成功後直接接力清洗 + 訓練
    if (lazyMode) {
      // 不阻塞 finally 的 setProcessing(false)；以 microtask 排程
      Promise.resolve().then(() =>
        runLazyMode({
          siteIdNum: Number(selectedSite),
          fileNameStr: json.file_name,
          uploadIdNum: Number(json.upload_id),
        })
      );
    }
    } catch (err) {
      console.error(err);
      setFileError("無法連線到伺服器");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col">
      <Navbar
        activePage="start-predict" 
        onNavigateToDashboard={onNavigateToDashboard} 
        onNavigateToPredict={onNavigateToPredict}
        onNavigateToSites={onNavigateToSites}
        onNavigateToTrain={onNavigateToTrain}         
        onNavigateToModelMgmt={onNavigateToModelMgmt}   
        onNavigateToChangePassword={onNavigateToChangePassword}
        onLogout={onLogout}
      />

      {/* Step Header / Breadcrumb */}
      <div className="w-full border-b border-white/10 bg-white/[.02] px-6 py-3 sticky top-[64px] sm:top-[65px] z-40 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined !text-lg">arrow_back</span>
            返回首頁
          </button>

          <div className="text-sm font-medium">
            <span className="text-primary font-bold">1. 上傳資料</span>
            <span className="mx-2 text-white/30">/</span>
            <span className="text-white/40">2. 清理資料</span>
            <span className="mx-2 text-white/30">/</span>
            <span className="text-white/40 ">3. 模型訓練</span>
            <span className="mx-2 text-white/30">/</span>
            <span className="text-white/40">4. 預測發電量</span>

          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-6 py-8 flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-white">
          開始建立您的發電量預測模型
        </h1>

        {/* Step 1 */}
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-6 sm:p-8">
          {fromSite && (
            <div>
              <h2 className="text-xl font-bold mb-6">步驟一：選擇或建立案場</h2>
              {/* 原本整塊 UI */}
            </div>
          )}

          <div className="flex rounded-lg bg-white/5 p-1 w-full">
            <button
              onClick={() => setActiveTab("existing")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "existing"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/50"
              }`}
            >
              選擇現有案場
            </button>

            <button
              onClick={() => setActiveTab("new")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                activeTab === "new"
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-white/50"
              }`}
            >
              建立新案場資料
            </button>
          </div>

          {activeTab === "existing" ? (
            <div className="mt-4">
              <select
                className="w-full rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white"
                value={selectedSite}
                onChange={(e) => {
                  setSelectedSite(e.target.value);
                  setSiteError(""); // ✅ 一選好案場就清錯誤
                }}
              >
                <option value="">請選擇案場</option>
                {sites.map((s) => (
                  <option key={s.site_id} value={s.site_id}>
                    {s.site_code} - {s.site_name}（{s.location}）
                  </option>
                ))}
              </select>
              {siteError && (
                <p className="mt-2 text-sm text-red-400">{siteError}</p>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <input
                type="text"
                placeholder="案場代號（site_code）"
                className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white"
                value={newSiteCode}
                onChange={(e) => setNewSiteCode(e.target.value)}
              />

              <input
                type="text"
                placeholder="案場名稱（site_name）"
                className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
              />

              <input
                type="text"
                placeholder="案場地點（location）"
                className="rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-white"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
              />

              <button
                onClick={createNewSite}
                className="mt-3 bg-primary text-black font-bold px-4 py-2 rounded-lg"
              >
                建立案場
              </button>
              {siteError && (
                <p className="text-sm text-red-400 mt-2">{siteError}</p>
              )}
            </div>
          )}
        </div>

        {/* Lazy Mode Toggle */}
        <div className="rounded-xl border border-primary/30 bg-primary/[.04] p-5 sm:p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-primary rounded"
              checked={lazyMode}
              onChange={(e) => setLazyMode(e.target.checked)}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-xl text-primary">auto_awesome</span>
                <span className="text-base font-bold text-primary">懶人模式（一鍵自動）</span>
              </div>
              <p className="text-sm text-white/60 mt-1 leading-relaxed">
                勾選後，上傳資料即自動套用系統預設方法清洗、並用三種模型（XGBoost / SVR / RandomForest）以貝葉斯優化訓練，最後挑選 WMAPE 最低者作為推薦模型，直接進入預測頁。
              </p>
              <p className="text-xs text-white/40 mt-1">
                適合不熟悉資料科學的使用者；訓練約需數分鐘，請保持頁面開啟。
              </p>
            </div>
          </label>
        </div>

        {/* Step 2 */}
        <div className="rounded-xl border border-white/10 bg-white/[.02] p-6 sm:p-8">
          <h2 className="text-xl font-bold mb-6">步驟二：上傳數據檔案 (請確認檔案含有date、hour、GI、TM、EAC必要特徵)</h2>

          <div className="relative mb-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/20 py-12 bg-white/[.01] text-center">
            <input
              type="file"
              id="fileInput"
              className="hidden"
              onChange={handleFileSelect}
            />

            <label
              onClick={(e) => {
                if (!selectedSite) {
                  e.preventDefault();
                  setSiteError("請先選擇案場！");
                  return;
                }
                setFileError("");
              }}
              htmlFor="fileInput"
              className="rounded-lg border border-primary text-primary px-6 py-2 cursor-pointer"
            >
              選擇檔案
            </label>
            {fileError && (
              <p className="mt-2 text-sm text-red-400">{fileError}</p>
            )}
          </div>

          {fileName && (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
              <h3 className="text-lg font-bold mb-2">📄 檔案資訊</h3>

              {/* ✅ 新增這一行 */}
              <p className="text-green-400 font-medium mb-2">
                ✅ 上傳成功：{fileName}
              </p>

              <p className="text-white/80 mb-2">
                <strong>欄位數量：</strong> {originalFeatures.length} 個
              </p>

              <p className="text-white/80 mb-4">
                <strong>資料筆數：</strong> {rows} 筆
              </p>

              <strong className="text-white/90">欄位列表：</strong>
              <ul className="list-disc list-inside mt-2 text-white/70">
                {originalFeatures.map((f, idx) => (
                  <li key={idx}>{f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Action Bar */}
      <div className="sticky bottom-0 w-full border-t border-white/10 bg-background-dark/90 p-4">
        <div className="max-w-4xl mx-auto flex justify-end">
          <button
            onClick={() => {
              const finalFileName =
                fileName || localStorage.getItem("lastUploadedFile");
              const dataId = localStorage.getItem("lastDataId");

              setSiteError("");
              setFileError("");

              if (!selectedSite) {
                setSiteError("請先選擇案場！");
                return;
              }

              if (!finalFileName || !dataId) {
                setFileError("請先上傳檔案！");
                return;
              }

              onNext({ fileName: finalFileName, dataId });
            }}
            className="bg-primary text-black px-8 py-2 rounded-lg font-bold"
          >
            下一步
          </button>
        </div>
      </div>

      {/* 懶人模式：進度遮罩 */}
      {lazyStep !== "idle" && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-lg rounded-2xl border border-primary/30 bg-background-dark p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined !text-3xl text-primary">auto_awesome</span>
              <h3 className="text-xl font-bold text-white">懶人模式執行中</h3>
            </div>

            <ol className="space-y-4">
              <LazyStepRow label="上傳資料" status="done" />
              <LazyStepRow
                label="自動清洗資料（IQR 綜合法）"
                status={
                  lazyStep === "cleaning"
                    ? (lazyError ? "failed" : "active")
                    : ["training", "done"].includes(lazyStep)
                    ? "done"
                    : "pending"
                }
              />
              <LazyStepRow
                label="貝葉斯優化訓練三模型（XGBoost / SVR / RandomForest）"
                status={
                  lazyStep === "training"
                    ? (lazyError ? "failed" : "active")
                    : lazyStep === "done"
                    ? "done"
                    : "pending"
                }
                hint="此步驟需要數分鐘，請耐心等候..."
              />
              <LazyStepRow
                label={
                  lazyBest
                    ? `推薦：${lazyBest.model_type}（WMAPE ${lazyBest.wmape.toFixed(4)}），準備進入預測頁...`
                    : "挑選最低 WMAPE 模型並進入預測頁"
                }
                status={lazyStep === "done" ? "done" : "pending"}
              />
            </ol>

            {lazyError && (
              <div className="mt-6 p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
                <p className="font-bold mb-1">執行失敗</p>
                <p className="text-red-200/90 break-all">{lazyError}</p>
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      // 退回手動模式：關閉遮罩、保留已上傳資料、取消勾選
                      setLazyStep("idle");
                      setLazyError("");
                      setLazyBest(null);
                      setLazyMode(false);
                    }}
                    className="px-4 py-1.5 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 text-sm"
                  >
                    改用手動模式
                  </button>
                  <button
                    onClick={() => {
                      const uploadId = Number(localStorage.getItem("lastDataId"));
                      const fname = fileName || localStorage.getItem("lastUploadedFile");
                      if (!uploadId || !fname || !selectedSite) {
                        setLazyStep("idle");
                        setLazyError("");
                        return;
                      }
                      setLazyError("");
                      runLazyMode({
                        siteIdNum: Number(selectedSite),
                        fileNameStr: fname,
                        uploadIdNum: uploadId,
                      });
                    }}
                    className="px-4 py-1.5 rounded-lg bg-primary text-black font-bold text-sm hover:opacity-90"
                  >
                    重試
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 懶人模式步驟列 ── */
function LazyStepRow({ label, status, hint }) {
  const icon =
    status === "done" ? (
      <span className="material-symbols-outlined !text-xl text-green-400">check_circle</span>
    ) : status === "active" ? (
      <span className="size-5 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
    ) : status === "failed" ? (
      <span className="material-symbols-outlined !text-xl text-red-400">cancel</span>
    ) : (
      <span className="size-5 rounded-full border border-white/20" />
    );

  const textColor =
    status === "done"
      ? "text-white"
      : status === "active"
      ? "text-primary"
      : status === "failed"
      ? "text-red-300"
      : "text-white/40";

  return (
    <li className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${textColor}`}>{label}</p>
        {status === "active" && hint && (
          <p className="text-xs text-white/40 mt-0.5">{hint}</p>
        )}
      </div>
    </li>
  );
}