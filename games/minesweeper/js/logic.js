// ════════════════════════════════════════
// logic.js — v2.1 core, mechanics 1:1 with the original's published source.
// Cell: { mon, item, lv, xp, rev, defeated, name, wallHP, mimicHidden, treasureXp, spell }
//   lv feeds numbers (kept until the corpse is COLLECTED, not when killed)
// Player: click monster = immediate attack; kill requires hp - lv > 0.
// Level-up is a MANUAL button; even new levels grow only half a heart.
// ════════════════════════════════════════

const G = {
  phase: 'HOME', // HOME | PLAYING | WIN | LOSE
  mode: 'normal',
  w: 0, h: 0, grid: [],
  hp: 0, maxHp: 0, halfHeart: false, xp: 0, level: 1,
  killedMice: 0, minesDisarmed: false,
  badgesThisRun: [],
  revealCount: 0, encounters: [], pendingFloat: null,
  rng: Math.random,
};

function idx(x, y) { return y * G.w + x; }
function xy(i) { return [i % G.w, Math.floor(i / G.w)]; }
function inB(x, y) { return x >= 0 && y >= 0 && x < G.w && y < G.h; }
function dist(i, j) { const [ax, ay] = xy(i), [bx, by] = xy(j); return Math.hypot(ax - bx, ay - by); }
function neighbors(i) {
  const [x, y] = xy(i), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    if (inB(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
  }
  return out;
}

function xpNeed() { return XP_TABLE[Math.min(G.level, XP_TABLE.length - 1)]; }
function canLevelUp() { return G.hp > 0 && G.xp >= xpNeed() && G.phase === 'PLAYING'; }
function levelUp() { // manual button, faithful: full heal; even new levels = half heart only
  if (!canLevelUp()) return;
  G.xp -= xpNeed();
  G.level++;
  if (G.maxHp < MAX_HP) {
    if (G.level % 2 !== 0) { G.maxHp++; G.halfHeart = false; }
    else G.halfHeart = true;
  }
  G.hp = G.maxHp;
  G.pendingFloat = { key: 'float.levelUp', params: { n: G.level } };
}

// numbers: every actor with lv>0 counts — defeated-but-uncollected corpses too
function cellNumber(i) {
  let s = 0;
  for (const n of neighbors(i)) if (G.grid[n].lv > 0) s += G.grid[n].lv;
  return s;
}
// gazer fog: tiles within distance 2 of a LIVING gazer read as '?'
function isFogged(i) {
  return G.grid.some((c, j) => c.mon === 'gazer' && !c.defeated && dist(i, j) <= 2);
}

function blankCell() {
  return { mon: null, item: null, lv: 0, xp: 0, rev: false, defeated: false,
    name: null, wallHP: 0, mimicHidden: false, treasureXp: 0, spell: null };
}
function isEmptyCell(c) { return !c.mon && !c.item && !c.spell && !c.treasureXp; }

function setMonster(c, id, name) {
  Object.assign(c, blankCell(), { mon: id, lv: MONSTERS[id].lv, xp: MONSTERS[id].xp, name: name || null });
  if (id === 'mimic') c.mimicHidden = true;
}
function setItem(c, id) { Object.assign(c, blankCell(), { item: id, wallHP: id === 'wall' ? ITEMS.wall.hp : 0 }); }

// Direct construction of the happiness optimum: the original hill-climbs a
// deterministic preference function; we place each constrained actor straight
// into a preference-satisfying spot (uniformly random among them), which is
// exactly the set of layouts its optimizer converges to.
function genBoard() {
  G.w = BOARD_W; G.h = BOARD_H;
  G.grid = Array.from({ length: G.w * G.h }, blankCell);
  const rand = (arr) => arr[Math.floor(G.rng() * arr.length)];
  const freeIdx = () => G.grid.map((c, i) => isEmptyCell(c) && !c.rev ? i : -1).filter(i => i >= 0);
  const freeNear = (i, d) => neighbors(i).filter(j => isEmptyCell(G.grid[j]) && dist(i, j) <= d);
  const putMon = (i, id, name) => { setMonster(G.grid[i], id, name); return i; };
  const putItem = (i, id) => { setItem(G.grid[i], id); return i; };

  // dragon at the center; mineking ALWAYS in a corner (original hard rule —
  // its dev build literally asserts "mine king not in corner")
  const dI = putMon(idx(Math.floor(G.w / 2), Math.floor(G.h / 2) - 1), 'dragon'); // (6,4) on 13x10, centered on any board
  const corners = [idx(0, 0), idx(G.w - 1, 0), idx(0, G.h - 1), idx(G.w - 1, G.h - 1)];
  putMon(corners[Math.floor(G.rng() * corners.length)], 'mineking');
  const edges = [];
  for (let x = 1; x < G.w - 1; x++) edges.push(idx(x, 0), idx(x, G.h - 1));
  for (let y = 1; y < G.h - 1; y++) edges.push(idx(0, y), idx(G.w - 1, y));
  // codex promise: FIVE jellies hug the sage → the spot must have ≥5 free neighbors
  const sageSpots = edges.filter(i => isEmptyCell(G.grid[i]) && freeNear(i, 1.5).length >= 5);
  const sI = putMon(rand(sageSpots.length ? sageSpots : edges.filter(i => isEmptyCell(G.grid[i]))), 'sage');
  for (let k = 0; k < 5; k++) { const s = freeNear(sI, 1.5); if (s.length) putMon(rand(s), 'jelly'); }
  // giants: same random row, symmetric about the center column, romeo left / juliet right
  {
    let placed = false;
    while (!placed) {
      const cx0 = Math.floor(G.w / 2);
      const y = Math.floor(G.rng() * G.h), off = 1 + Math.floor(G.rng() * (cx0 - 1));
      const a = idx(cx0 - off, y), b = idx(cx0 + off, y);
      if (isEmptyCell(G.grid[a]) && isEmptyCell(G.grid[b])) {
        putMon(a, 'giant', 'romeo'); putMon(b, 'giant', 'juliet'); placed = true;
      }
    }
  }
  // guards: one per quadrant
  const mx = Math.floor(G.w / 2), my = Math.floor(G.h / 2) - 1;
  const quads = [[0, mx, 0, my], [mx + 1, G.w, 0, my], [mx + 1, G.w, my + 1, G.h], [0, mx, my + 1, G.h]];
  quads.forEach(([x0, x1, y0, y1], q) => {
    const cells = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isEmptyCell(G.grid[idx(x, y)])) cells.push(idx(x, y));
    putMon(rand(cells), 'guard', 'g' + (q + 1));
  });
  putMon(rand(freeNear(dI, 1.5)), 'egg'); // egg tucked beside the dragon
  // chests first, then each moobo beside one; cuddle twins adjacent pairs
  const chestIs = [];
  for (let k = 0; k < ITEMS.chest.count; k++) chestIs.push(putItem(rand(freeIdx()), 'chest'));
  for (let k = 0; k < ITEMS.medichest.count; k++) chestIs.push(putItem(rand(freeIdx()), 'medichest'));
  for (let k = 0; k < 5; k++) { // codex promise: every moobo stands beside a chest
    const withRoom = chestIs.filter(ci => freeNear(ci, 1.5).length > 0);
    const ci = withRoom.length ? rand(withRoom) : rand(chestIs);
    const s = freeNear(ci, 1.5);
    putMon(s.length ? rand(s) : rand(freeIdx()), 'moobo');
  }
  for (let p = 1; p <= MONSTERS.cuddle.pairs; p++) {
    let a;
    do { a = rand(freeIdx()); } while (!freeNear(a, 1.5).length);
    putMon(a, 'cuddle', 'c' + p);
    putMon(rand(freeNear(a, 1.5)), 'cuddle', 'c' + p);
  }
  for (let k = 0; k < MONSTERS.gazer.count; k++) putMon(rand(freeIdx()), 'gazer');
  putMon(rand(freeIdx()), 'mouseking');
  for (let k = 0; k < ITEMS.wall.count; k++) putItem(rand(freeIdx()), 'wall');
  for (let k = 0; k < MONSTERS.boomy.count; k++) putMon(rand(freeIdx()), 'boomy');
  const mediIs = [];
  for (let k = 0; k < ITEMS.medikit.count; k++) mediIs.push(putItem(rand(freeIdx()), 'medikit'));
  // orb: interior, prefers medikits/walls in range, shuns the scary stuff
  {
    const inner = freeIdx().filter(i => { const [x, y] = xy(i); return x >= 2 && y >= 2 && x <= G.w - 3 && y <= G.h - 3; });
    const score = (i) => {
      let s = 0;
      G.grid.forEach((b, j) => {
        if (j === i || dist(i, j) >= ORB_RADIUS + 1) return;
        if (['dragon', 'gazer', 'mouseking', 'mimic', 'jelly', 'egg', 'boomy'].includes(b.mon) || b.item === 'chest') s -= 3;
        if (b.item === 'medikit') s += 2;
        if (b.item === 'wall') s += 1;
      });
      return s;
    };
    const best = inner.slice().sort((a, b) => score(b) - score(a))[0];
    const i = putItem(best != null ? best : rand(freeIdx()), 'orb');
    G.grid[i].rev = true;
  }
  // gnome snuggles a medikit; the rest scatter
  { const s = freeNear(rand(mediIs), 1.5); putMon(s.length ? rand(s) : rand(freeIdx()), 'gnome'); }
  putMon(rand(freeIdx()), 'mimic');
  putItem(rand(freeIdx()), 'spellorb');
  const scatter = (id, n) => { for (let k = 0; k < n; k++) { const f = freeIdx(); if (f.length) putMon(rand(f), id); } };
  scatter('mousey', 13); scatter('flitter', 12); scatter('rattle', 10); scatter('pudding', 8);
  // pair pointers + starting reveals
  G.grid.forEach((c, i) => {
    if (c.mon === 'cuddle') c.pairWith = G.grid.findIndex((b, j) => b.mon === 'cuddle' && b.name === c.name && j !== i);
    if (c.mon === 'moobo') { const t = G.grid.findIndex((b, j) => (b.item === 'chest' || b.item === 'medichest') && dist(i, j) <= 1.5); if (t >= 0) c.pairWith = t; }
    if (c.mon === 'dragon') c.rev = true;
  });
  revealIsolatedMineGroups();
}


