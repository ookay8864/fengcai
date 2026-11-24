// ==========================================================
// 蜂采 足跡明信片（postcard.js）
// 輸出 1080×1350（4:5）圖片，兩種版型：地圖為主、照片為主
// 版面的顏色來自 theme.css（一律用淺色）
// ==========================================================
import { store, isKid } from './store.js';
import { adultMapSVG, svgToImage, finishRoute } from './map.js';
import { dayKey, fmtDate } from './ui.js';

export const FONT = '-apple-system,BlinkMacSystemFont,"PingFang TC","PingFang SC","Noto Sans TC",sans-serif';
export const PC_W = 1080, PC_H = 1350;

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('圖片載入失敗')); i.src = src; });
async function blobImg(b) {
  if (!b) return null;
  try { if (window.createImageBitmap) return await createImageBitmap(b); } catch (e) {}
  try { return await loadImg(URL.createObjectURL(b)); } catch (e) { return null; }
}
export function palette() {
  const root = document.documentElement;
  root.classList.add('export-light');
  const cs = getComputedStyle(root), v = n => cs.getPropertyValue(n).trim();
  const p = { bg: v('--bg'), ink: v('--ink'), soft: v('--ink-soft'), honey: v('--honey'), deep: v('--honey-deep'), soft2: v('--honey-soft'), petal: v('--petal'), card: '#FFFFFF', line: v('--line'), mapBg: v('--map-bg'), routeN: v('--route-normal'), routeC: v('--route-cute'), days: [1, 2, 3, 4, 5].map(i => v('--day-' + i)) };
  root.classList.remove('export-light');
  return p;
}
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function cover(ctx, img, x, y, w, h, r) {
  const iw = img.width, ih = img.height, s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}
export function wrap(ctx, text, maxW, maxLines) {
  const lines = []; let cur = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const t = cur + chars[i];
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur); cur = chars[i];
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
function shadowCard(ctx, x, y, w, h, r, fill) {
  ctx.save();
  ctx.shadowColor = 'rgba(120,70,0,.18)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.restore();
}
function hexPattern(ctx, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = .1; ctx.lineWidth = 3;
  for (let y = -40, row = 0; y < PC_H + 80; y += 96, row++) {
    for (let x = (row % 2) * 56 - 40; x < PC_W + 80; x += 112) {
      ctx.beginPath();
      for (let a = 0; a < 6; a++) { const t = Math.PI / 3 * a - Math.PI / 2; ctx[a ? 'lineTo' : 'moveTo'](x + 40 * Math.cos(t), y + 40 * Math.sin(t)); }
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}
function polaroid(ctx, img, cx, cy, w, h, deg) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180);
  ctx.shadowColor = 'rgba(60,30,0,.25)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#fff'; rr(ctx, -w / 2 - 14, -h / 2 - 14, w + 28, h + 28, 10); ctx.fill();
  ctx.shadowColor = 'transparent';
  cover(ctx, img, -w / 2, -h / 2, w, h, 4);
  ctx.restore();
}

// 收集一趟旅程要用的資料
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
async function photos(data, n) {
  const out = [];
  for (const m of data.media) {
    if (out.length >= n) break;
    const img = await blobImg(m.kind === 'photo' ? m.blob : m.thumb);
    if (img) out.push(img);
  }
  return out;
}
async function mapImage(cs, style, w, h, seed) {
  const svg = adultMapSVG(cs, style, w, h, seed);
  if (!svg) return null;
  return svgToImage(svg, w, h, 3, finishRoute);
}
export function dateRange(cs) {
  if (!cs.length) return '';
  const a = cs[0].ts, b = cs[cs.length - 1].ts;
  return dayKey(a) === dayKey(b) ? fmtDate(a) : `${fmtDate(a).replace(/ 週.$/, '')} – ${fmtDate(b).replace(/ 週.$/, '')}`;
}
export function statsLine(data) {
  const kid = data.cs.filter(isKid).length;
  return `${data.cs.length} 個地點 · ${data.days.length} 天${kid ? ` · 孩子蓋了 ${kid} 個章` : ''}`;
}

