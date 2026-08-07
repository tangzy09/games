// ════════════════════════════════════════
// test-sfx.js —— `tools/gen-sfx.js` 产物（assets/audio/*.wav）的门禁。
//
// ⛔ 这条门禁**不是**「文件存在吗」。它守的是 DESIGN §6.3 的那个手感承诺：
//    **落定音随深度变调，掉得越深音越低。** 一局落 20 次子，这六个音是这个游戏
//    唯一的节奏来源；两个音撞了、梯子反了、或者某个 wav 悄悄变成静音，
//    肉眼看目录是**看不出来的**（六个文件都在、大小还一样）。
//    所以这里真的把 wav 解开、反查基频、逐对比较。
//
// 方法：Goertzel 扫频（粗 1 Hz → 细 0.02 Hz）取幅度谱峰。
//   ⚠ 分析窗从 12 ms 起 —— 前 10 ms 是 gen-sfx.js 那个八度起音泛音，
//     从头算会有落到 2f 的八度误判风险。
//
// 用法: node games/connect4/tests/test-sfx.js   (npm run test:c4:sfx)
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets', 'audio');
const TAU = Math.PI * 2;

// ⭐ 黄金值：与 tools/gen-sfx.js 里的 LAND_HZ **独立的一份复制**（D 小调五声 D3 E3 G3 A3 C4 D4）。
//    故意不 require 那个脚本 —— 从生成器读表就成了自我印证，改错数字照样绿。
const LAND_GOLD = [147, 165, 196, 220, 262, 294];
// 每个音的时长预算（秒）。wav 要进包，⛔ 别让谁哪天顺手做出一个 3 秒的庆祝音。
const DUR_MAX = { drop: 0.10, land: 0.20, fork: 0.35, brilliant: 0.40, win: 0.70, lose: 0.60, undo: 0.20 };
const DUR_MIN = 0.04;
const RMS_MIN = 0.02;   // 低于这个基本就是静音/几乎静音
const TOTAL_KB_MAX = 400;

// ── wav 解析（只认 gen-sfx.js 写的 canonical 44 字节 PCM 头，别的一律当错）──
function readWav(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.toString('ascii', 0, 4), 'RIFF', file + ': 不是 RIFF');
  assert.strictEqual(b.toString('ascii', 8, 12), 'WAVE', file + ': 不是 WAVE');
  assert.strictEqual(b.toString('ascii', 12, 16), 'fmt ', file + ': 缺 fmt 块');
  const fmt = {
    audioFormat: b.readUInt16LE(20), channels: b.readUInt16LE(22),
    sampleRate: b.readUInt32LE(24), bits: b.readUInt16LE(34),
  };
  assert.strictEqual(b.toString('ascii', 36, 40), 'data', file + ': 缺 data 块');
  const nBytes = b.readUInt32LE(40);
  assert.strictEqual(44 + nBytes, b.length, file + ': data 长度与文件大小不符（写头算错了）');
  const n = nBytes / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { fmt, x, bytes: b.length };
}

// ── Goertzel：单频幅度 ──
function goertzel(x, from, to, f, sr) {
  const w = TAU * f / sr, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = from; i < to; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
}
// 幅度谱峰 = 基频估计。skip 秒后起算，最多分析 span 秒（加 Hann 窗抑制旁瓣）。
function fundamental(x, sr, { lo = 60, hi = 1200, skip = 0.012, span = 0.09 } = {}) {
  const from = Math.round(skip * sr);
  const to = Math.min(x.length, from + Math.round(span * sr));
  assert.ok(to - from > sr * 0.02, '样本太短，没法估基频');
  const seg = new Float32Array(to - from), N = to - from;
  for (let i = 0; i < N; i++) seg[i] = x[from + i] * (0.5 - 0.5 * Math.cos(TAU * i / (N - 1)));
  let best = lo, bestMag = -1;
  for (let f = lo; f <= hi; f += 1) {
    const m = goertzel(seg, 0, N, f, sr);
    if (m > bestMag) { bestMag = m; best = f; }
  }
  for (let f = best - 1.5; f <= best + 1.5; f += 0.02) {
    const m = goertzel(seg, 0, N, f, sr);
    if (m > bestMag) { bestMag = m; best = f; }
  }
  return best;
}
function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }

