// ==========================================================
// 蜂采 足跡明信片（postcard.js）
// 版型：A 旅程總覽、B 照片拼貼、C 一日一張、D 孩子的花園
// 尺寸：4:5（1080×1350）、9:16（1080×1920）、1:1（1080×1080）
// 配色：theme.css 的 --pc-<名稱>-* 變數；App 介面色另由 palette() 讀取
// ==========================================================
import { store, isKid, isAdult } from './store.js';
import { adultMapSVG, svgToImage, finishRoute, markerOnlySVG, markerNumSVG, gardenSVG, dayInfo, SHAPES } from './map.js';
import { distM } from './geo.js';
import { getTheme } from './themes.js';
import { dayKey, fmtDate, fmtTime } from './ui.js';

export const FONT = '-apple-system,BlinkMacSystemFont,"PingFang TC","PingFang SC","Noto Sans TC",sans-serif';
export const PC_W = 1080, PC_H = 1350;
export const SIZES = { '4:5': 1350, '9:16': 1920, '1:1': 1080 };
export const PALETTES = { honey: '蜂蜜黃', sakura: '櫻花粉', mint: '薄荷綠', night: '夜空藍' };
export const TEMPLATES = { A: '旅程總覽', B: '照片拼貼', C: '一日一張', D: '孩子的花園' };
export const DEFAULT_PC = { tpl: 'A', size: '4:5', palette: 'honey', style: 'normal', show: { list: true, stats: true, photos: true, quote: true }, title: '', subtitle: '', quote: '', photoIds: null, day: 0, layout: 0, crops: {} };

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('圖片載入失敗')); i.src = src; });
async function blobImg(b) {
  if (!b) return null;
  try { if (window.createImageBitmap) return await createImageBitmap(b); } catch (e) {}
  try { return await loadImg(URL.createObjectURL(b)); } catch (e) { return null; }
}
const short = s => String(s || '').replace(/（模擬）/g, '');

// ---------- 顏色 ----------
function cssVars(names) {
  const root = document.documentElement;
  root.classList.add('export-light');
  const cs = getComputedStyle(root), out = {};
  names.forEach(n => { out[n] = cs.getPropertyValue(n).trim(); });
  root.classList.remove('export-light');
  return out;
}
// App 介面色（短片也用）
export function palette() {
  const v = cssVars(['--bg', '--ink', '--ink-soft', '--honey', '--honey-deep', '--honey-soft', '--petal', '--line', '--map-bg', '--route-normal', '--route-cute', '--day-1', '--day-2', '--day-3', '--day-4', '--day-5', '--night-gold']);
  return { bg: v['--bg'], ink: v['--ink'], soft: v['--ink-soft'], honey: v['--honey'], deep: v['--honey-deep'], soft2: v['--honey-soft'], petal: v['--petal'], card: '#FFFFFF', line: v['--line'], mapBg: v['--map-bg'], routeN: v['--route-normal'], routeC: v['--route-cute'], days: [1, 2, 3, 4, 5].map(i => v['--day-' + i]), nightGold: v['--night-gold'] };
}
// 明信片配色
function pcPalette(name) {
  const n = PALETTES[name] ? name : 'honey', k = ['bg', 'ink', 'soft', 'accent', 'card', 'chip'];
  const v = cssVars(k.map(x => `--pc-${n}-${x}`));
  const o = {}; k.forEach(x => { o[x] = v[`--pc-${n}-${x}`]; });
  return o;
}

