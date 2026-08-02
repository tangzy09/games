// ════════════════════════════════════════
// main.js —— 主循环（P2a Task 6）。把前五块（state / render / engine-client / input 三件套 /
// worker）接成**一局真的能玩的四子棋**：状态机 + 悬停预览 + 人机 + 同机双人 + 撤销 + 再来一局。
//
// ⭐ 三条承重的决定（每一条都有一个具体的、静默的失败模式在背后）：
//
// ① **落子只走 onHoldEnd，⛔ dispatch 里的 'COL' 是空分支。**
//    engine/input.js:51-56 白纸黑字：快点一下 `onHoldEnd` 与 `onAction` **都会发**。
//    两边各落一次 = 一次点击落两子（而且只在「快点」时复现，按住两秒反而正常）——
//    那是最像玄学的一类 bug。⇒ 列的落子**唯一入口**是 onHoldEnd，'COL' 分支留着只为
//    「热区确实注册了」这件事有个名字。
//    ⚠ 取消（指针离开画布 / touchcancel）发的是 `onHoldEnd(-1, -1)` ⇒ colAt 落空 ⇒
//      **清预览而不落子**，这正是它给 (-1,-1) 而不是不发的理由。
//
// ② **「AI 思考中」是独立标志 `G.thinking`，⛔ 不是一个 phase。**
//    做成 phase 的话，思考期间玩家点［撤销］［菜单］［再来一局］全被吞（状态机里没有那些
//    转移）——玩家的反应是再点几下，然后觉得游戏卡死了。现在思考只挡「落子」这一件事
//    （而且那时本来就不是他的回合），其余按钮一律照常。
//
// ③ ⭐⭐ **轻松档（1-5 级）不许被共用的 loading 态拖住**（DESIGN §9.2 的产品判断 / §11b 第 3 条）。
//    它们根本不调求解器（实测中位 0.0022 ms），一转菊花就会让「轻松」显得比顶档还重。
//    判据是 `ConnectAI.usesSolver(moves, tier)` —— 它自己不搜，恒微秒级。
//    ⚠ 但它**判不出**「开局库没装 ⇒ 这一次会慢得离谱」（n=9 无库实测 4-5 秒，装库后 0.5 ms，
//      10,171×；空盘那一档是几十分钟）。那一层必须自己查 **`EngineClient.bookReady()`**。
//    ⛔⛔ 主线程上的 `Book.status()` 是**假的**：真正的 install 发生在 Worker 里，
//      主线程这份 book.js 只是 ai.js 的依赖，状态恒 'none'。查它 = 永远以为没库。
//      唯一入口是 EngineClient.bookReady()（它转述的是 Worker 那一份）。
//
// ⚠ 主线程为什么会加载 solver/book（index.html 原注释说「不加载」，那条已过期）：
//   `state.js` 要 `ConnectAI.paramsDigest()`，UI 要 `ConnectAI.usesSolver()` ⇒ ai.js 必须在
//   主线程；而 ai.js 顶层吃 Bitboard / RulesClassic / Solver / 裸标识符 PRNG，book.js 是 ai→solver
//   的同层依赖。⇒ 六个模块照 tests/test-browser-globals.js 的 LOAD_ORDER 全量加载。
//   ⛔ 但**一行搜索都不许在主线程跑**：`Solver.solve` / `ConnectAI.decide` / `ConnectAI.aiMove`
//     在本文件里一次都不出现，AI 落子一律经 EngineClient → Worker。
//
// ⚠ G 用 var 不用 const —— 顶层 const 不挂 window，E2E/调试要 window.G（snake 实踩）。
// ════════════════════════════════════════
var G = {
  phase: 'HOME',      // HOME → PLAYING → OVER
  g: null,            // C4State 的对局对象（唯一真值，⛔ 别在 G 上再存一份盘面）
  tier: 3,            // 人机局选中的档位（HOME 上可改）
  gameNo: 0,          // ⭐ 交替先手全靠它（state.js 的 newGame 管，⛔ 别在这覆盖）
  thinking: false,    // 见文件头 ②
  spin: 0,            // 「思考中」的三点动画相位
  aiSeq: 0,           // 每次撤销/换局 +1 ⇒ 在飞的 AI 结果作废（⛔ 别拿旧局面的答案画这一手）
  hoverCol: -1,       // 悬停预览的列（-1 = 无）
  holdCol: -1,        // 这次按下是从哪一列起的；<0 = 没按在盘上 ⇒ 松手不落子
  notice: '',         // 诚实措辞（求解器不可用 / 开局库准备中），⛔ 绝不谎报
  result: null,       // { t, winner, line }
  lastAiMs: 0,        // 实测用：上一次 AI 落子耗时
  lastAiHeavy: false, // 实测用：上一次是不是真的转了菊花
  L: null             // 本帧的 layout（输入回调用它算列号，⛔ 别各算各的）
};

