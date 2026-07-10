// games/snake/js/ai.js — 哈密顿回路 + 捷径 + 停滞保护(纯函数,双导出)
const CoreRef = (typeof module !== 'undefined' && module.exports)
  ? require('./core.js') : Core;
const AIDIRS = CoreRef.DIRS;
const STALL_STEPS = 40;   // 待校准(设计 §13)

// S 形闭合回路:第 0 行通铺,1..rows-1 行在 x∈[1,cols-1] 蛇形,x=0 列收尾回起点
function buildCycle(cols, rows) {
  const order = [];
  for (let x = 0; x < cols; x++) order.push({ x, y: 0 });
  for (let y = 1; y < rows; y++) {
    if (y % 2 === 1) for (let x = cols - 1; x >= 1; x--) order.push({ x, y });
    else             for (let x = 1; x < cols; x++)      order.push({ x, y });
  }
  for (let y = rows - 1; y >= 1; y--) order.push({ x: 0, y });
  const indexOf = new Int32Array(cols * rows);
  order.forEach((c, i) => { indexOf[c.y * cols + c.x] = i; });
  return { order, indexOf, n: cols * rows };
}

const AI = { buildCycle, STALL_STEPS };
if (typeof module !== 'undefined' && module.exports) module.exports = AI;
