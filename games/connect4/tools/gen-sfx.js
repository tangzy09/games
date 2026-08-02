// games/connect4/tools/gen-sfx.js — 零外部素材合成音效（44.1 kHz / 16 bit / mono wav）
// 用法: node games/connect4/tools/gen-sfx.js      (npm run gen:c4sfx)
// 验收: node games/connect4/tests/test-sfx.js     (npm run test:c4:sfx)
//
// ⛔ 红线（DESIGN §6.3 + §0.1）：落子音**必须自己合成**。
//    「红黄圆片 + 蓝框栅栏」是孩之宝的注册外观，实体玩具那声「咔嗒」同属它的
//    trade dress —— 所以本目录**一个外部音频素材都不许引入**，全部是这个脚本算出来的。
//    骨架抄自 games/snake/tools/gen-sfx.js（envelope / synth / tone / concat / wav 写头）。
//
// ⭐ 设计中枢：land0..land5 是**六个**音，不是一个（DESIGN §6.3「落定音随深度变调，
//    越深音越低」）。r=0 是棋盘最下面一行（render.js: `L.cellY = r => ... (H-1-r)`），
//    所以 land0 掉得最深、音最低；land5 是最上面一行、音最高。
//    ⚠ 音高梯子是 D 小调五声音阶 —— 连续落子会自然成一句旋律，而不是六个随机滴滴。

const fs = require('fs'), path = require('path');
const SR = 44100, TAU = Math.PI * 2;

// ── 基础工具 ───────────────────────────────────────────────
function render(dur, fn) {
  const n = Math.round(SR * dur), buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = fn(i / SR);
  return buf;
}
// 打击包络：极快起音 → 指数衰减 → 末尾 r 秒线性收干净（不收干净 = 截断爆音）
function perc(t, dur, tau, a = 0.0015, r = 0.012) {
  let v = t < a ? t / a : Math.exp(-(t - a) / tau);
  const rel = dur - r;
  if (t > rel) v *= Math.max(0, (dur - t) / r);
  return v;
}
// 乐音包络：慢起慢落，不刺耳
function soft(t, dur, a = 0.012, r = 0.05) {
  let v = t < a ? t / a : 1;
  const rel = dur - r;
  if (t > rel) v = Math.min(v, Math.max(0, (dur - t) / r));
  return v;
}
function concat(...bufs) {
  const out = new Float32Array(bufs.reduce((n, b) => n + b.length, 0));
  let o = 0; for (const b of bufs) { out.set(b, o); o += b.length; }
  return out;
}
function mix(...bufs) {
  const out = new Float32Array(Math.max(...bufs.map(b => b.length)));
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
}
// 峰值归一：同族音（六个 land）用同一个 peak，避免「深度变调」顺带变成「深度变响」
function norm(buf, peak = 0.8) {
  let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m > 0) { const g = peak / m; for (let i = 0; i < buf.length; i++) buf[i] *= g; }
  return buf;
}

// ── 音色 ───────────────────────────────────────────────────
// 落定「咚」：正弦基频 + 一个只活 10 ms 的八度泛音（木质起音）。
// ⚠ 泛音必须又弱又短：强了/长了，基频检测会被它拽到 2f，test-sfx.js 会当场红。
function thock(f, dur, amp = 0.62) {
  return render(dur, t => amp * perc(t, dur, dur * 0.20) *
    (Math.sin(TAU * f * t) + 0.16 * Math.exp(-t / 0.010) * Math.sin(TAU * 2 * f * t)));
}
// 乐音：正弦 + 一点点三次谐波（不至于像测试信号那么干）
function note(f, dur, amp = 0.42, a = 0.012, r = 0.05) {
  return render(dur, t => amp * soft(t, dur, a, r) *
    (Math.sin(TAU * f * t) + 0.12 * Math.sin(TAU * 3 * f * t)));
}
// 线性滑音（相位 = 2π(f0·t + (f1-f0)·t²/2dur)，同 snake）
function glide(f0, f1, dur, amp = 0.35, a = 0.004, r = 0.03) {
  return render(dur, t => amp * soft(t, dur, a, r) *
    Math.sin(TAU * (f0 + (f1 - f0) * (t / dur) / 2) * t));
}
// 反向感：振幅**先弱后强**再一刀切断（磁带倒放的听感），音高同时上扬 = 「被吸回去」
function rewind(f0, f1, dur, amp = 0.4) {
  const cut = 0.006;
  return render(dur, t => {
    const swell = Math.pow(t / dur, 1.8);
    const chop = t > dur - cut ? Math.max(0, (dur - t) / cut) : 1;
    return amp * swell * chop * Math.sin(TAU * (f0 + (f1 - f0) * (t / dur) / 2) * t);
  });
}