// ════════ 小工具 ════════

function curLayout() { return C4Render.layout(GameGlobal.SW, GameGlobal.SH); }

/** 单行文字**缩到装得下**（canvas 的 fillText 不换行也不截断，德/俄膨胀会直接压到隔壁）。 */
function fitTxt(s, cx, cy, maxW, color, weight, size) {
  let px = size;
  ctx.font = weight + ' ' + px + 'px sans-serif';
  while (px > 10 && ctx.measureText(clean(s)).width > maxW) {
    px -= 1;
    ctx.font = weight + ' ' + px + 'px sans-serif';
  }
  txt(s, cx, cy, color, weight + ' ' + px + 'px sans-serif');
}

function btn(x, y, w, h, label, action, data, style) {
  style = style || {};
  const on = !style.disabled;
  fillRR(x, y, w, h, 12, on ? (style.bg || C4Render.PAL.accent) : 'rgba(97,119,111,0.26)');
  if (style.outline) strokeRR(x + 0.5, y + 0.5, w - 1, h - 1, 12, style.outline, 1.5);
  fitTxt(label, x + w / 2, y + h / 2, w - 16,
         on ? (style.fg || '#fff') : 'rgba(38,74,61,0.45)', style.weight || 'bold', style.size || 16);
  if (on) addHit(x, y, w, h, action, data || {});
}

/** 赢家的那四格（rules-classic 只回「谁赢了」，不回连线；drawBoard 的 winLine 要它）。 */
const WIN_DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
function findWinLine(bd, w) {
  const CW = C4Render.W, CH = C4Render.H;
  for (let c = 0; c < CW; c++) for (let r = 0; r < CH; r++) for (const d of WIN_DIRS) {
    const cells = [0, 1, 2, 3].map(k => ({ c: c + d[0] * k, r: r + d[1] * k }));
    if (cells.every(p => p.c >= 0 && p.c < CW && p.r >= 0 && p.r < CH
                         && C4Render.cellOwner(bd, p.c, p.r) === w)) return cells;
  }
  return null;   // ⚠ 找不到 = 掩码与 winner 对不上；画面上就是「赢了但没连线」，不至于白屏
}

/** ⭐ 「第几号玩家」只在这里定义一次：Player 1 永远坐 humanPlayer 这个位。
 *  同机双人局里 humanFirst 逐局翻转 ⇒ Player 1 手里的棋子（六边形/圆环）也跟着换，
 *  这正是 DESIGN §1.1 第 2 条要的「每局自动交替先手」。 */
function seatName(g, player) {
  return T(player === C4State.humanPlayer(g) ? 'game.p1' : 'game.p2');
}
/** 这一局谁先手（先手恒 = 棋子 0 = 六边形）。 */
function firstSeatName(g) { return seatName(g, 0); }

// ════════ 「思考中」的可见反馈 ════════
// ⚠ 只有真的会搜的那一手才开（见文件头 ③）。计时器**必须**在关的时候清掉，
//   否则一局结束后它还在后台每 220 ms 重绘整屏。
let _spinTimer = null;
function setThinking(on) {
  if (G.thinking === on) return;
  G.thinking = on;
  if (_spinTimer) { clearInterval(_spinTimer); _spinTimer = null; }
  if (on) { G.spin = 0; _spinTimer = setInterval(() => { G.spin = (G.spin + 1) % 3; renderAll(); }, 220); }
  // ⭐ **翻标志就必须重画**（截图实锤：只翻不画的话，「思考中」要等三点动画的第一次
  //   tick（220 ms）才出现——短的那些手根本来不及显示，等于没有反馈）。
  //   ⛔ 别指望调用方记得跟一句 renderAll：漏了不报错，只是反馈静默消失。
  renderAll();
}

