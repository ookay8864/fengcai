// ==========================================================
// 蜂采 背景音樂（music.js）
// 在手機上即時合成的原創配樂，沒有版權問題。
// 和弦進行 C–G–Am–F，音色是音樂盒／鐘琴、柔和貝斯與輕沙鈴。
// ==========================================================
export const TRACKS = {
  bright: { name: '輕快', bpm: 112 },
  gentle: { name: '溫柔', bpm: 80 }
};

const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const PROG = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
// 每小節的旋律（相對和弦音的索引，-1 = 休止），八分音符一格
const MOTIF = [
  [2, -1, 1, 2, 3, -1, 2, -1],
  [1, -1, 2, 1, 0, -1, -1, -1],
  [2, -1, 3, 2, 1, -1, 0, 1],
  [0, -1, 1, 2, 1, -1, -1, -1]
];

export async function renderMusic(kind, seconds) {
  const T = TRACKS[kind] || TRACKS.bright;
  const sr = 44100, len = Math.ceil(sr * (seconds + 0.5));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, len, sr);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.55, 0);
  master.gain.setValueAtTime(0.55, Math.max(0, seconds - 2.2));
  master.gain.linearRampToValueAtTime(0.0001, seconds);
  master.connect(ctx.destination);

  const noise = ctx.createBuffer(1, sr * 0.2, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const env = (g, t, a, peak, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const bell = (t, n, v = 0.22, d = 1.1) => {
    [[1, v], [2.0, v * 0.25], [3.01, v * 0.12]].forEach(([m, vv]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(n) * m;
      env(g, t, 0.006, vv, d / m);
      o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.05);
    });
  };
  const bass = (t, n, d) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = hz(n);
    f.type = 'lowpass'; f.frequency.value = 600;
    env(g, t, 0.02, 0.3, d);
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + d + 0.05);
  };
  const pad = (t, notes, d) => {
    notes.forEach(n => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = hz(n);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + d * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.05);
    });
  };
  const shaker = (t, v = 0.05) => {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = 7000;
    env(g, t, 0.003, v, 0.06);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.12);
  };

  const beat = 60 / T.bpm, bar = beat * 4, e8 = beat / 2;
  for (let b = 0, t = 0; t < seconds; b++, t = b * bar) {
    const ch = PROG[b % 4], mo = MOTIF[b % 4];
    if (kind === 'gentle') {
      pad(t, ch.map(n => n - 12), bar * 1.1);
      bass(t, ch[0] - 24, bar * 0.9);
      [0, 1, 2, 1].forEach((k, i) => bell(t + i * beat, ch[k] + 12, 0.16, 1.6));
      if (b % 2 === 1) bell(t + 3.5 * beat, ch[2] + 24, 0.07, 1.4);
    } else {
      bass(t, ch[0] - 24, beat * 0.9); bass(t + 2 * beat, ch[0] - 24, beat * 0.9);
      for (let i = 0; i < 8; i++) {
        const k = [0, 1, 2, 1, 0, 1, 2, 1][i];
        bell(t + i * e8, ch[k], 0.07, 0.5);
        if (mo[i] >= 0) bell(t + i * e8, mo[i] === 3 ? ch[0] + 24 : ch[mo[i]] + 12, 0.15, 0.9);
        if (i % 2 === 1) shaker(t + i * e8);
      }
    }
  }
  return ctx.startRendering();
}
