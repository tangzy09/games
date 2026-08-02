// games/solitaire/tools/make-shots.cjs — App Store 商店截图（品牌舞台图）
//
// 照 snake/language-study 那套定稿公式做的纸牌版，配色换成本作的**牌桌墨绿 + 金**：
//   大字标题(关键词金色渐变) + 真机边框(灵动岛/状态栏) + 真实 UI 占主体
//   + 柔光 blob + 底部金色缎带 + 花色装饰 + 圆形贴纸(天使图裁圆)。
// 两遍法：pass1 用 Playwright 抓真实 UI（430×932@3x / iPad 1024×1366@2x），
//         pass2 把 raw 图合进 HTML 舞台再截成品（1290×2796 / 2048×2732）。
//
// 用法：node games/solitaire/tools/make-shots.cjs                 全跑（39 locale × 2 设备 × 8 张）
//       node games/solitaire/tools/make-shots.cjs --stage-only    只重合成（调设计时省时）
//       node games/solitaire/tools/make-shots.cjs --phone|--pad   只做一种设备
//       node games/solitaire/tools/make-shots.cjs --locale=en-US  只出一个 locale
// 产物：C:/tmp/solitaire/store-shots/{raw,final}
//
// ⛔ 铁则（全是用户验收/拒审打回来的）：
//   · 手机永不裁短 · 任何东西不许盖手机顶部 · 贴纸盖空白不盖内容 · **每张成品 Read 逐张验图**
//   · **2.3.7**：截图里不许出现价格词（本作 2026-07-22 因预览素材含 "free" 被拒过）⇒
//     抓图前 `Money.state.noAds = true`，把商店/图鉴/结算屏的「看广告…免费解锁」整条关掉。
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const { CAPS, RAWLANG } = require('./shot-caps.cjs');   // 39 语文案 + raw 语言映射
const ROOT = path.resolve(__dirname, '../../..');
const DIR = 'C:/tmp/solitaire/store-shots';
const RAW = path.join(DIR, 'raw'), FIN = path.join(DIR, 'final');
const PORT = 18881;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };

// 八张叙事线（前 3 张最重要 —— 本作的灵魂是「可解 + 可证明」，所以前三张全给它）：
//   可解承诺 → 证明器 → 提示=制胜一步 → 三玩法 → 求解器出的课 → 五档难度 → 图鉴 → 收藏
const SHOTS = [
  { id: '01-hero',    raw: '01-play',     raw2: '12-home', tilt: -2, fx: true },
  { id: '02-prove',   raw: '03-prove',    raw2: '02-fair', tilt: 1.6 },
  { id: '03-hint',    raw: '04-hint',     tilt: -1.2 },
  { id: '04-modes',   raw: '05-freecell', raw2: '06-spider', tilt: 1.4 },
  { id: '05-lessons', raw: '07-lesson',   tilt: -1.2 },
  { id: '06-diff',    raw: '13-insight',  raw2: '08-set', tilt: 1.2 },
  { id: '07-gallery', raw: '09-gallery',  raw2: '10-win', tilt: -1.6, sticker: 2, stickPos: 'in-br' },
  { id: '08-shop',    raw: '11-shop',     tilt: 1.2, sticker: 1, stickPos: 'in-bl' },
];

