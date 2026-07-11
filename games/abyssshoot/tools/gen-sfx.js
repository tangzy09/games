// games/abyssshoot/tools/gen-sfx.js — 合成 6 个音效 wav(44.1kHz 16bit mono,零外部素材)
// 用法: node games/abyssshoot/tools/gen-sfx.js   (产物入库,改了才需重跑)
// 深海主题:水润、柔和、带气泡感。
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
// f0→f1 滑音正弦
function tone(f0, f1, dur, amp = 0.5) {
  return synth(dur, t => Math.sin(2 * Math.PI * (f0 + (f1 - f0) * (t / dur) / 2) * t) * amp);
}
// 气泡:快速上滑 + 轻微颤音
function bubble(f0, f1, dur, amp = 0.45) {
  return synth(dur, t => {
    const f = f0 + (f1 - f0) * (t / dur);
    const vib = 1 + 0.05 * Math.sin(2 * Math.PI * 28 * t);
    return Math.sin(2 * Math.PI * f * vib * t) * amp;
  });
}
function noise(dur, amp = 0.3) {
  // 确定性伪随机(不用 Math.random,保证每次生成的 wav 字节一致、可复现)
  let x = 123456789;
  return synth(dur, () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return ((x / 0x7fffffff) * 2 - 1) * amp; });
}
function mix(...bufs) {
  const n = Math.max(...bufs.map(b => b.length));
  const out = new Float32Array(n);
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
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

const SFX = {
  shoot:   bubble(320, 620, 0.10, 0.40),                          // 发射:短促上冒气泡
  merge:   mix(tone(520, 780, 0.14, 0.42), bubble(700, 980, 0.12, 0.20)),  // 合并:清亮上扬
  chain:   concat(tone(600, 820, 0.09, 0.38), tone(820, 1100, 0.09, 0.38),
                  tone(1100, 1450, 0.11, 0.36)),                  // 连锁:三段递进(越连越高)
  spawn:   mix(tone(200, 150, 0.16, 0.34), noise(0.10, 0.06)),    // 刷行:低沉下压
  newfish: concat(tone(660, 880, 0.10, 0.40), tone(880, 1320, 0.16, 0.42)), // 新最深鱼:欢快两段
  death:   mix(tone(260, 70, 0.55, 0.48), noise(0.30, 0.10)),     // 死亡:下坠闷响
};

for (const [name, buf] of Object.entries(SFX)) {
  const f = path.join(OUT, name + '.wav');
  fs.writeFileSync(f, toWav(buf));
  console.log('写出', f, fs.statSync(f).size, 'bytes');
}
console.log('gen-sfx OK — 6 个音效已生成');
