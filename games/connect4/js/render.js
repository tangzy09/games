// ════════════════════════════════════════
// render.js —— 盘面几何 + 绘制（P2a Task 5）。⛔ 这里**没有**主循环 / 输入 / Worker /
// 规则判断：它只提供「画的能力」和「第 c 列在哪」，谁该走、能不能走由调用方（T6）决定。
//
// ⭐⭐ 两枚棋子的造型是本文件唯一一个不许被「美化」掉的决定（DESIGN §6.2 + §0.1）：
//    · 先手(player 0) = **实心六边形**（近墨黑，覆盖率 ~0.54）
//    · 后手(player 1) = **圆环**（奶白，中心是空的，覆盖率 ~0.30）
//    一个决定同时解三件事：
//      ① 无障碍：四子棋的全部信息压在「这枚是我的还是他的」一个色差上，约 8% 的男性有
//         色觉障碍 ⇒ 两方必须**转成灰度也一眼分清**。这里靠的是**剪影**不是颜色：
//         实心 vs 中空（环心透出井底的底色）、覆盖率差 ~0.24 —— 把整张图去色、甚至把两方
//         调成同一个灰度值，仍然分得清。判据不是「建议」，由 tests/e2e-render.cjs 现场量。
//      ② Hasbro 的 trade dress（红/黄同形圆片 + 蓝色竖框栅栏）：这里没有红、没有黄、
//         没有蓝框，两方**不是同一个圆换色**，而是两种造型。
//      ③ 4.3(a) 的 binary 面：一眼不像另外 300 个四子棋克隆。
//    ⛔ 想换配色可以，但**不许把两方改回同形异色**，也不许把环填实。
//
// ⚠ 盘面读的是 bitboard 的**掩码**（bd.a / bd.b / bd.h），不 require Bitboard ——
//   主线程的 <script> 列表里没有 bitboard.js（求解器全在 Worker 里，见 index.html 注释），
//   render 不该把它拖回主线程。W/H 在这里**复述**了一份，与 bitboard.js 的 7×6 绑定，
//   ⛔ 改盘面尺寸要两边一起改（layout 的断言会当场炸给你看）。
//
// 坐标约定：**r = 0 是最底行**（与 bitboard.js 同一套），屏幕上是最下面那一行。
// ════════════════════════════════════════
(function (root) {
  'use strict';
  const inNode = (typeof module !== 'undefined' && module.exports);

  const W = 7, H = 6;

  // ── 调色板 ──
  // ⛔ 红线：没有红/黄这一对，没有蓝色栅栏（DESIGN §0.1 trade dress）。
  // 灰度值（Rec.709）标在后面 —— 井底 ~80、六边形 ~28、圆环 ~232，三者两两拉开，
  // 「有没有子」和「是谁的子」在灰度图上都读得出来。
  const PAL = {
    page:      '#eef3f0',
    pageEdge:  '#dbe6e0',
    slab:      '#61776f',   // 盘体（灰绿石板，不是蓝框）  gray ≈ 114
    slabEdge:  '#465953',
    slabHi:    '#7b9189',
    well:      '#48605a',   // 空格的「井」                gray ≈ 90
    wellEdge:  '#3a4e49',
    p0Fill:    '#131e1c',   // 先手：实心六边形            gray ≈ 27
    p0Edge:    '#05100e',
    // ⚠ 高光只压在**上沿**且透明度低：它一旦铺满整枚棋子，六边形的灰度就被抬到中灰，
    //   「有没有子」在灰度图上就读不出来了（门禁 ⑤ 会当场报）。
    p0Hi:      'rgba(96,168,146,0.22)',
    p1Fill:    '#f5ead2',   // 后手：圆环                  gray ≈ 232
    p1Edge:    '#a98b4f',
    accent:    '#2f8f6a',
    glow:      '#8ff0cd',
    hudCard:   'rgba(255,255,255,0.90)',
    hudEdge:   'rgba(47,85,70,0.16)',
    hudText:   '#264a3d',
    hudSub:    'rgba(38,74,61,0.62)'
  };

  // 棋子尺寸（相对 cell）。⚠ 这三个数就是灰度门禁量的那个「覆盖率差」的来源，
  // 改之前先跑 `npm run test:c4:render`。
  const HEX_R  = 0.455;   // 六边形外接圆
  const RING_R = 0.425;   // 圆环外径
  const RING_I = 0.300;   // 圆环内径（**空心是判据**，⛔ 别填实、⛔ 别再往小调：
                          //   内径小 = 环变粗 = 剪影越来越像实心，IoU 门禁会先红给你看）

  const HUD_H = 54;
  const MARGIN = 14;
  const BOARD_MAXW = 560;

  // ════════ ① 几何：纯函数，不碰 canvas ════════
  /**
   * 算出这一屏的棋盘几何。**纯函数**：给同样的四个数永远给同样的结果，
   * 不画一个像素、不读 ctx ⇒ T6 的落子判定、T8 的 E2E 都能不画图就问「第 c 列在哪」。
   *
   * @param {number} SW,SH        画布逻辑尺寸（CSS 像素，= GameGlobal.SW/SH）
   * @param {number} [safeTop]    刘海/顶栏安全区，默认取 GameGlobal（node 里默认 44）
   * @param {number} [safeBottom] 底部安全区，默认取 GameGlobal（node 里默认 0）
   *
   * ⭐ HUD 的 y **从 safeTop + ctrlH + 8 起**，不是 safeTop —— 右上角那块是引擎
   *   `#controls`（fixed / z-index 20）的地盘：画在它下面的 canvas 内容不但被盖住，
   *   **而且点不动**（solitaire 的「✓ 有解」角标实踩，只有真实鼠标点击的 E2E 抓得出来）。
   *   canvas.js 的注释给的就是这个补法，这里照办并由 e2e-render.cjs 钉死。
   */
  function layout(SW, SH, safeTop, safeBottom) {
    const GG = (typeof GameGlobal !== 'undefined') ? GameGlobal : null;
    const st = safeTop    == null ? (GG ? GG.safeTop    : 44) : safeTop;
    const sb = safeBottom == null ? (GG ? GG.safeBottom : 0)  : safeBottom;
    const ctrlH = GG ? GG.ctrlH : 34;

    const top0 = st + ctrlH + 8;                 // ⭐ 顶栏禁区之下
    const availW = Math.min(SW - MARGIN * 2, BOARD_MAXW);

    // 竖向预算：HUD + 间隙 + 悬停带 + 盘体。盘体高 = 6*cell + 2*pad，pad = 0.14*cell，
    // 悬停带 = 1.05*cell ⇒ 总高 ≈ 7.33*cell；横向 ≈ 7.28*cell。取两边的较小者。
    const gapHud = 10;
    const availH = SH - sb - MARGIN - top0 - HUD_H - gapHud;
    const cell = Math.max(18, Math.floor(Math.min(availW / 7.28, availH / 7.33)));

    const pad = Math.max(3, Math.round(cell * 0.14));
    const boardW = W * cell + pad * 2;
    const boardH = H * cell + pad * 2;
    const dropH = Math.round(cell * 1.05);
    const boardX = Math.round((SW - boardW) / 2);

    // ⚠ HUD **贴顶栏钉住**，⛔ 别跟着盘面一起垂直居中 —— 竖屏手机上 7×6 的盘偏宽、
    //   上下留白很大（DESIGN §6.9），把 HUD 也居中的话它会飘在半空、跟屏幕顶完全脱开
    //   （第一版截图肉眼看出来的：HUD 落在 y=224，像一张浮在空中的卡片）。
    //   盘面自己在 HUD 之下的剩余空间里略偏上居中，下方留白留给 §6.9 的精准度条/立绘。
    const hud = { x: MARGIN, y: top0, w: SW - MARGIN * 2, h: HUD_H };
    const belowHud = hud.y + hud.h + gapHud;
    const slack = Math.max(0, (SH - sb - MARGIN - belowHud) - (dropH + boardH));
    const drop = { x: boardX, y: Math.round(belowHud + slack * 0.38), w: boardW, h: dropH };
    const boardY = drop.y + drop.h;

    const L = {
      SW, SH, safeTop: st, safeBottom: sb, ctrlH,
      cell, pad, boardX, boardY, boardW, boardH,
      hud, drop,
      W, H
    };

    // 每格 / 每列的几何（数据形式，便于 E2E 直接断言）
    L.cellX = c => boardX + pad + c * cell;
    L.cellY = r => boardY + pad + (H - 1 - r) * cell;   // ⚠ r=0 在最下面
    L.center = (c, r) => ({ x: L.cellX(c) + cell / 2, y: L.cellY(r) + cell / 2 });

    // ⭐ **整列一个热区**（不是每格一个）：重力四子棋玩家选的是「哪一列」，
    //   格子级热区只会让手指点在两格之间时静默丢掉一手。热区从悬停带顶一直盖到盘底，
    //   最左/最右列吃到盘体边缘（边上那一列本来就最容易点丢）。
    L.colHits = [];
    for (let c = 0; c < W; c++) {
      const x0 = c === 0 ? boardX : L.cellX(c);
      const x1 = c === W - 1 ? boardX + boardW : L.cellX(c) + cell;
      L.colHits.push({ x: x0, y: drop.y, w: x1 - x0, h: (boardY + boardH) - drop.y });
    }
    /** 屏幕 x（可选 y）→ 列号，落在盘外返回 -1。热区与 addHit 用的是**同一份**矩形。 */
    L.colAt = (px, py) => {
      for (let c = 0; c < W; c++) {
        const r = L.colHits[c];
        if (px >= r.x && px <= r.x + r.w && (py == null || (py >= r.y && py <= r.y + r.h))) return c;
      }
      return -1;
    };
    return L;
  }

  // ════════ ② 盘面读取（只读掩码，不依赖 Bitboard）════════
  /** @returns 0 | 1 | -1（空）。⚠ 兼容「没落过子的空盘」：bd 缺字段时当空盘，⛔ 不抛 ——
   *  render 在任何状态下都必须画得出东西，白屏比画错更难查。 */
  function cellOwner(bd, c, r) {
    if (!bd) return -1;
    const a = bd.a, b = bd.b;
    if (a && ((a[c] >> r) & 1)) return 0;
    if (b && ((b[c] >> r) & 1)) return 1;
    return -1;
  }
  /** 这一列现在落下去会停在第几行；-1 = 满了。 */
  function landingRow(bd, c) {
    if (c < 0 || c >= W) return -1;
    const h = bd && bd.h ? bd.h[c] : 0;
    return (h == null || h >= H) ? -1 : h;
  }

  // ════════ ③ 棋子造型 ════════
  function hexPath(cx, cy, R) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const ang = -Math.PI / 2 + k * Math.PI / 3;    // 尖顶六边形
      const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function ringPath(cx, cy, Ro, Ri) {
    ctx.beginPath();
    ctx.arc(cx, cy, Ro, 0, Math.PI * 2, false);
    ctx.arc(cx, cy, Ri, 0, Math.PI * 2, true);       // 反向绕 ⇒ nonzero 规则挖空
    ctx.closePath();
  }

  /**
   * 画一枚棋子（先手=六边形 / 后手=圆环）。
   * @param mode 'solid'（正常）| 'ghost'（落点虚影：虚线轮廓 + 极淡填充）
   * ⭐ ghost 与 solid **共用同一条路径** —— 虚影必须和真落下去的那一枚形状一致，
   *   否则「预演」预演的是另一个东西（这正是按住预览白送教学的前提）。
   *
   * @param opts.sx,sy squash & stretch（DESIGN §6.3，来自 C4Fx.pose()）。默认 1/1 ⇒
   *   ⛔ 老调用方一个像素都不变（剪影门禁 e2e-render ⑤ 量的就是那份剪影）。
   *   ⭐ 缩放的**支点在棋子底沿**不是中心：压扁的时候底边得钉在它砸到的那个面上，
   *     绕中心缩的话棋子会在撞底那一瞬往上飘半格，看起来像弹起而不是被压扁。
   */
  function drawPiece(player, cx, cy, cell, opts) {
    opts = opts || {};
    const mode = opts.mode || 'solid';
    const a = opts.alpha == null ? 1 : opts.alpha;
    const sx = opts.sx == null ? 1 : opts.sx, sy = opts.sy == null ? 1 : opts.sy;
    ctx.save();
    if (sx !== 1 || sy !== 1) {
      const Rv = cell * (player === 0 ? HEX_R : RING_R);     // 半高 = 底沿到中心
      ctx.translate(cx, cy + Rv);
      ctx.scale(sx, sy);
      cx = 0; cy = -Rv;
    }
    ctx.globalAlpha = a;
    if (opts.glow) { ctx.shadowColor = PAL.glow; ctx.shadowBlur = cell * 0.55; }

    // ⭐ backing：先用底色把这枚棋子的**整个外轮廓**填掉，再画它自己。
    //   只在赢局重画时用：连线画在棋子**之下**，而圆环是空心的 ⇒ 不打底的话那条白线会
    //   **从环心穿出来**，赢的那一刻圆环看起来是实心的 —— 双编码在最需要它的一帧反过来骗人。
    if (opts.backing && mode === 'solid') {
      ctx.beginPath();
      if (player === 0) hexPath(cx, cy, cell * HEX_R);
      else ctx.arc(cx, cy, cell * RING_R, 0, Math.PI * 2);
      ctx.fillStyle = opts.backing; ctx.fill();
    }

    if (player === 0) {
      const R = cell * HEX_R;
      hexPath(cx, cy, R);
      if (mode === 'ghost') {
        ctx.fillStyle = 'rgba(19,30,28,0.16)'; ctx.fill();
        ctx.setLineDash([Math.max(3, R * 0.34), Math.max(2, R * 0.26)]);
        ctx.lineWidth = Math.max(1.5, R * 0.13); ctx.strokeStyle = 'rgba(19,30,28,0.78)'; ctx.stroke();
      } else {
        ctx.fillStyle = PAL.p0Fill; ctx.fill();
        // 顶部斜角高光：**只在剪影内部**（clip），⛔ 不许改变外轮廓 —— 剪影就是判据本身
        ctx.save(); ctx.clip();
        ctx.fillStyle = PAL.p0Hi;
        ctx.fillRect(cx - R, cy - R, R * 2, R * 0.55);
        ctx.restore();
        hexPath(cx, cy, R);
        ctx.lineWidth = Math.max(1, R * 0.10); ctx.strokeStyle = PAL.p0Edge; ctx.stroke();
      }
    } else {
      const Ro = cell * RING_R, Ri = cell * RING_I;
      if (mode === 'ghost') {
        ringPath(cx, cy, Ro, Ri);
        ctx.fillStyle = 'rgba(245,234,210,0.24)'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, Ro, 0, Math.PI * 2);
        ctx.setLineDash([Math.max(3, Ro * 0.34), Math.max(2, Ro * 0.26)]);
        ctx.lineWidth = Math.max(1.5, Ro * 0.13); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
      } else {
        ringPath(cx, cy, Ro, Ri);
        ctx.fillStyle = PAL.p1Fill; ctx.fill();
        ctx.lineWidth = Math.max(1, Ro * 0.09); ctx.strokeStyle = PAL.p1Edge;
        ctx.beginPath(); ctx.arc(cx, cy, Ro, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, Ri, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** HUD / 菜单 / 结算里插一枚小图示（「你是■ / 他是◯」）。size = 参照的格宽。 */
  function drawGlyph(player, cx, cy, size, alpha) {
    drawPiece(player, cx, cy, size, { alpha: alpha == null ? 1 : alpha });
  }

  // ════════ ④ 背景与盘体 ════════
  function drawBackground(L) {
    const g = ctx.createLinearGradient(0, 0, 0, L.SH);
    g.addColorStop(0, PAL.page); g.addColorStop(1, PAL.pageEdge);
    ctx.fillStyle = g; ctx.fillRect(0, 0, L.SW, L.SH);
  }

  function drawSlab(L) {
    const r = Math.round(L.cell * 0.30);
    ctx.save();
    ctx.shadowColor = 'rgba(30,52,44,0.28)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    fillRR(L.boardX, L.boardY, L.boardW, L.boardH, r, PAL.slab);
    ctx.restore();
    strokeRR(L.boardX + 0.5, L.boardY + 0.5, L.boardW - 1, L.boardH - 1, r, PAL.slabEdge, 1.5);
    strokeRR(L.boardX + 2.5, L.boardY + 2.5, L.boardW - 5, L.boardH - 5, r - 2, 'rgba(255,255,255,0.10)', 1);
  }

  function drawWell(L, c, r) {
    const x = L.cellX(c), y = L.cellY(r), s = L.cell;
    const ins = Math.max(1, Math.round(s * 0.05));
    const rr = s * 0.26;
    fillRR(x + ins, y + ins, s - ins * 2, s - ins * 2, rr, PAL.well);
    strokeRR(x + ins + 0.5, y + ins + 0.5, s - ins * 2 - 1, s - ins * 2 - 1, rr, PAL.wellEdge, 1);
  }

  // ════════ ⑤ 主绘制 ════════
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  /** winLine 允许 [{c,r}] 或 [[c,r]] 两种写法（T6/复盘两侧各写各的，这里收口）。 */
  function normLine(line) {
    if (!Array.isArray(line)) return null;
    const out = [];
    for (const p of line) {
      if (Array.isArray(p)) out.push({ c: p[0], r: p[1] });
      else if (p && typeof p === 'object') out.push({ c: p.c, r: p.r });
    }
    return out.length ? out : null;
  }

  /**
   * 画 7×6 盘面 + 两方棋子，并为**每一列**注册一个点击热区。
   *
   * @param bd   bitboard 形状的盘面（只读 a / b / h）
   * @param opts {
   *   L         已算好的 layout（省掉重算；不给就现算）
   *   hoverCol  悬停/按住的列：半透明棋子悬在该列上方 + **落点虚影**画出会掉到哪一格
   *   hoverPlayer 悬停那一枚是谁的（默认 0）
   *   winLine   赢局的四个格子 ⇒ 发光 + 画出连线
   *   dim       true 或 0..1：winLine 之外的部分变暗（赢局呈现，DESIGN §6.3）
   *   lineProg  0..1：连线**已经画出的比例**（P2b T3「逐段画出」）。⚠ 默认 1 = 整条
   *   lit       [0..1 ×4]：赢的每一枚**点亮程度**（P2b T3「依次点亮」）。⚠ 默认全 1
   *             ⭐ 这两个一律来自 `C4Fx.poseWin()`，⛔ 别在这里另起一套时间轴
   *   lastMove  {c,r} 上一手的小标记
   *   action    热区的 action 名（默认 'COL'，data = {col}）
   *   noHits    true = 不注册热区（截图/预览用）
   *   anim      ⭐ `C4Fx.pose()` 的返回值：[{c,r,player,dy,sx,sy}]，正在**下落中**的棋子。
   *             这些格子在静态那一遍里**跳过**（否则同一枚会同时出现在格心和半空中），
   *             改画在 `center(c,r).y + dy*cell` 上，带 squash & stretch。
   *             ⚠ dy 的单位是**格**不是像素 —— 动画中途转屏时 cell 会变，用像素存会跳一下。
   * }
   */
  function drawBoard(bd, opts) {
    opts = opts || {};
    const L = opts.L || layout(GameGlobal.SW, GameGlobal.SH);
    const line = normLine(opts.winLine);
    const anim = Array.isArray(opts.anim) && opts.anim.length ? opts.anim : null;
    const animAt = (c, r) => {
      if (!anim) return null;
      for (const p of anim) if (p && p.c === c && p.r === r) return p;
      return null;
    };
    const inLine = (c, r) => !!(line && line.some(p => p.c === c && p.r === r));
    const dimA = opts.dim === true ? 0.62 : (typeof opts.dim === 'number' ? opts.dim : 0);

    drawSlab(L);

    // 井（空格）
    for (let c = 0; c < W; c++) for (let r = 0; r < H; r++) drawWell(L, c, r);

    // 悬停列的高亮：画在井之上、棋子之下（画在井之下 = 完全看不见，blockblast 的消行预览
    // 就是这么坏掉的，而且没人发现）
    const hc = opts.hoverCol;
    const hasHover = Number.isInteger(hc) && hc >= 0 && hc < W;
    const landing = hasHover ? landingRow(bd, hc) : -1;
    if (hasHover) {
      const hr = L.colHits[hc];
      fillRR(hr.x + 1, L.boardY + 2, hr.w - 2, L.boardH - 4, L.cell * 0.24,
             landing < 0 ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.13)');
    }

    // 棋子（⚠ 正在下落的那些跳过，下面单独画在半空中）
    for (let c = 0; c < W; c++) {
      for (let r = 0; r < H; r++) {
        const o = cellOwner(bd, c, r);
        if (o < 0 || animAt(c, r)) continue;
        const p = L.center(c, r);
        drawPiece(o, p.x, p.y, L.cell);
      }
    }


    // 上一手的小标记（一个细亮点，不改变剪影）
    if (opts.lastMove && !line) {
      const lm = opts.lastMove;
      if (lm.c >= 0 && lm.c < W && lm.r >= 0 && lm.r < H) {
        const p = L.center(lm.c, lm.r);
        ctx.save();
        ctx.beginPath(); ctx.arc(p.x, p.y - L.cell * 0.30, Math.max(2, L.cell * 0.055), 0, Math.PI * 2);
        ctx.fillStyle = PAL.glow; ctx.fill();
        ctx.restore();
      }
    }

    // ⭐ 赢局呈现（DESIGN §6.3）：其余变暗 → 四枚发光重画 → **画出那条连线**。
    //   玩家必须看清自己赢在哪 —— 第一局赢的那 3 秒是 D1 的杠杆。
    // ⛔⛔ 顺序是承重的（第一版这里画反了，截图肉眼一眼看出来）：
    //   第一版是「棋子 → 圆形光圈 → 粗白线」全画在最上面 ⇒ 赢的四枚**完全看不见**，
    //   而且那圈圆形光晕让四枚六边形看起来像四个**圆环**（= 对手的造型）——
    //   在整局最重要的一帧上，双编码不但失效，还指向了错的一方。
    //   现在：变暗 → 连线（**在棋子之下**）→ 赢的四枚重画（带 backing 挡住线）→
    //         沿**棋子自身轮廓**的光晕（⛔ 绝不是套一个圆圈）。
    if (line) {
      // ⭐ P2b T3：同一帧不再是「一次性全出」，而是被两条 0..1 的曲线驱动（来自 C4Fx.poseWin()）：
      //   lineProg —— 连线已经画到哪儿（⇒ **可见长度在增长**，这就是「逐段画出」）
      //   lit[i]   —— 第 i 枚亮到什么程度（画笔头走到它才开始亮 ⇒ **依次点亮**）
      // ⚠ 两个都默认「已完成」⇒ ⛔ 老调用方（P2a 的静态赢局帧、复盘截图、T6 减弱动态）
      //   一个像素都不变，这也是 e2e-p2a 那条连线门禁仍然成立的原因。
      const prog = typeof opts.lineProg === 'number' ? clamp01(opts.lineProg) : 1;
      const litOf = i => (opts.lit && typeof opts.lit[i] === 'number') ? clamp01(opts.lit[i]) : 1;

      if (dimA > 0) {
        fillRR(L.boardX, L.boardY, L.boardW, L.boardH, L.cell * 0.30, 'rgba(14,24,21,' + dimA + ')');
        // 赢的那几格从暗里捞回来 —— ⚠ **只捞已经亮起来的**：没轮到的那几枚必须还压在暗里，
        //   否则「依次点亮」在画面上只剩光晕在动，最该被看见的那个「一枚一枚亮过去」没了。
        for (let i = 0; i < line.length; i++) if (litOf(i) > 0.02) drawWell(L, line[i].c, line[i].r);
      }
      const a = L.center(line[0].c, line[0].r), b = L.center(line[line.length - 1].c, line[line.length - 1].r);
      // 画笔头：整条线的 prog 处（四子连珠恒是一条直线 ⇒ 线性插值就是「画到第几格」）
      const e = { x: a.x + (b.x - a.x) * prog, y: a.y + (b.y - a.y) * prog };
      const drawLine = (w, style, blur) => {
        if (prog <= 0.001) return;      // ⛔ 长度为 0 时**什么都不画**：lineCap='round' 会留一个亮圆点，
        ctx.save();                     //    在「线还没开始画」的那几帧凭空多出一颗光珠
        ctx.lineCap = 'round';
        ctx.lineWidth = w;
        ctx.strokeStyle = style;
        if (blur) { ctx.shadowColor = PAL.glow; ctx.shadowBlur = blur; }
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        ctx.restore();
      };
      drawLine(Math.max(3, L.cell * 0.15), 'rgba(255,255,255,0.95)', L.cell * 0.85);

      for (let i = 0; i < line.length; i++) {
        const p = line[i], w = litOf(i);
        if (w <= 0.02) continue;                     // 还没轮到这一枚 ⇒ 保持「其余变暗」的样子
        if (animAt(p.c, p.r)) continue;   // 这一枚还在半空中，下面那一段会画（⛔ 别画两遍）
        const q = L.center(p.c, p.r), o = cellOwner(bd, p.c, p.r);
        // ⚠ 亮起来是**淡入**（alpha），底下压着的正是同一枚被 dim 压暗的自己 ⇒ 读起来是「变亮」
        //   而不是「凭空冒出来一枚」。⭐ 淡入走得比 lit 快（×2.2）：backing 要尽快到全不透明，
        //   不然那条白线会从圆环的**空心**里透出来（本文件 backing 那段注释说的就是这个）。
        drawPiece(o, q.x, q.y, L.cell, { backing: PAL.well, alpha: Math.min(1, w * 2.2) });
        // 光晕沿这枚棋子**自己的**外轮廓走：赢的时候玩家看到的仍然是「我的六边形」/「我的圆环」
        // ⛔⛔ 绝不许改成「套一个圆圈/圆形光斑」—— P2a 第一版就是那样，四枚六边形当场看起来
        //   变成了**对手的圆环**，脚本全绿、只有肉眼看图抓得到（DESIGN §6.2 在最需要它的一帧失效）。
        ctx.save();
        ctx.globalAlpha = w;
        ctx.strokeStyle = PAL.glow; ctx.shadowColor = PAL.glow; ctx.shadowBlur = L.cell * 0.5 * w;
        ctx.lineWidth = Math.max(2, L.cell * 0.055);
        if (o === 0) hexPath(q.x, q.y, L.cell * (HEX_R + 0.04));
        else { ctx.beginPath(); ctx.arc(q.x, q.y, L.cell * (RING_R + 0.04), 0, Math.PI * 2); }
        ctx.stroke();
        ctx.restore();
      }

      // 最后一道：**细而半透明**的同一条线压在棋子之上，让「那条连线」读成连续的一根。
      // ⚠ 粗细/透明度是有上限的 —— 再粗再实就回到第一版那个「把赢的四枚糊掉」的 bug，
      //   剪影门禁（e2e-render ⑤ 的 shapeIoU）会先红给你看。
      drawLine(Math.max(2, L.cell * 0.06), 'rgba(180,255,228,0.60)', 0);
    }

    // ⭐ 下落中的棋子（DESIGN §6.3）。⚠ 画在**赢局那一段之后**：
    //   ① 它可能压在下面已有的那一枚上；② 赢的一手落地前不该被 dim 一起压暗
    //   （玩家刚松手的这一枚是全屏最该看清的东西）。
    if (anim) {
      for (const p of anim) {
        if (!p || !Number.isFinite(p.dy)) continue;   // ⛔ NaN 会把棋子静默画到画布外
        const q = L.center(p.c, p.r);
        drawPiece(p.player === 1 ? 1 : 0, q.x, q.y + p.dy * L.cell, L.cell, { sx: p.sx, sy: p.sy });
      }
    }

    // ⭐ 悬停预览（DESIGN §6.1）：落点虚影 + 悬在列上方的半透明棋子。
    //   ⚠ 画在最后：赢局的 dim 不该把预览一起吃掉，而且预览永远该在最上层。
    if (hasHover && landing >= 0) {
      const hp = opts.hoverPlayer === 1 ? 1 : 0;
      const g = L.center(hc, landing);
      drawPiece(hp, g.x, g.y, L.cell, { mode: 'ghost' });
      // 虚影 → 悬停子之间一条细引导线，说明「会掉到这里」
      const fx = L.cellX(hc) + L.cell / 2, fy = L.drop.y + L.drop.h / 2;
      ctx.save();
      ctx.setLineDash([4, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.beginPath(); ctx.moveTo(fx, fy + L.cell * 0.42); ctx.lineTo(fx, g.y - L.cell * 0.42); ctx.stroke();
      ctx.restore();
      drawPiece(hp, fx, fy, L.cell, { alpha: 0.72 });
    }

    // 热区：整列一个（⛔ 不是每格一个）
    if (!opts.noHits && typeof addHit === 'function') {
      const act = opts.action || 'COL';
      for (let c = 0; c < W; c++) {
        const r = L.colHits[c];
        addHit(r.x, r.y, r.w, r.h, act, { col: c });
      }
    }
    return L;
  }

  // ════════ ⑥ HUD ════════
  /**
   * 顶部信息条。⭐ **必须落在 safeTop（且是 #controls）之下** —— y 由 layout 给，
   * 别在这里另算（solitaire 实踩：HUD 画在 safeTop 之上，右上角被 #controls 压住，
   * 唯一入口点不动，只有真实鼠标点击的 E2E 才抓出来）。
   *
   * @param info { turn: 0|1, left: string, right: string }
   *   ⚠ 文案由调用方localize 后传进来（render 不做文案策略）；这里只负责**不溢出**：
   *     德/俄膨胀时 canvas 的 fillText 不换行也不截断，会直接压到右边那串上。
   */
  function drawHUD(info, L) {
    info = info || {};
    L = L || layout(GameGlobal.SW, GameGlobal.SH);
    const h = L.hud;
    fillRR(h.x, h.y, h.w, h.h, 16, PAL.hudCard);
    strokeRR(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1, 16, PAL.hudEdge, 1);

    const cy = h.y + h.h / 2;
    let tx = h.x + 14;
    if (info.turn === 0 || info.turn === 1) {
      const gs = h.h * 0.60;
      drawGlyph(info.turn, tx + gs / 2, cy, gs);
      tx += gs + 10;
    }
    const rightFont = '12px sans-serif';
    let rightW = 0;
    if (info.right) { ctx.font = rightFont; rightW = ctx.measureText(String(info.right)).width + 16; }
    const leftMaxW = h.w - (tx - h.x) - 14 - rightW;
    if (info.left) {
      const f = 'bold 16px sans-serif';
      ctx.font = f;
      txtL(wrapLines(info.left, leftMaxW, 1)[0], tx, cy, PAL.hudText, f);
    }
    if (info.right) txtR(String(info.right), h.x + h.w - 14, cy, PAL.hudSub, rightFont);
    return h;
  }

  const API = {
    W, H, PAL, HEX_R, RING_R, RING_I,
    layout, drawBackground, drawBoard, drawHUD, drawGlyph, drawPiece,
    cellOwner, landingRow
  };
  // 与 P1 五个模块同样冻结：挡住 `C4Render.drawBoard = () => {}` 这类「整屏还在、
  // 但画的是另一份东西」的误用（画错不会报错，是本仓最怕的失败模式）。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Render = API;
})(typeof self !== 'undefined' ? self : this);
