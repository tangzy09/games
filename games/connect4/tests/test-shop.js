// ════════════════════════════════════════
// test-shop.js —— 变现闸门的门禁（P5 · DESIGN §8）。
//
// §8 的三条红线在这里逐条钉死。⚠ 这一层的失败模式是「悄悄多放了一个广告」——
//   没有报错、玩家只是烦，而差评是几周后才来的。⇒ 每条都配反向对照。
// ════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SH = require('../js/shop.js');

// ─────────── ① ⛔⛔ 红线③：输局**永不**出插屏 ───────────
// 刚输完就弹广告是这个品类最招差评的一件事，而且它与 §6.6「让输不疼」正面冲突 ——
// 那一整节的设计会被一个插屏全部抵消。
{
  // ⚠ 故意把**其余条件全部拉成「该放」**，只有 lost=true ⇒ 仍然不许放
  const r = SH.interstitial({ rounds: 100, lost: true, now: 9e9, lastAt: 0 });
  assert.strictEqual(r.show, false, '⛔⛔ 输局出了插屏 —— §6.6 那一整节会被它全部抵消');
  assert.strictEqual(r.why, 'lost', '原因要指明是输局（⇒ 这条闸压过其余一切）');
  // ⭐ 反向对照：同样的条件下**赢局**是该放的（⛔ 少了这条，①可能只是「恒不放」）
  const w = SH.interstitial({ rounds: 100, lost: false, now: 9e9, lastAt: 0 });
  assert.strictEqual(w.show, true,
    '⭐ 反向对照：同样条件下赢局该放（否则上面那条可能只是「恒不放」的假绿）');
  console.log('test-shop: ① ⛔⛔ 输局永不出插屏（+ 赢局反向对照）OK');
}

// ─────────── ② ⭐ 红线②：前 50 盘零插屏（**商店页的明面卖点**）───────────
{
  for (let n = 1; n <= SH.FREE_ROUNDS; n++) {
    const r = SH.interstitial({ rounds: n, lost: false, now: 9e9, lastAt: 0 });
    assert.strictEqual(r.show, false,
      '⛔ 第 ' + n + ' 盘就出了插屏 —— 「前 ' + SH.FREE_ROUNDS + ' 盘零插屏」是写进商店页的承诺');
  }
  assert.strictEqual(SH.FREE_ROUNDS, 50, '⛔ 别偷偷调小这个数：它是明面卖点');
  // ⭐ 第 51 盘之后才可能有（且要撞上 EVERY_N 的节奏）
  let firstShow = 0;
  for (let n = SH.FREE_ROUNDS + 1; n <= 200 && !firstShow; n++) {
    if (SH.interstitial({ rounds: n, lost: false, now: 9e9, lastAt: 0 }).show) firstShow = n;
  }
  assert.ok(firstShow > SH.FREE_ROUNDS, '第一个插屏必须在 50 盘之后（实际第 ' + firstShow + ' 盘）');
  console.log('test-shop: ② ⭐ 前 ' + SH.FREE_ROUNDS + ' 盘零插屏，第一个出现在第 ' + firstShow + ' 盘 OK');
}

// ─────────── ③ 节奏：每 10 盘至多一个 + 距上次 ≥2min ───────────
{
  let n = 0;
  for (let r = SH.FREE_ROUNDS + 1; r <= SH.FREE_ROUNDS + 100; r++) {
    if (SH.interstitial({ rounds: r, lost: false, now: 9e9, lastAt: 0 }).show) n++;
  }
  assert.ok(n <= 10, '⛔ 100 盘里出了 ' + n + ' 个插屏（每 ' + SH.EVERY_N + ' 盘至多一个 ⇒ ≤10）');
  // ⭐ 距上次太近 ⇒ 不放（⚠ 连着两局速胜时会真的撞上）
  const soon = SH.interstitial({ rounds: 60, lost: false, now: 1000, lastAt: 900 });
  assert.strictEqual(soon.show, false, '⛔ 距上一个插屏不足 2 分钟就又放了');
  assert.strictEqual(soon.why, 'tooSoon');
  const far = SH.interstitial({ rounds: 60, lost: false, now: SH.MIN_GAP_MS + 2000, lastAt: 1000 });
  assert.strictEqual(far.show, true, '⭐ 反向对照：隔够了就该放');
  console.log('test-shop: ③ 节奏（每 ' + SH.EVERY_N + ' 盘至多一个 / 距上次 ≥' + (SH.MIN_GAP_MS / 1000) + 's）OK');
}

