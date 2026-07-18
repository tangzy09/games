// games/minesweeper/daily.js

/**
 * 根据日期字符串生成确定性的种子
 * @param {string} dateStr - 日期字符串，格式 'YYYY-MM-DD'
 * @return {number} 种子值
 */
function getDailySeed(dateStr) {
  // dateStr: 'YYYY-MM-DD'
  // 转换为数字种子（保证相同日期产生相同 seed）
  const parts = dateStr.split('-');
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);

  // 简单公式：year * 10000 + month * 100 + day
  // 对于 2026-07-20，结果为 20260720
  return year * 10000 + month * 100 + day;
}

/**
 * 检查并更新连胜数
 * @param {object} stats - 当前统计对象，包含 { dailyStreak, lastPlayDate }
 * @param {string} todayStr - 今天的日期字符串，格式 'YYYY-MM-DD'
 * @return {object} 更新后的统计对象
 */
function checkStreak(stats, todayStr) {
  // 获取上次游玩日期
  const lastDate = stats.lastPlayDate || null;

  // 如果首次游玩或无记录
  if (!lastDate) {
    return {
      dailyStreak: 1,
      lastPlayDate: todayStr,
    };
  }

  // 计算两个日期之间相隔的天数
  const today = new Date(todayStr);
  const lastDay = new Date(lastDate);

  // 毫秒差转天数
  const daysDiff = Math.round((today - lastDay) / (1000 * 60 * 60 * 24));

  let newStreak = stats.dailyStreak || 0;

  if (daysDiff === 0) {
    // 同一天，连胜保持不变
    newStreak = stats.dailyStreak;
  } else if (daysDiff === 1) {
    // 相邻日期（相隔 1 天），连胜 +1
    newStreak = stats.dailyStreak + 1;
  } else if (daysDiff > 1) {
    // 间隔超过 1 天（错过日期），重置为 1
    newStreak = 1;
  } else if (daysDiff < 0) {
    // 时间回溯（不合理），重置为 1
    newStreak = 1;
  }

  return {
    dailyStreak: newStreak,
    lastPlayDate: todayStr,
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getDailySeed, checkStreak };
}
