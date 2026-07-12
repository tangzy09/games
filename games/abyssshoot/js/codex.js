// codex.js — 深海鱼图鉴(纯数据函数,双导出)。
// ⚠ 命名:浏览器全局词法环境共享,core.js 已用 TILES_,这里换名 TILES_C_。
const TILES_C_ = (typeof module !== 'undefined' && module.exports)
  ? require('./tiles.js') : Tiles;

// 「见过即解锁」:盘面上**真实存在过**的值(合出来的/射上去的/刷下来的)+ 当前弹药。
// ⚠ 允许有洞:指数合并规则可跳档(3 个 2 连 → 直接 8,跳过 4)。若某档真的从没出现过,
//   图鉴就该**如实显示未解锁**——这是完美主义者的收集动力,别用「≤maxTile 全解锁」去填洞撒谎。
// 梯顶皇带鱼游走清场不影响:它出现过就已记进 seen。
function record(save, s) {
  const seen = new Set(save.codex.seen);
  const vals = [];
  for (let c = 0; c < s.cols; c++) for (const v of s.board[c]) vals.push(v);
  if (s.ammo) vals.push(s.ammo);
  for (const v of vals) {
    if (TILES_C_.tierOf(v) < 0) continue;                 // 超纲值(理论上不该有)不进图鉴
    seen.add(v);
    save.stats.fishSeenCount[v] = (save.stats.fishSeenCount[v] || 0) + 1;
  }
  save.codex.seen = [...seen].sort((a, b) => a - b);
  return save;
}

function isSeen(save, v) { return save.codex.seen.indexOf(v) >= 0; }

function progress(save) {
  return { seen: save.codex.seen.length, total: TILES_C_.TILES.length };
}

// 给 UI 的完整列表(鱼梯顺序):{ v, fish, seen, count }
function entries(save) {
  return TILES_C_.TILES.map(t => ({
    v: t.v, fish: t.fish,
    seen: isSeen(save, t.v),
    count: save.stats.fishSeenCount[t.v] || 0,
  }));
}

const Codex = { record, isSeen, progress, entries };
if (typeof module !== 'undefined' && module.exports) module.exports = Codex;
