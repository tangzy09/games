// ════════════════════════════════════════
// logic.js — v2 single-board core. No DOM, node-testable.
// One board, one life: HP may hit exactly 0 and live; below 0 = death.
// Kill → xp = monster level; level up = full heal + maxHp+1 (overflow rolls).
// Cell: { t:'empty'|'chest'|'heartscroll', mon:null|id, rev, dead, peek,
//         mimicPoked, fogged (peeper '?'), pairWith, ringOf }
// ════════════════════════════════════════

const G = {
  phase: 'HOME', // HOME | PLAYING | WIN | LOSE
  mode: 'normal', // normal | daily
  w: 0, h: 0, grid: [],
  hp: 0, maxHp: 0, xp: 0, level: 1,
  orbs: 0, sweepDone: false,
  revealCount: 0, encounters: [], pendingFloat: null,
  rng: Math.random,
};

function idx(r, c) { return r * G.w + c; }
function rc(i) { return [Math.floor(i / G.w), i % G.w]; }
function inB(r, c) { return r >= 0 && c >= 0 && r < G.h && c < G.w; }
function neighbors(i) {
  const [r, c] = rc(i), out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    if (inB(r + dr, c + dc)) out.push(idx(r + dr, c + dc));
  }
  return out;
}

function xpNeed() { return G.level * XP_PER_LEVEL; }

// number for a revealed cell; null means the peeper fogs it into '?'
function cellNumber(i) {
  if (G.grid[i].fogged) return null;
  let sum = 0;
  for (const n of neighbors(i)) {
    const c = G.grid[n];
    if (c.mon && !c.dead) sum += MONSTERS[c.mon].lv;
  }
  return sum;
}

// ── board generation: positional ecology is the whole point ──
function genBoard() {
  const N = BOARD_W * BOARD_H;
  G.w = BOARD_W; G.h = BOARD_H;
  G.grid = Array.from({ length: N }, () => ({
    t: 'empty', mon: null, rev: false, dead: false, peek: false,
    mimicPoked: false, fogged: false,
  }));
  const taken = new Set();
  const take = (i) => { taken.add(i); return i; };
  const freeCells = () => G.grid.map((_, i) => i).filter(i => !taken.has(i));
  const rand = (arr) => arr[Math.floor(G.rng() * arr.length)];

  // dragon dead-center
  const center = idx(Math.floor(G.h / 2), Math.floor(G.w / 2));
  G.grid[take(center)].mon = 'dragon';
  // nightowl in a random corner
  const corners = [idx(0, 0), idx(0, G.w - 1), idx(G.h - 1, 0), idx(G.h - 1, G.w - 1)];
  G.grid[take(rand(corners))].mon = 'nightowl';
  // sage on an edge (non-corner), jellykings ring it
  const edges = [];
  for (let c = 1; c < G.w - 1; c++) edges.push(idx(0, c), idx(G.h - 1, c));
  for (let r = 1; r < G.h - 1; r++) edges.push(idx(r, 0), idx(r, G.w - 1));
  const sageAt = rand(edges.filter(i => !taken.has(i)));
  G.grid[take(sageAt)].mon = 'sage';
  const jellySpots = neighbors(sageAt).filter(i => !taken.has(i));
  for (let k = 0; k < MONSTERS.jellyking.count && jellySpots.length; k++)
    G.grid[take(jellySpots.splice(Math.floor(G.rng() * jellySpots.length), 1)[0])].mon = 'jellyking';
  // mouse king + mousies ring
  const kingAt = rand(freeCells().filter(i => neighbors(i).filter(n => !taken.has(n)).length >= 4));
  G.grid[take(kingAt)].mon = 'mouseking';
  const mSpots = neighbors(kingAt).filter(i => !taken.has(i));
  for (let k = 0; k < MONSTERS.mousey.count && mSpots.length; k++)
    G.grid[take(mSpots.splice(Math.floor(G.rng() * mSpots.length), 1)[0])].mon = 'mousey';
  // cuddle couples: adjacent pairs
  for (let p = 0; p < MONSTERS.cuddle.count / 2; p++) {
    const a = rand(freeCells().filter(i => neighbors(i).some(n => !taken.has(n))));
    const b = rand(neighbors(a).filter(n => !taken.has(n)));
    G.grid[take(a)].mon = 'cuddle'; G.grid[take(b)].mon = 'cuddle';
    G.grid[a].pairWith = b; G.grid[b].pairWith = a;
  }
  // everything else scattered
  const scatter = (mid, n) => { for (let k = 0; k < n; k++) { const f = freeCells(); if (!f.length) return; G.grid[take(rand(f))].mon = mid; } };
  scatter('peeper', MONSTERS.peeper.count);
  scatter('boom', MONSTERS.boom.count);
  scatter('mimic', MONSTERS.mimic.count);
  scatter('gnome', MONSTERS.gnome.count);
  scatter('moobo', MONSTERS.moobo.count);
  scatter('noodle', MONSTERS.noodle.count);
  scatter('pudding', MONSTERS.pudding.count);
  scatter('chick', MONSTERS.chick.count);
  scatter('snail', MONSTERS.snail.count);
  for (const [t, n] of Object.entries(ITEMS_ON_BOARD))
    for (let k = 0; k < n; k++) { const f = freeCells(); if (!f.length) break; G.grid[take(rand(f))].t = t; }
  // peeper fog: star pattern of '?' numbers
  G.grid.forEach((cell, i) => {
    if (cell.mon !== 'peeper') return;
    const [r, c] = rc(i);
    for (const [dr, dc] of PEEPER_STAR) if (inB(r + dr, c + dc)) G.grid[idx(r + dr, c + dc)].fogged = true;
  });
  // opening: reveal one safe cell far from the dragon (numbers do the rest)
  const safe = freeCells().filter(i => cellNumber(i) !== null);
  reveal(safe.length ? rand(safe) : freeCells()[0]);
}

