// 蜂采 兒童頁面：小小打卡官
import { CONFIG } from './config.js';
import { store, ensureActiveTrip, askPersist, isKid, findMergeTarget } from './store.js';
import { getPosition, nearby, badgeOf, BADGES, isDemo, distM } from './geo.js';
import { startRecorder } from './media.js';
import { $, esc, uid, icon, fmtDate, dayKey } from './ui.js';
import { allThemes, getTheme, guessTheme, themeIcon } from './themes.js';
import { gardenSVG } from './map.js';
import { loadBee, beeSVG } from './bee.js';
import { compressImage, videoThumb } from './media.js';
import { kidFromUrl, isKidOf, colorHex, KID_LIMITS, FEELS, QUESTIONS } from './kids.js';
import { BUDDY_THEMES, themeOfKid, buddyList, buddySVG, buddyName, collected, nextBuddy } from './buddies.js';
import { hexCell } from './capsule.js';

const k = $('#k');
let ctx = null, curRec = null, recTimer = null;
// 這是哪個孩子（吊飾網址帶的）；舊吊飾沒帶＝不分是誰
const me = kidFromUrl();
const big = !!(me && me.age === 'big');
const myName = me ? me.name : '小小打卡官';
const mine = c => isKidOf(c, me);
const theme = themeOfKid(me), TH = BUDDY_THEMES[theme], block = theme === 'block';
const KK = me ? me.id : 'kid';
let reveal = null; // 剛剛蓋章解鎖的夥伴 { idx, isNew }
// 這個孩子在這支手機上所有的章（跨旅行包）
async function allMine() { let o = []; for (const t of await store.listTrips()) o = o.concat((await store.listCheckins(t.id)).filter(mine)); return o.sort((a, b) => a.ts - b.ts); }
const todayN = async () => { const dk = dayKey(Date.now()); return (await allMine()).filter(c => dayKey(c.kidTs || c.ts) === dk).length; };
if (me) { document.body.style.setProperty('--kc', colorHex(me)); document.title = `蜂采・${me.name}的打卡`; }

// ---------- 音效（在孩子按下按鈕時解鎖，iPhone 才會發出聲音） ----------
function unlockAudio() {
  try { const C = window.AudioContext || window.webkitAudioContext; ctx = ctx || new C(); ctx.resume(); } catch (e) {}
}
function chime() {
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    [784, 1047, 1319].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t = t0 + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.55);
    });
  } catch (e) {}
}
async function stopRec() {
  clearInterval(recTimer);
  if (curRec) { const r = curRec; curRec = null; try { return await r.stop(); } catch (e) {} }
  return null;
}

// ---------- 首頁：大大的蓋章按鈕 ----------
async function idle() {
  await stopRec();
  const t = await ensureActiveTrip();
  const n = (await store.listCheckins(t.id)).filter(mine).length;
  k.innerHTML = `<header class="ktop"><img src="./logo.svg" class="klogo" alt=""><span class="kname">${esc(myName)}</span><button class="kbook" id="gd">${block ? buddySVG('block', 0, 'kbtn-ic') : icon('flower')}${esc(TH.world)}</button><button class="kbook" id="book">${icon('honey')}${big ? '我的足跡' : '章本'} <b>${n}</b></button></header>
    <section class="kcenter">
      <button class="kstamp" id="stamp">${beeSVG('huge')}<span>按我蓋章！</span></button>
      <p class="ktip">到了新地方，碰一下吊飾，再按上面的大按鈕</p>
      ${isDemo() ? '<p class="ktip sm">（現在是模擬模式）</p>' : ''}
    </section>
    <div id="kdue"></div>
    <button class="kfuture" id="kcap"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" fill="var(--cap-wax)" stroke="var(--cap-rim)" stroke-width="1.6"/></svg>給未來的自己</button>
    ${big ? '' : '<a class="kadult" href="index.html">大人頁面</a>'}`;
  $('#stamp').onclick = go;
  $('#book').onclick = book;
  $('#gd').onclick = () => garden();
  $('#kcap').onclick = capHome;
  dueBanner();
}

async function go() {
  unlockAudio();
  k.innerHTML = `<section class="kcenter"><div class="kfly">${beeSVG('huge')}</div><p class="kbig">小蜜蜂出發找花朵…</p></section>`;
  let pos;
  try { pos = await getPosition(); } catch (e) { return lost(e.message); }
  let list = [];
  try { list = await nearby(pos.lat, pos.lng); } catch (e) {}
  list.sort((a, b) => (a.dist || 0) - (b.dist || 0));
  const trip = await ensureActiveTrip();
  const kids = (await store.listCheckins(trip.id)).filter(mine);
  const p = list[0] || { name: `神秘地點 ${kids.length + 1} 號`, type: '', id: '' };
  const last = kids[kids.length - 1];
  if (last && Date.now() - (last.kidTs || last.ts) < 15 * 60e3 && (last.placeName === p.name || (last.lat != null && distM(pos, last) < 60))) return already(pos, p, trip, kids.length);
  save(pos, p, trip, kids.length + 1);
}

