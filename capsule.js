// ==========================================================
// 蜂采 時光膠囊（capsule.js）
// 每一顆膠囊＝一格封蠟的蜂巢。時間到之前打不開、看不到內容；
// 到了那一天打開蜂采，蜜蜂會把蠟咬開，膠囊就「冒出來」。
// 也可以把膠囊存成一個檔案，傳給朋友，放進他的蜂巢。
// 顏色在 theme.css 的 --cap-*；文字都在這個檔案裡。
// ==========================================================
import { getSetting, setSetting } from './config.js';
import { store, capsuleToData, capsuleFromData } from './store.js';
import { compressImage, videoThumb, startRecorder } from './media.js';
import { $, esc, toast, confirmDlg, icon, uid } from './ui.js';
import { BEE } from './map.js';

const DAY = 86400e3;
const MAX_ITEMS = 9;
const VOICE_SEC = 60;
let C = null; // 從 adult.js 傳進來的共用工具：view、ou、overlay、openSheet、closeSheet、rerender

export function initCapsule(ctx) { C = ctx; }

// ---------- 小工具 ----------
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addMonths = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return startOfDay(d.getTime()); };
const fmtYMD = ts => { const d = new Date(ts); return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`; };
const daysLeft = c => Math.max(1, Math.ceil((c.openAt - Date.now()) / DAY));
export const isDue = c => !c.opened && Date.now() >= c.openAt;
const TO = { self: '給自己', kid: '給孩子', family: '給全家', friend: '送給朋友' };
const toText = c => (c.to === 'friend' ? `給${c.toName || '你'}` : TO[c.to] || '');

// 封住的格子上顯示什麼：日期／只有年份／完全保密
function sealedLabel(c) {
  if (c.secrecy === 'secret') return '還不能說';
  if (c.secrecy === 'year') return `${new Date(c.openAt).getFullYear()} 年打開`;
  const n = daysLeft(c);
  return n > 60 ? `還要 ${n} 天` : n > 1 ? `還要 ${n} 天` : '明天打開';
}
// 封蠟格子裡的蜂蜜慢慢變滿（看得出「快到了」）；完全保密就不透露
const fillOf = c => (c.secrecy === 'secret' ? 0.5 : Math.min(1, Math.max(0.06, (Date.now() - c.createdAt) / Math.max(DAY, c.openAt - c.createdAt))));

// 一格蜂巢（SVG）：sealed 封蠟、open 已打開、add 加一顆
export function hexCell(kind, fill = 0, img = '') {
  const pts = '50,2 95,27 95,77 50,102 5,77 5,27';
  const id = 'h' + Math.random().toString(36).slice(2, 7);
  if (kind === 'add') return `<svg viewBox="0 0 100 104" class="hex add"><polygon points="${pts}" class="hx-add"/><path d="M50 36v32M34 52h32" class="hx-plus"/></svg>`;
  if (kind === 'open') return `<svg viewBox="0 0 100 104" class="hex open"><defs><clipPath id="${id}"><polygon points="${pts}"/></clipPath></defs><polygon points="${pts}" class="hx-open"/>${img ? `<image href="${img}" x="0" y="0" width="100" height="104" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>` : `<g transform="translate(50 52)"><circle r="16" class="hx-honey"/></g>`}<polygon points="${pts}" class="hx-rim"/></svg>`;
  const top = 102 - 100 * fill;
  return `<svg viewBox="0 0 100 104" class="hex sealed"><defs><clipPath id="${id}"><polygon points="${pts}"/></clipPath></defs>
    <polygon points="${pts}" class="hx-wax"/>
    <g clip-path="url(#${id})"><rect x="0" y="${top.toFixed(1)}" width="100" height="104" class="hx-fill"/><path d="M0 ${top.toFixed(1)} Q25 ${(top - 4).toFixed(1)} 50 ${top.toFixed(1)} T100 ${top.toFixed(1)}" class="hx-wave"/></g>
    <polygon points="${pts}" class="hx-rim"/><path d="M30 40 Q50 30 70 40" class="hx-shine"/></svg>`;
}

// ---------- 蜂巢牆 ----------
export async function hiveView() {
  const caps = await store.listCapsules();
  const sealed = caps.filter(c => !c.opened), opened = caps.filter(c => c.opened).sort((a, b) => b.openedAt - a.openedAt);
  const cells = [{ kind: 'add' }, ...sealed.map(c => ({ kind: 'sealed', c }))];
  const rows = []; for (let i = 0; i < cells.length; i += 3) rows.push(cells.slice(i, i + 3));
  C.view.innerHTML = `
    <div class="row between" style="margin-top:4px"><h1 class="h1" style="margin:0">時光膠囊</h1><button class="btn sm" id="recv">${icon('plus')}收到的膠囊</button></div>
    <p class="muted" style="margin:6px 0 4px">每一格都是一顆封起來的膠囊。時間到了，打開蜂采，它就會自己冒出來。</p>
    <div class="hive">${rows.map((row, i) => `<div class="hv-row${i % 2 ? ' odd' : ''}">${row.map(cellHTML).join('')}</div>`).join('')}</div>
    ${opened.length ? `<h2 class="h2 cap-h">打開過的回憶 <small>${opened.length}</small></h2>
    <div class="mem-list">${opened.map(memHTML).join('')}</div>` : ''}
    <div class="cap-note">${icon('flower')}<p>膠囊存在這支手機裡。請從主畫面的蜂采圖示打開，並偶爾到「設定」匯出備份；換手機時把備份匯入就能帶走。</p></div>
    <input type="file" id="recvf" accept=".json,application/json,*/*" hidden>`;
  fillMemThumbs(C.view, opened);
  C.view.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { location.hash = 'capsule/new'; });
  C.view.querySelectorAll('[data-cap]').forEach(b => b.onclick = async () => {
    const c = caps.find(x => x.id === b.dataset.cap);
    if (c.opened) showContent(c, false); else if (isDue(c)) { await unseal(c); C.rerender(); } else sealedSheet(c);
  });
  $('#recv').onclick = () => $('#recvf').click();
  $('#recvf').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await receive(f); };
}
// 打開過的膠囊：一張小卡（小圖、打開日期、誰送的、第一句話）
export function memHTML(c) {
  const first = (c.note || '').split('\n')[0];
  return `<button class="mem" data-cap="${c.id}"><span class="mem-th" data-th="${c.id}">${icon('flower')}</span><span class="mem-t"><b>${esc(fmtYMD(c.openedAt || c.openAt))}打開</b><small>${c.from ? `來自 ${esc(c.from)}・` : ''}${new Date(c.createdAt).getFullYear()} 年封存</small>${first ? `<em>${esc(first.length > 28 ? first.slice(0, 28) + '…' : first)}</em>` : ''}</span></button>`;
}
export function fillMemThumbs(root, caps) {
  for (const c of caps) {
    const ph = (c.media || []).find(m => m.kind === 'photo' || m.thumb);
    const el = root.querySelector(`[data-th="${c.id}"]`);
    if (ph && el) el.innerHTML = `<img src="${C.ou(ph.thumb || ph.blob)}" alt="">`;
  }
}
export async function viewCapsule(id) { const c = await store.getCapsule(id); if (c) await showContent(c, false); }

function cellHTML(x) {
  if (x.kind === 'add') return `<button class="hv-cell" data-add="1" aria-label="埋一顆新的膠囊"><span class="hx-slot">${hexCell('add')}</span><span class="hv-lbl">埋一顆</span></button>`;
  const c = x.c;
  if (x.kind === 'open') return `<button class="hv-cell" data-cap="${c.id}"><span class="hx-slot">${hexCell('open')}</span><span class="hv-lbl">${esc(fmtYMD(c.openedAt || c.openAt).replace(/ /g, ''))}<small>${c.from ? '來自 ' + esc(c.from) : esc(toText(c))}</small></span></button>`;
  return `<button class="hv-cell${isDue(c) ? ' due' : ''}" data-cap="${c.id}"><span class="hx-slot">${hexCell('sealed', fillOf(c))}</span><span class="hv-lbl">${isDue(c) ? '可以打開了！' : esc(sealedLabel(c))}<small>${c.received && c.from ? '來自 ' + esc(c.from) : esc(toText(c))}</small></span></button>`;
}

// 點封住的格子：只能看到「還要多久」，可以加到行事曆或刪除
function sealedSheet(c) {
  C.openSheet(`<div class="cap-sheet">${hexCell('sealed', fillOf(c))}</div>
    <h2 class="h2" style="text-align:center">${c.secrecy === 'secret' ? '這顆膠囊還不能說什麼時候打開' : c.secrecy === 'year' ? `${new Date(c.openAt).getFullYear()} 年會打開` : `${esc(fmtYMD(c.openAt))} 打開`}</h2>
    <p class="muted" style="text-align:center;margin-top:0">${c.received && c.from ? `來自 ${esc(c.from)}・` : ''}${esc(toText(c))}・${esc(fmtYMD(c.createdAt))}封存${c.secrecy === 'date' ? `・還要 ${daysLeft(c)} 天` : ''}</p>
    <p class="note">膠囊封起來之後不能偷看、也不能修改，時間到了才會打開。</p>
    <div class="row sheet-act">${c.secrecy !== 'secret' ? `<button class="btn main" id="cics">${icon('check')}加到 iPhone 行事曆</button>` : ''}<button class="btn danger" id="cdel">刪除</button></div>`);
  if ($('#cics')) $('#cics').onclick = () => downloadICS(c);
  $('#cdel').onclick = async () => {
    if (!(await confirmDlg('刪除這顆時光膠囊？裡面的內容你還沒看過，刪除後就再也打不開了。', '刪除', '留著'))) return;
    if (!(await confirmDlg('真的要刪除嗎？這個動作無法復原。', '確定刪除', '取消'))) return;
    await store.deleteCapsule(c.id); C.closeSheet(); toast('已刪除');
  };
}

// ---------- 埋一顆新的膠囊 ----------
// mode：'new' 一般；'kid' 孩子給未來的自己（預設錄音）
export async function createView(mode = 'new') {
  const kid = mode === 'kid';
  const items = []; // {kind, blob, thumb?}
  let openAt = addMonths(12), to = kid ? 'self' : 'self', secrecy = 'date', rec = null, recTimer = null;
  const CHOICES = [['1個月後', 1], ['半年後', 6], ['1年後', 12], ['2年後', 24], ['5年後', 60], ['10年後', 120]];
  C.view.innerHTML = `
    <a class="back" href="#hive">${icon('back')}時光膠囊</a>
    <h1 class="h1">${kid ? '給未來的自己' : '埋一顆時光膠囊'}</h1>
    <p class="muted" style="margin-top:0">${kid ? '說一段話、放一張照片，等長大一點再打開。' : '放進照片、影片、聲音或一段話，封起來，等那一天再打開。'}</p>
    <section class="cap-sec"><h2 class="h2">放進什麼</h2>
      <div class="cap-items" id="citems"></div>
      <div class="row wrap"><label class="btn"><input type="file" id="cfile" accept="image/*,video/*" multiple hidden>${icon('camera')}照片／影片</label><button class="btn${kid ? ' main' : ''}" id="crec">${icon('mic')}錄一段話</button></div>
      <textarea id="cnote" class="inp" rows="4" maxlength="1000" placeholder="${kid ? '想對長大的自己說什麼？' : '寫一段話給未來…'}"></textarea>
    </section>
    <section class="cap-sec"><h2 class="h2">什麼時候打開</h2>
      <div class="chips" id="cwhen">${CHOICES.map(([n, m]) => `<button data-m="${m}" class="${m === 12 ? 'on' : ''}">${n}</button>`).join('')}<button data-m="pick">自己選日期</button></div>
      <input type="date" id="cdate" class="inp" hidden>
      <p class="cap-when" id="cwhentxt"></p>
    </section>
    ${kid ? '' : `<section class="cap-sec"><h2 class="h2">給誰</h2>
      <div class="chips" id="cto">${Object.entries(TO).filter(([k]) => k !== 'kid' || getSetting('kidMode') !== 'off').map(([k, n]) => `<button data-to="${k}" class="${k === 'self' ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div id="cfriend" hidden>
        <label class="lbl" for="cfname">朋友的名字</label><input id="cfname" class="inp" maxlength="20" placeholder="例如：小美">
        <p class="note">封好之後，會把膠囊存成一個檔案，用微信、LINE 或 AirDrop 傳給朋友。朋友在他的蜂采按「收到的膠囊」，膠囊就會出現在他的蜂巢裡，時間到才打得開。</p>
      </div>
    </section>`}
    <section class="cap-sec"><h2 class="h2">要透露多少</h2>
      <div class="seg" id="csec"><button data-s="date" class="on">顯示日期</button><button data-s="year">只顯示年份</button><button data-s="secret">完全保密</button></div>
      <p class="muted sm" id="csectxt"></p>
    </section>
    <label class="lbl" for="cfrom">署名</label><input id="cfrom" class="inp" maxlength="20" placeholder="例如：爸爸、媽媽、小寶" value="${esc(getSetting('capFrom', ''))}">
    <div class="row sheet-act"><button class="btn main big" id="cseal">${icon('check')}封起來</button></div>`;

  const drawItems = () => {
    $('#citems').innerHTML = items.map((m, i) => `<div class="cap-it">${m.kind === 'audio' ? `<span class="cap-au">${icon('mic')}<small>錄音</small></span>` : `<img src="${C.ou(m.thumb || m.blob)}" alt="">${m.kind === 'video' ? `<i>${icon('play')}</i>` : ''}`}<button data-x="${i}" aria-label="移除">×</button></div>`).join('');
    $('#citems').querySelectorAll('[data-x]').forEach(b => b.onclick = () => { items.splice(+b.dataset.x, 1); drawItems(); });
  };
  const whenTxt = () => { $('#cwhentxt').textContent = `${fmtYMD(openAt)} 打開（${Math.round((openAt - Date.now()) / DAY)} 天後）`; };
  const secTxt = () => { $('#csectxt').textContent = secrecy === 'date' ? '蜂巢上會寫「還要幾天」。' : secrecy === 'year' ? '蜂巢上只寫哪一年打開。' : '連打開的日子都不說，時間到了才是驚喜。'; };
  whenTxt(); secTxt();

  $('#cfile').onchange = async e => {
    const fs = [...e.target.files]; e.target.value = '';
    for (const f of fs) {
      if (items.length >= MAX_ITEMS) { toast(`一顆膠囊最多放 ${MAX_ITEMS} 個`); break; }
      if (f.type.startsWith('video')) items.push({ id: uid(), kind: 'video', blob: f, thumb: await videoThumb(f).catch(() => null), mime: f.type });
      else items.push({ id: uid(), kind: 'photo', blob: await compressImage(f), mime: 'image/jpeg' });
    }
    drawItems();
  };
  $('#crec').onclick = async () => {
    const b = $('#crec');
    if (rec) { clearTimeout(recTimer); const blob = await rec.stop(); rec = null; b.innerHTML = `${icon('mic')}錄一段話`; b.classList.remove('rec'); items.push({ id: uid(), kind: 'audio', blob, mime: blob.type }); drawItems(); return; }
    if (items.length >= MAX_ITEMS) { toast(`一顆膠囊最多放 ${MAX_ITEMS} 個`); return; }
    try { rec = await startRecorder(); } catch (e) { toast('沒辦法使用麥克風，請到 iPhone 設定允許'); return; }
    b.innerHTML = `${icon('check')}錄好了（最多 ${VOICE_SEC} 秒）`; b.classList.add('rec');
    recTimer = setTimeout(() => { if (rec) b.click(); }, VOICE_SEC * 1000);
  };
  C.view.querySelectorAll('#cwhen [data-m]').forEach(b => b.onclick = () => {
    C.view.querySelectorAll('#cwhen button').forEach(x => x.classList.toggle('on', x === b));
    const d = $('#cdate');
    if (b.dataset.m === 'pick') { d.hidden = false; const t = new Date(Date.now() + DAY); d.min = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; d.focus(); return; }
    d.hidden = true; openAt = addMonths(+b.dataset.m); whenTxt();
  });
  $('#cdate').onchange = e => { const [y, m, dd] = e.target.value.split('-').map(Number); if (!y) return; const t = new Date(y, m - 1, dd).getTime(); if (t <= Date.now()) { toast('請選明天以後的日子'); return; } openAt = t; whenTxt(); };
  C.view.querySelectorAll('#cto [data-to]').forEach(b => b.onclick = () => { to = b.dataset.to; C.view.querySelectorAll('#cto button').forEach(x => x.classList.toggle('on', x === b)); $('#cfriend').hidden = to !== 'friend'; });
  C.view.querySelectorAll('#csec [data-s]').forEach(b => b.onclick = () => { secrecy = b.dataset.s; C.view.querySelectorAll('#csec button').forEach(x => x.classList.toggle('on', x === b)); secTxt(); });

  $('#cseal').onclick = async () => {
    if (rec) { toast('請先按「錄好了」'); return; }
    const note = $('#cnote').value.trim(), from = $('#cfrom').value.trim();
    if (!items.length && !note) { toast('請放進一點東西：照片、影片、聲音或一段話'); return; }
    if (to === 'friend' && !$('#cfname').value.trim()) { toast('請寫朋友的名字'); return; }
    if (from) setSetting('capFrom', from);
    const cap = { id: uid(), createdAt: Date.now(), openAt, to, toName: to === 'friend' ? $('#cfname').value.trim() : '', from, note, media: items, secrecy, kid };
    await sealAnimation();
    if (to === 'friend') { await giftSheet(cap); return; }
    await store.saveCapsule(cap);
    afterSeal(cap);
  };
}

// 封蠟的動畫：蜂蠟從上面蓋下來
function sealAnimation() {
  return new Promise(res => {
    const ov = document.createElement('div');
    ov.className = 'cap-anim seal';
    ov.innerHTML = `<div class="ca-hex">${hexCell('sealed', 0.15)}</div><p>封起來了</p>`;
    document.body.appendChild(ov);
    setTimeout(() => { ov.remove(); res(); }, 1700);
  });
}
function afterSeal(cap) {
  const ov = C.overlay(`<h2 class="h2" style="margin-top:0">${icon('flower')}膠囊封好了</h2>
    <p>${cap.secrecy === 'secret' ? '打開的日子保密，時間到了打開蜂采，它就會自己冒出來。' : `${esc(fmtYMD(cap.openAt))}，打開蜂采就會看到它。`}</p>
    ${cap.secrecy !== 'secret' ? `<p class="muted sm">建議加到 iPhone 行事曆：到了那天，行事曆會提醒你打開蜂采。</p><button class="btn main" id="aics" style="width:100%">${icon('check')}加到 iPhone 行事曆</button>` : ''}
    <p class="muted sm" style="margin-top:12px">膠囊存在這支手機裡，建議現在到「設定」匯出一次備份。</p>
    <div class="row"><a class="btn" href="#settings" id="abk">去備份</a><button class="btn${cap.secrecy === 'secret' ? ' main' : ''}" id="adone">完成</button></div>`);
  if (ov.querySelector('#aics')) ov.querySelector('#aics').onclick = () => downloadICS(cap);
  ov.querySelector('#abk').onclick = () => ov.remove();
  ov.querySelector('#adone').onclick = () => { ov.remove(); location.hash = 'hive'; };
}

// ---------- 送給朋友：存成一個檔案分享出去 ----------
async function packCapsule(cap) {
  const data = { app: 'fengcai-capsule', v: 1, capsule: await capsuleToData({ ...cap, received: true }) };
  const name = `蜂采時光膠囊-給${(cap.toName || '你').replace(/[\\/:*?"<>|]/g, '')}.json`;
  return new File([JSON.stringify(data)], name, { type: 'application/json' });
}
async function giftSheet(cap) {
  const file = await packCapsule(cap);
  const mb = file.size / 1048576;
  const ov = C.overlay(`<h2 class="h2" style="margin-top:0">${icon('flower')}送給 ${esc(cap.toName)} 的膠囊封好了</h2>
    <p>按「傳給朋友」，用微信、LINE 或 AirDrop 把這個檔案傳給 ${esc(cap.toName)}。</p>
    <p class="muted sm">檔案大小約 ${mb < 1 ? '不到 1' : mb.toFixed(1)} MB${mb > 25 ? '，比較大，微信可能要用「檔案」的方式傳' : ''}。</p>
    <div class="note">請 ${esc(cap.toName)} 這樣收：
      <ol style="margin:6px 0 0;padding-left:20px"><li>把檔案存到 iPhone 的「檔案」</li><li>打開蜂采 → 旅行包 → 時光膠囊</li><li>按「收到的膠囊」，選這個檔案</li></ol>
      ${cap.secrecy === 'secret' ? '打開的日子是秘密，' : `${esc(fmtYMD(cap.openAt))}之前，`}他只會看到一格封起來的蜂巢。</div>
    <div class="row"><button class="btn main" id="gshare">${icon('check')}傳給朋友</button><button class="btn" id="gsave">存成檔案</button></div>
    <button class="linkbtn" id="gdone" style="display:block;margin:8px auto 0">完成</button>
    <p class="muted sm" style="text-align:center">送出去的膠囊不會留在你的蜂巢裡。</p>`);
  ov.querySelector('#gshare').onclick = async () => {
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `給${cap.toName}的時光膠囊` }); toast('已送出'); }
      else saveFile(file);
    } catch (e) { if (e.name !== 'AbortError') saveFile(file); }
  };
  ov.querySelector('#gsave').onclick = () => saveFile(file);
  ov.querySelector('#gdone').onclick = () => { ov.remove(); location.hash = 'hive'; };
}
function saveFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---------- 收到朋友送的膠囊 ----------
async function receive(file) {
  let cap;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'fengcai-capsule' || !data.capsule) throw new Error();
    cap = await capsuleFromData(data.capsule);
  } catch (e) { toast('這不是蜂采的時光膠囊檔案'); return; }
  if (await store.getCapsule(cap.id)) { toast('這顆膠囊已經在你的蜂巢裡了'); return; }
  cap.received = true; cap.receivedAt = Date.now(); cap.opened = false;
  await store.saveCapsule(cap);
  const ov = document.createElement('div');
  ov.className = 'cap-anim arrive';
  ov.innerHTML = `<div class="ca-hex">${hexCell('sealed', fillOf(cap))}</div><p>收到一顆${cap.from ? `來自 ${esc(cap.from)} 的` : ''}時光膠囊！</p><small>${cap.secrecy === 'secret' ? '什麼時候打開是秘密' : cap.secrecy === 'year' ? `${new Date(cap.openAt).getFullYear()} 年會打開` : `${esc(fmtYMD(cap.openAt))} 打開`}</small>`;
  document.body.appendChild(ov);
  setTimeout(() => { ov.remove(); C.rerender(); }, 2600);
}

