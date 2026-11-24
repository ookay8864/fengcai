// ==========================================================
// 蜂采 地圖（map.js）
// - 有高德金鑰：顯示真實城市地圖 + 小花（正常版／可愛版底圖）
// - 沒有金鑰或載入失敗：顯示蜂采自己畫的插畫地圖
// - 兒童版：花園地圖，雲朵覆蓋，每蓋一個章點亮一塊
// 顏色都來自 theme.css 的 --map-* 變數
// ==========================================================
import { CONFIG, getSetting } from './config.js';
import { loadAMap, mapProvider, inMainland, peekPosition, wgs2gcj } from './geo.js';
import { esc, dayKey } from './ui.js';
import { ITEMS } from './themes.js';
import { isKid, isAdult } from './store.js';

const f1 = n => (Math.round(n * 10) / 10).toString();
const shortName = s => { const t = String(s || '').replace(/（模擬）/g, ''); return t.length > 8 ? t.slice(0, 7) + '…' : t; };
let seq = 0;

// ---------- 可重現的亂數（同一趟旅程每次畫出一樣的風景） ----------
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

// ---------- 把經緯度投影到畫面上 ----------
export function project(pts, W, H, pad, minGap = 24) {
  if (!pts.length) return { xy: [], s: 0 };
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const k = Math.cos(lat0 * Math.PI / 180);
  const xs = pts.map(p => p.lng * k), ys = pts.map(p => p.lat);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const sx = Math.max(maxx - minx, 1e-6), sy = Math.max(maxy - miny, 1e-6);
  let s = Math.min((W - 2 * pad) / sx, (H - 2 * pad) / sy);
  s = Math.min(s, 400000); // 太集中時不要放大到誇張（約 1 公尺 = 3.6px）
  const ox = (W - sx * s) / 2, oy = (H - sy * s) / 2;
  const xy = pts.map((p, j) => [ox + (xs[j] - minx) * s, H - (oy + (ys[j] - miny) * s)]);
  // 太靠近的點，用螺旋方式找一個不重疊的位置
  const placed = [];
  xy.forEach(q => {
    const [x0, y0] = q;
    for (let t = 0; t < 60; t++) {
      const free = placed.every(o => Math.hypot(o[0] - q[0], o[1] - q[1]) >= minGap);
      if (free) break;
      const rad = minGap * (0.6 + t * 0.12), ang = t * 2.4;
      q[0] = Math.min(W - pad / 2, Math.max(pad / 2, x0 + Math.cos(ang) * rad));
      q[1] = Math.min(H - pad / 2, Math.max(pad / 2, y0 + Math.sin(ang) * rad));
    }
    placed.push(q);
  });
  return { xy, s };
}

// 經過每個點的平滑曲線
function smooth(xy) {
  if (xy.length < 2) return '';
  let d = `M${f1(xy[0][0])},${f1(xy[0][1])}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] || xy[i], p1 = xy[i], p2 = xy[i + 1], p3 = xy[i + 2] || p2;
    d += ` C${f1(p1[0] + (p2[0] - p0[0]) / 6)},${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)},${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}

