#!/usr/bin/env node
/**
 * blockblast 设计验证模拟器（DESIGN.md 的数值靠它校准，不靠拍脑袋）
 *
 * 回答四个问题：
 *   1. dealer 的「三块全可放」回合占比，真的落在设计目标 60-80% 吗？
 *   2. perfect clear（清空整盘）在 8×8 + 三块托盘下，实际多久出一次？招牌大招是不是死的？
 *   3. 单局时长（回合数）与分数量级，对得上「3-5 分钟一局、截图那局 1703 分」吗？
 *   4. streak 分布：玩家真能连到 13 连（×4 封顶）吗？封顶值定得合不合理？
 *
 * 三档 AI 模拟三档玩家：casual（随手放）/ mid（一步贪心）/ pro（全排列贪心 + 保空盘启发）
 * 用法: node games/blockblast/tools/sim.js [局数]
 */
'use strict';

const W = 8, H = 8, N = W * H;

// ---------- 拼块池（DESIGN §1.1）----------
const P = (name, cls, cells) => ({ name, cls, cells, size: cells.length });
const PIECES = [
  P('1x1', 'S', [[0,0]]),
  P('1x2', 'S', [[0,0],[0,1]]),
  P('2x1', 'S', [[0,0],[1,0]]),
  P('1x3', 'S', [[0,0],[0,1],[0,2]]),
  P('3x1', 'S', [[0,0],[1,0],[2,0]]),
  P('L3a', 'S', [[0,0],[1,0],[1,1]]),
  P('L3b', 'S', [[0,0],[0,1],[1,0]]),
  P('L3c', 'S', [[0,0],[0,1],[1,1]]),
  P('L3d', 'S', [[0,1],[1,0],[1,1]]),
  P('2x2', 'M', [[0,0],[0,1],[1,0],[1,1]]),
  P('1x4', 'M', [[0,0],[0,1],[0,2],[0,3]]),
  P('4x1', 'M', [[0,0],[1,0],[2,0],[3,0]]),
  P('La',  'M', [[0,0],[1,0],[2,0],[2,1]]),
  P('Lb',  'M', [[0,0],[0,1],[0,2],[1,0]]),
  P('Lc',  'M', [[0,0],[1,1],[1,0],[2,1]].slice(0,3).concat([[0,0]])), // 占位，下面重定义
  P('S4',  'M', [[0,1],[0,2],[1,0],[1,1]]),
  P('Z4',  'M', [[0,0],[0,1],[1,1],[1,2]]),
  P('T4',  'M', [[0,0],[0,1],[0,2],[1,1]]),
  P('1x5', 'L', [[0,0],[0,1],[0,2],[0,3],[0,4]]),
  P('5x1', 'L', [[0,0],[1,0],[2,0],[3,0],[4,0]]),
  P('plus','L', [[0,1],[1,0],[1,1],[1,2],[2,1]]),
  P('2x3', 'L', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]]),
  P('3x2', 'L', [[0,0],[0,1],[1,0],[1,1],[2,0],[2,1]]),
  P('3x3', 'L', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]),
];
PIECES[14] = P('Ld', 'M', [[0,0],[1,0],[2,0],[0,1]]); // 修掉上面的占位

const BASE_W = process.env.BW
  ? (([s, m, l]) => ({ S: +s, M: +m, L: +l }))(process.env.BW.split(','))
  : { S: 25, M: 55, L: 20 };                      // 档位基准权重（DESIGN §1.1），可用 BW=S,M,L 覆盖以做扫描
const clsCount = { S: 0, M: 0, L: 0 };
PIECES.forEach(p => clsCount[p.cls]++);

// ---------- 棋盘 ----------
const idx = (r, c) => r * W + c;
const emptyBoard = () => new Uint8Array(N);
const fillCount = b => { let n = 0; for (let i = 0; i < N; i++) n += b[i]; return n; };