// ═══ 1. 十一个文件都在，格式全部是 44.1 kHz / 16 bit / mono PCM ═══
const NAMES = ['drop', 'fork', 'brilliant', 'win', 'lose', 'undo', ...LAND_GOLD.map((_, r) => 'land' + r)];
const wavs = {};
let totalBytes = 0;
for (const name of NAMES) {
  const file = path.join(DIR, name + '.wav');
  assert.ok(fs.existsSync(file), '缺 ' + name + '.wav —— 先跑 npm run gen:c4sfx');
  const w = readWav(file);
  wavs[name] = w; totalBytes += w.bytes;
  assert.strictEqual(w.fmt.audioFormat, 1, name + ': 必须是未压缩 PCM');
  assert.strictEqual(w.fmt.channels, 1, name + ': 必须单声道（音效双声道纯属白占一倍体积）');
  assert.strictEqual(w.fmt.sampleRate, 44100, name + ': 采样率必须 44100');
  assert.strictEqual(w.fmt.bits, 16, name + ': 位深必须 16');
}
console.log('test-sfx: ' + NAMES.length + ' 个 wav 格式 44.1kHz/16bit/mono OK，共 ' + (totalBytes / 1024).toFixed(1) + ' KB');
assert.ok(totalBytes / 1024 < TOTAL_KB_MAX,
  '音效总体积 ' + (totalBytes / 1024).toFixed(1) + ' KB 超预算 —— 这些 wav 是要进包的');

// ═══ 2. 时长在预算内 + 不是静音 ═══
for (const name of NAMES) {
  const w = wavs[name];
  const dur = w.x.length / w.fmt.sampleRate;
  const cap = DUR_MAX[name.startsWith('land') ? 'land' : name];
  assert.ok(dur <= cap, name + ': 时长 ' + dur.toFixed(3) + 's 超预算 ' + cap + 's');
  assert.ok(dur >= DUR_MIN, name + ': 时长 ' + dur.toFixed(3) + 's 太短，听不见');
  const r = rms(w.x);
  assert.ok(r > RMS_MIN, '⛔ ' + name + ' 的 RMS 只有 ' + r.toFixed(4) + ' —— 这是个（近似）静音文件');
}
console.log('test-sfx: 时长预算 + 非静音 OK');

// ═══ 3. ⭐⭐ 六个 land 的基频：随深度单调下降（land0 最底行 = 最低） ═══
// r=0 是棋盘最下面一行（render.js: cellY = r => ... (H-1-r)），掉得最深 ⇒ 音最低。
// 所以按索引看是**严格递增**，按深度看就是 DESIGN §6.3 的「越深音越低」。
const measured = LAND_GOLD.map((_, r) => fundamental(wavs['land' + r].x, 44100, { lo: 80, hi: 900 }));
console.log('test-sfx: land 实测基频 = [' + measured.map(f => f.toFixed(2)).join(', ') + '] Hz');
console.log('test-sfx: land 黄金基频 = [' + LAND_GOLD.join(', ') + '] Hz');

// 3a. 每个都落在黄金值 ±3% 内（音高梯子被改坏 / 文件被换掉，这里先红）
for (let r = 0; r < LAND_GOLD.length; r++) {
  const err = Math.abs(measured[r] - LAND_GOLD[r]) / LAND_GOLD[r];
  assert.ok(err < 0.03, '⛔ land' + r + ' 实测 ' + measured[r].toFixed(2) + ' Hz，' +
    '与黄金值 ' + LAND_GOLD[r] + ' Hz 差 ' + (err * 100).toFixed(1) + '% —— 这个音不是它该是的那个');
}

// 3b. ⭐ 严格单调 + 每档至少高 6%（≈1 个全音）。
//     ⛔ 这条就是「把两个 land 换成同一个文件」时当场红的那条：比值 1.00 < 1.06。
const MIN_RATIO = 1.06;
for (let r = 1; r < measured.length; r++) {
  const ratio = measured[r] / measured[r - 1];
  assert.ok(ratio >= MIN_RATIO,
    '⛔ land' + r + '(' + measured[r].toFixed(2) + ' Hz) 相对 land' + (r - 1) +
    '(' + measured[r - 1].toFixed(2) + ' Hz) 只高了 ' + ((ratio - 1) * 100).toFixed(1) + '%' +
    '（要求 ≥ ' + ((MIN_RATIO - 1) * 100).toFixed(0) + '%）—— ' +
    'DESIGN §6.3 的「落定音随深度变调」没兑现：这两档玩家分不出来');
}
// 3c. 首尾至少差一个八度：整条梯子的跨度要真的听得出来
assert.ok(measured[5] / measured[0] >= 1.8,
  '⛔ 最上一行与最底行只差 ' + (measured[5] / measured[0]).toFixed(2) + ' 倍，梯子太平');
