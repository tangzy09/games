// ════════════════════════════════════════
// gen-art.cjs —— 本机 ComfyUI + Flux schnell 出美术（DESIGN §0 的红线是本文件的设计说明书）。
//
// ⛔⛔ **商标 / trade dress 红线**（§0.1，动 prompt 前必读）：
//   「红/黄同形圆片 + 蓝色竖框栅栏是孩之宝的注册外观。⇒ 美术必须彻底离开：
//     **不用红黄双色、不做蓝色栅栏、两方棋子是两种不同造型**。」
//   §0.2 又加了一条：「**图标不画红黄圆片 + 蓝框，也不画成一个格子棋盘**」——
//   因为那是「另外 300 个四子棋克隆」的制服（4.3(a) clone spam）。
//   ⇒ 下面每一个 prompt 的负面词里都钉着这几条，⛔ 谁都别为了「像四子棋一点」把它们删掉。
//
// ⭐ 正面方向：**延续游戏里已经在跑的那套配色**（墨绿盘 + 深黑六边形 + 米色圆环金边），
//   风格是「安静的木石棋具」而不是「塑料儿童玩具」——这也正好把它和克隆群拉开。
//
// ⚠ 许可：只用 **flux1-schnell（Apache-2.0，可商用）**，⛔ 绝不用 dev（非商用）。
//
// 用法：
//   node games/connect4/tools/gen-art.cjs            # 出全套（已有的自动跳过）
//   node games/connect4/tools/gen-art.cjs --only=icon
//   node games/connect4/tools/gen-art.cjs --force    # 重做（⚠ 会覆盖）
// ════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const HOST = '127.0.0.1', PORT = 8188;
const OUT = path.join(__dirname, '..', 'assets', 'art');
const COMFY_OUT = 'C:/ComfyUI/output';

const argOf = (k, d) => {
  const p = process.argv.find(a => a.startsWith('--' + k + '='));
  return p ? p.slice(k.length + 3) : d;
};
const ONLY = argOf('only', '');
const FORCE = process.argv.includes('--force');

// ⭐ 全套共用的风格串 —— 风格统一全靠它（skill：「所有图标共用一个 STYLE 常量」）。
//   ⚠ 颜色**点名**：deep pine green / warm cream / soft gold / charcoal，
//     正是游戏里那套（⛔ 别让模型自由发挥成红黄）。
const STYLE = 'painterly digital illustration, warm soft lighting, deep pine green and '
  + 'charcoal and warm cream and soft antique gold palette, tactile carved wood and polished '
  + 'stone materials, calm elegant board-game craft aesthetic, subtle grain, gentle rim light';

// ⛔⛔ 负面词：前四条是 §0 的红线，⛔ 一条都不许删。
const NEG = 'red and yellow discs, red, yellow, bright primary colors, blue vertical grid frame, '
  + 'blue plastic rack, grid of holes, checkerboard, game board with columns, '
  + 'plastic toy, childrens toy, '
  + 'text, letters, numbers, words, typography, watermark, signature, logo, '
  + 'ui panel, screenshot, multiple objects, cluttered, busy background, low contrast';

/**
 * ⭐ 要出的图。
 * ⚠ `icon` 是 app 图标：§0.2 明说**不许画成格子棋盘** ⇒ 改成「两枚造型不同的棋子相扣」
 *   —— 它表达的是这个游戏真正的主题（两方对弈 + 双编码的两种造型），而不是品类制服。
 */
const JOBS = [
  {
    name: 'icon',
    size: 1024,
    seedBump: 700,
    // ⭐ 两种造型（六边形 vs 圆环）= 游戏里真正在用的双编码，⛔ 不是两个同形圆片
    // ⚠ 第一版主体只占画面 1/4 且偏下 ⇒ 缩到 60px 认不出（skill 的唯一判据）。
    //   ⇒ 强调 **fills the frame / centered / close-up**，并把「留白」降到 small margin。
    prompt: 'extreme close-up app icon, a large polished dark charcoal hexagonal game stone '
      + 'overlapping a large cream ivory ring with a thick gold rim, the two pieces centered and '
      + 'filling the entire frame edge to edge, flat deep pine green background, '
      + 'small even margin, bold simple readable silhouette, very strong contrast, '
      + 'centered symmetrical composition, ' + STYLE
  },
  {
    name: 'splash',
    w: 1024, h: 1024,
    prompt: 'a calm still-life of a few polished dark charcoal hexagonal stones and cream ivory '
      + 'rings with thin gold rims resting on a deep pine green felt surface, soft window light '
      + 'from the left, shallow depth of field, generous empty space in the center, ' + STYLE
  },
  {
    name: 'piece-dark',
    size: 1024,
    prompt: 'a single polished dark charcoal hexagonal game stone seen from directly above, '
      + 'soft gold rim light along one edge, centered, generous empty margin, '
      + 'simple readable silhouette, ' + STYLE
  },
  {
    name: 'piece-light',
    size: 1024,
    prompt: 'a single cream ivory ring game piece with a thin antique gold rim seen from directly '
      + 'above, centered, generous empty margin, simple readable silhouette, ' + STYLE
  },
  {
    name: 'board-wood',
    size: 1024,
    prompt: 'seamless repeating dark green stained oak wood grain texture, even all-over pattern '
      + 'with no focal point, flat lay surface texture, fine grain, matte finish, ' + STYLE
  },
  {
    name: 'board-slate',
    size: 1024,
    prompt: 'seamless repeating dark slate stone surface texture with faint mineral veins, '
      + 'even all-over pattern with no focal point, flat lay surface texture, matte, ' + STYLE
  }
];

