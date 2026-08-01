// tools/gen-ui-icons.cjs — 跨游戏共享 UI 图标库的生成器(本机 ComfyUI + Flux schnell)
//
// ⛔ 这是**全仓共用**的图标库(engine/assets/ui/),不是某个游戏的私有素材。
//    加图标先想「别的游戏用不用得上」——用得上就用通用名(close/star/lock),
//    只有本游戏世界观里才成立的东西才留在 games/<name>/assets/。
//
// 用法:
//   node tools/gen-ui-icons.cjs [名字过滤]        # → C:/tmp/ui-icons/raw
//   cd C:/tmp/ui-icons && C:/ComfyUI/venv/Scripts/python.exe cut-ui-icons.py
//   cp C:/tmp/ui-icons/cut/*.webp engine/assets/ui/
//   node tools/gen-ui-icons.cjs --manifest       # 只重写 manifest.json(不出图)
//
// ⚠ 图标不是插画,唯一判据是**缩到 34px 还认得出**:
//   风格串里 `single centered object` + `generous empty margin` + `simple readable
//   silhouette` 是关键;糊掉的重生成时加 `bold saturated colors` / 直接点名颜色。
//   验收必须做三尺寸对照表(见 sheet.py),只看 1024 原图必定误判。
const fs = require('fs'), path = require('path');
const API = 'http://127.0.0.1:8188';
const OUTDIR = 'C:/tmp/ui-icons/raw';
const ENGINE_UI = path.join(__dirname, '..', 'engine', 'assets', 'ui');

const STYLE = 'cute kawaii game UI icon, single centered object, generous empty margin around it, '
  + 'soft pastel palette with pink cream gold and lavender, glossy shiny, thick creamy white outline, '
  + 'simple readable silhouette, bold shapes, plain flat pale lavender background, '
  + 'sticker style, adorable, no text, no letters';
const NEG = 'text, letters, words, numbers, watermark, signature, ui panel, screenshot, blurry, dark, '
  + 'gloomy, realistic, photo, multiple objects, cluttered, busy background, border, frame, cropped';

// [名字, 主体描述, 回退 emoji]
// 回退 emoji 进 manifest.json ⇒ 调用方不用各自重复写(见 engine/ui-icons.js)
const ICONS = [
  // ── 导航 / 系统 ──
  // ⛔ back / play / pause / menu / undo / restart / unlock **不在这里生成** —— 方向性/几何字形扩散模型画不出来
  //    (两轮实锤:prompt 里的 "LEFT" 被原样**写在图上**、restart 出两条没箭头的曲线、
  //     play 画成三角套三角、unlock 和 lock 长得一模一样)。它们由 engine/ui-icons.js
  //    的 GLYPHS 用**内联 SVG** 提供:任意尺寸清晰、形状 100% 正确、几百字节。
  ['close',        'a bold rounded X cross mark in soft rose pink, thick chunky strokes', '✕'],
  ['home',         'a cute little house with a pink roof and a round window', '🏠'],
  ['settings',     'a chunky rounded gear cog wheel in lavender and cream, glossy', '⚙️'],
  ['hint',         'a glowing light bulb in warm gold with sparkles around it', '💡'],
  ['info',         'a chunky rounded circle badge in sky blue with a bold cream letter i', 'ℹ️'],
  ['plus',         'a bold rounded plus sign in mint green, thick chunky strokes', '➕'],
  ['check',        'a bold rounded checkmark tick in bright mint green, thick stroke', '✓'],
  // ── 声音 / 提醒 ──
  ['sound-on',     'a cute speaker with two curved sound waves, pink and cream, glossy', '🔊'],
  ['sound-off',    'a cute grey speaker with a bold rose pink slash across it, muted', '🔇'],
  ['bell-on',      'a cute golden bell ringing with small motion lines, glossy', '🔔'],
  ['bell-off',     'a cute golden bell with a bold straight rose pink diagonal slash line drawn across it, muted silent, glossy', '🔕'],
  // ── 收集 / 荣誉 ──
  ['star',         'a plump glossy five point star in bright gold with a soft highlight', '⭐'],
  ['trophy',       'a chunky golden trophy cup with two handles on a base, glossy shiny', '🏆'],
  ['coin',         'a thick round golden coin seen at a slight angle, shiny rim, glossy', '🪙'],
  ['gem',          'a faceted crystal gem in bright magenta pink, sparkling, jewel', '💎'],
  ['heart',        'a plump glossy puffy heart in bright pink with a soft highlight', '❤️'],
  ['fire',         'a cute stylized flame in orange and gold, rounded playful shape', '🔥'],
  ['lock',         'a chunky closed padlock in lavender and gold, glossy', '🔒'],
  // ── 时间 / 计划 ──
  ['calendar',     'a cute calendar page with a pink header bar and a small star on it', '📅'],
  ['clock',        'a cute round wall clock with a pink rim and gold hands', '⏱️'],
  // ── 社交 / 变现 ──
  ['share',        'a cute paper airplane in sky blue and cream, flying, with a small trail', '📤'],
  ['feedback',     'a cute rounded speech bubble in soft pink with three cream dots inside', '💬'],
  ['language',     'a cute round globe in soft blue and mint with simple continent shapes', '🌐'],
  ['video-ad',     'a cute rounded television screen in mint green with a bold cream play triangle on it', '📺'],
  ['shop',         'a cute shopping bag in soft pink with a gold handle and a small star', '🛍️'],
  // ── 从 snake 提上来的通用件(名字改成通用语义)──
  ['scroll',       'an open scroll of parchment with a bold golden rod and a bright magenta pink wax seal, strong contrast, bold shapes', '📋'],
  ['medal',        'a golden award medal with small white wings on both sides and a pink ribbon', '🏅'],
  ['frame',        'an ornate golden picture frame containing a soft pink glow, tiny sparkles around it', '🖼️'],
  ['palette',      'a wooden artist palette with pastel paint blobs and a small golden halo floating above it', '🎨'],
  ['chart',        'three ascending chunky bar chart columns, one deep magenta pink one bright gold one rich purple, bold saturated colors, thick outline', '📊'],
  ['book',         'a small closed storybook with a golden halo ring floating above its cover', '❓'],
  ['badge-gold',   'a radiant golden star medal with big white angel wings and a glowing halo, sparkling brightly', '🏅'],
  ['badge-locked', 'a plain dull grey stone medal with faint grey wings, unlit, matte, desaturated', '🏅'],
  ['apple',        'a single glossy cherry red apple with a tiny green leaf', '🍎'],
  ['picture-done', 'a bold golden picture frame with a bright magenta pink filled canvas and a big golden checkmark on it, strong contrast', '🖼️'],
  ['key',          'a golden key unlocking a small pastel tile, revealing light behind it', '🔓'],
  ['sparkle',      'a radiant four-point golden sparkle star burst with pink glow', '✨'],
  ['bolt',         'a bold golden lightning bolt with pink glow and sparkles', '⚡'],
  ['shield-heart', 'a glossy pastel pink heart-shaped shield with a golden halo, protective', '🛡️'],
  ['gift',         'a small wrapped gift box with a big pastel pink ribbon bow and tiny white wings', '🎁'],
  ['crown',        'a small ornate golden crown with pink gems and soft sparkles', '👑'],
];

