// ════════════════════════════════════════
// constants.js — v2.1: mechanics aligned 1:1 with the original's published
// source (design data only; all code/art/names here are our own, cute theme).
// Numbers = sum of adjacent monsterLevel>0 actors (undefeated OR uncollected).
// ════════════════════════════════════════

let BOARD_W = 13, BOARD_H = 10;
const START_HP = 6;
const MAX_HP = 19;

// xpNeed(level) lookup — index = current level (manual level-up button).
// Even NEW levels grow only half a heart; odd ones add a full heart.
const XP_TABLE = [0, 4, 5, 7, 9, 9, 10, 12, 12, 12, 15, 18, 21, 21, 25];

// Entities. lv = monsterLevel (damage AND number contribution); xp = pickup reward.
// Special ids the logic switches on: dragon/wizard/mouseking/mineking/giant/
// gargoyle/gazer/gnome/mimic/mine/egg — everything else is plain.
const MONSTERS = {
  mousey:   { lv: 1,  xp: 1,  icon: '🐭', count: 13 },
  flitter:  { lv: 2,  xp: 2,  icon: '🦇', count: 12 },
  rattle:   { lv: 3,  xp: 3,  icon: '🦴', count: 10 },
  cuddle:   { lv: 4,  xp: 4,  icon: '🐨', count: 8, pairs: 4 },   // named twins, face each other
  pudding:  { lv: 5,  xp: 5,  icon: '🍮', count: 8 },             // sage's drop reveals them
  gazer:    { lv: 5,  xp: 5,  icon: '👁️', count: 2 },             // radius-2 fog of ?
  mouseking:{ lv: 5,  xp: 5,  icon: '👑', count: 1 },             // drop: reveal all mousies
  moobo:    { lv: 6,  xp: 6,  icon: '🐮', count: 5 },             // placed beside a chest, faces it
  guard:    { lv: 7,  xp: 7,  icon: '🛡️', count: 4 },             // one per quadrant
  jelly:    { lv: 8,  xp: 8,  icon: '🫧', count: 5 },             // huddle around the sage
  giant:    { lv: 9,  xp: 9,  icon: '🗿', count: 2 },             // romeo+juliet, symmetric same row; drop: medikit
  mineking: { lv: 10, xp: 10, icon: '🎩', count: 1 },             // drop: disarm-all scroll
  mimic:    { lv: 11, xp: 11, icon: '🎁', count: 1 },             // poses as a chest until poked / until you lose
  dragon:   { lv: 13, xp: 13, icon: '🐉', count: 1 },             // revealed at start near (6,4); drop: crown
  sage:     { lv: 1,  xp: 1,  icon: '🧙', count: 1 },             // edge non-corner; drop: reveal all puddings
  boomy:    { lv: 100, xp: 3, icon: '💣', count: 9, mine: true }, // level 100 poisons numbers; disarm sets 0
  gnome:    { lv: 0,  xp: 9,  icon: '🍄', count: 1 },             // hops toward nearest medikit until cornered
  egg:      { lv: 0,  xp: 3,  icon: '🥚', count: 1 },             // dragon's egg: breakable, but keeping it = badge
};

// Non-monster board items
const ITEMS = {
  wall:     { icon: '🧱', count: 6, hp: 3 },  // dig costs 1 HP per hit (blocked at hp 1); holds +1xp treasure
  chest:    { icon: '🎀', count: 3 },          // opens to +5xp treasure
  medichest:{ icon: '🎀', count: 2 },          // chest that opens to a medikit
  medikit:  { icon: '💊', count: 5 },          // click: full heal (wasted at full HP)
  orb:      { icon: '🔮', count: 1 },          // revealed at start; click: reveal radius <1.5? (ORB_RADIUS) area
  spellorb: { icon: '✨', count: 1 },          // click: reveal a 3x3 preferring a spot beside a hidden mine
};
const ORB_RADIUS = 1.5;
const TREASURE_WALL_XP = 1;
const TREASURE_CHEST_XP = 5;

// win badges (stamps) — per run, all-time set persisted
const BADGES = ['clear', 'lovers', 'egg', 'pacifist'];