// ════════ 状态机 ════════

function interactive() {
  return G.phase === 'PLAYING' && !!G.g && !G.thinking && C4State.isHumanTurn(G.g);
}

function goHome() {
  G.aiSeq++; setThinking(false);
  G.phase = 'HOME'; G.g = null; G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = '';
  renderAll();
}

function startGame(mode, tier) {
  G.aiSeq++; setThinking(false);
  G.result = null; G.hoverCol = -1; G.holdCol = -1; G.notice = '';
  const opts = { mode: mode, gameNo: G.gameNo };
  // ⛔ 别在这里算 humanFirst：交替先手 + 「顶档必须玩家先手」两条都写在 state.js 的
  //    newGame 里（只写一处才守得住），这里传了就等于把那条兜底覆盖掉。
  if (mode === 'ai') opts.tier = tier;
  G.g = C4State.newGame(opts);
  G.phase = 'PLAYING';
  renderAll();
  maybeAI();
}

/** 再来一局：⭐ gameNo +1 ⇒ 下一局先手换人（同机双人），人机局同理轮换。 */
function again() {
  const prev = G.g;
  if (!prev) { goHome(); return; }
  G.gameNo++;
  startGame(prev.mode, prev.mode === 'ai' ? prev.tier : undefined);
}

function checkOver() {
  const bd = C4State.boardOf(G.g);
  const t = RulesClassic.terminal(bd);
  if (t === null) return false;
  const w = RulesClassic.winnerOf(t);
  G.phase = 'OVER';
  G.result = { t: t, winner: w, line: w === null ? null : findWinLine(bd, w) };
  G.hoverCol = -1;
  setThinking(false);   // ⚠ 放最后：它会重画一帧，前面的字段得先摆好
  return true;
}

/** 落一子（人或 AI 都走这里）。⚠ 先问 canPlay —— C4State.play 对非法列是**抛**的。 */
function applyMove(col) {
  if (!G.g || !C4State.canPlay(G.g, col)) return false;
  G.g = C4State.play(G.g, col);
  G.hoverCol = -1;
  const over = checkOver();
  renderAll();
  if (!over) maybeAI();
  return true;
}

/** ⭐ 撤销要退回**该玩家走**的那个位置。
 *  只退一手的话，人机局里 AI 会立刻把它走回来 —— 表现为「撤销按钮没反应」，零报错。 */
function doUndo() {
  const g = G.g;
  if (!g || !g.moves.length) return;
  G.aiSeq++; setThinking(false); G.notice = '';
  let n = g.moves.length - 1;
  if (g.mode === 'ai') {
    while (n > 0 && (n % 2) !== C4State.humanPlayer(g)) n--;
  }
  G.g = C4State.rewindTo(g, n);
  G.phase = 'PLAYING';
  G.result = null; G.hoverCol = -1; G.holdCol = -1;
  renderAll();
  maybeAI();   // ⚠ 兜底：万一退到的仍是 AI 的回合（human 局恒 false），别把局面卡死
}

// ════════ AI ════════

function maybeAI() {
  const g = G.g;
  if (!g || G.phase !== 'PLAYING' || g.mode !== 'ai') return;
  if (C4State.isHumanTurn(g)) return;
  if (G.thinking) return;
  requestAI();
}

