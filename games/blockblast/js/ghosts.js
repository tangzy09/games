// ════════════════════════════════════════
// ghosts.js — 天使榜（预设分数的追赶角色，纯逻辑可 node 单测）。
//
// DESIGN §7 的正确形态：进度条与「超越」的爽感保留，但**明确是虚构角色**——
// ⛔ 文案绝不出现「玩家」（假装真人比分 = 我们自己骂过的伪社会证明）。
// 头像复用天使画廊素材（assets/angels/），名字是角色名（专有名词，十语不译）。
//
// 「打败了谁」零存档：完全由分数推导（beatenCount(score)）——最高分就是进度。
// 分数梯子按 sim 数据铺（casual 中位 153 / mid 中位 2991）：
// 前几档几盘内就能超掉（即时爽点），尾部 2 万是长线目标。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  // img = 天使画廊的图序号（0-based，对应 assets/angels/a{i+1}.webp）
  const LADDER = [
    { name: 'Coco',   score: 200,   img: 7 },
    { name: 'Momo',   score: 400,   img: 30 },
    { name: 'Lily',   score: 650,   img: 53 },
    { name: 'Nana',   score: 950,   img: 76 },
    { name: 'Poppy',  score: 1300,  img: 99 },
    { name: 'Kiki',   score: 1700,  img: 122 },
    { name: 'Luna',   score: 2100,  img: 145 },
    { name: 'Daisy',  score: 2600,  img: 168 },
    { name: 'Ruby',   score: 3200,  img: 191 },
    { name: 'Yuki',   score: 3900,  img: 214 },
    { name: 'Bella',  score: 4700,  img: 237 },
    { name: 'Sunny',  score: 5600,  img: 260 },
    { name: 'Mimi',   score: 6600,  img: 283 },
    { name: 'Ivy',    score: 7700,  img: 306 },
    { name: 'Pearl',  score: 9000,  img: 329 },
    { name: 'Stella', score: 10500, img: 352 },
    { name: 'Nova',   score: 12000, img: 375 },
    { name: 'Aria',   score: 14000, img: 398 },
    { name: 'Cloud',  score: 16500, img: 421 },
    { name: 'Aurora', score: 20000, img: 444 },
  ];

  /** 这个分数打败了几个天使（= 榜上进度） */
  const beatenCount = score => LADDER.filter(g => score > g.score).length;

  /** 下一个要追的天使（都超完 = null） */
  const nextTarget = score => LADDER.find(g => score <= g.score) || null;

  /** 这一步新超过了哪些（from 分涨到 to 分）——局中弹提示用 */
  const crossed = (from, to) => LADDER.filter(g => from <= g.score && to > g.score);

  const API = { LADDER, beatenCount, nextTarget, crossed };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Ghosts = API;
})(typeof self !== 'undefined' ? self : this);