function initRun() {
  G.mode = 'normal';
  G.hp = START_HP; G.maxHp = START_HP; G.halfHeart = false;
  G.xp = 0; G.level = 1;
  G.killedMice = 0; G.minesDisarmed = false;
  G.badgesThisRun = [];
  G.revealCount = 0; G.encounters = [];
  genBoard();
  G.phase = 'PLAYING';
}
function initDaily(rng) { G.rng = rng; initRun(); G.mode = 'daily'; }

function grantXp(n) { G.xp += n; } // manual level-up: xp just accumulates

function recursiveReveal(i) {
  const c = G.grid[i];
  if (c.rev) return;
  c.rev = true;
  G.revealCount++;
  if (isEmptyCell(c) && cellNumber(i) === 0)
    for (const n of neighbors(i)) if (!G.grid[n].rev && isEmptyCell(G.grid[n])) recursiveReveal(n);
}
function revealTile(i) { // non-empty tiles reveal singly; empty ones flood
  const c = G.grid[i];
  if (c.rev) return;
  if (isEmptyCell(c)) recursiveReveal(i);
  else { c.rev = true; G.revealCount++; }
}


// faithful QoL rule: a connected pocket of non-empty tiles that is ALL mines
// would be undeducible — such groups auto-reveal themselves.
function revealIsolatedMineGroups() {
  const seen = new Set();
  for (let i = 0; i < G.grid.length; i++) {
    if (seen.has(i) || isEmptyCell(G.grid[i])) continue;
    const group = [], stack = [i];
    seen.add(i);
    while (stack.length) {
      const j = stack.pop();
      group.push(j);
      for (const n of neighbors(j)) {
        if (seen.has(n) || isEmptyCell(G.grid[n])) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    if (group.every(j => G.grid[j].mon === 'boomy'))
      group.forEach(j => { if (!G.grid[j].rev) { G.grid[j].rev = true; G.revealCount++; } });
  }
}

function die() {
  G.hp = 0;
  G.phase = 'LOSE';
  G.grid.forEach(c => { if (c.mon === 'mimic') c.mimicHidden = false; }); // mimics unmask when you fall
}

function winByCrown() {
  G.phase = 'WIN';
  const alive = G.grid.filter(c => (c.mon && !c.defeated && c.mon !== 'dragon') || c.item || c.spell || c.treasureXp).length;
  if (alive === 0) G.badgesThisRun.push('clear');
  if (G.grid.filter(c => c.mon === 'giant' && !c.defeated).length === 2) G.badgesThisRun.push('lovers');
  if (G.grid.some(c => c.mon === 'egg' && !c.defeated)) G.badgesThisRun.push('egg');
  if (G.killedMice === 0) G.badgesThisRun.push('pacifist');
}

function applySpell(kind) {
  if (kind === 'mice') G.grid.forEach(c => { if (c.mon === 'mousey' && !c.defeated) c.rev = true; });
  else if (kind === 'pudding') G.grid.forEach(c => { if (c.mon === 'pudding' && !c.defeated) c.rev = true; });
  else if (kind === 'disarm') {
    G.grid.forEach(c => { if (c.mon === 'boomy') { c.defeated = true; c.lv = 0; } });
    G.minesDisarmed = true;
    G.pendingFloat = { key: 'float.sweep' };
  }
}

// corpse pickup: xp + drop transform (numbers drop NOW, not at kill time)
function collectCorpse(i) {
  const c = G.grid[i], id = c.mon;
  grantXp(c.xp);
  if (id === 'dragon') { Object.assign(c, blankCell(), { spell: 'crown', rev: true }); }
  else if (id === 'mouseking') { Object.assign(c, blankCell(), { spell: 'mice', rev: true }); }
  else if (id === 'sage') { Object.assign(c, blankCell(), { spell: 'pudding', rev: true }); }
  else if (id === 'mineking') { Object.assign(c, blankCell(), { spell: 'disarm', rev: true }); }
  else if (id === 'giant') { setItem(c, 'medikit'); c.rev = true; }
  else { Object.assign(c, blankCell(), { rev: true }); }
  G.pendingFloat = G.pendingFloat || { key: 'float.pickup', params: { n: MONSTERS[id].xp } };
}

function clickCell(i) {
  if (G.phase !== 'PLAYING') return;
  const c = G.grid[i];

  // gnome hops toward the cell nearest to a medikit until it has nowhere to go
  if (c.mon === 'gnome' && !c.defeated) {
    let best = -1, bd = Infinity;
    G.grid.forEach((t, j) => {
      if (!isEmptyCell(t) || t.rev) return;
      G.grid.forEach((m, k) => { if (m.item === 'medikit') { const d = dist(j, k); if (d < bd) { bd = d; best = j; } } });
    });
    if (best >= 0) {
      setMonster(G.grid[best], 'gnome');
      Object.assign(c, blankCell(), { rev: true });
      G.encounters.push('gnome');
      G.pendingFloat = { key: 'float.gnomeHop' };
      return;
    } // cornered: falls through to the fight (lv 0 → instant defeat)
  }

  if (c.spell === 'crown' && c.rev) { winByCrown(); return; }
  if (c.spell && c.rev) { const k = c.spell; Object.assign(c, blankCell(), { rev: true }); applySpell(k); return; }
  if (c.treasureXp && c.rev) { grantXp(c.treasureXp); G.pendingFloat = { key: 'float.chest', params: { n: c.treasureXp } }; Object.assign(c, blankCell(), { rev: true }); return; }

  if (c.item && c.rev) {
    if (c.item === 'wall') {
      if (G.hp <= 1) { G.pendingFloat = { key: 'float.tooWeak' }; return; }
      G.hp -= 1; c.wallHP--;
      if (c.wallHP <= 0) { Object.assign(c, blankCell(), { treasureXp: TREASURE_WALL_XP, rev: true }); G.pendingFloat = { key: 'float.wallDown' }; }
      return;
    }
    if (c.item === 'chest') { Object.assign(c, blankCell(), { treasureXp: TREASURE_CHEST_XP, rev: true }); return; }
    if (c.item === 'medichest') { setItem(c, 'medikit'); c.rev = true; return; }
    if (c.item === 'medikit') {
      if (G.hp < G.maxHp) { G.hp = G.maxHp; G.pendingFloat = { key: 'float.fullHeal' }; }
      else G.pendingFloat = { key: 'float.wasted' };
      Object.assign(c, blankCell(), { rev: true });
      return;
    }
    if (c.item === 'orb') {
      Object.assign(c, blankCell(), { rev: true });
      G.grid.forEach((t, j) => { if (!t.rev && dist(i, j) < ORB_RADIUS + 0.01) revealTile(j); });
      return;
    }
    if (c.item === 'spellorb') {
      Object.assign(c, blankCell(), { rev: true });
      let pick = -1;
      const hidden = G.grid.map((t, j) => !t.rev ? j : -1).filter(j => j >= 0);
      for (const j of hidden) if (G.grid.some((m, k) => m.mon === 'boomy' && !m.rev && dist(j, k) < 1.5)) { pick = j; break; }
      if (pick < 0 && hidden.length) pick = hidden[Math.floor(G.rng() * hidden.length)];
      if (pick >= 0) G.grid.forEach((t, j) => { if (!t.rev && dist(pick, j) < 1.5) revealTile(j); });
      return;
    }
  }

  if (c.mon) {
    if (c.mimicHidden && !c.rev) { revealTile(i); return; } // poses as a chest; the lie is the tell
    if (!c.defeated) {
      if (c.mimicHidden) { c.mimicHidden = false; G.pendingFloat = { key: 'float.mimicWake' }; }
      G.encounters.push(c.mon);
      G.hp -= MONSTERS[c.mon].lv;
      if (G.hp > 0) {
        c.defeated = true;
        if (c.mon === 'mousey') G.killedMice++;
      } else { die(); return; }
    } else if (c.rev) { collectCorpse(i); return; }
  }

  if (!c.rev) revealTile(i);
  revealIsolatedMineGroups();
}

if (typeof module !== 'undefined') {
  module.exports = { G, idx, xy, neighbors, dist, cellNumber, isFogged, genBoard, initRun, initDaily,
    clickCell, levelUp, revealIsolatedMineGroups, canLevelUp, xpNeed, grantXp, blankCell, setMonster, setItem, isEmptyCell };
}
