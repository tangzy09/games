// test-money.js — 收藏品清单与「开局赠送」的回归（node，无浏览器）
//
// 钉三件事：
//   ① 每个收藏品 id 都有对应的皮肤定义 —— **拼错 id 不会报错**，只会静默退回默认样式，
//      商店里看起来像「两款一模一样的牌背」，肉眼极难发现。
//   ② 赠送的数量正好是新增款的一半（用户 2026-08-01 定的口径）。
//   ③ **老存档要补发**：只写 state 默认值的话，已经玩过的人永远拿不到赠品；
//      而补发必须幂等、且不能动玩家已有的东西。
const fs = require('fs'), path = require('path');
const HERE = __dirname, JS = path.join(HERE, '../js');
let fail = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'X   ') + m); if (!c) fail = 1; };

/** 在一个假的浏览器全局里加载 money.js（它是 IIFE，挂到 self 上）*/
function loadMoney(saved) {
  const g = {};
  g.self = g;
  g.Platform = { storage: { get: () => (saved === undefined ? null : JSON.stringify(saved)), set: () => {} } };
  g.CFG = { key: k => 'sol:' + k };
  const src = fs.readFileSync(path.join(JS, 'money.js'), 'utf8');
  new Function('self', 'Platform', 'CFG', src)(g, g.Platform, g.CFG);
  return g.Money;
}

// ── ① id 与皮肤定义一一对应 ──
const sprite = fs.readFileSync(path.join(JS, 'sprite.js'), 'utf8');
const styleIds = tag => {
  const m = sprite.match(new RegExp(tag + '\\s*=\\s*\\{([\\s\\S]*?)\\n  \\};'));
  return m ? [...m[1].matchAll(/^\s{4}(\w+):/gm)].map(x => x[1]) : [];
};
const backStyles = styleIds('const BACK_STYLES'), tableStyles = styleIds('const TABLE_STYLES');
const M0 = loadMoney();
const missB = M0.BACKS.map(b => b.id).filter(id => !backStyles.includes(id));
const missT = M0.TABLES.map(t => t.id).filter(id => !tableStyles.includes(id));
ok(backStyles.length > 0 && tableStyles.length > 0, `皮肤定义读到了（牌背 ${backStyles.length} / 桌布 ${tableStyles.length}）`);
ok(!missB.length, '每款牌背都有对应皮肤定义' + (missB.length ? '：缺 ' + missB.join(',') : ''));
ok(!missT.length, '每款桌布都有对应皮肤定义' + (missT.length ? '：缺 ' + missT.join(',') : ''));

// ── ② 赠送 = 新增款的一半 ──
const freeB = M0.BACKS.filter(b => b.cost === 0 && b.id !== 'classic');
const freeT = M0.TABLES.filter(t => t.cost === 0 && t.id !== 'felt');
ok(M0.BACKS.length === 31 && M0.TABLES.length === 16,
   `款数：牌背 ${M0.BACKS.length} · 桌布 ${M0.TABLES.length}（可爱系新增 20）`);
ok(freeB.length + freeT.length === 10,
   `开局赠送 ${freeB.length + freeT.length} 款 = 新增 20 款的一半（牌背 ${freeB.length} · 桌布 ${freeT.length}）`);

// ── ③ 老存档补发：不动已有的、幂等、且真的发到了 ──
const old = { coins: 500, ownedBacks: ['classic', 'koi'], ownedTables: ['felt', 'wood'], back: 'koi', table: 'wood' };
const M = loadMoney(old);
M.load();
const gotB = freeB.every(b => M.state.ownedBacks.includes(b.id));
const gotT = freeT.every(t => M.state.ownedTables.includes(t.id));
ok(gotB && gotT, '⭐ 老存档也补发到了全部赠品');
ok(M.state.ownedBacks.includes('koi') && M.state.ownedTables.includes('wood') && M.state.coins === 500,
   '⛔ 补发不许动玩家原有的东西（koi/wood/金币都还在）');
const n1 = M.state.ownedBacks.length;
M.load(); M.load();
ok(M.state.ownedBacks.length === n1, '⛔ 补发幂等（重复 load 不会越攒越多）');

// 赠品必须真是 cost 0（否则「送」的同时还在商店里标价，玩家会以为被骗）
const paidGift = freeB.concat(freeT).filter(x => x.cost !== 0);
ok(!paidGift.length, '赠品的标价都是 0');

console.log(fail ? '\nX test-money 有失败项' : '\ntest-money: 全部通过');
process.exit(fail);
