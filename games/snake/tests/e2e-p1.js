// games/snake/tests/e2e-p1.js — P1 无头 E2E:AI 代打整关通关验证
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

  log('--- snake P1 e2e ---');
  await page.goto(BASE + '/games/snake/', { waitUntil: 'load' });
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

  // turn on AI to autoplay; respawn first if we died from no input
  const phaseBeforeAi = await page.evaluate(() => window.G.phase);
  if (phaseBeforeAi === 'DEAD') {
    await page.evaluate(() => dispatch('RESPAWN'));
  }
  await page.evaluate(() => dispatch('AI_TOGGLE'));
  const aiOn = await page.evaluate(() => window.G.ai);
  assert(aiOn === true, 'AI_TOGGLE turned AI on');

  const deathsAtAiStart = await page.evaluate(() => window.G.run.deaths);
  log(`deaths at AI start: ${deathsAtAiStart}`);

  const t0 = Date.now();
  let reachedLevelDone = false;
  let deathsDuring = deathsAtAiStart;
  const timeoutMs = 240000;
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(1000);
    const st = await page.evaluate(() => ({ phase: window.G.phase, deaths: window.G.run.deaths }));
    deathsDuring = st.deaths;
    if (st.phase === 'LEVEL_DONE') { reachedLevelDone = true; break; }
    if (st.deaths !== deathsAtAiStart)
      assert(false, `no deaths while AI autoplaying (was ${deathsAtAiStart}, now ${st.deaths})`);
  }
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  assert(reachedLevelDone, `AI reached LEVEL_DONE within ${timeoutMs / 1000}s (took ${elapsedSec}s)`);
  assert(deathsDuring === deathsAtAiStart, `deaths unchanged across AI clear run (${deathsAtAiStart} -> ${deathsDuring})`);
  log(`AI cleared level in ${elapsedSec}s, deaths stayed at ${deathsDuring}`);

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
  // NEXT 先过 LOADING(防连点守卫)→ READY → AI 开着会自动 START 回 PLAYING——轮询等待
  let afterNext = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    afterNext = await page.evaluate(() => ({ phase: window.G.phase, level: window.G.run.level }));
    if (afterNext.phase === 'PLAYING') break;
  }
  assert(afterNext.phase === 'PLAYING', `phase back to PLAYING after NEXT (got ${afterNext.phase})`);
  assert(afterNext.level === 2, `G.run.level === 2 after first NEXT (got ${afterNext.level})`);

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
