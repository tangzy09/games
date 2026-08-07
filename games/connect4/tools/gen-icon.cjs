// ════════════════════════════════════════
// gen-icon.cjs —— app 图标的**主图**生成（ComfyUI + Flux schnell）。
//
// ⛔⛔⛔ 两条会让人白干一整轮的坑，都写在 `generating-app-icons` skill 里，这里逐条兑现：
//
// ① **prompt 里绝不许出现 "app icon" / "icon" / "sticker" / "badge" / "logo"**。
//    说了就会画出**圆角贴纸 + 白底**；Apple 再套自己的圆角遮罩 ⇒ 四角露出**白色缺口**，
//    而且带 alpha 会被直接拒审。⇒ 要的是「**full-bleed 正方形插画**」。
//    ⚠ 这条是实锤：本项目第一版 prompt 写了 "app icon"，出来的正是白边圆角贴纸。
//
// ② ⭐⭐ **schnell 上负面词是完全失效的**。schnell 是 guidance-distilled、必须 `cfg=1.0`，
//    而 cfg=1 就是**关掉 classifier-free guidance** ⇒ negative conditioning **根本到不了采样器**。
//    ⚠ 本项目第一版把 §0 的商标红线（不许红黄/蓝栅栏）全写在 NEG 里 —— **那一串一直是摆设**，
//      出图没翻车只是因为正面 prompt 点名了颜色。⇒ **约束一律写进正面**，
//      并且优先描述「要什么」而不是否定「不要什么」（否定句照样把那个名词塞进 conditioning）。
//    ⇒ `NEG` 留空，免得下一个读代码的人又被它骗了。
//
// ⭐ 批 4 个 seed + **自动**筛掉四角不合格的（skill：别用肉眼查角，2-4px 的近白边在缩略图里
//   看不见，套上圆角遮罩就刺眼）。
//
// 用法：node games/connect4/tools/gen-icon.cjs [--seeds=4]
// ════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const HOST = '127.0.0.1', PORT = 8188;
const OUT = path.join(__dirname, '..', 'assets', 'art', 'icon-candidates');
const COMFY_OUT = 'C:/ComfyUI/output';
const N = parseInt((process.argv.find(a => a.startsWith('--seeds=')) || '--seeds=4').slice(8), 10) || 4;

// ⭐⭐ 全部约束都在**正面**（见文件头 ②）。分三段：画什么 / 怎么构图 / 红线。
const PROMPT = [
  // ── 画什么（60px 还认得出：3-4 个大元素，⛔ 不画整块棋盘）──
  'A square 1:1 board-game key-art illustration, FULL BLEED: the artwork completely fills the ',
  'entire canvas from edge to edge and corner to corner, and the background extends all the way ',
  'into all four corners. ',
  'The subject: one large polished charcoal-black hexagonal game stone with a crisp bevelled edge, ',
  'overlapping one large warm ivory ring with a thick antique gold rim. The two pieces sit ',
  'centered, touching, and together fill about two thirds of the frame. ',
  // ── §0 的红线：⭐ 说「要什么」而不是「不要什么」（否定句会把那个名词塞进 conditioning）──
  'The background is a flat deep pine green field with a subtle soft vignette, nothing else on it. ',
  'The two pieces are deliberately two DIFFERENT shapes — one flat-sided hexagon and one open ring ',
  '— so they are told apart by silhouette alone in pure greyscale. ',
  'The whole picture uses only four colours: deep pine green, charcoal black, warm ivory, antique gold. ',
  // ── 构图（skill 的 full-bleed 段，逐条照抄意图）──
  'The image is a plain FULL SQUARE with perfectly square corners. The four corners are filled ',
  'with the same deep pine green background. Opaque background, completely solid, no transparency. ',
  'Bold simple readable silhouette, very strong figure-ground contrast, thick clean edges, ',
  'centered symmetrical composition, painterly digital illustration, soft directional light, ',
  'tactile polished stone and metal materials, calm elegant craft aesthetic, no surface markings.'
].join('');

// ⛔ 留空：schnell 上它到不了采样器（见文件头 ②）。⛔ 别往里写东西，那只会骗人。
const NEG = '';

const post = (p, body) => new Promise((res, rej) => {
  const d = Buffer.from(JSON.stringify(body), 'utf8');
  const r = http.request({ host: HOST, port: PORT, path: p, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': d.length } },
    x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); });
  r.on('error', rej); r.write(d); r.end();
});
const get = p => new Promise((res, rej) => {
  http.get({ host: HOST, port: PORT, path: p }, x => {
    let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b }));
  }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

function workflow(seed) {
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'flux1-schnell-Q4_K_S.gguf' } },
    '2': { class_type: 'DualCLIPLoader', inputs: {
      clip_name1: 't5xxl_fp8_e4m3fn.safetensors', clip_name2: 'clip_l.safetensors', type: 'flux' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: PROMPT, clip: ['2', 0] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['2', 0] } },
    '5': { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '6': { class_type: 'KSampler', inputs: {
      seed: seed, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0,
      model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] } },
    '7': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['7', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'c4icon', images: ['8', 0] } }
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  try { if ((await get('/system_stats')).status !== 200) throw 0; }
  catch (e) { console.error('⛔ ComfyUI 没在跑（127.0.0.1:8188）'); process.exit(2); }

  const made = [];
  for (let i = 0; i < N; i++) {
    const seed = 20260807 + i * 977;
    const t0 = Date.now();
    const r = await post('/prompt', { prompt: workflow(seed) });
    if (r.status !== 200) { console.error('  ✗ seed ' + seed + ' 提交失败 ' + r.status); continue; }
    const id = JSON.parse(r.body).prompt_id;
    let file = null;
    for (let t = 0; t < 600 && !file; t++) {
      await sleep(1000);
      const h = await get('/history/' + id);
      if (h.status !== 200) continue;
      const hist = JSON.parse(h.body)[id];
      if (!hist) continue;
      if (hist.status && hist.status.status_str === 'error') {
        console.error('  ✗ seed ' + seed + ' 出错'); break;
      }
      const o = hist.outputs && hist.outputs['9'];
      if (o && o.images && o.images.length) file = o.images[0];
    }
    if (!file) continue;
    const dst = path.join(OUT, 'cand-' + i + '-' + seed + '.png');
    fs.copyFileSync(path.join(COMFY_OUT, file.subfolder || '', file.filename), dst);
    made.push(dst);
    console.log('  ✓ 候选 ' + i + '（seed ' + seed + '）' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  console.log('\n出了 ' + made.length + ' 张候选 → ' + OUT);
  console.log('⇒ 下一步跑 check-icon.py 自动筛（四角颜色 + 填充分布 + 无 alpha），⛔ 别用肉眼查角。');
})().catch(e => { console.error(e); process.exit(1); });