function initRun() {
  G.mode = 'normal';
  G.hp = START_HP; G.maxHp = START_HP;
  G.xp = 0; G.level = 1;
  G.orbs = START_ORBS; G.sweepDone = false;
  G.revealCount = 0; G.encounters = [];
  genBoard();
  G.phase = 'PLAYING';
}

function initDaily(rng) { G.rng = rng; initRun(); G.mode = 'daily'; }

function heal(n) { G.hp = Math.min(G.maxHp, G.hp + n); }
function fullHeal() { G.hp = G.maxHp; }

function gainXp(n) {
  G.xp += n;
  while (G.xp >= xpNeed()) {
    G.xp -= xpNeed();
    G.level++;
    if (G.maxHp < MAX_LEVEL_HP) G.maxHp++;
    fullHeal();
    G.pendingFloat = { key: 'float.levelUp', params: { n: G.level } };
  }
}

// ── reveal / flood (0-cells ripple; fogged '?' never auto-ripples) ──
function reveal(i) {
  const cell = G.grid[i];
  if (cell.rev) return;
  cell.rev = true;
  G.revealCount++;
  if (cell.mon && !cell.dead) return; // monster shown; fighting is a separate tap
  collect(i);
  if (cell.t === 'empty' && cellNumber(i) === 0)
    for (const n of neighbors(i)) if (!G.grid[n].rev && !G.grid[n].mon) reveal(n);
}
function expandZeros() {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < G.grid.length; i++) {
      const c = G.grid[i];
      if (!c.rev || c.t !== 'empty' || (c.mon && !c.dead)) continue;
      if (cellNumber(i) !== 0) continue;
      for (const n of neighbors(i)) if (!G.grid[n].rev && !G.grid[n].mon) { reveal(n); changed = true; }
    }
  }
}

function collect(i) {
  const cell = G.grid[i];
  if (cell.t === 'chest') { cell.t = 'empty'; gainXp(CHEST_XP); G.pendingFloat = G.pendingFloat || { key: 'float.chest', params: { n: CHEST_XP } }; }
  else if (cell.t === 'heartscroll') { cell.t = 'empty'; fullHeal(); G.pendingFloat = { key: 'float.fullHeal' }; }
}

