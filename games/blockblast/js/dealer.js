// ════════════════════════════════════════
// dealer.js — 块流（Piece Stream）。本作的招牌，也是对玩家的公开承诺（DESIGN §0.4 / §2）：
//
//   「一局的整个出块序列，在你落第一子之前就由种子完全确定了。
//     它不看棋盘、不看分数、不看你付没付钱——它根本不知道你在做什么。」
//
// ⚠ 这不是一句宣传语，是这个文件的**类型签名**：stream(seed, i) 只有两个参数，
//   没有 board、没有 score、没有任何玩家状态可读。想作弊都没有入口。
//   （tests/test-dealer.js 有一条测试专门钉死这一点。）
//
// 随机访问（而非顺序生成）是刻意的：撤销只需把 streamIndex 减回去，
// 块流天然重现——v3 那个「撤销后重新补牌会抽出不同的块 = 刷块外挂」的坑不存在。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const Pieces = (typeof module !== 'undefined' && module.exports)
    ? require('./pieces.js') : root.Pieces;

  // splitmix32：把 (seed, i) 混成一个 [0,1) 的数。可随机访问、跨平台确定。
  function hash(seed, i) {
    let x = (seed ^ Math.imul(i + 1, 0x9E3779B9)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    return x / 4294967296;
  }

  /** 块流的第 i 块（i 从 0 起）。纯函数：同 (seed,i) 恒等，与棋盘/分数/一切无关。 */
  function stream(seed, i) { return Pieces.pick(hash(seed, i)); }

  /** 取一手 3 块（托盘）：块流的 [i, i+3) */
  function hand(seed, i) { return [stream(seed, i), stream(seed, i + 1), stream(seed, i + 2)]; }

  /** 随机开一局的种子（唯一用到不确定性的地方；每日谜题改用日期当种子） */
  function randomSeed() { return (Math.random() * 0xffffffff) >>> 0; }

  /** 每日谜题：同一天全球同一条块流（YYYYMMDD → seed） */
  function dailySeed(d) {
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    return (y * 10000 + m * 100 + day) >>> 0;
  }

  const API = { stream, hand, randomSeed, dailySeed, hash };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Dealer = API;
})(typeof self !== 'undefined' ? self : this);