// ---------- 小工具 ----------
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// f：焦點（讓這一點盡量在中間）；crop：拼圖裡自己拖過的位置（0～1，跟 CSS background-position 一樣）
function cover(ctx, img, x, y, w, h, r, f, crop) {
  const iw = img.width, ih = img.height, s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
  let ox, oy;
  if (crop) { ox = x + (w - dw) * crop.x; oy = y + (h - dh) * crop.y; }
  else {
    const fx = f ? f.x : .5, fy = f ? f.y : .5;
    ox = Math.min(x, Math.max(x + w - dw, x + w / 2 - fx * dw)); oy = Math.min(y, Math.max(y + h - dh, y + h / 2 - fy * dh));
  }
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip(); ctx.drawImage(img, ox, oy, dw, dh); ctx.restore();
  return { dw, dh, cx: dw > w + .5 ? (ox - x) / (w - dw) : .5, cy: dh > h + .5 ? (oy - y) / (h - dh) : .5 };
}
// 拼圖版型：每種張數 1～3 種排法（比例座標 [x, y, 寬, 高]）
const T3 = 1 / 3, T2 = 2 / 3;
export const COLLAGE = {
  1: [[[0, 0, 1, 1]]],
  2: [[[0, 0, .5, 1], [.5, 0, .5, 1]], [[0, 0, 1, .5], [0, .5, 1, .5]], [[0, 0, .62, 1], [.62, 0, .38, 1]]],
  3: [[[0, 0, .62, 1], [.62, 0, .38, .5], [.62, .5, .38, .5]], [[0, 0, 1, .6], [0, .6, .5, .4], [.5, .6, .5, .4]], [[0, 0, T3, 1], [T3, 0, T3, 1], [T2, 0, T3, 1]]],
  4: [[[0, 0, .5, .5], [.5, 0, .5, .5], [0, .5, .5, .5], [.5, .5, .5, .5]], [[0, 0, 1, .6], [0, .6, T3, .4], [T3, .6, T3, .4], [T2, .6, T3, .4]], [[0, 0, .62, 1], [.62, 0, .38, T3], [.62, T3, .38, T3], [.62, T2, .38, T3]]],
  5: [[[0, 0, .5, 1], [.5, 0, .25, .5], [.75, 0, .25, .5], [.5, .5, .25, .5], [.75, .5, .25, .5]], [[0, 0, .5, .55], [.5, 0, .5, .55], [0, .55, T3, .45], [T3, .55, T3, .45], [T2, .55, T3, .45]], [[0, 0, 1, .6], [0, .6, .25, .4], [.25, .6, .25, .4], [.5, .6, .25, .4], [.75, .6, .25, .4]]],
  6: [[[0, 0, T3, .5], [T3, 0, T3, .5], [T2, 0, T3, .5], [0, .5, T3, .5], [T3, .5, T3, .5], [T2, .5, T3, .5]], [[0, 0, .5, T3], [.5, 0, .5, T3], [0, T3, .5, T3], [.5, T3, .5, T3], [0, T2, .5, T3], [.5, T2, .5, T3]], [[0, 0, T2, T2], [T2, 0, T3, T3], [T2, T3, T3, T3], [0, T2, T3, T3], [T3, T2, T3, T3], [T2, T2, T3, T3]]]
};
export const MAX_PC_PHOTOS = 6, AUTO_PC_PHOTOS = 4;
function collageRects(n, v, X, Y, W, H, g = 20) {
  const set = COLLAGE[n] || COLLAGE[1], L = set[((v % set.length) + set.length) % set.length];
  return L.map(([fx, fy, fw, fh]) => {
    const l = fx > .001 ? g / 2 : 0, r = fx + fw < .999 ? g / 2 : 0, t = fy > .001 ? g / 2 : 0, b = fy + fh < .999 ? g / 2 : 0;
    return { x: X + fx * W + l, y: Y + fy * H + t, w: fw * W - l - r, h: fh * H - t - b };
  });
}
export function wrap(ctx, text, maxW, maxLines) {
  const lines = []; let cur = '';
  for (const ch of [...String(text || '')]) {
    const t = cur + ch;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur); cur = ch;
      if (lines.length === maxLines) {
        let l = lines[maxLines - 1];
        while (l && ctx.measureText(l + '…').width > maxW) l = l.slice(0, -1);
        lines[maxLines - 1] = l + '…';
        return lines;
      }
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
const fit = (ctx, s, w) => wrap(ctx, s, w, 1)[0] || '';
function shadowCard(ctx, x, y, w, h, r, fill) {
  ctx.save(); ctx.shadowColor = 'rgba(60,30,0,.16)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;
  rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}
function hexPattern(ctx, W, H, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = .09; ctx.lineWidth = 3;
  for (let y = -40, row = 0; y < H + 80; y += 96, row++) for (let x = (row % 2) * 56 - 40; x < W + 80; x += 112) {
    ctx.beginPath();
    for (let a = 0; a < 6; a++) { const t = Math.PI / 3 * a - Math.PI / 2; ctx[a ? 'lineTo' : 'moveTo'](x + 40 * Math.cos(t), y + 40 * Math.sin(t)); }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}
function polaroid(ctx, img, cx, cy, w, h, deg, f) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180);
  ctx.shadowColor = 'rgba(60,30,0,.25)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff'; rr(ctx, -w / 2 - 12, -h / 2 - 12, w + 24, h + 24, 8); ctx.fill();
  ctx.shadowColor = 'transparent';
  cover(ctx, img, -w / 2, -h / 2, w, h, 4, f);
  ctx.restore();
}
function T(ctx, s, x, y, size, color, weight = 700, align = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

// ---------- 資料 ----------
export async function collect(tripId) {
  const trip = await store.getTrip(tripId);
  if (!trip) return null;
  const cs = await store.listCheckins(tripId);
  const media = [];
  for (const c of cs) for (const m of await store.listMedia(c.id)) if (m.kind !== 'audio') media.push({ ...m, c });
  media.sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || a.ts - b.ts);
  const days = [...new Set(cs.map(c => dayKey(c.ts)))];
  return { trip, cs, media, days };
}
export function dateRange(cs) {
  if (!cs.length) return '';
  const a = cs[0].ts, b = cs[cs.length - 1].ts;
  return dayKey(a) === dayKey(b) ? fmtDate(a) : `${fmtDate(a).replace(/ 週.$/, '')} – ${fmtDate(b).replace(/ 週.$/, '')}`;
}
export function tripStats(data) {
  const pts = data.cs.filter(c => c.lat != null);
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += distM(pts[i - 1], pts[i]);
  return {
    days: data.days.length, places: data.cs.length,
    kid: data.cs.filter(isKid).length, together: data.cs.filter(c => isKid(c) && isAdult(c)).length,
    photos: data.media.length, km: m / 1000
  };
}
// 整趟旅程的順序 1、2、3…（地圖花心和清單共用）
export function orderOf(data) { const o = {}; [...data.cs].sort((a, b) => a.ts - b.ts).forEach((c, i) => { o[c.id] = i + 1; }); return o; }
const numImgCache = new Map();
async function numImg(c, n, pal) {
  const key = `${isKid(c) ? 1 : 0}${isAdult(c) ? 1 : 0}-${n}-${pal}`;
  if (!numImgCache.has(key)) numImgCache.set(key, await svgToImage(markerNumSVG(c, n, pal), 48, 48, 4).catch(() => null));
  return numImgCache.get(key);
}
export function statsLine(data) {
  const s = tripStats(data);
  return `${s.places} 個地點 · ${s.days} 天${s.kid ? ` · 孩子蓋了 ${s.kid} 個章` : ''}`;
}
const kmText = km => (km >= 10 ? Math.round(km) : km >= 1 ? km.toFixed(1) : km > 0 ? km.toFixed(2) : '0');