// ── the tap: reveal hidden, fight revealed-alive ──
function clickCell(i) {
  const cell = G.grid[i];
  if (!cell.rev) { reveal(i); return; }
  if (!cell.mon || cell.dead) { collect(i); return; }
  const M = MONSTERS[cell.mon];
  // gnome: hops to a hidden empty cell until none remain
  if (M.teleports) {
    const spots = G.grid.map((c, k) => k).filter(k => !G.grid[k].rev && !G.grid[k].mon && G.grid[k].t === 'empty' && k !== i);
    if (spots.length) {
      const to = spots[Math.floor(G.rng() * spots.length)];
      G.grid[to].mon = 'gnome'; cell.mon = null;
      G.encounters.push('gnome');
      G.pendingFloat = { key: 'float.gnomeHop' };
      expandZeros();
      return;
    }
    cell.dead = true; gainXp(M.bounty); G.encounters.push('gnome');
    G.pendingFloat = { key: 'float.gnomeCaught', params: { n: M.bounty } };
    expandZeros();
    return;
  }
  // mimic: first poke opens the "chest"
  if (M.disguise && !cell.mimicPoked) { cell.mimicPoked = true; G.encounters.push('mimic'); G.pendingFloat = { key: 'float.mimicWake' }; return; }
  // mines can't be fought until the sweep scroll
  if (M.mine && !G.sweepDone) { G.pendingFloat = { key: 'float.mineLocked' }; return; }
  fight(i);
}

function fight(i) {
  const cell = G.grid[i];
  const M = MONSTERS[cell.mon];
  G.encounters.push(cell.mon);
  G.hp -= M.lv;
  if (G.hp < 0) { G.hp = 0; cell.dead = true; G.phase = 'LOSE'; return; } // exactly 0 lives!
  cell.dead = true;
  gainXp(M.lv);
  if (M.drop === 'sweep') { // nightowl: defuse every mine
    G.sweepDone = true;
    G.grid.forEach(c => { if (c.mon && MONSTERS[c.mon].mine) { c.dead = true; c.rev = true; } });
    G.pendingFloat = { key: 'float.sweep' };
  } else if (M.drop === 'squeak') {
    G.grid.forEach(c => { if (c.mon === 'mousey' && !c.dead) c.peek = true; });
    G.pendingFloat = { key: 'float.squeak' };
  } else if (M.drop === 'jelly') {
    G.grid.forEach(c => { if ((c.mon === 'pudding' || c.mon === 'jellyking') && !c.dead) c.peek = true; });
    G.pendingFloat = { key: 'float.jelly' };
  }
  if (M.fog) { // dead peeper lifts its fog
    const [r, c0] = rc(i);
    for (const [dr, dc] of PEEPER_STAR) if (inB(r + dr, c0 + dc)) {
      const k = idx(r + dr, c0 + dc);
      G.grid[k].fogged = G.grid.some((cc, j) => cc.mon === 'peeper' && !cc.dead && j !== i &&
        PEEPER_STAR.some(([a, b]) => { const [rr, cc2] = rc(j); return rr + a === Math.floor(k / G.w) && cc2 + b === k % G.w; }));
    }
  }
  if (M.boss) { G.phase = 'WIN'; return; }
  expandZeros();
}

// orb item: reveal a 3×3 peek (true reveal, safe — monsters shown, not fought)
function useOrb(i) {
  if (G.orbs <= 0) return;
  G.orbs--;
  const [r, c] = rc(i);
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!inB(r + dr, c + dc)) continue;
    const k = idx(r + dr, c + dc);
    if (!G.grid[k].rev) { G.grid[k].rev = true; G.revealCount++; collect(k); }
  }
  expandZeros();
}

if (typeof module !== 'undefined') {
  module.exports = { G, idx, neighbors, cellNumber, genBoard, initRun, initDaily,
    reveal, clickCell, fight, useOrb, gainXp, xpNeed, expandZeros };
}
