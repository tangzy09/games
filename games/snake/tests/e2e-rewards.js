// games/snake/tests/e2e-rewards.js — 激励视频「六个位」冒烟：奖励真发、额度真扣、拒绝真不发
// 用法:先起静态服务(仓库根)`python -m http.server 8123`,再跑
//   node games/snake/tests/e2e-rewards.js [baseUrl]
// ⚠ 这批断言是**经济红线**:奖励给得厚 ⇒ 额度是唯一护栏,额度失效=500 张图鉴当天刷穿。
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8123';
// 本地静态服务从仓库根起,线上子域(snake.ai-speeds.com)直接就是游戏根 ⇒ 路径要能换
const PATH = process.argv[3] || (/localhost|127\.0\.0\.1/.test(BASE) ? '/games/snake/' : '/');
function assert(cond, msg) {
  if (!cond) { console.error('FAIL: ' + msg); process.exitCode = 1; throw new Error('assert failed: ' + msg); }
  console.log('OK: ' + msg);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 800 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  let acceptAds = true;                       // web 端 Ads 模拟走 confirm
  page.on('dialog', d => (acceptAds ? d.accept() : d.dismiss()));

  console.log('--- snake 激励奖励 e2e ---');
  await page.goto(BASE + PATH, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const R = await page.evaluate(() => ({ ...AD_REWARD }));
  const C = await page.evaluate(() => ({ ...AD_CAPS }));
  console.log('奖励表', JSON.stringify(R), '额度表', JSON.stringify(C));
  assert(R.gal >= 5 && R.daily >= 3 && R.boost >= 3 && R.double >= 3, '奖励额度够厚(用户要求「一定要丰厚」)');

  // —— 位①图鉴 +N 张 ——
  {
    const before = await page.evaluate(() => window.G.save.gallery.unlocked.length);
    await page.evaluate(() => dispatch('AD_GALLERY'));
    await sleep(400);
    const after = await page.evaluate(() => ({
      n: window.G.save.gallery.unlocked.length, used: window.G.save.ads.gal,
    }));
    assert(after.n === before + R.gal, `图鉴广告发满 ${R.gal} 张(${before}→${after.n})`);
    assert(after.used === 1, '图鉴广告扣 1 次额度');
  }

  // —— 额度护栏:刷到上限后不再发 ——
  {
    for (let i = 1; i < C.gal; i++) { await page.evaluate(() => dispatch('AD_GALLERY')); await sleep(500); }
    const at = await page.evaluate(() => ({ n: window.G.save.gallery.unlocked.length, used: window.G.save.ads.gal }));
    assert(at.used === C.gal, `图鉴广告用满当日额度 ${C.gal}`);
    await page.evaluate(() => dispatch('AD_GALLERY'));
    await sleep(400);
    const over = await page.evaluate(() => ({ n: window.G.save.gallery.unlocked.length, used: window.G.save.ads.gal }));
    assert(over.n === at.n && over.used === at.used, '⛔ 超额度后零发放(500 张图鉴不会被一天刷穿)');
  }

  // —— 位②皮肤:广告直接永久解锁一款 ——
  {
    const before = await page.evaluate(() => ({
      skins: window.G.save.skins.slice(),
      locked: Themes.THEME_ORDER.filter(k => !Themes.themeUnlocked(k, window.G.save)),
    }));
    assert(before.locked.length > 0, `sanity: 新档有未解锁皮肤(${before.locked.join(',')})`);
    await page.evaluate(() => dispatch('AD_SKIN'));
    await sleep(500);
    const after = await page.evaluate(() => ({
      skins: window.G.save.skins.slice(), used: window.G.save.ads.skin,
      unlocked: Themes.themeUnlocked(window.G.save.skins[0], window.G.save),
    }));
    assert(after.skins.length === 1 && after.skins[0] === before.locked[0],
      `皮肤广告解锁了下一款未解锁皮肤(${after.skins[0]})`);
    assert(after.unlocked === true, '解锁后 themeUnlocked 立刻放行');
    assert(after.used === 1, '皮肤广告扣 1 次额度');
    // 存档 round-trip:重载后仍解锁(闭合对象新字段必须进 defaults,否则 merge 丢)
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const kept = await page.evaluate(() => ({
      skins: window.G.save.skins.slice(), used: window.G.save.ads.skin,
    }));
    assert(kept.skins.length === 1, '广告解锁的皮肤跨重载保留');
    assert(kept.used === 1, '当日额度计数跨重载保留(否则刷新页面=额度归零)');
  }

  // —— 位③开局礼包:READY 屏拿 N 个**不重样的真增益** ——
  // ⛔ 这里断言的是「没有空签」:曾经池子是全部果子,能抽到 scissors(开局蛇长 3,减身什么也没发生)
  //    ⇒ 看完广告 run 状态一点没变。奖励里出现空签比不给还伤。
  {
    const before = await page.evaluate(() => ({
      phase: window.G.phase, eff: JSON.stringify(window.G.run.effects),
      apples: window.G.run.extraApples.length, score: window.G.run.score,
      rev: window.G.run.revealedCount,
    }));
    assert(before.phase === 'READY', `sanity: 重载后在 READY(got ${before.phase})`);
    const pool = await page.evaluate(() => BOOST_POOL.slice());
    assert(!pool.includes('scissors') && !pool.includes('demon'),
      '⛔ 礼包池不含空签/负面果(scissors 开局无效、demon 提速是负面)');
    assert(pool.length >= (await page.evaluate(() => AD_REWARD.boost)),
      '池子够大 ⇒ 四个增益保证不重样');
    await page.evaluate(() => dispatch('AD_BOOST'));
    await sleep(500);
    const after = await page.evaluate(() => ({
      eff: JSON.stringify(window.G.run.effects), used: window.G.save.ads.boost,
      apples: window.G.run.extraApples.length, score: window.G.run.score,
      rev: window.G.run.revealedCount,
    }));
    const changed = after.eff !== before.eff || after.apples > before.apples
      || after.score > before.score || after.rev > before.rev;
    assert(changed, '开局礼包真的改了局面(拿到了实打实的增益)');
    assert(after.used === 1, '开局礼包扣 1 次额度');
  }

  // —— 位④任务加速:直接完成一个今日任务并发奖 ——
  {
    const before = await page.evaluate(() => {
      const day = ymd(Date.now());
      return { done: Quests.status(window.G.save, day).filter(q => q.done).length,
               n: window.G.save.gallery.unlocked.length };
    });
    await page.evaluate(() => dispatch('AD_QUEST'));
    await sleep(600);
    const after = await page.evaluate(() => {
      const day = ymd(Date.now());
      return { done: Quests.status(window.G.save, day).filter(q => q.done).length,
               n: window.G.save.gallery.unlocked.length, used: window.G.save.ads.quest };
    });
    assert(after.done === before.done + 1, `任务广告完成了 1 个任务(${before.done}→${after.done})`);
    assert(after.n > before.n, '任务完成同时发放了天使奖励(走 grantAngels 统一发放口)');
    assert(after.used === 1, '任务广告扣 1 次额度');
  }

  // —— 位⑤复活:救场必须给足(护盾+穿身),否则复活即再死 ——
  {
    await page.evaluate(() => { dispatch('START'); });
    let ph = 'PLAYING';
    for (let i = 0; i < 40 && ph !== 'DEAD'; i++) { await sleep(400); ph = await page.evaluate(() => window.G.phase); }
    assert(ph === 'DEAD', '撞墙死亡(准备测复活)');
    await page.evaluate(() => dispatch('REVIVE'));
    await sleep(500);
    const rev = await page.evaluate(() => ({
      phase: window.G.phase, shield: window.G.run.effects.shield,
      ghost: window.G.run.effects.ghostUntil - (window.G.nowMs || 0),
    }));
    assert(rev.phase === 'PLAYING', '复活回到 PLAYING');
    assert(rev.shield >= 3, `复活给足护盾(${rev.shield} 层,救场不能给完就再死)`);
    assert(rev.ghost >= 9000, `复活给足穿身无敌(${Math.round(rev.ghost)}ms)`);
  }

  // —— 位⑥结算翻倍:赢局结算屏(全场转化最高的位置),每关限一次 ——
  {
    // 手搓 LEVEL_DONE:AD_DOUBLE 只看 phase + doubledThisLevel,不碰盘面,故可安全手搓
    await page.evaluate(() => { window.G.phase = 'LEVEL_DONE'; window.G.doubledThisLevel = false; });
    const before = await page.evaluate(() => window.G.save.gallery.unlocked.length);
    await page.evaluate(() => dispatch('AD_DOUBLE'));
    await sleep(500);
    const after = await page.evaluate(() => ({
      n: window.G.save.gallery.unlocked.length, flag: window.G.doubledThisLevel,
    }));
    assert(after.n === before + R.double, `结算翻倍发满 ${R.double} 张(${before}→${after.n})`);
    assert(after.flag === true, '翻倍标记已置(每关限一次)');
    await page.evaluate(() => dispatch('AD_DOUBLE'));
    await sleep(500);
    const twice = await page.evaluate(() => window.G.save.gallery.unlocked.length);
    assert(twice === after.n, '⛔ 同一关不能反复翻倍');
  }

  // —— ⛔ 拒绝广告 ⇒ 零发放且不扣额度(全场最重要的一条:不许「点了叉也给/也扣」)——
  {
    acceptAds = false;
    await page.evaluate(() => { window.G.save.ads = { day: '', gal: 0, boost: 0, quest: 0, skin: 0 }; persist(); });
    const before = await page.evaluate(() => ({
      n: window.G.save.gallery.unlocked.length, ads: JSON.stringify(window.G.save.ads),
      skins: window.G.save.skins.length,
    }));
    for (const a of ['AD_GALLERY', 'AD_SKIN', 'AD_BOOST', 'AD_QUEST']) {
      await page.evaluate(act => dispatch(act), a); await sleep(350);
    }
    const after = await page.evaluate(() => ({
      n: window.G.save.gallery.unlocked.length,
      ads: JSON.stringify({ ...window.G.save.ads, day: '' }),
      skins: window.G.save.skins.length,
    }));
    assert(after.n === before.n, '拒绝广告 ⇒ 一张天使都不发');
    assert(after.skins === before.skins, '拒绝广告 ⇒ 不解锁皮肤');
    assert(after.ads === before.ads, '拒绝广告 ⇒ 额度一次都不扣(拒绝不惩罚玩家)');
    acceptAds = true;
  }

  assert(errs.length === 0, `console errors == 0 (got ${errs.length}: ${errs.join(' | ')})`);
  await browser.close();
  console.log('--- snake 激励奖励 e2e: ALL PASS ---');
}
main().catch(e => { console.error(e); process.exit(1); });
