// 蜂采 大人頁面
import { CONFIG, getSetting, setSetting } from './config.js';
import { store, ensureActiveTrip, getActiveId, setActiveId, askPersist, isKid, isAdult, findMergeTarget, getMode, startTrip, resumeTrip, endTrip, isDaily, moveDaysToTrip, moveToDaily, dailyId } from './store.js';
import { getPosition, peekPosition, nearby, searchPlaces, inMainland, badgeOf, BADGES, shortType, isDemo, demoOff, amapLink, testAMap, distM, regionName } from './geo.js';
import { compressImage, videoThumb, startRecorder, blobDims } from './media.js';
import { mountMap, gardenSVG, dayInfo, defaultDay, markerSVG, markerNumSVG, whoText, isDailyC, mergeDaily } from './map.js';
import { allThemes, getTheme, themeIcon, itemIcon, ITEMS, GROUNDS, listCustom, saveCustom, deleteCustom } from './themes.js';
import { getKids, kidById, newKid, upsertKid, removeKid, kidUrl, colorHex, KID_COLORS, FEELS, beeColorOf } from './kids.js';
import { collect, renderPostcard, DEFAULT_PC, PALETTES, TEMPLATES, SIZES, MAX_PC_PHOTOS } from './postcard.js';
import { makeVideo, estimate, canMakeVideo, selectVisuals, layoutItems, stopDuration, voiceLen, isLand, PER_STOP } from './video.js';
import { TRACKS } from './music.js';
import { $, esc, toast, confirmDlg, inputDlg, fmtTime, fmtDate, dayKey, uid, icon } from './ui.js';
import { loadBee, beeSVG } from './bee.js';
import { kidHead, planMerge, applyMerge, findStrays, moveStrays, kidData, myStopsOn, copyToMine, addBees } from './kidsync.js';
import { initCapsule, hiveView, createView, checkDue, capsuleDays, memHTML, fillMemThumbs, viewCapsule, openedCapsules, anniversaryToday, dismissAnniversary, yearWord } from './capsule.js';

const view = $('#view'), sheet = $('#sheet'), sb = $('#sheetbody');
const MAX = CONFIG.maxVisualPerPlace, MAX_VIDEOS = 2;

// ---------- 圖片網址管理（避免記憶體一直增加） ----------
let urls = [];
const ou = b => { if (!b) return ''; const u = URL.createObjectURL(b); urls.push(u); return u; };
const freeUrls = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };

