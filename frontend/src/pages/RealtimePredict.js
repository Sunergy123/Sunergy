// src/pages/RealtimePredict.js
// 即時預測頁面：模擬器以 HTTP 推送資料 → 後端 in-memory buffer → 此頁每秒輪詢
// UI 與 PredictSolar 保持一致：相同的表格、燈號、模型摘要卡、排序/篩選/下載 XLSX
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Navbar from '../components/Navbar';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { API_BASE } from '../config';
import PredictionChart from '../components/PredictionChart';
import { useThresholds, readThresholds } from '../thresholds';

/* ── 公式說明 Tooltip ── */
function InfoTooltip({ text }) {
  return (
    <div className="relative group inline-block">
      <svg className="ml-1 w-4 h-4 text-white/40 cursor-pointer" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-.5.7-1.5 1.2-1.5 2.5" />
        <circle cx="12" cy="17" r="0.8" fill="currentColor" />
      </svg>
      <div className="absolute z-50 hidden group-hover:block w-72 p-3 rounded-lg bg-black text-white text-xs shadow-xl border border-white/10 -top-2 left-6 whitespace-pre-line">
        {text}
      </div>
    </div>
  );
}

/* ── 誤差燈號（與 PredictSolar 一致） ── */
const ErrorLight = ({ pct }) => {
  const t = useThresholds();
  if (pct === null || pct === undefined) return <span className="text-white/20 text-sm">—</span>;
  const raw = Number(pct);
  const v = Math.abs(raw);
  const prefix = raw > 0 ? '+' : '';
  if (v <= t.pct.warn) return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-full bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
      <span className="text-green-400 text-sm font-mono">{prefix}{raw.toFixed(1)}%</span>
    </span>
  );
  if (v <= t.pct.danger) return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-full bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.5)]" />
      <span className="text-yellow-400 text-sm font-mono">{prefix}{raw.toFixed(1)}%</span>
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-3 rounded-full bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)] animate-pulse" />
      <span className="text-red-400 text-sm font-mono">{prefix}{raw.toFixed(1)}%</span>
    </span>
  );
};

/* ── 整體診斷燈號（同 PredictSolar） ── */
const OverallStatus = ({ avgError, label }) => {
  const t = useThresholds();
  if (avgError === null || avgError === undefined) return null;
  const v = Number(avgError);
  let cfg = { color: 'text-green-400', bg: 'bg-green-500', shadow: 'shadow-[0_0_15px_rgba(34,197,94,0.4)]', label: '發電正常', desc: '預測與實際高度吻合' };
  if (v > t.pct.danger) cfg = { color: 'text-red-400', bg: 'bg-red-500', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.4)]', label: '發電異常', desc: '偏差過大，請檢查設備' };
  else if (v > t.pct.warn) cfg = { color: 'text-yellow-400', bg: 'bg-yellow-500', shadow: 'shadow-[0_0_15px_rgba(234,179,8,0.4)]', label: '需留意', desc: '可能有些微環境干擾' };
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex items-center justify-center">
        <div className={`size-8 rounded-full ${cfg.bg} ${cfg.shadow} animate-pulse`} />
      </div>
      <div className="flex flex-col">
        {label && <p className="text-[11px] text-white/30 font-bold uppercase tracking-widest">{label}</p>}
        <span className={`text-base font-black ${cfg.color}`}>{cfg.label}</span>
        <span className="text-[11px] text-white/30 italic">{cfg.desc}</span>
      </div>
    </div>
  );
};

const MODEL_COLORS = [
  { text: 'text-primary', bg: 'bg-primary/15', border: 'border-primary/30', dot: 'bg-primary' },
  { text: 'text-cyan-400', bg: 'bg-cyan-400/15', border: 'border-cyan-400/30', dot: 'bg-cyan-400' },
  { text: 'text-violet-400', bg: 'bg-violet-400/15', border: 'border-violet-400/30', dot: 'bg-violet-400' },
  { text: 'text-rose-400', bg: 'bg-rose-400/15', border: 'border-rose-400/30', dot: 'bg-rose-400' },
  { text: 'text-emerald-400', bg: 'bg-emerald-400/15', border: 'border-emerald-400/30', dot: 'bg-emerald-400' },
  { text: 'text-orange-400', bg: 'bg-orange-400/15', border: 'border-orange-400/30', dot: 'bg-orange-400' },
];

const SortIcon = ({ direction }) => {
  if (!direction) return <span className="text-white/15 text-xs ml-0.5">⇅</span>;
  return <span className="text-primary text-xs ml-0.5 font-bold">{direction === 'asc' ? '↑' : '↓'}</span>;
};

const getErrorColor = (pct, thresholds) => {
  if (pct === null || pct === undefined) return null;
  const v = Math.abs(Number(pct));
  if (isNaN(v)) return null;
  const t = (thresholds || readThresholds()).pct;
  if (v <= t.warn) return { bg: 'C6EFCE', fg: '006100' };
  if (v <= t.danger) return { bg: 'FFEB9C', fg: '9C6500' };
  return { bg: 'FFC7CE', fg: '9C0006' };
};

/* ── 連線狀態 LED ── */
function ConnectionLed({ lastPushAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!lastPushAt) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="size-2.5 rounded-full bg-white/30" />
        <span className="text-xs text-white/40">尚未收到資料</span>
      </span>
    );
  }
  const lastTs = new Date(lastPushAt.replace(' ', 'T')).getTime();
  const elapsed = (now - lastTs) / 1000;
  let dot = 'bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
  let text = 'text-green-400';
  let label = `${elapsed.toFixed(0)} 秒前收到`;
  if (elapsed > 30) {
    dot = 'bg-red-400 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse';
    text = 'text-red-400';
    label = `已 ${Math.floor(elapsed)} 秒未收到`;
  } else if (elapsed > 10) {
    dot = 'bg-yellow-400 shadow-[0_0_8px_rgba(234,179,8,0.6)]';
    text = 'text-yellow-400';
    label = `${elapsed.toFixed(0)} 秒前收到`;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`size-2.5 rounded-full ${dot}`} />
      <span className={`text-xs font-mono ${text}`}>{label}</span>
    </span>
  );
}

