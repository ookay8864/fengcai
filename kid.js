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

const k = $('#k');
let ctx = null, curRec = null, recTimer = null;
// 這是哪個孩子（吊飾網址帶的）；舊吊飾沒帶＝不分是誰
const me = kidFromUrl();
const big = !!(me && me.age === 'big');
const myName = me ? me.name : '小小打卡官';
const mine = c => isKidOf(c, me);
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
  k.innerHTML = `<header class="ktop"><img src="./logo.svg" class="klogo" alt=""><span class="kname">${esc(myName)}</span><button class="kbook" id="gd">${icon('flower')}花園</button><button class="kbook" id="book">${icon('honey')}${big ? '我的足跡' : '章本'} <b>${n}</b></button></header>
    <section class="kcenter">
      <button class="kstamp" id="stamp">${beeSVG('huge')}<span>按我蓋章！</span></button>
      <p class="ktip">到了新地方，碰一下吊飾，再按上面的大按鈕</p>
      ${isDemo() ? '<p class="ktip sm">（現在是模擬模式）</p>' : ''}
    </section>
    <a class="kfuture" href="index.html#capsule/kid"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" fill="var(--cap-wax)" stroke="var(--cap-rim)" stroke-width="1.6"/></svg>給未來的自己</a>
    ${big ? '' : '<a class="kadult" href="index.html">大人頁面</a>'}`;
  $('#stamp').onclick = go;
  $('#book').onclick = book;
  $('#gd').onclick = () => garden();
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

async function save(pos, p, trip, n) {
  await ensureDayTheme(trip, p);
  // 大人剛在這裡打過卡：把章蓋在同一站（用大人選好的地點名稱）
  const merge = await findMergeTarget(trip.id, p, pos, 'kid', me && me.id);
  if (merge) {
    const ids = [...new Set([...(merge.kidIds || []), ...(me ? [me.id] : [])])];
    Object.assign(merge, { kid: true, kidIds: ids, kidTs: Date.now() });
    if (merge.adult == null) merge.adult = merge.by !== 'kid';
    await store.saveCheckin(merge);
    askPersist();
    return result(merge, n);
  }
  const c = { id: uid(), tripId: trip.id, ts: Date.now(), lat: pos.lat, lng: pos.lng, acc: pos.acc, placeName: p.name, placeType: p.type || '', poiId: p.id || '', by: 'kid', kid: true, adult: false, kidIds: me ? [me.id] : [], confirmed: false, note: '' };
  await store.saveCheckin(c);
  askPersist();
  result(c, n);
}

