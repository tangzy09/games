#!/usr/bin/env node
// gen-bgm.cjs — 合成 BGM（零素材、零版权）。
// 音乐盒音色 = 基频 + 3/5 次谐波 + 指数快衰减；和声走 I-V-vi-IV（C-G-Am-F）。
// ⚠ App Preview 的音轨**必须立体声**（mono AAC 会在苹果转码段 FAILED MOV_RESAVE_STEREO）。
'use strict';
const fs = require('fs');
const path = require('path');

const SR = 44100, BPM = 96, DUR = 30;          // 30s（片子最长 30s）
const beat = 60 / BPM;
const n = Math.floor(SR * DUR);
const L = new Float32Array(n), R = new Float32Array(n);

// C 大调，I-V-vi-IV
const CHORDS = [
  [261.63, 329.63, 392.00],   // C
  [196.00, 246.94, 392.00],   // G
  [220.00, 261.63, 329.63],   // Am
  [174.61, 220.00, 261.63],   // F
];

function note(freq, t0, dur, amp, pan) {
  const s0 = Math.floor(t0 * SR), s1 = Math.min(n, Math.floor((t0 + dur) * SR));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR;
    const env = Math.exp(-t / (dur * 0.28));                     // 音乐盒的快衰减
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 4.5 * t);     // 微颤音
    const w = Math.sin(2 * Math.PI * freq * vib * t)
            + 0.34 * Math.sin(2 * Math.PI * freq * 3 * t)        // 3 次谐波
            + 0.14 * Math.sin(2 * Math.PI * freq * 5 * t);       // 5 次谐波
    const v = w * env * amp;
    const pl = Math.cos((pan + 1) * Math.PI / 4), pr = Math.sin((pan + 1) * Math.PI / 4);
    L[i] += v * pl; R[i] += v * pr;
  }
}
function pad(freq, t0, dur, amp) {                                // 低八度垫底
  const s0 = Math.floor(t0 * SR), s1 = Math.min(n, Math.floor((t0 + dur) * SR));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR, k = t / dur;
    const env = Math.sin(Math.PI * Math.min(1, k)) * amp;
    const v = Math.sin(2 * Math.PI * freq * t) * env;
    L[i] += v; R[i] += v;
  }
}
function shaker(t0, amp) {                                        // 反拍轻沙锤
  const s0 = Math.floor(t0 * SR), s1 = Math.min(n, s0 + Math.floor(0.05 * SR));
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR;
    const v = (Math.random() * 2 - 1) * Math.exp(-t / 0.012) * amp;
    L[i] += v * 0.8; R[i] += v;
  }
}

let t = 0, bar = 0;
while (t < DUR - beat * 4) {
  const ch = CHORDS[bar % 4];
  pad(ch[0] / 2, t, beat * 4, 0.045);                             // 低八度垫
  // 八分音符琶音：上行再回落
  const seq = [0, 1, 2, 1, 2, 1, 0, 1];
  for (let i = 0; i < 8; i++) {
    const f = ch[seq[i]] * (i === 6 ? 2 : 1);                     // 末拍点缀高八度
    note(f, t + i * beat / 2, beat * 0.85, 0.085, (i % 2 ? 0.25 : -0.25));
  }
  for (let i = 0; i < 4; i++) shaker(t + i * beat + beat / 2, 0.02);   // 反拍
  t += beat * 4; bar++;
}

// 写 16bit stereo WAV（44 字节头手拼）
const bytes = n * 4;
const buf = Buffer.alloc(44 + bytes);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);                                          // ⭐ 2 声道（stereo，苹果硬要求）
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(bytes, 40);
const clip = v => Math.max(-1, Math.min(1, v));
for (let i = 0; i < n; i++) {
  buf.writeInt16LE(Math.round(clip(L[i]) * 32767 * 0.9), 44 + i * 4);
  buf.writeInt16LE(Math.round(clip(R[i]) * 32767 * 0.9), 44 + i * 4 + 2);
}
const out = process.argv[2] || path.join(__dirname, 'bgm.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`BGM -> ${out}  (${DUR}s, stereo ${SR}Hz, ${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