// ---------- 打卡標記：花＝大人、蜜蜂＝孩子、蜜蜂採花＝一起 ----------
// 之後換風格：改這一段的圖形；顏色在 theme.css 的 --mk-* 變數
const BEE = `<g class="bee-g"><ellipse cx="-6" cy="-7" rx="7" ry="4.5" transform="rotate(-25 -6 -7)" class="bee-w"/><ellipse cx="6" cy="-7" rx="7" ry="4.5" transform="rotate(25 6 -7)" class="bee-w"/><ellipse cx="0" cy="0" rx="8" ry="9.5" class="bee-b"/><path d="M-7.5 -2h15M-7.5 3h15" class="bee-s"/><circle cx="0" cy="-10" r="4.5" class="bee-h"/></g>`;
// 花的造型：flower 圓瓣花（預設）、sakura 櫻花瓣、clover 四葉草
// 明信片換配色時會換造型；中心圓（mk-center）位置不變，號碼一樣放在中間
let SHAPE = 'flower';
export const SHAPES = { honey: 'flower', sakura: 'sakura', mint: 'clover', night: 'flower' };
function withShape(shape, fn) { const old = SHAPE; SHAPE = shape || 'flower'; try { return fn(); } finally { SHAPE = old; } }
const centerOf = (x, y, r) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * .5)}" class="mk-center"/><circle cx="${f1(x - r * .15)}" cy="${f1(y - r * .15)}" r="${f1(r * .14)}" class="mk-hi"/>`;
function sakuraShape(x, y, r) {
  const p = `M0 0C${f1(-.62 * r)} ${f1(-.3 * r)} ${f1(-.72 * r)} ${f1(-1.05 * r)} ${f1(-.24 * r)} ${f1(-1.32 * r)}L0 ${f1(-1.1 * r)}L${f1(.24 * r)} ${f1(-1.32 * r)}C${f1(.72 * r)} ${f1(-1.05 * r)} ${f1(.62 * r)} ${f1(-.3 * r)} 0 0Z`;
  const petals = [0, 72, 144, 216, 288].map(a => `<path d="${p}" transform="translate(${f1(x)} ${f1(y)}) rotate(${a})" class="mk-petal mk-edge"/>`).join('');
  return petals + centerOf(x, y, r);
}
function cloverShape(x, y, r) {
  const p = `M0 0C${f1(-.22 * r)} ${f1(-.22 * r)} ${f1(-.9 * r)} ${f1(-.5 * r)} ${f1(-.66 * r)} ${f1(-1.02 * r)}C${f1(-.48 * r)} ${f1(-1.36 * r)} ${f1(-.06 * r)} ${f1(-1.28 * r)} 0 ${f1(-.94 * r)}C${f1(.06 * r)} ${f1(-1.28 * r)} ${f1(.48 * r)} ${f1(-1.36 * r)} ${f1(.66 * r)} ${f1(-1.02 * r)}C${f1(.9 * r)} ${f1(-.5 * r)} ${f1(.22 * r)} ${f1(-.22 * r)} 0 0Z`;
  const stem = `<path d="M${f1(x)} ${f1(y)}Q${f1(x + .3 * r)} ${f1(y + 1.05 * r)} ${f1(x + 1.02 * r)} ${f1(y + 1.22 * r)}" class="mk-stem" style="stroke-width:${f1(r * .16)}"/>`;
  const leaves = [45, 135, 225, 315].map(a => `<path d="${p}" transform="translate(${f1(x)} ${f1(y)}) rotate(${a})" class="mk-petal mk-edge"/>`).join('');
  return stem + leaves + centerOf(x, y, r);
}
function flowerShape(x, y, r) {
  if (SHAPE === 'sakura') return sakuraShape(x, y, r);
  if (SHAPE === 'clover') return cloverShape(x, y, r);
  const petals = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 72 - 90) * Math.PI / 180;
    return `<circle cx="${f1(x + Math.cos(a) * r * .72)}" cy="${f1(y + Math.sin(a) * r * .72)}" r="${f1(r * .56)}" class="mk-petal"/>`;
  }).join('');
  return `${petals}<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * .5)}" class="mk-center"/><circle cx="${f1(x - r * .15)}" cy="${f1(y - r * .15)}" r="${f1(r * .14)}" class="mk-hi"/>`;
}
// photo：照片網址（data:），放進花心或蜜蜂的圓圈裡
export function markerSVG(x, y, c, num, s = 1, cls = '', photo = null, numStyle = 'badge') {
  const kid = isKid(c), adult = isAdult(c);
  let g = '';
  if (photo) {
    const id = `ph${++seq}`, pr = (adult ? 9.6 : 11.5) * s;
    if (adult) g += flowerShape(x, y, 15 * s).replace(/class="mk-center"/, 'class="mk-photo-ring"').replace(/<circle[^>]*class="mk-hi"\/>/, '');
    else g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(pr + 2.6 * s)}" class="mk-kidring"/>`;
    g += `<clipPath id="${id}"><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(pr)}"/></clipPath><image href="${photo}" x="${f1(x - pr)}" y="${f1(y - pr)}" width="${f1(pr * 2)}" height="${f1(pr * 2)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(pr)}" class="mk-photo-edge"/>`;
    if (kid) g += `<g transform="translate(${f1(x + 11 * s)} ${f1(y - 11 * s)}) scale(${f1(.62 * s)})">${BEE}</g>`;
    return `<g class="mk ${cls}" style="transform-origin:${f1(x)}px ${f1(y)}px">${g}</g>`;
  }
  if (numStyle === 'center' && num != null) {
    // 號碼放在花心（明信片用）：大人＝花、一起＝花＋蜜蜂、孩子＝蜜蜂＋號碼章
    if (adult) {
      g += flowerShape(x, y, 14 * s).replace(/<circle[^>]*class="mk-hi"\/>/, '').replace(/r="([\d.]+)" class="mk-center"/, `r="${f1(7.6 * s)}" class="mk-center-num"`);
      g += `<text x="${f1(x)}" y="${f1(y)}" dy=".36em" class="mk-num" style="font-size:${f1((String(num).length > 1 ? 8.4 : 10) * s)}px">${num}</text>`;
      if (kid) g += `<g transform="translate(${f1(x + 12 * s)} ${f1(y - 12 * s)}) scale(${f1(.62 * s)})">${BEE}</g>`;
    } else {
      g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(14 * s)}" class="mk-kidbg"/><g transform="translate(${f1(x)} ${f1(y + 2 * s)}) scale(${f1(1.05 * s)})">${BEE}</g>`;
      g += `<circle cx="${f1(x + 11 * s)}" cy="${f1(y + 11 * s)}" r="${f1(7.2 * s)}" class="mk-badge"/><text x="${f1(x + 11 * s)}" y="${f1(y + 11 * s)}" dy=".36em" class="mk-num" style="font-size:${f1(8.4 * s)}px">${num}</text>`;
    }
    return `<g class="mk ${cls}" style="transform-origin:${f1(x)}px ${f1(y)}px">${g}</g>`;
  }
  if (adult) g += flowerShape(x, y, 12 * s);
  if (kid && !adult) g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(14 * s)}" class="mk-kidbg"/><g transform="translate(${f1(x)} ${f1(y + 2 * s)}) scale(${f1(1.05 * s)})">${BEE}</g>`;
  if (kid && adult) g += `<g transform="translate(${f1(x + 3 * s)} ${f1(y - 6 * s)}) scale(${f1(.8 * s)})">${BEE}</g>`;
  if (num != null) g += `<circle cx="${f1(x + 11 * s)}" cy="${f1(y + 11 * s)}" r="${f1(6.8 * s)}" class="mk-badge"/><text x="${f1(x + 11 * s)}" y="${f1(y + 11 * s)}" dy=".36em" class="mk-num" style="font-size:${f1(8.4 * s)}px">${num}</text>`;
  return `<g class="mk ${cls}" style="transform-origin:${f1(x)}px ${f1(y)}px">${g}</g>`;
}
export const whoText = c => (isKid(c) && isAdult(c) ? '一起' : isKid(c) ? '孩子' : '大人');
// 舊介面：花園以外的地方曾用過，保留名稱
export const flower = (x, y, color, n, r = 12, cls = '') => markerSVG(x, y, { kid: false, adult: true }, n, r / 12, cls);

