// v2.1 蒙特卡洛:贪心 bot 按原作规则打 N 局。node tools/test-mines-sim.js [局数]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PRNG = require('../../../engine/prng.js');

const GAMES = parseInt(process.argv[2] || '300', 10);

function freshCtx(seed) {
  const ctx = vm.createContext({ console });
  const dir = path.join(__dirname, '..', 'js');
  for (const f of ['constants.js', 'logic.js'])
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  ctx.G = vm.runInContext('G', ctx);
  ctx.M = vm.runInContext('MONSTERS', ctx);
  ctx.G.rng = PRNG.create(seed);
  return ctx;
}

function indNumber(c, i) {
  const W = c.G.w, x0 = i % W, y0 = Math.floor(i / W);
  let s = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= W || y >= c.G.h) continue;
    s += Math.max(0, c.G.grid[y * W + x].lv);
  }
  return s;
}

let violations = [], stats = { win: 0, lose: 0, stuck: 0, clicks: 0, badges: 0 };
function check(c, g, step) {
  const V = (m) => violations.push(`game ${g} step ${step}: ${m}`);
  if (c.G.phase === 'PLAYING' && c.G.hp <= 0) V(`playing at hp ${c.G.hp}`);
  if (c.G.hp > c.G.maxHp) V('hp > maxHp');
  for (let i = 0; i < c.G.grid.length; i += 3) {
    const cell = c.G.grid[i];
    if (!cell.rev || cell.mon || cell.item || cell.spell || cell.treasureXp) continue;
    if (vm.runInContext(`cellNumber(${i})`, c) !== indNumber(c, i)) V(`number mismatch at ${i}`);
  }
}

const ORACLE = !process.argv.includes('--novice'); // 神谕=可赢性证明门禁;--novice 跑演绎 bot 下界

