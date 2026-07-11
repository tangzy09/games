// tiles.js — 数字→鱼 梯子数据 + 助手(纯数据,双导出)
// 鱼 id 均来自 fishId/assets/fish/cute/ 已确认存在的物种;P1 用这 13 档,后续可扩。
const TILES = [
  { v: 2,     fish: 'clownfish' },
  { v: 4,     fish: 'blenny' },
  { v: 8,     fish: 'butterflyfish' },
  { v: 16,    fish: 'angelfish' },
  { v: 32,    fish: 'blackspottedpuffer' },
  { v: 64,    fish: 'barracuda' },
  { v: 128,   fish: 'blacktipreefshark' },
  { v: 256,   fish: 'anglerfish' },
  { v: 512,   fish: 'barreleye' },
  { v: 1024,  fish: 'coelacanth' },
  { v: 2048,  fish: 'greatwhiteshark' },
  { v: 4096,  fish: 'whaleshark' },
  { v: 8192,  fish: 'belugawhale' },
  // 指数合并规则(N 连 → ×2^(N-1))让数值涨得很快,13 档不够用——随机瞎打都摸到 4096。
  // 补 4 档深海巨兽压梯顶:抹香鲸是真正下潜深渊猎巨乌贼的,皇带鱼是深海传说巨蛇。
  { v: 16384,  fish: 'orca' },
  { v: 32768,  fish: 'humpbackwhale' },
  { v: 65536,  fish: 'spermwhale' },
  { v: 131072, fish: 'oarfish' },
];
const MAX_TILE_VALUE = TILES[TILES.length - 1].v;

function tierOf(v) {
  for (let i = 0; i < TILES.length; i++) if (TILES[i].v === v) return i;
  return -1;
}
function fishOf(v) {
  const t = tierOf(v);
  return t < 0 ? null : TILES[t].fish;
}
function fmt(v) {
  // 梯值全是 2 的幂,M/B 用二进制前缀(2^20/2^30)才能整除出干净的 "1M"/"2M"
  if (v >= 2 ** 30) return (v / 2 ** 30) + 'B';
  if (v >= 2 ** 20) return (v / 2 ** 20) + 'M';
  return String(v);
}

// 双导出:node 走 module.exports;浏览器靠顶层 const Tiles 当全局(同一词法环境后续脚本可见,同 snake/fruits)
const Tiles = { TILES, MAX_TILE_VALUE, tierOf, fishOf, fmt };
if (typeof module !== 'undefined' && module.exports) module.exports = Tiles;
