// ==========================================================
// 蜂采 一鍵短片（video.js）
// 片頭 → 整張地圖 → 蜜蜂飛到每一站（照片／影片＋錄音）→ 明信片片尾
// 9:16、1080×1920，在手機上即時合成並錄成影片。
// 秒數等設定在 config.js 的 CONFIG.video；顏色來自 theme.css。
// ==========================================================
import { CONFIG } from './config.js';
import { store, isKid, isAdult } from './store.js';
import { adultMapSVG, adultLayout, svgToImage, markerOnlySVG } from './map.js';
import { renderPostcard, dateRange, statsLine, palette, rr, wrap, FONT } from './postcard.js';
import { renderMusic } from './music.js';
import { fmtDate, dayKey } from './ui.js';
import { blobDims } from './media.js';

const V = CONFIG.video;
const CW = V.width, CH = V.height, MW = 360, MH = Math.round(360 * CH / CW), K = CW / MW;
const ZOOM = 1.9;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const back = t => { const c = 1.7; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const shortName = s => String(s || '').replace(/（模擬）/g, '');
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('圖片載入失敗')); i.src = src; });
async function blobImg(b) {
  if (!b) return null;
  try { if (window.createImageBitmap) return await createImageBitmap(b); } catch (e) {}
  try { return await loadImg(URL.createObjectURL(b)); } catch (e) { return null; }
}
function loadVideo(blob) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.setAttribute('playsinline', '');
    let done = false;
    const fin = ok => { if (done) return; done = true; res(ok ? v : null); };
    v.onloadeddata = () => fin(true);
    v.onerror = () => fin(false);
    setTimeout(() => fin(v.readyState >= 2), 8000);
    v.src = URL.createObjectURL(blob);
    v.load();
  });
}
export function pickMime() {
  if (!window.MediaRecorder) return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
}
export const canMakeVideo = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && (window.AudioContext || window.webkitAudioContext));

// ---------- 路線取樣（和地圖上的平滑曲線一致） ----------
function segments(xy) {
  const segs = [];
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, u = 1 - t;
      pts.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0], u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
    }
    segs.push(pts);
  }
  return segs;
}
function along(pts, t) {
  const f = clamp(t, 0, 1) * (pts.length - 1), a = Math.floor(f), b = Math.min(pts.length - 1, a + 1), r = f - a;
  return [lerp(pts[a][0], pts[b][0], r), lerp(pts[a][1], pts[b][1], r)];
}

