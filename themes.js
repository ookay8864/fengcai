// ==========================================================
// 蜂采 花園主題（themes.js）
// - ITEMS：花園裡會長出來的小圖案（顏色在 theme.css 的 --g-* 變數）
// - THEMES：內建主題（地面顏色、會長出的圖案、自動推薦的關鍵字）
// - 自訂主題存在這支手機上
// ==========================================================
import { getSetting, setSetting } from './config.js';

export const ITEMS = {
  tree: { name: '大樹', svg: '<rect x="-2" y="3" width="4" height="9" rx="1.5" class="d-trunk"/><circle r="9" class="d-tree"/><circle cx="-3" cy="-3" r="3.2" class="d-tree-hi"/>' },
  bush: { name: '草叢', svg: '<circle cx="-6" cy="3" r="5.5" class="d-tree"/><circle cx="6" cy="3" r="5.5" class="d-tree"/><circle cy="-1" r="7" class="d-tree"/>' },
  grass: { name: '小草', svg: '<path d="M-5 4 L-3 -3 M0 4 L0 -5 M5 4 L3 -3" class="d-grass"/>' },
  dots: { name: '小花', svg: '<circle r="2.6" class="d-dot1"/><circle cx="7" cy="4" r="2.1" class="d-dot2"/><circle cx="-6" cy="5" r="1.9" class="d-dot1"/>' },
  pond: { name: '池塘', svg: '<ellipse rx="15" ry="8" class="d-pond"/><path d="M-6 -2 q4 -3 8 0" class="d-pond-hi"/>' },
  hill: { name: '小山丘', svg: '<path d="M-18 8 Q-8 -12 0 -5 Q8 -15 19 8 Z" class="d-hill"/>' },
  house: { name: '小房子', svg: '<path d="M-9 0 L0 -9 L9 0 Z" class="d-roof"/><rect x="-7" y="0" width="14" height="10" class="d-house"/><rect x="-2" y="4" width="4" height="6" class="d-door"/>' },
  palm: { name: '椰子樹', svg: '<path d="M1 12 Q3 2 0 -6" class="d-trunk-s"/><path d="M0 -6 Q-10 -12 -15 -3 Q-8 -8 0 -6Z M0 -6 Q10 -12 15 -3 Q8 -8 0 -6Z M0 -6 Q-4 -16 -11 -15 Q-4 -12 0 -6Z M0 -6 Q4 -16 11 -15 Q4 -12 0 -6Z" class="d-tree"/>' },
  shell: { name: '貝殼', svg: '<path d="M-9 4 A9 9 0 0 1 9 4 L0 9 Z" class="d-shell"/><path d="M0 9 L-5 -2 M0 9 L0 -4 M0 9 L5 -2" class="d-line-soft"/>' },
  starfish: { name: '海星', svg: '<path d="M0 -10 L2.6 -3 L10 -3 L4 1.6 L6.2 9 L0 4.6 L-6.2 9 L-4 1.6 L-10 -3 L-2.6 -3 Z" class="d-star"/>' },
  wave: { name: '浪花', svg: '<path d="M-14 2 q3.5 -5 7 0 t7 0 t7 0 t7 0" class="d-wave"/><path d="M-10 8 q3.5 -5 7 0 t7 0 t7 0" class="d-wave"/>' },
  umbrella: { name: '陽傘', svg: '<path d="M0 -3 V12" class="d-line"/><path d="M-12 -2 A12 10 0 0 1 12 -2 Z" class="d-umb"/><path d="M-4 -2 A4 10 0 0 1 4 -2" class="d-umb2"/>' },
  sandcastle: { name: '沙堡', svg: '<path d="M-11 11 V1 H-7 V-3 H-3 V1 H3 V-3 H7 V1 H11 V11 Z" class="d-sand"/><path d="M0 1 V-10" class="d-line"/><path d="M0 -10 L6 -8 L0 -6 Z" class="d-flag"/>' },
  peak: { name: '雪山', svg: '<path d="M-15 11 L0 -13 L15 11 Z" class="d-rock"/><path d="M-5.6 -4 L0 -13 L5.6 -4 L2.5 -2 L0 -4.5 L-2.5 -2 Z" class="d-snow"/>' },
  pine: { name: '松樹', svg: '<rect x="-1.6" y="7" width="3.2" height="5" class="d-trunk"/><path d="M0 -13 L8 -1 H4 L10 8 H-10 L-4 -1 H-8 Z" class="d-pine"/>' },
  rock: { name: '石頭', svg: '<path d="M-10 7 Q-9 -4 -2 -5 Q6 -7 9 2 Q10 7 6 8 H-8 Z" class="d-rock"/>' },
  mushroom: { name: '蘑菇', svg: '<rect x="-3" y="0" width="6" height="9" rx="2.5" class="d-house"/><path d="M-10 1 A10 9 0 0 1 10 1 Z" class="d-roof"/><circle cx="-4" cy="-4" r="1.8" class="d-dot2"/><circle cx="3.5" cy="-3" r="1.5" class="d-dot2"/>' },
  tower: { name: '高樓', svg: '<rect x="-6" y="-14" width="12" height="26" rx="1.5" class="d-bld"/><path d="M-3 -10h2M1 -10h2M-3 -5h2M1 -5h2M-3 0h2M1 0h2M-3 5h2M1 5h2" class="d-win"/>' },
  building: { name: '房子群', svg: '<rect x="-12" y="-4" width="11" height="16" rx="1" class="d-bld2"/><rect x="0" y="-9" width="12" height="21" rx="1" class="d-bld"/><path d="M-9 0h2M-5 0h2M-9 5h2M-5 5h2M3 -5h2M7 -5h2M3 0h2M7 0h2M3 5h2M7 5h2" class="d-win"/>' },
  lamp: { name: '路燈', svg: '<path d="M0 12 V-8" class="d-line"/><circle cx="0" cy="-10" r="4" class="d-lantern"/>' },
  car: { name: '小汽車', svg: '<path d="M-12 6 V1 L-7 -4 H5 L10 1 H12 V6 Z" class="d-car"/><circle cx="-6" cy="7" r="3" class="d-wheel"/><circle cx="7" cy="7" r="3" class="d-wheel"/>' },
  oldhouse: { name: '古屋', svg: '<rect x="-9" y="-1" width="18" height="12" class="d-house"/><path d="M-14 -1 Q-6 -3 0 -11 Q6 -3 14 -1 Q8 -3 6 0 H-6 Q-8 -3 -14 -1Z" class="d-tile"/><rect x="-2.5" y="4" width="5" height="7" class="d-door"/>' },
  lantern: { name: '燈籠', svg: '<path d="M0 -13 V-8" class="d-line"/><ellipse cx="0" cy="-1" rx="6.5" ry="7.5" class="d-lantern"/><path d="M-3 -8 h6 M-3 6.5 h6 M0 6.5 V11" class="d-line"/>' },
  bridge: { name: '小橋', svg: '<path d="M-15 6 Q0 -10 15 6" class="d-bridge"/><path d="M-10 2 V-5 M-3 -2 V-8 M4 -2 V-8 M10 2 V-5" class="d-line"/>' },
  field: { name: '田地', svg: '<rect x="-13" y="-8" width="26" height="17" rx="2" class="d-field"/><path d="M-11 -4 h22 M-11 0.5 h22 M-11 5 h22" class="d-row"/>' },
  haystack: { name: '稻草堆', svg: '<path d="M-11 10 Q-11 -10 0 -10 Q11 -10 11 10 Z" class="d-hay"/><path d="M-6 0 h12 M-8 5 h16" class="d-line-soft"/>' },
  fence: { name: '籬笆', svg: '<path d="M-12 -4 V9 M-4 -6 V9 M4 -6 V9 M12 -4 V9" class="d-fence"/><path d="M-13 0 H13 M-13 5 H13" class="d-fence"/>' },
  ferris: { name: '摩天輪', svg: '<circle cx="0" cy="-3" r="11" class="d-ferris"/><path d="M0 -14 V8 M-11 -3 H11 M-7.8 -10.8 L7.8 4.8 M7.8 -10.8 L-7.8 4.8" class="d-line-soft"/><path d="M-6 13 L0 -3 L6 13" class="d-line"/><circle cx="0" cy="-14" r="2.4" class="d-dot1"/><circle cx="11" cy="-3" r="2.4" class="d-gold"/><circle cx="-11" cy="-3" r="2.4" class="d-pondc"/>' },
  balloon: { name: '氣球', svg: '<path d="M0 6 Q-3 9 0 13" class="d-line"/><ellipse cx="0" cy="-3" rx="7" ry="9" class="d-balloon"/><path d="M-2 -8 q2 -3 4 -1" class="d-pond-hi"/>' },
  tent: { name: '旋轉木馬', svg: '<path d="M-12 -2 L0 -13 L12 -2 Z" class="d-tent"/><rect x="-10" y="-2" width="20" height="12" class="d-house"/><path d="M-5 -2 V10 M5 -2 V10" class="d-line-soft"/><circle cx="0" cy="-14" r="1.8" class="d-gold"/>' },
  flag: { name: '小旗子', svg: '<path d="M-14 -6 Q0 2 14 -6" class="d-line-soft"/><path d="M-10 -4 l3 6 l3 -5 Z M-1 -1.5 l3 6 l3 -6 Z M8 -4 l-0.5 6 l4 -5 Z" class="d-flag"/>' },
  paw: { name: '腳印', svg: '<ellipse cx="0" cy="4" rx="6" ry="5" class="d-paw"/><circle cx="-6" cy="-3" r="2.6" class="d-paw"/><circle cx="-2" cy="-7" r="2.6" class="d-paw"/><circle cx="3" cy="-7" r="2.6" class="d-paw"/><circle cx="7" cy="-3" r="2.6" class="d-paw"/>' },
  giraffe: { name: '長頸鹿', svg: '<path d="M-1 12 V-6 Q-1 -10 3 -11 L8 -10 Q9 -7 5 -6 L3 -6 V12 Z" class="d-giraffe"/><circle cx="1" cy="0" r="1.2" class="d-spot"/><circle cx="1" cy="6" r="1.2" class="d-spot"/><circle cx="5" cy="-8.5" r="0.9" class="d-wheel"/><path d="M2 -11 V-14 M4 -11 V-14" class="d-line"/>' },
  snowman: { name: '雪人', svg: '<circle cx="0" cy="5" r="7" class="d-snowball"/><circle cx="0" cy="-6" r="5" class="d-snowball"/><rect x="-4.5" y="-14" width="9" height="4" class="d-wheel"/><path d="M0 -6 l4 1 l-4 1 Z" class="d-carrot"/>' },
  snowflake: { name: '雪花', svg: '<path d="M0 -10 V10 M-8.7 -5 L8.7 5 M-8.7 5 L8.7 -5 M-2.5 -8 L0 -5.5 L2.5 -8 M-2.5 8 L0 5.5 L2.5 8" class="d-flake"/>' },
  heart: { name: '愛心', svg: '<path d="M0 9 C-14 0 -9 -11 0 -4 C9 -11 14 0 0 9 Z" class="d-dot1"/>' },
  star: { name: '星星', svg: '<path d="M0 -11 L3 -3.5 L11 -3.4 L4.8 1.6 L7 9.5 L0 5 L-7 9.5 L-4.8 1.6 L-11 -3.4 L-3 -3.5 Z" class="d-gold"/>' }
};

