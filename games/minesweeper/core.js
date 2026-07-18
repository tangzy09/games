// games/minesweeper/core.js

const DIFFICULTIES = {
  beginner:      { cols: 8,  rows: 8,  mines: 10 },
  standard:      { cols: 9,  rows: 9,  mines: 10 },
  intermediate:  { cols: 12, rows: 12, mines: 30 },
  advanced:      { cols: 16, rows: 16, mines: 40 },
  expert:        { cols: 16, rows: 30, mines: 99 },
};

const MINE_FLAG = 15;

// 简单 LCG 随机数生成器
function seedRandom(seed) {
  let x = seed;
  return function() {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

// 生成盘面
function generate(difficulty, seed) {
  const cfg = DIFFICULTIES[difficulty];
  if (!cfg) throw new Error(`unknown difficulty: ${difficulty}`);

  const { cols, rows, mines } = cfg;
  const size = cols * rows;

  // 防守检查：雷数不能超过盘面大小
  if (mines >= size) {
    throw new Error(`mines (${mines}) must be less than board size (${size})`);
  }

  // Uint8Array 数据格式：
  // 低 4 bit (0x0F)：单元格内容（0-8 数字或 15 = 雷）
  // 高 4 bit (0xF0)：状态标志，当前未用，预留给 reveal/flag 标志
  const data = new Uint8Array(size);

  // Step 1: 随机放置雷
  const rand = seedRandom(seed);
  const minePositions = new Set();
  while (minePositions.size < mines) {
    const pos = Math.floor(rand() * size);
    minePositions.add(pos);
  }

  // Step 2: 填充雷
  for (let pos of minePositions) {
    data[pos] = MINE_FLAG; // 低 4 bit = 15
  }

  // Step 3: 计算每个非雷格的数字
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if ((data[idx] & 0x0F) === MINE_FLAG) continue; // 是雷，跳过

      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const adjIdx = nr * cols + nc;
          if ((data[adjIdx] & 0x0F) === MINE_FLAG) count++;
        }
      }
      data[idx] = count; // 低 4 bit = 数字 (0-8)
    }
  }

  return { cols, rows, mines, data };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generate, DIFFICULTIES, MINE_FLAG };
}