// ---------- 天數：每天從 1 開始編號 ----------
export function dayInfo(checkins) {
  const list = [...checkins].sort((a, b) => a.ts - b.ts);
  const days = [...new Set(list.map(c => dayKey(c.ts)))];
  const num = new Map();
  days.forEach(d => list.filter(c => dayKey(c.ts) === d).forEach((c, i) => num.set(c.id, i + 1)));
  return { days, dayOf: c => Math.max(0, days.indexOf(dayKey(c.ts))), num: c => num.get(c.id) };
}
export function defaultDay(info) {
  const t = info.days.indexOf(dayKey(Date.now()));
  return t >= 0 ? t : info.days.length - 1;
}

// ---------- 插畫裝飾 ----------
function decor(R, W, H, avoid, count, kinds) {
  const out = [];
  for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
    const x = 12 + R() * (W - 24), y = 12 + R() * (H - 24);
    if (avoid.some(([ax, ay]) => Math.hypot(ax - x, ay - y) < 30)) continue;
    const kind = kinds[Math.floor(R() * kinds.length)], sc = 0.8 + R() * 0.6;
    const svg = kind === 'cloud' ? '<ellipse rx="14" ry="7" class="d-cloud"/><ellipse cx="-8" cy="-4" rx="8" ry="6" class="d-cloud"/><ellipse cx="7" cy="-5" rx="9" ry="7" class="d-cloud"/>' : (ITEMS[kind]?.svg || '');
    out.push(`<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(sc)})">${svg}</g>`);
    i++;
  }
  return out.join('');
}

function scaleBar(s, W, H) {
  if (!s) return '';
  const pxPerM = s / 111320;
  const nice = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
  const m = nice.find(v => v * pxPerM >= 50) || nice[nice.length - 1];
  const w = m * pxPerM;
  if (w > W * .6) return '';
  const label = m >= 1000 ? `${m / 1000} 公里` : `${m} 公尺`;
  return `<g transform="translate(14 ${H - 16})"><path d="M0 -5 V0 H${f1(w)} V-5" class="m-scale"/><text x="${f1(w / 2)}" y="-8" class="m-small" text-anchor="middle">${label}</text></g>`;
}

// ---------- 插畫地圖（大人版：正常／可愛） ----------
// view: { day: 天的索引或 null（全部）, video: 短片用（全部標號碼、不標天數） }
// 夜空版：星星（避開標記）與指北針
function stars(R, W, H, xy) {
  let g = '';
  for (let i = 0; i < Math.round(W * H / 2600); i++) {
    const x = R() * W, y = R() * H;
    if (xy.some(([px, py]) => Math.abs(px - x) < 22 && Math.abs(py - y) < 22)) continue;
    const big = R() < 0.12;
    g += big ? `<path d="M${f1(x)} ${f1(y - 3.2)}L${f1(x + .9)} ${f1(y - .9)}L${f1(x + 3.2)} ${f1(y)}L${f1(x + .9)} ${f1(y + .9)}L${f1(x)} ${f1(y + 3.2)}L${f1(x - .9)} ${f1(y + .9)}L${f1(x - 3.2)} ${f1(y)}L${f1(x - .9)} ${f1(y - .9)}Z" class="m-star"/>`
      : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(.5 + R() * .8)}" class="m-star" style="opacity:${f1(.3 + R() * .5)}"/>`;
  }
  return g;
}
const compass = (W, s, H) => `<g transform="translate(${W - 22} 24)"><path d="M0 -12 L5 4 L0 0 L-5 4 Z" class="m-compass"/><text y="17" class="m-small" text-anchor="middle">北</text></g>${scaleBar(s, W, H)}`;