function requestAI() {
  const g = G.g;
  const my = ++G.aiSeq;
  const moves = g.moves.slice();
  const tier = g.tier, seed = g.seed;

  // ⭐ 这一手到底会不会搜。⛔ 别按 phase、别按「反正是 AI 的回合」开菊花（见文件头 ③）。
  const heavy = ConnectAI.usesSolver(moves, tier);
  G.lastAiHeavy = heavy;
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const fresh = () => my === G.aiSeq;
  const took = () => Math.round(((typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now()) - t0);

  const fire = () => EngineClient.ai(moves, tier, seed).then(r => {
    if (!fresh()) return;                 // 撤销 / 换局把它作废了
    if (r && r.stale) return;             // 被更新的一次顶掉（engine-client 的约定，不是错误）
    setThinking(false);
    G.lastAiMs = took();
    G.notice = '';                        // 这次成功了 ⇒ 上一次的降级措辞该撤下（⛔ 别让红字赖着）
    // ⛔ 兜底也要**响**：Worker 回了个落不下去的列（列满 / 越界 / undefined）时，
    //    静默不动 = 棋局永远停在 AI 的回合，玩家只看到「思考中」消失了却没人落子。
    if (!applyMove(r.col)) { G.notice = T('game.engineDown'); renderAll(); }
  }, e => {
    if (!fresh()) return;
    setThinking(false);
    G.lastAiMs = took();
    // ⛔ 绝不编一个「看起来合理」的列号顶上（DESIGN §2.4）。如实说，并退回菜单可选。
    G.notice = T('game.engineDown');
    renderAll();
  });

  if (!heavy) { fire(); return; }         // ⭐ 轻松档：不转菊花，直接发

  setThinking(true);
  // ⚠⚠ 库没就位时**绝不许**对 n ≤ 9 的局面调求解器档（DESIGN §9.2 的断崖）。
  //    usesSolver 判不出这一层，必须自己查 EngineClient.bookReady()。
  if (moves.length <= 9 && !EngineClient.bookReady()) {
    G.notice = T('game.enginePrep');
    renderAll();
    EngineClient.ensureBook().then(() => {
      if (!fresh()) return;
      if (!EngineClient.bookReady()) {
        setThinking(false);
        G.notice = T('game.engineSlow');   // 诚实停下，⛔ 不硬算（那是几秒到几十分钟）
        renderAll();
        return;
      }
      G.notice = '';
      fire();
    });
    return;
  }
  fire();
}

// ════════ 输入 ════════

function setHover(c) {
  if (G.hoverCol === c) return;
  G.hoverCol = c;
  renderAll();
}

function onHold(x, y) {
  G.holdCol = -1;
  if (!interactive()) return;               // 按在按钮上/不是我的回合 ⇒ 交给 onAction
  const L = G.L || curLayout();
  const c = L.colAt(x, y);
  if (c < 0) return;
  G.holdCol = c;
  setHover(C4State.canPlay(G.g, c) ? c : -1);
}

function onHoldMove(x, y) {
  if (G.holdCol < 0) return;
  const L = G.L || curLayout();
  const c = L.colAt(x, y);                  // 拖出盘外 ⇒ -1 ⇒ 预览消失（但手指还按着）
  setHover(c >= 0 && C4State.canPlay(G.g, c) ? c : -1);
}

function onHoldEnd(x, y) {
  const from = G.holdCol;
  G.holdCol = -1;
  if (from < 0) return;                     // 这次按下不是从盘上起的 ⇒ 让 onAction 去处理按钮
  const L = G.L || curLayout();
  const c = L.colAt(x, y);                  // ⚠ 取消发的是 (-1,-1) ⇒ c=-1 ⇒ 清预览而不落子
  G.hoverCol = -1;
  if (c < 0 || !interactive() || !C4State.canPlay(G.g, c)) { renderAll(); return; }
  applyMove(c);
}

function dispatch(action, data) {
  switch (action) {
    // ⛔ 空分支是**故意的**（文件头 ①）：快点一下时 onHoldEnd 已经落过子了，
    //    这里再落一次 = 一次点击落两子。热区仍由 render.drawBoard 注册，别删。
    case 'COL': return;

    case 'PLAY_AI':    G.gameNo = 0; startGame('ai', G.tier); return;
    case 'PLAY_HUMAN': G.gameNo = 0; startGame('human'); return;
    case 'TIER':       G.tier = data.tier; renderAll(); return;
    case 'UNDO':       doUndo(); return;
    case 'AGAIN':      again(); return;
    case 'HOME':       goHome(); return;
    default: return;
  }
}

// ════════ 绘制 ════════

const TIER_PRESETS = [
  { key: 'menu.easy',    tier: 3  },   // 轻松：不调求解器，秒出
  { key: 'menu.medium',  tier: 12 },   // 进阶：求解器 + 明面失误率
  { key: 'menu.perfect', tier: 20 }    // 完美：零失误（⭐ state.js 会强制玩家先手）
];

function drawHome(L) {
  const SW = L.SW, SH = L.SH;
  const es = EngineClient.state();
  const dead = es.worker === 'dead';

  txt(T('app.title'), SW / 2, L.hud.y + 46, '#1f6e4d', 'bold 30px sans-serif');
  // 两枚棋子当门面：进游戏前就先看见「两方不是同一个圆换色」
  C4Render.drawGlyph(0, SW / 2 - 34, L.hud.y + 108, 44);
  C4Render.drawGlyph(1, SW / 2 + 34, L.hud.y + 108, 44);

  const bw = Math.min(300, SW - 60), bx = (SW - bw) / 2;
  let y = L.hud.y + 156;

  txt(T('menu.tier'), SW / 2, y, C4Render.PAL.hudSub, '13px sans-serif');
  y += 18;
  const cw = (bw - 16) / 3;
  TIER_PRESETS.forEach((p, i) => {
    const sel = G.tier === p.tier;
    btn(bx + i * (cw + 8), y, cw, 40, T(p.key), 'TIER', { tier: p.tier }, {
      bg: sel ? C4Render.PAL.accent : 'rgba(255,255,255,0.92)',
      fg: sel ? '#fff' : C4Render.PAL.hudText,
      outline: sel ? null : C4Render.PAL.hudEdge,
      size: 14, disabled: dead
    });
  });
  y += 40 + 6;
  txt(T('game.level', { n: G.tier }), SW / 2, y + 8, C4Render.PAL.hudSub, '12px sans-serif');
  y += 26;

  btn(bx, y, bw, 52, T('menu.vsAI'), 'PLAY_AI', {}, { disabled: dead });
  y += 62;
  btn(bx, y, bw, 52, T('menu.vsHuman'), 'PLAY_HUMAN', {}, { bg: '#61776f' });
  y += 70;

  // ⭐ 引擎状态如实写出来（DESIGN §2.4：降级必须**可见**）
  let note = '';
  if (dead) note = T('game.engineDown');
  else if (es.worker !== 'alive') note = T('game.enginePrep');
  else if (es.book === 'loading') note = T('game.bookLoading');
  else if (es.book === 'failed') note = T('game.engineSlow');
  if (note) {
    ctx.font = '12px sans-serif';
    wrapLines(note, bw, 2).forEach((ln, i) =>
      txt(ln, SW / 2, y + i * 16, dead ? '#a33' : C4Render.PAL.hudSub, '12px sans-serif'));
  }
}

/** 悬停带里的一条状态：思考中三点 / 诚实措辞。（有悬停预览时那里是棋子，不画这个） */
function drawDropBand(L) {
  if (G.hoverCol >= 0) return;
  const cx = L.drop.x + L.drop.w / 2, cy = L.drop.y + L.drop.h / 2;
  if (G.thinking) {
    const label = T('game.thinking');
    ctx.font = 'bold 14px sans-serif';
    const tw = ctx.measureText(clean(label)).width;
    const bw = Math.min(L.drop.w - 8, tw + 60);
    fillRR(cx - bw / 2, cy - 17, bw, 34, 17, 'rgba(255,255,255,0.92)');
    txt(label, cx - 14, cy, C4Render.PAL.hudText, 'bold 14px sans-serif');
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + bw / 2 - 34 + i * 10, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = i === G.spin ? C4Render.PAL.accent : 'rgba(47,143,106,0.28)';
      ctx.fill();
    }
    return;
  }
  if (G.notice) {
    ctx.font = '12px sans-serif';
    wrapLines(G.notice, L.drop.w - 24, 2).forEach((ln, i) =>
      txt(ln, cx, cy - 7 + i * 15, '#a33', '12px sans-serif'));
  }
}

