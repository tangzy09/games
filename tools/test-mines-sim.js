// 蒙特卡洛正确性验证:随机模拟 N 局完整 run,每步点击后校验全部不变量。
// 关键:数字用【独立重新实现】的算法对账,不调用被测的 cellNumber。
// 用法: node tools/test-mines-sim.js [局数]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PRNG = require('../engine/prng.js');

const GAMES = parseInt(process.argv[2] || '300', 10);

function freshCtx(rng) {
  const ctx = vm.createContext({ console });
  const dir = path.join(__dirname, '..', 'games', 'minesweeper', 'js');
  for (const f of ['constants.js', 'logic.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  ctx.G = vm.runInContext('G', ctx);
  ctx.FLOORS = vm.runInContext('FLOORS', ctx);
  ctx.MONSTERS = vm.runInContext('MONSTERS', ctx);
  ctx.RELICS = vm.runInContext('RELICS', ctx);
  ctx.XP = vm.runInContext('XP_PER_LEVEL', ctx);
  ctx.G.rng = rng;
  return ctx;
}

// —— 独立数字重算(与 logic.js 不同的实现路径)——
function independentNumber(c, i) {
  const s = c.G.size, r = Math.floor(i / s), col = i % s;
  let sum = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = col + dc;
    if (nr < 0 || nc < 0 || nr >= s || nc >= s) continue;
    const cell = c.G.grid[nr * s + nc];
    if (!cell.mon || cell.dead) continue;
    const M = c.MONSTERS[cell.mon];
    if (M.phantom) continue;
    sum += c.G.relics.includes('weaken') ? Math.max(1, M.power - 1) : M.power;
  }
  return sum;
}

let violations = [], stats = { win: 0, lose: 0, clicks: 0 };
function check(c, game, step, when) {
  const G = c.G, V = (msg) => violations.push(`game ${game} step ${step} [${when}]: ${msg}`);
  if (G.hp < 0) V(`hp ${G.hp} < 0`);
  if (G.hp > G.maxHp) V(`hp ${G.hp} > maxHp ${G.maxHp}`);
  if (G.phase === 'PLAYING' && G.xp >= G.level * c.XP) V(`xp ${G.xp} not consumed at level ${G.level}`);
  if (G.phase === 'LOSE' && G.hp !== 0) V(`LOSE with hp ${G.hp}`);
  for (let i = 0; i < G.grid.length; i++) {
    const cell = G.grid[i];
    if (cell.rev && cell.mon && !cell.dead) V(`alive monster revealed at ${i} without fight`);
    if (cell.rev && (!cell.mon || cell.dead) && cell.t === 'empty') {
      const n = vm.runInContext(`cellNumber(${i})`, c);
      const ind = independentNumber(c, i);
      if (n !== ind) V(`number mismatch at ${i}: game says ${n}, independent says ${ind}`);
      // flood completeness: 0-cells must have all non-monster neighbors revealed.
      // Skipped on LOSE/WIN: the final blow marks a monster dead but the run is
      // over — no ripple owed on a finished board.
      if (ind === 0 && G.phase !== 'LOSE' && G.phase !== 'WIN') {
        const s = G.size, r = Math.floor(i / s), col = i % s;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = r + dr, nc = col + dc;
          if (nr < 0 || nc < 0 || nr >= s || nc >= s) continue;
          const nb = G.grid[nr * s + nc];
          if (!nb.mon && !nb.rev) V(`flood incomplete: 0-cell ${i} has unrevealed safe neighbor ${nr * s + nc}`);
        }
      }
    }
  }
  if (G.phase === 'WIN') {
    const dragonAlive = G.grid.some(x => x.mon === 'dragon' && !x.dead);
    if (G.floorIdx === c.FLOORS.length - 1 && dragonAlive) V('WIN with dragon alive');
  }
}

for (let g = 0; g < GAMES; g++) {
  const rng = PRNG.create(1000 + g);
  const c = freshCtx(rng);
  vm.runInContext('initRun()', c);
  let prevSouls = 0, prevGold = 0, step = 0, guard = 0;
  while (c.G.phase !== 'WIN' && c.G.phase !== 'LOSE' && guard++ < 3000) {
    if (c.G.phase === 'LEVEL_INTRO') { vm.runInContext('startFloor()', c); check(c, g, step, 'floor-start'); continue; }
    if (c.G.phase === 'PICK_RELIC') {
      const pick = rng() < 0.8 && c.G.relicChoices.length ? `'${c.G.relicChoices[Math.floor(rng() * c.G.relicChoices.length)].id}'` : 'null';
      vm.runInContext(`pickRelic(${pick})`, c);
      check(c, g, step, 'relic');
      continue;
    }
    // PLAYING: 随机点一个可交互格(未翻开的,或已翻开的楼梯)
    const cands = [];
    c.G.grid.forEach((cell, i) => {
      if (!cell.rev) cands.push(i);
      else if (cell.t === 'stairs') cands.push(i);
    });
    if (!cands.length) break;
    // 70% 概率优先点楼梯(若已翻开),模拟正常玩家推进
    const stairs = cands.find(i => c.G.grid[i].rev && c.G.grid[i].t === 'stairs');
    const target = (stairs != null && rng() < 0.7) ? stairs : cands[Math.floor(rng() * cands.length)];
    vm.runInContext(`clickCell(${target})`, c);
    stats.clicks++;
    step++;
    check(c, g, step, 'click');
    // souls stay monotonic; gold can legally drop (mimic steals, shop purchases)
    if (c.G.souls < prevSouls) violations.push(`game ${g}: souls decreased ${prevSouls}→${c.G.souls}`);
    prevSouls = c.G.souls;
  }
  if (guard >= 3000) violations.push(`game ${g}: did not terminate in 3000 steps`);
  if (c.G.phase === 'WIN') stats.win++;
  if (c.G.phase === 'LOSE') stats.lose++;
}

console.log(`simulated ${GAMES} games, ${stats.clicks} clicks — WIN ${stats.win} / LOSE ${stats.lose}`);
if (violations.length) {
  console.log(`❌ ${violations.length} violations:`);
  violations.slice(0, 20).forEach(v => console.log('  ' + v));
  process.exit(1);
}
console.log('✅ all invariants hold (numbers cross-checked独立实现, flood完整性, hp/xp/souls单调与边界, 终局条件)');
process.exit(0);
