// 蜂采 大人頁面
import { CONFIG, getSetting, setSetting } from './config.js';
import { store, ensureActiveTrip, getActiveId, setActiveId, askPersist, isKid, isAdult, findMergeTarget, getMode, startTrip, resumeTrip, endTrip, isDaily, moveDaysToTrip } from './store.js';
import { getPosition, nearby, badgeOf, BADGES, shortType, isDemo, amapLink } from './geo.js';
import { compressImage, videoThumb, startRecorder, blobDims } from './media.js';
import { mountMap, gardenSVG, dayInfo, defaultDay, markerSVG, markerNumSVG, whoText } from './map.js';
import { allThemes, getTheme, themeIcon, itemIcon, ITEMS, GROUNDS, listCustom, saveCustom, deleteCustom } from './themes.js';
import { collect, renderPostcard, DEFAULT_PC, PALETTES, TEMPLATES, SIZES } from './postcard.js';
import { makeVideo, estimate, canMakeVideo, selectVisuals, layoutItems, stopDuration, voiceLen, isLand, PER_STOP } from './video.js';
import { TRACKS } from './music.js';
import { $, esc, toast, confirmDlg, inputDlg, fmtTime, fmtDate, dayKey, uid, icon } from './ui.js';

const view = $('#view'), sheet = $('#sheet'), sb = $('#sheetbody');
const MAX = CONFIG.maxVisualPerPlace;

// ---------- 圖片網址管理（避免記憶體一直增加） ----------
let urls = [];
const ou = b => { if (!b) return ''; const u = URL.createObjectURL(b); urls.push(u); return u; };
const freeUrls = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };

// ---------- 路由 ----------
let curMap = null;
async function route(keepScroll = false) {
  freeUrls();
  if (curMap) { curMap.destroy(); curMap = null; }
  const [r, id] = location.hash.slice(1).split('/');
  const tab = r === 'trip' || r === 'c' || r === 'trips' || r === 'card' || r === 'video' ? 'trips' : r === 'settings' ? 'settings' : r === 'map' ? 'map' : 'home';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.t === tab));
  try {
    if (r === 'trips') await trips();
    else if (r === 'trip') await trip(id);
    else if (r === 'c') await checkin(id);
    else if (r === 'settings') await settings();
    else if (r === 'map') await mapView(id);
    else if (r === 'card') await cardView(id);
    else if (r === 'video') await videoView(id);
    else await home();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="err">發生錯誤：${esc(e.message)}</p>`;
  }
  if (!keepScroll) window.scrollTo(0, 0);
}
const rerender = () => route(true);
window.addEventListener('hashchange', () => { document.querySelector('.snack')?.remove(); route(); });

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
  const th = vis.slice(0, 4).map(x => (x.thumb ? `<img src="${ou(x.thumb)}" alt="">` : `<span class="vph">${icon('play')}</span>`)).join('');
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
const topbar = () => `<header class="top"><img src="./logo.svg" class="logo" alt=""><div><h1>蜂采</h1><p class="sub">飛到哪，甜到哪</p></div></header>`;

// ---------- 首頁 ----------
async function home() {
  const t = await ensureActiveTrip();
  const meta = await withMedia(await store.listCheckins(t.id));
  const kidP = meta.filter(x => isKid(x.c) && !x.c.confirmed).length;
  const empty = meta.filter(x => !x.m.length).length;
  const recent = meta.slice(-5).reverse();
  view.innerHTML = `${topbar()}
    ${modeBar(t)}
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
  bindModeBar();
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
async function goDaily() {
  const t = await ensureActiveTrip();
  if (isDaily(t)) return;
  endTrip(); t.endedAt = Date.now(); await store.saveTrip(t);
  const cs = await store.listCheckins(t.id);
  const undo = async () => { delete t.endedAt; await store.saveTrip(t); resumeTrip(t.id); toast('已回到旅行'); rerender(); };
  if (t.nameAuto && cs.length) nameCard(t, cs, undo);
  else snack('歡迎回家，已回到日常', '復原', undo);
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
    <button class="linkbtn" id="nmundo" style="display:block;margin:8px auto 0">不小心滑到的？回到旅行</button>`);
  const save = async name => { if (name) { t.name = name; t.nameAuto = false; await store.saveTrip(t); toast(`已命名為「${name}」`); } ov.remove(); rerender(); };
  ov.querySelectorAll('[data-s]').forEach(b => b.onclick = () => save(sug[+b.dataset.s]));
  ov.querySelector('#nmok').onclick = () => save(ov.querySelector('#nmin').value.trim());
  ov.querySelector('#nmskip').onclick = () => save('');
  ov.querySelector('#nmundo').onclick = () => { ov.remove(); undo(); };
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

function pickPlace(pos, list) {
  const L = list.slice(0, 8);
  const noKey = !getSetting('amapKey') && !isDemo();
  openSheet(`<h2 class="h2">你在哪裡？</h2>
    ${pos.acc ? `<p class="muted">定位誤差約 ${pos.acc} 公尺${isDemo() ? '（模擬）' : ''}</p>` : ''}
    ${L.length ? `<div class="places">${L.map((p, i) => `<label class="place"><input type="radio" name="pl" value="${i}" ${i === 0 ? 'checked' : ''}><span class="pl-ic">${icon(BADGES[badgeOf(p.type)].icon)}</span><span class="pl-t">${esc(p.name)}<small>${esc(shortType(p.type))}${p.dist ? ` · ${p.dist} 公尺` : ''}</small></span></label>`).join('')}</div>`
      : `<p class="note">${noKey && pos.lat != null ? '還沒設定高德地圖金鑰，所以沒有附近地點清單（可到「設定」填寫）。' : '附近找不到地點資料。'}請直接輸入地點名稱。</p>`}
    <label class="lbl" for="manual">${L.length ? '都不是？自己輸入' : '地點名稱'}</label>
    <input id="manual" class="inp" placeholder="例如：大理古城南門" autocomplete="off">
    <div class="row"><button class="btn main" id="ok">${icon('check')}確認打卡</button>${pos.lat != null ? '<button class="btn" id="relo">重新定位</button>' : ''}</div>`);
  if ($('#relo')) $('#relo').onclick = startCheckin;
  $('#manual').oninput = e => { if (e.target.value.trim()) sb.querySelectorAll('input[name=pl]').forEach(r => { r.checked = false; }); };
  $('#ok').onclick = async () => {
    const man = $('#manual').value.trim();
    const sel = sb.querySelector('input[name=pl]:checked');
    const p = man ? { name: man, type: '', id: '' } : sel ? L[+sel.value] : null;
    if (!p) { toast('請選一個地點，或輸入名稱'); return; }
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
  const have = (await store.listMedia(cid)).filter(x => x.kind !== 'audio').length;
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
        if (f.size > CONFIG.maxVideoMB * 1048576) { toast(`影片超過 ${CONFIG.maxVideoMB}MB，先略過，建議剪短一點再加`); continue; }
        const thumb = await videoThumb(f), d = await blobDims(thumb);
        await store.saveMedia({ id: uid(), checkinId: cid, kind: 'video', blob: f, thumb, star: false, ts: Date.now(), size: f.size, w: d?.w, h: d?.h });
      } else {
        const blob = await compressImage(f, CONFIG.photoMax, 0.85);
        const thumb = await compressImage(f, 400, 0.7);
        const d = await blobDims(blob);
        await store.saveMedia({ id: uid(), checkinId: cid, kind: 'photo', blob, thumb, star: false, ts: Date.now(), size: blob.size, w: d?.w, h: d?.h });
      }
      ok++;
    } catch (e) { toast('有一個檔案無法加入：' + e.message); }
  }
  if (ok) toast(`已加入 ${ok} 個檔案`);
  askPersist();
}

function recordSheet(cid, max = CONFIG.adultRecordSec) {
  openSheet(`<h2 class="h2">錄一段聲音</h2><p class="muted">最長 ${max} 秒。可以錄孩子的心得，或現場的聲音。</p>
    <div class="center"><button class="mic" id="mic" aria-label="開始或停止錄音">${icon('mic', 'big')}</button><p id="rs" class="big-n">按一下開始</p></div><div id="rprev"></div>`);
  let timer = null, left = max, recDur = 0;
  const mic = $('#mic'), rs = $('#rs');
  mic.onclick = async () => {
    if (activeRec) { stop(); return; }
    try { activeRec = await startRecorder(); } catch (e) { toast('無法使用麥克風：請允許 Safari 使用麥克風'); return; }
    $('#rprev').innerHTML = '';
    mic.classList.add('on'); left = max; rs.textContent = `錄音中… ${left} 秒（再按一下停止）`;
    timer = setInterval(() => { left--; rs.textContent = `錄音中… ${left} 秒（再按一下停止）`; if (left <= 0) stop(); }, 1000);
  };
  async function stop() {
    clearInterval(timer);
    const r = activeRec; activeRec = null;
    if (!r) return;
    mic.classList.remove('on');
    const blob = await r.stop();
    recDur = Math.max(1, max - left);
    rs.textContent = '錄好了，聽聽看';
    $('#rprev').innerHTML = `<audio controls src="${ou(blob)}" style="width:100%"></audio><div class="row"><button class="btn main" id="rsave">儲存</button><button class="btn" id="rredo">重錄</button></div>`;
    $('#rsave').onclick = async () => { await store.saveMedia({ id: uid(), checkinId: cid, kind: 'audio', blob, by: 'adult', star: false, ts: Date.now(), size: blob.size, dur: recDur }); toast('聲音已儲存'); closeSheet(); };
    $('#rredo').onclick = () => { $('#rprev').innerHTML = ''; rs.textContent = '按一下開始'; };
  }
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
    if (t.pcCache && t.pcCache.sig === sig) return t.pcCache.blob;
    const cv = await renderPostcard(data, pc);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.86));
    const fresh = await store.getTrip(tripId);
    if (fresh) { fresh.pcCache = { sig, blob }; await store.saveTrip(fresh); }
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
    if (b) el.innerHTML = `<img src="${ou(b)}" alt="足跡明信片"><span class="tn-pc-hint">${icon('flower')}點明信片：換版型、配色、存到相簿</span>`;
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
  const nodes = all.filter(x => !(isDaily(x.t) && !x.cs.length))
    .map(x => ({ ...x, a: x.cs[0]?.ts ?? x.t.createdAt, b: x.cs[x.cs.length - 1]?.ts ?? x.t.createdAt }))
    .sort((p, q) => q.b - p.b);
  // 每一天有什麼：旅行（淡花）、日常（小點）
  const marks = {};
  nodes.forEach(n => n.cs.forEach(c => {
    const k = dayKey(c.ts), o = marks[k] || (marks[k] = { trip: false, daily: false, ids: [] });
    if (isDaily(n.t)) o.daily = true; else o.trip = true;
    if (!o.ids.includes(n.t.id)) isDaily(n.t) ? o.ids.push(n.t.id) : o.ids.unshift(n.t.id);
  }));
  if (!calYM) { const d = new Date(); calYM = [d.getFullYear(), d.getMonth()]; }
  const curTrip = mode === 'trip' && nodes.find(n => n.t.id === act && !isDaily(n.t));
  view.innerHTML = `${topbar()}
    <div class="row between"><h2 class="h2" style="margin:10px 0">我的旅行包</h2>${curTrip ? `<a class="tag on" href="#trip/${act}">旅行中</a>` : `<button class="btn main sm" id="new">${icon('plus')}開始旅行</button>`}</div>
    <section class="calbox">
      <div class="calhead"><button class="calnav" data-mv="-1" aria-label="上個月">${icon('back')}</button><button class="calym" id="calym" aria-label="選擇年月"></button><button class="calnav nx" data-mv="1" aria-label="下個月">${icon('back')}</button></div>
      <div class="calgrid wk">${WKS.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="calgrid" id="calgrid"></div>
      <div class="callegend"><span><i class="lg-fl">${FLOWER_BG}</i>旅行</span><span><i class="lg-dot"></i>日常</span><button class="linkbtn" id="caltoday">回到本月</button></div>
    </section>
    ${nodes.length ? `<div class="tline">${nodes.map(n => nodeHTML(n, curTrip && curTrip.t.id === n.t.id)).join('')}</div>` : '<p class="empty">還沒有紀錄。在首頁按「打卡這裡」，或先「開始旅行」。</p>'}`;

  const drawCal = () => {
    const [y, m] = calYM, first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate(), today = dayKey(Date.now());
    $('#calym').innerHTML = `${y} 年 ${m + 1} 月${icon('back', 'dn')}`;
    let h = '<span></span>'.repeat(first);
    for (let d = 1; d <= n; d++) {
      const k = `${y}-${m + 1}-${d}`, o = marks[k];
      h += `<button class="cd${o?.trip ? ' has-trip' : ''}${o?.daily ? ' has-daily' : ''}${k === today ? ' today' : ''}" data-dk="${k}" ${o ? '' : 'tabindex="-1"'}>${o?.trip ? FLOWER_BG : ''}<span>${d}</span></button>`;
    }
    $('#calgrid').innerHTML = h;
    $('#calgrid').querySelectorAll('.cd').forEach(b => b.onclick = () => goDay(b.dataset.dk));
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
    const id = o.ids[0], el = view.querySelector(`.tnode[data-node="${id}"]`);
    if (!el) return;
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
  drawCal();
  view.querySelectorAll('.tnode.open .tn-pc').forEach(el => fillPostcard(el, el.dataset.pc));
  // 封面小圖：每包第一張照片
  for (const n of nodes) {
    const img = view.querySelector(`.tnode[data-node="${n.t.id}"] .tn-cover`);
    for (const c of n.cs) {
      const m = (await store.listMedia(c.id)).find(x => x.kind !== 'audio' && (x.thumb || x.kind === 'photo'));
      if (m) { img.innerHTML = `<img src="${ou(m.thumb || m.blob)}" alt="">`; break; }
    }
  }
}

function nodeHTML(n, travelling) {
  const daily = isDaily(n.t), open = openNodes.has(n.t.id) || travelling && !openNodes.size;
  if (open) openNodes.add(n.t.id);
  const days = [], idx = {};
  n.cs.forEach((c, i) => { const k = dayKey(c.ts); if (!(k in idx)) { idx[k] = days.length; days.push({ k, ts: c.ts, items: [] }); } days[idx[k]].items.push([c, i + 1]); });
  const range = n.cs.length ? (daily ? `${days.length} 天有紀錄` : `${md(n.a)}${dayKey(n.a) !== dayKey(n.b) ? '–' + md(n.b) : ''} · ${days.length} 天`) : '還沒有打卡';
  return `<div class="tnode${daily ? ' daily' : ''}${open ? ' open' : ''}" data-node="${n.t.id}">
    <button class="tn-head" aria-expanded="${open}"><span class="tn-cover">${icon(daily ? 'flower' : 'trip')}</span>
      <span class="tn-main"><b>${esc(n.t.name)}</b>${travelling ? ' <span class="tag on">旅行中</span>' : ''}<small>${range}${n.cs.length ? ` · ${n.cs.length} 站` : ''}</small></span>${icon('back', 'tn-chev')}</button>
    <div class="tn-body">
      ${n.cs.length ? `<a class="tn-pc" href="#card/${n.t.id}" data-pc="${n.t.id}"><span class="tn-pc-load">${icon('flower')}明信片準備中…</span></a>` : ''}
      ${days.map((d, i) => `<div class="tn-day" data-dk="${d.k}"><p class="tn-dt">${daily ? '' : `第 ${i + 1} 天 · `}${fmtDate(d.ts)}</p>
        ${d.items.map(([c, num]) => `<a class="tn-stop" href="#c/${c.id}"><svg width="30" height="30" viewBox="-24 -24 48 48" aria-hidden="true">${markerSVG(0, 0, c, num, 1.3, '', null, 'center')}</svg><span class="tn-tm">${fmtTime(c.ts)}</span><b>${esc(c.placeName.replace(/（模擬）/g, ''))}</b></a>`).join('')}</div>`).join('')}
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
const mapLegend = () => `<div class="legend mk-legend"><span>${mkIcon({ adult: true, kid: false }, 26)}大人打卡</span><span>${mkIcon({ adult: false, kid: true }, 26)}孩子蓋章</span><span>${mkIcon({ adult: true, kid: true }, 26)}一起打卡</span></div>`;

// 把地圖放進 box，並綁好天數切換、當天清單、「正常／可愛」與「連起來」
async function attachMap(box, checkins, height, seed, daily = false) {
  const info = dayInfo(checkins);
  let day = info.days.length ? defaultDay(info) : null, connected = false;
  const tabs = $('#daytabs'), list = $('#daylist'), conn = $('#conn');
  const resetConn = () => { connected = false; if (conn) conn.innerHTML = `${icon('flower')}連起來`; };
  const drawTabs = () => {
    if (!tabs) return;
    tabs.innerHTML = info.days.length > 1 || info.days.length === 0 ? `<button data-dd="all" class="${day == null ? 'on' : ''}">全部</button>` : '';
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
    style: mapStyle(), height, seed, day,
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

async function mapView(id) {
  const t = id ? await store.getTrip(id) : await ensureActiveTrip();
  if (!t) { location.hash = 'map'; return; }
  const cs = await store.listCheckins(t.id);
  const days = [...new Set(cs.map(c => dayKey(c.ts)))];
  const h = Math.max(320, Math.min(560, window.innerHeight - 330));
  view.innerHTML = `<div class="row between"><h1 class="h1">採蜜地圖</h1><span class="muted sm">${cs.length} 個地點</span></div>
    <button class="chip" id="tripchip" style="margin-top:8px">${icon('trip')}<span><b>${esc(t.name)}</b></span><em>換旅程</em></button>
    <div class="mapbar">${styleSeg()}<button class="btn main sm" id="conn">${icon('flower')}連起來</button></div>
    <div class="dayseg" id="daytabs"></div>
    <div id="mapbox"></div>
    <div class="daylist" id="daylist"></div>
    ${mapLegend()}
    <p class="muted sm" style="margin-top:10px">${getSetting('amapKey') ? '' : '目前是插畫地圖；到「設定」填入高德金鑰後，會換成真實的城市地圖。'}</p>`;
  $('#tripchip').onclick = () => { location.hash = 'trips'; };
  await attachMap($('#mapbox'), cs, h, t.id, isDaily(t));
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
      if (au && !au.dur) { const d = await audioDur(au.blob); if (d) { au.dur = d; await store.saveMedia(au); } }
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
      for (const x of vis) { const want = selIds.has(x.id); if (x.vid !== want) { x.vid = want; await store.saveMedia(x); } }
      if (selIds.has(m.id)) m.vid = false;
      else if (selIds.size >= PER_STOP) { toast(`每站最多 ${PER_STOP} 個，請先拿掉一個`); return; }
      else m.vid = true;
      await store.saveMedia(m);
      renderVList();
    });
    L.querySelectorAll('[data-lay]').forEach(b => b.onclick = async () => {
      const fresh = await store.getMedia(b.dataset.lay);
      const order = isLand(fresh) ? ['auto', 'pan', 'card', 'zoom'] : ['auto', 'card', 'zoom'];
      fresh.layout = order[(order.indexOf(fresh.layout || 'auto') + 1) % order.length];
      await store.saveMedia(fresh);
      renderVList();
    });
    L.querySelectorAll('[data-foc]').forEach(b => b.onclick = async () => { const m = await store.getMedia(b.dataset.foc); if (await focusEditor(m)) renderVList(); });
    L.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => { for (const m of await store.listMedia(b.dataset.reset)) if (m.vid != null) { delete m.vid; await store.saveMedia(m); } renderVList(); });
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
  pc.show = { ...DEFAULT_PC.show, ...((t.pc || {}).show || {}) };
  const info = dayInfo(data.cs);
  let blob = null, url = null, timer = null, busy = 0, panel = null;
  const save = () => { clearTimeout(save.t); save.t = setTimeout(async () => { const tr = await store.getTrip(id); if (tr) { tr.pc = pc; await store.saveTrip(tr); } }, 400); };
  view.innerHTML = `<a class="back" href="#trip/${id}">${icon('back')}${esc(t.name)}</a>
    <h1 class="h1">足跡明信片</h1>
    <div class="tplrow" role="group" aria-label="版型">${Object.entries(TEMPLATES).map(([k, n]) => `<button data-tpl="${k}" class="${pc.tpl === k ? 'on' : ''}"><svg viewBox="0 0 60 75" width="60" height="75" aria-hidden="true">${TPL_THUMB[k]}</svg><span>${k} ${n}</span></button>`).join('')}</div>
    <div class="dayseg" id="pcday"></div>
    <div class="pcchips" id="pcchips" role="group" aria-label="調整"></div>
    <div id="pcpanel" class="pcpanel" hidden></div>
    <div class="pc-prev"><img id="pimg" alt="明信片預覽"><p id="pinfo" class="muted">產生中…</p></div>
    <div class="row"><button class="btn main" id="psave">${icon('check')}儲存到相簿／分享</button></div>
    <p class="note sm">按下後在選單裡選「<b>儲存影像</b>」就會存進相簿；也可以長按上面的圖片，選「加入照片」。</p>`;
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
      el.innerHTML = vis.length ? `<p class="muted sm">最多選 4 張。沒有選的話，會用精選照片。</p><div class="pcphotos">${vis.map(m => { const i = chosen ? chosen.indexOf(m.id) : -1; return `<button data-ph="${m.id}" class="${i >= 0 ? 'on' : ''}"><img src="${ou(m.thumb || m.blob)}" alt="">${i >= 0 ? `<b>${i + 1}</b>` : ''}${m.star ? `<span class="vt-star">${icon('star')}</span>` : ''}</button>`; }).join('')}</div><div class="row"><button class="btn sm" id="phreset">改回用精選照片</button></div>` : '<p class="muted">這趟旅程還沒有照片。</p>';
      el.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => {
        const ids = pc.photoIds ? [...pc.photoIds] : [];
        const i = ids.indexOf(b.dataset.ph);
        if (i >= 0) ids.splice(i, 1); else if (ids.length >= 4) { toast('最多 4 張'); return; } else ids.push(b.dataset.ph);
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
    <div class="mapbar">${styleSeg()}<span class="row" style="margin:0"><button class="btn sm" id="conn">${icon('flower')}連起來</button><a class="btn sm" href="#map/${id}">${icon('map')}放大</a></span></div>
    ${mapLegend()}
    ${days.map((d, i) => { const th = (t.dayThemes || {})[d.k] ? getTheme(t.dayThemes[d.k]) : null; return `<h2 class="h2 day">${isDaily(t) ? '' : `<span class="dn">第 ${i + 1} 天</span>`}${fmtDate(d.ts)}<button class="tchip" data-day="${d.k}" aria-label="更改這天的花園主題">${th ? `${themeIcon(th, 22)}${esc(th.name)}` : '選花園主題'}</button></h2><div class="cards">${d.items.map(cardHTML).join('')}</div>`; }).join('') || '<p class="empty" style="margin-top:14px">這趟旅程還沒有打卡。</p>'}
    <div class="row"><a class="btn main" href="#video/${id}">${icon('play')}一鍵生成短片</a><a class="btn" href="#card/${id}">${icon('flower')}做足跡明信片</a></div>
    <div class="row">${isDaily(t) ? (days.length ? `<button class="btn" id="mv">${icon('trip')}把幾天搬進旅行包</button>` : '') : getMode() === 'trip' && getActiveId() === id ? '<span class="tag on" style="align-self:center">旅行中</span>' : `<button class="btn" id="act">${icon('trip')}繼續這趟旅行</button>`}<button class="btn danger" id="del">${icon('trash')}刪除這個旅行包</button></div>`;
  fillPostcard($('#trippc'), id);
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

// ---------- 單一打卡點 ----------
async function checkin(id) {
  const c = await store.getCheckin(id);
  if (!c) { location.hash = ''; return; }
  const t = await store.getTrip(c.tripId);
  const m = await store.listMedia(id);
  const vis = m.filter(x => x.kind !== 'audio'), aud = m.filter(x => x.kind === 'audio');
  const b = BADGES[badgeOf(c.placeType)];
  const pending = isKid(c) && !c.confirmed;
  view.innerHTML = `<a class="back" href="#trip/${c.tripId}">${icon('back')}${esc(t?.name || '旅行包')}</a>
    <div class="detail-head"><div class="card-ic lg">${icon(b.icon)}</div><div><h1 class="h1">${esc(c.placeName)}</h1><p class="muted">${fmtDate(c.ts)} ${fmtTime(c.ts)}${c.acc ? ` · 誤差約 ${c.acc} 公尺` : ''}</p>${isKid(c) && isAdult(c) ? '<span class="tag kid">孩子＋大人一起打卡</span>' : ''}</div></div>
    ${pending ? `<div class="kidbox">${icon('honey')}<div><b>這是孩子蓋的章（${esc(b.name)}）</b><p>系統自動選了最近的地點，請確認是否正確。</p><div class="row"><button class="btn main sm" id="conf">${icon('check')}地點正確</button><button class="btn sm" id="ren">改地點名稱</button></div></div></div>` : ''}
    <div class="row">${pending ? '' : '<button class="btn sm" id="ren">改地點名稱</button>'}<button class="btn sm danger" id="deltop">${icon('trash')}刪除這次打卡</button>${c.lat != null ? `<a class="btn sm" href="${amapLink(c.lat, c.lng, c.placeName)}" target="_blank" rel="noopener">${icon('map')}在高德地圖開啟</a>` : ''}</div>
    <h2 class="h2">照片與影片 <small>${vis.length}/${MAX}</small></h2>
    <div class="grid">
      ${vis.map(x => `<div class="tile${x.star ? ' star' : ''}"><button class="tile-v" data-v="${x.id}" aria-label="查看">${x.thumb ? `<img src="${ou(x.thumb)}" alt="">` : `<span class="vph">${icon('play')}</span>`}${x.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}</button><button class="tile-s" data-s="${x.id}" aria-pressed="${x.star ? 'true' : 'false'}" aria-label="精選"><span class="star-badge">${icon('star')}</span></button>${x.focus ? `<i class="focus-dot" style="left:${(x.focus.x * 100).toFixed(1)}%;top:${(x.focus.y * 100).toFixed(1)}%"></i>` : ''}</div>`).join('')}
      ${vis.length < MAX ? `<label class="tile add">${icon('plus')}<span>加照片<br>或影片</span><input type="file" accept="image/*,video/*" multiple id="f"></label>` : ''}
    </div>
    <p class="muted sm">點右上角星星設為「精選」，之後生成短片會優先使用。</p>
    <h2 class="h2">聲音</h2>
    ${aud.map(x => `<div class="audrow"><span class="tag ${x.by === 'kid' ? 'kid' : ''}">${x.by === 'kid' ? '孩子' : '大人'}</span><audio controls preload="metadata" src="${ou(x.blob)}"></audio><button class="icon-btn" data-d="${x.id}" aria-label="刪除這段聲音">${icon('trash')}</button></div>`).join('') || '<p class="muted">還沒有聲音。</p>'}
    <button class="btn" id="rec" style="margin-top:8px">${icon('mic')}錄一段聲音</button>
    <h2 class="h2">備註</h2>
    <textarea id="note" class="inp" rows="3" placeholder="今天發生了什麼好玩的事？">${esc(c.note || '')}</textarea>
    <div class="row"><button class="btn danger" id="del">${icon('trash')}刪除這次打卡</button></div>`;

  $('#ren').onclick = async () => { const n = await inputDlg('地點名稱', c.placeName); if (n) { c.placeName = n; c.confirmed = true; await store.saveCheckin(c); toast('已更新'); rerender(); } };
  if ($('#conf')) $('#conf').onclick = async () => { c.confirmed = true; await store.saveCheckin(c); toast('已確認'); rerender(); };
  if ($('#f')) $('#f').onchange = async e => { await addFiles(id, e.target.files); rerender(); };
  $('#rec').onclick = () => recordSheet(id);
  let nt = null;
  $('#note').oninput = e => { clearTimeout(nt); nt = setTimeout(async () => { c.note = e.target.value; await store.saveCheckin(c); }, 500); };
  view.querySelectorAll('[data-s]').forEach(btn => btn.onclick = async e => {
    e.preventDefault(); e.stopPropagation();
    const x = vis.find(v => v.id === btn.dataset.s);
    x.star = !x.star;
    btn.setAttribute('aria-pressed', x.star ? 'true' : 'false');
    btn.closest('.tile').classList.toggle('star', x.star);
    toast(x.star ? '已設為精選' : '已取消精選');
    await store.saveMedia(x);
  });
  view.querySelectorAll('[data-v]').forEach(btn => btn.onclick = () => viewer(vis.find(v => v.id === btn.dataset.v)));
  view.querySelectorAll('[data-d]').forEach(btn => btn.onclick = async () => { if (await confirmDlg('刪除這段聲音？', '刪除')) { await store.deleteMedia(btn.dataset.d); rerender(); } });
  const delCheckin = async () => {
    if (!(await confirmDlg(`確定刪除「${c.placeName}」這次打卡？照片、影片和聲音會一起刪除，無法復原。`, '確定刪除', '取消'))) return;
    await store.deleteCheckin(id); toast('已刪除'); location.hash = `trip/${c.tripId}`;
  };
  $('#del').onclick = delCheckin; $('#deltop').onclick = delCheckin;
}

// ---------- 照片焦點：點一下要強調的位置 ----------
function focusEditor(m) {
  return new Promise(res => {
    const src = m.kind === 'photo' ? m.blob : m.thumb;
    if (!src) { toast('這個檔案沒有可以設定焦點的畫面'); res(false); return; }
    const u = URL.createObjectURL(src);
    let f = m.focus ? { ...m.focus } : null;
    const ov = document.createElement('div');
    ov.className = 'viewer';
    ov.innerHTML = `<p class="fe-tip">點一下照片上最想強調的地方（例如人），短片會從那裡開始，再慢慢拉遠</p>
      <div class="fe-wrap"><div class="fe-box"><img src="${u}" alt=""><i class="fe-dot" hidden></i></div></div>
      <div class="viewer-bar"><button class="btn" data-a="clear">清除焦點</button><button class="btn main" data-a="ok">${icon('check')}完成</button></div>`;
    document.body.appendChild(ov);
    const box = ov.querySelector('.fe-box'), dot = ov.querySelector('.fe-dot');
    const show = () => { dot.hidden = !f; if (f) { dot.style.left = (f.x * 100) + '%'; dot.style.top = (f.y * 100) + '%'; } };
    show();
    box.querySelector('img').onclick = e => {
      const b = e.currentTarget.getBoundingClientRect();
      f = { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
      show();
    };
    ov.querySelector('[data-a="clear"]').onclick = () => { f = null; show(); };
    ov.querySelector('[data-a="ok"]').onclick = async () => {
      if (f) m.focus = f; else delete m.focus;
      await store.saveMedia(m);
      ov.remove(); URL.revokeObjectURL(u);
      toast(f ? '已設定焦點' : '已清除焦點');
      res(true);
    };
  });
}

function viewer(x) {
  const u = URL.createObjectURL(x.blob);
  const ov = document.createElement('div');
  ov.className = 'viewer';
  ov.innerHTML = `${x.kind === 'video' ? `<video src="${u}" controls playsinline autoplay></video>` : `<img src="${u}" alt="">`}
    <div class="viewer-bar"><button class="btn" data-a="close">關閉</button><button class="btn" data-a="focus">設定焦點</button><button class="btn danger" data-a="del">${icon('trash')}刪除</button></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); URL.revokeObjectURL(u); };
  ov.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') close();
    if (a === 'focus') { close(); if (await focusEditor(x)) rerender(); }
    if (a === 'del' && (await confirmDlg('刪除這個檔案？', '刪除'))) { await store.deleteMedia(x.id); close(); rerender(); }
  };
}