let mkCache = null;
async function markerImgs() {
  if (mkCache) return mkCache;
  const o = {};
  for (const [k, c] of [['a', { adult: true, kid: false }], ['k', { adult: false, kid: true }], ['b', { adult: true, kid: true }]]) o[k] = await svgToImage(markerOnlySVG(c), 48, 48, 4).catch(() => null);
  mkCache = o; return o;
}
const mkKey = c => (isKid(c) && isAdult(c) ? 'b' : isKid(c) ? 'k' : 'a');

async function pickPhotos(data, opt, n) {
  let list = data.media;
  if (opt.photoIds && opt.photoIds.length) list = opt.photoIds.map(id => data.media.find(m => m.id === id)).filter(Boolean);
  const out = [];
  for (const m of list) {
    if (out.length >= n) break;
    const img = await blobImg(m.kind === 'photo' ? m.blob : m.thumb);
    if (img) out.push({ img, f: m.focus, c: m.c, id: m.id });
  }
  return out;
}
// 每一站放在花心裡的小照片（精選優先）
const toData = b => new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = () => res(null); f.readAsDataURL(b); });
async function stopPhotos(data) {
  const out = {};
  for (const c of data.cs) {
    const m = data.media.find(x => x.c.id === c.id);
    const b = m && (m.thumb || (m.kind === 'photo' ? m.blob : null));
    if (b) out[c.id] = await toData(b);
  }
  return out;
}
// 地圖跟著明信片配色：底色、花的顏色和造型、路線、地名一起換；夜空配色＝星空地圖
async function mapImg(cs, opt, w, h, seed, view) {
  const pal = PALETTES[opt.palette] ? opt.palette : 'honey';
  const style = pal === 'night' ? 'night' : opt.style === 'cute' ? 'cute' : 'normal';
  const svg = adultMapSVG(cs, style, w, h, seed, { ...view, pal, shape: SHAPES[pal] });
  return svg ? svgToImage(svg, w, h, 3, finishRoute) : null;
}

