// games/blockblast/tools/make-shots.cjs — App Store 商店截图（品牌舞台图）
//
// 照 language-study 的 `store-screenshots` skill 定稿公式做的 blockblast 版（结构抄 snake 的同名脚本）：
//   大字标题(关键词渐变高亮) + 真机边框(灵动岛/状态栏) + 真实 UI 占主体
//   + 品牌底色/柔光 blob + 跨页连续的波浪缎带 + 圆形贴纸(天使图裁圆)。
// 两遍法：pass1 用 Playwright 抓真实 UI（430×932@3x / iPad 1024×1366@2x），
//         pass2 把 raw 图合进 HTML 舞台再截成品（1290×2796 / 2048×2732）。
//
// 用法：node games/blockblast/tools/make-shots.cjs            全跑
//       node games/blockblast/tools/make-shots.cjs --stage-only   只重合成(调设计时省时)
//       node games/blockblast/tools/make-shots.cjs --phone|--pad  只做一种设备
// 产物：C:/tmp/blockblast/store-shots/{raw,final}
//
// ⛔ 铁则(skill 里全是用户验收打回来的)：手机永不裁短 · 任何东西不许盖手机顶部 ·
//    贴纸盖空白不盖内容 · 彩纸只在背景区 · **每张成品必须 Read 逐张验图**。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const { CAPS, RAWLANG } = require('./shot-caps.cjs');   // 39 语文案 + raw 语言映射
const ROOT = path.resolve(__dirname, '../../..');
const DIR = 'C:/tmp/blockblast/store-shots';
const RAW = path.join(DIR, 'raw'), FIN = path.join(DIR, 'final');
const PORT = 18879;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.webp': 'image/webp', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

// 八张叙事线。⛔ **第 1 张必须是公平页**（DESIGN §11.1）：审核员 30 秒试玩只会看到「又一个
// block puzzle」，4.3(a) 的差异化必须在第一屏 5 秒说清；它同时是本作最强的卖点。
// 顺序 = shot-caps.cjs 里每个 locale 的 8 条文案顺序。
//   0 公平 · 1 玩法/消行预览 · 2 300 关 · 3 教练 · 4 图鉴 500 · 5 每日 · 6 皮肤 · 7 主界面
const SHOTS = [
  { id: '01-fair', raw: '01-fair', raw2: '02-play', tilt: -2, fx: true },
  // ⚠ 不放天使贴纸：blockblast 的界面**上下都是满的**（HUD/盘面/托盘/道具条），
  //   贴纸落在哪都盖内容（实拍：盖住了托盘里的一块）。改用背景彩点做点缀。
  { id: '02-play', raw: '02-play', tilt: 1.6, fx: true },
  { id: '03-levels', raw: '03-levels', tilt: -1.2 },
  { id: '04-coach', raw: '04-coach', tilt: 1.2 },
  { id: '05-gallery', raw: '05-gallery', tilt: -1.2 },
  { id: '06-daily', raw: '06-daily', tilt: 1.6, fx: true },
  { id: '07-skins', raw: '07-skins', tilt: -1.2 },
  { id: '08-home', raw: '08-home', tilt: 1.2 },
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
  for (let i = 1; i <= 64; i++) G.progress[i] = [3, 2, 3, 1, 3, 2, 3, 3, 1, 2][i % 10] || 2;
  G.wallet.coins = 1240;
  G.wallet.angels = 137;
  G.wallet.gamesPlayed = 46;
  G.wallet.themes = ['neon'];
  G.wallet.chests = [1, 2];
  G.best = 8420;
  Object.assign(G.profile, {
    turns: 2400, lines: 610, games: 46, perfects: 2, levelsWon: 64, stars: 140, cleanWins: 31,
    dailyDays: 18, dailyStreak: 12, bestDailyStreak: 12, bestStreak: 11, sweepsTotal: 24,
    brilliants: 37, faults: { missLine: 41, isolate: 18 },
    crystals: { blue: 62, pink: 41, orange: 28, green: 19, violet: 11 },
    unlocked: ['place100', 'place1k', 'line50', 'line500', 'game10', 'score1k', 'score3k',
               'streak3', 'streak5', 'streak7', 'sweep1', 'sweep3', 'deep1', 'combo3',
               'lvl1', 'lvl5', 'lvl10', 'lvl20', 'lvl30', 'star10', 'star30', 'star60'],
  });
  // ⛔ 商店图里不该出现醒目的「看广告」按钮（卖点位不该先看到广告）：把当天额度摆成用完
  //   ⇒ 图鉴/皮肤/任务页的激励条自动变灰退到背景（它们本来就按额度画成灰的）。
  const used = { day: Shop.ymd(Date.now()) };
  for (const k of Object.keys(Shop.AD_CAPS)) used[k] = 99;
  G.wallet.ads = used;
};

