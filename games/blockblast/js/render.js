// ════════════════════════════════════════
// render.js — 布局 + 全屏重画（引擎契约：每帧 clearHits() → 从 G 重画 → addHit()）。
// ⚠ 棋盘/托盘区域**故意不 addHit()**：它们由 drag.js 用 pointer 事件处理。
//    引擎 Input 的 tap 因此在这些区域无区域可命中，放下拼块的那次 pointerup
//    不会被 hitTest 误判成一次点击（DESIGN §5）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  // 调色板由**当前皮肤**决定（Themes）。皮肤只换颜色，**绝不改任何规则**。
  const PAL = {
    bg1: '#6d3fb4', bg2: '#8e5ad0',
    boardBg: 'rgba(40,26,74,0.55)', cellEmpty: 'rgba(255,255,255,0.06)',
    text: '#ffffff', sub: 'rgba(255,255,255,0.75)',
    ghostOk: 'rgba(255,255,255,0.35)', lineHint: 'rgba(255,236,140,0.55)',
  };
  let COLORS = Themes.THEMES[0].blocks.slice();
  const COLOR_BY_ID = {};
  // ⚠ 按块在表中的**序号**取色，不要用 id 的字符串哈希 —— 哈希会撞车，
  //    实机出现过「一手三块全是黄的」（34 块 % 7 色，序号取色则均匀铺开）。
  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  function applyTheme(id) {
    const t = Themes.byId(id);
    PAL.bg1 = t.bg1; PAL.bg2 = t.bg2; PAL.boardBg = t.boardBg; PAL.cellEmpty = t.cellEmpty;
    PAL.accent = t.accent;
    PAL.lineHint = hexA(t.accent, 0.55);        // 消行预览的高亮跟着主题走
    COLORS = t.blocks.slice();
    Pieces.PIECES.forEach((p, i) => { COLOR_BY_ID[p.id] = COLORS[i % COLORS.length]; });
    if (typeof API !== 'undefined') API.COLORS = COLORS;
  }
  const colorOf = id => COLOR_BY_ID[id] || COLORS[4];
  // ⚠ 不能在这里调 applyTheme('candy')：它内部要写 API.COLORS，而 API 在文件末尾才定义
  //    ⇒ TDZ 报错「Cannot access 'API' before initialization」，整个 render 模块挂掉。
  //    初始化挪到 API 定义之后（见文件末尾）。

  const L = {};   // 布局（drag.js 也用）

  // ⚠ 所有 UI 都相对「居中的游戏区 play」排布，**不是相对屏幕全宽**。
  // 用 SW 当基准在手机竖屏下看不出问题，一到桌面宽屏就把托盘甩到屏幕两端、Best 贴边（实机踩到）。
  const PLAY_MAX = 480;                       // 游戏区宽度上限：再宽就不像手游了

  function layout() {
    const { SW, SH, safeTop } = GameGlobal;
    const playW = Math.min(SW, PLAY_MAX);
    const playX = Math.round((SW - playW) / 2);
    const avail = SH - safeTop;

    // 棋盘：受游戏区宽度和可用高度双重约束（要给 HUD/Next/托盘留位）
    const boardW = Math.min(playW - 24, avail * 0.50);
    const cell = Math.floor(boardW / 8);
    const bw = cell * 8;

    L.playX = playX; L.playW = playW;
    L.cx = playX + playW / 2;                 // 游戏区中心（浮字/HUD 都用它，别再用 SW/2）
    L.cell = cell;
    L.boardX = Math.round(playX + (playW - bw) / 2);
    L.boardW = bw;
    L.trayH = Math.round(cell * 3.4);         // 够放下 3 格高的块（>3 高的块很少，见 computeTray）

    // 整块内容（HUD → Next → 棋盘 → 托盘）**垂直居中**于可用高度。
    // 不居中的话，桌面高屏下内容全挤在上半屏、底下一大片空白（实机踩到）。
    const gapNext = 48, gapBoard = Math.round(cell * 0.7), gapTray = Math.round(cell * 0.55);
    const contentH = 76 + gapNext + gapBoard + bw + gapTray + L.trayH;   // 76 = 金币行 + 分数行 + Best 行
    const top = Math.max(safeTop + 8, safeTop + (avail - contentH) / 2);

    L.hudY = Math.round(top + 46);            // 金币行画在 hudY-34,所以 hudY 上方要留空间
    L.nextY = Math.round(L.hudY + gapNext);
    L.boardY = Math.round(L.nextY + gapBoard);
    L.trayY = Math.round(L.boardY + bw + gapTray);
    return L;
  }

  /** 棋盘坐标 → 屏幕 */
  const cellXY = (r, c) => ({ x: L.boardX + c * L.cell, y: L.boardY + r * L.cell });
  /** 屏幕 → 棋盘格（可能越界，调用方自己判断）*/
  const cellAt = (x, y) => ({ r: Math.floor((y - L.boardY) / L.cell), c: Math.floor((x - L.boardX) / L.cell) });
  /**
   * 托盘布局：块**按实际大小（= 棋盘格 cell）显示**，拿起来不再变大。
   *
   * ⚠ 物理约束：三块最坏情况（都 5 格宽）横排要 15 格宽，而棋盘只有 8 格宽 —— 永远塞不下。
   *   所以按「这一手的实际尺寸」动态定 scale：绝大多数手 scale=1（真·实际大小、拖起来零跳变），
   *   只有碰到超宽/超高的块才略缩，避免相邻块重叠。
   * 槽位按**原始三块**（含已放下的）算，所以拖走一块后，剩下的块不会乱跳。
   */
  function computeTray(s) {
    const hand = Dealer.hand(s.seed, s.streamIndex);      // 原始一手（不管放没放）
    const cell = L.cell;
    const availW = L.playW - 12;
    const cellsW = hand.reduce((a, p) => a + p.wdt, 0);   // 三块的总格宽
    const maxH = Math.max(...hand.map(p => p.h));

    // 先压间距、再缩块 —— 这样「实际大小」能覆盖尽可能多的手。
    // ⚠ GAP_MIN 不能太小:压到 5px 时三块会糊成连续一排,玩家看不出是三块独立的块(截图验收发现)。
    const GAP_MIN = Math.max(10, Math.round(cell * 0.28)), GAP_NICE = Math.round(cell * 0.4);
    let scale = 1;
    let gap = (availW - cellsW * cell) / 2;               // 1:1 时还剩多少空间当间距
    if (gap < GAP_MIN || maxH * cell > L.trayH) {
      // 这一手实在放不下（超宽或超高）才缩：把间距压到最小，剩下的靠缩放
      scale = Math.min((availW - GAP_MIN * 2) / (cellsW * cell), L.trayH / (maxH * cell));
      gap = GAP_MIN;
    } else {
      gap = Math.min(gap, GAP_NICE);
    }

    const size = cell * scale;
    const totalW = cellsW * size + gap * 2;
    let x = L.playX + (L.playW - totalW) / 2;
    L.trayScale = scale;
    L.traySlots = hand.map(p => {
      const bw = p.wdt * size, bh = p.h * size;
      const rect = { x, y: L.trayY + (L.trayH - bh) / 2, w: bw, h: bh, size, piece: p };
      x += bw + gap;
      return rect;
    });
  }

  /** 托盘槽的中心 */
  function traySlotCenter(i) {
    const r = L.traySlots[i];
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  /** 屏幕点命中哪个托盘槽（-1 = 没命中）。给一点容差，手指不必压得很准。*/
  function traySlotAt(x, y) {
    if (!L.traySlots) return -1;                  // 菜单界面没有托盘（兜底，别抛）
    const pad = L.cell * 0.35;
    for (let i = 0; i < L.traySlots.length; i++) {
      const r = L.traySlots[i];
      if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) return i;
    }
    return -1;
  }

  // ── 一个方块（高光斜角立体感）──
  function drawBlock(x, y, size, color, alpha) {
    const g = size * 0.14;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    fillRR(x + 1, y + 1, size - 2, size - 2, size * 0.18, color);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';                       // 顶部高光
    roundRect(x + g, y + g * 0.7, size - g * 2, size * 0.22, size * 0.08); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';                             // 底部阴影
    roundRect(x + g, y + size - g * 1.6, size - g * 2, size * 0.16, size * 0.08); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── 水晶（消行时才收集，所以它长在方块上）──
  const CRYSTAL = {
    blue:   { fill: '#67e8f9', edge: '#0891b2', emoji: '💎' },
    pink:   { fill: '#f0abfc', edge: '#a21caf', emoji: '🔮' },
    orange: { fill: '#fdba74', edge: '#c2410c', emoji: '🔶' },
    green:  { fill: '#86efac', edge: '#15803d', emoji: '🟢' },   // 第三章「翡翠矿脉」
    violet: { fill: '#c4b5fd', edge: '#6d28d9', emoji: '🟣' },
  };
  function drawCrystal(x, y, size, kind) {
    const cr = CRYSTAL[kind] || CRYSTAL.blue;
    const cx = x + size / 2, cy = y + size / 2, r = size * 0.26;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = cr.fill; ctx.fill();
    ctx.strokeStyle = cr.edge; ctx.lineWidth = Math.max(1.5, size * 0.05); ctx.stroke();
    ctx.beginPath();                                    // 高光
    ctx.moveTo(cx - r * 0.35, cy - r * 0.2); ctx.lineTo(cx, cy - r * 0.62); ctx.lineTo(cx + r * 0.18, cy - r * 0.25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  }
  // 石块：不可消除的惰性格 —— 视觉上必须一眼看出「这玩意儿不会消失」
  function drawStone(x, y, size) {
    fillRR(x + 1, y + 1, size - 2, size - 2, size * 0.18, '#6b7280');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(x + size * 0.16, y + size * 0.12, size * 0.68, size * 0.18, size * 0.06); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (const [dx, dy, w, h] of [[0.22, 0.42, 0.2, 0.12], [0.55, 0.55, 0.22, 0.14], [0.3, 0.7, 0.3, 0.1]]) {
      roundRect(x + size * dx, y + size * dy, size * w, size * h, size * 0.04); ctx.fill();
    }
  }

  function drawPieceAt(piece, x, y, size, alpha) {
    const col = colorOf(piece.id);
    for (const [dr, dc] of piece.cells) drawBlock(x + dc * size, y + dr * size, size, col, alpha);
  }

  /** 主菜单 + 关卡地图（关卡是「审核员 5 秒能看见」的外壳之一，也是进度感的载体）*/
  function renderMenu() {
    clearHits();
    layout();
    const { SW, SH } = GameGlobal;
    const G = root.G;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    const cx = L.cx;
    txt(T('blockblast.title'), cx, GameGlobal.safeTop + 46, '#fff', 'bold 30px sans-serif');
    txtLWrap(T('blockblast.tagline'), cx - 150, GameGlobal.safeTop + 78, 300, PAL.sub, '12px sans-serif', 16);

    // ── 章节页签（3 章 × 10 关；主题演进：每章一个 accent 色）──
    const chs = Levels.CHAPTERS;
    if (!G.chapter) {
      // 自动定位到「第一个还没打完的关」所在章；全通了就停在最后一章
      const cur = Levels.LEVELS.find(lv => !(G.progress[lv.id] > 0) && (lv.id === 1 || (G.progress[lv.id - 1] || 0) > 0));
      G.chapter = cur ? Levels.chapterOf(cur.id).id : chs[chs.length - 1].id;
    }
    const gy0 = GameGlobal.safeTop + 116;
    const tabW = (Math.min(L.playW, 380) - 16) / chs.length;
    const tabX0 = cx - (tabW * chs.length) / 2;
    chs.forEach((c2, i) => {
      const x = tabX0 + i * tabW, on = G.chapter === c2.id;
      fillRR(x + 2, gy0, tabW - 4, 34, 10, on ? hexA(c2.accent, 0.30) : 'rgba(0,0,0,0.18)');
      if (on) { ctx.strokeStyle = c2.accent; ctx.lineWidth = 2; roundRect(x + 2, gy0, tabW - 4, 34, 10); ctx.stroke(); }
      txt(T('blockblast.chapter' + c2.id), x + tabW / 2, gy0 + 12, on ? '#fff' : PAL.sub, 'bold 11px sans-serif');
      let st = 0; for (let id = c2.from; id <= c2.to; id++) st += G.progress[id] || 0;
      txt('★ ' + st + '/30', x + tabW / 2, gy0 + 25, on ? c2.accent : 'rgba(255,255,255,0.4)', '9px sans-serif');
      addHit(x + 2, gy0, tabW - 4, 34, 'CHAPTER', { id: c2.id });
    });

    // 当前章的 10 关（2 行 × 5）
    const ch = chs.find(c2 => c2.id === G.chapter) || chs[0];
    const cols = 5, cell = Math.min(58, (L.playW - 40) / cols);
    const gx0 = cx - (cols * cell) / 2, gy1 = gy0 + 42;
    for (let id = ch.from; id <= ch.to; id++) {
      const i = id - ch.from, r = Math.floor(i / cols), c = i % cols;
      const x = gx0 + c * cell, y = gy1 + r * cell;
      const stars = G.progress[id] || 0;
      const unlocked = id === 1 || (G.progress[id - 1] || 0) > 0;
      fillRR(x + 3, y + 3, cell - 6, cell - 6, 10, unlocked ? (stars ? hexA(ch.accent, 0.50) : 'rgba(255,255,255,0.20)') : 'rgba(0,0,0,0.25)');
      txt(unlocked ? String(id) : '🔒', x + cell / 2, y + cell / 2 - 5, '#fff', 'bold 16px sans-serif');
      if (stars) txt('★'.repeat(stars), x + cell / 2, y + cell - 14, '#ffe08a', '10px sans-serif');
      if (unlocked) addHit(x + 3, y + 3, cell - 6, cell - 6, 'PLAY_LEVEL', { id });
    }

    // 章末宝箱：全章 10 关都 ≥1 星才能领（星星经济的章节兑现点）
    const cy = gy1 + 2 * cell + 6;
    const claimed = (G.wallet.chests || []).includes(ch.id);
    const claimable = Shop.canClaimChest(G.wallet, G.progress, ch);
    let doneN = 0; for (let id = ch.from; id <= ch.to; id++) if (G.progress[id] > 0) doneN++;
    fillRR(cx - 120, cy, 240, 30, 10, claimable ? '#f59e0b' : 'rgba(0,0,0,0.20)');
    txt('🎁 ' + (claimed ? T('blockblast.chestDone')
                : claimable ? T('blockblast.chestClaim', { n: ch.chest })
                : T('blockblast.chest') + ' · ' + doneN + '/10'),
        cx, cy + 15, claimed ? '#7ef2a0' : claimable ? '#fff' : PAL.sub, 'bold 12px sans-serif');
    if (claimable) addHit(cx - 120, cy, 240, 30, 'CHEST', { id: ch.id });

    const by = cy + 44;

    // 每日谜题（同一天全球同一条块流）：主按钮玩今天，旁边小按钮开日历（补玩过去 7 天）
    const doneToday = Daily.playedToday(G.profile, new Date());
    fillRR(cx - 150, by, 107, 46, 12, doneToday ? 'rgba(255,255,255,0.18)' : '#22c55e');
    txt('\u{1F4C5} ' + T('blockblast.daily'), cx - 96, by + 17, '#fff', 'bold 12px sans-serif');
    txt(doneToday ? T('blockblast.dailyDone')
                  : (G.profile.dailyStreak ? T('blockblast.dailyStreak', { n: G.profile.dailyStreak }) : ''),
        cx - 96, by + 33, PAL.sub, '9px sans-serif');
    addHit(cx - 150, by, 107, 46, 'PLAY_DAILY', {});
    fillRR(cx - 39, by, 34, 46, 12, 'rgba(255,255,255,0.18)');
    txt('\u{1F5D3}', cx - 22, by + 23, '#fff', '15px sans-serif');
    addHit(cx - 39, by, 34, 46, 'PAGE_CAL', {});

    // 无尽：有没打完的局 ⇒ 主按钮变「继续」（带当前分数），旁边小按钮才是重开 ——
    // 原来一点就 newRun()，静默毁掉玩家没打完的局。
    const rs = resumableScore();
    if (rs !== null) {
      fillRR(cx + 5, by, 107, 46, 12, '#f59e0b');
      txt('▶ ' + T('blockblast.continueRun'), cx + 58, by + 18, '#fff', 'bold 12px sans-serif');
      txt(String(rs), cx + 58, by + 34, PAL.sub, '10px sans-serif');
      addHit(cx + 5, by, 107, 46, 'PLAY_ENDLESS', {});
      fillRR(cx + 116, by, 34, 46, 12, 'rgba(255,255,255,0.18)');
      txt('↻', cx + 133, by + 23, '#fff', 'bold 16px sans-serif');
      addHit(cx + 116, by, 34, 46, 'NEW_RUN', {});
    } else {
      fillRR(cx + 5, by, 145, 46, 12, '#f59e0b');
      txt(T('blockblast.endless'), cx + 77, by + 18, '#fff', 'bold 15px sans-serif');
      txt(T('blockblast.best') + ' ' + G.best, cx + 77, by + 34, PAL.sub, '10px sans-serif');
      addHit(cx + 5, by, 145, 46, 'PLAY_ENDLESS', {});
    }

    // 成就 / 皮肤 / 公平 / 设置
    const by2 = by + 56, bw = Math.min(84, (L.playW - 58) / 4);
    const tabs = [
      ['\u{1F3C6} ' + T('blockblast.achievements'), 'PAGE_ACH'],
      ['\u{1F3A8} ' + T('blockblast.skins'), 'PAGE_SKIN'],
      ['\u2696 ' + T('blockblast.fair'), 'PAGE_FAIR'],
      ['⚙ ' + T('blockblast.settings'), 'PAGE_SET'],
    ];
    tabs.forEach(([label, act], i) => {
      const x = cx - (bw * tabs.length + 8 * (tabs.length - 1)) / 2 + i * (bw + 8);
      fillRR(x, by2, bw, 36, 10, 'rgba(255,255,255,0.16)');
      txt(label, x + bw / 2, by2 + 18, '#fff', '10px sans-serif');
      addHit(x, by2, bw, 36, act, {});
    });
    const totalStars = Object.values(G.progress).reduce((a, v) => a + v, 0);
    txt(T('blockblast.stars', { n: totalStars }) + '  \u00b7  ' +
        T('blockblast.achProgress', { a: G.profile.unlocked.length, b: Achievements.total() }),
        cx, by2 + 52, PAL.sub, '12px sans-serif');

    // 金币/商店 + 水晶图鉴 + 天使图鉴
    fillRR(cx - 125, by2 + 64, 78, 32, 10, 'rgba(0,0,0,0.22)');
    txt('\u{1FA99} ' + G.wallet.coins + '   \u002B', cx - 86, by2 + 80, PAL.accent, 'bold 12px sans-serif');
    addHit(cx - 125, by2 + 64, 78, 32, 'PAGE_SHOP', {});
    fillRR(cx - 39, by2 + 64, 78, 32, 10, 'rgba(0,0,0,0.22)');
    txt('\u{1F48E} ' + T('blockblast.codex'), cx, by2 + 80, PAL.accent, 'bold 11px sans-serif');
    addHit(cx - 39, by2 + 64, 78, 32, 'PAGE_DEX', {});
    fillRR(cx + 47, by2 + 64, 78, 32, 10, 'rgba(0,0,0,0.22)');
    txt('\u{1F47C} ' + (G.wallet.angels | 0) + '/' + Shop.ANGELS.total, cx + 86, by2 + 80, PAL.accent, 'bold 10px sans-serif');
    addHit(cx + 47, by2 + 64, 78, 32, 'PAGE_ANG', {});

    // 「下一个目标」提示条：把收集系统串成打开即见的短期目标（宝箱 > 今日任务 > 临近皮肤 > 临近连续奖励）
    const goal = (() => {
      for (const c2 of chs) {
        if (Shop.canClaimChest(G.wallet, G.progress, c2)) {
          return { label: '\u{1F381} ' + T('blockblast.chestClaim', { n: c2.chest }), act: 'CHAPTER', data: { id: c2.id } };
        }
      }
      const qs = Quests.status(G.profile, Daily.dayNo(new Date()));
      const qd = qs.filter(q => q.done).length;
      if (qd < 3) return { label: '\u{1F4CB} ' + T('blockblast.quests') + '  ' + qd + '/3', act: 'PAGE_QUESTS', data: {} };
      // 天使榜：下一个差得不远（≤600 分）就当目标挂出来
      const gN = Ghosts.nextTarget(G.best);
      if (gN && gN.score + 1 - G.best <= 600) {
        return { label: '\u{1F3C6} ' + T('blockblast.goalGhost', { n: gN.score + 1 - G.best, name: gN.name }), act: 'PAGE_LADDER', data: {} };
      }
      const nextSkin = Themes.THEMES
        .filter(t => t.games != null && !Themes.isUnlocked(t, 0, [], G.wallet.gamesPlayed))
        .sort((a, b) => a.games - b.games)[0];
      if (nextSkin && nextSkin.games - (G.wallet.gamesPlayed | 0) <= 5) {
        return { label: '\u{1F3A8} ' + T('blockblast.goalSkin', { n: nextSkin.games - (G.wallet.gamesPlayed | 0) }), act: 'PAGE_SKIN', data: {} };
      }
      const st0 = G.profile.dailyStreak | 0;
      const nm = Daily.STREAK_MILESTONES.find(m => m.days > (G.profile.streakRewardedAt || 0) && m.days > st0 && m.days - st0 <= 3);
      if (nm) return { label: '\u{1F525} ' + T('blockblast.goalStreak', { n: nm.days - st0 }), act: 'PAGE_CAL', data: {} };
      return null;
    })();
    if (goal) {
      const gw2 = Math.min(L.playW - 60, 300);
      fillRR(cx - gw2 / 2, by2 + 104, gw2, 26, 13, 'rgba(0,0,0,0.25)');
      txt(goal.label, cx, by2 + 117, PAL.accent, 'bold 11px sans-serif');
      addHit(cx - gw2 / 2, by2 + 104, gw2, 26, goal.act, goal.data);
    }
  }

  /** 成就页 */
  function renderAchievements() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.achievements'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt(T('blockblast.achProgress', { a: G.profile.unlocked.length, b: Achievements.total() }),
        cx, GameGlobal.safeTop + 54, PAL.sub, '13px sans-serif');

    // 分页（每页 20 条 = 2 列 × 10 行，任何屏都放得下）——
    // 原来「放不下就不画」，矮屏后半成就永远看不见：看不见的成就 = 不存在的留存钩子。
    const got = new Set(G.profile.unlocked);
    const PER = 20, all = Achievements.ACHIEVEMENTS;
    const pages = Math.max(1, Math.ceil(all.length / PER));
    const page = Math.max(0, Math.min(pages - 1, G.achPage || 0));
    const cols = 2, cw = (L.playW - 24) / cols, ch = 34;
    all.slice(page * PER, page * PER + PER).forEach((a, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const x = L.playX + 12 + c * cw, y = GameGlobal.safeTop + 76 + r * ch;
      const on = got.has(a.id);
      fillRR(x + 2, y, cw - 6, ch - 4, 7, on ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)');
      txtL((on ? '\u2605 ' : '\u00b7 ') + T('blockblast.ach.' + a.id), x + 10, y + (ch - 4) / 2,
           on ? PAL.accent : 'rgba(255,255,255,0.45)', '11px sans-serif');
    });
    if (pages > 1) {
      const py = GameGlobal.safeTop + 76 + 10 * ch + 10;
      txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
      if (page > 0) {
        fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx - 110, py, 44, 32, 'ACH_PAGE', { d: -1 });
      }
      if (page < pages - 1) {
        fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx + 66, py, 44, 32, 'ACH_PAGE', { d: 1 });
      }
    }
    backButton();
  }

  /** 皮肤页（靠星星解锁 —— 三星评级的兑现出口）*/
  function renderSkins() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    const stars = Object.values(G.progress).reduce((a, v) => a + v, 0);
    txt(T('blockblast.skins'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt(T('blockblast.stars', { n: stars }), cx, GameGlobal.safeTop + 54, PAL.sub, '13px sans-serif');

    txtR('\u{1FA99} ' + G.wallet.coins, L.playX + L.playW - 28, GameGlobal.safeTop + 54, PAL.accent, 'bold 13px sans-serif');
    // 分页（16 套 = 3 页 × 6）
    const PER = 6;
    const pages = Math.max(1, Math.ceil(Themes.THEMES.length / PER));
    const page = Math.max(0, Math.min(pages - 1, G.skinPage || 0));
    Themes.THEMES.slice(page * PER, page * PER + PER).forEach((t, i) => {
      const y = GameGlobal.safeTop + 80 + i * 76;
      const on = Themes.isUnlocked(t, stars, G.wallet.themes, G.wallet.gamesPlayed), cur = G.theme === t.id;
      fillRR(L.playX + 14, y, L.playW - 28, 66, 12, cur ? 'rgba(255,255,255,0.26)' : 'rgba(0,0,0,0.20)');
      txtL(T('blockblast.theme.' + t.id), L.playX + 28, y + 20, on ? '#fff' : 'rgba(255,255,255,0.4)', 'bold 14px sans-serif');
      t.blocks.forEach((c, k) => { fillRR(L.playX + 28 + k * 22, y + 34, 18, 18, 4, c); });   // 色板预览
      if (!on && t.coins) {
        // 金币皮肤：显示价格；买得起就整行可点（金币经济的消耗出口）
        const afford = G.wallet.coins >= t.coins;
        txtR('\u{1FA99} ' + t.coins + '  ' + T('blockblast.buy'), L.playX + L.playW - 28, y + 20,
             afford ? PAL.accent : 'rgba(255,255,255,0.4)', 'bold 11px sans-serif');
        if (afford) addHit(L.playX + 14, y, L.playW - 28, 66, 'BUY_SKIN', { id: t.id });
      } else if (!on && t.games != null) {
        // 盘数皮肤：玩满 N 盘白送（进度直接写在行上）
        txtR('\u{1F512} ' + T('blockblast.skinPlays', { a: Math.min(G.wallet.gamesPlayed | 0, t.games), b: t.games }),
             L.playX + L.playW - 28, y + 20, PAL.sub, '11px sans-serif');
      } else if (!on) {
        txtR('\u{1F512} ' + T('blockblast.skinLocked', { n: t.stars }), L.playX + L.playW - 28, y + 20, PAL.sub, '11px sans-serif');
      } else if (cur) {
        txtR(T('blockblast.equipped'), L.playX + L.playW - 28, y + 20, '#7ef2a0', 'bold 11px sans-serif');
      } else {
        txtR(T('blockblast.equip'), L.playX + L.playW - 28, y + 20, PAL.accent, 'bold 11px sans-serif');
        addHit(L.playX + 14, y, L.playW - 28, 66, 'EQUIP', { id: t.id });
      }
    });
    if (pages > 1) {
      const py = GameGlobal.safeTop + 80 + PER * 76 + 8;
      txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
      if (page > 0) {
        fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx - 110, py, 44, 32, 'SKIN_PAGE', { d: -1 });
      }
      if (page < pages - 1) {
        fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
        txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
        addHit(cx + 66, py, 44, 32, 'SKIN_PAGE', { d: 1 });
      }
    }
    backButton();
  }

  /** 公平页 —— 本作最强的差异化：三条**可验证**的承诺（头部产品没人敢写）
   *  也是 App Store 的第一张截图：审核员 30 秒试玩只会看到「又一个 block puzzle」，
   *  差异化必须在这一屏里 5 秒说清（对抗 4.3(a)）。所以它要**填满屏幕**，不能一半空白。
   */
  function renderFair() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx, w = L.playW - 44;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    // 先量高度，再整体垂直居中（原来从顶部堆，下半屏一片空白）
    ctx.font = '13px sans-serif';
    const paras = ['fair1', 'fair2', 'fair3'].map(k => wrapLines(T('blockblast.' + k), w, 6));
    const textH = paras.reduce((a, ls) => a + ls.length * 19 + 16, 0);
    const BAR_H = 132, SEED_H = 58;
    const total = 44 + textH + BAR_H + SEED_H;
    let y = Math.max(GameGlobal.safeTop + 24, GameGlobal.safeTop + (SH - GameGlobal.safeTop - total) / 2 - 40);

    txt(T('blockblast.fairTitle'), cx, y, '#fff', 'bold 21px sans-serif');
    y += 40;

    for (const lines of paras) {
      lines.forEach((ln, i) => txtL(ln, L.playX + 22, y + i * 19, PAL.sub, '13px sans-serif'));
      y += lines.length * 19 + 16;
    }

    // 出块权重可视化 —— 「固定且公开」这条承诺的证据，光靠文字说服力不够
    const bars = [
      { pct: 25, color: '#7ef2a0', label: '25%' },
      { pct: 55, color: PAL.accent, label: '55%' },
      { pct: 20, color: '#f0abfc', label: '20%' },
    ];
    const bw2 = w - 90;
    bars.forEach((b, i) => {
      const by = y + i * 34;
      // 用真实的块画出「小/中/大」示意
      const cs = 11;
      const shape = [[[0, 0]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]][i];
      shape.forEach(([r, c]) => drawBlock(L.playX + 24 + c * (cs + 1), by + 2 + r * (cs + 1), cs, b.color));
      fillRR(L.playX + 78, by + 6, bw2, 13, 6, 'rgba(0,0,0,0.25)');
      fillRR(L.playX + 78, by + 6, bw2 * b.pct / 100, 13, 6, b.color);
      txtR(b.label, L.playX + L.playW - 22, by + 12, PAL.sub, 'bold 11px sans-serif');
    });
    y += BAR_H;

    // 本局种子：玩家可以拿它复现整条块流 —— 承诺 1 的「可验证」就落在这里
    fillRR(L.playX + 22, y, w, 50, 10, 'rgba(0,0,0,0.26)');
    txt(T('blockblast.fairSeed', { s: G.s ? G.s.seed : '—' }), cx, y + 19, PAL.accent, 'bold 14px sans-serif');
    txt(T('blockblast.fairVerify'), cx, y + 38, PAL.sub, '11px sans-serif');

    backButton();
  }

  /** 商店：看广告领币 + 一次性去广告 IAP */
  function renderShop() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.shop'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt('\u{1FA99} ' + G.wallet.coins, cx, GameGlobal.safeTop + 56, PAL.accent, 'bold 16px sans-serif');

    // 看广告领币（玩家**主动**触发的激励视频 —— 唯一允许的广告形态之一）
    const y1 = GameGlobal.safeTop + 90;
    fillRR(L.playX + 20, y1, L.playW - 40, 58, 12, '#22c55e');
    txt('\u{1F4FA} ' + T('blockblast.getCoins'), cx, y1 + 29, '#fff', 'bold 15px sans-serif');
    addHit(L.playX + 20, y1, L.playW - 40, 58, 'AD_COINS', {});

    // 广告政策直接印在商店页（2026-07-31 定稿：前 50 盘零插屏、之后每 10 盘至多 1 个、只在赢时）——
    // 这是卖点，不是免责声明。IAP 已封存不接（假按钮比没有按钮更伤信任）。
    const y2 = y1 + 74;
    fillRR(L.playX + 20, y2, L.playW - 40, 66, 12, 'rgba(0,0,0,0.20)');
    ctx.font = '11px sans-serif';
    wrapLines(T('blockblast.adPolicy'), L.playW - 70, 3)
      .forEach((ln, i) => txt(ln, cx, y2 + 20 + i * 15, PAL.sub, '11px sans-serif'));

    backButton();
  }

  /** 每日日历：本月完成打勾；过去 7 天（含今天）可点进去补玩 —— 补玩只记成绩不计 streak */
  function renderCal() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    const now = new Date();
    txt(T('blockblast.daily'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt(now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'),
        cx, GameGlobal.safeTop + 54, PAL.sub, '13px sans-serif');
    if (G.profile.dailyStreak) {
      txt('\u{1F525} ' + T('blockblast.dailyStreak', { n: G.profile.dailyStreak }),
          cx, GameGlobal.safeTop + 74, PAL.accent, 'bold 12px sans-serif');
    }

    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const startDow = first.getDay();
    const daysIn = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const cw = Math.min(46, (L.playW - 28) / 7);
    const gx = cx - cw * 3.5, gy = GameGlobal.safeTop + 92;
    const bests = G.profile.dailyBest || {};
    for (let d = 1; d <= daysIn; d++) {
      const slot = startDow + d - 1, r = Math.floor(slot / 7), c = slot % 7;
      const x = gx + c * cw, y = gy + r * cw;
      const dt = new Date(now.getFullYear(), now.getMonth(), d);
      const off = Daily.dayNo(now) - Daily.dayNo(dt);
      const playable = off >= 0 && off <= 6;                  // 未来的不能玩，太久远的也不开（防无限内容倒灌）
      const done = !!bests[Daily.dayId(dt)];
      fillRR(x + 2, y + 2, cw - 4, cw - 4, 8, done ? 'rgba(34,197,94,0.35)' : playable ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.15)');
      if (off === 0) { ctx.strokeStyle = PAL.accent; ctx.lineWidth = 2; roundRect(x + 2, y + 2, cw - 4, cw - 4, 8); ctx.stroke(); }
      txt(String(d), x + cw / 2, y + cw / 2 - (done ? 5 : 0),
          playable || done ? '#fff' : 'rgba(255,255,255,0.35)', '12px sans-serif');
      if (done) txt('✓', x + cw / 2, y + cw - 12, '#7ef2a0', 'bold 10px sans-serif');
      if (playable) addHit(x + 2, y + 2, cw - 4, cw - 4, 'PLAY_DAILY_AT', { off });
    }
    const rows = Math.ceil((startDow + daysIn) / 7);
    ctx.font = '11px sans-serif';
    wrapLines(T('blockblast.calHint'), L.playW - 60, 3)
      .forEach((ln, i) => txt(ln, cx, gy + rows * cw + 22 + i * 16, PAL.sub, '11px sans-serif'));
    backButton();
  }

  /** 水晶图鉴：收集过才点亮（审核员 5 秒能看见的收集外壳，也是长线目标）*/
  function renderDex() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.dexTitle'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    const got = G.profile.crystals || {};
    Levels.KINDS.forEach((k, i) => {
      const y = GameGlobal.safeTop + 56 + i * 86;
      const n = got[k] || 0, seen = n > 0;
      fillRR(L.playX + 14, y, L.playW - 28, 78, 12, 'rgba(0,0,0,0.20)');
      ctx.globalAlpha = seen ? 1 : 0.25;
      drawCrystal(L.playX + 24, y + 19, 40, k);
      ctx.globalAlpha = 1;
      txtL(seen ? T('blockblast.dex.' + k) : '???', L.playX + 76, y + 24,
           seen ? '#fff' : 'rgba(255,255,255,0.4)', 'bold 14px sans-serif');
      if (seen) txtR('×' + n, L.playX + L.playW - 26, y + 24, PAL.accent, 'bold 13px sans-serif');
      ctx.font = '11px sans-serif';
      wrapLines(seen ? T('blockblast.dexd.' + k) : T('blockblast.dexLocked'), L.playW - 120, 2)
        .forEach((ln, j) => txtL(ln, L.playX + 76, y + 46 + j * 15,
                                 seen ? PAL.sub : 'rgba(255,255,255,0.3)', '11px sans-serif'));
    });
    backButton();
  }

  // ── 天使图缓存（LRU 上限 64 张）：500 张全解码 ≈ 500MB，低端 WebView 会被杀 ──
  const ANG_CACHE = new Map();
  function angImg(i) {
    const k = 'a' + String(i + 1).padStart(3, '0');
    let im = ANG_CACHE.get(k);
    if (!im) {
      im = new Image();
      im.src = 'assets/angels/' + k + '.webp';
      im.onload = () => { if (typeof root.renderAll === 'function') root.renderAll(); };
      ANG_CACHE.set(k, im);
      if (ANG_CACHE.size > 64) ANG_CACHE.delete(ANG_CACHE.keys().next().value);   // 淘汰最老的
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  function drawAngel(i, x, y, w, h, r) {
    const im = angImg(i);
    ctx.save();
    roundRect(x, y, w, h, r);
    ctx.clip();
    if (im) ctx.drawImage(im, x, y, w, h);
    else { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    return !!im;
  }

  /** 天使图鉴（500 张收集，素材=「大头萌天使」词图）：网格分页 + 点开大图 */
  function renderAngels() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    const have = G.wallet.angels | 0, total = Shop.ANGELS.total;
    txt('\u{1F47C} ' + T('blockblast.angels'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt(have + ' / ' + total, cx, GameGlobal.safeTop + 54, PAL.accent, 'bold 14px sans-serif');

    const COLS = 4, ROWS = 6, PER = COLS * ROWS;
    const pages = Math.ceil(total / PER);
    const page = Math.max(0, Math.min(pages - 1, G.angPage || 0));
    const cell = Math.min(86, (L.playW - 32) / COLS, (SH - GameGlobal.safeTop - 214) / ROWS);   // 矮屏也放得下
    const gx = cx - (COLS * cell) / 2, gy = GameGlobal.safeTop + 72;
    for (let k = 0; k < PER; k++) {
      const idx0 = page * PER + k;
      if (idx0 >= total) break;
      const x = gx + (k % COLS) * cell, y = gy + Math.floor(k / COLS) * cell;
      if (idx0 < have) {
        drawAngel(idx0, x + 3, y + 3, cell - 6, cell - 6, 10);
        addHit(x + 3, y + 3, cell - 6, cell - 6, 'ANG_VIEW', { i: idx0 });
      } else {
        fillRR(x + 3, y + 3, cell - 6, cell - 6, 10, 'rgba(0,0,0,0.22)');
        txt('?', x + cell / 2, y + cell / 2, 'rgba(255,255,255,0.25)', 'bold 18px sans-serif');
      }
    }
    const py = gy + ROWS * cell + 8;
    txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
    if (page > 0) {
      fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx - 110, py, 44, 32, 'ANG_PAGE', { d: -1 });
    }
    if (page < pages - 1) {
      fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx + 66, py, 44, 32, 'ANG_PAGE', { d: 1 });
    }
    ctx.font = '11px sans-serif';
    wrapLines(T('blockblast.angelHint'), L.playW - 60, 2)
      .forEach((ln, i) => txt(ln, cx, py + 48 + i * 15, PAL.sub, '11px sans-serif'));
    backButton();

    // 大图查看：全屏遮罩 + 居中大图，点任意处关闭
    if (G.angView >= 0 && G.angView < have) {
      drawDim('rgba(10,5,25,0.88)');
      const size = Math.min(L.playW - 48, SH * 0.5);
      drawAngel(G.angView, cx - size / 2, SH * 0.5 - size / 2 - 20, size, size, 18);
      txt('#' + (G.angView + 1), cx, SH * 0.5 + size / 2 + 8, PAL.accent, 'bold 14px sans-serif');
      clearHits();                                     // 遮罩层只留一个「点哪都关」
      addHit(0, 0, SW, SH, 'ANG_CLOSE', {});
    }
  }

  /** 天使榜：预设分数的追赶角色（明确是游戏角色——标题/文案绝不称「玩家」）*/
  function renderLadder() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt('\u{1F3C6} ' + T('blockblast.ladder'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    const beat = Ghosts.beatenCount(G.best);
    txt(T('blockblast.ladderYou', { n: G.best }) + '  ·  ' + beat + '/' + Ghosts.LADDER.length,
        cx, GameGlobal.safeTop + 54, PAL.accent, 'bold 13px sans-serif');

    const PER = 8;
    const pages = Math.ceil(Ghosts.LADDER.length / PER);
    const page = Math.max(0, Math.min(pages - 1, G.ladPage | 0));
    Ghosts.LADDER.slice(page * PER, page * PER + PER).forEach((g, i) => {
      const idx0 = page * PER + i;
      const y = GameGlobal.safeTop + 72 + i * 56;
      const won = G.best > g.score;
      fillRR(L.playX + 14, y, L.playW - 28, 48, 12, won ? 'rgba(34,197,94,0.18)' : 'rgba(0,0,0,0.20)');
      drawAngel(g.img, L.playX + 22, y + 6, 36, 36, 8);
      txtL('#' + (idx0 + 1) + '  ' + g.name, L.playX + 68, y + 24, won ? '#7ef2a0' : '#fff', 'bold 14px sans-serif');
      txtR(won ? g.score + '  ✓' : String(g.score), L.playX + L.playW - 26, y + 24,
           won ? '#7ef2a0' : PAL.sub, 'bold 13px sans-serif');
    });
    const py = GameGlobal.safeTop + 72 + PER * 56 + 6;
    txt(`${page + 1} / ${pages}`, cx, py + 16, PAL.sub, '12px sans-serif');
    if (page > 0) {
      fillRR(cx - 110, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('‹', cx - 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx - 110, py, 44, 32, 'LAD_PAGE', { d: -1 });
    }
    if (page < pages - 1) {
      fillRR(cx + 66, py, 44, 32, 10, 'rgba(255,255,255,0.16)');
      txt('›', cx + 88, py + 16, '#fff', 'bold 16px sans-serif');
      addHit(cx + 66, py, 44, 32, 'LAD_PAGE', { d: 1 });
    }
    backButton();
  }

  /** 每日任务页：3 个轻任务 + 进度条（完成自动发奖，无需手动领）*/
  function renderQuests() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt('\u{1F4CB} ' + T('blockblast.quests'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    txt(T('blockblast.questReward'), cx, GameGlobal.safeTop + 54, PAL.sub, '12px sans-serif');

    const qs = Quests.status(G.profile, Daily.dayNo(new Date()));
    qs.forEach((q, i) => {
      const y = GameGlobal.safeTop + 80 + i * 96;
      fillRR(L.playX + 14, y, L.playW - 28, 84, 12, q.done ? 'rgba(34,197,94,0.20)' : 'rgba(0,0,0,0.20)');
      txtL(T('blockblast.q.' + q.t, { n: q.target }), L.playX + 28, y + 24,
           q.done ? '#7ef2a0' : '#fff', 'bold 14px sans-serif');
      // 进度条
      const bw = L.playW - 120;
      fillRR(L.playX + 28, y + 46, bw, 12, 6, 'rgba(0,0,0,0.30)');
      fillRR(L.playX + 28, y + 46, bw * (q.prog / q.target), 12, 6, q.done ? '#22c55e' : PAL.accent);
      txtR(q.done ? '✓' : q.prog + '/' + q.target, L.playX + L.playW - 28, y + 52,
           q.done ? '#7ef2a0' : PAL.sub, 'bold 12px sans-serif');
    });
    // 全部完成的小彩蛋文案
    if (qs.every(q => q.done)) {
      txt('✨ ' + T('blockblast.questAllDone'), cx, GameGlobal.safeTop + 80 + 3 * 96 + 16, '#7ef2a0', 'bold 13px sans-serif');
    }
    backButton();
  }

  /** 统计页：终身数据一屏（沉没成本可视化 = 留存）*/
  function renderStats() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt('\u{1F4CA} ' + T('blockblast.stats'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');
    const p = G.profile, w = G.wallet;
    const crystals = Object.values(p.crystals || {}).reduce((a, v) => a + v, 0);
    const items = [
      ['stGames', w.gamesPlayed | 0], ['stBestScore', G.best],
      ['stTurns', p.turns | 0], ['stLines', p.lines | 0],
      ['stStreak', p.bestStreak | 0], ['stSweeps', p.sweepsTotal | 0],
      ['stPerfects', p.perfects | 0], ['stLevels', p.levelsWon | 0],
      ['stStars', p.stars | 0], ['stCrystals', crystals],
      ['stAngels', (w.angels | 0) + '/' + Shop.ANGELS.total], ['stDailyDays', p.dailyDays | 0],
      ['stBestDaily', p.bestDailyStreak | 0], ['stCoins', w.coins | 0],
    ];
    const cw = (L.playW - 36) / 2;
    items.forEach(([k, v], i) => {
      const x = L.playX + 12 + (i % 2) * (cw + 12), y = GameGlobal.safeTop + 58 + Math.floor(i / 2) * 58;
      fillRR(x, y, cw, 50, 10, 'rgba(0,0,0,0.20)');
      txt(String(v), x + cw / 2, y + 18, PAL.accent, 'bold 16px sans-serif');
      txt(T('blockblast.' + k), x + cw / 2, y + 38, PAL.sub, '10px sans-serif');
    });
    backButton();
  }

  /** 设置页：下一手预览（关掉 = 硬核模式）/ 粒子特效（低端机、减弱动态）。
   *  声音开关在引擎的悬浮控件里（同一开关不另起一套）。*/
  function renderSettings() {
    clearHits(); layout();
    const { SW, SH } = GameGlobal, G = root.G, cx = L.cx;
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);
    txt(T('blockblast.settings'), cx, GameGlobal.safeTop + 30, '#fff', 'bold 22px sans-serif');

    const rows = [
      { act: 'TOGGLE_PREVIEW', on: G.opts.preview, label: T('blockblast.optPreview'), sub: T('blockblast.optPreviewSub') },
      { act: 'TOGGLE_FX', on: G.opts.fx, label: T('blockblast.optFx'), sub: T('blockblast.optFxSub') },
    ];
    if (Notify.available) {
      rows.push({ act: 'TOGGLE_REMIND', on: !!G.opts.remind, label: T('blockblast.remind'), sub: T('blockblast.remindSub') });
    }
    rows.forEach((r, i) => {
      const y = GameGlobal.safeTop + 76 + i * 84;
      fillRR(L.playX + 14, y, L.playW - 28, 72, 12, 'rgba(0,0,0,0.20)');
      txtL(r.label, L.playX + 28, y + 24, '#fff', 'bold 14px sans-serif');
      txtL(r.sub, L.playX + 28, y + 48, PAL.sub, '11px sans-serif');
      // 开关胶囊
      const tx = L.playX + L.playW - 92, ty = y + 20;
      fillRR(tx, ty, 64, 30, 15, r.on ? '#22c55e' : 'rgba(255,255,255,0.18)');
      fillRR(r.on ? tx + 36 : tx + 4, ty + 4, 24, 22, 11, '#fff');
      txt(r.on ? T('blockblast.on') : T('blockblast.off'), r.on ? tx + 17 : tx + 46, ty + 15,
          r.on ? '#fff' : PAL.sub, 'bold 9px sans-serif');
      addHit(L.playX + 14, y, L.playW - 28, 72, r.act, {});
    });
    // 按钮行：统计 / 反馈 / Game Center 排行榜（原生）
    const btns = [
      { act: 'PAGE_STATS', label: '\u{1F4CA} ' + T('blockblast.stats'), data: {} },
      { act: 'FB_OPEN', label: '\u{1F4AC} ' + T('blockblast.fbTitle'), data: {} },
    ];
    if (GC.available) btns.push({ act: 'SHOW_GC', label: '\u{1F3C5} ' + T('blockblast.leaderboards'), data: { board: 'endless' } });
    btns.forEach((b, i) => {
      const y = GameGlobal.safeTop + 76 + rows.length * 84 + i * 60;
      fillRR(L.playX + 14, y, L.playW - 28, 52, 12, 'rgba(0,0,0,0.20)');
      txtL(b.label, L.playX + 28, y + 26, '#fff', 'bold 14px sans-serif');
      addHit(L.playX + 14, y, L.playW - 28, 52, b.act, b.data);
    });
    backButton();
  }

  /** 结算页的金币行：+n，未翻倍时旁边给「看广告×2」按钮（拒绝 ⇒ 什么也不发生，红线 2）。
   *  去广告玩家在 main 里已直接拿到双倍 ⇒ 这里只会走「已翻倍」分支，绝不会向付费玩家要广告。*/
  function earnRow(G, y) {
    const e = G.lastEarn;
    if (!e || !e.n) return;
    const cx = L.cx;
    if (e.doubled) {
      txt('\u{1FA99} +' + e.n + '  ✓', cx, y + 16, '#7ef2a0', 'bold 14px sans-serif');
      return;
    }
    txt('\u{1FA99} +' + e.n, cx - 62, y + 16, PAL.accent, 'bold 14px sans-serif');
    fillRR(cx - 8, y, 124, 32, 10, '#8b5cf6');
    txt('\u{1F4FA} ' + T('blockblast.double'), cx + 54, y + 16, '#fff', 'bold 12px sans-serif');
    addHit(cx - 8, y, 124, 32, 'DOUBLE_COINS', {});
  }

  function backButton() {
    const { SH } = GameGlobal, cx = L.cx;
    fillRR(cx - 70, SH - 66, 140, 42, 12, 'rgba(255,255,255,0.20)');
    txt('\u2039 ' + T('blockblast.back'), cx, SH - 45, '#fff', '14px sans-serif');
    addHit(cx - 70, SH - 66, 140, 42, 'MENU', {});
  }

  function renderAll() {
    const G0 = root.G;
    if (G0.phase === 'MENU') return renderMenu();
    if (G0.phase === 'ACH') return renderAchievements();
    if (G0.phase === 'SKIN') return renderSkins();
    if (G0.phase === 'FAIR') return renderFair();
    if (G0.phase === 'SHOP') return renderShop();
    if (G0.phase === 'SET') return renderSettings();
    if (G0.phase === 'CAL') return renderCal();
    if (G0.phase === 'DEX') return renderDex();
    if (G0.phase === 'ANG') return renderAngels();
    if (G0.phase === 'QUESTS') return renderQuests();
    if (G0.phase === 'STATS') return renderStats();
    if (G0.phase === 'LADDER') return renderLadder();
    clearHits();
    layout();
    const { SW, SH } = GameGlobal;
    const G = root.G;
    computeTray(G.s);                          // 托盘槽位/尺寸随这一手变（实际大小优先）

    // 背景
    const grad = ctx.createLinearGradient(0, 0, SW, SH);
    grad.addColorStop(0, PAL.bg1); grad.addColorStop(1, PAL.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, SW, SH);

    const off = FX.offset();
    ctx.save();
    ctx.translate(off.x, off.y);

    const s = G.s;

    // ── HUD（全部相对游戏区，不用 SW）──
    // 顶部一条：金币 + 返回菜单（并排；原来三者挤在一起，实机截图里 Best 被金币压成一团）
    fillRR(L.boardX, L.hudY - 34, 66, 24, 8, 'rgba(0,0,0,0.25)');
    txt('\u{1FA99} ' + G.wallet.coins, L.boardX + 33, L.hudY - 22, PAL.accent, 'bold 12px sans-serif');
    addHit(L.boardX, L.hudY - 34, 66, 24, 'PAGE_SHOP', {});
    fillRR(L.boardX + 72, L.hudY - 34, 58, 24, 8, 'rgba(255,255,255,0.18)');
    txt('‹ ' + T('blockblast.menu'), L.boardX + 101, L.hudY - 22, '#fff', '11px sans-serif');
    addHit(L.boardX + 72, L.hudY - 34, 58, 24, 'MENU', {});

    if (s.mode === 'level') {
      // 目标条：每种水晶的「已收集 / 需要」；达成打勾
      txtL(T('blockblast.level', { n: s.levelId }), L.boardX, L.hudY, PAL.sub, '13px sans-serif');
      txtR(T('blockblast.moves', { n: s.stats.turns }) +
           (s.par ? '  ·  ' + T('blockblast.parHint', { n: s.par }) : ''),
           L.boardX + L.boardW, L.hudY, PAL.sub, '12px sans-serif');
      // 目标条压到左 62%，右侧留给迷你「下一手」——关卡模式原来完全没有预览，
      // 把「可见的公平」和规划能力都丢了（DESIGN §1 说预览**常驻**）。
      const kinds = Object.keys(s.goals);
      const showPv = !G.opts || G.opts.preview !== false;
      const gw = (showPv ? L.boardW * 0.62 : L.boardW) / kinds.length;
      kinds.forEach((k, i) => {
        const gx = L.boardX + gw * i + gw / 2, gy = L.nextY + 2;
        const got = s.collected[k] || 0, need = s.goals[k];
        drawCrystal(gx - 26 - L.cell * 0.5, gy - L.cell * 0.5, L.cell, k);
        const done = got >= need;
        txtL(done ? '✔' : `${need - got}`, gx - 4, gy,
             done ? '#7ef2a0' : '#fff', 'bold 17px sans-serif');
      });
      if (showPv) {
        const nh = Core.nextHand(s);
        const nSize = Math.max(4, Math.round(L.cell * 0.13));
        let nx = L.boardX + L.boardW * 0.66;
        txtL(T('blockblast.next'), nx, L.nextY - 16, PAL.sub, '9px sans-serif');
        for (const p of nh) {
          drawPieceAt(p, nx, L.nextY + 2 - (p.h * nSize) / 2, nSize, 0.5);
          nx += p.wdt * nSize + 8;
        }
      }
    } else {
      txt(String(s.score), L.cx, L.hudY + 2, PAL.text, 'bold 32px sans-serif');
      txtL(T('blockblast.best') + ' ' + G.best, L.boardX, L.hudY + 28, PAL.sub, '12px sans-serif');
      // 濒死心跳（DESIGN §8：fill≥75% 不给文字警告，只给生理紧张；越满跳越快）
      const occ = Core.fillCount(s.board);
      if (!s.over && occ >= 48) {
        const k = 0.5 + 0.5 * Math.sin(G.animClock * (occ >= 56 ? 9 : 5.5));
        ctx.globalAlpha = 0.45 + 0.55 * k;
        txtR('♥', L.boardX + L.boardW, L.hudY + 4, '#fb7185', 'bold ' + Math.round(15 + 5 * k) + 'px sans-serif');
        ctx.globalAlpha = 1;
      }
      if (s.streak >= 2) {
        const m = Core.streakMult(s.streak);
        // 宽限可视化：刚空放了一步 ⇒ 标签转橙闪烁——「再空一步连击就断」这份善意要看得见
        const grace = s.dryTurns === 1;
        const col = grace ? 'rgba(251,146,60,' + (0.5 + 0.5 * Math.sin(G.animClock * 8)).toFixed(2) + ')' : PAL.accent;
        txtR(T('blockblast.combo', { m: m.toFixed(1) }) + (grace ? ' !' : ''),
             L.boardX + L.boardW, L.hudY + 28, col, 'bold 14px sans-serif');
      }
    }

    // ── 下一手预览（块流是预生成的 ⇒ 预览天然成立，绝不会被偷偷换掉）。
    //    设置里可关 = 硬核模式（DESIGN §1 承诺的开关，1.0.1 兑现）。──
    const showPreview = !G.opts || G.opts.preview !== false;
    if (s.mode === 'level') { /* 目标条占了这一行；关卡的迷你预览画在目标条右侧（见上）*/ } else if (showPreview) {
    const nh = Core.nextHand(s);
    const nSize = Math.max(5, Math.round(L.cell * 0.20));
    txtL(T('blockblast.next'), L.boardX, L.nextY, PAL.sub, '11px sans-serif');
    let nx = L.boardX + 46;
    for (const p of nh) {
      drawPieceAt(p, nx, L.nextY - (p.h * nSize) / 2, nSize, 0.5);
      nx += p.wdt * nSize + 14;
    }
    }

    // ── 棋盘 ──
    fillRR(L.boardX - 6, L.boardY - 6, L.boardW + 12, L.boardW + 12, 14, PAL.boardBg);
    if (s.mode === 'level') {
      // 主题演进：棋盘描边用**章节色**（糖果粉 / 深海蓝 / 翡翠绿）
      ctx.strokeStyle = hexA(Levels.chapterOf(s.levelId).accent, 0.7);
      ctx.lineWidth = 3;
      roundRect(L.boardX - 6, L.boardY - 6, L.boardW + 12, L.boardW + 12, 14);
      ctx.stroke();
    }

    // 拖拽中：算出幽灵位置 + 将被消掉的行列；非法落点走虚线描边（DESIGN §5 的色盲友好方案）
    let ghost = null, badTarget = null, hintRows = [], hintCols = [];
    if (G.drag && G.drag.target) {
      const { r, c, piece } = G.drag.target;
      if (!Core.canPlace(s.board, piece, r, c)) {
        badTarget = { r, c, piece };
      } else {
        ghost = { r, c, piece };
        // 预演一次：这一步会消掉哪些行列（消行预览是本作最重要的一个 UI）
        const test = s.board.slice();
        for (const [dr, dc] of piece.cells) test[Core.idx(r + dr, c + dc)] = 1;
        // ⚠ 必须传 s.stone：不传的话，含石块的行会被高亮成「松手就消」，但 core 根本不消
        //    —— 石块的全部教学意义就是「这条线走不通」，预览却告诉玩家能走（红队实测第 11 关）。
        const f = Core.findFullLines(test, s.stone);
        hintRows = f.rows; hintCols = f.cols;
      }
    }

    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const { x, y } = cellXY(r, c);
      const hinted = hintRows.includes(r) || hintCols.includes(c);
      if (hinted) { ctx.fillStyle = PAL.lineHint; roundRect(x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.18); ctx.fill(); }
      else { ctx.fillStyle = PAL.cellEmpty; roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.fill(); }

      const i = Core.idx(r, c);
      if (s.mode === 'level' && s.stone[i]) { drawStone(x, y, L.cell); continue; }   // 石块永不消失
      if (s.board[i] && !FX.isDying(x, y)) {
        drawBlock(x, y, L.cell, G.cellColor[i] || COLORS[4]);
        if (s.mode === 'level' && s.crystal[i]) drawCrystal(x, y, L.cell, s.crystal[i]);
        // ⚠ 消行预览要盖在**已填的块**上 —— 否则高亮只画在背景层、被实心块挡得严严实实，
        //    玩家根本看不见「这一步会消掉这条线」。而这是本作最重要的一个 UI（DESIGN §5）。
        //    出 App Store 截图、逐张验图时才发现它一直是坏的。
        if (hinted) {
          // 提亮 + 金边，而不是拿半透明色**盖**在块上 —— 覆盖会把彩色块冲成灰白，
          // 看起来像「褪色/失焦」，而不是「这条线要炸了」（截图验收发现）。
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          roundRect(x + 1, y + 1, L.cell - 2, L.cell - 2, L.cell * 0.18); ctx.fill();
          ctx.strokeStyle = PAL.accent; ctx.lineWidth = Math.max(2, L.cell * 0.07);
          roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
        }
      }
    }

    // 幽灵（合法落点的半透明预演）
    if (ghost) {
      for (const [dr, dc] of ghost.piece.cells) {
        const { x, y } = cellXY(ghost.r + dr, ghost.c + dc);
        ctx.fillStyle = PAL.ghostOk;
        roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.fill();
      }
    }
    // 非法落点：虚线描边（不用红/绿区分 —— 色盲友好，DESIGN §5；出界的格子不画）
    if (badTarget) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const [dr, dc] of badTarget.piece.cells) {
        const rr = badTarget.r + dr, cc = badTarget.c + dc;
        if (rr < 0 || cc < 0 || rr >= 8 || cc >= 8) continue;
        const { x, y } = cellXY(rr, cc);
        roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ── 托盘（实际大小，见 computeTray）──
    const tray = Core.tray(s);
    for (let i = 0; i < 3; i++) {
      const p = tray[i];
      if (!p) continue;                                  // 已放下的槽留空（其余块不移动）
      if (G.drag && G.drag.slot === i) continue;         // 正在手上的那块不画在托盘里
      if (G.fly && G.fly.slot === i) continue;          // 正在飞回来的那块也不画（否则会重影）
      const r = L.traySlots[i];
      const dead = !Core.canPlaceAnywhere(s.board, p);   // 放不下的块暗掉：失败要看得见原因
      drawPieceAt(p, r.x, r.y, r.size, dead ? 0.35 : 1);
      // 拼块驮着的水晶：托盘里就要看见（玩家得为它规划落点）
      if (s.mode === 'level') {
        const pc = Core.pieceCrystalAt(s, s.streamIndex + i);
        if (pc) drawCrystal(r.x + pc.cell[1] * r.size, r.y + pc.cell[0] * r.size, r.size, pc.kind);
      }
    }

    // FTUE 指引（前 2 关首步）：托盘目标块 + 落点脉冲高亮——把勺子递到手上（DESIGN §6.3）
    if (G.hint && !s.over && !G.drag) {
      const h = G.hint;
      const pulse = (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(G.animClock * 4))).toFixed(2);
      ctx.strokeStyle = 'rgba(126,242,160,' + pulse + ')';
      const tr2 = L.traySlots && L.traySlots[h.slot];
      if (tr2) {
        ctx.lineWidth = 3;
        roundRect(tr2.x - 6, tr2.y - 6, tr2.w + 12, tr2.h + 12, 10); ctx.stroke();
      }
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const [dr, dc] of h.piece.cells) {
        const { x, y } = cellXY(h.r + dr, h.c + dc);
        roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ── 拖拽中的块（浮在指尖上方，尺寸从托盘尺寸**平滑长到**棋盘格尺寸）──
    if (G.drag) {
      const d = G.drag;
      const size = d.fromSize + (L.cell - d.fromSize) * Drag.ease(d.grow);
      const bx = d.px - d.anchorDC * size - size / 2;
      const by2 = d.py - d.anchorDR * size - size / 2 - L.cell * Drag.LIFT;
      drawPieceAt(d.piece, bx, by2, size, badTarget ? 0.55 : 0.95);   // 非法落点：块变暗（§5）
      if (s.mode === 'level') {
        const pc = Core.pieceCrystalAt(s, s.streamIndex + d.slot);
        if (pc) drawCrystal(bx + pc.cell[1] * size, by2 + pc.cell[0] * size, size, pc.kind);
      }
    }

    // ── 回弹中的块（非法松手 → 飞回托盘并缩回原尺寸）──
    if (G.fly) {
      const f = G.fly, k = Drag.ease(f.t / f.dur);
      const size = f.s0 + (f.s1 - f.s0) * k;
      drawPieceAt(f.piece, f.x0 + (f.x1 - f.x0) * k, f.y0 + (f.y1 - f.y0) * k, size, 0.9);
    }

    // ── 道具条：撤销 / 换一手。标签直接显示「免费 / 看广告 / 多少金币」——
    //    玩家永远先拿到不花钱的选项（DESIGN §9；原作的撤销要 1300 金币是逼氪价，不学）。
    if (!s.over) {
      const bw2 = 108, bh2 = 36, gap2 = 10, uy = L.trayY + L.trayH + 6;
      const items = [
        { act: 'UNDO', on: !!s.undo, label: '\u21A9 ' + T('blockblast.undo'),
          mode: Shop.undoMode(G.wallet, G.items), price: Shop.PRICE.undo },
        { act: 'REFRESH', on: true, label: '\u21BB ' + T('blockblast.refresh'),
          mode: Shop.refreshMode(G.wallet, G.items), price: Shop.PRICE.refresh },
      ];
      items.forEach((it, i) => {
        const x = L.cx - (bw2 * 2 + gap2) / 2 + i * (bw2 + gap2);
        const usable = it.on && it.mode !== 'no';
        fillRR(x, uy, bw2, bh2, 10, usable ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)');
        txt(it.label, x + bw2 / 2, uy + 12, usable ? '#fff' : 'rgba(255,255,255,0.35)', '11px sans-serif');
        const tag = it.mode === 'free' ? T('blockblast.free')
                  : it.mode === 'ad' ? '\u{1F4FA} ' + T('blockblast.watchAd')
                  : it.mode === 'coins' ? '\u{1FA99} ' + it.price
                  : T('blockblast.notEnough');
        txt(tag, x + bw2 / 2, uy + 26,
            it.mode === 'free' ? '#7ef2a0' : usable ? PAL.accent : 'rgba(255,255,255,0.3)', '10px sans-serif');
        if (usable) addHit(x, uy, bw2, bh2, it.act, {});
      });
    }


    FX.draw(ctx);
    ctx.restore();

    // ── 死亡序列（DESIGN §2「失败必须可归因」）：先回放最后几手，再逐块红色扫盘
    //    证明「剩余的每一块确实都放不下」。播完才轮到结算浮层；点任意处跳过。──
    if (s.over && G.overAnim && !s.won && !s.unwinnable) {
      const a = G.overAnim;
      drawDim('rgba(20,10,40,0.30)');
      if (a.t < a.prologue) {
        const seq = G.recentPlaces.slice(-3);
        const i = Math.min(Math.floor(a.t / 0.3), seq.length - 1);
        txt(T('blockblast.lastMoves'), L.cx, L.boardY - 16, PAL.accent, 'bold 13px sans-serif');
        if (seq[i]) {
          ctx.strokeStyle = PAL.accent; ctx.lineWidth = 3;
          for (const [r, c] of seq[i]) {
            const { x, y } = cellXY(r, c);
            roundRect(x + 2, y + 2, L.cell - 4, L.cell - 4, L.cell * 0.16); ctx.stroke();
          }
        }
      } else {
        const ts = a.t - a.prologue;
        const i = Math.min(Math.floor(ts / a.per), a.n - 1);
        const k = Math.min((ts - i * a.per) / a.per, 1);
        txt(T('blockblast.noFit'), L.cx, L.boardY - 16, '#fb7185', 'bold 13px sans-serif');
        ctx.fillStyle = 'rgba(244,63,94,0.16)';                       // 红色扫描带扫过棋盘
        ctx.fillRect(L.boardX + (L.boardW - 44) * k, L.boardY, 44, L.boardW);
        const tray2 = Core.tray(s);                                    // 正被「审问」的那块红框脉冲
        let seen = -1;
        for (let j = 0; j < 3; j++) {
          if (!tray2[j]) continue;
          seen++;
          if (seen !== i || !L.traySlots) continue;
          const rct = L.traySlots[j];
          ctx.strokeStyle = 'rgba(244,63,94,' + (0.55 + 0.45 * Math.sin(G.animClock * 10)).toFixed(2) + ')';
          ctx.lineWidth = 3;
          roundRect(rct.x - 6, rct.y - 6, rct.w + 12, rct.h + 12, 10); ctx.stroke();
        }
      }
      addHit(0, 0, SW, SH, 'SKIP_OVERANIM', {});
      return;
    }

    // ── 关卡浮层：胜利（三星）/ 失败 / 不可胜 ──
    if (s.mode === 'level' && s.over) {
      drawDim('rgba(20,10,40,0.80)');
      const cx = L.cx, w = Math.min(L.playW - 40, 300);
      if (s.won) {
        txt(T('blockblast.levelWin'), cx, SH * 0.32, '#fff', 'bold 28px sans-serif');
        const stars = Core.starsFor(s);
        for (let i = 0; i < 3; i++) {
          txt('★', cx - 52 + i * 52, SH * 0.42, i < stars ? '#ffe08a' : 'rgba(255,255,255,0.18)',
              (i < stars ? 'bold 44px' : '44px') + ' sans-serif');
        }
        txt(T('blockblast.moves', { n: s.stats.turns }) + (s.par ? ` / ${T('blockblast.parHint', { n: s.par })}` : ''),
            cx, SH * 0.50, PAL.sub, '13px sans-serif');
        txt(String(s.score), cx, SH * 0.555, '#ffe08a', 'bold 26px sans-serif');
        earnRow(G0, SH * 0.585);                     // 通关金币 + 看广告×2（正反馈时刻的自愿广告位）
        if (G0.newAngels > 0) {
          txt('\u{1F47C} +' + G0.newAngels + ' · ' + (G0.wallet.angels | 0) + '/' + Shop.ANGELS.total,
              cx, SH * 0.628, PAL.accent, 'bold 11px sans-serif');
          addHit(cx - 80, SH * 0.628 - 11, 160, 20, 'PAGE_ANG', {});
        }
        fillRR(cx - 95, SH * 0.655, 190, 48, 14, '#22c55e');
        txt(T('blockblast.nextLevel'), cx, SH * 0.655 + 24, '#fff', 'bold 16px sans-serif');
        addHit(cx - 95, SH * 0.655, 190, 48, 'NEXT_LEVEL', {});
      } else {
        const unwin = s.unwinnable;
        txt(T(unwin ? 'blockblast.unwinnable' : 'blockblast.levelFail'), cx, SH * 0.34, '#fff', 'bold 24px sans-serif');
        txtLWrap(T(unwin ? 'blockblast.unwinnableHint' : 'blockblast.levelFailHint'),
                 cx - w / 2, SH * 0.44, w, PAL.sub, '13px sans-serif', 18);
        // ⚠ 关卡失败**只给「立刻重来」** —— 零广告、零插屏、零续命兜售（DESIGN §6.2）
        fillRR(cx - 95, SH * 0.60, 190, 48, 14, '#22c55e');
        txt(T('blockblast.retry'), cx, SH * 0.60 + 24, '#fff', 'bold 16px sans-serif');
        addHit(cx - 95, SH * 0.60, 190, 48, 'RETRY_LEVEL', {});
      }
      fillRR(cx - 95, SH * 0.72, 190, 42, 12, 'rgba(255,255,255,0.16)');
      txt(T('blockblast.menu'), cx, SH * 0.72 + 21, '#fff', '14px sans-serif');
      addHit(cx - 95, SH * 0.72, 190, 42, 'MENU', {});
      return;                       // ⚠ 别再 restore：上面 FX.draw 之后已经 restore 过了
    }

    // ── 结束浮层（无尽/每日/挑战）：结算不只是「你死了」，是下一局的动机 ──
    if (s.over) {
      drawDim('rgba(20,10,40,0.78)');
      const cx = L.cx, w = Math.min(L.playW - 40, 300);
      txt(T('blockblast.gameOver'), cx, SH * 0.29, '#fff', 'bold 26px sans-serif');
      txtLWrap(T('blockblast.noMoves'), cx - w / 2, SH * 0.365, w, PAL.sub, '13px sans-serif', 18);
      txt(T('blockblast.finalScore', { n: s.score }), cx, SH * 0.45, '#ffe08a', 'bold 30px sans-serif');
      // ⚠ 用 G.newBestRun 标志，不能现比 score>best —— over 时 best 已被更新，现比永远是假
      //   （老写法就是因此从没显示过「New Best!」）。没破纪录就把差距亮出来 = 重开的理由。
      if (G.newBestRun) {
        txt(T('blockblast.newBest'), cx, SH * 0.50, '#7ef2a0', 'bold 15px sans-serif');
      } else if (!s.daily && !s.challenge && G.best > s.score) {
        txt(T('blockblast.bestGap', { n: G.best - s.score }), cx, SH * 0.50, PAL.sub, '12px sans-serif');
      }
      // 天使榜对比：本盘打到第几、下一个差多少（点击看全榜）
      const gBeat = Ghosts.beatenCount(Math.max(s.score, G.best));
      const gNext = Ghosts.nextTarget(Math.max(s.score, G.best));
      const gTxt = '\u{1F3C6} ' + T('blockblast.ghostLine', { a: gBeat, b: Ghosts.LADDER.length }) +
                   (gNext ? '  ·  ' + T('blockblast.ghostNext', { name: gNext.name, n: gNext.score + 1 - Math.max(s.score, G.best) }) : '');
      txt(gTxt, cx, SH * 0.522, PAL.accent, 'bold 11px sans-serif');
      addHit(cx - 140, SH * 0.522 - 10, 280, 20, 'PAGE_LADDER', {});
      const sweeps = s.stats.sweeps + s.stats.deeps + s.stats.perfects;
      txt(T('blockblast.statLine', { a: s.stats.maxStreak, b: sweeps }), cx, SH * 0.548, PAL.sub, '12px sans-serif');
      earnRow(G, SH * 0.572);                        // 得分换金币 + 看广告×2（无尽原来零产出）
      if (G.newAngels > 0) {                         // 本盘收集到的天使（点击进图鉴看）
        txt('\u{1F47C} +' + G.newAngels + ' · ' + (G.wallet.angels | 0) + '/' + Shop.ANGELS.total,
            cx, SH * 0.615, PAL.accent, 'bold 12px sans-serif');
        addHit(cx - 80, SH * 0.615 - 12, 160, 22, 'PAGE_ANG', {});
      }
      txt(T('blockblast.seed', { s: s.seed }), cx, SH * 0.638, 'rgba(255,255,255,0.45)', '11px sans-serif');
      // 分享/补签按钮（按优先级）：断签补签 > 每日分享成绩 > 种子挑战
      const shareBtn = (s.daily && G.repairOffer)
        ? { label: '\u{1F525} ' + T('blockblast.repair', { n: G.repairOffer.prev + 1 }), act: 'REPAIR_STREAK', bg: '#f59e0b' }
        : s.daily
        ? { label: '\u{1F4E4} ' + T('blockblast.shareScore'), act: 'SHARE_DAILY', bg: 'rgba(255,255,255,0.16)' }
        : { label: '\u{1F517} ' + T('blockblast.challenge'), act: 'SHARE_SEED', bg: 'rgba(255,255,255,0.16)' };
      fillRR(cx - 95, SH * 0.663, 190, 38, 12, shareBtn.bg);
      txt(shareBtn.label, cx, SH * 0.663 + 19, '#fff', '13px sans-serif');
      addHit(cx - 95, SH * 0.663, 190, 38, shareBtn.act, {});
      fillRR(cx - 90, SH * 0.728, 180, 50, 14, '#22c55e');
      txt(T('blockblast.restart'), cx, SH * 0.728 + 25, '#fff', 'bold 17px sans-serif');
      addHit(cx - 90, SH * 0.728, 180, 50, 'RESTART', {});
      fillRR(cx - 90, SH * 0.815, 180, 42, 12, 'rgba(255,255,255,0.16)');
      txt(T('blockblast.menu'), cx, SH * 0.815 + 21, '#fff', '14px sans-serif');
      addHit(cx - 90, SH * 0.815, 180, 42, 'MENU', {});
    }
  }

  const API = { layout, renderMenu, renderAchievements, renderSkins, renderFair, renderShop, computeTray, cellXY, cellAt, traySlotCenter, traySlotAt,
                colorOf, applyTheme, drawCrystal, L, COLORS };
  root.Render = API;
  applyTheme('candy');          // 默认皮肤（必须在 API 定义之后 —— 见上面的 TDZ 说明）
  root.renderAll = renderAll;
})(typeof self !== 'undefined' ? self : this);