function hudInfo(g) {
  if (G.phase === 'OVER' && G.result) {
    const w = G.result.winner;
    if (w === null) return { turn: null, left: T('game.draw') };
    if (g.mode === 'ai') {
      return { turn: w, left: T(w === C4State.humanPlayer(g) ? 'game.win' : 'game.lose') };
    }
    return { turn: w, left: T('game.wins', { p: seatName(g, w) }) };
  }
  const turn = C4State.turnOf(g);
  if (g.mode === 'ai') {
    if (C4State.isHumanTurn(g)) return { turn: turn, left: T('game.yourTurn') };
    // ⛔ 轮到 AI 但**没有在算**且已如实报错时，⛔ 绝不能继续显示「思考中」——
    //    截图实锤：Worker 挂了之后 HUD 一直写着 Thinking，红字却说引擎不可用，
    //    两句话互相打架，而「思考中」那句是假的。
    return { turn: turn, left: T(!G.thinking && G.notice ? 'game.stopped' : 'game.thinking') };
  }
  return { turn: turn, left: T('game.turnOf', { p: seatName(g, turn) }) };
}

function drawPlay(L) {
  const g = G.g;
  const bd = C4State.boardOf(g);
  const line = G.result && G.result.line;

  C4Render.drawBoard(bd, {
    L: L,
    hoverCol: G.hoverCol,
    hoverPlayer: C4State.turnOf(g),
    winLine: line,
    dim: line ? true : 0,
    lastMove: null
  });

  const info = hudInfo(g);
  // ⭐ 右侧那串就是「先手指示」：同机双人局逐局翻转，第二局肉眼可见换了人。
  info.right = g.mode === 'ai'
    ? T('game.level', { n: g.tier })
    : T('game.gameLine', { n: g.gameNo + 1, p: firstSeatName(g) });
  C4Render.drawHUD(info, L);

  drawDropBand(L);

  // 按钮行：钉在盘面下方的留白里（⛔ 别压在盘上——赢局那条连线必须一直看得见）
  const gap = 12;
  const rowH = 46;
  let ry = L.boardY + L.boardH + 16;
  const maxY = L.SH - L.safeBottom - 12 - rowH;
  if (ry > maxY) ry = maxY;
  const marg = 14;
  const full = L.SW - marg * 2;

  if (G.phase === 'OVER') {
    const w3 = (full - gap * 2) / 3;
    btn(marg, ry, w3, rowH, T('game.again'), 'AGAIN', {});
    btn(marg + w3 + gap, ry, w3, rowH, T('game.undo'), 'UNDO', {}, { bg: '#61776f' });
    btn(marg + (w3 + gap) * 2, ry, w3, rowH, T('game.menu'), 'HOME', {}, { bg: '#61776f' });
  } else {
    const w2 = (full - gap) / 2;
    btn(marg, ry, w2, rowH, T('game.undo'), 'UNDO', {}, {
      bg: '#61776f', disabled: !g.moves.length
    });
    btn(marg + w2 + gap, ry, w2, rowH, T('game.menu'), 'HOME', {}, { bg: '#61776f' });
  }
}