// ---------- 路由 ----------
let curMap = null, mapFrom = null;
async function route(keepScroll = false) {
  freeUrls(); view.classList.remove('pcpage', 'pc-editing');
  if (curMap) { curMap.destroy(); curMap = null; }
  const [r, id] = location.hash.slice(1).split('/');
  const dailyId = (id || '').startsWith('daily-');
  const tab = r === 'daily' || (r === 'trip' && dailyId) ? 'daily' : r === 'trip' || r === 'c' || r === 'trips' || r === 'card' || r === 'video' || r === 'hive' || r === 'capsule' ? 'trips' : r === 'settings' ? 'settings' : r === 'kids' ? 'kids' : r === 'map' ? (mapFrom || 'trips') : 'home';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab));
  const kt = document.querySelector('#tabs [data-t="kids"]'); if (kt) kt.hidden = !(kidOn() && getKids().length);
  if (r !== 'map') mapFrom = tab === 'daily' ? 'daily' : tab === 'kids' ? 'kids' : 'trips';
  try {
    if (r === 'trips') await trips();
    else if (r === 'daily') await dailyView();
    else if (r === 'kids') await kidsView();
    else if (r === 'trip' && dailyId_(id)) { location.replace('#daily'); return; }
    else if (r === 'trip') await trip(id);
    else if (r === 'c') await checkin(id);
    else if (r === 'settings') await settings();
    else if (r === 'map') await mapView(id);
    else if (r === 'card') await cardView(id);
    else if (r === 'video') await videoView(id);
    else if (r === 'hive') await hiveView();
    else if (r === 'capsule') await createView(id);
    else await home();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="err">發生錯誤：${esc(e.message)}</p>`;
  }
  if (r === 'daily' && dailyScroll != null && !keepScroll) { const y = dailyScroll; dailyScroll = null; requestAnimationFrame(() => window.scrollTo(0, y)); }
  else if (!keepScroll) window.scrollTo(0, 0);
  lastR = r;
}
const dailyId_ = id => (id || '').startsWith('daily-');
let lastR = null, dailyScroll = null;
const rerender = () => route(true);
// 時光膠囊用到的共用工具；打開蜂采時檢查有沒有到期的膠囊
initCapsule({ view, ou, overlay: (h) => overlay(h), openSheet: (h) => openSheet(h), closeSheet: () => closeSheet(), rerender });
setTimeout(() => checkDue().catch(e => console.warn(e)), 300);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDue().catch(() => {}); });
window.addEventListener('hashchange', () => { document.querySelector('.snack')?.remove(); if (lastR === 'daily') dailyScroll = window.scrollY; route(); });

// ---------- 共用：打卡卡片 ----------
async function withMedia(cs) { return Promise.all(cs.map(async c => ({ c, m: await store.listMedia(c.id) }))); }
function cardHTML({ c, m }) {
  const vis = m.filter(x => x.kind !== 'audio'), aud = m.filter(x => x.kind === 'audio');
  const b = BADGES[badgeOf(c.placeType)];
  const tags = [
    isKid(c) ? `<span class="tag kid">${isAdult(c) ? '孩子＋大人' : '孩子蓋章'}</span>` : '',
    isKid(c) && !c.confirmed ? '<span class="tag warn">待確認</span>' : '',
    !m.length ? '<span class="tag">待補</span>' : ''
  ].join('');
  const th = vis.slice(0, 4).map(x => (x.thumb ? `<img src="${ou(x.thumb)}" alt=""${fpos(x)}>` : `<span class="vph">${icon('play')}</span>`)).join('');
  return `<a class="card" href="#c/${c.id}">
    <div class="card-ic">${icon(b.icon)}</div>
    <div class="card-main">
      <div class="card-t">${esc(c.placeName)}</div>
      <div class="card-s">${fmtTime(c.ts)} ${tags}</div>
      ${vis.length ? `<div class="thumbs">${th}${vis.length > 4 ? `<span class="more">+${vis.length - 4}</span>` : ''}</div>` : ''}
    </div>
    ${aud.length ? `<span class="aud">${icon('mic')}${aud.length}</span>` : ''}
  </a>`;
}
const topbar = (gear = true) => `<header class="top"><img src="./logo.svg" class="logo" alt=""><div><h1>蜂采</h1><p class="sub">飛到哪，甜到哪</p></div>${gear ? `<a class="topgear" href="#settings" aria-label="設定">${icon('gear')}</a>` : ''}</header>`;

// ---------- 孩子打卡：可以開或關（沒有孩子的人就看不到孩子相關的東西） ----------
const kidOn = () => getSetting('kidMode') !== 'off';
// 第一次打開時問一次；已經有孩子蓋章的人直接開著
async function askKidMode() {
  if (getSetting('kidMode')) return;
  // 正在打卡或有其他視窗開著時先不問，下次回到首頁再問
  if (!sheet.hidden || document.querySelector('.dlg, .cap-anim') || (location.hash && location.hash !== '#')) return;
  for (const t of await store.listTrips()) if ((await store.listCheckins(t.id)).some(isKid)) { setSetting('kidMode', 'on'); return; }
  const ov = overlay(`<h2 class="h2" style="margin-top:0">${icon('flower')}有孩子跟你一起打卡嗎？</h2>
    <p class="muted" style="margin-top:0">有的話，孩子會有自己的打卡頁，地圖上也能分開看大人和孩子去過的地方。</p>
    <div class="row"><button class="btn main" id="kyes">有</button><button class="btn" id="kno">沒有</button></div>
    <p class="muted sm">之後可以在「設定」裡改。</p>`);
  ov.classList.add('kidask');
  ov.querySelector('#kyes').onclick = () => { setSetting('kidMode', 'on'); ov.remove(); rerender(); };
  ov.querySelector('#kno').onclick = () => { setSetting('kidMode', 'off'); ov.remove(); rerender(); };
}

// 模擬模式開著時，首頁和地圖上方都會提醒，一鍵就能關
const demoBar = () => (isDemo() ? `<div class="demobar">${icon('bee')}<span><b>模擬模式開著</b>打卡位置會換成雲南的示範地點</span><button class="btn sm" id="demooff">關閉</button></div>` : '');
function bindDemoBar() { const b = $('#demooff'); if (b) b.onclick = () => { demoOff(); toast('已關閉模擬模式，之後打卡用你真正的位置'); rerender(); }; }

// ---------- 首頁 ----------
async function home() {
  const t = await ensureActiveTrip();
  const meta = await withMedia(await store.listCheckins(t.id));
  const kidP = meta.filter(x => isKid(x.c) && !x.c.confirmed).length;
  const empty = meta.filter(x => !x.m.length).length;
  const recent = meta.slice(-5).reverse();
  view.innerHTML = `${topbar()}
    ${demoBar()}${modeBar(t)}<div id="annbox"></div>
    <section class="hero">
      <button class="hexbtn" id="go">${icon('bee', 'big')}<span>打卡這裡</span></button>
      <p class="hint">${isDemo() ? '模擬模式：位置會依序換成雲南的示範地點' : '碰一下大人吊飾，或按上面的按鈕'}</p>
    </section>
    ${kidP || empty ? `<section class="todo">
      ${kidP ? `<a class="todo-i" href="#trip/${t.id}">${icon('honey')}<span>孩子蓋了 <b>${kidP}</b> 個章，等你確認</span></a>` : ''}
      ${empty ? `<a class="todo-i" href="#trip/${t.id}">${icon('camera')}<span><b>${empty}</b> 個地點還沒補照片或聲音</span></a>` : ''}
    </section>` : ''}
    <h2 class="h2">最近打卡</h2>
    ${recent.length ? `<div class="cards">${recent.map(cardHTML).join('')}</div>` : '<p class="empty">還沒有打卡。出門玩的時候碰一下吊飾，第一朵花就會開在這裡。</p>'}`;
  $('#go').onclick = startCheckin;
  bindModeBar(); bindDemoBar();
  setTimeout(() => askKidMode().catch(() => {}), 600);
  // 回憶日：膠囊打開滿一年、兩年…的那天
  anniversaryToday().then(ann => {
    const box = $('#annbox'); if (!ann || !box) return;
    box.innerHTML = `<div class="anncard"><button class="ann-x" aria-label="今天不再顯示">×</button><p class="ann-t"><i class="cd-cap lg"></i>${yearWord(ann.years)}年前的今天</p><p class="ann-s">你打開了${ann.c.from ? `${esc(ann.c.from)}給你的` : '一顆'}時光膠囊</p><button class="btn sm main" id="annopen">再看一次</button></div>`;
    $('#annopen').onclick = () => viewCapsule(ann.c.id);
    box.querySelector('.ann-x').onclick = () => { dismissAnniversary(ann.key); box.innerHTML = ''; };
  }).catch(() => {});
}

// 日常／旅行中 的滑動開關：左＝旅行、右＝日常
function modeBar(t) {
  const trip = !isDaily(t);
  return `<div class="modebar${trip ? ' trip' : ''}">
    <div class="mswitch${trip ? ' is-trip' : ''}" id="msw" role="switch" aria-checked="${trip}" aria-label="旅行或日常" tabindex="0"><span class="ms-k" id="msk"></span><span class="ms-l">${icon('trip')}旅行</span><span class="ms-r">${icon('flower')}日常</span></div>
    <p class="ms-info">${trip ? `<span>旅行中：<a href="#trip/${t.id}"><b>${esc(t.name)}</b></a></span><button class="ms-ren" id="msren" aria-label="改名">${icon('edit')}改名</button>` : `<span>打卡會記在「<a href="#trip/${t.id}">${esc(t.name.replace(/^\d+ 年 /, ''))}</a>」，往左滑開始旅行</span>`}</p>
  </div>`;
}
const pad2 = n => String(n).padStart(2, '0');
async function newTrip() {
  const d = new Date(), names = (await store.listTrips()).map(x => x.name);
  let name = `${d.getMonth() + 1}月${d.getDate()}日出發`, k = 2;
  while (names.includes(name)) name = `${d.getMonth() + 1}月${d.getDate()}日出發（${k++}）`;
  await startTrip(name, { nameAuto: true });
  return name;
}
// 滑到旅行：12 小時內剛結束的那趟就自動接回；否則開新的。不跳問題，下方提示可以改
async function goTrip() {
  const recent = (await store.listTrips()).filter(x => !isDaily(x) && x.endedAt && Date.now() - x.endedAt < 12 * 3600e3).sort((p, q) => q.endedAt - p.endedAt)[0];
  if (recent) {
    delete recent.endedAt; await store.saveTrip(recent); resumeTrip(recent.id);
    snack(`繼續：${recent.name}`, '改成新的旅行', async () => {
      recent.endedAt = Date.now(); await store.saveTrip(recent);
      const n = await newTrip(); toast(`出發！之後的打卡都放進「${n}」`); rerender();
    }, 6000);
    return;
  }
  const name = await newTrip();
  toast(`出發！之後的打卡都放進「${name}」`);
}
// ---------- 收大童傳來的打卡：列出每一站要併到哪裡，勾選後合併 ----------
async function receiveKid(file) {
  let head, items;
  try {
    head = await kidHead(file);
    if (!head) { toast('這不是孩子的打卡檔或孩子手機的備份'); return; }
    items = await planMerge(head);
  } catch (e) { toast(e.message || '讀不出這個檔案'); return; }
  const who = head.kid ? head.kid.name : '孩子';
  const todo = items.filter(x => x.kind !== 'dup'), dup = items.length - todo.length;
  const nm = s => esc(cleanName(s || ''));
  const label = x => x.kind === 'more' ? `補 ${x.ms.length} 個照片、影片或聲音` : '新的一站';
  let html = `<h2 class="h2" style="margin-top:0">${icon('honey')}${esc(who)} 傳來 ${items.length} 站</h2>`;
  if (!todo.length) html += `<p>這些都已經收過了，不用再合併。</p><div class="row"><button class="btn main" data-a="x">知道了</button></div>`;
  else {
    let day = '';
    html += '<div class="places">';
    todo.forEach(x => {
      const ts = x.k.kidTs || x.k.ts, d = fmtDate(ts);
      if (d !== day) { day = d; html += `<p class="kr-day">${esc(d)}</p>`; }
      const nf = x.ms.length;
      html += `<label class="place"><input type="checkbox" data-i="${items.indexOf(x)}" checked><span class="pl-t"><span>${fmtTime(ts)} <b>${nm(x.k.placeName)}</b>${nf && x.kind !== 'more' ? ` <span class="kr-n">${icon('camera')}${nf}</span>` : ''}</span><small>${label(x)}</small></span></label>`;
    });
    html += `</div>${dup ? `<p class="muted sm">${dup} 站已經收過，自動略過</p>` : ''}
      <p class="muted sm">會放在「孩子」分頁，不會跟你的旅行混在一起，也不會改掉你的資料。想要的照片、錄音，再從孩子頁加到你的那一天。</p>
      <div class="row"><button class="btn" data-a="x">取消</button><button class="btn main" data-a="ok" id="krok"></button></div>`;
  }
  const ov = overlay(html);
  const boxes = [...ov.querySelectorAll('[data-i]')];
  const cnt = () => { const n = boxes.filter(b => b.checked).length, b = ov.querySelector('#krok'); if (b) { b.textContent = n ? `加入 ${n} 站` : '沒有勾選'; b.disabled = !n; } };
  boxes.forEach(b => b.onchange = cnt); cnt();
  ov.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'x') ov.remove();
    if (a === 'ok') {
      const pick = boxes.filter(b => b.checked).map(b => items[+b.dataset.i]);
      e.target.disabled = true; e.target.textContent = '加入中…';
      const r = await applyMerge(head, pick);
      ov.remove();
      if (r.bad) await confirmDlg(`加入了 ${r.stops} 站、${r.files} 個照片影片聲音，有 ${r.bad} 個檔案沒存進去。可以請${esc(who)}再傳一次，已經收過的會自動略過。`, '知道了', '');
      else toast(`已加入 ${who} 的 ${r.stops} 站${r.files ? `、${r.files} 個照片影片聲音` : ''}`);
      location.hash = 'kids';
    }
  };
}

// ---------- 備份：分享選單 → 儲存到檔案 ----------
async function doBackup(part, label = '') {
  toast(part === 'all' ? '正在打包完整備份…' : '正在打包新增的部分…');
  try {
    const st = await store.backupStatus();
    if (part === 'new' && st.last && !st.any) { toast('上次備份之後沒有新增，不用再備份'); return false; }
    const { blob, ids } = await store.exportAll(part);
    const d = new Date(), ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const name = `蜂采備份-${ymd}-${part === 'all' ? '完整' : (label || '新增').replace(/[\\/:*?"<>|]/g, '')}.fcbak`;
    const file = new File([blob], name, { type: 'application/octet-stream' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    await store.markBackup(ids, part === 'all');
    toast(part === 'all' ? '完整備份好了！之前的小檔案可以刪掉' : '備份好了');
    return true;
  } catch (e) { if (e.name !== 'AbortError') toast('備份失敗：' + e.message); return false; }
}
// 旅行結束：問一下要不要備份
async function backupPrompt(t) {
  const st = await store.backupStatus();
  if (!st.any) return;
  const parts = [st.n.photo && `${st.n.photo} 張照片`, st.n.video && `${st.n.video} 段影片`, st.n.audio && `${st.n.audio} 段聲音`].filter(Boolean);
  const ov = overlay(`<h2 class="h2" style="margin-top:0">${icon('check')}旅行結束了！要備份嗎？</h2>
    <p class="muted" style="margin-top:0">上次備份之後新增了${parts.length ? ` ${parts.join('、')}` : '一些打卡'}。按「備份」後選「儲存到檔案」，放進「蜂采備份」資料夾。</p>
    <div class="row"><button class="btn" id="bklater">下次再說</button><button class="btn main" id="bkgo">${icon('check')}備份</button></div>`);
  ov.querySelector('#bklater').onclick = () => ov.remove();
  ov.querySelector('#bkgo').onclick = async () => { ov.remove(); await doBackup('new', t.name); };
}
async function goDaily() {
  const t = await ensureActiveTrip();
  if (isDaily(t)) return;
  endTrip(); t.endedAt = Date.now(); await store.saveTrip(t);
  const cs = await store.listCheckins(t.id);
  const undo = async () => { delete t.endedAt; await store.saveTrip(t); resumeTrip(t.id); toast('已回到旅行'); rerender(); };
  if (t.nameAuto && cs.length) nameCard(t, cs, undo);
  else { snack('歡迎回家，已回到日常', '復原', undo); if (cs.length) setTimeout(() => { if (!getActiveId() || getMode() !== 'trip') backupPrompt(t); }, 1800); }
}
// 旅行結束：依照去過的地方建議名字
function nameSuggest(t, cs) {
  const nm = s => String(s || '').replace(/（模擬）/g, '').trim();
  const places = [...new Set(cs.map(c => nm(c.placeName)).filter(Boolean))];
  const short = s => (s.length > 6 ? s.slice(0, 6) : s);
  const days = new Set(cs.map(c => dayKey(c.ts))).size, d = new Date(cs[0].ts);
  const A = short(places[0] || ''), B = places.length > 1 ? short(places[places.length - 1]) : '';
  const dn = days === 1 ? '一日遊' : `${days} 日`;
  return [...new Set([B ? `${A}・${B} ${dn}` : `${A} ${dn}`, `${d.getMonth() + 1}月 ${A}之旅`, `${d.getFullYear()} 年 ${d.getMonth() + 1} 月的小旅行`])];
}
function nameCard(t, cs, undo) {
  const sug = nameSuggest(t, cs);
  const ov = overlay(`<h2 class="h2" style="margin-top:0">${icon('flower')}歡迎回家！</h2>
    <p class="muted" style="margin-top:0">幫這趟旅行取個名字？點一個就好，之後也能再改。</p>
    <div class="namesug">${sug.map((s, i) => `<button data-s="${i}">${esc(s)}</button>`).join('')}</div>
    <label class="lbl" for="nmin">或自己寫</label><input id="nmin" class="inp" maxlength="24" placeholder="${esc(t.name)}">
    <div class="row"><button class="btn" id="nmskip">先不用</button><button class="btn main" id="nmok">${icon('check')}好</button></div>
    <a class="linkbtn" href="#capsule/new" id="nmcap" style="display:block;margin:10px auto 0;text-align:center">${icon('flower')}幫這趟旅行埋一顆時光膠囊</a>
    <button class="linkbtn" id="nmundo" style="display:block;margin:8px auto 0">不小心滑到的？回到旅行</button>`);
  const save = async name => { if (name) { t.name = name; t.nameAuto = false; await store.saveTrip(t); toast(`已命名為「${name}」`); } ov.remove(); rerender(); setTimeout(() => backupPrompt(t), 600); };
  ov.querySelectorAll('[data-s]').forEach(b => b.onclick = () => save(sug[+b.dataset.s]));
  ov.querySelector('#nmok').onclick = () => save(ov.querySelector('#nmin').value.trim());
  ov.querySelector('#nmskip').onclick = () => save('');
  ov.querySelector('#nmundo').onclick = () => { ov.remove(); undo(); };
  ov.querySelector('#nmcap').onclick = () => { ov.remove(); };
}
// 底部提示＋一個按鈕（例如「復原」）
function snack(msg, label, fn, ms = 5000) {
  document.querySelector('.snack')?.remove();
  const el = document.createElement('div');
  el.className = 'snack'; el.innerHTML = `<span>${esc(msg)}</span><button>${esc(label)}</button>`;
  document.body.appendChild(el);
  const tm = setTimeout(() => el.remove(), ms);
  el.querySelector('button').onclick = () => { clearTimeout(tm); el.remove(); fn(); };
}
function bindModeBar() {
  const sw = $('#msw'); if (!sw) return;
  const k = $('#msk');
  let trip = sw.classList.contains('is-trip'), sx = null, moved = false, busy = false;
  const span = () => sw.clientWidth / 2;
  const set = async toTrip => {
    if (busy || toTrip === trip) { k.style.transform = ''; return; }
    busy = true; trip = toTrip;
    sw.classList.toggle('is-trip', toTrip); sw.setAttribute('aria-checked', toTrip); k.style.transform = '';
    await new Promise(r => setTimeout(r, 260));
    if (toTrip) await goTrip(); else await goDaily();
    busy = false; rerender();
  };
  sw.addEventListener('pointerdown', e => { sx = e.clientX; moved = false; sw.setPointerCapture(e.pointerId); k.style.transition = 'none'; });
  sw.addEventListener('pointermove', e => {
    if (sx == null) return;
    const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true;
    const base = trip ? 0 : span(), x = Math.max(0, Math.min(span(), base + dx));
    k.style.transform = `translateX(${x - base}px)`;
  });
  sw.addEventListener('pointerup', e => {
    if (sx == null) return;
    const dx = e.clientX - sx; sx = null; k.style.transition = '';
    if (!moved) { set(!trip); return; }
    const base = trip ? 0 : span();
    set(base + dx < span() / 2);
  });
  sw.addEventListener('pointercancel', () => { sx = null; k.style.transition = ''; k.style.transform = ''; });
  sw.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(!trip); } if (e.key === 'ArrowLeft') set(true); if (e.key === 'ArrowRight') set(false); };
  if ($('#msren')) $('#msren').onclick = async () => {
    const t = await ensureActiveTrip();
    const n = await inputDlg('旅行的名字', t.name);
    if (n) { t.name = n; t.nameAuto = false; await store.saveTrip(t); rerender(); }
  };
}

// ---------- 打卡流程 ----------
let activeRec = null;
function openSheet(html) { sb.innerHTML = html; sheet.hidden = false; document.body.classList.add('noscroll'); }
async function closeSheet() {
  if (activeRec) { try { await activeRec.stop(); } catch (e) {} activeRec = null; }
  sheet.hidden = true; sb.innerHTML = ''; document.body.classList.remove('noscroll');
  rerender();
}
$('#sheetx').onclick = closeSheet;

async function startCheckin() {
  openSheet(`<div class="center"><div class="spin">${icon('bee', 'big')}</div><p class="big-n">正在找你在哪裡…</p></div>`);
  let pos;
  try { pos = await getPosition(); } catch (e) {
    sb.innerHTML = `<h2 class="h2">定位沒有成功</h2><p class="err">${esc(e.message)}</p>
      <div class="stack"><button class="btn main" id="retry">再試一次</button><button class="btn" id="manual">不定位，直接輸入地點名稱</button></div>`;
    $('#retry').onclick = startCheckin;
    $('#manual').onclick = () => pickPlace({ lat: null, lng: null, acc: null }, []);
    return;
  }
  sb.innerHTML = `<div class="center"><div class="spin">${icon('bee', 'big')}</div><p class="big-n">找到了！正在看附近有什麼…</p><p class="muted">誤差約 ${pos.acc} 公尺</p></div>`;
  let list = [];
  try { list = await nearby(pos.lat, pos.lng); } catch (e) { toast(e.message); }
  pickPlace(pos, list);
}

// 輸入兩個字以上，自動用高德找地點；點一筆就用那個地點的準確位置
function bindPlaceSearch(input, box, near, onChoose, onType) {
  let tm = null, seq = 0;
  input.addEventListener('input', () => {
    onType && onType();
    const kw = input.value.trim();
    clearTimeout(tm);
    if (kw.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = `<p class="sug-msg">搜尋中…</p>`;
    tm = setTimeout(async () => {
      const my = ++seq;
      let list = [];
      try { list = await searchPlaces(kw, near); } catch (e) {}
      if (my !== seq) return;
      box.innerHTML = list.length
        ? list.map((p, i) => `<button type="button" class="sug" data-i="${i}"><span class="pl-ic">${icon(BADGES[badgeOf(p.type)].icon)}</span><span class="pl-t">${esc(p.name)}<small>${esc(p.address || shortType(p.type))}${p.dist != null ? ` · ${p.dist < 1000 ? p.dist + ' 公尺' : (p.dist / 1000).toFixed(1) + ' 公里'}` : ''}</small></span></button>`).join('')
        : `<p class="sug-msg">找不到符合的地點，可以直接用你打的名字打卡。</p>`;
      box.querySelectorAll('.sug').forEach(b => b.onclick = () => { const p = list[+b.dataset.i]; input.value = p.name; box.innerHTML = ''; onChoose(p); });
    }, 350);
  });
}

function pickPlace(pos, list) {
  const L = list.slice(0, 15);
  const noKey = false;
  let chosen = null;
  openSheet(`<h2 class="h2">你在哪裡？</h2>
    <input id="manual" class="inp" placeholder="輸入地點名稱搜尋，例如：寶安圖書館" autocomplete="off" enterkeyhint="search">
    <div class="sugs" id="sugs"></div>
    <p class="chosen" id="chosen" hidden></p>
    <p class="lbl" style="margin-top:14px">附近的地點${pos.acc ? `<small class="muted">　定位誤差約 ${pos.acc} 公尺${isDemo() ? '（模擬）' : ''}</small>` : ''}</p>
    ${L.length ? `<div class="places">${L.map((p, i) => `<label class="place"><input type="radio" name="pl" value="${i}" ${i === 0 ? 'checked' : ''}><span class="pl-ic">${icon(BADGES[badgeOf(p.type)].icon)}</span><span class="pl-t">${esc(p.name)}<small>${esc(shortType(p.type))}${p.dist ? ` · ${p.dist} 公尺` : ''}</small></span></label>`).join('')}</div>`
      : `<p class="note">${noKey && pos.lat != null ? '還沒設定高德地圖金鑰，所以沒有附近地點清單（可到「設定」填寫）。' : '附近找不到地點資料。'}請在上面輸入地點名稱。</p>`}
    <div class="row sheet-act"><button class="btn main" id="ok">${icon('check')}確認打卡</button>${pos.lat != null ? '<button class="btn" id="relo">重新定位</button>' : ''}</div>`);
  if ($('#relo')) $('#relo').onclick = startCheckin;
  const showChosen = () => { const el = $('#chosen'); el.hidden = !chosen; if (chosen) el.innerHTML = `${icon('check')}已選：<b>${esc(chosen.name)}</b>${chosen.address ? `<small>${esc(chosen.address)}</small>` : ''}`; };
  bindPlaceSearch($('#manual'), $('#sugs'), pos, p => { chosen = p; sb.querySelectorAll('input[name=pl]').forEach(x => { x.checked = false; }); showChosen(); },
    () => { chosen = null; showChosen(); if ($('#manual').value.trim()) sb.querySelectorAll('input[name=pl]').forEach(x => { x.checked = false; }); });
  sb.querySelectorAll('input[name=pl]').forEach(x => x.addEventListener('change', () => { chosen = null; $('#manual').value = ''; $('#sugs').innerHTML = ''; showChosen(); }));
  $('#ok').onclick = async () => {
    const man = $('#manual').value.trim();
    const sel = sb.querySelector('input[name=pl]:checked');
    const p = chosen && chosen.name === man ? chosen : man ? { name: man, type: '', id: '' } : sel ? L[+sel.value] : null;
    if (!p) { toast('請選一個地點，或輸入名稱'); return; }
    // 從搜尋選的地點：用那個地點的準確位置
    if (p === chosen && chosen.lat != null) pos = { lat: chosen.lat, lng: chosen.lng, acc: 0 };
    const t = await ensureActiveTrip();
    // 孩子剛在這裡蓋過章：合成同一站
    const merge = await findMergeTarget(t.id, p, pos, 'adult');
    if (merge) {
      Object.assign(merge, { kid: true, adult: true, placeName: p.name, placeType: p.type || merge.placeType, poiId: p.id || merge.poiId, confirmed: true });
      if (pos.lat != null) Object.assign(merge, { lat: pos.lat, lng: pos.lng, acc: pos.acc });
      await store.saveCheckin(merge);
      askPersist();
      toast('孩子剛在這裡蓋過章，已合成同一站');
      afterCheckin(merge);
      return;
    }
    const dup = (await store.listCheckins(t.id)).find(c => isAdult(c) && c.placeName === p.name && Date.now() - c.ts < 30 * 60e3);
    if (dup && !(await confirmDlg(`30 分鐘內已經在「${p.name}」打過卡了，還要再打一次嗎？`, '再打一次', '不用了'))) { closeSheet(); return; }
    const c = { id: uid(), tripId: t.id, ts: Date.now(), lat: pos.lat, lng: pos.lng, acc: pos.acc, placeName: p.name, placeType: p.type || '', poiId: p.id || '', by: 'adult', adult: true, kid: false, confirmed: true, note: '' };
    await store.saveCheckin(c);
    askPersist();
    afterCheckin(c);
  };
}

function afterCheckin(c) {
  openSheet(`<div class="center"><div class="bloom">${icon('flower', 'big')}</div><h2 class="h2" style="justify-content:center">打卡成功！</h2><p>${esc(c.placeName)} · ${fmtTime(c.ts)}</p></div>
    <div class="stack">
      <label class="btn main file">${icon('camera')}加照片／影片<input type="file" accept="image/*,video/*" multiple id="f"></label>
      <button class="btn" id="rec">${icon('mic')}錄一段聲音</button>
      <button class="btn ghost" id="later">稍後再補</button>
    </div>`);
  $('#f').onchange = async e => { await addFiles(c.id, e.target.files); await closeSheet(); location.hash = `c/${c.id}`; };
  $('#rec').onclick = () => recordSheet(c.id);
  $('#later').onclick = closeSheet;
}

async function addFiles(cid, fileList) {
  const files = [...fileList];
  if (!files.length) return;
  const mine = (await store.listMedia(cid)).filter(x => x.kind !== 'audio' && x.by !== 'kid');
  const have = mine.length;
  let vids = mine.filter(x => x.kind === 'video').length, skipV = 0;
  const room = MAX - have;
  if (room <= 0) { toast(`每個地點最多 ${MAX} 張照片或影片`); return; }
  const take = files.slice(0, room);
  if (files.length > room) toast(`每個地點最多 ${MAX} 個，只加入前 ${room} 個`);
  let n = 0, ok = 0;
  for (const f of take) {
    toast(`處理中 ${++n}/${take.length}…`);
    try {
      const isVideo = (f.type || '').startsWith('video') || /\.(mov|mp4|m4v)$/i.test(f.name || '');
      if (isVideo) {
        if (vids >= MAX_VIDEOS) { skipV++; continue; }
        if (f.size > CONFIG.maxVideoMB * 1048576) { toast(`影片超過 ${CONFIG.maxVideoMB}MB，先略過，建議剪短一點再加`); continue; }
        const thumb = await videoThumb(f), d = await blobDims(thumb);
        await store.saveMedia({ id: uid(), checkinId: cid, kind: 'video', blob: f, thumb, star: false, ts: Date.now(), size: f.size, w: d?.w, h: d?.h });
        vids++;
      } else {
        const blob = await compressImage(f, CONFIG.photoMax, 0.85);
        const thumb = await compressImage(f, 400, 0.7);
        const d = await blobDims(blob);
        await store.saveMedia({ id: uid(), checkinId: cid, kind: 'photo', blob, thumb, star: false, ts: Date.now(), size: blob.size, w: d?.w, h: d?.h });
      }
      ok++;
    } catch (e) { toast('有一個檔案無法加入：' + e.message); }
  }
  if (skipV) toast(`每站最多 ${MAX_VIDEOS} 支影片，有 ${skipV} 支沒有加入`);
  else if (ok) toast(`已加入 ${ok} 個檔案`);
  askPersist();
}

// 錄聲音：每站一段；按一下開始、再按一下停止就自動存好；不滿意按垃圾桶刪掉再錄
async function recordSheet(cid, max = CONFIG.adultRecordSec) {
  const existing = (await store.listMedia(cid)).find(m => m.kind === 'audio' && m.by !== 'kid');
  openSheet(`<h2 class="h2">錄一段聲音</h2><p class="muted">每站一段，最長 ${max} 秒。按一下開始，再按一下停止就會自動存好。</p>
    <div class="center"><button class="mic" id="mic" aria-label="開始或停止錄音">${icon('mic', 'big')}</button><p id="rs" class="big-n">按一下開始</p></div><div id="rprev"></div>
    <div class="row"><button class="btn main" id="rdone">${icon('check')}完成</button></div>`);
  let timer = null, left = max;
  const mic = $('#mic'), rs = $('#rs');
  const ready = () => { mic.hidden = false; rs.textContent = '按一下開始'; $('#rprev').innerHTML = ''; };
  const showSaved = m => {
    mic.hidden = true; rs.textContent = '已儲存。不滿意就按垃圾桶刪掉，再錄一次。';
    $('#rprev').innerHTML = `<div class="audrow"><audio controls preload="metadata" src="${ou(m.blob)}"></audio><button class="icon-btn" id="rdel" aria-label="刪掉這段，重新錄">${icon('trash')}</button></div>`;
    $('#rdel').onclick = async () => { await store.deleteMedia(m.id); toast('已刪掉，可以重新錄'); ready(); };
  };
  if (existing) showSaved(existing);
  $('#rdone').onclick = async () => { if (activeRec) await stop(); await closeSheet(); if (location.hash.startsWith('#c/')) rerender(); };
  mic.onclick = async () => {
    if (activeRec) { stop(); return; }
    try { activeRec = await startRecorder(); } catch (e) { toast('無法使用麥克風：請允許 Safari 使用麥克風'); return; }
    mic.classList.add('on'); left = max; rs.textContent = `錄音中… ${left} 秒（再按一下停止）`;
    timer = setInterval(() => { left--; rs.textContent = `錄音中… ${left} 秒（再按一下停止）`; if (left <= 0) stop(); }, 1000);
  };
  async function stop() {
    clearInterval(timer);
    const r = activeRec; activeRec = null;
    if (!r) return;
    mic.classList.remove('on');
    const blob = await r.stop();
    const m = { id: uid(), checkinId: cid, kind: 'audio', blob, by: 'adult', star: false, ts: Date.now(), size: blob.size, dur: Math.max(1, max - left) };
    await store.saveMedia(m);
    toast('聲音已儲存');
    showSaved(m);
  }
}

// ---------- 聲音小膠囊：有錄音的地方顯示「▶ 0:12」，點一下就在原地播放 ----------
let vPlayer = null, vChipEl = null;
const fmtDur = s => { s = Math.max(1, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const vchip = m => `<span class="vchip" role="button" tabindex="0" data-vp="${m.id}" aria-label="播放聲音"><i aria-hidden="true"></i>${m.dur ? fmtDur(m.dur) : '聲音'}</span>`;
function bindVchips(root, list) {
  root.querySelectorAll('[data-vp]').forEach(el => {
    const play = e => {
      e.preventDefault(); e.stopPropagation();
      const m = list.find(x => x.id === el.dataset.vp); if (!m) return;
      if (vChipEl === el && vPlayer && !vPlayer.paused) { vPlayer.pause(); el.classList.remove('playing'); return; }
      if (vPlayer) { vPlayer.pause(); vChipEl && vChipEl.classList.remove('playing'); }
      vPlayer = new Audio(ou(m.blob)); vChipEl = el;
      el.classList.add('playing');
      vPlayer.onended = () => el.classList.remove('playing');
      vPlayer.play().catch(() => { el.classList.remove('playing'); toast('這段聲音放不出來'); });
    };
    el.onclick = play;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') play(e); };
  });
}

// ---------- 旅行包裡的明信片（存成一張圖，內容有變才重畫） ----------
let pcQueue = Promise.resolve();
function pcSig(t, data) {
  const pc = { ...DEFAULT_PC, style: mapStyle() === 'cute' ? 'cute' : 'normal', ...(t.pc || {}) };
  return [pc, JSON.stringify([t.name, pc, data.cs.map(c => [c.id, c.placeName, c.ts, isKid(c), isAdult(c), c.lat]), data.media.map(m => [m.id, m.star, m.focus])])];
}
function postcardBlob(tripId) {
  const job = pcQueue.then(async () => {
    const t = await store.getTrip(tripId), data = t && (await collect(tripId));
    if (!data || !data.cs.length) return null;
    const [pc, sig] = pcSig(t, data);
    // iPhone Safari：存在資料庫裡的 Blob 被重新儲存後可能失效（變成問號），所以改存成 ArrayBuffer
    if (t.pcCache && t.pcCache.sig === sig && t.pcCache.buf) return new Blob([t.pcCache.buf], { type: 'image/jpeg' });
    const cv = await renderPostcard(data, pc);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.86));
    if (!blob) return null;
    const fresh = await store.getTrip(tripId);
    if (fresh) { fresh.pcCache = { sig, buf: await blob.arrayBuffer() }; await store.saveTrip(fresh); }
    return blob;
  });
  pcQueue = job.catch(() => null);
  return job;
}
async function fillPostcard(el, tripId) {
  if (!el || el.dataset.done) return;
  el.dataset.done = '1';
  try {
    const b = await postcardBlob(tripId);
    if (b) {
      el.innerHTML = `<img src="${ou(b)}" alt="足跡明信片"><span class="tn-pc-hint">${icon('flower')}點明信片：換版型、配色、存到相簿</span>`;
      // 萬一圖片壞掉：清掉快取，重畫一次
      el.querySelector('img').onerror = async () => { const t = await store.getTrip(tripId); if (t && t.pcCache) { delete t.pcCache; await store.saveTrip(t); } if (el.dataset.retry) { el.remove(); return; } el.dataset.retry = '1'; delete el.dataset.done; fillPostcard(el, tripId); };
    }
    else el.remove();
  } catch (e) { console.error(e); el.remove(); }
}

// ---------- 旅行包：月曆＋時間軸 ----------
let calYM = null;            // 月曆正在看的 [年, 月(0-11)]
const openNodes = new Set(); // 時間軸上拉開的旅行包
const WKS = ['日', '一', '二', '三', '四', '五', '六'];
const md = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
const FLOWER_BG = `<svg class="cd-fl" viewBox="-10 -10 20 20" aria-hidden="true">${[0, 72, 144, 216, 288].map(g => `<circle cx="${(5 * Math.cos((g - 90) * Math.PI / 180)).toFixed(1)}" cy="${(5 * Math.sin((g - 90) * Math.PI / 180)).toFixed(1)}" r="4.7"/>`).join('')}<circle r="3.2" class="cd-fl-c"/></svg>`;

async function trips() {
  const ts = await store.listTrips();
  const mode = getMode(), act = getActiveId();
  const all = await Promise.all(ts.map(async t => ({ t, cs: await store.listCheckins(t.id) })));
  // 旅行包分頁只放真正的旅行；日常在「日常」分頁
  const nodes = all.filter(x => !isDaily(x.t))
    .map(x => ({ ...x, a: x.cs[0]?.ts ?? x.t.createdAt, b: x.cs[x.cs.length - 1]?.ts ?? x.t.createdAt }))
    .sort((p, q) => q.b - p.b);
  // 每一天有什麼：旅行（螢光筆一整條）、日常（小點）、孩子（小蜜蜂）、膠囊（數字後面的蜂巢）
  const marks = {}, mk = k => marks[k] || (marks[k] = { trip: null, tc: 0, daily: false, dly: false, kid: null, cap: 0, ids: [] });
  [...nodes].filter(n => n.cs.length).sort((p, q) => p.a - q.a).forEach((n, i) => {
    for (const d = new Date(new Date(n.a).setHours(0, 0, 0, 0)); d.getTime() <= n.b; d.setDate(d.getDate() + 1)) {
      const o = mk(dayKey(d.getTime()));
      if (!o.trip) { o.trip = n.t.id; o.tc = i % 3; }
      if (!o.ids.includes(n.t.id)) o.ids.push(n.t.id);
    }
  });
  all.forEach(x => x.cs.forEach(c => {
    if (!isDaily(x.t) || !isAdult(c)) return;
    const o = mk(dayKey(c.ts)); o.dly = true; o.daily = true;
  }));
  const capDays = await capsuleDays();
  Object.entries(capDays).forEach(([k, n]) => { mk(k).cap = +n || 1; });
  if (!calYM) { const d = new Date(); calYM = [d.getFullYear(), d.getMonth()]; }
  const curTrip = mode === 'trip' && nodes.find(n => n.t.id === act && !isDaily(n.t));
  // 時間軸：旅行包一項（放在出發那天）；日常每天一項；依月份分段，新的在上面
  const entries = [];
  nodes.forEach(n => entries.push({ kind: 'trip', ts: n.cs.length ? n.a : n.t.createdAt, n }));
  const capsOpened = await openedCapsules();
  capsOpened.forEach(c => entries.push({ kind: 'cap', ts: c.openedAt, c }));
  entries.sort((p, q) => q.ts - p.ts);
  const months = [];
  entries.forEach(e => { const d = new Date(e.ts), mk = `${d.getFullYear()}-${d.getMonth()}`; let m = months[months.length - 1]; if (!m || m.mk !== mk) months.push(m = { mk, y: d.getFullYear(), m: d.getMonth(), items: [] }); m.items.push(e); });
  const dailyOf = (y, m) => nodes.find(n => isDaily(n.t) && n.t.id === `daily-${y}-${String(m + 1).padStart(2, '0')}`);
  const tripCount = entries.filter(e => e.kind === 'trip' && e.n.cs.length).length;
  view.innerHTML = `
    <div class="row between" style="margin-top:4px"><h1 class="h1" style="margin:0">我的旅行包</h1><span class="topright"><a class="btn sm hivebtn" href="#hive" aria-label="時光膠囊"><svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" fill="var(--cap-wax)" stroke="var(--cap-rim)" stroke-width="1.6"/></svg>膠囊</a><a class="topsearch" href="#map/all-trip" aria-label="全部足跡地圖">${icon('map')}</a><button class="topsearch" id="tsrch" aria-label="搜尋旅行包">${icon('search')}</button></span></div>
    <div class="row" style="margin:6px 0 0">${curTrip ? `<a class="tag on" href="#trip/${act}">旅行中</a>` : `<button class="btn main sm" id="new">${icon('plus')}開始旅行</button>`}</div>
    <div class="srchbar" id="srchbar" hidden><span>${icon('search')}</span><input id="tq" type="search" placeholder="搜尋旅行名稱或地點，例如：雲南、廣州" autocomplete="off"><button class="linkbtn" id="tqx">取消</button></div>
    <p class="muted sm" id="tqnone" hidden>找不到符合的旅行包</p>
    <section class="calbox">
      <div class="calhead c3"><span class="calsp"></span><span class="calmid"><button class="calnav" data-mv="-1" aria-label="上個月">${icon('back')}</button><button class="calym" id="calym" aria-label="選擇年月"></button><button class="calnav nx" data-mv="1" aria-label="下個月">${icon('back')}</button></span><span class="calsp"></span></div>
      <div class="calgrid wk">${WKS.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="calgrid c2" id="calgrid"></div>
      <div class="callegend c2"><span><i class="lg2"><i class="chl c0 s e"></i></i>旅行</span><span><i class="lg2"><i class="cdot"></i></i>日常</span><span><i class="lg2"><i class="chx"></i></i>膠囊</span><span><i class="lg2 ring"></i>今天</span><button class="linkbtn" id="caltoday">回到本月</button></div>
    </section>
    ${entries.length ? `<div class="tl-top"><h2 class="h2" style="margin:0">時間軸</h2><span class="tl-btns">${tripCount ? `<button class="btn sm" id="expall">${icon('flower')}全部展開</button>` : ''}</span></div>
      ${months.map(mo => { const dn = dailyOf(mo.y, mo.m); return `<section class="tl-sec">
        <div class="tl-sec-h"><h3>${mo.y} 年 ${mo.m + 1} 月</h3></div>
        <div class="tl-rows">${mo.items.map(e => entryHTML(e, curTrip)).join('')}</div></section>`; }).join('')}`
      : '<p class="empty">還沒有旅行包。在打卡頁把開關滑到「旅行」，或按「開始旅行」。日常的打卡在「日常」分頁。</p>'}`;

  const drawCal = () => {
    const [y, m] = calYM, first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate(), today = dayKey(Date.now());
    $('#calym').innerHTML = `${y} 年 ${m + 1} 月${icon('back', 'dn')}`;
    let h = '<span></span>'.repeat(first);
    const K = d => `${y}-${m + 1}-${d}`;
    for (let d = 1; d <= n; d++) {
      const k = K(d), o = marks[k], col = (first + d - 1) % 7;
      let hl = '';
      if (o?.trip) {
        const prev = d > 1 && col !== 0 && marks[K(d - 1)]?.trip === o.trip, next = d < n && col !== 6 && marks[K(d + 1)]?.trip === o.trip;
        hl = `<i class="chl c${o.tc}${prev ? '' : ' s'}${next ? '' : ' e'}"></i>`;
      }
      const cap = o?.cap ? (o.cap > 1 ? '<i class="chx two1"></i><i class="chx two2"></i>' : '<i class="chx"></i>') : '';
      const dot = o?.daily ? '<i class="cdot"></i>' : '';
      h += `<button class="cd2${o ? ' on' : ''}${k === today ? ' today' : ''}" data-dk="${k}" ${o ? '' : 'tabindex="-1"'} aria-label="${m + 1}月${d}日">${hl}${cap}<span class="cn">${d}</span>${dot}</button>`;
    }
    $('#calgrid').innerHTML = h;
    $('#calgrid').querySelectorAll('.cd2').forEach(b => b.onclick = () => goDay(b.dataset.dk));
  };
  const move = k => { let [y, m] = calYM; m += k; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } calYM = [y, m]; drawCal(); };
  view.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => move(+b.dataset.mv));
  $('#caltoday').onclick = () => { const d = new Date(); calYM = [d.getFullYear(), d.getMonth()]; drawCal(); };
  $('#calym').onclick = async () => {
    const years = Object.keys(marks).map(k => +k.split('-')[0]);
    const pick = await ymPicker(calYM, years, Object.keys(marks));
    if (pick) { calYM = pick; drawCal(); }
  };
  // 左右滑換月份
  let sx = null;
  const cb = view.querySelector('.calbox');
  cb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  cb.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) move(dx < 0 ? 1 : -1); });
  // 點日期：拉開那個旅行包，捲到那一天
  const goDay = k => {
    const o = marks[k];
    if (!o) { toast('這天沒有紀錄'); return; }
    if (!o.ids.length) {
      if (o.dly) { const [yy, mm] = k.split('-').map(Number); dailyYM = [yy, mm - 1]; dailyOpenDay = k; location.hash = 'daily'; return; }
      if (o.cap) { location.hash = 'hive'; return; }
    }
    const id = o.ids[0], el = view.querySelector(`.tnode[data-node="${id}"]`);
    if (!el) {
      const row = view.querySelector(`.tl-dayrow[data-dk="${k}"]`);
      if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); const c = row.querySelector('.tl-daycard'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
      return;
    }
    setOpen(el, true);
    const day = el.querySelector(`.tn-day[data-dk="${k}"]`) || el;
    day.scrollIntoView({ behavior: 'smooth', block: 'center' });
    day.classList.remove('flash'); void day.offsetWidth; day.classList.add('flash');
  };
  const setOpen = (el, on) => {
    el.classList.toggle('open', on);
    el.querySelector('.tn-head').setAttribute('aria-expanded', on);
    on ? openNodes.add(el.dataset.node) : openNodes.delete(el.dataset.node);
    if (on) fillPostcard(el.querySelector('.tn-pc'), el.dataset.node);
  };
  view.querySelectorAll('.tn-head').forEach(b => b.onclick = () => { const el = b.closest('.tnode'); setOpen(el, !el.classList.contains('open')); });
  if ($('#new')) $('#new').onclick = async () => { await goTrip(); rerender(); };
  const syncExp = () => { const b = $('#expall'); if (!b) return; const ns = [...view.querySelectorAll('.tnode')].filter(e => e.querySelector('.tn-pc')); const allOpen = ns.length && ns.every(e => e.classList.contains('open')); b.innerHTML = allOpen ? `${icon('back', 'up')}全部收起` : `${icon('flower')}全部展開`; b.dataset.all = allOpen ? '1' : ''; };
  if ($('#expall')) $('#expall').onclick = () => { const open = !$('#expall').dataset.all; view.querySelectorAll('.tnode').forEach(e => { if (e.querySelector('.tn-pc') || !open) setOpen(e, open); }); syncExp(); };
  view.querySelectorAll('.tn-head').forEach(b => b.addEventListener('click', syncExp));
  syncExp();
  drawCal();
  view.querySelectorAll('.tnode.open .tn-pc').forEach(el => fillPostcard(el, el.dataset.pc));
  fillMemThumbs(view, capsOpened);
  view.querySelectorAll('.tl-capcard [data-cap]').forEach(b => b.onclick = () => viewCapsule(b.dataset.cap));
  // 搜尋旅行包：名稱或去過的地點
  const qOf = {};
  nodes.forEach(n => { qOf[n.t.id] = norm(n.t.name + ' ' + n.cs.map(c => c.placeName).join(' ')); });
  const doSearch = q => {
    q = norm(q.trim());
    view.querySelector('.calbox').hidden = !!q;
    let any = false;
    view.querySelectorAll('.tl-sec').forEach(sec => {
      let vis = 0;
      sec.querySelectorAll('.tl-row').forEach(row => { const nd = row.querySelector('.tnode'); const ok = !q || (nd && qOf[nd.dataset.node].includes(q)); row.hidden = !ok; if (ok) vis++; });
      sec.hidden = !vis; if (vis) any = true;
    });
    $('#tqnone').hidden = !q || any;
  };
  $('#tsrch').onclick = () => { const bar = $('#srchbar'); bar.hidden = !bar.hidden; if (!bar.hidden) $('#tq').focus(); else { $('#tq').value = ''; doSearch(''); } };
  $('#tq').oninput = e => doSearch(e.target.value);
  $('#tqx').onclick = () => { $('#tq').value = ''; doSearch(''); $('#srchbar').hidden = true; };
  // 封面小圖（每包第一張照片）＋聲音：卡片上寫幾段，每一站旁邊可以直接播放
  const tAud = [];
  for (const n of nodes) {
    const node = view.querySelector(`.tnode[data-node="${n.t.id}"]`);
    if (!node) continue;
    const img = node.querySelector('.tn-cover');
    let cover = false, na = 0;
    for (const c of n.cs) {
      const ms = await store.listMedia(c.id);
      const m = !cover && ms.find(x => x.kind !== 'audio' && (x.thumb || x.kind === 'photo'));
      if (m && img) { img.innerHTML = `<img src="${ou(m.thumb || m.blob)}" alt="">`; cover = true; }
      const au = ms.filter(x => x.kind === 'audio');
      if (au.length) { na += au.length; tAud.push(...au); const st = node.querySelector(`.tn-stop[href="#c/${c.id}"]`); if (st) st.insertAdjacentHTML('beforeend', vchip(au[0])); }
    }
    if (na) node.querySelector('.tn-main small')?.insertAdjacentHTML('beforeend', ` <span class="vcount"><i aria-hidden="true"></i>${na} 段</span>`);
  }
  bindVchips(view, tAud);
}