// ---------- 共用區塊 ----------
function header(ctx, P, logo, data, opt, W) {
  if (logo) ctx.drawImage(logo, 60, 48, 76, 76);
  T(ctx, '蜂采', 152, 100, 38, P.ink, 800);
  T(ctx, dateRange(data.cs), W - 60, 98, 30, P.soft, 600, 'right');
  ctx.font = `800 76px ${FONT}`;
  let y = 222;
  wrap(ctx, (opt.title || data.trip.name || '').trim(), W - 120, 2).forEach(l => { T(ctx, l, 60, y, 76, P.ink, 800); y += 88; });
  if (opt.subtitle) { ctx.font = `600 34px ${FONT}`; T(ctx, fit(ctx, opt.subtitle, W - 120), 60, y - 26, 34, P.soft, 600); y += 34; }
  return y - 40;
}
function footer(ctx, P, W, H) { T(ctx, '蜂采 · 飛到哪，甜到哪', W - 60, H - 34, 26, P.accent, 700, 'right'); }
function statsRow(ctx, P, s, x, y, w, h) {
  const items = [[s.days, '天'], [s.places, '個地點'], [s.kid, '孩子的章'], [s.together, '一起打卡'], [s.photos, '張照片'], [kmText(s.km), '公里']];
  const gap = 12, bw = (w - gap * (items.length - 1)) / items.length;
  items.forEach(([n, l], i) => {
    const bx = x + i * (bw + gap);
    rr(ctx, bx, y, bw, h, 18); ctx.fillStyle = P.card; ctx.fill();
    T(ctx, String(n), bx + bw / 2, y + h * .55, Math.min(50, h * .45), P.ink, 800, 'center');
    T(ctx, l, bx + bw / 2, y + h * .85, 22, P.soft, 600, 'center');
  });
}
// 每日清單；回傳實際用掉的高度
function dayLists(ctx, P, nimg, data, x, y, w, h) {
  const info = dayInfo(data.cs);
  let cols = info.days.map((d, k) => ({ k, items: data.cs.filter(c => info.dayOf(c) === k) }));
  if (cols.length === 1 && cols[0].items.length > 4) {
    const it = cols[0].items, half = Math.ceil(it.length / 2);
    cols = [{ k: 0, items: it.slice(0, half) }, { k: 0, items: it.slice(half), cont: true }];
  }
  const shown = cols.slice(0, 3), gap = 30, cw = (w - gap * (shown.length - 1)) / shown.length, lh = 46;
  const maxLines = Math.max(1, Math.floor((h - 50) / lh));
  let used = 0;
  shown.forEach((col, i) => {
    const cx = x + i * (cw + gap);
    const d = col.items[0];
    T(ctx, col.cont ? '' : `第 ${col.k + 1} 天${d ? ` · ${new Date(d.ts).getMonth() + 1}/${new Date(d.ts).getDate()}` : ''}`, cx, y + 30, 30, P.accent, 800);
    let yy = y + 46, list = col.items, more = 0;
    if (list.length > maxLines) { more = list.length - (maxLines - 1); list = list.slice(0, maxLines - 1); }
    list.forEach(c => {
      const im = nimg[c.id]; if (im) ctx.drawImage(im, cx - 10, yy - 7, 56, 56);
      T(ctx, fmtTime(c.ts), cx + 50, yy + 31, 22, P.soft, 600);
      ctx.font = `600 22px ${FONT}`; const tw = ctx.measureText(fmtTime(c.ts)).width;
      ctx.font = `700 28px ${FONT}`;
      T(ctx, fit(ctx, short(c.placeName), cw - 64 - tw), cx + 60 + tw, yy + 31, 28, P.ink, 700);
      yy += lh;
    });
    if (more) { T(ctx, `…還有 ${more} 站`, cx + 42, yy + 31, 24, P.soft, 600); yy += lh; }
    used = Math.max(used, yy - y);
  });
  if (cols.length > 3) T(ctx, `（共 ${cols.length} 天，列出前 3 天）`, x, y + used + 26, 22, P.soft, 600);
  return used + (cols.length > 3 ? 30 : 0);
}
function quoteBlock(ctx, P, q, x, y, w) {
  ctx.font = `800 36px ${FONT}`;
  const lines = wrap(ctx, `「${q}」`, w - 40, 2);
  lines.forEach((l, i) => T(ctx, l, x + w / 2, y + 44 + i * 48, 36, P.ink, 800, 'center'));
  return 30 + lines.length * 48;
}

