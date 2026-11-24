// ==========================================================
// 蜂采 定位與地點層（geo.js）
// - 座標一律以國際標準（WGS-84）儲存
// - 查附近地點時才轉成中國地圖用的座標（GCJ-02）
// - 之後要支援國外或換地圖服務，改 nearby() 裡的服務即可
// ==========================================================
import { CONFIG, getSetting } from './config.js';

export const isDemo = () => new URLSearchParams(location.search).has('demo') || getSetting('demo') === '1';

// ---------- 地點類型 → 兒童徽章 ----------
export const BADGES = {
  food: { name: '美食章', icon: 'food' },
  nature: { name: '山水章', icon: 'mountain' },
  culture: { name: '文化章', icon: 'museum' },
  shop: { name: '逛街章', icon: 'shop' },
  play: { name: '玩樂章', icon: 'park' },
  stay: { name: '休息章', icon: 'hotel' },
  explore: { name: '探險章', icon: 'pin' }
};
export function badgeOf(type = '') {
  if (/餐饮|餐飲|美食|咖啡|甜品|小吃|餐厅|餐廳/.test(type)) return 'food';
  if (/动物园|動物園|植物园|植物園|游乐|遊樂|乐园|樂園|体育休闲|體育休閒/.test(type)) return 'play';
  if (/风景|風景|公园|公園|海滩|湖|山/.test(type)) return 'nature';
  if (/科教文化|博物|美术|美術|展览|展覽|寺|庙|廟|古镇|古鎮/.test(type)) return 'culture';
  if (/购物|購物|商场|商場|市场|市場|商业街|商業街/.test(type)) return 'shop';
  if (/住宿|酒店|宾馆|賓館|民宿|旅馆|旅館/.test(type)) return 'stay';
  return 'explore';
}
export const shortType = (type = '') => type.split(';').filter(Boolean).pop() || '';

// ---------- 座標轉換 WGS-84 → GCJ-02 ----------
const A = 6378245.0, EE = 0.00669342162296594323;
const outOfChina = (lng, lat) => !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return r;
}
function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return r;
}
export function wgs2gcj(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];
  let dLat = tLat(lng - 105, lat - 35), dLng = tLng(lng - 105, lat - 35);
  const rad = lat / 180 * Math.PI;
  let m = Math.sin(rad); m = 1 - EE * m * m;
  const s = Math.sqrt(m);
  dLat = dLat * 180 / ((A * (1 - EE)) / (m * s) * Math.PI);
  dLng = dLng * 180 / (A / s * Math.cos(rad) * Math.PI);
  return [lng + dLng, lat + dLat];
}
export function distM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- 模擬模式：雲南示範地點（座標為大約位置） ----------
const DEMO = [
  { lat: 25.6936, lng: 100.1637, pois: [['大理古城南門（模擬）', '风景名胜;城门'], ['喜洲粑粑小店（模擬）', '餐饮服务;小吃'], ['古城手作市集（模擬）', '购物服务;商业街']] },
  { lat: 25.7113, lng: 100.1477, pois: [['崇聖寺三塔（模擬）', '风景名胜;寺庙'], ['三塔素齋館（模擬）', '餐饮服务;素食']] },
  { lat: 25.8552, lng: 100.1302, pois: [['喜洲古鎮（模擬）', '风景名胜;古镇'], ['稻田邊咖啡（模擬）', '餐饮服务;咖啡厅'], ['扎染體驗坊（模擬）', '科教文化服务;文化宫']] },
  { lat: 25.9093, lng: 100.1950, pois: [['雙廊古鎮（模擬）', '风景名胜;古镇'], ['洱海邊民宿（模擬）', '住宿服务;民宿']] },
  { lat: 26.8722, lng: 100.2350, pois: [['麗江古城四方街（模擬）', '风景名胜;风景名胜'], ['納西小吃店（模擬）', '餐饮服务;小吃'], ['東巴文化博物館（模擬）', '科教文化服务;博物馆']] },
  { lat: 26.8340, lng: 100.2310, pois: [['麗江動物樂園（模擬）', '体育休闲服务;游乐场']] }
];
function demoPos() {
  let i = parseInt(getSetting('demoI', '0'), 10) || 0;
  try { localStorage.setItem('fc-demoI', String((i + 1) % DEMO.length)); } catch (e) {}
  const p = DEMO[i % DEMO.length];
  return new Promise(res => setTimeout(() => res({ lat: p.lat + (Math.random() - .5) * .0006, lng: p.lng + (Math.random() - .5) * .0006, acc: 8 + Math.round(Math.random() * 12) }), 700));
}
function demoNearby(lat, lng) {
  const spot = DEMO.reduce((best, s) => (distM(s, { lat, lng }) < distM(best, { lat, lng }) ? s : best), DEMO[0]);
  return spot.pois.map(([name, type], i) => ({ id: 'demo-' + name, name, type, dist: 15 + i * 60 + Math.round(Math.random() * 30) }));
}

// 地圖用：看一下現在在哪（不會換模擬地點、可用 1 分鐘內的舊定位）
export function peekPosition() {
  if (isDemo()) { const i = parseInt(getSetting('demoI', '0'), 10) || 0, p = DEMO[(i + DEMO.length - 1) % DEMO.length]; return Promise.resolve({ lat: p.lat, lng: p.lng, acc: 10 }); }
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('no geo'));
    navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }), rej, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  });
}