// 搜尋：繁簡常用字都當成一樣（高德的地名多半是簡體）
const TS = '廣广東东門门灣湾區区縣县鎮镇島岛華华龍龙陽阳園园館馆場场橋桥樓楼寶宝雲云臺台張张長长興兴會会實实學学習习鄉乡莊庄鳳凤羅罗蘭兰嶺岭漢汉灘滩濱滨澤泽溝沟灣湾峽峡嶼屿關关廟庙橋桥塔塔麗丽飯饭館馆廳厅樂乐歡欢遊游戲戏機机車车站站鐵铁線线號号記记國国際际紀纪貓猫鳥鸟魚鱼雞鸡麵面點点燒烧鍋锅湯汤飲饮茶茶廈厦層层廠厂業业樹树葉叶園园瀑瀑灑洒湖湖鳴鸣聖圣書书畫画藝艺術术體体育育醫医藥药銀银貨货買买賣卖網网絡络電电視视廣广蘇苏滬沪閩闽粵粤贛赣豐丰潁颖臨临濟济陝陕藏藏農农豬猪馬马驛驿遼辽寧宁圳圳灣湾門门澳澳緣缘綠绿紅红藍蓝黃黄邊边濟济';
const T2S = {}; for (let i = 0; i < TS.length; i += 2) T2S[TS[i]] = TS[i + 1];
const norm = s => [...(s || '').toLowerCase()].map(ch => T2S[ch] || ch).join('');
// ---------- 日常分頁：月曆＋搜尋；「日子」一天一天看、「地方」看常去哪裡 ----------
let dailyYM = null, dailyOpenDay = null;
const cleanName = n => (n || '').replace(/（模擬）/g, '');
async function dailyView() {
  const ts = (await store.listTrips()).filter(isDaily);
  let cs = [];
  for (const t of ts) cs = cs.concat(await store.listCheckins(t.id));
  cs.sort((a, b) => a.ts - b.ts);
  const vis = {}, auds = {}, allAud = [];
  for (const c of cs) { const ms = await store.listMedia(c.id); vis[c.id] = ms.filter(m => m.kind !== 'audio' && (m.thumb || m.kind === 'photo')); auds[c.id] = ms.filter(m => m.kind === 'audio'); allAud.push(...auds[c.id]); }
  const chipsOf = c => auds[c.id].slice(0, 1).map(vchip).join('');
  // 一天一組
  const days = [], byK = {};
  cs.forEach(c => { const k = dayKey(c.ts); if (!byK[k]) { byK[k] = { k, ts: c.ts, cs: [], ph: [] }; days.push(byK[k]); } byK[k].cs.push(c); byK[k].ph.push(...vis[c.id]); });
  days.reverse();
  // 地方：同名合在一起
  const places = {};
  cs.forEach(c => { const n = cleanName(c.placeName); (places[n] = places[n] || { name: n, cs: [] }).cs.push(c); });
  const mode = getSetting('dailyMode', 'days'), period = getSetting('dailyPeriod', 'month');
  if (!dailyYM) { const d = new Date(); dailyYM = [d.getFullYear(), d.getMonth()]; }
  const curDaily = ts.map(t => t.id).sort().pop();
  view.innerHTML = `
    <div class="row between" style="margin-top:4px"><h1 class="h1" style="margin:0">我的日常</h1><span class="topright"><a class="topsearch" href="#map/all-daily" aria-label="全部足跡地圖">${icon('map')}</a><button class="topsearch" id="dsrch" aria-label="搜尋地方">${icon('search')}</button></span></div>
    <div class="srchbar" id="srchbar" hidden><span>${icon('search')}</span><input id="dq" type="search" placeholder="搜尋地方，例如：餐廳、火鍋、店名" autocomplete="off"><button class="linkbtn" id="dqx">取消</button></div>
    <div id="dsres"></div>
    <div id="dmain">
    <section class="calbox">
      <div class="calhead c3"><span class="calsp"></span><span class="calmid"><button class="calnav" data-mv="-1" aria-label="上個月">${icon('back')}</button><button class="calym" id="calym" aria-label="選擇年月"></button><button class="calnav nx" data-mv="1" aria-label="下個月">${icon('back')}</button></span><span class="calsp"></span></div>
      <div class="calgrid wk">${WKS.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="calgrid" id="calgrid"></div>
      <div class="callegend"><span><i class="lg-dot ring"></i>有打卡</span><span><i class="lg-dot ph"></i>有拍照</span><button class="linkbtn" id="caltoday">回到本月</button></div>
    </section>
    <div id="dayopen"></div>
    ${cs.length ? `<div class="tl-top"><div class="seg dseg" role="group" aria-label="怎麼看"><button data-dm="days" class="${mode === 'days' ? 'on' : ''}">日子</button><button data-dm="places" class="${mode === 'places' ? 'on' : ''}">地方</button><button data-dm="map" class="${mode === 'map' ? 'on' : ''}">地圖</button></div></div>
      <div id="dlist"></div>
      <div class="row" style="margin-top:18px"><button class="linkbtn" id="dmv">${icon('trip')}把某幾天搬進旅行包</button></div>` : '<p class="empty">還沒有日常打卡。打卡頁的開關在「日常」時打卡，就會出現在這裡。</p>'}
    </div>`;
  const stopRow = c => `<a class="tn-stop" href="#c/${c.id}"><span class="dstop-dot"></span><span class="tn-tm">${fmtTime(c.ts)}</span><b>${esc(cleanName(c.placeName))}</b>${chipsOf(c)}${vis[c.id].length ? `<span class="dstop-ph">${icon('camera')}${vis[c.id].length}</span>` : ''}</a>`;
  const thumbs = (list, n) => list.slice(0, n).map(m => `<img src="${ou(m.thumb || m.blob)}" alt=""${fpos(m)}>`).join('');
  const md2 = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const wk = t => `週${'日一二三四五六'[new Date(t).getDay()]}`;
  // 「日子」：有照片的日子是大卡片，沒照片的一行就好
  const drawDays = () => {
    let h = '', lastM = '';
    days.forEach(d => {
      const dt = new Date(d.ts), mk = `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月`;
      if (mk !== lastM) { h += `<h3 class="dmonth">${mk}</h3>`; lastM = mk; }
      const names = d.cs.map(c => `<a href="#c/${c.id}">${esc(cleanName(c.placeName))}</a>${chipsOf(c)}`).join('、');
      if (d.ph.length) {
        // 照片：1 整張、2 左右、3 一大兩小、4 田字格、5 張以上一整排左右滑（每張一樣大）
        // 精選（星星）排最前面，其他照拍的順序
        const ord = [...d.ph.filter(m => m.star), ...d.ph.filter(m => !m.star)];
        d.ph.splice(0, d.ph.length, ...ord);
        const n = d.ph.length, strip = n >= 4;
        const phs = d.ph.map((m, i) => `<button class="dc-tile" data-dph="${d.k}" data-i="${i}" aria-label="看照片"><img src="${ou(m.thumb || m.blob)}" alt="" loading="lazy"${fpos(m)}>${m.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}</button>`).join('');
        // 地點：小時間軸，先顯示 3 個，其餘收起來
        const rows = d.cs.map((c, i) => `<a class="dtl-row${i >= 3 ? ' more' : ''}" href="#c/${c.id}"><span class="dtl-t">${fmtTime(c.ts)}</span><span class="dtl-n">${esc(cleanName(c.placeName))}</span>${chipsOf(c)}</a>`).join('');
        h += `<div class="dcard" data-day="${d.k}"><div class="dc-phw"><div class="dc-ph ${strip ? 'strip' : 'n' + n}">${phs}</div>${strip ? `<span class="dc-left" aria-hidden="true"></span>` : ''}</div>
          <div class="dc-b"><div class="dc-top"><p class="dc-d">${md2(d.ts)} <span>${wk(d.ts)}・${d.cs.length} 個地方</span></p><a class="dc-map" href="#map/day-${d.k}">${icon('map')}地圖</a></div>
          <div class="dtl">${rows}</div>${d.cs.length > 3 ? `<button class="dtl-more" data-more="${d.k}">還有 ${d.cs.length - 3} 個地方 ${icon('back', 'dn')}</button>` : ''}</div></div>`;
      } else h += `<div class="dline"><span class="dl-d">${md2(d.ts)}<small>${wk(d.ts)}</small></span><span class="dl-pl">${names}</span><a class="dc-map sm" href="#map/day-${d.k}" aria-label="在地圖上看這天">${icon('map')}</a></div>`;
    });
    $('#dlist').innerHTML = h;
    bindVchips($('#dlist'), allAud);
    $('#dlist').querySelectorAll('[data-more]').forEach(b => b.onclick = () => { const card = b.closest('.dcard'); const open = card.classList.toggle('open'); b.innerHTML = open ? `收起 ${icon('back', 'up')}` : `還有 ${byK[b.dataset.more].cs.length - 3} 個地方 ${icon('back', 'dn')}`; });
    $('#dlist').querySelectorAll('[data-dph]').forEach(b => b.onclick = () => { const d = byK[b.dataset.dph]; viewer(d.ph[+b.dataset.i], d.ph, { oneStar: true }); });
    // 左右滑的那一排：右下角「+N」＝右邊還有幾張沒看到
    $('#dlist').querySelectorAll('.dc-ph.strip').forEach(st => {
      const badge = st.parentElement.querySelector('.dc-left'), n = st.children.length;
      const upd = () => { const w = st.children[0].getBoundingClientRect().width + 2, seen = Math.floor((st.scrollLeft + st.clientWidth + 8) / w); const left = Math.max(0, n - seen); badge.textContent = `+${left}`; badge.hidden = !left; };
      st.addEventListener('scroll', upd, { passive: true }); upd();
    });
  };
  // 「地方」：常去排行
  const drawPlaces = () => {
    const now = new Date(), start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : period === 'year' ? new Date(now.getFullYear(), 0, 1).getTime() : 0;
    const list = Object.values(places).map(p => ({ ...p, n: p.cs.filter(c => c.ts >= start).length, first: p.cs[0].ts })).filter(p => p.n).sort((a, b) => b.n - a.n || b.first - a.first);
    const max = list.length ? list[0].n : 1, newSince = start || Date.now() - 30 * 86400e3;
    $('#dlist').innerHTML = `${perSeg()}
      ${list.length ? `<div class="dplaces">${list.map(p => `<button class="dplace" data-pl="${esc(p.name)}"><span class="dp-n">${esc(p.name)}${p.first >= newSince ? '<em>新</em>' : ''}</span><span class="dp-bar"><i style="width:${Math.max(6, Math.round(p.n / max * 100))}%"></i></span><span class="dp-c">${p.n} 次</span></button>`).join('')}</div>` : '<p class="muted sm">這段時間還沒有日常打卡。</p>'}`;
    view.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { setSetting('dailyPeriod', b.dataset.pp); rerender(); });
    view.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => placeSheet(b.dataset.pl));
  };
  const placeSheet = name => {
    const p = places[name]; if (!p) return;
    const list = [...p.cs].reverse(), ph = list.flatMap(c => vis[c.id]);
    openSheet(`<h2 class="h2" style="margin-top:0">${esc(name)}</h2><p class="muted sm">去過 ${p.cs.length} 次・第一次是 ${fmtDate(p.cs[0].ts)}</p>
      ${ph.length ? `<div class="dsh-ph">${thumbs(ph, 8)}</div>` : ''}
      <div class="dsh-list">${list.map(c => `<a class="tn-stop" href="#c/${c.id}"><span class="dstop-dot"></span><span class="tn-tm">${fmtDate(c.ts).replace(/ 週.$/, '')} ${fmtTime(c.ts)}</span>${chipsOf(c)}${vis[c.id].length ? `<span class="dstop-ph">${icon('camera')}${vis[c.id].length}</span>` : ''}</a>`).join('')}</div>`);
    sb.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeSheet()));
    bindVchips(sb, allAud);
  };
  // 「地圖」：蜂蜜光暈，跟「地方」用同一個期間
  const perSeg = () => `<div class="seg sm dper" role="group" aria-label="期間">${[['month', '這個月'], ['year', '今年'], ['all', '全部']].map(([k2, t]) => `<button data-pp="${k2}" class="${period === k2 ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const drawMap = async () => {
    const now = new Date(), start = period === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : period === 'year' ? new Date(now.getFullYear(), 0, 1).getTime() : 0;
    const pts = cs.filter(c => c.ts >= start && c.lat != null);
    $('#dlist').innerHTML = `${perSeg()}<div id="mapbox"></div><div id="mapnote"></div><p class="muted sm" style="margin:8px 2px 0">越常去的地方越亮。拉近之後點中間的小點，可以看去過幾次。</p>`;
    view.querySelectorAll('[data-pp]').forEach(b => b.onclick = () => { setSetting('dailyPeriod', b.dataset.pp); rerender(); });
    if (!pts.length) { $('#mapbox').innerHTML = '<p class="muted sm">這段時間還沒有日常打卡。</p>'; return; }
    curMap = await mountMap($('#mapbox'), await addBees(pts), { style: mapStyle(), height: 380, seed: 'daily-all', day: null, noPills: true, wantMe: true, merge: true, cluster: true,
      onPick: c => placeSheet(cleanName(c.placeName)) });
  };
  if (cs.length) { mode === 'places' ? drawPlaces() : mode === 'map' ? await drawMap() : drawDays(); }
  view.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => { setSetting('dailyMode', b.dataset.dm); rerender(); });
  if ($('#dmv')) $('#dmv').onclick = () => {
    // 用月曆正在看的那個月
    const [y, m] = dailyYM, did = dailyId(new Date(y, m, 1)), t = ts.find(x => x.id === did);
    const ds = days.filter(d => d.cs[0].tripId === did).map(d => ({ k: d.k, ts: d.ts, items: d.cs.map(c => ({ c })) })).reverse();
    if (!t || !ds.length) { toast(`${m + 1} 月沒有日常打卡；先用上面的月曆切到要搬的月份`); return; }
    moveDaysDlg(t, ds);
  };
  // 月曆
  const drawCal = () => {
    const [y, m] = dailyYM, first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate(), today = dayKey(Date.now());
    $('#calym').innerHTML = `${y} 年 ${m + 1} 月${icon('back', 'dn')}`;
    let h = '<span></span>'.repeat(first);
    for (let d = 1; d <= n; d++) { const k = `${y}-${m + 1}-${d}`, o = byK[k]; h += `<button class="cd${o ? ' has-daily' : ''}${o && o.ph.length ? ' has-ph' : ''}${k === today ? ' today' : ''}${k === dailyOpenDay ? ' sel' : ''}" data-dk="${k}" ${o ? '' : 'tabindex="-1"'}><span>${d}</span></button>`; }
    $('#calgrid').innerHTML = h;
    $('#calgrid').querySelectorAll('.cd').forEach(b => b.onclick = () => openDay(b.dataset.dk));
  };
  const openDay = k => {
    const o = byK[k];
    if (!o) { toast('這天沒有日常打卡'); return; }
    dailyOpenDay = dailyOpenDay === k ? null : k;
    $('#dayopen').innerHTML = dailyOpenDay ? `<div class="dayopen"><p class="tn-dt">${fmtDate(o.ts)}</p>${o.cs.map(stopRow).join('')}</div>` : '';
    bindVchips($('#dayopen'), allAud);
    drawCal();
  };
  const move = k => { let [y, m] = dailyYM; m += k; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } dailyYM = [y, m]; drawCal(); };
  view.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => move(+b.dataset.mv));
  $('#caltoday').onclick = () => { const d = new Date(); dailyYM = [d.getFullYear(), d.getMonth()]; drawCal(); };
  $('#calym').onclick = async () => { const keys = Object.keys(byK); const pick = await ymPicker(dailyYM, keys.map(k => +k.split('-')[0]), keys); if (pick) { dailyYM = pick; drawCal(); } };
  let sx = null; const cb = view.querySelector('.calbox');
  cb.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  cb.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) move(dx < 0 ? 1 : -1); });
  drawCal();
  if (dailyOpenDay && byK[dailyOpenDay]) { const k = dailyOpenDay; dailyOpenDay = null; openDay(k); }
  // 搜尋地方
  const doSearch = q => {
    q = norm(q.trim());
    $('#dmain').hidden = !!q;
    if (!q) { $('#dsres').innerHTML = ''; return; }
    const hit = Object.values(places).filter(p => norm(p.name).includes(q) || p.cs.some(c => norm(c.note).includes(q))).sort((a, b) => b.cs[b.cs.length - 1].ts - a.cs[a.cs.length - 1].ts);
    $('#dsres').innerHTML = hit.length ? `<div class="dplaces">${hit.map(p => `<button class="dplace" data-pl="${esc(p.name)}"><span class="dp-n">${esc(p.name)}</span><span class="dp-c">${p.cs.length} 次・最近 ${md2(p.cs[p.cs.length - 1].ts)}</span></button>`).join('')}</div>` : '<p class="muted sm">找不到符合的地方</p>';
    $('#dsres').querySelectorAll('[data-pl]').forEach(b => b.onclick = () => placeSheet(b.dataset.pl));
  };
  $('#dsrch').onclick = () => { const bar = $('#srchbar'); bar.hidden = !bar.hidden; if (!bar.hidden) $('#dq').focus(); else { $('#dq').value = ''; doSearch(''); } };
  $('#dq').oninput = e => doSearch(e.target.value);
  $('#dqx').onclick = () => { $('#dq').value = ''; doSearch(''); $('#srchbar').hidden = true; };
}

