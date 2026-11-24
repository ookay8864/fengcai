// 共用的小工具：選取元素、跳脫文字、提示、對話框、日期格式、圖示
export const $ = (s, r = document) => r.querySelector(s);

export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="./icons.svg#${id}"/></svg>`;

const WK = ['日', '一', '二', '三', '四', '五', '六'];
export const fmtTime = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const fmtDate = ts => { const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日 週${WK[d.getDay()]}`; };
export const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

let toastTimer = null;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function modal(inner) {
  const ov = document.createElement('div');
  ov.className = 'dlg';
  ov.innerHTML = `<div class="dlg-card" role="dialog" aria-modal="true">${inner}</div>`;
  document.body.appendChild(ov);
  return ov;
}

export function confirmDlg(msg, ok = '確定', cancel = '取消') {
  return new Promise(res => {
    const ov = modal(`<p class="dlg-msg">${esc(msg)}</p><div class="row end"><button class="btn" data-v="0">${esc(cancel)}</button><button class="btn main" data-v="1">${esc(ok)}</button></div>`);
    ov.onclick = e => {
      const b = e.target.closest('[data-v]');
      if (b) { ov.remove(); res(b.dataset.v === '1'); }
    };
  });
}

export function inputDlg(title, value = '', placeholder = '') {
  return new Promise(res => {
    const ov = modal(`<form><label class="dlg-msg" for="dlgin">${esc(title)}</label><input id="dlgin" class="inp" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"><div class="row end"><button type="button" class="btn" data-x>取消</button><button class="btn main">確定</button></div></form>`);
    const inp = ov.querySelector('input');
    setTimeout(() => inp.focus(), 50);
    ov.querySelector('[data-x]').onclick = () => { ov.remove(); res(null); };
    ov.querySelector('form').onsubmit = e => { e.preventDefault(); const v = inp.value.trim(); ov.remove(); res(v || null); };
  });
}
