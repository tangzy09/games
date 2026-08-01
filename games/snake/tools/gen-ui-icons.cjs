// games/snake/tools/gen-ui-icons.cjs — 用本机 ComfyUI(Flux schnell GGUF)生成天使风格的 UI 图标
// 前置:C:\ComfyUI 起服务(见 comfyui-flux-local skill)。
// 用法:node games/snake/tools/gen-ui-icons.cjs [名字过滤]
//   → 原图 C:/tmp/snake/ui-icons/raw → 抠图 tools/cut-ui-icons.py → assets/ui/*.webp
// 产物已入库 assets/ui/;改风格才重跑。
//
// ⚠ 图标不是插画:必须「一个主体、居中、留白足、无文字」,否则缩到 34px 就是一坨。
//   风格串里 `simple flat icon` + `centered` + `generous margin` 三个词是缩小后还认得出的关键。
const fs = require('fs'), path = require('path');
const API = 'http://127.0.0.1:8188';
const OUTDIR = 'C:/tmp/snake/ui-icons/raw';
fs.mkdirSync(OUTDIR, { recursive: true });

const STYLE = 'cute kawaii game UI icon, single centered object, generous empty margin around it, '
  + 'soft pastel palette of pink cream gold and lavender, glossy shiny, thick creamy white outline, '
  + 'heavenly angelic theme, simple readable silhouette, plain flat pale lavender background, '
  + 'sticker style, adorable, no text, no letters';
const NEG = 'text, letters, words, numbers, watermark, signature, ui panel, screenshot, blurry, dark, '
  + 'gloomy, realistic, photo, multiple objects, cluttered, busy background, border, frame, cropped';

// name → 主体描述。⚠ 全部围绕「天使」题材,和图鉴/蛇的世界观一致。
const ICONS = [
  // ── 主界面六个入口 ──
  // ⚠ 下面三个是**重做过**的:第一版在 34px 下全糊了——淡粉水晶柱几乎看不见、
  //   米色卷轴一团、画框里的天使只剩一个紫方块。图标必须**主体色和背景拉开**、
  //   剪影简单。判据只有一个:缩到 34px 还认得出。
  ['menu-quests', 'an open scroll of parchment with a bold golden rod and a bright magenta pink wax seal, strong contrast, bold shapes'],
  ['menu-ach',    'a golden award medal with small white angel wings on both sides and a pink ribbon'],
  ['menu-gallery','an ornate golden picture frame containing a soft pink glow, tiny sparkles around it'],
  ['menu-skins',  'a wooden artist palette with pastel paint blobs and a small golden halo floating above it'],
  ['menu-stats',  'three ascending chunky bar chart columns, one deep magenta pink one bright gold one rich purple, bold saturated colors, thick outline'],
  ['menu-howto',  'a small closed storybook with a golden halo ring floating above its cover'],
  // ── 成就徽章两档(120 个成就行共用) ──
  ['ach-locked',  'a plain dull grey stone medal with faint grey wings, unlit, matte, desaturated'],
  ['ach-gold',    'a radiant golden star medal with big white angel wings and a glowing halo, sparkling brightly'],
  // ── 每日任务六个类型 ──
  ['q-apples',    'a single glossy cherry red apple with a tiny green leaf'],
  ['q-levels',    'a bold golden picture frame with a bright magenta pink filled canvas and a big golden checkmark on it, strong contrast'],
  ['q-cells',     'a golden key unlocking a small pastel tile, revealing light behind it'],
  ['q-special',   'a radiant four-point golden sparkle star burst with pink glow'],
  ['q-combo',     'a bold golden lightning bolt with pink glow and sparkles'],
  ['q-noDeath',   'a glossy pastel pink heart-shaped shield with a golden halo, protective'],
  // ── 零散但显眼的几个 ──
  ['daily-gift',  'a small wrapped gift box with a big pastel pink ribbon bow and tiny white angel wings'],
  ['set-crown',   'a small ornate golden crown with pink gems and soft sparkles'],
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
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'snakeui' } },
  };
}

async function post(wf) {
  const r = await fetch(API + '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }) });
  const t = await r.text();
  if (!r.ok) throw new Error('POST /prompt ' + r.status + ' ' + t.slice(0, 300));
  return JSON.parse(t).prompt_id;
}
async function waitDone(id) {
  for (let i = 0; i < 180; i++) {
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
  const filter = process.argv[2];
  const list = filter ? ICONS.filter(([n]) => n.includes(filter)) : ICONS;
  console.log('生成 ' + list.length + ' 个 UI 图标...');
  for (let i = 0; i < list.length; i++) {
    const [name, subj] = list[i];
    const t0 = Date.now();
    try {
      const seed = 4000 + ICONS.findIndex(([n]) => n === name) * 13;
      const id = await post(workflow(subj + ', ' + STYLE, seed));
      const h = await waitDone(id);
      const im = h.outputs['9'].images[0];
      const out = await fetchImg(im.filename, im.subfolder, name);
      console.log(`  ok ${name.padEnd(13)} ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
    } catch (e) { console.log(`  FAIL ${name}: ${e.message}`); }
  }
  console.log('done -> ' + OUTDIR);
})();