export default function RealtimePredict({
  activePage,
  onBack,
  onNavigateToDashboard,
  onLogout,
  onNavigateToSites,
  onNavigateToTrain,
  onNavigateToPredict,
  onNavigateToChangePassword,
  onOpenSettings,
  onNavigateToModelMgmt,
  onNavigateToRealtime,
  onNavigateToDataCleaning,
}) {
  const [selectedModelIds, setSelectedModelIds] = useState([]);
  const [trainedModels, setTrainedModels] = useState([]);
  const [modelSearch, setModelSearch] = useState('');
  const [modelTypeFilter, setModelTypeFilter] = useState('all');
  const [error, setError] = useState('');
  const [errorMode, setErrorMode] = useState('pct');

  // 物理式估算（pseudo-model）
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  const [physicsKwp, setPhysicsKwp] = useState('');
  const [physicsPr, setPhysicsPr] = useState('0.80');

  // realtime polling state
  const [isListening, setIsListening] = useState(false);
  const [result, setResult] = useState(null);  // { mode, columns, rows, total_rows, models_summary }
  const [lastPushAt, setLastPushAt] = useState(null);
  const cursorRef = useRef(0);
  const sessionRef = useRef(null);
  const pollTimerRef = useRef(null);

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [autoScrollLatest, setAutoScrollLatest] = useState(true);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'chart'

  // 案場清單(自動歸檔下拉用)
  const [sites, setSites] = useState([]);

  // 自動歸檔 (auto-archive):啟動只設案場,期間累積在後端 archive_buffer,停止時一次性寫入 DB
  const [autoArchive, setAutoArchive] = useState({
    enabled: false, site_id: null, site_name: null, started_at: null,
    collected_count: 0, trainable_count: 0,
  });
  const [aaSiteId, setAaSiteId] = useState('');
  const [aaToggling, setAaToggling] = useState(false);
  const [aaError, setAaError] = useState('');
  // 停止後保留上次歸檔摘要,讓使用者事後仍能直接拿去訓練
  const [lastArchiveSummary, setLastArchiveSummary] = useState(null);

  // 共用:把指定 upload 資訊寫入 localStorage 並跳到清洗頁
  const goCleanThisUpload = ({ upload_id, site_id, site_name, file_name }) => {
    if (!upload_id || !site_id) return;
    localStorage.setItem('lastDataId', String(upload_id));
    localStorage.setItem('lastUploadedFile', file_name || `realtime_${upload_id}.realtime`);
    localStorage.setItem('selectedSiteId', String(site_id));
    localStorage.setItem('lastSiteId', String(site_id));
    if (site_name) localStorage.setItem('selectedSiteName', site_name);
    localStorage.removeItem('afterDataId');
    if (onNavigateToDataCleaning) onNavigateToDataCleaning();
  };

  // ── 取得已訓練模型清單 ──
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || !user.user_id) {
      setError('找不到登入資訊，請重新登入');
      return;
    }
    fetch(`${API_BASE}/train/trained-models?user_id=${user.user_id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => []);
        if (!r.ok) throw new Error(data?.detail || '取得模型失敗');
        return data;
      })
      .then((data) => { if (Array.isArray(data)) setTrainedModels(data); })
      .catch((e) => setError(e.message || '取得模型失敗'));
  }, []);

  // ── 取得初始 buffer 狀態（讓使用者進來就看到「目前有多少筆資料」）──
  useEffect(() => {
    fetch(`${API_BASE}/realtime/status`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.last_push_at) setLastPushAt(d.last_push_at);
        if (d?.session_id) sessionRef.current = d.session_id;
      })
      .catch(() => {});
  }, []);

  // ── 取得使用者的案場清單(用於「保存為訓練集」的下拉選單) ──
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user?.user_id) return;
    fetch(`${API_BASE}/site/list?user_id=${user.user_id}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSites(data); })
      .catch(() => {});
  }, []);

  // ── 自動歸檔:輪詢狀態 ──
  useEffect(() => {
    const refresh = () => {
      fetch(`${API_BASE}/realtime/auto_archive/status`)
        .then((r) => r.json())
        .then((d) => { if (d) setAutoArchive(d); })
        .catch(() => {});
    };
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  const handleAutoArchiveStart = async () => {
    setAaError('');
    if (!aaSiteId) { setAaError('請先選擇案場'); return; }
    setAaToggling(true);
    try {
      const res = await fetch(`${API_BASE}/realtime/auto_archive/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: Number(aaSiteId) }),
      });
      const json = await res.json();
      if (!res.ok) { setAaError(json.detail || '啟動失敗'); }
      else {
        setAutoArchive(json);
        setLastArchiveSummary(null);   // 開新 session,清掉上次摘要
      }
    } catch (e) {
      setAaError(e.message || '無法連線');
    } finally {
      setAaToggling(false);
    }
  };

  const handleAutoArchiveStop = async () => {
    setAaToggling(true);
    setAaError('');
    try {
      const res = await fetch(`${API_BASE}/realtime/auto_archive/stop`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setAaError(json.detail || '停止失敗');
      } else {
        if (json.upload_id && json.rows_saved > 0) {
          setLastArchiveSummary({
            upload_id: json.upload_id,
            site_id: json.site_id,
            site_name: json.site_name,
            file_name: json.file_name,
            rows_saved: json.rows_saved,
            rows_skipped: json.rows_skipped || 0,
            collected_count: json.collected_count || json.rows_saved,
            started_at: json.started_at,
            stopped_at: json.stopped_at || new Date().toLocaleString('zh-TW'),
          });
        } else {
          // 無資料可存
          setAaError(json.message || '本次未建立資料集');
        }
        setAutoArchive((prev) => ({ ...prev, enabled: false, collected_count: 0, trainable_count: 0 }));
      }
    } catch (e) {
      setAaError(e.message || '無法連線');
    } finally {
      setAaToggling(false);
    }
  };


  const toggleModel = (modelId) => {
    const id = String(modelId);
    setSelectedModelIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  // ── 拉一次資料（增量或全量取決於 cursor）──
  const fetchOnce = useCallback(async (modelIds, sinceOverride, physicsCfg) => {
    const hasPhysics = !!(physicsCfg && physicsCfg.enabled && Number(physicsCfg.kwp) > 0);
    if ((!modelIds || modelIds.length === 0) && !hasPhysics) return;
    const since = sinceOverride !== undefined ? sinceOverride : cursorRef.current;
    try {
      const params = new URLSearchParams();
      params.set('model_ids', (modelIds || []).join(','));
      params.set('since', String(since));
      if (hasPhysics) {
        params.set('physics_kwp', String(Number(physicsCfg.kwp)));
        params.set('physics_pr', String(Number(physicsCfg.pr) || 0.80));
      }
      const url = `${API_BASE}/realtime/feed?${params.toString()}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || '即時資料讀取失敗');

      // session 變更 → 後端 buffer 被清空或重啟 → 重置本地資料
      const sessionChanged = sessionRef.current && json.session_id !== sessionRef.current;
      sessionRef.current = json.session_id;

      setResult((prev) => {
        const newRows = json.rows || [];
        let mergedRows;
        if (sessionChanged || since === 0) {
          mergedRows = newRows;
        } else {
          mergedRows = [...(prev?.rows || []), ...newRows];
        }
        return {
          mode: modelIds.length === 1 ? 'multi' : 'multi', // 永遠用 multi 欄位 schema，方便 UI 一致
          columns: json.columns || [],
          rows: mergedRows,
          total_rows: json.total_rows ?? mergedRows.length,
          models_summary: json.models_summary || [],
        };
      });

      cursorRef.current = json.new_cursor ?? since;
      setLastPushAt(json.last_push_at || null);
      if (sessionChanged) {
        cursorRef.current = json.new_cursor ?? 0;
      }
    } catch (e) {
      setError(e.message || '即時資料讀取失敗');
    }
  }, []);

  // ── 開始 / 暫停監聽 ──
  const startListening = async () => {
    if (selectedModelIds.length === 0 && !physicsEnabled) {
      alert('請先選擇至少一個模型（或啟用物理式估算）');
      return;
    }
    if (physicsEnabled) {
      const k = Number(physicsKwp);
      if (!Number.isFinite(k) || k <= 0) {
        alert('物理式估算需要填入有效的裝置容量 (kWp)');
        return;
      }
    }
    setError('');
    cursorRef.current = 0;            // 第一拉取整個 buffer
    setResult(null);
    setIsListening(true);
    const physicsCfg = { enabled: physicsEnabled, kwp: physicsKwp, pr: physicsPr };
    await fetchOnce(selectedModelIds, 0, physicsCfg);
    pollTimerRef.current = setInterval(() => {
      fetchOnce(selectedModelIds, undefined, physicsCfg);
    }, 1000);
  };

  const stopListening = () => {
    setIsListening(false);
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── 監聽中切換模型或物理式設定 → 重置 cursor，重啟輪詢（讓新設定對所有 buffer 重算） ──
  useEffect(() => {
    if (!isListening) return;
    cursorRef.current = 0;
    setResult(null);
    const physicsCfg = { enabled: physicsEnabled, kwp: physicsKwp, pr: physicsPr };
    fetchOnce(selectedModelIds, 0, physicsCfg);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      fetchOnce(selectedModelIds, undefined, physicsCfg);
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModelIds.join(','), physicsEnabled, physicsKwp, physicsPr]);

  // ── 清除後端緩衝 ──
  const handleClearBuffer = async () => {
    if (!window.confirm('確定要清空後端緩衝區嗎？所有已收到的即時資料將被刪除。')) return;
    try {
      const res = await fetch(`${API_BASE}/realtime/clear`, { method: 'POST' });
      if (!res.ok) throw new Error('清除失敗');
      const json = await res.json();
      sessionRef.current = json.session_id;
      cursorRef.current = 0;
      setResult(null);
      setLastPushAt(null);
    } catch (e) {
      setError(e.message || '清除失敗');
    }
  };

  // ── displayCols / 工具：與 PredictSolar 完全一致 ──
  const displayCols = result ? result.columns.filter((col) => {
    if (errorMode === 'pct') return !col.startsWith('eabs_') && col !== 'error_abs';
    return !col.startsWith('err_') && col !== 'error_pct';
  }) : [];

  const isPredCol = (col) => col.startsWith('pred_') || col === 'predicted_EAC';
  const isErrPctCol = (col) => col.startsWith('err_') || col === 'error_pct';
  const isErrAbsCol = (col) => col.startsWith('eabs_') || col === 'error_abs';
  const isErrCol = (col) => isErrPctCol(col) || isErrAbsCol(col);

  const isNumericCol = useCallback((col) => {
    if (!result?.rows) return false;
    for (const row of result.rows.slice(0, 20)) {
      const v = row[col];
      if (v !== null && v !== undefined && v !== '' && v !== '—') {
        return typeof v === 'number' || (!isNaN(Number(v)) && v !== '');
      }
    }
    return false;
  }, [result]);

  const getModelIdFromCol = (col) => {
    const parts = col.split('_');
    return parts.length >= 3 ? parseInt(parts[parts.length - 1]) : null;
  };

  const okModels = (result?.models_summary || []).filter((m) => m.status === 'ok');
  const modelColorMap = {};
  okModels.forEach((m, i) => { modelColorMap[m.model_id] = MODEL_COLORS[i % MODEL_COLORS.length]; });

  // ── 篩選 / 排序 ──
  const filteredRows = useMemo(() => {
    if (!result?.rows) return [];
    const allRows = result.rows;
    const activeFilters = Object.entries(filters).filter(([, f]) => f.value !== '' && f.value !== undefined);
    if (activeFilters.length === 0) return allRows;
    return allRows.filter((row) => activeFilters.every(([col, filter]) => {
      const cellVal = row[col];
      if (cellVal === null || cellVal === undefined) return false;
      if (filter.operator === 'contains') return String(cellVal).toLowerCase().includes(String(filter.value).toLowerCase());
      const numVal = Number(cellVal);
      const filterNum = Number(filter.value);
      if (isNaN(numVal) || isNaN(filterNum)) return false;
      switch (filter.operator) {
        case '>': return numVal > filterNum;
        case '<': return numVal < filterNum;
        case '=': return Math.abs(numVal - filterNum) < 0.0001;
        case '>=': return numVal >= filterNum;
        case '<=': return numVal <= filterNum;
        default: return true;
      }
    }));
  }, [result, filters]);

  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      let comparison = (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : String(aVal).localeCompare(String(bVal), 'zh-Hant');
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortConfig]);

  // 自動滾到最新一頁（最後一頁）
  useEffect(() => {
    if (!autoScrollLatest || !result) return;
    const totalP = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
    setPage(totalP - 1);
  }, [sortedRows.length, autoScrollLatest, result]);

  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSort = (colKey) => {
    setSortConfig((prev) => {
      if (prev.key !== colKey) return { key: colKey, direction: 'asc' };
      if (prev.direction === 'asc') return { key: colKey, direction: 'desc' };
      return { key: null, direction: null };
    });
    setPage(0);
    setAutoScrollLatest(false);
  };

  const updateFilter = (col, field, value) => {
    setFilters((prev) => {
      const existing = prev[col] || {};
      const updated = { ...existing, [field]: value };
      if (field === 'value' && !existing.operator) updated.operator = isNumericCol(col) ? '>' : 'contains';
      return { ...prev, [col]: updated };
    });
    setPage(0);
    setAutoScrollLatest(false);
  };

  const clearAllFilters = () => { setFilters({}); setPage(0); };
  const hasActiveFilters = Object.values(filters).some((f) => f.value !== '' && f.value !== undefined);

  const getColLabel = (col) => {
    if (col === 'time') return '時間';
    if (col === 'GI') return 'GI';
    if (col === 'TM') return 'TM';
    if (col === 'EAC') return '實際 EAC';
    if (col === 'predicted_EAC') return '預測 EAC';
    if (col === 'error_pct') return '誤差%';
    if (col === 'error_abs') return '誤差 kW';
    if (col === 'pred_physics_0') return '預測 物理式';
    if (col === 'err_physics_0') return '誤差% 物理式';
    if (col === 'eabs_physics_0') return '誤差kW 物理式';
    if (col.startsWith('pred_')) {
      const parts = col.replace('pred_', '').split('_');
      return `預測 ${parts.slice(0, -1).join('_')}`;
    }
    if (col.startsWith('err_')) {
      const parts = col.replace('err_', '').split('_');
      return `誤差% ${parts.slice(0, -1).join('_')}`;
    }
    if (col.startsWith('eabs_')) {
      const parts = col.replace('eabs_', '').split('_');
      return `誤差kW ${parts.slice(0, -1).join('_')}`;
    }
    return col;
  };

  const handleDownloadXlsx = () => {
    if (!result) return;
    const dataToExport = sortedRows;
    const tNow = readThresholds();
    const headerLabels = ['#', ...displayCols.map(getColLabel)];
    const wsData = [headerLabels];
    dataToExport.forEach((row, idx) => {
      const rowArr = [idx + 1];
      displayCols.forEach((col) => {
        const val = row[col];
        rowArr.push(val === null || val === undefined ? '' : val);
      });
      wsData.push(rowArr);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    const errColIndices = [];
    displayCols.forEach((col, ci) => { if (isErrCol(col)) errColIndices.push(ci + 1); });

    for (let r = 1; r < wsData.length; r++) {
      errColIndices.forEach((c) => {
        const cellAddr = XLSX.utils.encode_cell({ r, c });
        const cellVal = wsData[r][c];
        const colorInfo = getErrorColor(cellVal, tNow);
        if (colorInfo && ws[cellAddr]) {
          ws[cellAddr].s = {
            fill: { fgColor: { rgb: colorInfo.bg } },
            font: { color: { rgb: colorInfo.fg }, bold: true },
          };
        }
      });
    }
    for (let c = 0; c < headerLabels.length; c++) {
      const cellAddr = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[cellAddr]) {
        ws[cellAddr].s = {
          fill: { fgColor: { rgb: '1F2937' } },
          font: { color: { rgb: 'FFFFFF' }, bold: true },
          alignment: { horizontal: 'center' },
        };
      }
    }
    ws['!cols'] = headerLabels.map((h, i) => ({ wch: i === 0 ? 5 : Math.max(h.length * 2.5, 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '即時預測結果');
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `realtime_prediction_${ts}.xlsx`;
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), filename);
  };

  const navProps = { onNavigateToDashboard, onNavigateToTrain, onNavigateToPredict, onNavigateToSites, onNavigateToModelMgmt, onNavigateToChangePassword, onOpenSettings, onLogout, onNavigateToRealtime };

  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col font-sans">
      <Navbar activePage={activePage} {...navProps} />

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* ── 左側：配置區 ── */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <section className="bg-white/[0.02] p-6 rounded-2xl border border-white/10 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-3 italic">
              <div className="size-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined !text-xl">sensors</span>
              </div>
              即時預測配置
            </h2>

            <div className="space-y-6">
              {/* 1. 連線狀態 */}
              <div>
                <label className="text-sm text-white/40 mb-2 block font-bold uppercase tracking-widest">1. 連線狀態</label>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">後端緩衝區</span>
                    <span className="text-sm font-mono text-white">
                      {result?.total_rows ?? 0} 筆
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/50">資料來源</span>
                    <ConnectionLed lastPushAt={lastPushAt} />
                  </div>
                  <div className="pt-2 border-t border-white/5 text-[11px] text-white/40 leading-relaxed">
                    請開啟模擬器並啟用「推送到系統」，後端 URL 設為 <span className="text-primary font-mono">{API_BASE}</span>
                  </div>
                </div>
              </div>

              {/* 2. 選擇模型 */}
              <div>
                <label className="text-sm text-white/40 mb-2 block font-bold uppercase tracking-widest">
                  2. 選擇訓練模型
                  <span className="ml-2 text-primary/60 normal-case">（可多選比對）</span>
                </label>

                <div className="relative mb-2">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 !text-base text-white/20">search</span>
                  <input
                    type="text"
                    placeholder="搜尋案場名稱..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white/70 placeholder:text-white/20 focus:border-primary/50 focus:outline-none"
                  />
                </div>

                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {['all', ...Array.from(new Set(trainedModels.map((m) => m.model_type)))].map((type) => (
                    <button
                      key={type}
                      onClick={() => setModelTypeFilter(type)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${modelTypeFilter === type ? 'border-primary bg-primary/10 text-primary' : 'border-white/10 bg-white/5 text-white/40 hover:text-white/60'}`}
                    >
                      {type === 'all' ? '全部' : type}
                    </button>
                  ))}
                </div>

                <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                  {/* 物理式估算（偽模型，永遠在最上面） */}
                  <label
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${
                      physicsEnabled
                        ? 'bg-blue-500/[0.10] border-blue-400/40 shadow-[0_0_12px_rgba(96,165,250,0.12)]'
                        : 'border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={physicsEnabled}
                      onChange={(e) => setPhysicsEnabled(e.target.checked)}
                      className="accent-blue-400 size-4 rounded mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-black px-2 py-0.5 rounded ${physicsEnabled ? 'bg-blue-400/20 text-blue-300' : 'bg-white/5 text-white/50'}`}>
                          PHYSICS
                        </span>
                        <span className="text-[10px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded">
                          無需歷史資料
                        </span>
                      </div>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        物理式估算（GI × kWp × PR）
                      </p>
                      {physicsEnabled && (
                        <div className="mt-2 flex flex-wrap gap-2 items-center" onClick={(e) => e.preventDefault()}>
                          <label className="flex items-center gap-1 text-[11px] text-white/60">
                            <span>容量 kWp</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={physicsKwp}
                              onChange={(e) => setPhysicsKwp(e.target.value)}
                              placeholder="10"
                              className="w-20 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-400"
                            />
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-white/60">
                            <span>PR</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.1"
                              max="1"
                              value={physicsPr}
                              onChange={(e) => setPhysicsPr(e.target.value)}
                              className="w-16 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-400"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </label>

                  {trainedModels.length === 0 && (
                    <p className="text-sm text-white/20 italic py-4 text-center">尚無可用模型</p>
                  )}
                  {trainedModels
                    .filter((m) => modelTypeFilter === 'all' || m.model_type === modelTypeFilter)
                    .filter((m) => {
                      if (!modelSearch.trim()) return true;
                      const q = modelSearch.toLowerCase();
                      return (m.site_name || '').toLowerCase().includes(q)
                        || (m.model_type || '').toLowerCase().includes(q)
                        || String(m.model_id).includes(q);
                    })
                    .map((m) => {
                      const isSelected = selectedModelIds.includes(String(m.model_id));
                      return (
                        <label
                          key={m.model_id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${isSelected ? 'bg-primary/10 border-primary/30 shadow-[0_0_12px_rgba(242,204,13,0.08)]' : 'border-white/5 hover:bg-white/[0.03] hover:border-white/10'}`}
                        >
                          <input type="checkbox" checked={isSelected} onChange={() => toggleModel(m.model_id)} className="accent-primary size-4 rounded" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-black px-2 py-0.5 rounded ${isSelected ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/50'}`}>{m.model_type}</span>
                              <span className="text-xs text-white/30 font-mono">#{m.model_id}</span>
                              {m.site_name && (
                                <span className="text-[10px] text-cyan-400/70 bg-cyan-400/10 px-1.5 py-0.5 rounded truncate max-w-[100px]" title={m.site_name}>
                                  {m.site_name}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-white/20 mt-0.5 truncate">
                              {m.trained_at ? m.trained_at.slice(0, 16).replace('T', ' ') : ''}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                </div>
                {(selectedModelIds.length > 0 || physicsEnabled) && (
                  <p className="text-sm text-primary/60 mt-2 font-bold">
                    已選 {selectedModelIds.length + (physicsEnabled ? 1 : 0)} 個模型
                    {physicsEnabled && selectedModelIds.length === 0 && (
                      <span className="text-blue-300/70 font-normal ml-1">（僅物理式）</span>
                    )}
                  </p>
                )}
              </div>

              {/* 3. 自動歸檔 */}
              <div>
                <label className="text-sm text-white/40 mb-2 block font-bold uppercase tracking-widest flex items-center gap-2">
                  3. 自動歸檔
                  {autoArchive.enabled && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 normal-case">
                      <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-400">ARCHIVING</span>
                    </span>
                  )}
                </label>

                {!autoArchive.enabled ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                    {lastArchiveSummary && (
                      <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/[0.08] p-3 space-y-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-base text-emerald-400">history</span>
                          <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">上次歸檔結果</span>
                        </div>
                        <div className="text-[11px] text-white/70 space-y-0.5 font-mono">
                          <div>案場:<span className="text-white">{lastArchiveSummary.site_name}</span></div>
                          <div>Upload:<span className="text-primary">#{lastArchiveSummary.upload_id}</span></div>
                          <div>寫入筆數:<span className="text-emerald-400 font-bold">{lastArchiveSummary.rows_saved} 筆</span></div>
                          {lastArchiveSummary.rows_skipped > 0 && (
                            <div>略過:<span className="text-yellow-400">{lastArchiveSummary.rows_skipped} 筆</span></div>
                          )}
                          <div className="text-white/40 text-[10px]">{lastArchiveSummary.started_at} ~ {lastArchiveSummary.stopped_at}</div>
                        </div>
                        <button
                          onClick={() => goCleanThisUpload(lastArchiveSummary)}
                          className="w-full mt-1 px-3 py-2 rounded-lg bg-primary text-background-dark font-black text-xs hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined !text-base">arrow_forward</span>
                          用此資料 清洗 → 訓練
                        </button>
                      </div>
                    )}
                    <p className="text-[11px] text-white/50 leading-relaxed">
                      啟動後,平台會記錄這段期間的即時資料;按「停止」時一次性寫入該案場的資料庫(等同手動上傳 CSV)。
                    </p>
                    <div>
                      <label className="text-[10px] text-white/40 mb-1 block font-bold uppercase">案場</label>
                      <select
                        value={aaSiteId}
                        onChange={(e) => setAaSiteId(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-primary/50 focus:outline-none"
                      >
                        <option value="" className="bg-background-dark">-- 請選擇 --</option>
                        {sites.map((s) => (
                          <option key={s.site_id} value={s.site_id} className="bg-background-dark">
                            {s.site_name} ({s.site_code})
                          </option>
                        ))}
                      </select>
                    </div>
                    {aaError && (
                      <p className="text-[11px] text-red-400">{aaError}</p>
                    )}
                    <button
                      onClick={handleAutoArchiveStart}
                      disabled={aaToggling || !aaSiteId}
                      className="w-full px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/25 transition-all text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined !text-base">play_arrow</span>
                      {aaToggling ? '啟動中...' : '啟動自動歸檔'}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/40 font-bold uppercase">寫入案場</span>
                      <span className="text-xs font-mono text-white">{autoArchive.site_name || `#${autoArchive.site_id}`}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-white/40 font-bold uppercase">啟動時間</span>
                      <span className="text-[11px] font-mono text-white/70">{autoArchive.started_at || '—'}</span>
                    </div>
                    <p className="text-[10px] text-white/40 leading-relaxed pt-2 border-t border-white/5">
                      平台正在記錄即時資料,按下方按鈕後會一次性寫入該案場的資料庫。
                    </p>
                    {aaError && (
                      <p className="text-[11px] text-red-400">{aaError}</p>
                    )}
                    <button
                      onClick={handleAutoArchiveStop}
                      disabled={aaToggling}
                      className="w-full mt-2 px-3 py-2 rounded-lg bg-red-500/15 border border-red-400/40 text-red-300 hover:bg-red-500/25 transition-all text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined !text-base">stop</span>
                      {aaToggling ? '處理中...' : '停止並寫入資料庫'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-6">
              {!isListening ? (
                <button
                  onClick={startListening}
                  disabled={selectedModelIds.length === 0 && !physicsEnabled}
                  className="w-full bg-primary text-background-dark py-4 rounded-2xl font-black text-base hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_30px_rgba(242,204,13,0.2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  開始即時監聽
                </button>
              ) : (
                <button
                  onClick={stopListening}
                  className="w-full bg-red-500/20 border border-red-500/40 text-red-300 py-4 rounded-2xl font-black text-base hover:bg-red-500/30 active:scale-95 transition-all"
                >
                  暫停監聽
                </button>
              )}
              <button
                onClick={handleClearBuffer}
                className="w-full bg-white/5 border border-white/10 text-white/60 py-2 rounded-xl text-sm hover:bg-white/10 transition-all"
              >
                清除後端緩衝區
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
          </section>

          {/* 模型摘要卡（即時累計值） */}
          {result && okModels.length > 0 && (
            <section className="space-y-3 animate-fade-in">
              {okModels.map((m, i) => {
                const c = MODEL_COLORS[i % MODEL_COLORS.length];
                const diff = (m.total_predicted_eac != null && m.total_actual_eac != null)
                  ? m.total_predicted_eac - m.total_actual_eac : null;
                return (
                  <div key={m.model_id} className={`${c.bg} border ${c.border} p-5 rounded-2xl`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`size-3 rounded-full ${c.dot}`} />
                      <span className={`text-sm font-black ${c.text}`}>{m.model_type}</span>
                      <span className="text-xs text-white/30 font-mono">#{m.model_id}</span>
                    </div>

                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between items-baseline">
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">累計預估</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black font-mono text-white">{m.total_predicted_eac?.toLocaleString() ?? '—'}</span>
                          <span className={`text-xs font-bold ${c.text}`}>kWh</span>
                        </div>
                      </div>
                      {m.total_actual_eac != null && (
                        <div className="flex justify-between items-baseline">
                          <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">累計實際</p>
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black font-mono text-white">{m.total_actual_eac?.toLocaleString()}</span>
                            <span className="text-xs font-bold text-white/40">kWh</span>
                          </div>
                        </div>
                      )}
                      {diff !== null && (
                        <div className="flex justify-between items-baseline">
                          <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">差異</p>
                          <div className="flex items-baseline gap-1">
                            <span className={`text-lg font-black font-mono ${diff > 0 ? 'text-orange-400' : diff < 0 ? 'text-cyan-400' : 'text-white/40'}`}>
                              {diff > 0 ? '+' : ''}{diff.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-xs font-bold text-white/40">kWh</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                      <div>
                        <div className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-1 flex items-center">
                          WMAPE
                          <InfoTooltip text={"WMAPE（加權平均絕對百分比誤差）\n\n公式：Σ|預測値 − 實際値| ÷ Σ|實際値| × 100%\n\n以實際發電量加權，避免低發電時段拉高平均誤差。"} />
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black font-mono text-white">{m.avg_error_pct != null ? m.avg_error_pct.toFixed(2) : '—'}</span>
                          <span className={`text-sm font-bold ${c.text}`}>%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-1 flex items-center">
                          MAE
                          <InfoTooltip text={"MAE（平均絕對誤差）\n\n公式：Σ|預測値 − 實際値| ÷ 筆數\n單位 kW，反映平均絕對差距。"} />
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black font-mono text-white">{m.avg_error_abs != null ? m.avg_error_abs.toFixed(2) : '—'}</span>
                          <span className={`text-sm font-bold ${c.text}`}>kW</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5">
                      <OverallStatus avgError={m.avg_error_pct} />
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </div>

        {/* ── 右側：即時資料表 ── */}
        <div className="lg:col-span-9 flex flex-col">
          <div className={`flex-1 w-full rounded-2xl border border-white/10 bg-white/[0.01] p-6 flex flex-col relative transition-all shadow-2xl ${!result && 'items-center justify-center border-dashed opacity-40 min-h-[500px]'}`}>
            {result ? (
              <div className="w-full flex flex-col animate-fade-in">
                <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined !text-xl text-primary">monitoring</span>
                    即時預測結果
                    <span className="text-base text-white/30 font-normal ml-2">
                      {hasActiveFilters ? `篩選後 ${sortedRows.length} / 共 ${result.total_rows} 筆` : `共 ${result.total_rows} 筆`}
                    </span>
                    {isListening && (
                      <span className="ml-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/15 border border-green-400/30">
                        <span className="size-2 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-[11px] font-bold text-green-400">LIVE</span>
                      </span>
                    )}
                  </h2>

                  <div className="flex items-center gap-2 flex-wrap">
                    {okModels.length > 1 && (
                      <div className="flex items-center gap-3 mr-2">
                        {okModels.map((m, i) => {
                          const c = MODEL_COLORS[i % MODEL_COLORS.length];
                          return (
                            <span key={m.model_id} className="flex items-center gap-1.5">
                              <span className={`size-2.5 rounded-full ${c.dot}`} />
                              <span className={`text-sm font-bold ${c.text}`}>{m.model_type}#{m.model_id}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {okModels.length === 1 && (
                      <div className="text-sm text-white/30 mr-2">
                        模型：<span className="text-primary font-bold">{okModels[0].model_type}</span>
                      </div>
                    )}

                    {/* View mode toggle: 表格 / 圖表 */}
                    <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setViewMode('table')}
                        className={`flex items-center gap-1 px-3 py-2 text-sm font-bold transition-all ${viewMode === 'table'
                          ? 'bg-primary/15 text-primary'
                          : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                        }`}
                        title="表格模式"
                      >
                        <span className="material-symbols-outlined !text-base">table_rows</span>
                        表格
                      </button>
                      <div className="w-px h-5 bg-white/10" />
                      <button
                        onClick={() => setViewMode('chart')}
                        className={`flex items-center gap-1 px-3 py-2 text-sm font-bold transition-all ${viewMode === 'chart'
                          ? 'bg-primary/15 text-primary'
                          : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                        }`}
                        title="圖表模式"
                      >
                        <span className="material-symbols-outlined !text-base">show_chart</span>
                        圖表
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
                        <button onClick={() => setErrorMode('pct')} className={`px-3 py-2 text-sm font-bold transition-all ${errorMode === 'pct' ? 'bg-primary/15 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white/60'}`}>%</button>
                        <div className="w-px h-5 bg-white/10" />
                        <button onClick={() => setErrorMode('abs')} className={`px-3 py-2 text-sm font-bold transition-all ${errorMode === 'abs' ? 'bg-primary/15 text-primary' : 'text-white/40 hover:bg-white/5 hover:text-white/60'}`}>kW</button>
                      </div>
                    </div>

                    <button
                      onClick={() => setAutoScrollLatest((v) => !v)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${autoScrollLatest ? 'bg-primary/10 border-primary/30 text-primary' : 'border-white/10 text-white/40 hover:bg-white/5 hover:text-white/60'}`}
                      title="自動跳到最新一頁"
                    >
                      <span className="material-symbols-outlined !text-base">vertical_align_bottom</span>
                      跟最新
                    </button>

                    <button
                      onClick={() => setShowFilters((f) => !f)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition-all ${showFilters ? 'bg-primary/10 border-primary/30 text-primary' : 'border-white/10 text-white/40 hover:bg-white/5 hover:text-white/60'}`}
                    >
                      <span className="material-symbols-outlined !text-base">filter_alt</span>
                      篩選
                      {hasActiveFilters && (
                        <span className="size-5 rounded-full bg-primary text-background-dark text-[10px] font-black flex items-center justify-center">
                          {Object.values(filters).filter((f) => f.value).length}
                        </span>
                      )}
                    </button>

                    {hasActiveFilters && (
                      <button onClick={clearAllFilters} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all">
                        <span className="material-symbols-outlined !text-base">close</span>
                        清除
                      </button>
                    )}

                    <button onClick={handleDownloadXlsx} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all">
                      <span className="material-symbols-outlined !text-base">download</span>
                      下載 XLSX
                    </button>
                  </div>
                </div>

                {/* === Chart mode (即時) === */}
                {viewMode === 'chart' && (
                  <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                    <PredictionChart
                      rows={sortedRows}
                      columns={result.columns}
                      okModels={okModels}
                      modelColorMap={modelColorMap}
                      getTimeLabel={(r) => r.time || ''}
                      height={520}
                    />
                    <p className="text-xs text-white/30 mt-3 text-center">
                      橫軸：時間　|　縱軸：發電量 (kW)　|　即時緩衝區共 {sortedRows.length} 筆
                    </p>
                  </div>
                )}

                {/* === Table mode === */}
                {viewMode === 'table' && (
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-white/5 text-white/40 uppercase sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 font-bold">#</th>
                        {displayCols.map((col) => {
                          const mid = getModelIdFromCol(col);
                          const c = mid !== null && modelColorMap[mid] ? modelColorMap[mid] : null;
                          const isHighlight = isPredCol(col) || isErrCol(col) || col === 'EAC';
                          const label = getColLabel(col);
                          const isSorted = sortConfig.key === col;
                          return (
                            <th
                              key={col}
                              className={`px-4 py-3 font-bold cursor-pointer select-none hover:text-white/60 transition-colors ${isHighlight ? (c ? c.text : 'text-primary') : ''}`}
                              onClick={() => handleSort(col)}
                            >
                              <span className="inline-flex items-center gap-0.5">
                                {label}
                                <SortIcon direction={isSorted ? sortConfig.direction : null} />
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                      {showFilters && (
                        <tr className="bg-white/[0.03] border-t border-white/5">
                          <td className="px-3 py-2"></td>
                          {displayCols.map((col) => {
                            const numeric = isNumericCol(col);
                            const filterVal = filters[col]?.value || '';
                            const filterOp = filters[col]?.operator || (numeric ? '>' : 'contains');
                            return (
                              <td key={col} className="px-2 py-2">
                                <div className="flex items-center gap-0.5">
                                  {numeric ? (
                                    <>
                                      <select value={filterOp} onChange={(e) => updateFilter(col, 'operator', e.target.value)} className="bg-white/5 border border-white/10 rounded text-xs text-white/60 px-1.5 py-1 w-12 focus:border-primary/50 focus:outline-none">
                                        <option value=">" className="text-black bg-white">&gt;</option>
                                        <option value="<" className="text-black bg-white">&lt;</option>
                                        <option value="=" className="text-black bg-white">=</option>
                                        <option value=">=" className="text-black bg-white">&gt;=</option>
                                        <option value="<=" className="text-black bg-white">&lt;=</option>
                                      </select>
                                      <input type="text" value={filterVal} onChange={(e) => updateFilter(col, 'value', e.target.value)} placeholder="值" className="bg-white/5 border border-white/10 rounded text-xs text-white/70 px-2 py-1 w-20 placeholder:text-white/15 focus:border-primary/50 focus:outline-none font-mono" />
                                    </>
                                  ) : (
                                    <input type="text" value={filterVal} onChange={(e) => { updateFilter(col, 'operator', 'contains'); updateFilter(col, 'value', e.target.value); }} placeholder="搜尋..." className="bg-white/5 border border-white/10 rounded text-xs text-white/70 px-2 py-1 w-full placeholder:text-white/15 focus:border-primary/50 focus:outline-none" />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      )}
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono text-white/70">
                      {pagedRows.length === 0 ? (
                        <tr>
                          <td colSpan={displayCols.length + 1} className="px-4 py-8 text-center text-white/20 text-sm">
                            {hasActiveFilters ? '沒有符合篩選條件的資料' : '等待模擬器推送資料...'}
                          </td>
                        </tr>
                      ) : (
                        pagedRows.map((row, idx) => {
                          const globalIdx = page * PAGE_SIZE + idx;
                          return (
                            <tr key={globalIdx} className="hover:bg-white/[0.03] transition-colors">
                              <td className="px-4 py-2.5 text-white/20">{globalIdx + 1}</td>
                              {displayCols.map((col) => {
                                const val = row[col];
                                const mid = getModelIdFromCol(col);
                                const c = mid !== null && modelColorMap[mid] ? modelColorMap[mid] : null;
                                let cellClass = 'px-4 py-2.5';
                                if (isPredCol(col)) cellClass += ` font-bold ${c ? c.text : 'text-primary'}`;
                                else if (col === 'EAC') cellClass += ' text-blue-400';
                                else if (isErrCol(col)) {
                                  if (isErrAbsCol(col)) {
                                    const numVal = val !== null && val !== undefined ? Number(val) : null;
                                    const absV = numVal !== null ? Math.abs(numVal) : null;
                                    let dotClass = 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]';
                                    let textClass = 'text-green-400';
                                    if (absV !== null && absV > 5) { dotClass = 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)] animate-pulse'; textClass = 'text-red-400'; }
                                    else if (absV !== null && absV > 1) { dotClass = 'bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.5)]'; textClass = 'text-yellow-400'; }
                                    return (
                                      <td key={col} className="px-4 py-2.5">
                                        {numVal === null ? '—' :
                                          <span className="inline-flex items-center gap-1.5">
                                            <span className={`size-3 rounded-full ${dotClass}`} />
                                            <span className={`text-sm font-mono font-bold ${textClass}`}>
                                              {numVal > 0 ? '+' : ''}{numVal.toFixed(2)}
                                            </span>
                                          </span>
                                        }
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={col} className="px-4 py-2.5">
                                      <ErrorLight pct={val} />
                                    </td>
                                  );
                                }
                                return (
                                  <td key={col} className={cellClass}>
                                    {val === null || val === undefined ? '—' : typeof val === 'number' ? Number(val).toFixed(4) : String(val)}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                )}

                {viewMode === 'table' && totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-white/40">
                    <span>顯示 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)} / {sortedRows.length}{hasActiveFilters ? ` (篩選自 ${result.total_rows} 筆)` : ''}</span>
                    <div className="flex gap-1">
                      <button onClick={() => { setPage((p) => Math.max(0, p - 1)); setAutoScrollLatest(false); }} disabled={page === 0} className="px-4 py-1.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-20 transition-all">上一頁</button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 7) pageNum = i;
                        else if (page < 3) pageNum = i;
                        else if (page > totalPages - 4) pageNum = totalPages - 7 + i;
                        else pageNum = page - 3 + i;
                        return (
                          <button key={pageNum} onClick={() => { setPage(pageNum); setAutoScrollLatest(false); }} className={`px-3 py-1.5 rounded border transition-all ${page === pageNum ? 'border-primary text-primary bg-primary/10' : 'border-white/10 hover:bg-white/5'}`}>{pageNum + 1}</button>
                        );
                      })}
                      <button onClick={() => { setPage((p) => Math.min(totalPages - 1, p + 1)); setAutoScrollLatest(false); }} disabled={page >= totalPages - 1} className="px-4 py-1.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-20 transition-all">下一頁</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="size-20 rounded-full bg-white/5 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined !text-4xl text-white/10">sensors</span>
                </div>
                <p className="text-base font-bold text-white/20 tracking-widest uppercase">選擇模型後點擊「開始即時監聽」</p>
                <p className="text-sm text-white/10">同時開啟模擬器並啟用「推送到系統」</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <div className="p-8 border-t border-white/10 bg-background-dark/95 flex justify-end gap-6 backdrop-blur-xl">
        <button onClick={onBack || onNavigateToDashboard} className="text-sm font-bold text-white/30 hover:text-white transition-colors">返回</button>
        <button onClick={onNavigateToDashboard} className="px-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 hover:border-white/20 transition-all">返回首頁看板</button>
      </div>
    </div>
  );
}