/** 摆一个「打了一会儿」的盘面（55% 填充，底部两行差几格 ⇒ 一眼看出「快能消了」）*/
const SEED_BOARD = () => {
  const s = G.s;
  const FILL = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 0, 0, 0],
    [1, 1, 0, 1, 1, 1, 0, 0],
    [1, 1, 1, 0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 0, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1],   // 第 7 行只差最左一格 ⇒ 提示/预览有戏可演
  ];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const i = Core.idx(r, c);
    s.board[i] = FILL[r][c];
    G.cellColor[i] = FILL[r][c] ? Render.COLORS[(r * 3 + c * 5) % Render.COLORS.length] : null;
  }
  s.score = 6120; s.streak = 5; s.stats.turns = 41; s.stats.maxStreak = 9;
  // ⛔ 商店图里不该出现「Watch Ad」：把免费额度摆满、把每日广告额度摆成用完
  //    ⇒ 道具条显示 FREE / 金币价，而不是四个「看广告」（卖点位不该先看到广告）。
  G.items.undoFree = 1; G.items.refreshCharge = 2; G.items.hintFree = 1;
  s.undo = Core.snapshot(s);                      // 让「撤销」不是灰的
  G.animClock = Math.PI / 8;                      // 脉冲相位钉在**最亮**（sin(4t)=1）——提示描边才看得见
};

/** 某个 locale 的第 i 张文案（标题/高亮词/副标 + 胶囊）*/
function cap(locale, i) {
  const c = CAPS[locale] || CAPS['en-US'];
  const [h, hl, s2] = c.t[i];
  const pills = i === 0 ? c.pills1 : i === 3 ? c.pills4 : null;
  return { h, hl, s: s2, pills: pills ? pills.map(t => ({ t })) : null };
}

