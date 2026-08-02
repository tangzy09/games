// games/snake/tests/e2e-p1.js — P1 无头 E2E:救场 AI 整关通关 + 全流程验证
// 用法:先起静态服务(仓库根)`python -m http.server 8123`,再跑
//   node games/snake/tests/e2e-p1.js [baseUrl] [screenshotDir]
// 默认 baseUrl=http://localhost:8123 screenshotDir=C:\tmp\snake
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8123';
const SHOT_DIR = process.argv[3] || 'C:\\tmp\\snake';

function log(msg) { console.log(msg); }
function assert(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; throw new Error('assert failed: ' + msg); }
  log('OK: ' + msg);
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
  // web 端 Ads 模拟用 confirm——自动接受即「看完广告」(复活/救场/插屏全流程可测)
  page.on('dialog', d => d.accept());

  log('--- snake P1 e2e ---');
  await page.goto(BASE + '/games/snake/', { waitUntil: 'load' });
  // 每次 E2E 从干净档开始:P2b 引入持久存档,不清的话 img_1 断言在第二次跑时无法区分
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);

  assert(consoleErrors.length === 0, `console errors == 0 (got ${consoleErrors.length}: ${consoleErrors.join(' | ')})`);

  const phase1 = await page.evaluate(() => window.G && window.G.phase);
  assert(phase1 === 'READY', `window.G.phase === 'READY' after load (waiting for player, got ${phase1})`);

  // 翻译渲染防回归:引擎 I18N.get 是嵌套解析(dict.snake.score),locale 文件必须
  // 嵌套结构——扁平 key("snake.score": ...)查不到时 t() 原样返回 key,界面满屏 key 原文。
  // NB: dispatch/I18N/Controls 是顶层 const/function——只有 var/函数声明挂 window,
  // 在 evaluate() 里用裸名调用;window.G 能用是因为 main.js 特意声明 var G。
  const i18nProbe = await page.evaluate(() => ({ score: I18N.t('snake.score'), ai: I18N.t('snake.ai'), hint: I18N.t('snake.hintStartKey'), isTouch: IS_TOUCH }));
  assert(i18nProbe.score !== 'snake.score', `I18N.t('snake.score') resolves to a translation (got "${i18nProbe.score}")`);
  assert(i18nProbe.ai.includes('AI'), `I18N.t('snake.ai') includes "AI" (got "${i18nProbe.ai}")`);
  assert(i18nProbe.hint !== 'snake.hintStartKey', `I18N.t('snake.hintStartKey') resolves to a translation (got "${i18nProbe.hint}")`);
  // headless chromium maxTouchPoints=0 → 桌面分支;IS_TOUCH 是 render.js 顶层 const,evaluate 裸名可访问
  assert(i18nProbe.isTouch === false, `IS_TOUCH === false in desktop headless (got ${i18nProbe.isTouch})`);

  // READY 待机:蛇不动,START 后才开跑
  await page.evaluate(() => dispatch('START'));
  const phaseStarted = await page.evaluate(() => window.G.phase);
  assert(phaseStarted === 'PLAYING', `phase === 'PLAYING' after START (got ${phaseStarted})`);

  const revealed1 = await page.evaluate(() => window.G.run.revealedCount);
  const snakeHead1 = await page.evaluate(() => JSON.stringify(window.G.run.snake[0]));
  await page.waitForTimeout(3000);
  const revealed2 = await page.evaluate(() => window.G.run.revealedCount);
  const snakeHead2 = await page.evaluate(() => JSON.stringify(window.G.run.snake[0]));
  const phase2 = await page.evaluate(() => window.G.phase);
  const moved = (revealed2 !== revealed1) || (snakeHead2 !== snakeHead1) || phase2 === 'DEAD';
  assert(moved, `game is actually running after 3s more (revealed ${revealed1}->${revealed2}, head ${snakeHead1}->${snakeHead2}, phase=${phase2})`);

  // —— 复活广告位:初始无输入撞墙死 → REVIVE → 原地原长复活(confirm 已自动接受)——
  let phNow = await page.evaluate(() => window.G.phase);
  for (let i = 0; i < 20 && phNow !== 'DEAD'; i++) {   // 万一 3s 时还没死,等它撞墙
    await page.waitForTimeout(500);
    phNow = await page.evaluate(() => window.G.phase);
  }
  assert(phNow === 'DEAD', `died at wall for revive test (got ${phNow})`);
  const lenAtDeath = await page.evaluate(() => window.G.run.snake.length);
  // 先把方向拨离墙(死亡态 setDir 只设 nextDir),复活后能活一段供断言
  await page.evaluate(() => { Core.setDir(window.G.run, 'up'); dispatch('REVIVE'); });
  let revived = false;
  for (let i = 0; i < 10 && !revived; i++) {
    await page.waitForTimeout(300);
    revived = await page.evaluate(() => window.G.save.stats.revives === 1 && window.G.phase === 'PLAYING');
  }
  assert(revived, 'REVIVE: phase back to PLAYING and stats.revives === 1');
  const revLen = await page.evaluate(() => window.G.run.snake.length);
  assert(revLen >= lenAtDeath, `revive keeps snake length, not halved (${lenAtDeath} -> ${revLen})`);

  // 已去掉「AI 代打」;用「救场 AI 一直代驾」通关(救场借用同一 AI 哈密顿路径)。
  // aiOn=true → 免费 AI 代驾到通关(2026-08-01：旧版靠 rescueUntil 设极大值撑住限时救场)。
  await page.evaluate(() => {
    if (window.G.phase === 'DEAD') dispatch('RESPAWN');
    if (window.G.phase === 'READY') dispatch('START');
    window.G.aiOn = true;
  });
  const deathsAtAiStart = await page.evaluate(() => window.G.run.deaths);
  log(`deaths at AI start: ${deathsAtAiStart}`);

  const t0 = Date.now();
  let reachedLevelDone = false;
  const timeoutMs = 240000;
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => window.G.phase);
    if (st === 'LEVEL_DONE') { reachedLevelDone = true; break; }
    if (st === 'DEAD') await page.evaluate(() => { dispatch('RESPAWN'); window.G.aiOn = true; });
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  assert(reachedLevelDone, `AI reached LEVEL_DONE within ${timeoutMs / 1000}s (took ${elapsedSec}s)`);
  log(`AI cleared level in ${elapsedSec}s`);

  // 果子系统集成:AI 通关一整关,特殊果必然刷过、且 AI 吃到过
  const fruitsProbe = await page.evaluate(() => ({
    spawned: window.G.run.stats.specialsSpawned,
    eaten: Object.values(window.G.run.stats.specials).reduce((a, b) => a + b, 0),
  }));
  assert(fruitsProbe.spawned > 0, `specials spawned during AI run (got ${fruitsProbe.spawned})`);
  assert(fruitsProbe.eaten > 0, `AI ate specials (got ${fruitsProbe.eaten})`);
  log(`specials: spawned ${fruitsProbe.spawned}, eaten ${fruitsProbe.eaten}`);

  // 过关图片全屏欣赏:点图放大,再点收回
  await page.evaluate(() => dispatch('IMG_FULL'));
  assert(await page.evaluate(() => window.G.imgFull) === true, 'IMG_FULL enters fullscreen view');
  await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-img-full.png') });
  await page.evaluate(() => dispatch('IMG_CLOSE'));
  assert(await page.evaluate(() => window.G.imgFull) === false, 'IMG_CLOSE restores overlay');

  await page.evaluate(() => dispatch('NEXT'));
  // NEXT 先过 LOADING(防连点守卫)→ READY(不再自动开跑)→ 到 READY 后手动 START
  let afterNext = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    afterNext = await page.evaluate(() => ({ phase: window.G.phase, level: window.G.run.level }));
    if (afterNext.phase === 'READY') { await page.evaluate(() => dispatch('START')); afterNext.phase = 'PLAYING'; break; }
    if (afterNext.phase === 'PLAYING') break;
  }
  assert(afterNext.phase === 'PLAYING', `phase back to PLAYING after NEXT+START (got ${afterNext.phase})`);
  assert(afterNext.level === 2, `G.run.level === 2 after first NEXT (got ${afterNext.level})`);

  // 成就:通关解锁图鉴类累计成就(img_1)+ 单局成就(已去掉 AI 代打反刷,救场算全分人工局)
  const achProbe = await page.evaluate(() => ({
    unlocked: window.G.save.ach.unlocked.slice(),
    runAchs: window.G.save.ach.unlocked.filter(id => id.startsWith('r_')).length,
  }));
  assert(achProbe.unlocked.includes('img_1'), `img_1 unlocked after first clear (got ${achProbe.unlocked.join(',')})`);
  // ⭐ AI 免费开放后的防刷边界(2026-08-01,引擎既有逻辑,这里钉死):
  //    AI 局**只给累计成就**(img_*/aic_*/levelsCleared…),**单局成就 r_* 与纪录一律不给**。
  //    本关是 AI 代驾清的 ⇒ runAchs 必须是 0;人工局才拿得到(见 test-achievements)。
  assert(achProbe.runAchs === 0, `AI 局不解锁单局成就 r_*(got ${achProbe.runAchs})`);
  assert(achProbe.unlocked.includes('aic_1'), `AI 通关计入 aiClears 系列(got ${achProbe.unlocked.join(',')})`);
  // 存档续玩:reload 后 stats 保留
  const applesBefore = await page.evaluate(() => window.G.save.stats.apples);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const applesAfter = await page.evaluate(() => window.G.save.stats.apples);
  assert(applesAfter >= applesBefore && applesBefore > 0, `save persists across reload (${applesBefore} -> ${applesAfter})`);
  // 成就墙可打开
  await page.evaluate(() => openAchievements('cum'));
  const items = await page.evaluate(() => document.querySelectorAll('.ach-item').length);
  assert(items === 100, `cum tab renders 100 badges (got ${items})`);
  await page.evaluate(() => document.getElementById('panel-close').click());

  // 图鉴:过关图已解锁;面板可开;500 manifest
  const galProbe = await page.evaluate(() => ({
    unlocked: window.G.save.gallery.unlocked.length,
    total: window.G.manifest.images.length,
    sets: window.G.manifest.sets.length,
  }));
  assert(galProbe.unlocked >= 1, `gallery unlocked >= 1 (got ${galProbe.unlocked})`);
  assert(galProbe.total === 500 && galProbe.sets === 25, `manifest 500/25 (got ${galProbe.total}/${galProbe.sets})`);
  await page.evaluate(() => openGallery());
  const setRows = await page.evaluate(() => document.querySelectorAll('.gal-set').length);
  assert(setRows === 25, `gallery renders 25 sets (got ${setRows})`);
  await page.evaluate(() => document.getElementById('panel-close').click());
  // 皮肤:解锁星夜并切换,PAL 变化 + 存档记录
  await page.evaluate(() => { window.G.save.stats.levelsCleared = 5; });
  await page.evaluate(() => { openSkins(); });
  const palBefore = await page.evaluate(() => PAL.bg);
  await page.evaluate(() => applyThemeFromUI('star'));
  const palAfter = await page.evaluate(() => ({ bg: PAL.bg, saved: window.G.save.settings.theme }));
  assert(palAfter.bg !== palBefore && palAfter.saved === 'star', `theme switch works (${palBefore} -> ${palAfter.bg}, saved=${palAfter.saved})`);
  const shotSkin = path.join(SHOT_DIR, 'e2e-skin-star.png');
  await page.evaluate(() => document.getElementById('panel-close').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotSkin });
  log(`screenshot saved: ${shotSkin}`);
  await page.evaluate(() => { applyThemeFromUI('cloud'); });
  // 分享:shareCard 函数存在,headless 无 Web Share → 走下载分支返回 'downloaded'
  const shareRes = await page.evaluate(async () =>
    (typeof Gallery.shareCard === 'function')
      ? Gallery.shareCard(window.G.img, window.G.run.score, PAL,
          { title: 'Angel Snake', score: 'Score', url: 'x' })
      : 'missing');
  assert(shareRes === 'downloaded', `shareCard falls back to download in headless (got ${shareRes})`);

  // —— ⭐ AI 代打:**免费开关**(2026-08-01 改;旧版是「看 30s 广告换代驾」,已作废)——
  //    钉三件事:① 开它零广告调用 ② 真的在代驾 ③ 用过就标记 aiUsedThisLevel(星级封顶 ★1)
  let adCalls = 0;
  page.on('dialog', () => { adCalls++; });          // 已有 accept 监听;这条只计数
  let aiOk = false;
  for (let attempt = 0; attempt < 5 && !aiOk; attempt++) {
    const ph = await page.evaluate(() => window.G.phase);
    if (ph === 'DEAD') await page.evaluate(() => dispatch('RESPAWN'));
    else if (ph === 'READY') await page.evaluate(() => dispatch('START'));
    await page.evaluate(() => { if (!window.G.aiOn) dispatch('AI_TOGGLE'); });
    await page.waitForTimeout(300);
    aiOk = await page.evaluate(() => window.G.phase === 'PLAYING' && window.G.aiOn === true);
  }
  assert(aiOk, 'AI_TOGGLE turns AI on while PLAYING');
  assert(adCalls === 0, '⛔ AI 代打零广告调用(核心体验不锁广告)');
  const posBefore = await page.evaluate(() => JSON.stringify(window.G.run.snake[0]) + '/' + window.G.run.revealedCount);
  await page.waitForTimeout(3000);
  const aiProbe = await page.evaluate(() => ({
    pos: JSON.stringify(window.G.run.snake[0]) + '/' + window.G.run.revealedCount,
    phase: window.G.phase, used: window.G.aiUsedThisLevel, saved: window.G.save.settings.aiOn,
  }));
  assert(aiProbe.pos !== posBefore && aiProbe.phase === 'PLAYING',
    `snake alive & moving under free AI (${posBefore} -> ${aiProbe.pos})`);
  assert(aiProbe.used === true, 'AI 用过 ⇒ aiUsedThisLevel=true(结算星级封顶 ★1)');
  assert(aiProbe.saved === true, 'AI 开关持久化到 settings.aiOn');

  // —— 插屏闸门:AI 清完第 2 关 → 人工 NEXT;蜜月期(前 50 关)应当零插屏 ——
  await page.evaluate(() => {
    if (window.G.phase === 'PAUSED') dispatch('RESUME');
    if (window.G.phase === 'DEAD') dispatch('RESPAWN');
    if (window.G.phase === 'READY') dispatch('START');
    window.G.aiOn = true;   // 免费 AI 代驾清完本关
  });
  let done2 = false;
  const t2 = Date.now();
  while (Date.now() - t2 < 300000) {
    await page.waitForTimeout(1000);
    const st2 = await page.evaluate(() => window.G.phase);
    if (st2 === 'LEVEL_DONE') { done2 = true; break; }
    if (st2 === 'DEAD') await page.evaluate(() => { dispatch('RESPAWN'); window.G.aiOn = true; });
    else if (st2 === 'READY' || st2 === 'PAUSED') await page.evaluate(() => { dispatch(window.G.phase === 'PAUSED' ? 'RESUME' : 'START'); window.G.aiOn = true; });
  }
  if (!done2) {
    const diag = await page.evaluate(() => ({ phase: window.G.phase, revealed: window.G.run.revealedCount, deaths: window.G.run.deaths }));
    log('level-2 wait diag: ' + JSON.stringify(diag));
  }
  assert(done2, 'AI cleared level 2 within 300s');
  // ⭐ 广告闸门（adgate.js，2026-07-31 全仓对齐）——旧断言钉的是「每 2 关一插屏」，已作废。
  //    现在钉的是新策略：**新玩家（前 50 关）一个插屏都不出**。
  const sinceBefore = await page.evaluate(() => window.G.save.stats.levelsSinceAd);
  assert(sinceBefore === 1, `levelsSinceAd === 1 before second NEXT (got ${sinceBefore})`);
  await page.evaluate(() => dispatch('NEXT'));
  await page.waitForTimeout(1500);
  const gateNewbie = await page.evaluate(() => ({
    since: window.G.save.stats.levelsSinceAd,
    lastAdAt: window.G.save.stats.lastAdAt,
    cleared: window.G.save.stats.levelsCleared,
  }));
  assert(gateNewbie.since === 2 && gateNewbie.lastAdAt === 0,
    `⛔ 蜜月期零插屏：过了 ${gateNewbie.cleared} 关仍不出（levelsSinceAd 累加到 ${gateNewbie.since}、lastAdAt 未动）`);
  // 老玩家侧：造出「>50 关 + 攒够 10 关 + 距上次够久」→ 闸门开
  const gateVeteran = await page.evaluate(() => {
    const st = window.G.save.stats;
    st.levelsCleared = 60; st.levelsSinceAd = 10; st.lastAdAt = 0;
    const can = AdGate.canShow(st, Date.now());
    AdGate.noteShown(st, Date.now());
    return { can, since: st.levelsSinceAd, tooSoon: AdGate.canShow(st, Date.now()) };
  });
  assert(gateVeteran.can === true, 'veteran (>50 clears, 10 since) passes the gate');
  assert(gateVeteran.since === 0 && gateVeteran.tooSoon === false,
    'noteShown resets counter and the 2-min gap blocks the next one');

  const shot1 = path.join(SHOT_DIR, 'e2e-p1.png');
  await page.screenshot({ path: shot1 });
  log(`screenshot saved: ${shot1}`);

  await page.evaluate(async () => { await I18N.setLang('zh-CN'); Controls.render(); });
  await page.waitForTimeout(300);
  const zhScore = await page.evaluate(() => I18N.t('snake.score'));
  assert(zhScore === '分数', `zh-CN loaded: I18N.t('snake.score') === '分数' (got "${zhScore}")`);
  const shot2 = path.join(SHOT_DIR, 'e2e-p1-zh.png');
  await page.screenshot({ path: shot2 });
  log(`screenshot saved: ${shot2}`);

  await browser.close();
  log('--- snake P1 e2e: ALL PASS ---');
}

main().catch(err => {
  console.error('E2E FAILED:', err.message);
  process.exit(1);
});
