// 照片壓縮、影片縮圖、錄音
// 照片經過重新壓縮後，照片裡的 GPS 等隱藏資訊會一併移除。

async function loadImg(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 改用下面的方法 */ }
  }
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('無法讀取這張圖片'));
    i.src = URL.createObjectURL(file);
  });
}

export async function compressImage(file, max = 1600, q = 0.85) {
  const img = await loadImg(file);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  if (img.close) img.close();
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('照片壓縮失敗'))), 'image/jpeg', q));
}

export function videoThumb(file) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata';
    const url = URL.createObjectURL(file);
    let done = false;
    const fin = b => { if (done) return; done = true; URL.revokeObjectURL(url); res(b || null); };
    v.onloadedmetadata = () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) { fin(null); } };
    v.onseeked = () => {
      try {
        const s = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob(fin, 'image/jpeg', 0.8);
      } catch (e) { fin(null); }
    };
    v.onerror = () => fin(null);
    setTimeout(() => fin(null), 7000);
    v.src = url;
  });
}

export async function startRecorder() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  const done = new Promise(res => {
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(chunks, { type: rec.mimeType || type || 'audio/mp4' })); };
  });
  rec.start();
  return { stop: () => { if (rec.state !== 'inactive') rec.stop(); return done; } };
}

// 取得圖片尺寸（判斷直拍或橫拍用）
export async function blobDims(blob) {
  if (!blob) return null;
  try {
    if (window.createImageBitmap) { const b = await createImageBitmap(blob); const d = { w: b.width, h: b.height }; b.close && b.close(); return d; }
  } catch (e) {}
  return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = URL.createObjectURL(blob); });
}