// 贴纸用真天使图（裁圆 + 白描边）——与 app 内图鉴同一批素材（⛔ 只读 snake 那一份，绝不拷贝）
const ANGELS_DIR = path.join(ROOT, 'games/snake/assets/angels');
const ANGELS = fs.readdirSync(ANGELS_DIR).filter(f => f.endsWith('.webp'));
const stickerFile = n => path.join(ANGELS_DIR, ANGELS[(n * 53) % ANGELS.length]);

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
function SEED_STATE() {
  G.angels = 137; G.xp = 42000;
  G.lessonsDone = { 1: 1, 2: 1 };
  G.ach = { first: 1, clean: 1, streak3: 1, win10: 1, gal50: 1, coins500: 1 };
  G.stats = Object.assign(G.stats || {}, {
    played: 86, won: 41, cleanWon: 23, streak: 4, bestStreak: 9, bestTime: 254000, brilliantAll: 12,
  });
  G.badges = { '2026-06': 'gold', '2026-07': 'silver' };
  G.dayScore = 8600; G.runScore = 3200; G.stage = 3;
  G.diffLv = 3;                                    // 五档里选中第 3 档（前四档已解锁，画面最有层次）
  G.insight = { tf: 9, tt: 6, wt: 4, ft: 2, wf: 1 };   // ⚠ key 必须是真实的着法类型（tf/tt/wf/wt/ft），瞎编的 key 会让「我的弱点」页显示空态
  G.dailyHist = {};
  {
    const n = new Date(), y = n.getFullYear(), m = n.getMonth() + 1;
    for (let d = 1; d <= n.getDate(); d++) if (d % 4 !== 0) G.dailyHist['' + y + m + d] = d % 3 ? 2 : 1;
  }
  Money.state.coins = 1240;
  Money.state.ownedBacks = ['classic', 'cherry', 'sunset', 'ocean', 'sakura', 'mint', 'waves', 'koi'];
  Money.state.ownedTables = ['felt', 'midnight', 'wood'];
  Money.state.ownedFx = ['classic', 'rainbow'];
  Money.state.back = 'koi';
  // ⛔ 2.3.7：把所有「看广告 → …免费解锁」的入口整条关掉（截图=元数据，价格词=拒审）
  Money.state.noAds = true;
  G.freePick = 0;
  G.reduceFx = 1;                                  // 动画一律停掉：截图里不该有演到一半的特效
  G.seenIntro = 1;
}

/**
 * 让求解器解出这一局，再走到**画面最饱满**的那一步。
 * ⚠ 别用固定步数：Klondike 走深了牌全进 foundation，桌面空一大片死绿（16 步实拍过）。
 *   这里在 [kMin,kMax] 里挑「桌面牌最多 + 最长列最长」的那一步 —— 商店图要的是「牌摊开着」。
 */
async function playForward(pg, kMin = 6, kMax = 26) {
  await pg.evaluate(() => { Prover.reset(); dispatch('PROVE'); });
  await pg.waitForFunction(() => Prover.st.phase === 'done', null, { timeout: 40000 });
  await pg.evaluate(([a, b]) => {
    const sol = Prover.st.solMoves || [];
    const seed = G.s.seed, draw = G.s.drawCount, mode = G.s.mode;
    const score = s => {
      let cards = 0, longest = 0;
      s.tableau.forEach(c => {
        cards += c.cards.length;
        longest = Math.max(longest, (c.cards.length - c.up) * 0.10 + Math.max(0, c.up - 1) * 0.28);
      });
      return cards * 0.6 + longest * 30;             // 桌面牌数 + 最长列的视觉高度
    };
    let best = a, bestSc = -1;
    for (let k = a; k <= Math.min(b, sol.length); k++) {
      const st = Core.newGame(seed, draw, mode);
      for (let i = 0; i < k; i++) Core.apply(st, sol[i]);
      const sc = score(st);
      if (sc > bestSc) { bestSc = sc; best = k; }
    }
    const fin = Core.newGame(seed, draw, mode);
    for (let i = 0; i < best; i++) Core.apply(fin, sol[i]);
    G.s = fin;
    G.s.usedHint = false; G.s.usedUndo = false;      // 走的是解法不是提示，别在结算屏留假痕
    G.sel = null; G.drag = null;
    FX.reset(); renderAll();
  }, [kMin, kMax]);
}

