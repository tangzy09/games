// ════════════════════════════════════════
// constants.js — v2 single-board (Dragonsweeper-style), cute theme.
// Numbers = sum of adjacent alive monster levels. Gold IS xp (one currency).
// All names/art original; emoji are placeholders for the cute art pass.
// ════════════════════════════════════════

const BOARD_W = 13, BOARD_H = 10;
const START_HP = 5;
const MAX_LEVEL_HP = 15; // hp cap via level-ups

// placement: center (dragon), corner (nightowl), edge (sage), ring (around another), pair (adjacent couple)
const MONSTERS = {
  chick:    { lv: 1, icon: '🐣', count: 8 },
  snail:    { lv: 1, icon: '🐌', count: 6 },
  mousey:   { lv: 1, icon: '🐭', count: 4, ring: 'mouseking' },   // orbit the mouse king
  cuddle:   { lv: 2, icon: '🐨', count: 4, pair: true },          // always adjacent couples
  pudding:  { lv: 2, icon: '🍮', count: 5, tribe: true },         // sage's drop reveals them all
  mimic:    { lv: 2, icon: '🎁', count: 2, disguise: true },      // looks like a chest until poked twice
  noodle:   { lv: 3, icon: '🐍', count: 4 },
  moobo:    { lv: 4, icon: '🐮', count: 3 },
  jellyking:{ lv: 5, icon: '🫧', count: 5, ring: 'sage' },        // cluster around the sage
  nightowl: { lv: 6, icon: '🦉', count: 1, corner: true, drop: 'sweep' }, // corner; drops mine-sweep scroll
  mouseking:{ lv: 7, icon: '👑', count: 1, drop: 'squeak' },      // drop reveals all mousies
  peeper:   { lv: 8, icon: '👁️', count: 2, fog: true },           // 12-tile star turns numbers into ?
  sage:     { lv: 9, icon: '🧙', count: 1, edge: true, drop: 'jelly' }, // edge non-corner; drop reveals puddings
  boom:     { lv: 5, icon: '💣', count: 4, mine: true },          // unkillable until sweep scroll
  gnome:    { lv: 0, icon: '🍄', count: 1, teleports: true, bounty: 10 }, // hops away until cornered; big xp
  dragon:   { lv: 13, icon: '🐉', count: 1, center: true, boss: true },
};

// board items (t field)
const ITEMS_ON_BOARD = { chest: 6, heartscroll: 2 }; // chest = +xp jackpot; heartscroll = full heal
const CHEST_XP = 5;
const START_ORBS = 2;   // reveal-3x3 orbs in the item bar at start
const XP_PER_LEVEL = 6; // xp needed = level * XP_PER_LEVEL, overflow rolls over

// peeper star pattern: 12 cells (relative) whose numbers read as "?"
const PEEPER_STAR = [
  [-2, 0], [2, 0], [0, -2], [0, 2],
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];