function svgAdult(pts, info, style, W, H, seed, view = {}) {
  return withShape(view.shape, () => svgAdultInner(pts, info, style, W, H, seed, view));
}
function svgAdultInner(pts, info, style, W, H, seed, view) {
  const id = `m${++seq}`;
  const cute = style === 'cute', night = style === 'night';
  const { xy, s } = project(pts, W, H, 42, view.tags ? 36 : cute ? 32 : 28);
  const R = rng(seed);
  const sel = view.day == null ? null : view.day;
  const all = sel == null && !view.video;
  const on = i => sel == null || info.dayOf(pts[i]) === sel;
  const route = smooth(xy.filter((_, i) => on(i)));
  const bg = cute
    ? `<defs><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--meadow-1)"/><stop offset="1" style="stop-color:var(--meadow-2)"/></linearGradient></defs>
       <rect width="${W}" height="${H}" fill="url(#${id}bg)"/>${decor(R, W, H, xy, 22, ['tree', 'tree', 'bush', 'grass', 'grass', 'dots', 'dots', 'pond', 'hill', 'cloud'])}`
    : night
    ? `<rect width="${W}" height="${H}" class="m-bg"/>${stars(R, W, H, xy)}${compass(W, s, H)}`
    : `<defs><pattern id="${id}g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" class="m-grid"/></pattern></defs>
       <rect width="${W}" height="${H}" class="m-bg"/><rect width="${W}" height="${H}" fill="url(#${id}g)"/>
       ${compass(W, s, H)}`;
  const routeSvg = route ? `<mask id="${id}mk"><path d="${route}" class="route-mask" stroke-width="16"/></mask>
       <path d="${route}" class="${cute ? 'route-cute' : night ? 'route-normal route-night' : 'route-normal'}${all ? ' route-soft' : ''}" mask="url(#${id}mk)"/>` : '';
  // 地名：只在看某一天時標，放在標記的下、上、右、左，放不下就省略
  const boxes = xy.filter((_, i) => on(i)).map(([x, y]) => [x - 15, y - 15, x + 19, y + 19]);
  const hit = b => boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) || b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2;
  // tags 模式（明信片用）：每個標記寫「天-站 地名」，放不下就只寫「天-站」
  const tagOf = c => (info.days.length > 1 ? `${info.dayOf(c) + 1}-${info.num(c)}` : `${info.num(c)}`);
  const R0 = view.tags ? 19 : 15;
  if (view.tags) boxes.splice(0, boxes.length, ...xy.map(([x, y]) => [x - R0, y - R0, x + R0, y + R0]));
  const place = (x, y, text, cw, r) => {
    const w = text.length * cw + 6;
    const spots = [[x, y + r + 14, 'middle', [x - w / 2, y + r + 3, x + w / 2, y + r + 17]], [x + r + 3, y + 4, 'start', [x + r + 2, y - 7, x + r + 2 + w, y + 7]], [x - r - 3, y + 4, 'end', [x - r - 2 - w, y - 7, x - r - 2, y + 7]], [x, y - r - 5, 'middle', [x - w / 2, y - r - 17, x + w / 2, y - r - 3]]];
    return spots.find(p => !hit(p[3]));
  };
  const labels = pts.map((c, i) => {
    const [x, y] = xy[i];
    if (view.tags) {
      // 號碼已經在花心裡；旁邊放得下才寫地名
      const name = shortName(c.placeName);
      const sp = place(x, y, name, 10.5, R0 + 1);
      if (!sp) return '';
      boxes.push(sp[3]);
      return `<text x="${f1(sp[0])}" y="${f1(sp[1])}" class="m-label" text-anchor="${sp[2]}">${esc(name)}</text>`;
    }
    if (cute || sel == null || !on(i)) return '';
    const name = shortName(c.placeName), w = name.length * 10.5 + 4;
    const spots = [[x, y + 29, 'middle', [x - w / 2, y + 19, x + w / 2, y + 32]], [x, y - 20, 'middle', [x - w / 2, y - 31, x + w / 2, y - 17]], [x + 21, y + 4, 'start', [x + 20, y - 7, x + 20 + w, y + 7]], [x - 18, y + 4, 'end', [x - 17 - w, y - 7, x - 17, y + 7]]];
    const sp = spots.find(p => !hit(p[3]));
    if (!sp) return '';
    boxes.push(sp[3]);
    return `<text x="${f1(sp[0])}" y="${f1(sp[1])}" class="m-label" text-anchor="${sp[2]}">${esc(name)}</text>`;
  });
  const sc = cute ? 1.2 : 1;
  const mk = i => {
    const c = pts[i], [x, y] = xy[i], faded = !on(i);
    const glow = night && !faded ? `<circle cx="${f1(x)}" cy="${f1(y)}" r="${view.tags ? 24 : 20}" class="m-glow"/>` : '';
    if (view.tags) return `<g class="pick" data-id="${c.id}">${glow}${markerSVG(x, y, c, view.order ? view.order[c.id] : info.num(c), 1.15, '', null, 'center')}${labels[i]}</g>`;
    const n = view.video || (sel != null && !faded) ? info.num(c) : null;
    return `<g class="pick${faded ? ' faded' : ''}" data-id="${c.id}">${glow}${markerSVG(x, y, c, n, sc, !faded && cute ? 'bob' : '')}${labels[i]}</g>`;
  };
  const faded = pts.map((_, i) => (on(i) ? '' : mk(i))).join(''), active = pts.map((_, i) => (on(i) ? mk(i) : '')).join('');
  // 「全部」：每天的區域旁標「第 N 天」
  const pillBoxes = [];
  const pills = all && !view.tags && !view.noPills ? info.days.map((d, k) => {
    const idx = pts.map((c, i) => (info.dayOf(c) === k ? i : -1)).filter(i => i >= 0);
    if (!idx.length) return '';
    const mx = idx.reduce((a, i) => a + xy[i][0], 0) / idx.length, my = idx.reduce((a, i) => a + xy[i][1], 0) / idx.length;
    const ys = idx.map(i => xy[i][1]), xs = idx.map(i => xy[i][0]);
    const cand = [[mx, Math.max(...ys) + 32], [mx, Math.min(...ys) - 32], [Math.max(...xs) + 50, my], [Math.min(...xs) - 50, my]];
    const free = ([x, y]) => x > 30 && x < W - 30 && y > 12 && y < H - 12 && xy.every(([px, py]) => Math.abs(px - x) > 44 || Math.abs(py - y) > 26) && pillBoxes.every(([qx, qy]) => Math.abs(qx - x) > 60 || Math.abs(qy - y) > 22);
    let [cx, cy] = cand.find(free) || cand[0];
    cx = Math.min(W - 32, Math.max(32, cx)); cy = Math.min(H - 12, Math.max(12, cy));
    pillBoxes.push([cx, cy]);
    return `<g class="daypill" data-day="${k}"><rect x="${f1(cx - 28)}" y="${f1(cy - 10)}" width="56" height="20" rx="10" class="m-daypill"/><text x="${f1(cx)}" y="${f1(cy)}" dy=".35em" text-anchor="middle" class="m-daytext">第 ${k + 1} 天</text></g>`;
  }).join('') : '';
  return `<svg viewBox="0 0 ${W} ${H}" class="mapsvg ${cute ? 'cute' : night ? 'normal night' : 'normal'}${view.pal ? ' pal-' + view.pal : ''}" role="img" aria-label="採蜜地圖，共 ${pts.length} 個地點">
    ${bg}<g class="rt">${routeSvg}</g>${faded}${pills}${active}<g class="bee" transform="translate(-50 -50)">${BEE}</g></svg>`;
}

