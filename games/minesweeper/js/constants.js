// ════════════════════════════════════════
// constants.js — numeric/structural config only.
// All user-facing text lives in locales/ and is injected via I18N (render layer).
// ════════════════════════════════════════

// Monsters: number on a tile = SUM of adjacent alive monsters' power.
// phantom: excluded from numbers (the ghost rule — one reasoning twist per monster).
const MONSTERS = {
  slime:  { power: 1,  icon: '🟢' },
  bat:    { power: 2,  icon: '🦇' },
  skel:   { power: 3,  icon: '💀' },
  mimic:  { power: 4,  icon: '🎁', looksLike: 'coin' }, // shows as coin until revealed
  ghost:  { power: 5,  icon: '👻', phantom: true },
  dragon: { power: 13, icon: '🐉', boss: true },
};

// Floor layouts. counts = how many of each monster to place.
const FLOORS = [
  { size: 6,  counts: { slime: 4, bat: 2 },                                        coins: 4, potions: 1 },
  { size: 8,  counts: { slime: 5, bat: 3, skel: 3, ghost: 1 },                     coins: 6, potions: 2 },
  { size: 10, counts: { slime: 5, bat: 4, skel: 4, ghost: 2, mimic: 2, dragon: 1 }, coins: 8, potions: 2 },
];

// Relics: passive run modifiers, picked 1-of-3 between floors.
// Effects are implemented in logic.js (applyRelicOnPick / hooks); keep ids stable.
const RELICS = [
  { id: 'tough',  icon: '🛡️' }, // +2 max HP now and for the run
  { id: 'weaken', icon: '🗡️' }, // all monster power -1 (min 1) for damage AND numbers
  { id: 'regen',  icon: '🌿' }, // every 12 reveals: +1 HP
  { id: 'greed',  icon: '💰' }, // coins give double gold
  { id: 'scout',  icon: '🔭' }, // each floor starts with an extra safe 3x3 revealed
  { id: 'vamp',   icon: '🩸' }, // killing a monster of power>=3 heals 1
];

// XP needed to reach the next level = level * XP_PER_LEVEL.
const XP_PER_LEVEL = 6;
const START_HP = 5;
const POTION_HEAL = 2;
const COIN_GOLD = 2;
const REGEN_EVERY = 12; // reveals per +1 HP with 'regen'
