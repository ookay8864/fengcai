// ==========================================================
// 蜂采的小蜜蜂（bee.js）
// 換造型只要換 ./bee.svg 這一個檔案；地圖、孩子頁、時光膠囊、明信片、短片會一起變。
// 預設的蜜蜂畫在下面（DEFAULT）；./bee.svg 換成別的檔案時，就改用那個檔案。
// ==========================================================
const DEFAULT = `<g class="bee-g"><ellipse cx="-6" cy="-7" rx="7" ry="4.5" transform="rotate(-25 -6 -7)" class="bee-w"/><ellipse cx="6" cy="-7" rx="7" ry="4.5" transform="rotate(25 6 -7)" class="bee-w"/><ellipse cx="0" cy="0" rx="8" ry="9.5" class="bee-b"/><path d="M-7.5 -2h15M-7.5 3h15" class="bee-s"/><circle cx="0" cy="-10" r="4.5" class="bee-h"/></g>`;
export let BEE = DEFAULT;      // 放在 viewBox="-16 -18 32 32" 裡的蜜蜂
export let beeCustom = false;  // 是不是換成了自己的蜜蜂
let beeImg = null;             // 短片用的圖片

export async function loadBee() {
  try {
    const t = await (await fetch('./bee.svg', { cache: 'no-cache' })).text();
    if (t.includes('fengcai-default-bee')) return;
    const svg = new DOMParser().parseFromString(t, 'image/svg+xml').documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') return;
    const w = parseFloat(svg.getAttribute('width')) || 32, h = parseFloat(svg.getAttribute('height')) || 32;
    const vb = svg.getAttribute('viewBox') || `0 0 ${w} ${h}`;
    BEE = `<svg x="-16" y="-18" width="32" height="32" viewBox="${vb}" overflow="visible">${svg.innerHTML}</svg>`;
    beeCustom = true;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t);
    await img.decode().catch(() => {});
    beeImg = img;
  } catch (e) { /* 讀不到就用預設的蜜蜂 */ }
}
// 介面上用的彩色蜜蜂（例如孩子頁的大印章）
export const beeSVG = (cls = '') => `<svg class="ic ${cls}" viewBox="-16 -18 32 32" aria-hidden="true">${BEE}</svg>`;
// 短片用：換了蜜蜂時，直接畫那張圖
export const customBeeImage = () => (beeCustom ? beeImg : null);