function canPlace(b, p, r, c) {
  for (const [dr, dc] of p.cells) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= H || cc < 0 || cc >= W) return false;
    if (b[idx(rr, cc)]) return false;
  }
  return true;
}
function placements(b, p) {
  const out = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (canPlace(b, p, r, c)) out.push([r, c]);
  return out;
}
const canPlaceAny = (b, p) => placements(b, p).length > 0;

function place(b, p, r, c) {
  const nb = b.slice();
  for (const [dr, dc] of p.cells) nb[idx(r + dr, c + dc)] = 1;
  return nb;
}
/** 消除填满的行列，返回 [新盘, 消除条数] */
function clearLines(b) {
  const rows = [], cols = [];
  for (let r = 0; r < H; r++) { let full = true; for (let c = 0; c < W; c++) if (!b[idx(r,c)]) { full = false; break; } if (full) rows.push(r); }
  for (let c = 0; c < W; c++) { let full = true; for (let r = 0; r < H; r++) if (!b[idx(r,c)]) { full = false; break; } if (full) cols.push(c); }
  if (!rows.length && !cols.length) return [b, 0];
  const nb = b.slice();
  for (const r of rows) for (let c = 0; c < W; c++) nb[idx(r,c)] = 0;
  for (const c of cols) for (let r = 0; r < H; r++) nb[idx(r,c)] = 0;
  return [nb, rows.length + cols.length];
}

// ---------- 计分（DESIGN §3）----------
const comboTier = L => (L === 1 ? 1.0 : L === 2 ? 1.5 : L === 3 ? 2.2 : 3.0);
const streakMult = s => 1 + 0.25 * Math.min(Math.max(s - 1, 0), 12);   // 上限 ×4
function scoreFor(pieceSize, L, streakAfter) {
  let sc = pieceSize;
  if (L > 0) sc += 20 * L * comboTier(L) * streakMult(streakAfter);
  return sc;
}

// ---------- PRNG ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- dealer（DESIGN §2：硬保证 + 只看几何的 DDA）----------
function pieceWeights(board, drought, dda) {
  const fill = fillCount(board) / N;
  let mS = 1, mM = 1, mL = 1;
  if (!dda) return PIECES.map(p => BASE_W[p.cls] / clsCount[p.cls]);   // 纯固定权重：不看棋盘
  if (fill < 0.30)      { mL = 1.6; mS = 0.6; }
  else if (fill >= 0.60){ mS = 2.0; mL = 0.3; }
  return PIECES.map(p => {
    if (fill >= 0.60 && p.name === '3x3') return 0;                    // 拥挤禁发 3×3
    let w = BASE_W[p.cls] / clsCount[p.cls];
    w *= (p.cls === 'S' ? mS : p.cls === 'M' ? mM : mL);
    if (drought >= 3 && ['1x4','4x1','1x5','5x1'].includes(p.name)) w *= 2.5;  // 旱情救场件
    return w;
  });
}
function drawOne(board, drought, rnd, dda) {
  const w = pieceWeights(board, drought, dda);
  const tot = w.reduce((a, b) => a + b, 0);
  let x = rnd() * tot;
  for (let i = 0; i < PIECES.length; i++) { x -= w[i]; if (x <= 0) return PIECES[i]; }
  return PIECES[0];
}
/**
 * guarantee='none'  → 纯加权随机（原版 Block Blast 的行为）
 * guarantee='any'   → 保证「至少一块可放」（DESIGN v3 的硬保证）
 * guarantee='all'   → 保证「三块能按某序全部放完」（最强善意；等于永不死，用来看上界）
 */
