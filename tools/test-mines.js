// minesweeper 纯逻辑单测:node tools/test-mines.js
// 用 vm 把 constants.js + logic.js 装进同一个沙箱(浏览器同款全局脚本语义)。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function freshCtx(rng) {
  const ctx = vm.createContext({ console });
  const dir = path.join(__dirname, '..', 'games', 'minesweeper', 'js');
  for (const f of ['constants.js', 'logic.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  // top-level const/let live in the context's global lexical scope, not as ctx
  // properties — pull real references out so tests can read/mutate them directly
  ctx.G = vm.runInContext('G', ctx);
  ctx.FLOORS = vm.runInContext('FLOORS', ctx);
  ctx.MONSTERS = vm.runInContext('MONSTERS', ctx);
  ctx.vm_COIN_GOLD = vm.runInContext('COIN_GOLD', ctx);
  if (rng) ctx.G.rng = rng;
  return ctx;
}

// deterministic rng
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log(`❌ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); }
}
function ok(name, cond) { cond ? pass++ : (fail++, console.log(`❌ ${name}`)); }

// ── 1) 盘面生成:数量、安全区、必有楼梯 ──
{
  const c = freshCtx(seeded(42));
  c.G.hp = 5; c.G.maxHp = 5; c.G.level = 1; c.G.xp = 0;
  vm.runInContext('genFloor(0)', c);
  const g = c.G.grid, f = c.FLOORS[0];
  eq('floor0 size', c.G.size, f.size);
  eq('monster count', g.filter(x => x.mon).length, Object.values(f.counts).reduce((a, b) => a + b, 0));
  // initial flood auto-collects coins it sweeps over (by design): remaining + collected = placed
  eq('coin count', g.filter(x => x.t === 'coin').length + c.G.gold / c.vm_COIN_GOLD, f.coins);
  eq('stairs count', g.filter(x => x.t === 'stairs').length, 1);
  ok('safe start revealed >= 9', g.filter(x => x.rev).length >= 9);
  ok('no monster revealed at start', !g.some(x => x.rev && x.mon && !x.dead));
}

// ── 2) 数字 = 相邻存活怪强度和;幽灵不计入 ──
{
  const c = freshCtx();
  c.G.size = 3;
  c.G.grid = Array.from({ length: 9 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c.G.grid[0].mon = 'slime';  // power 1
  c.G.grid[2].mon = 'ghost';  // phantom → excluded
  c.G.grid[8].mon = 'skel';   // power 3
  eq('number center = 1+3 (ghost excluded)', vm.runInContext('cellNumber(4)', c), 4);
  c.G.grid[8].dead = true;
  eq('dead monster excluded', vm.runInContext('cellNumber(4)', c), 1);
}

// ── 3) 连锁展开:0 区域自动翻开,数字边界停 ──
{
  const c = freshCtx();
  c.G.size = 4; c.G.hp = 5; c.G.maxHp = 5;
  c.G.grid = Array.from({ length: 16 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c.G.grid[15].mon = 'slime'; // corner monster; everything else 0/number
  vm.runInContext('reveal(0)', c);
  const g = c.G.grid;
  ok('flood revealed non-monster cells', g.filter(x => x.rev).length === 15);
  ok('monster not auto-revealed', !g[15].rev);
}

// ── 4) 战斗:扣血=强度、得 XP/金/魂、升级回满、致死进 LOSE ──
{
  const c = freshCtx();
  c.G.size = 2; c.G.hp = 5; c.G.maxHp = 5; c.G.level = 1; c.G.xp = 5; c.G.gold = 0; c.G.souls = 0;
  c.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c.G.grid[0].mon = 'skel'; // power 3; xp 5+3=8 >= 6 → level up
  vm.runInContext('reveal(0)', c);
  eq('level up to 2', c.G.level, 2);
  eq('maxHp +1', c.G.maxHp, 6);
  eq('full heal on level', c.G.hp, 6);
  eq('xp rollover', c.G.xp, 2);
  eq('gold from kill', c.G.gold, 3);
  eq('souls from kill', c.G.souls, 3);

  // kill ripple (expandZeros) already revealed the rest of the 2x2 — reset cell 1
  c.G.hp = 2;
  c.G.grid[1].rev = false; c.G.grid[1].mon = 'ghost'; c.G.grid[1].dead = false; // power 5 > hp
  vm.runInContext('reveal(1)', c);
  eq('death → LOSE', c.G.phase, 'LOSE');
  eq('hp floored at 0', c.G.hp, 0);
  eq('souls kept on death', c.G.souls, 3);
}

// ── 5) 遗物:weaken 影响伤害与数字;tough 加血;greed 双倍金;boss 击杀 WIN ──
{
  const c = freshCtx();
  c.G.size = 2; c.G.hp = 9; c.G.maxHp = 9; c.G.level = 9; c.G.xp = 0;
  c.G.relics = ['weaken'];
  c.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c.G.grid[0].mon = 'skel';
  eq('weaken number', vm.runInContext('cellNumber(1)', c), 2);
  vm.runInContext('reveal(0)', c);
  eq('weaken damage 2', c.G.hp, 7);

  c.G.relics = ['greed']; c.G.gold = 0;
  c.G.grid[2].rev = false; c.G.grid[2].t = 'coin'; // kill ripple had revealed it — reset
  vm.runInContext('reveal(2)', c);
  eq('greed double gold', c.G.gold, 4);

  const c2 = freshCtx();
  c2.G.size = 2; c2.G.hp = 20; c2.G.maxHp = 20; c2.G.level = 9; c2.G.xp = 0; c2.G.souls = 0;
  c2.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c2.G.grid[0].mon = 'dragon';
  vm.runInContext('reveal(0)', c2);
  eq('boss kill → WIN', c2.G.phase, 'WIN');
  ok('boss souls bonus', c2.G.souls >= 20);
}

// ── 6) run 流程:initRun → 楼梯 → 三选一 → 下层 ──
{
  const c = freshCtx(seeded(7));
  vm.runInContext('initRun()', c);
  eq('intro phase', c.G.phase, 'LEVEL_INTRO');
  vm.runInContext('startFloor()', c);
  eq('playing', c.G.phase, 'PLAYING');
  const si = c.G.grid.findIndex(x => x.t === 'stairs');
  c.G.grid[si].rev = true;
  vm.runInContext(`clickCell(${si})`, c);
  eq('stairs → pick relic', c.G.phase, 'PICK_RELIC');
  eq('3 choices', c.G.relicChoices.length, 3);
  const chosen = c.G.relicChoices[0].id;
  vm.runInContext(`pickRelic('${chosen}')`, c);
  eq('floor advanced', c.G.floorIdx, 1);
  ok('relic owned', c.G.relics.includes(chosen));
  ok('floor-clear souls', c.G.souls >= 3);
  vm.runInContext('startFloor()', c);
  eq('floor2 size', c.G.size, c.FLOORS[1].size);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
