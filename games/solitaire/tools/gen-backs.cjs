// games/solitaire/tools/gen-backs.cjs — 用本机 ComfyUI + Flux schnell 生「可爱高级款牌背」
//
// 用法：node games/solitaire/tools/gen-backs.cjs            全跑（已有同名成品自动跳过）
//       node games/solitaire/tools/gen-backs.cjs kitty star  只重做这几张
// 前置：ComfyUI 跑在 127.0.0.1:8188（`C:\ComfyUI\start-comfyui.bat`）。
// 产物：C:/tmp/solitaire/backs-raw/<id>.png（原图 1024×1024）→ 人工挑过后再 cut-backs 入库。
//
// ⛔⛔ **prompt 里绝不能出现 "playing card back" / "card"**（本仓实锤：会把牌角的点数和花色
//   一起画上去，一批 20 张全废）。要说的是「**无缝重复装饰图案**」，并在负面词里点名
//   rank / suit / ace / number / letter。牌背本来就是一块布料花纹，不是一张牌。
// ⚠ 判据与 UI 图标不同：牌背在盘面上**大部分时间只露出顶部一条**（堆叠），整张只在牌堆和
//   商店缩略图里看得全 ⇒ 花纹要**均匀无主角**（有个大主体的话，露出的那一条就是它的头发）。
// ⚠ schnell = Apache-2.0 可商用；dev 非商用，别换。
const http = require('http'), fs = require('fs'), path = require('path');
const OUT = 'C:/tmp/solitaire/backs-raw';
const HOST = '127.0.0.1', PORT = 8188;

// 共用风格串：所有款式共用，风格才统一（各写各的必飘）
const STYLE = 'seamless repeating decorative pattern, kawaii pastel storybook illustration, '
  + 'soft gouache texture, delicate gold linework, even all-over motif with no focal point, '
  + 'gentle shading, cohesive limited palette, high detail, flat lay fabric texture';
const NEG = 'text, letters, numbers, words, typography, rank, suit symbol, ace, playing card, '
  + 'card corners, border frame, photo, person, hands, watermark, logo, harsh contrast, ugly';

const BACKS = [
  { id: 'kitty',    p: 'tiny sleeping cats curled up among clouds and stars, powder pink and cream palette' },
  { id: 'bunny',    p: 'little bunnies with ribbons hopping among clover and tiny hearts, mint and cream palette' },
  { id: 'teatime',  p: 'teacups, macarons and strawberry cakes, cosy afternoon tea motif, blush pink and butter yellow' },
  { id: 'starcat',  p: 'star-shaped cats and crescent moons on a deep indigo night sky with gold dust' },
  { id: 'garden',   p: 'pressed flowers, daisies and lavender sprigs with gold botanical linework, sage green palette' },
  { id: 'cocoa',    p: 'hot cocoa mugs, marshmallows and knitted mittens, warm cocoa brown and cream winter motif' },
  { id: 'whales',   p: 'tiny whales, shells and bubbles in a calm sea, soft teal and pearl palette' },
  { id: 'ribbon',   p: 'satin ribbons, bows and pearl strands on a soft lilac ground with gold accents' },
  { id: 'peachy',   p: 'peaches, blossoms and small birds, warm peach and ivory palette with gold outlines' },
  { id: 'lanterns', p: 'paper lanterns, fireflies and wisteria at dusk, plum purple and warm gold palette' },
];

const post = (p, body) => new Promise((res, rej) => {
  const data = Buffer.from(JSON.stringify(body));
  const r = http.request({ host: HOST, port: PORT, path: p, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
    x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res(JSON.parse(b || '{}'))); });
  r.on('error', rej); r.write(data); r.end();
});
const get = p => new Promise((res, rej) => {
  http.get({ host: HOST, port: PORT, path: p }, x => {
    const bufs = []; x.on('data', c => bufs.push(c));
    x.on('end', () => res(Buffer.concat(bufs)));
  }).on('error', rej);
});
const wait = ms => new Promise(r => setTimeout(r, ms));

function workflow(prompt, seed) {
  return {
    1: { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'flux1-schnell-Q4_K_S.gguf' } },
    2: { class_type: 'DualCLIPLoader', inputs: { clip_name1: 't5xxl_fp8_e4m3fn.safetensors', clip_name2: 'clip_l.safetensors', type: 'flux' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    4: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: NEG } },
    6: { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    7: { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0],
         latent_image: ['6', 0], seed, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    8: { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    9: { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'solback' } },
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const list = only.length ? BACKS.filter(b => only.includes(b.id)) : BACKS;
  let n = 0;
  for (const b of list) {
    const dst = path.join(OUT, b.id + '.png');
    if (!only.length && fs.existsSync(dst)) { console.log('skip', b.id); continue; }
    const seed = 4200 + BACKS.findIndex(x => x.id === b.id) * 13;   // 按索引定 seed：重跑同名图结果一致
    const t0 = Date.now();
    const r = await post('/prompt', { prompt: workflow(b.p + ', ' + STYLE, seed) });
    if (!r.prompt_id) { console.error('X', b.id, JSON.stringify(r).slice(0, 300)); continue; }
    let img = null;
    for (let i = 0; i < 200; i++) {
      await wait(1000);
      const h = JSON.parse((await get('/history/' + r.prompt_id)).toString() || '{}');
      const e = h[r.prompt_id];
      if (!e) continue;
      if (e.status && e.status.status_str === 'error') { console.error('X', b.id, 'error'); break; }
      const outs = e.outputs && e.outputs['9'] && e.outputs['9'].images;
      if (outs && outs.length) { img = outs[0]; break; }
    }
    if (!img) { console.error('X', b.id, '没等到图'); continue; }
    const bin = await get(`/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`);
    fs.writeFileSync(dst, bin);
    n++;
    console.log('OK', b.id, ((Date.now() - t0) / 1000).toFixed(1) + 's', (bin.length / 1024).toFixed(0) + 'KB');
  }
  console.log('生成', n, '张 →', OUT);
})();
