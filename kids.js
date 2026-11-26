// ==========================================================
// 孩子們（kids.js）
// 每個孩子：小名、蜜蜂顏色、小童／大童。存在這支手機的 localStorage。
// 小童：用爸媽的手機刷吊飾蓋章（不能拍照）。
// 大童：用自己的 iPhone，可以拍照、錄影、錄音。
// 吊飾網址把孩子的資料一起帶著（k=代號 n=小名 c=顏色 a=small/big），
// 所以大童的手機第一次打開吊飾網址，就知道自己是誰。
// ==========================================================
import { uid } from './ui.js';

export const KID_COLORS = {
  honey: { name: '蜂蜜黃', hex: '#F7B500' },
  sky: { name: '天空藍', hex: '#6CB8F0' },
  mint: { name: '薄荷綠', hex: '#5CBF8A' },
  pink: { name: '櫻花粉', hex: '#F08DB0' },
  grape: { name: '葡萄紫', hex: '#A98BEA' },
  orange: { name: '橘子橘', hex: '#F59A4A' }
};
export const KID_LIMITS = { photos: 4, videos: 1, videoSec: 10, audios: 1, audioSec: 15 };
export const FEELS = { fun: '好玩', yum: '好吃', pretty: '好美', tired: '好累' };
export const QUESTIONS = ['這裡最好玩的是什麼？', '你看到什麼顏色？', '下次還想再來嗎？為什麼？', '用一句話告訴未來的自己，這裡怎麼樣？', '如果給這裡取一個名字，你會叫它什麼？', '這裡聞起來、聽起來像什麼？', '你最想帶誰再來一次？'];

const KEY = 'fc-kids';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
export const getKids = () => read();
export function saveKids(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
export const kidById = id => read().find(k => k.id === id) || null;
export function upsertKid(k) {
  const list = read(), i = list.findIndex(x => x.id === k.id);
  if (i >= 0) list[i] = { ...list[i], ...k }; else list.push(k);
  saveKids(list);
  return k;
}
export function newKid(name, color = 'honey', age = 'small', theme = 'garden') { return upsertKid({ id: uid(), name: name.trim() || '小寶', color, age, theme }); }
export function removeKid(id) { saveKids(read().filter(k => k.id !== id)); }
export const colorHex = k => (KID_COLORS[k && k.color] || KID_COLORS.honey).hex;

// 這筆打卡是哪幾個孩子蓋的（舊資料沒有 kidIds＝不知道是誰）
export const kidIdsOf = c => (c && Array.isArray(c.kidIds) ? c.kidIds : []);
// 地圖上蜜蜂的顏色：第一個認得的孩子
export function beeColorOf(c) {
  for (const id of kidIdsOf(c)) { const k = kidById(id); if (k) return colorHex(k); }
  return null;
}
// 這筆是不是這個孩子的（舊資料沒有 kidIds，算大家的）
export const isKidOf = (c, kid) => !!(c && (c.kid || c.by === 'kid')) && (!kid || !kidIdsOf(c).length || kidIdsOf(c).includes(kid.id));

// 吊飾網址
export function kidUrl(base, k) {
  const q = new URLSearchParams({ tap: '1', k: k.id, n: k.name, c: k.color, a: k.age, t: k.theme || 'garden' });
  return `${base}kid.html?${q}`;
}
// 孩子頁打開時：從網址認出是誰；網址沒帶就用上次的孩子（舊吊飾＝不分是誰）
export function kidFromUrl() {
  const q = new URLSearchParams(location.search);
  const id = q.get('k');
  if (id) {
    const k = { id, name: q.get('n') || '小寶', color: KID_COLORS[q.get('c')] ? q.get('c') : 'honey', age: q.get('a') === 'big' ? 'big' : 'small', theme: q.get('t') === 'block' ? 'block' : 'garden' };
    const old = kidById(id);
    // 爸媽手機上已經有這個孩子：以手機上的設定為準（可能改過名字）
    const me = old || upsertKid(k);
    try { localStorage.setItem('fc-kid-last', me.id); } catch (e) {}
    return me;
  }
  let last = null;
  try { last = localStorage.getItem('fc-kid-last'); } catch (e) {}
  return (last && kidById(last)) || null;
}
