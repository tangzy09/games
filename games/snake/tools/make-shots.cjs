// games/snake/tools/make-shots.cjs — App Store 商店截图（品牌舞台图）
//
// 照 language-study 的 `store-screenshots` skill 定稿公式做的 snake 版：
//   大字标题(关键词渐变高亮) + 真机边框(灵动岛/状态栏) + 真实 UI 占主体
//   + 品牌底色/柔光 blob + 跨页连续的波浪缎带 + 圆形贴纸(天使图裁圆)。
// 两遍法：pass1 用 Playwright 抓真实 UI（430×932@3x / iPad 1024×1366@2x），
//         pass2 把 raw 图合进 HTML 舞台再截成品（1290×2796 / 2048×2732）。
//
// 用法：node games/snake/tools/make-shots.cjs            全跑
//       node games/snake/tools/make-shots.cjs --stage-only   只重合成(调设计时省时)
//       node games/snake/tools/make-shots.cjs --phone|--pad  只做一种设备
// 产物：C:/tmp/snake/store-shots/{raw,final}
//
// ⛔ 铁则(skill 里全是用户验收打回来的)：手机永不裁短 · 任何东西不许盖手机顶部 ·
//    贴纸盖空白不盖内容 · 彩纸只在背景区 · **每张成品必须 Read 逐张验图**。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const DIR = 'C:/tmp/snake/store-shots';
const RAW = path.join(DIR, 'raw'), FIN = path.join(DIR, 'final');
const PORT = 18879;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.webp': 'image/webp', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

// 八张叙事线（前 3 张最重要）：核心玩法 → 揭图爽点 → 500 收集 → 过关三星
//                              → 120 成就 → 每日任务 → 等级统计 → 皮肤
const SHOTS = [
  { id: '01-hero', raw: '01-play', raw2: '02-home', h: 'Snake that paints 500 angels', hl: '500 angels',
    s: 'Every tile you cross reveals the art beneath', tilt: -2, fx: true,
    pills: [{ t: '👼 500 artworks' }, { t: '🎨 4 themes' }] },
  { id: '02-reveal', raw: '01-play', h: 'One apple reveals 9 tiles', hl: '9 tiles',
    s: 'Chase combos, uncover faster', tilt: 1.6, sticker: 1, stickPos: 'in-bl' },
  { id: '03-gallery', raw: '03-gallery', h: '500 angels to collect', hl: '500',
    s: 'Every clear adds one to your album', tilt: -1.2 },
  { id: '04-clear', raw: '04-clear', h: 'Clear it, keep it forever', hl: 'forever',
    s: 'Three stars for a clean, fast run', tilt: 1.2,
    pills: [{ t: '★ No deaths' }, { t: '⚡ Under 2 min' }] },
  { id: '05-ach', raw: '05-ach', h: '120 achievements', hl: '120',
    s: 'Fruits, combos, streaks — all of it counts', tilt: -1.2 },
  { id: '06-quests', raw: '06-quests', h: 'A reason to come back daily', hl: 'daily',
    s: '3 quests a day · free angel gift · streak rewards', tilt: 1.6, sticker: 2, stickPos: 'in-br' },
  { id: '07-stats', raw: '07-stats', h: 'Watch your wings grow', hl: 'wings',
    s: 'Levels, titles and lifetime stats', tilt: -1.2 },
  { id: '08-skins', raw: '08-skins', h: 'Four dreamy themes', hl: 'dreamy',
    s: 'Clouds, night sky, candy, forest', tilt: 1.2 },
];

// 贴纸用真天使图（裁圆 + 白描边，Duolingo 那套吉祥物手法）
const ANGELS = fs.readdirSync(path.join(ROOT, 'games/snake/assets/angels')).filter(f => f.endsWith('.webp'));
const stickerFile = n => path.join(ROOT, 'games/snake/assets/angels', ANGELS[(n * 37) % ANGELS.length]);

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rep) => {
      let u = decodeURIComponent(req.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); rep.end('nf'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.listen(PORT, () => res(srv));
  });
}

