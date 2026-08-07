// ════════════════════════════════════════
// gen-icon-v2.cjs —— app 图标**第二版**：画动词，不画战利品。
//
// 为什么要有 v2（2026-08-07）：v1（`gen-icon.cjs`）画的是**两枚棋子躺在那里** ——
// 六边形 + 金环，好看，但它只说明了「这游戏里有什么」，**没说明你要做什么**。
// `generating-app-icons` skill 的原话：「**draw the verb, not the reward**」，
// 并给了因果三件套（blockblast 那轮被四次否掉才总结出来的）：
//   ① **手里那一枚**（正在落、明显与盘面分离）
//   ② **正好是那个形状的空位**
//   ③ **把 ① 连到 ② 的落点标记**
// 四子棋的动词就是：**把一枚子投进那一列，正好补上第四个**。
//
// ⛔⛔ 两条会让人白干一整轮的（v1 文件头已实锤过，这里同样兑现）：
// ① prompt 里绝不许出现 "app icon"/"icon"/"sticker"/"badge"/"logo" ⇒ 会画成圆角贴纸 + 白底，
//    Apple 再套自己的遮罩 ⇒ 四角露白缺口；带 alpha 直接拒审。要的是 **full-bleed 正方形插画**。
//    ⚠ "badge/emblem" 还会**诱发模型往图上写英文大字**（blockblast 章徽实锤）。
// ② **schnell 上负面词完全失效**（cfg=1.0 关掉了 classifier-free guidance ⇒ negative
//    根本到不了采样器）⇒ 所有约束写**正面**，且优先说「要什么」而不是否定「不要什么」。
//    ⇒ `NEG` 留空，免得下一个读代码的人被它骗。
//
// ⚖⚖ **商标红线（DESIGN §0，比好看重要得多）**：
//   `Connect 4` 是孩之宝的**活商标**，**红黄圆片 + 蓝色栅栏**是它的 trade dress。
//   ⇒ 正面 prompt **点名**本作自己的四色（深松绿 / 炭黑 / 象牙白 / 古金），
//     并**点名两种不同形状**（六边形 vs 圆环）—— 这既是差异化，也是无障碍双编码。
//   ⛔ 图上不许有任何文字（游戏名尤其）。
//
// ⭐ 三个变体 × 每个 N 个 seed，出完一律交给 `check-icon.py` 自动筛（⛔ 别用肉眼查四角）。
// 用法：node games/connect4/tools/gen-icon-v2.cjs [--seeds=3] [--only=A]
// ════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const HOST = '127.0.0.1', PORT = 8188;
const OUT = path.join(__dirname, '..', 'assets', 'art', 'icon-v2');
const COMFY_OUT = 'C:/ComfyUI/output';
const N = parseInt((process.argv.find(a => a.startsWith('--seeds=')) || '--seeds=3').slice(8), 10) || 3;
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).toUpperCase();

// ── 所有变体共用的三段（构图 / 红线 / 质感）。⭐ 共用串保证风格统一。 ──
const FULLBLEED = [
  'A square 1:1 board-game key-art illustration, FULL BLEED: the artwork completely fills the ',
  'entire canvas from edge to edge and corner to corner, and the deep pine green background ',
  'extends all the way into all four corners. ',
  'The image is a plain FULL SQUARE with perfectly square corners. Opaque background, completely ',
  'solid, no transparency. The scene IS the whole image. '
].join('');

// ⚖ 红线 + 无障碍双编码（说「要什么」）。⛔ 别改成否定句。
const PALETTE = [
  'The whole picture uses only four colours: deep pine green, charcoal black, warm ivory, antique gold. ',
  'The playing pieces are deliberately two DIFFERENT shapes — flat-sided hexagons and open rings — ',
  'so they are told apart by silhouette alone in pure greyscale. ',
  'The picture is completely free of writing: no letters, no numbers, no words, no signature. '
].join('');

const CRAFT = [
  'Bold simple readable silhouette, very strong figure-ground contrast, thick clean edges, ',
  'painterly digital illustration, soft directional light, tactile polished stone and metal ',
  'materials, calm elegant craft aesthetic, no surface markings.'
].join('');

