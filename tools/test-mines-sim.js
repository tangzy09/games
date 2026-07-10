// v2 蒙特卡洛:贪心 bot 打 N 局,验证不变量 + 可赢性(经济曲线可达)。
// 用法: node tools/test-mines-sim.js [局数]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PRNG = require('../engine/prng.js');

const GAMES = parseInt(process.argv[2] || '300', 10);

function freshCtx(seed) {
  const ctx = vm.createContext({ console });
  const dir = path.join(__dirname, '..', 'games', 'minesweeper', 'js');
  for (const f of ['constants.js', 'logic.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  ctx.G = vm.runInContext('G', ctx);
  ctx.M = vm.runInContext('MONSTERS', ctx);
  ctx.STAR = vm.runInContext('PEEPER_STAR', ctx);
  ctx.G.rng = PRNG.create(seed);
  return ctx;
}

// 独立数字重算(不调 cellNumber)
function indNumber(c, i) {
  if (c.G.grid[i].fogged) return null;
  const W = c.G.w, H = c.G.h, r = Math.floor(i / W), col = i % W;
  let s = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = col + dc;
    if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
    const cell = c.G.grid[rr * W + cc];
    if (cell.mon && !cell.dead) s += c.M[cell.mon].lv;
  }
  return s;
}

let violations = [], stats = { win: 0, lose: 0, stuck: 0, clicks: 0 };
function check(c, g, step) {
  const V = (m) => violations.push(`game ${g} step ${step}: ${m}`);
  if (c.G.hp < 0) V(`hp ${c.G.hp} < 0`);
  if (c.G.hp > c.G.maxHp) V('hp > maxHp');
  if (c.G.phase === 'PLAYING' && c.G.xp >= vm.runInContext('xpNeed()', c)) V('xp not consumed');
  for (let i = 0; i < c.G.grid.length; i++) {
    const cell = c.G.grid[i];
    if (!cell.rev || (cell.mon && !cell.dead) || cell.t !== 'empty') continue;
    const n = vm.runInContext(`cellNumber(${i})`, c);
    if (JSON.stringify(n) !== JSON.stringify(indNumber(c, i))) V(`number mismatch at ${i}`);
  }
}

for (let g = 0; g < GAMES; g++) {
  const c = freshCtx(3000 + g);
  vm.runInContext('initRun()', c);
  let step = 0, guard = 0;
  while (c.G.phase === 'PLAYING' && guard++ < 2000) {
    const grid = c.G.grid, hp = c.G.hp;
    // ① 已翻开的宝箱直接拾取;回血卷轴只在血量吃紧时用(≤一半)
    let target = grid.findIndex(x => x.rev && x.t === 'chest' && !(x.mon && !x.dead));
    if (target < 0 && hp <= c.G.maxHp / 2)
      target = grid.findIndex(x => x.rev && x.t === 'heartscroll' && !(x.mon && !x.dead));
    // ② 打得起的已翻开怪(hp 归 0 也活,所以 lv <= hp 都能打);龙要等血上限够
    if (target < 0) {
      let best = -1, bestLv = -1;
      grid.forEach((x, i) => {
        if (!x.rev || !x.mon || x.dead) return;
        const M = c.M[x.mon];
        if (M.mine && !c.G.sweepDone) return;
        if (M.boss && c.G.maxHp < M.lv) return; // 血上限不够先不碰龙
        const cost = M.teleports ? 0 : M.lv;
        if (cost <= hp && M.lv > bestLv) { best = i; bestLv = M.lv; }
      });
      target = best;
    }
    // ②b 什么都打不起且还有药 → 喝药回满再战
    if (target < 0 && hp < c.G.maxHp)
      target = grid.findIndex(x => x.rev && x.t === 'heartscroll' && !(x.mon && !x.dead));
    // ③ 掀开一个未翻开格(优先 peek 过的安全格,否则随机)
    if (target < 0) {
      const hidden = grid.map((x, i) => i).filter(i => !grid[i].rev);
      if (!hidden.length) break;
      const peeked = hidden.filter(i => grid[i].peek && !grid[i].mon);
      target = peeked.length ? peeked[0] : hidden[Math.floor(c.G.rng() * hidden.length)];
    }
    vm.runInContext(`clickCell(${target})`, c);
    stats.clicks++; step++;
    if (step % 25 === 0) check(c, g, step); // 抽查(全查太慢)
  }
  check(c, g, step);
  if (c.G.phase === 'WIN') stats.win++;
  else if (c.G.phase === 'LOSE') stats.lose++;
  else stats.stuck++;
  if (guard >= 2000) violations.push(`game ${g}: no termination`);
}

console.log(`simulated ${GAMES} games, ${stats.clicks} clicks — WIN ${stats.win} / LOSE ${stats.lose} / stuck ${stats.stuck}`);
if (violations.length) {
  console.log(`❌ ${violations.length} violations:`);
  violations.slice(0, 15).forEach(v => console.log('  ' + v));
  process.exit(1);
}
const winRate = stats.win / GAMES;
console.log(`win rate ${(winRate * 100).toFixed(1)}% — ${winRate > 0.05 ? '✅ 可赢性成立(贪心bot是下界)' : '❌ 经济曲线可能不可达'}`);
process.exit(winRate > 0.05 ? 0 : 1);
