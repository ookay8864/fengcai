// ==========================================================
// 蜂采 儲存層（store.js）
// 現在：LocalStore，資料存在這支手機的瀏覽器（IndexedDB）。
// 之後：寫一個 CloudStore，提供「同樣名稱的函式」，
//       再把 config.js 的 storage 改成 'cloud'，畫面程式都不用改。
// ==========================================================
import { CONFIG } from './config.js';
import { uid } from './ui.js';
import { distM } from './geo.js';

const DB_NAME = 'fengcai-v1';
let dbp = null;
const P = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

// 主要資料庫（旅行、打卡、照片）。不指定版本：已經有的就照原樣打開，不會升級，
// 所以舊版畫面還開著（例如背景裡的主畫面 App）也不會卡住。
function db() {
  if (!dbp) {
    const r = indexedDB.open(DB_NAME);
    r.onupgradeneeded = () => {
      const d = r.result, has = n => d.objectStoreNames.contains(n);
      if (!has('trips')) d.createObjectStore('trips', { keyPath: 'id' });
      if (!has('checkins')) d.createObjectStore('checkins', { keyPath: 'id' }).createIndex('trip', 'tripId');
      if (!has('media')) d.createObjectStore('media', { keyPath: 'id' }).createIndex('checkin', 'checkinId');
    };
    dbp = P(r).then(d => { d.onversionchange = () => { d.close(); dbp = null; }; return d; });
    waitHint(dbp);
  }
  return dbp;
}
// 資料庫 4 秒還打不開（通常是另一個舊版畫面還開著）：顯示提示，不讓畫面一片空白
function waitHint(p) {
  let done = false;
  p.then(() => { done = true; document.getElementById('dbwait')?.remove(); }, () => { done = true; });
  setTimeout(() => {
    if (done || document.getElementById('dbwait')) return;
    const el = document.createElement('div');
    el.id = 'dbwait';
    el.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(43,27,10,.75)';
    el.innerHTML = '<div style="max-width:320px;padding:20px;border-radius:20px;background:#FFF8E7;color:#2B1B0A;font:16px/1.6 system-ui,sans-serif;text-align:center"><b style="font-size:18px">蜂采正在等另一個畫面</b><p style="margin:8px 0 0">可能有舊版的蜂采還開著。請把蜂采完全關掉（從下往上滑、把蜂采往上推掉），也關掉 Safari 裡其他蜂采的分頁，再重新打開。你的紀錄都還在。</p></div>';
    document.body.appendChild(el);
  }, 4000);
}
// 時光膠囊放在自己的資料庫，加功能時不用動到上面那一個
let capp = null;
function capDb() {
  if (!capp) {
    const r = indexedDB.open('fengcai-capsules');
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('capsules')) d.createObjectStore('capsules', { keyPath: 'id' }); };
    capp = P(r).then(d => { d.onversionchange = () => { d.close(); capp = null; }; return d; });
  }
  return capp;
}
async function os(name, mode = 'readonly') { const d = await (name === 'capsules' ? capDb() : db()); return d.transaction(name, mode).objectStore(name); }
const all = async n => P((await os(n)).getAll());
const byIdx = async (n, idx, key) => P((await os(n)).index(idx).getAll(key));
const get = async (n, id) => (id ? P((await os(n)).get(id)) : undefined);
const put = async (n, v) => { await P((await os(n, 'readwrite')).put(v)); return v; };
const del = async (n, id) => P((await os(n, 'readwrite')).delete(id));

const blobToData = b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => rej(f.error); f.readAsDataURL(b); });
const dataToBlob = async d => (d ? (await fetch(d)).blob() : null);

// 膠囊 ⇄ 可以存成檔案的格式（照片、影片、聲音轉成文字）
export async function capsuleToData(c) {
  const media = [];
  for (const m of c.media || []) media.push({ ...m, blob: await blobToData(m.blob), thumb: m.thumb ? await blobToData(m.thumb) : null });
  return { ...c, media };
}
export async function capsuleFromData(c) {
  const media = [];
  for (const m of c.media || []) media.push({ ...m, blob: await dataToBlob(m.blob), thumb: await dataToBlob(m.thumb) });
  return { ...c, media };
}

