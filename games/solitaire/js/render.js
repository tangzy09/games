// ════════════════════════════════════════
// render.js — 全屏重画（引擎契约：每帧 clearHits() → 从 G 重画 → addHit()）。
//
// ⚠ hit 区必须**按绘制顺序（底 → 顶）注册**（DESIGN §8.0 ①）：
//   engine 的 hitTest 是**后注册优先**（倒序遍历），所以后注册的顶牌才会赢。
//   反过来写，点一叠牌会命中最底下那张 —— 症状诡异的必然 bug。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const PAL = {
    felt1: '#0f6b3f', felt2: '#0a4f2e',      // 经典绿绒桌布
    slot: 'rgba(255,255,255,0.10)',
    text: '#eafff2', sub: 'rgba(255,255,255,0.72)',
    hint: '#ffd84d',
  };

  function drawSlot(x, y, w, h, label) {
    ctx.strokeStyle = PAL.slot;
    ctx.lineWidth = 2;
    Sprite.rr(ctx, x + 1, y + 1, w - 2, h - 2, Math.max(3, w * 0.09));
    ctx.stroke();
    if (label) txt(label, x + w / 2, y + h / 2, 'rgba(255,255,255,0.25)', `${Math.round(w * 0.5)}px sans-serif`);
  }

  /**
   * ⭐ 公平页 —— 本作最重要的一屏，也是 App Store 截图第 1 张、对抗 4.3(a) 的主武器。
   *
   * 它做的事没有竞品敢做：**主动公开「有解」与「你能赢」之间的落差**。
   * 承诺可解会带来反噬（「我调到 100% 还是一直输，这设置根本没生效」）——
   * 唯一的解药是把边界说清楚，而不是藏起来。
   */
  function renderFair() {
    clearHits();
    const L = Layout.layout({ noBanner: true });
    const { SW, SH } = GameGlobal;
    const g = ctx.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, PAL.felt1); g.addColorStop(1, PAL.felt2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);

    const cx = L.cx, w = Math.min(L.playW - 40, 420);
    let y = GameGlobal.safeTop + 34;

    ctx.font = 'bold 19px sans-serif';
    wrapLines(T('sol.fairTitle'), w, 3).forEach((ln, i) => txt(ln, cx, y + i * 24, '#fff', 'bold 19px sans-serif'));
    y += 24 * wrapLines(T('sol.fairTitle'), w, 3).length + 14;

    for (const k of ['fair1', 'fair2', 'fair3']) {
      ctx.font = '12px sans-serif';
      const lines = wrapLines(T('sol.' + k).replace(/\*\*/g, ''), w, 5);
      lines.forEach((ln, i) => txtL(ln, cx - w / 2, y + i * 17, PAL.sub, '12px sans-serif'));
      y += lines.length * 17 + 12;
    }

    // ⭐ 落差表 —— 这就是那个「没人敢写」的数字
    y += 6;
    txt(T('sol.fairGap'), cx, y, '#ffd84d', 'bold 14px sans-serif');
    y += 22;

    // ⚠ 数字随 draw 模式变（draw-1 / draw-3 是两个完全不同的可解性问题）。
    // 全部实测：sim-blind.js（盲打胜率）+ build-pool.js（池内盲打胜率）。写死一套 = 早晚撒谎。
    const d3 = root.G.s.drawCount === 3;
    const rows = [
      [T('sol.fairTable1'), d3 ? '81.9%' : '90.5%', d3 ? '7.6%' : '32.3%', 'rgba(255,255,255,0.55)'],
      [T('sol.fairTable2'), '100%', d3 ? '30%' : '60%', '#7ef2a0'],
    ];
    // 表头
    txtR(T('sol.fairSolvable'), cx + w / 2 - 90, y, PAL.sub, '10px sans-serif');
    txtR(T('sol.fairBlind'), cx + w / 2 - 4, y, PAL.sub, '10px sans-serif');
    y += 16;
    rows.forEach(([label, solv, blind, col]) => {
      fillRR(cx - w / 2, y - 12, w, 30, 7, 'rgba(0,0,0,0.22)');
      ctx.font = '11px sans-serif';
      const lab = wrapLines(label, w - 190, 1)[0];
      txtL(lab, cx - w / 2 + 10, y + 2, col, '11px sans-serif');
      txtR(solv, cx + w / 2 - 90, y + 2, col, 'bold 13px sans-serif');
      txtR(blind, cx + w / 2 - 10, y + 2, col, 'bold 13px sans-serif');
      y += 36;
    });

    y += 4;
    ctx.font = '10px sans-serif';
    wrapLines(T('sol.fairBlindNote'), w, 4).forEach((ln, i) =>
      txtL(ln, cx - w / 2, y + i * 14, 'rgba(255,255,255,0.55)', '10px sans-serif'));
    y += 14 * wrapLines(T('sol.fairBlindNote'), w, 4).length + 16;

    // ⭐ 「你输的时候真的没救了吗」—— 本产品最重要的一个数字（tools/measure-deadlock.js 实测）
    y += 2;
    txt(T('sol.fairLost'), cx, y, '#ffd84d', 'bold 13px sans-serif');
    y += 18;
    wrapLines(T('sol.fairLostVal'), w, 2).forEach((ln, i) =>
      txt(ln, cx, y + i * 15, '#7ef2a0', 'bold 11px sans-serif'));
    y += 15 * wrapLines(T('sol.fairLostVal'), w, 2).length + 4;
    wrapLines(T('sol.fairLostSub'), w, 3).forEach((ln, i) =>
      txtL(ln, cx - w / 2, y + i * 13, 'rgba(255,255,255,0.55)', '10px sans-serif'));
    y += 13 * wrapLines(T('sol.fairLostSub'), w, 3).length + 12;

    // 本局信息 —— 跟随正文流（留白落在底部，比卡在中间好看），并带上**本局难度**：
    // 难度的定义就是上面那张表里的「盲打 AI 能不能赢」，两者互相印证。
    const s = root.G.s;
    const infoY = y;
    const diff = Pool.difficultyOf(s.drawCount, s.seed);
    fillRR(cx - w / 2, infoY, w, 64, 9, 'rgba(0,0,0,0.26)');
    txt(T('sol.fairDeal', { n: s.seed }), cx, infoY + 16, '#ffd84d', 'bold 13px sans-serif');
    if (diff) txt(T(diff === 'easy' ? 'sol.fairDiffEasy' : 'sol.fairDiffHard'), cx, infoY + 34,
                  diff === 'easy' ? '#7ef2a0' : '#ffb37e', '10px sans-serif');
    const st = Pool.stats(s.drawCount);
    txt(st ? T('sol.fairPool', { n: st.total }) : '—', cx, infoY + 51, PAL.sub, '10px sans-serif');

    fillRR(cx - 70, SH - 70, 140, 44, 12, 'rgba(255,255,255,0.20)');
    txt('‹ ' + T('sol.back'), cx, SH - 48, '#fff', '14px sans-serif');
    addHit(cx - 70, SH - 70, 140, 44, 'PLAY', {});
  }

  function renderAll() {
    if (root.G.phase === 'FAIR') return renderFair();
    clearHits();
    const G = root.G;
    const s = G.s;
    const fc = s.mode === 'freecell';
    const L = Layout.layout({ noBanner: G.noAds, cols: fc ? 8 : 7 });
    Sprite.ensure(L.cardW, L.cardH, G.fourColor, G.bigText);

    const { SW, SH } = GameGlobal;
    const g = ctx.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, PAL.felt1); g.addColorStop(1, PAL.felt2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);

    // ── 顶排 ──
    if (fc) {
      // FreeCell：4 个 free cell（左）+ 4 个 foundation（右）。没有牌堆。
      for (let ci = 0; ci < 4; ci++) {
        const x = L.cellX(ci);
        const id = s.free[ci];
        if (id != null) ctx.drawImage(Sprite.face(id), x, L.topY, L.cardW, L.cardH);
        else drawSlot(x, L.topY, L.cardW, L.cardH);
        addHit(x, L.topY, L.cardW, L.cardH, 'CELL', { ci });
      }
    } else if (s.stock.length) {
      ctx.drawImage(Sprite.back(), L.stockX, L.topY, L.cardW, L.cardH);
      txt(String(s.stock.length), L.stockX + L.cardW / 2, L.topY + L.cardH + 10, PAL.sub, '11px sans-serif');
    } else {
      drawSlot(L.stockX, L.topY, L.cardW, L.cardH, s.waste.length ? '↻' : '');
    }
    if (!fc) addHit(L.stockX, L.topY, L.cardW, L.cardH, 'STOCK', {});

    // waste（draw-3 时露出最后 3 张的一角）
    if (!fc && s.waste.length) {
      const show = Math.min(s.drawCount === 1 ? 1 : 3, s.waste.length);
      const fan = Math.round(L.cardW * 0.22);
      for (let k = 0; k < show; k++) {
        const id = s.waste[s.waste.length - show + k];
        const x = L.wasteX + k * fan;
        ctx.drawImage(Sprite.face(id), x, L.topY, L.cardW, L.cardH);
        if (k === show - 1) addHit(x, L.topY, L.cardW, L.cardH, 'WASTE', {});   // 只有顶牌可点
      }
    } else if (!fc) {
      drawSlot(L.wasteX, L.topY, L.cardW, L.cardH);
    }

    // foundations
    for (let fi = 0; fi < 4; fi++) {
      const x = L.foundX(fi);
      const f = s.foundations[fi];
      if (f.length) ctx.drawImage(Sprite.face(f[f.length - 1]), x, L.topY, L.cardW, L.cardH);
      else drawSlot(x, L.topY, L.cardW, L.cardH, Sprite.SUIT_SYM[fi]);
      addHit(x, L.topY, L.cardW, L.cardH, 'FOUND', { fi });
    }

    // ── tableau ──
    for (let ti = 0; ti < L.cols; ti++) {
      const col = s.tableau[ti];
      const x = L.colX(ti);
      const nDown = col.cards.length - col.up;
      const off = L.fitOffsets(nDown, col.up);

      if (!col.cards.length) {
        drawSlot(x, L.tabY, L.cardW, L.cardH);
        addHit(x, L.tabY, L.cardW, L.cardH, 'TAB', { ti, idx: 0 });
        continue;
      }

      let y = L.tabY;
      for (let i = 0; i < col.cards.length; i++) {
        const up = i >= nDown;
        const id = col.cards[i];
        const isDragged = G.drag && G.drag.from === ti && i >= G.drag.idx;
        if (!isDragged) {
          ctx.drawImage(up ? Sprite.face(id) : Sprite.back(), x, y, L.cardW, L.cardH);
          // 选中高亮（tap-to-move）
          if (G.sel && G.sel.p === 't' && G.sel.ti === ti && i >= G.sel.idx) {
            ctx.strokeStyle = PAL.hint; ctx.lineWidth = 3;
            Sprite.rr(ctx, x + 1, y + 1, L.cardW - 2, L.cardH - 2, L.cardW * 0.09);
            ctx.stroke();
          }
        }
        // ⚠ 底→顶注册（顶牌后注册 ⇒ hitTest 倒序遍历时先命中它）
        const hh = (i === col.cards.length - 1) ? L.cardH : (up ? off.up : off.down);
        if (up) addHit(x, y, L.cardW, hh, 'TAB', { ti, idx: i });
        y += up ? off.up : off.down;
      }
    }

    // ── 拖拽中的牌 ──
    if (G.drag) {
      const d = G.drag;
      d.cards.forEach((id, k) => {
        ctx.drawImage(Sprite.face(id), d.x, d.y + k * L.upOff, L.cardW, L.cardH);
      });
    }

    // ── 纸牌瀑布（合成持久拖尾层）──
    FX.draw(ctx);

    // ── HUD ──
    txtL(T('sol.score') + ' ' + s.score, L.playX + 8, L.hudY + L.hudH / 2, PAL.sub, '12px sans-serif');
    // ⭐ 「✓ 有解」角标 —— 点它进公平页（措辞死线：只说「存在解法」，绝不说「你一定能赢」）
    // ⚠ 可解性角标**只对 Klondike 有意义**：FreeCell 本来就 ~100% 可解，标了等于没标。
    //   FreeCell 显示的是**难度**（solver 求解节点数），那才是它真正的信息。
    const verified = !fc && Pool.isVerified(s.drawCount, s.seed);
    const diff = fc ? null : Pool.difficultyOf(s.drawCount, s.seed);
    const badge = fc ? T('sol.freecell')
                : (verified ? T('sol.verified') : T('sol.unverified'))
                  + (diff ? ' · ' + T('sol.' + diff) : '');
    // ⚠ 角标必须**左对齐**排在分数右边，绝不能贴右上角 —— 那里被 DOM 控制栏（语言按钮）压着，点不动。
    const bw2 = Math.max(96, badge.length * 7 + 16);
    const bx2 = L.playX + 8 + 78;
    fillRR(bx2, L.hudY, bw2, L.hudH, 6,
           verified ? 'rgba(126,242,160,0.22)' : 'rgba(0,0,0,0.22)');
    txt(badge, bx2 + bw2 / 2, L.hudY + L.hudH / 2,
        verified ? '#7ef2a0' : PAL.sub, 'bold 10px sans-serif');
    addHit(bx2, L.hudY, bw2, L.hudH, 'FAIR', {});
    txtR(T('sol.deal', { n: s.seed }), L.playX + L.playW - 8, L.hudY + L.hudH / 2, PAL.sub, '10px sans-serif');

    // ══ ⭐ 「这局还有解吗？」条 —— 本作唯一没有竞品有的按钮，也是 4.3(a) 的正面回答 ══
    //    它永远免费、永远不看广告：这是产品的灵魂，不是道具（变现红线 §7.4）。
    const P = Prover.st;
    if (P.phase === 'proving') {
      // 「正在证明…」—— 这个动画很重要：它让人相信**真的在算**（也确实在算）
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(255,216,77,0.18)');
      const dots = '.'.repeat(1 + (Math.floor(Date.now() / 300) % 3));
      txt(T('sol.proving') + dots, L.cx, L.proveY + L.proveH / 2, '#ffd84d', 'bold 14px sans-serif');
      const prog = Math.min(1, (Date.now() - P.t0) / 3000);
      fillRR(L.playX + 8, L.proveY + L.proveH - 3, (L.playW - 16) * prog, 3, 2, '#ffd84d');
    } else if (P.phase === 'done') {
      const win = P.result === 'solvable';
      const unk = P.result === 'unknown';
      const col = win ? '#7ef2a0' : unk ? '#ffd84d' : '#ff8f8f';
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(0,0,0,0.34)');
      const head = T('sol.' + Prover.verdictKey(), { n: P.deadFrom });
      txt(head, L.cx, L.proveY + 14, col, 'bold 13px sans-serif');
      const sub = win ? T('sol.proveWinSub') : unk ? T('sol.proveUnknownSub') : T('sol.proveDeadSub');
      txt(wrapLines(sub, L.playW - 30, 1)[0], L.cx, L.proveY + 30, PAL.sub, '10px sans-serif');
      // 死局 + 已定位 ⇒ 给一键回到最后有解的那一步（这才是「证明」的价值落地）
      if (P.result === 'dead' && P.deadFrom != null) {
        const bx = L.playX + L.playW - 8 - 120;
        fillRR(bx, L.proveY + 6, 112, L.proveH - 12, 8, 'rgba(255,255,255,0.22)');
        txt(T('sol.proveUndo', { n: P.deadFrom }), bx + 56, L.proveY + L.proveH / 2, '#fff', '10px sans-serif');
        addHit(bx, L.proveY + 6, 112, L.proveH - 12, 'UNDO_TO', { n: P.deadFrom });
      }
      addHit(L.playX + 8, L.proveY, L.playW - 16 - (P.result === 'dead' && P.deadFrom != null ? 124 : 0),
             L.proveH, 'PROVE', {});
    } else {
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(255,255,255,0.14)');
      txt('🔍 ' + T('sol.prove'), L.cx, L.proveY + L.proveH / 2, '#fff', 'bold 14px sans-serif');
      addHit(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 'PROVE', {});
    }

    // ── 底部工具条（撤销 / 提示 / 自动收牌 / 新局）—— 全部免费，永远不看广告（DESIGN §7.4）──
    const tools = [
      ['↩ ' + T('sol.undo'), 'UNDO', s.moves.length > 0],
      ['💡 ' + T('sol.hint'), 'HINT', true],
      ['⤴ ' + T('sol.auto'), 'AUTO', true],
      ['🔄 ' + T('sol.newGame'), 'NEW', true],
      // 切模式 = 换一局（模式是开局前属性，局中不可改）
      [fc ? '♠ ' + T('sol.klondike') : '⬛ ' + T('sol.freecell'), 'MODE', true],
    ];
    const bw = Math.floor((L.playW - 16 - (tools.length - 1) * 6) / tools.length);
    tools.forEach(([label, act, on], i) => {
      const x = L.playX + 8 + i * (bw + 6);
      fillRR(x, L.barY, bw, L.barH, 10, on ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)');
      txt(label, x + bw / 2, L.barY + L.barH / 2, on ? '#fff' : 'rgba(255,255,255,0.35)', '10px sans-serif');
      if (on) addHit(x, L.barY, bw, L.barH, act, {});
    });

    // 横幅**预留区**（真广告由 Ads 层贴上；这里只占位，绝不盖住牌）
    if (!G.noAds && L.bannerH) {
      fillRR(0, L.bannerY, SW, L.bannerH, 0, 'rgba(0,0,0,0.28)');
      txt(T('sol.adSlot'), SW / 2, L.bannerY + L.bannerH / 2, 'rgba(255,255,255,0.30)', '11px sans-serif');
    }

    // ── 赢局浮层 ──
    if (s.won && !FX.busy()) {
      drawDim('rgba(0,40,20,0.72)');
      txt(T('sol.youWin'), L.cx, SH * 0.34, '#fff', 'bold 30px sans-serif');
      txt(T('sol.finalScore', { n: s.score }), L.cx, SH * 0.42, '#ffd84d', 'bold 22px sans-serif');
      const clean = !s.usedUndo && !s.usedHint;
      txt(clean ? T('sol.cleanWin') : T('sol.withHelp'), L.cx, SH * 0.48,
          clean ? '#7ef2a0' : PAL.sub, '13px sans-serif');
      fillRR(L.cx - 90, SH * 0.56, 180, 48, 12, '#22c55e');
      txt(T('sol.newGame'), L.cx, SH * 0.56 + 24, '#fff', 'bold 16px sans-serif');
      addHit(L.cx - 90, SH * 0.56, 180, 48, 'NEW', {});
    }
  }

  root.Render = { renderAll, renderFair, PAL };
  root.renderAll = renderAll;
})(typeof self !== 'undefined' ? self : this);
