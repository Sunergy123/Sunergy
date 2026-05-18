// 集中管理 API 基底 URL。CRA 會在 build/start 時注入 REACT_APP_* 環境變數。
// 部署時設定 REACT_APP_API_URL (例如在 .env.production 或 CI 環境變數)。
export const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

// 向後相容別名 (歷史上有檔案使用 API_BASE_URL)
export const API_BASE_URL = API_BASE;
