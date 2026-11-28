// ==========================================================
// 大童把打卡傳回爸媽手機（kidsync.js）
// 孩子的手機：把「還沒傳過的站」打包成一個檔案，用 AirDrop／微信傳給爸媽。
// 爸媽的手機：讀這個檔案，列出每一站要併到哪裡，爸媽勾選後合併。
// 只會新增，不會改掉或刪掉爸媽原本的資料；同一站、同一張照片傳兩次會自動略過。
// 檔案格式：第一行「FCKID1 <說明的位元組數>」，接著一段文字說明（孩子、打卡、每個檔案在哪裡），
// 後面直接接照片、影片、聲音的原始資料（跟 .fcbak 備份一樣，iPhone 不會因為記憶體不夠而當掉）。
// ==========================================================
import { store, isAdult, MERGE, dailyId, ensureDaily, isDaily } from './store.js';
import { distM } from './geo.js';
import { dayKey } from './ui.js';
import { kidById, upsertKid } from './kids.js';

const MAGIC = 'FCKID1 ';

// ---------- 孩子的手機：哪些已經傳過 ----------
const SENT = 'fc-kid-sent';
const readSent = () => { try { const o = JSON.parse(localStorage.getItem(SENT) || '{}'); return { c: new Set(o.c || []), m: new Set(o.m || []) }; } catch (e) { return { c: new Set(), m: new Set() }; } };
function markSent(cids, mids) {
  const s = readSent(); cids.forEach(i => s.c.add(i)); mids.forEach(i => s.m.add(i));
  try { localStorage.setItem(SENT, JSON.stringify({ c: [...s.c], m: [...s.m] })); } catch (e) {}
}
export function forgetSent() { try { localStorage.removeItem(SENT); } catch (e) {} }

// 還沒傳過的站：這一站沒傳過，或這一站有新的照片、影片、聲音
// checkins：這個孩子的所有章；mediaOf(c)：這一站孩子自己的檔案
export async function unsent(checkins, mediaOf) {
  const s = readSent(), out = [];
  for (const c of checkins) {
    const ms = (await mediaOf(c)).filter(m => !s.m.has(m.id));
    if (!s.c.has(c.id) || ms.length) out.push({ c, ms });
  }
  return out;
}
export const everSent = () => readSent().c.size > 0;