// 每天第一次蓋章：選今天的冒險主題
function pickTheme(suggest) {
  return new Promise(res => {
    const list = allThemes();
    const sorted = [list.find(t => t.id === suggest), ...list.filter(t => t.id !== suggest)].filter(Boolean);
    k.innerHTML = `<section class="kcenter" style="justify-content:flex-start">
      <p class="kbig">今天是什麼冒險？</p><p class="ktip" style="margin-bottom:14px">選一個，花園就會長出這種風景</p>
      <div class="tgrid">${sorted.map((t, i) => `<button class="tbtn${i === 0 ? ' sug' : ''}" data-t="${esc(t.id)}">${i === 0 ? '<em>小蜜蜂猜</em>' : ''}${themeIcon(t, 64)}<span>${esc(t.name)}</span></button>`).join('')}</div>
    </section>`;
    k.querySelectorAll('[data-t]').forEach(b => b.onclick = () => res(b.dataset.t));
  });
}
async function ensureDayTheme(trip, p) {
  const dk = dayKey(Date.now());
  if (trip.dayThemes && trip.dayThemes[dk]) return;
  const tid = await pickTheme(guessTheme(p));
  unlockAudio();
  trip.dayThemes = { ...(trip.dayThemes || {}), [dk]: tid };
  await store.saveTrip(trip);
}

async function giveBuddy(c) {
  const got = collected(await allMine(), KK);
  const nb = nextBuddy(theme, got);
  c.buddy = { ...(c.buddy || {}), [KK]: nb.idx };
  reveal = { ...nb, cid: c.id };
}
async function save(pos, p, trip, n) {
  if (!block) await ensureDayTheme(trip, p);
  // 大人剛在這裡打過卡：把章蓋在同一站（用大人選好的地點名稱）
  const merge = await findMergeTarget(trip.id, p, pos, 'kid', me && me.id);
  if (merge) {
    const ids = [...new Set([...(merge.kidIds || []), ...(me ? [me.id] : [])])];
    Object.assign(merge, { kid: true, kidIds: ids, kidTs: Date.now() });
    if (merge.adult == null) merge.adult = merge.by !== 'kid';
    await giveBuddy(merge);
    await store.saveCheckin(merge);
    askPersist();
    return result(merge, n);
  }
  const c = { id: uid(), tripId: trip.id, ts: Date.now(), kidTs: Date.now(), lat: pos.lat, lng: pos.lng, acc: pos.acc, placeName: p.name, placeType: p.type || '', poiId: p.id || '', by: 'kid', kid: true, adult: false, kidIds: me ? [me.id] : [], confirmed: false, note: '' };
  await giveBuddy(c);
  await store.saveCheckin(c);
  askPersist();
  result(c, n);
}

// 蓋章結果上方：解鎖的夥伴 + 今天第幾站 + 地點
async function stampHead(c) {
  const idx = (c.buddy || {})[KK], tn = await todayN();
  const r = reveal && reveal.cid === c.id ? reveal : null;
  const isNew = r ? r.isNew : true, pop = r && !r.shown;
  if (r) r.shown = true;
  return `<div class="kres"><div class="krays${pop ? ' pop' : ''}" aria-hidden="true"></div>
      <div class="kbud${pop ? ' pop' : ''}">${idx != null ? buddySVG(theme, idx, 'big') : beeSVG('huge')}</div></div>
    <p class="kbudname">${idx != null ? (isNew ? `新夥伴：<b>${esc(buddyName(theme, idx))}</b>` : `又遇到 <b>${esc(buddyName(theme, idx))}</b> 了！`) : ''}</p>
    <p class="kbig">今天第 ${tn} 站</p>
    <p class="kplace">${esc(c.placeName.replace(/（模擬）/, ''))}</p>
    <button class="klink" id="kfix">地點不對？</button>`;
}
async function result(c, n) {
  if (big) return bigResult(c, n);
  const head = await stampHead(c);
  chime();
  k.innerHTML = `<section class="kcenter">
      ${head}
      <button class="kmic" id="mic" aria-label="按一下開始說話">${icon('mic', 'huge')}</button>
      <p class="ktip" id="mt">按麥克風，說一句你現在的感覺（${CONFIG.kidRecordSec} 秒）</p>
      <div class="krow" id="after"></div>
      <div class="krow"><button class="kbtn main" id="gd">${block ? buddySVG('block', 0, 'kbtn-ic') : icon('flower')}看${esc(TH.world)}</button><button class="kbtn" id="fin">${icon('check')}完成</button></div>
    </section>`;
  micFlow(c);
  $('#fin').onclick = idle;
  $('#gd').onclick = () => garden(c.id);
  $('#kfix').onclick = () => fixPlace(c, () => result(c, n));
}

