// games/minesweeper/core.js

const DIFFICULTIES = {
  beginner:      { cols: 8,  rows: 8,  mines: 10 },
  standard:      { cols: 9,  rows: 9,  mines: 10 },
  intermediate:  { cols: 12, rows: 12, mines: 30 },
  advanced:      { cols: 16, rows: 16, mines: 40 },
  expert:        { cols: 16, rows: 30, mines: 99 },
};

const MINE_FLAG = 15;

// 状态标志
const STATE_REVEALED = 0x10; // bit 4
const STATE_FLAGGED = 0x20;  // bit 5

// 游戏状态
const GAME_STATES = {
  PLAYING: 'PLAYING',
  WON: 'WON',
  LOST: 'LOST',
};

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

function reveal(board, row, col) {
  // 创建盘面副本（不修改原盘）
  const newData = new Uint8Array(board.data);
  const newBoard = { cols: board.cols, rows: board.rows, mines: board.mines, data: newData };

  const idx = row * newBoard.cols + col;
  const { rows, cols } = newBoard;

  // 已打开或已标记，返回当前状态不变
  if (newBoard.data[idx] & STATE_REVEALED) {
    return { state: GAME_STATES.PLAYING, board: newBoard };
  }
  if (newBoard.data[idx] & STATE_FLAGGED) {
    return { state: GAME_STATES.PLAYING, board: newBoard };
  }

  // 点到雷，游戏结束（失败）
  const cellVal = newBoard.data[idx] & 0x0F;
  if (cellVal === MINE_FLAG) {
    newBoard.data[idx] |= STATE_REVEALED;
    // 暴露所有雷
    for (let i = 0; i < newBoard.data.length; i++) {
      if ((newBoard.data[i] & 0x0F) === MINE_FLAG) {
        newBoard.data[i] |= STATE_REVEALED;
      }
    }
    return { state: GAME_STATES.LOST, board: newBoard };
  }

  // 打开空白区（0 雷）时递归打开周围（BFS）
  const toReveal = new Set([idx]);
  while (toReveal.size > 0) {
    const current = toReveal.values().next().value;
    toReveal.delete(current);

    const r = Math.floor(current / cols);
    const c = current % cols;

    // 已打开则跳过
    if (newBoard.data[current] & STATE_REVEALED) continue;

    newBoard.data[current] |= STATE_REVEALED;

    // 如果是 0，加入周围格到待打开队列
    if ((newBoard.data[current] & 0x0F) === 0) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nextIdx = nr * cols + nc;
          if (!(newBoard.data[nextIdx] & STATE_REVEALED) &&
              !(newBoard.data[nextIdx] & STATE_FLAGGED)) {
            toReveal.add(nextIdx);
          }
        }
      }
    }
  }

  // 检查是否赢了（所有非雷格都打开）
  let won = true;
  for (let i = 0; i < newBoard.data.length; i++) {
    const val = newBoard.data[i] & 0x0F;
    const revealed = newBoard.data[i] & STATE_REVEALED;

    if (val !== MINE_FLAG && !revealed) {
      won = false;
      break;
    }
  }

  const state = won ? GAME_STATES.WON : GAME_STATES.PLAYING;
  return { state, board: newBoard };
}

function flag(board, row, col) {
  const newData = new Uint8Array(board.data);
  const newBoard = { cols: board.cols, rows: board.rows, mines: board.mines, data: newData };

  const idx = row * newBoard.cols + col;

  // 已打开无法标记
  if (newBoard.data[idx] & STATE_REVEALED) {
    return newBoard;
  }

  // 切换标记状态（异或）
  newBoard.data[idx] ^= STATE_FLAGGED;

  return newBoard;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generate, reveal, flag,
    DIFFICULTIES, MINE_FLAG, STATE_REVEALED, STATE_FLAGGED, GAME_STATES
  };
}