function entryHTML(e, curTrip) {
  const d = new Date(e.ts), date = `<div class="tl-date"><b>${d.getDate()}</b><span>週${'日一二三四五六'[d.getDay()]}</span></div>`;
  if (e.kind === 'cap') return `<div class="tl-row">${date}<div class="tl-capcard"><p class="tl-cap-h"><i class="cd-cap lg"></i>打開了一顆時光膠囊</p>${memHTML(e.c)}</div></div>`;
  if (e.kind === 'trip') return `<div class="tl-row">${date}${nodeHTML(e.n, curTrip && curTrip.t.id === e.n.t.id)}</div>`;
  return `<div class="tl-row tl-dayrow" data-dk="${e.k}">${date}<div class="tl-daycard"><p class="tl-dc-h">${icon('flower')}日常 · ${e.cs.length} 站</p>
    ${e.cs.map((c, i) => `<a class="tn-stop" href="#c/${c.id}"><svg width="28" height="28" viewBox="-24 -24 48 48" aria-hidden="true">${markerSVG(0, 0, c, i + 1, 1.3, '', null, 'center')}</svg><span class="tn-tm">${fmtTime(c.ts)}</span><b>${esc(c.placeName.replace(/（模擬）/g, ''))}</b></a>`).join('')}</div></div>`;
}
function nodeHTML(n, travelling) {
  const daily = isDaily(n.t), open = openNodes.has(n.t.id) || travelling && !openNodes.size;
  if (open) openNodes.add(n.t.id);
  const days = [], idx = {};
  n.cs.forEach((c, i) => { const k = dayKey(c.ts); if (!(k in idx)) { idx[k] = days.length; days.push({ k, ts: c.ts, items: [] }); } days[idx[k]].items.push([c, i + 1]); });
  const stopA = ([c, num]) => `<a class="tn-stop" href="#c/${c.id}"><svg width="30" height="30" viewBox="-24 -24 48 48" aria-hidden="true">${markerSVG(0, 0, c, num, 1.3, '', null, 'center')}</svg><span class="tn-tm">${fmtTime(c.ts)}</span><b>${esc(c.placeName.replace(/（模擬）/g, ''))}</b></a>`;
  const range = n.cs.length ? (daily ? `${days.length} 天有紀錄` : `${md(n.a)}${dayKey(n.a) !== dayKey(n.b) ? '–' + md(n.b) : ''} · ${days.length} 天`) : '還沒有打卡';
  return `<div class="tnode${daily ? ' daily' : ''}${open ? ' open' : ''}" data-node="${n.t.id}">
    <button class="tn-head" aria-expanded="${open}"><span class="tn-cover">${icon(daily ? 'flower' : 'trip')}</span>
      <span class="tn-main"><b>${esc(n.t.name)}</b>${travelling ? ' <span class="tag on">旅行中</span>' : ''}<small>${range}${n.cs.length ? ` · ${n.cs.length} 站` : ''}</small></span>${icon('back', 'tn-chev')}</button>
    <div class="tn-body">
      ${n.cs.length ? `<a class="tn-pc" href="#card/${n.t.id}" data-pc="${n.t.id}"><span class="tn-pc-load">${icon('flower')}明信片準備中…</span></a>` : ''}
      ${days.map((d, i) => `<div class="tn-day" data-dk="${d.k}"><p class="tn-dt">${daily ? '' : `第 ${i + 1} 天 · `}${fmtDate(d.ts)}</p>
        ${d.items.map(stopA).join('')}</div>`).join('')}
      <div class="tn-act"><a class="btn sm" href="#trip/${n.t.id}">打開</a>${n.cs.length ? `<a class="btn sm" href="#map/${n.t.id}">${icon('map')}地圖</a><a class="btn sm" href="#card/${n.t.id}">${icon('flower')}明信片</a><a class="btn sm" href="#video/${n.t.id}">${icon('play')}短片</a>` : ''}</div>
    </div></div>`;
}

// 年月滾輪：上下滑選年份和月份
function ymPicker([y0, m0], recYears, recDays) {
  return new Promise(res => {
    const now = new Date().getFullYear();
    const lo = Math.min(now - 5, ...recYears, y0), hi = Math.max(now + 1, y0);
    const years = []; for (let y = lo; y <= hi; y++) years.push(y);
    const hasM = (y, m) => recDays.some(k => k.startsWith(`${y}-${m + 1}-`));
    const hasY = y => recDays.some(k => k.startsWith(`${y}-`));
    const ov = overlay(`<h2 class="h2" style="margin-top:0">跳到哪個月？</h2>
      <div class="wheel"><div class="wh-band"></div>
        <div class="wh-col" id="why">${years.map(y => `<div class="wh-i${hasY(y) ? ' rec' : ''}">${y} 年</div>`).join('')}</div>
        <div class="wh-col" id="whm">${[...Array(12)].map((_, m) => `<div class="wh-i" data-m="${m}">${m + 1} 月</div>`).join('')}</div>
      </div>
      <p class="muted sm" style="text-align:center;margin:6px 0 0">有小點的是有紀錄的年／月</p>
      <div class="row"><button class="btn" id="whx">取消</button><button class="btn main" id="whok">${icon('check')}看這個月</button></div>`);
    const IH = 44, cy = ov.querySelector('#why'), cm = ov.querySelector('#whm');
    const at = col => Math.max(0, Math.round(col.scrollTop / IH));
    const paintM = () => { const y = years[Math.min(at(cy), years.length - 1)]; cm.querySelectorAll('.wh-i').forEach((e, m) => e.classList.toggle('rec', hasM(y, m))); };
    const sel = col => { const k = at(col); col.querySelectorAll('.wh-i').forEach((e, i) => e.classList.toggle('on', i === k)); };
    let tm;
    [cy, cm].forEach(c => c.addEventListener('scroll', () => { sel(c); clearTimeout(tm); tm = setTimeout(paintM, 80); }, { passive: true }));
    // 點一下某一格也能選
    [cy, cm].forEach(c => c.querySelectorAll('.wh-i').forEach((e, i) => e.onclick = () => c.scrollTo({ top: i * IH, behavior: 'smooth' })));
    requestAnimationFrame(() => { cy.scrollTop = years.indexOf(y0) * IH; cm.scrollTop = m0 * IH; sel(cy); sel(cm); paintM(); });
    const done = v => { ov.remove(); res(v); };
    ov.querySelector('#whx').onclick = () => done(null);
    ov.querySelector('#whok').onclick = () => done([years[Math.min(at(cy), years.length - 1)], Math.min(at(cm), 11)]);
    ov.onclick = e => { if (e.target === ov) done(null); };
  });
}

// 日常 → 把幾天搬進新的旅行包
function moveDaysDlg(t, days) {
  const ov = overlay(`<h2 class="h2" style="margin-top:0">把幾天搬進旅行包</h2>
    <p class="muted sm" style="margin-top:0">勾選的日子會整天搬過去，照片、聲音一起帶走。</p>
    <div class="places">${days.map(d => `<label class="place"><input type="checkbox" value="${d.k}"><span class="pl-t">${fmtDate(d.ts)}<small>${d.items.length} 站：${esc(d.items.map(x => x.c.placeName.replace(/（模擬）/g, '')).slice(0, 3).join('、'))}${d.items.length > 3 ? '…' : ''}</small></span></label>`).join('')}</div>
    <label class="lbl" for="mvn">旅行包名字</label><input id="mvn" class="inp" placeholder="例如：週末去海邊">
    <div class="row"><button class="btn" id="mvx">取消</button><button class="btn main" id="mvok">${icon('check')}建立旅行包</button></div>`);
  ov.querySelector('#mvx').onclick = () => ov.remove();
  ov.querySelector('#mvok').onclick = async () => {
    const ks = [...ov.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value), name = ov.querySelector('#mvn').value.trim();
    if (!ks.length) { toast('請至少勾選一天'); return; }
    if (!name) { toast('請幫旅行包取個名字'); return; }
    const nt = await moveDaysToTrip(t.id, ks, name, dayKey);
    ov.remove(); toast(`已建立「${name}」`); location.hash = `trip/${nt.id}`;
  };
}

// ---------- 採蜜地圖 ----------
const MAP_STYLES = [['normal', '正常'], ['cute', '可愛'], ['night', '夜空']];
const mapStyle = () => { const s = getSetting('mapStyle'); return MAP_STYLES.some(([k]) => k === s) ? s : 'normal'; };
const styleSeg = (cur = mapStyle(), attr = 'data-style') => `<div class="seg" role="group" aria-label="地圖樣式">${MAP_STYLES.map(([k, n]) => `<button ${attr}="${k}" class="${cur === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;

// 地圖圖例：三種標記
const mkIcon = (c, size = 34) => `<svg width="${size}" height="${size}" viewBox="-24 -24 48 48" aria-hidden="true">${markerSVG(0, 0, c, null, 1)}</svg>`;
const mapLegend = () => !kidOn() ? '' : `<div class="legend mk-legend"><span>${mkIcon({ adult: true, kid: false }, 26)}大人打卡</span><span>${mkIcon({ adult: false, kid: true }, 26)}孩子蓋章</span><span>${mkIcon({ adult: true, kid: true }, 26)}一起打卡</span></div>`;

// 把地圖放進 box，並綁好天數切換、當天清單、「正常／可愛」與「連起來」
async function attachMap(box, checkins, height, seed, daily = false, extra = {}) {
  checkins = await addBees(checkins); // 地圖上：你的花上有孩子的蜜蜂
  const info = dayInfo(checkins);
  let day = info.days.length ? defaultDay(info) : null, connected = false;
  const tabs = $('#daytabs'), list = $('#daylist'), conn = $('#conn');
  const resetConn = () => { connected = false; if (conn) conn.innerHTML = `${icon('flower')}連起來`; };
  const drawTabs = () => {
    if (!tabs) return;
    tabs.innerHTML = info.days.length > 1 ? `<button data-dd="all" class="${day == null ? 'on' : ''}">全部</button>` : '';
    tabs.innerHTML += info.days.map((d, k) => { const [, m, dd] = d.split('-'); return `<button data-dd="${k}" class="${day === k ? 'on' : ''}">${daily ? `${m}/${dd}` : `第 ${k + 1} 天 <small>${m}/${dd}</small>`}</button>`; }).join('');
    tabs.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => setDay(b.dataset.dd === 'all' ? null : +b.dataset.dd));
    tabs.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  };
  const drawList = () => {
    if (!list) return;
    if (day == null) { list.innerHTML = `<p class="muted sm" style="margin:0">「全部」可以看整趟旅程走過的範圍；點一朵花或「第 N 天」，就會看到那天的順序。</p>`; return; }
    const cs = checkins.filter(c => info.dayOf(c) === day).sort((a, b) => a.ts - b.ts);
    list.innerHTML = cs.map(c => `<a class="dl" href="#c/${c.id}"><svg width="40" height="40" viewBox="-24 -24 48 48" aria-hidden="true">${markerSVG(0, 0, c, info.num(c), 1)}</svg><div><b>${esc(c.placeName.replace(/（模擬）/g, ''))}</b><span>${fmtTime(c.ts)} · ${whoText(c)}</span></div></a>`).join('');
  };
  const setDay = k => { day = k; resetConn(); curMap && curMap.setDay(k); drawTabs(); drawList(); };
  curMap = await mountMap(box, checkins, {
    ...extra, style: mapStyle(), height, seed, day,
    onPick: c => { if (day == null) setDay(info.dayOf(c)); else location.hash = `c/${c.id}`; },
    onPickDay: k => setDay(k)
  });
  const ctl = curMap;
  drawTabs(); drawList();
  view.querySelectorAll('[data-style]').forEach(b => b.onclick = () => {
    setSetting('mapStyle', b.dataset.style);
    view.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b));
    ctl.setStyle(b.dataset.style);
  });
  if (conn) {
    if (checkins.filter(c => c.lat != null).length < 2) conn.disabled = true;
    conn.onclick = () => {
      connected = !connected;
      if (connected) ctl.connect(); else ctl.hideRoute();
      conn.innerHTML = connected ? `${icon('back')}取消連線` : `${icon('flower')}連起來`;
    };
  }
}

