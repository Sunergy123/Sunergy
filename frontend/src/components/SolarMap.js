import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap
} from 'react-leaflet';

import { useEffect, useState } from 'react';

import L from 'leaflet';

import 'leaflet/dist/leaflet.css';


// 修正 Marker 圖示問題
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',

  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',

  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


// 點地圖
function LocationMarker({
  setLat,
  setLon,
  position,
  setPosition,
  reverseGeocode
}) {

  useMapEvents({

    click(e) {

      const lat = e.latlng.lat;
      const lon = e.latlng.lng;

      setLat(lat.toFixed(7));
      setLon(lon.toFixed(7));

      setPosition([lat, lon]);

      // 反向地理編碼
      reverseGeocode(lat, lon);
    },
  });

  return position ? (
    <Marker position={position} />
  ) : null;
}


// 自動飛到位置
function FlyToLocation({ position }) {

  const map = useMap();

  useEffect(() => {

    if (position) {

      map.flyTo(position, 12, {
        duration: 2
      });

    }

  }, [position, map]);

  return null;
}


export default function SolarMap({
  lat,
  lon,
  setLat,
  setLon,
  setAddress,
  reverseGeocode
}) {

  const [position, setPosition] = useState(null);

  // 搜尋後同步 Marker
  useEffect(() => {

    if (lat && lon) {

      setPosition([
        parseFloat(lat),
        parseFloat(lon)
      ]);

    }

  }, [lat, lon]);

  return (

    <MapContainer
      center={[23.7, 121]}
      zoom={7}
      style={{
        height: '300px',
        width: '100%'
      }}
      className="rounded-xl overflow-hidden z-0"
    >

      {/* 地圖圖層 */}
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Marker */}
      <LocationMarker
        setLat={setLat}
        setLon={setLon}
        position={position}
        setPosition={setPosition}
        reverseGeocode={reverseGeocode}
      />

      {/* 飛到搜尋位置 */}
      <FlyToLocation position={position} />

    </MapContainer>
  );
}