function renderAll() {
  clearHits();
  const L = curLayout();
  G.L = L;
  C4Render.drawBackground(L);
  if (G.phase === 'HOME' || !G.g) drawHome(L);
  else drawPlay(L);
}

// ════════ 启动 ════════

async function boot() {
  await Platform.hydrate([CFG.key('lang'), CFG.key('sfx')]);
  restoreAudioPrefs();
  Portal.boot();
  await Ads.init();
  I18N.onChange(() => { Controls.render(); renderAll(); });
  await I18N.setLang(I18N.detect());
  initCanvas();
  // ⭐ 三件套 opt-in：按住预览、松手才落（DESIGN §6.1）。
  //   ⚠ onAction 只在 `dist<10 && dt<500` 才发 —— 按住想两秒再松手那一手会被静默丢掉，
  //     这正是 T3 给引擎加这三个回调的理由。落子**只**在 onHoldEnd 里做（文件头 ①）。
  Input.bind({ onAction: dispatch, onHold: onHold, onHoldMove: onHoldMove, onHoldEnd: onHoldEnd });
  window.addEventListener('resize', () => { initCanvas(); renderAll(); });
  Controls.render();
  renderAll();

  // ⭐ 首屏**不 await** 引擎：让玩家先看见界面（DESIGN §9.2）。
  EngineClient.onChange(() => renderAll());
  EngineClient.start().then(okv => {
    renderAll();
    if (okv) EngineClient.ensureBook();   // 3.6 MB 开局库懒加载，到位后自然变快
  });
}

boot();