// 常去的地方：點花看每一次去的日子
function visitsSheet(c) {
  const vs = c._visits || [c], name = c.placeName.replace(/（模擬）/g, '');
  const md = ts => { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
  openSheet(`<h2 class="h2" style="margin-bottom:2px">${esc(name)}</h2>
    <p class="muted" style="margin-top:0">去過 ${vs.length} 次・最近一次 ${md(vs[0].ts)}${vs.length > 1 ? `・第一次 ${md(vs[vs.length - 1].ts)}` : ''}</p>
    <div class="visits">${vs.slice(0, 60).map(v => `<a class="visit" href="#c/${v.id}"><span class="vth" data-vth="${v.id}">${icon('flower')}</span><span><b>${md(v.ts)}</b><small>${fmtTime(v.ts)}・${whoText(v)}</small></span></a>`).join('')}</div>
    ${vs.length > 60 ? `<p class="muted sm">只列出最近 60 次</p>` : ''}`);
  sb.querySelectorAll('.visit').forEach(x => x.addEventListener('click', () => closeSheet()));
  (async () => { for (const v of vs.slice(0, 60)) { const m = (await store.listMedia(v.id)).find(x => x.kind !== 'audio' && (x.thumb || x.kind === 'photo')); const el = sb.querySelector(`[data-vth="${v.id}"]`); if (m && el) el.innerHTML = `<img src="${ou(m.thumb || m.blob)}" alt="">`; } })().catch(() => {});
}

// ---------- 足跡總覽：地圖下面的統計 ----------
// cs 已經放上孩子的蜜蜂；kind：'trip'（一趟）、'trips'（全部旅行）、'daily'（日常）
const placeLabel = s => String(s || '').replace(/（模擬）/g, '').trim();
function footStats(cs, kind, nTrips = 0) {
  const places = mergeDaily(cs, 100, true);
  // 公里：同一趟（日常是同一天）裡，依時間一站接一站的直線距離加起來
  const seg = {};
  cs.filter(c => c.lat != null).forEach(c => { const k = kind === 'daily' ? dayKey(c.ts) : c.tripId; (seg[k] = seg[k] || []).push(c); });
  let m = 0;
  Object.values(seg).forEach(L => { L.sort((a, b) => a.ts - b.ts); for (let i = 1; i < L.length; i++) m += distM(L[i - 1], L[i]); });
  const km = m / 1000, kmTxt = km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString();
  const together = places.filter(p => isKid(p) && isAdult(p)).length;
  const tiles = [...(kind === 'trips' ? [[nTrips, '趟旅程']] : []), [places.length, '個地方'], ['…', '個城市', 'id="stcity"'], [kmTxt, '公里<small class="fkm">直線距離</small>']];
  const top = kind === 'daily' ? places.filter(p => p.lat != null).sort((a, b) => (b._n || 1) - (a._n || 1) || b.ts - a.ts).slice(0, 3) : [];
  return `<div class="stats fstats" style="grid-template-columns:repeat(${tiles.length},minmax(0,1fr))">${tiles.map(([n, l, a]) => `<div><b ${a || ''}>${n}</b>${l}</div>`).join('')}</div>
    ${together ? `<p class="ftog">${mkIcon({ adult: true, kid: true }, 30)}<span>孩子也一起去的地方 <b>${together}</b> 個</span></p>` : ''}
    ${top.length ? `<div class="ftop"><p class="lbl">最常去的地方</p>${top.map((p, i) => `<button class="ftop-i" data-top="${i}"><span class="ftop-n">${i + 1}</span><b>${esc(placeLabel(p.placeName))}</b><small>${p._n || 1} 次</small></button>`).join('')}</div>` : ''}`;
}
// 城市數：每一小塊區域查一次城市名（查過會存在手機裡，下次不用網路）
async function fillCities(cs) {
  const cells = new Map();
  cs.filter(c => c.lat != null).forEach(c => { const k = `${c.lat.toFixed(1)},${c.lng.toFixed(1)}`; if (!cells.has(k)) cells.set(k, c); });
  const names = new Set(); let asked = 0;
  for (const c of [...cells.values()].slice(0, 60)) { const nm = await regionName(c.lat, c.lng, true).catch(() => ''); asked++; if (nm) names.add(nm); const el = $('#stcity'); if (!el) return; if (names.size) el.textContent = names.size; }
  const el = $('#stcity'); if (el) el.textContent = names.size || (asked ? '—' : 0);
}

// 旅行的花色＝明信片選的配色；還沒做明信片＝淺灰
const palOfTrip = t => (t.pc && t.pc.palette && PALETTES[t.pc.palette] ? t.pc.palette : 'gray');
async function mapView(id) {
  // 地圖頁只有「全部足跡」；#map/<旅行包> 是「只看這一趟」
  const fitH = extra => Math.max(300, Math.min(600, window.innerHeight - extra));
  const keyNote = '<div id="mapnote"></div>';
  // 地圖畫好之後，再放上「我在這裡」
  const showMe = () => {
    const ctl = curMap, note = $('#mapnote');
    if (ctl && note && ctl.osmFailed) { note.className = 'mapnote warn'; note.innerHTML = `${icon('map')}<div><b>開放地圖沒有載入成功</b><p>先用插畫地圖。請確認網路正常，稍後再打開地圖試試。</p></div>`; return; }
    if (ctl && note && (ctl.kind === 'svg' || ctl.kind === 'none') && !ctl.amapFailed && ctl.prov === 'none') { note.className = 'mapnote'; note.innerHTML = `${icon('map')}<div><b>還不知道你在哪裡</b><p>允許蜂采使用定位，或打卡之後，這裡就會換成真實地圖。iPhone：「設定 → 隱私權與安全性 → 定位服務 → Safari 網站」選「使用 App 期間」。</p></div>`; return; }
    if (ctl && ctl.amapFailed && note) { note.className = 'mapnote warn'; note.innerHTML = `${icon('map')}<div><b>高德地圖沒有載入成功</b><p>${ctl.kind === 'osm' ? '先改用免費的開放地圖。' : '所以先用插畫地圖。'}到「設定」按「測試」，會告訴你是哪裡要修改。</p><a class="btn sm main" href="#settings">去設定測試</a></div>`; if (ctl.kind !== 'osm') return; }
    if (!ctl || (ctl.kind !== 'amap' && ctl.kind !== 'osm')) return;
    peekPosition().then(p => { if (curMap === ctl) ctl.setMe(p); }).catch(() => { if (note && curMap === ctl) { note.className = 'mapnote'; note.innerHTML = `${icon('map')}<div><b>沒有拿到你的位置</b><p>請到 iPhone「設定 → 隱私權與安全性 → 定位服務 → Safari 網站」選「使用 App 期間」，再重新打開蜂采。</p></div>`; } });
  };

  // ---- 日常的某一天：只看那天的地點，用淡淡的線依時間連起來 ----
  if (id && id.startsWith('day-')) {
    const k = id.slice(4);
    let cs = [];
    for (const t of (await store.listTrips()).filter(isDaily)) cs = cs.concat((await store.listCheckins(t.id)).filter(c => dayKey(c.ts) === k));
    cs.sort((a, b) => a.ts - b.ts);
    if (!cs.length) { location.hash = 'daily'; return; }
    view.innerHTML = `<div class="row between"><h1 class="h1">採蜜地圖</h1><span class="muted sm">${cs.length} 個地點</span></div>
      <div class="focuscard"><a class="btn sm" href="#daily" id="backall" aria-label="回日常">${icon('back')}日常</a><div><b>${fmtDate(cs[0].ts)}</b><small>這天的日常・${cs.length} 個地方</small></div></div>
      <div id="mapbox"></div>${keyNote}`;
    curMap = await mountMap($('#mapbox'), await addBees(cs), { style: mapStyle(), height: fitH(250), seed: id, day: null, noPills: true, wantMe: true, onPick: c => { location.hash = `c/${c.id}`; } });
    if (cs.length > 1) setTimeout(() => { try { curMap.connect(); } catch (e) {} }, 500);
    showMe();
    return;
  }
  // ---- 足跡總覽：真實地圖＋統計，不分天、不連線（每天怎麼走，到旅行包的那一天看） ----
  const md = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const pick = c => { if (c._n > 1) visitsSheet(c); else location.hash = `c/${c.id}`; };
  const page = async ({ back, backTxt, title, sub, cs, kind, nTrips, opt }) => {
    view.innerHTML = `<div class="foothead"><a class="btn sm" href="${back}" aria-label="回去">${icon('back')}${esc(backTxt)}</a><div><b>${esc(title)}</b><small>${sub}</small></div></div>
      ${demoBar()}
      <div id="mapbox"></div>
      ${footStats(cs, kind, nTrips)}${keyNote}`;
    bindDemoBar();
    view.querySelectorAll('[data-top]').forEach(b => b.onclick = () => pick(mergeDaily(cs, 100, true).filter(p => p.lat != null).sort((a, b) => (b._n || 1) - (a._n || 1) || b.ts - a.ts)[+b.dataset.top]));
    const top = $('#mapbox').getBoundingClientRect().top + window.scrollY;
    const below = kind === 'daily' ? 250 : 150;
    curMap = await mountMap($('#mapbox'), cs, { style: mapStyle(), height: Math.max(280, Math.min(560, window.innerHeight - top - below)), day: null, noPills: true, wantMe: true, merge: true, group: true, ...opt });
    showMe();
    fillCities(cs);
  };
  if (id) {
    const t = await store.getTrip(id);
    if (!t) { location.hash = 'map'; return; }
    const cs = await addBees((await store.listCheckins(t.id)).filter(isAdult));
    if (isDaily(t)) {
      await page({ back: '#daily', backTxt: '日常', title: t.name, sub: `${cs.length} 次打卡`, cs, kind: 'daily', opt: { seed: t.id, cluster: true, onPick: pick } });
      return;
    }
    const days = new Set(cs.map(c => dayKey(c.ts))).size;
    const sub = cs.length ? `${md(cs[0].ts)}${days > 1 ? ` – ${md(cs[cs.length - 1].ts)}` : ''} · ${days} 天` : '還沒有打卡';
    await page({ back: `#trip/${t.id}`, backTxt: '旅行包', title: t.name, sub, cs, kind: 'trip', opt: { seed: t.id, mergeAll: true, tripPal: { [t.id]: palOfTrip(t) }, onPick: pick } });
    return;
  }

  // ---- 全部足跡：從旅行包進來看全部旅行，從日常進來看全部日常；孩子分頁進來看孩子 ----
  const kidsOK = kidOn() && getKids().length;
  let what = (id || '').startsWith('all-') ? id.slice(4) : (mapFrom === 'daily' ? 'daily' : mapFrom === 'kids' ? 'kid' : 'trip');
  if (what === 'kid' && !kidsOK) what = 'trip';
  const ts = await store.listTrips();
  if (what === 'kid') {
    const kids = getKids(), sel = kids.find(k => k.id === getSetting('kidsSel')) || kids[0];
    const all = (await kidData(sel)).cs.map(c => ({ ...c, kid: true, adult: false, ts: c.kidTs || c.ts })).sort((p, q) => p.ts - q.ts);
    view.innerHTML = `<div class="foothead"><a class="btn sm" href="#kids" aria-label="回去">${icon('back')}孩子</a><div><b>${esc(sel.name)}的足跡</b><small>${all.length} 個地點</small></div></div><div id="mapbox"></div>${keyNote}`;
    const top = $('#mapbox').getBoundingClientRect().top + window.scrollY;
    curMap = await mountMap($('#mapbox'), all, { style: mapStyle(), height: Math.max(300, Math.min(600, window.innerHeight - top - 110)), seed: 'all-kid', day: null, noPills: true, wantMe: true, group: true, onPick: () => { location.hash = 'kids'; } });
    showMe();
    return;
  }
  const daily = what === 'daily', mine = ts.filter(t => daily === isDaily(t));
  let all = [];
  for (const t of mine) all = all.concat((await store.listCheckins(t.id)).filter(isAdult));
  all.sort((p, q) => p.ts - q.ts);
  all = await addBees(all);
  const trips = {}, tripPal = {};
  ts.forEach(t => { trips[t.id] = { name: t.name }; if (!isDaily(t)) tripPal[t.id] = palOfTrip(t); });
  const nTrips = daily ? 0 : new Set(all.map(c => c.tripId)).size;
  const span = all.length ? (new Date(all[0].ts).getFullYear() === new Date(all[all.length - 1].ts).getFullYear() ? `${new Date(all[0].ts).getFullYear()}` : `${new Date(all[0].ts).getFullYear()} – ${new Date(all[all.length - 1].ts).getFullYear()}`) : '還沒有打卡';
  await page({ back: daily ? '#daily' : '#trips', backTxt: daily ? '日常' : '旅行包', title: daily ? '全部日常' : '全部旅行', sub: span, cs: all, kind: daily ? 'daily' : 'trips', nTrips,
    opt: { seed: 'all-' + what, cluster: true, trips, tripPal, onTrip: tid => { location.hash = `map/${tid}`; }, onPick: c => { if (!isDailyC(c)) location.hash = `map/${c.tripId}`; else pick(c); } } });
}

// ---------- 花園主題：選擇與自訂 ----------
function overlay(html) {
  const ov = document.createElement('div');
  ov.className = 'dlg';
  ov.innerHTML = `<div class="dlg-card wide">${html}</div>`;
  document.body.appendChild(ov);
  return ov;
}
function themePicker(current) {
  return new Promise(res => {
    const ov = overlay('');
    const draw = () => {
      ov.firstChild.innerHTML = `<p class="dlg-msg">這一天的花園主題</p>
        <div class="tgrid adult">${allThemes().map(t => `<button class="tbtn${t.id === current ? ' sug' : ''}" data-t="${esc(t.id)}">${themeIcon(t, 50)}<span>${esc(t.name)}</span></button>`).join('')}
        <button class="tbtn add" data-new>${icon('plus')}<span>自訂主題</span></button></div>
        <div class="row end"><button class="btn" data-x>取消</button></div>`;
    };
    draw();
    ov.onclick = async e => {
      const b = e.target.closest('[data-t],[data-new],[data-x]');
      if (!b) return;
      if (b.hasAttribute('data-x')) { ov.remove(); res(null); }
      else if (b.hasAttribute('data-new')) { ov.hidden = true; const t = await customEditor(); ov.hidden = false; if (t) { ov.remove(); res(t.id); } else draw(); }
      else { ov.remove(); res(b.dataset.t); }
    };
  });
}
function customEditor(existing) {
  return new Promise(res => {
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : { id: 'c-' + uid(), name: '', ground: GROUNDS[0].c, items: [] };
    const ov = overlay('');
    const preview = () => {
      const t = { ...draft, items: draft.items.length ? draft.items : ['grass'] };
      $('#cprev', ov).innerHTML = gardenSVG([{ id: 'preview', lat: 0, lng: 0, ts: Date.now() }], () => t, 'preview' + draft.items.join(), null, { W: 300, H: 170, R: 84 });
    };
    ov.firstChild.innerHTML = `<p class="dlg-msg">${existing ? '編輯' : '新增'}自訂花園主題</p>
      <label class="lbl" for="cname" style="margin-top:0">名稱</label><input id="cname" class="inp" maxlength="6" placeholder="例如：雪地" value="${esc(draft.name)}">
      <p class="lbl">地面顏色</p><div class="swatches">${GROUNDS.map((g, i) => `<button class="sw${g.c[0] === draft.ground[0] ? ' on' : ''}" data-g="${i}" aria-label="${esc(g.name)}" style="background:linear-gradient(${g.c[0]},${g.c[1]})"><span>${esc(g.name)}</span></button>`).join('')}</div>
      <p class="lbl">會長出什麼？（最多 5 個）</p><div class="igrid">${Object.keys(ITEMS).map(k => `<button class="ib${draft.items.includes(k) ? ' on' : ''}" data-i="${k}">${itemIcon(k, 34)}<span>${esc(ITEMS[k].name)}</span></button>`).join('')}</div>
      <p class="lbl">預覽</p><div id="cprev" class="cprev"></div>
      <div class="row end"><button class="btn" data-x>取消</button><button class="btn main" data-ok>儲存</button></div>`;
    preview();
    ov.onclick = e => {
      const g = e.target.closest('[data-g]'), it = e.target.closest('[data-i]');
      if (g) { draft.ground = GROUNDS[+g.dataset.g].c; ov.querySelectorAll('[data-g]').forEach(x => x.classList.toggle('on', x === g)); preview(); }
      else if (it) {
        const k = it.dataset.i, on = draft.items.includes(k);
        if (!on && draft.items.length >= 5) { toast('最多選 5 個'); return; }
        draft.items = on ? draft.items.filter(x => x !== k) : [...draft.items, k];
        it.classList.toggle('on', !on); preview();
      } else if (e.target.closest('[data-x]')) { ov.remove(); res(null); }
      else if (e.target.closest('[data-ok]')) {
        draft.name = $('#cname', ov).value.trim();
        if (!draft.name) { toast('請幫主題取個名字'); return; }
        if (!draft.items.length) { toast('至少選 1 個會長出來的東西'); return; }
        draft.icon = draft.items[0];
        saveCustom(draft); ov.remove(); toast('已儲存主題'); res(draft);
      }
    };
  });
}

// ---------- 一鍵短片 ----------
let videoJob = null;
window.addEventListener('hashchange', () => { if (videoJob && !location.hash.startsWith('#video/')) videoJob.cancel = true; });
async function videoView(id) {
  const data = await collect(id);
  if (!data) { location.hash = 'trips'; return; }
  if (!canMakeVideo()) {
    view.innerHTML = `<a class="back" href="#trip/${id}">${icon('back')}${esc(data.trip.name)}</a><h1 class="h1">一鍵生成短片</h1><p class="err">這個瀏覽器不支援在網頁裡錄製影片。請用 iPhone 的 Safari（iOS 16 以上）開啟。</p>`;
    return;
  }
  const opt = { style: mapStyle(), title: data.trip.name, music: getSetting('videoMusic') || 'bright', musicFile: null, voices: true, clips: true };
  let result = null, resultUrl = null;
  view.innerHTML = `<a class="back" href="#trip/${id}">${icon('back')}${esc(data.trip.name)}</a>
    <h1 class="h1">一鍵生成短片</h1>
    <p class="muted">小蜜蜂沿著地圖飛過每一站，播放精選照片和錄音，最後以明信片收尾。9:16 直式，適合視頻號、限時動態和朋友圈。</p>
    <div id="vform">
      <label class="lbl" for="vt">標題</label><input id="vt" class="inp" value="${esc(opt.title)}" maxlength="24">
      <p class="lbl">地圖樣式</p>${styleSeg()}
      <p class="lbl">背景音樂</p>
      <div class="seg" role="group" aria-label="背景音樂">${Object.entries(TRACKS).map(([k, t]) => `<button data-mu="${k}" class="${opt.music === k ? 'on' : ''}">${esc(t.name)}</button>`).join('')}<button data-mu="file" class="${opt.music === 'file' ? 'on' : ''}">我的音樂</button><button data-mu="none" class="${opt.music === 'none' ? 'on' : ''}">不要</button></div>
      <label class="btn sm file" id="mfile" style="margin-top:10px;${opt.music === 'file' ? '' : 'display:none'}">${icon('plus')}<span id="mname">從手機選一首音樂</span><input type="file" accept="audio/*" id="mf"></label>
      <p class="muted sm" style="margin-top:6px">「輕快」「溫柔」是蜂采自己合成的原創音樂，分享到社群不會有版權問題。用自己的音樂時，請注意平台的版權規定。</p>
      <label class="switch"><span><b>放入錄音</b><br><span class="muted sm">每站播放孩子或大人的錄音，播放時音樂自動變小聲</span></span><input type="checkbox" id="vv" checked></label>
      <label class="switch"><span><b>放入影片片段</b><br><span class="muted sm">每段最多 ${CONFIG.video.clipSec} 秒</span></span><input type="checkbox" id="vc" checked></label>
      <label class="switch"><span><b>製作時同步播放聲音</b><br><span class="muted sm">邊做邊聽音樂和錄音</span></span><input type="checkbox" id="vmon" checked></label>
      <details class="vdet" id="vdet"><summary>${icon('gear')}調整短片內容<span class="muted sm">（不調整也可以直接製作）</span></summary>
        <p class="muted sm">每站最多放 ${PER_STOP} 個，精選的優先。點照片可以加入或拿掉；照片下方左邊的按鈕可以換版型（拉遠、平移、照片卡）；「焦點」可以點選最想強調的位置。</p>
        <div id="vlist"><p class="muted">載入中…</p></div>
      </details>
      <div class="row"><button class="btn main" id="vgo">${icon('play')}開始製作</button><span class="muted sm" id="vest"></span></div>
    </div>
    <div id="vrun" hidden>
      <div class="vstage"><canvas id="vcv"></canvas></div>
      <div class="kbar" style="height:12px"><span id="vbar" style="width:0%"></span></div>
      <p class="muted" id="vstat">準備中…</p>
      <p class="note sm">製作期間請保持在這個頁面、螢幕不要關閉。影片有多長就需要多久。</p>
      <div class="row"><button class="btn" id="vcancel">取消</button></div>
    </div>
    <div id="vdone" hidden>
      <video id="vout" controls playsinline class="vout"></video>
      <p class="muted sm" id="vinfo"></p>
      <div class="row"><button class="btn" id="vsound">${icon('play')}播放（開聲音）</button></div>
      <div class="row"><button class="btn main" id="vsave">${icon('check')}儲存到相簿／分享</button><button class="btn" id="vagain">重新製作</button></div>
      <p class="note sm">按「儲存到相簿」後，在跳出的選單裡選「<b>儲存影片</b>」，就會存進相簿。</p>
    </div>`;
  const upd = async () => { const e = await estimate(data, opt); if ($('#vest')) $('#vest').textContent = `大約 ${e.sec} 秒，${e.stops} 站`; };
  upd();
  // ---------- 短片內容（展開才載入） ----------
  const LAYNAME = { pan: '平移', card: '照片卡', zoom: '拉遠' };
  const ordered = [...data.cs].sort((a, b) => a.ts - b.ts);
  const dinfo = dayInfo(data.cs);
  const audioDur = blob => new Promise(res => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : null); a.onerror = () => res(null); setTimeout(() => res(null), 4000); a.src = URL.createObjectURL(blob); });
  const renderVList = async () => {
    let html = '';
    for (const c of ordered) {
      const ms = await store.listMedia(c.id);
      const vis = ms.filter(m => m.kind !== 'audio');
      const sel = selectVisuals(ms), selIds = new Set(sel.map(m => m.id));
      const au = ms.filter(m => m.kind === 'audio').sort((a, b) => (a.by === 'kid' ? 0 : 1) - (b.by === 'kid' ? 0 : 1) || a.ts - b.ts)[0];
      if (au && !au.dur) { const d = await audioDur(au.blob); if (d) { au.dur = d; await store.updateMedia(au); } }
      const items = layoutItems(c, sel, opt);
      const d = stopDuration(items, au && opt.voices && c.vVoice !== false ? voiceLen(c, au) : 0);
      const landAuto = sel.filter(m => m.kind === 'photo' && isLand(m) && (!m.layout || m.layout === 'auto')).length;
      html += `<div class="vstop"><div class="vhead">${mkIcon(c, 30)}<div><b>${esc(c.placeName.replace(/（模擬）/g, ''))}</b><span>${dinfo.days.length > 1 ? `第 ${dinfo.dayOf(c) + 1} 天 · ` : ''}第 ${dinfo.num(c)} 站${c.lat == null ? ' · 沒有定位' : ''}${d ? ` · 約 ${Math.round(d)} 秒` : ''}</span></div>${vis.some(m => m.vid != null) ? `<button class="linkbtn" data-reset="${c.id}">恢復自動</button>` : ''}</div>`;
      html += vis.length ? `<div class="vthumbs">${vis.map(m => {
        const on = selIds.has(m.id), lay = m.layout || 'auto', useClip = m.kind === 'video' && opt.clips;
        return `<div class="vt${on ? ' on' : ''}"><button class="vt-img" data-sel="${m.id}" data-c="${c.id}" aria-pressed="${on}" aria-label="${on ? '從短片拿掉' : '放進短片'}">${m.thumb ? `<img src="${ou(m.thumb)}" alt="">` : `<span class="vph">${icon('play')}</span>`}<span class="vt-chk">${icon('check')}</span>${m.star ? `<span class="vt-star">${icon('star')}</span>` : ''}${m.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}${m.focus ? `<i class="focus-dot" style="left:${(m.focus.x * 100).toFixed(1)}%;top:${(m.focus.y * 100).toFixed(1)}%"></i>` : ''}</button>
          <div class="vt-tools">${useClip ? '<span class="muted sm">影片</span>' : `<button data-lay="${m.id}" class="${lay === 'auto' ? '' : 'set'}">${LAYNAME[lay === 'auto' ? (isLand(m) ? 'pan' : 'zoom') : lay]}</button>`}<button data-foc="${m.id}">焦點</button></div></div>`;
      }).join('')}</div>` : '<p class="muted sm" style="margin:4px 0">這一站沒有照片或影片。</p>';
      if (au) {
        html += `<label class="vopt"><input type="checkbox" data-voice="${c.id}" ${c.vVoice !== false ? 'checked' : ''}>放入錄音（${au.by === 'kid' ? '孩子' : '大人'}${au.dur ? `，${Math.round(au.dur)} 秒` : ''}）</label>`;
        if (!au.dur || au.dur > 10) html += `<label class="vopt"><input type="checkbox" data-trim="${c.id}" ${c.vTrim ? 'checked' : ''}>只播前 10 秒（結尾淡出）</label>`;
      }
      if (landAuto >= 2) html += `<label class="vopt"><input type="checkbox" data-stack="${c.id}" ${c.vStack !== false ? 'checked' : ''}>兩張橫拍上下拼貼</label>`;
      html += '</div>';
    }
    freeVlistUrls();
    $('#vlist').innerHTML = html || '<p class="muted">這趟旅程還沒有打卡。</p>';
    bindVList();
    upd();
  };
  let vUrls = [];
  const freeVlistUrls = () => { vUrls.forEach(u => URL.revokeObjectURL(u)); vUrls = urls.splice(0); };
  const getC = id => data.cs.find(c => c.id === id);
  const bindVList = () => {
    const L = $('#vlist');
    L.querySelectorAll('[data-sel]').forEach(b => b.onclick = async () => {
      const c = getC(b.dataset.c), ms = await store.listMedia(c.id);
      const vis = ms.filter(m => m.kind !== 'audio'), selIds = new Set(selectVisuals(ms).map(m => m.id));
      const m = vis.find(x => x.id === b.dataset.sel);
      // 第一次手動調整：把這站目前的選擇固定下來，避免自動補上別張
      for (const x of vis) { const want = selIds.has(x.id); if (x.vid !== want) { x.vid = want; await store.updateMedia(x); } }
      if (selIds.has(m.id)) m.vid = false;
      else if (selIds.size >= PER_STOP) { toast(`每站最多 ${PER_STOP} 個，請先拿掉一個`); return; }
      else m.vid = true;
      await store.updateMedia(m);
      renderVList();
    });
    L.querySelectorAll('[data-lay]').forEach(b => b.onclick = async () => {
      const fresh = await store.getMedia(b.dataset.lay);
      const order = isLand(fresh) ? ['auto', 'pan', 'card', 'zoom'] : ['auto', 'card', 'zoom'];
      fresh.layout = order[(order.indexOf(fresh.layout || 'auto') + 1) % order.length];
      await store.updateMedia(fresh);
      renderVList();
    });
    L.querySelectorAll('[data-foc]').forEach(b => b.onclick = async () => { const m = await store.getMedia(b.dataset.foc); if (await focusEditor(m)) renderVList(); });
    L.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => { for (const m of await store.listMedia(b.dataset.reset)) if (m.vid != null) { delete m.vid; await store.updateMedia(m); } renderVList(); });
    const setFlag = async (id, fn) => { const c = await store.getCheckin(id); fn(c); await store.saveCheckin(c); const local = getC(id); for (const k of ['vVoice', 'vStack', 'vTrim']) { if (k in c) local[k] = c[k]; else delete local[k]; } renderVList(); };
    L.querySelectorAll('[data-voice]').forEach(i => i.onchange = () => setFlag(i.dataset.voice, c => { if (i.checked) delete c.vVoice; else c.vVoice = false; }));
    L.querySelectorAll('[data-stack]').forEach(i => i.onchange = () => setFlag(i.dataset.stack, c => { if (i.checked) delete c.vStack; else c.vStack = false; }));
    L.querySelectorAll('[data-trim]').forEach(i => i.onchange = () => setFlag(i.dataset.trim, c => { c.vTrim = i.checked; }));
  };
  let vLoaded = false;
  $('#vdet').addEventListener('toggle', () => { if ($('#vdet').open && !vLoaded) { vLoaded = true; renderVList(); } });
  view.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { opt.style = b.dataset.style; setSetting('mapStyle', opt.style); view.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b)); });
  view.querySelectorAll('[data-mu]').forEach(b => b.onclick = () => {
    opt.music = b.dataset.mu; if (opt.music !== 'file') setSetting('videoMusic', opt.music);
    view.querySelectorAll('[data-mu]').forEach(x => x.classList.toggle('on', x === b));
    $('#mfile').style.display = opt.music === 'file' ? '' : 'none';
  });
  $('#mf').onchange = e => { opt.musicFile = e.target.files[0] || null; $('#mname').textContent = opt.musicFile ? opt.musicFile.name : '從手機選一首音樂'; };
  $('#vv').onchange = e => { opt.voices = e.target.checked; upd(); };
  $('#vc').onchange = e => { opt.clips = e.target.checked; upd(); if (vLoaded) renderVList(); };
  opt.monitor = true;
  $('#vmon').onchange = e => { opt.monitor = e.target.checked; };
  $('#vgo').onclick = async () => {
    if (opt.music === 'file' && !opt.musicFile) { toast('請先選一首音樂，或改用「輕快」「溫柔」'); return; }
    opt.title = $('#vt').value;
    const AC = window.AudioContext || window.webkitAudioContext;
    opt.ac = new AC();
    try { await opt.ac.resume(); } catch (e) {}
    let lock = null;
    try { lock = await navigator.wakeLock?.request('screen'); } catch (e) {}
    $('#vform').hidden = true; $('#vdone').hidden = true; $('#vrun').hidden = false;
    const job = videoJob = { cancel: false };
    $('#vcancel').onclick = () => { job.cancel = true; };
    try {
      result = await makeVideo(data, opt, {
        canvas: $('#vcv'),
        onStatus: t => { if ($('#vstat')) $('#vstat').textContent = t; },
        onProgress: (r, sec, tot) => { if ($('#vbar')) { $('#vbar').style.width = `${Math.round(r * 100)}%`; $('#vstat').textContent = `製作中 ${Math.floor(sec)} / ${Math.round(tot)} 秒`; } },
        isCancelled: () => job.cancel
      });
    } catch (e) { console.error(e); toast('製作失敗：' + e.message); result = null; }
    try { lock && lock.release(); } catch (e) {}
    try { opt.ac.close(); } catch (e) {}
    videoJob = null;
    if (!$('#vrun')) return;
    $('#vrun').hidden = true;
    if (!result) { $('#vform').hidden = false; return; }
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(result.blob);
    $('#vout').muted = false;
    $('#vout').src = resultUrl;
    $('#vinfo').textContent = `${Math.round(result.total)} 秒 · ${(result.blob.size / 1048576).toFixed(1)} MB · ${result.type.includes('mp4') ? 'MP4' : 'WebM'}`;
    $('#vdone').hidden = false;
  };
  $('#vagain').onclick = () => { $('#vdone').hidden = true; $('#vform').hidden = false; };
  $('#vsound').onclick = () => { const v = $('#vout'); v.muted = false; v.volume = 1; try { v.currentTime = 0; } catch (e) {} v.play().catch(() => toast('請再按一次播放')); };
  $('#vsave').onclick = async () => {
    if (!result) return;
    const ext = result.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([result.blob], `fengcai-${new Date().toISOString().slice(0, 10)}.${ext}`, { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else { const a = document.createElement('a'); a.href = resultUrl; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) { if (e.name !== 'AbortError') toast('無法分享：' + e.message); }
  };
}

// ---------- 足跡明信片 ----------
const TPL_THUMB = {
  A: '<rect width="60" height="75" rx="5" fill="#FFF8E7"/><rect x="6" y="6" width="34" height="5" rx="2" fill="#2B1B0A"/><rect x="6" y="15" width="48" height="26" rx="4" fill="#E3F2D2"/><circle cx="14" cy="34" r="2.5" fill="#F7B500"/><circle cx="30" cy="25" r="2.5" fill="#FFC21A"/><circle cx="46" cy="20" r="2.5" fill="#F7B500"/><rect x="6" y="45" width="22" height="3" rx="1" fill="#D98A00"/><rect x="6" y="51" width="20" height="2" fill="#B4B2A9"/><rect x="32" y="45" width="22" height="3" rx="1" fill="#D98A00"/><rect x="32" y="51" width="20" height="2" fill="#B4B2A9"/><rect x="6" y="59" width="10" height="9" rx="2" fill="#fff"/><rect x="19" y="59" width="10" height="9" rx="2" fill="#fff"/><rect x="32" y="59" width="10" height="9" rx="2" fill="#fff"/><rect x="45" y="59" width="10" height="9" rx="2" fill="#fff"/>',
  B: '<rect width="60" height="75" rx="5" fill="#FFF8E7"/><rect x="5" y="5" width="31" height="36" rx="3" fill="#85B7EB"/><rect x="39" y="5" width="16" height="17" rx="3" fill="#F0997B"/><rect x="39" y="24" width="16" height="17" rx="3" fill="#97C459"/><rect x="5" y="45" width="22" height="22" rx="4" fill="#E3F2D2"/><rect x="31" y="46" width="24" height="5" rx="2" fill="#2B1B0A"/><rect x="31" y="55" width="20" height="2" fill="#B4B2A9"/><rect x="31" y="60" width="22" height="2" fill="#B4B2A9"/>',
  C: '<rect width="60" height="75" rx="5" fill="#FFF8E7"/><rect x="5" y="5" width="16" height="6" rx="3" fill="#D98A00"/><rect x="5" y="14" width="40" height="5" rx="2" fill="#2B1B0A"/><rect x="5" y="22" width="50" height="22" rx="4" fill="#E3F2D2"/><path d="M10 39 L24 29 L38 35 L50 27" fill="none" stroke="#D98A00" stroke-width="1.5"/><line x1="10" y1="50" x2="10" y2="70" stroke="#F3E2B3" stroke-width="2"/><circle cx="10" cy="51" r="2.5" fill="#F7B500"/><rect x="16" y="49" width="20" height="3" fill="#2B1B0A"/><rect x="44" y="47" width="11" height="8" rx="2" fill="#85B7EB"/><circle cx="10" cy="62" r="2.5" fill="#FFC21A"/><rect x="16" y="60" width="16" height="3" fill="#2B1B0A"/><rect x="44" y="58" width="11" height="8" rx="2" fill="#F0997B"/>',
  D: '<rect width="60" height="75" rx="5" fill="#FFD23F"/><rect x="5" y="5" width="34" height="5" rx="2" fill="#2B1B0A"/><rect x="5" y="13" width="50" height="38" rx="5" fill="#F3E2B3"/><circle cx="17" cy="42" r="9" fill="#FFE8A3"/><circle cx="33" cy="30" r="9" fill="#CDEFB4"/><circle cx="46" cy="20" r="8" fill="#DDF2FF"/><circle cx="17" cy="42" r="2.5" fill="#FFC21A"/><circle cx="33" cy="30" r="2.5" fill="#FFC21A"/><circle cx="46" cy="20" r="2.5" fill="#FFC21A"/><rect x="5" y="55" width="50" height="9" rx="4.5" fill="#fff"/>'
};
async function cardView(id) {
  const data = await collect(id);
  if (!data) { location.hash = 'trips'; return; }
  const t = data.trip;
  const pc = { ...DEFAULT_PC, style: mapStyle(), ...(t.pc || {}) };
  pc.crops = { ...(pc.crops || {}) };
  pc.show = { ...DEFAULT_PC.show, ...((t.pc || {}).show || {}) };
  const info = dayInfo(data.cs);
  let blob = null, url = null, timer = null, busy = 0, panel = null;
  // 存好的明信片固定不動；要按「編輯」才能改，「完成」才儲存，「取消」回到原本
  let editing = !t.pc, snap = JSON.stringify(pc), dirty = false;
  const save = () => { dirty = true; };
  const commit = async () => { const tr = await store.getTrip(id); if (tr) { tr.pc = JSON.parse(JSON.stringify(pc)); await store.saveTrip(tr); } t.pc = JSON.parse(JSON.stringify(pc)); snap = JSON.stringify(pc); dirty = false; };
  view.innerHTML = `<a class="back" href="#trip/${id}">${icon('back')}${esc(t.name)}</a>
    <div class="row between pchead"><h1 class="h1" style="margin:0">足跡明信片</h1>
      <span class="pcmode-view"><button class="btn sm" id="pcedit">${icon('edit')}編輯</button></span>
      <span class="pcmode-edit"><button class="btn sm" id="pccancel">取消</button><button class="btn main sm" id="pcdone">${icon('check')}完成</button></span></div>
    <p class="muted sm pcmode-edit" style="margin:6px 0 0">正在編輯：改好按「完成」才會儲存。</p>
    <div class="tplrow" role="group" aria-label="版型">${Object.entries(TEMPLATES).map(([k, n]) => `<button data-tpl="${k}" class="${pc.tpl === k ? 'on' : ''}"><svg viewBox="0 0 60 75" width="60" height="75" aria-hidden="true">${TPL_THUMB[k]}</svg><span>${k} ${n}</span></button>`).join('')}</div>
    <div class="dayseg" id="pcday"></div>
    <div class="pcchips" id="pcchips" role="group" aria-label="調整"></div>
    <div id="pcpanel" class="pcpanel" hidden></div>
    <div class="pc-prev"><div class="pc-stage" id="pstage"><img id="pimg" alt="明信片預覽"><div class="pc-tiles" id="ptiles"></div></div><div class="pc-edit" id="pedit" hidden><button class="btn sm" id="relay">${icon('edit')}換一種排法</button><p class="muted sm">按住照片半秒再拖到別格，可以換位置；直接拖，可以調整照片露出的部分。</p></div><p id="pinfo" class="muted">產生中…</p></div>
    <div class="pcmode-view"><div class="row"><button class="btn main" id="psave">${icon('check')}儲存到相簿／分享</button></div>
    <p class="note sm">按下後在選單裡選「<b>儲存影像</b>」就會存進相簿；也可以長按上面的圖片，選「加入照片」。</p></div>`;
  const setMode = on => { editing = on; view.classList.toggle('pc-editing', on); view.classList.add('pcpage'); };
  setMode(editing);
  // ---- 拼圖編輯：按住半秒再拖＝換位置；直接拖＝調整露出的部分 ----
  let tiles = [], CW = 1, CH = 1;
  const mediaUrl = id => { const m = data.media.find(x => x.id === id); return m ? ou(m.kind === 'photo' ? m.blob : m.thumb) : ''; };
  const drawTiles = cv => {
    const box = $('#ptiles'), ed = $('#pedit');
    tiles = pc.tpl === 'B' && cv.tiles ? cv.tiles : []; CW = cv.width; CH = cv.height;
    ed.hidden = !tiles.length;
    $('#relay').hidden = !(cv.layouts > 1);
    box.innerHTML = tiles.map((q, i) => `<div class="pc-tile" data-i="${i}" style="left:${q.x / CW * 100}%;top:${q.y / CH * 100}%;width:${q.w / CW * 100}%;height:${q.h / CH * 100}%"></div>`).join('');
    box.querySelectorAll('.pc-tile').forEach(bindTile);
  };
  const orderNow = () => tiles.map(q => q.id);
  function bindTile(el) {
    const q = tiles[+el.dataset.i];
    let st = null;
    const end = () => { if (!st) return; clearTimeout(st.timer); if (st.ghost) st.ghost.remove(); $('#ptiles').querySelectorAll('.pc-tile').forEach(x => x.classList.remove('lift', 'target')); st = null; };
    el.onpointerdown = e => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const scale = CW / $('#pstage').getBoundingClientRect().width;
      st = { x0: e.clientX, y0: e.clientY, mode: null, scale, cx: q.cx, cy: q.cy };
      st.timer = setTimeout(() => {
        if (!st || st.mode) return;
        st.mode = 'swap'; el.classList.add('lift'); navigator.vibrate?.(12);
        const r = el.getBoundingClientRect(), g = document.createElement('div');
        g.className = 'pc-ghost'; g.style.cssText = `width:${r.width}px;height:${r.height}px;left:${r.left}px;top:${r.top}px;background-image:url(${mediaUrl(q.id)})`;
        document.body.appendChild(g); st.ghost = g; st.gx = r.left - e.clientX; st.gy = r.top - e.clientY;
      }, 450);
    };
    el.onpointermove = e => {
      if (!st) return;
      const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
      if (!st.mode && Math.hypot(dx, dy) > 8) {
        clearTimeout(st.timer); st.mode = 'pan';
        el.classList.add('panning');
        el.style.backgroundImage = `url(${mediaUrl(q.id)})`;
        el.style.backgroundSize = `${q.dw / q.w * 100}% ${q.dh / q.h * 100}%`;
      }
      if (st.mode === 'pan') {
        const ex = q.dw - q.w, ey = q.dh - q.h;
        st.nx = ex > 1 ? Math.min(1, Math.max(0, st.cx - dx * st.scale / ex)) : .5;
        st.ny = ey > 1 ? Math.min(1, Math.max(0, st.cy - dy * st.scale / ey)) : .5;
        el.style.backgroundPosition = `${st.nx * 100}% ${st.ny * 100}%`;
      } else if (st.mode === 'swap') {
        st.ghost.style.left = `${e.clientX + st.gx}px`; st.ghost.style.top = `${e.clientY + st.gy}px`;
        const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pc-tile');
        $('#ptiles').querySelectorAll('.pc-tile').forEach(x => x.classList.toggle('target', x === t && x !== el));
        st.target = t && t !== el ? +t.dataset.i : null;
      }
    };
    el.onpointerup = () => {
      if (!st) return;
      if (st.mode === 'pan' && st.nx != null) { pc.crops[q.id] = { x: +st.nx.toFixed(3), y: +st.ny.toFixed(3) }; changed(); }
      else if (st.mode === 'swap' && st.target != null) {
        const ids = orderNow(), a = +el.dataset.i, b = st.target;
        [ids[a], ids[b]] = [ids[b], ids[a]];
        pc.photoIds = ids; changed();
      }
      end();
    };
    el.onpointercancel = () => { el.classList.remove('panning'); el.style.backgroundImage = ''; end(); };
  }
  $('#relay').onclick = () => { pc.layout = (pc.layout || 0) + 1; changed(); };
  const gen = async () => {
    const my = ++busy;
    $('#pinfo').textContent = '產生中…';
    try {
      const cv = await renderPostcard(data, pc);
      if (my !== busy) return;
      blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      $('#pimg').src = url;
      drawTiles(cv);
      $('#pinfo').textContent = cv.notes && cv.notes.length ? `這個尺寸放不下：${cv.notes.join('、')}。可以改成 9:16，或在「顯示內容」關掉行程清單。` : '';
    } catch (e) { console.error(e); $('#pinfo').textContent = '產生失敗：' + e.message; }
  };
  const changed = (delay = 0) => { save(); clearTimeout(timer); timer = setTimeout(gen, delay); };
  const drawDays = () => {
    const el = $('#pcday');
    if (pc.tpl !== 'C' || info.days.length < 1) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = info.days.map((d, k) => { const [, m, dd] = d.split('-'); return `<button data-pd="${k}" class="${pc.day === k ? 'on' : ''}">第 ${k + 1} 天 <small>${m}/${dd}</small></button>`; }).join('');
    el.querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { pc.day = +b.dataset.pd; drawDays(); changed(); });
  };
  drawDays();
  // 每個版型只顯示用得到的調整按鈕
  const CHIPS = { A: ['show', 'photos', 'color', 'text', 'size'], B: ['show', 'photos', 'color', 'text', 'size'], C: ['show', 'color', 'text', 'size'], D: ['show', 'color', 'text', 'size'] };
  const CHIPNAME = { show: '顯示內容', photos: '照片', color: '配色', text: '文字', size: '尺寸' };
  const drawChips = () => {
    $('#pcchips').innerHTML = CHIPS[pc.tpl].map(k => `<button data-p="${k}" class="${panel === k ? 'on' : ''}">${CHIPNAME[k]}</button>`).join('');
    $('#pcchips').querySelectorAll('[data-p]').forEach(b => b.onclick = () => openPanel(b.dataset.p));
  };
  view.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
    pc.tpl = b.dataset.tpl;
    view.querySelectorAll('[data-tpl]').forEach(x => x.classList.toggle('on', x === b));
    if (panel && !CHIPS[pc.tpl].includes(panel)) { panel = null; $('#pcpanel').hidden = true; }
    drawChips(); drawDays();
    if (panel) openPanel(panel, true);
    changed();
  });
  const sw = (k, v) => `<button data-sw="${k}" class="${pc.show[k] ? 'on' : ''}" aria-pressed="${pc.show[k] ? 'true' : 'false'}">${icon('check')}${v}</button>`;
  const openPanel = async (k, keep) => {
    const el = $('#pcpanel');
    if (panel === k && !keep) { panel = null; el.hidden = true; $('#pcchips').querySelectorAll('[data-p]').forEach(x => x.classList.remove('on')); return; }
    panel = k; el.hidden = false;
    $('#pcchips').querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x.dataset.p === k));
    if (k === 'show') {
      const opts = pc.tpl === 'D' ? [['stats', '章數'], ['quote', '一句話']] : pc.tpl === 'C' ? [['photos', '每站照片'], ['quote', '一句話']] : pc.tpl === 'B' ? [['list', '行程清單'], ['stats', '旅程數字'], ['quote', '一句話']] : [['list', '行程清單'], ['stats', '旅程數字'], ['photos', '照片'], ['quote', '一句話']];
      el.innerHTML = `<div class="pcsw">${opts.map(([a, b]) => sw(a, b)).join('')}</div>${pc.show.quote && !pc.quote ? '<p class="muted sm">一句話要在「文字」裡填寫。</p>' : ''}`;
      el.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { pc.show[b.dataset.sw] = !pc.show[b.dataset.sw]; openPanel('show', true); changed(); });
    } else if (k === 'photos') {
      const vis = data.media.filter(m => m.thumb || m.kind === 'photo');
      const chosen = pc.photoIds && pc.photoIds.length ? pc.photoIds : null;
      el.innerHTML = vis.length ? `<p class="muted sm">可以選 1 到 ${pc.tpl === 'B' ? MAX_PC_PHOTOS : 4} 張，照選的順序排。沒有選的話，會用 4 張精選照片。</p><div class="pcphotos">${vis.map(m => { const i = chosen ? chosen.indexOf(m.id) : -1; return `<button data-ph="${m.id}" class="${i >= 0 ? 'on' : ''}"><img src="${ou(m.thumb || m.blob)}" alt="">${i >= 0 ? `<b>${i + 1}</b>` : ''}${m.star ? `<span class="vt-star">${icon('star')}</span>` : ''}</button>`; }).join('')}</div><div class="row"><button class="btn sm" id="phreset">改回用精選照片</button></div>` : '<p class="muted">這趟旅程還沒有照片。</p>';
      el.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => {
        const ids = pc.photoIds ? [...pc.photoIds] : [];
        const i = ids.indexOf(b.dataset.ph);
        const lim = pc.tpl === 'B' ? MAX_PC_PHOTOS : 4;
        if (i >= 0) ids.splice(i, 1); else if (ids.length >= lim) { toast(`最多 ${lim} 張`); return; } else ids.push(b.dataset.ph);
        pc.photoIds = ids.length ? ids : null; openPanel('photos', true); changed();
      });
      if ($('#phreset')) $('#phreset').onclick = () => { pc.photoIds = null; openPanel('photos', true); changed(); };
    } else if (k === 'color') {
      el.innerHTML = `<p class="lbl" style="margin-top:0">配色</p><div class="pcpal">${Object.entries(PALETTES).map(([key, n]) => `<button data-pal="${key}" class="pal-${key}${pc.palette === key ? ' on' : ''}"><i>${markerNumSVG({ adult: true, kid: false }, ' ', key)}</i>${n}</button>`).join('')}</div>
        ${pc.tpl === 'D' ? '' : pc.palette === 'night' ? '<p class="muted sm">夜空配色會用星空地圖。</p>' : `<p class="lbl">地圖樣式</p><div class="seg" role="group" aria-label="地圖樣式"><button data-ms="normal" class="${pc.style !== 'cute' ? 'on' : ''}">簡潔</button><button data-ms="cute" class="${pc.style === 'cute' ? 'on' : ''}">可愛</button></div>`}
        <p class="muted sm">換配色時，地圖的底色、花的顏色和造型、文字會一起換：櫻花是櫻花瓣、薄荷是四葉草。</p>`;
      el.querySelectorAll('[data-pal]').forEach(b => b.onclick = () => { pc.palette = b.dataset.pal; openPanel('color', true); changed(); });
      el.querySelectorAll('[data-ms]').forEach(b => b.onclick = () => { pc.style = b.dataset.ms; openPanel('color', true); changed(); });
    } else if (k === 'text') {
      el.innerHTML = `<label class="lbl" for="pt" style="margin-top:0">標題</label><input id="pt" class="inp" maxlength="24" placeholder="${esc(t.name)}" value="${esc(pc.title)}">
        ${pc.tpl === 'D' ? '' : `<label class="lbl" for="ps">副標題（可不填）</label><input id="ps" class="inp" maxlength="24" placeholder="例如：全家第一次去雲南" value="${esc(pc.subtitle)}">`}
        <label class="lbl" for="pq">一句話（可不填）</label><input id="pq" class="inp" maxlength="30" placeholder="例如：今天的米線最好吃！" value="${esc(pc.quote)}">`;
      $('#pt').oninput = e => { pc.title = e.target.value; changed(500); };
      if ($('#ps')) $('#ps').oninput = e => { pc.subtitle = e.target.value; changed(500); };
      $('#pq').oninput = e => { pc.quote = e.target.value; if (e.target.value) pc.show.quote = true; changed(500); };
    } else if (k === 'size') {
      const names = { '4:5': '4:5 貼文', '9:16': '9:16 限時動態', '1:1': '1:1 正方形' };
      el.innerHTML = `<div class="seg">${Object.keys(SIZES).map(z => `<button data-sz="${z}" class="${pc.size === z ? 'on' : ''}">${names[z]}</button>`).join('')}</div>`;
      el.querySelectorAll('[data-sz]').forEach(b => b.onclick = () => { pc.size = b.dataset.sz; openPanel('size', true); changed(); });
    }
  };
  drawChips();
  $('#pcedit').onclick = () => { snap = JSON.stringify(pc); dirty = false; setMode(true); };
  $('#pcdone').onclick = async () => { await commit(); panel = null; $('#pcpanel').hidden = true; drawChips(); setMode(false); toast('明信片已儲存'); };
  $('#pccancel').onclick = () => {
    if (!t.pc && !dirty) { location.hash = `trip/${id}`; return; }
    const old = JSON.parse(snap);
    Object.keys(pc).forEach(k => delete pc[k]); Object.assign(pc, old);
    panel = null; $('#pcpanel').hidden = true;
    view.querySelectorAll('[data-tpl]').forEach(x => x.classList.toggle('on', x.dataset.tpl === pc.tpl));
    drawChips(); drawDays(); dirty = false;
    if (t.pc) setMode(false);
    clearTimeout(timer); gen();
  };
  $('#psave').onclick = async () => {
    if (!blob) return;
    const file = new File([blob], `fengcai-postcard-${new Date().toISOString().slice(0, 10)}.jpg`, { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else { const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) { if (e.name !== 'AbortError') toast('無法分享：' + e.message); }
  };
  gen();
}

// ---------- 孩子分頁：孩子的打卡、照片、錄音（不跟大人的旅行混在一起） ----------
let kidsYM = null;
async function kidsView() {
  const kids = getKids();
  if (!kids.length) { view.innerHTML = '<h1 class="h1">孩子的打卡</h1><p class="empty">還沒有設定孩子。到「設定 → 孩子」新增。</p>'; return; }
  let kid = kids.find(k => k.id === getSetting('kidsSel')) || kids[0];
  const { cs, media, boxId } = await kidData(kid);
  const strays = await findStrays();
  const mode = getSetting('kidsMode', 'stops');
  const col = colorHex(kid), stopOf = id => cs.find(c => c.id === id);
  const tsOf = c => c.kidTs || c.ts;
  const vis = c => (media[c.id] || []).filter(m => m.kind !== 'audio' && (m.thumb || m.kind === 'photo'));
  const auds = c => (media[c.id] || []).filter(m => m.kind === 'audio');
  const rate = c => (c.kidRate || {})[kid.id] || {};
  const stars = c => { const s = rate(c).s || 0; return s ? `<span class="kp-st">${'★'.repeat(s)}<i>${'★'.repeat(3 - s)}</i></span>` : ''; };
  const feel = c => (rate(c).f && FEELS[rate(c).f] ? `<span class="kp-feel">${FEELS[rate(c).f]}</span>` : '');
  const days = [], byK = {};
  cs.forEach(c => { const k = dayKey(tsOf(c)); if (!byK[k]) { byK[k] = { k, ts: tsOf(c), cs: [], ph: [], au: [] }; days.push(byK[k]); } byK[k].cs.push(c); byK[k].ph.push(...vis(c)); byK[k].au.push(...auds(c)); });
  days.reverse();
  if (!kidsYM) { const d = days[0] ? new Date(days[0].ts) : new Date(); kidsYM = [d.getFullYear(), d.getMonth()]; }
  const allPh = days.flatMap(d => d.ph);
  const md2 = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const wk = t => `週${'日一二三四五六'[new Date(t).getDay()]}`;
  const beeI = (cls = '') => `<i class="cbee ${cls}">${beeSVG('')}</i>`;
  view.innerHTML = `<div class="kidpage" style="--kc:${col}">
    <div class="row between" style="margin-top:4px"><h1 class="h1 kp-h1" style="margin:0">${beeI('h')}${esc(kid.name)}的打卡</h1></div>
    ${kids.length > 1 ? `<div class="seg kp-who" role="group" aria-label="看哪個孩子">${kids.map(k => `<button data-kid="${esc(k.id)}" class="${k.id === kid.id ? 'on' : ''}" style="--kc:${colorHex(k)}">${esc(k.name)}</button>`).join('')}</div>` : ''}
    ${strays.n ? `<div class="note kabsorb">${icon('honey')}<div><b>有 ${strays.n} 站孩子的打卡還混在你的旅行裡</b><p>是之前合併進去的，或孩子用你的手機蓋的。搬回孩子頁，你的旅行包和日常就只剩你自己的。建議先做一次備份。</p><button class="btn sm main" id="strays">${icon('check')}搬回孩子頁</button></div></div>` : ''}
    <section class="calbox">
      <div class="calhead c3"><span class="calsp"></span><span class="calmid"><button class="calnav" data-mv="-1" aria-label="上個月">${icon('back')}</button><button class="calym" id="calym" aria-label="年月"></button><button class="calnav nx" data-mv="1" aria-label="下個月">${icon('back')}</button></span><a class="calmap" href="#map/all-kid" aria-label="地圖：孩子去過的地方">${icon('map')}</a></div>
      <div class="calgrid wk">${WKS.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="calgrid c2" id="calgrid"></div>
      <div class="callegend c2"><span><i class="lg2">${beeI()}</i>有打卡</span><span><i class="lg2"><i class="cdot ph"></i></i>有拍照</span><span><i class="lg2 ring"></i>今天</span><button class="linkbtn" id="caltoday">回到最近</button></div>
    </section>
    ${cs.length ? `<div class="tl-top"><div class="seg dseg" role="group" aria-label="怎麼看"><button data-km="stops" class="${mode === 'stops' ? 'on' : ''}">打卡</button><button data-km="photos" class="${mode === 'photos' ? 'on' : ''}">照片</button><button data-km="voice" class="${mode === 'voice' ? 'on' : ''}">錄音</button></div></div>
      <div id="klist"></div>` : `<p class="empty">還沒有${esc(kid.name)}的打卡。${kid.age === 'big' ? `請${esc(kid.name)}在自己的手機點左上角的蜜蜂 →「傳給爸媽」，再到「設定 → 備份 → 加入孩子的打卡」。` : '用爸媽的手機刷孩子的吊飾蓋章，就會出現在這裡。'}</p>`}
  </div>`;
  // 月曆：孩子有打卡的日子放小蜜蜂（有拍照的再多一個小點）
  const drawCal = () => {
    const [y, m] = kidsYM, first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate(), today = dayKey(Date.now());
    $('#calym').innerHTML = `${y} 年 ${m + 1} 月`;
    let h = '<span></span>'.repeat(first);
    for (let d = 1; d <= n; d++) {
      const k = `${y}-${m + 1}-${d}`, o = byK[k];
      h += `<button class="cd2${o ? ' on' : ''}${k === today ? ' today' : ''}" data-dk="${k}" ${o ? '' : 'tabindex="-1"'}><span class="cn">${d}</span>${o && o.ph.length ? '<i class="cdot ph l"></i>' : ''}${o ? beeI(o.ph.length ? 'r' : '') : ''}</button>`;
    }
    $('#calgrid').innerHTML = h;
    $('#calgrid').querySelectorAll('.cd2.on').forEach(b => b.onclick = () => {
      if (mode !== 'stops') { setSetting('kidsMode', 'stops'); kidsGo = b.dataset.dk; rerender(); return; }
      const el = view.querySelector(`[data-day="${b.dataset.dk}"]`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    });
  };
  const move = k => { let [y, m] = kidsYM; m += k; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } kidsYM = [y, m]; drawCal(); };
  view.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => move(+b.dataset.mv));
  $('#caltoday').onclick = () => { const d = days[0] ? new Date(days[0].ts) : new Date(); kidsYM = [d.getFullYear(), d.getMonth()]; drawCal(); };
  drawCal();
  view.querySelectorAll('[data-kid]').forEach(b => b.onclick = () => { setSetting('kidsSel', b.dataset.kid); kidsYM = null; rerender(); });
  view.querySelectorAll('[data-km]').forEach(b => b.onclick = () => { setSetting('kidsMode', b.dataset.km); rerender(true); });
  if ($('#strays')) $('#strays').onclick = async () => {
    if (!(await confirmDlg(`會把 ${strays.n} 站孩子的打卡（和孩子拍的照片、錄音）從你的旅行搬回孩子頁。你自己的打卡和照片不會動。建議先做一次備份。要繼續嗎？`, '搬回孩子頁'))) return;
    toast('搬移中…');
    try { await moveStrays(); toast('好了，你的旅行包和日常只剩你自己的'); rerender(); } catch (e) { toast('搬移失敗：' + e.message); }
  };
  if (!cs.length) return;
  // 加到我的那一天：複製一份，孩子頁的還在
  const add = async m => {
    const s = stopOf(m.checkinId);
    if (!s || s.tripId !== boxId) { toast('這一站本來就在你的旅行裡'); return false; }
    return addToMine(m, s, kid);
  };
  const L = $('#klist');
  if (mode === 'stops') {
    let h = '', lastM = '';
    days.forEach(d => {
      const dt = new Date(d.ts), mk = `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月`;
      if (mk !== lastM) { h += `<h3 class="dmonth">${mk}</h3>`; lastM = mk; }
      const rows = d.cs.map(c => `<div class="dtl-row"><span class="dtl-t">${fmtTime(tsOf(c))}</span><span class="dtl-n">${esc(cleanName(c.placeName))}</span>${stars(c)}${feel(c)}${auds(c).length ? `<button class="kp-au" data-au="${auds(c)[0].id}" aria-label="聽錄音">${icon('mic')}</button>` : ''}</div>`).join('');
      if (d.ph.length) {
        const n = d.ph.length, strip = n >= 4;
        const phs = d.ph.map((m, i) => `<button class="dc-tile" data-dph="${d.k}" data-i="${i}" aria-label="看照片"><img src="${ou(m.thumb || m.blob)}" alt="" loading="lazy"${fpos(m)}>${m.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}${m.added && m.added.length ? `<span class="kp-ok">${icon('check')}</span>` : ''}</button>`).join('');
        h += `<div class="dcard kp-card" data-day="${d.k}"><div class="dc-phw"><div class="dc-ph ${strip ? 'strip' : 'n' + n}">${phs}</div></div>
          <div class="dc-b"><div class="dc-top"><p class="dc-d">${beeI()}${md2(d.ts)} <span>${wk(d.ts)}・${d.cs.length} 個地方</span></p></div><div class="dtl">${rows}</div></div></div>`;
      } else h += `<div class="dcard kp-card nophoto" data-day="${d.k}"><div class="dc-b"><div class="dc-top"><p class="dc-d">${beeI()}${md2(d.ts)} <span>${wk(d.ts)}・${d.cs.length} 個地方</span></p></div><div class="dtl">${rows}</div></div></div>`;
    });
    L.innerHTML = h;
    L.querySelectorAll('[data-dph]').forEach(b => b.onclick = () => { const d = byK[b.dataset.dph]; viewer(d.ph[+b.dataset.i], d.ph, { add }); });
    L.querySelectorAll('[data-au]').forEach(b => b.onclick = () => playKidAudio(b.dataset.au, media, cs, add));
    if (kidsGo) { const el = L.querySelector(`[data-day="${kidsGo}"]`); kidsGo = null; if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 50); }
  } else if (mode === 'photos') {
    L.innerHTML = allPh.length ? days.filter(d => d.ph.length).map(d => `<p class="kp-day">${beeI()}${md2(d.ts)} ${wk(d.ts)}<small>${d.ph.length} 個</small></p><div class="kp-grid">${d.ph.map(m => `<button class="kp-tile" data-ph="${allPh.indexOf(m)}"><img src="${ou(m.thumb || m.blob)}" alt="" loading="lazy"${fpos(m)}>${m.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}${m.added && m.added.length ? `<span class="kp-ok">${icon('check')}</span>` : ''}</button>`).join('')}</div>`).join('') : '<p class="empty">還沒有照片或影片。</p>';
    L.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => viewer(allPh[+b.dataset.ph], allPh, { add }));
  } else {
    const any = days.some(d => d.au.length);
    L.innerHTML = any ? days.filter(d => d.au.length).map(d => `<p class="kp-day">${beeI()}${md2(d.ts)} ${wk(d.ts)}</p>${d.au.map(m => { const c = stopOf(m.checkinId); return `<div class="kp-voice"><div class="kp-vt"><b>${esc(cleanName(c.placeName))}</b><small>${fmtTime(tsOf(c))}${m.q ? `・${esc(m.q)}` : ''}</small></div><audio controls preload="none" src="${ou(m.blob)}"></audio>${c.tripId === boxId ? `<button class="btn sm${m.added && m.added.length ? '' : ' main'}" data-addau="${m.id}">${m.added && m.added.length ? `${icon('check')}已加入` : `${icon('plus')}加到我的`}</button>` : ''}</div>`; }).join('')}`).join('') : '<p class="empty">還沒有錄音。</p>';
    L.querySelectorAll('[data-addau]').forEach(b => b.onclick = async () => { const m = Object.values(media).flat().find(x => x.id === b.dataset.addau); if (m && (await add(m))) rerender(true); });
  }
}
let kidsGo = null;
// 打卡列表上的小麥克風：直接播放
function playKidAudio(id, media, cs, add) {
  const m = Object.values(media).flat().find(x => x.id === id); if (!m) return;
  const c = cs.find(x => x.id === m.checkinId), u = URL.createObjectURL(m.blob);
  const ov = overlay(`<h2 class="h2" style="margin-top:0">${icon('mic')}${esc(cleanName(c.placeName))}</h2>${m.q ? `<p class="muted sm">${esc(m.q)}</p>` : ''}<audio controls autoplay src="${u}" style="width:100%"></audio>
    <div class="row"><button class="btn" data-a="x">關閉</button>${add ? `<button class="btn main" data-a="add">${icon('plus')}加到我的那一天</button>` : ''}</div>`);
  ov.onclick = async e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'x') { ov.remove(); URL.revokeObjectURL(u); } if (a === 'add' && (await add(m))) { ov.remove(); rerender(true); } };
}
// 選要加到你的哪一站（預設時間最近的那站）；那天沒有打卡就新增一站
async function addToMine(m, s, kid) {
  const ts = s.kidTs || s.ts, mine = await myStopsOn(ts);
  return new Promise(res => {
    const ov = overlay(`<h2 class="h2" style="margin-top:0">加到你的哪一站？</h2>
      <p class="muted sm">${esc(kid.name)}在 ${fmtTime(ts)}・${esc(cleanName(s.placeName))}。會複製一份過去，${esc(kid.name)}這邊的還在。</p>
      <div class="places">${mine.map((c, i) => `<label class="place"><input type="radio" name="tg" value="${c.id}" ${i === 0 ? 'checked' : ''}><span class="pl-t"><span>${fmtTime(c.ts)} <b>${esc(cleanName(c.placeName))}</b></span></span></label>`).join('')}
      <label class="place"><input type="radio" name="tg" value="" ${mine.length ? '' : 'checked'}><span class="pl-t"><span>${icon('plus')}在那天新增一站</span><small>地點：${esc(cleanName(s.placeName))}</small></span></label></div>
      <div class="row"><button class="btn" data-a="x">取消</button><button class="btn main" data-a="ok">${icon('check')}加進去</button></div>`);
    ov.onclick = async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'x') { ov.remove(); res(false); }
      if (a !== 'ok') return;
      const tid = ov.querySelector('input[name="tg"]:checked')?.value || '';
      if (tid) {
        const ex = (await store.listMedia(tid)).filter(x => x.kind !== 'audio');
        if (m.kind !== 'audio' && ex.length >= MAX) { toast(`這一站已經有 ${MAX} 個照片影片了`); return; }
        if (m.kind === 'video' && ex.filter(x => x.kind === 'video').length >= MAX_VIDEOS) { toast(`這一站影片最多 ${MAX_VIDEOS} 支`); return; }
      }
      e.target.disabled = true;
      try { await copyToMine(m, s, tid || null); ov.remove(); toast('加好了！可以拿去做短片和明信片'); res(true); }
      catch (err) { toast('加不進去：' + err.message); e.target.disabled = false; }
    };
  });
}