async function pass1(pad, lang) {
  const srv = await serve();
  const br = await chromium.launch();
  const errs = [];
  const vp = pad ? { width: 1024, height: 1366 } : { width: 430, height: 932 };
  const dsf = pad ? 2 : 3;
  const tag = pad ? 'pad-' : '';
  const outRaw = path.join(RAW, lang); fs.mkdirSync(outRaw, { recursive: true });

  async function fresh() {
    const pg = await br.newPage({ viewport: vp, deviceScaleFactor: dsf });
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/games/blockblast/`, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.G && window.G.s && window.Render, null, { timeout: 20000 });
    await pg.evaluate(l => I18N.setLang(l), lang);
    await pg.waitForTimeout(400);
    await pg.evaluate(SEED_STATE);
    return pg;
  }
  const snap = async (pg, id, ms = 500) => {
    await pg.waitForTimeout(ms);
    // ⛔ 净场：① 注入存档会连锁弹成就/奖励 toast，糊满画面；② 引擎 DOM 控制栏（语言下拉）
    //    是网页版的味道，商店图里去掉；③ 广告按钮别进商店图（卖点位不该先看到广告）。
    await pg.evaluate(() => {
      const c = document.getElementById('controls'); if (c) c.style.display = 'none';
      if (window.FX) FX.reset();
      renderAll();
    });
    await pg.waitForTimeout(150);
    await pg.screenshot({ path: path.join(outRaw, tag + id + '.png') });
    await pg.close();
  };

  // 01 公平页（**第 1 张**：三条可验证承诺 + 出块权重条 + 本局种子）
  let pg = await fresh();
  await pg.evaluate(() => { G.phase = 'FAIR'; renderAll(); });
  await snap(pg, '01-fair', 600);

  // 02 局中：手上拿着一块、幽灵落点 + **金色消行预览**（本作最重要的一个 UI）
  pg = await fresh();
  // ⚠ SEED_BOARD 要**单独 evaluate**：它是 node 侧的函数，写在别的箭头函数体里
  //   浏览器根本看不到它（ReferenceError，实踩）。
  await pg.evaluate(() => { dispatch('NEW_RUN'); G.phase = 'PLAYING'; });
  await pg.evaluate(SEED_BOARD);
  await pg.evaluate(() => {
    Render.layout(); Render.computeTray(G.s);
    // 找一块能补上第 7 行缺口的：单格块永远能放
    const tray = Core.tray(G.s);
    let pick = null;
    for (let i = 0; i < 3 && !pick; i++) {
      const p = tray[i];
      if (!p) continue;
      for (const [r, c] of Core.placements(G.s.board, p)) {
        const test = G.s.board.slice();
        for (const [dr, dc] of p.cells) test[Core.idx(r + dr, c + dc)] = 1;
        const f = Core.findFullLines(test, G.s.stone);
        if (f.rows.length + f.cols.length > 0) { pick = { slot: i, r, c, piece: p }; break; }
      }
    }
    if (pick) {
      const cell = Render.cellXY(pick.r, pick.c);
      const rect = Render.L.traySlots[pick.slot];
      // ⚠ render 读的是 G.drag 的一整套字段（px/py/grow/fromSize/anchorD*），少一个就画不出手上那块
      G.drag = {
        slot: pick.slot, piece: pick.piece, target: { r: pick.r, c: pick.c, piece: pick.piece },
        px: cell.x + Render.L.cell / 2, py: cell.y + Render.L.cell * 1.6,
        fromSize: rect ? rect.size : Render.L.cell, grow: 1, anchorDR: 0, anchorDC: 0,
      };
    }
    renderAll();
  });
  await snap(pg, '02-play', 500);

  // 03 关卡地图（第 2 章：打了一半，星星/宝箱都看得见）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'MENU'; G.chapter = 2; renderAll(); });
  await snap(pg, '03-levels', 500);

  // 04 教练：局中 + 💡 金色最优落点高亮（这是别家 block puzzle 没有的一层）
  pg = await fresh();
  await pg.evaluate(() => { dispatch('NEW_RUN'); G.phase = 'PLAYING'; });
  await pg.evaluate(SEED_BOARD);
  await pg.evaluate(() => {
    Render.layout(); Render.computeTray(G.s);
    const m = Coach.best(G.s);
    if (m) G.coachHint = { slot: m.slot, r: m.r, c: m.c };
    renderAll();
  });
  await snap(pg, '04-coach', 500);

  // 05 天使图鉴（500 张收集墙）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'ANG'; G.angPage = 0; renderAll(); });
  await snap(pg, '05-gallery', 1400);      // 等图解码

  // 06 每日谜题日历（打勾 + 🔥streak）
  pg = await fresh();
  await pg.evaluate(() => {
    // 造一个月的完成记录，让日历不是空的
    const d = new Date();
    G.profile.dailyDone = G.profile.dailyDone || {};
    G.phase = 'CAL'; renderAll();
  });
  await snap(pg, '06-daily', 500);

  // 07 皮肤（20 款，色板 + 解锁进度）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'SKIN'; G.skinPage = 0; renderAll(); });
  await snap(pg, '07-skins', 500);

  // 08 主界面（天使 hero + 等级 + 两颗大按钮 + 入口角标）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'HOME'; G.heroIdx = null; renderAll(); });
  await snap(pg, '08-home', 1600);        // 等 hero 图解码

  await br.close(); srv.close();
  console.log(`pass1 ${pad ? 'iPad' : 'iPhone'} [${lang}] done. pageerrors:`, errs.length ? [...new Set(errs)].join(' | ') : '0');
}

// ── 真机边框（黑 bezel + 状态栏；iPhone 带灵动岛，iPad 不带）──
function phoneHTML(rawId, o) {
  const src = 'file:///' + path.join(RAW, o.lang, rawId + '.png').replace(/\\/g, '/');
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

function stageHTML(shot, pad, locale) {
  const lang = RAWLANG[locale] || 'en';
  const cp = cap(locale, SHOTS.indexOf(shot));
  shot = { ...shot, ...cp };
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
        ? phoneHTML(r(shot.raw), { lang, ...sbBase, w: 1300, left: 120, top: 880, rot: shot.tilt || -2 })
          + phoneHTML(r(shot.raw2), { lang, ...sbBase, w: 800, right: -60, top: 1900, rot: 6, z: 5, sbH: 44, sbF: 20, sbP: 32 })
        : phoneHTML(r(shot.raw), { lang, ...sbBase, w: shot.pills ? 1340 : 1440, cx: 1, top: shot.pills ? 820 : 700, rot: shot.tilt || 0 }))
    : (shot.raw2
        ? phoneHTML(r(shot.raw), { lang, ...sbBase, w: 950, left: 45, top: 660, rot: shot.tilt || -2 })
          + phoneHTML(r(shot.raw2), { lang, w: 620, right: -46, top: 1700, rot: 6, z: 5, sbH: 60, sbF: 24, sbP: 36, islW: 170, islH: 44 })
        : phoneHTML(r(shot.raw), { lang, ...sbBase, w: shot.pills ? 960 : 1000, cx: 1, top: shot.pills ? 620 : 560, rot: shot.tilt || 0 }));

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

async function pass2(pad, locales) {
  const br = await chromium.launch();
  const H = pad ? 2732 : 2796;
  const pg = await br.newPage({ viewport: { width: pad ? 2048 : 1290, height: H }, deviceScaleFactor: 1 });
  const dev = pad ? 'ipad' : 'iphone';
  for (const locale of locales) {
    const out = path.join(FIN, locale, dev);
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(out)) fs.unlinkSync(path.join(out, f));   // 清旧成品防串号
    for (const shot of SHOTS) {
      const f = path.join(DIR, 'stage.html');
      fs.writeFileSync(f, stageHTML(shot, pad, locale), 'utf8');
      await pg.goto('file:///' + f.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
      await pg.waitForTimeout(260);
      await pg.screenshot({ path: path.join(out, shot.id + '.png') });
    }
    console.log('final:', locale + '/' + dev, '8 张');
  }
  await br.close();
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(FIN, { recursive: true });
  const onlyPhone = process.argv.includes('--phone'), onlyPad = process.argv.includes('--pad');
  const devices = onlyPhone ? [false] : onlyPad ? [true] : [false, true];
  // --locale=xx 只出一个 locale（调设计时用）；默认全部 39 个
  const only = (process.argv.find(a => a.startsWith('--locale=')) || '').split('=')[1];
  const locales = only ? [only] : Object.keys(CAPS);
  const langs = [...new Set(locales.map(l => RAWLANG[l] || 'en'))];
  for (const pad of devices) {
    if (!process.argv.includes('--stage-only')) for (const lang of langs) await pass1(pad, lang);
    await pass2(pad, locales);
  }
  console.log('ALL DONE →', FIN, '|', locales.length, 'locale ×', devices.length, '设备 × 8 张');
})().catch(e => { console.error('ERR', e); process.exit(1); });