// ⭐⭐ 三个变体，差别**只在动词怎么画**。
const VARIANTS = [
  {
    id: 'A',
    note: '因果三件套最忠实版：落下的那一枚 + 正下方发光空槽 + 已排好的三枚',
    subject: [
      'The subject: one large warm ivory ring with a thick antique gold rim is caught in mid-air, ',
      'falling straight down, clearly detached above the others, with a soft vertical motion trail ',
      'behind it. Directly below it there is one empty round socket outlined by a bright glowing ',
      'golden dashed circle, marking exactly where that ring will land. To the side of that socket ',
      'three more identical ivory-and-gold rings already rest in a straight horizontal line. ',
      'The falling ring, the glowing socket and the three resting rings together fill about two ',
      'thirds of the frame and are large and chunky. '
    ].join('')
  },
  {
    id: 'B',
    note: '对角连四·最后一枚正在落：更有「赢」的味道',
    subject: [
      'The subject: three warm ivory rings with thick antique gold rims sit in a rising diagonal ',
      'line, glowing softly. A fourth identical ring is caught in mid-fall just above the last ',
      'empty position of that diagonal, clearly separated from the others, with a soft motion ',
      'trail behind it. A bright golden light links the four positions along the diagonal, showing ',
      'the line about to be completed. The four large chunky rings fill about two thirds of the frame. '
    ].join('')
  },
  // ⭐⭐ D/E 是**看过 A/B/C 的 60px 对照表之后**收的一轮（2026-08-07），三条实拍结论：
  //   ① **A-2 那道「从落下的那一枚指向空槽的光锥」是唯一在 60px 还读得出因果的画法**
  //      —— 虚线圈、弧形拖尾缩小后都糊成一团；光锥是个**大色块**，缩放天然抗糊。
  //   ② ⛔ **炭黑棋子当主角行不通**（变体 C 全灭）：charcoal 压在 deep pine green 上
  //      对比度太低，60px 下整块黑成一坨 ⇒ 主角必须是**象牙白 + 古金**那一枚，
  //      炭黑只配当小面积配角。
  //   ③ 元素再少一点：A 系列常把「三枚已排好的」画成两枚、还甩到一边 ⇒ 明确要求
  //      **紧挨着的一横排三枚**，且**空槽就在这一排的尽头**（补上第四个 = 这游戏的动词）。
  {
    id: 'D',
    note: '⭐ A-2 的收敛版：大金环在上 + 光锥指下 + 尽头是空槽的一横排三枚',
    subject: [
      'The subject: one very large warm ivory ring with a thick antique gold rim floats in the ',
      'upper half of the picture, caught in mid-fall. A wide soft cone of warm golden light spreads ',
      'downward from it and lands on one empty round socket, brightly lit, marking exactly where ',
      'that ring will drop. That socket sits at the right end of a tight horizontal row of three ',
      'identical ivory-and-gold rings resting in the lower half. Everything is large, chunky and ',
      'simple; the falling ring alone takes up about a third of the frame. '
    ].join('')
  },
  {
    id: 'E',
    note: '⭐ D 的竖直版：一整列的感觉更像「投进这一列」',
    subject: [
      'The subject: one very large warm ivory ring with a thick antique gold rim hangs at the top ',
      'of the picture, caught in mid-fall, with a wide soft column of warm golden light falling ',
      'straight down from it. At the bottom of that column of light sits one empty round socket, ',
      'brightly outlined, and immediately below the socket three identical ivory-and-gold rings are ',
      'stacked in a neat vertical column. A few small charcoal-black hexagonal stones rest quietly ',
      'to one side as accents. Everything is large, chunky and simple, with a strong vertical ',
      'top-to-bottom composition. '
    ].join('')
  },
  // ⭐ F 是**看过 D-3 的 60px 实拍**之后收的第三轮：D-3 的构图（居中金环 + 光柱 + 一排三枚）
  //   是对的，但**主体偏细偏暗、只占约 45% 画面** ⇒ 主屏上不够抢眼。
  //   skill 的两条硬指标：主体约占 **65%**、**粗描边**。⇒ 这一版只放大、加粗、提亮，⛔ 不改构图。
  {
    id: 'F',
    note: '⭐⭐ D-3 的加粗放大版：同构图，主体占满约三分之二，环更粗、光更亮',
    subject: [
      'The subject: one enormous warm ivory ring with a very thick chunky antique gold rim fills ',
      'the upper half of the picture, caught in mid-fall — its outer edge nearly touches the left ',
      'and right sides of the frame. A wide brilliant column of warm golden light pours straight ',
      'down from it onto one ring below that is lit up bright and glowing, and two more equally ',
      'thick ivory-and-gold rings sit close on either side of it, forming one solid row across the ',
      'bottom of the picture. All four rings are enormous, thick and heavy with bold dark outlines, ',
      'and together they fill about two thirds of the whole square. Centered symmetrical composition. '
    ].join('')
  },
  // ⭐ FAV 是**专门给 32px favicon** 的另一张图，⛔ 不是主图的替代品。
  //   skill 原话：「A gameplay icon that works at 60px still turns to mush at a 32px favicon.
  //   Accept it, or generate a **separate** simplified favicon (one element only).」
  //   实拍：主图（D-3，环 + 光柱 + 一排三枚）缩到 32px 就是一小团黄。
  //   ⇒ favicon **只留一个元素**：一枚又粗又大的金环。⛔ 别在这张里加光柱/其它棋子。
  {
    id: 'FAV',
    note: '⭐ 32px 专用：单一元素（一枚粗金环），⛔ 不加任何别的东西',
    subject: [
      'The subject: one single enormous warm ivory ring with a very thick chunky antique gold rim, ',
      'seen straight on, perfectly centered, filling about three quarters of the square. It is the ',
      'only object in the picture — nothing else at all. Very bold thick heavy rim with a strong ',
      'dark outline, high contrast, extremely simple and readable even when tiny. '
    ].join('')
  },
  {
    id: 'C',
    note: '炭黑六边形当主角（A 的镜像）：看哪种造型在 60px 更立得住',
    subject: [
      'The subject: one large polished charcoal-black hexagonal game stone with a crisp bevelled ',
      'edge is caught in mid-air, falling straight down, clearly detached above the others, with a ',
      'soft vertical motion trail behind it. Directly below it there is one empty hexagonal socket ',
      'outlined by a bright glowing golden dashed hexagon, marking exactly where that stone will ',
      'land. Beside that socket three more identical charcoal hexagons already rest in a straight ',
      'horizontal line, each edged with a thin warm ivory rim so they stay visible against the ',
      'green. The pieces are large and chunky and fill about two thirds of the frame. '
    ].join('')
  }
];