// 連起來：路線慢慢畫出來，蜜蜂沿路飛
function animateRoute(svg, done) {
  const vis = svg.querySelector('.route-normal,.route-cute'), mk = svg.querySelector('.route-mask'), bee = svg.querySelector('.bee');
  if (!vis || !mk) return null;
  const L = vis.getTotalLength();
  mk.style.strokeDasharray = `${L} ${L}`;
  const n = svg.querySelectorAll('.pick:not(.faded)').length;
  const dur = Math.min(7000, 1200 + n * 450);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t0 = null, raf = 0;
  const step = ts => {
    if (t0 == null) t0 = ts;
    const t = reduce ? 1 : Math.min(1, (ts - t0) / dur);
    const e = t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    mk.style.strokeDashoffset = String(L * (1 - e));
    const p = vis.getPointAtLength(L * e), q = vis.getPointAtLength(Math.min(L, L * e + 1));
    const flip = q.x < p.x ? -1 : 1;
    bee.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y - 4)}) scale(${flip} 1)`);
    if (t < 1) raf = requestAnimationFrame(step); else done && done();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
function showRouteDone(svg) {
  const vis = svg.querySelector('.route-normal,.route-cute'), mk = svg.querySelector('.route-mask'), bee = svg.querySelector('.bee');
  if (!vis || !mk) return;
  const L = vis.getTotalLength();
  mk.style.strokeDasharray = `${L} ${L}`; mk.style.strokeDashoffset = '0';
  const p = vis.getPointAtLength(L);
  bee.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y - 4)})`);
}
function hideRoute(svg) {
  const mk = svg.querySelector('.route-mask');
  if (mk) { mk.style.strokeDasharray = '1 99999'; mk.style.strokeDashoffset = '1'; }
}

// ---------- 真實地圖（高德） ----------
function amapMarker(c, num, faded, style, label) {
  const cute = style === 'cute', sc = cute ? 1.3 : 1.1, sz = Math.round(44 * sc);
  return `<div class="amk${faded ? ' faded' : ''}"><svg viewBox="${-sz / 2} ${-sz / 2} ${sz} ${sz}" width="${sz}" height="${sz}">${markerSVG(0, 0, c, num, sc, !faded && cute ? 'bob' : '')}</svg>${label ? `<span>${esc(shortName(c.placeName))}</span>` : ''}</div>`;
}
// 右下角「回到我的位置」按鈕（高德、開放地圖共用）
function locButton(el, onClick) {
  const loc = document.createElement('button');
  loc.className = 'map-loc'; loc.type = 'button'; loc.setAttribute('aria-label', '回到我的位置'); loc.hidden = true;
  loc.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  loc.onclick = onClick;
  el.appendChild(loc);
  return loc;
}