// guess：附近地點的類型或名字中出現這些字，就推薦這個主題（先比對的優先）
export const THEMES = [
  { id: 'beach', name: '沙灘', icon: 'umbrella', ground: ['#FFE8A3', '#9FDDF2'], items: ['palm', 'palm', 'shell', 'starfish', 'wave', 'wave', 'umbrella', 'sandcastle'], guess: /海滩|海灘|沙滩|沙灘|海边|海邊|海水浴场|浴场|湾|灣|岛|島/ },
  { id: 'mountain', name: '高山', icon: 'peak', ground: ['#DDEFC6', '#A8D29E'], items: ['peak', 'peak', 'pine', 'pine', 'pine', 'rock', 'grass'], guess: /山|峰|岭|嶺|峡谷|峽谷|雪山|登山/ },
  { id: 'forest', name: '森林', icon: 'pine', ground: ['#CDEFB4', '#93CE88'], items: ['tree', 'tree', 'pine', 'pine', 'mushroom', 'mushroom', 'bush', 'grass'], guess: /森林|林场|林場|湿地|濕地|植物园|植物園|公园|公園|绿道|綠道/ },
  { id: 'amusement', name: '遊樂園', icon: 'ferris', ground: ['#FFE0EC', '#FFD4A8'], items: ['ferris', 'balloon', 'balloon', 'balloon', 'tent', 'flag', 'flag', 'dots'], guess: /游乐|遊樂|乐园|樂園|欢乐谷|歡樂谷|迪士尼|主题公园|主題公園/ },
  { id: 'zoo', name: '動物園', icon: 'giraffe', ground: ['#E8F3C4', '#BFE0A0'], items: ['giraffe', 'giraffe', 'paw', 'paw', 'paw', 'fence', 'palm', 'bush'], guess: /动物|動物|野生|海洋馆|海洋館|水族/ },
  { id: 'oldtown', name: '古鎮', icon: 'oldhouse', ground: ['#F7E5C4', '#E2C79C'], items: ['oldhouse', 'oldhouse', 'oldhouse', 'lantern', 'lantern', 'bridge', 'tree'], guess: /古镇|古鎮|古城|老街|古村|寺|庙|廟|祠|故居/ },
  { id: 'farm', name: '田園', icon: 'haystack', ground: ['#F4EEB4', '#C6E59C'], items: ['field', 'field', 'field', 'haystack', 'haystack', 'fence', 'dots', 'tree'], guess: /农家|農家|农场|農場|果园|果園|采摘|採摘|田|村/ },
  { id: 'city', name: '城市', icon: 'tower', ground: ['#F2ECDF', '#D8D2C5'], items: ['tower', 'tower', 'building', 'building', 'lamp', 'car', 'tree'], guess: /./ }
];
// 舊版沒有主題的章，用這個預設草地
const MEADOW = { id: 'meadow', name: '草地', icon: 'tree', ground: ['#FFF1B8', '#CDEFB0'], items: ['tree', 'tree', 'bush', 'grass', 'grass', 'dots', 'dots', 'pond', 'hill', 'house'] };