// ---------- 單一旅行包 ----------
async function trip(id) {
  const t = await store.getTrip(id);
  if (!t) { location.hash = 'trips'; return; }
  const meta = await withMedia(await store.listCheckins(id));
  const days = [], idx = {};
  meta.forEach((x, i) => { x.n = i + 1; const k = dayKey(x.c.ts); if (!(k in idx)) { idx[k] = days.length; days.push({ k, ts: x.c.ts, items: [] }); } days[idx[k]].items.push(x); });
  const vis = meta.reduce((s, x) => s + x.m.filter(m => m.kind !== 'audio').length, 0);
  const kid = meta.filter(x => isKid(x.c)).length;
  view.innerHTML = `<a class="back" href="#trips">${icon('back')}所有旅行包</a>
    <div class="row between"><h1 class="h1">${esc(t.name)}</h1>${isDaily(t) ? '' : '<button class="btn sm" id="ren">改名</button>'}</div>
    ${meta.length ? `<a class="tn-pc big" href="#card/${id}" id="trippc"><span class="tn-pc-load">${icon('flower')}明信片準備中…</span></a>` : `<div class="stats"><div><b>0</b>地點</div><div><b>0</b>天</div><div><b>${vis}</b>照片影片</div><div><b>${kid}</b>孩子的章</div></div>`}
    <div class="dayseg" id="daytabs"></div>
    <div id="mapbox"></div>
    <div class="daylist" id="daylist"></div>
    <div class="mapbar"><button class="btn sm" id="conn">${icon('flower')}連起來</button><a class="btn sm" href="#map/${id}">${icon('map')}在地圖上看</a></div>
    ${mapLegend()}
    ${days.map((d, i) => { const th = (t.dayThemes || {})[d.k] ? getTheme(t.dayThemes[d.k]) : null; return `<h2 class="h2 day">${isDaily(t) ? '' : `<span class="dn">第 ${i + 1} 天</span>`}${fmtDate(d.ts)}<button class="tchip" data-day="${d.k}" aria-label="更改這天的花園主題">${th ? `${themeIcon(th, 22)}${esc(th.name)}` : '選花園主題'}</button></h2><div class="cards">${d.items.map(cardHTML).join('')}</div>`; }).join('') || '<p class="empty" style="margin-top:14px">這趟旅程還沒有打卡。</p>'}
    <div class="row"><a class="btn main" href="#video/${id}">${icon('play')}一鍵生成短片</a><a class="btn" href="#card/${id}">${icon('flower')}做足跡明信片</a></div>
    <div class="row">${isDaily(t) ? (days.length ? `<button class="btn" id="mv">${icon('trip')}把幾天搬進旅行包</button>` : '') : getMode() === 'trip' && getActiveId() === id ? '<span class="tag on" style="align-self:center">旅行中</span>' : `<button class="btn" id="act">${icon('trip')}繼續這趟旅行</button>`}<button class="btn danger" id="del">${icon('trash')}刪除這個旅行包</button></div>
    ${!isDaily(t) && meta.length ? `<p class="muted sm" style="margin-top:14px">打錯到這個旅行包了嗎？</p><button class="btn sm" id="alldaily">${icon('flower')}這趟其實是日常，全部移到日常</button>` : ''}`;
  fillPostcard($('#trippc'), id);
  if ($('#alldaily')) $('#alldaily').onclick = async () => {
    if (!(await confirmDlg(`把「${t.name}」的 ${meta.length} 站全部移到日常？照片、聲音會一起移過去，這個旅行包會消失。`, '全部移到日常', '取消'))) return;
    for (const x of meta) await moveToDaily(x.c);
    await store.deleteTrip(id);
    if (getActiveId() === id) { try { localStorage.removeItem('fc-active'); } catch (e) {} endTrip(); }
    toast('已移到日常'); location.hash = 'daily';
  };
  await attachMap($('#mapbox'), meta.map(x => x.c), 260, id, isDaily(t));
  view.querySelectorAll('[data-day]').forEach(b => b.onclick = async () => {
    const cur = (t.dayThemes || {})[b.dataset.day];
    const tid = await themePicker(cur);
    if (!tid) return;
    t.dayThemes = { ...(t.dayThemes || {}), [b.dataset.day]: tid };
    await store.saveTrip(t); toast('已更新這天的花園主題'); rerender();
  });
  if ($('#ren')) $('#ren').onclick = async () => { const n = await inputDlg('旅程名稱', t.name); if (n) { t.name = n; t.nameAuto = false; await store.saveTrip(t); rerender(); } };
  if ($('#act')) $('#act').onclick = () => { resumeTrip(id); toast(`繼續旅行：之後的打卡會放進「${t.name}」`); rerender(); };
  if ($('#mv')) $('#mv').onclick = () => moveDaysDlg(t, days);
  $('#del').onclick = async () => {
    if (!(await confirmDlg(`確定要刪除「${t.name}」？裡面的打卡、照片、影片和聲音都會一起刪除，無法復原。`, '刪除', '取消'))) return;
    await store.deleteTrip(id);
    if (getActiveId() === id) { try { localStorage.removeItem('fc-active'); } catch (e) {} endTrip(); }
    toast('已刪除'); location.hash = 'trips';
  };
}