// ─────────── ④ ⛔⛔ 红线①：提示 / 复盘 / 悔棋 / 课程**永远免费** ───────────
// ⚠⚠ 这条是**反查**：激励视频那张表里绝不许出现这四样中的任何一个。
//   ⛔ 光在别处写「提示不看广告」是不够的 —— 只要奖励位表里混进一个 hint，
//     UI 早晚会把它接上去，而那时没有任何一条断言会红。
{
  const ids = SH.REWARD_SLOTS.map(s => s.id.toLowerCase());
  for (const forbidden of SH.NEVER_PAID) {
    for (const id of ids) {
      assert.ok(id.indexOf(forbidden) < 0,
        '⛔⛔ 激励视频位「' + id + '」碰了「' + forbidden + '」——'
        + ' §3.2/§8：提示/复盘/悔棋/课程**永远免费，永不看广告**');
    }
  }
  assert.deepStrictEqual(SH.NEVER_PAID.slice(), ['hint', 'review', 'undo', 'lesson'],
    '⛔ 这张「永远免费」的清单本身别被悄悄删项');
  // ⭐ 每个位给的必须是装饰/收集/货币 —— ⛔ 绝不是玩法优势（§8 末条）
  const OK_KINDS = ['cosmetic', 'collectible', 'currency'];
  for (const s of SH.REWARD_SLOTS) {
    assert.ok(OK_KINDS.indexOf(s.gives) >= 0,
      '⛔ 位「' + s.id + '」给的是「' + s.gives + '」—— 金币买不到任何**玩法优势**');
    assert.ok(/^ad\./.test(s.key), '文案 key 走 locale（⛔ 零硬编码）：' + s.key);
  }
  console.log('test-shop: ④ ⛔⛔ 奖励位里没有 hint/review/undo/lesson，且只给装饰/收集/货币 OK');
}

// ─────────── ⑤ ⭐ 每日额度（⛔ 零 cap 会让长线收集当天被刷穿）───────────
{
  for (const s of SH.REWARD_SLOTS) {
    assert.ok((SH.CAPS[s.id] | 0) > 0,
      '⛔ 位「' + s.id + '」没有每日额度 —— 零 cap 的位当天就会被刷穿，线上收不回来');
  }
  assert.strictEqual(SH.quotaLeft('skin', {}), SH.CAPS.skin, '没看过 ⇒ 满额');
  assert.strictEqual(SH.quotaLeft('skin', { skin: SH.CAPS.skin }), 0, '看满 ⇒ 0');
  assert.strictEqual(SH.quotaLeft('skin', { skin: 999 }), 0, '⛔ 超了也不许是负数');
  assert.strictEqual(SH.quotaLeft('nope', {}), 0, '⛔ 不认识的位 ⇒ 0（fail-closed）');
  console.log('test-shop: ⑤ ⭐ 每日额度（每个位都有 cap / 不认识的位 fail-closed）OK');
}

// ─────────── ⑥ ⛔ 源码红线：纯函数，不碰 Ads / 存储 ───────────
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'shop.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const bad of ['Ads.', 'localStorage', 'Math.random', 'ConnectAI']) {
    assert.ok(code.indexOf(bad) < 0,
      '⛔ shop.js 的**代码**里出现了 "' + bad + '" —— 它只回答「该不该放」，'
      + '真正去放的是 UI 层；这一层必须能在 node 里把每条闸门规则钉死');
  }
  assert.ok(src.indexOf('Ads') >= 0 && code.indexOf('Ads.') < 0, '剥注释没生效');
  assert.ok(Object.isFrozen(SH), 'API 必须冻结');
  console.log('test-shop: ⑥ ⛔ 源码红线 + API 冻结 OK');
}

console.log('test-shop: 全部通过');