function writeManifest() {
  const m = {};
  for (const [n, , emoji] of ICONS) m[n] = emoji;
  fs.mkdirSync(ENGINE_UI, { recursive: true });
  fs.writeFileSync(path.join(ENGINE_UI, 'manifest.json'), JSON.stringify(m, null, 1) + '\n', 'utf8');
  console.log('manifest.json ->', Object.keys(m).length, '个');
}

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
    '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'uiicon' } },
  };
}
async function post(wf) {
  const r = await fetch(API + '/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }) });
  const t = await r.text();
  if (!r.ok) throw new Error('POST /prompt ' + r.status + ' ' + t.slice(0, 300));
  return JSON.parse(t).prompt_id;
}
async function waitDone(id) {
  for (let i = 0; i < 240; i++) {
    const h = await (await fetch(API + '/history/' + id)).json();
    if (h[id] && h[id].status && h[id].status.completed) return h[id];
    if (h[id] && h[id].status && h[id].status.status_str === 'error') throw new Error('gen error');
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
  writeManifest();
  const filter = process.argv[2];
  if (filter === '--manifest') return;
  fs.mkdirSync(OUTDIR, { recursive: true });
  // 已经有成品的默认跳过(engine/assets/ui/<name>.webp 存在)——只补新的,别浪费 20s/张
  const list = ICONS.filter(([n]) => {
    if (filter) return n.includes(filter);
    return !fs.existsSync(path.join(ENGINE_UI, n + '.webp'));
  });
  console.log(`待生成 ${list.length} / 共 ${ICONS.length}`);
  for (const [name, subj] of list) {
    const t0 = Date.now();
    try {
      const seed = 7000 + ICONS.findIndex(([n]) => n === name) * 17;   // 按索引定死,重跑同名结果一致
      const h = await waitDone(await post(workflow(subj + ', ' + STYLE, seed)));
      const im = h.outputs['9'].images[0];
      await fetchImg(im.filename, im.subfolder, name);
      console.log(`  ok ${name.padEnd(14)} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) { console.log(`  FAIL ${name}: ${e.message}`); }
  }
  console.log('done -> ' + OUTDIR);
})();
