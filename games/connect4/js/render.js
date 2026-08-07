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
  // ⭐⭐ 量宽必须和画字用**同一个字号**：txt/txtL/txtR 会把 font 串过 engine 的 sfont()，
  //   那里按字号档乘 1 / 1.15 / 1.3。⛔ 用原始字号 measureText ⇒ 收敛出的宽度随后被放大
  //   15-30%，A⁺⁺ 档下文字互相压（2026-08-07 抓到，而仓库的 shot-fontscale 门禁
  //   当时根本没把 connect4 列进去，所以从没抓到过）。
  //   ⚠ 防御 typeof：本文件在 node 门禁里被 require（只跑 layout 那半边），那时没有 sfont。
  const SF = f => (typeof sfont === 'function' ? sfont(f) : f);
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
    hudSub:    'rgba(38,74,61,0.62)',
    // ⭐ 限时模式的倒计时（P2c T5 · §6.10）。⛔ 红线复核：这不是 §0.1 的 trade dress ——
    //   那条钉的是「**红/黄同形圆片** + 蓝色竖框栅栏」这套**棋子与盘体**的外观；
    //   这里是 HUD 上一颗告急数字牌，既不是棋子、也不是盘，且盘上一点红黄都没有。
    // ⚠ 灰度：timeHot ≈ 111、timeCool 是压在白卡上的淡色 ≈ 233 ⇒ 两态在灰度图上也分得开
    //   （但真正承载信息的是**条的长度和数字**，颜色只是第三重冗余，见 drawHUD 那段 ⭐⭐）。
    timeCool:  'rgba(38,74,61,0.10)',
    timeHot:   '#c8502f'
  };

  // 棋子尺寸（相对 cell）。⚠ 这三个数就是灰度门禁量的那个「覆盖率差」的来源，
  // 改之前先跑 `npm run test:c4:render`。
  const HEX_R  = 0.455;   // 六边形外接圆
  const RING_R = 0.425;   // 圆环外径
  const RING_I = 0.300;   // 圆环内径（**空心是判据**，⛔ 别填实、⛔ 别再往小调：
                          //   内径小 = 环变粗 = 剪影越来越像实心，IoU 门禁会先红给你看）

  // ── 威胁标记（P2b T4 · DESIGN §6.4 上半）──
  // ⭐⭐ 同 §6.2：**不许只靠颜色**分「我的威胁 / 对方的威胁」（约 8% 的男性有色觉障碍）。
  //   这里是**三重**编码，任意一重单独拿掉都还认得出：
  //     ① 形状：实心三角 ▲  vs  空心菱形 ◇
  //     ② 实心 / 空心：与两方棋子（实心六边形 / 空心圆环）**同一条规律** ⇒ 不用另学一套
  //     ③ 明暗：近墨黑 vs 奶白（与各自主人的棋子同色系 ⇒「三角是六边形那一方的」）
  //   ⛔ 别把标记改成「棋子的缩小版」：那样灰度下会读成「这格已经有子了」，
  //     而这格恰恰是空的 —— 把最该看清的一格变成假信息。
  // ⚠ 尺寸比棋子小一圈（0.36/0.34 vs 0.455/0.425）：标记要一眼是「记号」不是「棋子」。
  const TRI_R  = 0.360;   // 三角外接圆（先手 = 六边形那一方）
  const DIA_R  = 0.340;   // 菱形外接圆（后手 = 圆环那一方）
  const DIA_W  = 0.090;   // 菱形描边宽（**空心是判据**，⛔ 别填实）

  const HUD_H = 54;
  const MARGIN = 14;

  // ══ ⭐⭐ P2b T7 · DESIGN §6.9「竖屏留白」════════════════════════════════
  // §6.9：「7×6 棋盘在竖屏手机上偏宽，上下留白大 ⇒ 放对手角色立绘、威胁提示条、
  //         精准度条。**别浪费。**」
  //
  // ⚠⚠ 先说一件量出来的事实，它决定了这一节能做什么、不能做什么：
  //   **手机竖屏上棋盘是被「宽」封顶的，不是被「高」** —— 三个手机视口实测
  //   （safeTop=44 / ctrlH=34）：
  //     360×640  宽给 45.6 / 高给 52.4 → cell 45（盘宽 327 = 屏宽的 **91%**）
  //     390×844  宽给 49.7 / 高给 76.0 → cell 49
  //     414×896  宽给 53.0 / 高给 87.0 → cell 53
  //   ⇒ 竖向那一大块留白**变不成更大的棋盘**（盘已经贴着左右边距了）。
  //     ⛔ 别再想「把上下留白让给棋盘」这条路，它在手机上不存在。留白只能被**分配**。
  //
  // ⛔ 而 `BOARD_MAXW = 560` 那条死上限是**纯浪费**：768×1024 的平板竖屏上它把盘钉在
  //   560 宽，同时 HUD 与盘顶之间空着 205 px。删掉之后同一台平板 cell 76 → 96（+26%）。
  //   宽、高两条约束本来就够，⛔ 不需要第三条常数来「以防万一」。
  //
  // ⭐⭐ `tray` = 盘底之下的**净空**，是本 task 最重要的一个数：按钮行、结算的数据条、
  //   §6.9 的精准度条全排在这里。⛔⛔ 它**必须进 cell 的高度预算** —— 少了这一条，
  //   棋盘会一路长到把按钮挤到自己身上，而这不是假设：改之前实测
  //     · 1024×768 **对局中**［撤销］［菜单］就压着盘底 15 px 且掉出屏幕下沿；
  //     · 五视口 × 结算屏（含舒适模式）**10 个组合里有 6 个**按钮压在盘上。
  //   「⛔ 别压在盘上 —— 赢局那条连线必须一直看得见」是 §6.3 写死的，而它一直在被违反。
  const TRAY_MIN  = 92;    // 硬底线：一行**舒适模式**按钮（46×1.32≈61）+ 上下间隙
  const TRAY_MAX  = 176;   // 结算屏常规块高（数据条 40 + 12 + 46 + 12 + 46）+ 呼吸
  const TRAY_FRAC = 0.18;
  // 上方（HUD 与盘之间）的留白 = §6.9 的**立绘 / 威胁提示条留位**。
  // ⚠ 有上限，⛔ 不许把余量全给它：全给上面的话 HUD 会与盘拉开半屏，
  //   下面那条「HUD 贴顶栏钉住、⛔ 别飘在半空」等于反过来失效。
  const RESERVE_FRAC  = 0.34;
  const RESERVE_CELLS = 1.7;

  // ══ ⭐⭐ P2c T3 · DESIGN §6.7「对坐模式」════════════════════════════════════
  // 「棋盘旋转 180°，两人各自面向自己那侧（平板尤其自然）。」
  //
  // ⭐⭐ **产品判断：转的是 HUD，⛔ 不是棋盘。** 全文写在 main.js 的 f2fOn 那一节，
  //   这里只记与几何有关的那一半：对坐模式要在盘**上方**给对面那个人放一条**旋转 180°**
  //   的第二 HUD，⇒ 它必须像 `tray` 一样**进 cell 的高度预算**（`F2F_RESERVE`）。
  //   ⛔⛔ 少了这一条就是 T7 那个 bug 的镜像版：棋盘会一路长上去把第二 HUD 压在自己身上，
  //     而**画面看起来完全正常**（HUD 是半透明白卡，压在盘顶上只是「有点脏」）。
  //   ⚠ 它**不看 phase**：⛔ 结算时不许改变盘的几何（T7 已定：结算多出来的块从 tray 里长，
  //     棋盘一个像素都不动）。
  const F2F_RESERVE = HUD_H + 10;

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
   *
   * ⭐⭐ 竖向余量（§6.9）在这里被**显式分成三块并具名导出**，⛔ 不再是一个匿名的
   *   `slack * 0.38`：
   *     `L.reserve`  HUD 与悬停带之间的留白带 —— §6.9 的**对手立绘 / 威胁提示条**留位
   *     盘（悬停带 + 盘体）
   *     `L.tray`     盘底到底部安全区的净空 —— 按钮行 / 结算数据条 / §6.9 的**精准度条**
   *   ⚠ 具名不是为了好看：`tray` 进了 cell 的预算（见上面 TRAY_MIN 那段），
   *     调用方（main.js）也只许在 `L.tray` 里排东西 ⇒ 「按钮压到盘上」在结构上不可能。
   */
  function layout(SW, SH, safeTop, safeBottom, opts) {
    // ⭐ P2c T3：`opts.faceToFace` = 对坐模式（DESIGN §6.7）。⚠ 不给就是**逐位的老行为**
    //   （⛔ 老调用方——e2e-render / e2e-p2b-t7 的五视口门禁——一个像素都不变）。
    const f2f = !!(opts && opts.faceToFace);
    const GG = (typeof GameGlobal !== 'undefined') ? GameGlobal : null;
    const st = safeTop    == null ? (GG ? GG.safeTop    : 44) : safeTop;
    const sb = safeBottom == null ? (GG ? GG.safeBottom : 0)  : safeBottom;
    const ctrlH = GG ? GG.ctrlH : 34;

    const top0 = st + ctrlH + 8;                 // ⭐ 顶栏禁区之下
    // ⛔ 不再有 BOARD_MAXW：宽度只受左右边距约束（见文件上方那段 ⛔）。
    const availW = SW - MARGIN * 2;

    // ⚠ HUD **贴顶栏钉住**，⛔ 别跟着盘面一起垂直居中 —— 竖屏手机上 7×6 的盘偏宽、
    //   上下留白很大（DESIGN §6.9），把 HUD 也居中的话它会飘在半空、跟屏幕顶完全脱开
    //   （第一版截图肉眼看出来的：HUD 落在 y=224，像一张浮在空中的卡片）。
    const gapHud = 10;
    const hud = { x: MARGIN, y: top0, w: SW - MARGIN * 2, h: HUD_H };
    const belowHud = hud.y + hud.h + gapHud;
    const bottomLimit = SH - sb - MARGIN;
    const availH = Math.max(80, bottomLimit - belowHud);

    // 竖向预算：**盘下净空（tray）先扣掉**，剩下的才归盘。
    // 盘体高 = 6*cell + 2*pad，pad = 0.14*cell，悬停带 = 1.05*cell ⇒ 总高 ≈ 7.33*cell；
    // 横向 ≈ 7.28*cell。取两边的较小者。
    const trayBudget = Math.max(TRAY_MIN, Math.min(TRAY_MAX, Math.round(availH * TRAY_FRAC)));
    // ⭐ 对坐模式：盘**上方**那条给对面那个人的 HUD 与 tray 同一条纪律 —— 先扣掉，剩下的才归盘。
    const resvBudget = f2f ? F2F_RESERVE : 0;
    const cell = Math.max(18, Math.floor(Math.min(availW / 7.28,
      (availH - trayBudget - resvBudget) / 7.33)));

    const pad = Math.max(3, Math.round(cell * 0.14));
    const boardW = W * cell + pad * 2;
    const boardH = H * cell + pad * 2;
    const dropH = Math.round(cell * 1.05);
    const boardX = Math.round((SW - boardW) / 2);

    // ⭐ 余量分配（§6.9）。⚠ 第三项 `freeH - trayBudget` 是**硬约束**：无论比例怎么算，
    //   盘下都必须先留够 trayBudget，⛔ 上方那块只能拿它剩下的。
    const freeH = Math.max(0, availH - dropH - boardH);
    let reserve = Math.max(0, Math.round(Math.min(
      freeH * RESERVE_FRAC, cell * RESERVE_CELLS, freeH - trayBudget)));
    // ⭐ 对坐模式的**硬底线**（照 TRAY_MIN 的先例，⛔ 别写成「比例够大就行」）：
    //   第二 HUD 是一张 54 px 的卡，装不下就等于没做。cell 那一行已经先把它扣掉了 ⇒
    //   这里的 max 只是把上面三条上限里的舍入误差补回来。
    if (f2f) reserve = Math.max(reserve, F2F_RESERVE);
    const drop = { x: boardX, y: belowHud + reserve, w: boardW, h: dropH };
    const boardY = drop.y + drop.h;
    const trayY = boardY + boardH;

    const L = {
      SW, SH, safeTop: st, safeBottom: sb, ctrlH,
      cell, pad, boardX, boardY, boardW, boardH,
      hud, drop,
      // ⭐ §6.9 的两块留白（具名 ⇒ E2E 能直接问、P3/P5 直接往里填）
      reserve: { x: MARGIN, y: belowHud, w: SW - MARGIN * 2, h: reserve },
      tray:    { x: MARGIN, y: trayY,    w: SW - MARGIN * 2, h: Math.max(0, bottomLimit - trayY) },
      bottomLimit,
      // ⭐ 这一份 layout 是**按对坐模式算的**吗（P2c T3）。⚠ 存在的理由是「画的那份 layout
      //   与注册热区的那份必须是同一个对象」——门禁直接问 `G.L.faceToFace`，
      //   ⛔ 别让 E2E 自己再 layout() 一次去猜（那就成了「测的不是画的那份」）。
      faceToFace: f2f,
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

  // ════════ ③b 威胁标记（P2b T4 · DESIGN §6.4）════════
  function triPath(cx, cy, R) {
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const ang = -Math.PI / 2 + k * 2 * Math.PI / 3;    // 尖顶三角
      const x = cx + R * Math.cos(ang), y = cy + R * Math.sin(ang);
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  function diaPath(cx, cy, R) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx + R, cy);
    ctx.lineTo(cx, cy + R); ctx.lineTo(cx - R, cy);
    ctx.closePath();
  }

  /**
   * 一个威胁标记：`player` 一步落在这里就连成四。
   * @param cell 参照格宽（画在盘上就传 L.cell；两方共用一格时传缩小后的值）
   *
   * ⭐⭐ **本标记是静态的（零动画）** —— 这一条是写给 T6（§6.8 减弱动态）的：
   *   ⛔ 减弱动态**不该**门控它。它是**信息**不是动效，而「跳过一切非必要动画」的人
   *   （晕动症 / 舒适模式）恰恰更需要看得见的信息。T6 要门控的是 fx.js 那两处 `C4Fx.start`。
   *   ⚠ 反过来：将来若给它加呼吸/脉冲/闪烁，**那一层必须进 T6 的门控**（并且默认值仍是「标记在」，
   *     只是不动）—— ⛔ 别做成「减弱动态 = 连标记一起关掉」。
   */
  function drawThreat(player, cx, cy, cell) {
    ctx.save();
    if (player === 0) {
      // 先手：**实心**三角（近墨黑，同 p0 棋子的色系）+ 一圈亮边，压在暗色井上也读得出
      const R = cell * TRI_R;
      triPath(cx, cy, R);
      ctx.fillStyle = PAL.p0Fill; ctx.fill();
      ctx.lineWidth = Math.max(1.5, cell * 0.05);
      ctx.strokeStyle = PAL.glow;
      ctx.stroke();
    } else {
      // 后手：**空心**菱形（奶白，同 p1 棋子的色系）。空心 = 井底透出来，与圆环同一条规律。
      const R = cell * DIA_R, w = Math.max(2, cell * DIA_W);
      diaPath(cx, cy, R);
      ctx.lineWidth = w; ctx.strokeStyle = PAL.p1Fill; ctx.stroke();
      // 细暗边压住内外两侧：浅色标记落在浅色底（HOME 的图示、将来的浅色皮肤）上不许消失
      ctx.lineWidth = Math.max(1, cell * 0.022); ctx.strokeStyle = PAL.p1Edge;
      diaPath(cx, cy, R + w / 2); ctx.stroke();
      diaPath(cx, cy, R - w / 2); ctx.stroke();
    }
    ctx.restore();
  }

  /** 设置项 / 图例里插一个威胁标记。⚠ 自带一块**井色**底片 —— 标记的对比度是按井底调的，
   *  直接画在白卡片上时奶白的菱形会消失（这正是「只在盘上验过」最容易漏的一处）。 */
  function drawThreatGlyph(player, cx, cy, size) {
    fillRR(cx - size / 2, cy - size / 2, size, size, size * 0.26, PAL.well);
    drawThreat(player, cx, cy, size);
  }

  /**
   * 画一批威胁标记。@param threats [{ c, r, players:[0]|[1]|[0,1] }]（来自 C4Threats.cells）
   * ⭐ 同一格两方都能赢 ⇒ **两个标记都画**（各缩到 0.68、左右分开）。那是全局最关键的一格，
   *   只画其中一个等于把「他也能在这里赢」这件事藏起来 —— 恰好是本功能要解决的问题本身。
   */
  function drawThreats(L, threats) {
    if (!Array.isArray(threats) || !threats.length) return;
    for (const t of threats) {
      if (!t || !Number.isInteger(t.c) || !Number.isInteger(t.r)) continue;
      if (t.c < 0 || t.c >= W || t.r < 0 || t.r >= H) continue;
      const ps = Array.isArray(t.players) ? t.players : (t.player == null ? [] : [t.player]);
      if (!ps.length) continue;
      const p = L.center(t.c, t.r);
      if (ps.length === 1) {
        drawThreat(ps[0] === 1 ? 1 : 0, p.x, p.y, L.cell);
      } else {
        // ⚠ 0.62 / 0.18 不是随手挑的：两个标记的最外沿必须仍留在井里（半径 0.43 格以内），
        //   再大一点就会压到井的边框上，灰度门禁量的那个圆盘窗口会把它切掉一角。
        const s = L.cell * 0.62, dx = L.cell * 0.18;
        drawThreat(0, p.x - dx, p.y, s);
        drawThreat(1, p.x + dx, p.y, s);
      }
    }
  }

  // ════════ ③c ⭐ 双威胁的专属特效（P2b T5 · DESIGN §6.4 下半）════════
  // 「把整个游戏**最精彩的战术瞬间**变成一个**能看见能听见的事件**。」
  //
  // ⭐⭐ 形状是承重的：**在那两个落点上各炸开一圈光环**（+ 中心一下亮闪）。
  //   · ⛔ 不是全屏闪 / 不是横幅 —— 这个特效的教学价值全在「**指着那两格**」
  //     （§6.4：实战教学 + 旁观者也看得懂）。指错地方就只剩噪音。
  //   · ⛔ 也**不是**在两格之间连一条线：那会与赢局那条白色连线读成同一个东西
  //     （「他连成四了？」），在最需要说清楚的一帧上给出错的信息。
  //   · ⭐⭐ 扩散的轮廓用的是**威胁标记那两个形状**（先手实心三角的轮廓 ▲ / 后手菱形 ◇），
  //     ⛔ **绝不用棋子的形状**（六边形 / 圆环）。这条踩过两次才定下来：
  //       ① 第一版是「实心软光斑 + 圆」，截图肉眼一看就是**一枚落在空格里的 teal 棋子**；
  //       ② 第二版改成「沿触发方自己那枚棋子的轮廓」（照赢局光晕的规矩）—— 先手还好，
  //          **后手就成了一圈圆环**：而圆环正是后手棋子的造型，灰度下（glow 灰度 ~217
  //          vs 圆环 ~232，几乎同亮）那一格会被读成「这里已经有一枚后手的子了」。
  //     ⇒ 赢局光晕沿棋子轮廓走是对的（那里**真有一枚棋子**）；这里落点恒是**空格**，
  //       适用的是 drawThreat 那条：「⛔ 别把标记做成棋子的缩小版 —— 那样灰度下会读成
  //       『这格已经有子了』，而这格恰恰是空的」。用 ▲/◇ 还白送一件事：
  //       与常驻的威胁标记**同一套形状** ⇒ 观感上就是「那个记号刚刚被放大了一下」。
  //   · ⭐ 必须**空心 + 细 + 透**，且画在棋子与标记之下（drawBoard 里的位置是承重的）。
  //     ⚠ 环扩到 0.74 格（> 半格）会探进邻格，那是刻意的「涟漪」，但因此更不许粗、不许实。
  //
  // ⚠ 曲线全部来自 `C4Fx.poseFork()`（闭式解、node 里逐位可测），⛔ 这里不算时间。
  const FORK_R0 = 0.18;   // 光环起始半径（格）
  const FORK_R1 = 0.74;   // 散到的半径（⛔ 别再调大：越界压到邻格的棋子上）

  /** ⭐ 触发方的**威胁标记**形状（⛔ 不是棋子的形状，也别退回成一律画圆，见上面那段）。 */
  function forkPath(player, cx, cy, R) {
    if (player === 1) diaPath(cx, cy, R);
    else triPath(cx, cy, R);
  }

  /**
   * @param fork `C4Fx.poseFork()` 的返回值：{ cells:[{c,r}], rings:[0..1], flash:0..1, player }
   * ⚠ 传 null / 形状不对一律**什么都不画**（⛔ 别抛：动画层坏掉不该把一局对弈带走）。
   */
  function drawFork(L, fork) {
    if (!fork || !Array.isArray(fork.cells) || !fork.cells.length) return;
    const rings = Array.isArray(fork.rings) ? fork.rings : [];
    const flash = typeof fork.flash === 'number' ? clamp01(fork.flash) : 0;
    const pl = fork.player === 1 ? 1 : 0;
    for (const q of fork.cells) {
      if (!q || !Number.isFinite(q.c) || !Number.isFinite(q.r)) continue;
      if (q.c < 0 || q.c >= W || q.r < 0 || q.r >= H) continue;
      const p = L.center(q.c, q.r);
      ctx.save();
      // ① 中心那一下亮闪：短、**软而淡**、只在开头。⚠ 中心必须仍然透出井底
      //   （最内那档只有 0.16 ⇒ 灰度上它读不成「这格有子了」，这正是第一版翻车的地方）。
      if (flash > 0.01) {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, L.cell * 0.42);
        g.addColorStop(0.00, 'rgba(143,240,205,' + (0.16 * flash).toFixed(3) + ')');
        g.addColorStop(0.62, 'rgba(143,240,205,' + (0.22 * flash).toFixed(3) + ')');
        g.addColorStop(1.00, 'rgba(143,240,205,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, L.cell * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      // ② 两圈**空心**光环，一前一后散开（⭐「两条路」在观感上也是一二拍）
      for (const u0 of rings) {
        const u = clamp01(u0);
        if (u <= 0 || u >= 1) continue;              // 还没起 / 已经散完 ⇒ 一个像素都不画
        const e = 1 - (1 - u) * (1 - u);             // easeOut：起手快、末尾慢（涟漪）
        const rad = L.cell * (FORK_R0 + (FORK_R1 - FORK_R0) * e);
        const a = (1 - u) * (1 - u);                 // 淡出（⛔ 别线性：末尾会「啪」一下没）
        ctx.globalAlpha = a;
        ctx.strokeStyle = PAL.glow;
        // ⚠ 光晕半径压得很小：blur 一大，轮廓就被糊成一团，整格又变回一个亮斑 ——
        //   门禁量的「剪影 IoU vs 两方棋子」对这个数很敏感（blur 0.14 → 0.08 让 IoU 掉了一截）。
        ctx.shadowColor = PAL.glow; ctx.shadowBlur = L.cell * 0.08 * a;
        ctx.lineWidth = Math.max(1.5, L.cell * 0.075 * (1 - 0.55 * u));
        forkPath(pl, p.x, p.y, rad);
        ctx.stroke();
      }
      ctx.restore();
    }
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
   *   threats   ⭐ [{c,r,players}]（来自 C4Threats.cells）：一步就能成四的格子，两方不同标记。
 *             ⚠ render **不自己算**（它连 Bitboard 都不 require）—— 调用方算好递进来，
 *             这样「零搜索」那条红线只有 threats.js 一个地方要守。有 winLine 时自动忽略。
   *   fork      ⭐ `C4Fx.poseFork()` 的返回值（P2b T5 · §6.4 下半）：形成双威胁那一刻，
   *             在**那两个落点**上各炸开一圈光环。⚠ 与 threats 相互独立（一个是事件、
   *             一个是常驻信息），有 winLine 时同样忽略。
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


    // ⭐ 威胁标记（P2b T4 · DESIGN §6.4）。⛔ 位置是承重的：
    //   · 画在**井之上** —— 画在井之下 = 被井整个盖住、完全看不见（blockblast 的消行预览
    //     就是这么坏掉的，而且没人发现；DESIGN §6.4 那条 ⚠ 指的就是它）；
    //   · 画在**棋子之后** —— 威胁格恒是空格，与棋子不重叠，这里只是顺序上省心；
    //   · 画在**赢局那一段与悬停预览之前** —— 终局不该再标（下面 `!line`），
    //     而悬停的落点虚影必须压在标记之上（玩家正指着的那一格，预览优先）。
    // ⭐ 双威胁的光环（P2b T5）。⛔ 顺序是承重的：画在**威胁标记之前** ——
    //   光环是转瞬即逝的动效，▲/◇ 是要一直读得清的信息，⛔ 不许被光环糊住
    //   （P2a 实锤：赢局那圈圆形光晕把六边形盖住，双编码在最重要的一帧反过来骗人）。
    // ⚠ 它**不吃** threatHints 开关：那个开关关的是「常驻标记」这份信息，
    //   而这里是一个**事件**（§6.4 把两者分成了两条）—— 关掉标记的人照样该看见这一下。
    if (!line) drawFork(L, opts.fork);
    if (!line) drawThreats(L, opts.threats);

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
   * @param scale ⭐ 字号倍数（P2b T6 · DESIGN §6.8 舒适模式）。默认 1 ⇒ ⛔ 老调用方
   *   一个像素都不变。⚠ HUD 的**高度不跟着变**（那是 layout 的事，改了整盘几何会跟着挪）——
   *   16px×1.3 ≈ 21px 在 54px 高的卡片里仍然宽裕。
   */
  function drawHUD(info, L, scale, opts) {
    info = info || {};
    L = L || layout(GameGlobal.SW, GameGlobal.SH);
    const k = (typeof scale === 'number' && scale > 0) ? scale : 1;
    // ⭐⭐ P2c T3 · DESIGN §6.7「对坐模式」：同一张 HUD 卡可以画在**别的矩形**里、并且
    //   **整张旋转 180°** —— 那就是给坐在对面那个人读的第二条 HUD。
    //   ⚠ 旋转的支点是**这张卡自己的中心** ⇒ 卡片的外接矩形逐像素不变。
    //     ⭐ 这一条是承重的：它让「画出来的位置」与「热区/取样矩形」在结构上不可能漂
    //       （180° 绕自身中心的轴对齐矩形是它自己）。⛔ 别改成绕盘心或绕屏心转 ——
    //       那样卡片会飞到屏幕另一头，而 `h` 这个矩形还留在原地。
    //   ⛔ 两个参数都不给 = 逐位的老行为（老调用方一个像素都不变）。
    const rect = (opts && opts.rect) ? opts.rect : L.hud;
    const flip = !!(opts && opts.flip);
    const h = rect;
    if (flip) {
      ctx.save();
      ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-(h.x + h.w / 2), -(h.y + h.h / 2));
    }
    fillRR(h.x, h.y, h.w, h.h, 16, PAL.hudCard);
    strokeRR(h.x + 0.5, h.y + 0.5, h.w - 1, h.h - 1, 16, PAL.hudEdge, 1);

    const cy = h.y + h.h / 2;
    let tx = h.x + 14;
    if (info.turn === 0 || info.turn === 1) {
      const gs = h.h * 0.60;
      drawGlyph(info.turn, tx + gs / 2, cy, gs);
      tx += gs + 10;
    }
    // ⭐⭐ P2c T5 · DESIGN §6.10「限时模式」：倒计时**画在 HUD 卡里**。
    //   ⛔ 为什么不画在盘上/悬停带里（这两个是最容易想到的地方，都不行）：
    //     · 悬停带（L.drop）在**按住预览时整条让位**（drawDropBand 第一行就 return）——
    //       而那正是玩家最需要看时间的一刻；
    //     · 画在盘上/盘边 = 侵占棋盘几何 ⇒ 撞 P2b T7 的五视口版面门禁（§6.9「按钮不压棋盘」
    //       同源），而且**只在某些视口**压得到，正是那次抓出 8 个缺陷的那类失败。
    //   ⇒ HUD 是「现在发生什么」，倒计时就是现在发生的事；它有自己的矩形，
    //     ⭐ 且对坐模式（T3）那条第二 HUD **逐字复制** ⇒ 桌子两边都看得见，零额外几何。
    // ⭐⭐ 告急是**双编码**的（§6.2：靠颜色区分的信息一律形状 + 颜色，灰度可辨）：
    //   条的**长度**在缩、数字在变，颜色只是第三重冗余。⛔ 别做成「只变红」。
    const timer = (opts && opts.timer) ? opts.timer : null;
    const rightFont = Math.round(12 * k) + 'px sans-serif';
    // ⭐ P2b T7：右侧那串是**次要信息**（档位 / 第几局先手），先给它一个宽度上限，
    //   装不下由它自己截断。⛔ 别再让它把左边的主句挤掉：360 宽 + 舒适模式实测，
    //   「Player 1 to play」被压成了「Play…」—— 而那是全屏最该读到的一行（截图肉眼可见）。
    let rightW = 0, rightStr = '', leftStr = '';
    if (info.right) {
      ctx.font = SF(rightFont);
      rightStr = wrapLines(String(info.right), h.w * 0.42, 1)[0];
      rightW = ctx.measureText(clean(rightStr)).width + 16;
    }
    // ⭐ 倒计时的秒数占右侧那一格（⚠ 与 info.right **互斥**：main 在限时局里把 right 让空 ——
    //   T4 实锤，右侧那串次要信息会把左边的主句挤成半句话，而主句是全屏最该读到的一行）。
    let chip = null;
    if (timer) {
      const cw = Math.round(Math.max(34, 40 * k)), ch = Math.round(Math.min(h.h - 12, 30 * k));
      chip = { x: h.x + h.w - 12 - cw, y: cy - ch / 2, w: cw, h: ch };
      rightW = cw + 18;
    }
    const leftMaxW = Math.max(40, h.w - (tx - h.x) - 14 - rightW);
    if (info.left) {
      // ⭐ 主句**先缩字号、再截断**：截断丢的是信息，缩字号丢的只是几个像素。
      //   ⚠ 下限 11px（再小就该让它截断了，读不清的字不算信息）。
      let px = Math.round(16 * k);
      let f = 'bold ' + px + 'px sans-serif';
      ctx.font = SF(f);
      while (px > 11 && ctx.measureText(clean(info.left)).width > leftMaxW) {
        px -= 1; f = 'bold ' + px + 'px sans-serif'; ctx.font = SF(f);
      }
      leftStr = wrapLines(info.left, leftMaxW, 1)[0];
      txtL(leftStr, tx, cy, PAL.hudText, f);
    }
    if (rightStr) txtR(rightStr, h.x + h.w - 14, cy, PAL.hudSub, rightFont);
    // ⭐⭐ 倒计时：右边一颗数字牌 + 卡片下沿一条**长度 = 剩余占比**的进度条。
    //   ⚠ 两者都只读入参（frac / secs / urgent），⛔ 这里不算时间（同 lineProg / poseFork 的纪律：
    //     时间只有 C4Clock 一个真值源）。
    if (timer) {
      const urgent = !!timer.urgent;
      const f = Math.max(0, Math.min(1, typeof timer.frac === 'number' ? timer.frac : 1));
      const secs = Math.max(0, Math.round(timer.secs || 0));
      fillRR(chip.x, chip.y, chip.w, chip.h, chip.h / 2, urgent ? PAL.timeHot : PAL.timeCool);
      // ⚠ 数字字号跟着 chip 走（舒适模式 ×1.3 时它也大一圈），告急时再加一点 ——
      //   **大小本身也是一重编码**（灰度下颜色那一重会消失）。
      txt(String(secs), chip.x + chip.w / 2, chip.y + chip.h / 2,
          urgent ? '#fff' : PAL.hudText,
          'bold ' + Math.round(chip.h * (urgent ? 0.66 : 0.58)) + 'px sans-serif');
      // 进度条：底槽 + 实条。⛔ 实条从**左**往右缩（与「时间在流走」同向），⛔ 别居中缩。
      const bx = h.x + 14, bw2 = h.w - 28, by = h.y + h.h - 8, bh2 = 4;
      fillRR(bx, by, bw2, bh2, bh2 / 2, 'rgba(38,74,61,0.14)');
      if (f > 0.001) fillRR(bx, by, Math.max(bh2, bw2 * f), bh2, bh2 / 2, urgent ? PAL.timeHot : PAL.accent);
      // ⭐ 门禁按这两个矩形取样（⛔ 别在测试里手抄坐标）
      h.timerChip = chip;
      h.timerBar = { x: bx, y: by, w: bw2, h: bh2 };
      h.timerFill = { x: bx, y: by, w: Math.max(bh2, bw2 * f), h: bh2 };
    } else {
      h.timerChip = null; h.timerBar = null; h.timerFill = null;
    }
    if (flip) ctx.restore();
    // ⭐ P2c T4：把**真的画上去的那两串**带回去（缩过字号、截过断的那一份）。
    //   ⚠ 存在的理由只有一个：门禁要能问「那句话是不是被截成了半句」——
    //     主句一旦被右边那串次要信息挤成 «Player 1, allow that mov…»，屏幕上那个问题
    //     就没有被问出口，而画面看起来完全正常（截图实锤，⛔ 别让门禁只能靠肉眼）。
    //   ⛔ 老调用方一个像素都不变：返回的仍是同一个矩形对象，只是多挂两个字段。
    h.leftDrawn = leftStr; h.rightDrawn = rightStr;
    return h;
  }

  // ════════ ⑦ ⭐ 猜先（P2c T3 · DESIGN §6.7「猜先动画（抛硬币）」）════════
  //
  // ⭐⭐ **硬币的两面就是两方的棋子**（实心六边形 / 圆环）—— 零新美术，而且它顺手把
  //   「先手 = ▲ 这一枚」教给了第一次玩的人（§6.2 的双编码在这里白送一次）。
  // ⭐⭐ **落定那一面恒是「先手那枚」（棋子 0 = 六边形）**，这不是偷懒：本作里
  //   「先手 = 棋子 0」是**定义**，⛔ 不是我们能抛的东西。真正被「猜」出来的是
  //   **「这一局它归谁」**，那句话就是 `label` —— 它由调用方从 `g.humanFirst` 算，
  //   ⇒ 猜先只是把 state.js 已经定好的结果**演一遍**，⛔ 绝不是第二套先手规则。
  // ⚠ 曲线（转到哪一面、压得多扁）全部来自 `C4Fx.poseCoin()`，⛔ 这里不算时间
  //   （与 drawFork / drawBoard 的 lineProg 同一条纪律）。
  /**
   * @param coin { face: 0|1, w: 0..1 }  face = 这一帧朝上的那一面；w = 横向压缩
   *   （1 = 正对着你，0 = 立成一条边 ⇒ 换面就藏在这一瞬）
   * @param label 文案由调用方 localize 后传进来（render ⛔ 不做文案策略）
   * @returns 卡片矩形（⭐ 门禁按它取样，⛔ 别在测试里手抄坐标）
   */
  function drawCoin(L, coin, label, scale) {
    if (!coin) return null;
    const k = (typeof scale === 'number' && scale > 0) ? scale : 1;
    const face = coin.face === 1 ? 1 : 0;
    // ⛔ 夹到 0.06：真的画成 0 宽时那一帧硬币整个消失，看起来像闪了一下丢帧。
    const w = Math.max(0.06, Math.min(1, typeof coin.w === 'number' ? coin.w : 1));
    const cx = L.drop.x + L.drop.w / 2, cy = L.drop.y + L.drop.h / 2;
    const gs = Math.min(L.drop.h * 0.86, L.cell * 0.92);
    let px = Math.round(14 * k);
    let f = 'bold ' + px + 'px sans-serif';
    const maxTxt = L.drop.w - gs - 60;
    ctx.font = SF(f);
    while (px > 10 && ctx.measureText(clean(label || '')).width > maxTxt) {
      px -= 1; f = 'bold ' + px + 'px sans-serif'; ctx.font = SF(f);
    }
    const tw = label ? ctx.measureText(clean(label)).width : 0;
    const bw = Math.min(L.drop.w - 6, gs + tw + 46);
    const bh = Math.min(L.drop.h, Math.max(30, gs + 10));
    const rc = { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
    fillRR(rc.x, rc.y, rc.w, rc.h, bh / 2, PAL.hudCard);
    strokeRR(rc.x + 0.5, rc.y + 0.5, rc.w - 1, rc.h - 1, bh / 2, PAL.hudEdge, 1);
    const gx = rc.x + 14 + gs / 2;
    // ⚠ 借 drawPiece 的 sx/sy（支点在棋子底沿）：sy 恒 1 ⇒ 只横向压扁 ⇒ 就是一枚在翻的硬币。
    //   ⭐ 与真落下去的那一枚**共用同一条路径** ⇒ 猜先里看到的形状和盘上那枚一模一样。
    drawPiece(face, gx, cy, gs, { sx: w, sy: 1 });
    if (label) txtL(label, gx + gs / 2 + 10, cy, PAL.hudText, f);
    return rc;
  }

  const API = {
    W, H, PAL, HEX_R, RING_R, RING_I, TRI_R, DIA_R, DIA_W, FORK_R0, FORK_R1,
    // ⭐ P2b T7 · §6.9：门禁要拿这几个数当判据（⛔ 别在测试里手抄魔数）
    MARGIN, HUD_H, TRAY_MIN, TRAY_MAX,
    // ⭐ P2c T3 · §6.7 对坐模式：门禁要拿它当判据（⛔ 别在测试里手抄魔数）
    F2F_RESERVE,
    layout, drawBackground, drawBoard, drawHUD, drawCoin, drawGlyph, drawPiece,
    drawThreat, drawThreats, drawThreatGlyph, drawFork,
    cellOwner, landingRow
  };
  // 与 P1 五个模块同样冻结：挡住 `C4Render.drawBoard = () => {}` 这类「整屏还在、
  // 但画的是另一份东西」的误用（画错不会报错，是本仓最怕的失败模式）。
  Object.freeze(API);
  if (inNode) module.exports = API;
  else root.C4Render = API;
})(typeof self !== 'undefined' ? self : this);
