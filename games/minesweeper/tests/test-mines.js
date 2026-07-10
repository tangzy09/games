// v2.1 单测:对齐原作机制。node tools/test-mines.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PRNG = require('../../../engine/prng.js');

function freshCtx(seed) {
  const ctx = vm.createContext({ console });
  const dir = path.join(__dirname, '..', 'js');
  for (const f of ['constants.js', 'logic.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  ctx.G = vm.runInContext('G', ctx);
  ctx.M = vm.runInContext('MONSTERS', ctx);
  ctx.XP_TABLE = vm.runInContext('XP_TABLE', ctx);
  if (seed != null) ctx.G.rng = PRNG.create(seed);
  return ctx;
}
let pass = 0, fail = 0;
const eq = (n, g, w) => { JSON.stringify(g) === JSON.stringify(w) ? pass++ : (fail++, console.log(`❌ ${n}: got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`)); };
const ok = (n, c) => { c ? pass++ : (fail++, console.log(`❌ ${n}`)); };
// 空白试验场
function lab(c, w = 5, h = 5) {
  c.G.w = w; c.G.h = h; c.G.phase = 'PLAYING';
  c.G.grid = Array.from({ length: w * h }, () => vm.runInContext('blankCell()', c));
  c.G.hp = 6; c.G.maxHp = 6; c.G.level = 1; c.G.xp = 0; c.G.killedMice = 0;
}

// ── 1) 盘面生成:构成与偏好 ──
for (let s = 1; s <= 8; s++) {
  const c = freshCtx(s);
  vm.runInContext('initRun()', c);
  const g = c.G.grid;
  const cnt = (m) => g.filter(x => x.mon === m).length;
  eq(`s${s} composition`, [cnt('mousey'), cnt('flitter'), cnt('rattle'), cnt('cuddle'), cnt('pudding'), cnt('boomy'), cnt('dragon'), cnt('giant'), cnt('guard')], [13, 12, 10, 8, 8, 9, 1, 2, 4]);
  eq(`s${s} walls+medikits`, [g.filter(x => x.item === 'wall').length, g.filter(x => x.item === 'medikit').length], [6, 5]);
  const d = g.findIndex(x => x.mon === 'dragon');
  ok(`s${s} dragon revealed at start`, g[d].rev);
  eq(`s${s} dragon at (6,4)`, [d % c.G.w, Math.floor(d / c.G.w)], [6, 4]);
  ok(`s${s} orb revealed`, g.some(x => x.item === 'orb' && x.rev));
  const giants = g.map((x, i) => x.mon === 'giant' ? i : -1).filter(i => i >= 0);
  ok(`s${s} giants same row symmetric`, Math.floor(giants[0] / 13) === Math.floor(giants[1] / 13)
    && Math.abs(giants[0] % 13 - 6) === Math.abs(giants[1] % 13 - 6));
  const egg = g.findIndex(x => x.mon === 'egg');
  ok(`s${s} egg beside dragon`, vm.runInContext(`dist(${egg}, ${d})`, c) <= 1.5);
  const mk = g.findIndex(x => x.mon === 'mineking');
  ok(`s${s} mineking in a corner`, [0, c.G.w - 1, (c.G.h - 1) * c.G.w, c.G.h * c.G.w - 1].includes(mk));
  const gn = g.findIndex(x => x.mon === 'gnome');
  ok(`s${s} gnome beside medikit`, g.some((x, j) => x.item === 'medikit' && vm.runInContext(`dist(${gn}, ${j})`, c) <= 1.5));
}

// ── 2) 战斗:直接挨打、hp>lv 才能杀、hp≤0 即死且拟态现形 ──
{
  const c = freshCtx(2); lab(c);
  c.G.grid[0].mon = 'pudding'; c.G.grid[0].lv = 5; c.G.grid[0].xp = 5; // hp6 打 lv5 → hp1 存活
  vm.runInContext('clickCell(0)', c);
  eq('attack on hidden tile hits', c.G.hp, 1);
  ok('killed (hp>0)', c.G.grid[0].defeated);
  ok('revealed after fight', c.G.grid[0].rev);
  eq('no xp until pickup', c.G.xp, 0);
  eq('corpse still counts in numbers', vm.runInContext('cellNumber(1)', c), 5);
  vm.runInContext('clickCell(0)', c); // 二段拾取
  eq('pickup grants xp', c.G.xp, 5);
  eq('numbers drop after pickup', vm.runInContext('cellNumber(1)', c), 0);

  vm.runInContext('setMonster(G.grid[2], "mousey")', c); // hp1 打 lv1 → hp0 = 死
  vm.runInContext('clickCell(2)', c);
  eq('hp-lv=0 means DEATH', c.G.phase, 'LOSE');
  ok('monster not defeated on lethal', !c.G.grid[2].defeated);
}
{
  const c = freshCtx(3); lab(c);
  vm.runInContext('setMonster(G.grid[0], "mimic")', c);
  vm.runInContext('setMonster(G.grid[4], "mousey")', c);
  c.G.hp = 1;
  vm.runInContext('clickCell(4)', c);
  eq('death', c.G.phase, 'LOSE');
  ok('mimics unmask on death', !c.G.grid[0].mimicHidden);
}

// ── 3) 手动升级:查表、偶数级半心、上限 19 ──
{
  const c = freshCtx(4); lab(c);
  vm.runInContext('grantXp(4)', c);
  eq('xp accrues without auto-level', c.G.level, 1);
  ok('button enabled', vm.runInContext('canLevelUp()', c));
  vm.runInContext('levelUp()', c);
  eq('level 2 (even) = half heart, no maxHp', [c.G.level, c.G.maxHp, c.G.halfHeart], [2, 6, true]);
  eq('full heal on level', c.G.hp, 6);
  vm.runInContext('grantXp(5)', c);
  vm.runInContext('levelUp()', c);
  eq('level 3 (odd) adds heart', [c.G.level, c.G.maxHp], [3, 7]);
  c.G.hp = 0;
  vm.runInContext('grantXp(99)', c);
  ok('dead cannot level', !vm.runInContext('canLevelUp()', c));
}

// ── 4) 地雷 lv100 + 排雷链 ──
{
  const c = freshCtx(5); lab(c);
  vm.runInContext('setMonster(G.grid[0], "boomy")', c);
  eq('mine poisons numbers', vm.runInContext('cellNumber(1)', c), 100);
  vm.runInContext('setMonster(G.grid[2], "mineking")', c);
  c.G.hp = 12; c.G.maxHp = 12;
  vm.runInContext('clickCell(2)', c);   // 打雷王(10) → hp2
  eq('mineking costs 10', c.G.hp, 2);
  vm.runInContext('clickCell(2)', c);   // 拾取 → 掉排雷卷轴
  eq('drop is disarm scroll', c.G.grid[2].spell, 'disarm');
  vm.runInContext('clickCell(2)', c);   // 用卷轴
  eq('mine defused to 0', c.G.grid[0].lv, 0);
  ok('disarm flag', c.G.minesDisarmed);
  eq('numbers clean', vm.runInContext('cellNumber(1)', c), 0);
}

// ── 5) 墙(挖墙耗血,1血禁挖)与宝箱链 ──
{
  const c = freshCtx(6); lab(c);
  vm.runInContext('setItem(G.grid[0], "wall")', c);
  c.G.grid[0].rev = true;
  vm.runInContext('clickCell(0)', c); vm.runInContext('clickCell(0)', c);
  eq('two digs cost 2 hp', c.G.hp, 4);
  c.G.hp = 1;
  vm.runInContext('clickCell(0)', c);
  eq('no digging at 1 hp', c.G.grid[0].wallHP, 1);
  c.G.hp = 6;
  vm.runInContext('clickCell(0)', c);
  eq('wall breaks to +1xp treasure', c.G.grid[0].treasureXp, 1);
  vm.runInContext('clickCell(0)', c);
  eq('treasure picked', c.G.xp, 1);

  vm.runInContext('setItem(G.grid[4], "chest")', c); c.G.grid[4].rev = true;
  vm.runInContext('clickCell(4)', c);
  eq('chest opens to 5xp', c.G.grid[4].treasureXp, 5);
  vm.runInContext('setItem(G.grid[8], "medichest")', c); c.G.grid[8].rev = true;
  vm.runInContext('clickCell(8)', c);
  eq('medichest opens to medikit', c.G.grid[8].item, 'medikit');
  c.G.hp = 2;
  vm.runInContext('clickCell(8)', c);
  eq('medikit full heal', c.G.hp, 6);
}

// ── 6) 地精寻路医疗包、皇冠胜利与徽章 ──
{
  const c = freshCtx(7); lab(c);
  vm.runInContext('setMonster(G.grid[0], "gnome")', c);
  vm.runInContext('setItem(G.grid[24], "medikit")', c);
  c.G.grid.forEach((x, i) => { if (i !== 18 && i !== 0 && i !== 24) x.rev = true; }); // 只留 18 号暗格(贴医疗包)
  vm.runInContext('clickCell(0)', c);
  eq('gnome hops to cell nearest medikit', c.G.grid[18].mon, 'gnome');
  c.G.grid[18].rev = true;
  vm.runInContext('clickCell(18)', c);  // 无处可逃 → lv0 战斗即杀
  ok('cornered gnome defeated, no damage', c.G.grid[18].defeated && c.G.hp === 6);
  vm.runInContext('clickCell(18)', c);  // 拾取 9xp
  eq('gnome bounty 9xp', c.G.xp, 9);
}
{
  const c = freshCtx(8); lab(c);
  vm.runInContext('setMonster(G.grid[12], "dragon")', c);
  c.G.grid[12].rev = true;
  vm.runInContext('setMonster(G.grid[0], "giant", "romeo")', c);
  vm.runInContext('setMonster(G.grid[4], "giant", "juliet")', c);
  vm.runInContext('setMonster(G.grid[20], "egg")', c);
  c.G.hp = 14; c.G.maxHp = 14;
  vm.runInContext('clickCell(12)', c);  // 屠龙(13) → hp1
  eq('dragon slain at hp1', [c.G.hp, c.G.grid[12].defeated], [1, true]);
  vm.runInContext('clickCell(12)', c);  // 拾取 → 皇冠
  eq('dragon drops crown', c.G.grid[12].spell, 'crown');
  eq('not won yet', c.G.phase, 'PLAYING');
  vm.runInContext('clickCell(12)', c);  // 点皇冠才算赢
  eq('crown click wins', c.G.phase, 'WIN');
  ok('badges: lovers+egg+pacifist', ['lovers', 'egg', 'pacifist'].every(b => c.G.badgesThisRun.includes(b)));
  ok('not clear (monsters remain)', !c.G.badgesThisRun.includes('clear'));
}

// ── 7) 凝视者迷雾半径2、杀后消散 ──
{
  const c = freshCtx(9); lab(c);
  vm.runInContext('setMonster(G.grid[12], "gazer")', c);
  ok('fog within radius 2', vm.runInContext('isFogged(10)', c) && vm.runInContext('isFogged(2)', c));
  ok('no fog outside', !vm.runInContext('isFogged(4)', c) === (vm.runInContext('dist(4,12)', c) > 2));
  c.G.hp = 6; c.G.grid[12].rev = true;
  vm.runInContext('clickCell(12)', c);
  ok('fog lifts when gazer dies', !vm.runInContext('isFogged(10)', c));
}

// ── 8) 每日种子确定性 ──
{
  const mk = (s) => { const c = freshCtx(s); vm.runInContext('initRun()', c); return c.G.grid.map(x => (x.mon || '') + (x.item || '')).join('|'); };
  ok('same seed same board', mk(42) === mk(42));
  ok('diff seed diff board', mk(42) !== mk(43));
}


// ── 9) 图鉴特性一致性:文案里承诺的,游戏里逐条兑现 ──
for (let s = 30; s <= 37; s++) { // 8 个种子查放置类承诺
  const c = freshCtx(s);
  vm.runInContext('initRun()', c);
  const g = c.G.grid, W = c.G.w;
  const near = (i, j) => Math.abs(Math.floor(i / W) - Math.floor(j / W)) <= 1 && Math.abs(i % W - j % W) <= 1;
  const jellies = g.map((x, i) => x.mon === 'jelly' ? i : -1).filter(i => i >= 0);
  const sage = g.findIndex(x => x.mon === 'sage');
  eq(`s${s} 果冻冻恰好五只`, jellies.length, 5);
  ok(`s${s} 五只全贴着贤者`, jellies.every(j => near(j, sage)));
  const moobos = g.map((x, i) => x.mon === 'moobo' ? i : -1).filter(i => i >= 0);
  const chests = g.map((x, i) => (x.item === 'chest' || x.item === 'medichest') ? i : -1).filter(i => i >= 0);
  ok(`s${s} 每只哞哞霸都贴宝箱`, moobos.every(m => chests.some(ch => near(m, ch))));
  ok(`s${s} 守箱不与箱同列`, moobos.every(m => chests.some(ch => near(m, ch) && ch % W !== m % W)));
}
{ // 鼠大王掉落揭示全场小鼠鼠
  const c = freshCtx(40);
  vm.runInContext('initRun()', c);
  const k = c.G.grid.findIndex(x => x.mon === 'mouseking');
  c.G.hp = 15; c.G.maxHp = 15; c.G.grid[k].rev = true;
  vm.runInContext(`clickCell(${k})`, c);
  vm.runInContext(`clickCell(${k})`, c);
  eq('鼠大王掉卷轴', c.G.grid[k].spell, 'mice');
  vm.runInContext(`clickCell(${k})`, c);
  ok('全场小鼠鼠现形', c.G.grid.filter(x => x.mon === 'mousey' && !x.defeated).every(x => x.rev));
}
{ // 老贤者:等级1、掉落揭示全部布丁丁
  const c = freshCtx(41);
  vm.runInContext('initRun()', c);
  eq('贤者等级 1', c.M.sage.lv, 1);
  const sg = c.G.grid.findIndex(x => x.mon === 'sage');
  c.G.hp = 15; c.G.maxHp = 15; c.G.grid[sg].rev = true;
  vm.runInContext(`clickCell(${sg})`, c);
  vm.runInContext(`clickCell(${sg})`, c);
  eq('贤者掉卷轴', c.G.grid[sg].spell, 'pudding');
  vm.runInContext(`clickCell(${sg})`, c);
  ok('全场布丁丁现形', c.G.grid.filter(x => x.mon === 'pudding' && !x.defeated).every(x => x.rev));
}
{ // 大软软掉医疗包;礼盒盒两段式;龙蛋敲碎3经验
  const c = freshCtx(42); lab(c);
  c.G.hp = 15; c.G.maxHp = 15; c.G.level = 99;
  vm.runInContext('setMonster(G.grid[0], "giant", "romeo")', c);
  c.G.grid[0].rev = true;
  vm.runInContext('clickCell(0)', c);
  vm.runInContext('clickCell(0)', c);
  eq('大软软掉医疗包', c.G.grid[0].item, 'medikit');

  c.G.hp = 15; c.G.phase = 'PLAYING'; // 打巨人掉过血,重置再测礼盒盒
  vm.runInContext('setMonster(G.grid[4], "mimic")', c);
  vm.runInContext('clickCell(4)', c);
  eq('礼盒盒第一击不掉血', c.G.hp, 15);
  ok('翻开后仍在伪装', c.G.grid[4].mimicHidden && c.G.grid[4].rev);
  vm.runInContext('clickCell(4)', c);
  eq('第二击现形并造成 11 伤害', c.G.hp, 4);
  ok('伪装解除', !c.G.grid[4].mimicHidden);

  c.G.hp = 15; c.G.xp = 0; c.G.phase = 'PLAYING';
  vm.runInContext('setMonster(G.grid[8], "egg")', c);
  c.G.grid[8].rev = true;
  vm.runInContext('clickCell(8)', c);
  eq('龙蛋零伤害', c.G.hp, 15);
  vm.runInContext('clickCell(8)', c);
  eq('龙蛋 3 经验', c.G.xp, 3);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
