// ==========================================================
// 蜂采 定位與地點層（geo.js）
// - 座標一律以國際標準（WGS-84）儲存
// - 查附近地點時才轉成中國地圖用的座標（GCJ-02）
// - 之後要支援國外或換地圖服務，改 nearby() 裡的服務即可
// ==========================================================
import { CONFIG, getSetting } from './config.js';

export function demoOff() {
  setSettingSafe('demo', '');
  const u = new URL(location.href);
  if (u.searchParams.has('demo')) { u.searchParams.delete('demo'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); }
}
function setSettingSafe(k, v) { try { if (v) localStorage.setItem('fc-' + k, v); else localStorage.removeItem('fc-' + k); } catch (e) {} }
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
// 高德座標（GCJ-02）換回 GPS 座標（WGS-84），誤差約 1 公尺
export function gcj2wgs(lng, lat) {
  let wl = lng, wa = lat;
  for (let i = 0; i < 3; i++) { const [gl, ga] = wgs2gcj(wl, wa); wl -= gl - lng; wa -= ga - lat; }
  return [wl, wa];
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

// 地圖用：看一下現在在哪（一律真實定位、可用 1 分鐘內的舊定位）
export function peekPosition() {
  // 藍點一律用真正的定位（模擬模式只影響打卡）
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
  if (!inMainland(lat, lng) || !getSetting('amapKey')) return osmNearby(lat, lng);
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

// ---------- 在不在中國大陸？大陸用高德；台灣、港澳、國外用免費的開放地圖（OpenStreetMap） ----------
const MAINLAND = [[123.5,53.6],[127.5,50],[130.6,48.9],[134.8,48.3],[131.3,42.9],[129,42.4],[126,41],[124.2,39.8],[122.5,37],[122,31],[122.2,30],[120.5,27],[119.5,25.5],[117,23.4],[114.6,22.6],[114.05,22.505],[113.85,22.48],[113.5,22],[111,21.3],[111.2,19.5],[110.2,18],[108.5,18.3],[108,21.5],[106.7,21.9],[104,22.8],[101.8,21.1],[100,21.5],[98,24],[97.5,25.5],[98.7,27.5],[97,28.5],[92,27.8],[89,27.5],[85,28.3],[81,30],[78.7,31.5],[79.5,35.5],[74.5,37],[73.5,39.5],[75.5,40.5],[80.2,42],[80.5,45],[82.5,45.5],[85.5,47],[87.5,49.2],[90.5,47.8],[96,43],[105,41.6],[112,43.6],[116,46],[118,47.9],[116,49.8],[119.5,53.3]];
export function inMainland(lat, lng) {
  if (lat == null || lng == null) return true;
  if (lng > 113.52 && lng < 113.62 && lat > 22.09 && lat < 22.22) return false; // 澳門
  let inside = false;
  for (let i = 0, j = MAINLAND.length - 1; i < MAINLAND.length; j = i++) {
    const [xi, yi] = MAINLAND[i], [xj, yj] = MAINLAND[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 這個位置用哪一種地圖：amap 高德、osm 開放地圖、none 插畫
export const mapProvider = (lat, lng) => (inMainland(lat, lng) && getSetting('amapKey') ? 'amap' : 'osm');

// 開放地圖：用名字找地點（Photon，免費、不用金鑰）
const OSM_TYPE = k => {
  const [key, val] = k;
  if (key === 'amenity' && /restaurant|cafe|fast_food|food_court|ice_cream|bar|pub/.test(val)) return '餐飲;' + val;
  if (key === 'shop') return '購物;' + val;
  if (key === 'tourism' && /hotel|hostel|guest_house|motel|apartment/.test(val)) return '住宿;' + val;
  if (key === 'tourism' && /museum|gallery/.test(val)) return '科教文化;博物館';
  if (key === 'amenity' && /place_of_worship|library|theatre|arts_centre/.test(val)) return '科教文化;' + val;
  if (key === 'leisure' && /park|garden|nature_reserve/.test(val)) return '風景;公園';
  if (key === 'tourism' && /zoo|theme_park|aquarium/.test(val)) return '遊樂;' + val;
  if (key === 'leisure') return '體育休閒;' + val;
  if (key === 'natural' || key === 'historic' || key === 'tourism') return '風景;' + val;
  return val || '';
};
async function osmSearch(kw, near) {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', kw); u.searchParams.set('limit', '12');
  if (near && near.lat != null) { u.searchParams.set('lat', near.lat); u.searchParams.set('lon', near.lng); }
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
  try {
    const j = await (await fetch(u, { signal: ctl.signal })).json();
    return (j.features || []).map(f => {
      const p = f.properties || {}, [lng, lat] = f.geometry.coordinates;
      return { id: `osm-${p.osm_type || ''}${p.osm_id || ''}`, name: p.name || p.street || '', type: OSM_TYPE([p.osm_key, p.osm_value]), address: [p.city || p.county, p.district, p.street, p.housenumber].filter(Boolean).join(' '), lat, lng, dist: near && near.lat != null ? Math.round(distM(near, { lat, lng })) : null };
    }).filter(p => p.name);
  } catch (e) { return []; } finally { clearTimeout(tm); }
}
// 開放地圖：附近有名字的地點（先用 Photon，失敗再用 Overpass；都免費、不用金鑰）
const SKIP = /^(place|highway|boundary|railway|route|landuse|building|power|office)$/, SKIPV = /luggage_locker|atm|parking|toilets|bench|waste|vending|bicycle_parking|post_box|telephone|charging|bank|clinic|doctors|dentist|pharmacy/;
async function osmNearby(lat, lng) {
  const u = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=40&radius=${CONFIG.nearbyRadius / 1000}`;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 7000);
  try {
    const j = await (await fetch(u, { signal: ctl.signal })).json();
    const seen = new Set();
    const list = (j.features || []).map(f => {
      const p = f.properties || {}, [lo, la] = f.geometry.coordinates;
      return { id: `osm-${p.osm_type || ''}${p.osm_id || ''}`, name: p.name || '', key: p.osm_key, val: p.osm_value, type: OSM_TYPE([p.osm_key, p.osm_value]), lat: la, lng: lo, dist: Math.round(distM({ lat, lng }, { lat: la, lng: lo })) };
    }).filter(p => p.name && !SKIP.test(p.key || '') && !SKIPV.test(p.val || '') && !seen.has(p.name) && seen.add(p.name)).sort((a, b) => a.dist - b.dist).slice(0, 20);
    if (list.length) return list;
  } catch (e) {} finally { clearTimeout(tm); }
  return osmNearbyOverpass(lat, lng);
}
async function osmNearbyOverpass(lat, lng) {
  const R = CONFIG.nearbyRadius, sel = '["name"]["amenity"~"restaurant|cafe|fast_food|ice_cream|library|place_of_worship|theatre|arts_centre"]';
  const q = `[out:json][timeout:8];(nwr(around:${R},${lat},${lng})${sel};nwr(around:${R},${lat},${lng})["name"]["tourism"];nwr(around:${R},${lat},${lng})["name"]["leisure"~"park|garden|playground|sports_centre|stadium"];nwr(around:${R},${lat},${lng})["name"]["shop"~"mall|department_store|supermarket|bakery|books|toys|gift"];nwr(around:${R},${lat},${lng})["name"]["historic"];);out center 60;`;
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
  try {
    const j = await (await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal })).json();
    const seen = new Set();
    return (j.elements || []).map(e => {
      const t = e.tags || {}, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
      const key = ['tourism', 'amenity', 'leisure', 'shop', 'historic'].find(k => t[k]);
      return { id: `osm-${e.type}${e.id}`, name: t['name:zh-Hant'] || t['name:zh'] || t.name, type: OSM_TYPE([key, t[key]]), lat: la, lng: lo, dist: la != null ? Math.round(distM({ lat, lng }, { lat: la, lng: lo })) : 0 };
    }).filter(p => p.name && !seen.has(p.name) && seen.add(p.name)).sort((a, b) => a.dist - b.dist).slice(0, 20);
  } catch (e) { return []; } finally { clearTimeout(tm); }
}

// ---------- 這個位置在哪個城市／區（地圖拉遠時，蜂蜜罐上的名字） ----------
// wide＝範圍很大時用城市，否則用區；結果存在手機裡，同一帶不用再查
const trimRegion = s => String(s || '').replace(/(特別行政區|特别行政区|自治州|地區|地区|市|區|区|縣|县)$/, '');
export async function regionName(lat, lng, wide = false) {
  const key = `fc-rg-${wide ? 'c' : 'd'}-${lat.toFixed(2)},${lng.toFixed(2)}`;
  try { const hit = localStorage.getItem(key); if (hit) return hit; } catch (e) {}
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 7000);
  try {
    const j = await (await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`, { signal: ctl.signal })).json();
    const p = (j.features && j.features[0] && j.features[0].properties) || {};
    const name = trimRegion(wide ? p.city || p.county || p.state || p.district : p.district || p.city || p.county || p.state);
    if (name) { try { localStorage.setItem(key, name); } catch (e) {} }
    return name || '';
  } catch (e) { return ''; } finally { clearTimeout(tm); }
}

// ---------- 用名字找地點（打卡時輸入兩個字以上） ----------
// 先找附近 50 公里內，找不到再全國找；回傳的 lat/lng 是 GPS 座標
export async function searchPlaces(kw, near) {
  kw = (kw || '').trim();
  if (kw.length < 2) return [];
  if (isDemo()) {
    const out = [];
    DEMO.forEach(s => s.pois.forEach(([name, type]) => { if (name.includes(kw)) out.push({ id: 'demo-' + name, name, type, address: '雲南大理（模擬）', lat: s.lat, lng: s.lng, dist: near && near.lat != null ? Math.round(distM(near, s)) : null }); }));
    return out;
  }
  if ((near && near.lat != null && !inMainland(near.lat, near.lng)) || !getSetting('amapKey')) return osmSearch(kw, near);
  const AM = await loadAMap();
  if (!AM) return [];
  const conv = p => {
    const loc = p.location; if (!loc) return null;
    const [lng, lat] = gcj2wgs(loc.lng ?? loc.getLng(), loc.lat ?? loc.getLat());
    return { id: p.id || '', name: p.name || '', type: p.type || '', address: [p.cityname, p.adname, typeof p.address === 'string' ? p.address : ''].filter(Boolean).join(''), lat, lng, dist: near && near.lat != null ? Math.round(distM(near, { lat, lng })) : null };
  };
  const run = (fn) => new Promise(res => {
    const tm = setTimeout(() => res([]), 8000);
    fn((status, r) => { clearTimeout(tm); res(status === 'complete' && r?.poiList?.pois ? r.poiList.pois.map(conv).filter(x => x && x.name) : []); });
  });
  const ps = new AM.PlaceSearch({ pageSize: 12, pageIndex: 1, extensions: 'base' });
  let list = [];
  if (near && near.lat != null) {
    const [gl, ga] = wgs2gcj(near.lng, near.lat);
    list = await run(cb => ps.searchNearBy(kw, [gl, ga], 50000, cb));
  }
  if (!list.length) list = await run(cb => ps.search(kw, cb));
  return list;
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
