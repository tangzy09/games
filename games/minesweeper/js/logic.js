// ════════════════════════════════════════
// logic.js — pure game logic. No DOM, no I18N: node-testable.
// Single mutable state object G; every function mutates G in place.
// Grid cell: { t: 'empty'|'coin'|'potion'|'stairs', mon: <id>|null, rev: false, dead: false }
// Cell index = r * G.size + c.
// ════════════════════════════════════════

const G = {
  phase: 'HOME',   // HOME | LEVEL_INTRO | PLAYING | PICK_RELIC | WIN | LOSE
  floorIdx: 0, size: 0, grid: [],
  hp: 0, maxHp: 0, xp: 0, level: 1, gold: 0,
  souls: 0,        // meta currency earned THIS run (death keeps it; persisted by main.js)
  relics: [], relicChoices: [],
  revealCount: 0, regenCounter: 0,
  pendingFloat: null,
  rng: Math.random, // injectable for tests / daily seeds
};

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
function genFloor(floorIdx) {
  const f = FLOORS[floorIdx];
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
    const g = COIN_GOLD * (hasRelic('greed') ? 2 : 1);
    G.gold += g; G.souls += 1;
    cell.t = 'empty';
    G.pendingFloat = { key: 'float.gold', params: { n: g } };
  } else if (cell.t === 'potion') {
    heal(POTION_HEAL);
    cell.t = 'empty';
    G.pendingFloat = { key: 'float.heal', params: { n: POTION_HEAL } };
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
  const id = cell.mon, p = monPower(id);
  G.hp -= p;
  cell.dead = true;
  if (G.hp <= 0) { G.hp = 0; G.phase = 'LOSE'; return; }
  // rewards: xp + gold + souls scale with true power
  G.xp += p; G.gold += p; G.souls += p;
  if (hasRelic('vamp') && MONSTERS[id].power >= 3) heal(1);
  while (G.xp >= G.level * XP_PER_LEVEL) {
    G.xp -= G.level * XP_PER_LEVEL;
    G.level++; G.maxHp++; G.hp = G.maxHp;
    G.pendingFloat = { key: 'float.levelUp', params: { n: G.level } };
  }
  if (MONSTERS[id].boss) { G.phase = 'WIN'; G.souls += 20; return; }
  expandZeros(); // kill may drop nearby numbers to 0 → ripple open
}

// ── run / floor flow ──
function initRun() {
  G.floorIdx = 0;
  G.hp = START_HP; G.maxHp = START_HP;
  G.xp = 0; G.level = 1; G.gold = 0; G.souls = 0;
  G.relics = []; G.relicChoices = [];
  G.revealCount = 0; G.regenCounter = 0;
  G.phase = 'LEVEL_INTRO';
}

function startFloor() {
  genFloor(G.floorIdx);
  if (G.phase !== 'LOSE' && G.phase !== 'WIN') G.phase = 'PLAYING';
}

// player clicked cell i during PLAYING
function clickCell(i) {
  const cell = G.grid[i];
  if (cell.rev) {
    if (cell.t === 'stairs' && G.floorIdx < FLOORS.length - 1) { offerRelics(); }
    return;
  }
  reveal(i);
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
    initRun, startFloor, offerRelics, pickRelic, monPower, hasRelic };
}