// opt: { template:'map'|'photo', style:'normal'|'cute', title, quote }
export async function renderPostcard(data, opt) {
  const P = palette();
  const cv = document.createElement('canvas');
  cv.width = PC_W; cv.height = PC_H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, PC_W, PC_H);
  hexPattern(ctx, P.deep);
  const logo = await loadImg('./logo.svg').catch(() => null);
  const title = (opt.title || data.trip.name || '').trim();
  const quote = (opt.quote || '').trim();
  const pics = await photos(data, 3);
  const template = opt.template === 'photo' && pics.length ? 'photo' : 'map';

  if (template === 'map') {
    if (logo) ctx.drawImage(logo, 60, 52, 80, 80);
    ctx.fillStyle = P.ink; ctx.font = `800 40px ${FONT}`; ctx.textBaseline = 'alphabetic';
    ctx.fillText('蜂采', 156, 106);
    ctx.fillStyle = P.soft; ctx.font = `600 30px ${FONT}`; ctx.textAlign = 'right';
    ctx.fillText(dateRange(data.cs), PC_W - 60, 104); ctx.textAlign = 'left';
    ctx.fillStyle = P.ink; ctx.font = `800 76px ${FONT}`;
    const tl = wrap(ctx, title, 960, 2);
    let y = 236;
    tl.forEach(l => { ctx.fillText(l, 60, y); y += 90; });
    ctx.fillStyle = P.soft; ctx.font = `600 34px ${FONT}`;
    ctx.fillText(statsLine(data), 60, y - 26);
    const top = y + 6, footer = 70, quoteH = quote ? 90 : 0, photoH = pics.length ? 330 : 0;
    const mapH = PC_H - top - footer - quoteH - photoH - 10;
    shadowCard(ctx, 60, top, 960, mapH, 44, P.card);
    const mw = 480, mh = Math.round(480 * (mapH - 36) / 924);
    const mimg = await mapImage(data.cs, opt.style, mw, mh, data.trip.id);
    if (mimg) { ctx.save(); rr(ctx, 78, top + 18, 924, mapH - 36, 30); ctx.clip(); ctx.drawImage(mimg, 78, top + 18, 924, mapH - 36); ctx.restore(); }
    else { ctx.fillStyle = P.soft; ctx.font = `600 32px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('這趟旅程還沒有定位資料', PC_W / 2, top + mapH / 2); ctx.textAlign = 'left'; }
    let py = top + mapH + 10;
    if (pics.length) {
      const rot = [-4, 3, -2], w = 270, h = 236, gap = 330;
      const x0 = PC_W / 2 - (pics.length - 1) * gap / 2;
      pics.forEach((img, i) => polaroid(ctx, img, x0 + i * gap, py + photoH / 2 + 6, w, h, rot[i]));
      py += photoH;
    }
    if (quote) {
      ctx.fillStyle = P.ink; ctx.font = `800 38px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText(wrap(ctx, `「${quote}」`, 940, 1)[0], PC_W / 2, py + 58); ctx.textAlign = 'left';
    }
  } else {
    // 照片為主
    const X = 60, Y = 60, Wd = 960, Ht = 740;
    if (pics.length === 1) cover(ctx, pics[0], X, Y, Wd, Ht, 36);
    else if (pics.length === 2) { cover(ctx, pics[0], X, Y, 470, Ht, 36); cover(ctx, pics[1], X + 490, Y, 470, Ht, 36); }
    else { cover(ctx, pics[0], X, Y, 620, Ht, 36); cover(ctx, pics[1], X + 640, Y, 320, 360, 30); cover(ctx, pics[2], X + 640, Y + 380, 320, 360, 30); }
    const by = Y + Ht + 40, ms = 440;
    shadowCard(ctx, 60, by, ms, ms, 40, P.card);
    const mimg = await mapImage(data.cs, opt.style, 360, 360, data.trip.id);
    if (mimg) { ctx.save(); rr(ctx, 76, by + 16, ms - 32, ms - 32, 28); ctx.clip(); ctx.drawImage(mimg, 76, by + 16, ms - 32, ms - 32); ctx.restore(); }
    const tx = 540, tw = 480;
    if (logo) ctx.drawImage(logo, tx, by + 6, 54, 54);
    ctx.fillStyle = P.ink; ctx.font = `800 30px ${FONT}`; ctx.fillText('蜂采', tx + 66, by + 44);
    ctx.font = `800 58px ${FONT}`;
    let y = by + 130;
    wrap(ctx, title, tw, 2).forEach(l => { ctx.fillText(l, tx, y); y += 70; });
    ctx.fillStyle = P.soft; ctx.font = `600 28px ${FONT}`;
    ctx.fillText(dateRange(data.cs), tx, y); y += 44;
    wrap(ctx, statsLine(data), tw, 2).forEach(l => { ctx.fillText(l, tx, y); y += 40; });
    if (quote) {
      y += 20; ctx.fillStyle = P.ink; ctx.font = `800 34px ${FONT}`;
      wrap(ctx, `「${quote}」`, tw, 3).forEach(l => { ctx.fillText(l, tx, y); y += 46; });
    }
  }
  // 頁尾
  ctx.fillStyle = P.deep; ctx.font = `700 26px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText('蜂采 · 飛到哪，甜到哪', PC_W - 60, PC_H - 34); ctx.textAlign = 'left';
  return cv;
}