// ---------- 打卡之後修改地點：搜尋正確的地點（名稱＋位置一起改），或只改名字 ----------
async function editPlaceSheet(c) {
  const near = c.lat != null ? { lat: c.lat, lng: c.lng } : null;
  let chosen = null;
  openSheet(`<h2 class="h2">修改地點</h2>
    <p class="muted" style="margin-top:0">現在：<b>${esc(c.placeName)}</b></p>
    <input id="ep" class="inp" placeholder="輸入正確的地點名稱搜尋" autocomplete="off" enterkeyhint="search" value="">
    <div class="sugs" id="esugs"></div>
    <p class="chosen" id="echosen" hidden></p>
    <div id="enear"></div>
    <div class="row sheet-act"><button class="btn main" id="eok">${icon('check')}改成這個地點</button><button class="btn" id="ename">只改名字</button></div>
    <p class="muted sm">「改成這個地點」會把名稱和地圖上的位置一起更正；「只改名字」位置不變。</p>`);
  const show = () => { const el = $('#echosen'); el.hidden = !chosen; if (chosen) el.innerHTML = `${icon('check')}已選：<b>${esc(chosen.name)}</b>${chosen.address ? `<small>${esc(chosen.address)}</small>` : ''}`; };
  bindPlaceSearch($('#ep'), $('#esugs'), near, p => { chosen = p; show(); }, () => { chosen = null; show(); });
  // 原本位置附近的地點，也可以直接點
  if (near) nearby(near.lat, near.lng).then(list => {
    const L = list.slice(0, 10), box = $('#enear');
    if (!box || !L.length) return;
    box.innerHTML = `<p class="lbl" style="margin-top:14px">原本位置附近</p><div class="places">${L.map((p, i) => `<button type="button" class="sug" data-n="${i}"><span class="pl-ic">${icon(BADGES[badgeOf(p.type)].icon)}</span><span class="pl-t">${esc(p.name)}<small>${esc(shortType(p.type))}${p.dist ? ` · ${p.dist} 公尺` : ''}</small></span></button>`).join('')}</div>`;
    box.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { const p = L[+b.dataset.n]; chosen = { ...p, lat: null, lng: null }; $('#ep').value = p.name; $('#esugs').innerHTML = ''; show(); });
  }).catch(() => {});
  $('#eok').onclick = async () => {
    const name = $('#ep').value.trim();
    if (!chosen || chosen.name !== name) { toast(name ? '請從清單點選一個地點；只想改名字請按「只改名字」' : '請先輸入或點選一個地點'); return; }
    Object.assign(c, { placeName: chosen.name, placeType: chosen.type || '', poiId: chosen.id || '', confirmed: true });
    if (chosen.lat != null) Object.assign(c, { lat: chosen.lat, lng: chosen.lng, acc: 0 });
    await store.saveCheckin(c); toast('地點已更正'); closeSheet();
  };
  $('#ename').onclick = async () => {
    const name = $('#ep').value.trim() || (await inputDlg('地點名稱', c.placeName));
    if (!name) return;
    c.placeName = name; c.confirmed = true;
    await store.saveCheckin(c); toast('名字已更新'); closeSheet();
  };
}

// 補打卡：改這一站的日期和時間（日常會自動放進那個月的日常）
function editTimeSheet(c, inDaily) {
  const d = new Date(c.ts), p2 = n => String(n).padStart(2, '0');
  openSheet(`<h2 class="h2">改時間</h2>
    <p class="muted" style="margin-top:0">補打卡的話，改成真正去的那一天。</p>
    <p class="lbl">日期</p><input id="td" class="inp" type="date" value="${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}">
    <p class="lbl">時間</p><input id="tt" class="inp" type="time" value="${p2(d.getHours())}:${p2(d.getMinutes())}">
    <div class="row sheet-act"><button class="btn main" id="tok">${icon('check')}儲存</button></div>`);
  $('#tok').onclick = async () => {
    const [y, m, dd] = ($('#td').value || '').split('-').map(Number), [hh, mm] = ($('#tt').value || '00:00').split(':').map(Number);
    if (!y || !m || !dd) { toast('請選一個日期'); return; }
    const ts = new Date(y, m - 1, dd, hh || 0, mm || 0).getTime();
    if (ts > Date.now() + 60e3) { toast('不能選未來的時間'); return; }
    c.ts = ts;
    if (inDaily) await moveToDaily(c); else await store.saveCheckin(c);
    toast('時間已更新'); closeSheet(); rerender();
  };
}