async function pass1(pad, lang) {
  const srv = await serve();
  const br = await chromium.launch();
  const errs = [];
  const vp = pad ? { width: 1024, height: 1366 } : { width: 430, height: 932 };
  const dsf = pad ? 2 : 3;
  const tag = pad ? 'pad-' : '';
  const outRaw = path.join(RAW, lang); fs.mkdirSync(outRaw, { recursive: true });

  async function fresh(mode) {
    const pg = await br.newPage({ viewport: vp, deviceScaleFactor: dsf });
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://127.0.0.1:${PORT}/games/solitaire/`, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.G && window.G.s, null, { timeout: 20000 });
    await pg.evaluate(l => I18N.setLang(l), lang);
    await pg.waitForTimeout(400);
    await pg.evaluate(SEED_STATE);
    // ⚠ 换玩法别用 dispatch('MODE')（它是**轮转**：klondike→freecell→spider），直接调 newGame
    if (mode) await pg.evaluate(m => { G.stage = 1; newGame(undefined, m); }, mode);
    await pg.evaluate(() => { G.phase = 'PLAY'; FX.reset(); renderAll(); });
    return pg;
  }
  const snap = async (pg, id, ms = 400) => {
    // ⛔ 净场：引擎的 DOM 控制栏（语言下拉）是网页版味道，商店图里去掉；toast 同理
    await pg.evaluate(() => {
      const c = document.getElementById('controls'); if (c) c.style.display = 'none';
      G.toast = null;
      if (typeof renderAll === 'function') renderAll();
    });
    await pg.waitForTimeout(ms);
    await pg.screenshot({ path: path.join(outRaw, tag + id + '.png') });
    await pg.close();
  };

  // 01 局中：Klondike 刚起手几步（真解法走出来的盘面）
  // ⚠ 别走太多步：Klondike 的牌一进 foundation，桌面就空一大片 —— 430×932 的高屏上
  //   中间会留一大块死绿（16 步实拍过，难看）。7 步刚好「已经开局但牌还在桌上」。
  let pg = await fresh();
  await playForward(pg);
  // 01 是「玩法」图不是「证明」图 ⇒ 把证明结果收掉，底条回到那个**没人有的按钮**本身
  await pg.evaluate(() => { Prover.reset(); renderAll(); });
  await snap(pg, '01-play');

  // 02 公平页（本作的灵魂页 —— 4.3(a) 的正面回答）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'FAIR'; renderAll(); });
  await snap(pg, '02-fair');

  // 03 证明器：「这局还有解吗」→ 已给出答案（有解 + 可演 3 步）
  pg = await fresh();
  await playForward(pg);
  await pg.evaluate(() => { Prover.reset(); dispatch('PROVE'); });
  await pg.waitForFunction(() => Prover.st.phase === 'done', null, { timeout: 40000 });
  await pg.evaluate(() => renderAll());
  await snap(pg, '03-prove', 600);

  // 04 提示 = 通往胜利的下一步（箭头高亮那一步）
  pg = await fresh();
  await playForward(pg);
  await pg.evaluate(() => { G.hintMove = null; dispatch('HINT'); });
  await pg.waitForFunction(() => window.G && G.hintMove, null, { timeout: 40000 });
  await pg.evaluate(() => renderAll());
  await snap(pg, '04-hint', 500);

  // 05 FreeCell（全明牌，一眼看出是另一种玩法）
  pg = await fresh('freecell');
  await playForward(pg);
  await snap(pg, '05-freecell');

  // 06 Spider（10 列）—— ⚠ 先发两轮：刚开局的 Spider 只有一排，截出来像没做完
  pg = await fresh('spider');
  await pg.evaluate(() => { dispatch('STOCK'); dispatch('STOCK'); renderAll(); });
  await snap(pg, '06-spider');

  // 07 教学（求解器现场出题：从「差 N 步赢」的局面开始）
  pg = await fresh();
  await pg.evaluate(() => dispatch('LESSON', { id: 4 }));
  await pg.waitForFunction(() => window.G && G.lesson, null, { timeout: 60000 });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => renderAll());
  await snap(pg, '07-lesson', 500);

  // 08 设置页：**五档明面难度阶梯**
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'SET'; renderAll(); });
  await snap(pg, '08-set');

  // 09 天使图鉴（137/500）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'GALLERY'; G.galPage = 0; renderAll(); });
  await snap(pg, '09-gallery', 1400);

  // 10 赢局结算（连关倍率 + 榜 + 新解锁的天使）
  pg = await fresh();
  await pg.evaluate(() => {
    const s = G.s;
    s.won = true; s.score = 1240; s.usedUndo = false; s.usedHint = false; s.usedJoker = false;
    G.lastStageScore = 1240 * 3; G.lastWinCoins = 25; G.lastAngelGain = 3; G.winDoubled = true;
    G.tAcc = 254000; FX.reset(); renderAll();
  });
  await snap(pg, '10-win', 500);

  // 11 收藏（牌背墙 —— noAds 已开，不会出现「看广告」条）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'SHOP'; G.shopTab = 'back'; renderAll(); });
  await snap(pg, '11-shop', 900);

  // 13 我的弱点（求解器诊断出来的失误分类 —— 竞品没有的一页）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'INSIGHT'; renderAll(); });
  await snap(pg, '13-insight');

  // 12 主界面（天使主视觉 + 收集进度 + 入口角标）
  pg = await fresh();
  await pg.evaluate(() => { G.phase = 'HOME'; G.heroIdx = null; renderAll(); });
  await snap(pg, '12-home', 900);

  await br.close(); srv.close();
  console.log(`pass1 ${pad ? 'iPad' : 'iPhone'} [${lang}] done. pageerrors:`, errs.length ? [...new Set(errs)].slice(0, 3).join(' | ') : '0');
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

