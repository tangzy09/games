// render.js — 立即模式渲染(浏览器专用)。renderAll 契约:clearHits → 重画全屏 → addHit。
// 棋盘模型:列 index0=顶,往下长,底=玩家侧/死线。故格子(c,i)画在 y = boardY + i*cell。
// ⚠ 致死那一格的 index === s.rows(core 判 length > rows 才死),它在死线【下方】——
//   必须画出来且视觉上压过死线,否则死亡画面里完全看不出是哪一列被顶爆(死因信息全丢)。
const PAL = {
  bg: '#04121f',
  boardBg: '#0a1f33',
  colBg: '#0d2740',
  line: '#2bb3c0',        // 死线
  text: '#cfe8f5',
  dim: 'rgba(2,10,18,0.82)',
  btn: '#2bb3c0',
  btnText: '#04121f',
  breach: '#ff4d5e',                  // 顶爆列的高亮红
  breachWash: 'rgba(255,77,94,0.18)', // 顶爆列的整列红洗
  // 按档位上色(浅礁→深渊,越深越冷艳)
  tiers: ['#38bdf8', '#34d399', '#a3e635', '#fbbf24', '#fb923c',
          '#f87171', '#f472b6', '#c084fc', '#a78bfa', '#818cf8',
          '#60a5fa', '#22d3ee', '#e2e8f0'],
};

const PAD = 12;
const BREACH_RISE = 0.25;   // 越线格上移的比例(× cell),使其骑跨死线 = 视觉上「冲破」

// 动画时长(ms)。改这里调手感。
const ANIM = { fly: 110, merge: 200, spawn: 160, death: 340 };
const easeOut = p => 1 - Math.pow(1 - p, 3);
const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

// 格子(可为小数 index)的 y。⚠ 越线格(i >= rows)必须与 drawBreaches 用【同一套】偏移:
// 否则动画里的越界格和静态帧里的越界格位置对不上,弹药「压过死线」的那一下会跳一帧。
// i 从 rows-1 到 rows 之间连续 ramp,滑动过程平滑,整数 i>=rows 时恰等于 drawBreaches 的公式。
function tileY(L, rows, i) {
  const rise = Math.max(0, Math.min(1, i - (rows - 1)));
  return L.boardY + i * L.cell - L.cell * BREACH_RISE * rise;
}

// 布局:HUD 在顶(避开引擎顶栏 safeTop),棋盘居中,死线下留一整格的「越线区」,再是炮台行。
function layout(s) {
  const { SW, SH, safeTop } = GameGlobal;
  const hudY = safeTop + 8;
  const hudH = 44;
  const topY = hudY + hudH + 8;
  const bottomPad = 16;
  // 竖向要塞下:rows 行棋盘 + 1 行越线区 + 1 行炮台(+ 余量)
  const availH = SH - topY - bottomPad;
  const availW = SW - PAD * 2;
  // ⚠ 极小视口(门户 iframe)下 availH/availW 可能为负 → cell 负数 → fillRR 负宽高、
  //   font 尺寸非法(浏览器静默忽略,画面全乱)。夹一个下限,保证永不为负。
  const cell = Math.max(8, Math.floor(Math.min(availW / s.cols, availH / (s.rows + 2.1))));
  const boardW = cell * s.cols;
  const boardH = cell * s.rows;
  const boardX = Math.round((SW - boardW) / 2);
  const boardY = topY;
  const lineY = boardY + boardH;          // 死线
  const cannonY = lineY + cell;           // 越线区占死线下方一整格,炮台再往下一行
  return { SW, SH, hudY, hudH, cell, boardW, boardH, boardX, boardY, lineY, cannonY };
}

// 画一个鱼格:圆角色块 + 数字(P1b 用纯色+数字占位,鱼图 P2 接 makeArt/drawArtIcon)
function drawTile(x, y, cell, v) {
  const t = Tiles.tierOf(v);
  // 超纲档(tierOf → -1,如合出 16384)取最后一档色,别退化成 tier0 的最浅礁色:
  // 那会让最大的鱼画得跟最小的一样,方向性误导。
  const color = t < 0 ? PAL.tiers[PAL.tiers.length - 1] : PAL.tiers[t % PAL.tiers.length];
  const m = Math.round(cell * 0.06);
  fillRR(x + m, y + m, cell - m * 2, cell - m * 2, Math.round(cell * 0.18), color);
  const label = Tiles.fmt(v);
  const fs = Math.max(6, Math.round(cell * (label.length >= 4 ? 0.28 : label.length === 3 ? 0.34 : 0.42)));
  txt(label, x + cell / 2, y + cell / 2, '#04121f', `bold ${fs}px sans-serif`);
}

