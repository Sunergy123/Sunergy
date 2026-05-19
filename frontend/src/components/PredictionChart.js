// src/components/PredictionChart.js
// 預測結果折線圖：橫軸時間，縱軸發電量。實際 EAC 用白色粗線，每個模型一條彩色線。
// 支援滑鼠滾輪縮放、拖拽平移；橫軸日期同一天只顯示一次。
import React, { useMemo, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, zoomPlugin);

// 把 tailwind 模型色票對應到實際 hex
const COLOR_HEX = {
  'text-primary': '#F2CC0D',
  'text-cyan-400': '#22D3EE',
  'text-violet-400': '#A78BFA',
  'text-rose-400': '#FB7185',
  'text-emerald-400': '#34D399',
  'text-orange-400': '#FB923C',
};

/**
 * Props:
 *  - rows: 已篩選排序後要繪製的資料列
 *  - columns: result.columns (用來判斷有哪些 pred_ 欄位)
 *  - okModels: result.models_summary.filter(status==='ok')
 *  - modelColorMap: { [model_id]: { text, dot, ... } }
 *  - getTimeLabel(row): 回傳該列的橫軸 label（字串）
 *  - height: 圖表高度 (px)
 */
export default function PredictionChart({
  rows,
  columns,
  okModels,
  modelColorMap,
  getTimeLabel,
  height = 520,
}) {
  const chartRef = useRef(null);

  const handleResetZoom = () => {
    if (chartRef.current?.resetZoom) chartRef.current.resetZoom();
  };
  const { labels, datasets, isEmpty } = useMemo(() => {
    if (!rows || rows.length === 0) {
      return { labels: [], datasets: [], isEmpty: true };
    }

    const labels = rows.map((r) => getTimeLabel(r) ?? '');
    const ds = [];

    const hasActual = (columns || []).includes('EAC') && rows.some((r) => r.EAC != null);
    if (hasActual) {
      ds.push({
        label: '實際 EAC',
        data: rows.map((r) => (r.EAC == null ? null : Number(r.EAC))),
        borderColor: '#FFFFFF',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5,
        spanGaps: true,
      });
    }

    (okModels || []).forEach((m) => {
      const colorClass = modelColorMap?.[m.model_id]?.text;
      const hex = COLOR_HEX[colorClass] || '#F2CC0D';

      // 找對應的預測欄位
      let predCol = null;
      if (m.model_type === 'physics') {
        predCol = 'pred_physics_0';
      } else {
        predCol = (columns || []).find(
          (col) => col.startsWith('pred_') && col.endsWith(`_${m.model_id}`)
        );
      }
      // single-mode fallback：欄位叫 predicted_EAC
      if (!predCol && (columns || []).includes('predicted_EAC')) {
        predCol = 'predicted_EAC';
      }
      if (!predCol) return;

      ds.push({
        label: `${m.model_type} #${m.model_id}`,
        data: rows.map((r) => (r[predCol] == null ? null : Number(r[predCol]))),
        borderColor: hex,
        backgroundColor: `${hex}33`,
        borderWidth: 2,
        borderDash: [6, 4], // 預測線一律虛線
        tension: 0.3,
        pointRadius: 1.5,
        pointHoverRadius: 5,
        spanGaps: true,
      });
    });

    return { labels, datasets: ds, isEmpty: ds.length === 0 };
  }, [rows, columns, okModels, modelColorMap, getTimeLabel]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      // 關閉更新動畫：即時模式每秒新資料進來時不要 tween，
      // 否則使用者正在拖拽平移會看到曲線變形再彈回正確位置
      animation: false,
      animations: { colors: false, x: false, y: false },
      transitions: {
        active: { animation: { duration: 0 } },
        resize: { animation: { duration: 0 } },
        zoom: { animation: { duration: 0 } },
      },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: 'rgba(255,255,255,0.75)',
            font: { size: 12, weight: 'bold' },
            usePointStyle: true,
            pointStyle: 'line',
            boxWidth: 24,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.88)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${
                ctx.parsed.y == null ? '—' : `${Number(ctx.parsed.y).toFixed(2)} kW`
              }`,
          },
        },
        zoom: {
          limits: {
            x: { min: 'original', max: 'original', minRange: 5 },
          },
          pan: {
            enabled: true,
            mode: 'x',
            modifierKey: null,
          },
          zoom: {
            wheel: { enabled: true, speed: 0.1 },
            pinch: { enabled: true },
            drag: {
              enabled: true,
              modifierKey: 'shift',
              backgroundColor: 'rgba(242,204,13,0.15)',
              borderColor: 'rgba(242,204,13,0.6)',
              borderWidth: 1,
            },
            mode: 'x',
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(255,255,255,0.4)',
            maxRotation: 60,
            minRotation: 30,
            autoSkip: true,
            maxTicksLimit: 18,
            font: { size: 11 },
            // 每個日期只在「該日第一個可見 tick」顯示完整 "YYYY-MM-DD HH:00"，
            // 同日後續 tick 只顯示 "HH:00"。直接從 closure 的 labels 陣列查表，
            // 避免取到已經被 callback 處理過的字串。
            callback: function (value, index, ticks) {
              const idx = typeof value === 'number' ? value : Number(value);
              const cur = labels[idx];
              if (!cur || typeof cur !== 'string') return cur;
              const sp = cur.indexOf(' ');
              if (sp < 0) return cur;
              const curDate = cur.slice(0, sp);
              const curTime = cur.slice(sp + 1);
              if (index === 0) return cur;
              const prevTick = ticks[index - 1];
              const prevIdx = prevTick
                ? (typeof prevTick.value === 'number' ? prevTick.value : Number(prevTick.value))
                : -1;
              const prev = prevIdx >= 0 && prevIdx < labels.length ? labels[prevIdx] : '';
              const prevSp = typeof prev === 'string' ? prev.indexOf(' ') : -1;
              const prevDate = prevSp > 0 ? prev.slice(0, prevSp) : prev;
              return prevDate === curDate ? curTime : cur;
            },
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: {
            display: true,
            text: '時間',
            color: 'rgba(255,255,255,0.55)',
            font: { size: 12, weight: 'bold' },
          },
        },
        y: {
          ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.05)' },
          title: {
            display: true,
            text: '發電量 (kW)',
            color: 'rgba(255,255,255,0.55)',
            font: { size: 12, weight: 'bold' },
          },
          beginAtZero: true,
        },
      },
    }),
    [labels]
  );

  if (isEmpty) {
    return (
      <div
        className="flex items-center justify-center text-white/30 text-sm"
        style={{ height }}
      >
        沒有可繪製的資料
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* 工具列：操作提示 + 重設縮放（獨立一列，不與 legend 重疊） */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <span className="text-[11px] text-white/35">
          <span className="hidden md:inline">滾輪縮放　·　拖拽平移　·　Shift+拖拽框選</span>
        </span>
        <button
          onClick={handleResetZoom}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold border border-white/15 bg-white/[0.03] text-white/60 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all"
          title="重設縮放"
        >
          <span className="material-symbols-outlined !text-sm">restart_alt</span>
          重設
        </button>
      </div>
      <div style={{ height }}>
        <Line ref={chartRef} data={{ labels, datasets }} options={options} />
      </div>
    </div>
  );
}
