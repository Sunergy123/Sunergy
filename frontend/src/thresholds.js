// src/thresholds.js
// 燈號門檻設定（誤差值 → 綠/黃/紅）。
// 透過 localStorage 持久化，並用 window 事件廣播，讓多個頁面/元件即時同步。
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'lightThresholds';
const EVENT_NAME = 'lightThresholds:change';

export const DEFAULT_THRESHOLDS = {
  pct: { warn: 5,  danger: 15, unit: '%',  axisLabel: '誤差值 %' },
  abs: { warn: 1,  danger: 5,  unit: 'kW', axisLabel: '誤差值 kW' },
};

const clampNum = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const normalize = (raw) => {
  const out = {
    pct: { ...DEFAULT_THRESHOLDS.pct },
    abs: { ...DEFAULT_THRESHOLDS.abs },
  };
  for (const mode of ['pct', 'abs']) {
    if (raw && raw[mode]) {
      out[mode].warn   = clampNum(raw[mode].warn,   DEFAULT_THRESHOLDS[mode].warn);
      out[mode].danger = clampNum(raw[mode].danger, DEFAULT_THRESHOLDS[mode].danger);
    }
    // warn 必須小於 danger，否則修正回預設
    if (out[mode].warn >= out[mode].danger) {
      out[mode].warn   = DEFAULT_THRESHOLDS[mode].warn;
      out[mode].danger = DEFAULT_THRESHOLDS[mode].danger;
    }
  }
  return out;
};

export function readThresholds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THRESHOLDS };
    return normalize(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_THRESHOLDS };
  }
}

export function writeThresholds(next) {
  const normalized = normalize(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: normalized }));
  return normalized;
}

export function resetThresholds() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { ...DEFAULT_THRESHOLDS } }));
  return { ...DEFAULT_THRESHOLDS };
}

/** React hook：自動訂閱門檻變更（同分頁事件 + 跨分頁 storage 事件） */
export function useThresholds() {
  const [thresholds, setThresholds] = useState(readThresholds);

  useEffect(() => {
    const onChange = (e) => setThresholds(e.detail || readThresholds());
    const onStorage = (e) => { if (e.key === STORAGE_KEY) setThresholds(readThresholds()); };
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return thresholds;
}

/** 誤差值 → 燈號級別（綠/黃/紅）。以絕對值判斷 */
export function getLightLevel(val, mode, thresholds) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  if (!Number.isFinite(n)) return null;
  const t = (thresholds || readThresholds())[mode] || DEFAULT_THRESHOLDS[mode];
  const v = Math.abs(n);
  if (v <= t.warn) return 'green';
  if (v <= t.danger) return 'yellow';
  return 'red';
}

// 給 App.js 用：清除 localStorage 但保留門檻設定
export const THRESHOLDS_STORAGE_KEY = STORAGE_KEY;