export const LocalStore = {
  // 旅行包和日常（不含「孩子盒」：大童傳來的打卡放在孩子自己的盒子裡，不跟大人的混在一起）
  async listTrips() { return (await all('trips')).filter(t => !t.kidbox).sort((a, b) => b.createdAt - a.createdAt); },
  async listKidBoxes() { return (await all('trips')).filter(t => t.kidbox); },
  getTrip: id => get('trips', id),
  saveTrip: t => put('trips', t),
  async deleteTrip(id) { for (const c of await this.listCheckins(id)) await this.deleteCheckin(c.id); await del('trips', id); },

  async listCheckins(tripId) { return (await byIdx('checkins', 'trip', tripId)).sort((a, b) => a.ts - b.ts); },
  getCheckin: id => get('checkins', id),
  saveCheckin: c => put('checkins', c),
  async deleteCheckin(id) { for (const m of await this.listMedia(id)) await del('media', m.id); await del('checkins', id); },

  async listMedia(checkinId) { return (await byIdx('media', 'checkin', checkinId)).sort((a, b) => a.ts - b.ts); },
  getMedia: id => get('media', id),
  saveMedia: m => put('media', m),
  // 改已經存好的檔案（精選、焦點…）：iPhone 把從資料庫讀出來的照片原樣存回去，照片會壞掉變成「?」，
  // 所以先把照片和縮圖複製成新的一份再存
  async updateMedia(m) {
    const copy = async b => { if (!(b instanceof Blob)) return b; try { return new Blob([await b.arrayBuffer()], { type: b.type }); } catch (e) { return b; } };
    const x = { ...m, blob: await copy(m.blob), thumb: await copy(m.thumb) };
    await put('media', x);
    m.blob = x.blob; m.thumb = x.thumb;
  },
  deleteMedia: id => del('media', id),

  // 時光膠囊：內容（照片、影片、聲音）直接放在膠囊裡
  async listCapsules() { return (await all('capsules')).sort((a, b) => a.openAt - b.openAt); },
  getCapsule: id => get('capsules', id),
  saveCapsule: c => put('capsules', c),
  deleteCapsule: id => del('capsules', id),

  // 備份：匯出成一個檔案。part='all' 完整備份；part='new' 只放上次備份之後新增的照片、影片、聲音
  // 檔案格式（.fcbak）：第一行「FCBAK1 <說明的位元組數>」，接著是一段文字說明（旅程、打卡、設定，以及每個檔案在哪裡），
  // 後面直接接上照片、影片、聲音的原始資料。不把影片轉成文字，所以 iPhone 不會因為記憶體不夠而當掉。
  async exportAll(part = 'all') {
    const done = backedIds(), parts = [], ids = [];
    let off = 0;
    const addBlob = b => { if (!b) return null; const ref = [off, b.size, b.type || '']; parts.push(b); off += b.size; return ref; };
    const media = [];
    for (const m of await all('media')) {
      if (part === 'new' && done.has(m.id)) continue;
      const { blob, thumb, ...meta } = m;
      media.push({ ...meta, _b: addBlob(blob), _t: addBlob(thumb) }); ids.push(m.id);
    }
    const capsules = [];
    for (const c of await all('capsules')) capsules.push({ ...c, media: (c.media || []).map(({ blob, thumb, ...meta }) => ({ ...meta, _b: addBlob(blob), _t: addBlob(thumb) })) });
    const head = { app: 'fengcai', v: 4, part, at: Date.now(), trips: (await all('trips')).map(({ pcCache, ...t }) => t), checkins: await all('checkins'), media, capsules, settings: exportSettings() };
    const hb = new TextEncoder().encode(JSON.stringify(head));
    return { blob: new Blob([`FCBAK1 ${hb.length}\n`, hb, ...parts], { type: 'application/octet-stream' }), ids };
  },
  async importAll(file) {
    const first = await file.slice(0, 32).text();
    let data, base = 0;
    if (first.startsWith('FCKID1 ')) throw new Error('這是孩子傳來的打卡，請到首頁按「收孩子的打卡」');
    if (first.startsWith('FCBAK1 ')) {
      const nl = first.indexOf('\n'), hlen = +first.slice(7, nl), hstart = new TextEncoder().encode(first.slice(0, nl + 1)).length;
      data = JSON.parse(await file.slice(hstart, hstart + hlen).text());
      base = hstart + hlen;
    } else data = JSON.parse(await file.text()); // 舊的 .json 備份
    if (data.app !== 'fengcai') throw new Error('這不是蜂采的備份檔');
    // iPhone Safari 不能把「檔案的一段」直接存進資料庫（會存失敗或之後變成問號），
    // 所以每個照片、影片、聲音都先完整讀出來，再變成新的資料存進去
    const take = async ref => (ref ? new Blob([await file.slice(base + ref[0], base + ref[0] + ref[1]).arrayBuffer()], { type: ref[2] || '' }) : null);
    const fromRef = async (x, k) => (x['_' + k[0]] !== undefined ? await take(x['_' + k[0]]) : await dataToBlob(x[k]));
    // 設定先還原（高德 Key、孩子），就算後面有東西失敗也不會少了設定
    if (data.settings) importSettings(data.settings);
    for (const t of data.trips || []) await put('trips', t);
    for (const c of data.checkins || []) await put('checkins', c);
    let bad = 0, firstErr = '';
    const okIds = [];
    for (const m of data.media || []) {
      try { const { _b, _t, ...meta } = m; await put('media', { ...meta, blob: await fromRef(m, 'blob'), thumb: await fromRef(m, 'thumb') }); okIds.push(m.id); }
      catch (e) { bad++; firstErr = firstErr || e.message; }
    }
    for (const c of data.capsules || []) {
      try {
        const media = [];
        for (const m of c.media || []) { const { _b, _t, ...meta } = m; media.push({ ...meta, blob: await fromRef(m, 'blob'), thumb: await fromRef(m, 'thumb') }); }
        await put('capsules', { ...c, media });
      } catch (e) { bad++; firstErr = firstErr || e.message; }
    }
    // 還原進來的東西都算已經備份過
    markBacked(okIds, false, data.at);
    return { trips: (data.trips || []).length, checkins: (data.checkins || []).length, media: okIds.length, bad, err: firstErr };
  },
  // 上次備份之後新增了多少
  async backupStatus() {
    const done = backedIds(), last = +(localStorage.getItem('fc-bk-last') || 0);
    const n = { photo: 0, video: 0, audio: 0 };
    for (const m of await all('media')) if (!done.has(m.id)) n[m.kind] = (n[m.kind] || 0) + 1;
    const cs = (await all('checkins')).filter(c => (c.ts || 0) > last).length;
    return { last, full: +(localStorage.getItem('fc-bk-full') || 0), n, checkins: cs, any: n.photo + n.video + n.audio + cs > 0 };
  },
  async markBackup(ids, full) { markBacked(full ? (await all('media')).map(m => m.id) : ids, full, Date.now()); },
  async clearAll() { for (const n of ['media', 'checkins', 'trips', 'capsules']) await P((await os(n, 'readwrite')).clear()); }
};

