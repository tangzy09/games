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
  ctx.vm_DAILY = vm.runInContext('DAILY_FLOOR', ctx);
  ctx.vm_ITEMS = vm.runInContext('ITEMS', ctx);
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

// ── 7) 永久强化 perks ──
{
  const c = freshCtx(seeded(3));
  c.G.perks = { vital1: true, vital2: true };
  vm.runInContext('initRun()', c);
  eq('vital1+2 start hp', c.G.hp, 7);

  // guard: 第一击 -1,第二击全额
  c.G.size = 2; c.G.hp = 9; c.G.maxHp = 9; c.G.level = 9; c.G.xp = 0;
  c.G.perks = { guard: true }; c.G.guardUsed = false;
  c.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c.G.grid[0].mon = 'skel'; c.G.grid[1].mon = 'skel';
  vm.runInContext('reveal(0)', c);
  eq('guard first hit 3→2', c.G.hp, 7);
  c.G.grid[1].rev = false;
  vm.runInContext('reveal(1)', c);
  eq('second hit full 3', c.G.hp, 4);

  // learner: xpNeed = level*5
  c.G.perks = { learner: true }; c.G.level = 2;
  eq('learner xpNeed', vm.runInContext('xpNeed()', c), 10);

  // revive: 致命伤半血站起,再来一次才死
  const c2 = freshCtx();
  c2.G.size = 2; c2.G.hp = 2; c2.G.maxHp = 8; c2.G.level = 9; c2.G.xp = 0;
  c2.G.perks = { revive: true }; c2.G.revived = false;
  c2.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c2.G.grid[0].mon = 'ghost'; c2.G.grid[1].mon = 'ghost';
  vm.runInContext('reveal(0)', c2);
  eq('revive survives', c2.G.phase !== 'LOSE', true);
  eq('revive half hp then rewards', c2.G.hp >= 4, true);
  c2.G.hp = 2;
  vm.runInContext('reveal(1)', c2);
  eq('second lethal → LOSE', c2.G.phase, 'LOSE');

  // potion/coin perks
  const c3 = freshCtx();
  c3.G.size = 2; c3.G.hp = 1; c3.G.maxHp = 9; c3.G.gold = 0;
  c3.G.perks = { potion: true, coin: true };
  c3.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c3.G.grid[0].t = 'potion'; c3.G.grid[3].t = 'coin';
  vm.runInContext('reveal(0)', c3);
  eq('potion perk heals 3', c3.G.hp, 4);
  eq('coin perk gives 3', c3.G.gold, 3);
}

// ── 8) 每日挑战:种子确定性 + 楼梯即胜 ──
{
  const mk = (seed) => {
    const c = freshCtx();
    c.G.perks = {};
    vm.runInContext('initDaily(null)', c);
    c.G.rng = seeded(seed);
    vm.runInContext('startFloor()', c);
    return c;
  };
  const a = mk(20260710), b = mk(20260710), d = mk(20260711);
  eq('daily mode', a.G.mode, 'daily');
  eq('daily size', a.G.size, a.vm_DAILY.size);
  const sig = (c) => c.G.grid.map(x => (x.mon || '') + x.t).join('|');
  eq('same seed → same board', sig(a) === sig(b), true);
  eq('different seed → different board', sig(a) !== sig(d), true);
  const si = a.G.grid.findIndex(x => x.t === 'stairs');
  a.G.grid[si].rev = true;
  const soulsBefore = a.G.souls;
  vm.runInContext(`clickCell(${si})`, a);
  eq('daily stairs → WIN', a.G.phase, 'WIN');
  eq('daily win souls +10', a.G.souls, soulsBefore + 10);
}