// ---------- 小元件 ----------
function drawBee(ctx, x, y, s, t, P, flip = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * flip, s);
  const f = 0.55 + 0.45 * Math.abs(Math.sin(t * 28));
  ctx.lineWidth = 1.2; ctx.strokeStyle = P.ink; ctx.fillStyle = 'rgba(255,255,255,.93)';
  for (const sg of [-1, 1]) { ctx.save(); ctx.translate(6 * sg, -7); ctx.rotate(sg * .45); ctx.scale(1, f); ctx.beginPath(); ctx.ellipse(0, 0, 7, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = P.honey; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 9.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.clip(); ctx.fillStyle = P.ink; ctx.fillRect(-9, -3.2, 18, 2.4); ctx.fillRect(-9, 1.8, 18, 2.4); ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, 8, 9.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(0, -10, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawFlower(ctx, x, y, r, color, n, P) {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) { const a = (i * 72 - 90) * Math.PI / 180; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * .72, y + Math.sin(a) * r * .72, r * .56, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#FFF6D0'; ctx.strokeStyle = P.ink; ctx.lineWidth = r * .08;
  ctx.beginPath(); ctx.arc(x, y, r * .52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (n != null) { ctx.fillStyle = P.ink; ctx.font = `800 ${Math.round(r * .62)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), x, y + r * .04); }
  ctx.restore();
}
function hexBg(ctx, P, a = .1) {
  ctx.save(); ctx.strokeStyle = P.deep; ctx.globalAlpha = a; ctx.lineWidth = 4;
  for (let y = -40, row = 0; y < CH + 100; y += 120, row++) for (let x = (row % 2) * 70 - 50; x < CW + 100; x += 140) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const t = Math.PI / 3 * k - Math.PI / 2; ctx[k ? 'lineTo' : 'moveTo'](x + 50 * Math.cos(t), y + 50 * Math.sin(t)); }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}
function coverZoom(ctx, img, z, ox = 0, oy = 0) {
  const iw = img.videoWidth || img.width, ih = img.videoHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(CW / iw, CH / ih) * z, dw = iw * s, dh = ih * s;
  ctx.drawImage(img, (CW - dw) / 2 + ox, (CH - dh) / 2 + oy, dw, dh);
}
function pill(ctx, text, x, y, font, bg, fg, padX = 26, h = 70, align = 'left') {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2, x0 = align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg; rr(ctx, x0, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + w / 2, y + h / 2 + 2);
  return w;
}

// ---------- 每一站放什麼（短片內容頁和製作共用） ----------
export const PER_STOP = 3;
export const isLand = m => !!(m && m.w && m.h && m.w > m.h * 1.15);
// 精選優先，每站最多 3 個；m.vid === true 一定放、=== false 不放
export function selectVisuals(ms) {
  const vis = ms.filter(m => m.kind !== 'audio');
  const sel = vis.filter(m => m.vid === true);
  const auto = vis.filter(m => m.vid == null).sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || a.ts - b.ts);
  for (const m of auto) { if (sel.length >= PER_STOP) break; sel.push(m); }
  return sel.slice(0, PER_STOP).sort((a, b) => a.ts - b.ts);
}
// 錄音：孩子的優先；c.vVoice === false 不放
export function pickVoice(c, ms) {
  if (c.vVoice === false) return null;
  return ms.filter(m => m.kind === 'audio').sort((a, b) => (a.by === 'kid' ? 0 : 1) - (b.by === 'kid' ? 0 : 1) || a.ts - b.ts)[0] || null;
}
// 錄音一律完整播完（最多 30 秒）；選了「只播前 10 秒」才截短
export const voiceLen = (c, au, real) => Math.min(real != null ? real : (au.dur || 5), c.vTrim ? 10 : 30);
// 版型：直拍＝焦點拉遠、橫拍＝平移掃過、card＝完整照片卡、兩張自動橫拍＝上下拼貼
export function layoutItems(c, sel, opt = {}) {
  const out = [], autoLand = [];
  for (const m of sel) {
    if (m.kind === 'video' && opt.clips !== false) { out.push({ m, layout: 'video', dur: Math.min(m.dur || V.clipSec, V.clipSec) }); continue; }
    const auto = !m.layout || m.layout === 'auto';
    const lay = auto ? (isLand(m) ? 'pan' : 'zoom') : m.layout;
    const it = { m, layout: lay, dur: lay === 'pan' ? V.panSec : lay === 'card' ? V.cardSec : V.photoSec };
    if (auto && lay === 'pan') autoLand.push(it);
    out.push(it);
  }
  if (autoLand.length >= 2 && c.vStack !== false) {
    const [a, b] = autoLand;
    a.layout = 'stack'; a.m2 = b.m; a.dur = V.stackSec;
    out.splice(out.indexOf(b), 1);
  }
  return out;
}
export function stopDuration(items, vd) {
  const sum = items.reduce((a, b) => a + b.dur, 0);
  return items.length || vd ? Math.max(sum, vd ? vd + 0.7 : 0, 2.2) : 0;
}

// ---------- 主程式 ----------
// opt: { style, title, music:'bright'|'gentle'|'file'|'none', musicFile, voices, clips, ac }
// ui:  { canvas, onStatus(text), onProgress(ratio, sec, total), isCancelled() }
export async function makeVideo(data, opt, ui) {
  const P = palette();
  const ac = opt.ac;
  ui.onStatus('準備地圖…');
  const svg = adultMapSVG(data.cs, opt.style, MW, MH, data.trip.id, { video: true });
  if (!svg) throw new Error('這趟旅程還沒有定位資料，沒辦法做地圖短片');
  const bgImg = await svgToImage(svg, MW, MH, K, s => s.querySelectorAll('.rt,.pick,.bee,.daypill').forEach(e => e.remove()));
  const flImg = await svgToImage(svg, MW, MH, K, s => [...s.children].forEach(ch => { if (ch.tagName.toLowerCase() !== 'defs' && !ch.classList.contains('pick')) ch.remove(); }));
  const L = adultLayout(data.cs, opt.style, MW, MH);
  // 三種標記的圖：大人花、孩子蜜蜂、一起採蜜
  const mkImg = {};
  for (const [k, c] of [['a', { adult: true, kid: false }], ['k', { adult: false, kid: true }], ['b', { adult: true, kid: true }]]) mkImg[k] = await svgToImage(markerOnlySVG(c), 48, 48, 8).catch(() => null);
  const mkOf = c => mkImg[isKid(c) && isAdult(c) ? 'b' : isKid(c) ? 'k' : 'a'];
  L.segs = segments(L.xy);
  const days = [...new Set(data.cs.map(c => dayKey(c.ts)))];
  const logo = await loadImg('./logo.svg').catch(() => null);

  // 每一站的素材（沒有定位的站也放，只是蜜蜂不會飛過去）
  ui.onStatus('整理照片和錄音…');
  const stops = [];
  const all = [...data.cs].sort((a, b) => a.ts - b.ts);
  for (const c of all) {
    const ms = await store.listMedia(c.id);
    const sel = selectVisuals(ms);
    for (const m of sel) {
      if (!m.w && (m.kind === 'photo' || m.thumb)) { const d = await blobDims(m.kind === 'photo' ? m.blob : m.thumb); if (d) { m.w = d.w; m.h = d.h; store.saveMedia(m); } }
    }
    const items = layoutItems(c, sel, opt);
    for (const it of items) {
      if (it.layout === 'video') {
        const v = await loadVideo(it.m.blob);
        if (v) { it.el = v; it.dur = Math.min(V.clipSec, v.duration || V.clipSec); continue; }
        it.layout = isLand(it.m) ? 'pan' : 'zoom'; it.dur = it.layout === 'pan' ? V.panSec : V.photoSec;
      }
      it.el = await blobImg(it.m.kind === 'photo' ? it.m.blob : it.m.thumb);
      if (it.m2) { it.el2 = await blobImg(it.m2.blob); if (!it.el2) { it.layout = 'pan'; it.dur = V.panSec; } }
    }
    let voice = null;
    if (opt.voices) {
      const au = pickVoice(c, ms);
      if (au) {
        try { const buf = await ac.decodeAudioData(await au.blob.arrayBuffer()); voice = { buf, by: au.by, len: voiceLen(c, au, buf.duration), trim: !!c.vTrim && buf.duration > 10 }; }
        catch (e) { console.warn('錄音解碼失敗', e); }
      }
    }
    stops.push({ c, li: L.pts.indexOf(c), items: items.filter(it => it.el), voice });
  }

  // 排時間軸：照片停留時間固定，不自動縮短
  const scenes = []; let total = 0;
  const push = sc => { sc.start = total; total += sc.d; scenes.push(sc); };
  push({ type: 'intro', d: V.introSec });
  push({ type: 'overview', d: V.overviewSec });
  let prevLoc = -1;
  stops.forEach((st, i) => {
    const dk = L.dayOf(st.c);
    if (L.days.length > 1 && (i === 0 || L.dayOf(stops[i - 1].c) !== dk)) push({ type: 'day', k: dk, c: st.c, d: V.daySec || 1.6 });
    if (st.li >= 0) { push({ type: 'fly', li: st.li, from: prevLoc, d: prevLoc < 0 ? 1.1 : V.flySec }); prevLoc = st.li; }
    const vd = st.voice ? st.voice.len : 0;
    const items = st.items.map(it => ({ ...it }));
    const d = stopDuration(items, vd);
    if (d) {
      const sum = items.reduce((a, b) => a + b.dur, 0);
      if (items.length) { const k = d / sum; let s0 = 0; items.forEach(it => { it.d = it.dur * k; it.s = s0; s0 += it.d; }); }
      push({ type: 'card', i, li: st.li, prog: prevLoc, d, items, vd });
    } else if (st.li >= 0) push({ type: 'pass', i, li: st.li, d: V.passSec });
  });
  push({ type: 'outro', d: V.outroSec });

  // 片尾明信片
  ui.onStatus('準備片尾…');
  const pc = await renderPostcard(data, { template: 'map', style: opt.style, title: opt.title });

  // 音樂
  let music = null;
  if (opt.music === 'file' && opt.musicFile) {
    ui.onStatus('讀取音樂…');
    try { music = await ac.decodeAudioData(await opt.musicFile.arrayBuffer()); } catch (e) { throw new Error('這個音樂檔無法使用，請換一首（建議 mp3 或 m4a）'); }
  } else if (opt.music && opt.music !== 'none') {
    ui.onStatus('作曲中…');
    music = await renderMusic(opt.music, total);
  }

  // ---------- 畫面 ----------
  const cv = ui.canvas; cv.width = CW; cv.height = CH;
  const ctx = cv.getContext('2d');
  const title = (opt.title || data.trip.name || '').trim();
  const playing = new Set();

  function drawMap(cam, prog, bee, t, flip = 1) {
    ctx.save();
    ctx.fillStyle = P.mapBg || P.bg; ctx.fillRect(0, 0, CW, CH);
    const s = K * cam.z;
    const tx = clamp(CW / 2 - cam.x * s, CW - MW * s, 0), ty = clamp(CH / 2 - cam.y * s, CH - MH * s, 0);
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.drawImage(bgImg, 0, 0, MW, MH);
    if (prog > 0 && L.segs.length) {
      ctx.beginPath();
      const full = Math.floor(prog), fr = prog - full;
      ctx.moveTo(L.segs[0][0][0], L.segs[0][0][1]);
      for (let i = 0; i < L.segs.length && i <= full; i++) {
        const seg = L.segs[i];
        if (i < full) seg.forEach(p => ctx.lineTo(p[0], p[1]));
        else if (fr > 0) { const n = Math.floor(fr * (seg.length - 1)); for (let k = 0; k <= n; k++) ctx.lineTo(seg[k][0], seg[k][1]); const p = along(seg, fr); ctx.lineTo(p[0], p[1]); }
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (opt.style === 'cute') { ctx.setLineDash([0.1, 10]); ctx.lineWidth = 5; ctx.strokeStyle = P.routeC || P.petal; }
      else if (opt.style === 'night') { ctx.setLineDash([0.1, 7]); ctx.lineWidth = 3.4; ctx.strokeStyle = P.nightGold || '#E8B84A'; }
      else { ctx.lineWidth = 3.5; ctx.strokeStyle = P.routeN || P.deep; }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.drawImage(flImg, 0, 0, MW, MH);
    if (bee) drawBee(ctx, bee[0], bee[1] - 5, 0.95, t, P, flip);
    ctx.restore();
  }
  const stopXY = i => L.xy[i];
  function nameBanner(c, i, a = 1) {
    ctx.save(); ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 20;
    pill(ctx, shortName(c.placeName), CW / 2, CH - 330, `800 52px ${FONT}`, '#fff', P.ink, 40, 104, 'center');
    ctx.shadowBlur = 0;
    pill(ctx, `${L.days.length > 1 ? `第 ${L.dayOf(c) + 1} 天 · ` : ''}第 ${L.num(c)} 站`, CW / 2, CH - 410, `800 34px ${FONT}`, P.deep, '#fff', 24, 60, 'center');
    ctx.restore();
  }
  function drawIntro(lt) {
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, P.soft2 || '#FFE9A8'); g.addColorStop(1, P.honey);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); hexBg(ctx, P, .12);
    const a = clamp(lt / .7, 0, 1), sc = .35 + .65 * back(a);
    if (logo) { const w = 300 * sc; ctx.drawImage(logo, CW / 2 - w / 2, 640 - w / 2, w, w); }
    const ta = clamp((lt - .5) / .5, 0, 1);
    ctx.save(); ctx.globalAlpha = ta; ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `800 96px ${FONT}`;
    const tl = wrap(ctx, title, 920, 2); let y = 980;
    tl.forEach(l => { ctx.fillText(l, CW / 2, y + (1 - ta) * 30); y += 116; });
    ctx.font = `700 44px ${FONT}`; ctx.fillStyle = P.soft; ctx.fillText(dateRange(data.cs), CW / 2, y + 10);
    ctx.font = `700 40px ${FONT}`; ctx.fillText(statsLine(data), CW / 2, y + 80);
    ctx.restore();
    const bx = lerp(-120, CW + 120, lt / V.introSec), by = 1560 + Math.sin(lt * 4) * 60;
    drawBee(ctx, bx, by, 5, lt, P);
    ctx.save(); ctx.setLineDash([4, 26]); ctx.lineCap = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = P.deep; ctx.globalAlpha = .5;
    ctx.beginPath(); for (let x = -120; x < bx - 60; x += 20) ctx.lineTo(x, 1560 + Math.sin((x + 120) / (CW + 240) * V.introSec * 4) * 60); ctx.stroke(); ctx.restore();
  }
  // 照片畫法：focus 是使用者點的焦點（0–1），焦點一定留在畫面裡
  function drawCover(img, x, y, w, h, z, f) {
    const iw = img.videoWidth || img.width, ih = img.videoHeight || img.height;
    if (!iw || !ih) return;
    const sc = Math.max(w / iw, h / ih) * z, dw = iw * sc, dh = ih * sc;
    const fx = f ? f.x : .5, fy = f ? f.y : .5;
    const ox = clamp(x + w / 2 - fx * dw, x + w - dw, x), oy = clamp(y + h / 2 - fy * dh, y + h - dh, y);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(img, ox, oy, dw, dh);
    ctx.restore();
  }
  function drawPan(img, e, f) {
    const iw = img.width, ih = img.height, sc = CH / ih, dw = iw * sc;
    if (dw <= CW + 4) { drawCover(img, 0, 0, CW, CH, lerp(1.03, 1.1, e), f); return; }
    const minX = CW - dw;
    const end = f ? clamp(CW / 2 - f.x * dw, minX, 0) : minX;
    let start = f ? (f.x > .5 ? 0 : minX) : 0;
    if (Math.abs(start - end) < 60) start = Math.abs(end) < Math.abs(end - minX) ? minX : 0;
    ctx.drawImage(img, lerp(start, end, e), 0, dw, CH);
  }
  function drawPhotoCard(img, e) {
    const g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, P.soft2 || '#FFE9A8'); g.addColorStop(1, P.honey);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); hexBg(ctx, P, .12);
    const iw = img.width, ih = img.height, sc = Math.min((CW - 160) / iw, (CH * .55) / ih), w = iw * sc, h = ih * sc;
    ctx.save(); ctx.translate(CW / 2, CH * .4); ctx.rotate(-.025); const z = .94 + .06 * e; ctx.scale(z, z);
    ctx.shadowColor = 'rgba(60,30,0,.3)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#fff'; rr(ctx, -w / 2 - 22, -h / 2 - 22, w + 44, h + 44, 12); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  function drawItem(it, il, alpha) {
    const p = clamp(il / (it.d || it.dur), 0, 1), e = ease(p), f = it.m.focus;
    ctx.save(); ctx.globalAlpha = alpha;
    if (it.layout === 'video') {
      if (!playing.has(it.el)) { playing.add(it.el); try { it.el.currentTime = 0; it.el.play().catch(() => {}); } catch (er) {} }
      drawCover(it.el, 0, 0, CW, CH, 1, f);
    } else if (it.layout === 'zoom') {
      if (f) drawCover(it.el, 0, 0, CW, CH, lerp(1.5, 1.0, e), f);
      else drawCover(it.el, 0, 0, CW, CH, lerp(1.03, 1.12, p), null);
    } else if (it.layout === 'pan') drawPan(it.el, e, f);
    else if (it.layout === 'card') drawPhotoCard(it.el, e);
    else if (it.layout === 'stack') {
      const h = CH / 2 - 8;
      drawCover(it.el, 0, 0, CW, h, f ? lerp(1.25, 1.0, e) : lerp(1.02, 1.08, p), f);
      drawCover(it.el2, 0, CH / 2 + 8, CW, h, it.m2.focus ? lerp(1.25, 1.0, e) : lerp(1.08, 1.02, p), it.m2.focus);
      ctx.fillStyle = P.honey; ctx.fillRect(0, CH / 2 - 8, CW, 16);
    }
    ctx.restore();
  }
  function drawCard(s, lt) {
    const st = stops[s.i], c = st.c;
    ctx.fillStyle = '#1b1208'; ctx.fillRect(0, 0, CW, CH);
    if (s.items.length) {
      const idx = Math.max(0, s.items.findIndex(it => lt >= it.s && lt < it.s + it.d));
      const cur = s.items[lt >= s.d ? s.items.length - 1 : idx];
      drawItem(cur, lt - cur.s, 1);
      const ni = s.items.indexOf(cur) + 1;
      if (ni < s.items.length && lt > cur.s + cur.d - .35) drawItem(s.items[ni], 0, clamp((lt - (cur.s + cur.d - .35)) / .35, 0, 1));
      s.items.forEach(it => { if (it.layout === 'video' && it !== cur && playing.has(it.el) && lt > it.s + it.d) it.el.pause(); });
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, P.soft2 || '#FFE9A8'); g.addColorStop(1, P.honey);
      ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); hexBg(ctx, P, .12);
      const im = mkOf(c); if (im) ctx.drawImage(im, CW / 2 - 260, 760 - 260, 520, 520);
      drawBee(ctx, CW / 2 + 190, 560 + Math.sin(lt * 3) * 20, 6, lt, P);
    }
    // 下方文字
    const g = ctx.createLinearGradient(0, CH - 820, 0, CH);
    g.addColorStop(0, 'rgba(20,12,2,0)'); g.addColorStop(1, 'rgba(20,12,2,.78)');
    ctx.fillStyle = g; ctx.fillRect(0, CH - 820, CW, 820);
    const a = clamp(lt / .5, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    { const im = mkOf(c); if (im) ctx.drawImage(im, 52, CH - 492, 120, 120); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.honey; ctx.font = `800 40px ${FONT}`;
    ctx.fillText(`${L.days.length > 1 ? `第 ${L.dayOf(c) + 1} 天 · ` : ''}第 ${L.num(c)} 站 · ${fmtDate(c.ts).replace(/ 週.$/, '')}`, 182, CH - 418);
    ctx.fillStyle = '#fff'; ctx.font = `800 84px ${FONT}`;
    let y = CH - 300;
    wrap(ctx, shortName(c.placeName), CW - 140, 2).forEach(l => { ctx.fillText(l, 70, y); y += 100; });
    if (isKid(c)) pill(ctx, isAdult(c) ? '和小小打卡官一起打卡' : '小小打卡官蓋的章', 70, CH - 560, `800 34px ${FONT}`, P.petal, '#fff', 24, 60);
    if (s.vd && lt > .3 && lt < .3 + s.vd) {
      const lvl = 0.5 + 0.5 * Math.abs(Math.sin(lt * 9));
      ctx.fillStyle = 'rgba(255,255,255,.92)'; rr(ctx, CW - 330, 120, 260, 84, 42); ctx.fill();
      ctx.fillStyle = P.ink; ctx.font = `800 34px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(st.voice.by === 'kid' ? '孩子說…' : '現場聲音', CW - 300, 163);
      ctx.fillStyle = P.petal;
      for (let k = 0; k < 4; k++) { const h = 14 + 30 * Math.abs(Math.sin(lt * 9 + k * 1.3)) * lvl; rr(ctx, CW - 136 + k * 14, 162 - h / 2, 8, h, 4); ctx.fill(); }
    }
    ctx.restore();
  }
  function drawDay(s, lt) {
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, P.soft2 || '#FFE9A8'); g.addColorStop(1, P.honey);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); hexBg(ctx, P, .12);
    const a = clamp(lt / .4, 0, 1), sc = .85 + .15 * back(clamp(lt / .6, 0, 1));
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.translate(CW / 2, 880); ctx.scale(sc, sc);
    ctx.fillStyle = P.ink; ctx.font = `800 170px ${FONT}`; ctx.fillText(`第 ${s.k + 1} 天`, 0, 0);
    ctx.fillStyle = P.soft; ctx.font = `700 54px ${FONT}`; ctx.fillText(fmtDate(s.c.ts), 0, 100);
    ctx.restore();
    const todays = stops.filter(st => L.dayOf(st.c) === s.k).slice(0, 6);
    const w = 130, x0 = CW / 2 - (todays.length - 1) * w / 2;
    todays.forEach((st, j) => {
      const t = clamp((lt - .3 - j * .12) / .3, 0, 1), im = mkOf(st.c);
      if (im && t > 0) { const z = 110 * back(t); ctx.save(); ctx.globalAlpha = t; ctx.drawImage(im, x0 + j * w - z / 2, 1180 - z / 2, z, z); ctx.restore(); }
    });
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.font = `700 44px ${FONT}`;
    ctx.fillText(`今天去了 ${stops.filter(st => L.dayOf(st.c) === s.k).length} 個地方`, CW / 2, 1340); ctx.restore();
  }
  function drawOutro(lt) {
    const last = L.xy[L.xy.length - 1], k = ease(clamp(lt / 1.4, 0, 1));
    drawMap({ x: lerp(last[0], MW / 2, k), y: lerp(last[1], MH / 2, k), z: lerp(ZOOM, 1, k) }, L.segs.length, last, lt);
    if (lt > 1.2) {
      const a = clamp((lt - 1.2) / .6, 0, 1);
      ctx.save(); ctx.fillStyle = `rgba(43,27,10,${.5 * a})`; ctx.fillRect(0, 0, CW, CH);
      const w = 900, h = 1125, sc = .9 + .1 * ease(a);
      ctx.translate(CW / 2, 230 + h / 2); ctx.scale(sc, sc); ctx.globalAlpha = a;
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
      ctx.fillStyle = '#fff'; rr(ctx, -w / 2 - 16, -h / 2 - 16, w + 32, h + 32, 30); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.drawImage(pc, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `800 52px ${FONT}`;
      ctx.fillText(V.tagline, CW / 2, 1560);
      ctx.restore();
    }
  }
  function drawFrame(e) {
    let s = scenes.find(x => e >= x.start && e < x.start + x.d) || scenes[scenes.length - 1];
    const lt = Math.min(e - s.start, s.d), p = lt / s.d;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
    if (s.type === 'intro') drawIntro(lt);
    else if (s.type === 'overview') {
      drawMap({ x: MW / 2, y: MH / 2, z: 1 }, 0, null, e);
      ctx.save(); ctx.globalAlpha = clamp(lt / .4, 0, 1);
      pill(ctx, `${L.pts.length} 個地點，出發！`, CW / 2, 150, `800 52px ${FONT}`, '#fff', P.ink, 44, 104, 'center');
      ctx.restore();
    } else if (s.type === 'fly') {
      const k = ease(p);
      if (s.from < 0) {
        const to = stopXY(s.li), from = [to[0], MH + 40];
        const b = [lerp(from[0], to[0], k), lerp(from[1], to[1], k)];
        drawMap({ x: lerp(MW / 2, to[0], k), y: lerp(MH / 2, to[1], k), z: lerp(1, ZOOM, k) }, Math.max(0, s.li), b, e);
      } else {
        const seg = L.segs[s.li - 1], b = along(seg, k), b2 = along(seg, Math.min(1, k + .02));
        drawMap({ x: b[0], y: b[1], z: ZOOM }, s.li - 1 + k, b, e, b2[0] < b[0] ? -1 : 1);
      }
    } else if (s.type === 'pass') {
      const q = stopXY(s.li);
      drawMap({ x: q[0], y: q[1], z: ZOOM }, s.li, [q[0], q[1] - 8 + Math.sin(e * 5) * 3], e);
      nameBanner(stops[s.i].c, s.i, clamp(lt / .3, 0, 1));
    } else if (s.type === 'card') {
      if (lt < .4) {
        if (s.li >= 0) { const q = stopXY(s.li); drawMap({ x: q[0], y: q[1], z: ZOOM }, s.li, q, e); }
        else { const g = ctx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, P.soft2 || '#FFE9A8'); g.addColorStop(1, P.honey); ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH); }
      }
      ctx.save(); ctx.globalAlpha = clamp(lt / .4, 0, 1); drawCard(s, lt); ctx.restore();
    } else if (s.type === 'day') drawDay(s, lt);
    else if (s.type === 'outro') drawOutro(lt);
  }

  // ---------- 錄製 ----------
  ui.onStatus('製作中…');
  drawFrame(0);
  const dest = ac.createMediaStreamDestination();
  const mg = ac.createGain(); mg.connect(dest);
  const vg = ac.createGain(); vg.gain.value = 1; vg.connect(dest);
  if (opt.monitor) { mg.connect(ac.destination); vg.connect(ac.destination); }
  const vstream = cv.captureStream(V.fps);
  const tracks = [...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()];
  const mime = pickMime();
  const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 128000 } : undefined);
  const chunks = [];
  rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const stopped = new Promise(r => { rec.onstop = r; });
  rec.start(1000);
  const t0 = ac.currentTime + 0.3;
  const sources = [];
  const MV = 0.9, DUCK = 0.22;
  if (music) {
    const src = ac.createBufferSource(); src.buffer = music; src.connect(mg);
    src.loop = music.duration < total;
    mg.gain.setValueAtTime(MV, t0);
    src.start(t0); src.stop(t0 + total + 0.2); sources.push(src);
  }
  scenes.filter(s => s.type === 'card' && s.vd).forEach(s => {
    const at = t0 + s.start + 0.3, src = ac.createBufferSource(), vgn = ac.createGain(), v = stops[s.i].voice;
    src.buffer = v.buf; src.connect(vgn); vgn.connect(vg);
    if (v.trim) { vgn.gain.setValueAtTime(1, at + s.vd - 0.6); vgn.gain.linearRampToValueAtTime(0.0001, at + s.vd); }
    src.start(at, 0, s.vd + 0.05); sources.push(src);
    mg.gain.setTargetAtTime(DUCK, at - 0.2, 0.08);
    mg.gain.setTargetAtTime(MV, at + s.vd + 0.1, 0.25);
  });
  if (music) { mg.gain.setValueAtTime(MV, t0 + total - 2.2); mg.gain.linearRampToValueAtTime(0.0001, t0 + total); }

  let cancelled = false;
  await new Promise(resolve => {
    const step = () => {
      if (ui.isCancelled()) { cancelled = true; resolve(); return; }
      const e = ac.currentTime - t0;
      drawFrame(clamp(e, 0, total));
      ui.onProgress(clamp(e / total, 0, 1), Math.max(0, e), total);
      if (e >= total + 0.2) { resolve(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  sources.forEach(s => { try { s.stop(); } catch (e) {} });
  rec.stop(); await stopped;
  tracks.forEach(t => t.stop());
  stops.forEach(st => st.items.forEach(it => { if (it.layout === 'video' && it.el.pause) { it.el.pause(); URL.revokeObjectURL(it.el.src); } }));
  if (cancelled) return null;
  const type = (rec.mimeType || mime || 'video/mp4').split(';')[0];
  return { blob: new Blob(chunks, { type }), type, total };
}

// 預估長度（不載入素材，大約值）
export async function estimate(data, opt) {
  const L = adultLayout(data.cs, opt.style, MW, MH);
  let t = V.introSec + V.overviewSec + V.outroSec + (L.days.length > 1 ? L.days.length * (V.daySec || 1.6) : 0), prev = false;
  const all = [...data.cs].sort((a, b) => a.ts - b.ts);
  for (const c of all) {
    const ms = await store.listMedia(c.id);
    const items = layoutItems(c, selectVisuals(ms), opt);
    const au = opt.voices ? pickVoice(c, ms) : null;
    const located = c.lat != null;
    if (located) { t += prev ? V.flySec : 1.1; prev = true; }
    t += stopDuration(items, au ? voiceLen(c, au) : 0) || (located ? V.passSec : 0);
  }
  return { sec: Math.round(t), stops: all.length };
}
