// ==========================================================
// 大童把打卡傳回爸媽手機（kidsync.js）
// 孩子的手機：把「還沒傳過的站」打包成一個檔案，用 AirDrop／微信傳給爸媽。
// 爸媽的手機：讀這個檔案，勾選後放進「孩子盒」（只在「孩子」分頁看得到，不跟爸媽的旅行混在一起）。
// 爸媽想要哪張照片、哪段錄音，再從孩子頁「加到我的那一天」（複製一份）。
// 只會新增，不會改掉或刪掉爸媽原本的資料；同一站、同一張照片傳兩次會自動略過。
// 檔案格式：第一行「FCKID1 <說明的位元組數>」，接著一段文字說明（孩子、打卡、每個檔案在哪裡），
// 後面直接接照片、影片、聲音的原始資料（跟 .fcbak 備份一樣，iPhone 不會因為記憶體不夠而當掉）。
// ==========================================================
import { store, isAdult, isKid, MERGE, dailyId, ensureDaily, isDaily, kidBoxId, ensureKidBox } from './store.js';
import { distM } from './geo.js';
import { dayKey, uid } from './ui.js';
import { kidById, upsertKid, getKids } from './kids.js';

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

// 爸媽手機上所有的打卡（旅行包＋日常＋孩子盒）
async function allCheckins() {
  const trips = await store.listTrips(), boxes = await store.listKidBoxes(); let o = [];
  for (const t of [...trips, ...boxes]) o = o.concat(await store.listCheckins(t.id));
  return { trips, cs: o };
}
const near = (a, b) => a.placeName === b.placeName || (a.lat != null && b.lat != null && distM(a, b) < MERGE.meters);

// 每一站：新的／補新照片／已經收過
export async function planMerge(head) {
  const { cs } = await allCheckins();
  const known = id => cs.find(c => c.id === id || (c.kidSrc || []).includes(id));
  const items = [];
  for (const k of head.checkins) {
    const newMs = [];
    for (const m of head.media.filter(m => m.checkinId === k.id)) if (!(await store.getMedia(m.id))) newMs.push(m);
    const was = known(k.id);
    items.push(was ? { k, ms: newMs, kind: newMs.length ? 'more' : 'dup', target: was } : { k, ms: newMs, kind: 'new' });
  }
  return items.sort((a, b) => (a.k.kidTs || a.k.ts) - (b.k.kidTs || b.k.ts));
}
// 那一天放哪一包：那天爸媽有打卡的旅行包 → 那段時間的旅行包 → 那個月的日常
export function tripFor(ts, trips, cs) {
  const dk = dayKey(ts), real = trips.filter(t => !isDaily(t) && !t.kidbox);
  const same = cs.find(c => dayKey(c.ts) === dk && real.some(t => t.id === c.tripId));
  if (same) return real.find(t => t.id === same.tripId);
  const span = real.find(t => t.createdAt - 3600e3 <= ts && ts <= (t.endedAt || Date.now()) + 3600e3);
  if (span) return span;
  return { id: dailyId(new Date(ts)), daily: true, name: `${new Date(ts).getMonth() + 1} 月日常`, _new: true };
}

// 放進孩子盒
export async function applyMerge(head, items) {
  if (head.kid && !kidById(head.kid.id)) upsertKid(head.kid);
  const kidId = head.kid && head.kid.id;
  const box = await ensureKidBox(head.kid || (kidId ? kidById(kidId) : null));
  let stops = 0, files = 0, bad = 0;
  for (const it of items) {
    if (it.kind === 'dup') continue;
    let cid = it.target && it.target.id;
    if (it.kind === 'new') {
      const c = { ...it.k, tripId: box.id, by: 'kid', kid: true, adult: false, kidIds: kidId ? [kidId] : (it.k.kidIds || []), confirmed: true, fromKid: true };
      await store.saveCheckin(c); cid = c.id; stops++;
    }
    for (const m of it.ms) {
      try { const { _b, _t, ...meta } = m; await store.saveMedia({ ...meta, checkinId: cid, by: 'kid', kidId: kidId || meta.kidId || null, blob: await head.take(_b), thumb: await head.take(_t) }); files++; }
      catch (e) { bad++; }
    }
  }
  return { stops, files, bad };
}

