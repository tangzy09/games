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
  // rescueUntil 设极大值 → nowMs 永远够不到 → 救场不到期、不触发停下,AI 代驾到通关。
  await page.evaluate(() => {
    if (window.G.phase === 'DEAD') dispatch('RESPAWN');
    if (window.G.phase === 'READY') dispatch('START');
    window.G.rescueUntil = 1e15;
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
    if (st === 'DEAD') await page.evaluate(() => { dispatch('RESPAWN'); window.G.rescueUntil = 1e15; });
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  assert(reachedLevelDone, `rescue-AI reached LEVEL_DONE within ${timeoutMs / 1000}s (took ${elapsedSec}s)`);
  log(`rescue-AI cleared level in ${elapsedSec}s`);

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
  assert(achProbe.runAchs >= 1, `clear unlocks per-level achievements (got ${achProbe.runAchs})`);
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

  // —— AI 救场 30s:tracker.aiRun=false 的全分人工局(救场借 AI 路径,不降级)——
  let rescueOk = false;
  for (let attempt = 0; attempt < 5 && !rescueOk; attempt++) {
    const ph = await page.evaluate(() => window.G.phase);
    if (ph === 'DEAD') await page.evaluate(() => dispatch('RESPAWN'));
    else if (ph === 'READY') await page.evaluate(() => dispatch('START'));
    await page.evaluate(() => dispatch('RESCUE'));
    await page.waitForTimeout(800);                     // confirm 模拟 400ms 后发放奖励
    rescueOk = await page.evaluate(() =>
      window.G.phase === 'PLAYING' && window.G.rescueUntil > (window.G.nowMs || 0));
  }
  assert(rescueOk, 'RESCUE activates (rescueUntil > nowMs while PLAYING)');
  const posBefore = await page.evaluate(() => JSON.stringify(window.G.run.snake[0]) + '/' + window.G.run.revealedCount);
  await page.waitForTimeout(3000);
  const rescueProbe = await page.evaluate(() => ({
    pos: JSON.stringify(window.G.run.snake[0]) + '/' + window.G.run.revealedCount,
    phase: window.G.phase, aiRun: window.G.tracker.aiRun,
  }));
  assert(rescueProbe.pos !== posBefore && rescueProbe.phase === 'PLAYING',
    `snake alive & moving under rescue AI (${posBefore} -> ${rescueProbe.pos})`);
  assert(rescueProbe.aiRun === false, 'rescue is NOT an AI run (tracker.aiRun=false, 全分)');

  // —— 插屏每 2 关:救场 AI 清完第 2 关 → 人工 NEXT 触发插屏,计数归 0 ——
  await page.evaluate(() => {
    if (window.G.phase === 'PAUSED') dispatch('RESUME');
    if (window.G.phase === 'DEAD') dispatch('RESPAWN');
    if (window.G.phase === 'READY') dispatch('START');
    window.G.rescueUntil = 1e15;   // 救场 AI 代驾清完本关
  });
  let done2 = false;
  const t2 = Date.now();
  while (Date.now() - t2 < 300000) {
    await page.waitForTimeout(1000);
    const st2 = await page.evaluate(() => window.G.phase);
    if (st2 === 'LEVEL_DONE') { done2 = true; break; }
    if (st2 === 'DEAD') await page.evaluate(() => { dispatch('RESPAWN'); window.G.rescueUntil = 1e15; });
    else if (st2 === 'READY' || st2 === 'PAUSED') await page.evaluate(() => { dispatch(window.G.phase === 'PAUSED' ? 'RESUME' : 'START'); window.G.rescueUntil = 1e15; });
  }
  if (!done2) {
    const diag = await page.evaluate(() => ({ phase: window.G.phase, revealed: window.G.run.revealedCount, deaths: window.G.run.deaths }));
    log('level-2 wait diag: ' + JSON.stringify(diag));
  }
  assert(done2, 'rescue-AI cleared level 2 within 300s');
  const sinceBefore = await page.evaluate(() => window.G.save.stats.levelsSinceAd);
  assert(sinceBefore === 1, `levelsSinceAd === 1 before second NEXT (got ${sinceBefore})`);
  await page.evaluate(() => dispatch('NEXT'));   // 人工 NEXT → 触发插屏
  await page.waitForTimeout(1500);
  const sinceAfter = await page.evaluate(() => window.G.save.stats.levelsSinceAd);
  assert(sinceAfter === 0, `interstitial shown and levelsSinceAd reset to 0 (got ${sinceAfter})`);

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
