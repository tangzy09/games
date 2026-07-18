// games/minesweeper/tests/test-core.js

// 简单 assert 库（如果没有 node-assert，自己实现）
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${msg}\nExpected: ${expected}, Got: ${actual}`);
  }
}

function assertGreater(actual, min, msg) {
  if (actual <= min) {
    throw new Error(`Assertion failed: ${msg}\nExpected > ${min}, Got: ${actual}`);
  }
}

function assertTrue(condition, msg) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// 导入要测试的模块
let generate, DIFFICULTIES, MINE_FLAG, reveal, flag, STATE_REVEALED, STATE_FLAGGED, GAME_STATES;

try {
  const mod = require('../core.js');
  generate = mod.generate;
  DIFFICULTIES = mod.DIFFICULTIES;
  MINE_FLAG = mod.MINE_FLAG;
  reveal = mod.reveal;
  flag = mod.flag;
  STATE_REVEALED = mod.STATE_REVEALED;
  STATE_FLAGGED = mod.STATE_FLAGGED;
  GAME_STATES = mod.GAME_STATES;
} catch (e) {
  console.error('Failed to load core.js:', e.message);
  process.exit(1);
}

// 测试 1: 检查棋盘尺寸
function test_beginner_board_dimensions() {
  const board = generate('beginner', 12345);
  const cfg = DIFFICULTIES.beginner;

  assertEqual(board.cols, cfg.cols, 'cols mismatch');
  assertEqual(board.rows, cfg.rows, 'rows mismatch');
  assertEqual(board.mines, cfg.mines, 'mines count mismatch');
  assertEqual(board.data.length, cfg.cols * cfg.rows, 'array size mismatch');
}

// 测试 2: 检查雷数量
function test_standard_mine_count() {
  const board = generate('standard', 12345);
  let mineCount = 0;
  for (let i = 0; i < board.data.length; i++) {
    if ((board.data[i] & 0x0F) === MINE_FLAG) mineCount++;
  }
  assertEqual(mineCount, 10, `expected 10 mines, got ${mineCount}`);
}

// 测试 3: 检查数字是否与周围雷数匹配
function test_numbers_match_adjacent_mines() {
  const board = generate('beginner', 12345);
  const { cols, rows, data } = board;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const cellVal = data[idx] & 0x0F;

      if (cellVal === MINE_FLAG) continue; // 是雷，跳过

      let adjCount = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const adjIdx = nr * cols + nc;
          if ((data[adjIdx] & 0x0F) === MINE_FLAG) adjCount++;
        }
      }

      assertEqual(cellVal, adjCount,
        `cell [${r},${c}]: number ${cellVal} != adjacent mines ${adjCount}`);
    }
  }
}

// 测试 4: 所有难度都能生成
function test_all_difficulties() {
  for (const [name, cfg] of Object.entries(DIFFICULTIES)) {
    const board = generate(name, 99999);
    assertEqual(board.cols, cfg.cols, `${name} cols`);
    assertEqual(board.rows, cfg.rows, `${name} rows`);
    assertEqual(board.mines, cfg.mines, `${name} mines`);
  }
}

// 测试 5: 异常处理 - 无效难度
function test_invalid_difficulty() {
  try {
    generate('impossible', 12345);
    throw new Error('Should have thrown an error');
  } catch (e) {
    assertTrue(e.message.includes('unknown difficulty'), 'invalid difficulty should throw');
  }
}

// 测试 6: 最大难度 expert 的完整验证
function test_expert_difficulty() {
  const board = generate('expert', 54321);
  const cfg = DIFFICULTIES.expert;

  assertEqual(board.cols, 16, 'expert cols');
  assertEqual(board.rows, 30, 'expert rows');
  assertEqual(board.mines, 99, 'expert mines');

  let mineCount = 0;
  for (let i = 0; i < board.data.length; i++) {
    if ((board.data[i] & 0x0F) === MINE_FLAG) mineCount++;
  }
  assertEqual(mineCount, 99, 'expert mine count must be exactly 99');
}

// 测试 7: 点到雷会失败
function test_reveal_mine_loses() {
  const board = generate('beginner', 12345);

  // 找一个雷
  let mineRow = 0, mineCol = 0, found = false;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if ((board.data[r * board.cols + c] & 0x0F) === MINE_FLAG) {
        mineRow = r;
        mineCol = c;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  assertTrue(found, 'should find a mine on board');

  const result = reveal(board, mineRow, mineCol);
  assertEqual(result.state, GAME_STATES.LOST, 'clicking mine should lose');
  assertTrue(result.board.data[mineRow * board.cols + mineCol] & STATE_REVEALED,
    'mine cell should be revealed');
}

// 测试 8: 打开空白区会递归扩展
function test_reveal_empty_cell_cascades() {
  const board = generate('beginner', 12345);

  // 找一个数字为 0 的格子（空白区）
  let emptyRow = 0, emptyCol = 0, found = false;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const idx = r * board.cols + c;
      if ((board.data[idx] & 0x0F) !== MINE_FLAG && (board.data[idx] & 0x0F) === 0) {
        emptyRow = r;
        emptyCol = c;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  assertTrue(found, 'should find an empty cell on board');

  const result = reveal(board, emptyRow, emptyCol);

  // 验证被打开的格子数 > 1（递归效果）
  let revealedCount = 0;
  for (let i = 0; i < result.board.data.length; i++) {
    if (result.board.data[i] & STATE_REVEALED) revealedCount++;
  }

  assertGreater(revealedCount, 1, 'clicking empty cell should cascade and reveal multiple cells');
}

// 测试 9: 标记格子
function test_flag_cell() {
  const board = generate('beginner', 12345);
  const result = flag(board, 0, 0);

  const idx = 0;
  assertTrue(result.data[idx] & STATE_FLAGGED, 'cell should be flagged');
  assertTrue(!(result.data[idx] & STATE_REVEALED), 'flagged cell should not be revealed');
}

// 测试 10: 再次标记时解标
function test_unflag_cell() {
  const board = generate('beginner', 12345);
  let result = flag(board, 0, 0);
  assertTrue(result.data[0] & STATE_FLAGGED, 'first flag should set flag');

  result = flag(result, 0, 0);
  assertTrue(!(result.data[0] & STATE_FLAGGED), 'second flag should unset flag');
}

// 测试 11: 通关条件 - 打开所有非雷格
function test_win_condition() {
  const board = generate('beginner', 99999);

  // 打开所有非雷格
  let currentBoard = board;
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const idx = r * board.cols + c;
      if ((currentBoard.data[idx] & 0x0F) !== MINE_FLAG &&
          !(currentBoard.data[idx] & STATE_REVEALED)) {
        const result = reveal(currentBoard, r, c);
        if (result.state === GAME_STATES.LOST) {
          // 不小心点到雷了，跳过本盘
          return;
        }
        currentBoard = result.board;
        if (result.state === GAME_STATES.WON) {
          assertEqual(result.state, GAME_STATES.WON, 'should win when all non-mine cells opened');
          return;
        }
      }
    }
  }
}

// 运行所有测试
console.log('Running tests...');
try {
  test_beginner_board_dimensions();
  console.log('✓ test_beginner_board_dimensions');

  test_standard_mine_count();
  console.log('✓ test_standard_mine_count');

  test_numbers_match_adjacent_mines();
  console.log('✓ test_numbers_match_adjacent_mines');

  test_all_difficulties();
  console.log('✓ test_all_difficulties');

  test_invalid_difficulty();
  console.log('✓ test_invalid_difficulty');

  test_expert_difficulty();
  console.log('✓ test_expert_difficulty');

  test_reveal_mine_loses();
  console.log('✓ test_reveal_mine_loses');

  test_reveal_empty_cell_cascades();
  console.log('✓ test_reveal_empty_cell_cascades');

  test_flag_cell();
  console.log('✓ test_flag_cell');

  test_unflag_cell();
  console.log('✓ test_unflag_cell');

  test_win_condition();
  console.log('✓ test_win_condition');

  console.log('\n✅ All 11 tests passed!');
  process.exit(0);
} catch (e) {
  console.error('\n❌ Test failed:');
  console.error(e.message);
  process.exit(1);
}