/** 某个 locale 的第 i 张文案 */
function cap(locale, i) {
  const c = CAPS[locale] || CAPS['en-US'];
  const [h, hl, s2] = c.t[i];
  const pills = i === 0 ? c.pills1 : i === 6 ? c.pills6 : null;
  return { h, hl, s: s2, pills: pills ? pills.map(t => ({ t })) : null };
}

function stageHTML(shot, pad, locale) {
  const lang = RAWLANG[locale] || 'en';
  const cp = cap(locale, SHOTS.findIndex(s => s.id === shot.id));
  shot = { ...shot, ...cp };
  const W = pad ? 2048 : 1290, H = pad ? 2732 : 2796;
  const k = pad ? 1.42 : 1;                       // iPad 上文字/元素整体放大
  const r = id => (pad ? 'pad-' : '') + id;
  const h = shot.hl ? shot.h.replace(shot.hl, `<span class="hl">${shot.hl}</span>`) : shot.h;
  const pills = shot.pills ? `<div class="pills">${shot.pills.map(p => `<span class="pill">${p.t}</span>`).join('')}</div>` : '';
  const stick = shot.sticker ? 'file:///' + stickerFile(shot.sticker).replace(/\\/g, '/') : null;
  const fx = shot.fx ? `
  <div class="suit s1" style="left:${140 * k}px;top:${470 * k}px;font-size:${64 * k}px">♠</div>
  <div class="suit s2" style="right:${120 * k}px;top:${430 * k}px;font-size:${52 * k}px">♥</div>
  <div class="suit s3" style="right:${190 * k}px;top:${560 * k}px;font-size:${40 * k}px">♦</div>
  <div class="suit s4" style="left:${230 * k}px;top:${560 * k}px;font-size:${38 * k}px">♣</div>` : '';

  const sbBase = pad
    ? { sbH: 64, sbF: 26, sbP: 44, pad: 1 }
    : { sbH: 88, sbF: 34, sbP: 52, islW: 250, islH: 62 };
  // ⛔ **手机永不裁短**：机身高 = (w-2×pad)/rawW×rawH + 状态栏 + 2×pad，top + 机身高必须 < 画布高。
  //    raw 比例 430:932 ⇒ iPhone 1000 宽机身 ≈ 2218+88+32 = 2338，top 560 → 2898 会超！
  //    所以这里的宽度都是按 (w-32)/430*932+120+top < 2796 反算过的（见下注释）。
  const phones = pad
    ? (shot.raw2
        ? phoneHTML(r(shot.raw), { lang, ...sbBase, w: 1180, left: 110, top: 800, rot: shot.tilt || -2 })
          + phoneHTML(r(shot.raw2), { lang, ...sbBase, w: 700, right: 26, top: 1760, rot: 6, z: 5, sbH: 44, sbF: 20, sbP: 32 })
        : phoneHTML(r(shot.raw), { lang, ...sbBase, w: shot.pills ? 1280 : 1340, cx: 1, top: shot.pills ? 780 : 700, rot: shot.tilt || 0 }))
    : (shot.raw2
        ? phoneHTML(r(shot.raw), { lang, ...sbBase, w: 860, left: 40, top: 700, rot: shot.tilt || -2 })
          + phoneHTML(r(shot.raw2), { lang, w: 520, right: 18, top: 1810, rot: 6, z: 5, sbH: 60, sbF: 24, sbP: 36, islW: 170, islH: 44 })
        : phoneHTML(r(shot.raw), { lang, ...sbBase, w: shot.pills ? 900 : 940, cx: 1, top: shot.pills ? 700 : 640, rot: shot.tilt || 0 }));

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;position:relative;
    font-family:'Fraunces','Segoe UI','Microsoft YaHei','Nirmala UI',sans-serif;
    background:linear-gradient(165deg,#FBF6E9 0%,#F2EEDC 45%,#E7F0E4 100%)}
  .blob{position:absolute;border-radius:50%;filter:blur(2px)}
  .b1{width:${900 * k}px;height:${900 * k}px;left:${-280 * k}px;top:${-250 * k}px;background:radial-gradient(circle,rgba(226,168,40,.28) 0%,rgba(226,168,40,0) 70%)}
  .b2{width:${960 * k}px;height:${960 * k}px;right:${-340 * k}px;top:${880 * k}px;background:radial-gradient(circle,rgba(24,120,80,.20) 0%,rgba(24,120,80,0) 70%)}
  .b3{width:${760 * k}px;height:${760 * k}px;left:${-200 * k}px;bottom:${-180 * k}px;background:radial-gradient(circle,rgba(226,168,40,.20) 0%,rgba(226,168,40,0) 70%)}
  .edge{position:absolute;opacity:.10;z-index:1;font-size:${240 * k}px;top:${1460 * k}px;color:#0E4A34}
  .head{position:absolute;top:${140 * k}px;left:${80 * k}px;right:${80 * k}px;text-align:center;z-index:6}
  .head h1{font-size:${100 * k}px;line-height:1.1;font-weight:800;color:#123D2B;letter-spacing:-1px}
  .head h1 .hl{background:linear-gradient(120deg,#C98A12,#E0A93B);-webkit-background-clip:text;background-clip:text;color:transparent}
  .head p{margin-top:${28 * k}px;font-size:${44 * k}px;font-weight:700;color:#3F6E56;font-family:'Segoe UI','Microsoft YaHei','Nirmala UI',sans-serif}
  .pills{display:flex;gap:${22 * k}px;justify-content:center;margin-top:${34 * k}px}
  .pill{padding:${10 * k}px ${34 * k}px;border-radius:999px;background:#fff;color:#0E4A34;
    border:${2 * k}px solid rgba(201,138,18,.45);font-weight:700;font-size:${38 * k}px;
    box-shadow:0 ${10 * k}px ${22 * k}px ${-10 * k}px rgba(18,61,43,.35);
    font-family:'Segoe UI','Microsoft YaHei','Nirmala UI',sans-serif}
  .wave{position:absolute;bottom:0;left:0;z-index:1}
  .phone{position:absolute;filter:drop-shadow(0 ${60 * k}px ${70 * k}px rgba(18,61,43,.45))}
  .dev{background:#17171A}
  .win{overflow:hidden;background:#0B3B2A;position:relative}
  .win img{display:block}
  .sb{position:relative;display:flex;align-items:center;justify-content:space-between;
    background:#0D4230;color:#EAF6EF;font-weight:700;
    font-family:'Segoe UI',sans-serif}
  .isl{position:absolute;left:50%;transform:translateX(-50%);border-radius:999px;background:#101013}
  .sbr{display:flex;align-items:center;gap:${14 * k}px}
  .sig{display:inline-flex;gap:${5 * k}px;align-items:flex-end}
  .sig i{display:block;width:${8 * k}px;background:currentColor;border-radius:2px}
  .sig i:nth-child(1){height:${11 * k}px}.sig i:nth-child(2){height:${16 * k}px}
  .sig i:nth-child(3){height:${21 * k}px}.sig i:nth-child(4){height:${26 * k}px}
  .bat{display:inline-block;width:${52 * k}px;height:${26 * k}px;border:${4 * k}px solid currentColor;border-radius:${8 * k}px;position:relative;opacity:.9}
  .bat b{position:absolute;top:${3 * k}px;bottom:${3 * k}px;left:${3 * k}px;right:${8 * k}px;background:currentColor;border-radius:3px}
  .stick{position:absolute;z-index:7;width:${280 * k}px;height:${280 * k}px;border-radius:50%;overflow:hidden;
    border:${12 * k}px solid #fff;background:#fff;
    ${shot.stickPos === 'in-br' ? `right:${200 * k}px;top:${(pad ? 2270 : 2160) * (pad ? 1 : 1)}px;transform:rotate(8deg);`
                                : `left:${210 * k}px;top:${(pad ? 2250 : 2140) * (pad ? 1 : 1)}px;transform:rotate(-8deg);`}
    box-shadow:0 ${30 * k}px ${60 * k}px ${-20 * k}px rgba(18,61,43,.55)}
  .stick img{width:100%;height:100%;object-fit:cover}
  .suit{position:absolute;z-index:7;color:#1B6B4A;opacity:.55}
  .suit.s2,.suit.s3{color:#C0392B;opacity:.45}
</style></head><body>
  <div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>
  <div class="edge" style="left:${-40 * k}px">♠</div>
  <div class="edge" style="right:${-40 * k}px">♦</div>
  <svg class="wave" width="${W}" height="${420 * k}" viewBox="0 0 1290 420" preserveAspectRatio="none">
    <defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1B6B4A"/><stop offset="0.5" stop-color="#2E8B5F"/><stop offset="1" stop-color="#1B6B4A"/></linearGradient></defs>
    <path d="M0 210 C215 120 430 300 645 210 C860 120 1075 300 1290 210 L1290 420 L0 420 Z" fill="url(#wg)" opacity="0.22"/>
    <path d="M0 260 C215 180 430 340 645 260 C860 180 1075 340 1290 260 L1290 420 L0 420 Z" fill="#C98A12" opacity="0.16"/>
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
      await pg.waitForTimeout(240);
      await pg.screenshot({ path: path.join(out, shot.id + '.png') });
    }
    console.log('final:', locale + '/' + dev, SHOTS.length + ' 张');
  }
  await br.close();
}

(async () => {
  fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(FIN, { recursive: true });
  const onlyPhone = process.argv.includes('--phone'), onlyPad = process.argv.includes('--pad');
  const devices = onlyPhone ? [false] : onlyPad ? [true] : [false, true];
  const only = (process.argv.find(a => a.startsWith('--locale=')) || '').split('=')[1];
  const locales = only ? [only] : Object.keys(CAPS);
  const langs = [...new Set(locales.map(l => RAWLANG[l] || 'en'))];
  for (const pad of devices) {
    if (!process.argv.includes('--stage-only')) for (const lang of langs) await pass1(pad, lang);
    await pass2(pad, locales);
  }
  console.log('ALL DONE →', FIN, '|', locales.length, 'locale ×', devices.length, '设备 ×', SHOTS.length, '张');
})().catch(e => { console.error('ERR', e); process.exit(1); });
