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

  function renderAll() {
    clearHits();
    const G = root.G;
    const s = G.s;
    const L = Layout.layout({ noBanner: G.noAds });
    Sprite.ensure(L.cardW, L.cardH, G.fourColor, G.bigText);

    const { SW, SH } = GameGlobal;
    const g = ctx.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, PAL.felt1); g.addColorStop(1, PAL.felt2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);

    // ── 顶排：stock / waste / foundations ──
    // stock
    if (s.stock.length) {
      ctx.drawImage(Sprite.back(), L.stockX, L.topY, L.cardW, L.cardH);
      txt(String(s.stock.length), L.stockX + L.cardW / 2, L.topY + L.cardH + 10, PAL.sub, '11px sans-serif');
    } else {
      drawSlot(L.stockX, L.topY, L.cardW, L.cardH, s.waste.length ? '↻' : '');
    }
    addHit(L.stockX, L.topY, L.cardW, L.cardH, 'STOCK', {});

    // waste（draw-3 时露出最后 3 张的一角）
    if (s.waste.length) {
      const show = Math.min(s.drawCount === 1 ? 1 : 3, s.waste.length);
      const fan = Math.round(L.cardW * 0.22);
      for (let k = 0; k < show; k++) {
        const id = s.waste[s.waste.length - show + k];
        const x = L.wasteX + k * fan;
        ctx.drawImage(Sprite.face(id), x, L.topY, L.cardW, L.cardH);
        if (k === show - 1) addHit(x, L.topY, L.cardW, L.cardH, 'WASTE', {});   // 只有顶牌可点
      }
    } else {
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
    for (let ti = 0; ti < 7; ti++) {
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
    txtL(T('sol.score') + ' ' + s.score, L.playX + 8, L.topY - 14, PAL.sub, '12px sans-serif');
    txtR(T('sol.deal', { n: s.seed }), L.playX + L.playW - 8, L.topY - 14, PAL.sub, '11px sans-serif');

    // ── 底部工具条（撤销 / 提示 / 自动收牌 / 新局）—— 全部免费，永远不看广告（DESIGN §7.4）──
    const bw = Math.floor((L.playW - 40) / 4);
    const tools = [
      ['↩ ' + T('sol.undo'), 'UNDO', s.moves.length > 0],
      ['💡 ' + T('sol.hint'), 'HINT', true],
      ['⤴ ' + T('sol.auto'), 'AUTO', true],
      ['🔄 ' + T('sol.newGame'), 'NEW', true],
    ];
    tools.forEach(([label, act, on], i) => {
      const x = L.playX + 8 + i * (bw + 8);
      fillRR(x, L.barY, bw, L.barH, 10, on ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.18)');
      txt(label, x + bw / 2, L.barY + L.barH / 2, on ? '#fff' : 'rgba(255,255,255,0.35)', '12px sans-serif');
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

  root.Render = { renderAll, PAL };
  root.renderAll = renderAll;
})(typeof self !== 'undefined' ? self : this);