/** 一份「玩了很久」的存档 —— 空档的界面全是 0 和锁，截出来没人下载 */
const SEED_STATE = () => {
  const list = G.imgList || [];
  G.save.gallery.unlocked = list.slice(0, 137);
  G.save.gallery.stars = {};
  G.save.gallery.unlocked.forEach((f, i) => { G.save.gallery.stars[f] = (i % 3) + 1; });
  G.save.stats.distinctImgs = 137;
  G.save.stats.levelsCleared = 137; G.save.stats.apples = 2140; G.save.stats.cellsRevealed = 41230;
  G.save.stats.steps = 68200; G.save.stats.deaths = 26; G.save.stats.playtimeMs = 14760000;
  G.save.stats.maxCombo = 18; G.save.stats.maxLen = 63; G.save.stats.setsDone = 5; G.save.stats.revives = 7;
  G.save.stats.totalScore = 186000;
  G.save.daily.giftStreak = 12;
  G.save.ach.unlocked = ['img_1', 'img_2', 'img_3', 'aic_1', 'aic_2', 'aic_3', 'death_1',
                         'sk_cloud_1', 'sk_cloud_2', 'rev_1', 'combo_1', 'combo_2'];
  persist();
};

async function pass1(pad) {
  const srv = await serve();
  const br = await chromium.launch();
  const errs = [];
  const vp = pad ? { width: 1024, height: 1366 } : { width: 430, height: 932 };
  const dsf = pad ? 2 : 3;
  const tag = pad ? 'pad-' : '';

  async function fresh() {
    const pg = await br.newPage({ viewport: vp, deviceScaleFactor: dsf });
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/games/snake/`, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.G && window.G.imgList && window.G.imgList.length, null, { timeout: 20000 });
    await pg.evaluate(() => I18N.setLang('en'));
    await pg.waitForTimeout(500);
    await pg.evaluate(SEED_STATE);
    await pg.evaluate(() => { hideHome(); });
    return pg;
  }
  const snap = async (pg, id, ms = 500) => {
    await pg.waitForTimeout(ms);
    // ⛔ 净场：① 注入存档会连锁触发一堆「Unlocked!」toast，糊满界面（实拍抓到）
    //         ② 引擎 DOM 控制栏(语言下拉/🏠/🔊)是网页版味道，商店图里去掉
    //         ③ 面板里的「看广告」条别进商店图（卖点位不该先看到广告）
    await pg.evaluate(() => {
      const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
      const c = document.getElementById('controls'); if (c) c.style.display = 'none';
      document.querySelectorAll('.gal-ad, #gal-ad').forEach(e => e.remove());
    });
    await pg.waitForTimeout(120);
    // ⚠ iPad 坑（language-study 的 store-screenshots skill 实锤）：面板是**双居中的悬浮窄卡**，
    //   整屏截下来四周全是死底、内容小得看不清。正解是**裁掉死边**——这里按面板包围盒
    //   扩成设备比例(1024:1366)再 clip 截，等效于 trim，且内容顶满设备窗口。
    let clip = null;
    if (pad) {
      clip = await pg.evaluate(() => {
        // ⚠ 取 **#panel-card**（真正的卡片）——#panel 是 position:fixed;inset:0 的全屏遮罩，
        //   拿它的包围盒等于整屏，clip 白做（实拍抓到）。
        const wrap = document.getElementById('panel');
        const p = document.getElementById('panel-card');
        if (!p || !wrap || wrap.classList.contains('hidden')) return null;
        const r = p.getBoundingClientRect();
        const AR = 1024 / 1366;
        let h = Math.min(innerHeight, r.height * 1.18), w = h * AR;
        if (w < r.width * 1.12) { w = Math.min(innerWidth, r.width * 1.12); h = w / AR; }
        let x = r.left + r.width / 2 - w / 2, y = r.top + r.height / 2 - h / 2;
        x = Math.max(0, Math.min(innerWidth - w, x));
        y = Math.max(0, Math.min(innerHeight - h, y));
        return { x, y, width: w, height: h };
      });
    }
    await pg.screenshot({ path: path.join(RAW, tag + id + '.png'), ...(clip ? { clip } : {}) });
    await pg.close();
  };

  // 01 局中：揭开约六成的天使图 + 一条像样的蛇 + 果子（核心玩法一眼看懂）
  let pg = await fresh();
  await pg.evaluate(() => {
    const r = G.run, n = r.cols * r.rows;
    // 从左上起逐行揭开 ~58%，右下留一片没揭的 ⇒ 「正在被画出来」的观感
    for (let i = 0; i < n; i++) {
      const x = i % r.cols, y = (i / r.cols) | 0;
      if (y * r.cols + x < n * 0.58 || ((x + y) % 7 === 0 && y < r.rows * 0.8)) r.revealed[i] = 1;
    }
    r.revealedCount = r.revealed.reduce((a, v) => a + v, 0);
    // 默认蛇只有 3 节，截图里根本看不出是贪吃蛇 ⇒ 手工铺一条 14 节的（纯截图态，不参与逻辑）
    const y0 = (r.rows * 0.62) | 0, x0 = 2;
    r.snake = [];
    for (let i = 0; i < 14; i++) {
      const x = x0 + (i < 9 ? 8 - i : 0), y = i < 9 ? y0 : y0 + (i - 8);
      r.snake.push({ x: Math.max(0, Math.min(r.cols - 1, x)), y: Math.max(0, Math.min(r.rows - 1, y)) });
    }
    r.targetLen = 14; r.dir = r.nextDir = 'right';   // ⚠ dir 是 DIRS 的**字符串键**，不是向量（写成 {x,y} 会 renderAll 崩）
    r.score = 4820; r.combo = 7; r.level = 14;
    // ⚠ 别用 PLAYING：主循环会继续 tick，手工摆的蛇几帧后就自撞死掉、弹出「Oops, crashed!」（实拍抓到）。
    //   用一个**不存在的 phase**：frame() 只在 phase==='PLAYING' 时推进逻辑，renderAll 的浮层分支也全不命中
    //   ⇒ 画面 = 干净的局中态，且完全冻结。
    G.phase = 'SHOT';
    initLayers(G.img); renderAll();
  });
  await snap(pg, '01-play', 700);

  // 02 主界面（天使主视觉 + 收集进度 + 入口角标）
  pg = await fresh();
  await pg.evaluate(() => { openHome(); window.scrollTo(0, 0); });
  await snap(pg, '02-home', 900);

  // 03 图鉴（25 集缩略图墙）
  pg = await fresh();
  await pg.evaluate(() => openGallery());
  await snap(pg, '03-gallery', 1200);

  // 04 过关结算（完整天使图 + 三星）
  pg = await fresh();
  await pg.evaluate(() => {
    const r = G.run;
    r.revealed.fill(1); r.revealedCount = r.cols * r.rows;
    r.score = 6240; r.level = 15;
    G.lastClearStars = 3; G.phase = 'LEVEL_DONE';
    G.doubledThisLevel = true;   // 让结算屏第二按钮退回「分享」——商店图里不该出现「看广告」
    initLayers(G.img); renderAll();
  });
  await snap(pg, '04-clear', 900);

  // 05 成就墙
  pg = await fresh();
  await pg.evaluate(() => openAchievements());
  await snap(pg, '05-ach', 800);

  // 06 每日任务
  pg = await fresh();
  await pg.evaluate(() => openQuests());
  await snap(pg, '06-quests', 800);

  // 07 统计（等级 / 称号 / 终身数据）
  pg = await fresh();
  await pg.evaluate(() => openStats());
  await snap(pg, '07-stats', 800);

  // 08 皮肤
  pg = await fresh();
  await pg.evaluate(() => openSkins());
  await snap(pg, '08-skins', 900);

  await br.close(); srv.close();
  console.log(`pass1 ${pad ? 'iPad' : 'iPhone'} done. pageerrors:`, errs.length ? [...new Set(errs)].join(' | ') : '0');
}

// ── 真机边框（黑 bezel + 状态栏；iPhone 带灵动岛，iPad 不带）──
function phoneHTML(rawId, o) {
  const src = 'file:///' + path.join(RAW, rawId + '.png').replace(/\\/g, '/');
  const pos = (o.left !== undefined ? `left:${o.left}px;` : '') + (o.right !== undefined ? `right:${o.right}px;` : '') + (o.cx ? 'left:50%;' : '');
  const tf = `${o.cx ? 'translateX(-50%) ' : ''}rotate(${o.rot || 0}deg)`;
  const isl = o.pad ? '' : `<span class="isl" style="width:${o.islW}px;height:${o.islH}px;top:${Math.round((o.sbH - o.islH) / 2)}px"></span>`;
  return `<div class="phone" style="width:${o.w}px;top:${o.top}px;${pos}transform:${tf};z-index:${o.z || 3}">
    <div class="dev" style="border-radius:${o.pad ? 54 : 76}px;padding:${o.pad ? 20 : 16}px"><div class="win" style="border-radius:${o.pad ? 38 : 60}px">
      <div class="sb" style="height:${o.sbH}px;font-size:${o.sbF}px;padding:0 ${o.sbP}px">
        <span>9:41</span>${isl}
        <span class="sbr"><span class="sig"><i></i><i></i><i></i><i></i></span><span class="bat"><b></b></span></span>
      </div><img src="${src}" style="width:100%"></div></div></div>`;
}

function stageHTML(shot, pad) {
  const W = pad ? 2048 : 1290, H = pad ? 2732 : 2796;
  const k = pad ? 1.42 : 1;                       // iPad 上文字/元素整体放大
  const r = id => (pad ? 'pad-' : '') + id;
  const h = shot.hl ? shot.h.replace(shot.hl, `<span class="hl">${shot.hl}</span>`) : shot.h;
  const pills = shot.pills ? `<div class="pills">${shot.pills.map(p => `<span class="pill">${p.t}</span>`).join('')}</div>` : '';
  const stick = shot.sticker ? 'file:///' + stickerFile(shot.sticker).replace(/\\/g, '/') : null;
  const fx = shot.fx ? `
  <div class="dot" style="left:${190 * k}px;top:${470 * k}px;width:${26 * k}px;height:${26 * k}px;background:#FFB84D"></div>
  <div class="dot" style="left:${320 * k}px;top:${420 * k}px;width:${18 * k}px;height:${18 * k}px;background:#7FD4A8"></div>
  <div class="dot" style="right:${96 * k}px;top:${530 * k}px;width:${22 * k}px;height:${22 * k}px;background:#FF8FB0"></div>
  <div class="dot" style="right:${180 * k}px;top:${510 * k}px;width:${16 * k}px;height:${16 * k}px;background:#8FC8FF"></div>
  <div class="star" style="right:${120 * k}px;top:${900 * k}px;font-size:${64 * k}px">✨</div>
  <div class="star" style="left:${105 * k}px;top:${1180 * k}px;font-size:${56 * k}px">⭐</div>` : '';

  const sbBase = pad
    ? { sbH: 64, sbF: 26, sbP: 44, pad: 1 }
    : { sbH: 88, sbF: 34, sbP: 52, islW: 250, islH: 62 };
  // ⛔ 手机永不裁短；带胶囊行的图整体缩小下移，顶部永不被盖
  // ⛔ **手机永不裁短**：机身高 = (w-2×pad)/rawW×rawH + 状态栏 + 2×pad，top + 机身高必须 < 画布高。
  //    这几组数是算过的：iPhone 1000/560→2778、960/620→2751、hero 950/660→2770（都 <2796）；
  //    iPad 1440/700→2672、1340/820→2658、hero 1300/880→2665（都 <2732）。改宽度自己重算。
  const phones = pad
    ? (shot.raw2
        ? phoneHTML(r(shot.raw), { ...sbBase, w: 1300, left: 120, top: 880, rot: shot.tilt || -2 })
          + phoneHTML(r(shot.raw2), { ...sbBase, w: 800, right: -60, top: 1900, rot: 6, z: 5, sbH: 44, sbF: 20, sbP: 32 })
        : phoneHTML(r(shot.raw), { ...sbBase, w: shot.pills ? 1340 : 1440, cx: 1, top: shot.pills ? 820 : 700, rot: shot.tilt || 0 }))
    : (shot.raw2
        ? phoneHTML(r(shot.raw), { ...sbBase, w: 950, left: 45, top: 660, rot: shot.tilt || -2 })
          + phoneHTML(r(shot.raw2), { w: 620, right: -46, top: 1700, rot: 6, z: 5, sbH: 60, sbF: 24, sbP: 36, islW: 170, islH: 44 })
        : phoneHTML(r(shot.raw), { ...sbBase, w: shot.pills ? 960 : 1000, cx: 1, top: shot.pills ? 620 : 560, rot: shot.tilt || 0 }));

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;position:relative;font-family:'Baloo 2',sans-serif;
    background:linear-gradient(160deg,#FFF6FA 0%,#FDE9F3 44%,#F4E4FB 100%)}
  .blob{position:absolute;border-radius:50%;filter:blur(2px)}
  .b1{width:${820 * k}px;height:${820 * k}px;left:${-260 * k}px;top:${-230 * k}px;background:radial-gradient(circle,#FFD7E8 0%,rgba(255,215,232,0) 70%)}
  .b2{width:${900 * k}px;height:${900 * k}px;right:${-320 * k}px;top:${900 * k}px;background:radial-gradient(circle,#E6DCFF 0%,rgba(230,220,255,0) 70%)}
  .b3{width:${700 * k}px;height:${700 * k}px;left:${-180 * k}px;bottom:${-160 * k}px;background:radial-gradient(circle,#FFE2F0 0%,rgba(255,226,240,0) 70%)}
  .sak{position:absolute;opacity:.5}
  .edge{position:absolute;opacity:.4;z-index:1;font-size:${200 * k}px;top:${1520 * k}px}
  .head{position:absolute;top:${150 * k}px;left:${90 * k}px;right:${90 * k}px;text-align:center;z-index:6}
  .head h1{font-size:${104 * k}px;line-height:1.12;font-weight:800;color:#5B4361;letter-spacing:-1px}
  .head h1 .hl{background:linear-gradient(120deg,#FF87B8,#B06CF0);-webkit-background-clip:text;background-clip:text;color:transparent}
  .head p{margin-top:${26 * k}px;font-size:${46 * k}px;font-weight:600;color:#B98BB4}
  .pills{display:flex;gap:${22 * k}px;justify-content:center;margin-top:${36 * k}px}
  .pill{padding:${10 * k}px ${36 * k}px;border-radius:999px;background:#fff;color:#B4739F;font-weight:700;font-size:${40 * k}px;
    box-shadow:0 ${10 * k}px ${24 * k}px ${-10 * k}px rgba(198,120,180,.4)}
  .wave{position:absolute;bottom:0;left:0;z-index:1}
  .phone{position:absolute;filter:drop-shadow(0 ${60 * k}px ${70 * k}px rgba(160,95,160,.36))}
  .dev{background:#17171A}
  .win{overflow:hidden;background:#fff;position:relative}
  .win img{display:block}
  .sb{position:relative;display:flex;align-items:center;justify-content:space-between;
    background:#FDF0F6;color:#6A4E66;font-weight:700}
  .isl{position:absolute;left:50%;transform:translateX(-50%);border-radius:999px;background:#101013}
  .sbr{display:flex;align-items:center;gap:${14 * k}px}
  .sig{display:inline-flex;gap:${5 * k}px;align-items:flex-end}
  .sig i{display:block;width:${8 * k}px;background:currentColor;border-radius:2px}
  .sig i:nth-child(1){height:${11 * k}px}.sig i:nth-child(2){height:${16 * k}px}
  .sig i:nth-child(3){height:${21 * k}px}.sig i:nth-child(4){height:${26 * k}px}
  .bat{display:inline-block;width:${52 * k}px;height:${26 * k}px;border:${4 * k}px solid currentColor;border-radius:${8 * k}px;position:relative;opacity:.9}
  .bat b{position:absolute;top:${3 * k}px;bottom:${3 * k}px;left:${3 * k}px;right:${8 * k}px;background:currentColor;border-radius:3px}
  .stick{position:absolute;z-index:7;width:${290 * k}px;height:${290 * k}px;border-radius:50%;overflow:hidden;
    border:${12 * k}px solid #fff;background:#fff;
    ${shot.stickPos === 'in-br' ? `right:${230 * k}px;top:${(pad ? 2280 : 2120) * k / (pad ? 1.42 : 1)}px;transform:rotate(8deg);`
                                : `left:${250 * k}px;top:${(pad ? 2260 : 2100) * k / (pad ? 1.42 : 1)}px;transform:rotate(-8deg);`}
    box-shadow:0 ${30 * k}px ${60 * k}px ${-20 * k}px rgba(198,120,180,.5)}
  .stick img{width:100%;height:100%;object-fit:cover}
  .dot{position:absolute;z-index:7;border-radius:50%}
  .star{position:absolute;z-index:7}
</style></head><body>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <div class="sak" style="left:${74 * k}px;top:${(shot.sticker ? 400 : 520) * k}px;font-size:${74 * k}px">☁️</div>
  <div class="sak" style="right:${88 * k}px;top:${430 * k}px;font-size:${56 * k}px">✨</div>
  <div class="edge" style="left:${-90 * k}px">☁️</div>
  <div class="edge" style="right:${-90 * k}px">☁️</div>
  <svg class="wave" width="${W}" height="${420 * k}" viewBox="0 0 1290 420" preserveAspectRatio="none">
    <defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#FFB6D9"/><stop offset="0.5" stop-color="#D9C2FF"/><stop offset="1" stop-color="#FFB6D9"/></linearGradient></defs>
    <path d="M0 210 C215 120 430 300 645 210 C860 120 1075 300 1290 210 L1290 420 L0 420 Z" fill="url(#wg)" opacity="0.4"/>
    <path d="M0 260 C215 180 430 340 645 260 C860 180 1075 340 1290 260 L1290 420 L0 420 Z" fill="#FF9FCB" opacity="0.25"/>
  </svg>
  <div class="head"><h1>${h}</h1><p>${shot.s}</p>${pills}</div>
  ${phones}
  ${stick ? `<div class="stick"><img src="${stick}"></div>` : ''}${fx}
</body></html>`;
}

async function pass2(pad) {
  const br = await chromium.launch();
  const W = pad ? 2048 : 2796 && 1290, H = pad ? 2732 : 2796;
  const pg = await br.newPage({ viewport: { width: pad ? 2048 : 1290, height: H }, deviceScaleFactor: 1 });
  const out = path.join(FIN, pad ? 'ipad' : 'iphone');
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) fs.unlinkSync(path.join(out, f));   // 清旧成品防串号
  for (const shot of SHOTS) {
    const f = path.join(DIR, (pad ? 'pad-' : '') + 'stage-' + shot.id + '.html');
    fs.writeFileSync(f, stageHTML(shot, pad), 'utf8');
    await pg.goto('file:///' + f.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    await pg.waitForTimeout(350);
    await pg.screenshot({ path: path.join(out, shot.id + '.png') });
    console.log('final:', (pad ? 'ipad/' : 'iphone/') + shot.id);
  }
  await br.close();
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(FIN, { recursive: true });
  const onlyPhone = process.argv.includes('--phone'), onlyPad = process.argv.includes('--pad');
  const devices = onlyPhone ? [false] : onlyPad ? [true] : [false, true];
  for (const pad of devices) {
    if (!process.argv.includes('--stage-only')) await pass1(pad);
    await pass2(pad);
  }
  console.log('ALL DONE →', FIN);
})().catch(e => { console.error('ERR', e); process.exit(1); });
