// src/components/SettingsModal.js
import React, { useState } from 'react';
import {
  DEFAULT_THRESHOLDS,
  readThresholds,
  writeThresholds,
  resetThresholds,
} from '../thresholds';

/** 單一門檻欄位 */
function ThresholdRow({ label, color, value, onChange, unit, step = 0.1 }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`size-3 rounded-full ${color}`} />
      <label className="flex-1 text-sm text-white/70">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-right text-sm text-white focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <span className="w-8 text-xs text-white/40">{unit}</span>
      </div>
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const [draft, setDraft] = useState(() => {
    const t = readThresholds();
    return {
      pct: { warn: String(t.pct.warn), danger: String(t.pct.danger) },
      abs: { warn: String(t.abs.warn), danger: String(t.abs.danger) },
    };
  });
  const [err, setErr] = useState('');

  const update = (mode, key, val) => {
    setDraft((d) => ({ ...d, [mode]: { ...d[mode], [key]: val } }));
    setErr('');
  };

  const handleSave = () => {
    const parse = (s) => {
      const n = Number(s);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const next = {
      pct: { warn: parse(draft.pct.warn), danger: parse(draft.pct.danger) },
      abs: { warn: parse(draft.abs.warn), danger: parse(draft.abs.danger) },
    };
    for (const mode of ['pct', 'abs']) {
      if (Number.isNaN(next[mode].warn) || Number.isNaN(next[mode].danger)) {
        setErr('門檻必須為大於等於 0 的數字');
        return;
      }
      if (next[mode].warn >= next[mode].danger) {
        setErr(`${mode === 'pct' ? '百分比' : '絕對值'}模式：綠燈門檻必須小於黃燈門檻`);
        return;
      }
    }
    writeThresholds(next);
    onClose();
  };

  const handleReset = () => {
    const t = resetThresholds();
    setDraft({
      pct: { warn: String(t.pct.warn), danger: String(t.pct.danger) },
      abs: { warn: String(t.abs.warn), danger: String(t.abs.danger) },
    });
    setErr('');
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[480px] overflow-hidden rounded-2xl border border-white/10 bg-[#1E1E1E] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="absolute right-4 top-4 text-white/40 hover:text-white" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-3xl">tune</span>
          </div>
          <h2 className="text-2xl font-bold text-white">設定</h2>
          <p className="mt-1 text-sm text-white/50">調整誤差燈號顯示的門檻值</p>
        </div>

        {err && (
          <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-center text-sm font-medium text-red-400 border border-red-500/20">
            {err}
          </div>
        )}

        {/* 百分比模式 */}
        <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">燈號門檻 · 百分比模式</h3>
            <span className="text-[11px] text-white/40 font-mono">預設 {DEFAULT_THRESHOLDS.pct.warn} / {DEFAULT_THRESHOLDS.pct.danger}{DEFAULT_THRESHOLDS.pct.unit}</span>
          </div>
          <div className="space-y-2.5">
            <ThresholdRow
              label="綠燈上限（≤ 為正常）"
              color="bg-green-400"
              value={draft.pct.warn}
              onChange={(v) => update('pct', 'warn', v)}
              unit="%"
              step={0.5}
            />
            <ThresholdRow
              label="黃燈上限（≤ 為需留意，超過為異常）"
              color="bg-yellow-400"
              value={draft.pct.danger}
              onChange={(v) => update('pct', 'danger', v)}
              unit="%"
              step={0.5}
            />
          </div>
        </div>

        {/* 絕對值模式 */}
        <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">燈號門檻 · 絕對值模式</h3>
            <span className="text-[11px] text-white/40 font-mono">預設 {DEFAULT_THRESHOLDS.abs.warn} / {DEFAULT_THRESHOLDS.abs.danger}{DEFAULT_THRESHOLDS.abs.unit}</span>
          </div>
          <div className="space-y-2.5">
            <ThresholdRow
              label="綠燈上限（≤ 為正常）"
              color="bg-green-400"
              value={draft.abs.warn}
              onChange={(v) => update('abs', 'warn', v)}
              unit="kW"
              step={0.1}
            />
            <ThresholdRow
              label="黃燈上限（≤ 為需留意，超過為異常）"
              color="bg-yellow-400"
              value={draft.abs.danger}
              onChange={(v) => update('abs', 'danger', v)}
              unit="kW"
              step={0.1}
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/70 hover:bg-white/10 transition-colors"
          >
            還原預設
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-black shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:bg-primary/90"
          >
            儲存設定
          </button>
        </div>
      </div>
    </div>
  );
}