console.log('test-sfx: ⭐ 六个 land 基频随深度严格单调下降（跨度 ' +
  (measured[5] / measured[0]).toFixed(2) + '×）OK');

// ═══ 4. fork 必须明显区别于落子音（DESIGN §6.4：一个能听见的事件）═══
const forkF = fundamental(wavs.fork.x, 44100, { lo: 200, hi: 2000, skip: 0.005, span: 0.06 });
console.log('test-sfx: fork 首音基频 = ' + forkF.toFixed(2) + ' Hz');
assert.ok(forkF > measured[5] * 1.6,
  '⛔ fork(' + forkF.toFixed(0) + ' Hz) 没有明显高于最高的 land5(' + measured[5].toFixed(0) + ' Hz)' +
  ' —— 双威胁的音听起来会像又落了一子，那这个「事件」就白做了');

// ═══ 4b. ⭐ 妙手音必须**听得出**不是 fork（P3 T4 · DESIGN §3.4）═══
// ⛔ 妙手最初是**借用** fork 音的，两件不同的事听起来一样：玩家分不清，
//    而且它污染了 e2e-p2b-t5 那条「fork 音恰好响一次」的门禁（2026-08-06 实锤）。
// ⇒ 现在它有自己的音，这里把「听得出区别」钉死：首音基频至少差 25%。
const brilF = fundamental(wavs.brilliant.x, 44100, { lo: 200, hi: 2400, skip: 0.005, span: 0.04 });
console.log('test-sfx: brilliant 首音基频 = ' + brilF.toFixed(2) + ' Hz（fork = ' + forkF.toFixed(2) + '）');
assert.ok(Math.abs(brilF - forkF) / forkF > 0.25,
  '⛔ brilliant(' + brilF.toFixed(0) + ' Hz) 与 fork(' + forkF.toFixed(0) + ' Hz) 太接近'
  + ' —— 双威胁与妙手是**两件不同的事**，听起来一样等于没做区分');
assert.ok(brilF > measured[5] * 1.6,
  '⛔ brilliant 也必须明显高于最高的 land5，否则听起来像又落了一子');
console.log('test-sfx: ⭐ brilliant 与 fork 听得出区别（差 '
  + (Math.abs(brilF - forkF) / forkF * 100).toFixed(0) + '%）OK');

// ═══ 5. ⚠ lose 不许是惩罚性的（DESIGN §6.6 让「输」不疼）═══
// 判据取能量：lose 的 RMS 必须明显低于 win —— 输的时候不该比赢还响。
const lr = rms(wavs.lose.x), wr = rms(wavs.win.x);
assert.ok(lr < wr, '⛔ lose 的 RMS(' + lr.toFixed(3) + ') 不低于 win(' + wr.toFixed(3) + ')' +
  ' —— DESIGN §6.6：输局的音不许是个惩罚');
console.log('test-sfx: lose RMS ' + lr.toFixed(3) + ' < win RMS ' + wr.toFixed(3) + ' OK');

// ═══ 6. 接线：index.html 的 GAME_CONFIG.sfx 必须把这 11 个都指对 ═══
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const name of NAMES) {
  const re = new RegExp('\\b' + name + '\\s*:\\s*[\'"]assets/audio/' + name + '\\.wav[\'"]');
  assert.ok(re.test(html), '⛔ index.html 的 GAME_CONFIG.sfx 里没有 ' + name +
    ' → assets/audio/' + name + '.wav —— 合成了但没接上，Sfx.play(\'' + name + '\') 会静默什么都不做');
}
console.log('test-sfx: GAME_CONFIG.sfx ' + NAMES.length + ' 条接线 OK');

console.log('test-sfx: 全部通过');