// 打包成一個檔案
export async function packForParent(kid, list) {
  const parts = []; let off = 0;
  const addBlob = b => { if (!b) return null; const ref = [off, b.size, b.type || '']; parts.push(b); off += b.size; return ref; };
  const checkins = [], media = [];
  for (const { c, ms } of list) {
    checkins.push(c);
    for (const m of ms) { const { blob, thumb, ...meta } = m; media.push({ ...meta, _b: addBlob(blob), _t: addBlob(thumb) }); }
  }
  const head = { app: 'fengcai-kid', v: 1, at: Date.now(), kid: kid ? { id: kid.id, name: kid.name, color: kid.color, age: kid.age, theme: kid.theme } : null, checkins, media };
  const hb = new TextEncoder().encode(JSON.stringify(head));
  const d = new Date(), safe = (kid ? kid.name : '孩子').replace(/[\\/:*?"<>|]/g, '');
  const name = `蜂采-${safe}的打卡-${d.getMonth() + 1}月${d.getDate()}日.fcbak`;
  const file = new File([`${MAGIC}${hb.length}\n`, hb, ...parts], name, { type: 'application/octet-stream' });
  return { file, done: () => markSent(list.map(x => x.c.id), list.flatMap(x => x.ms.map(m => m.id))) };
}

// ---------- 爸媽的手機：讀檔案 ----------
export async function isKidPack(file) { return (await file.slice(0, 8).text()).startsWith(MAGIC); }
export async function readPack(file) {
  const first = await file.slice(0, 32).text();
  if (!first.startsWith(MAGIC)) throw new Error('這不是孩子傳來的蜂采打卡檔');
  const nl = first.indexOf('\n'), hlen = +first.slice(MAGIC.length, nl), hstart = new TextEncoder().encode(first.slice(0, nl + 1)).length;
  const head = JSON.parse(await file.slice(hstart, hstart + hlen).text());
  if (head.app !== 'fengcai-kid') throw new Error('這不是孩子傳來的蜂采打卡檔');
  const base = hstart + hlen;
  // iPhone：檔案的一段不能直接存進資料庫，要先完整讀出來變成新的資料
  head.take = async ref => (ref ? new Blob([await file.slice(base + ref[0], base + ref[0] + ref[1]).arrayBuffer()], { type: ref[2] || '' }) : null);
  return head;
}

// 爸媽手機上所有的打卡（跨旅行包）
async function allCheckins() {
  const trips = await store.listTrips(); let o = [];
  for (const t of trips) o = o.concat(await store.listCheckins(t.id));
  return { trips, cs: o };
}
const near = (a, b) => a.placeName === b.placeName || (a.lat != null && b.lat != null && distM(a, b) < MERGE.meters);

// 每一站的計畫：已經收過／補新照片／併到爸媽那一站／孩子自己去的
export async function planMerge(head) {
  const { trips, cs } = await allCheckins();
  const kidId = head.kid && head.kid.id;
  // 孩子的站以前收過：同一個代號，或之前併進了爸媽的那一站（kidSrc 記著）
  const known = id => cs.find(c => c.id === id || (c.kidSrc || []).includes(id));
  const items = [];
  for (const k of head.checkins) {
    const ms = head.media.filter(m => m.checkinId === k.id);
    const newMs = [];
    for (const m of ms) if (!(await store.getMedia(m.id))) newMs.push(m);
    const ts = k.kidTs || k.ts;
    const was = known(k.id);
    if (was) { items.push({ k, ms: newMs, kind: newMs.length ? 'more' : 'dup', target: was }); continue; }
    const target = cs.filter(c => isAdult(c) && Math.abs(c.ts - ts) < MERGE.minutes * 60e3 && near(k, c) && !(c.kidIds || []).includes(kidId))
      .sort((a, b) => Math.abs(a.ts - ts) - Math.abs(b.ts - ts))[0];
    if (target) { items.push({ k, ms: newMs, kind: 'join', target }); continue; }
    items.push({ k, ms: newMs, kind: 'solo', trip: tripFor(ts, trips, cs) });
  }
  return items.sort((a, b) => (a.k.kidTs || a.k.ts) - (b.k.kidTs || b.k.ts));
}
// 孩子自己去的站放哪一包：那天爸媽有打卡的旅行包 → 那段時間的旅行包 → 那個月的日常
function tripFor(ts, trips, cs) {
  const dk = dayKey(ts), real = trips.filter(t => !isDaily(t));
  const same = cs.find(c => dayKey(c.ts) === dk && real.some(t => t.id === c.tripId));
  if (same) return real.find(t => t.id === same.tripId);
  const span = real.find(t => t.createdAt - 3600e3 <= ts && ts <= (t.endedAt || Date.now()) + 3600e3);
  if (span) return span;
  return { id: dailyId(new Date(ts)), daily: true, name: `${new Date(ts).getMonth() + 1} 月日常`, _new: true };
}

// 合併勾選的站
export async function applyMerge(head, items) {
  if (head.kid && !kidById(head.kid.id)) upsertKid(head.kid);
  const kidId = head.kid && head.kid.id, KK = kidId || 'kid';
  let stops = 0, files = 0, bad = 0;
  const saveMs = async (ms, cid) => {
    for (const m of ms) {
      try { const { _b, _t, ...meta } = m; await store.saveMedia({ ...meta, checkinId: cid, by: 'kid', kidId: kidId || meta.kidId || null, blob: await head.take(_b), thumb: await head.take(_t) }); files++; }
      catch (e) { bad++; }
    }
  };
  for (const it of items) {
    const k = it.k;
    if (it.kind === 'dup') continue;
    if (it.kind === 'solo') {
      let tripId = it.trip.id;
      if (it.trip._new) tripId = (await ensureDaily(new Date(k.kidTs || k.ts))).id;
      const c = { ...k, tripId, by: 'kid', kid: true, adult: false, kidIds: kidId ? [kidId] : (k.kidIds || []), confirmed: true, fromKid: true };
      await store.saveCheckin(c);
      await saveMs(it.ms, c.id); stops++;
      continue;
    }
    // 併到爸媽那一站（或之前併過的那一站補新照片）：只加孩子的部分，不動爸媽的
    const c = await store.getCheckin(it.target.id); if (!c) continue;
    if (it.kind === 'join') {
      c.kid = true; if (c.adult == null) c.adult = c.by !== 'kid';
      c.kidIds = [...new Set([...(c.kidIds || []), ...(kidId ? [kidId] : [])])];
      c.kidSrc = [...new Set([...(c.kidSrc || []), k.id])];
      c.kidTs = c.kidTs || k.kidTs || k.ts;
      if (k.buddy && k.buddy[KK] != null) c.buddy = { ...(c.buddy || {}), [KK]: k.buddy[KK] };
      if (k.kidRate && k.kidRate[KK]) c.kidRate = { ...(c.kidRate || {}), [KK]: k.kidRate[KK] };
      await store.saveCheckin(c); stops++;
    }
    await saveMs(it.ms, c.id);
  }
  return { stops, files, bad };
}