// ---------- 備份記錄：哪些照片、影片、聲音已經備份過 ----------
function backedIds() { try { return new Set(JSON.parse(localStorage.getItem('fc-bk-ids') || '[]')); } catch (e) { return new Set(); } }
function markBacked(ids, full, at) {
  try {
    const set = full ? new Set(ids) : backedIds(); ids.forEach(i => set.add(i));
    localStorage.setItem('fc-bk-ids', JSON.stringify([...set]));
    localStorage.setItem('fc-bk-last', String(at || Date.now()));
    if (full) localStorage.setItem('fc-bk-full', String(at || Date.now()));
  } catch (e) {}
}
// 設定（孩子、地圖 Key、樣式…）一起備份；地名快取和備份記錄不用
function exportSettings() {
  const o = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('fc-') && !k.startsWith('fc-rg-') && !k.startsWith('fc-bk-') && k !== 'fc-active') o[k] = localStorage.getItem(k); } } catch (e) {}
  return o;
}
function importSettings(o) {
  try {
    Object.entries(o).forEach(([k, v]) => {
      if (k === 'fc-kids') {
        // 孩子：用代號合併，這支手機已經有的以這支手機為準
        const cur = JSON.parse(localStorage.getItem('fc-kids') || '[]'), add = JSON.parse(v || '[]');
        add.forEach(x => { if (!cur.find(y => y.id === x.id)) cur.push(x); });
        localStorage.setItem('fc-kids', JSON.stringify(cur));
      } else if (localStorage.getItem(k) == null) localStorage.setItem(k, v);
    });
  } catch (e) {}
}

// 預留：雲端儲存（尚未實作）。之後照 LocalStore 的函式名稱補上即可。
const CloudStore = null;

export const store = CONFIG.storage === 'cloud' && CloudStore ? CloudStore : LocalStore;

// 請瀏覽器盡量不要自動清除資料
export async function askPersist() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}