// ─── ComfyUI API ───
function post(pathname, body) {
  return new Promise((res, rej) => {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request({ host: HOST, port: PORT, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); });
    req.on('error', rej); req.write(data); req.end();
  });
}
function get(pathname) {
  return new Promise((res, rej) => {
    http.get({ host: HOST, port: PORT, path: pathname }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** GGUF 工作流（API 格式）。⚠ schnell：steps=4 / cfg=1.0 / euler / simple。 */
function workflow(prompt, seed, w, h) {
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'flux1-schnell-Q4_K_S.gguf' } },
    '2': { class_type: 'DualCLIPLoader', inputs: {
      clip_name1: 't5xxl_fp8_e4m3fn.safetensors', clip_name2: 'clip_l.safetensors', type: 'flux' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['2', 0] } },
    '5': { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '6': { class_type: 'KSampler', inputs: {
      seed: seed, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0,
      model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] } },
    '7': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['7', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'c4art', images: ['8', 0] } }
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // 服务活着吗
  try {
    const r = await get('/system_stats');
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
  } catch (e) {
    console.error('⛔ ComfyUI 没在跑（127.0.0.1:8188）—— 先启动它：');
    console.error('   cd /c/ComfyUI && ./venv/Scripts/python.exe main.py');
    process.exit(2);
  }
  console.log('ComfyUI 就绪。输出目录：' + OUT);

  let made = 0, skipped = 0;
  for (let i = 0; i < JOBS.length; i++) {
    const j = JOBS[i];
    if (ONLY && j.name !== ONLY) continue;
    const dst = path.join(OUT, j.name + '.png');
    if (fs.existsSync(dst) && !FORCE) { console.log('  · ' + j.name + ' 已有，跳过'); skipped++; continue; }
    // ⭐ seed 按索引固定 ⇒ 重跑同名图结果一致，只重做坏的那几张（skill 的老规矩）
    const seed = 20260807 + i * 13 + (j.seedBump | 0);
    const w = j.w || j.size, h = j.h || j.size;
    const t0 = Date.now();
    const r = await post('/prompt', { prompt: workflow(j.prompt, seed, w, h) });
    if (r.status !== 200) { console.error('  ✗ ' + j.name + ' 提交失败 HTTP ' + r.status + ' ' + r.body.slice(0, 300)); continue; }
    const id = JSON.parse(r.body).prompt_id;
    // 轮询
    let file = null;
    for (let t = 0; t < 600 && !file; t++) {
      await sleep(1000);
      const h2 = await get('/history/' + id);
      if (h2.status !== 200) continue;
      const hist = JSON.parse(h2.body)[id];
      if (!hist) continue;
      if (hist.status && hist.status.status_str === 'error') {
        console.error('  ✗ ' + j.name + ' 执行出错：' + JSON.stringify(hist.status.messages || '').slice(0, 400));
        break;
      }
      const outs = hist.outputs && hist.outputs['9'];
      if (outs && outs.images && outs.images.length) file = outs.images[0];
    }
    if (!file) { console.error('  ✗ ' + j.name + ' 没拿到图'); continue; }
    const src = path.join(COMFY_OUT, file.subfolder || '', file.filename);
    if (!fs.existsSync(src)) { console.error('  ✗ ' + j.name + ' 产物不见了：' + src); continue; }
    fs.copyFileSync(src, dst);
    made++;
    console.log('  ✓ ' + j.name + '  ' + w + '×' + h + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's  → ' + dst);
  }
  console.log('\n出图 ' + made + ' 张，跳过 ' + skipped + ' 张。');
  console.log('⛔ 逐张肉眼验收：⑴ 有没有红/黄 ⑵ 有没有蓝色栅栏或格子棋盘 ⑶ 图标缩到 60px 还认不认得出');
})().catch(e => { console.error(e); process.exit(1); });