// ---------- 單一打卡點 ----------
async function checkin(id) {
  const c = await store.getCheckin(id);
  if (!c) { location.hash = ''; return; }
  const t = await store.getTrip(c.tripId);
  const m = await store.listMedia(id);
  // 孩子拍的另外算，不佔大人的 9 張
  const mine = m.filter(x => x.by !== 'kid'), kidm = m.filter(x => x.by === 'kid');
  const vis = mine.filter(x => x.kind !== 'audio'), aud = mine.filter(x => x.kind === 'audio');
  const kidGroups = [];
  kidm.forEach(x => { const key = x.kidId || ''; let g = kidGroups.find(y => y.key === key); if (!g) { const k = kidById(key); g = { key, kid: k, name: k ? k.name : '孩子', items: [] }; kidGroups.push(g); } g.items.push(x); });
  (c.kidIds || []).forEach(id => { if (!kidGroups.find(g => g.key === id) && c.kidRate && c.kidRate[id]) { const k = kidById(id); kidGroups.push({ key: id, kid: k, name: k ? k.name : '孩子', items: [] }); } });
  const rateHTML = r => (!r ? '' : `<span class="krate">${r.s ? `<b>${'★'.repeat(r.s)}<i>${'★'.repeat(3 - r.s)}</i></b>` : ''}${r.f && FEELS[r.f] ? `<em>${FEELS[r.f]}</em>` : ''}</span>`);
  const kidHTML = kidGroups.map(g => `<section class="kidshot" style="--kc:${g.kid ? colorHex(g.kid) : 'var(--honey)'}">
      <h2 class="h2"><span class="kidbee">${beeSVG('')}</span>${esc(g.name)}拍的 ${rateHTML((c.kidRate || {})[g.key])}</h2>
      <div class="kidrow">${g.items.filter(x => x.kind !== 'audio').map(x => `<div class="ktile"><button class="tile-v" data-kv="${x.id}" aria-label="查看">${x.thumb ? `<img src="${ou(x.thumb)}" alt="">` : `<span class="vph">${icon('play')}</span>`}${x.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}</button><button class="kdel" data-kd="${x.id}" aria-label="刪除">${icon('trash')}</button></div>`).join('')}</div>
      ${g.items.filter(x => x.kind === 'audio').map(x => `<div class="audrow">${x.q ? `<span class="kq">${esc(x.q)}</span>` : ''}<audio controls preload="metadata" src="${ou(x.blob)}"></audio><button class="icon-btn" data-kd="${x.id}" aria-label="刪除這段聲音">${icon('trash')}</button></div>`).join('')}
    </section>`).join('');
  const b = BADGES[badgeOf(c.placeType)];
  const pending = isKid(c) && !c.confirmed;
  const inDaily = isDaily(t) || dailyId_(c.tripId);
  view.innerHTML = `<a class="back" href="${inDaily ? '#daily' : `#trip/${c.tripId}`}">${icon('back')}${inDaily ? '日常' : esc(t?.name || '旅行包')}</a>
    <div class="detail-head"><div class="card-ic lg">${icon(b.icon)}</div><div><h1 class="h1">${esc(c.placeName)}</h1><p class="muted">${fmtDate(c.ts)} ${fmtTime(c.ts)}${c.acc ? ` · 誤差約 ${c.acc} 公尺` : ''}</p>${isKid(c) && isAdult(c) ? '<span class="tag kid">孩子＋大人一起打卡</span>' : ''}</div></div>
    ${pending ? `<div class="kidbox">${icon('honey')}<div><b>這是孩子蓋的章（${esc(b.name)}）</b><p>系統自動選了最近的地點，請確認是否正確。</p><div class="row"><button class="btn main sm" id="conf">${icon('check')}地點正確</button><button class="btn sm" id="ren">${icon('pin')}修改地點</button></div></div></div>` : ''}
    <div class="row">${pending ? '' : `<button class="btn sm" id="ren">${icon('pin')}修改地點</button>`}<button class="btn sm" id="retime">${icon('clock')}改時間</button>${inDaily ? '' : `<button class="btn sm" id="todaily">${icon('flower')}移到日常</button>`}${c.lat != null ? `<a class="btn sm" href="${amapLink(c.lat, c.lng, c.placeName)}" target="_blank" rel="noopener">${icon('map')}在高德地圖開啟</a>` : ''}</div>
    <h2 class="h2">照片與影片 <small>${vis.length}/${MAX}・影片最多 ${MAX_VIDEOS} 支</small></h2>
    <div class="grid">
      ${vis.map(x => `<div class="tile${x.star ? ' star' : ''}"><button class="tile-v" data-v="${x.id}" aria-label="查看">${x.thumb ? `<img src="${ou(x.thumb)}" alt=""${fpos(x)}>` : `<span class="vph">${icon('play')}</span>`}${x.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}</button><button class="tile-s" data-s="${x.id}" aria-pressed="${x.star ? 'true' : 'false'}" aria-label="精選"><span class="star-badge">${icon('star')}</span></button>${x.focus ? `<i class="focus-dot" style="left:${(x.focus.x * 100).toFixed(1)}%;top:${(x.focus.y * 100).toFixed(1)}%"></i>` : ''}</div>`).join('')}
      ${vis.length < MAX ? `<label class="tile add">${icon('plus')}<span>加照片<br>或影片</span><input type="file" accept="image/*,video/*" multiple id="f"></label>` : ''}
    </div>
    <p class="muted sm">點右上角星星設為「精選」，之後生成短片會優先使用。</p>
    ${kidHTML}
    <h2 class="h2">聲音</h2>
    ${aud.map(x => `<div class="audrow"><span class="tag">大人</span><audio controls preload="metadata" src="${ou(x.blob)}"></audio><button class="icon-btn" data-d="${x.id}" aria-label="刪除這段聲音">${icon('trash')}</button></div>`).join('') || '<p class="muted">還沒有聲音。</p>'}
    ${aud.length ? '<p class="muted sm">每站一段聲音。想重錄，先按垃圾桶刪掉。</p>' : `<button class="btn" id="rec" style="margin-top:8px">${icon('mic')}錄一段聲音</button>`}
    <h2 class="h2">備註</h2>
    <textarea id="note" class="inp" rows="3" placeholder="今天發生了什麼好玩的事？">${esc(c.note || '')}</textarea>
    <div class="row"><button class="btn danger" id="del">${icon('trash')}刪除這次打卡</button></div>`;

  $('#ren').onclick = () => editPlaceSheet(c);
  $('#retime').onclick = () => editTimeSheet(c, inDaily);
  if ($('#conf')) $('#conf').onclick = async () => { c.confirmed = true; await store.saveCheckin(c); toast('已確認'); rerender(); };
  if ($('#f')) $('#f').onchange = async e => { await addFiles(id, e.target.files); rerender(); };
  if ($('#rec')) $('#rec').onclick = () => recordSheet(id);
  let nt = null;
  $('#note').oninput = e => { clearTimeout(nt); nt = setTimeout(async () => { c.note = e.target.value; await store.saveCheckin(c); }, 500); };
  view.querySelectorAll('[data-s]').forEach(btn => btn.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    const x = vis.find(v => v.id === btn.dataset.s);
    x.star = !x.star;
    btn.setAttribute('aria-pressed', x.star ? 'true' : 'false');
    btn.closest('.tile').classList.toggle('star', x.star);
    toast(x.star ? '已設為精選' : '已取消精選');
    await store.updateMedia(x);
  });
  view.querySelectorAll('[data-v]').forEach(btn => btn.onclick = () => viewer(vis.find(v => v.id === btn.dataset.v), vis, { del: true }));
  view.querySelectorAll('[data-d]').forEach(btn => btn.onclick = async () => { if (await confirmDlg('刪除這段聲音？', '刪除')) { await store.deleteMedia(btn.dataset.d); rerender(); } });
  view.querySelectorAll('[data-kv]').forEach(btn => btn.onclick = () => viewer(kidm.find(v => v.id === btn.dataset.kv)));
  if ($('#todaily')) $('#todaily').onclick = async () => {
    if (!(await confirmDlg(`把「${c.placeName}」移到日常？照片、聲音會一起移過去。`, '移到日常', '取消'))) return;
    const from = c.tripId;
    await moveToDaily(c);
    toast('已移到日常');
    location.hash = (await store.listCheckins(from)).length ? `trip/${from}` : 'daily';
  };
  view.querySelectorAll('[data-kd]').forEach(btn => btn.onclick = async () => { if (await confirmDlg('刪除孩子拍的這一個？', '刪除')) { await store.deleteMedia(btn.dataset.kd); rerender(); } });
  const delCheckin = async () => {
    if (!(await confirmDlg(`確定刪除「${c.placeName}」這次打卡？照片、影片和聲音會一起刪除，無法復原。`, '確定刪除', '取消'))) return;
    await store.deleteCheckin(id); toast('已刪除'); location.hash = `trip/${c.tripId}`;
  };
  $('#del').onclick = delCheckin;
}

// ---------- 照片焦點：點一下最想看到的地方 ----------
// 用同一個彈出畫面，直接進入「設定焦點」
function focusEditor(m) {
  if (!(m.kind === 'photo' ? m.blob : m.thumb)) { toast('這個檔案沒有可以設定焦點的畫面'); return Promise.resolve(false); }
  return new Promise(res => viewer(m, null, { focusOnly: true, done: res }));
}

// 照片有設焦點時，小卡片裁切以焦點為主
const fpos = m => (m && m.focus ? ` style="object-position:${(m.focus.x * 100).toFixed(1)}% ${(m.focus.y * 100).toFixed(1)}%"` : '');

// 看照片：在原本那一頁上彈出來（背景是原本的頁面，霧化），點旁邊或左上角 ✕ 收起來
// 下方：左邊「焦點」、中間星星；opt.del 時右邊有刪除（打卡頁才有）
// opt.oneStar：日常用，一天只能有一張精選
function viewer(x, list, opt = {}) {
  const L = list && list.length ? list : [x];
  let i = Math.max(0, L.indexOf(x)), u = null, changed = false, focusing = !!opt.focusOnly, f = null;
  const ov = document.createElement('div');
  ov.className = 'pv';
  const pct = v => (v * 100).toFixed(1) + '%';
  const draw = () => {
    if (u) URL.revokeObjectURL(u);
    const m = L[i], many = L.length > 1 && !focusing;
    const src = focusing && m.kind !== 'photo' ? m.thumb : m.blob;
    u = URL.createObjectURL(src);
    const media = m.kind === 'video' && !focusing ? `<video src="${u}" controls playsinline autoplay></video>` : `<img src="${u}" alt="">`;
    const dot = focusing && f ? `<i class="pv-dot" style="left:${pct(f.x)};top:${pct(f.y)}"></i>` : '';
    const bar = opt.add
      ? (m.added && m.added.length ? `<button class="pv-pill" data-a="add">${icon('check')}已加到我的・再加一次</button>` : `<button class="pv-pill main" data-a="add">${icon('plus')}加到我的那一天</button>`)
      : focusing
      ? `<button class="pv-pill" data-a="fclear">清除</button><button class="pv-pill main" data-a="fok">${icon('check')}完成</button>`
      : `<button class="pv-ic" data-a="focus" aria-label="設定焦點" ${m.kind === 'audio' ? 'disabled' : ''}>${icon('focus')}<small>焦點</small></button>
         ${m.kind === 'audio' ? '<span class="pv-star-sp"></span>' : `<button class="pv-star${m.star ? ' on' : ''}" data-a="star" aria-pressed="${m.star ? 'true' : 'false'}" aria-label="${m.star ? '取消精選' : '設為精選'}">${icon(m.star ? 'star' : 'star-o')}</button>`}
         ${opt.del ? `<button class="pv-ic del" data-a="del" aria-label="刪除">${icon('trash')}<small>刪除</small></button>` : '<span class="pv-ic sp"></span>'}`;
    ov.innerHTML = `<button class="pv-x" data-a="close" aria-label="關閉">${icon('close')}</button>
      ${focusing ? '<p class="pv-tip">點一下最想看到的地方（例如臉），卡片和短片都會以這裡為主</p>' : many ? `<p class="pv-cnt">${i + 1} / ${L.length}</p>` : ''}
      <div class="pv-ph${focusing ? ' focusing' : ''}">${media}${dot}</div>
      ${many && L.length <= 12 ? `<div class="pv-dots">${L.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}
      <div class="pv-bar">${bar}</div>`;
  };
  const startFocus = () => { const m = L[i]; f = m.focus ? { ...m.focus } : null; focusing = true; draw(); };
  const endFocus = ok => {
    if (opt.focusOnly) { close(); opt.done && opt.done(ok); return; }
    focusing = false; draw();
  };
  if (focusing) { f = x.focus ? { ...x.focus } : null; }
  draw();
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('in'));
  const close = () => { ov.classList.remove('in'); setTimeout(() => { ov.remove(); if (u) URL.revokeObjectURL(u); }, 180); if (changed) rerender(); };
  const go = d => { const n = i + d; if (n < 0 || n >= L.length) return; i = n; draw(); };
  let sx = null, swT = 0;
  ov.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
  ov.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50 && !focusing) { swT = Date.now(); go(dx < 0 ? 1 : -1); } });
  ov.onclick = async e => {
    if (Date.now() - swT < 400) return;
    const a = e.target.closest('[data-a]')?.dataset.a;
    // 設定焦點：點照片放點
    if (focusing && !a && e.target.closest('.pv-ph img')) {
      const b = e.target.getBoundingClientRect();
      f = { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
      draw(); return;
    }
    // 點旁邊空白：收起來（設定焦點時＝取消）
    if (!a) { if (e.target.closest('.pv-ph, .pv-bar, .pv-dots')) return; if (focusing) endFocus(false); else close(); return; }
    if (a === 'close') { if (focusing && opt.focusOnly) { endFocus(false); return; } close(); }
    if (a === 'focus') startFocus();
    if (a === 'add' && opt.add) { if (await opt.add(L[i])) { changed = true; draw(); } }
    if (a === 'fclear') { f = null; draw(); }
    if (a === 'fok') {
      const m = L[i];
      if (f) m.focus = f; else delete m.focus;
      await store.updateMedia(m); changed = !opt.focusOnly;
      toast(f ? '已設定焦點' : '已清除焦點');
      endFocus(true);
    }
    if (a === 'star') {
      const m = L[i]; m.star = !m.star;
      if (m.star && opt.oneStar) for (const o of L) if (o !== m && o.star) { o.star = false; await store.updateMedia(o); }
      await store.updateMedia(m); changed = true;
      toast(m.star ? (opt.oneStar ? '已設為這天的精選，會排在第一張' : '已設為精選') : '已取消精選');
      draw();
      if (m.star) ov.querySelector('.pv-star')?.classList.add('pop');
    }
    if (a === 'del' && (await confirmDlg('刪除這個檔案？', '刪除'))) { await store.deleteMedia(L[i].id); changed = true; close(); }
  };
}

// ---------- 孩子：新增／編輯 ----------
function kidEditor(k) {
  const d = k ? { theme: 'garden', ...k } : { name: '', color: Object.keys(KID_COLORS)[getKids().length % 6], age: 'small', theme: 'garden' };
  const draw = () => {
    openSheet(`<h2 class="h2" style="margin-top:0">${k ? '編輯孩子' : '新增孩子'}</h2>
      <label class="lbl" for="kn">小名</label><input id="kn" class="inp" maxlength="8" placeholder="例如：小寶、豆豆" value="${esc(d.name)}">
      <p class="lbl">蜜蜂顏色</p><div class="kcolors">${Object.entries(KID_COLORS).map(([key, c]) => `<button data-kc="${key}" class="${d.color === key ? 'on' : ''}" style="--kc:${c.hex}" aria-label="${c.name}"><span class="kidbee">${beeSVG('')}</span><small>${c.name}</small></button>`).join('')}</div>
      <p class="lbl">花園主題</p><div class="seg" role="group" aria-label="花園主題"><button data-kt="garden" class="${d.theme !== 'block' ? 'on' : ''}">花園小夥伴</button><button data-kt="block" class="${d.theme === 'block' ? 'on' : ''}">方塊冒險</button></div>
      <p class="muted sm">每蓋一個章，就會遇到一個新夥伴。${d.theme === 'block' ? '方塊冒險：像素方塊世界和方塊夥伴。' : '花園小夥伴：原本的花園和小昆蟲夥伴。'}</p>
      <p class="lbl">年紀</p><div class="seg" role="group" aria-label="小童或大童"><button data-ka="small" class="${d.age !== 'big' ? 'on' : ''}">小童</button><button data-ka="big" class="${d.age === 'big' ? 'on' : ''}">大童</button></div>
      <p class="muted sm">${d.age === 'big' ? '大童：用自己的 iPhone，每一站可以拍 4 張照片、錄 1 段 10 秒影片、1 段 15 秒錄音。' : '小童：用爸媽的手機刷吊飾蓋章，可以錄一句話，不能拍照。'}</p>
      <div class="row"><button class="btn main" id="ksave">${icon('check')}儲存</button>${k ? `<button class="btn danger sm" id="kdel">${icon('trash')}刪除</button>` : ''}<button class="btn sm" id="kx">取消</button></div>
      ${k ? '<p class="muted sm">刪除只會拿掉這個孩子的設定；他蓋過的章和拍的照片都還在。</p>' : ''}`);
    $('#kn').oninput = e => { d.name = e.target.value; };
    sb.querySelectorAll('[data-kc]').forEach(b => b.onclick = () => { d.color = b.dataset.kc; draw(); });
    sb.querySelectorAll('[data-ka]').forEach(b => b.onclick = () => { d.age = b.dataset.ka; draw(); });
    sb.querySelectorAll('[data-kt]').forEach(b => b.onclick = () => { d.theme = b.dataset.kt; draw(); });
    $('#kx').onclick = closeSheet;
    $('#ksave').onclick = async () => {
      if (!d.name.trim()) { toast('請填小名'); return; }
      if (k) upsertKid({ ...d, name: d.name.trim() }); else newKid(d.name, d.color, d.age, d.theme);
      await closeSheet(); toast('已儲存'); rerender();
    };
    if ($('#kdel')) $('#kdel').onclick = async () => { if (await confirmDlg(`刪除「${k.name}」的設定？他的章和照片都會留著。`, '刪除')) { removeKid(k.id); await closeSheet(); rerender(); } };
  };
  draw();
}

// ---------- 設定 ----------
async function settings() {
  const base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  const adultUrl = `${base}index.html?tap=1`, kidUrl0 = `${base}kid.html?tap=1`;
  let usage = '';
  try { const e = await navigator.storage?.estimate?.(); if (e) usage = `已使用約 ${(e.usage / 1048576).toFixed(1)} MB`; } catch (e) {}
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.(); } catch (e) {}
  view.innerHTML = `<a class="back" href="#">${icon('back')}回到打卡</a>${topbar(false)}
    <section class="sec">
      <h2 class="h2">試用</h2>
      <label class="switch"><span><b>模擬模式</b><br><span class="muted sm">不用出門，用雲南的示範地點試玩打卡流程</span></span><input type="checkbox" id="demo" ${getSetting('demo') === '1' ? 'checked' : ''}></label>
    </section>
    <section class="sec">
      <h2 class="h2">孩子</h2>
      <label class="switch"><span><b>孩子打卡</b><br><span class="muted sm">孩子有自己的打卡頁和吊飾；地圖可以分開看大人和孩子。關掉後只會隱藏，紀錄都還在。</span></span><input type="checkbox" id="kidm" ${kidOn() ? 'checked' : ''}></label>
      ${kidOn() ? `<div class="kidlist">${getKids().map(k => `<div class="kidcard" style="--kc:${colorHex(k)}"><span class="kidbee">${beeSVG('')}</span><div class="card-main"><b>${esc(k.name)}</b><small>${k.age === 'big' ? '大童・用自己的手機，可以拍照、錄影、錄音' : '小童・用爸媽的手機蓋章'}・${k.theme === 'block' ? '方塊冒險' : '花園小夥伴'}</small></div><button class="btn sm" data-kedit="${esc(k.id)}">編輯</button></div>
        <div class="copyrow kidurl"><code>${esc(kidUrl(base, k))}</code><button class="btn sm" data-copy="${esc(kidUrl(base, k))}">複製</button><a class="btn sm" href="${esc(kidUrl(base, k).replace('tap=1&', ''))}">打開</a></div>`).join('') || '<p class="muted sm">還沒有設定孩子。新增後，每個孩子會有自己的吊飾網址。</p>'}</div>
      <div class="row"><button class="btn sm" id="kadd">${icon('plus')}新增孩子</button></div>
      <p class="muted sm">把孩子的網址寫進他的吊飾。大童：用他自己的 iPhone 碰吊飾（或打開網址），之後再「加到主畫面」。</p>` : ''}
    </section>
    <section class="sec">
      <h2 class="h2">地圖樣式</h2>
      <p class="muted sm">會用在採蜜地圖和一鍵短片。夜空在短片和明信片裡最明顯。</p>
      ${styleSeg()}
    </section>
    <section class="sec">
      <h2 class="h2">NFC 吊飾網址</h2>
      <p class="muted sm">用「NFC Tools」App 把下面的網址寫進吊飾。</p>
      <b>大人吊飾</b><div class="copyrow"><code>${esc(adultUrl)}</code><button class="btn sm" data-copy="${esc(adultUrl)}">複製</button></div>
      ${kidOn() && !getKids().length ? `<b style="display:block;margin-top:10px">孩子吊飾（還沒分是哪個孩子）</b><div class="copyrow"><code>${esc(kidUrl0)}</code><button class="btn sm" data-copy="${esc(kidUrl0)}">複製</button></div>` : kidOn() ? '<p class="muted sm" style="margin-top:8px">孩子的吊飾網址在上面「孩子」裡，每個孩子一條。</p>' : ''}
    </section>
    <section class="sec">
      <h2 class="h2">高德地圖（真實地圖、附近地點）</h2>
      <p class="muted sm">在中國大陸使用：到高德開放平台建立「Web 端（JS API）」應用後，把 Key 和安全密鑰貼在這裡。只存在這支手機上。<br>沒填的話，或在台灣、港澳和國外，會自動用免費的開放地圖（OpenStreetMap）；大陸的地點資料高德比較齊全。</p>
      <label class="lbl" for="ak">Key</label><input id="ak" class="inp" value="${esc(getSetting('amapKey'))}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <label class="lbl" for="as">安全密鑰</label><input id="as" class="inp" value="${esc(getSetting('amapSec'))}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="row"><button class="btn main sm" id="saveKey">儲存</button><button class="btn sm" id="testKey">測試</button></div>
      <p id="keyres" class="keyres" hidden></p>
    </section>
    <section class="sec">
      <h2 class="h2">備份</h2>
      <p class="muted sm">資料只存在這支手機的 Safari 裡。${usage ? `${usage}${persisted ? '，已設定為不自動清除' : ''}。` : ''}</p>
      <div class="bkinfo" id="bkinfo">讀取中…</div>
      <div class="row"><button class="btn main sm" id="expnew">${icon('check')}備份新增的</button><button class="btn sm" id="expall">完整備份</button></div>
      <div class="row"><label class="btn sm file">從備份還原<input type="file" id="imp" multiple></label>${kidOn() ? `<label class="btn sm file">${icon('honey')}加入孩子的打卡<input type="file" id="kimp"></label>` : ''}</div>
      ${kidOn() ? '<p class="muted sm">「加入孩子的打卡」：孩子傳來的檔案或孩子手機的備份都可以。會放在「孩子」分頁，不跟你的旅行混在一起。<b>只會加進來，不會覆蓋你的資料。</b></p>' : ''}
      <p class="muted sm">存的時候選「儲存到檔案」，放在 iCloud 雲碟的「蜂采備份」資料夾。還原時可以把資料夾裡的檔案一次全選。做過完整備份後，之前的小檔案就可以刪掉。</p>
    </section>
    <section class="sec"${kidOn() ? '' : ' hidden'}>
      <h2 class="h2">自訂花園主題</h2>
      <p class="muted sm">做好的主題會出現在孩子的「今天是什麼冒險？」選單裡。</p>
      <div class="cards">${listCustom().map(t => `<div class="card" style="align-items:center">${themeIcon(t, 44)}<div class="card-main"><div class="card-t">${esc(t.name)}</div></div><button class="btn sm" data-ced="${esc(t.id)}">編輯</button><button class="icon-btn" data-cdel="${esc(t.id)}" aria-label="刪除主題">${icon('trash')}</button></div>`).join('') || '<p class="muted">還沒有自訂主題。</p>'}</div>
      <div class="row"><button class="btn sm" id="cnew">${icon('plus')}新增自訂主題</button></div>
    </section>
    <section class="sec">
      <h2 class="h2">隱私與安全</h2>
      <ul>
        <li>目前所有照片、影片和聲音都只存在這支 iPhone 上，不會上傳到任何伺服器。</li>
        <li>照片加入時會重新壓縮，照片裡隱藏的 GPS 等資訊會一併移除。</li>
        <li>原始照片仍保留在你的 iPhone 相簿，蜂采只存一份較小的副本。</li>
        <li>注意：清除 Safari 網站資料，或太久沒有打開蜂采，資料可能會被系統清掉，請記得備份。</li>
      </ul>
    </section>
    <section class="sec">
      <h2 class="h2">危險區</h2>
      <div class="row"><button class="btn danger sm" id="wipe">清除這支手機上的所有蜂采資料</button></div>
      <p class="muted sm">蜂采 v${CONFIG.version}</p>
    </section>`;
  $('#cnew').onclick = async () => { if (await customEditor()) rerender(); };
  view.querySelectorAll('[data-ced]').forEach(b => b.onclick = async () => { const t = listCustom().find(x => x.id === b.dataset.ced); if (t && await customEditor(t)) rerender(); });
  view.querySelectorAll('[data-cdel]').forEach(b => b.onclick = async () => { if (await confirmDlg('刪除這個自訂主題？已經用這個主題的日子會變回預設草地。', '刪除')) { deleteCustom(b.dataset.cdel); rerender(); } });
  view.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { setSetting('mapStyle', b.dataset.style); view.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b)); toast(`地圖樣式：${b.textContent}`); });
  if ($('#kadd')) $('#kadd').onclick = () => kidEditor(null);
  view.querySelectorAll('[data-kedit]').forEach(b => b.onclick = () => kidEditor(kidById(b.dataset.kedit)));
  $('#kidm').onchange = e => { setSetting('kidMode', e.target.checked ? 'on' : 'off'); toast(e.target.checked ? '已開啟孩子打卡' : '已關閉孩子打卡，紀錄都還在'); rerender(); };
  $('#demo').checked = isDemo();
  $('#demo').onchange = e => { if (e.target.checked) setSetting('demo', '1'); else demoOff(); toast(e.target.checked ? '已開啟模擬模式' : '已關閉模擬模式'); };
  view.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('已複製'); } catch (e) { toast('無法複製，請長按網址手動複製'); } });
  $('#saveKey').onclick = () => { setSetting('amapKey', $('#ak').value.trim()); setSetting('amapSec', $('#as').value.trim()); toast('已儲存，馬上重新載入'); setTimeout(() => location.reload(), 900); };
  $('#testKey').onclick = async () => {
    const box = $('#keyres');
    if ($('#ak').value.trim() !== getSetting('amapKey') || $('#as').value.trim() !== getSetting('amapSec')) { box.hidden = false; box.className = 'keyres warn'; box.textContent = '你改了 Key 或安全密鑰，請先按「儲存」，重新載入後再按「測試」。'; return; }
    box.hidden = false; box.className = 'keyres'; box.textContent = '測試中…';
    const r = await testAMap();
    box.className = 'keyres ' + (r.ok ? 'ok' : 'warn'); box.textContent = (r.ok ? '✓ ' : '✗ ') + r.msg;
  };
  const drawBk = async () => {
    const b = await store.backupStatus(), el = $('#bkinfo'); if (!el) return;
    const parts = [b.n.photo && `${b.n.photo} 張照片`, b.n.video && `${b.n.video} 段影片`, b.n.audio && `${b.n.audio} 段聲音`].filter(Boolean);
    el.innerHTML = b.last ? `上次備份：<b>${fmtDate(b.last)}</b>${b.full ? `・上次完整備份：${fmtDate(b.full).replace(/ 週.$/, '')}` : ''}<br>${parts.length || b.checkins ? `之後新增了 ${[...parts, b.checkins && `${b.checkins} 次打卡`].filter(Boolean).join('、')}` : '之後沒有新增，已經是最新的'}` : '<b>還沒有備份過。</b>建議先做一次完整備份。';
  };
  drawBk();
  $('#expnew').onclick = async () => { if (await doBackup('new')) drawBk(); };
  $('#expall').onclick = async () => { if (await doBackup('all')) drawBk(); };
  if ($('#kimp')) $('#kimp').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) receiveKid(f); };
  $('#imp').onchange = async e => {
    let fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
    // 孩子的檔案（傳來的或孩子手機的備份）不整包還原，改成勾選合併
    const kidFs = [];
    for (const f of fs) { try { if (await kidHead(f)) kidFs.push(f); } catch (err) {} }
    if (kidFs.length) { toast('這是孩子的檔案，改用「加入孩子的打卡」，不會覆蓋你的資料'); fs = fs.filter(f => !kidFs.includes(f)); await receiveKid(kidFs[0]); }
    if (!fs.length) return;
    let t = 0, c = 0, m = 0, bad = 0, badItems = 0, why = '';
    for (const [i, f] of fs.entries()) {
      toast(`還原中 ${i + 1}/${fs.length}…（照片影片多的話要等一下）`);
      try { const r = await store.importAll(f); t = Math.max(t, r.trips); c = Math.max(c, r.checkins); m += r.media; badItems += r.bad || 0; why = why || r.err || ''; }
      catch (err) { bad++; why = why || err.message; }
    }
    if (bad || badItems) await confirmDlg(`還原好了 ${t} 個旅程、${c} 次打卡、${m} 個照片影片聲音。${bad ? `有 ${bad} 個檔案整個讀不進來。` : ''}${badItems ? `有 ${badItems} 個照片影片聲音沒存進去。` : ''}${why ? `（原因：${why}）` : ''}`, '知道了', '');
    else toast(`已還原 ${t} 個旅程、${c} 次打卡、${m} 個照片影片聲音`);
    drawBk();
  };
  $('#wipe').onclick = async () => {
    if (!(await confirmDlg('確定要清除所有旅程、打卡、照片和聲音？建議先匯出備份。此動作無法復原。', '全部清除'))) return;
    await store.clearAll(); try { localStorage.removeItem('fc-active'); } catch (e) {}
    toast('已清除'); location.hash = '';
  };
}

// ---------- 啟動 ----------
const params = new URLSearchParams(location.search);
// 先讀小蜜蜂的造型（./bee.svg），再畫畫面
await loadBee();
route().then(() => {
  if (params.has('tap')) {
    history.replaceState(null, '', location.pathname + (params.has('demo') ? '?demo=1' : '') + location.hash);
    startCheckin();
  }
});