// ── 9) 商店与道具 ──
{
  const c = freshCtx(seeded(11));
  c.G.perks = {};
  vm.runInContext('initRun()', c);
  vm.runInContext('G.floorIdx = 1; startFloor()', c);
  eq('floor2 has shop', c.G.grid.filter(x => x.t === 'shop').length, 1);

  const si = c.G.grid.findIndex(x => x.t === 'shop');
  c.G.grid[si].rev = true;
  vm.runInContext(`clickCell(${si})`, c);
  eq('shop opens', c.G.phase, 'SHOP');
  eq('stock 3 distinct', new Set(c.G.grid[si].shopStock).size, 3);

  c.G.gold = 100;
  const first = c.G.grid[si].shopStock[0];
  const cost = c.vm_ITEMS.find(x => x.id === first).cost;
  vm.runInContext(`buyShopItem('${first}')`, c);
  eq('gold deducted', c.G.gold, 100 - cost);
  eq('item in slot', c.G.items[0], first);
  eq('stock shrinks', c.G.grid[si].shopStock.length, 2);

  c.G.gold = 0;
  const second = c.G.grid[si].shopStock[0];
  vm.runInContext(`buyShopItem('${second}')`, c);
  eq('no gold no buy', c.G.items.length, 1);
  vm.runInContext('leaveShop()', c);
  eq('leave shop → playing', c.G.phase, 'PLAYING');

  // shield: 完全挡下一击后消耗
  c.G.items = ['shield']; c.G.hp = 5; c.G.maxHp = 9;
  vm.runInContext('useItem(0)', c);
  eq('shield armed', c.G.shieldUp, true);
  eq('shield consumed from slot', c.G.items.length, 0);
  c.G.size = 2; c.G.level = 9; c.G.xp = 0;
  c.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c.G.grid[0].mon = 'ghost';
  vm.runInContext('reveal(0)', c);
  eq('shield blocks all damage', c.G.hp, 5);
  eq('shield spent', c.G.shieldUp, false);

  // probe: 窥视不翻开(先重置被击杀涟漪翻开的格子)
  c.G.items = ['probe'];
  c.G.grid[1].rev = false; c.G.grid[1].peek = false; c.G.grid[1].mon = 'skel';
  vm.runInContext('useItem(0)', c);
  eq('probe armed', c.G.itemMode && c.G.itemMode.id, 'probe');
  vm.runInContext('clickCell(1)', c);
  eq('probe peeked', c.G.grid[1].peek, true);
  eq('probe did not reveal', c.G.grid[1].rev, false);
  eq('probe consumed', c.G.items.length, 0);

  // bomb: 3×3 无奖励清怪,Boss 免疫
  const c2 = freshCtx();
  c2.G.perks = {}; c2.G.size = 3; c2.G.hp = 9; c2.G.maxHp = 9; c2.G.level = 9;
  c2.G.xp = 0; c2.G.gold = 0; c2.G.souls = 0; c2.G.phase = 'PLAYING'; // useItem 只在对局中生效
  c2.G.items = ['bomb']; c2.G.itemMode = null;
  c2.G.grid = Array.from({ length: 9 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c2.G.grid[0].mon = 'skel'; c2.G.grid[2].mon = 'dragon';
  vm.runInContext('useItem(0)', c2);
  vm.runInContext('clickCell(4)', c2);
  eq('bomb kills skel', c2.G.grid[0].dead, true);
  eq('bomb no rewards', c2.G.xp + c2.G.gold, 0);
  eq('boss immune to bomb', c2.G.grid[2].dead, false);
  eq('boss cell stays hidden', c2.G.grid[2].rev, false);
}

// ── 10) 怪物特性 ──
{
  // 蝙蝠跳位:首次惊动不受伤,跳到别处;跳过一次后正常战斗
  const c = freshCtx(seeded(5));
  c.G.perks = {}; c.G.size = 3; c.G.hp = 9; c.G.maxHp = 9; c.G.level = 9; c.G.xp = 0;
  c.G.encounters = [];
  c.G.grid = Array.from({ length: 9 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c.G.grid[0].mon = 'bat';
  vm.runInContext('reveal(0)', c);
  eq('bat hop no damage', c.G.hp, 9);
  eq('bat left the cell', c.G.grid[0].mon, null);
  const batAt = c.G.grid.findIndex(x => x.mon === 'bat');
  eq('bat landed hidden+tired', batAt >= 0 && !c.G.grid[batAt].rev && c.G.grid[batAt].hopTired, true);
  c.G.grid[batAt].rev = false;
  vm.runInContext(`reveal(${batAt})`, c);
  eq('tired bat fights', c.G.hp, 7);

  // 宝箱怪:不掉血,偷一半金,不给经验
  const c2 = freshCtx();
  c2.G.perks = {}; c2.G.size = 2; c2.G.hp = 5; c2.G.maxHp = 9; c2.G.level = 9;
  c2.G.xp = 0; c2.G.gold = 10; c2.G.souls = 0; c2.G.encounters = [];
  c2.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c2.G.grid[0].mon = 'mimic';
  vm.runInContext('reveal(0)', c2);
  eq('mimic no damage', c2.G.hp, 5);
  eq('mimic steals half gold', c2.G.gold, 5);
  eq('mimic no xp', c2.G.xp, 0);
  ok('mimic encounter recorded', c2.G.encounters.includes('mimic'));

  // 爆爆菇:炸死邻怪但邻怪无奖励;石像:双倍灵魂
  const c3 = freshCtx();
  c3.G.perks = {}; c3.G.size = 3; c3.G.hp = 20; c3.G.maxHp = 20; c3.G.level = 9;
  c3.G.xp = 0; c3.G.gold = 0; c3.G.souls = 0; c3.G.encounters = [];
  c3.G.grid = Array.from({ length: 9 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c3.G.grid[4].mon = 'boom'; c3.G.grid[0].mon = 'skel';
  vm.runInContext('reveal(4)', c3);
  eq('boom kills neighbor', c3.G.grid[0].dead, true);
  eq('only boom pays xp', c3.G.xp, 2);

  const c4 = freshCtx();
  c4.G.perks = {}; c4.G.size = 2; c4.G.hp = 20; c4.G.maxHp = 20; c4.G.level = 9;
  c4.G.xp = 0; c4.G.souls = 0; c4.G.encounters = [];
  c4.G.grid = Array.from({ length: 4 }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));
  c4.G.grid[0].mon = 'statue';
  vm.runInContext('reveal(0)', c4);
  eq('statue damage 6', c4.G.hp, 14);
  eq('statue double souls', c4.G.souls, 12);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