function micFlow(c) {
  const mic = $('#mic'), mt = $('#mt'), max = CONFIG.kidRecordSec;
  let left = max;
  mic.onclick = async () => {
    if (curRec) { finish(); return; }
    try { curRec = await startRecorder(); } catch (e) { mt.textContent = '麥克風沒有打開，請大人幫忙按「允許」'; return; }
    mic.classList.add('on'); left = max;
    mt.textContent = `說吧！還有 ${left} 秒`;
    recTimer = setInterval(() => { left--; mt.textContent = `說吧！還有 ${left} 秒`; if (left <= 0) finish(); }, 1000);
  };
  async function finish() {
    const blob = await stopRec();
    mic.classList.remove('on');
    if (!blob) return;
    await store.saveMedia({ id: uid(), checkinId: c.id, kind: 'audio', blob, by: 'kid', kidId: me ? me.id : null, star: false, ts: Date.now(), size: blob.size, dur: Math.max(1, max - left) });
    mic.hidden = true;
    mt.textContent = '錄好了！你的聲音已經收進章本';
    const a = new Audio(URL.createObjectURL(blob));
    $('#after').innerHTML = `<button class="kbtn main" id="play">${icon('play')}聽一次</button>`;
    $('#play').onclick = () => a.play();
  }
}

function already(pos, p, trip, n) {
  k.innerHTML = `<section class="kcenter">${icon('flower', 'huge')}
    <p class="kbig">這裡已經蓋過章了！</p><p class="kplace">${esc(p.name)}</p>
    <div class="krow"><button class="kbtn main" id="bk">看我的花園</button><button class="kbtn" id="again">還是要再蓋</button></div>
    <div class="krow"><button class="kbtn ghost" id="home">回首頁</button></div></section>`;
  $('#bk').onclick = () => garden();
  $('#again').onclick = () => save(pos, p, trip, n + 1);
  $('#home').onclick = idle;
}

function lost(msg) {
  k.innerHTML = `<section class="kcenter">${beeSVG('huge')}
    <p class="kbig">小蜜蜂迷路了</p><p class="ktip">請大人幫忙看看：</p><p class="ktip sm">${esc(msg)}</p>
    <div class="krow"><button class="kbtn main" id="retry">再試一次</button><button class="kbtn" id="home">回首頁</button></div></section>`;
  $('#retry').onclick = go;
  $('#home').onclick = idle;
}