// ---------- 開放地圖（OpenStreetMap，台灣、港澳、國外用；免費、不用金鑰） ----------
let leafP = null;
function loadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve(window.L);
  if (!leafP) leafP = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = CONFIG.osm.css; document.head.appendChild(css);
    const s = document.createElement('script'); s.src = CONFIG.osm.js;
    s.onload = () => (window.L ? res(window.L) : rej(new Error('leaflet')));
    s.onerror = () => { leafP = null; rej(new Error('開放地圖載入失敗')); };
    document.head.appendChild(s);
  });
  return leafP;
}
async function mountOSM(el, pts, info, opt) {
  const L = await loadLeaflet();
  el.innerHTML = '<div class="amap-box"></div>';
  const box = el.firstChild;
  const start = pts[0] || opt.me || { lat: 25.034, lng: 121.5645 };
  const map = L.map(box, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], 15);
  const tileUrl = s => CONFIG.osm.tiles[s] || CONFIG.osm.tiles.normal;
  const tiles = L.tileLayer(tileUrl(opt.style), { maxZoom: 19, attribution: CONFIG.osm.attribution }).addTo(map);
  const tint = s => { el.classList.remove('osm-normal', 'osm-cute', 'osm-night'); el.classList.add('osm-' + s); };
  tint(opt.style);
  await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error('timeout')), 12000); tiles.once('tileload', () => { clearTimeout(tm); res(); }); })
    .catch(e => { try { map.remove(); } catch (x) {} throw e; });
  const on = i => opt.day == null || info.dayOf(pts[i]) === opt.day;
  const mkIcon = i => {
    const c = pts[i], sel = opt.day != null && on(i), sc = opt.style === 'cute' ? 1.3 : 1.1, sz = Math.round(44 * sc);
    return L.divIcon({ html: amapMarker(c, sel ? info.num(c) : null, !on(i), opt.style, sel && opt.style !== 'cute'), className: 'leaf-mk', iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
  };
  const markers = pts.map((c, i) => L.marker([c.lat, c.lng], { icon: mkIcon(i) }).on('click', () => opt.onPick && opt.onPick(c)).addTo(map));
  const paint = () => markers.forEach((m, i) => { m.setIcon(mkIcon(i)); m.setZIndexOffset(on(i) ? 200 : 0); });
  const fit = () => {
    const P = pts.filter((_, i) => on(i)).map(c => [c.lat, c.lng]);
    if (P.length === 1) map.setView(P[0], 16); else if (P.length) map.fitBounds(P, { padding: [60, 60], maxZoom: 16 });
  };
  paint(); fit();
  let meMk = null;
  const loc = locButton(el, () => { if (opt.me) map.setView([opt.me.lat, opt.me.lng], 16); });
  const setMe = me => {
    opt.me = me; if (!me) return;
    const ll = [me.lat, me.lng];
    if (!meMk) meMk = L.marker(ll, { icon: L.divIcon({ html: '<div class="me-dot"><i></i></div>', className: 'leaf-me', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000, interactive: false }).addTo(map);
    else meMk.setLatLng(ll);
    loc.hidden = false;
    if (!pts.length) map.setView(ll, 16);
  };
  if (opt.me) setMe(opt.me);
  let line = null, bee = null, raf = 0;
  const clearRoute = () => { cancelAnimationFrame(raf); if (line) line.remove(); if (bee) bee.remove(); line = bee = null; };
  const routeColor = () => (opt.style === 'cute' ? '#FF6F91' : opt.style === 'night' ? '#E8B84A' : '#D98A00');
  return {
    kind: 'osm',
    connect() {
      clearRoute();
      const P = pts.filter((_, i) => on(i)).map(c => [c.lat, c.lng]);
      if (P.length < 2) return;
      line = L.polyline([P[0]], { color: routeColor(), weight: 6, opacity: .95, dashArray: '12 9', lineCap: 'round' }).addTo(map);
      bee = L.marker(P[0], { icon: L.divIcon({ html: `<svg viewBox="-16 -18 32 32" width="34" height="34" class="amap-bee">${BEE}</svg>`, className: 'leaf-mk', iconSize: [34, 34], iconAnchor: [17, 17] }), zIndexOffset: 900, interactive: false }).addTo(map);
      const seg = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
      const total = seg.reduce((a, b) => a + b, 0) || 1, dur = Math.min(7000, 1200 + P.length * 450);
      let t0 = null;
      const step = ts => {
        if (t0 == null) t0 = ts;
        const t = Math.min(1, (ts - t0) / dur);
        let d = total * t, i = 0;
        while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const k = seg[i] ? Math.min(1, d / seg[i]) : 1;
        const p = [P[i][0] + (P[i + 1][0] - P[i][0]) * k, P[i][1] + (P[i + 1][1] - P[i][1]) * k];
        line.setLatLngs(P.slice(0, i + 1).concat([p])); bee.setLatLng(p);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
    hideRoute: clearRoute,
    setStyle(s) { opt.style = s; tint(s); tiles.setUrl(tileUrl(s)); paint(); if (line) line.setStyle({ color: routeColor() }); },
    setDay(d) { opt.day = d; clearRoute(); paint(); fit(); },
    setMe,
    destroy() { clearRoute(); el.classList.remove('osm-normal', 'osm-cute', 'osm-night'); try { map.remove(); } catch (e) {} }
  };
}

async function mountAMap(el, pts, info, opt) {
  const AM = await loadAMap();
  if (!AM || !AM.Map) throw new Error('no amap');
  el.innerHTML = '<div class="amap-box"></div>';
  const box = el.firstChild;
  const pos = pts.map(c => wgs2gcj(c.lng, c.lat));
  const mePos = () => (opt.me ? wgs2gcj(opt.me.lng, opt.me.lat) : null);
  const map = new AM.Map(box, { mapStyle: CONFIG.mapStyles[opt.style] || CONFIG.mapStyles.normal, zoom: pos.length ? 13 : 15, center: pos[0] || mePos() || [114.0579, 22.5431], resizeEnable: true });
  // 等地圖真的畫出來；Key 有問題時高德不會畫，8 秒後改用插畫地圖並說明原因
  await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error("timeout")), 12000); map.on('complete', () => { clearTimeout(tm); res(); }); })
    .catch(e => { try { map.destroy(); } catch (x) {} throw e; });
  // 我的位置：藍點；右下角按鈕回到我的位置
  let meMk = null;
  const loc = locButton(el, () => { const p = mePos(); if (p) map.setZoomAndCenter(16, p); });
  const setMe = me => {
    opt.me = me; const p = mePos(); if (!p) return;
    if (!meMk) { meMk = new AM.Marker({ position: p, anchor: 'center', zIndex: 500, content: '<div class="me-dot"><i></i></div>' }); map.add(meMk); } else meMk.setPosition(p);
    loc.hidden = false;
    if (!pos.length) map.setZoomAndCenter(15, p);
  };
  const on = i => opt.day == null || info.dayOf(pts[i]) === opt.day;
  const markers = pts.map((c, i) => {
    const m = new AM.Marker({ position: pos[i], anchor: 'center', zIndex: 120 + i });
    m.on('click', () => opt.onPick && opt.onPick(c));
    return m;
  });
  const paint = () => markers.forEach((m, i) => {
    const sel = opt.day != null && on(i);
    m.setContent(amapMarker(pts[i], sel ? info.num(pts[i]) : null, !on(i), opt.style, sel && opt.style !== 'cute'));
    m.setzIndex(on(i) ? 200 + i : 100 + i);
  });
  const fit = () => { const ms = markers.filter((_, i) => on(i)); if (ms.length) map.setFitView(ms, false, [70, 60, 60, 60], 16); };
  if (markers.length) { map.add(markers); paint(); fit(); }
  let line = null, bee = null, raf = 0;
  const clearRoute = () => { cancelAnimationFrame(raf); if (line) map.remove(line); if (bee) map.remove(bee); line = bee = null; };
  const routeColor = () => (opt.style === 'cute' ? '#FF6F91' : opt.style === 'night' ? '#E8B84A' : '#D98A00');
  const ctl = {
    kind: 'amap',
    connect(instant = false) {
      clearRoute();
      const P = pos.filter((_, i) => on(i));
      if (P.length < 2) return;
      line = new AM.Polyline({ path: [P[0]], strokeColor: routeColor(), strokeWeight: 6, strokeOpacity: .95, strokeStyle: 'dashed', strokeDasharray: [12, 9], lineJoin: 'round', lineCap: 'round', zIndex: 60 });
      bee = new AM.Marker({ position: P[0], content: `<svg viewBox="-16 -18 32 32" width="34" height="34" class="amap-bee">${BEE}</svg>`, anchor: 'center', zIndex: 400 });
      map.add([line, bee]);
      const seg = P.slice(1).map((p, i) => Math.hypot(p[0] - P[i][0], p[1] - P[i][1]));
      const total = seg.reduce((a, b) => a + b, 0) || 1;
      const dur = instant ? 0 : Math.min(7000, 1200 + P.length * 450);
      let t0 = null;
      const step = ts => {
        if (t0 == null) t0 = ts;
        const t = dur ? Math.min(1, (ts - t0) / dur) : 1;
        let d = total * t, i = 0;
        while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
        const r = seg[i] ? Math.min(1, d / seg[i]) : 1;
        const p = [P[i][0] + (P[i + 1][0] - P[i][0]) * r, P[i][1] + (P[i + 1][1] - P[i][1]) * r];
        line.setPath(P.slice(0, i + 1).concat([p]));
        bee.setPosition(p);
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    },
    hideRoute: clearRoute,
    setStyle(s) { opt.style = s; map.setMapStyle(CONFIG.mapStyles[s] || CONFIG.mapStyles.normal); paint(); if (line) line.setOptions({ strokeColor: routeColor() }); },
    setDay(d) { opt.day = d; clearRoute(); paint(); fit(); },
    setMe,
    destroy() { clearRoute(); try { map.destroy(); } catch (e) {} }
  };
  return ctl;
}

// ---------- 對外：放一張地圖 ----------
// opt: { style:'normal'|'cute', day: 天的索引或 null（全部）, onPick(c), height, seed }
export async function mountMap(el, checkins, opt = {}) {
  const pts = checkins.filter(c => c.lat != null);
  const info = dayInfo(checkins);
  opt.style = opt.style || 'normal';
  el.classList.add('mapwrap');
  if (opt.height) el.style.height = opt.height + 'px';
  const none = { kind: 'none', info, connect() {}, hideRoute() {}, setStyle() {}, setDay(d) { opt.day = d; }, setMe() {}, destroy() {} };

  // 用哪一種地圖：大多數打卡點（或現在的位置）在大陸 → 高德；在台灣、港澳、國外 → 開放地圖
  if (!pts.length && opt.wantMe && !opt.me) opt.me = await Promise.race([peekPosition().catch(() => null), new Promise(r => setTimeout(() => r(null), 4000))]);
  const ref = pts.length ? pts : opt.me ? [opt.me] : [];
  const outside = ref.filter(p => !inMainland(p.lat, p.lng)).length;
  const prov = !ref.length ? 'none' : outside * 2 > ref.length || !getSetting('amapKey') ? 'osm' : 'amap';
  if (prov === 'osm' && (pts.length || opt.wantMe)) {
    try { const ctl = await mountOSM(el, pts, info, opt); ctl.info = info; return ctl; } catch (e) { console.warn('開放地圖無法載入，改用插畫地圖', e); opt.osmFailed = true; }
  }
  if (prov === 'amap' && (pts.length || opt.wantMe)) {
    try { const ctl = await mountAMap(el, pts, info, opt); ctl.info = info; return ctl; } catch (e) { console.warn('高德地圖無法載入，改用開放地圖', e); opt.amapFailed = true; }
    // 高德不行時，先改用開放地圖
    try { const ctl = await mountOSM(el, pts, info, opt); ctl.info = info; ctl.amapFailed = true; return ctl; } catch (e) { opt.osmFailed = true; }
  }
  none.amapFailed = !!opt.amapFailed; none.osmFailed = !!opt.osmFailed; none.prov = prov;
  if (!pts.length) { el.innerHTML = '<p class="map-empty">打卡之後，這裡會開出第一朵花<br><small>想看以前去過的地方，點上面的「全部足跡」</small></p>'; return none; }

  let stop = null, connected = false;
  const W = 360, H = opt.height ? Math.round(360 * opt.height / Math.max(300, el.clientWidth || 360)) : 280;
  const draw = () => {
    if (stop) stop();
    el.innerHTML = svgAdult(pts, info, opt.style, W, Math.max(240, Math.min(H, 520)), opt.seed || 'fengcai', { day: opt.day, noPills: opt.noPills });
    const svg = el.querySelector('svg');
    if (connected) showRouteDone(svg); else hideRoute(svg);
    svg.querySelectorAll('.pick').forEach(g => g.addEventListener('click', () => { const c = pts.find(p => p.id === g.dataset.id); if (c && opt.onPick) opt.onPick(c); }));
    svg.querySelectorAll('.daypill').forEach(g => g.addEventListener('click', () => opt.onPickDay && opt.onPickDay(+g.dataset.day)));
    return svg;
  };
  let svg = draw();
  return {
    kind: 'svg', info, amapFailed: !!opt.amapFailed, osmFailed: !!opt.osmFailed, prov,
    connect() { connected = true; svg = draw(); hideRoute(svg); stop = animateRoute(svg); },
    hideRoute() { connected = false; svg = draw(); },
    setStyle(s) { opt.style = s; svg = draw(); },
    setDay(d) { opt.day = d; connected = false; svg = draw(); },
    setMe() {},
    destroy() { if (stop) stop(); }
  };
}

// ---------- 兒童花園地圖 ----------
// stamps：孩子蓋的章（依時間排序）；themeOf(c)：這個章的主題；newestId：剛蓋的那個（會有點亮動畫）
export function gardenSVG(stamps, themeOf, seed, newestId, size = {}) {
  const W = size.W || 360, RAD = size.R || 80;
  const id = `g${++seq}`;
  const pts = stamps.filter(c => c.lat != null);
  // 花園不照真實地理排列，而是依蓋章順序走一條蜿蜒小路（由下往上），每一天各自佔一段
  const COLS = 3, ROW = 112, rows = Math.ceil(pts.length / COLS) + 1;
  const H = size.H || Math.max(460, rows * ROW + 40);
  const J = rng((seed || '') + 'trail');
  const xy = size.H && pts.length === 1 ? [[W / 2, H / 2]] : pts.map((_, i) => {
    const r = Math.floor(i / COLS), c = i % COLS, col = r % 2 ? COLS - 1 - c : c;
    return [W * (col + .5) / COLS + (J() - .5) * 34, H - 74 - r * ROW + (J() - .5) * 30];
  });
  const themes = pts.map(themeOf);
  const uniq = [...new Map(themes.map(t => [t.id, t])).values()];
  const grads = uniq.map(t => `<radialGradient id="${id}t${t.id}"><stop offset="0" stop-color="${t.ground[0]}"/><stop offset=".5" stop-color="${t.ground[0]}"/><stop offset=".78" stop-color="${t.ground[1]}"/><stop offset="1" stop-color="${t.ground[1]}" stop-opacity="0"/></radialGradient>`).join('');
  const patches = xy.map(([x, y], i) => {
    const isNew = pts[i].id === newestId;
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${isNew ? 0 : RAD}" fill="url(#${id}t${themes[i].id})">${isNew ? `<animate attributeName="r" from="0" to="${RAD}" dur="1.4s" begin="0.3s" fill="freeze"/>` : ''}</circle>`;
  }).join('');
  // 每個章的周圍長出這個主題的東西
  const placed = [];
  const things = xy.map(([x, y], i) => {
    const R = rng((seed || '') + pts[i].id), t = themes[i], isNew = pts[i].id === newestId, out = [];
    for (let k = 0, tries = 0; k < 9 && tries < 80; tries++) {
      const ang = R() * Math.PI * 2, dist = 24 + R() * (RAD * .78 - 24);
      const px = x + Math.cos(ang) * dist, py = y + Math.sin(ang) * dist;
      if (px < 10 || px > W - 10 || py < 12 || py > H - 10) continue;
      if (xy.some(([ax, ay]) => Math.hypot(ax - px, ay - py) < 24) || placed.some(([ax, ay]) => Math.hypot(ax - px, ay - py) < 17)) continue;
      placed.push([px, py]);
      const kind = t.items[Math.floor(R() * t.items.length)];
      out.push(`<g transform="translate(${f1(px)} ${f1(py)}) scale(${f1(.85 + R() * .4)})">${ITEMS[kind]?.svg || ''}</g>`);
      k++;
    }
    return isNew ? `<g class="pop" style="transform-origin:${f1(x)}px ${f1(y)}px">${out.join('')}</g>` : out.join('');
  }).join('');
  const fogClouds = decor(rng((seed || '') + 'fog'), W, H, [], Math.round(W * H / 10000), ['cloud']);
  const route = smooth(xy);
  const gi = dayInfo(pts);
  const fl = pts.map((c, i) => { const [x, y] = xy[i]; const isNew = c.id === newestId; return `<g class="pick" data-id="${c.id}">${markerSVG(x, y, c, gi.num(c), 1.45, isNew ? 'grow' : 'bob')}</g>`; }).join('');
  // 每天第一站旁邊標「第 N 天」
  const gpills = gi.days.length > 1 ? gi.days.map((d, k) => {
    const i = pts.findIndex(c => gi.dayOf(c) === k);
    if (i < 0) return '';
    const [x, y] = xy[i];
    const cx = Math.min(W - 34, Math.max(34, x)), cy = y + 40 > H - 12 ? y - 40 : y + 40;
    return `<g><rect x="${f1(cx - 30)}" y="${f1(cy - 11)}" width="60" height="22" rx="11" class="m-daypill"/><text x="${f1(cx)}" y="${f1(cy)}" dy=".35em" text-anchor="middle" class="m-daytext">第 ${k + 1} 天</text></g>`;
  }).join('') : '';
  const last = xy[xy.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" class="garden" role="img" aria-label="花園地圖，已點亮 ${pts.length} 朵花">
    <defs>${grads}<pattern id="${id}dot" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" class="g-fogdot"/></pattern></defs>
    <rect width="${W}" height="${H}" rx="24" class="g-fog"/><rect width="${W}" height="${H}" rx="24" fill="url(#${id}dot)"/>${fogClouds}
    ${patches}${things}
    ${route ? `<path d="${route}" class="g-route"/>` : ''}
    ${gpills}${fl}
  </svg>`;
}

// ---------- 匯出用：把地圖變成圖片（明信片、短片會用到） ----------
export function adultMapSVG(checkins, style, W, H, seed, view = {}) {
  const pts = checkins.filter(c => c.lat != null);
  return pts.length ? svgAdult(pts, dayInfo(checkins), style, W, H, seed || 'fengcai', view) : '';
}
// 單一標記的圖（短片裡用）
export const markerOnlySVG = (c, s = 1) => `<svg viewBox="-24 -24 48 48">${markerSVG(0, 0, c, null, s)}</svg>`;
export function finishRoute(svg) { showRouteDone(svg); }

const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'paint-order', 'stop-color', 'stop-opacity'];
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('圖片產生失敗')); i.src = src; });

// 把畫面上的 SVG（用 CSS 上色）轉成可以畫進 canvas 的圖片
export async function svgToImage(svgStr, W, H, scale = 3, prepare) {
  const root = document.documentElement;
  root.classList.add('export-light');
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;pointer-events:none`;
  holder.innerHTML = svgStr;
  document.body.appendChild(holder);
  let xml = '';
  try {
    const svg = holder.querySelector('svg');
    svg.style.width = W + 'px'; svg.style.height = H + 'px';
    if (prepare) prepare(svg);
    svg.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      let st = '';
      for (const p of PROPS) { const v = cs.getPropertyValue(p); if (v) st += `${p}:${v};`; }
      el.setAttribute('style', st);
      el.removeAttribute('class');
    });
    svg.removeAttribute('class'); svg.removeAttribute('style');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', String(W * scale)); svg.setAttribute('height', String(H * scale));
    xml = new XMLSerializer().serializeToString(svg);
  } finally { holder.remove(); root.classList.remove('export-light'); }
  return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml));
}

// 短片用：取得每朵花在插畫地圖上的位置（和 adultMapSVG 一致）
export function adultLayout(checkins, style, W, H) {
  const pts = checkins.filter(c => c.lat != null);
  const { xy } = project(pts, W, H, 42, style === 'cute' ? 32 : 28);
  const info = dayInfo(checkins);
  return { pts, xy, dayOf: info.dayOf, num: info.num, days: info.days };
}

// 明信片清單用：花心有號碼的標記圖
export const markerNumSVG = (c, n, pal) => `<svg viewBox="-24 -24 48 48" class="mapsvg${pal ? ' pal-' + pal : ''}${pal === 'night' ? ' night' : ''}">${withShape(SHAPES[pal], () => markerSVG(0, 0, c, n, 1.35, '', null, 'center'))}</svg>`;
