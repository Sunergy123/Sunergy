// src/pages/ErrorAnalysisPage.js
import React, { useState, useMemo, useEffect, useRef } from 'react';
import Navbar from '../components/Navbar';

/* ══════════════════════════════════════════════
   常數 & 工具
══════════════════════════════════════════════ */
const MODEL_COLORS_HEX = [
  '#F2CC0D', // primary yellow
  '#22D3EE', // cyan
  '#A78BFA', // violet
  '#FB7185', // rose
  '#34D399', // emerald
  '#FB923C', // orange
];

const MODEL_COLORS_CLASS = [
  { text: 'text-primary',      border: 'border-primary',      bg: 'bg-primary/10',      dot: 'bg-primary' },
  { text: 'text-cyan-400',     border: 'border-cyan-400',     bg: 'bg-cyan-400/10',     dot: 'bg-cyan-400' },
  { text: 'text-violet-400',   border: 'border-violet-400',   bg: 'bg-violet-400/10',   dot: 'bg-violet-400' },
  { text: 'text-rose-400',     border: 'border-rose-400',     bg: 'bg-rose-400/10',     dot: 'bg-rose-400' },
  { text: 'text-emerald-400',  border: 'border-emerald-400',  bg: 'bg-emerald-400/10',  dot: 'bg-emerald-400' },
  { text: 'text-orange-400',   border: 'border-orange-400',   bg: 'bg-orange-400/10',   dot: 'bg-orange-400' },
];

/** 誤差模式對應的閾值（與 PredictSolar 同步） */
const ERROR_THRESHOLDS = {
  pct: { warn: 5,  danger: 15, unit: '%',  axisLabel: '誤差值 %' },
  abs: { warn: 1,  danger: 5,  unit: 'kW', axisLabel: '誤差值 kW' },
};

/** 誤差值 → 燈號（以絕對值判斷，正負號僅用於顯示） */
const getLightLevel = (val, mode = 'pct') => {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  const v = Math.abs(n);
  const { warn, danger } = ERROR_THRESHOLDS[mode];
  if (v <= warn) return 'green';
  if (v <= danger) return 'yellow';
  return 'red';
};

/**
 * 從 row 取得 { year, month, day, hour }
 * 支援：
 *   - theDate("2019-07-01T00:00:00") + theHour(5)
 *   - _ea_datetime("2019-07-01 05:00")（後端注入）
 *   - 其他常見 datetime 欄位
 */
const getRowInfo = (row) => {
  const dateKeys = ['theDate', 'TheDate', 'the_date', 'The_Date'];
  const hourKeys = ['theHour', 'TheHour', 'the_hour', 'The_Hour', 'HOUR', 'hour', 'Hour'];

  let dateStr = null;
  for (const k of dateKeys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      dateStr = String(row[k]);
      break;
    }
  }
  let hourVal = null;
  for (const k of hourKeys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      const h = Number(row[k]);
      if (!isNaN(h)) { hourVal = Math.round(h); break; }
    }
  }

  if (dateStr) {
    const s = dateStr.replace(/\//g, '-').split('T')[0].trim();
    const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return { year: +m[1], month: +m[2], day: +m[3], hour: hourVal };
    }
  }

  for (const k of ['_ea_datetime', 'datetime', 'Datetime', 'timestamp', 'Timestamp', 'date', 'Date']) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      const s = String(row[k]).replace('T', ' ').replace(/\//g, '-').trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}))?/);
      if (m) {
        return {
          year: +m[1],
          month: +m[2],
          day: +m[3],
          hour: m[4] != null ? +m[4] : (hourVal ?? null),
        };
      }
    }
  }

  if (hourVal !== null) return { year: null, month: null, day: null, hour: hourVal };
  return null;
};

const getRowDatetime = (row) => {
  const info = getRowInfo(row);
  if (!info || !info.year) return null;
  return `${info.year}-${String(info.month).padStart(2, '0')}-${String(info.day).padStart(2, '0')} ${info.hour != null ? String(info.hour).padStart(2, '0') : '00'}:00`;
};

const parseDatetime = (dtStr) => {
  if (!dtStr) return null;
  const m = String(dtStr).match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}))?/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], day: +m[3], hour: m[4] != null ? +m[4] : null };
};

const getRowHour = (row) => {
  const info = getRowInfo(row);
  return info?.hour ?? null;
};

/** 取得對應模式的誤差欄位（單模或多模） */
const getErrCols = (columns, mode = 'pct') => {
  if (!columns) return [];
  if (mode === 'pct') {
    return columns.filter(c => c === 'error_pct' || c.startsWith('err_'));
  }
  return columns.filter(c => c === 'error_abs' || c.startsWith('eabs_'));
};

const TIME_MODES = [
  { id: 'range',  label: '連續時段', icon: 'date_range' },
  { id: 'points', label: '特定時間點', icon: 'schedule' },
];