// ---------- 取得目前位置 ----------
export function getPosition() {
  if (isDemo()) return demoPos();
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('這個瀏覽器不支援定位'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      e => rej(new Error(
        e.code === 1 ? '定位權限沒有打開：請到 iPhone「設定 → 隱私權與安全性 → 定位服務 → Safari 網站」選「使用 App 期間」，再重新整理頁面。'
          : e.code === 3 ? '定位逾時，請走到比較空曠的地方再試一次。'
            : '暫時無法定位，請稍後再試。')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

// ---------- 高德地圖：查附近地點 ----------
let amapP = null;
export function loadAMap() {
  const key = getSetting('amapKey'), sec = getSetting('amapSec');
  if (!key) return Promise.resolve(null);
  if (!amapP) {
    amapP = new Promise((res, rej) => {
      if (sec) window._AMapSecurityConfig = { securityJsCode: sec };
      const s = document.createElement('script');
      s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.PlaceSearch`;
      s.onload = () => (window.AMap ? res(window.AMap) : rej(new Error('高德地圖載入失敗')));
      s.onerror = () => { amapP = null; rej(new Error('高德地圖載入失敗')); };
      document.head.appendChild(s);
    });
  }
  return amapP;
}
const TYPES = '餐饮服务|风景名胜|科教文化服务|购物服务|体育休闲服务|住宿服务|公共设施|地名地址信息';

export async function nearby(lat, lng) {
  if (lat == null) return [];
  if (isDemo()) return demoNearby(lat, lng);
  const AM = await loadAMap();
  if (!AM) return [];
  const [glng, glat] = wgs2gcj(lng, lat);
  return new Promise(res => {
    const timer = setTimeout(() => res([]), 9000);
    const ps = new AM.PlaceSearch({ pageSize: 15, pageIndex: 1, type: TYPES });
    ps.searchNearBy('', [glng, glat], CONFIG.nearbyRadius, (status, r) => {
      clearTimeout(timer);
      if (status !== 'complete' || !r?.poiList?.pois) return res([]);
      res(r.poiList.pois.map(p => ({ id: p.id || '', name: p.name || '', type: p.type || '', dist: Math.round(+p.distance || 0) })).filter(p => p.name));
    });
  });
}

// ---------- 高德地圖：檢查設定哪裡有問題 ----------
const AMAP_ERR = {
  INVALID_USER_KEY: 'Key 不正確：請到高德開放平台複製 Key 再貼一次（注意前後不要有空白）。',
  INVALID_USER_SCODE: '安全密鑰不正確或沒有填：高德後台 Key 旁邊的「安全密鑰」也要貼到這裡。',
  USERKEY_PLAT_NOMATCH: 'Key 的類型不對：要建立「Web 端（JS API）」的 Key，不是「Web 服務」或 App 的 Key。',
  INVALID_USER_DOMAIN: '網域沒有加進白名單：到高德後台這個 Key 的設定，把 ookay8864.github.io 加進「域名白名單」，或先清空白名單。',
  INVALID_USER_IP: 'IP 白名單限制：到高德後台把這個 Key 的 IP 白名單清空。',
  DAILY_QUERY_OVER_LIMIT: '今天的免費用量用完了，明天會自動恢復。',
  USER_DAILY_QUERY_OVER_LIMIT: '今天的免費用量用完了，明天會自動恢復。',
  SERVICE_NOT_AVAILABLE: '高德暫時無法使用，請稍後再試。'
};
export const amapErrText = code => AMAP_ERR[code] || `高德回覆：${code}`;
export async function testAMap() {
  if (!getSetting('amapKey')) return { ok: false, msg: '還沒有填 Key。' };
  let AM;
  try { AM = await loadAMap(); } catch (e) { return { ok: false, msg: '高德地圖的程式載入失敗：請確認網路正常（在中國大陸以外可能比較慢），再試一次。' }; }
  if (!AM || !AM.PlaceSearch) return { ok: false, msg: '高德地圖的程式載入失敗，請重新整理再試。' };
  return new Promise(res => {
    const tm = setTimeout(() => res({ ok: false, msg: '高德沒有回應：可能是 Key 或安全密鑰不對，或網路太慢。' }), 9000);
    new AM.PlaceSearch({ pageSize: 1 }).searchNearBy('', [114.0579, 22.5431], 500, (status, r) => {
      clearTimeout(tm);
      if (status === 'complete' || status === 'no_data') res({ ok: true, msg: '高德地圖連線成功！地圖分頁會顯示真實地圖和你的位置。' });
      else res({ ok: false, code: String(r), msg: amapErrText(String(r)) });
    });
  });
}

// 在高德地圖 App／網頁中開啟某個點
export function amapLink(lat, lng, name) {
  const [x, y] = wgs2gcj(lng, lat);
  return `https://uri.amap.com/marker?position=${x.toFixed(6)},${y.toFixed(6)}&name=${encodeURIComponent(name)}&coordinate=gaode&callnative=1`;
}