function dealHand(board, drought, rnd, stats, guarantee, dda) {
  const ok = hand => {
    if (guarantee === 'none') return true;
    if (guarantee === 'any') return hand.some(p => canPlaceAny(board, p));
    return canPlaceAllInSomeOrder(board, hand);
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const hand = [drawOne(board, drought, rnd, dda), drawOne(board, drought, rnd, dda), drawOne(board, drought, rnd, dda)];
    if (ok(hand)) { if (attempt > 0) stats.redeals++; return hand; }
  }
  stats.fallbacks++;
  return [PIECES[0], PIECES[0], PIECES[0]];
}
/** 三块是否存在某个顺序能全部放下（死亡判定的真正条件） */
function canPlaceAllInSomeOrder(b, hand) {
  const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for (const order of perms) {
    const dfs = (bd, k) => {
      if (k === 3) return true;
      const p = hand[order[k]];
      for (const [r, c] of placements(bd, p)) {
        const [nb] = clearLines(place(bd, p, r, c));
        if (dfs(nb, k + 1)) return true;
      }
      return false;
    };
    if (dfs(b, 0)) return true;
  }
  return false;
}

// ---------- 盘面启发式（AI 用；参考 1010!/blokie 的结论：占用格数 + 孤立空格 + 团块度）----------
function evalBoard(b) {
  let filled = 0, isolated = 0, edges = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (b[idx(r,c)]) { filled++; continue; }
    let nb = 0;                                    // 空格的四邻中有几个是「占用或墙」
    if (r === 0 || b[idx(r-1,c)]) nb++;
    if (r === H-1 || b[idx(r+1,c)]) nb++;
    if (c === 0 || b[idx(r,c-1)]) nb++;
    if (c === W-1 || b[idx(r,c+1)]) nb++;
    if (nb === 4) isolated++;                      // 被封死的单格空洞 = 最坏
    edges += nb;
  }
  return -filled * 1.0 - isolated * 12 - edges * 0.15;
}

// ---------- AI ----------
/**
 * 一手（3 块）的决策。
 * ⚠ 真实规则：三块必须**全部放完**才补新牌。放不下的块不能跳过 —— 一旦有块无处可放 = game over。
 * 返回 { seq, placedAll }。placedAll=false 即本局结束（seq 是死前尽力放的那些）。
 */
function playHand(board, hand, level, rnd) {
  const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  const tryPerms = level === 'casual' ? [perms[Math.floor(rnd() * 6)]] : perms;

  let best = null;
  for (const order of tryPerms) {
    let b = board, seq = [], gained = 0, stuck = false;
    for (const i of order) {
      const p = hand[i];
      const ps = placements(b, p);
      if (!ps.length) { stuck = true; break; }     // 这块放不下 → 该排列走不通
      let bp = null, bv = -Infinity;
      for (const [r, c] of ps) {
        const [nb, L] = clearLines(place(b, p, r, c));
        let v = evalBoard(nb) + L * 40;
        if (level === 'casual') v += rnd() * 25;   // 随手玩家：噪声大
        if (level === 'pro' && fillCount(nb) === 0) v += 1000;  // 高手：主动追求清盘
        if (v > bv) { bv = v; bp = [r, c, nb, L]; }
      }
      seq.push({ p, r: bp[0], c: bp[1] });
      b = bp[2]; gained += bp[3];
    }
    const placedAll = !stuck && seq.length === 3;
    const val = (placedAll ? 1e6 : 0) + evalBoard(b) + gained * 40 + seq.length * 30;
    if (!best || val > best.val) best = { val, seq, placedAll };
    if (level === 'casual' && placedAll) break;    // 随手玩家不穷举，能放完就走
  }
  return best;
}

