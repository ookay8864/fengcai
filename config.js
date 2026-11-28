// ==========================================================
// 蜂采 設定檔（config.js）
// 之後換成雲端儲存、換地圖服務、調整上限，主要改這裡。
// ==========================================================
export const CONFIG = {
  version: '0.25.2',
  storage: 'local',      // 'local'＝存在手機本機；之後做好雲端改成 'cloud'
  map: 'amap',           // 地點搜尋服務：目前是高德；國外版之後可加其他服務
  nearbyRadius: 600,     // 搜尋附近地點的範圍（公尺）
  photoMax: 1600,        // 照片壓縮後的最長邊（像素），原圖仍留在 iPhone 相簿
  maxVideoMB: 150,       // 單支影片上限
  maxVisualPerPlace: 9,  // 每個地點最多幾張照片／影片
  kidRecordSec: 10,      // 兒童錄音秒數
  adultRecordSec: 30,    // 大人錄音秒數
  // 高德地圖的底圖樣式：正常版、可愛版（可換成 amap://styles/graffiti 塗鴉風、fresh 草色青等）
  // 台灣、港澳、國外用的免費開放地圖（OpenStreetMap）；之後要換成 Google 地圖也從這裡改
  osm: {
    js: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    css: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    // 三種樣式都用 OpenStreetMap 標準圖磚（免費、不用金鑰），可愛和夜空用顏色濾鏡調（app.css 的 .osm-cute / .osm-night）
    tiles: {
      normal: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      cute: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      night: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    },
    attribution: '© OpenStreetMap'
  },
  mapStyles: { normal: 'amap://styles/normal', cute: 'amap://styles/macaron', night: 'amap://styles/darkblue' },
  kidGardenGoal: 5,      // 兒童花園：每幾個章算「開滿一片」
  // 一鍵短片
  video: {
    width: 1080, height: 1920, fps: 30,
    introSec: 2.8,       // 片頭
    overviewSec: 1.6,    // 整張地圖
    daySec: 1.8,         // 換天的過場（第 N 天）
    flySec: 1.3,         // 蜜蜂飛到下一站
    photoSec: 1.9,       // 每張直拍照片（焦點拉遠）
    panSec: 2.8,         // 橫拍照片平移掃過
    cardSec: 2.4,        // 完整照片卡
    stackSec: 2.8,       // 兩張橫拍上下拼貼
    clipSec: 4,          // 影片片段最長秒數
    passSec: 1,          // 沒有照片的站
    outroSec: 4.6,       // 片尾（明信片）
    tagline: '蜂采 · 飛到哪，甜到哪'
  }
};

// 使用者在「設定」頁填的值（例如高德金鑰）存在這台手機的瀏覽器裡
export function getSetting(k, d = '') {
  try { const v = localStorage.getItem('fc-' + k); return v == null ? d : v; } catch (e) { return d; }
}
export function setSetting(k, v) {
  try {
    if (v === '' || v == null) localStorage.removeItem('fc-' + k);
    else localStorage.setItem('fc-' + k, String(v));
  } catch (e) { /* 無痕模式等情況可能無法儲存 */ }
}