// ---------- 我的章本／我的足跡：每個章＝夥伴＋地點；點一下可以改地點 ----------
async function book() {
  await stopRec();
  const t = await ensureActiveTrip();
  const kids = (await store.listCheckins(t.id)).filter(mine);
  const blanks = Math.max(0, (Math.ceil((kids.length + 1) / 3) * 3) - kids.length);
  const days = {}; kids.forEach(c => { const d = dayKey(c.kidTs || c.ts); days[d] = (days[d] || 0) + 1; c._dn = days[d]; });
  k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">${esc(t.name)}</span></header>
    <p class="kbig" style="text-align:center">${big ? '我的足跡' : '我的章本'}</p>
    ${big ? await myStats(kids) : ''}
    <div class="krow" style="margin:0 0 10px"><button class="kbtn" id="dex">${buddySVG(theme, 0, 'kbtn-ic')}夥伴圖鑑</button></div>
    <div class="comb">
      ${kids.map(c => { const bi = (c.buddy || {})[KK]; return `<button class="cell kcell" data-c="${c.id}">${bi != null ? buddySVG(theme, bi, 'cellbud') : icon('flower')}${esc(c.placeName.replace(/（模擬）/, ''))}<small>${fmtDate(c.kidTs || c.ts).replace(/ 週.$/, '')}・第 ${c._dn} 站</small></button>`; }).join('')}
      ${Array.from({ length: blanks }, () => '<div class="cell empty"></div>').join('')}
    </div>
    ${kids.length ? '<p class="ktip sm" style="text-align:center">地點不對或蓋錯了？點那個章就可以改或刪掉</p>' : '<p class="ktip" style="text-align:center">還沒有章，快去蓋第一個！</p>'}`;
  $('#home').onclick = idle;
  $('#dex').onclick = () => dex(book);
  k.querySelectorAll('[data-c]').forEach(bt => bt.onclick = () => { const c = kids.find(x => x.id === bt.dataset.c); if (c) stampMenu(c); });
}
// 點一個章：改地點、刪掉
function stampMenu(c) {
  const bi = (c.buddy || {})[KK];
  k.innerHTML = `<section class="kcenter">
      <div class="kbud">${bi != null ? buddySVG(theme, bi, 'big') : beeSVG('huge')}</div>
      <p class="kbig">${esc(c.placeName.replace(/（模擬）/, ''))}</p>
      <p class="ktip">${fmtDate(c.kidTs || c.ts)}</p>
      <div class="kcol"><button class="kbtn main" id="kfx">${icon('pin')}改地點</button><button class="kbtn danger" id="kdl">${icon('trash')}刪掉這個章</button><button class="kbtn ghost" id="kbk">不用了</button></div>
    </section>`;
  $('#kfx').onclick = () => fixPlace(c, book);
  $('#kbk').onclick = book;
  $('#kdl').onclick = () => {
    k.innerHTML = `<section class="kcenter"><p class="kbig">真的要刪掉嗎？</p>
        <p class="ktip">${esc(c.placeName.replace(/（模擬）/, ''))}的章${bi != null ? `，和那時遇到的「${esc(buddyName(theme, bi))}」` : ''}都會不見。<br>再蓋下一個章，夥伴還會回來。</p>
        <div class="kcol"><button class="kbtn danger" id="kyes">${icon('trash')}刪掉</button><button class="kbtn ghost" id="kno">不要刪</button></div></section>`;
    $('#kno').onclick = book;
    $('#kyes').onclick = async () => { await removeMine(c); toastKid('刪掉了'); book(); };
  };
}
// 只刪這個孩子自己的那一份；爸媽或其他孩子也在這站的，留著他們的
async function removeMine(c) {
  const others = (c.kidIds || []).filter(id => !me || id !== me.id);
  const shared = c.adult || (me && others.length > 0);
  if (!shared) { await store.deleteCheckin(c.id); return; }
  for (const m of await store.listMedia(c.id)) if (m.by === 'kid' && (!me || m.kidId === me.id)) await store.deleteMedia(m.id);
  const drop = o => { if (!o) return o; const x = { ...o }; delete x[KK]; return x; };
  c.kidIds = others; c.buddy = drop(c.buddy); c.kidRate = drop(c.kidRate);
  if (!others.length) { c.kid = false; delete c.kidTs; }
  await store.saveCheckin(c);
}

// ---------- 地點不對：選最近的 5 個 ----------
async function fixPlace(c, back) {
  await stopRec();
  if (c.adult) { toastKid('這一站是和爸媽一起的，請爸媽幫忙改'); return; }
  if (c.lat == null) { toastKid('這個章沒有位置，沒辦法改'); return; }
  k.innerHTML = `<section class="kcenter"><div class="kfly">${beeSVG('huge')}</div><p class="kbig">小蜜蜂在找附近的地方…</p></section>`;
  let list = [];
  try { list = await nearby(c.lat, c.lng); } catch (e) {}
  list = list.sort((a, b) => (a.dist || 0) - (b.dist || 0)).filter(p => p.name !== c.placeName).slice(0, 5);
  k.innerHTML = `<section class="kcenter" style="justify-content:flex-start">
    <p class="kbig">你在哪裡呢？</p><p class="ktip">現在是：${esc(c.placeName.replace(/（模擬）/, ''))}</p>
    <div class="kplaces">${list.map((p, i) => `<button class="kpl" data-i="${i}">${icon('pin')}<span>${esc(p.name.replace(/（模擬）/, ''))}</span>${p.dist != null ? `<small>${Math.round(p.dist)} 公尺</small>` : ''}</button>`).join('') || '<p class="ktip">附近找不到其他地方</p>'}</div>
    <div class="krow"><button class="kbtn ghost" id="kno">不用改</button></div></section>`;
  $('#kno').onclick = back;
  k.querySelectorAll('[data-i]').forEach(bt => bt.onclick = async () => {
    const p = list[+bt.dataset.i];
    Object.assign(c, { placeName: p.name, placeType: p.type || '', poiId: p.id || '' });
    await store.saveCheckin(c);
    toastKid('改好了！');
    back();
  });
}

// ---------- 夥伴圖鑑 ----------
async function dex(back) {
  await stopRec();
  const got = collected(await allMine(), KK), L = buddyList(theme);
  k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">${esc(TH.name)}</span></header>
    <p class="kbig" style="text-align:center">夥伴圖鑑</p>
    <p class="ktip" style="text-align:center">收集到 <b>${got.size}</b> / ${L.length} 個夥伴${got.size >= L.length ? '，全部集滿了！' : '，每蓋一個章就會遇到一個新夥伴'}</p>
    <div class="kdex">${L.map((b, i) => `<div class="kdx${got.has(i) ? '' : ' lock'}">${buddySVG(theme, i, '', !got.has(i))}<span>${got.has(i) ? esc(b.name) : '？？？'}</span></div>`).join('')}</div>`;
  $('#home').onclick = back || idle;
}

