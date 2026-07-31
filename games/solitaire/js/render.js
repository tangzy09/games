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

    // ⚠ wrapLines 依赖当前 ctx.font ⇒ **先设 font、只调一次、复用数组**（调两次会算出不同行数 ⇒ 文字重叠）
    ctx.font = 'bold 19px sans-serif';
    const titleLines = wrapLines(T('sol.fairTitle'), w, 3);
    titleLines.forEach((ln, i) => txt(ln, cx, y + i * 24, '#fff', 'bold 19px sans-serif'));
    y += 24 * titleLines.length + 14;

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
    const noteLines = wrapLines(T('sol.fairBlindNote'), w, 4);
    noteLines.forEach((ln, i) =>
      txtL(ln, cx - w / 2, y + i * 14, 'rgba(255,255,255,0.55)', '10px sans-serif'));
    y += 14 * noteLines.length + 16;

    // ⭐ 「你输的时候真的没救了吗」—— 本产品最重要的一个数字（tools/measure-deadlock.js 实测）
    y += 2;
    txt(T('sol.fairLost'), cx, y, '#ffd84d', 'bold 13px sans-serif');
    y += 18;
    ctx.font = 'bold 11px sans-serif';
    const lostLines = wrapLines(T('sol.fairLostVal'), w, 2);
    lostLines.forEach((ln, i) => txt(ln, cx, y + i * 16, '#7ef2a0', 'bold 11px sans-serif'));
    y += 16 * lostLines.length + 6;
    ctx.font = '10px sans-serif';
    const lostSub = wrapLines(T('sol.fairLostSub'), w, 3);
    lostSub.forEach((ln, i) =>
      txtL(ln, cx - w / 2, y + i * 14, 'rgba(255,255,255,0.55)', '10px sans-serif'));
    y += 14 * lostSub.length + 12;

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

    // 底部双按钮：返回 + 分享此局（「你行你上」是纸牌玩家真实的社交冲动 —— 零后端的传播机制）
    fillRR(cx - 150, SH - 70, 140, 44, 12, 'rgba(255,255,255,0.20)');
    txt('‹ ' + T('sol.back'), cx - 80, SH - 48, '#fff', '14px sans-serif');
    addHit(cx - 150, SH - 70, 140, 44, 'PLAY', {});
    fillRR(cx + 10, SH - 70, 140, 44, 12, 'rgba(126,242,160,0.22)');
    txt('📣 ' + T('sol.share'), cx + 80, SH - 48, '#7ef2a0', '13px sans-serif');
    addHit(cx + 10, SH - 70, 140, 44, 'SHARE', {});
    drawToast();
  }

  /** 页面通用背景 + 返回按钮 */
  function page(title) {
    clearHits();
    const L = Layout.layout({ noBanner: true });
    const { SW, SH } = GameGlobal;
    Sprite.drawTable(ctx, 0, 0, SW, SH, Money.state.table);
    txt(title, L.cx, GameGlobal.safeTop + 30, '#fff', 'bold 20px sans-serif');
    fillRR(L.cx - 70, SH - 70, 140, 44, 12, 'rgba(255,255,255,0.20)');
    txt('‹ ' + T('sol.back'), L.cx, SH - 48, '#fff', '14px sans-serif');
    addHit(L.cx - 70, SH - 70, 140, 44, 'PLAY', {});
    return L;
  }

  /** 菜单：每日 / 统计 / 收藏 / 公平 / 去广告 */
  function renderMenu() {
    const L = page(T('sol.menu'));
    const { SH } = GameGlobal;
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    let y = GameGlobal.safeTop + 62;

    txt(T('sol.coins', { n: Money.coins }), cx, y, '#ffd84d', 'bold 15px sans-serif');
    y += 26;

    // 每日挑战：完成过今天的就亮 ✓；连续 ≥2 天挂 🔥（打卡即续 —— 回访钩子）
    const d0 = new Date();
    const doneToday = root.G.dailyDone === ('' + d0.getFullYear() + (d0.getMonth() + 1) + d0.getDate());
    const streak = dailyStreakDays();
    const dailySub = (doneToday ? T('sol.dailyDone') : T('sol.dailySub'))
      + (streak >= 2 ? '  🔥' + T('sol.dailyStreak', { n: streak }) : '');
    // 小屏（SE 等）：7 个入口 + 日历放不下 ⇒ 藏副标题、缩日历、砍看广告行（图鉴/结算屏有同款入口）
    const tall = GameGlobal.SH >= 760;
    const sub760 = t => tall ? t : '';
    const items = [
      ['📅 ' + T('sol.daily'), sub760(dailySub), 'DAILY'],
      ['👼 ' + T('sol.gallery'), sub760(T('sol.galleryProgress', { n: root.G.angels, m: Angels.total() || 500 })), 'GALLERY'],
      ['📊 ' + T('sol.stats'), '', 'STATS'],
      ['🏆 ' + T('sol.achievements'), '', 'ACH'],
      ['🎴 ' + T('sol.collection'), '', 'SHOP'],
      ['⚖ ' + T('sol.fair'), sub760(T('sol.fairTitle')), 'FAIR'],
      ['⚙ ' + T('sol.settings'), '', 'SET'],
    ];
    items.forEach(function (it) {
      const label = it[0], sub = it[1], act = it[2];
      const hh = sub ? 52 : 42;
      fillRR(cx - w / 2, y, w, hh, 10, 'rgba(0,0,0,0.26)');
      txtL(label, cx - w / 2 + 14, y + (sub ? 18 : 21), '#fff', 'bold 14px sans-serif');
      if (sub) txtL(wrapLines(sub, w - 28, 1)[0], cx - w / 2 + 14, y + 37, PAL.sub, '10px sans-serif');
      addHit(cx - w / 2, y, w, hh, act, {});
      y += hh + 8;
    });

    // 🔥 补签：昨天没来、连续天数正要断 ⇒ 看广告补上（条件出现，平时不占位）
    if (canMakeup() && !Money.noAds) {
      fillRR(cx - w / 2, y, w, 38, 10, 'rgba(255,216,77,0.22)');
      txt('▶ 🔥 ' + T('sol.makeup'), cx, y + 19, '#ffd84d', 'bold 12px sans-serif');
      addHit(cx - w / 2, y, w, 38, 'MAKEUP', {});
      y += 46;
    }

    // ── 每日挑战日历（本月）：连胜可视化，明天再来的钩子 ──
    const hist = root.G.dailyHist || {};
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayKey = d => '' + now.getFullYear() + (now.getMonth() + 1) + d;
    let done = 0;
    for (let d = 1; d <= dim; d++) if (hist[dayKey(d)]) done++;
    y += 4;
    txtL(T('sol.dailyMonth', { n: done }), cx - w / 2, y + 6, PAL.sub, '11px sans-serif');
    y += 16;
    const cs = GameGlobal.SH >= 760 ? 16 : 10;               // 小屏缩格子，别把下面按钮挤出屏
    for (let d = 1; d <= dim; d++) {
      const gx = cx - w / 2 + ((d - 1) % 7) * (cs + 6);
      const gy = y + Math.floor((d - 1) / 7) * (cs + 5);
      // 2=赢了(绿) 1=来打过(黄,连续天数认它) 0=没来
      fillRR(gx, gy, cs, cs, 4, hist[dayKey(d)] >= 2 ? 'rgba(126,242,160,0.75)'
                              : hist[dayKey(d)] ? 'rgba(255,216,77,0.45)' : 'rgba(0,0,0,0.25)');
      if (d === now.getDate()) {
        ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 2;
        Sprite.rr(ctx, gx, gy, cs, cs, 4); ctx.stroke();
      }
    }
    y += Math.ceil(dim / 7) * (cs + 5) + 10;

    // ⛔ 去广告 IAP **不做**（2026-07-31 拍板）：菜单里永远没有内购入口。
    //    （激励视频保留 —— 它不是 IAP，只换外观。）
    if (!Money.noAds && tall) {
      fillRR(cx - w / 2, y, w, 44, 10, 'rgba(255,255,255,0.14)');
      txt('▶ ' + T('sol.watchAd') + '  ' + T('sol.watchAdSub'), cx, y + 22, '#fff', '13px sans-serif');
      addHit(cx - w / 2, y, w, 44, 'EARN_AD', {});
    }

    txt(T('sol.freeForever'), cx, SH - 100, 'rgba(255,255,255,0.55)', '10px sans-serif');
  }

  /** 统计：**双口径**（DESIGN 4.5）—— 无限撤销会把总胜率架空，不分开记统计就是假的 */
  function renderStats() {
    const L = page(T('sol.stats'));
    const st = root.G.stats;
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    let y = GameGlobal.safeTop + 70;

    const rate = st.played ? Math.round(st.won / st.played * 100) : 0;
    const clean = st.played ? Math.round(st.cleanWon / st.played * 100) : 0;

    const rows = [
      [T('sol.played'), String(st.played)],
      [T('sol.wonN'), String(st.won)],
      [T('sol.winRate'), rate + '%'],
      [T('sol.streak'), String(st.streak || 0)],
      [T('sol.bestStreak'), String(st.bestStreak || 0)],
      [T('sol.bestTime'), st.bestTime ? fmtTime(st.bestTime) : '—'],
    ];
    // 每日奖牌（月度全勤金/≥20银/≥10铜 —— 微软纸牌验证了十年的回访钩子）
    const bd = root.G.badges || {};
    const cnt = t => Object.values(bd).filter(x => x === t).length;
    rows.push([T('sol.monthMedals'),
      '🥇' + cnt('gold') + ' 🥈' + cnt('silver') + ' 🥉' + cnt('bronze')]);
    rows.forEach(function (r) {
      fillRR(cx - w / 2, y, w, 34, 8, 'rgba(0,0,0,0.24)');
      txtL(r[0], cx - w / 2 + 14, y + 17, PAL.sub, '12px sans-serif');
      txtR(r[1], cx + w / 2 - 14, y + 17, '#fff', 'bold 14px sans-serif');
      y += 40;
    });

    // 零撤销·零提示胜率 —— 这才是玩家会拿去炫的那个数字
    y += 8;
    fillRR(cx - w / 2, y, w, 58, 10, 'rgba(126,242,160,0.18)');
    txtL(wrapLines(T('sol.cleanRate'), w - 90, 1)[0], cx - w / 2 + 14, y + 22, '#7ef2a0', 'bold 12px sans-serif');
    txtR(clean + '%', cx + w / 2 - 14, y + 24, '#7ef2a0', 'bold 20px sans-serif');
    txtL(String(st.cleanWon || 0) + ' / ' + st.played, cx - w / 2 + 14, y + 42, PAL.sub, '10px sans-serif');
    y += 68;
    ctx.font = '10px sans-serif';
    wrapLines(T('sol.cleanNote'), w, 3).forEach(function (ln, i) {
      txtL(ln, cx - w / 2, y + i * 14, 'rgba(255,255,255,0.55)', '10px sans-serif');
    });
  }

  /**
   * 收藏：牌背 / 桌布 / 瀑布 —— 激励视频的**消耗端**（没有它，激励视频那条腿约等于零收入）。
   * ⚠ 分页签：牌背扩到 19 款后三段摞不进一屏了 —— 一次只显示一个品类。
   */
  function renderShop() {
    const L = page(T('sol.collection'));
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    let y = GameGlobal.safeTop + 56;

    txt(T('sol.coins', { n: Money.coins }), cx, y, '#ffd84d', 'bold 14px sans-serif');
    y += 22;

    // 页签
    const tab = root.G.shopTab || 'back';
    const tabs = [['back', T('sol.backs')], ['table', T('sol.tables')], ['fx', T('sol.cascades')]];
    const tabW = Math.floor((w - 12) / 3);
    tabs.forEach(function (t, i) {
      const x = cx - w / 2 + i * (tabW + 6);
      const on = tab === t[0];
      fillRR(x, y, tabW, 30, 8, on ? '#22c55e' : 'rgba(0,0,0,0.26)');
      ctx.font = 'bold 11px sans-serif';
      txt(wrapLines(t[1], tabW - 10, 1)[0], x + tabW / 2, y + 15, '#fff', 'bold 11px sans-serif');
      if (!on) addHit(x, y, tabW, 30, 'SHOP_TAB', { t: t[0] });
    });
    y += 42;

    if (tab === 'back') {
      const cw = Math.floor((w - 24) / 5), ch = Math.round(cw * 1.42);
      const backY = y;
      Money.BACKS.forEach(function (it, i) {
        const x = cx - w / 2 + (i % 5) * (cw + 6);
        const by = backY + Math.floor(i / 5) * (ch + 6);
        const own = Money.owns('back', it.id);
        const on = Money.state.back === it.id;
        ctx.drawImage(backPreview(it.id, cw, ch), x, by);
        if (!own) {
          // ⚠ 遮罩要**轻**：看不清自己要买什么，就没人愿意为它看广告（收集系统的命门）
          fillRR(x, by, cw, ch, 5, 'rgba(0,0,0,0.34)');
          fillRR(x + cw / 2 - 17, by + ch / 2 - 9, 34, 18, 9, 'rgba(0,0,0,0.75)');
          txt(String(it.cost), x + cw / 2, by + ch / 2, '#ffd84d', 'bold 11px sans-serif');
        }
        if (on) { ctx.strokeStyle = '#7ef2a0'; ctx.lineWidth = 3; Sprite.rr(ctx, x, by, cw, ch, 5); ctx.stroke(); }
        addHit(x, by, cw, ch, 'PICK_BACK', { id: it.id });
      });
      y += Math.ceil(Money.BACKS.length / 5) * (ch + 6) + 12;
    } else if (tab === 'table') {
      const tw = Math.floor((w - 18) / 4);
      const tabY2 = y;
      Money.TABLES.forEach(function (it, i) {
        const x = cx - w / 2 + (i % 4) * (tw + 6);
        const ty = tabY2 + Math.floor(i / 4) * 60;
        const own = Money.owns('table', it.id);
        const on = Money.state.table === it.id;
        ctx.save();
        Sprite.rr(ctx, x, ty, tw, 54, 7); ctx.clip();
        Sprite.drawTable(ctx, x, ty, tw, 54, it.id);
        ctx.restore();
        if (!own) {
          fillRR(x, ty, tw, 54, 7, 'rgba(0,0,0,0.30)');
          fillRR(x + tw / 2 - 17, ty + 18, 34, 18, 9, 'rgba(0,0,0,0.75)');
          txt(String(it.cost), x + tw / 2, ty + 27, '#ffd84d', 'bold 11px sans-serif');
        }
        if (on) { ctx.strokeStyle = '#7ef2a0'; ctx.lineWidth = 3; Sprite.rr(ctx, x, ty, tw, 54, 7); ctx.stroke(); }
        addHit(x, ty, tw, 54, 'PICK_TABLE', { id: it.id });
      });
      y += Math.ceil(Money.TABLES.length / 4) * 60 + 12;
    } else {
      // ⭐ 瀑布特效 —— 贴着产品灵魂的收藏品（瀑布是玩家记了三十年的画面）
      const tw = Math.floor((w - 18) / 4);
      const fxY = y;
      const FX_EMO = { classic: '🃏', rainbow: '🌈', comet: '☄️', confetti: '🎉' };
      Money.FXS.forEach(function (it, i) {
        const x = cx - w / 2 + (i % 4) * (tw + 6);
        const fy = fxY + Math.floor(i / 4) * 60;
        const own = Money.owns('fx', it.id);
        const on = Money.state.fx === it.id;
        const gg = ctx.createLinearGradient(x, fy, x, fy + 54);
        gg.addColorStop(0, '#1e293b'); gg.addColorStop(1, '#0f172a');
        fillRR(x, fy, tw, 54, 7, gg);
        txt(FX_EMO[it.id] || '✨', x + tw / 2, fy + (own ? 27 : 16), '#fff', '18px sans-serif');
        if (!own) {
          fillRR(x + tw / 2 - 17, fy + 30, 34, 18, 9, 'rgba(0,0,0,0.75)');
          txt(String(it.cost), x + tw / 2, fy + 39, '#ffd84d', 'bold 11px sans-serif');
        }
        if (on) { ctx.strokeStyle = '#7ef2a0'; ctx.lineWidth = 3; Sprite.rr(ctx, x, fy, tw, 54, 7); ctx.stroke(); }
        addHit(x, fy, tw, 54, 'PICK_FX', { id: it.id });
      });
      y += Math.ceil(Money.FXS.length / 4) * 60 + 12;
    }

    // 小屏（SE 等）放不下这行 —— 图鉴/结算屏有同款激励入口，不缺
    if (!Money.noAds && GameGlobal.SH >= 760) {
      fillRR(cx - w / 2, y, w, 42, 10, 'rgba(255,255,255,0.14)');
      txt('▶ ' + T('sol.watchAd') + '  ' + T('sol.watchAdSub'), cx, y + 21, '#fff', '12px sans-serif');
      addHit(cx - w / 2, y, w, 42, 'EARN_AD', {});
    }
  }

  /**
   * 👼 天使图鉴：501 张长线收集（素材复用 snake 的同一份）。
   * 网格 24 张/页；已解锁画图、未解锁画 ? 暗格；点已解锁 → 大图；看广告 +3。
   * ⚠ 只缓存当前页的图（Angels.dropCache 在翻页时清）。
   */
  function renderGallery() {
    const L = page('👼 ' + T('sol.gallery'));
    const G = root.G;
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    const { SH } = GameGlobal;
    const total = Angels.total();
    let y = GameGlobal.safeTop + 56;

    txt(T('sol.galleryProgress', { n: G.angels, m: total || 500 }), cx, y, '#ffd84d', 'bold 15px sans-serif');
    y += 14;
    ctx.font = '10px sans-serif';
    txt(wrapLines(T('sol.galleryHint'), w, 1)[0], cx, y + 8, 'rgba(255,255,255,0.55)', '10px sans-serif');
    y += 24;

    // 网格 5 × 5 = 25/页 = **一集**（页即集：集组奖励与翻页天然对齐）
    const COLS = 5, ROWS = 5, PER = COLS * ROWS;
    const pages = Math.max(1, Math.ceil((total || 1) / PER));
    const pg = Math.min(G.galPage, pages - 1);
    const cell = Math.floor((w - (COLS - 1) * 6) / COLS);
    // 当前集进度（集齐的页亮金 ✓）
    const setStart = pg * PER, setEnd = Math.min(total, setStart + PER);
    const setGot = Math.max(0, Math.min(G.angels, setEnd) - setStart);
    const setFull = setEnd > setStart && setGot === setEnd - setStart;
    txt(T('sol.gallerySet', { k: pg + 1 }) + '  ' + setGot + '/' + (setEnd - setStart) + (setFull ? ' ✓' : ''),
        cx, y + 2, setFull ? '#ffd84d' : PAL.sub, 'bold 11px sans-serif');
    y += 16;
    for (let k = 0; k < PER; k++) {
      const i = pg * PER + k;
      if (i >= total) break;
      const x = cx - w / 2 + (k % COLS) * (cell + 6);
      const yy = y + Math.floor(k / COLS) * (cell + 6);
      if (i < G.angels) {
        const im = Angels.img(Angels.fileAt(i));
        if (im) {
          ctx.save();
          Sprite.rr(ctx, x, yy, cell, cell, 8); ctx.clip();
          const sc = Math.max(cell / im.width, cell / im.height);
          ctx.drawImage(im, x + (cell - im.width * sc) / 2, yy + (cell - im.height * sc) / 2,
                        im.width * sc, im.height * sc);
          ctx.restore();
        } else {
          fillRR(x, yy, cell, cell, 8, 'rgba(255,255,255,0.14)');   // 加载中
        }
        addHit(x, yy, cell, cell, 'GAL_VIEW', { i });
      } else {
        fillRR(x, yy, cell, cell, 8, 'rgba(0,0,0,0.30)');
        txt('?', x + cell / 2, yy + cell / 2, 'rgba(255,255,255,0.25)', 'bold 16px sans-serif');
      }
    }
    y += ROWS * (cell + 6) + 6;

    // 翻页 ‹ n/pages ›
    txt((pg + 1) + ' / ' + pages, cx, y + 14, PAL.sub, '12px sans-serif');
    if (pg > 0) {
      fillRR(cx - w / 2, y, 60, 28, 8, 'rgba(255,255,255,0.16)');
      txt('‹', cx - w / 2 + 30, y + 14, '#fff', 'bold 15px sans-serif');
      addHit(cx - w / 2, y, 60, 28, 'GAL_PG', { p: pg - 1 });
    }
    if (pg < pages - 1) {
      fillRR(cx + w / 2 - 60, y, 60, 28, 8, 'rgba(255,255,255,0.16)');
      txt('›', cx + w / 2 - 30, y + 14, '#fff', 'bold 15px sans-serif');
      addHit(cx + w / 2 - 60, y, 60, 28, 'GAL_PG', { p: pg + 1 });
    }
    y += 36;

    // 看广告 +3（纯增益消耗端）
    if (!Money.noAds && G.angels < total) {
      fillRR(cx - w / 2, y, w, 38, 10, 'rgba(255,216,77,0.20)');
      txt('▶ ' + T('sol.galleryAd'), cx, y + 19, '#ffd84d', 'bold 12px sans-serif');
      addHit(cx - w / 2, y, w, 38, 'GAL_AD', {});
    }

    // 大图查看浮层
    if (G.galView != null && G.galView < G.angels) {
      drawDim('rgba(0,0,0,0.82)');
      const im = Angels.img(Angels.fileAt(G.galView));
      const size = Math.min(GameGlobal.SW, SH) - 60;
      const ix = (GameGlobal.SW - size) / 2, iy = (SH - size) / 2 - 20;
      if (im) {
        ctx.save();
        Sprite.rr(ctx, ix, iy, size, size, 16); ctx.clip();
        const sc = Math.max(size / im.width, size / im.height);
        ctx.drawImage(im, ix + (size - im.width * sc) / 2, iy + (size - im.height * sc) / 2,
                      im.width * sc, im.height * sc);
        ctx.restore();
      } else {
        fillRR(ix, iy, size, size, 16, 'rgba(255,255,255,0.12)');
      }
      txt((G.galView + 1) + ' / ' + total, cx, iy + size + 26, '#fff', 'bold 13px sans-serif');
      addHit(0, 0, GameGlobal.SW, SH, 'GAL_CLOSE', {});
      // 存壁纸（⚠ 必须注册在 GAL_CLOSE 之后 —— hitTest 后注册优先）
      const wy2 = iy + size + 44;
      fillRR(cx - 100, wy2, 200, 40, 12, 'rgba(255,216,77,0.24)');
      txt('💾 ' + T('sol.saveWall'), cx, wy2 + 20, '#ffd84d', 'bold 13px sans-serif');
      addHit(cx - 100, wy2, 200, 40, 'GAL_WALL', {});
    }
    drawToast();
  }

  /** 成就页：11 项里程碑，达成发金币（目标感 + 收集系统的供弹药）。ACHS 定义在 main.js */
  function renderAch() {
    const L = page(T('sol.achievements'));
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    let y = GameGlobal.safeTop + 58;
    const got = root.G.ach || {};
    const rowH = GameGlobal.SH >= 760 ? 34 : 28;
    // 18 项单页放不下 ⇒ 12/页 + 翻页
    const PER = 12;
    const pages = Math.ceil(ACHS.length / PER);
    const pg = Math.min(root.G.achPage || 0, pages - 1);
    ACHS.slice(pg * PER, (pg + 1) * PER).forEach(function (a) {
      const done = !!got[a.id];
      fillRR(cx - w / 2, y, w, rowH, 8, done ? 'rgba(126,242,160,0.16)' : 'rgba(0,0,0,0.24)');
      ctx.font = '12px sans-serif';
      const name = wrapLines(T('sol.ach_' + a.id), w - 100, 1)[0];
      txtL((done ? '🏆 ' : '🔒 ') + name, cx - w / 2 + 12, y + rowH / 2,
           done ? '#7ef2a0' : PAL.sub, '12px sans-serif');
      txtR(done ? '✓' : '+' + a.coins, cx + w / 2 - 12, y + rowH / 2,
           done ? '#7ef2a0' : '#ffd84d', 'bold 12px sans-serif');
      y += rowH + 6;
    });
    y += 4;
    txt((pg + 1) + ' / ' + pages, cx, y + 14, PAL.sub, '12px sans-serif');
    if (pg > 0) {
      fillRR(cx - w / 2, y, 60, 28, 8, 'rgba(255,255,255,0.16)');
      txt('‹', cx - w / 2 + 30, y + 14, '#fff', 'bold 15px sans-serif');
      addHit(cx - w / 2, y, 60, 28, 'ACH_PG', { p: pg - 1 });
    }
    if (pg < pages - 1) {
      fillRR(cx + w / 2 - 60, y, 60, 28, 8, 'rgba(255,255,255,0.16)');
      txt('›', cx + w / 2 - 30, y + 14, '#fff', 'bold 15px sans-serif');
      addHit(cx + w / 2 - 60, y, 60, 28, 'ACH_PG', { p: pg + 1 });
    }
  }

  /** ❓ 怎么玩：Klondike / draw 模式 / FreeCell supermove / 证明器 / 免费三件套 */
  function renderHelp() {
    const L = page(T('sol.help'));
    const cx = L.cx, w = Math.min(L.playW - 40, 400);
    let y = GameGlobal.safeTop + 56;
    for (let i = 1; i <= 5; i++) {
      ctx.font = '12px sans-serif';
      const lines = wrapLines(T('sol.help' + i), w - 24, 6);
      const h = lines.length * 16 + 16;
      fillRR(cx - w / 2, y, w, h, 10, 'rgba(0,0,0,0.24)');
      lines.forEach((ln, j) => txtL(ln, cx - w / 2 + 12, y + 14 + j * 16, PAL.sub, '12px sans-serif'));
      y += h + 8;
    }
  }

  // 牌背预览（离屏缓存；⚠ 用完要把当前牌背还原，否则会污染牌桌）
  const prevCache = {};
  function backPreview(id, w, h) {
    const k = id + 'x' + w;
    if (!prevCache[k]) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const save = Money.state.back;
      Sprite.setBack(id);
      Sprite.ensure(w, h, root.G.fourColor, root.G.bigText);
      c.getContext('2d').drawImage(Sprite.back(), 0, 0, w, h);
      Sprite.setBack(save);
      // ⚠ 图片款没加载完时画的是兜底渐变 ⇒ **不缓存**（onload 会触发重画，那时再定稿）
      if (!Sprite.backReady(id)) return c;
      prevCache[k] = c;
    }
    return prevCache[k];
  }

  /**
   * ⭐ 首启一屏（仅第一次，可一键跳过）—— 这是 **App Store 4.3(a) 的主要防线**。
   *
   * 纸牌是极端红海，我们的玩法是 100% 经典规则。真正的差异（设备上跑求解器、公开可解率落差）
   * 全都藏在按钮后面 —— 而审核员只花两三分钟：打开 → 看到一张普通牌桌 → 4.3(a) 拒。
   * ⇒ 差异必须在**头 5 秒内自己撞到脸上**。这一屏就是干这个的。
   *
   * ⚠ 它同时是「诚实」的第一次亮相：这里就把「有解 ≠ 你一定能赢」说清楚。
   *   把承诺吹大、让玩家自己撞上落差，是这个产品唯一会死的方式。
   */
  function renderIntro() {
    clearHits();
    const L = Layout.layout({ noBanner: true });
    const { SW, SH } = GameGlobal;
    const tb = Sprite.tableStyle('felt');
    const g = ctx.createLinearGradient(0, 0, 0, SH);
    g.addColorStop(0, tb.a); g.addColorStop(1, tb.b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);

    const cx = L.cx, w = Math.min(L.playW - 44, 400);
    let y = GameGlobal.safeTop + 52;

    ctx.font = 'bold 22px sans-serif';
    const iTitle = wrapLines(T('sol.introTitle'), w, 2);
    iTitle.forEach((ln, i) => txt(ln, cx, y + i * 28, '#fff', 'bold 22px sans-serif'));
    y += 28 * iTitle.length + 10;

    ctx.font = '12px sans-serif';
    const iSub = wrapLines(T('sol.introSub'), w, 3);
    iSub.forEach((ln, i) => txt(ln, cx, y + i * 17, '#7ef2a0', '12px sans-serif'));
    y += 17 * iSub.length + 20;

    [['⚖', 'introB1'], ['🔍', 'introB2'], ['🎁', 'introB3']].forEach(function (it) {
      const lines = wrapLines(T('sol.' + it[1]), w - 34, 4);
      const h = Math.max(44, lines.length * 16 + 16);
      fillRR(cx - w / 2, y, w, h, 10, 'rgba(0,0,0,0.26)');
      txt(it[0], cx - w / 2 + 17, y + h / 2, '#ffd84d', '15px sans-serif');
      lines.forEach((ln, i) =>
        txtL(ln, cx - w / 2 + 34, y + 8 + 16 * i + 8, PAL.sub, '11px sans-serif'));
      y += h + 10;
    });

    y += 8;
    fillRR(cx - 90, y, 180, 50, 13, '#22c55e');
    txt(T('sol.introGo'), cx, y + 25, '#fff', 'bold 16px sans-serif');
    addHit(cx - 90, y, 180, 50, 'INTRO_GO', {});
    y += 60;
    txt(T('sol.introFair') + ' ›', cx, y + 12, 'rgba(255,255,255,0.65)', '12px sans-serif');
    addHit(cx - 80, y, 160, 30, 'INTRO_FAIR', {});
  }

  /**
   * ⭐ 设置页 —— 四色牌 / 大字号 / 翻牌数 / 音效。
   *
   * ⚠ 这些功能**代码里一直都有，但玩家一个都开不了**（没有任何 UI 入口）——
   *   等于死代码。尤其 **draw-1**：可解率 90.5%、盲打胜率 32%（draw-3 只有 7.6%），
   *   是老年 / 休闲玩家的首选模式，而他们此前根本进不去。
   * ⚠ 四色牌是无障碍标配：对老花 / 色觉衰退用户，它的价值**高于大字号** ——
   *   小牌面上最难分的正是 ♠/♣ 和 ♥/♦。
   */
  function renderSettings() {
    const L = page(T('sol.settings'));
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    let y = GameGlobal.safeTop + 66;
    const G = root.G;

    function toggle(label, sub, isOn, act) {
      const lines = sub ? wrapLines(sub, w - 90, 2) : [];
      const h = 44 + lines.length * 13;
      fillRR(cx - w / 2, y, w, h, 10, 'rgba(0,0,0,0.26)');
      txtL(label, cx - w / 2 + 14, y + 20, '#fff', 'bold 13px sans-serif');
      lines.forEach((ln, i) =>
        txtL(ln, cx - w / 2 + 14, y + 38 + i * 13, 'rgba(255,255,255,0.55)', '10px sans-serif'));
      // 开关
      const sx = cx + w / 2 - 60, sy = y + 12;
      fillRR(sx, sy, 46, 24, 12, isOn ? '#22c55e' : 'rgba(255,255,255,0.20)');
      ctx.beginPath();
      ctx.arc(sx + (isOn ? 34 : 12), sy + 12, 9, 0, 7);
      ctx.fillStyle = '#fff'; ctx.fill();
      addHit(cx - w / 2, y, w, h, act, {});
      y += h + 10;
    }

    // ⚠ 小屏（SE 等）放不下全部说明文字 ⇒ 短屏藏副标题，保按钮全部可见可点
    const subIf = t => GameGlobal.SH >= 760 ? t : '';

    // ⭐ 舒适模式放最上面：65+ 是本品类主力人群，这个开关就是给他们的（DESIGN §7.5）
    toggle(T('sol.comfort'), subIf(T('sol.comfortSub')), !!G.comfort, 'TOG_COMFORT');
    toggle(T('sol.fourColor'), subIf(T('sol.fourColorSub')), !!G.fourColor, 'TOG_4COLOR');
    toggle(T('sol.bigText'), subIf(T('sol.bigTextSub')), !!G.bigText, 'TOG_BIGTEXT');
    toggle(T('sol.reduceFx'), subIf(T('sol.reduceFxSub')), !!G.reduceFx, 'TOG_RFX');
    toggle(T('sol.sound'), '', typeof AudioState === 'undefined' ? true : AudioState.sfxOn, 'TOG_SOUND');

    // 翻牌数（只对 Klondike 有意义）—— ⚠ 开局前属性，改了就换一局（否则「已验证可解」角标失效）
    if (G.s.mode !== 'freecell') {
      y += 6;
      const lines = GameGlobal.SH >= 760 ? wrapLines(T('sol.drawSub'), w - 28, 3) : [];
      const h = 48 + lines.length * 13;
      fillRR(cx - w / 2, y, w, h, 10, 'rgba(0,0,0,0.26)');
      txtL(T('sol.drawMode'), cx - w / 2 + 14, y + 18, '#fff', 'bold 13px sans-serif');
      [[1, 'draw1'], [3, 'draw3']].forEach(function (d, i) {
        const bx = cx + w / 2 - 14 - (2 - i) * 72 + 4;
        const on = G.s.drawCount === d[0];
        fillRR(bx, y + 6, 66, 26, 8, on ? '#22c55e' : 'rgba(255,255,255,0.16)');
        txt(T('sol.' + d[1]), bx + 33, y + 19, '#fff', 'bold 11px sans-serif');
        if (!on) addHit(bx, y + 6, 66, 26, 'SET_DRAW', { n: d[0] });
      });
      lines.forEach((ln, i) =>
        txtL(ln, cx - w / 2 + 14, y + 42 + i * 13, 'rgba(255,255,255,0.55)', '10px sans-serif'));
      y += h + 10;

      // ⭐ 难度旋钮（只对 Klondike 有意义 —— FreeCell 不用池）。
      //   分档依据 = 盲打 AI 赢不赢得了（玩家的真实体验），不是拍脑袋的数值。**下一局生效**。
      const dLines = GameGlobal.SH >= 760 ? wrapLines(T('sol.diffSub'), w - 28, 3) : [];
      const dh = 48 + dLines.length * 13;
      fillRR(cx - w / 2, y, w, dh, 10, 'rgba(0,0,0,0.26)');
      txtL(T('sol.difficulty'), cx - w / 2 + 14, y + 18, '#fff', 'bold 13px sans-serif');
      [['any', 'diffAny'], ['easy', 'easy'], ['hard', 'hard']].forEach(function (d, i) {
        const bx = cx + w / 2 - 14 - (3 - i) * 62 + 4;
        const on = (G.difficulty || 'any') === d[0];
        fillRR(bx, y + 6, 56, 26, 8, on ? '#22c55e' : 'rgba(255,255,255,0.16)');
        txt(T('sol.' + d[1]), bx + 28, y + 19, '#fff', 'bold 11px sans-serif');
        if (!on) addHit(bx, y + 6, 56, 26, 'SET_DIFF', { d: d[0] });
      });
      dLines.forEach((ln, i) =>
        txtL(ln, cx - w / 2 + 14, y + 42 + i * 13, 'rgba(255,255,255,0.55)', '10px sans-serif'));
      y += dh + 10;
    }

    // #️⃣ 局号直输 + ❓ 怎么玩（半宽双钮一行 —— 小屏也塞得下）
    const half = Math.floor((w - 8) / 2);
    fillRR(cx - w / 2, y, half, 40, 10, 'rgba(0,0,0,0.26)');
    txt('#️⃣ ' + T('sol.enterSeed'), cx - w / 2 + half / 2, y + 20, '#fff', 'bold 12px sans-serif');
    addHit(cx - w / 2, y, half, 40, 'ENTER_SEED', {});
    fillRR(cx - w / 2 + half + 8, y, half, 40, 10, 'rgba(0,0,0,0.26)');
    txt('❓ ' + T('sol.help'), cx - w / 2 + half + 8 + half / 2, y + 20, '#fff', 'bold 12px sans-serif');
    addHit(cx - w / 2 + half + 8, y, half, 40, 'HELP', {});
  }

  function renderAll() {
    const ph = root.G.phase;
    if (ph === 'SET') return renderSettings();
    if (ph === 'INTRO') return renderIntro();
    if (ph === 'FAIR') return renderFair();
    if (ph === 'MENU') return renderMenu();
    if (ph === 'STATS') return renderStats();
    if (ph === 'ACH') return renderAch();
    if (ph === 'HELP') return renderHelp();
    if (ph === 'GALLERY') return renderGallery();
    if (ph === 'SHOP') return renderShop();
    clearHits();
    const G = root.G;
    const s = G.s;
    const fc = s.mode === 'freecell';
    const L = Layout.layout({ noBanner: G.noAds, cols: fc ? 8 : 7 });
    Sprite.ensure(L.cardW, L.cardH, G.fourColor, G.bigText);

    const { SW, SH } = GameGlobal;
    Sprite.setBack(Money.state.back);                     // 牌背（收藏品）
    Sprite.drawTable(ctx, 0, 0, SW, SH, Money.state.table);   // 桌布（图片款 cover，渐变兜底）

    // ── 顶排 ──
    if (fc) {
      // FreeCell：4 个 free cell（左）+ 4 个 foundation（右）。没有牌堆。
      for (let ci = 0; ci < 4; ci++) {
        const x = L.cellX(ci);
        const id = s.free[ci];
        if (id != null && !FX.isFlying(id)) ctx.drawImage(Sprite.face(id), x, L.topY, L.cardW, L.cardH);
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
        // ⚠ 正在飞的牌不能在目标位置画（否则同时出现在两处）
        if (!FX.isFlying(id)) ctx.drawImage(Sprite.face(id), x, L.topY, L.cardW, L.cardH);
        if (k === show - 1) addHit(x, L.topY, L.cardW, L.cardH, 'WASTE', {});   // 只有顶牌可点
      }
    } else if (!fc) {
      drawSlot(L.wasteX, L.topY, L.cardW, L.cardH);
    }

    // foundations
    for (let fi = 0; fi < 4; fi++) {
      const x = L.foundX(fi);
      const f = s.foundations[fi];
      const ftop = f.length ? f[f.length - 1] : null;
      if (ftop != null && !FX.isFlying(ftop)) ctx.drawImage(Sprite.face(ftop), x, L.topY, L.cardW, L.cardH);
      else if (ftop != null && f.length > 1) ctx.drawImage(Sprite.face(f[f.length - 2]), x, L.topY, L.cardW, L.cardH);
      else if (ftop == null) drawSlot(x, L.topY, L.cardW, L.cardH, Sprite.SUIT_SYM[fi]);
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
        // ⚠ 正在**滑动**中的牌不能在目标位置画 —— 否则它会同时出现在两个地方
        if (!isDragged && !FX.isFlying(id)) {
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

    // ── 拿着牌时把合法落点描出来（拖拽或选中都算）──
    //    新手学习成本直降；FreeCell 的 supermove 张数限制也从「莫名放不下」变成「一眼看懂」。
    const held = G.drag
      ? (G.drag.from === 'w' ? { p: 'w' } : { p: 't', ti: G.drag.from, idx: G.drag.idx })
      : G.sel;
    if (held && !s.won) {
      for (const mv of Core.destsFor(s, held)) {
        let p;
        if (mv.t === 'tf' || mv.t === 'wf' || mv.t === 'cf') p = { x: L.foundX(mv.fi), y: L.topY };
        else if (mv.t === 'tc') p = { x: L.cellX(mv.ci), y: L.topY };
        else {
          const tj = mv.t === 'wt' ? mv.ti : mv.tj;
          const col = s.tableau[tj];
          p = Layout.cardXY(s, { p: 't', ti: tj, i: col.cards.length ? col.cards.length - 1 : 0 });
        }
        ctx.save();
        ctx.strokeStyle = 'rgba(126,242,160,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([5, 4]);
        Sprite.rr(ctx, p.x + 1, p.y + 1, L.cardW - 2, L.cardH - 2, L.cardW * 0.09);
        ctx.stroke(); ctx.restore();
      }
    }

    // ── 提示可视化：源牌黄框 + 落点绿虚线框（点了提示必须看得见东西）──
    if (G.hintMove && !s.won) drawHintMove(s, L, G.hintMove);

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
    // FreeCell 角标带 supermove 容量（(空格+1)×2^空列 —— 行家都在心算这个数）
    const badge = fc ? T('sol.freecell') + ' · ' + T('sol.maxMove', { n: RulesF.maxMove(s, false) })
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
    // 「☰ #N」= 菜单入口（工具条 5 个按钮已满，菜单挂这里）
    const mw = 92;
    fillRR(L.playX + L.playW - 8 - mw, L.hudY, mw, L.hudH, 6, 'rgba(0,0,0,0.22)');
    txt('☰ #' + s.seed, L.playX + L.playW - 8 - mw / 2, L.hudY + L.hudH / 2, PAL.sub, '10px sans-serif');
    addHit(L.playX + L.playW - 8 - mw, L.hudY, mw, L.hudH, 'MENU', {});

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
      // ⭐ 有解 + 解法在手 ⇒ 「演 3 步」（强提示——只演头 3 步，演完整解=把游戏变成看戏）
      const canDemo = P.result === 'solvable' && P.solMoves && P.solMoves.length > 0;
      if (canDemo) {
        const bx = L.playX + L.playW - 8 - 104;
        fillRR(bx, L.proveY + 6, 96, L.proveH - 12, 8, 'rgba(126,242,160,0.25)');
        txt('▶ ' + T('sol.demo3'), bx + 48, L.proveY + L.proveH / 2, '#7ef2a0', 'bold 11px sans-serif');
        addHit(bx, L.proveY + 6, 96, L.proveH - 12, 'DEMO3', {});
      }
      const rsv = (P.result === 'dead' && P.deadFrom != null) ? 124 : (canDemo ? 108 : 0);
      addHit(L.playX + 8, L.proveY, L.playW - 16 - rsv, L.proveH, 'PROVE', {});
    } else if (!fc && G.jokerOffer > Date.now() && G.jokers < 1 && !Money.noAds) {
      // 🃏 真卡死（提示翻穿一圈也没步 / prover 判死局）⇒ 救场入口。
      //   ⚠ 红线口径:救场与 snake 的「AI 救场看广告」同类;提示/撤销/证明本身永远免费。
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(255,216,77,0.22)');
      txt('🃏 ' + T('sol.jokerAd'), L.cx, L.proveY + L.proveH / 2, '#ffd84d', 'bold 13px sans-serif');
      addHit(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 'JOKER_AD', {});
    } else if (Core.canAutoFinish(s)) {
      // ⭐ 稳赢收尾：全明牌 + 牌堆空 ⇒ 剩下的整理不用手磨,solver 播完直接接瀑布
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(126,242,160,0.25)');
      txt('✨ ' + T('sol.autoFinish'), L.cx, L.proveY + L.proveH / 2, '#7ef2a0', 'bold 14px sans-serif');
      addHit(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 'FINISH', {});
    } else {
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(255,255,255,0.14)');
      txt('🔍 ' + T('sol.prove'), L.cx, L.proveY + L.proveH / 2, '#fff', 'bold 14px sans-serif');
      addHit(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 'PROVE', {});
    }

    // 🃏 已持有的万能牌：悬浮按钮（点一下召唤最缺的 foundation 牌）
    if (!fc && G.jokers > 0 && !s.won) {
      const jx = L.playX + L.playW - 8 - 52, jy = L.proveY - 50;
      fillRR(jx, jy, 52, 42, 12, 'rgba(255,216,77,0.30)');
      txt('🃏×' + G.jokers, jx + 26, jy + 21, '#ffd84d', 'bold 13px sans-serif');
      addHit(jx, jy, 52, 42, 'JOKER_USE', {});
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
      let wy = SH * 0.28;
      txt(T('sol.youWin'), L.cx, wy, '#fff', 'bold 30px sans-serif'); wy += 46;
      txt(T('sol.finalScore', { n: s.score }), L.cx, wy, '#ffd84d', 'bold 22px sans-serif'); wy += 26;
      txt(T('sol.timeMoves', { t: fmtTime(root.G.tAcc), m: s.moves.length }),
          L.cx, wy, PAL.sub, '11px sans-serif'); wy += 22;
      const clean = !s.usedUndo && !s.usedHint && !s.usedJoker;
      txt(clean ? T('sol.cleanWin') : T('sol.withHelp'), L.cx, wy,
          clean ? '#7ef2a0' : PAL.sub, '13px sans-serif'); wy += 22;
      // 本次赢的金币（×2 翻倍后带 ✓）+ 新解锁的天使
      txt(T('sol.winCoins', { n: G.lastWinCoins || 0 }) + (G.winDoubled ? '  ×2 ✓' : '')
          + (G.lastAngelGain ? '   👼 +' + G.lastAngelGain : ''),
          L.cx, wy, '#ffd84d', 'bold 13px sans-serif'); wy += 22;
      // 🏅 本局排行榜（预设对手,seed 确定性 —— 零后端伪社交,同一局全球同一组分数）
      const rows2 = rivalScores(s.seed).concat([{ name: T('sol.rankYou'), ava: '⭐', score: s.score, you: 1 }])
        .sort((a, b) => b.score - a.score);
      txt(T('sol.rankTitle'), L.cx, wy, PAL.sub, 'bold 11px sans-serif'); wy += 16;
      const lw = 210;
      rows2.forEach((r, i) => {
        const col = r.you ? '#7ef2a0' : 'rgba(255,255,255,0.75)';
        txtL((i + 1) + '. ' + r.ava + ' ' + r.name, L.cx - lw / 2, wy, col,
             (r.you ? 'bold ' : '') + '12px sans-serif');
        txtR(String(r.score), L.cx + lw / 2, wy, col, (r.you ? 'bold ' : '') + '12px sans-serif');
        wy += 17;
      });
      wy += 8;
      // ⭐ 每日挑战：盲打 AI 战绩对比（同一副牌、同样看不见暗牌 —— 它输你赢是真本事）
      if (G.dailySeed === s.seed && G.dailyAI && G.dailyAI.seed === s.seed) {
        const ai = G.dailyAI;
        const line = ai.won ? T('sol.dailyAiWon', { n: ai.moves, m: s.moves.length })
                            : T('sol.dailyAiLost');
        ctx.font = '12px sans-serif';
        const als = wrapLines(line, Math.min(L.playW - 40, 360), 2);
        als.forEach((ln, i) => txt(ln, L.cx, wy + i * 16, '#ffd84d', '12px sans-serif'));
        wy += als.length * 16 + 6;
      }
      wy += 6;
      fillRR(L.cx - 90, wy, 180, 48, 12, '#22c55e');
      txt(T('sol.newGame'), L.cx, wy + 24, '#fff', 'bold 16px sans-serif');
      addHit(L.cx - 90, wy, 180, 48, 'NEW', {});
      wy += 56;
      // 挑战朋友：战绩图卡（支持文件分享时出图，桌面等环境自动降级为链接分享）
      fillRR(L.cx - 90, wy, 180, 40, 12, 'rgba(255,255,255,0.18)');
      txt('📣 ' + T('sol.challenge'), L.cx, wy + 20, '#fff', '13px sans-serif');
      addHit(L.cx - 90, wy, 180, 40, 'SHARE_CARD', {});
      wy += 48;
      // ⭐ 「金币 ×2」：转化最高的激励位（刚赢、瀑布刚放完）。纯增益；买了去广告的不打扰。
      if (!Money.noAds && G.lastWinCoins > 0 && !G.winDoubled) {
        fillRR(L.cx - 90, wy, 180, 40, 12, 'rgba(255,216,77,0.24)');
        txt('▶ ' + T('sol.adX2') + ' (+' + G.lastWinCoins + ')', L.cx, wy + 20, '#ffd84d', 'bold 13px sans-serif');
        addHit(L.cx - 90, wy, 180, 40, 'WIN_X2', {});
      }
    }
    drawToast();
  }

  const fmtTime = ms => {
    const t = Math.max(0, Math.round(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };

  /** 提示的源/落点框（与 moveAnim 同一套 cardXY 坐标约定）*/
  function drawHintMove(s, L, m) {
    const box = (p, color, dash) => {
      if (!p) return;
      ctx.save();
      ctx.strokeStyle = color; ctx.lineWidth = 3;
      if (dash) ctx.setLineDash([6, 4]);
      Sprite.rr(ctx, p.x + 1, p.y + 1, L.cardW - 2, L.cardH - 2, L.cardW * 0.09);
      ctx.stroke(); ctx.restore();
    };
    const land = tj => Layout.cardXY(s, { p: 't', ti: tj, i: s.tableau[tj].cards.length });
    let src = null, dst = null;
    if (m.t === 'tt') { src = Layout.cardXY(s, { p: 't', ti: m.ti, i: m.idx }); dst = land(m.tj); }
    else if (m.t === 'tf') { src = Layout.cardXY(s, { p: 't', ti: m.ti, i: s.tableau[m.ti].cards.length - 1 }); dst = { x: L.foundX(m.fi), y: L.topY }; }
    else if (m.t === 'wf') { src = Layout.cardXY(s, { p: 'w' }); dst = { x: L.foundX(m.fi), y: L.topY }; }
    else if (m.t === 'wt') { src = Layout.cardXY(s, { p: 'w' }); dst = land(m.ti); }
    else if (m.t === 'tc') { src = Layout.cardXY(s, { p: 't', ti: m.ti, i: s.tableau[m.ti].cards.length - 1 }); dst = { x: L.cellX(m.ci), y: L.topY }; }
    else if (m.t === 'ct') { src = Layout.cardXY(s, { p: 'c', ci: m.ci }); dst = land(m.tj); }
    else if (m.t === 'cf') { src = Layout.cardXY(s, { p: 'c', ci: m.ci }); dst = { x: L.foundX(m.fi), y: L.topY }; }
    else if (m.t === 'ft') { src = { x: L.foundX(m.fi), y: L.topY }; dst = land(m.ti); }
    box(src, '#ffd84d');
    box(dst, '#7ef2a0', true);
  }

  /** 轻提示（分享已复制等）—— 谁在最后画谁在最上面 */
  function drawToast() {
    const t = root.G.toast;
    if (!t || Date.now() > t.until) return;
    const { SW, SH } = GameGlobal;
    ctx.font = '12px sans-serif';
    const tw = Math.min(SW - 40, ctx.measureText(t.msg).width + 36);
    fillRR(SW / 2 - tw / 2, SH - 132, tw, 36, 18, 'rgba(0,0,0,0.80)');
    txt(t.msg, SW / 2, SH - 114, '#fff', '12px sans-serif');
  }

  root.Render = { renderAll, renderIntro, renderFair, renderMenu, renderStats, renderShop, renderSettings, PAL };
  root.renderAll = renderAll;
})(typeof self !== 'undefined' ? self : this);