// 自訂主題可選的地面顏色
export const GROUNDS = [
  { name: '雪白', c: ['#F6FBFF', '#CFE6F7'] },
  { name: '沙黃', c: ['#FFE8A3', '#F5CF7A'] },
  { name: '草綠', c: ['#D7F2BE', '#9FD58F'] },
  { name: '粉紅', c: ['#FFE3EE', '#FFC3D8'] },
  { name: '天藍', c: ['#DDF2FF', '#A6D6F4'] },
  { name: '淡紫', c: ['#EEE5FF', '#D0C0F6'] },
  { name: '橘子', c: ['#FFEBD2', '#FFC999'] }
];

export function listCustom() {
  try { const a = JSON.parse(getSetting('customThemes', '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
export function saveCustom(t) {
  const a = listCustom().filter(x => x.id !== t.id);
  a.push({ ...t, custom: true });
  setSetting('customThemes', JSON.stringify(a));
}
export function deleteCustom(id) { setSetting('customThemes', JSON.stringify(listCustom().filter(x => x.id !== id))); }

export const allThemes = () => [...THEMES, ...listCustom()];
export function getTheme(id) { return allThemes().find(t => t.id === id) || MEADOW; }

export function guessTheme(place) {
  const s = `${place?.type || ''} ${place?.name || ''}`;
  const order = ['zoo', 'amusement', 'beach', 'oldtown', 'forest', 'mountain', 'farm', 'city'];
  return order.find(id => THEMES.find(t => t.id === id).guess.test(s)) || 'city';
}

// 主題的小圖示（給選單用）
export function themeIcon(t, size = 56) {
  const it = ITEMS[t.icon] || ITEMS.tree;
  return `<svg viewBox="-17 -17 34 34" width="${size}" height="${size}" aria-hidden="true"><circle r="16.5" fill="${t.ground[0]}" stroke="${t.ground[1]}" stroke-width="2"/><g transform="scale(.95)">${it.svg}</g></svg>`;
}
export const itemIcon = (id, size = 40) => `<svg viewBox="-16 -16 32 32" width="${size}" height="${size}" aria-hidden="true">${ITEMS[id]?.svg || ''}</svg>`;
