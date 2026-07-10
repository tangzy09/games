// ════════════════════════════════════════
// logic.js — pure game logic. No DOM, no I18N: node-testable.
// Single mutable state object G; every function mutates G in place.
// Grid cell: { t: 'empty'|'coin'|'potion'|'stairs', mon: <id>|null, rev: false, dead: false }
// Cell index = r * G.size + c.
// ════════════════════════════════════════

const G = {
  phase: 'HOME',   // HOME | LEVEL_INTRO | PLAYING | PICK_RELIC | WIN | LOSE
  mode: 'normal',  // normal | daily
  floorIdx: 0, size: 0, grid: [],
  hp: 0, maxHp: 0, xp: 0, level: 1, gold: 0,
  souls: 0,        // meta currency earned THIS run (death keeps it; persisted by main.js)
  relics: [], relicChoices: [],
  revealCount: 0, regenCounter: 0,
  perks: {},       // owned permanent upgrades, set by main.js before initRun
  revived: false, guardUsed: false,
  items: [],       // active item ids in slots (max ITEM_SLOTS)
  itemMode: null,  // { id, slot } while a targeted item is armed
  shieldUp: false, // next damage fully blocked
  shopAt: null,    // grid index of the shop being browsed (phase SHOP)
  encounters: [],  // monster ids met this dispatch — main.js merges into the codex
  pendingFloat: null,
  rng: Math.random, // injectable for tests / daily seeds
};

// XP required for the next level (learner perk: -1 per level)
function xpNeed() { return G.level * (G.perks.learner ? XP_PER_LEVEL - 1 : XP_PER_LEVEL); }

// ── helpers ──
function idx(r, c) { return r * G.size + c; }
function inBounds(r, c) { return r >= 0 && c >= 0 && r < G.size && c < G.size; }
function neighbors(i) {
  const r = Math.floor(i / G.size), c = i % G.size, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    if (inBounds(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
  }
  return out;
}
function hasRelic(id) { return G.relics.includes(id); }
function monPower(id) {
  const base = MONSTERS[id].power;
  return hasRelic('weaken') ? Math.max(1, base - 1) : base;
}

// number shown on a revealed cell = sum of adjacent ALIVE non-phantom monster power
function cellNumber(i) {
  let sum = 0;
  for (const n of neighbors(i)) {
    const cell = G.grid[n];
    if (cell.mon && !cell.dead && !MONSTERS[cell.mon].phantom) sum += monPower(cell.mon);
  }
  return sum;
}

// ── board generation ──
// Accepts a floor index (normal run) or a floor config object (daily).
function genFloor(floorIdx) {
  const f = typeof floorIdx === 'number' ? FLOORS[floorIdx] : floorIdx;
  G.size = f.size;
  const N = f.size * f.size;
  G.grid = Array.from({ length: N }, () => ({ t: 'empty', mon: null, rev: false, dead: false }));

  // safe 3x3 start: pick a center at least 1 from the border
  const m = () => 1 + Math.floor(G.rng() * (f.size - 2));
  const sr = m(), sc = m();
  const safe = new Set([idx(sr, sc), ...neighbors(idx(sr, sc))]);

  // candidate cells for placements
  const free = [];
  for (let i = 0; i < N; i++) if (!safe.has(i)) free.push(i);
  const take = () => free.splice(Math.floor(G.rng() * free.length), 1)[0];

  for (const [mid, count] of Object.entries(f.counts))
    for (let k = 0; k < count; k++) { const i = take(); G.grid[i].mon = mid; }
  for (let k = 0; k < f.coins; k++) G.grid[take()].t = 'coin';
  for (let k = 0; k < f.potions; k++) G.grid[take()].t = 'potion';
  for (let k = 0; k < (f.shops || 0); k++) G.grid[take()].t = 'shop';
  G.grid[take()].t = 'stairs';

  // reveal the safe zone (flood from center picks up the whole 3x3 + beyond if 0s)
  reveal(idx(sr, sc));
  if (hasRelic('scout')) { // extra safe-ish reveal: flood from another monster-free cell
    const spot = free.find(i => !G.grid[i].mon && !G.grid[i].rev);
    if (spot != null) reveal(spot);
  }
}

// ── reveal / flood ──
function reveal(i) {
  const cell = G.grid[i];
  if (cell.rev) return;
  cell.rev = true;
  G.revealCount++;
  if (hasRelic('regen') && ++G.regenCounter >= REGEN_EVERY) {
    G.regenCounter = 0;
    heal(1);
  }
  // bat twist: the first time you flush it out, it hops to another hidden cell
  if (cell.mon && !cell.dead && MONSTERS[cell.mon].hops && !cell.hopTired) {
    const spots = [];
    G.grid.forEach((c2, k) => { if (!c2.rev && !c2.mon && c2.t === 'empty' && k !== i) spots.push(k); });
    if (spots.length) {
      const to = spots[Math.floor(G.rng() * spots.length)];
      G.grid[to].mon = cell.mon;
      G.grid[to].hopTired = true; // a hopped bat stands and fights next time
      cell.mon = null;
      G.encounters.push('bat');
      G.pendingFloat = { key: 'float.batHop' };
      expandZeros(); // numbers near the vacated spot may drop to 0 → ripple
      // fall through: this cell is now a normal empty reveal
    }
  }
  if (cell.mon && !cell.dead) { fight(i); return; }
  collect(i);
  // flood: empty cell with number 0 auto-reveals neighbors
  if (cell.t === 'empty' && !cell.mon && cellNumber(i) === 0) {
    for (const n of neighbors(i)) if (!G.grid[n].rev && !G.grid[n].mon) reveal(n);
  }
}

function collect(i) {
  const cell = G.grid[i];
  if (cell.t === 'coin') {
    const g = (COIN_GOLD + (G.perks.coin ? 1 : 0)) * (hasRelic('greed') ? 2 : 1);
    G.gold += g; G.souls += 1;
    cell.t = 'empty';
    G.pendingFloat = { key: 'float.gold', params: { n: g } };
  } else if (cell.t === 'potion') {
    const n = POTION_HEAL + (G.perks.potion ? 1 : 0);
    heal(n);
    cell.t = 'empty';
    G.pendingFloat = { key: 'float.heal', params: { n } };
  }
}

function heal(n) { G.hp = Math.min(G.maxHp, G.hp + n); }

// Numbers are dynamic (they drop when monsters die). Whenever a revealed cell's
// number reaches 0, its safe neighbors auto-open — the satisfying "ripple" after
// a kill, and it keeps the invariant "0-cell ⇒ all safe neighbors revealed".
function expandZeros() {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < G.grid.length; i++) {
      const cell = G.grid[i];
      if (!cell.rev || cell.t !== 'empty') continue;
      if (cell.mon && !cell.dead) continue;
      if (cellNumber(i) !== 0) continue;
      for (const n of neighbors(i)) {
        const nb = G.grid[n];
        if (!nb.rev && !nb.mon) { reveal(n); changed = true; }
      }
    }
  }
}