// ---------- 跑一局 ----------
function playGame(seed, level, guarantee, dda) {
  const rnd = mulberry32(seed);
  let board = emptyBoard(), score = 0, streak = 0, dryTurns = 0, drought = 0;
  let turns = 0, hands = 0, handsAllPlaceable = 0, perfectClears = 0, nearClears = 0;
  let maxStreak = 0, lines = 0, multiClears = 0;
  const stats = { redeals: 0, fallbacks: 0 };
  const fillSamples = [];

  let died = false;
  for (let guard = 0; guard < 3000; guard++) {
    const hand = dealHand(board, drought, rnd, stats, guarantee, dda);
    hands++;
    if (hand.every(p => canPlaceAny(board, p))) handsAllPlaceable++;

    const plan = playHand(board, hand, level, rnd);
    if (!plan) { died = true; break; }
    if (!plan.placedAll) died = true;              // ⚠ 三块没放完 = game over（放完死前那几步再退出）

    for (const mv of plan.seq) {
      if (!canPlace(board, mv.p, mv.r, mv.c)) continue;
      const placed = place(board, mv.p, mv.r, mv.c);
      const [cleared, L] = clearLines(placed);
      turns++;
      if (L > 0) {
        streak++; dryTurns = 0; drought = 0; lines += L;
        if (L >= 2) multiClears++;
        if (fillCount(cleared) === 0) {            // PERFECT CLEAR
          perfectClears++;
          score += 20 * L * comboTier(L) * streakMult(streak) * 5 + 500;   // §4 奖励
          streak += 3;
        } else {
          if (fillCount(cleared) <= 4) nearClears++;
          score += scoreFor(mv.p.size, L, streak);
        }
      } else {
        dryTurns++; drought++;
        if (dryTurns >= 2) streak = 0;             // §3：连续 2 回合零消除才断
        score += mv.p.size;
      }
      maxStreak = Math.max(maxStreak, streak);
      board = cleared;
      fillSamples.push(fillCount(board) / N);
    }
    if (died) break;
  }
  const avgFill = fillSamples.reduce((a, b) => a + b, 0) / (fillSamples.length || 1);
  return { score, turns, hands, handsAllPlaceable, perfectClears, nearClears, maxStreak, lines, multiClears, avgFill, ...stats };
}

// ---------- 主 ----------
const GAMES = parseInt(process.argv[2] || '2000', 10);
const pct = (a, b) => (100 * a / b).toFixed(1) + '%';
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log(`\n=== blockblast 设计验证模拟（每档 ${GAMES} 局，8×8）===`);
console.log('guarantee: none=纯随机(原版) | any=至少一块可放(v3 硬保证) | all=三块必能全放完\n');
const rows = [];
for (const [guarantee, dda] of [['none', false], ['none', true], ['any', true], ['all', true]])
for (const level of ['casual', 'mid']) {
  const R = [];
  for (let i = 0; i < GAMES; i++) R.push(playGame(1000 + i, level, guarantee, dda));
  const sum = k => R.reduce((a, r) => a + r[k], 0);
  const gamesWithPC = R.filter(r => r.perfectClears > 0).length;
  const gamesWithNC = R.filter(r => r.nearClears > 0).length;
  rows.push({
    发牌: guarantee, DDA: dda ? 'on' : 'off', 玩家: level,
    '中位分': med(R.map(r => r.score)).toFixed(0),
    '中位回合': med(R.map(r => r.turns)),
    '三块全可放%': pct(sum('handsAllPlaceable'), sum('hands')),
    'PC局占比': pct(gamesWithPC, GAMES),
    '近清盘(≤4格)局占比': pct(gamesWithNC, GAMES),
    '最长streak中位': med(R.map(r => r.maxStreak)),
    'streak≥13的局': pct(R.filter(r => r.maxStreak >= 13).length, GAMES),
    '多消(≥2条)/局': (sum('multiClears') / GAMES).toFixed(1),
    '平均占用率': (sum('avgFill') / GAMES * 100).toFixed(0) + '%',
    '重抽/局': (sum('redeals') / GAMES).toFixed(2),
    '兜底1x1/局': (sum('fallbacks') / GAMES).toFixed(3),
  });
}
console.table(rows);
console.log('判读基准: 三块全可放% 目标 60-80%; PC局占比若 <2% 则「招牌大招」是死的; 中位回合 ~40-70 对应 3-5 分钟一局\n');
