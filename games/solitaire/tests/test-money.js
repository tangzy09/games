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
ok(M0.BACKS.length === 41 && M0.TABLES.length === 16,
   `款数：牌背 ${M0.BACKS.length} · 桌布 ${M0.TABLES.length}（矢量可爱 12 + Flux 可爱高级 10）`);
// ⛔ **id 不许重名**（2026-08-01 实锤）：新加的 Flux 牌背起名 `ocean` 撞上了已有的 `ocean`，
//   结果是 ①商店里出现两格同 id ②BACK_STYLES 里后者覆盖前者，老牌背静默变成新图
//   ③生成脚本还把 `assets/backs/ocean.jpg` 直接**覆盖**掉了。功能测试全绿，肉眼也不一定看得出。
for (const [kind, list] of [['牌背', M0.BACKS], ['桌布', M0.TABLES], ['瀑布', M0.FXS]]) {
  const ids = list.map(x => x.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  ok(!dup.length, `⛔ ${kind} id 无重复` + (dup.length ? '：' + [...new Set(dup)].join(',') : ''));
}
// 图片款（img:1）必须真有文件 —— 缺文件只会静默退回渐变底色，看着「像另一款纯色牌背」
// ⚠ 必须**按块**扫：牌背与桌布的 img:1 长得一模一样，整文件正则会把桌布的 walnut/marble
//   当成牌背去 assets/backs 里找（第一版就这么误报了）。
{
  const fs2 = require('fs'), pathm = require('path');
  // ⚠ 用 indexOf 切块，别再用正则拼字符串（转义经手一层脚本就废了，第一版 0 命中）
  const blockOf = tag => {
    const i = sprite.indexOf(tag);
    if (i < 0) return '';
    const j = sprite.indexOf('\n  };', i);
    return sprite.slice(i, j < 0 ? undefined : j);
  };
  for (const [tag, dir, ext] of [['const BACK_STYLES', 'backs', '.jpg'], ['const TABLE_STYLES', 'tables', '.jpg']]) {
    const ids = [...blockOf(tag).matchAll(/^\s{4}(\w+):\s*\{[^}]*img:\s*1/gm)].map(m => m[1]);
    const d = pathm.join(__dirname, '../assets/' + dir);
    const miss = ids.filter(id => !fs2.existsSync(pathm.join(d, id + ext)));
    ok(ids.length > 0 && !miss.length,
       `assets/${dir}：img:1 的 ${ids.length} 款都有文件` + (miss.length ? '：缺 ' + miss.join(',') : ''));
  }
}
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
