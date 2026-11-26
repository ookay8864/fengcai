// ==========================================================
// 夥伴（buddies.js）：孩子每蓋一個章，就解鎖一個新夥伴
// 全部是蜂采原創的像素角色。每個孩子可以選自己的主題：
//   block  方塊冒險（方塊世界）
//   garden 花園小夥伴（原本的花園）
// 畫法：12×12 的像素格，一個字元一格，「.」是透明。
// 想換造型：改下面的格子和顏色就好。
// ==========================================================
const K = '#2B1B0A', W = '#FFFFFF';
const B = (name, colors, rows) => ({ name, colors: { k: K, w: W, ...colors }, rows });

export const BUDDY_THEMES = {
  block: {
    name: '方塊冒險', world: '方塊世界', round: false,
    list: [
      B('方塊小蜜蜂', { y: '#FFC83D' }, [
        '............', '.ww......ww.', 'wwww....wwww', '.www.kk.www.', '...kkyykk...', '..kyyyyyyk..',
        '..kykyykyk..', '..kyyyyyyk..', '..kkkkkkkk..', '..kyyyyyyk..', '..kkkkkkkk..', '...kyyyyk...']),
      B('像素狐狸', { o: '#F2852E' }, [
        'k..........k', 'kk........kk', 'kok......kok', 'koookkkkoook', 'kooooooooook', 'kokooooookok',
        'kooooooooook', 'kwwwookoowwk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...', '............']),
      B('水晶精靈', { b: '#7FD4F5', d: '#2E8FC4' }, [
        '.....kk.....', '....kbbk....', '...kbwbbk...', '..kbwbbbdk..', '..kbbbbbdk..', '.kbkbbbbkdk.',
        '.kbbbbbbbdk.', '.kbbbkkbbdk.', '..kbbbbbdk..', '...kbbbdk...', '....kbdk....', '.....kk.....']),
      B('寶箱怪', { n: '#B97A3E', d: '#7A4A1E', g: '#FFC83D', r: '#E5484D' }, [
        '............', '.kkkkkkkkkk.', '.knnnnnnnnk.', '.knwknnwknk.', '.knnnnnnnnk.', '.kkkkggkkkk.',
        '.kddddggddk.', '.kdwdwwdwdk.', '.kdrrrrrrdk.', '.kddddddddk.', '.kkkkkkkkkk.', '............']),
      B('蘑菇小子', { r: '#E5484D', s: '#FFE3C2' }, [
        '...kkkkkk...', '..krrwwrrk..', '.krrrwwrrrk.', 'krwwrrrrwwrk', 'krwwrrrrrrrk', 'kkkkkkkkkkkk',
        '..kssssssk..', '..ksksskssk.', '..kssssssk..', '..ksskkssk..', '...kssssk...', '....kkkk....']),
      B('方塊烏龜', { g: '#5CBF8A', d: '#2A8A5C', y: '#FFE08A' }, [
        '............', '....kkkkk...', '...kgdgdgk..', '..kgdgdgdgk.', '.kdgdgdgdgdk', '.kgdgdgdgdgk',
        'kkkkkkkkkkkk', 'kyyk....kyyk', 'kyyk....kyyk', '.kk......kk.', '............', '............']),
      B('火焰小龍', { r: '#E5484D', o: '#F59A4A', y: '#FFD23F' }, [
        '..k.....k...', '.kok...kok..', '.krrkkkrrk..', 'krrrrrrrrrk.', 'krkrrrrkrrk.', 'krrrrrrrrrkk',
        'krryyyyrrrok', '.krrkkrrrok.', '..krrrrrrk..', '..kyyyyyyk..', '..kok..kok..', '..kk....kk..']),
      B('冰塊企鵝', { o: '#F59A4A', b: '#BEE6FA' }, [
        '....kkkk....', '...kkkkkk...', '..kkwwwwkk..', '..kwkwwkwk..', '..kwwoowwk..', '.kkwwwwwwkk.',
        'kbkwwwwwwkbk', 'kbkwwwwwwkbk', '.kkwwwwwwkk.', '..kkwwwwkk..', '...ook.oo...', '...kk..kk...']),
      B('星星機器人', { s: '#C9CED6', d: '#7D8590', y: '#FFD23F', b: '#6CB8F0' }, [
        '.....yy.....', '.....kk.....', '..kkkkkkkk..', '..kssssssk..', '..ksbssbsk..', '..kssssssk..',
        '..kskkkksk..', 'kkkkkkkkkkkk', 'kdkssyyssdk.', '.kkssyysskk.', '..kssssssk..', '..kk....kk..']),
      B('雲朵鯨魚', { b: '#6CB8F0', l: '#BEE6FA' }, [
        '............', '.........k.k', '..kkkkkk.kbk', '.kbbbbbbkkbk', 'kbbkbbbbbbbk', 'kbbbbbbbbbk.',
        'kllllllbbbk.', '.klllllllk..', '..kkkkkkk...', '............', '..w...w.....', '.www.www....'])
    ]
  },
  garden: {
    name: '花園小夥伴', world: '花園', round: false,
    list: [
      B('小瓢蟲', { r: '#E5484D' }, [
        '............', '...k....k...', '....kkkk....', '...kkkkkk...', '..krrkkrrk..', '.krkrrrrkrk.',
        '.krrrkkrrrk.', '.krkrkkrkrk.', '.krrrkkrrrk.', '..krrkkrrk..', '...kkkkkk...', '............']),
      B('小蝴蝶', { p: '#F08DB0', v: '#A98BEA' }, [
        '............', '.kk..k.k..kk', 'kppk..k..kpk', 'kpvpk.k.kpvk', 'kppppkkkpppk', '.kppkkkkkppk',
        '..kkkkkkkk..', '.kvvkkkkvvk.', 'kvvvk.kkvvvk', '.kkk..kk.kk.', '............', '............']),
      B('慢慢蝸牛', { n: '#C98A4B', d: '#8B5A2B', y: '#FFE08A' }, [
        '............', '.k.k........', '.k.k..kkkk..', '.kyk.knnnnk.', 'kyyykndddnnk', 'kykyknkknnnk',
        'kyyyknknnndk', '.kyyknnkkdnk', '.kyyykkkkkkk', '.kyyyyyyyyyk', '..kkkkkkkkk.', '............']),
      B('跳跳青蛙', { g: '#5CBF8A', d: '#2A8A5C' }, [
        '............', '..kk....kk..', '.kwwk..kwwk.', '.kwkkkkkwkk.', 'kggggggggggk', 'kggggggggggk',
        'kgkggggggkgk', 'kggkkkkkkggk', '.kggggggggk.', 'kdkk....kkdk', 'kk........kk', '............']),
      B('小刺蝟', { n: '#8B5A2B', s: '#FFE3C2' }, [
        '............', '..k.k.k.k...', '.knknknknk..', 'knnnnnnnnnk.', 'knnnnnnnssk.', 'knnnnnnsksk.',
        'knnnnnnsssk.', 'knnnnnnsskkk', '.knnnnnnssk.', '..kkkkkkkk..', '..kk....kk..', '............']),
      B('藍色小鳥', { b: '#6CB8F0', o: '#F59A4A' }, [
        '............', '....kkkk....', '...kbbbbk...', '..kbbwkbbk..', '..kbbbbbbkok', '.kbbbbbbbkk.',
        'kbbbwwwbbk..', 'kbbwwwwwbk..', '.kbbwwwbbk..', '..kkkkkkk...', '...k...k....', '..kk..kk....']),
      B('毛毛蟲', { g: '#9BD56A', d: '#5CBF8A', r: '#E5484D' }, [
        '............', '........k.k.', '.......kkkkk', '......krrrrk', '......krkrkk', '..kk.kkrrrrk',
        '.kgdkgdkrrk.', 'kgdgdgdgkk..', 'kgggggggk...', '.k.k.k.k....', '............', '............']),
      B('小蜻蜓', { b: '#6CB8F0', l: '#DDF2FF' }, [
        '............', '.....kk.....', '....kbbk....', 'kllk.kk.kllk', 'klllkbbklllk', '.kllkbbkllk.',
        'klllkbbklllk', '.kk.kbbk.kk.', '.....kbk....', '.....kbk....', '.....kbk....', '......k.....'])
    ]
  }
};