// ---------- 行事曆提醒（.ics） ----------
function downloadICS(c) {
  const d = new Date(c.openAt), n = new Date(c.openAt + DAY), p = x => String(x).padStart(2, '0');
  const ymd = x => `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}`;
  const now = new Date(), stamp = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}00Z`;
  const url = location.origin + location.pathname;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//fengcai//capsule//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${c.id}@fengcai`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(n)}`,
    'SUMMARY:蜂采：有一顆時光膠囊可以打開了', `DESCRIPTION:打開蜂采就會看到它 ${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:PT9H', 'ACTION:DISPLAY', 'DESCRIPTION:蜂采：時光膠囊可以打開了', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  saveFile(new File([ics], '蜂采時光膠囊提醒.ics', { type: 'text/calendar' }));
}

// ---------- 時間到了：膠囊冒出來 ----------
export async function checkDue() {
  if (document.querySelector('.cap-anim')) return;
  const due = (await store.listCapsules()).filter(isDue);
  for (const c of due) await unseal(c);
}
function unseal(c) {
  return new Promise(res => {
    const ov = document.createElement('div');
    ov.className = 'cap-anim open';
    ov.innerHTML = `<div class="ca-hex">${hexCell('sealed', 0.3)}<div class="ca-bee"><svg viewBox="-16 -18 32 32" width="64" height="64">${BEE}</svg></div></div>
      <p>${c.received && c.from ? `${esc(c.from)} 送你的` : '一顆'}時光膠囊<br>可以打開了</p>
      <button class="btn main big" id="caopen">${icon('flower')}打開</button>`;
    document.body.appendChild(ov);
    ov.querySelector('#caopen').onclick = async () => {
      ov.classList.add('melt');
      c.opened = true; c.openedAt = Date.now();
      await store.saveCapsule(c);
      setTimeout(() => { ov.remove(); showContent(c, true).then(res); }, 1500);
    };
  });
}
// 看膠囊的內容（打開那一刻，或之後在蜂巢點已打開的格子）
function showContent(c, first) {
  const vis = (c.media || []).filter(m => m.kind === 'photo' || m.kind === 'video');
  return new Promise(res => {
    const ov = C.overlay(`<div class="cap-open">
      <p class="cap-hd">${first ? '時光膠囊打開了' : '時光膠囊'}</p>
      <p class="cap-meta">${esc(fmtYMD(c.createdAt))}封存${c.from ? `・來自 ${esc(c.from)}` : ''}${c.to ? `・${esc(toText(c))}` : ''}</p>
      ${c.note ? `<p class="cap-text">${esc(c.note).replace(/\n/g, '<br>')}</p>` : ''}
      <div class="cap-media">${(c.media || []).map(m => m.kind === 'photo' ? `<img src="${C.ou(m.blob)}" alt="">` : m.kind === 'video' ? `<video src="${C.ou(m.blob)}" controls playsinline ${m.thumb ? `poster="${C.ou(m.thumb)}"` : ''}></video>` : `<div class="cap-audio">${icon('mic')}<audio src="${C.ou(m.blob)}" controls></audio></div>`).join('')}</div>
      <div class="row"><button class="btn main" id="cok">${first ? '收下' : '關閉'}</button>${vis.length ? `<button class="btn" id="csave">${icon('check')}存到相簿</button>` : ''}</div>
      ${first ? '' : '<button class="linkbtn danger-link" id="cdel2">刪除這顆膠囊</button>'}</div>`);
    ov.querySelector('#cok').onclick = () => { ov.remove(); res(); };
    const sv = ov.querySelector('#csave');
    if (sv) sv.onclick = () => saveToPhotos(vis);
    const d = ov.querySelector('#cdel2');
    if (d) d.onclick = async () => {
      if (!(await confirmDlg('刪除這顆已打開的膠囊？照片、影片和聲音會一起刪除，無法復原。', '確定刪除', '取消'))) return;
      await store.deleteCapsule(c.id); ov.remove(); toast('已刪除'); C.rerender(); res();
    };
  });
}

