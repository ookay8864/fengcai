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

function db() {
  if (!dbp) {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('trips', { keyPath: 'id' });
      d.createObjectStore('checkins', { keyPath: 'id' }).createIndex('trip', 'tripId');
      d.createObjectStore('media', { keyPath: 'id' }).createIndex('checkin', 'checkinId');
    };
    dbp = P(r);
  }
  return dbp;
}
async function os(name, mode = 'readonly') { const d = await db(); return d.transaction(name, mode).objectStore(name); }
const all = async n => P((await os(n)).getAll());
const byIdx = async (n, idx, key) => P((await os(n)).index(idx).getAll(key));
const get = async (n, id) => (id ? P((await os(n)).get(id)) : undefined);
const put = async (n, v) => { await P((await os(n, 'readwrite')).put(v)); return v; };
const del = async (n, id) => P((await os(n, 'readwrite')).delete(id));

const blobToData = b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => rej(f.error); f.readAsDataURL(b); });
const dataToBlob = async d => (d ? (await fetch(d)).blob() : null);

export const LocalStore = {
  async listTrips() { return (await all('trips')).sort((a, b) => b.createdAt - a.createdAt); },
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
  deleteMedia: id => del('media', id),

  // 備份：整包資料（含照片、影片、聲音）匯出成一個檔案
  async exportAll() {
    const media = [];
    for (const m of await all('media')) media.push({ ...m, blob: await blobToData(m.blob), thumb: m.thumb ? await blobToData(m.thumb) : null });
    const data = { app: 'fengcai', v: 1, at: Date.now(), trips: await all('trips'), checkins: await all('checkins'), media };
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  },
  async importAll(file) {
    const data = JSON.parse(await file.text());
    if (data.app !== 'fengcai') throw new Error('這不是蜂采的備份檔');
    for (const t of data.trips || []) await put('trips', t);
    for (const c of data.checkins || []) await put('checkins', c);
    for (const m of data.media || []) await put('media', { ...m, blob: await dataToBlob(m.blob), thumb: await dataToBlob(m.thumb) });
    return { trips: (data.trips || []).length, checkins: (data.checkins || []).length };
  },
  async clearAll() { for (const n of ['media', 'checkins', 'trips']) await P((await os(n, 'readwrite')).clear()); }
};

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
export async function findMergeTarget(tripId, place, pos, who) {
  const now = Date.now();
  const cs = await store.listCheckins(tripId);
  return cs.filter(c => Math.abs(now - c.ts) < MERGE.minutes * 60e3
    && (who === 'kid' ? !isKid(c) : !isAdult(c))
    && (c.placeName === place.name || (pos && pos.lat != null && c.lat != null && distM(pos, c) < MERGE.meters)))
    .sort((a, b) => b.ts - a.ts)[0] || null;
}

// 目前旅程
export const getActiveId = () => { try { return localStorage.getItem('fc-active'); } catch (e) { return null; } };
export const setActiveId = id => { try { localStorage.setItem('fc-active', id); } catch (e) {} };
export async function ensureActiveTrip() {
  const id = getActiveId();
  let t = await store.getTrip(id);
  if (t) return t;
  const ts = await store.listTrips();
  if (ts.length) { setActiveId(ts[0].id); return ts[0]; }
  const d = new Date();
  t = { id: uid(), name: `${d.getMonth() + 1}月${d.getDate()}日的旅程`, createdAt: Date.now() };
  await store.saveTrip(t);
  setActiveId(t.id);
  return t;
}