// ---------- 大人和孩子的打卡合成一站 ----------
// 一筆打卡可能同時有孩子的章（kid）和大人的記錄（adult）；舊資料用 by 判斷
export const isKid = c => (c.kid != null ? c.kid : c.by === 'kid');
export const isAdult = c => (c.adult != null ? c.adult : c.by !== 'kid');
export const MERGE = { minutes: 30, meters: 60 };
// 找出可以合併的那一站：30 分鐘內、同一個地點名稱或 60 公尺內、而且還沒有「這個人」的記錄
// 多個孩子：同一站可以有好幾個孩子，只要「這個孩子」還沒蓋過
const kidFree = (c, kidId) => (!isKid(c) ? true : kidId ? Array.isArray(c.kidIds) && c.kidIds.length > 0 && !c.kidIds.includes(kidId) : false);
export async function findMergeTarget(tripId, place, pos, who, kidId) {
  const now = Date.now();
  const cs = await store.listCheckins(tripId);
  return cs.filter(c => Math.abs(now - c.ts) < MERGE.minutes * 60e3
    && (who === 'kid' ? kidFree(c, kidId) : !isAdult(c))
    && (c.placeName === place.name || (pos && pos.lat != null && c.lat != null && distM(pos, c) < MERGE.meters)))
    .sort((a, b) => b.ts - a.ts)[0] || null;
}

// ---------- 目前模式：日常／旅行中 ----------
// 日常：打卡放進「當月日常」（每個月一個，id 是 daily-年-月）
// 旅行中：打卡放進目前的旅行包；按「結束旅行」就回到日常
export const getActiveId = () => { try { return localStorage.getItem('fc-active'); } catch (e) { return null; } };
export const setActiveId = id => { try { localStorage.setItem('fc-active', id); } catch (e) {} };
export function getMode() {
  try {
    const m = localStorage.getItem('fc-mode');
    if (m) return m;
    return getActiveId() ? 'trip' : 'daily'; // 舊資料：原本有目前旅程就維持「旅行中」
  } catch (e) { return 'daily'; }
}
export const setMode = m => { try { localStorage.setItem('fc-mode', m); } catch (e) {} };
export const isDaily = t => !!(t && t.daily);
// 孩子盒：每個孩子一個，放大童傳回來的打卡（爸媽的畫面看不到，只在「孩子」分頁）
export const kidBoxId = kidId => `kidbox-${kidId || 'kid'}`;
export async function ensureKidBox(kid) {
  const id = kidBoxId(kid && kid.id);
  let t = await store.getTrip(id);
  if (!t) { t = { id, kidbox: true, kidId: kid ? kid.id : null, name: `${kid ? kid.name : '孩子'}的打卡`, createdAt: Date.now() }; await store.saveTrip(t); }
  return t;
}
const pad = n => String(n).padStart(2, '0');
export const dailyId = (d = new Date()) => `daily-${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export async function ensureDaily(d = new Date()) {
  const id = dailyId(d);
  let t = await store.getTrip(id);
  if (!t) {
    t = { id, daily: true, name: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月日常`, createdAt: new Date(d.getFullYear(), d.getMonth(), 1).getTime() };
    await store.saveTrip(t);
  }
  return t;
}
// 打錯到旅行包：把一站（或整包）移到那天所屬月份的日常
export async function moveToDaily(c) {
  const t = await ensureDaily(new Date(c.ts));
  c.tripId = t.id; await store.saveCheckin(c);
  return t;
}
// 打卡要放進哪一包
export async function ensureActiveTrip() {
  if (getMode() === 'trip') {
    const t = await store.getTrip(getActiveId());
    if (t && !t.daily) return t;
  }
  return ensureDaily();
}
export async function startTrip(name, extra = {}) {
  const t = { id: uid(), name, createdAt: Date.now(), ...extra };
  await store.saveTrip(t);
  setActiveId(t.id); setMode('trip');
  return t;
}
export function resumeTrip(id) { setActiveId(id); setMode('trip'); }
export function endTrip() { setMode('daily'); }
// 把日常裡的幾天搬進一個新的旅行包
export async function moveDaysToTrip(fromId, dayKeys, name, dayKeyOf) {
  const t = { id: uid(), name, createdAt: Date.now() };
  await store.saveTrip(t);
  for (const c of await store.listCheckins(fromId)) if (dayKeys.includes(dayKeyOf(c.ts))) { c.tripId = t.id; await store.saveCheckin(c); }
  return t;
}
