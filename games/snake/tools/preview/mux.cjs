// games/snake/tools/preview/mux.cjs — 给原片配音并编码成 App Store 预览片
//
// ① BGM 由 music.cjs 合成（和声进行 + 音乐盒旋律 + 段落起伏 + 立体声，零外部素材）
// ② 按 capture 出的 sfx.json 时间戳铺音效：吃果子用**和游戏内一样的上行音阶**（连吃会一级级升），
//    过关/解锁用游戏自己的 wav
// ③ 切掉黑幕头 → -14 LUFS → H.264/yuv420p/30fps → 886×1920 mp4
//
// 用法：node games/snake/tools/preview/mux.cjs [切头秒数]
// ⚠ 无头浏览器录不到声音 ⇒ 音轨必须在这里另铺（整条管线的设计前提）。
// ⚠ App Store 预览片硬性要求：15–30 秒、H.264/HEVC、槽位分辨率一致（6.7" = 886×1920 竖版）。
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const music = require('./music.cjs');
const HERE = __dirname;
const SNAKE = path.resolve(HERE, '../..');
// ⚠ 切头秒数 = 黑幕时长（盖住 app 初始化预滚）。改舞台页的等待时长后要重测：
//    ffmpeg -i preview-raw.webm -vf blackdetect=d=0.2:pix_th=0.10 -an -f null -
const TRIM = parseFloat(process.argv[2] || '2.45');
const DUR = 24.0;

// ── ① BGM（长度要盖满「切头 + 全片」，否则片尾是死寂）──
const BGM = path.join(HERE, 'bgm.wav');
fs.writeFileSync(BGM, music.render(DUR));

// ── ② 音效铺轨 ──
const sfxList = JSON.parse(fs.readFileSync(path.join(HERE, 'sfx.json'), 'utf8'));
const inputs = [`-i "${path.join(HERE, 'preview-raw.webm')}"`, `-i "${BGM}"`];
const legs = [];
let eatStep = 3;   // 连吃的音阶从中段起步（听起来像已经连了一会儿）
sfxList.forEach(s => {
  let file, vol;
  if (s.type === 'eat') {
    // ⭐ 用**游戏内同一条上行音阶**而不是 eat.wav —— 片子的声音要和真机一致
    file = path.join(HERE, `eat-${eatStep}.wav`);
    fs.writeFileSync(file, music.eatTone(eatStep++));
    vol = 0.85;
  } else {
    file = path.join(SNAKE, 'assets/audio', s.type + '.wav');
    vol = 1.15;
  }
  if (!fs.existsSync(file)) return;
  inputs.push(`-i "${file}"`);
  // ⚠ sfx 的时间戳是**相对 t0（黑幕掀开那一刻）**，而 -ss 是在滤镜之后砍掉前 TRIM 秒 ⇒
  //   这里要 **+TRIM**（写成 -TRIM 的话所有音效会提前两倍 TRIM、全糊在开头）。
  legs.push({ idx: inputs.length - 1, t: s.t + TRIM, vol });
});

const fc = [];
// ⚠ BGM 要延后 TRIM 才和画面对齐：-ss 是在滤镜之后砍头，音乐必须从「片子第一帧」开始，
//   否则前奏被砍掉、段落全部错位、片尾淡出也落不到结尾卡上。
fc.push('[1:a]adelay=' + Math.round(TRIM*1000) + '|' + Math.round(TRIM*1000) + ',volume=0.62[bgm]');
legs.forEach((l, i) => {
  const ms = Math.round(l.t * 1000);
  fc.push(`[${l.idx}:a]adelay=${ms}|${ms},volume=${l.vol}[s${i}]`);
});
const mixIn = ['[bgm]'].concat(legs.map((_, i) => `[s${i}]`)).join('');
const MIX = `${mixIn}amix=inputs=${legs.length + 1}:duration=first:dropout_transition=0`;

// ⚠ **loudnorm 要两遍**：单遍是自适应的，实测把这条片子推到 -11.2 LUFS（比目标吵了 3dB）。
//   第一遍只测，第二遍把测到的值喂回去做线性修正 —— 这样才真的落在 -14。
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

const OUT = 'C:/tmp/snake/preview/snake-preview-en.mp4';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
execSync([
  'ffmpeg -y -loglevel error',
  inputs.join(' '),
  `-filter_complex "${fc.join(';')}"`,
  '-map 0:v -map "[aout]"',
  `-ss ${TRIM} -t ${DUR}`,   // ⚠ 切头后仍要留满 DUR，写 DUR-TRIM 会砍掉片尾结尾卡
  '-r 30 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow',
  '-c:a aac -b:a 192k -ar 44100 -movflags +faststart',
  `"${OUT}"`,
].join(' '), { stdio: 'inherit' });

const probe = JSON.parse(execSync(
  `ffprobe -v quiet -print_format json -show_streams -show_format "${OUT}"`).toString());
const v = probe.streams.find(s => s.codec_type === 'video');
const a = probe.streams.find(s => s.codec_type === 'audio');
console.log(`成片 → ${OUT}`);
console.log(`  ${v.width}×${v.height} · ${v.codec_name} · ${(+probe.format.duration).toFixed(1)}s`
  + ` · ${(probe.format.size / 1048576).toFixed(1)}MB · 音轨 ${a ? a.codec_name + ' ' + a.channels + 'ch' : '无'}`);
const d = +probe.format.duration;
if (d < 15 || d > 30) console.error('⛔ 时长 ' + d.toFixed(1) + 's 不在 App Store 要求的 15–30s 内');