// ---------- 花園地圖：雲朵慢慢散開 ----------
async function garden(newestId) {
  if (block) return world(newestId);
  await stopRec();
  const t = await ensureActiveTrip();
  const kids = (await store.listCheckins(t.id)).filter(mine);
  const n = kids.length, goal = CONFIG.kidGardenGoal;
  const next = Math.max(goal, Math.ceil((n + (n % goal === 0 && n ? 0 : 0)) / goal) * goal || goal);
  const left = next - n;
  k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">${esc(t.name)}</span></header>
    <p class="kbig" style="text-align:center;margin-bottom:12px">我的花園地圖</p>
    ${gardenSVG(kids, c => getTheme((t.dayThemes || {})[dayKey(c.ts)]), t.id, newestId)}
    ${(() => { const ds = [...new Set(kids.map(c => dayKey(c.ts)))]; return ds.length ? `<div class="kcount">${ds.map((d, i) => { const th = getTheme((t.dayThemes || {})[d]); return `<span>${themeIcon(th, 24)}第 ${i + 1} 天・${esc(th.name)}</span>`; }).join('')}</div>` : ''; })()}
    <div class="kgoal">${n ? `已經點亮 <b>${n}</b> 朵花！${left > 0 ? `再蓋 <b>${left}</b> 個章，就能開滿第 ${next / goal} 片花園` : `第 ${n / goal} 片花園開滿了！`}` : '蓋第一個章，雲朵就會散開，長出第一朵花！'}
      <div class="kbar"><span style="width:${Math.round(((n % goal) || (n ? goal : 0)) / goal * 100)}%"></span></div></div>
    <div class="krow"><button class="kbtn" id="bk">${icon('honey')}${big ? '我的足跡' : '看章本'}</button><button class="kbtn" id="dex">${buddySVG(theme, 0, 'kbtn-ic')}夥伴圖鑑</button></div>`;
  $('#home').onclick = idle;
  $('#bk').onclick = book;
  $('#dex').onclick = () => dex(() => garden());
  k.querySelectorAll('.pick').forEach(g => g.onclick = () => { const c = kids.find(x => x.id === g.dataset.id); if (c) toastKid(c.placeName); });
}
// ---------- 方塊世界：每個章是一塊草地方塊，上面站著那時候遇到的夥伴 ----------
async function world(newestId) {
  await stopRec();
  const all = await allMine(), n = all.length, goal = 6;
  const slots = Math.max(goal, Math.ceil((n + 1) / goal) * goal);
  k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">${esc(myName)}的方塊世界</span></header>
    <div class="bworld">${Array.from({ length: slots }, (_, i) => { const c = all[i]; if (!c) return `<div class="btile fog"><i></i></div>`; const bi = (c.buddy || {})[KK]; return `<div class="btile${c.id === newestId ? ' new' : ''}" data-c="${c.id}"><div class="bbud">${bi != null ? buddySVG('block', bi) : ''}</div><i></i><small>${esc(c.placeName.replace(/（模擬）/, '').slice(0, 6))}</small></div>`; }).join('')}</div>
    <div class="kgoal">${n ? `已經蓋了 <b>${n}</b> 塊方塊！再蓋 <b>${slots - n}</b> 個章，就能把這一片蓋滿` : '蓋第一個章，就會長出第一塊方塊！'}
      <div class="kbar"><span style="width:${Math.round((n % goal || (n ? goal : 0)) / goal * 100)}%"></span></div></div>
    <div class="krow"><button class="kbtn" id="bk">${icon('honey')}${big ? '我的足跡' : '看章本'}</button><button class="kbtn" id="dex">${buddySVG('block', 0, 'kbtn-ic')}夥伴圖鑑</button></div>`;
  $('#home').onclick = idle;
  $('#bk').onclick = book;
  $('#dex').onclick = () => dex(() => world());
  k.querySelectorAll('[data-c]').forEach(g => g.onclick = () => { const c = all.find(x => x.id === g.dataset.c); if (c) toastKid(`${c.placeName}・${fmtDate(c.kidTs || c.ts)}`); });
}

