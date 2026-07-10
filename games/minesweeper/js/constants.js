// ════════════════════════════════════════
// constants.js — numeric/structural config only.
// All user-facing text lives in locales/ and is injected via I18N (render layer).
// ════════════════════════════════════════

// Monsters: number on a tile = SUM of adjacent alive monsters' power.
// phantom: excluded from numbers (the ghost rule — one reasoning twist per monster).
// Every monster = one twist of a reasoning rule (the Dragonsweeper principle):
//   bat: hops away the first time you reveal it (you never catch it where you thought)
//   mimic: doesn't hurt you — it steals half your gold and gives no XP (punishes greed)
//   ghost: excluded from numbers (a 0 can be lying)
//   boom: killing it also kills all adjacent monsters, but those give no rewards
//   statue: hits hard but pays double souls
const MONSTERS = {
  slime:  { power: 1, icon: '🟢' },
  bat:    { power: 2, icon: '🦇', hops: true },
  boom:   { power: 2, icon: '💥', explodes: true },
  skel:   { power: 3, icon: '💀' },
  mimic:  { power: 4, icon: '🎁', steals: true },
  ghost:  { power: 5, icon: '👻', phantom: true },
  statue: { power: 6, icon: '🗿', soulRich: true },
  // boss power must stay below what a full-clear run can reach in maxHp
  // (full clear ≈ level 4-5 → 8-9 maxHp, +2 with 'tough'): 8 = winnable but tense.
  dragon: { power: 8, icon: '🐉', boss: true },
};

// Floor layouts. counts = how many of each monster to place; shops = shop tiles.
const FLOORS = [
  { size: 6,  counts: { slime: 4, bat: 2 },                                                    coins: 4, potions: 1, shops: 0 },
  { size: 8,  counts: { slime: 5, bat: 3, skel: 3, ghost: 1, boom: 1 },                        coins: 6, potions: 2, shops: 1 },
  { size: 10, counts: { slime: 5, bat: 4, skel: 4, ghost: 2, mimic: 2, boom: 1, statue: 1, dragon: 1 }, coins: 8, potions: 2, shops: 1 },
];

// Active items, bought at shop tiles with gold. target: arm → tap a cell.
const ITEMS = [
  { id: 'probe',  cost: 6,  icon: '🔎', target: true },  // peek one unrevealed cell
  { id: 'heal',   cost: 8,  icon: '🧪', target: false }, // +3 HP instantly
  { id: 'scan',   cost: 10, icon: '📡', target: true },  // peek a 3×3 area
  { id: 'shield', cost: 12, icon: '🛡️', target: false }, // block the next damage completely
  { id: 'bomb',   cost: 15, icon: '🧨', target: true },  // clear a 3×3: monsters die, no rewards; bosses immune
];
const ITEM_SLOTS = 3;
const HEAL_ITEM_HP = 3;

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

// Permanent upgrades bought with souls (meta currency, survives death).
// req: node that must be owned first. Effects applied in logic via G.perks.
const UPGRADES = [
  { id: 'vital1',  cost: 15, icon: '❤️' },              // +1 starting max HP
  { id: 'coin',    cost: 25, icon: '🪙' },              // coin tiles give +1 gold
  { id: 'potion',  cost: 25, icon: '🧪' },              // potions heal +1
  { id: 'guard',   cost: 30, icon: '🛡️' },              // first hit each run does -1 damage
  { id: 'vital2',  cost: 40, icon: '💖', req: 'vital1' }, // +1 more starting max HP
  { id: 'learner', cost: 60, icon: '📖' },              // level-ups need 1 less XP per level
  { id: 'revive',  cost: 80, icon: '🕯️' },              // once per run: survive death at half HP
];

// Daily challenge: one dense floor, seeded by the date — same board worldwide.
const DAILY_FLOOR = { size: 10, counts: { slime: 6, bat: 5, skel: 4, ghost: 2, mimic: 2, boom: 1, statue: 1 }, coins: 8, potions: 2, shops: 1 };

// XP needed to reach the next level = level * XP_PER_LEVEL.
const XP_PER_LEVEL = 6;
const START_HP = 5;
const POTION_HEAL = 2;
const COIN_GOLD = 2;
const REGEN_EVERY = 12; // reveals per +1 HP with 'regen'
