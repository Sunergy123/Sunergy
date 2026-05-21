import { useRef, useState } from 'react';
import SolarMap from './SolarMap';
import { API_BASE } from '../config';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

function InfoTooltip({ text }) {
  return (
    <span className="relative inline-block group ml-1">

      {/* 問號 icon */}
      <span className="w-4 h-4 rounded-full border border-white/30 text-white/40 text-[10px] inline-flex items-center justify-center cursor-pointer hover:border-yellow-400 hover:text-yellow-400 transition-all">
        ?
      </span>

      {/* Tooltip */}
      <span
        className="
          absolute left-6 top-1/2 -translate-y-1/2
          hidden group-hover:block
          w-64 p-3 rounded-xl
          bg-black border border-white/10
          text-xs text-white/70
          shadow-2xl z-50
          whitespace-normal
        "
      >
        {text}
      </span>

    </span>
  );
}

export default function SolarEstimationCard() {

  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [capacity, setCapacity] = useState('');
  const [pr, setPr] = useState('0.8');
  const [electricityPrice, setElectricityPrice] = useState('');
  const [result, setResult] = useState(null);
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [searchMessage, setSearchMessage] = useState('');

  // Loading
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // 搜尋觸發飛行的 trigger;避免點地圖也被自動 flyTo
  const [flyToTrigger, setFlyToTrigger] = useState(0);

  // 防止 race condition:只採用最後一次發出的 request 結果
  const estimateReqIdRef = useRef(0);

  const handleEstimate = async () => {

    // Input validation
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const capacityNum = parseFloat(capacity);
    const prNum = parseFloat(pr);
    const priceNum = parseFloat(electricityPrice);

    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
      setSearchMessage('請先選擇地點(點地圖或搜尋)');
      return;
    }
    if (!(capacityNum > 0)) {
      setSearchMessage('裝置容量必須大於 0');
      return;
    }
    if (!(prNum > 0 && prNum <= 1)) {
      setSearchMessage('系統效率 PR 必須介於 0 ~ 1 之間');
      return;
    }
    if (!(priceNum >= 0)) {
      setSearchMessage('請輸入有效的每度電價格');
      return;
    }

    const reqId = ++estimateReqIdRef.current;
    setLoading(true);

    try {

      const res = await fetch(
        `${API_BASE}/solar/estimate?lat=${latNum}&lon=${lonNum}&capacity=${capacityNum}&pr=${prNum}`
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();

      // 較舊的 request 回來時忽略
      if (reqId !== estimateReqIdRef.current) return;

      // 適合程度判斷
      let level = '';
      let levelColor = '';

      if (data.H >= 4.5) {
        level = '非常適合';
        levelColor = 'text-green-400';
      }
      else if (data.H >= 4.0) {
        level = '適合';
        levelColor = 'text-yellow-400';
      }
      else {
        level = '普通';
        levelColor = 'text-red-400';
      }

      data.level = level;
      data.levelColor = levelColor;

      // 預估收益(前端計算,以使用者輸入的電價為準)
      data.income = (data.year_energy * priceNum).toFixed(0);

      // 減碳量由 backend 提供 (annual_carbon_reduction),保留欄位以兼容
      data.carbon = (data.annual_carbon_reduction ?? 0).toFixed(0);

      setResult(data);

    } catch (error) {

      if (reqId === estimateReqIdRef.current) {
        console.error(error);
        setSearchMessage('評估失敗:' + (error.message || '未知錯誤'));
      }

    } finally {

      if (reqId === estimateReqIdRef.current) {
        setLoading(false);
      }

    }
  };

  const reverseGeocode = async (lat, lon) => {

    try {

        const res = await fetch(
        `${NOMINATIM_BASE}/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { 'Accept-Language': 'zh-TW' } }
        );

        if (!res.ok) return;

        const data = await res.json();

        if (data.display_name) {
        setAddress(data.display_name);
        }

    } catch (error) {

        console.error(error);

    }
    };

  const searchLocation = async () => {

    if (!location.trim()) {
      setSearchMessage('請輸入地點');
      return;
    }

    setSearchLoading(true);

    try {

      let originalQuery = location.trim();

      const fallbackQueries = [
        originalQuery, // 完整地址
        originalQuery.replace(/\d+號?$/, ''), // 去掉號
        originalQuery.replace(/\d+號?$/, '').replace(/\d+弄$/, ''), // 去掉弄
        originalQuery.replace(/\d+號?$/, '').replace(/\d+弄$/, '').replace(/\d+巷$/, '') // 去掉巷
      ];

      let data = [];

      for (const query of fallbackQueries) {

        const res = await fetch(
          `${NOMINATIM_BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=tw`,
          {
            headers: {
              'Accept-Language': 'zh-TW'
            }
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        data = await res.json();

        if (data.length > 0) {
          break;
        }
      }

      if (data.length > 0) {

        const result = data[0];

        // 使用者是否有輸入門牌號
        const hasHouseNumber = /\d+號/.test(originalQuery);

        // 是否精準匹配
        const isExactMatch =
          result.display_name.replace(/\s+/g, '')
            .includes(originalQuery.replace(/\s+/g, ''));

        // 顯示訊息邏輯
        if (hasHouseNumber && !isExactMatch) {

          setSearchMessage(
            '⚠️ 無法找到精準門牌，已導向附近位置，請於地圖上自行微調'
          );

        } else if (!hasHouseNumber) {

          setSearchMessage(
            'ℹ️ 目前為區域定位，若需更精準位置請輸入完整門牌'
          );

        } else {

          setSearchMessage('');

        }

        setLat(result.lat);
        setLon(result.lon);

        // 直接反查目前地圖位置
        await reverseGeocode(result.lat, result.lon);

        // 地圖 flyTo
        setFlyToTrigger((t) => t + 1);

      } else {

        setSearchMessage('找不到地點');

      }

    } catch (error) {

      console.error(error);
      setSearchMessage('搜尋失敗');

    } finally {

      setSearchLoading(false);

    }
  };

  return (

    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">

      <h2 className="text-xl font-bold mb-4">
        ☀️ 案場建置評估
      </h2>

      {/* 地圖 */}
      <SolarMap
        lat={lat}
        lon={lon}
        setLat={setLat}
        setLon={setLon}
        reverseGeocode={reverseGeocode}
        flyToTrigger={flyToTrigger}
      />

      <div className="mt-4 space-y-3">

        {/* 搜尋地點 */}
        <div className="space-y-2 mb-4">

          <input
            type="text"
            placeholder="輸入地點"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !searchLoading) searchLocation(); }}
            className="w-full bg-black/30 border border-white/10 rounded-lg p-3"
          />

          <button
            onClick={searchLocation}
            disabled={searchLoading}
            className="w-full bg-yellow-500 text-black font-bold py-2 rounded-lg disabled:opacity-50"
          >
            {searchLoading ? '搜尋中...' : '搜尋地點'}
          </button>

          {searchMessage && (
            <div className="text-yellow-400 text-sm mt-2">
              {searchMessage}
            </div>
          )}

        </div>

        {/* 地點資訊 */}
        <div className="text-sm text-white/60">
          地點:{address || '-'}
        </div>

        <div className="text-sm text-white/60">
          緯度:{lat || '-'}
        </div>

        <div className="text-sm text-white/60">
          經度:{lon || '-'}
        </div>

        {/* 容量輸入 */}
        <div>
            <p className="text-sm text-white/70 mb-2">
                裝置容量(kWp)
            </p>

            <input
                type="number"
                min="0"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg p-3"
            />
        </div>

        {/* PR */}
        <div>

            <p className="text-sm text-white/70 mb-2 flex items-center">
                系統效率 PR

                <InfoTooltip
                    text="PR(Performance Ratio)為太陽能系統效能比,用來表示實際發電效率。已包含逆變器損耗、溫度損失、線路損耗等因素。一般系統約為 0.75 ~ 0.85。"
                />
            </p>

            <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={pr}
                onChange={(e) => setPr(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg p-3"
            />

        </div>

        {/* 售電價格 */}
        <div>
            <p className="text-sm text-white/70 mb-2">
                每度電價格(元/度)
            </p>

            <input
                type="number"
                step="0.1"
                min="0"
                value={electricityPrice}
                onChange={(e) => setElectricityPrice(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg p-3"
            />
        </div>

        {/* 評估按鈕 */}
        <button
          onClick={handleEstimate}
          disabled={loading}
          className="w-full bg-yellow-500 text-black font-bold py-3 rounded-xl disabled:opacity-50"
        >
          {loading ? '評估中...' : '開始評估'}
        </button>

        {/* 結果 */}
        {result && (

        <div className="mt-4 bg-black/30 rounded-xl p-4 space-y-3">

            {/* 平均日照 */}
            <div>
                <p className="flex items-center">
                    ☀️ 平均日照:
                    <span className="font-bold ml-1">
                        {result.H} kWh/m²/day
                    </span>

                    <InfoTooltip
                        text="每平方公尺每日平均接收的太陽能量,可視為峰值日照時數(PSH)。數值越高代表越適合建置太陽能。"
                    />
                </p>
            </div>

            {/* 適合程度 */}
            <div>
                <p className={`${result.levelColor} flex items-center`}>
                    📊 適合程度:
                    <span className="font-bold ml-1">
                        {result.level}
                    </span>

                    <InfoTooltip
                        text="依據平均日照量判斷案場建置適合程度。通常日照量越高,發電效益越好。"
                    />
                </p>
            </div>

            {/* 日發電 */}
            <div>
                <p className="flex items-center">
                    ⚡ 預估日發電:
                    <span className="font-bold ml-1">
                        {result.daily_energy} kWh/day
                    </span>

                    <InfoTooltip
                        text="依據日照量、裝置容量(kWp)與系統效率(PR)估算之每日平均發電量。"
                    />
                </p>
            </div>

            {/* 年發電 */}
            <div>
                <p className="flex items-center">
                    📅 預估年發電:
                    <span className="font-bold ml-1">
                        {result.year_energy} kWh/year
                    </span>

                    <InfoTooltip
                        text="預估一年總發電量,通常以每日平均發電量乘以 365 天估算。"
                    />
                </p>
            </div>

            {/* 年收益 */}
            <div>
                <p className="flex items-center">
                    💰 預估年收益:
                    <span className="font-bold ml-1">
                        NT$ {Number(result.income).toLocaleString()}
                    </span>

                    <InfoTooltip
                        text="依照輸入之每度電價格(躉購費率)估算年度售電收益。"
                    />
                </p>
            </div>

            {/* 減碳 */}
            <div>
                <p className="flex items-center">
                    🌱 年減碳量:
                    <span className="font-bold ml-1">
                        {Number(result.carbon).toLocaleString()} kgCO₂e/year
                    </span>

                    <InfoTooltip
                        text={`依台灣平均電力排碳係數 (${result.carbon_factor ?? 0.474} kgCO₂e/kWh) 估算,可反映使用太陽能所減少的碳排放量。`}
                    />
                </p>
            </div>

        </div>
        )}
      </div>

    </div>
  );
}