/* ══════════════════════════════════════════════
   SVG 折線圖（hover tooltip + 拖拽縮放）
   - 滾輪：以游標為中心同時縮放 X、Y
   - 左鍵拖拽：平移
   - 雙擊 / Reset 按鈕：還原自動範圍
══════════════════════════════════════════════ */
const LineChart = ({ series, xLabels, yMax: yMaxProp, warnThreshold, dangerThreshold, unit, axisLabel }) => {
  const W = 900, H = 300;
  const PAD = { top: 20, right: 24, bottom: 48, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const clipId = useMemo(() => `lc-clip-${Math.random().toString(36).slice(2, 8)}`, []);

  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const ctxRef = useRef(null); // 給 wheel listener 讀目前 n / autoMaxY
  const [hoverIdx, setHoverIdx] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [view, setView] = useState(null); // null = 自動

  const n = xLabels.length;
  const dataMax = useMemo(
    () => Math.max(0, ...series.flatMap(s => s.data.map(d => d ?? 0))),
    [series]
  );
  const autoMaxY = yMaxProp || Math.max(dangerThreshold * 1.5, dataMax * 1.15);

  // 資料變動時重設 view
  useEffect(() => { setView(null); }, [n, autoMaxY]);

  // 同步最新 ctx 給 wheel listener
  useEffect(() => { ctxRef.current = { n, autoMaxY }; }, [n, autoMaxY]);

  // 當前 view bounds（view 為 null 時用自動範圍）
  const xStart  = view?.xStart ?? 0;
  const xEnd    = view?.xEnd   ?? Math.max(0, n - 1);
  const yMinV   = view?.yMin   ?? 0;
  const yMaxV   = view?.yMax   ?? autoMaxY;
  const isZoomed = view !== null;

  const xPos = (i) =>
    xEnd === xStart ? PAD.left + innerW / 2
    : PAD.left + ((i - xStart) / (xEnd - xStart)) * innerW;
  const yPos = (v) =>
    yMaxV === yMinV ? PAD.top + innerH / 2
    : PAD.top + innerH - ((v - yMinV) / (yMaxV - yMinV)) * innerH;

  // Y 軸刻度：依當前 view range 動態
  const yTicks = useMemo(() => {
    const range = yMaxV - yMinV;
    if (range <= 0) return [yMinV];
    const targetCount = 5;
    const rawStep = range / targetCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    const niceStep = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const ticks = [];
    const first = Math.ceil(yMinV / niceStep) * niceStep;
    for (let v = first; v <= yMaxV + niceStep * 0.001; v += niceStep) {
      ticks.push(parseFloat(v.toFixed(4)));
    }
    if (warnThreshold >= yMinV && warnThreshold <= yMaxV) ticks.push(warnThreshold);
    if (dangerThreshold >= yMinV && dangerThreshold <= yMaxV) ticks.push(dangerThreshold);
    return Array.from(new Set(ticks)).sort((a, b) => a - b);
  }, [yMinV, yMaxV, warnThreshold, dangerThreshold]);

  // X 軸 label 取樣：只看當前可見範圍
  const visStart = Math.max(0, Math.floor(xStart));
  const visEnd = Math.min(n - 1, Math.ceil(xEnd));
  const visibleN = Math.max(0, visEnd - visStart + 1);
  const xLabelStep = visibleN <= 12 ? 1 : Math.max(1, Math.ceil(visibleN / 12));
  const xLabelRotate = visibleN > 12;

  const toPath = (data) => {
    let d = '';
    let inPath = false;
    data.forEach((v, i) => {
      if (v === null || v === undefined) { inPath = false; return; }
      const x = xPos(i);
      const y = yPos(v);
      if (!inPath) { d += `M ${x} ${y}`; inPath = true; }
      else d += ` L ${x} ${y}`;
    });
    return d;
  };

  /* ── 滑鼠事件 ── */
  const handleMouseDown = (e) => {
    if (n === 0) return;
    e.preventDefault();
    setIsDragging(true);
    setHoverIdx(null);
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      view: { xStart, xEnd, yMin: yMinV, yMax: yMaxV },
    };
  };

  const handleMouseMove = (e) => {
    if (n === 0 || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (isDragging && dragRef.current) {
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const dxPx = (e.clientX - dragRef.current.sx) * scaleX;
      const dyPx = (e.clientY - dragRef.current.sy) * scaleY;
      const v0 = dragRef.current.view;
      const xRange = v0.xEnd - v0.xStart;
      const yRange = v0.yMax - v0.yMin;
      const dxView = -dxPx / innerW * xRange;
      const dyView =  dyPx / innerH * yRange;
      setView({
        xStart: v0.xStart + dxView,
        xEnd:   v0.xEnd   + dxView,
        yMin:   v0.yMin   + dyView,
        yMax:   v0.yMax   + dyView,
      });
      return;
    }
    // hover tooltip
    const px = (e.clientX - rect.left) / rect.width * W;
    if (px < PAD.left || px > PAD.left + innerW) { setHoverIdx(null); return; }
    const ratio = (px - PAD.left) / innerW;
    const idx = Math.round(xStart + ratio * (xEnd - xStart));
    if (idx >= 0 && idx < n) setHoverIdx(idx);
    else setHoverIdx(null);
  };

  const endDrag = () => {
    if (isDragging) { setIsDragging(false); dragRef.current = null; }
  };
  const handleMouseUp = endDrag;
  const handleMouseLeave = () => { setHoverIdx(null); endDrag(); };

  const handleDoubleClick = () => setView(null);

  // 滾輪縮放：用 native listener 加 passive:false 才能 preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const ctx = ctxRef.current;
      if (!ctx || ctx.n === 0) return;
      const rect = svg.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width * W;
      const py = (e.clientY - rect.top)  / rect.height * H;
      const factor = e.deltaY < 0 ? 0.85 : 1.18;
      setView(prev => {
        const cur = prev || { xStart: 0, xEnd: Math.max(0, ctx.n - 1), yMin: 0, yMax: ctx.autoMaxY };
        const cursorX = cur.xStart + (px - PAD.left) / innerW * (cur.xEnd - cur.xStart);
        const cursorY = cur.yMax - (py - PAD.top) / innerH * (cur.yMax - cur.yMin);
        const newXStart = cursorX - (cursorX - cur.xStart) * factor;
        const newXEnd   = cursorX + (cur.xEnd - cursorX) * factor;
        const newYMin   = cursorY - (cursorY - cur.yMin) * factor;
        const newYMax   = cursorY + (cur.yMax - cursorY) * factor;
        return { xStart: newXStart, xEnd: newXEnd, yMin: newYMin, yMax: newYMax };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [innerW, innerH]);

  /* ── tooltip ── */
  const tooltipX = hoverIdx != null ? xPos(hoverIdx) : 0;
  const tooltipPoints = hoverIdx != null
    ? series.map(s => ({ label: s.label, color: s.color, value: s.data[hoverIdx] }))
        .filter(p => p.value !== null && p.value !== undefined)
    : [];
  const tooltipW = 200;
  const tooltipH = 24 + tooltipPoints.length * 18;
  const tooltipFlip = tooltipX + tooltipW + 12 > PAD.left + innerW;
  const showTooltip = hoverIdx != null && !isDragging
    && xPos(hoverIdx) >= PAD.left && xPos(hoverIdx) <= PAD.left + innerW;

  return (
    <div className="relative">
      {/* Reset 按鈕（縮放後才出現） */}
      {isZoomed && (
        <button
          onClick={() => setView(null)}
          className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/15 text-[11px] font-bold text-white/70 hover:bg-white/[0.1] hover:text-white transition-all backdrop-blur-sm"
          title="重設縮放（雙擊圖表也可）"
        >
          <span className="material-symbols-outlined !text-sm">restart_alt</span>
          重設
        </button>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        style={{ maxHeight: 340, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      >
        {/* clipPath：把折線/點/區塊裁切在繪圖區內，避免縮放時溢出 */}
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* 抓事件用的透明背景（讓在空白處也能拖拽/縮放） */}
        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" />

        <g clipPath={`url(#${clipId})`}>
          {/* 背景三色區塊 */}
          {(() => {
            const yWarnPx = yPos(warnThreshold);
            const yDangerPx = yPos(dangerThreshold);
            const top = PAD.top, bottom = PAD.top + innerH;
            return (
              <>
                <rect x={PAD.left} y={top} width={innerW} height={Math.max(0, yWarnPx - top)} fill="rgba(74,222,128,0.06)" />
                <rect x={PAD.left} y={Math.min(yWarnPx, yDangerPx)} width={innerW} height={Math.max(0, Math.abs(yDangerPx - yWarnPx))} fill="rgba(250,204,21,0.06)" />
                <rect x={PAD.left} y={yDangerPx} width={innerW} height={Math.max(0, bottom - yDangerPx)} fill="rgba(248,113,113,0.06)" />
              </>
            );
          })()}

          {/* 閾值虛線 */}
          <line x1={PAD.left} x2={PAD.left + innerW} y1={yPos(warnThreshold)} y2={yPos(warnThreshold)} stroke="#4ADE80" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
          <line x1={PAD.left} x2={PAD.left + innerW} y1={yPos(dangerThreshold)} y2={yPos(dangerThreshold)} stroke="#FACC15" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />

          {/* Y 格線 */}
          {yTicks.map(v => (
            <line key={`g-${v}`} x1={PAD.left} x2={PAD.left + innerW} y1={yPos(v)} y2={yPos(v)} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          ))}

          {/* 折線 */}
          {series.map((s, si) => (
            <g key={si}>
              <path d={toPath(s.data)} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.95} />
              {visibleN <= 48 && s.data.map((v, i) => {
                if (v === null || v === undefined) return null;
                if (i < xStart - 1 || i > xEnd + 1) return null;
                return <circle key={i} cx={xPos(i)} cy={yPos(v)} r={3} fill={s.color} stroke="#111" strokeWidth={1} />;
              })}
            </g>
          ))}

          {/* Hover 垂直游標 + 點 */}
          {showTooltip && (
            <g pointerEvents="none">
              <line x1={xPos(hoverIdx)} x2={xPos(hoverIdx)} y1={PAD.top} y2={PAD.top + innerH}
                stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeDasharray="2 3" />
              {series.map((s, si) => {
                const v = s.data[hoverIdx];
                if (v === null || v === undefined) return null;
                return <circle key={si} cx={xPos(hoverIdx)} cy={yPos(v)} r={5} fill={s.color} stroke="#111" strokeWidth={2} />;
              })}
            </g>
          )}
        </g>

        {/* Y 軸刻度標籤（在 clip 外，不會被裁掉） */}
        {yTicks.map(v => (
          <text key={`t-${v}`} x={PAD.left - 8} y={yPos(v) + 4} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.4)" fontFamily="monospace">
            {Number.isInteger(v) ? v : v.toFixed(1)}{unit}
          </text>
        ))}

        {/* X 軸 label */}
        {xLabels.map((label, i) => {
          if (i < visStart || i > visEnd) return null;
          if ((i - visStart) % xLabelStep !== 0 && i !== visEnd) return null;
          const x = xPos(i);
          if (x < PAD.left - 1 || x > PAD.left + innerW + 1) return null;
          return xLabelRotate ? (
            <text key={i} x={x} y={H - 12} textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.4)" fontFamily="monospace"
              transform={`rotate(-30,${x},${H - 12})`}>
              {label}
            </text>
          ) : (
            <text key={i} x={x} y={H - 14} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.4)" fontFamily="monospace">
              {label}
            </text>
          );
        })}

        {/* 軸線 */}
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + innerH} y2={PAD.top + innerH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />

        {/* Y 軸標題 */}
        <text x={14} y={PAD.top + innerH / 2} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.5)"
          transform={`rotate(-90,14,${PAD.top + innerH / 2})`}>
          {axisLabel}
        </text>

        {/* Tooltip（畫在 clip 外避免被截掉） */}
        {showTooltip && (
          <g pointerEvents="none" transform={`translate(${tooltipFlip ? tooltipX - tooltipW - 10 : tooltipX + 10}, ${PAD.top + 4})`}>
            <rect width={tooltipW} height={tooltipH} rx={8} fill="rgba(15,15,15,0.95)" stroke="rgba(255,255,255,0.1)" />
            <text x={10} y={16} fontSize={11} fill="rgba(255,255,255,0.5)" fontFamily="monospace">
              {xLabels[hoverIdx]}
            </text>
            {tooltipPoints.map((p, i) => (
              <g key={i} transform={`translate(10, ${28 + i * 18})`}>
                <circle cx={4} cy={-3} r={4} fill={p.color} />
                <text x={14} y={0} fontSize={11} fill="rgba(255,255,255,0.85)" fontFamily="monospace">
                  {p.label}
                </text>
                <text x={tooltipW - 14} y={0} textAnchor="end" fontSize={11} fill={p.color} fontFamily="monospace" fontWeight="bold">
                  {Number(p.value).toFixed(2)}{unit}
                </text>
              </g>
            ))}
          </g>
        )}
      </svg>

      {/* 操作提示 */}
      <p className="mt-2 text-[10px] text-white/30 font-mono flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined !text-sm">drag_pan</span>
          拖拽平移
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined !text-sm">zoom_in</span>
          滾輪縮放
        </span>
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined !text-sm">restart_alt</span>
          雙擊重設
        </span>
      </p>
    </div>
  );
};

