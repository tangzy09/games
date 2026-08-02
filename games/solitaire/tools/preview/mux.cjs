// games/solitaire/tools/preview/mux.cjs — 把原片切头/编码成 App Store 预览片
//
// ⛔ **无音乐、无音效**（用户 2026-08-01 定：「视频不要音乐」）。商店预览片默认静音自动播放，
//    配乐只会抢戏。但**不能干脆没有音轨**：苹果转码段对声道较真（mono 会 FAILED
//    MOV_RESAVE_STEREO），所以铺一条**静音的立体声 AAC**——听感上完全无声，格式上最保险。
//    真要一点声音时把 --with-audio 接回来（本目录没有音轨素材，故意的）。
//
// 用法：node games/solitaire/tools/preview/mux.cjs [切头秒数]
//   不传切头秒数时**自动 blackdetect**（舞台页开场有黑幕盖住 app 初始化 + 求解器备料）。
// 规格（App Store 硬性）：886×1920 · 15–30s · ≤30fps · H.264 + AAC。
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const HERE = __dirname;
const RAW = path.join(HERE, 'preview-raw.webm');
const OUT = 'C:/tmp/solitaire/preview/fairdeal-preview-en.mp4';
const MAX = 29.5;                      // 上限 30s，留一点余量

if (!fs.existsSync(RAW)) { console.error('没有原片，先跑 capture.cjs'); process.exit(1); }

// ── ① 切头：黑幕时长 = app 初始化 + 求解器备料，每次都不一样 ⇒ 必须实测，别写死 ──
let trim = parseFloat(process.argv[2] || 'NaN');
if (!isFinite(trim)) {
  const out = execSync(
    `ffmpeg -hide_banner -nostats -i "${RAW}" -vf "blackdetect=d=0.2:pix_th=0.10" -an -f null - 2>&1`,
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const m = [...out.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)]
    .find(x => parseFloat(x[1]) < 0.5);           // 只认「从第 0 秒起的那段黑」
  // ⚠ black_end 之后仍会留**一帧**黑（实测 YAVG=16，blackdetect 的 d=0.2 抓不到单帧）
  //   ⇒ 往后多切 0.05s。首帧黑会被平台当封面取走，别留。
  trim = m ? Math.max(0, parseFloat(m[2]) + 0.05) : 0.05;
  console.log('blackdetect 切头:', trim.toFixed(2) + 's');
}

const rawDur = +execSync(
  `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${RAW}"`).toString().trim();
const dur = Math.min(MAX, rawDur - trim);
fs.mkdirSync(path.dirname(OUT), { recursive: true });

execSync([
  'ffmpeg -y -loglevel error',
  `-i "${RAW}"`,
  // 静音立体声轨（48k）——听不见，但格式上是标准的 stereo AAC
  '-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000',
  `-ss ${trim.toFixed(3)} -t ${dur.toFixed(3)}`,
  '-map 0:v -map 1:a -shortest',
  '-r 30 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow',
  '-c:a aac -b:a 96k -ar 48000 -ac 2',
  '-movflags +faststart',
  `"${OUT}"`,
].join(' '), { stdio: 'inherit' });

// ── ② 回读校验（别信「编码成功」四个字）──
const probe = JSON.parse(execSync(
  `ffprobe -v quiet -print_format json -show_streams -show_format "${OUT}"`).toString());
const v = probe.streams.find(s => s.codec_type === 'video');
const a = probe.streams.find(s => s.codec_type === 'audio');
const d = +probe.format.duration;
console.log(`成片 → ${OUT}`);
console.log(`  ${v.width}×${v.height} · ${v.codec_name} · ${eval(v.r_frame_rate)}fps · ${d.toFixed(1)}s`
  + ` · ${(probe.format.size / 1048576).toFixed(1)}MB · 音轨 ${a ? a.codec_name + ' ' + a.channels + 'ch（静音）' : '无'}`);
let bad = 0;
if (v.width !== 886 || v.height !== 1920) { console.error('⛔ 分辨率不是 886×1920'); bad = 1; }
if (d < 15 || d > 30) { console.error('⛔ 时长不在 15–30s'); bad = 1; }
if (eval(v.r_frame_rate) > 30) { console.error('⛔ 帧率超过 30'); bad = 1; }
if (!a || a.channels !== 2) { console.error('⛔ 音轨不是立体声（苹果转码会 FAILED MOV_RESAVE_STEREO）'); bad = 1; }
process.exit(bad);