// ---------- 設定 ----------
async function settings() {
  const base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
  const adultUrl = `${base}index.html?tap=1`, kidUrl = `${base}kid.html?tap=1`;
  let usage = '';
  try { const e = await navigator.storage?.estimate?.(); if (e) usage = `已使用約 ${(e.usage / 1048576).toFixed(1)} MB`; } catch (e) {}
  let persisted = false;
  try { persisted = await navigator.storage?.persisted?.(); } catch (e) {}
  view.innerHTML = `${topbar()}
    <section class="sec">
      <h2 class="h2">試用</h2>
      <label class="switch"><span><b>模擬模式</b><br><span class="muted sm">不用出門，用雲南的示範地點試玩打卡流程</span></span><input type="checkbox" id="demo" ${getSetting('demo') === '1' ? 'checked' : ''}></label>
    </section>
    <section class="sec">
      <h2 class="h2">NFC 吊飾網址</h2>
      <p class="muted sm">用「NFC Tools」App 把下面的網址寫進吊飾。</p>
      <b>大人吊飾</b><div class="copyrow"><code>${esc(adultUrl)}</code><button class="btn sm" data-copy="${esc(adultUrl)}">複製</button></div>
      <b style="display:block;margin-top:10px">孩子吊飾</b><div class="copyrow"><code>${esc(kidUrl)}</code><button class="btn sm" data-copy="${esc(kidUrl)}">複製</button></div>
      <div class="row"><a class="btn sm" href="kid.html">打開兒童頁面看看</a></div>
    </section>
    <section class="sec">
      <h2 class="h2">高德地圖（附近地點清單）</h2>
      <p class="muted sm">到高德開放平台建立「Web 端（JS API）」應用後，把 Key 和安全密鑰貼在這裡。只存在這支手機上。</p>
      <label class="lbl" for="ak">Key</label><input id="ak" class="inp" value="${esc(getSetting('amapKey'))}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <label class="lbl" for="as">安全密鑰</label><input id="as" class="inp" value="${esc(getSetting('amapSec'))}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="row"><button class="btn main sm" id="saveKey">儲存</button></div>
    </section>
    <section class="sec">
      <h2 class="h2">備份</h2>
      <p class="muted sm">測試期資料只存在這支手機的 Safari 裡。每趟旅行結束，請匯出一次備份存到「檔案」或 iCloud。${usage ? `（${usage}${persisted ? '，已設定為不自動清除' : ''}）` : ''}</p>
      <div class="row"><button class="btn main sm" id="exp">匯出備份</button><label class="btn sm file">從備份還原<input type="file" accept="application/json,.json" id="imp"></label></div>
    </section>
    <section class="sec">
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
  $('#demo').onchange = e => { setSetting('demo', e.target.checked ? '1' : ''); toast(e.target.checked ? '已開啟模擬模式' : '已關閉模擬模式'); };
  view.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('已複製'); } catch (e) { toast('無法複製，請長按網址手動複製'); } });
  $('#saveKey').onclick = () => { setSetting('amapKey', $('#ak').value.trim()); setSetting('amapSec', $('#as').value.trim()); toast('已儲存，重新整理後生效'); };
  $('#exp').onclick = async () => {
    toast('正在打包備份…');
    try {
      const blob = await store.exportAll();
      const d = new Date();
      const name = `蜂采備份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) { if (e.name !== 'AbortError') toast('備份失敗：' + e.message); }
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const r = await store.importAll(f); toast(`已還原 ${r.trips} 個旅程、${r.checkins} 次打卡`); } catch (err) { toast('還原失敗：' + err.message); }
  };
  $('#wipe').onclick = async () => {
    if (!(await confirmDlg('確定要清除所有旅程、打卡、照片和聲音？建議先匯出備份。此動作無法復原。', '全部清除'))) return;
    await store.clearAll(); try { localStorage.removeItem('fc-active'); } catch (e) {}
    toast('已清除'); location.hash = '';
  };
}

// ---------- 啟動 ----------
const params = new URLSearchParams(location.search);
route().then(() => {
  if (params.has('tap')) {
    history.replaceState(null, '', location.pathname + (params.has('demo') ? '?demo=1' : '') + location.hash);
    startCheckin();
  }
});
