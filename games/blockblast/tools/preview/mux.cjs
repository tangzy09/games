// games/blockblast/tools/preview/mux.cjs — 给原片配音并编码成 App Store 预览片
//
// ① 按 capture 出的 sfx.json 时间戳铺音效：吃果子用**和游戏内一样的上行音阶**（连吃会一级级升），
//    过关/解锁用游戏自己的 wav
// ② 切掉黑幕头 → 限幅 → H.264/yuv420p/30fps → 886×1920 mp4
//
// ⛔ **默认不放背景音乐**（2026-08-01 用户定：「不要音乐，直接动画」）。片子只有画面 + 游戏
//    自己的音效 —— 商店预览片本来大多是静音自动播放，BGM 反而抢戏。
//    合成 BGM 的代码留在 music.cjs 里，`--bgm` 可以随时开回来。
//
// 用法：node games/blockblast/tools/preview/mux.cjs [切头秒数] [--bgm] [--silent]
//   --bgm     叠上 music.cjs 合成的配乐（默认不叠）
//   --silent  完全无声轨
// ⚠ 无头浏览器录不到声音 ⇒ 音轨必须在这里另铺（整条管线的设计前提）。
// ⚠ App Store 预览片硬性要求：15–30 秒、H.264/HEVC、槽位分辨率一致（6.7" = 886×1920 竖版）。
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const music = require('./music.cjs');
const HERE = __dirname;
const HERE_UNUSED = null;
// ⚠ 切头秒数 = 黑幕时长（盖住 app 初始化预滚）。改舞台页的等待时长后要重测：
//    ffmpeg -i preview-raw.webm -vf blackdetect=d=0.2:pix_th=0.10 -an -f null -
const TRIM = parseFloat(process.argv[2] || '2.45');
const DUR = 24.0;

const WANT_BGM = process.argv.includes('--bgm');
const SILENT = process.argv.includes('--silent');

// ── ① BGM（默认关；开的话长度要盖满全片，否则片尾是死寂）──
const inputs = [`-i "${path.join(HERE, 'preview-raw.webm')}"`];
if (WANT_BGM) {
  const BGM = path.join(HERE, 'bgm.wav');
  fs.writeFileSync(BGM, music.render(DUR));
  inputs.push(`-i "${BGM}"`);
}

// ── ② 音效铺轨 ──
const sfxList = SILENT ? [] : JSON.parse(fs.readFileSync(path.join(HERE, 'sfx.json'), 'utf8'));
const legs = [];
let eatStep = 3;   // 连吃的音阶从中段起步（听起来像已经连了一会儿）
sfxList.forEach(s => {
  // ⭐ blockblast 的音效全是 WebAudio 合成的（零素材）—— 片子里用的是
  //   `tools/audit-sfx.cjs` 离线渲染出的**同一批 wav**，所以声音和真机一模一样。
  const file = path.join(HERE, s.type + '.wav');
  const vol = s.vol || 1.15;

  if (!fs.existsSync(file)) return;
  inputs.push(`-i "${file}"`);
  // ⚠ sfx 的时间戳是**相对 t0（黑幕掀开那一刻）**，而 -ss 是在滤镜之后砍掉前 TRIM 秒 ⇒
  //   这里要 **+TRIM**（写成 -TRIM 的话所有音效会提前两倍 TRIM、全糊在开头）。
  legs.push({ idx: inputs.length - 1, t: s.t + TRIM, vol });
});

const fc = [];
const parts = [];
if (WANT_BGM) {
  // ⚠ BGM 要延后 TRIM 才和画面对齐：-ss 是在滤镜之后砍头，音乐必须从「片子第一帧」开始，
  //   否则前奏被砍掉、段落全部错位、片尾淡出也落不到结尾卡上。
  const ms = Math.round(TRIM * 1000);
  fc.push(`[1:a]adelay=${ms}|${ms},volume=0.62[bgm]`);
  parts.push('[bgm]');
}
legs.forEach((l, i) => {
  const ms = Math.round(l.t * 1000);
  fc.push(`[${l.idx}:a]adelay=${ms}|${ms},volume=${l.vol}[s${i}]`);
  parts.push(`[s${i}]`);
});

