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
let generate, DIFFICULTIES, MINE_FLAG;

try {
  const mod = require('../core.js');
  generate = mod.generate;
  DIFFICULTIES = mod.DIFFICULTIES;
  MINE_FLAG = mod.MINE_FLAG;
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

  console.log('\nAll tests passed! ✅');
  process.exit(0);
} catch (e) {
  console.error('\n❌ Test failed:');
  console.error(e.message);
  process.exit(1);
}
