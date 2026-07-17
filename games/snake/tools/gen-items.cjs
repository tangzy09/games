// games/snake/tools/gen-items.cjs — 用本机 ComfyUI(Flux schnell GGUF)生成 13 个道具贴纸
// 前置:C:\ComfyUI 起服务(见 comfyui-flux-local skill),Flux 全套模型就位。
// 用法:node games/snake/tools/gen-items.cjs → 原图存 C:	mp\snake\itemsaw\n// 再抠图:python games/snake/tools/cut-items.py(transparent_background)→ cut\ → 拷进 assets/items/
// 产物已入库 assets/items/*.png;改风格才重跑。
// 用本机 ComfyUI(Flux schnell GGUF)生成 snake 的 13 个道具图。API 批量。
const fs = require('fs'), path = require('path');
const API = 'http://127.0.0.1:8188';
const OUTDIR = 'C:/tmp/snake/items/raw';
fs.mkdirSync(OUTDIR, { recursive: true });

const STYLE = 'kawaii chibi sticker illustration, soft pastel colors, glossy shiny, thick creamy white outline, one single simple centered object, plain flat pale lavender background, heavenly cute anime style, adorable, high detail, no text';
const NEG = 'text, letters, watermark, blurry, dark, gloomy, realistic, photo, 3d, multiple objects, cluttered, border, frame';

// name → 主体描述(功能可读)
const ITEMS = [
  ['apple',    'a cute glossy apple, cherry red with a soft pink blush, tiny green leaf, small white sparkle highlight'],
  ['twin',     'two small twinkling pastel pink five-point stars side by side, cute sparkles'],
  ['gold',     'a shiny golden apple with a tiny golden crown on top, luxurious sparkles'],
  ['demon',    'a cute tiny chibi pink devil imp with small horns and a little pointy tail, playful mischievous smile'],
  ['meteor',   'a cute shooting star with a long flowing sparkly pastel rainbow tail, comet'],
  ['feather',  'a single soft fluffy angel wing feather with a gentle rainbow pastel gradient'],
  ['trail',    'a radiant glowing holy light sparkle burst, golden and pink, four-point star shine'],
  ['cloud',    'a cute chubby fluffy pastel cloud with a sleepy closed-eyes sleeping face and tiny zzz'],
  ['scissors', 'a pair of cute pastel mint scissors with a small ribbon bow, dainty angelic'],
  ['halo',     'a glowing golden angel halo ring floating, radiant soft glow'],
  ['heart',    'a cute glossy puffy pink heart with a soft glow and little sparkles'],
  ['magnet',   'a cute kawaii horseshoe magnet, glossy red and white, shiny'],
  ['gift',     'a cute small wrapped gift box with a big pastel pink ribbon bow on top'],
];

function workflow(prompt, seed) {
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'flux1-schnell-Q4_K_S.gguf' } },
    '2': { class_type: 'DualCLIPLoader', inputs: { clip_name1: 't5xxl_fp8_e4m3fn.safetensors', clip_name2: 'clip_l.safetensors', type: 'flux' } },
    '3': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '4': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    '5': { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: NEG } },
    '6': { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0],
             seed, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0 } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'snakeitem' } },
  };
}

async function post(wf) {
  const r = await fetch(API + '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }) });
  const t = await r.text();
  if (!r.ok) throw new Error('POST /prompt ' + r.status + ' ' + t.slice(0, 300));
  return JSON.parse(t).prompt_id;
}
async function waitDone(id) {
  for (let i = 0; i < 120; i++) {
    const h = await (await fetch(API + '/history/' + id)).json();
    if (h[id] && h[id].status && h[id].status.completed) return h[id];
    if (h[id] && h[id].status && h[id].status.status_str === 'error') throw new Error('gen error: ' + JSON.stringify(h[id].status));
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('timeout');
}
async function fetchImg(fn, sub, name) {
  const u = `${API}/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=output`;
  const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
  const out = path.join(OUTDIR, name + '.png');
  fs.writeFileSync(out, buf);
  return out;
}

(async () => {
  console.log('生成 ' + ITEMS.length + ' 个道具...');
  for (let i = 0; i < ITEMS.length; i++) {
    const [name, subj] = ITEMS[i];
    const t0 = Date.now();
    try {
      const id = await post(workflow(subj + ', ' + STYLE, 1000 + i * 7));
      const h = await waitDone(id);
      const imgs = h.outputs['9'].images;
      const im = imgs[0];
      const out = await fetchImg(im.filename, im.subfolder, name);
      console.log(`  ✅ ${name.padEnd(9)} ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out}`);
    } catch (e) { console.log(`  ❌ ${name}: ${e.message}`); }
  }
  console.log('done → ' + OUTDIR);
})();
