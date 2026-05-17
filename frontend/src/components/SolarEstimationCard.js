import { useState } from 'react';
import SolarMap from './SolarMap';
function InfoTooltip({ text }) {
  return (
    <div className="relative inline-block group ml-1">

      {/* 問號 icon */}
      <div className="w-4 h-4 rounded-full border border-white/30 text-white/40 text-[10px] flex items-center justify-center cursor-pointer hover:border-yellow-400 hover:text-yellow-400 transition-all">
        ?
      </div>

      {/* Tooltip */}
      <div className="
        absolute left-6 top-1/2 -translate-y-1/2
        hidden group-hover:block
        w-64 p-3 rounded-xl
        bg-black border border-white/10
        text-xs text-white/70
        shadow-2xl z-50
        whitespace-normal
      ">
        {text}
      </div>

    </div>
  );
}

export default function SolarEstimationCard() {

  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [capacity, setCapacity] = useState('');
  const [pr, setPr] = useState(0.8);
  const [electricityPrice, setElectricityPrice] = useState('');
  const [result, setResult] = useState(null);
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');

  // Loading
  const [loading, setLoading] = useState(false);

  const handleEstimate = async () => {

    setLoading(true);

    try {

      const res = await fetch(
        `http://127.0.0.1:8000/solar/estimate?lat=${lat}&lon=${lon}&capacity=${capacity}&pr=${pr}`
      );

      const data = await res.json();

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

      // 加進資料
      data.level = level;
      data.levelColor = levelColor;

      // 預估收益
      data.income = (
        data.year_energy * electricityPrice
      ).toFixed(0);

      // 減碳量（1度電約 0.474 kgCO₂e）
      data.carbon = (
        data.year_energy * 0.474
      ).toFixed(0);

      setResult(data);

    } catch (error) {

      console.error(error);
      alert('評估失敗');

    } finally {

      setLoading(false);

    }
  };

  const reverseGeocode = async (lat, lon) => {

    try {

        const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
        );

        const data = await res.json();

        if (data.display_name) {
        setAddress(data.display_name);
        }

    } catch (error) {

        console.error(error);

    }
    };

  const searchLocation = async () => {

    try {

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${location}&format=json`
      );

      const data = await res.json();

      if (data.length > 0) {

        setLat(data[0].lat);
        setLon(data[0].lon);

        setAddress(data[0].display_name);

      } else {

        alert('找不到地點');

      }

    } catch (error) {

      console.error(error);
      alert('搜尋失敗');

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
        setAddress={setAddress}
        reverseGeocode={reverseGeocode}
      />

      <div className="mt-4 space-y-3">

        {/* 搜尋地點 */}
        <div className="space-y-2 mb-4">

          <input
            type="text"
            placeholder="輸入地點"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full bg-black/30 border border-white/10 rounded-lg p-3"
          />

          <button
            onClick={searchLocation}
            className="w-full bg-yellow-500 text-black font-bold py-2 rounded-lg"
          >
            搜尋地點
          </button>

        </div>

        {/* 地點資訊 */}
        <div className="text-sm text-white/60">
          地點：{address || '-'}
        </div>

        <div className="text-sm text-white/60">
          緯度：{lat || '-'}
        </div>

        <div className="text-sm text-white/60">
          經度：{lon || '-'}
        </div>

        {/* 容量輸入 */}
        <div>
            <p className="text-sm text-white/70 mb-2">
                裝置容量（kWp）
            </p>

            <input
                type="number"
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
                    text="PR（Performance Ratio）為太陽能系統效能比，用來表示實際發電效率。已包含逆變器損耗、溫度損失、線路損耗等因素。一般系統約為 0.75 ~ 0.85。"
                />
            </p>

            <input
                type="number"
                step="0.01"
                value={pr}
                onChange={(e) => setPr(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg p-3"
            />

        </div>

        {/* 售電價格 */}
        <div>
            <p className="text-sm text-white/70 mb-2">
                每度電價格（元/度）
            </p>

            <input
                type="number"
                step="0.1"
                value={electricityPrice}
                onChange={(e) => setElectricityPrice(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg p-3"
            />
        </div>

        {/* 評估按鈕 */}
        <button
          onClick={handleEstimate}
          disabled={loading}
          className="w-full bg-yellow-500 text-black font-bold py-3 rounded-xl"
        >
          {loading ? '評估中...' : '開始評估'}
        </button>

        {/* 結果 */}
        {result && (

        <div className="mt-4 bg-black/30 rounded-xl p-4 space-y-3">

            {/* 平均日照 */}
            <div>
                <p className="flex items-center">
                    ☀️ 平均日照：
                    <span className="font-bold ml-1">
                        {result.H} kWh/m²/day
                    </span>

                    <InfoTooltip
                        text="每平方公尺每日平均接收的太陽能量，可視為峰值日照時數（PSH）。數值越高代表越適合建置太陽能。"
                    />
                </p>
            </div>

            {/* 適合程度 */}
            <div>
                <p className={`${result.levelColor} flex items-center`}>
                    📊 適合程度：
                    <span className="font-bold ml-1">
                        {result.level}
                    </span>

                    <InfoTooltip
                        text="依據平均日照量判斷案場建置適合程度。通常日照量越高，發電效益越好。"
                    />
                </p>
            </div>

            {/* 日發電 */}
            <div>
                <p className="flex items-center">
                    ⚡ 預估日發電：
                    <span className="font-bold ml-1">
                        {result.daily_energy} kWh/day
                    </span>

                    <InfoTooltip
                        text="依據日照量、裝置容量（kWp）與系統效率（PR）估算之每日平均發電量。"
                    />
                </p>
            </div>

            {/* 年發電 */}
            <div>
                <p className="flex items-center">
                    📅 預估年發電：
                    <span className="font-bold ml-1">
                        {result.year_energy} kWh/year
                    </span>

                    <InfoTooltip
                        text="預估一年總發電量，通常以每日平均發電量乘以 365 天估算。"
                    />
                </p>
            </div>

            {/* 年收益 */}
            <div>
                <p className="flex items-center">
                    💰 預估年收益：
                    <span className="font-bold ml-1">
                        NT$ {Number(result.income).toLocaleString()}
                    </span>

                    <InfoTooltip
                        text="依照輸入之每度電價格（躉購費率）估算年度售電收益。"
                    />
                </p>
            </div>

            {/* 減碳 */}
            <div>
                <p className="flex items-center">
                    🌱 年減碳量：
                    <span className="font-bold ml-1">
                        {Number(result.carbon).toLocaleString()} kgCO₂e/year
                    </span>

                    <InfoTooltip
                        text="依台灣平均電力排碳係數估算，可反映使用太陽能所減少的碳排放量。"
                    />
                </p>
            </div>

        </div>
        )}
      </div>

    </div>
  );
}
