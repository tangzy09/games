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
  // ⛔ **背景在闪**（用户 2026-08-01 实际看片反馈，实测确认）：牌桌是一整片平滑绿渐变，
  //   而 Chrome recordVideo 出的 webm 本身是 VP8 有损 —— 静止画面上每帧的量化噪声不同，
  //   平坦大色块就会**逐帧微微跳亮度**（实测同一块 60×60 felt：帧间跳变 >0.15 的有 118 帧）。
  //   ⚠ 不是我们这道 x264 的锅：crf 20/16/14 三档实测完全一样（所以别靠调 crf 去治）。
  //   解法 = **只做时间域降噪**（空间域给 0，一点不糊）：hqdn3d 把逐帧噪声抹平 ⇒ 118 → 8 帧。
  //   实拍对照过滑牌那一帧：牌面与文字锐度无差别。
  '-vf "fps=30,hqdn3d=0:0:6:6"',
  '-c:v libx264 -profile:v high -pix_fmt yuv420p -crf 18 -preset slow',
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
// ⭐ 闪烁门禁：在两块**应该恒定**的牌桌区域上量逐帧亮度跳变。平坦大色块的闪烁肉眼一眼能看出来，
//   但「编码成功」四个字看不出来 —— 用户就是这么发现的，所以把它写成可执行的检查。
function flickerFrames(crop) {
  const out = execSync(
    `ffmpeg -hide_banner -nostats -i "${OUT}" -vf "crop=${crop},signalstats,metadata=print:key=lavfi.signalstats.YAVG" -f null - 2>&1`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ys = [...out.matchAll(/YAVG=([\d.]+)/g)].map(m => +m[1]);
  let n = 0;
  for (let i = 1; i < ys.length; i++) if (Math.abs(ys[i] - ys[i - 1]) > 0.15) n++;   // 场景切换本身也会计入几帧
  return n;
}
const fa = flickerFrames('60:60:24:1180'), fb = flickerFrames('200:200:640:1000');
console.log(`  闪烁自检：牌桌左侧 ${fa} 帧 / 中部 ${fb} 帧 有 >0.15 的亮度跳变（治好前是 118 / 41）`);

let bad = 0;
if (fa > 30 || fb > 30) { console.error('⛔ 平坦区域逐帧亮度在跳 —— 背景会看着发闪，检查时间域降噪那一步'); bad = 1; }
if (v.width !== 886 || v.height !== 1920) { console.error('⛔ 分辨率不是 886×1920'); bad = 1; }
if (d < 15 || d > 30) { console.error('⛔ 时长不在 15–30s'); bad = 1; }
if (eval(v.r_frame_rate) > 30) { console.error('⛔ 帧率超过 30'); bad = 1; }
if (!a || a.channels !== 2) { console.error('⛔ 音轨不是立体声（苹果转码会 FAILED MOV_RESAVE_STEREO）'); bad = 1; }
process.exit(bad);