// 按像素位置+缩放画一个格子(动画用)。scale=1 即正常大小,alpha 控淡出。
function drawTileAt(px, py, cell, v, scale = 1, alpha = 1) {
  const t = Tiles.tierOf(v);
  const color = t < 0 ? PAL.tiers[PAL.tiers.length - 1] : PAL.tiers[t % PAL.tiers.length];
  const m = Math.round(cell * 0.06);
  const size = (cell - m * 2) * scale;
  const cx = px + cell / 2, cy = py + cell / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  fillRR(cx - size / 2, cy - size / 2, size, size, Math.round(size * 0.18), color);
  const label = Tiles.fmt(v);
  const fs = Math.max(6, Math.round(size * (label.length >= 4 ? 0.28 : label.length === 3 ? 0.34 : 0.42)));
  txt(label, cx, cy, '#04121f', `bold ${fs}px sans-serif`);
  ctx.restore();
}

// 算出 from[c] 里每个 index 的去向:
//   merged 非锚点 → 飞向锚点后消失
//   其余(含锚点) → 幸存,新 index = 它在「幸存序列」里的位置(重力保序压实)
function mapColumn(fromCol, c, merges) {
  const mergedSet = new Set(), anchorVal = new Map();
  for (const m of merges) {
    for (const cell of m.cells) if (cell.c === c) mergedSet.add(cell.i);
    if (m.anchor.c === c) anchorVal.set(m.anchor.i, m.nv);
  }
  const out = [];        // {i, v, kind:'survive'|'vanish', toI, anchorI}
  let newIdx = 0;
  const anchorNewIdx = new Map();
  // 第一遍:定幸存者的新 index
  for (let i = 0; i < fromCol.length; i++) {
    const isMerged = mergedSet.has(i), isAnchor = anchorVal.has(i);
    if (isMerged && !isAnchor) continue;          // 消失,不占位
    if (isAnchor) anchorNewIdx.set(i, newIdx);
    out.push({ i, v: isAnchor ? anchorVal.get(i) : fromCol[i],
               oldV: fromCol[i], kind: 'survive', toI: newIdx, isAnchor });
    newIdx++;
  }
  // 第二遍:消失者飞向它所属锚点的新位置
  for (const m of merges) {
    if (m.anchor.c !== c && !m.cells.some(x => x.c === c)) continue;
    for (const cell of m.cells) {
      if (cell.c !== c) continue;
      if (anchorVal.has(cell.i)) continue;        // 锚点自己不算消失
      out.push({ i: cell.i, v: fromCol[cell.i], kind: 'vanish',
                 anchor: m.anchor, anchorNv: m.nv });
    }
  }
  return { items: out, anchorNewIdx };
}

// 画一步合并动画的中间态
function drawMergeStep(L, step, p) {
  const e = easeOut(p);
  const s = G.s;
  // 先算每列锚点的新 index(消失格要飞向「锚点所在列的新位置」)
  const colMaps = [];
  for (let c = 0; c < s.cols; c++) colMaps.push(mapColumn(step.from[c], c, step.merges));
  const anchorPos = new Map();   // "c,i" → {c, toI}
  for (const m of step.merges) {
    const cm = colMaps[m.anchor.c];
    anchorPos.set(`${m.anchor.c},${m.anchor.i}`, { c: m.anchor.c, toI: cm.anchorNewIdx.get(m.anchor.i) });
  }
  for (let c = 0; c < s.cols; c++) {
    for (const it of colMaps[c].items) {
      if (it.kind === 'survive') {
        const y = tileY(L, s.rows, it.i + (it.toI - it.i) * e);
        const x = L.boardX + c * L.cell;
        if (it.isAnchor) {
          // 锚点:前半程还是旧值,p>0.5 换成新值并弹跳
          const showNew = p >= 0.5;
          const pop = showNew ? 1 + 0.28 * Math.sin(((p - 0.5) / 0.5) * Math.PI) : 1;
          drawTileAt(x, y, L.cell, showNew ? it.v : it.oldV, pop, 1);
        } else {
          drawTileAt(x, y, L.cell, it.v, 1, 1);
        }
      } else {
        // 消失格:飞向锚点新位置,缩小淡出
        const ap = anchorPos.get(`${it.anchor.c},${it.anchor.i}`);
        const fx = L.boardX + c * L.cell, fy = tileY(L, s.rows, it.i);
        const tx = L.boardX + ap.c * L.cell, ty = tileY(L, s.rows, ap.toI);
        const x = fx + (tx - fx) * e, y = fy + (ty - fy) * e;
        drawTileAt(x, y, L.cell, it.v, Math.max(0.05, 1 - e), Math.max(0, 1 - e));
      }
    }
  }
}

