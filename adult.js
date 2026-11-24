// 蜂采 大人頁面
import { CONFIG, getSetting, setSetting } from './config.js';
import { store, ensureActiveTrip, getActiveId, setActiveId, askPersist } from './store.js';
import { getPosition, nearby, badgeOf, BADGES, shortType, isDemo, amapLink } from './geo.js';
import { compressImage, videoThumb, startRecorder } from './media.js';
import { mountMap, gardenSVG } from './map.js';
import { allThemes, getTheme, themeIcon, itemIcon, ITEMS, GROUNDS, listCustom, saveCustom, deleteCustom } from './themes.js';
import { collect, renderPostcard } from './postcard.js';
import { makeVideo, estimate, canMakeVideo } from './video.js';
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
window.addEventListener('hashchange', () => route());

// ---------- 共用：打卡卡片 ----------
async function withMedia(cs) { return Promise.all(cs.map(async c => ({ c, m: await store.listMedia(c.id) }))); }
function cardHTML({ c, m }) {
  const vis = m.filter(x => x.kind !== 'audio'), aud = m.filter(x => x.kind === 'audio');
  const b = BADGES[badgeOf(c.placeType)];
  const tags = [
    c.by === 'kid' ? '<span class="tag kid">孩子蓋章</span>' : '',
    c.by === 'kid' && !c.confirmed ? '<span class="tag warn">待確認</span>' : '',
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
  const kidP = meta.filter(x => x.c.by === 'kid' && !x.c.confirmed).length;
  const empty = meta.filter(x => !x.m.length).length;
  const recent = meta.slice(-5).reverse();
  view.innerHTML = `${topbar()}
    <button class="chip" id="tripchip">${icon('trip')}<span>目前旅程　<b>${esc(t.name)}</b></span><em>切換</em></button>
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
  $('#tripchip').onclick = () => { location.hash = 'trips'; };
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
    const dup = (await store.listCheckins(t.id)).find(c => c.placeName === p.name && Date.now() - c.ts < 30 * 60e3);
    if (dup && !(await confirmDlg(`30 分鐘內已經在「${p.name}」打過卡了，還要再打一次嗎？`, '再打一次', '不用了'))) { closeSheet(); return; }
    const c = { id: uid(), tripId: t.id, ts: Date.now(), lat: pos.lat, lng: pos.lng, acc: pos.acc, placeName: p.name, placeType: p.type || '', poiId: p.id || '', by: 'adult', confirmed: true, note: '' };
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
        await store.saveMedia({ id: uid(), checkinId: cid, kind: 'video', blob: f, thumb: await videoThumb(f), star: false, ts: Date.now(), size: f.size });
      } else {
        const blob = await compressImage(f, CONFIG.photoMax, 0.85);
        const thumb = await compressImage(f, 400, 0.7);
        await store.saveMedia({ id: uid(), checkinId: cid, kind: 'photo', blob, thumb, star: false, ts: Date.now(), size: blob.size });
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
  let timer = null, left = max;
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
    rs.textContent = '錄好了，聽聽看';
    $('#rprev').innerHTML = `<audio controls src="${ou(blob)}" style="width:100%"></audio><div class="row"><button class="btn main" id="rsave">儲存</button><button class="btn" id="rredo">重錄</button></div>`;
    $('#rsave').onclick = async () => { await store.saveMedia({ id: uid(), checkinId: cid, kind: 'audio', blob, by: 'adult', star: false, ts: Date.now(), size: blob.size }); toast('聲音已儲存'); closeSheet(); };
    $('#rredo').onclick = () => { $('#rprev').innerHTML = ''; rs.textContent = '按一下開始'; };
  }
}

// ---------- 旅行包列表 ----------
async function trips() {
  const ts = await store.listTrips();
  const act = getActiveId();
  const info = await Promise.all(ts.map(async t => { const cs = await store.listCheckins(t.id); return { t, n: cs.length, a: cs[0]?.ts, b: cs[cs.length - 1]?.ts }; }));
  view.innerHTML = `${topbar()}
    <div class="row between"><h2 class="h2" style="margin:10px 0">我的旅行包</h2><button class="btn main sm" id="new">${icon('plus')}新旅程</button></div>
    ${info.length ? `<div class="cards">${info.map(({ t, n, a, b }) => `<a class="card" href="#trip/${t.id}"><div class="card-ic">${icon('trip')}</div><div class="card-main"><div class="card-t">${esc(t.name)} ${t.id === act ? '<span class="tag on">目前</span>' : ''}</div><div class="card-s">${n ? `${fmtDate(a)}${dayKey(a) !== dayKey(b) ? ' – ' + fmtDate(b) : ''} · ${n} 個地點` : '還沒有打卡'}</div></div></a>`).join('')}</div>`
      : '<p class="empty">還沒有旅程。按「新旅程」建立第一個旅行包。</p>'}`;
  $('#new').onclick = async () => {
    const name = await inputDlg('新旅程的名字', '', '例如：雲南 4 日');
    if (!name) return;
    const t = { id: uid(), name, createdAt: Date.now() };
    await store.saveTrip(t); setActiveId(t.id);
    toast('已建立，並設為目前旅程'); rerender();
  };
}

// ---------- 採蜜地圖 ----------
const mapStyle = () => (getSetting('mapStyle') === 'cute' ? 'cute' : 'normal');
const styleSeg = () => `<div class="seg" role="group" aria-label="地圖樣式"><button data-style="normal" class="${mapStyle() === 'normal' ? 'on' : ''}">正常版</button><button data-style="cute" class="${mapStyle() === 'cute' ? 'on' : ''}">可愛版</button></div>`;

// 把地圖放進 box，並綁好「正常／可愛」切換與「連起來」按鈕
async function attachMap(box, checkins, height, seed) {
  let connected = false;
  curMap = await mountMap(box, checkins, { style: mapStyle(), height, seed, onPick: c => { location.hash = `c/${c.id}`; } });
  const ctl = curMap;
  view.querySelectorAll('[data-style]').forEach(b => b.onclick = () => {
    setSetting('mapStyle', b.dataset.style);
    view.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b));
    ctl.setStyle(b.dataset.style);
  });
  const conn = $('#conn');
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
  view.innerHTML = `<div class="row between"><h1 class="h1">採蜜地圖</h1><span class="muted sm">${cs.length} 朵花</span></div>
    <button class="chip" id="tripchip" style="margin-top:8px">${icon('trip')}<span><b>${esc(t.name)}</b></span><em>換旅程</em></button>
    <div class="mapbar">${styleSeg()}<button class="btn main sm" id="conn">${icon('flower')}連起來</button></div>
    <div id="mapbox"></div>
    ${days.length ? `<div class="legend">${days.map((d, i) => `<span><i style="background:var(--day-${i % 5 + 1})"></i>第 ${i + 1} 天</span>`).join('')}</div>` : ''}
    <p class="muted sm" style="margin-top:10px">點小花可以看那次打卡。${getSetting('amapKey') ? '' : '目前是插畫地圖；到「設定」填入高德金鑰後，會換成真實的城市地圖。'}</p>`;
  $('#tripchip').onclick = () => { location.hash = 'trips'; };
  await attachMap($('#mapbox'), cs, h, t.id);
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
      <div class="row"><button class="btn main" id="vsave">${icon('check')}儲存／分享影片</button><button class="btn" id="vagain">重新製作</button></div>
    </div>`;
  const upd = async () => { const e = await estimate(data, opt); $('#vest').textContent = `大約 ${e.sec} 秒，${e.stops} 站`; };
  upd();
  view.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { opt.style = b.dataset.style; setSetting('mapStyle', opt.style); view.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b)); });
  view.querySelectorAll('[data-mu]').forEach(b => b.onclick = () => {
    opt.music = b.dataset.mu; if (opt.music !== 'file') setSetting('videoMusic', opt.music);
    view.querySelectorAll('[data-mu]').forEach(x => x.classList.toggle('on', x === b));
    $('#mfile').style.display = opt.music === 'file' ? '' : 'none';
  });
  $('#mf').onchange = e => { opt.musicFile = e.target.files[0] || null; $('#mname').textContent = opt.musicFile ? opt.musicFile.name : '從手機選一首音樂'; };
  $('#vv').onchange = e => { opt.voices = e.target.checked; upd(); };
  $('#vc').onchange = e => { opt.clips = e.target.checked; };
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
    $('#vout').src = resultUrl;
    $('#vinfo').textContent = `${Math.round(result.total)} 秒 · ${(result.blob.size / 1048576).toFixed(1)} MB · ${result.type.includes('mp4') ? 'MP4' : 'WebM'}`;
    $('#vdone').hidden = false;
  };
  $('#vagain').onclick = () => { $('#vdone').hidden = true; $('#vform').hidden = false; };
  $('#vsave').onclick = async () => {
    if (!result) return;
    const ext = result.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([result.blob], `蜂采-${data.trip.name}.${ext}`, { type: result.type });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else { const a = document.createElement('a'); a.href = resultUrl; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (e) { if (e.name !== 'AbortError') toast('無法分享：' + e.message); }
  };
}

