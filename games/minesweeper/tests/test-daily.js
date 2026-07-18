// games/minesweeper/tests/test-daily.js

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

let getDailySeed, checkStreak;

try {
  const mod = require('../daily.js');
  getDailySeed = mod.getDailySeed;
  checkStreak = mod.checkStreak;
} catch (e) {
  console.error('Failed to load daily.js:', e.message);
  process.exit(1);
}

// 测试 1: 相同日期产生相同 seed
function test_same_date_same_seed() {
  const date1 = '2026-07-18';
  const date2 = '2026-07-18';

  const seed1 = getDailySeed(date1);
  const seed2 = getDailySeed(date2);

  assertEqual(seed1, seed2, 'same date should produce same seed');
}

// 测试 2: 不同日期产生不同 seed
function test_different_dates_different_seeds() {
  const date1 = '2026-07-18';
  const date2 = '2026-07-19';

  const seed1 = getDailySeed(date1);
  const seed2 = getDailySeed(date2);

  if (seed1 === seed2) {
    throw new Error('different dates should produce different seeds');
  }
}

// 测试 3: 连胜递增（相邻日期）
function test_streak_increments() {
  const today = '2026-07-20';
  const yesterday = '2026-07-19';

  const stats1 = {
    dailyStreak: 5,
    lastPlayDate: yesterday,
  };

  const newStats = checkStreak(stats1, today);
  assertEqual(newStats.dailyStreak, 6, 'streak should increment');
  assertEqual(newStats.lastPlayDate, today, 'lastPlayDate should update');
}

// 测试 4: 连胜重置（错过一天）
function test_streak_resets_on_miss() {
  const today = '2026-07-21';
  const twoDaysAgo = '2026-07-19';

  const stats1 = {
    dailyStreak: 5,
    lastPlayDate: twoDaysAgo,
  };

  const newStats = checkStreak(stats1, today);
  assertEqual(newStats.dailyStreak, 1, 'streak should reset to 1 after missing a day');
}

// 测试 5: 同一天重复玩，连胜不变
function test_streak_same_day() {
  const today = '2026-07-20';

  const stats1 = {
    dailyStreak: 5,
    lastPlayDate: today,
  };

  const newStats = checkStreak(stats1, today);
  assertEqual(newStats.dailyStreak, 5, 'streak should not change on same day');
  assertEqual(newStats.lastPlayDate, today, 'lastPlayDate remains same');
}

// 测试 6: 首次游玩（无记录）
function test_first_play() {
  const today = '2026-07-20';

  const stats1 = {
    dailyStreak: 0,
    lastPlayDate: null,
  };

  const newStats = checkStreak(stats1, today);
  assertEqual(newStats.dailyStreak, 1, 'first play should set streak to 1');
  assertEqual(newStats.lastPlayDate, today, 'lastPlayDate should be set');
}

// 运行所有测试
console.log('Running tests...');
try {
  test_same_date_same_seed();
  console.log('✓ test_same_date_same_seed');

  test_different_dates_different_seeds();
  console.log('✓ test_different_dates_different_seeds');

  test_streak_increments();
  console.log('✓ test_streak_increments');

  test_streak_resets_on_miss();
  console.log('✓ test_streak_resets_on_miss');

  test_streak_same_day();
  console.log('✓ test_streak_same_day');

  test_first_play();
  console.log('✓ test_first_play');

  console.log('\n✅ All 6 tests passed!');
  process.exit(0);
} catch (e) {
  console.error('\n❌ Test failed:');
  console.error(e.message);
  process.exit(1);
}