// 刷行:所有格下移一行,顶部新格淡入
function drawSpawnStep(L, step, p) {
  const e = easeInOut(p);
  const s = G.s;
  for (let c = 0; c < s.cols; c++) {
    const from = step.from[c], to = step.to[c];
    for (let i = 0; i < from.length; i++) {
      drawTileAt(L.boardX + c * L.cell, tileY(L, s.rows, i + e), L.cell, from[i], 1, 1);
    }
    if (to.length) drawTileAt(L.boardX + c * L.cell, L.boardY, L.cell, to[0], 0.6 + 0.4 * e, e);
  }
}

// 发射:弹药从炮台飞到落点(落点若已越线,飞过死线 —— 观众要亲眼看见它压过虚线,红警随后才亮)
function drawFlyStep(L, step, p) {
  const e = easeOut(p);
  const s = G.s;
  for (let c = 0; c < s.cols; c++)
    for (let i = 0; i < step.from[c].length; i++)
      drawTileAt(L.boardX + c * L.cell, tileY(L, s.rows, i), L.cell, step.from[c][i], 1, 1);
  const fx = L.boardX + step.col * L.cell, fy = L.cannonY;
  const ty = tileY(L, s.rows, step.toI);
  drawTileAt(fx, fy + (ty - fy) * e, L.cell, step.v, 1, 1);
}

// 覆盖层大按钮(HOME/DEAD 共用;同 minesweeper 的 bigButton 先例)
function button(cy, key, action) {
  const { SW } = GameGlobal;
  const bw = 180, bh = 52, bx = SW / 2 - bw / 2;
  fillRR(bx, cy, bw, bh, 14, PAL.btn);
  txt(T(key), SW / 2, cy + bh / 2, PAL.btnText, 'bold 18px sans-serif');
  addHit(bx, cy, bw, bh, action, {});
  return cy + bh;   // 按钮底边,方便在其下继续排版
}

// 顶爆列:把越过死线的格子(i >= rows)画出来 —— 骑跨死线 + 整列红洗 + 红环,
// 一眼看出是哪一列被顶爆。最后画(在覆盖层之上),不被 dim 压暗。
function drawBreaches(L, s) {
  for (let c = 0; c < s.cols; c++) {
    const col = s.board[c];
    if (col.length <= s.rows) continue;
    const x = L.boardX + c * L.cell;
    // 整列红洗 + 红框:标出「就是这一列」
    ctx.fillStyle = PAL.breachWash;
    ctx.fillRect(x, L.boardY, L.cell, L.boardH);
    strokeRR(x + 1, L.boardY, L.cell - 2, L.boardH, 8, PAL.breach, 2);
    // 越线的格子:上移 BREACH_RISE 使其骑跨死线
    for (let i = s.rows; i < col.length; i++) {
      const y = L.lineY + (i - s.rows) * L.cell - L.cell * BREACH_RISE;
      drawTile(x, y, L.cell, col[i]);
      const m = Math.round(L.cell * 0.06);
      strokeRR(x + m, y + m, L.cell - m * 2, L.cell - m * 2, Math.round(L.cell * 0.18), PAL.breach, 3);
    }
  }
}