export const themeOfKid = kid => (kid && BUDDY_THEMES[kid.theme] ? kid.theme : 'garden');
export const buddyList = theme => (BUDDY_THEMES[theme] || BUDDY_THEMES.garden).list;

// 像素角色畫成 SVG；silhouette＝還沒收集到（灰色剪影）
export function buddySVG(theme, idx, cls = '', silhouette = false) {
  const T = BUDDY_THEMES[theme] || BUDDY_THEMES.garden, b = T.list[idx % T.list.length];
  let r = '';
  b.rows.forEach((row, y) => {
    const s = (row.replace(/ /g, '.') + '............').slice(0, 12);
    if (T.round) {
      for (let x = 0; x < 12; x++) { const ch = s[x]; if (ch === '.') continue; r += `<rect x="${x}" y="${y}" width="1.04" height="1.04" rx=".32" fill="${silhouette ? '#CFC6B2' : b.colors[ch] || K}"/>`; }
    } else {
      // 方塊主題：同一列同顏色合成一條，邊緣銳利
      let x = 0;
      while (x < 12) {
        const ch = s[x];
        if (ch === '.') { x++; continue; }
        let e = x; while (e + 1 < 12 && s[e + 1] === ch) e++;
        r += `<rect x="${x}" y="${y}" width="${e - x + 1}" height="1.02" fill="${silhouette ? '#CFC6B2' : b.colors[ch] || K}"/>`;
        x = e + 1;
      }
    }
  });
  return `<svg class="buddy ${cls}" viewBox="-.5 -.5 13 13" shape-rendering="${T.round ? 'auto' : 'crispEdges'}" aria-hidden="true">${r}</svg>`;
}
export const buddyName = (theme, idx) => buddyList(theme)[idx % buddyList(theme).length].name;

// 這個孩子收集到哪些夥伴（從他蓋過的章算）
export function collected(stamps, kidKey) {
  const set = new Set();
  stamps.forEach(c => { const v = (c.buddy || {})[kidKey]; if (v != null) set.add(v); });
  return set;
}
// 下一個要解鎖的夥伴：還沒收集到的第一個；全部收集完就隨機「再遇到」
export function nextBuddy(theme, got) {
  const n = buddyList(theme).length;
  for (let i = 0; i < n; i++) if (!got.has(i)) return { idx: i, isNew: true };
  return { idx: Math.floor(Math.random() * n), isNew: false };
}
