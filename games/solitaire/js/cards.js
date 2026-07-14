// ════════════════════════════════════════
// cards.js — 牌的表示。整副牌就是 0..51 的整数（存档/move list/网络传输都便宜）。
//
//   id = rank * 4 + suit
//   suit: 0=♠ 1=♥ 2=♣ 3=♦      （黑=♠♣ 偶数，红=♥♦ 奇数）
//   rank: 0=A, 1=2, ..., 12=K   （内部 0-based；显示时 +1）
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const SUITS = ['S', 'H', 'C', 'D'];          // ♠ ♥ ♣ ♦
  const SUIT_SYM = ['♠', '♥', '♣', '♦'];
  const RANK_STR = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const suitOf = id => id & 3;
  const rankOf = id => id >> 2;
  /** 红=1，黑=0。♠(0)/♣(2) 黑，♥(1)/♦(3) 红 ⇒ 奇数为红 */
  const isRed = id => (id & 1) === 1;
  const sameColor = (a, b) => isRed(a) === isRed(b);

  const str = id => RANK_STR[rankOf(id)] + SUIT_SYM[suitOf(id)];

  /** 全新一副（未洗）*/
  const freshDeck = () => Array.from({ length: 52 }, (_, i) => i);

  const API = { SUITS, SUIT_SYM, RANK_STR, suitOf, rankOf, isRed, sameColor, str, freshDeck };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Cards = API;
})(typeof self !== 'undefined' ? self : this);
