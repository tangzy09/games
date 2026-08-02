// games/snake/tools/preview/music.cjs — 给预览片合成 BGM（零外部素材，纯 JS 算 PCM）
//
// ⚠ 第一版是「六个音的琶音死循环 + 一个低音垫」——听 5 秒就腻，用户一句「音乐不行」打回。
//   问题不在音色，在**没有音乐结构**：没有和声进行、没有旋律、没有段落起伏、单声道。
//
// 这一版按真正的编曲思路来：
//   ① **和声进行** I–V–vi–IV（C–G–Am–F，流行里最抓耳的那条）×2，末段 F–G–C 收束；
//   ② **四个声部**：pad（铺底）· bell（音乐盒主旋律）· bass（每小节根音）· sparkle（高音点缀）；
//   ③ **段落起伏**：前 2 小节只有 pad+bass（留白）→ 主旋律进 → 后半加八度与点缀 → 结尾解决到主和弦；
//   ④ **立体声**：两声道用不同的微失谐与延时，铺开声场（单声道听着就是「手机铃声」）；
//   ⑤ 包络认真做（attack/decay/release），主输出 tanh 软限幅 + 首尾淡入淡出。
const A4 = 440;
/** 音名 → 频率（'C4' / 'F#5' / 'A3'）*/
function f(note) {
  const m = note.match(/^([A-G])(#|b)?(-?\d)$/);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const midi = 12 * (parseInt(m[3], 10) + 1) + base + acc;
  return A4 * Math.pow(2, (midi - 69) / 12);
}

const BPM = 88, BEAT = 60 / BPM, BAR = BEAT * 4;   // 一小节 ≈ 2.727s

// 和声进行：I–V–vi–IV ×2 → C（解决到主和弦）。每项 = [根音, 和弦音...]
// ⚠ **小节数要按片长倒推**：88BPM 一小节 2.727s，24s 的片子最多 8.8 小节。
//   第一版写了 11 小节，末尾那个解决和弦根本没进片子 —— 听着像被掐断（实测频谱抓到）。
const PROG = [
  ['C3', 'C4', 'E4', 'G4'], ['G2', 'B3', 'D4', 'G4'], ['A2', 'A3', 'C4', 'E4'], ['F2', 'F3', 'A3', 'C4'],
  ['C3', 'C4', 'E4', 'G4'], ['G2', 'B3', 'D4', 'G4'], ['A2', 'A3', 'C4', 'E4'], ['G2', 'G3', 'B3', 'D4'],
  ['C3', 'C4', 'E4', 'G4'],
];
// 音乐盒主旋律：[小节, 拍(0-3.5), 音名, 时值(拍)]。五声骨架，第二遍升八度并改尾句。
// ⚠ 段落要**对着片子的六幕**排：bar0-1 留白（揭图幕）· bar2-3 主题 A（苹果幕）·
//   bar4 抬一层（过关幕）· bar5-6 主题 B 升八度（图鉴幕）· bar7 推进（皮肤幕）· bar8 解决（结尾卡）。
const MEL = [
  [2, 0, 'G4', 1], [2, 1, 'E4', 0.5], [2, 1.5, 'G4', 0.5], [2, 2, 'A4', 1], [2, 3, 'G4', 1],
  [3, 0, 'D4', 1], [3, 1, 'E4', 1], [3, 2, 'G4', 2],
  [4, 0, 'A4', 1], [4, 1, 'C5', 0.5], [4, 1.5, 'A4', 0.5], [4, 2, 'G4', 2],
  [5, 0, 'G5', 1], [5, 1, 'E5', 0.5], [5, 1.5, 'G5', 0.5], [5, 2, 'A5', 1], [5, 3, 'G5', 1],
  [6, 0, 'D5', 1], [6, 1, 'E5', 1], [6, 2, 'G5', 2],
  [7, 0, 'A5', 1], [7, 1, 'G5', 0.5], [7, 1.5, 'E5', 0.5], [7, 2, 'D5', 1], [7, 3, 'E5', 1],
  [8, 0, 'C5', 4], [8, 0, 'C6', 4],
];

/**
 * 合成 BGM。
 * @param {number} dur 秒
 * @param {number} sr  采样率
 * @returns {Buffer} 16bit 立体声 WAV
 */
function render(dur = 27, sr = 44100) {
  const N = Math.ceil(dur * sr);
  const L = new Float32Array(N), R = new Float32Array(N);

  /** 加一个音：主音 + 泛音，指数衰减；det = 左右微失谐（分音） */
  const add = (t0, len, freq, amp, harm, decay, det = 0) => {
    const n0 = Math.floor(t0 * sr), n = Math.floor(len * sr);
    for (let i = 0; i < n && n0 + i < N; i++) {
      if (n0 + i < 0) continue;
      const t = i / sr;
      const atk = Math.min(1, t / 0.008);                    // 8ms attack，防爆音
      const env = atk * Math.exp(-t * decay);
      let sL = 0, sR = 0;
      for (let h = 0; h < harm.length; h++) {
        const w = harm[h], fr = freq * (h + 1);
        sL += w * Math.sin(2 * Math.PI * fr * (1 - det) * t);
        sR += w * Math.sin(2 * Math.PI * fr * (1 + det) * t);
      }
      L[n0 + i] += amp * env * sL;
      R[n0 + i] += amp * env * sR;
    }
  };

  PROG.forEach((chord, bar) => {
    const t = bar * BAR;
    // bass：每小节根音（长音，慢衰减）
    add(t, BAR, f(chord[0]), 0.16, [1, 0.18], 1.1, 0.0008);
    // pad：和弦音铺底（很轻、衰减慢，声场拉开）
    chord.slice(1).forEach((nt, k) => add(t + k * 0.02, BAR * 1.02, f(nt), 0.055, [1, 0.35, 0.12], 0.85, 0.004));
    // 律动：二、四拍的轻切分（前两小节留白，让开场安静）
    if (bar >= 2) {
      [1, 3].forEach(b => add(t + b * BEAT, BEAT * 0.5, f(chord[2]), 0.045, [1, 0.5], 7, 0.006));
    }
    // sparkle：后半段加高音点缀
    if (bar >= 5 && bar <= 9) {
      [0.5, 2.5].forEach(b => add(t + b * BEAT, 0.5, f(chord[3]) * 2, 0.035, [1], 9, 0.01));
    }
  });

  // 音乐盒主旋律（sine 为主 + 少量三次泛音，衰减快 ⇒ 像 celesta / 八音盒）
  MEL.forEach(([bar, beat, note, len]) => {
    const t = bar * BAR + beat * BEAT;
    add(t, Math.min(len * BEAT * 1.6, 2.2), f(note), 0.30, [1, 0.10, 0.22, 0.05], 2.6, 0.0025);
    add(t, Math.min(len * BEAT * 1.2, 1.6), f(note) * 2, 0.06, [1], 4.5, 0.005);   // 亮一层八度
  });

  // 主输出：软限幅 + 淡入淡出
  const out = Buffer.alloc(44 + N * 4);
  out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(N * 4, 40);
  const fadeIn = 0.5 * sr, fadeOut = 1.6 * sr;
  for (let i = 0; i < N; i++) {
    let g = 1;
    if (i < fadeIn) g = i / fadeIn;
    if (i > N - fadeOut) g = Math.max(0, (N - i) / fadeOut);
    const l = Math.tanh(L[i] * 1.15) * g, r = Math.tanh(R[i] * 1.15) * g;
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32000), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32000), 44 + i * 4 + 2);
  }
  return out;
}

/** 吃果子的上行音阶音（和游戏内 WebAudio 那条一致：大调 7 音 × 3 八度，20 级封顶）*/
function eatTone(step, sr = 44100) {
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const i = ((step % 20) + 20) % 20;
  const semis = SCALE[i % 7] + 12 * Math.floor(i / 7);
  const freq = 261.63 * Math.pow(2, semis / 12);
  const dur = 0.36, N = Math.ceil(dur * sr);
  const out = Buffer.alloc(44 + N * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + N * 2, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(N * 2, 40);
  for (let n = 0; n < N; n++) {
    const t = n / sr, env = Math.min(1, t / 0.006) * Math.exp(-t * 7);
    const s = Math.sin(2 * Math.PI * freq * t) + 0.32 * Math.sin(2 * Math.PI * freq * 2 * t);
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * env * 0.5)) * 32000), 44 + n * 2);
  }
  return out;
}

module.exports = { render, eatTone, BAR, BPM };