// ---------- 主程式 ----------
// opt：見 DEFAULT_PC；舊參數 template:'map'|'photo' 仍相容
export async function renderPostcard(data, o = {}) {
  const opt = { ...DEFAULT_PC, ...o, show: { ...DEFAULT_PC.show, ...(o.show || {}) } };
  if (o.template === 'photo') opt.tpl = 'B'; else if (o.template === 'map') opt.tpl = 'A';
  const W = PC_W, H = SIZES[opt.size] || PC_H;
  const P = pcPalette(opt.palette);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  hexPattern(ctx, W, H, P.accent);
  const logo = await loadImg('./logo.svg').catch(() => null);
  const mk = await markerImgs();
  const st = tripStats(data);
  const quote = (opt.quote || '').trim();

  if (opt.tpl === 'B') {
    const want = opt.photoIds && opt.photoIds.length ? Math.min(MAX_PC_PHOTOS, opt.photoIds.length) : AUTO_PC_PHOTOS;
    const pics = await pickPhotos(data, opt, want);
    const X = 60, Y = 60, Wd = W - 120, Ht = Math.round(H * (H > 1500 ? .56 : H < 1200 ? .46 : .52));
    cv.tiles = [];
    if (!pics.length) { rr(ctx, X, Y, Wd, Ht, 34); ctx.fillStyle = P.card; ctx.fill(); T(ctx, '這趟旅程還沒有照片', W / 2, Y + Ht / 2, 36, P.soft, 700, 'center'); }
    else {
      const crops = opt.crops || {}, rad = pics.length >= 4 ? 22 : pics.length === 1 ? 34 : 28;
      collageRects(pics.length, opt.layout || 0, X, Y, Wd, Ht).forEach((q, i) => {
        const p = pics[i], u = cover(ctx, p.img, q.x, q.y, q.w, q.h, rad, p.f, crops[p.id]);
        cv.tiles.push({ id: p.id, ...q, ...u });
      });
    }
    cv.layouts = (COLLAGE[pics.length] || []).length;
    const by = Y + Ht + 36, qh = opt.show.quote && quote ? 110 : 0;
    const ms = Math.max(260, Math.min(H > 1500 ? 520 : 440, H - by - 90 - qh));
    shadowCard(ctx, 60, by, ms, ms, 36, P.card);
    const mi = await mapImg(data.cs, opt, 360, 360, data.trip.id, { tags: true, order: orderOf(data) });
    if (mi) { ctx.save(); rr(ctx, 74, by + 14, ms - 28, ms - 28, 26); ctx.clip(); ctx.drawImage(mi, 74, by + 14, ms - 28, ms - 28); ctx.restore(); }
    const tx = 60 + ms + 36, tw = W - 60 - tx;
    if (logo) ctx.drawImage(logo, tx, by, 48, 48);
    T(ctx, '蜂采', tx + 60, by + 36, 28, P.ink, 800);
    ctx.font = `800 54px ${FONT}`;
    let y = by + 112;
    wrap(ctx, (opt.title || data.trip.name || '').trim(), tw, 2).forEach(l => { T(ctx, l, tx, y, 54, P.ink, 800); y += 64; });
    if (opt.subtitle) { ctx.font = `600 28px ${FONT}`; T(ctx, fit(ctx, opt.subtitle, tw), tx, y - 10, 28, P.soft, 600); y += 40; }
    T(ctx, dateRange(data.cs), tx, y, 26, P.soft, 600); y += 40;
    if (opt.show.stats) { T(ctx, `${st.places} 個地點 · ${st.days} 天 · ${kmText(st.km)} 公里`, tx, y, 26, P.accent, 800); y += 44; }
    if (opt.show.list) {
      const info = dayInfo(data.cs);
      for (let k = 0; k < info.days.length && y < by + ms - 10; k++) {
        const ord = orderOf(data);
        const names = data.cs.filter(c => info.dayOf(c) === k).map(c => `${ord[c.id]}.${short(c.placeName)}`).join('  ');
        ctx.font = `600 24px ${FONT}`;
        const ls = wrap(ctx, `第 ${k + 1} 天：${names}`, tw, 2);
        ls.forEach(l => { if (y < by + ms) { T(ctx, l, tx, y, 24, P.ink, 600); y += 34; } });
        y += 6;
      }
    }
    if (qh) quoteBlock(ctx, P, quote, 60, Math.max(by + ms + 10, H - 70 - qh - 10), W - 120);
  } else if (opt.tpl === 'C') {
    const info = dayInfo(data.cs);
    const k = Math.min(Math.max(0, opt.day || 0), Math.max(0, info.days.length - 1));
    const stops = data.cs.filter(c => info.dayOf(c) === k);
    if (logo) ctx.drawImage(logo, 60, 48, 76, 76);
    T(ctx, '蜂采', 152, 100, 38, P.ink, 800);
    const d0 = stops[0];
    ctx.font = `800 34px ${FONT}`;
    const pill = `第 ${k + 1} 天`, pw = ctx.measureText(pill).width + 44;
    rr(ctx, 60, 150, pw, 60, 30); ctx.fillStyle = P.accent; ctx.fill();
    T(ctx, pill, 60 + pw / 2, 192, 34, '#fff', 800, 'center');
    T(ctx, d0 ? fmtDate(d0.ts) : '', 60 + pw + 20, 192, 34, P.soft, 700);
    ctx.font = `800 64px ${FONT}`;
    let y = 290;
    wrap(ctx, (opt.title || data.trip.name || '').trim(), W - 120, 1).forEach(l => { T(ctx, l, 60, y, 64, P.ink, 800); y += 70; });
    if (opt.subtitle) { ctx.font = `600 32px ${FONT}`; T(ctx, fit(ctx, opt.subtitle, W - 120), 60, y - 16, 32, P.soft, 600); y += 34; }
    const qh = opt.show.quote && quote ? 120 : 0;
    const mapH = Math.round(Math.min(H * .36, Math.max(260, H - y - 70 - qh - stops.length * 100)));
    shadowCard(ctx, 60, y, W - 120, mapH, 36, P.card);
    const mw = 480, mh = Math.round(480 * (mapH - 28) / (W - 148));
    const mi = await mapImg(data.cs, opt, mw, mh, data.trip.id, { day: k });
    if (mi) { ctx.save(); rr(ctx, 74, y + 14, W - 148, mapH - 28, 26); ctx.clip(); ctx.drawImage(mi, 74, y + 14, W - 148, mapH - 28); ctx.restore(); }
    y += mapH + 30;
    const avail = H - y - 70 - qh, rowH = Math.max(64, Math.min(H > 1500 ? 190 : 150, avail / Math.max(1, stops.length)));
    const show = stops.slice(0, Math.floor(avail / rowH));
    const thumbs = {};
    if (opt.show.photos !== false) for (const c of show) {
      const ms = data.media.filter(m => m.c.id === c.id);
      const chosen = opt.photoIds && opt.photoIds.length ? ms.find(m => opt.photoIds.includes(m.id)) || ms[0] : ms[0];
      if (chosen) thumbs[c.id] = { img: await blobImg(chosen.kind === 'photo' ? chosen.blob : chosen.thumb), f: chosen.focus };
    }
    if (show.length > 1) { ctx.strokeStyle = P.chip; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(92, y + rowH / 2); ctx.lineTo(92, y + rowH * (show.length - .5)); ctx.stroke(); }
    show.forEach((c, i) => {
      const ry = y + i * rowH, cyy = ry + rowH / 2, isz = Math.min(64, rowH - 10);
      const im = mk[mkKey(c)]; if (im) ctx.drawImage(im, 92 - isz / 2, cyy - isz / 2, isz, isz);
      const th = thumbs[c.id], tsz = rowH - 16;
      const tw = W - 60 - 140 - (th && th.img ? tsz + 24 : 0);
      T(ctx, `${info.num(c)} · ${fmtTime(c.ts)}`, 140, cyy - (rowH > 90 ? 12 : 2), Math.min(26, rowH * .25), P.soft, 600);
      ctx.font = `800 ${Math.min(40, rowH * .32)}px ${FONT}`;
      T(ctx, fit(ctx, short(c.placeName), tw), 140, cyy + (rowH > 90 ? 34 : 26), Math.min(40, rowH * .32), P.ink, 800);
      if (th && th.img) cover(ctx, th.img, W - 60 - tsz, ry + 8, tsz, tsz, 18, th.f);
    });
    if (stops.length > show.length) T(ctx, `…還有 ${stops.length - show.length} 站`, 140, y + show.length * rowH + 30, 26, P.soft, 600);
    if (qh) quoteBlock(ctx, P, quote, 60, H - 70 - qh, W - 120);
  } else if (opt.tpl === 'D') {
    const kids = data.cs.filter(isKid);
    if (logo) ctx.drawImage(logo, 60, 48, 76, 76);
    T(ctx, '小小打卡官的花園', 152, 104, 44, P.ink, 800);
    ctx.font = `600 32px ${FONT}`;
    T(ctx, fit(ctx, `${(opt.title || data.trip.name || '').trim()}${opt.subtitle ? ' · ' + opt.subtitle : ''}`, W - 212), 152, 150, 32, P.soft, 600);
    let y = 196;
    const qh = opt.show.quote && quote ? 130 : 0, sh = opt.show.stats ? 90 : 0;
    if (!kids.length) {
      rr(ctx, 60, y, W - 120, H - y - 120, 36); ctx.fillStyle = P.card; ctx.fill();
      T(ctx, '孩子還沒有蓋章', W / 2, y + (H - y - 120) / 2, 44, P.soft, 800, 'center');
    } else {
      const gw = 360, gsvg = gardenSVG(kids, c => getTheme((data.trip.dayThemes || {})[dayKey(c.ts)]), data.trip.id, null);
      const gh = +(/viewBox="0 0 360 (\d+)"/.exec(gsvg) || [0, 460])[1];
      const gi = await svgToImage(gsvg, gw, gh, 3).catch(() => null);
      const availH = H - y - 80 - qh - sh - 70;
      const sc = Math.min((W - 120) / gw, availH / gh), dw = gw * sc, dh = gh * sc;
      if (gi) { ctx.save(); rr(ctx, (W - dw) / 2, y, dw, dh, 40); ctx.clip(); ctx.drawImage(gi, (W - dw) / 2, y, dw, dh); ctx.restore(); }
      y += dh + 24;
      const info = dayInfo(kids);
      ctx.font = `700 28px ${FONT}`;
      let cx = 60;
      info.days.forEach((d, k) => {
        const th = getTheme((data.trip.dayThemes || {})[d]);
        const s = `第 ${k + 1} 天 · ${th.name}`, w = ctx.measureText(s).width + 36;
        if (cx + w > W - 60) return;
        rr(ctx, cx, y, w, 52, 26); ctx.fillStyle = P.card; ctx.fill();
        T(ctx, s, cx + w / 2, y + 36, 28, P.ink, 700, 'center');
        cx += w + 12;
      });
      y += 70;
      if (sh) { T(ctx, `蓋了 ${st.kid} 個章 · 和爸媽一起打卡 ${st.together} 次`, W / 2, y + 40, 34, P.accent, 800, 'center'); y += sh; }
      if (qh) {
        rr(ctx, 60, y, W - 120, qh - 20, 30); ctx.fillStyle = P.card; ctx.fill();
        quoteBlock(ctx, P, quote, 60, y - 8, W - 120);
      }
    }
  } else {
    // A 旅程總覽
    let y = header(ctx, P, logo, data, opt, W) + 10;
    const pics = opt.show.photos ? await pickPhotos(data, opt, 4) : [];
    const footerH = 70;
    const tall = H > 1500, notes = [];
    cv.notes = notes;
    let photoH = pics.length ? (tall ? 280 : 210) : 0, statsH = opt.show.stats ? (tall ? 120 : 100) : 0, quoteH = opt.show.quote && quote ? 90 : 0;
    const info = dayInfo(data.cs);
    let listH = 0;
    if (opt.show.list && data.cs.length) {
      const per = Math.max(...info.days.map((d, k) => data.cs.filter(c => info.dayOf(c) === k).length));
      const lines = info.days.length === 1 && per > 4 ? Math.ceil(per / 2) : per;
      listH = 50 + Math.min(lines, 6) * 46;
    }
    const gaps = [listH, statsH, photoH, quoteH].filter(Boolean).length * 24;
    let mapH = H - y - footerH - listH - statsH - photoH - quoteH - gaps;
    // 照片優先：先縮行程清單、再縮數字列，真的不夠才拿掉照片（並提示）
    if (mapH < 270 && listH > 142) { const cut = Math.min(listH - 142, 270 - mapH); listH -= cut; mapH += cut; }
    if (mapH < 270 && statsH > 90) { mapH += statsH - 90; statsH = 90; }
    if (mapH < 230 && photoH) { mapH += photoH + 24; photoH = 0; notes.push('照片'); }
    mapH = Math.max(220, mapH);
    shadowCard(ctx, 60, y, W - 120, mapH, 40, P.card);
    const mw = 480, mh = Math.round(480 * (mapH - 36) / (W - 156));
    const mi = await mapImg(data.cs, opt, mw, mh, data.trip.id, { tags: true, order: orderOf(data) });
    if (mi) { ctx.save(); rr(ctx, 78, y + 18, W - 156, mapH - 36, 28); ctx.clip(); ctx.drawImage(mi, 78, y + 18, W - 156, mapH - 36); ctx.restore(); }
    else T(ctx, '這趟旅程還沒有定位資料', W / 2, y + mapH / 2, 32, P.soft, 600, 'center');
    y += mapH + 24;
    if (listH) {
      const ord = orderOf(data), nimg = {};
      for (const c of data.cs) nimg[c.id] = await numImg(c, ord[c.id], opt.palette);
      dayLists(ctx, P, nimg, data, 60, y, W - 120, listH); y += listH + 24;
    }
    if (statsH) { statsRow(ctx, P, st, 60, y, W - 120, statsH); y += statsH + 24; }
    if (photoH) {
      const n = pics.length, gap = 40, w = Math.min(260, (W - 120 - gap * (n - 1)) / n - 24), h = photoH - 50;
      const tot = n * (w + 24) + (n - 1) * gap, x0 = (W - tot) / 2 + (w + 24) / 2, rot = [-4, 3, -2, 4];
      pics.forEach((p, i) => polaroid(ctx, p.img, x0 + i * (w + 24 + gap), y + photoH / 2, w, h, rot[i], p.f));
      y += photoH + 24;
    }
    if (quoteH) quoteBlock(ctx, P, quote, 60, y - 20, W - 120);
  }
  footer(ctx, P, W, H);
  return cv;
}