// 把膠囊裡的照片和影片存進 iPhone 相簿（分享選單選「儲存影像」）
async function saveToPhotos(list) {
  const files = list.map((m, i) => new File([m.blob], `蜂采膠囊-${i + 1}.${m.kind === 'video' ? (m.mime || '').includes('quicktime') ? 'mov' : 'mp4' : 'jpg'}`, { type: m.mime || (m.kind === 'video' ? 'video/mp4' : 'image/jpeg') }));
  try {
    if (navigator.canShare?.({ files })) { await navigator.share({ files }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  files.forEach(saveFile);
  toast('已下載，到「檔案」裡可以存到相簿');
}

// 4. 回憶日：膠囊打開滿 1 年、2 年…的那一天，首頁出現一張小卡
export async function anniversaryToday() {
  const now = new Date(), key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (getSetting('capAnnDone') === key) return null;
  for (const c of await store.listCapsules()) {
    if (!c.opened || !c.openedAt) continue;
    const o = new Date(c.openedAt), years = now.getFullYear() - o.getFullYear();
    if (years >= 1 && o.getMonth() === now.getMonth() && o.getDate() === now.getDate()) return { c, years, key };
  }
  return null;
}
export const dismissAnniversary = key => setSetting('capAnnDone', key);
export const yearWord = n => ['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十'][n] || String(n);

// 時間軸用：打開過的膠囊
export async function openedCapsules() { return (await store.listCapsules()).filter(c => c.opened && c.openedAt); }

// 月曆用：哪些日子有膠囊要打開（只有「顯示日期」的才標）
export async function capsuleDays() {
  const out = {};
  for (const c of await store.listCapsules()) if (!c.opened && c.secrecy === 'date') { const d = new Date(c.openAt); const k = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; out[k] = (out[k] || 0) + 1; }
  return out;
}