// ---------- 孩子自己的時光膠囊（不會跑到大人頁面） ----------
const DAYMS = 86400e3;
const ymd = t => { const d = new Date(t); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
async function myCaps() { return (await store.listCapsules()).filter(c => c.kid && (me ? c.kidId === me.id : !c.kidId)).sort((a, b) => a.openAt - b.openAt); }
async function dueBanner() {
  const due = (await myCaps()).filter(c => !c.opened && Date.now() >= c.openAt);
  const el = $('#kdue'); if (!el || !due.length) return;
  el.innerHTML = `<button class="kdue" id="kdueb"><span class="kdue-hx">${hexCell('sealed', 1)}</span><b>有一顆膠囊可以打開了！</b></button>`;
  $('#kdueb').onclick = () => capOpen(due[0]);
}
async function capHome() {
  await stopRec();
  const caps = await myCaps(), wait = caps.filter(c => !c.opened), open = caps.filter(c => c.opened);
  k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">給未來的自己</span></header>
    <p class="kbig" style="text-align:center">我的時光膠囊</p>
    <div class="khive">
      <button class="khx add" id="knew"><span>${hexCell('add')}</span><b>做一顆新的</b></button>
      ${wait.map(c => { const due = Date.now() >= c.openAt; return `<button class="khx${due ? ' due' : ''}" data-cap="${c.id}"><span>${hexCell('sealed', Math.min(1, Math.max(.08, (Date.now() - c.createdAt) / Math.max(DAYMS, c.openAt - c.createdAt))))}</span><b>${due ? '可以打開了！' : `還有 ${Math.max(1, Math.ceil((c.openAt - Date.now()) / DAYMS))} 天`}</b></button>`; }).join('')}
    </div>
    ${open.length ? `<p class="kbig" style="text-align:center;font-size:22px;margin-top:16px">打開過的</p><div class="kopen">${open.map(c => `<button class="kopn" data-cap="${c.id}">${icon('flower')}<span>${esc(ymd(c.createdAt))}寫的</span><small>${esc((c.note || '').slice(0, 16))}</small></button>`).join('')}</div>` : ''}`;
  $('#home').onclick = idle;
  $('#knew').onclick = capNew;
  k.querySelectorAll('[data-cap]').forEach(b => b.onclick = () => { const c = caps.find(x => x.id === b.dataset.cap); if (!c) return; if (c.opened || Date.now() >= c.openAt) capOpen(c); else toastKid(`還要等 ${Math.ceil((c.openAt - Date.now()) / DAYMS)} 天才能打開喔`); });
}
async function capNew() {
  await stopRec();
  const items = [];
  let when = 12, pickTs = null;
  const openTs = () => (when === 'pick' && pickTs ? pickTs : addM(when === 'pick' ? 12 : when));
  const draw = () => {
    k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">新的膠囊</span></header>
      <p class="kbig" style="text-align:center">想對未來的自己說什麼？</p>
      <textarea id="knote" class="knote" maxlength="200" placeholder="例如：我現在最喜歡的東西是…">${esc(capNew.note || '')}</textarea>
      <div class="kshoot two">
        <label class="kshot${items.some(x => x.kind === 'photo') ? ' full' : ''}">${icon('camera', 'huge')}<span>放一張照片</span><small>${items.some(x => x.kind === 'photo') ? '放好了' : '拍照或選照片'}</small>${items.some(x => x.kind === 'photo') ? '' : '<input type="file" accept="image/*" id="kcph">'}</label>
        <button class="kshot${items.some(x => x.kind === 'audio') ? ' full' : ''}" id="kcau" ${items.some(x => x.kind === 'audio') ? 'disabled' : ''}>${icon('mic', 'huge')}<span>錄一段話</span><small id="kcaut">${items.some(x => x.kind === 'audio') ? '錄好了' : `${KID_LIMITS.audioSec} 秒`}</small></button>
      </div>
      <p class="kbig" style="text-align:center;font-size:22px">什麼時候打開？</p>
      <div class="kfeel">${[[1, '1 個月'], [6, '半年'], [12, '1 年'], [24, '2 年']].map(([m, t]) => `<button data-w="${m}" class="${when === m ? 'on' : ''}">${t}</button>`).join('')}<label class="kdatebtn${when === 'pick' ? ' on' : ''}">${icon('edit')}自己選日期<input type="date" id="kdate" min="${isoD(Date.now() + DAYMS)}" max="${isoD(addM(120))}" value="${pickTs ? isoD(pickTs) : ''}"></label></div>
      <p class="ktip" style="text-align:center">${ymd(openTs())}打開</p>
      <div class="krow"><button class="kbtn main" id="kseal">${icon('check')}封起來！</button></div>`;
    $('#home').onclick = async () => { await stopRec(); capNew.note = ''; capHome(); };
    $('#knote').oninput = e => { capNew.note = e.target.value; };
    k.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { when = +b.dataset.w; draw(); });
    $('#kdate').onchange = e => { const [y, m, dd] = (e.target.value || '').split('-').map(Number); if (!y) return; const t = new Date(y, m - 1, dd, 9).getTime(); if (t <= Date.now()) { toastKid('要選明天以後的日子喔'); return; } pickTs = t; when = 'pick'; draw(); };
    if ($('#kcph')) $('#kcph').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { items.push({ id: uid(), kind: 'photo', blob: await compressImage(f), mime: 'image/jpeg' }); } catch (err) { toastKid('照片放不進去'); } draw(); };
    $('#kcau').onclick = async () => {
      if (curRec) { const blob = await stopRec(); if (blob) items.push({ id: uid(), kind: 'audio', blob, mime: blob.type }); draw(); return; }
      try { curRec = await startRecorder(); } catch (e) { toastKid('麥克風沒有打開，請大人幫忙按「允許」'); return; }
      let left = KID_LIMITS.audioSec; $('#kcau').classList.add('rec'); $('#kcaut').textContent = `說吧！${left} 秒`;
      recTimer = setInterval(async () => { left--; const t = $('#kcaut'); if (t) t.textContent = `說吧！${left} 秒，說完再按一次`; if (left <= 0) { const blob = await stopRec(); if (blob) items.push({ id: uid(), kind: 'audio', blob, mime: blob.type }); draw(); } }, 1000);
    };
    $('#kseal').onclick = async () => {
      await stopRec();
      const note = (capNew.note || '').trim();
      if (!note && !items.length) { toastKid('先寫一句話，或放一張照片吧'); return; }
      const cap = { id: uid(), createdAt: Date.now(), openAt: openTs(), to: 'self', toName: '', from: myName, note, media: items, secrecy: 'date', kid: true, kidId: me ? me.id : null };
      await store.saveCapsule(cap);
      capNew.note = '';
      const ov = document.createElement('div'); ov.className = 'cap-anim seal'; ov.innerHTML = `<div class="ca-hex">${hexCell('sealed', 0.15)}</div><p>封起來了！</p><small>${ymd(cap.openAt)}再打開</small>`;
      document.body.appendChild(ov); chime();
      setTimeout(() => { ov.remove(); capHome(); }, 1900);
    };
  };
  draw();
}
const isoD = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addM = m => { const d = new Date(); d.setMonth(d.getMonth() + m); d.setHours(9, 0, 0, 0); return d.getTime(); };
async function capOpen(c) {
  await stopRec();
  if (!c.opened) {
    const ov = document.createElement('div'); ov.className = 'cap-anim open'; ov.innerHTML = `<div class="ca-hex">${hexCell('sealed', 1)}</div><p>打開膠囊…</p>`;
    document.body.appendChild(ov); chime();
    await new Promise(r => setTimeout(r, 1600)); ov.remove();
    c.opened = true; c.openedAt = Date.now(); await store.saveCapsule(c);
  }
  const ph = (c.media || []).find(m => m.kind === 'photo'), au = (c.media || []).find(m => m.kind === 'audio');
  k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">${esc(ymd(c.createdAt))}的你</span></header>
    <section class="kcenter" style="justify-content:flex-start">
      <p class="ktip">${esc(ymd(c.createdAt))}，你對現在的自己說：</p>
      ${c.note ? `<p class="kletter">${esc(c.note)}</p>` : ''}
      ${ph ? `<img class="kcapimg" src="${URL.createObjectURL(ph.blob)}" alt="">` : ''}
      ${au ? `<div class="krow"><button class="kbtn main" id="kplay">${icon('play')}聽當時的聲音</button></div>` : ''}
    </section>`;
  $('#home').onclick = capHome;
  if (au) { const a = new Audio(URL.createObjectURL(au.blob)); $('#kplay').onclick = () => a.play(); }
}

function toastKid(msg) { const el = document.getElementById('toast'); el.textContent = msg.replace(/（模擬）/g, ''); el.classList.add('show'); clearTimeout(toastKid.t); toastKid.t = setTimeout(() => el.classList.remove('show'), 2200); }

// ---------- 大童：拍照、錄影、錄音、打星星 ----------
const myMedia = async c => (await store.listMedia(c.id)).filter(m => m.by === 'kid' && (!me || m.kidId === me.id));
const kidKey = () => (me ? me.id : 'kid');
async function bigResult(c, n) {
  await stopRec();
  const head = await stampHead(c);
  const ms = await myMedia(c);
  const ph = ms.filter(m => m.kind === 'photo').length, vd = ms.filter(m => m.kind === 'video').length, au = ms.filter(m => m.kind === 'audio').length;
  const L = KID_LIMITS, r = (c.kidRate || {})[kidKey()] || {};
  if (bigResult.shown !== c.id) { bigResult.shown = c.id; chime(); }
  const full = (have, lim) => (have >= lim ? ' full' : '');
  k.innerHTML = `<section class="kcenter big">
      <div class="khead sm">${head}</div>
      <div class="kstars" role="group" aria-label="給這裡打星星">${[1, 2, 3].map(i => `<button data-st="${i}" class="${(r.s || 0) >= i ? 'on' : ''}" aria-label="${i} 顆星">${icon('star')}</button>`).join('')}</div>
      <div class="kfeel" role="group" aria-label="感覺">${Object.entries(FEELS).map(([key, v]) => `<button data-fe="${key}" class="${r.f === key ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="kshoot">
        <label class="kshot${full(ph, L.photos)}">${icon('camera', 'huge')}<span>拍照</span><small>${ph >= L.photos ? '這站拍滿了' : `${ph}/${L.photos}`}</small>${ph < L.photos ? '<input type="file" accept="image/*" capture="environment" id="kph">' : ''}</label>
        <button class="kshot${full(vd, L.videos)}" id="kvd" ${vd >= L.videos ? 'disabled' : ''}>${icon('play', 'huge')}<span>錄影</span><small>${vd >= L.videos ? '這站錄好了' : `${L.videoSec} 秒`}</small></button>
        <button class="kshot${full(au, L.audios)}" id="kau" ${au >= L.audios ? 'disabled' : ''}>${icon('mic', 'huge')}<span>說一句</span><small>${au >= L.audios ? '這站說好了' : `${L.audioSec} 秒`}</small></button>
      </div>
      <div class="kthumbs">${ms.filter(m => m.thumb).map(m => `<img src="${URL.createObjectURL(m.thumb)}" alt="">`).join('')}</div>
      <div class="krow"><button class="kbtn main" id="gd">${block ? buddySVG('block', 0, 'kbtn-ic') : icon('flower')}看${esc(TH.world)}</button><button class="kbtn" id="fin">${icon('check')}完成</button></div>
    </section>`;
  const rate = async (patch) => { c.kidRate = { ...(c.kidRate || {}), [kidKey()]: { ...r, ...patch } }; await store.saveCheckin(c); bigResult(c, n); };
  k.querySelectorAll('[data-st]').forEach(bt => bt.onclick = () => rate({ s: +bt.dataset.st === r.s ? 0 : +bt.dataset.st }));
  k.querySelectorAll('[data-fe]').forEach(bt => bt.onclick = () => rate({ f: bt.dataset.fe === r.f ? null : bt.dataset.fe }));
  if ($('#kph')) $('#kph').onchange = async e => {
    const files = [...e.target.files].slice(0, L.photos - ph);
    for (const f of files) {
      try {
        const blob = await compressImage(f, CONFIG.photoMax || 1600, 0.82), thumb = await compressImage(f, 400, 0.7);
        await store.saveMedia({ id: uid(), checkinId: c.id, kind: 'photo', blob, thumb, by: 'kid', kidId: me ? me.id : null, star: false, ts: Date.now(), size: blob.size });
      } catch (err) { toastKid('照片存不進去：' + err.message); }
    }
    toastKid('照片收好了！'); bigResult(c, n);
  };
  $('#kvd').onclick = async () => {
    const v = await videoCam(L.videoSec);
    if (!v) return bigResult(c, n);
    const thumb = await videoThumb(v.blob);
    await store.saveMedia({ id: uid(), checkinId: c.id, kind: 'video', blob: v.blob, thumb, by: 'kid', kidId: me ? me.id : null, star: false, ts: Date.now(), size: v.blob.size, dur: v.dur });
    toastKid('影片收好了！'); bigResult(c, n);
  };
  $('#kau').onclick = () => askVoice(c, n);
  $('#kfix').onclick = () => fixPlace(c, () => bigResult(c, n));
  $('#fin').onclick = idle;
  $('#gd').onclick = () => garden(c.id);
}
// 錄音：畫面出一個小問題，15 秒
function askVoice(c, n) {
  const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)], max = KID_LIMITS.audioSec;
  k.innerHTML = `<section class="kcenter big"><p class="ktip">小問題</p><p class="kbig kq">${esc(q)}</p>
    <button class="kmic" id="mic" aria-label="按一下開始說話">${icon('mic', 'huge')}</button>
    <p class="ktip" id="mt">按麥克風開始說（${max} 秒）</p>
    <div class="krow"><button class="kbtn" id="other">換一題</button><button class="kbtn ghost" id="back">不說了</button></div></section>`;
  let left = max;
  $('#other').onclick = () => askVoice(c, n);
  $('#back').onclick = async () => { await stopRec(); bigResult(c, n); };
  $('#mic').onclick = async () => {
    if (curRec) return finish();
    try { curRec = await startRecorder(); } catch (e) { $('#mt').textContent = '麥克風沒有打開，請大人幫忙按「允許」'; return; }
    $('#mic').classList.add('on'); $('#other').hidden = true;
    $('#mt').textContent = `說吧！還有 ${left} 秒，說完再按一次`;
    recTimer = setInterval(() => { left--; $('#mt').textContent = `說吧！還有 ${left} 秒，說完再按一次`; if (left <= 0) finish(); }, 1000);
  };
  async function finish() {
    const blob = await stopRec();
    if (!blob) return;
    await store.saveMedia({ id: uid(), checkinId: c.id, kind: 'audio', blob, by: 'kid', kidId: me ? me.id : null, q, star: false, ts: Date.now(), size: blob.size, dur: Math.max(1, max - left) });
    toastKid('你的聲音收好了！');
    bigResult(c, n);
  }
}
// 錄影：用網頁裡的相機錄，時間到自動停
function videoCam(max) {
  return new Promise(async res => {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }); }
    catch (e) { toastKid('相機沒有打開，請大人幫忙按「允許」'); return res(null); }
    const type = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    const ov = document.createElement('div');
    ov.className = 'kcam';
    ov.innerHTML = `<video playsinline muted autoplay></video><div class="kcam-time" id="kct">${max}</div><div class="kcam-bar"><button class="kbtn ghost" id="kcx">取消</button><button class="kcam-rec" id="kcr" aria-label="開始錄影"><i></i></button><span class="kcam-hint" id="kch">按紅色按鈕開始</span></div>`;
    document.body.appendChild(ov);
    const vid = ov.querySelector('video'); vid.srcObject = stream;
    let rec = null, chunks = [], t0 = 0, timer = null, done = false;
    const close = out => { if (done) return; done = true; clearInterval(timer); stream.getTracks().forEach(t => t.stop()); ov.remove(); res(out); };
    ov.querySelector('#kcx').onclick = () => { if (rec && rec.state !== 'inactive') { rec.onstop = () => close(null); rec.stop(); } else close(null); };
    ov.querySelector('#kcr').onclick = () => {
      if (rec) { if (rec.state !== 'inactive') rec.stop(); return; }
      try { rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch (e) { toastKid('這支手機不能在這裡錄影'); return close(null); }
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => { const dur = Math.min(max, Math.round((Date.now() - t0) / 1000)); close(chunks.length ? { blob: new Blob(chunks, { type: rec.mimeType || type || 'video/mp4' }), dur: Math.max(1, dur) } : null); };
      rec.start(); t0 = Date.now(); ov.classList.add('on');
      ov.querySelector('#kch').textContent = '再按一次停止';
      timer = setInterval(() => { const left = max - Math.floor((Date.now() - t0) / 1000); ov.querySelector('#kct').textContent = Math.max(0, left); if (left <= 0 && rec.state !== 'inactive') rec.stop(); }, 250);
    };
  });
}
// 我的足跡：蓋了幾個章、拍了幾張、說了幾句
async function myStats(kids) {
  let ph = 0, au = 0;
  for (const c of kids) { const ms = await myMedia(c); ph += ms.filter(m => m.kind !== 'audio').length; au += ms.filter(m => m.kind === 'audio').length; }
  const fav = kids.filter(c => ((c.kidRate || {})[kidKey()] || {}).s === 3).length;
  return `<div class="kstats"><span><b>${kids.length}</b>個章</span><span><b>${ph}</b>張照片和影片</span><span><b>${au}</b>句話</span><span><b>${fav}</b>個三顆星</span></div>`;
}

await loadBee();
idle();
