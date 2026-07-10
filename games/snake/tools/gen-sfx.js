// games/snake/tools/gen-sfx.js — 合成音效 wav(44.1kHz 16bit mono)
// 用法: node games/snake/tools/gen-sfx.js
const fs = require('fs'), path = require('path');
const SR = 44100;

function envelope(t, dur, a = 0.005, r = 0.08) {
  if (t < a) return t / a;
  const rel = dur - r;
  return t > rel ? Math.max(0, 1 - (t - rel) / r) : 1;
}
function synth(dur, fn) {
  const n = Math.round(SR * dur), buf = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / SR; buf[i] = fn(t) * envelope(t, dur); }
  return buf;
}
// f0→f1 线性滑音正弦
function tone(f0, f1, dur) {
  return synth(dur, t => Math.sin(2 * Math.PI * (f0 + (f1 - f0) * (t / dur) / 2) * t) * 0.5);
}
function concat(...bufs) {
  let n = 0; bufs.forEach(b => { n += b.length; });
  const out = new Float32Array(n); let o = 0;
  bufs.forEach(b => { out.set(b, o); o += b.length; });
  return out;
}
function toWav(f32) {
  const n = f32.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE((Math.max(-1, Math.min(1, f32[i])) * 32767) | 0, 44 + i * 2);
  return buf;
}

const OUT = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(OUT, { recursive: true });
const files = {
  eat:       tone(520, 780, 0.09),                                        // 啵
  special:   concat(tone(660, 660, 0.07), tone(880, 880, 0.1)),           // 叮咚
  shield:    concat(tone(990, 990, 0.06), tone(1320, 1320, 0.12)),        // 护盾铃
  milestone: concat(tone(523, 523, 0.08), tone(659, 659, 0.08), tone(784, 784, 0.12)),
  level:     concat(tone(523, 523, 0.1), tone(659, 659, 0.1), tone(784, 784, 0.1), tone(1047, 1047, 0.22)),
  death:     tone(300, 90, 0.35),                                         // 软下滑
};
for (const [name, buf] of Object.entries(files))
  fs.writeFileSync(path.join(OUT, name + '.wav'), toWav(buf));
console.log('wrote', Object.keys(files).length, 'wav ->', OUT);