// ⛔ **没有 BGM 时不要跑 loudnorm**：整轨大半是静音，把「积分响度」拉到 -14 等于
//   把几声音效轰到削顶。只做混音 + 限幅，保留游戏本来的动态。
//   有 BGM 时才做两遍 loudnorm（单遍是自适应的，实测会推到 -11.2 LUFS，比目标吵 3dB）。
let AUDIO = null;
if (parts.length) {
  // ⛔ 必须 duration=**longest**：写 first 时，没有 BGM 的情况下第一路是「第一个延迟过的音效」，
  //   混音在它结束时就停 —— 实测整条音轨只剩 5.96s，后面的音效全没了（波形图一眼看出）。
  const MIX = `${parts.join('')}amix=inputs=${parts.length}:duration=longest:dropout_transition=0`
            + (WANT_BGM ? '' : `,volume=1.6`);
  if (WANT_BGM) {
    const probeCmd = ['ffmpeg -hide_banner -nostats', inputs.join(' '),
      `-filter_complex "${fc.concat([MIX + ',loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[a]']).join(';')}"`,
      '-map "[a]" -f null -'].join(' ');
    let M = {};
    try {
      const out = execSync(probeCmd + ' 2>&1', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      M = JSON.parse(out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1));
    } catch (e) { console.error('loudnorm 测量失败，退回单遍'); }
    const LN = M.input_i
      ? `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${M.input_i}:measured_TP=${M.input_tp}`
        + `:measured_LRA=${M.input_lra}:measured_thresh=${M.input_thresh}:offset=${M.target_offset}:linear=true`
      : 'loudnorm=I=-14:TP=-1.5:LRA=11';
    fc.push(`${MIX},${LN}[aout]`);
  } else {
    // ⛔ 纯音效轨不能只给个固定增益：源 wav 本来就轻，实测成片峰值只有 -18.9 dBFS ≈ 听不见。
    //   用 volumedetect 先量真实峰值，再补到 -4 dBFS（**按峰值归一**，不是按积分响度——
    //   大半是静音的轨用 loudnorm 会把那几声轰到削顶）。
    const det = ['ffmpeg -hide_banner -nostats', inputs.join(' '),
      `-filter_complex "${fc.concat([MIX + ',volumedetect[a]']).join(';')}"`,
      '-map "[a]" -f null -'].join(' ');
    let gain = 0;
    try {
      const out = execSync(det + ' 2>&1', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      const m = out.match(/max_volume:\s*(-?[\d.]+) dB/);
      if (m) gain = Math.min(24, -4 - parseFloat(m[1]));   // 封顶 +24dB，防病态输入炸掉
    } catch (e) { console.error('峰值测量失败，按 +12dB 兜底'); gain = 12; }
    console.log(`  纯音效轨：补 ${gain.toFixed(1)} dB 到 -4 dBFS 峰值`);
    // ⚠ 末尾补静音到全片长：最后一声在 21.5s，不补的话音轨比视频短 2.5s（有些上传/播放器较真）
    fc.push(`${MIX},volume=${gain.toFixed(2)}dB,alimiter=limit=0.92,apad=whole_dur=${DUR + TRIM}[aout]`);
  }
  AUDIO = '[aout]';
}

const OUT = 'C:/tmp/blockblast/preview/cubeblast-preview-en.mp4';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execSync([
  'ffmpeg -y -loglevel error',
  inputs.join(' '),
  AUDIO ? `-filter_complex "${fc.join(';')}"` : '',
  AUDIO ? `-map 0:v -map "${AUDIO}"` : '-map 0:v -an',
  `-ss ${TRIM} -t ${DUR}`,   // ⚠ 切头后仍要留满 DUR，写 DUR-TRIM 会砍掉片尾结尾卡
  '-r 30 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow',
  // ⛔ 音轨必须**立体声**：单声道传上去苹果转码直接拒（错误码 MOV_RESAVE_STEREO，实锤）。
  //   纯音效轨混出来是 1ch ⇒ 这里显式 -ac 2。
  AUDIO ? '-c:a aac -b:a 192k -ar 44100 -ac 2' : '',
  '-movflags +faststart',
  `"${OUT}"`,
].filter(Boolean).join(' '), { stdio: 'inherit' });

const probe = JSON.parse(execSync(
  `ffprobe -v quiet -print_format json -show_streams -show_format "${OUT}"`).toString());
const v = probe.streams.find(s => s.codec_type === 'video');
const a = probe.streams.find(s => s.codec_type === 'audio');
console.log(`成片 → ${OUT}`);
console.log(`  ${v.width}×${v.height} · ${v.codec_name} · ${(+probe.format.duration).toFixed(1)}s`
  + ` · ${(probe.format.size / 1048576).toFixed(1)}MB · 音轨 ${a ? a.codec_name + ' ' + a.channels + 'ch' : '无'}`);
const d = +probe.format.duration;
if (d < 15 || d > 30) console.error('⛔ 时长 ' + d.toFixed(1) + 's 不在 App Store 要求的 15–30s 内');