// ---------- 孩子手機的「完整備份」（.fcbak，FCBAK1）：也當成孩子的打卡來合併，不整包還原 ----------
const kidOnly = c => (c.kid != null ? c.kid : c.by === 'kid') && !(c.adult != null ? c.adult : c.by !== 'kid');
async function readKidBackup(file) {
  const first = await file.slice(0, 32).text();
  if (!first.startsWith('FCBAK1 ')) return null;
  const nl = first.indexOf('\n'), hlen = +first.slice(7, nl), hstart = new TextEncoder().encode(first.slice(0, nl + 1)).length;
  let data; try { data = JSON.parse(await file.slice(hstart, hstart + hlen).text()); } catch (e) { return null; }
  if (data.app !== 'fengcai' || !(data.checkins || []).length || !data.checkins.every(kidOnly)) return null;
  // 是哪個孩子：備份裡的孩子名單＋最後一次打開的孩子
  let kids = [], last = null;
  try { kids = JSON.parse((data.settings || {})['fc-kids'] || '[]'); last = (data.settings || {})['fc-kid-last']; } catch (e) {}
  const ids = [...new Set(data.checkins.flatMap(c => c.kidIds || []))];
  const kid = kids.find(k => k.id === last && ids.includes(k.id)) || kids.find(k => ids.includes(k.id)) || (ids[0] ? kidById(ids[0]) : null);
  const base = hstart + hlen;
  return {
    app: 'fengcai-kid', v: 1, at: data.at, kid, fromBackup: true,
    checkins: data.checkins, media: (data.media || []).filter(m => m.by === 'kid'),
    take: async ref => (ref ? new Blob([await file.slice(base + ref[0], base + ref[0] + ref[1]).arrayBuffer()], { type: ref[2] || '' }) : null)
  };
}
// 不管是「傳給爸媽」的檔案還是孩子手機的備份，都讀成同一種；不是孩子的檔案就回傳 null
export async function kidHead(file) {
  if (await isKidPack(file)) return readPack(file);
  return readKidBackup(file);
}

// ---------- 還在爸媽旅行裡的孩子章（之前合併的、小童用爸媽手機蓋的）：搬回孩子盒 ----------
// 舊資料沒寫是哪個孩子：算第一個孩子的
const bigIds = c => { const ids = (c.kidIds || []).filter(id => kidById(id)); if (ids.length) return ids; const k = getKids()[0]; return k ? [k.id] : []; };
export async function findStrays() {
  const trips = await store.listTrips(); const moves = [], unjoin = [];
  for (const t of trips) for (const c of await store.listCheckins(t.id)) {
    if (kidOnly(c)) moves.push(c);
    else if (isAdult(c) && isKid(c)) unjoin.push(c);
  }
  return { moves, unjoin, n: moves.length + unjoin.length };
}
export async function moveStrays() {
  const { moves, unjoin } = await findStrays();
  const emptied = new Set();
  for (const c of moves) {
    const ids = bigIds(c), kid = kidById(ids[0]);
    // 舊資料（沒寫是哪個孩子）的夥伴和星星用 'kid' 記，改成這個孩子的
    if (!(c.kidIds || []).length && ids[0]) for (const f of ['buddy', 'kidRate']) if (c[f] && c[f].kid != null) { c[f] = { ...c[f], [ids[0]]: c[f].kid }; delete c[f].kid; }
    const box = await ensureKidBox(kid);
    emptied.add(c.tripId); c.tripId = box.id; c.confirmed = true; c.kidIds = ids;
    await store.saveCheckin(c);
  }
  for (const c of unjoin) {
    const ids = bigIds(c), legacy = !(c.kidIds || []).length;
    const src = [...(c.kidSrc || [])];
    for (const kidId of ids) {
      const kid = kidById(kidId), box = await ensureKidBox(kid), KK = kidId;
      const k = { id: src.shift() || uid(), tripId: box.id, ts: c.kidTs || c.ts, kidTs: c.kidTs || c.ts, lat: c.lat, lng: c.lng, acc: c.acc, placeName: c.placeName, placeType: c.placeType || '', poiId: c.poiId || '',
        by: 'kid', kid: true, adult: false, kidIds: [kidId], confirmed: true, note: '' };
      const bk = legacy ? 'kid' : KK;
      if (c.buddy && c.buddy[bk] != null) k.buddy = { [KK]: c.buddy[bk] };
      if (c.kidRate && c.kidRate[bk]) k.kidRate = { [KK]: c.kidRate[bk] };
      await store.saveCheckin(k);
      for (const m of await store.listMedia(c.id)) if (m.by === 'kid' && (m.kidId === kidId || (!m.kidId && ids.length === 1))) await store.updateMedia({ ...m, checkinId: k.id });
      c.kidIds = (c.kidIds || []).filter(x => x !== kidId);
      if (c.buddy) delete c.buddy[bk];
      if (c.kidRate) delete c.kidRate[bk];
    }
    delete c.kidSrc;
    c.kidIds = c.kidIds || [];
    if (!c.kidIds.length) { c.kid = false; c.adult = true; delete c.kidTs; }
    await store.saveCheckin(c);
  }
  // 整包還原進來、搬空了的旅行包就刪掉（日常不刪）
  for (const id of emptied) { const t = await store.getTrip(id); if (t && !isDaily(t) && !(await store.listCheckins(id)).length) await store.deleteTrip(id); }
  return { moved: moves.length, unjoined: unjoin.length };
}