const promptOf = v => FULLBLEED + v.subject + PALETTE + CRAFT;
const NEG = '';   // ⛔ 留空：schnell 上它到不了采样器（见文件头 ②）

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

function workflow(seed, text) {
  return {
    '1': { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'flux1-schnell-Q4_K_S.gguf' } },
    '2': { class_type: 'DualCLIPLoader', inputs: {
      clip_name1: 't5xxl_fp8_e4m3fn.safetensors', clip_name2: 'clip_l.safetensors', type: 'flux' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: text, clip: ['2', 0] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: NEG, clip: ['2', 0] } },
    '5': { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '6': { class_type: 'KSampler', inputs: {
      seed: seed, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'simple', denoise: 1.0,
      model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] } },
    '7': { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['7', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'c4icon2', images: ['8', 0] } }
  };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  try { if ((await get('/system_stats')).status !== 200) throw 0; }
  catch (e) { console.error('⛔ ComfyUI 没在跑（127.0.0.1:8188）'); process.exit(2); }

  const list = VARIANTS.filter(v => !ONLY || v.id === ONLY);
  console.log('变体 ' + list.map(v => v.id).join('/') + ' × ' + N + ' seed\n');
  // ⭐ prompt 一并落盘：下次要复现 / 要改一句话，⛔ 别再从记忆里拼
  fs.writeFileSync(path.join(OUT, 'PROMPTS.txt'),
    list.map(v => '=== ' + v.id + ' —— ' + v.note + ' ===\n' + promptOf(v) + '\n').join('\n'), 'utf8');

  let made = 0;
  for (const v of list) {
    console.log('── 变体 ' + v.id + '：' + v.note);
    for (let i = 0; i < N; i++) {
      // ⭐ seed 按「变体 + 序号」定死 ⇒ 结果可复现，重跑只补缺的那几张
      const seed = 20260807 + v.id.charCodeAt(0) * 100003 + i * 977;
      const t0 = Date.now();
      const r = await post('/prompt', { prompt: workflow(seed, promptOf(v)) });
      if (r.status !== 200) { console.error('  ✗ seed ' + seed + ' 提交失败 ' + r.status); continue; }
      const id = JSON.parse(r.body).prompt_id;
      let file = null;
      for (let t = 0; t < 600 && !file; t++) {
        await sleep(1000);
        const h = await get('/history/' + id);
        if (h.status !== 200) continue;
        const hist = JSON.parse(h.body)[id];
        if (!hist) continue;
        if (hist.status && hist.status.status_str === 'error') { console.error('  ✗ seed ' + seed + ' 出错'); break; }
        const o = hist.outputs && hist.outputs['9'];
        if (o && o.images && o.images.length) file = o.images[0];
      }
      if (!file) continue;
      const dst = path.join(OUT, v.id + '-' + i + '-' + seed + '.png');
      fs.copyFileSync(path.join(COMFY_OUT, file.subfolder || '', file.filename), dst);
      made++;
      console.log('  ✓ ' + path.basename(dst) + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  }
  console.log('\n出了 ' + made + ' 张 → ' + OUT);
  console.log('⇒ 下一步：check-icon.py 自动筛（四角/alpha/填充分布），⛔ 别用肉眼查角；');
  console.log('   活下来的再套 squircle 缩到 60px **亲眼看**（那一关机器判不了）。');
})().catch(e => { console.error(e); process.exit(1); });
