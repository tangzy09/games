const assert = require('assert');
const Core = require('../js/core.js');

const GAMES = 300;
const STEP_CAP = 20000;   // 单局步数硬上限(防"永生"退化)
const isPow2 = v => Number.isInteger(Math.log2(v));

const lengths = [];
for (let g = 0; g < GAMES; g++) {
  const s = Core.createGame({ seed: 1000 + g });
  let steps = 0;
  while (!s.dead && steps < STEP_CAP) {
    const col = Math.floor(s.rand() * s.cols);   // 随机选列(用局内 rand,保持可复现)
    Core.shoot(s, col);
    steps++;
    // 逐步不变量
    for (let c = 0; c < s.cols; c++) {
      for (const v of s.board[c]) {
        assert(v > 0 && isPow2(v), `盘上值必须是 >0 的 2 的幂,得到 ${v} (seed ${1000 + g})`);
      }
      if (!s.dead) assert(s.board[c].length <= s.rows, `存活时列高 ≤ rows (seed ${1000 + g})`);
    }
    assert(Number.isFinite(s.score) && s.score >= 0, 'score 有限非负');
    assert(Number.isFinite(s.maxTile), 'maxTile 有限');
  }
  assert(s.dead, `局应在 ${STEP_CAP} 步内结束(seed ${1000 + g}) —— 疑似永生退化`);
  lengths.push(steps);
}

lengths.sort((a, b) => a - b);
const median = lengths[Math.floor(lengths.length / 2)];
const min = lengths[0], max = lengths[lengths.length - 1];
const mean = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
console.log(`test-sim: ${GAMES} 局 | 局长 min=${min} 中位=${median} 均=${mean} max=${max}`);

// 防秒死退化:随机瞎打也不该中位数 < 8 步就死
assert(median >= 8, `中位局长 ${median} 太短,疑似秒死退化(需调 SPAWN_EVERY/AMMO_WINDOW)`);
console.log('test-sim OK');