function result(c, n) {
  if (big) return bigResult(c, n);
  const b = BADGES[badgeOf(c.placeType)];
  k.innerHTML = '';
  chime();
  k.innerHTML = `<section class="kcenter">
      <div class="kres"><div class="petals">${Array.from({ length: 8 }, (_, i) => `<i style="--r:${i * 45}deg"></i>`).join('')}</div>
        <div class="khex">${icon(b.icon, 'huge')}<span>${esc(b.name)}</span></div></div>
      <p class="kbig">蓋章成功！</p>
      <p class="kplace">${esc(c.placeName)}</p>
      <p class="ktip">這趟旅行的第 <b>${n}</b> 個章</p>
      <button class="kmic" id="mic" aria-label="按一下開始說話">${icon('mic', 'huge')}</button>
      <p class="ktip" id="mt">按麥克風，說一句你現在的感覺（${CONFIG.kidRecordSec} 秒）</p>
      <div class="krow" id="after"></div>
      <div class="krow"><button class="kbtn main" id="gd">${icon('flower')}看花園長大</button><button class="kbtn" id="fin">${icon('check')}完成</button></div>
    </section>`;
  micFlow(c);
  $('#fin').onclick = idle;
  $('#gd').onclick = () => garden(c.id);
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

// ---------- 我的章本 ----------
async function book() {
  await stopRec();
  const t = await ensureActiveTrip();
  const kids = (await store.listCheckins(t.id)).filter(mine);
  const count = {};
  kids.forEach(c => { const b = badgeOf(c.placeType); count[b] = (count[b] || 0) + 1; });
  const blanks = Math.max(0, (Math.ceil((kids.length + 1) / 3) * 3) - kids.length);
  k.innerHTML = `<header class="ktop"><button class="kbtn ghost" id="home" style="min-height:46px;font-size:17px">${icon('back')}回去</button><span class="kname" style="text-align:right">${esc(t.name)}</span></header>
    <p class="kbig" style="text-align:center">${big ? '我的足跡' : '我的章本'}</p>
    ${big ? await myStats(kids) : ''}
    <div class="kcount">${Object.entries(count).map(([key, v]) => `<span>${icon(BADGES[key].icon)}${esc(BADGES[key].name)} × ${v}</span>`).join('') || '<span>還沒有章，快去蓋第一個！</span>'}</div>
    <div class="comb">
      ${kids.map(c => { const b = BADGES[badgeOf(c.placeType)]; return `<div class="cell">${icon(b.icon)}${esc(c.placeName.replace(/（模擬）/, ''))}<small>${fmtDate(c.ts).replace(/ 週.$/, '')}</small></div>`; }).join('')}
      ${Array.from({ length: blanks }, () => '<div class="cell empty"></div>').join('')}
    </div>`;
  $('#home').onclick = idle;
}

// ---------- 花園地圖：雲朵慢慢散開 ----------
async function garden(newestId) {
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
    <div class="krow"><button class="kbtn" id="bk">${icon('honey')}看章本</button></div>`;
  $('#home').onclick = idle;
  $('#bk').onclick = book;
  k.querySelectorAll('.pick').forEach(g => g.onclick = () => { const c = kids.find(x => x.id === g.dataset.id); if (c) toastKid(c.placeName); });
}
function toastKid(msg) { const el = document.getElementById('toast'); el.textContent = msg.replace(/（模擬）/g, ''); el.classList.add('show'); clearTimeout(toastKid.t); toastKid.t = setTimeout(() => el.classList.remove('show'), 2200); }

// ---------- 大童：拍照、錄影、錄音、打星星 ----------
const myMedia = async c => (await store.listMedia(c.id)).filter(m => m.by === 'kid' && (!me || m.kidId === me.id));
const kidKey = () => (me ? me.id : 'kid');
async function bigResult(c, n) {
  await stopRec();
  const b = BADGES[badgeOf(c.placeType)];
  const ms = await myMedia(c);
  const ph = ms.filter(m => m.kind === 'photo').length, vd = ms.filter(m => m.kind === 'video').length, au = ms.filter(m => m.kind === 'audio').length;
  const L = KID_LIMITS, r = (c.kidRate || {})[kidKey()] || {};
  if (!bigResult.shown) { bigResult.shown = c.id; chime(); } else if (bigResult.shown !== c.id) { bigResult.shown = c.id; chime(); }
  const full = (have, lim) => (have >= lim ? ' full' : '');
  k.innerHTML = `<section class="kcenter big">
      <div class="kres sm"><div class="khex">${icon(b.icon, 'huge')}<span>${esc(b.name)}</span></div></div>
      <p class="kbig">蓋章成功！</p>
      <p class="kplace">${esc(c.placeName.replace(/（模擬）/, ''))}</p>
      <p class="ktip">第 <b>${n}</b> 個章</p>
      <div class="kstars" role="group" aria-label="給這裡打星星">${[1, 2, 3].map(i => `<button data-st="${i}" class="${(r.s || 0) >= i ? 'on' : ''}" aria-label="${i} 顆星">${icon('star')}</button>`).join('')}</div>
      <div class="kfeel" role="group" aria-label="感覺">${Object.entries(FEELS).map(([key, v]) => `<button data-fe="${key}" class="${r.f === key ? 'on' : ''}">${v}</button>`).join('')}</div>
      <div class="kshoot">
        <label class="kshot${full(ph, L.photos)}">${icon('camera', 'huge')}<span>拍照</span><small>${ph >= L.photos ? '這站拍滿了' : `${ph}/${L.photos}`}</small>${ph < L.photos ? '<input type="file" accept="image/*" capture="environment" id="kph">' : ''}</label>
        <button class="kshot${full(vd, L.videos)}" id="kvd" ${vd >= L.videos ? 'disabled' : ''}>${icon('play', 'huge')}<span>錄影</span><small>${vd >= L.videos ? '這站錄好了' : `${L.videoSec} 秒`}</small></button>
        <button class="kshot${full(au, L.audios)}" id="kau" ${au >= L.audios ? 'disabled' : ''}>${icon('mic', 'huge')}<span>說一句</span><small>${au >= L.audios ? '這站說好了' : `${L.audioSec} 秒`}</small></button>
      </div>
      <div class="kthumbs">${ms.filter(m => m.thumb).map(m => `<img src="${URL.createObjectURL(m.thumb)}" alt="">`).join('')}</div>
      <div class="krow"><button class="kbtn main" id="gd">${icon('flower')}看花園</button><button class="kbtn" id="fin">${icon('check')}完成</button></div>
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