// ── combat ──
function fight(i) {
  const cell = G.grid[i];
  const id = cell.mon, M = MONSTERS[id];
  G.encounters.push(id);

  // mimic twist: no damage — it grabs half your gold and vanishes (no XP either)
  if (M.steals) {
    cell.dead = true;
    const stolen = Math.floor(G.gold / 2);
    G.gold -= stolen;
    G.souls += 2;
    G.pendingFloat = { key: 'float.mimic', params: { n: stolen } };
    expandZeros();
    return;
  }

  let p = monPower(id);
  if (G.shieldUp) { G.shieldUp = false; p = 0; G.pendingFloat = { key: 'float.shieldBlock' }; }
  else if (G.perks.guard && !G.guardUsed) { G.guardUsed = true; p = Math.max(0, p - 1); }
  G.hp -= p;
  cell.dead = true;
  if (G.hp <= 0) {
    if (G.perks.revive && !G.revived) { // once per run: cheat death at half HP
      G.revived = true;
      G.hp = Math.max(1, Math.ceil(G.maxHp / 2));
      G.pendingFloat = { key: 'float.revive' };
    } else { G.hp = 0; G.phase = 'LOSE'; return; }
  }
  // rewards: xp + gold + souls scale with true power (statue pays double souls)
  const reward = M.power;
  G.xp += reward; G.gold += reward; G.souls += reward * (M.soulRich ? 2 : 1);
  if (hasRelic('vamp') && M.power >= 3) heal(1);
  while (G.xp >= xpNeed()) {
    G.xp -= xpNeed();
    G.level++; G.maxHp++; G.hp = G.maxHp;
    G.pendingFloat = { key: 'float.levelUp', params: { n: G.level } };
  }
  if (M.boss) { G.phase = 'WIN'; G.souls += 20; return; }
  // boom twist: adjacent monsters die in the blast — no rewards for them
  if (M.explodes) {
    for (const n of neighbors(i)) {
      const nb = G.grid[n];
      if (nb.mon && !nb.dead && !MONSTERS[nb.mon].boss) { nb.dead = true; nb.rev = true; }
    }
    G.pendingFloat = { key: 'float.boom' };
  }
  expandZeros(); // kills may drop nearby numbers to 0 → ripple open
}

// ── run / floor flow ──
function initRun() {
  G.mode = 'normal';
  G.floorIdx = 0;
  const bonus = (G.perks.vital1 ? 1 : 0) + (G.perks.vital2 ? 1 : 0);
  G.hp = START_HP + bonus; G.maxHp = START_HP + bonus;
  G.xp = 0; G.level = 1; G.gold = 0; G.souls = 0;
  G.relics = []; G.relicChoices = [];
  G.revealCount = 0; G.regenCounter = 0;
  G.revived = false; G.guardUsed = false;
  G.items = []; G.itemMode = null; G.shieldUp = false; G.shopAt = null;
  G.encounters = [];
  G.phase = 'LEVEL_INTRO';
}