// ── wav 写头（44 字节 canonical PCM）─────────────────────────
function toWav(f32) {
  const n = f32.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);          // PCM, mono
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);    // rate, byterate
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);         // block align, bits
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE((Math.max(-1, Math.min(1, f32[i])) * 32767) | 0, 44 + i * 2);
  return buf;
}

// ── 音表 ───────────────────────────────────────────────────
// ⭐ 六个落定音的基频（Hz）。D 小调五声：D3 E3 G3 A3 C4 D4。
//    land0 = 最底行 = 掉得最深 = 最低；索引每 +1 抬一档。
//    ⚠ tests/test-sfx.js 里有一份**独立复制**的同一张表当黄金值 —— 改这里要一起改，
//      这正是它的用处：改错一个数字，门禁立刻红。
const LAND_HZ = [147, 165, 196, 220, 262, 294];
const LAND_DUR = 0.13;   // 一局落 20 次子，长一点点都会糊成一片

const files = {
  // 松手放开、棋子开始掉：短、轻、向下滑 —— 它只是「开始」，不许抢落定音的戏
  drop: norm(glide(760, 470, 0.06, 0.3, 0.003, 0.025), 0.5),

  // 赢：C 大三和弦上行 + 顶上八度拉长（0.56 s，DESIGN §6.5 结算必须快）
  win: norm(concat(note(523, 0.10), note(659, 0.10), note(784, 0.10),
    mix(note(1047, 0.26, 0.42, 0.008, 0.12), note(1568, 0.26, 0.16, 0.008, 0.12))), 0.85),

  // 输：⚠ DESIGN §6.6「让输不疼」。**不做**下滑的失败长号、不做小二度、不做刺耳的东西。
  //     A4 → F4 是一个**下行大三度**，落在 F 大调上 —— 听感是「嗯…好吧」，温和且已解决。
  //     慢起音 + 低音量，摆明了不是惩罚。
  lose: norm(concat(note(440, 0.16, 0.34, 0.03, 0.06),
    mix(note(349, 0.30, 0.34, 0.03, 0.14), note(175, 0.30, 0.14, 0.03, 0.14))), 0.62),

  // 双威胁：⭐ DESIGN §6.4「把最精彩的战术瞬间变成能听见的事件」。
  //     整段都在 587 Hz 以上，与最高的 land5(294) 差一个八度以上 —— 绝不会听混。
  //     ⭐ 收尾故意是**两个音同时响**（G5 + D6 纯五度）：双威胁 = 两条路，声音本身就说清楚了。
  fork: norm(concat(note(587, 0.07, 0.4, 0.004, 0.02),
    mix(note(784, 0.17, 0.36, 0.005, 0.07), note(1175, 0.17, 0.3, 0.005, 0.07))), 0.85),

  // 撤销：短、轻、反向 —— 振幅倒着涨再一刀切断，音高上扬，像被吸回去
  undo: norm(rewind(430, 660, 0.11), 0.55),
};
LAND_HZ.forEach((hz, r) => { files['land' + r] = norm(thock(hz, LAND_DUR), 0.72); });

const OUT = path.join(__dirname, '..', 'assets', 'audio');
fs.mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [name, buf] of Object.entries(files)) {
  const wav = toWav(buf);
  fs.writeFileSync(path.join(OUT, name + '.wav'), wav);
  bytes += wav.length;
}
console.log('wrote', Object.keys(files).length, 'wav (' + (bytes / 1024).toFixed(1) + ' KB) ->', OUT);