for (let g = 0; g < GAMES; g++) {
  const c = freshCtx(7000 + g);
  vm.runInContext('initRun()', c);
  let step = 0, guard = 0, gnomeClicks = 0;
  while (c.G.phase === 'PLAYING' && guard++ < 2500) {
    const grid = c.G.grid, hp = c.G.hp;
    if (vm.runInContext('canLevelUp()', c)) { vm.runInContext('levelUp()', c); continue; }
    let t = -1;
    if (ORACLE) { // full-information play: proves the economy/full-clear route works
      // ① 拾取:尸体/宝石/卷轴/宝箱(隐藏的也点——第一次翻开第二次拾取)
      t = grid.findIndex(x => (x.mon && x.defeated && x.rev) || (x.rev && (x.treasureXp || (x.spell && x.spell !== 'crown') || x.item === 'chest' || x.item === 'medichest')));
      if (t < 0) t = grid.findIndex(x => !x.rev && ((x.mon && x.defeated) || x.item === 'chest' || x.item === 'medichest'));
      // ② 零伤收益:龙蛋、地精(逼到绝路前的跳跃也是零伤)
      if (t < 0) t = grid.findIndex(x => x.mon === 'egg' && !x.defeated);
      if (t < 0 && gnomeClicks < 40) { t = grid.findIndex(x => x.mon === 'gnome' && !x.defeated); if (t >= 0) gnomeClicks++; }
      // ③ 最大可杀怪(贪心找零:大怪先吃,小怪留作零钱)
      if (t < 0) {
        let bl = -1;
        grid.forEach((x, i) => {
          if (!x.mon || x.defeated || x.mon === 'gnome' || x.mon === 'egg') return;
          const lv = c.M[x.mon].lv;
          if (lv >= 90 && !c.G.minesDisarmed) return;
          if (lv < hp && lv > bl) { bl = lv; t = i; }
        });
      }
      // ④ 医疗包 = 精确解锁:当前血打不动任何怪、且吃满后能打 → 才吃
      if (t < 0) {
        let minLv = Infinity;
        grid.forEach(x => {
          if (!x.mon || x.defeated || x.mon === 'gnome' || x.mon === 'egg') return;
          const lv = c.M[x.mon].lv;
          if (lv >= 90 && !c.G.minesDisarmed) return;
          if (lv < minLv) minLv = lv;
        });
        if (isFinite(minLv) && hp <= minLv && c.G.maxHp > minLv)
          t = grid.findIndex(x => x.item === 'medikit');
      }
      // ⑤ 皇冠
      if (t < 0) t = grid.findIndex(x => x.rev && x.spell === 'crown');
      // ⑥ 光球类
      if (t < 0) t = grid.findIndex(x => x.item === 'orb' || x.item === 'spellorb');
      // ⑧ 挖墙(亏本买卖,最后才做且血要厚)
      if (t < 0 && hp > 4) t = grid.findIndex(x => x.item === 'wall');
      // ⑨ 翻开无害暗格
      if (t < 0) t = grid.findIndex(x => !x.rev && (!x.mon || x.defeated));
      if (t < 0) break;
      // items must be revealed before their click works; oracle taps twice naturally
      vm.runInContext(`clickCell(${t})`, c);
      stats.clicks++; step++;
      if (step % 40 === 0) check(c, g, step);
      continue;
    }
    // ① 免费拾取:尸体/宝石/卷轴(非皇冠)/宝箱链
    t = grid.findIndex(x => x.rev && ((x.mon && x.defeated) || x.treasureXp || (x.spell && x.spell !== 'crown') || x.item === 'chest' || x.item === 'medichest'));
    // ② 医疗包:亏血一半以上才吃
    if (t < 0 && hp <= c.G.maxHp / 2) t = grid.findIndex(x => x.rev && x.item === 'medikit');
    // ③ 皇冠在手直接加冕
    if (t < 0) t = grid.findIndex(x => x.rev && x.spell === 'crown');
    // ④ 打得过的已翻开活怪:小怪优先,保 3 血缓冲;若这一刀能凑满升级(=回满)则放宽到 hp>lv
    if (t < 0) {
      const need = vm.runInContext('xpNeed()', c);
      let bl = Infinity;
      grid.forEach((x, i) => {
        if (!x.rev || !x.mon || x.defeated || x.mimicHidden) return;
        const lv = c.M[x.mon].lv;
        if (x.mon === 'gnome' || lv >= 90) return;
        const safe = hp - lv >= 3 || (c.G.xp + lv >= need && lv < hp);
        if (safe && lv < bl) { bl = lv; t = i; }
      });
      if (!isFinite(bl)) t = -1;
    }
    // ⑤ 挖墙(血充裕时)
    if (t < 0 && hp > 4) t = grid.findIndex(x => x.rev && x.item === 'wall');
    // ⑥ 光球/法术球
    if (t < 0) t = grid.findIndex(x => x.rev && (x.item === 'orb' || x.item === 'spellorb'));
    // ⑦ 地精(限次防死循环)
    if (t < 0 && gnomeClicks < 30) { t = grid.findIndex(x => x.rev && x.mon === 'gnome' && !x.defeated); if (t >= 0) gnomeClicks++; }
    // ⑦b 要盲开了且血线低 → 先吃医疗包续航
    if (t < 0 && hp < 5) {
      const mk = grid.findIndex(x => x.rev && x.item === 'medikit');
      if (mk >= 0 && hp < c.G.maxHp) t = mk;
    }
    // ⑧ 翻暗格:先吃零格安全推定,再避雷,最后挑最小风险
    if (t < 0) {
      const hidden = grid.map((x, i) => !x.rev ? i : -1).filter(i => i >= 0);
      if (!hidden.length) break;
      const numOf = (n) => {
        const nb = grid[n];
        if (!nb.rev || nb.mon || nb.item || nb.spell || nb.treasureXp) return null;
        return vm.runInContext(`cellNumber(${n})`, c);
      };
      // (a) 某个已翻数字格为 0 → 它的暗邻居 100% 无伤(lv0)
      outer: for (const i of hidden) {
        for (const n of vm.runInContext(`neighbors(${i})`, c)) {
          if (numOf(n) === 0) { t = i; break outer; }
        }
      }
      // (b) 上界推理:暗格等级 ≤ 任一相邻数字 → minBound < hp 即安全可点,挑最小的
      if (t < 0) {
        let bestBound = Infinity;
        for (const i of hidden) {
          let bound = Infinity;
          for (const n of vm.runInContext(`neighbors(${i})`, c)) {
            const v = numOf(n);
            if (v !== null) bound = Math.min(bound, v);
          }
          if (bound < hp && bound < bestBound) { bestBound = bound; t = i; }
        }
        // (c) 没有可证安全的格:血厚(≥9)才赌无信息格,否则找药/认栽赌最小上界
        if (t < 0) {
          const noInfo = hidden.filter(i => vm.runInContext(`neighbors(${i})`, c).every(n => numOf(n) === null));
          if (hp >= 9 && noInfo.length) t = noInfo[Math.floor(c.G.rng() * noInfo.length)];
          else {
            const mk = grid.findIndex(x => x.rev && x.item === 'medikit');
            if (mk >= 0 && hp < c.G.maxHp) t = mk;
            else {
              let bb = Infinity;
              for (const i of hidden) {
                let bound = 150;
                for (const n of vm.runInContext(`neighbors(${i})`, c)) { const v = numOf(n); if (v !== null) bound = Math.min(bound, v); }
                if (bound < bb) { bb = bound; t = i; }
              }
              if (t < 0) t = hidden[Math.floor(c.G.rng() * hidden.length)];
            }
          }
        }
      }
    }
    if (t < 0) break;
    const cellBefore = grid[t], hpBefore = hp;
    const desc = (cellBefore.mon || cellBefore.item || cellBefore.spell || (cellBefore.treasureXp ? 'gem' : 'empty')) + (cellBefore.rev ? '/rev' : '/hid');
    vm.runInContext(`clickCell(${t})`, c);
    stats.clicks++; step++;
    if (c.G.phase === 'LOSE' && g < 6) console.log(`  autopsy g${g}: step${step} hp${hpBefore} clicked ${desc} lv=${cellBefore.mon ? c.M[cellBefore.mon].lv : 0} maxHp${c.G.maxHp} lvPlayer${c.G.level}`);
    if (step % 40 === 0) check(c, g, step);
  }
  check(c, g, step);
  if (process.argv.includes('--debug') && g < 3) {
    const alive = {};
    c.G.grid.forEach(x => { if (x.mon && !x.defeated) alive[x.mon] = (alive[x.mon] || 0) + 1; });
    console.log(`debug g${g}: ${c.G.phase} lv${c.G.level} hp${c.G.hp}/${c.G.maxHp} xp${c.G.xp}/${vm.runInContext('xpNeed()', c)} medikits=${c.G.grid.filter(x => x.item === 'medikit').length} corpses=${c.G.grid.filter(x => x.mon && x.defeated).length} alive=${JSON.stringify(alive)}`);
  }
  if (c.G.phase === 'WIN') { stats.win++; stats.badges += c.G.badgesThisRun.length; }
  else if (c.G.phase === 'LOSE') stats.lose++;
  else stats.stuck++;
}

console.log(`simulated ${GAMES} games, ${stats.clicks} clicks — WIN ${stats.win} / LOSE ${stats.lose} / stuck ${stats.stuck}, badges ${stats.badges}`);
if (violations.length) {
  console.log(`❌ ${violations.length} violations:`);
  violations.slice(0, 12).forEach(v => console.log('  ' + v));
  process.exit(1);
}
const wr = stats.win / GAMES;
console.log(`win rate ${(wr * 100).toFixed(1)}% — ${wr > 0.03 ? '✅ 可赢性成立' : '❌ 经济或规则可疑'}`);
process.exit(wr > 0.03 ? 0 : 1);