/* ══════════════════════════════════════════════
   燈號統計 Bar
══════════════════════════════════════════════ */
const LightBar = ({ green, yellow, red, total }) => {
  const gPct = total ? (green / total * 100) : 0;
  const yPct = total ? (yellow / total * 100) : 0;
  const rPct = total ? (red / total * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 w-full rounded-full overflow-hidden flex bg-white/5">
        <div style={{ width: `${gPct}%` }} className="bg-green-400 transition-all duration-700" />
        <div style={{ width: `${yPct}%` }} className="bg-yellow-400 transition-all duration-700" />
        <div style={{ width: `${rPct}%` }} className="bg-red-400 transition-all duration-700" />
      </div>
      <div className="flex gap-3 text-[10px] font-mono text-white/30">
        <span><span className="text-green-400">{green}</span> 正常</span>
        <span><span className="text-yellow-400">{yellow}</span> 留意</span>
        <span><span className="text-red-400">{red}</span> 異常</span>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════
   時段燈號統計表（小時 / 年月）
══════════════════════════════════════════════ */
const LightTable = ({ rows, errCol, groupBy, errorMode }) => {
  const stats = useMemo(() => {
    const map = {};
    rows.forEach(row => {
      let key;
      if (groupBy === 'hour') {
        const h = getRowHour(row);
        if (h === null) return;
        key = String(h).padStart(2, '0') + ':00';
      } else {
        const info = getRowInfo(row);
        if (info?.year && info?.month) {
          key = `${info.year} / ${String(info.month).padStart(2, '0')}`;
        } else return;
      }
      if (!map[key]) map[key] = { green: 0, yellow: 0, red: 0 };
      const level = getLightLevel(row[errCol], errorMode);
      if (level) map[key][level]++;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, cnts]) => ({ key, ...cnts, total: cnts.green + cnts.yellow + cnts.red }));
  }, [rows, errCol, groupBy, errorMode]);

  if (stats.length === 0) return (
    <div className="text-center text-white/20 text-sm py-8">無可用資料</div>
  );

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white/[0.04] backdrop-blur-sm z-10">
          <tr className="text-white/30 text-xs uppercase tracking-widest font-bold">
            <th className="px-4 py-2.5 text-left">{groupBy === 'hour' ? '時段' : '年 / 月'}</th>
            <th className="px-3 py-2.5 text-center">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-yellow-400" /> 留意</span>
            </th>
            <th className="px-3 py-2.5 text-center">
              <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-red-400" /> 異常</span>
            </th>
            <th className="px-4 py-2.5 text-left">分佈</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {stats.map(({ key, green, yellow, red, total }) => (
            <tr key={key} className="hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-2 font-mono text-white/70 text-xs">{key}</td>
              <td className="px-3 py-2 text-center">
                <span className={`text-sm font-black font-mono ${yellow > 0 ? 'text-yellow-400' : 'text-white/15'}`}>{yellow}</span>
              </td>
              <td className="px-3 py-2 text-center">
                <span className={`text-sm font-black font-mono ${red > 0 ? 'text-red-400' : 'text-white/15'}`}>{red}</span>
              </td>
              <td className="px-4 py-2 min-w-[120px]">
                <LightBar green={green} yellow={yellow} red={red} total={total} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ══════════════════════════════════════════════
   主頁面
══════════════════════════════════════════════ */
export default function ErrorAnalysisPage({
  activePage,
  result: resultProp,
  onBack,
  onNavigateToDashboard,
  onNavigateToTrain,
  onNavigateToPredict,
  onNavigateToSites,
  onNavigateToModelMgmt,
  onNavigateToChangePassword,
  onLogout,
}) {
  const navProps = {
    onNavigateToDashboard,
    onNavigateToTrain,
    onNavigateToPredict,
    onNavigateToSites,
    onNavigateToModelMgmt,
    onNavigateToChangePassword,
    onLogout,
  };

  /* ── result：prop 優先，回退到 sessionStorage（避免重新整理或繞回時遺失） ── */
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (resultProp !== undefined && resultProp !== null) {
      setResult(resultProp);
      try {
        const { rows, ...meta } = resultProp;
        sessionStorage.setItem('errorAnalysis_meta', JSON.stringify(meta));
        sessionStorage.setItem('errorAnalysis_rows', JSON.stringify(rows || []));
      } catch (_) {
        /* sessionStorage 寫入失敗時不阻斷頁面顯示 */
      }
    } else {
      try {
        const metaStr = sessionStorage.getItem('errorAnalysis_meta');
        const rowsStr = sessionStorage.getItem('errorAnalysis_rows');
        if (metaStr && rowsStr) {
          setResult({ ...JSON.parse(metaStr), rows: JSON.parse(rowsStr) });
        } else {
          setResult(null);
        }
      } catch (_) {
        setResult(null);
      }
    }
  }, [resultProp]);

  /* ── 誤差模式切換（與 PredictSolar 同步） ── */
  const [errorMode, setErrorMode] = useState('pct'); // 'pct' | 'abs'
  const thresholds = ERROR_THRESHOLDS[errorMode];

  /* ── 取得所有 err 欄位與 model 資訊 ── */
  const errCols = useMemo(() => getErrCols(result?.columns, errorMode), [result, errorMode]);
  const okModels = (result?.models_summary || []).filter(m => m.status === 'ok');

  const seriesMeta = useMemo(() => {
    if (!errCols.length) return [];
    return errCols.map((col, i) => {
      let label = col;
      if (col === 'error_pct' || col === 'error_abs') {
        label = okModels[0] ? `${okModels[0].model_type}#${okModels[0].model_id}` : '模型';
      } else if (col.startsWith('err_') || col.startsWith('eabs_')) {
        const prefix = col.startsWith('err_') ? 'err_' : 'eabs_';
        const parts = col.replace(prefix, '').split('_');
        const modelId = parseInt(parts[parts.length - 1]);
        const m = okModels.find(x => x.model_id === modelId);
        label = m ? `${m.model_type}#${m.model_id}` : col;
      }
      return {
        col,
        label,
        color: MODEL_COLORS_HEX[i % MODEL_COLORS_HEX.length],
        colorClass: MODEL_COLORS_CLASS[i % MODEL_COLORS_CLASS.length],
      };
    });
  }, [errCols, okModels]);

  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  useEffect(() => { setSelectedModelIdx(0); }, [seriesMeta.length]);
  const selectedSm = seriesMeta[selectedModelIdx] || seriesMeta[0];

  const [timeMode, setTimeMode] = useState('range');

  const allRows = useMemo(() => result?.rows || [], [result]);

  const allYearMonths = useMemo(() => {
    const set = new Set();
    allRows.forEach(row => {
      const dt = parseDatetime(getRowDatetime(row));
      if (dt && dt.year && dt.month) {
        set.add(`${dt.year}-${String(dt.month).padStart(2, '0')}`);
      }
    });
    if (set.size === 0) return ['小時資料'];
    return [...set].sort();
  }, [allRows]);

  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  useEffect(() => {
    if (allYearMonths.length) {
      setRangeStart(allYearMonths[0]);
      setRangeEnd(allYearMonths[allYearMonths.length - 1]);
    }
  }, [allYearMonths]);

  /* ── Points mode ── */
  const [pointHour, setPointHour] = useState('');
  const [pointDay, setPointDay] = useState('');
  const [pointMonth, setPointMonth] = useState('');
  const [addedPoints, setAddedPoints] = useState([]);

  const addPoint = () => {
    if (pointHour === '' && pointHour !== '0') return;
    const h = parseInt(pointHour);
    if (isNaN(h)) return;
    const label = [
      pointMonth ? `${pointMonth}月` : null,
      pointDay ? `${pointDay}日` : null,
      `${String(h).padStart(2, '0')}:00`,
    ].filter(Boolean).join(' ');
    setAddedPoints(prev => [...prev, {
      month: pointMonth ? parseInt(pointMonth) : null,
      day: pointDay ? parseInt(pointDay) : null,
      hour: h,
      label,
    }]);
  };
  const removePoint = (i) => setAddedPoints(prev => prev.filter((_, idx) => idx !== i));

  /* ── 篩選後 rows ── */
  const filteredRows = useMemo(() => {
    if (!allRows.length || !errCols.length) return [];

    if (timeMode === 'range') {
      if (!rangeStart || !rangeEnd) return allRows;
      if (rangeStart === '小時資料') return allRows;

      return allRows.filter(row => {
        const dt = parseDatetime(getRowDatetime(row));
        if (dt && dt.year && dt.month) {
          const ym = `${dt.year}-${String(dt.month).padStart(2, '0')}`;
          return ym >= rangeStart && ym <= rangeEnd;
        }
        return true; // 沒有 datetime 的資料也保留
      });
    }

    // points mode
    if (!addedPoints.length) return [];

    return allRows.filter(row => {
      const dt = parseDatetime(getRowDatetime(row));
      const h = dt ? dt.hour : getRowHour(row);
      if (h === null) return false;

      return addedPoints.some(pt => {
        if (pt.hour !== h) return false;
        // 使用者指定了 month/day 但 row 沒有完整日期 → 不符合
        if (pt.month !== null) {
          if (!dt || pt.month !== dt.month) return false;
        }
        if (pt.day !== null) {
          if (!dt || pt.day !== dt.day) return false;
        }
        return true;
      });
    });
  }, [allRows, timeMode, rangeStart, rangeEnd, addedPoints, errCols]);

  /* ── 折線圖資料 ── */
  const chartData = useMemo(() => {
    if (!filteredRows.length) return { xLabels: [], series: [] };

    const xLabels = filteredRows.map(row => {
      const dt = parseDatetime(getRowDatetime(row));
      if (dt) return `${dt.month}/${dt.day} ${String(dt.hour).padStart(2, '0')}h`;
      return String(getRowHour(row) ?? '');
    });

    const series = seriesMeta.map(sm => ({
      label: sm.label,
      color: sm.color,
      data: filteredRows.map(row => {
        const v = row[sm.col];
        if (v === null || v === undefined) return null;
        const n = Number(v);
        if (isNaN(n)) return null;
        return Math.abs(n); // 折線圖以絕對值顯示，方便對照門檻
      }),
    }));

    return { xLabels, series };
  }, [filteredRows, seriesMeta]);

  /* ── 選中模型的摘要指標（折線圖頂部卡片） ── */
  const focusStats = useMemo(() => {
    if (!selectedSm || !filteredRows.length) return null;
    let maxIdx = -1, maxAbs = -1, sum = 0, count = 0, over = 0;
    filteredRows.forEach((r, i) => {
      const v = r[selectedSm.col];
      if (v === null || v === undefined) return;
      const n = Number(v);
      if (isNaN(n)) return;
      const av = Math.abs(n);
      sum += av; count += 1;
      if (av > maxAbs) { maxAbs = av; maxIdx = i; }
      if (av > thresholds.danger) over += 1;
    });
    if (!count) return null;
    return {
      avg: sum / count,
      max: maxAbs,
      maxAt: maxIdx >= 0 ? getRowDatetime(filteredRows[maxIdx]) : null,
      over,
      total: count,
    };
  }, [filteredRows, selectedSm, thresholds]);

  /* ── 總體統計 ── */
  const overallStats = useMemo(() => {
    const out = {};
    seriesMeta.forEach(sm => {
      let g = 0, y = 0, r = 0;
      filteredRows.forEach(row => {
        const level = getLightLevel(row[sm.col], errorMode);
        if (level === 'green') g++;
        else if (level === 'yellow') y++;
        else if (level === 'red') r++;
      });
      out[sm.col] = { green: g, yellow: y, red: r, total: g + y + r };
    });
    return out;
  }, [filteredRows, seriesMeta, errorMode]);

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="min-h-screen w-full bg-background-dark text-white flex flex-col font-sans">
      <Navbar activePage={activePage} {...navProps} />

      {/* 訓練流程進入時的步驟條（非訓練流程不顯示） */}
      {activePage === 'model-training' && (
        <div className="w-full border-b border-white/10 bg-white/[.02] px-6 py-3 sticky top-[64px] sm:top-[65px] z-40 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors">
              <span className="material-symbols-outlined !text-lg">arrow_back</span>
              返回預測結果
            </button>
            <div className="text-sm font-medium flex items-center gap-1">
              <span className="text-white/40">1. 上傳資料</span>
              <span className="mx-2 text-white/30">/</span>
              <span className="text-white/40">2. 清理資料</span>
              <span className="mx-2 text-white/30">/</span>
              <span className="text-white/40">3. 模型訓練</span>
              <span className="mx-2 text-white/30">/</span>
              <span className="text-white/40">4. 預測發電量</span>
              <span className="mx-2 text-white/30">/</span>
              <span className="text-primary font-bold">5. 誤差值統計</span>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 py-10 space-y-8">

        {/* 標題區 */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3">
              <span className="material-symbols-outlined !text-2xl text-primary">analytics</span>
              誤差值統計分析
            </h1>
            <p className="text-sm text-white/30 mt-1">基於預測結果，依時段呈現各模型誤差分佈與折線趨勢</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* 誤差模式切換 */}
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

            {/* 模型選擇 tag（控制燈號統計表） */}
            <div className="flex flex-wrap gap-3">
              {seriesMeta.map((sm, i) => {
                const isSelected = i === selectedModelIdx;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedModelIdx(i)}
                    title={sm.label}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all
                      ${isSelected
                        ? `${sm.colorClass.bg} ${sm.colorClass.border} ring-2 ring-offset-1 ring-offset-background-dark shadow-lg`
                        : 'bg-white/[0.03] border-white/10 opacity-50 hover:opacity-80'
                      }`}
                  >
                    <span className={`size-2.5 rounded-full ${isSelected ? sm.colorClass.dot : 'bg-white/30'}`} />
                    <span className={`text-xs font-bold ${isSelected ? sm.colorClass.text : 'text-white/50'} truncate`}>{sm.label}</span>
                    {isSelected && <span className="material-symbols-outlined !text-[10px] ml-0.5" style={{ color: sm.color }}>check_circle</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!result || !errCols.length ? (
          <div className="flex flex-col items-center justify-center py-32 border border-dashed border-white/10 rounded-2xl text-white/20 space-y-3">
            <span className="material-symbols-outlined !text-5xl">query_stats</span>
            <p className="text-base font-bold tracking-widest uppercase">請先在「預測發電量」頁完成預測</p>
          </div>
        ) : (
          <>
            {/* 上區：燈號統計表 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 左：以小時區分 */}
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
                  <div className="size-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                    <span className="material-symbols-outlined !text-lg">schedule</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">時段燈號統計</h2>
                    <p className="text-[11px] text-white/30">
                      以小時區分 ·
                      <span className="ml-1" style={{ color: selectedSm?.color }}>{selectedSm?.label}</span>
                    </p>
                  </div>
                </div>
                <LightTable rows={allRows} errCol={selectedSm?.col} groupBy="hour" errorMode={errorMode} />
              </div>

              {/* 右：以年月區分 */}
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
                  <div className="size-8 rounded-lg bg-cyan-400/20 text-cyan-400 flex items-center justify-center">
                    <span className="material-symbols-outlined !text-lg">calendar_month</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">年月燈號統計</h2>
                    <p className="text-[11px] text-white/30">
                      以年月區分 ·
                      <span className="ml-1" style={{ color: selectedSm?.color }}>{selectedSm?.label}</span>
                    </p>
                  </div>
                </div>
                <LightTable rows={allRows} errCol={selectedSm?.col} groupBy="yearmonth" errorMode={errorMode} />
              </div>
            </div>

            {/* 下區：折線圖 */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl shadow-2xl">
              {/* Header */}
              <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined !text-lg text-primary">show_chart</span>
                  誤差值折線趨勢
                </h2>
                <p className="text-[11px] text-white/30 mt-0.5">
                  逐筆觀察誤差隨時間的變化 · 顯示 {filteredRows.length.toLocaleString()} 筆
                  {filteredRows.length !== allRows.length && ` (篩選自 ${allRows.length.toLocaleString()} 筆)`}
                </p>
              </div>

              {/* 時間範圍控制 panel — 模式 toggle + 對應控件整合 */}
              <div className="px-6 py-5 border-b border-white/[0.06] bg-white/[0.01] space-y-4">
                {/* 模式 toggle（pill style） */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">時間範圍</span>
                  <div className="flex gap-1 bg-white/[0.03] p-1 rounded-lg border border-white/10">
                    {TIME_MODES.map(m => (
                      <button key={m.id} onClick={() => setTimeMode(m.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${timeMode === m.id ? 'bg-primary text-background-dark shadow' : 'text-white/40 hover:text-white/70'}`}>
                        <span className="material-symbols-outlined !text-sm">{m.icon}</span>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 對應控件 */}
                {timeMode === 'range' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <select value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-primary/50 focus:outline-none min-w-[120px]">
                        {allYearMonths.map(ym => (
                          <option key={ym} value={ym} className="bg-[#111] text-white">{ym}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined !text-base text-white/30">arrow_forward</span>
                      <select value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-primary/50 focus:outline-none min-w-[120px]">
                        {allYearMonths.filter(ym => ym >= rangeStart).map(ym => (
                          <option key={ym} value={ym} className="bg-[#111] text-white">{ym}</option>
                        ))}
                      </select>
                    </div>
                    <div className="h-5 w-px bg-white/10 mx-1" />
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { label: '全部', fn: () => { setRangeStart(allYearMonths[0]); setRangeEnd(allYearMonths[allYearMonths.length - 1]); } },
                        { label: '近 3 月', fn: () => { const e = allYearMonths[allYearMonths.length - 1]; setRangeEnd(e); setRangeStart(allYearMonths[Math.max(0, allYearMonths.length - 3)]); } },
                        { label: '近 6 月', fn: () => { const e = allYearMonths[allYearMonths.length - 1]; setRangeEnd(e); setRangeStart(allYearMonths[Math.max(0, allYearMonths.length - 6)]); } },
                      ].map(({ label, fn }) => (
                        <button key={label} onClick={fn}
                          className="px-3 py-1.5 text-[10px] font-bold rounded-lg border border-white/10 text-white/40 hover:bg-white/5 hover:text-white/70 transition-all">
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11px] text-white/40">
                      <span className="material-symbols-outlined !text-sm align-middle mr-1">info</span>
                      指定條件挑出符合的時點（例：每天 14:00、或 8 月 15 日 5 點）。月、日為選填，小時必填。
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-white/30 font-bold uppercase tracking-widest">月份（可選）</label>
                        <input type="number" placeholder="1–12" value={pointMonth} onChange={e => setPointMonth(e.target.value)} min={1} max={12}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono w-24 focus:border-primary/50 focus:outline-none placeholder:text-white/15" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-white/30 font-bold uppercase tracking-widest">日（可選）</label>
                        <input type="number" placeholder="1–31" value={pointDay} onChange={e => setPointDay(e.target.value)} min={1} max={31}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono w-24 focus:border-primary/50 focus:outline-none placeholder:text-white/15" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-white/30 font-bold uppercase tracking-widest">小時 <span className="text-red-400">*</span></label>
                        <input type="number" placeholder="0–23" value={pointHour} onChange={e => setPointHour(e.target.value)} min={0} max={23}
                          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono w-24 focus:border-primary/50 focus:outline-none placeholder:text-white/15" />
                      </div>
                      <button onClick={addPoint}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-background-dark text-xs font-black hover:scale-[1.02] active:scale-95 transition-all shadow-[0_4px_12px_rgba(242,204,13,0.2)]">
                        <span className="material-symbols-outlined !text-sm">add</span>
                        加入條件
                      </button>
                    </div>
                    {addedPoints.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {addedPoints.map((pt, i) => (
                          <div key={i} className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
                            <span className="text-xs font-mono text-primary font-bold">{pt.label}</span>
                            <button onClick={() => removePoint(i)} className="text-white/30 hover:text-red-400 transition-colors">
                              <span className="material-symbols-outlined !text-sm">close</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/20 italic">尚未加入任何時間點條件，請至少加入一個</p>
                    )}
                  </div>
                )}
              </div>

              {/* 摘要卡（針對選中模型） */}
              {focusStats && (
                <div className="px-6 pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined !text-xs">functions</span>
                      平均誤差
                    </p>
                    <p className="text-xl font-black font-mono mt-1" style={{ color: selectedSm?.color }}>
                      {focusStats.avg.toFixed(2)}<span className="text-xs ml-0.5">{thresholds.unit}</span>
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined !text-xs">trending_up</span>
                      最大誤差
                    </p>
                    <p className="text-xl font-black font-mono mt-1 text-red-400">
                      {focusStats.max.toFixed(2)}<span className="text-xs ml-0.5">{thresholds.unit}</span>
                    </p>
                    {focusStats.maxAt && (
                      <p className="text-[10px] text-white/30 font-mono truncate">@ {focusStats.maxAt}</p>
                    )}
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined !text-xs">priority_high</span>
                      超標筆數
                    </p>
                    <p className="text-xl font-black font-mono mt-1 text-red-400">
                      {focusStats.over}<span className="text-xs text-white/30 ml-1">/ {focusStats.total}</span>
                    </p>
                    <p className="text-[10px] text-white/30 font-mono">{`> ${thresholds.danger}${thresholds.unit}`}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                    <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest flex items-center gap-1">
                      <span className="material-symbols-outlined !text-xs">tune</span>
                      閾值
                    </p>
                    <p className="text-sm font-bold font-mono mt-1 flex items-baseline gap-1">
                      <span className="text-green-400">{thresholds.warn}</span>
                      <span className="text-white/20">/</span>
                      <span className="text-yellow-400">{thresholds.danger}</span>
                      <span className="text-xs text-white/40 ml-1">{thresholds.unit}</span>
                    </p>
                    <p className="text-[10px] text-white/30 font-mono">正常 / 異常</p>
                  </div>
                </div>
              )}

              {/* 圖例 + 門檻線說明（移到圖上方） */}
              {chartData.xLabels.length > 0 && (
                <div className="px-6 pt-4 pb-2 flex flex-wrap items-center gap-x-5 gap-y-2 justify-between">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {seriesMeta.map((sm, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: sm.color }} />
                        <span className={`text-xs font-bold ${sm.colorClass.text}`}>{sm.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-white/50">
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 border-t border-dashed border-green-400/60" />
                      <span>{thresholds.warn}{thresholds.unit} 正常</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-4 border-t border-dashed border-yellow-400/60" />
                      <span>{thresholds.danger}{thresholds.unit} 異常</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 折線圖本體 */}
              <div className="px-6 pb-6 pt-2">
                {chartData.xLabels.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-white/20 space-y-2">
                    <span className="material-symbols-outlined !text-4xl">show_chart</span>
                    <p className="text-sm">
                      {timeMode === 'points' && addedPoints.length === 0
                        ? '請加入至少一個時間點條件'
                        : '所選時間範圍內無符合資料'}
                    </p>
                  </div>
                ) : (
                  <LineChart
                    series={chartData.series}
                    xLabels={chartData.xLabels}
                    yMax={null}
                    warnThreshold={thresholds.warn}
                    dangerThreshold={thresholds.danger}
                    unit={thresholds.unit}
                    axisLabel={thresholds.axisLabel}
                  />
                )}
              </div>

              {/* 本區段統計摘要 */}
              {filteredRows.length > 0 && (
                <div className="px-6 pb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-white/[0.06] pt-5">
                  {seriesMeta.map((sm, i) => {
                    const st = overallStats[sm.col] || { green: 0, yellow: 0, red: 0, total: 0 };
                    return (
                      <div key={i} className={`${sm.colorClass.bg} border ${sm.colorClass.border} rounded-xl p-3`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider ${sm.colorClass.text} mb-2 truncate`}>{sm.label}</p>
                        <div className="space-y-1 text-xs font-mono">
                          <div className="flex justify-between">
                            <span className="text-white/30">正常</span>
                            <span className="text-green-400 font-bold">{st.green}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/30">留意</span>
                            <span className="text-yellow-400 font-bold">{st.yellow}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/30">異常</span>
                            <span className="text-red-400 font-bold">{st.red}</span>
                          </div>
                          <div className="mt-1.5">
                            <LightBar green={st.green} yellow={st.yellow} red={st.red} total={st.total} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <div className="p-8 border-t border-white/10 bg-background-dark/95 flex justify-end gap-6 backdrop-blur-xl">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-white/30 hover:text-white transition-colors">
          <span className="material-symbols-outlined !text-base">arrow_back</span>
          返回預測發電量
        </button>
        <button onClick={onNavigateToDashboard}
          className="px-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 hover:border-white/20 transition-all">
          返回首頁看板
        </button>
      </div>
    </div>
  );
}
