// v2 单盘逻辑单测: node tools/test-mines.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PRNG = require('../engine/prng.js');

function freshCtx(seed) {
  const ctx = vm.createContext({ console });
  const dir = path.join(__dirname, '..', 'games', 'minesweeper', 'js');
  for (const f of ['constants.js', 'logic.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  ctx.G = vm.runInContext('G', ctx);
  ctx.M = vm.runInContext('MONSTERS', ctx);
  ctx.W = vm.runInContext('BOARD_W', ctx);
  ctx.H = vm.runInContext('BOARD_H', ctx);
  if (seed != null) ctx.G.rng = PRNG.create(seed);
  return ctx;
}
let pass = 0, fail = 0;
const eq = (n, g, w) => { JSON.stringify(g) === JSON.stringify(w) ? pass++ : (fail++, console.log(`❌ ${n}: got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`)); };
const ok = (n, c) => { c ? pass++ : (fail++, console.log(`❌ ${n}`)); };

// ── 1) 盘面生态:位置规则 ──
for (let s = 1; s <= 20; s++) {
  const c = freshCtx(s);
  vm.runInContext('initRun()', c);
  const g = c.G.grid, W = c.W, H = c.H;
  const at = (m) => g.map((x, i) => x.mon === m ? i : -1).filter(i => i >= 0);
  eq(`s${s} dragon center`, at('dragon'), [Math.floor(H / 2) * W + Math.floor(W / 2)]);
  const owl = at('nightowl')[0];
  ok(`s${s} owl corner`, [0, W - 1, (H - 1) * W, H * W - 1].includes(owl));
  const sage = at('sage')[0], sr = Math.floor(sage / W), sc = sage % W;
  ok(`s${s} sage edge non-corner`, (sr === 0 || sr === H - 1 || sc === 0 || sc === W - 1) && ![0, W - 1, (H - 1) * W, H * W - 1].includes(sage));
  const nbr = (i, j) => Math.abs(Math.floor(i / W) - Math.floor(j / W)) <= 1 && Math.abs(i % W - j % W) <= 1;
  ok(`s${s} jellies ring sage`, at('jellyking').every(j => nbr(j, sage)));
  const king = at('mouseking')[0];
  ok(`s${s} mousies ring king`, at('mousey').every(m => nbr(m, king)));
  ok(`s${s} cuddles paired adjacent`, at('cuddle').every(i => g[i].pairWith != null && nbr(i, g[i].pairWith) && g[g[i].pairWith].mon === 'cuddle'));
  ok(`s${s} board has some reveal`, g.some(x => x.rev));
  ok(`s${s} no monster revealed dead at start`, !g.some(x => x.rev && x.mon && !x.dead));
}

// ── 2) 血量规则:到 0 活着,低于 0 才死 ──
{
  const c = freshCtx(2);
  vm.runInContext('initRun()', c);
  c.G.grid.forEach(x => { x.mon = null; x.fogged = false; x.t = 'empty'; }); // 物品也清掉,防涟漪捡到回血卷轴
  c.G.grid[0].mon = 'jellyking'; c.G.grid[0].rev = true; // lv 5
  c.G.hp = 5; c.G.maxHp = 5; c.G.level = 9; c.G.xp = 0;
  vm.runInContext('clickCell(0)', c);
  eq('hp exactly 0 → alive', c.G.phase, 'PLAYING');
  eq('hp is 0', c.G.hp, 0);
  c.G.grid[1].mon = 'chick'; c.G.grid[1].rev = true; c.G.grid[1].dead = false; // lv 1
  c.G.xp = 0; c.G.level = 99; // 防升级回血干扰
  vm.runInContext('clickCell(1)', c);
  eq('below 0 → LOSE', c.G.phase, 'LOSE');
}

// ── 3) 升级:回满+上限+1、溢出顺延、上限封顶 ──
{
  const c = freshCtx(3);
  vm.runInContext('initRun()', c);
  c.G.hp = 1; c.G.maxHp = 5; c.G.level = 1; c.G.xp = 0;
  vm.runInContext('gainXp(8)', c); // need 6 → level 2, 溢出 2
  eq('level 2', c.G.level, 2);
  eq('maxHp 6', c.G.maxHp, 6);
  eq('full heal', c.G.hp, 6);
  eq('overflow xp', c.G.xp, 2);
  c.G.maxHp = 15; c.G.level = 5; c.G.xp = 0;
  vm.runInContext('gainXp(30)', c);
  eq('maxHp capped 15', c.G.maxHp, 15);
}

// ── 4) 地精:跳格直到无处可逃,抓住给大额 XP、零伤害 ──
{
  const c = freshCtx(4);
  vm.runInContext('initRun()', c);
  c.G.grid.forEach(x => { x.mon = null; x.rev = true; x.fogged = false; x.t = 'empty'; });
  c.G.grid[0].mon = 'gnome'; c.G.grid[5].rev = false; // 唯一藏身处
  c.G.hp = 3; c.G.xp = 0; c.G.level = 99;
  vm.runInContext('clickCell(0)', c);
  eq('gnome hopped to hidden cell', c.G.grid[5].mon, 'gnome');
  eq('no damage on hop', c.G.hp, 3);
  c.G.grid[5].rev = true;
  vm.runInContext('clickCell(5)', c);
  eq('cornered gnome caught', c.G.grid[5].dead, true);
  eq('gnome bounty xp', c.G.xp, 10);
  eq('still no damage', c.G.hp, 3);
}

// ── 5) 拟态怪两段式 + 地雷锁与猫头鹰扫雷 ──
{
  const c = freshCtx(5);
  vm.runInContext('initRun()', c);
  c.G.grid.forEach(x => { x.mon = null; x.rev = true; x.fogged = false; x.t = 'empty'; x.dead = false; });
  c.G.hp = 9; c.G.maxHp = 9; c.G.level = 99; c.G.xp = 0;
  c.G.grid[0].mon = 'mimic';
  vm.runInContext('clickCell(0)', c);
  eq('mimic pokes awake, no damage', c.G.hp, 9);
  eq('mimic not dead yet', c.G.grid[0].dead, false);
  vm.runInContext('clickCell(0)', c);
  eq('second tap fights mimic', c.G.grid[0].dead, true);
  eq('mimic damage 2', c.G.hp, 7);

  c.G.grid[1].mon = 'boom';
  vm.runInContext('clickCell(1)', c);
  eq('mine locked before sweep', c.G.grid[1].dead, false);
  eq('mine no damage when locked', c.G.hp, 7);
  c.G.grid[2].mon = 'nightowl';
  vm.runInContext('clickCell(2)', c);
  eq('owl kill grants sweep', c.G.sweepDone, true);
  eq('mines defused+revealed', c.G.grid[1].dead && c.G.grid[1].rev, true);
}

// ── 6) 掉落揭示 + 凝视者迷雾 ──
{
  const c = freshCtx(6);
  vm.runInContext('initRun()', c);
  const king = c.G.grid.findIndex(x => x.mon === 'mouseking');
  c.G.grid[king].rev = true;
  c.G.hp = 15; c.G.maxHp = 15; c.G.level = 99; c.G.xp = 0;
  vm.runInContext(`clickCell(${king})`, c);
  ok('squeak drop peeks all mousies', c.G.grid.filter(x => x.mon === 'mousey' && !x.dead).every(x => x.peek));

  const pp = c.G.grid.findIndex(x => x.mon === 'peeper' && !x.dead);
  ok('peeper fogs some cells', c.G.grid.some(x => x.fogged));
  const foggedNum = c.G.grid.findIndex((x, i) => x.fogged);
  eq('fogged number reads null(?)', vm.runInContext(`cellNumber(${foggedNum})`, c), null);
  c.G.grid[pp].rev = true; c.G.hp = 15;
  vm.runInContext(`clickCell(${pp})`, c);
  const [r0, c0] = [Math.floor(pp / c.W), pp % c.W];
  const other = c.G.grid.findIndex((x, j) => x.mon === 'peeper' && !x.dead);
  ok('dead peeper lifts own fog (unless other peeper overlaps)', (() => {
    for (const [dr, dc] of vm.runInContext('PEEPER_STAR', c)) {
      const rr = r0 + dr, cc = c0 + dc;
      if (rr < 0 || cc < 0 || rr >= c.H || cc >= c.W) continue;
      const k = rr * c.W + cc;
      if (!c.G.grid[k].fogged) continue;
      if (other < 0) return false; // fog remains but no other peeper → bug
    }
    return true;
  })());
}

// ── 7) 宝箱/回血卷轴/窥视球 ──
{
  const c = freshCtx(7);
  vm.runInContext('initRun()', c);
  c.G.grid.forEach(x => { x.mon = null; x.rev = false; x.fogged = false; x.t = 'empty'; });
  c.G.hp = 2; c.G.maxHp = 9; c.G.level = 99; c.G.xp = 0;
  c.G.grid[0].t = 'heartscroll';
  vm.runInContext('clickCell(0)', c);
  eq('heartscroll full heal', c.G.hp, 9);
  c.G.grid[1].t = 'chest'; c.G.grid[1].rev = false;
  vm.runInContext('clickCell(1)', c);
  eq('chest xp', c.G.xp, 5);
  const orbsBefore = c.G.orbs;
  vm.runInContext(`useOrb(${c.W + 1})`, c);
  eq('orb consumed', c.G.orbs, orbsBefore - 1);
  ok('orb revealed 3x3', [0, 1, 2, c.W, c.W + 1, c.W + 2, 2 * c.W, 2 * c.W + 1, 2 * c.W + 2].every(k => c.G.grid[k].rev));
}

// ── 8) 每日:同种子同盘 ──
{
  const mk = (s) => { const c = freshCtx(s); vm.runInContext('initRun()', c); return c; };
  const sig = (c) => c.G.grid.map(x => (x.mon || '') + x.t).join('|');
  ok('same seed same board', sig(mk(99)) === sig(mk(99)));
  ok('diff seed diff board', sig(mk(99)) !== sig(mk(100)));
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