// ---------- 足跡明信片 ----------
async function cardView(id) {
  const data = await collect(id);
  if (!data) { location.hash = 'trips'; return; }
  const photos = data.media.filter(m => m.kind === 'photo' || m.thumb).length;
  const stars = data.media.filter(m => m.star).length;
  let tpl = 'map', style = mapStyle(), blob = null, url = null, timer = null, busy = 0;
  view.innerHTML = `<a class="back" href="#trip/${id}">${icon('back')}${esc(data.trip.name)}</a>
    <h1 class="h1">足跡明信片</h1>
    <div class="mapbar"><div class="seg" role="group" aria-label="版型"><button data-tpl="map" class="on">地圖為主</button><button data-tpl="photo">照片為主</button></div>${styleSeg()}</div>
    <label class="lbl" for="pt">標題</label><input id="pt" class="inp" value="${esc(data.trip.name)}" maxlength="24">
    <label class="lbl" for="pq">孩子的一句話（可不填）</label><input id="pq" class="inp" placeholder="例如：今天的米線最好吃！" maxlength="30">
    <p class="muted sm">${photos ? `會優先用標了星星的照片（目前 ${stars} 張精選）。` : '這趟旅程還沒有照片，明信片會以地圖為主。'}</p>
    <div class="pc-prev"><img id="pimg" alt="明信片預覽"><p id="pinfo" class="muted">產生中…</p></div>
    <div class="row"><button class="btn main" id="psave">${icon('check')}儲存／分享</button></div>
    <p class="muted sm">也可以長按上面的圖片，選「加入照片」。</p>`;
  const gen = async () => {
    const my = ++busy;
    $('#pinfo').textContent = '產生中…';
    try {
      const cv = await renderPostcard(data, { template: tpl, style, title: $('#pt').value, quote: $('#pq').value });
      if (my !== busy) return;
      blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      $('#pimg').src = url; $('#pinfo').textContent = '';
    } catch (e) { console.error(e); $('#pinfo').textContent = '產生失敗：' + e.message; }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(gen, 450); };
  view.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => { tpl = b.dataset.tpl; view.querySelectorAll('[data-tpl]').forEach(x => x.classList.toggle('on', x === b)); gen(); });
  view.querySelectorAll('[data-style]').forEach(b => b.onclick = () => { style = b.dataset.style; setSetting('mapStyle', style); view.querySelectorAll('[data-style]').forEach(x => x.classList.toggle('on', x === b)); gen(); });
  $('#pt').oninput = later; $('#pq').oninput = later;
  $('#psave').onclick = async () => {
    if (!blob) return;
    const file = new File([blob], `蜂采明信片-${data.trip.name}.jpg`, { type: 'image/jpeg' });
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
  const kid = meta.filter(x => x.c.by === 'kid').length;
  view.innerHTML = `<a class="back" href="#trips">${icon('back')}所有旅行包</a>
    <div class="row between"><h1 class="h1">${esc(t.name)}</h1><button class="btn sm" id="ren">改名</button></div>
    <div class="stats"><div><b>${meta.length}</b>地點</div><div><b>${days.length}</b>天</div><div><b>${vis}</b>照片影片</div><div><b>${kid}</b>孩子的章</div></div>
    <div id="mapbox"></div>
    <div class="mapbar">${styleSeg()}<span class="row" style="margin:0"><button class="btn sm" id="conn">${icon('flower')}連起來</button><a class="btn sm" href="#map/${id}">${icon('map')}放大</a></span></div>
    ${days.length ? `<div class="legend">${days.map((d, i) => `<span><i style="background:var(--day-${i % 5 + 1})"></i>第 ${i + 1} 天</span>`).join('')}</div>` : ''}
    ${days.map((d, i) => { const th = (t.dayThemes || {})[d.k] ? getTheme(t.dayThemes[d.k]) : null; return `<h2 class="h2 day"><span class="dn" style="background:var(--day-${i % 5 + 1})">第 ${i + 1} 天</span>${fmtDate(d.ts)}<button class="tchip" data-day="${d.k}" aria-label="更改這天的花園主題">${th ? `${themeIcon(th, 22)}${esc(th.name)}` : '選花園主題'}</button></h2><div class="cards">${d.items.map(cardHTML).join('')}</div>`; }).join('') || '<p class="empty" style="margin-top:14px">這趟旅程還沒有打卡。</p>'}
    <div class="row"><a class="btn main" href="#video/${id}">${icon('play')}一鍵生成短片</a><a class="btn" href="#card/${id}">${icon('flower')}做足跡明信片</a></div>
    <div class="row">${getActiveId() !== id ? '<button class="btn" id="act">設為目前旅程</button>' : ''}<button class="btn danger" id="del">${icon('trash')}刪除這個旅行包</button></div>`;
  await attachMap($('#mapbox'), meta.map(x => x.c), 260, id);
  view.querySelectorAll('[data-day]').forEach(b => b.onclick = async () => {
    const cur = (t.dayThemes || {})[b.dataset.day];
    const tid = await themePicker(cur);
    if (!tid) return;
    t.dayThemes = { ...(t.dayThemes || {}), [b.dataset.day]: tid };
    await store.saveTrip(t); toast('已更新這天的花園主題'); rerender();
  });
  $('#ren').onclick = async () => { const n = await inputDlg('旅程名稱', t.name); if (n) { t.name = n; await store.saveTrip(t); rerender(); } };
  if ($('#act')) $('#act').onclick = () => { setActiveId(id); toast('已設為目前旅程'); rerender(); };
  $('#del').onclick = async () => {
    if (!(await confirmDlg(`確定要刪除「${t.name}」？裡面的打卡、照片、影片和聲音都會一起刪除，無法復原。`, '刪除', '取消'))) return;
    await store.deleteTrip(id);
    if (getActiveId() === id) { try { localStorage.removeItem('fc-active'); } catch (e) {} }
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
  const pending = c.by === 'kid' && !c.confirmed;
  view.innerHTML = `<a class="back" href="#trip/${c.tripId}">${icon('back')}${esc(t?.name || '旅行包')}</a>
    <div class="detail-head"><div class="card-ic lg">${icon(b.icon)}</div><div><h1 class="h1">${esc(c.placeName)}</h1><p class="muted">${fmtDate(c.ts)} ${fmtTime(c.ts)}${c.acc ? ` · 誤差約 ${c.acc} 公尺` : ''}</p></div></div>
    ${pending ? `<div class="kidbox">${icon('honey')}<div><b>這是孩子蓋的章（${esc(b.name)}）</b><p>系統自動選了最近的地點，請確認是否正確。</p><div class="row"><button class="btn main sm" id="conf">${icon('check')}地點正確</button><button class="btn sm" id="ren">改地點名稱</button></div></div></div>` : ''}
    <div class="row">${pending ? '' : '<button class="btn sm" id="ren">改地點名稱</button>'}${c.lat != null ? `<a class="btn sm" href="${amapLink(c.lat, c.lng, c.placeName)}" target="_blank" rel="noopener">${icon('map')}在高德地圖開啟</a>` : ''}</div>
    <h2 class="h2">照片與影片 <small>${vis.length}/${MAX}</small></h2>
    <div class="grid">
      ${vis.map(x => `<div class="tile${x.star ? ' star' : ''}"><button class="tile-v" data-v="${x.id}" aria-label="查看">${x.thumb ? `<img src="${ou(x.thumb)}" alt="">` : `<span class="vph">${icon('play')}</span>`}${x.kind === 'video' ? `<span class="vbadge">${icon('play')}</span>` : ''}</button><button class="tile-s" data-s="${x.id}" aria-label="${x.star ? '取消精選' : '設為精選'}">${icon('star')}</button></div>`).join('')}
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
  view.querySelectorAll('[data-s]').forEach(btn => btn.onclick = async () => { const x = vis.find(v => v.id === btn.dataset.s); x.star = !x.star; await store.saveMedia(x); rerender(); });
  view.querySelectorAll('[data-v]').forEach(btn => btn.onclick = () => viewer(vis.find(v => v.id === btn.dataset.v)));
  view.querySelectorAll('[data-d]').forEach(btn => btn.onclick = async () => { if (await confirmDlg('刪除這段聲音？', '刪除')) { await store.deleteMedia(btn.dataset.d); rerender(); } });
  $('#del').onclick = async () => {
    if (!(await confirmDlg(`刪除「${c.placeName}」這次打卡？照片和聲音會一起刪除。`, '刪除'))) return;
    await store.deleteCheckin(id); toast('已刪除'); location.hash = `trip/${c.tripId}`;
  };
}

function viewer(x) {
  const u = URL.createObjectURL(x.blob);
  const ov = document.createElement('div');
  ov.className = 'viewer';
  ov.innerHTML = `${x.kind === 'video' ? `<video src="${u}" controls playsinline autoplay></video>` : `<img src="${u}" alt="">`}
    <div class="viewer-bar"><button class="btn" data-a="close">關閉</button><button class="btn danger" data-a="del">${icon('trash')}刪除</button></div>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); URL.revokeObjectURL(u); };
  ov.onclick = async e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'close') close();
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
