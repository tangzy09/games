// games/snake/tools/preview/mux.cjs — 给原片配音并编码成 App Store 预览片
//
// 做三件事：① 合成一段 kawaii 琶音 BGM（零外部素材，同 tools/gen-sfx.js 的老规矩）
//          ② 按 capture 出的 sfx.json 时间戳把**游戏自己的音效 wav** 铺上去
//          ③ 切掉黑幕头、ducking、-14 LUFS、H.264/yuv420p/30fps → 886×1920 mp4
// 用法：node games/snake/tools/preview/mux.cjs [切头秒数]
//
// ⚠ 无头浏览器录不到声音 ⇒ 音轨必须在这里另铺（这是整条管线的设计前提）。
// ⚠ App Store 预览片硬性要求：**15–30 秒**、H.264/HEVC、槽位分辨率一致（6.7" = 886×1920 竖版）。
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const HERE = __dirname;
const SNAKE = path.resolve(HERE, '../..');
// ⚠ 切头秒数 = 黑幕时长（盖住 app 初始化预滚）。改舞台页的等待时长后要重测：
//    ffmpeg -i preview-raw.webm -vf blackdetect=d=0.2:pix_th=0.10 -an -f null -
const TRIM = parseFloat(process.argv[2] || '2.45');
const DUR = 24.0;

// ── ① 合成 BGM：C5-E5-G5-A5-G5-E5 八分琶音 + 低八度垫底（正弦 + 指数衰减）──
const SR = 44100, N = Math.ceil((DUR + TRIM + 1) * SR);
const buf = new Float32Array(N);
const seq = [523.25, 659.25, 783.99, 880.0, 783.99, 659.25];
for (let k = 0; k * 0.25 < DUR; k++) {
  const f = seq[k % seq.length], n0 = Math.floor(k * 0.25 * SR), len = Math.floor(0.24 * SR);
  const amp = (k % 12 === 0) ? 0.26 : 0.19;
  for (let i = 0; i < len && n0 + i < N; i++) {
    const t = i / SR;
    buf[n0 + i] += amp * Math.exp(-t * 9) * Math.sin(2 * Math.PI * f * t);
  }
}
for (let b = 0; b * 2 < DUR; b++) {
  const f = (b % 2 === 0) ? 261.63 : 220.0, n0 = Math.floor(b * 2 * SR), len = Math.floor(1.9 * SR);
  for (let i = 0; i < len && n0 + i < N; i++) {
    const t = i / SR;
    buf[n0 + i] += 0.09 * Math.min(t * 8, 1) * Math.exp(-t * 1.2) * Math.sin(2 * Math.PI * f * t);
  }
}
const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write('data', 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, buf[i]));
  pcm.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}
const BGM = path.join(HERE, 'bgm.wav');
fs.writeFileSync(BGM, pcm);

// ── ② 游戏自己的音效按时间戳铺轨 ──
const sfxList = JSON.parse(fs.readFileSync(path.join(HERE, 'sfx.json'), 'utf8'));
const inputs = [`-i "${path.join(HERE, 'preview-raw.webm')}"`, `-i "${BGM}"`];
const legs = [];
sfxList.forEach((s, i) => {
  const w = path.join(SNAKE, 'assets/audio', s.type + '.wav');
  if (!fs.existsSync(w)) return;
  inputs.push(`-i "${w}"`);
  const idx = inputs.length - 1;
  // ⚠ sfx 的时间戳是**相对 t0（黑幕掀开那一刻）**，而 -ss 是在滤镜之后砍掉前 TRIM 秒 ⇒
  //   这里要 **+TRIM**（写成 -TRIM 的话所有音效会提前两倍 TRIM、全糊在开头）。
  legs.push({ idx, t: s.t + TRIM });
});
// 每条音效延迟到位、提一点音量；BGM 走 sidechain 之外的固定低音量（片子只有 24s，不做复杂 ducking）
const fc = [];
fc.push('[1:a]volume=0.55[bgm]');
legs.forEach((l, i) => fc.push(`[${l.idx}:a]adelay=${Math.round(l.t * 1000)}|${Math.round(l.t * 1000)},volume=1.25[s${i}]`));
const mixIn = ['[bgm]'].concat(legs.map((_, i) => `[s${i}]`)).join('');
fc.push(`${mixIn}amix=inputs=${legs.length + 1}:duration=first:dropout_transition=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);

const OUT = 'C:/tmp/snake/preview/snake-preview-en.mp4';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const cmd = [
  'ffmpeg -y -loglevel error',
  inputs.join(' '),
  `-filter_complex "${fc.join(';')}"`,
  `-map 0:v -map "[aout]"`,
  `-ss ${TRIM} -t ${DUR}`,   // ⚠ 切头后仍要留满 DUR，写 DUR-TRIM 会砍掉片尾结尾卡
  '-r 30 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow',
  '-c:a aac -b:a 160k -movflags +faststart',
  `"${OUT}"`,
].join(' ');
execSync(cmd, { stdio: 'inherit' });

const probe = JSON.parse(execSync(
  `ffprobe -v quiet -print_format json -show_streams -show_format "${OUT}"`).toString());
const v = probe.streams.find(s => s.codec_type === 'video');
const a = probe.streams.find(s => s.codec_type === 'audio');
console.log(`成片 → ${OUT}`);
console.log(`  ${v.width}×${v.height} · ${v.codec_name} · ${(+probe.format.duration).toFixed(1)}s`
  + ` · ${(probe.format.size / 1048576).toFixed(1)}MB · 音轨 ${a ? a.codec_name : '无'}`);
const d = +probe.format.duration;
if (d < 15 || d > 30) console.error('⛔ 时长 ' + d.toFixed(1) + 's 不在 App Store 要求的 15–30s 内');
