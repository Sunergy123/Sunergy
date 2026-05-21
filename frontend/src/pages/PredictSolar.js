// src/pages/PredictSolar.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API_BASE_URL } from "../config";
import Navbar from '../components/Navbar';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import PredictionChart from '../components/PredictionChart';
import { useThresholds, readThresholds } from '../thresholds';


/* ── 公式說明 Tooltip ── */
function InfoTooltip({ text }) {
  return (
    <div className="relative group inline-block">
      <svg
        className="ml-1 w-4 h-4 text-white/40 cursor-pointer"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        viewBox="0 0 24 24"
      >
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

/* ── 誤差燈號組件 ── */
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

/* ── 整體診斷燈號 ── */
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

/* ── 模型顏色表 ── */
const MODEL_COLORS = [
  { text: 'text-primary', bg: 'bg-primary/15', border: 'border-primary/30', dot: 'bg-primary' },
  { text: 'text-cyan-400', bg: 'bg-cyan-400/15', border: 'border-cyan-400/30', dot: 'bg-cyan-400' },
  { text: 'text-violet-400', bg: 'bg-violet-400/15', border: 'border-violet-400/30', dot: 'bg-violet-400' },
  { text: 'text-rose-400', bg: 'bg-rose-400/15', border: 'border-rose-400/30', dot: 'bg-rose-400' },
  { text: 'text-emerald-400', bg: 'bg-emerald-400/15', border: 'border-emerald-400/30', dot: 'bg-emerald-400' },
  { text: 'text-orange-400', bg: 'bg-orange-400/15', border: 'border-orange-400/30', dot: 'bg-orange-400' },
];

/* ── 排序方向圖示 ── */
const SortIcon = ({ direction }) => {
  if (!direction) return <span className="text-white/15 text-xs ml-0.5">⇅</span>;
  return <span className="text-primary text-xs ml-0.5 font-bold">{direction === 'asc' ? '↑' : '↓'}</span>;
};

/* ── 取得燈號顏色 hex ── */
const getErrorColor = (pct, thresholds) => {
  if (pct === null || pct === undefined) return null;
  const v = Math.abs(Number(pct));
  if (isNaN(v)) return null;
  const t = (thresholds || readThresholds()).pct;
  if (v <= t.warn) return { bg: 'C6EFCE', fg: '006100' };   // 綠
  if (v <= t.danger) return { bg: 'FFEB9C', fg: '9C6500' }; // 黃
  return { bg: 'FFC7CE', fg: '9C0006' };                     // 紅
};

export default function PredictSolar({
  activePage,
  onBack,
  onNavigateToDashboard,
  onLogout,
  onNavigateToSites,
  onNavigateToTrain,
  onNavigateToPredict,
  onNavigateToRealtime,
  onNavigateToChangePassword,
  onOpenSettings,
  onNavigateToModelMgmt,
  onResultChange,
  onNavigateToErrorAnalysis,
}) {
  const [file, setFile] = useState(null);
  const [selectedModelIds, setSelectedModelIds] = useState([]);
  // 懶人模式推薦：{ model_id, model_type, wmape } | null
  const [lazyRecommendation, setLazyRecommendation] = useState(null);

  useEffect(() => {
    const modelId = localStorage.getItem("predict_model_id");
    if (modelId) {
      setSelectedModelIds([modelId]);
      localStorage.removeItem("predict_model_id");
    }
    // 讀懶人模式推薦資訊（顯示推薦徽章用）
    const winnerId = localStorage.getItem("lazyModeWinnerId");
    const winnerInfoRaw = localStorage.getItem("lazyModeWinnerInfo");
    if (winnerId) {
      let info = { model_id: winnerId };
      try {
        if (winnerInfoRaw) info = { ...info, ...JSON.parse(winnerInfoRaw) };
      } catch (_) { /* ignore */ }
      setLazyRecommendation(info);
      localStorage.removeItem("lazyModeWinnerId");
      localStorage.removeItem("lazyModeWinnerInfo");
    }
  }, []);

  const [trainedModels, setTrainedModels] = useState([]);
  const [modelSearch, setModelSearch] = useState('');
  const [modelTypeFilter, setModelTypeFilter] = useState('all');
  const [isPredicting, setIsPredicting] = useState(false);
  // 物理式估算（pseudo-model）
  const [physicsEnabled, setPhysicsEnabled] = useState(false);
  const [physicsKwp, setPhysicsKwp] = useState('');
  const [physicsPr, setPhysicsPr] = useState('0.80');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [errorMode, setErrorMode] = useState('pct'); // 'pct' | 'abs'

  // pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  // sorting state: { key: string, direction: 'asc' | 'desc' | null }
  const [sortConfig, setSortConfig] = useState({ key: null, direction: null });

  // filter state: { [colName]: { operator: '>' | '<' | '=' | '>=' | '<=' | 'contains', value: string } }
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  // view mode: 'table' | 'chart'
  const [viewMode, setViewMode] = useState('table');
  // 圖表模式下：選取要顯示的日期（empty = 全部）
  const [selectedDates, setSelectedDates] = useState([]);

  // Fetch trained models on mount
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || !user.user_id) {
      setError("找不到登入資訊，請重新登入");
      return;
    }
    const userId = user.user_id;
    fetch(`${API_BASE_URL}/train/trained-models?user_id=${userId}`)
      .then(async (r) => {
        const data = await r.json().catch(() => []);
        if (!r.ok) throw new Error(data?.detail || '取得模型失敗');
        return data;
      })
      .then((data) => {
        if (Array.isArray(data)) setTrainedModels(data);
      })
      .catch((e) => setError(e.message || '取得模型失敗'));
  }, []);

  const toggleModel = (modelId) => {
    const id = String(modelId);
    setSelectedModelIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handlePredict = async () => {
    const nMl = selectedModelIds.length;
    if (!file || (nMl === 0 && !physicsEnabled)) {
      return alert('請上傳資料並選擇至少一個模型（或啟用物理式估算）');
    }
    if (physicsEnabled) {
      const k = Number(physicsKwp);
      if (!Number.isFinite(k) || k <= 0) {
        return alert('物理式估算需要填入有效的裝置容量 (kWp)');
      }
    }
    setIsPredicting(true);
    setError('');
    setResult(null);
    setSortConfig({ key: null, direction: null });
    setFilters({});
    try {
      const formData = new FormData();
      formData.append('file', file);

      let nextResult;
      // 物理式啟用 OR 多 ML 模型 → 走 multi 端點
      if (physicsEnabled || nMl > 1) {
        formData.append('model_ids', selectedModelIds.join(','));
        if (physicsEnabled) {
          formData.append('physics_kwp', String(Number(physicsKwp)));
          formData.append('physics_pr', String(Number(physicsPr) || 0.80));
        }
        const res = await fetch(`${API_BASE_URL}/train/predict-file-multi`, {
          method: 'POST',
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.detail || '預測失敗');
        nextResult = { mode: 'multi', ...json };
      } else {
        formData.append('model_id', selectedModelIds[0]);
        const res = await fetch(`${API_BASE_URL}/train/predict-file`, {
          method: 'POST',
          body: formData,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.detail || '預測失敗');
        nextResult = {
          mode: 'single',
          models_summary: [{
            model_id: json.model_id,
            model_type: json.model_type,
            status: 'ok',
            total_predicted_eac: json.total_predicted_eac,
            total_actual_eac: json.total_actual_eac,
            avg_error_pct: json.avg_error_pct,
            avg_error_abs: json.avg_error_abs,
          }],
          total_rows: json.total_rows,
          columns: json.columns,
          rows: json.rows,
        };
      }
      setResult(nextResult);
      onResultChange?.(nextResult);
      setPage(0);
    } catch (e) {
      setError(e.message || '預測過程發生錯誤');
    } finally {
      setIsPredicting(false);
    }
  };

  const navProps = { onNavigateToDashboard, onNavigateToTrain, onNavigateToPredict, onNavigateToRealtime, onNavigateToSites, onNavigateToModelMgmt, onNavigateToChangePassword, onOpenSettings, onLogout };

  const displayCols = result ? result.columns.filter(col => {
    if (errorMode === 'pct') return !col.startsWith('eabs_') && col !== 'error_abs';
    return !col.startsWith('err_') && col !== 'error_pct';
  }) : [];

  // Detect which columns are prediction/error columns
  const isPredCol = (col) => col.startsWith('pred_') || col === 'predicted_EAC';
  const isErrPctCol = (col) => col.startsWith('err_') || col === 'error_pct';
  const isErrAbsCol = (col) => col.startsWith('eabs_') || col === 'error_abs';
  const isErrCol = (col) => isErrPctCol(col) || isErrAbsCol(col);

  // Determine if a column is numeric based on first few non-null values
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

  // Get model info from column name like "pred_XGBoost_5"
  const getModelIdFromCol = (col) => {
    const parts = col.split('_');
    return parts.length >= 3 ? parseInt(parts[parts.length - 1]) : null;
  };

  // Build color map for selected models
  const okModels = (result?.models_summary || []).filter(m => m.status === 'ok');
  const modelColorMap = {};
  okModels.forEach((m, i) => {
    modelColorMap[m.model_id] = MODEL_COLORS[i % MODEL_COLORS.length];
  });

  // ── 日期 / 時間 label 抽取（供圖表 & 日期篩選器使用） ──
  const extractDateStr = useCallback((row) => {
    if (!row) return null;
    if (row._ea_datetime && typeof row._ea_datetime === 'string') {
      return row._ea_datetime.slice(0, 10);
    }
    const d = row.theDate ?? row.TheDate ?? row.the_date ?? row.date ?? row.Date;
    if (d) {
      const s = String(d);
      return s.includes('T') ? s.split('T')[0] : s.slice(0, 10);
    }
    return null;
  }, []);

  const extractTimeLabel = useCallback((row) => {
    if (!row) return null;
    if (row._ea_datetime && typeof row._ea_datetime === 'string') return row._ea_datetime;
    const date = extractDateStr(row);
    const h = row.theHour ?? row.TheHour ?? row.the_hour ?? row.Hour ?? row.hour;
    if (date && h != null && h !== '') {
      const hh = String(Math.round(Number(h))).padStart(2, '0');
      return `${date} ${hh}:00`;
    }
    return date || null;
  }, [extractDateStr]);

  // ── 所有可選的唯一日期（依出現順序） ──
  const availableDates = useMemo(() => {
    if (!result?.rows) return [];
    const seen = new Set();
    const ordered = [];
    result.rows.forEach((r) => {
      const d = extractDateStr(r);
      if (d && !seen.has(d)) {
        seen.add(d);
        ordered.push(d);
      }
    });
    return ordered.sort();
  }, [result, extractDateStr]);

  // result 改變 → 重設「已選日期 = 全部」
  useEffect(() => {
    setSelectedDates(availableDates);
  }, [availableDates]);

  // ── Filtering logic ──
  const filteredRows = useMemo(() => {
    if (!result?.rows) return [];
    const allRows = result.rows;
    const activeFilters = Object.entries(filters).filter(([, f]) => f.value !== '' && f.value !== undefined);
    if (activeFilters.length === 0) return allRows;

    return allRows.filter(row => {
      return activeFilters.every(([col, filter]) => {
        const cellVal = row[col];
        if (cellVal === null || cellVal === undefined) return false;

        if (filter.operator === 'contains') {
          return String(cellVal).toLowerCase().includes(String(filter.value).toLowerCase());
        }

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
      });
    });
  }, [result, filters]);

  // ── Sorting logic ──
  const sortedRows = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      // Handle nulls: push to end
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      const aNum = Number(aVal);
      const bNum = Number(bVal);

      let comparison = 0;
      if (!isNaN(aNum) && !isNaN(bNum)) {
        comparison = aNum - bNum;
      } else {
        comparison = String(aVal).localeCompare(String(bVal), 'zh-Hant');
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredRows, sortConfig]);

  // ── Pagination on sorted+filtered data ──
  const totalPages = Math.ceil(sortedRows.length / PAGE_SIZE);
  const pagedRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── 圖表用：先套用「日期篩選」再按時間排序 ──
  const chartRows = useMemo(() => {
    if (!result?.rows) return [];
    const dateSet = new Set(selectedDates);
    const base = availableDates.length === 0 || selectedDates.length === availableDates.length
      ? result.rows
      : result.rows.filter((r) => {
          const d = extractDateStr(r);
          return d && dateSet.has(d);
        });
    return [...base].sort((a, b) => {
      const la = extractTimeLabel(a) || '';
      const lb = extractTimeLabel(b) || '';
      return la.localeCompare(lb);
    });
  }, [result, selectedDates, availableDates, extractDateStr, extractTimeLabel]);

  // ── Sort handler ──
  const handleSort = (colKey) => {
    setSortConfig(prev => {
      if (prev.key !== colKey) return { key: colKey, direction: 'asc' };
      if (prev.direction === 'asc') return { key: colKey, direction: 'desc' };
      return { key: null, direction: null };
    });
    setPage(0);
  };

  // ── Filter handler ──
  const updateFilter = (col, field, value) => {
    setFilters(prev => {
      const existing = prev[col] || {};
      const updated = { ...existing, [field]: value };
      // When setting a value, ensure operator is also set (default '>' for numeric)
      if (field === 'value' && !existing.operator) {
        updated.operator = isNumericCol(col) ? '>' : 'contains';
      }
      return { ...prev, [col]: updated };
    });
    setPage(0);
  };

  const clearAllFilters = () => {
    setFilters({});
    setPage(0);
  };

  const hasActiveFilters = Object.values(filters).some(f => f.value !== '' && f.value !== undefined);

  // ── Clean column label ──
  const getColLabel = (col) => {
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

  // ── XLSX Download ──
  const handleDownloadXlsx = () => {
    if (!result) return;
    const dataToExport = sortedRows;
    const tNow = readThresholds();

    // Build header row: # + displayCols + (single mode: 燈號)
    const headerLabels = ['#', ...displayCols.map(getColLabel)];
    if (result.mode === 'single' && errorMode === 'pct') headerLabels.push('燈號');

    // Build data rows
    const wsData = [headerLabels];
    dataToExport.forEach((row, idx) => {
      const rowArr = [idx + 1];
      displayCols.forEach(col => {
        const val = row[col];
        rowArr.push(val === null || val === undefined ? '' : val);
      });
      if (result.mode === 'single' && errorMode === 'pct') {
        const ep = row.error_pct;
        if (ep !== null && ep !== undefined) {
          const v = Math.abs(Number(ep));
          rowArr.push(v <= tNow.pct.warn ? '正常' : v <= tNow.pct.danger ? '留意' : '異常');
        } else {
          rowArr.push('');
        }
      }
      wsData.push(rowArr);
    });

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply styles to error columns (cell background colors)
    // Find which column indices are error columns
    const errColIndices = [];
    displayCols.forEach((col, ci) => {
      if (isErrCol(col)) {
        errColIndices.push(ci + 1); // +1 because col 0 is '#'
      }
    });

    // Also check single mode 燈號 column
    const lightColIdx = result.mode === 'single' ? headerLabels.length - 1 : -1;

    // Apply cell styles for each data row
    for (let r = 1; r < wsData.length; r++) {
      // Style error percentage columns
      errColIndices.forEach(c => {
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

      // Style 燈號 column for single mode
      if (lightColIdx >= 0) {
        const cellAddr = XLSX.utils.encode_cell({ r, c: lightColIdx });
        const errPctColIdx = displayCols.indexOf('error_pct');
        const errVal = errPctColIdx >= 0 ? wsData[r][errPctColIdx + 1] : null;
        const colorInfo = getErrorColor(errVal, tNow);
        if (colorInfo && ws[cellAddr]) {
          ws[cellAddr].s = {
            fill: { fgColor: { rgb: colorInfo.bg } },
            font: { color: { rgb: colorInfo.fg }, bold: true },
            alignment: { horizontal: 'center' },
          };
        }
      }
    }

    // Style header row
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

    // Set column widths
    ws['!cols'] = headerLabels.map((h, i) => ({
      wch: i === 0 ? 5 : Math.max(h.length * 2.5, 12),
    }));

    // Create workbook and save
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '預測結果');

    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const filename = `prediction_result_${ts}.xlsx`;

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), filename);
  };

  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col font-sans">
      <Navbar activePage={activePage} {...navProps} />

      {/* [新增] Sticky Header 步驟指示器 */}
      {activePage === 'model-training' && (
        <div className="w-full border-b border-white/10 bg-white/[.02] px-6 py-3 sticky top-[64px] sm:top-[65px] z-40 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors">
              <span className="material-symbols-outlined !text-lg">arrow_back</span>
              返回上一步
            </button>

            <div className="text-sm font-medium">
              <span className="text-white/40">1. 上傳資料</span>
              <span className="mx-2 text-white/30">/</span>
              <span className="text-white/40">2. 清理資料</span>
              <span className="mx-2 text-white/30">/</span>
              <span className="text-white/40">3. 模型訓練</span>
              <span className="mx-2 text-white/30">/</span>
              <span className="text-primary font-bold">4. 預測發電量</span>

            </div>
          </div>
        </div>)}

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* ── 左側：配置區 ── */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          <section className="bg-white/[0.02] p-6 rounded-2xl border border-white/10 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-3 italic">
              <div className="size-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                <span className="material-symbols-outlined !text-xl">settings_applications</span>
              </div>
              預測配置
            </h2>

            <div className="space-y-6">
              {/* 1. Upload */}
              <div>
                <label className="text-sm text-white/40 mb-2 block font-bold uppercase tracking-widest">1. 上傳預測資料</label>
                <div
                  className="group border-2 border-dashed border-white/10 rounded-2xl p-6 text-center hover:bg-white/[0.03] hover:border-primary/50 transition-all cursor-pointer"
                  onClick={() => document.getElementById('predictFileInput').click()}
                >
                  <input type="file" id="predictFileInput" hidden accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
                  <div className="size-10 rounded-full bg-white/5 mx-auto mb-3 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <span className="material-symbols-outlined !text-xl text-white/30 group-hover:text-primary">upload_file</span>
                  </div>
                  <p className="text-sm font-bold text-white/50 group-hover:text-white transition-colors">{file ? file.name : 'CSV / XLSX 檔案'}</p>
                </div>
              </div>

              {/* 2. Multi-Model Select */}
              <div>
                <label className="text-sm text-white/40 mb-2 block font-bold uppercase tracking-widest">
                  2. 選擇訓練模型
                  <span className="ml-2 text-primary/60 normal-case">（可多選比對）</span>
                </label>

                {/* 搜尋框 */}
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

                {/* 算法篩選 */}
                <div className="flex gap-1.5 mb-3 flex-wrap">
                  {['all', 'public', 'mine', ...Array.from(new Set(trainedModels.map(m => m.model_type)))].map(type => (
                    <button
                      key={type}
                      onClick={() => setModelTypeFilter(type)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${modelTypeFilter === type
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-white/10 bg-white/5 text-white/40 hover:text-white/60'
                        }`}
                    >
                      {
                        type === 'all'
                          ? '全部'
                          : type === 'public'
                            ? '公用模型'
                            : type === 'mine'
                              ? '我的模型'
                              : type
                      }
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
                    .filter(m => {
                      if (modelTypeFilter === 'all') return true;

                      if (modelTypeFilter === 'public') {
                        return m.is_public;
                      }

                      if (modelTypeFilter === 'mine') {
                        const user = JSON.parse(localStorage.getItem('user') || '{}');
                        return !m.is_public;
                      }

                      return m.model_type === modelTypeFilter;
                    })
                    .filter(m => {
                      if (!modelSearch.trim()) return true;
                      const q = modelSearch.toLowerCase();
                      return (m.site_name || '').toLowerCase().includes(q)
                        || (m.model_type || '').toLowerCase().includes(q)
                        || String(m.model_id).includes(q);
                    })
                    .map(m => {
                      const isSelected = selectedModelIds.includes(String(m.model_id));
                      const isRecommended = lazyRecommendation && String(lazyRecommendation.model_id) === String(m.model_id);
                      return (
                        <label
                          key={m.model_id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all border ${isRecommended
                            ? 'bg-green-500/[0.08] border-green-400/40 shadow-[0_0_12px_rgba(34,197,94,0.12)]'
                            : isSelected
                              ? 'bg-primary/10 border-primary/30 shadow-[0_0_12px_rgba(242,204,13,0.08)]'
                              : 'border-white/5 hover:bg-white/[0.03] hover:border-white/10'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleModel(m.model_id)}
                            className="accent-primary size-4 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {m.is_public && (
                                <span className="text-[10px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full font-bold">
                                  公用模型
                                </span>
                              )}
                              <span className={`text-xs font-black px-2 py-0.5 rounded ${isSelected ? 'bg-primary/20 text-primary' : 'bg-white/5 text-white/50'
                                }`}>
                                {m.model_type}
                              </span>
                              <span className="text-xs text-white/30 font-mono">#{m.model_id}</span>
                              {isRecommended && (
                                <span
                                  className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold"
                                  title={
                                    lazyRecommendation?.wmape != null
                                      ? `懶人模式推薦：WMAPE ${Number(lazyRecommendation.wmape).toFixed(4)}（三模型中最低）`
                                      : '懶人模式推薦'
                                  }
                                >
                                  ★ 推薦
                                </span>
                              )}
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
            </div>

            {(() => {
              const totalSelected = selectedModelIds.length + (physicsEnabled ? 1 : 0);
              const physicsOnly = physicsEnabled && selectedModelIds.length === 0;
              return (
                <button
                  onClick={handlePredict}
                  disabled={isPredicting || !file || totalSelected === 0}
                  className="w-full bg-primary text-background-dark py-4 rounded-2xl font-black text-base hover:scale-[1.02] active:scale-95 transition-all shadow-[0_10px_30px_rgba(242,204,13,0.2)] mt-6 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isPredicting
                    ? '運算執行中...'
                    : physicsOnly
                      ? '開始物理式估算'
                      : totalSelected > 1
                        ? `比對預測 (${totalSelected} 個模型)`
                        : '開始執行預測'}
                </button>
              );
            })()}

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
          </section>

          {/* Summary cards — show per-model comparison */}
          {result && (
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

                    {/* 預估 / 實際 / 差異 */}
                    <div className="space-y-2 mb-3">
                      <div className="flex justify-between items-baseline">
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">預估發電量</p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-black font-mono text-white">{m.total_predicted_eac?.toLocaleString() ?? '—'}</span>
                          <span className={`text-xs font-bold ${c.text}`}>kWh</span>
                        </div>
                      </div>
                      {m.total_actual_eac != null && (
                        <div className="flex justify-between items-baseline">
                          <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">實際發電量</p>
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

                    {/* 誤差指標 */}
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                      <div>
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-1 flex items-center">WMAPE
                          <InfoTooltip text={"WMAPE（加權平均絕對百分比誤差）\n\n公式：Σ|預測値 − 實際値| ÷ Σ|實際値| × 100%\n\n由於以實際發電量加權，高發電時段對整體誤差影響更大，避免了低發電時段（如清晨/傍晚）的極端百分比拉高平均誤差。"} />
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl font-black font-mono text-white">{m.avg_error_pct != null ? m.avg_error_pct.toFixed(2) : '—'}</span>
                          <span className={`text-sm font-bold ${c.text}`}>%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mb-1 flex items-center">MAE
                          <InfoTooltip text={"MAE（平均絕對誤差）\n\n公式：Σ|預測値 − 實際値| ÷ 筆數\n\n單位為 kW，直接反映模型預測值與實際值之間的平均絕對差距，不受發電量量級影響，適合用於評估模型的絕對精度。"} />
                        </p>
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

        {/* ── 右側：資料表格 ── */}
        <div className="lg:col-span-9 flex flex-col">
          <div className={`flex-1 w-full rounded-2xl border border-white/10 bg-white/[0.01] p-6 flex flex-col relative transition-all shadow-2xl ${!result && 'items-center justify-center border-dashed opacity-40 min-h-[500px]'}`}>
            {result ? (
              <div className="w-full flex flex-col animate-fade-in">
                {/* Header with actions */}
                <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined !text-xl text-primary">table_chart</span>
                    預測結果
                    <span className="text-base text-white/30 font-normal ml-2">
                      {hasActiveFilters
                        ? `篩選後 ${sortedRows.length} / 共 ${result.total_rows} 筆`
                        : `共 ${result.total_rows} 筆`
                      }
                    </span>
                  </h2>

                  <div className="flex items-center gap-2">
                    {/* Model legend for multi-mode */}
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

                    {/* Error mode toggle */}
                    <div className="flex items-center gap-1">
                      <div className="flex items-center border border-white/10 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setErrorMode('pct')}
                          className={`px-3 py-2 text-sm font-bold transition-all ${errorMode === 'pct'
                            ? 'bg-primary/15 text-primary'
                            : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                            }`}
                        >
                          %
                        </button>
                        <div className="w-px h-5 bg-white/10" />
                        <button
                          onClick={() => setErrorMode('abs')}
                          className={`px-3 py-2 text-sm font-bold transition-all ${errorMode === 'abs'
                            ? 'bg-primary/15 text-primary'
                            : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                            }`}
                        >
                          kW
                        </button>
                      </div>
                      <InfoTooltip text={errorMode === 'pct'
                        ? "百分比誤差（逐筆）\n\n公式：(預測値 − 實際値) ÷ |實際値| × 100%\n\n正値：模型預測高於實際（高估）\n負値：模型預測低於實際（低估）\n\n🟢 ≤ 5% │ 🟡 5%～15% │ 🔴 > 15%"
                        : "絕對誤差（逐筆）\n\n公式：預測値 − 實際値\n單位：kW\n\n正値：模型預測高於實際（高估）\n負値：模型預測低於實際（低估）\n\n🟢 ≤ 1kW │ 🟡 1～5kW │ 🔴 > 5kW"
                      } />
                    </div>

                    {/* Toggle filter button */}
                    <button
                      onClick={() => setShowFilters(f => !f)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border transition-all ${showFilters
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'border-white/10 text-white/40 hover:bg-white/5 hover:text-white/60'
                        }`}
                    >
                      <span className="material-symbols-outlined !text-base">filter_alt</span>
                      篩選
                      {hasActiveFilters && (
                        <span className="size-5 rounded-full bg-primary text-background-dark text-[10px] font-black flex items-center justify-center">
                          {Object.values(filters).filter(f => f.value).length}
                        </span>
                      )}
                    </button>

                    {/* Clear filters */}
                    {hasActiveFilters && (
                      <button
                        onClick={clearAllFilters}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <span className="material-symbols-outlined !text-base">close</span>
                        清除
                      </button>
                    )}

                    {/* Download XLSX button */}
                    <button
                      onClick={handleDownloadXlsx}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-all"
                    >
                      <span className="material-symbols-outlined !text-base">download</span>
                      下載 XLSX
                    </button>
                  </div>
                </div>

                {/* === Chart mode === */}
                {viewMode === 'chart' && (
                  <div className="space-y-4">
                    {/* 日期篩選器 */}
                    {availableDates.length > 0 && (
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined !text-base text-primary">event</span>
                            <span className="text-sm font-bold text-white/70">選擇日期</span>
                            <span className="text-xs text-white/30">
                              （已選 {selectedDates.length} / 共 {availableDates.length} 天）
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedDates(availableDates)}
                              className="text-xs font-bold text-primary/80 hover:text-primary px-2 py-1 rounded border border-primary/20 hover:bg-primary/10 transition-all"
                            >
                              全選
                            </button>
                            <button
                              onClick={() => setSelectedDates([])}
                              className="text-xs font-bold text-white/40 hover:text-white/70 px-2 py-1 rounded border border-white/10 hover:bg-white/5 transition-all"
                            >
                              全部取消
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                          {availableDates.map((d) => {
                            const active = selectedDates.includes(d);
                            return (
                              <button
                                key={d}
                                onClick={() => {
                                  setSelectedDates((prev) =>
                                    prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                                  );
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all ${active
                                  ? 'border-primary bg-primary/15 text-primary'
                                  : 'border-white/10 bg-white/5 text-white/40 hover:text-white/70'
                                }`}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 折線圖 */}
                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                      {selectedDates.length === 0 ? (
                        <div className="flex items-center justify-center text-white/30 text-sm h-[520px]">
                          請至少選擇一天
                        </div>
                      ) : (
                        <PredictionChart
                          rows={chartRows}
                          columns={result.columns}
                          okModels={okModels}
                          modelColorMap={modelColorMap}
                          getTimeLabel={extractTimeLabel}
                          height={520}
                        />
                      )}
                      <p className="text-xs text-white/30 mt-3 text-center">
                        橫軸：時間　|　縱軸：發電量 (kW)　|　圖表共 {chartRows.length} 筆
                      </p>
                    </div>
                  </div>
                )}

                {/* === Table mode === */}
                {viewMode === 'table' && (
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="bg-white/5 text-white/40 uppercase sticky top-0 z-10">
                      {/* Column headers with sort */}
                      <tr>
                        <th className="px-4 py-3 font-bold">#</th>
                        {displayCols.map(col => {
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

                      {/* Filter row */}
                      {showFilters && (
                        <tr className="bg-white/[0.03] border-t border-white/5">
                          <td className="px-3 py-2"></td>
                          {displayCols.map(col => {
                            const numeric = isNumericCol(col);
                            const filterVal = filters[col]?.value || '';
                            const filterOp = filters[col]?.operator || (numeric ? '>' : 'contains');
                            return (
                              <td key={col} className="px-2 py-2">
                                <div className="flex items-center gap-0.5">
                                  {numeric ? (
                                    <>
                                      <select
                                        value={filterOp}
                                        onChange={(e) => updateFilter(col, 'operator', e.target.value)}
                                        className="bg-white/5 border border-white/10 rounded text-xs text-white/60 px-1.5 py-1 w-12 focus:border-primary/50 focus:outline-none"
                                      >
                                        <option value=">" className="text-black bg-white">&gt;</option>
                                        <option value="<" className="text-black bg-white">&lt;</option>
                                        <option value="=" className="text-black bg-white">=</option>
                                        <option value=">=" className="text-black bg-white">&gt;=</option>
                                        <option value="<=" className="text-black bg-white">&lt;=</option>
                                      </select>
                                      <input
                                        type="text"
                                        value={filterVal}
                                        onChange={(e) => updateFilter(col, 'value', e.target.value)}
                                        placeholder="值"
                                        className="bg-white/5 border border-white/10 rounded text-xs text-white/70 px-2 py-1 w-20 placeholder:text-white/15 focus:border-primary/50 focus:outline-none font-mono"
                                      />
                                    </>
                                  ) : (
                                    <input
                                      type="text"
                                      value={filterVal}
                                      onChange={(e) => {
                                        updateFilter(col, 'operator', 'contains');
                                        updateFilter(col, 'value', e.target.value);
                                      }}
                                      placeholder="搜尋..."
                                      className="bg-white/5 border border-white/10 rounded text-xs text-white/70 px-2 py-1 w-full placeholder:text-white/15 focus:border-primary/50 focus:outline-none"
                                    />
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
                          <td colSpan={displayCols.length + 2} className="px-4 py-8 text-center text-white/20 text-sm">
                            {hasActiveFilters ? '沒有符合篩選條件的資料' : '無資料'}
                          </td>
                        </tr>
                      ) : (
                        pagedRows.map((row, idx) => {
                          const globalIdx = page * PAGE_SIZE + idx;
                          const singleErrPct = result.mode === 'single' ? row.error_pct : null;
                          const absErrPct = singleErrPct !== null && singleErrPct !== undefined ? Math.abs(singleErrPct) : null;
                          const rowBg = errorMode === 'pct' && absErrPct !== null
                            ? (absErrPct > 15 ? 'bg-red-500/[0.03]' : absErrPct > 5 ? 'bg-yellow-500/[0.02]' : '')
                            : '';
                          return (
                            <tr key={globalIdx} className={`hover:bg-white/[0.03] transition-colors ${rowBg}`}>
                              <td className="px-4 py-2.5 text-white/20">{globalIdx + 1}</td>
                              {displayCols.map(col => {
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
                                    {val === null || val === undefined ? '—' : typeof val === 'number' ? (col.toLowerCase() === 'hour' || col.toLowerCase() === 'the_hour' || col.toLowerCase() === 'thehour' ? Math.round(val) : Number(val).toFixed(4)) : (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val) ? val.split('T')[0] : String(val))}
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

                {/* Pagination (only in table mode) */}
                {viewMode === 'table' && totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-white/40">
                    <span>顯示 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)} / {sortedRows.length}{hasActiveFilters ? ` (篩選自 ${result.total_rows} 筆)` : ''}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="px-4 py-1.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-20 transition-all"
                      >
                        上一頁
                      </button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 7) pageNum = i;
                        else if (page < 3) pageNum = i;
                        else if (page > totalPages - 4) pageNum = totalPages - 7 + i;
                        else pageNum = page - 3 + i;
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setPage(pageNum)}
                            className={`px-3 py-1.5 rounded border transition-all ${page === pageNum ? 'border-primary text-primary bg-primary/10' : 'border-white/10 hover:bg-white/5'}`}
                          >
                            {pageNum + 1}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="px-4 py-1.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-20 transition-all"
                      >
                        下一頁
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center space-y-4">
                <div className="size-20 rounded-full bg-white/5 mx-auto flex items-center justify-center">
                  <span className="material-symbols-outlined !text-4xl text-white/10">query_stats</span>
                </div>
                <p className="text-base font-bold text-white/20 tracking-widest uppercase">上傳資料並選擇模型後即可開始預測</p>
                <p className="text-sm text-white/10">可選擇多個模型進行比對分析；新案場可使用物理式估算</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <div className="p-8 border-t border-white/10 bg-background-dark/95 flex justify-end gap-6 backdrop-blur-xl">
        <button onClick={onBack || onNavigateToDashboard} className="text-sm font-bold text-white/30 hover:text-white transition-colors">回模型訓練</button>
        {result && onNavigateToErrorAnalysis && (
          <button
            onClick={() => onNavigateToErrorAnalysis(result)}
            className="flex items-center gap-2 px-10 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary font-bold text-sm hover:bg-primary/20 transition-all"
          >
            <span className="material-symbols-outlined !text-base">analytics</span>
            查看誤差值統計
          </button>
        )}
        <button onClick={onNavigateToDashboard} className="px-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 hover:border-white/20 transition-all">返回首頁看板</button>
      </div>
    </div>
  );
}