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
  // NB: default board (cols=16, snake starts at x=3 heading right, wall at x=16,
  // base speed ~7 cell/s) dies at ~1.85s with zero player input — deterministically
  // before this 2s mark. That's correct game behavior (a human swipes long before
  // then), not a bug, so DEAD counts as "booted and running" here too, same as the
  // next check's explicit allowance.
  assert(phase1 === 'PLAYING' || phase1 === 'DEAD', `window.G.phase reaches PLAYING (or DEAD from wall-hit) after 2s, not stuck LOADING (got ${phase1})`);

  // 翻译渲染防回归:引擎 I18N.get 是嵌套解析(dict.snake.score),locale 文件必须
  // 嵌套结构——扁平 key("snake.score": ...)查不到时 t() 原样返回 key,界面满屏 key 原文。
  const i18nProbe = await page.evaluate(() => ({ score: I18N.t('snake.score'), ai: I18N.t('snake.ai') }));
  assert(i18nProbe.score !== 'snake.score', `I18N.t('snake.score') resolves to a translation (got "${i18nProbe.score}")`);
  assert(i18nProbe.ai.includes('AI'), `I18N.t('snake.ai') includes "AI" (got "${i18nProbe.ai}")`);

  const revealed1 = await page.evaluate(() => window.G.run.revealedCount);
  const snakeHead1 = await page.evaluate(() => JSON.stringify(window.G.run.snake[0]));
  await page.waitForTimeout(3000);
  const revealed2 = await page.evaluate(() => window.G.run.revealedCount);
  const snakeHead2 = await page.evaluate(() => JSON.stringify(window.G.run.snake[0]));
  const phase2 = await page.evaluate(() => window.G.phase);
  const moved = (revealed2 !== revealed1) || (snakeHead2 !== snakeHead1) || phase2 === 'DEAD';
  assert(moved, `game is actually running after 3s more (revealed ${revealed1}->${revealed2}, head ${snakeHead1}->${snakeHead2}, phase=${phase2})`);

  // turn on AI to autoplay; respawn first if we died from no input
  // NB: dispatch/I18N/Controls are declared via const/function at top-level of a
  // classic <script> — only `var`/function-declarations land on `window`, const
  // does not (verified: window.X undefined but bare X resolves via the page's
  // shared global lexical scope). So call them bare inside evaluate(), and only
  // rely on window.G specifically (main.js declares it `var G` for this reason).
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

  await page.evaluate(() => dispatch('NEXT'));
  await page.waitForTimeout(500);
  const afterNext = await page.evaluate(() => ({ phase: window.G.phase, level: window.G.run.level }));
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