function renderAll() {
  clearHits();
  const s = G.s;
  const L = layout(s);
  const { SW, SH } = L;

  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, SW, SH);

  // ── HUD:分数(左) + 最深(右,用引擎 txtR 右对齐:变长文案不会双向溢出) ──
  txtL(`${T('abyss.score')} ${s.score}`, PAD, L.hudY + L.hudH / 2, PAL.text, 'bold 18px sans-serif');
  const best = s.maxTile ? Tiles.fmt(s.maxTile) : '—';
  txtR(`${T('abyss.best')} ${best}`, SW - PAD, L.hudY + L.hudH / 2, PAL.text, '14px sans-serif');

  // ── 棋盘底 + 列底 ──
  fillRR(L.boardX - 4, L.boardY - 4, L.boardW + 8, L.boardH + 8, 10, PAL.boardBg);
  for (let c = 0; c < s.cols; c++) {
    fillRR(L.boardX + c * L.cell + 2, L.boardY + 2, L.cell - 4, L.boardH - 4, 8, PAL.colBg);
  }

  // ── 盘内鱼格:动画中交给 step 绘制(step 自己负责画越线格),否则静态画 ──
  // ⚠ 盘面步骤(fly/merge/spawn)期间 drawBreaches 必须【完全不画】:
  //   ① 防双画 —— step 已经把越线格画过了(用 tileY 的同一套越线偏移);
  //   ② 防剧透 —— Core.shoot 是同步算完才起动画的,s.board 早已是「死了的终局盘」。
  //      若此时就画红框红洗,弹药还在半空、"你死了"的红警已经贴脸,动画的戏剧节奏全毁。
  //   红警只在 death step 起播时亮(那时走 else 静态分支)+ 动画播完的静态帧里亮。
  const step = G.anim && G.anim.steps[G.anim.i];
  const animBoardStep = !!step && (step.type === 'fly' || step.type === 'merge' || step.type === 'spawn');
  const animP = step ? Math.min(1, (G.anim.elapsed || 0) / step.dur) : 1;
  if (step && step.type === 'fly')        drawFlyStep(L, step, animP);
  else if (step && step.type === 'merge') drawMergeStep(L, step, animP);
  else if (step && step.type === 'spawn') drawSpawnStep(L, step, animP);
  else {
    for (let c = 0; c < s.cols; c++) {
      const col = s.board[c];
      for (let i = 0; i < col.length && i < s.rows; i++) {
        drawTile(L.boardX + c * L.cell, L.boardY + i * L.cell, L.cell, col[i]);
      }
    }
  }

  // ── 死线 ──
  ctx.strokeStyle = PAL.line; ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(L.boardX, L.lineY + 1);
  ctx.lineTo(L.boardX + L.boardW, L.lineY + 1);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 炮台:每列一个 ▲ ──
  for (let c = 0; c < s.cols; c++) {
    const cx = L.boardX + c * L.cell + L.cell / 2;
    txt('▲', cx, L.cannonY + L.cell * 0.5, '#3b6a86', `${Math.round(L.cell * 0.34)}px sans-serif`);
  }
  // 当前弹药:画在炮台行正中。死后仍显示(s.ammo 停在致死那发),让死亡画面完整可读。
  {
    const ax = L.boardX + Math.floor(s.cols / 2) * L.cell;
    drawTile(ax, L.cannonY, L.cell, s.ammo);
  }
  // 下一发预览
  if (s.queue.length) {
    const nx = L.boardX + L.boardW - L.cell * 0.62;
    const ny = L.cannonY + L.cell * 0.5;
    txt(T('abyss.next'), nx, ny - L.cell * 0.34, '#5b87a3', '10px sans-serif');
    const sz = L.cell * 0.5;
    drawTile(nx - sz / 2, ny - sz / 2 + 4, sz, s.queue[0]);
  }

  // ── 可点区域:5 条整列竖条(棋盘顶 → 炮台底),点哪列射哪列 ──
  if (G.phase === 'PLAYING') {
    for (let c = 0; c < s.cols; c++) {
      addHit(L.boardX + c * L.cell, L.boardY, L.cell, L.cannonY + L.cell - L.boardY, 'SHOOT', { col: c });
    }
  }

  // ── 覆盖层 ──
  if (G.phase === 'HOME') {
    drawDim(PAL.dim);
    txt(T('abyss.title'), SW / 2, SH * 0.34, PAL.text, 'bold 30px sans-serif');
    txtLWrap(T('abyss.tagline'), SW / 2 - 130, SH * 0.42, 260, '#8ab6cd', '14px sans-serif', 18);
    const bBot = button(SH * 0.54, 'abyss.start', 'START');
    txt(T('abyss.hint'), SW / 2, bBot + 28, '#5b87a3', '12px sans-serif');
  } else if (G.phase === 'DEAD') {
    drawDim(PAL.dim);
    txt(T('abyss.gameOver'), SW / 2, SH * 0.36, '#f87171', 'bold 28px sans-serif');
    txt(T('abyss.finalScore', { n: s.score }), SW / 2, SH * 0.44, PAL.text, 'bold 20px sans-serif');
    txt(T('abyss.deepest', { v: Tiles.fmt(s.maxTile || 0) }), SW / 2, SH * 0.50, '#8ab6cd', '14px sans-serif');
    button(SH * 0.58, 'abyss.restart', 'RESTART');
  }

  // ── 顶爆列最后画:压过死线、也压过 dim,死亡画面必须一眼看出是哪列被顶爆 ──
  //    (盘面动画期间跳过:见上面 animBoardStep 处的注释 —— 防双画 + 防死亡剧透)
  if (!animBoardStep) drawBreaches(L, s);
}

// ── 双导出:node 可 require 出纯函数做单测(mapColumn 是动画位置插值的心脏)。
//    浏览器里 module 未定义 → 走不到这行,顶层 const/function 仍是全局,渲染契约不受影响。
if (typeof module !== 'undefined' && module.exports) module.exports = { mapColumn, tileY, ANIM };