// ---------- 孩子頁：這個孩子所有的打卡和照片、影片、聲音 ----------
// 孩子盒裡的＋用爸媽手機蓋的章（小童）
export async function kidData(kid) {
  const trips = await store.listTrips();
  let cs = await store.listCheckins(kidBoxId(kid.id));
  for (const t of trips) cs = cs.concat((await store.listCheckins(t.id)).filter(c => isKid(c) && (c.kidIds || []).includes(kid.id)));
  cs.sort((a, b) => (a.kidTs || a.ts) - (b.kidTs || b.ts));
  const media = {};
  for (const c of cs) media[c.id] = (await store.listMedia(c.id)).filter(m => m.by === 'kid' && (!m.kidId || m.kidId === kid.id));
  return { cs, media, boxId: kidBoxId(kid.id) };
}
// 爸媽那一天的站（給「加到我的那一天」挑）
export async function myStopsOn(ts) {
  const trips = await store.listTrips(); let o = [];
  for (const t of trips) o = o.concat((await store.listCheckins(t.id)).filter(c => isAdult(c) && dayKey(c.ts) === dayKey(ts)));
  return o.sort((a, b) => Math.abs(a.ts - ts) - Math.abs(b.ts - ts));
}
// 複製一份到爸媽那一站（孩子頁那一份還在，標記已加入）。target＝爸媽那一站；沒有就在那天新增一站
export async function copyToMine(m, kidStop, targetId) {
  let tid = targetId;
  if (!tid) {
    const { trips, cs } = await allCheckins();
    let dest = tripFor(kidStop.kidTs || kidStop.ts, trips, cs);
    if (dest._new) dest = await ensureDaily(new Date(kidStop.kidTs || kidStop.ts));
    const c = { id: uid(), tripId: dest.id, ts: kidStop.kidTs || kidStop.ts, lat: kidStop.lat, lng: kidStop.lng, acc: kidStop.acc, placeName: kidStop.placeName, placeType: kidStop.placeType || '', poiId: kidStop.poiId || '', by: 'adult', adult: true, kid: false, confirmed: true, note: '', fromKidStop: kidStop.id };
    await store.saveCheckin(c); tid = c.id;
  }
  const cp = async b => (b instanceof Blob ? new Blob([await b.arrayBuffer()], { type: b.type }) : b);
  const { id, checkinId, by, kidId, added, star, ...rest } = m;
  await store.saveMedia({ ...rest, id: uid(), checkinId: tid, by: 'adult', star: false, fromKid: kidId || true, srcId: id, blob: await cp(m.blob), thumb: await cp(m.thumb) });
  m.added = [...new Set([...(m.added || []), tid])];
  await store.updateMedia(m);
  return tid;
}

// ---------- 地圖上唯一的重疊：你的花上，有當時也在場的孩子的蜜蜂（每個孩子一隻、用他的顏色） ----------
// 只是畫在地圖上，不改資料：30 分鐘內、同一個地點（或 60 公尺內）孩子也蓋了章
export async function addBees(cs) {
  let kidCs = [];
  for (const b of await store.listKidBoxes()) kidCs = kidCs.concat(await store.listCheckins(b.id));
  if (!kidCs.length) return cs;
  return cs.map(c => {
    if (!isAdult(c)) return c;
    const ids = [...new Set(kidCs.filter(k => Math.abs((k.kidTs || k.ts) - c.ts) < MERGE.minutes * 60e3 && near(k, c)).flatMap(k => k.kidIds || []))];
    return ids.length ? { ...c, kid: true, adult: true, kidIds: [...new Set([...(c.kidIds || []), ...ids])] } : c;
  });
}