// Daily challenge: same init but seeded rng + single dense floor.
function initDaily(rng) {
  initRun();
  G.mode = 'daily';
  G.rng = rng;
}

function startFloor() {
  genFloor(G.mode === 'daily' ? DAILY_FLOOR : G.floorIdx);
  if (G.phase !== 'LOSE' && G.phase !== 'WIN') G.phase = 'PLAYING';
}

// player clicked cell i during PLAYING
function clickCell(i) {
  if (G.itemMode) { applyItemAt(i); return; }
  const cell = G.grid[i];
  if (cell.rev) {
    if (cell.t === 'stairs') {
      if (G.mode === 'daily') { G.phase = 'WIN'; G.souls += 10; } // daily goal: reach the stairs
      else if (G.floorIdx < FLOORS.length - 1) offerRelics();
    } else if (cell.t === 'shop') {
      openShop(i);
    }
    return;
  }
  reveal(i);
}

// ── shop ──
function openShop(i) {
  const cell = G.grid[i];
  if (!cell.shopStock) { // fixed stock per shop: 3 distinct random items
    const pool = ITEMS.slice(), stock = [];
    while (stock.length < 3 && pool.length)
      stock.push(pool.splice(Math.floor(G.rng() * pool.length), 1)[0].id);
    cell.shopStock = stock;
  }
  G.shopAt = i;
  G.phase = 'SHOP';
}

function buyShopItem(itemId) {
  const it = ITEMS.find(x => x.id === itemId);
  const stock = G.shopAt != null && G.grid[G.shopAt].shopStock;
  if (!it || !stock || !stock.includes(itemId)) return;
  if (G.gold < it.cost || G.items.length >= ITEM_SLOTS) return;
  G.gold -= it.cost;
  G.items.push(itemId);
  stock.splice(stock.indexOf(itemId), 1);
}

function leaveShop() { G.shopAt = null; G.phase = 'PLAYING'; }

// ── active items ──
function peek(i) { const c = G.grid[i]; if (c && !c.rev) c.peek = true; }

function useItem(slot) {
  const id = G.items[slot];
  if (!id || G.phase !== 'PLAYING') return;
  if (G.itemMode && G.itemMode.slot === slot) { G.itemMode = null; return; } // tap again = cancel
  const it = ITEMS.find(x => x.id === id);
  if (it.target) { G.itemMode = { id, slot }; return; } // armed: next board tap applies
  if (id === 'heal') { heal(HEAL_ITEM_HP); G.pendingFloat = { key: 'float.heal', params: { n: HEAL_ITEM_HP } }; }
  else if (id === 'shield') { G.shieldUp = true; G.pendingFloat = { key: 'float.shieldUp' }; }
  G.items.splice(slot, 1);
}

function applyItemAt(i) {
  const { id, slot } = G.itemMode;
  G.itemMode = null;
  if (id === 'probe') peek(i);
  else if (id === 'scan') { peek(i); for (const n of neighbors(i)) peek(n); }
  else if (id === 'bomb') {
    for (const k of [i, ...neighbors(i)]) {
      const c = G.grid[k];
      if (c.mon && !c.dead) {
        if (MONSTERS[c.mon].boss) continue; // bosses shrug off bombs, cell stays hidden
        c.dead = true;
        G.encounters.push(c.mon);
      }
      if (!c.rev && !(c.mon && !c.dead)) reveal(k); // safe now: monster is dead
    }
    G.pendingFloat = { key: 'float.bombUsed' };
    expandZeros();
  }
  G.items.splice(slot, 1);
}

function offerRelics() {
  const pool = RELICS.filter(r => !hasRelic(r.id));
  G.relicChoices = [];
  const tmp = pool.slice();
  while (G.relicChoices.length < 3 && tmp.length)
    G.relicChoices.push(tmp.splice(Math.floor(G.rng() * tmp.length), 1)[0]);
  G.phase = 'PICK_RELIC';
}

function pickRelic(id) { // id === null → skip
  if (id) {
    G.relics.push(id);
    if (id === 'tough') { G.maxHp += 2; G.hp += 2; }
  }
  G.relicChoices = [];
  G.floorIdx++;
  G.souls += 3; // floor-clear meta reward
  G.phase = 'LEVEL_INTRO';
}

// node export for tests (browser: plain globals)
if (typeof module !== 'undefined') {
  module.exports = { G, idx, neighbors, cellNumber, genFloor, reveal, clickCell, fight,
    initRun, initDaily, startFloor, offerRelics, pickRelic, monPower, hasRelic, xpNeed,
    openShop, buyShopItem, leaveShop, useItem, applyItemAt, peek };
}
