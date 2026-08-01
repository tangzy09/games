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

  // ── 共享 UI 图标库（engine/assets/ui，全仓一份）──
  //    系统 emoji 每个平台长得都不一样、跟这个游戏的天使世界观也没关系 ⇒ 显眼位置一律换掉。
  //    ⛔ 别在 games/solitaire/assets/ui/ 放第二份（tools/check-ui-icons.cjs 会拦）。
  const UI = makeUIArt(['star', 'lock', 'coin', 'gem', 'trophy', 'medal', 'crown', 'check',
                        'calendar', 'clock', 'fire', 'sparkle', 'gift', 'share', 'feedback',
                        'settings', 'palette', 'chart', 'scroll', 'book', 'frame', 'picture-done',
                        'shield-heart', 'hint', 'video-ad', 'search', 'eye', 'cards', 'bolt']);
  UI.load();
  /** 画一个共享 UI 图标（居中）；缺图回退 emoji */
  const uiIcon = (id, emoji, x, y, size, col) =>
    drawArtIcon(UI, id, emoji, x, y, size, col || '#fff', Math.round(size * 0.9) + 'px sans-serif');
  /** 图标 + 文字（⚠ 分开量宽再排：拼进一个字符串靠 measureText 猜位置，换图标后必叠字）*/
  function iconText(id, emoji, label, cx0, cy, font, col, size) {
    ctx.font = font;
    const tw = ctx.measureText(label).width, ic = size || 16;
    uiIcon(id, emoji, cx0 - (tw + ic + 4) / 2 + ic / 2, cy, ic);
    txtL(label, cx0 - (tw + ic + 4) / 2 + ic + 4, cy, col, font);
  }
  /** 左对齐版（列表行用）：返回文字实际起点 x */
  function iconTextL(id, emoji, label, x, cy, font, col, size) {
    const ic = size || 16;
    uiIcon(id, emoji, x + ic / 2, cy, ic);
    txtL(label, x + ic + 5, cy, col, font);
  }
  function drawStar(x, y, r, on) {
    const im = UI.get('star');
    if (im) { ctx.globalAlpha = on ? 1 : 0.18; ctx.drawImage(im, x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; return; }
    txt('\u2605', x, y, on ? '#ffd84d' : 'rgba(255,255,255,0.18)', Math.round(r * 2) + 'px sans-serif');
  }
  /**
   * 对手头像 = **天使画像**（原来是 👩🏻/🦊 这类系统 emoji）。
   * ⭐ 两个好处：跟图鉴/主视觉同一套世界观（可爱得起来），而且一眼看出榜上是
   *   **游戏角色**不是真人玩家 —— 伪社交榜的红线（绝不能让人以为在跟真人比）。
   * 缺图回退到带首字母的彩色圆盘，零素材依赖。
   */
  const AVA_COL = ['#f0abfc', '#67e8f9', '#fdba74', '#86efac', '#c4b5fd', '#fda4af'];
  function drawAvatar(av, x, y, size, name) {
    const r = size / 2;
    if (av === -1) {                                   // 「你」= 玩家选的那张天使 / 星星
      const f = root.G.avatarFile, im0 = f ? Angels.img(f) : null;
      if (im0) return clipDraw(im0, x - r, y - r, size);
      fillRR(x - r, y - r, size, size, r, 'rgba(255,216,77,0.30)');
      drawStar(x, y, r * 0.62, true);
      return;
    }
    const file = Angels.fileAt(av % (Angels.total() || 500));
    const im = file ? Angels.img(file) : null;
    if (im) return clipDraw(im, x - r, y - r, size);
    fillRR(x - r, y - r, size, size, r, AVA_COL[av % AVA_COL.length]);
    txt((name || '?').slice(0, 1).toUpperCase(), x, y, '#3a2a4a', 'bold ' + Math.round(size * 0.5) + 'px sans-serif');
  }
  function clipDraw(im, x, y, size) {
    ctx.save();
    Sprite.rr(ctx, x, y, size, size, size / 2); ctx.clip();
    const sc = Math.max(size / im.width, size / im.height);
    ctx.drawImage(im, x + (size - im.width * sc) / 2, y + (size - im.height * sc) / 2,
                  im.width * sc, im.height * sc);
    ctx.restore();
  }

  // 赢局结算卡的高度：⛔ 结算内容必须落在**不透明卡**上（直接飘在牌面上，牌会从字缝里
  //  透出来一片花 —— blockblast 实拍同款）。canvas 没法先量后画一整段流式内容 ⇒
  //  用**上一帧量到的高度**，首帧退回估计值（差一帧，肉眼无感）。
  let winCardH = 0;

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
    iconText('share', '📤', T('sol.share'), cx + 80, SH - 48, '13px sans-serif', '#7ef2a0', 15);
    addHit(cx + 10, SH - 70, 140, 44, 'SHARE', {});
    drawToast();
  }

  /** 页面通用背景 + 返回按钮 */
  function page(title, icon, emoji) {
    clearHits();
    const L = Layout.layout({ noBanner: true });
    const { SW, SH } = GameGlobal;
    Sprite.drawTable(ctx, 0, 0, SW, SH, Money.state.table);
    if (icon) iconText(icon, emoji, title, L.cx, GameGlobal.safeTop + 30, 'bold 20px sans-serif', '#fff', 22);
    else txt(title, L.cx, GameGlobal.safeTop + 30, '#fff', 'bold 20px sans-serif');
    fillRR(L.cx - 70, SH - 70, 140, 44, 12, 'rgba(255,255,255,0.20)');
    txt('‹ ' + T('sol.back'), L.cx, SH - 48, '#fff', '14px sans-serif');
    addHit(L.cx - 70, SH - 70, 140, 44, 'PLAY', {});
    return L;
  }

  /**
   * 🏠 主界面 —— 启动的第一屏（首启除外，那里是第 1 课）。照 snake 的天使主页做的纸牌版。
   *
   * ⭐ 为什么值得单独做一屏：主界面是**每次回访的必经之路**。把「你在这儿攒了多少东西」
   *   摆在脸上（天使 n/500、教学 n/4、成就 n/18、连续天数），比任何弹窗都更能把人拉回来——
   *   **空按钮不给人点进去的理由**（snake 实锤：每个入口都挂一个数字角标）。
   * ⚠ hero 用**玩家最近解锁的那张天使**，不是固定图：它是「我的收藏」，不是装饰画。
   *   没有解锁过 / 素材没加载 ⇒ 回退画四花色（零素材依赖，绝不空着 —— 引擎美术回退的老规矩）。
   */
  function renderHome() {
    clearHits();
    const L = Layout.layout({ noBanner: true });
    const { SW, SH } = GameGlobal;
    const G0 = root.G;
    Sprite.drawTable(ctx, 0, 0, SW, SH, Money.state.table);
    drawDim('rgba(0,0,0,0.30)');                  // 压暗一层，白字/卡片才浮得出来
    const cx = L.cx, w = Math.min(L.playW - 36, 360);
    const tall = SH >= 760;

    // ⭐ 先量后画：canvas 不会滚动，屏幕高一截就在底部留一大片死白。
    //   固定块高度是可算的 ⇒ 把富余高度**平摊进 7 个间隙**，任何机型都刚好填满。
    const hs = Math.min(w * 0.60, SH * (tall ? 0.235 : 0.215));
    const ch = tall ? 50 : 42;                    // 收集进度卡
    const bh = tall ? 52 : 44;                    // 主按钮
    const dh = tall ? 40 : 34;                    // 每日
    const gh = tall ? 46 : 40;                    // 菜单格
    const sh2 = tall ? 38 : 32;                   // 底部小钮
    const titleH = tall ? 34 : 27, tagH = tall ? 30 : 24;
    const fixed = hs + 10 + titleH + tagH + ch + bh + dh + 3 * gh + 2 * 8 + sh2;
    const GAPS = 7, base = tall ? 12 : 7;
    // ⛔ 右上角是引擎 DOM 控制栏（#controls: safeTop+8，高 ctrlH）的地盘 —— canvas 画到那儿
    //   会被盖住且点不动。hero 是整屏最宽的一块 ⇒ **整体起在 ctrlH 之下**，从根上避开。
    const top0 = GameGlobal.safeTop + GameGlobal.ctrlH + (tall ? 6 : 2);
    const slack = SH - top0 - 12 - fixed - GAPS * base;
    const gap = base + Math.max(0, Math.min(22, slack / GAPS));
    let y = top0;
    const hx = cx - hs / 2;
    // ⭐ **每次进主界面换一张**（2026-08-01 用户定）：从**已解锁的**里随机抽 ——
    //   它是「我的收藏」不是装饰画。⚠ 只在 heroIdx 为空时抽一次（renderHome 每帧都跑，
    //   每帧重抽图会疯狂闪）；离开 HOME 时由 renderAll 清空，下次进来才换。
    if (G0.heroIdx == null || G0.heroIdx >= G0.angels) {
      G0.heroIdx = G0.angels > 0 ? Math.floor(Math.random() * G0.angels) : -1;
    }
    const file = G0.angels > 0 ? Angels.fileAt(G0.heroIdx) : null;
    const im = file ? Angels.img(file) : null;
    fillRR(hx - 5, y - 5, hs + 10, hs + 10, 22, 'rgba(255,255,255,0.88)');
    if (im) {
      ctx.save();
      Sprite.rr(ctx, hx, y, hs, hs, 18); ctx.clip();
      const sc = Math.max(hs / im.width, hs / im.height);
      ctx.drawImage(im, hx + (hs - im.width * sc) / 2, y + (hs - im.height * sc) / 2,
                    im.width * sc, im.height * sc);
      ctx.restore();
    } else {
      fillRR(hx, y, hs, hs, 18, '#f4f7f5');
      const q = hs / 2;
      [['\u2660', '#1b1b1b'], ['\u2665', '#d33344'], ['\u2663', '#177a3a'], ['\u2666', '#2166c9']]
        .forEach((sv, i) => txt(sv[0], hx + q * (0.5 + (i % 2)), y + q * (0.5 + Math.floor(i / 2)),
                                sv[1], Math.round(q * 0.62) + 'px sans-serif'));
    }
    addHit(hx, y, hs, hs, 'GALLERY', {});         // 点大图 = 进图鉴
    y += hs + gap;

    // ── 标题 + 一句话卖点（这一句就是产品的整个差异化）──
    txt('Fair Deal', cx, y + (tall ? 14 : 12), '#ffd84d', 'bold ' + (tall ? 30 : 25) + 'px sans-serif');
    y += titleH;
    ctx.font = '11px sans-serif';               // ⚠ 同上：wrapLines 之前必设 font
    wrapLines(T('sol.homeTag'), w - 10, 2).forEach((ln, i) =>
      txt(ln, cx, y + 8 + i * 14, PAL.sub, '11px sans-serif'));
    y += tagH + gap - base;

    // ── 收集进度卡（天使 n/500 + 百分比 + 条）──
    const tot = Angels.total() || 500;
    const got = Math.min(G0.angels || 0, tot);
    fillRR(cx - w / 2, y, w, ch, 11, 'rgba(0,0,0,0.34)');
    iconTextL('frame', '\u{1F5BC}', T('sol.galleryProgress', { n: got, m: tot }),
              cx - w / 2 + 12, y + 15, 'bold 12px sans-serif', '#fff', 17);
    txtR((got / tot * 100).toFixed(1) + '%', cx + w / 2 - 12, y + 15, '#ffd84d', 'bold 12px sans-serif');
    fillRR(cx - w / 2 + 12, y + 25, w - 24, 7, 4, 'rgba(255,255,255,0.16)');
    if (got) fillRR(cx - w / 2 + 12, y + 25, Math.max(4, (w - 24) * got / tot), 7, 4, '#ffd84d');
    if (tall) {
      const lvl = levelOf(G0.xp || 0);
      txtL(T('sol.' + levelTitleKey(lvl)) + ' \u00b7 ' + T('sol.lvl', { n: lvl }),
           cx - w / 2 + 12, y + 42, 'rgba(255,255,255,0.6)', '10px sans-serif');
      txtR(T('sol.coins', { n: Money.coins }), cx + w / 2 - 12, y + 42, '#ffd84d', 'bold 10px sans-serif');
    }
    y += ch + gap;

    // ── ▶ 主按钮：**智能续继**（局中未完 ⇒ 继续这一局，别把人扔回新局）──
    const resuming = G0.s && !G0.s.won && G0.s.moves.length > 0;
    fillRR(cx - 105, y, 210, bh, 14, '#22c55e');
    txt(resuming ? T('sol.homeResume') : T('sol.homePlay'), cx, y + bh / 2, '#fff',
        'bold ' + (tall ? 18 : 16) + 'px sans-serif');
    addHit(cx - 105, y, 210, bh, 'HOME_PLAY', {});
    y += bh + Math.min(gap, 14);

    // ── 🎁 每日挑战（回访钩子：连续天数就摆在按钮上）──
    const doneToday = G0.dailyDone === todayId();
    const days = dailyStreakDays();
    fillRR(cx - 105, y, 210, dh, 11, doneToday ? 'rgba(255,255,255,0.18)' : '#ffd84d');
    {   // 图标 / 文字 / 火苗各自量宽（拼字符串必叠字）
      const fg0 = doneToday ? '#fff' : '#3a2a00', f0 = 'bold 13px sans-serif';
      ctx.font = f0;
      const nw = ctx.measureText(T('sol.daily')).width;
      const dw = ctx.measureText(String(days)).width;
      let lx = cx - (20 + nw + (days ? 12 + dw + 6 : 0)) / 2;
      uiIcon(doneToday ? 'check' : 'calendar', doneToday ? '\u2713' : '\u{1F4C5}', lx + 9, y + dh / 2, 17);
      lx += 20;
      txtL(T('sol.daily'), lx, y + dh / 2, fg0, f0);
      if (days) {
        lx += nw + 6;
        uiIcon('fire', '\u{1F525}', lx + 8, y + dh / 2, 16);
        txtL(String(days), lx + 17, y + dh / 2, fg0, f0);
      }
    }
    addHit(cx - 105, y, 210, dh, 'DAILY', {});
    y += dh + gap;

    // ── 2×3 菜单网格：每格都挂一个「你在这儿有多少东西」的角标 ──
    const lessN = Object.keys(G0.lessonsDone || {}).length;
    const achN = Object.keys(G0.ach || {}).length;
    const cells = [
      ['scroll', '\u{1F393}', T('sol.lessons'), lessN + '/4', 'LESSON'],
      ['frame', '\u{1F47C}', T('sol.gallery'), got + '', 'GALLERY'],
      ['trophy', '\u{1F3C6}', T('sol.achievements'), achN + '', 'ACH'],
      ['cards', '\u{1F3B4}', T('sol.collection'), '', 'SHOP'],
      ['chart', '\u{1F4CA}', T('sol.stats'), '', 'STATS'],
      ['settings', '\u2699', T('sol.settings'), '', 'SET'],
    ];
    const gw = (w - 8) / 2;
    cells.forEach(function (c, i) {
      const bx = cx - w / 2 + (i % 2) * (gw + 8), by = y + Math.floor(i / 2) * (gh + 8);
      fillRR(bx, by, gw, gh, 10, 'rgba(0,0,0,0.34)');
      uiIcon(c[0], c[1], bx + 23, by + gh / 2, 21);
      ctx.font = 'bold 11px sans-serif';          // ⚠ wrapLines 按当前 font 量宽，必须先设回来
      txtL(wrapLines(c[2], gw - 62, 1)[0], bx + 41, by + gh / 2, '#fff', 'bold 11px sans-serif');
      if (c[3]) txtR(c[3], bx + gw - 10, by + gh / 2, '#ffd84d', 'bold 11px sans-serif');
      addHit(bx, by, gw, gh, c[4], {});
    });
    y += 3 * gh + 2 * 8 + gap;

    // ── 底部小钮：更多 / 公平页 / 怎么玩 / 减弱动态 ──
    const sw = (w - 24) / 4;
    // \u26a0 **\u7eaf\u56fe\u6807\u94ae\u5fc5\u987b\u914d\u6587\u5b57**\uff1a\u7f29\u5230 15px \u7684 emoji \u8ba4\u4e0d\u51fa\u6765\uff08\u9a8c\u56fe\u5b9e\u9524\uff1a\u2696 \u770b\u7740\u50cf\u4e24\u4e2a\u5c0f\u4eba\uff09\u3002
    //   \u56db\u4e2a\u683c\u5b50\u5404 ~84px\uff0c\u56fe\u6807\u5728\u4e0a\u30018px \u5c0f\u5b57\u5728\u4e0b\uff0c\u521a\u597d\u653e\u5f97\u4e0b\u3002
    [['scroll', '\u22ef', T('sol.menu'), 'MENU'], ['shield-heart', '\u2696', T('sol.fair'), 'FAIR'],
     ['book', '\u2753', T('sol.help'), 'HELP'],
     ['sparkle', '\u2728', T('sol.reduceFx'), 'TOG_RFX']].forEach(function (b, i) {
      const bx = cx - w / 2 + i * (sw + 8);
      // ⚠ 底色要深：共享库是浅色贴纸风图标，压在半透明白按钮上会糊成一团（blockblast 实拍）
      fillRR(bx, y, sw, sh2, 10, 'rgba(0,0,0,0.30)');
      if (b[0] === 'sparkle' && G0.reduceFx) ctx.globalAlpha = 0.4;   // 减弱动态开着 ⇒ 图标压暗
      uiIcon(b[0], b[1], bx + sw / 2, y + sh2 / 2 - 5, 18);
      ctx.globalAlpha = 1;
      ctx.font = '8px sans-serif';                // \u26a0 wrapLines \u6309\u5f53\u524d font \u91cf\u5bbd
      txt(wrapLines(b[2], sw - 6, 1)[0], bx + sw / 2, y + sh2 - 8,
          'rgba(255,255,255,0.72)', '8px sans-serif');
      addHit(bx, y, sw, sh2, b[3], {});
    });
    drawToast();
  }

  /** 菜单：档案头 / 每日锦标赛 / 每日 / 图鉴 / 统计 / 成就 / 收藏 / 公平 / 设置 */
  function renderMenu() {
    const L = page(T('sol.menu'), 'scroll', '📋');
    const { SH } = GameGlobal;
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    const tall0 = GameGlobal.SH >= 760;
    let y = GameGlobal.safeTop + 56;

    // 模式切换 chip（标题旁 —— 工具条腾位后 MODE 落这里）
    const G0 = root.G;
    const fcNow = G0.s && G0.s.mode === 'freecell';
    fillRR(cx + w / 2 - 78, GameGlobal.safeTop + 14, 78, 26, 9, 'rgba(0,0,0,0.28)');
    txt(fcNow ? '♠ ' + T('sol.klondike') : '⬛ ' + T('sol.freecell'),
        cx + w / 2 - 39, GameGlobal.safeTop + 27, '#fff', 'bold 10px sans-serif');
    addHit(cx + w / 2 - 78, GameGlobal.safeTop + 14, 78, 26, 'MODE', {});

    // 👤 档案头:头像(图鉴天使/⭐) + 称号 Lvl + XP 条 + 金币（照竞品顶栏）
    const lvl = levelOf(G0.xp || 0);
    const prevNeed = lvl > 1 ? xpNeed(lvl - 1) : 0;
    const prog = Math.max(0, Math.min(1, ((G0.xp || 0) - prevNeed) / (xpNeed(lvl) - prevNeed)));
    const hh0 = tall0 ? 56 : 40;
    fillRR(cx - w / 2, y, w, hh0, 12, 'rgba(0,0,0,0.28)');
    const av = G0.avatarFile ? Angels.img(G0.avatarFile) : null;
    const as0 = hh0 - 12;
    if (av) {
      ctx.save();
      ctx.beginPath(); ctx.arc(cx - w / 2 + 8 + as0 / 2, y + hh0 / 2, as0 / 2, 0, 7); ctx.clip();
      const sc = Math.max(as0 / av.width, as0 / av.height);
      ctx.drawImage(av, cx - w / 2 + 8 + (as0 - av.width * sc) / 2, y + 6 + (as0 - av.height * sc) / 2,
                    av.width * sc, av.height * sc);
      ctx.restore();
    } else {
      txt('⭐', cx - w / 2 + 8 + as0 / 2, y + hh0 / 2, '#ffd84d', (as0 - 8) + 'px sans-serif');
    }
    txtL(T('sol.' + levelTitleKey(lvl)) + '  ' + T('sol.lvl', { n: lvl }),
         cx - w / 2 + as0 + 18, y + (tall0 ? 18 : 14), '#fff', 'bold 13px sans-serif');
    if (tall0) {
      fillRR(cx - w / 2 + as0 + 18, y + 30, w - as0 - 120, 8, 4, 'rgba(255,255,255,0.15)');
      fillRR(cx - w / 2 + as0 + 18, y + 30, Math.max(4, (w - as0 - 120) * prog), 8, 4, '#ffd84d');
      txtL(((G0.xp || 0) - prevNeed) + '/' + (xpNeed(lvl) - prevNeed),
           cx - w / 2 + as0 + 18, y + 47, 'rgba(255,255,255,0.5)', '9px sans-serif');
    }
    txtR(T('sol.coins', { n: Money.coins }), cx + w / 2 - 12, y + hh0 / 2, '#ffd84d', 'bold 12px sans-serif');
    y += hh0 + 8;

    // 🏆 每日锦标赛卡（零后端:100 名确定性对手,爬榜 = 当日再来一局的钩子）
    const tr = tourRank();
    const end0 = new Date(); end0.setHours(24, 0, 0, 0);
    const leftMs = Math.max(0, end0 - Date.now());
    const hhF = n => String(n).padStart(2, '0');
    const cd = hhF(Math.floor(leftMs / 3600000)) + ':' + hhF(Math.floor(leftMs / 60000) % 60) + ':' + hhF(Math.floor(leftMs / 1000) % 60);
    if (tall0) {
      const th = 108;
      fillRR(cx - w / 2, y, w, th, 12, 'rgba(0,0,0,0.30)');
      iconTextL('trophy', '🏆', T('sol.tournament'), cx - w / 2 + 12, y + 16, 'bold 12px sans-serif', '#ffd84d', 15);
      ctx.font = 'bold 11px sans-serif';
      uiIcon('clock', '⏱', cx + w / 2 - 22 - ctx.measureText(cd).width, y + 16, 14);
      txtR(cd, cx + w / 2 - 12, y + 16, PAL.sub, 'bold 11px sans-serif');
      // 三张迷你卡:你的名次 + 上下邻居
      const cardW3 = Math.floor((w - 40) / 3);
      const trio = [
        tr.rank > 1 ? { r: tr.rank - 1, e: tr.field[tr.rank - 2] } : null,
        { r: tr.rank, e: { name: T('sol.rankYou'), av: -1, score: G0.dayScore || 0 }, you: 1 },
        tr.rank <= tr.field.length ? { r: tr.rank + 1, e: tr.field[tr.rank - 1] } : null,
      ];
      trio.forEach((t3, i) => {
        if (!t3) return;
        const x3 = cx - w / 2 + 12 + i * (cardW3 + 8);
        fillRR(x3, y + 28, cardW3, 70, 10, t3.you ? 'rgba(126,242,160,0.22)' : 'rgba(255,255,255,0.10)');
        drawAvatar(t3.e.av, x3 + cardW3 / 2, y + 45, 26, t3.e.name);
        txt('#' + t3.r, x3 + cardW3 / 2, y + 62, t3.you ? '#7ef2a0' : '#fff', 'bold 12px sans-serif');
        txt(t3.e.name + ' · ' + t3.e.score, x3 + cardW3 / 2, y + 78,
            t3.you ? '#7ef2a0' : PAL.sub, '8px sans-serif');
      });
      addHit(cx - w / 2, y, w, th, 'DAILY', {});
      y += th + 8;
    } else {
      fillRR(cx - w / 2, y, w, 34, 10, 'rgba(0,0,0,0.30)');
      iconTextL('trophy', '🏆', '#' + tr.rank + ' · ' + (G0.dayScore || 0), cx - w / 2 + 12, y + 17, 'bold 11px sans-serif', '#ffd84d', 14);
      ctx.font = '10px sans-serif';
      uiIcon('clock', '⏱', cx + w / 2 - 20 - ctx.measureText(cd).width, y + 17, 13);
      txtR(cd, cx + w / 2 - 12, y + 17, PAL.sub, '10px sans-serif');
      addHit(cx - w / 2, y, w, 34, 'DAILY', {});
      y += 40;
    }

    // 每日挑战：完成过今天的就亮 ✓；连续 ≥2 天挂 🔥（打卡即续 —— 回访钩子）
    const d0 = new Date();
    const doneToday = root.G.dailyDone === ('' + d0.getFullYear() + (d0.getMonth() + 1) + d0.getDate());
    const streak = dailyStreakDays();
    const dailySub = (doneToday ? T('sol.dailyDone') : T('sol.dailySub'))
      + (streak >= 2 ? '  · ' + T('sol.dailyStreak', { n: streak }) : '');
    // 小屏（SE 等）：7 个入口 + 日历放不下 ⇒ 藏副标题、缩日历、砍看广告行（图鉴/结算屏有同款入口）
    const tall = GameGlobal.SH >= 760;
    const sub760 = t => tall ? t : '';
    // ⛔ **只留 🏠 主界面上没有的东西**（2026-08-01）：图鉴/统计/教学/成就/收藏/公平/设置
    //    在 HOME 的六格 + 底栏里一模一样各有一份 —— 两屏重复正是这页原来「像设置页」
    //    且在 896 高屏上把月历、Back 按钮压成一团的原因（blockblast 关卡地图同款病）。
    //    这页现在 = 每日锦标赛 + 月历 + 「我的弱点」，一屏放得下。
    const items = [
      ['calendar', '📅', T('sol.daily'), sub760(dailySub), 'DAILY'],
      ['search', '🔍', T('sol.insight'), '', 'INSIGHT'],
    ];
    items.forEach(function (it) {
      const sub = it[3], act = it[4];
      const hh = sub ? 52 : 42;
      fillRR(cx - w / 2, y, w, hh, 10, 'rgba(0,0,0,0.26)');
      uiIcon(it[0], it[1], cx - w / 2 + 26, y + (sub ? 26 : 21), 20);
      txtL(it[2], cx - w / 2 + 44, y + (sub ? 18 : 21), '#fff', 'bold 14px sans-serif');
      if (sub) txtL(wrapLines(sub, w - 58, 1)[0], cx - w / 2 + 44, y + 37, PAL.sub, '10px sans-serif');
      addHit(cx - w / 2, y, w, hh, act, {});
      y += hh + 8;
    });

    // 🔥 补签：昨天没来、连续天数正要断 ⇒ 看广告补上（条件出现，平时不占位）
    if (canMakeup() && !Money.noAds) {
      fillRR(cx - w / 2, y, w, 38, 10, 'rgba(255,216,77,0.22)');
      iconText('fire', '🔥', T('sol.makeup'), cx, y + 19, 'bold 12px sans-serif', '#ffd84d', 16);
      addHit(cx - w / 2, y, w, 38, 'MAKEUP', {});
      y += 46;
    }

    // ── 每日挑战日历（本月）：连胜可视化，明天再来的钩子（SE 压缩成单行,空间让给锦标赛卡）──
    const hist = root.G.dailyHist || {};
    const now = new Date();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayKey = d => '' + now.getFullYear() + (now.getMonth() + 1) + d;
    let done = 0;
    for (let d = 1; d <= dim; d++) if (hist[dayKey(d)]) done++;
    y += 4;
    txtL(T('sol.dailyMonth', { n: done }), cx - w / 2, y + 6, PAL.sub, '11px sans-serif');
    y += 16;
    if (tall0) {
      const cs = 16;
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
    }

    // ⛔ 去广告 IAP **不做**（2026-07-31 拍板）：菜单里永远没有内购入口。
    //    （激励视频保留 —— 它不是 IAP，只换外观。）
    if (!Money.noAds && tall) {
      fillRR(cx - w / 2, y, w, 44, 10, 'rgba(255,255,255,0.14)');
      txt('▶ ' + T('sol.watchAdN', { n: AD_GIVE.coins }) + '   ' + T('sol.adLeft', { n: adLeft('coins') }),
          cx, y + 22, adLeft('coins') ? '#fff' : 'rgba(255,255,255,0.45)', '13px sans-serif');
      addHit(cx - w / 2, y, w, 44, 'EARN_AD', {});
      y += 52;                                   // ⚠ 忘了推进 y ⇒ 下面那行小字直接压在按钮上（实拍）
    }

    txt(T('sol.freeForever'), cx, Math.min(y + 20, SH - 92), 'rgba(255,255,255,0.55)', '10px sans-serif');
  }

  /** 统计：**双口径**（DESIGN 4.5）—— 无限撤销会把总胜率架空，不分开记统计就是假的 */
  function renderStats() {
    const L = page(T('sol.stats'), 'chart', '📊');
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
      cnt('gold') + ' · ' + cnt('silver') + ' · ' + cnt('bronze'), 'medal']);
    rows.forEach(function (r) {
      fillRR(cx - w / 2, y, w, 34, 8, 'rgba(0,0,0,0.24)');
      txtL(r[0], cx - w / 2 + 14, y + 17, PAL.sub, '12px sans-serif');
      if (r[2]) {                                  // 带图标的行（月度奖牌）
        ctx.font = 'bold 14px sans-serif';
        uiIcon(r[2], '🏅', cx + w / 2 - 24 - ctx.measureText(r[1]).width, y + 17, 16);
      }
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
    const L = page(T('sol.collection'), 'cards', '🎴');
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
      const FX_EMO = { classic: 'cards', rainbow: 'gem', comet: 'bolt', confetti: 'sparkle' };
      Money.FXS.forEach(function (it, i) {
        const x = cx - w / 2 + (i % 4) * (tw + 6);
        const fy = fxY + Math.floor(i / 4) * 60;
        const own = Money.owns('fx', it.id);
        const on = Money.state.fx === it.id;
        const gg = ctx.createLinearGradient(x, fy, x, fy + 54);
        gg.addColorStop(0, '#1e293b'); gg.addColorStop(1, '#0f172a');
        fillRR(x, fy, tw, 54, 7, gg);
        uiIcon(FX_EMO[it.id] || 'sparkle', '✨', x + tw / 2, fy + (own ? 27 : 16), 22);
        if (!own) {
          fillRR(x + tw / 2 - 17, fy + 30, 34, 18, 9, 'rgba(0,0,0,0.75)');
          txt(String(it.cost), x + tw / 2, fy + 39, '#ffd84d', 'bold 11px sans-serif');
        }
        if (on) { ctx.strokeStyle = '#7ef2a0'; ctx.lineWidth = 3; Sprite.rr(ctx, x, fy, tw, 54, 7); ctx.stroke(); }
        addHit(x, fy, tw, 54, 'PICK_FX', { id: it.id });
      });
      y += Math.ceil(Money.FXS.length / 4) * 60 + 12;
    }

    // ⭐ 外观位：看一条广告白送一款牌背（1 次/天 —— 额度低才不贬值）
    if (!Money.noAds && G.shopTab === 'back') {
      const bl = adLeft('back');
      fillRR(cx - w / 2, y, w, 40, 10, bl ? 'rgba(255,216,77,0.22)' : 'rgba(255,255,255,0.10)');
      iconText('gift', '🎁', T('sol.adBack') + '   ' + T('sol.adLeft', { n: bl }), cx, y + 20,
               'bold 12px sans-serif', bl ? '#ffd84d' : 'rgba(255,255,255,0.45)', 16);
      addHit(cx - w / 2, y, w, 40, 'AD_BACK', {});
      y += 48;
    }

    // 小屏（SE 等）放不下这行 —— 图鉴/结算屏有同款激励入口，不缺
    if (!Money.noAds && GameGlobal.SH >= 760) {
      fillRR(cx - w / 2, y, w, 42, 10, 'rgba(255,255,255,0.14)');
      txt('▶ ' + T('sol.watchAdN', { n: AD_GIVE.coins }) + '   ' + T('sol.adLeft', { n: adLeft('coins') }),
          cx, y + 21, adLeft('coins') ? '#fff' : 'rgba(255,255,255,0.45)', '12px sans-serif');
      addHit(cx - w / 2, y, w, 42, 'EARN_AD', {});
    }
  }

  /**
   * 👼 天使图鉴：501 张长线收集（素材复用 snake 的同一份）。
   * 网格 24 张/页；已解锁画图、未解锁画 ? 暗格；点已解锁 → 大图；看广告 +3。
   * ⚠ 只缓存当前页的图（Angels.dropCache 在翻页时清）。
   */
  function renderGallery() {
    const L = page(T('sol.gallery'), 'frame', '👼');
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
      const gl = adLeft('gallery');
      txt('▶ ' + T('sol.galleryAdN', { n: AD_GIVE.gallery }) + '   ' + T('sol.adLeft', { n: gl }),
          cx, y + 19, gl ? '#ffd84d' : 'rgba(255,255,255,0.45)', 'bold 12px sans-serif');
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
      // 存壁纸 + 设为头像（⚠ 必须注册在 GAL_CLOSE 之后 —— hitTest 后注册优先）
      const wy2 = iy + size + 44;
      fillRR(cx - 150, wy2, 140, 40, 12, 'rgba(255,216,77,0.24)');
      iconText('picture-done', '🖼', T('sol.saveWall'), cx - 80, wy2 + 20, 'bold 12px sans-serif', '#ffd84d', 15);
      addHit(cx - 150, wy2, 140, 40, 'GAL_WALL', {});
      fillRR(cx + 10, wy2, 140, 40, 12, 'rgba(126,242,160,0.24)');
      iconText('crown', '👑', T('sol.setAva'), cx + 80, wy2 + 20, 'bold 12px sans-serif', '#7ef2a0', 15);
      addHit(cx + 10, wy2, 140, 40, 'SET_AVA', {});
    }
    drawToast();
  }

  /** 成就页：11 项里程碑，达成发金币（目标感 + 收集系统的供弹药）。ACHS 定义在 main.js */
  function renderAch() {
    const L = page(T('sol.achievements'), 'trophy', '🏆');
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
      uiIcon(done ? 'trophy' : 'lock', done ? '🏆' : '🔒', cx - w / 2 + 22, y + rowH / 2, 17);
      txtL(name, cx - w / 2 + 34, y + rowH / 2,
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

  /**
   * 🔍 我的弱点 —— 把求解器变成教练（没有竞品能做，因为他们没有求解器）。
   * ⛔ 措辞死线：只陈述「哪类走法之后常常就没解了」，**绝不说「你走错了」**——
   *   盲打时那一步往往是信息上不可避免的（DESIGN §2.1）。
   */
  function renderInsight() {
    const L = page(T('sol.insight'), 'search', '🔍');
    const G = root.G;
    const cx = L.cx, w = Math.min(L.playW - 40, 380);
    let y = GameGlobal.safeTop + 58;

    ctx.font = '11px sans-serif';
    wrapLines(T('sol.insightIntro'), w, 3).forEach((ln, i) =>
      txtL(ln, cx - w / 2, y + i * 15, PAL.sub, '11px sans-serif'));
    y += 52;

    const ins = G.insight || {};
    const rows = [['tf', 'insTf'], ['tt', 'insTt'], ['wf', 'insWf'], ['wt', 'insWt'], ['ft', 'insFt']]
      .map(([k, key]) => ({ k, key, n: ins[k] || 0 }))
      .sort((a, b) => b.n - a.n);
    const total = rows.reduce((a, r) => a + r.n, 0);

    if (!total) {
      fillRR(cx - w / 2, y, w, 60, 10, 'rgba(0,0,0,0.24)');
      ctx.font = '11px sans-serif';
      wrapLines(T('sol.insightEmpty'), w - 28, 3).forEach((ln, i) =>
        txtL(ln, cx - w / 2 + 14, y + 20 + i * 15, PAL.sub, '11px sans-serif'));
      y += 70;
    } else {
      rows.forEach(function (r) {
        if (!r.n) return;
        const pct = Math.round(r.n / total * 100);
        fillRR(cx - w / 2, y, w, 40, 8, 'rgba(0,0,0,0.24)');
        fillRR(cx - w / 2, y, w * (r.n / total), 40, 8, 'rgba(255,216,77,0.16)');
        ctx.font = '11px sans-serif';
        txtL(wrapLines(T('sol.' + r.key), w - 90, 1)[0], cx - w / 2 + 12, y + 20, '#fff', '11px sans-serif');
        txtR(r.n + '  ' + pct + '%', cx + w / 2 - 12, y + 20, '#ffd84d', 'bold 11px sans-serif');
        y += 46;
      });
    }
    // 妙手总数（正向的那一半 —— 别只报坏消息）
    y += 4;
    fillRR(cx - w / 2, y, w, 44, 10, 'rgba(126,242,160,0.16)');
    txtL('✨ ' + T('sol.brilliantTotal'), cx - w / 2 + 12, y + 22, '#7ef2a0', 'bold 12px sans-serif');
    txtR(String((G.stats && G.stats.brilliantAll) || 0), cx + w / 2 - 12, y + 22, '#7ef2a0', 'bold 15px sans-serif');
  }

  /** ❓ 怎么玩：Klondike / draw 模式 / FreeCell supermove / 证明器 / 免费三件套 */
  function renderHelp() {
    const L = page(T('sol.help'), 'book', '❓');
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

    [['shield-heart', 'introB1'], ['search', 'introB2'], ['gift', 'introB3']].forEach(function (it) {
      const lines = wrapLines(T('sol.' + it[1]), w - 34, 4);
      const h = Math.max(44, lines.length * 16 + 16);
      fillRR(cx - w / 2, y, w, h, 10, 'rgba(0,0,0,0.26)');
      txt(it[0], cx - w / 2 + 17, y + h / 2, '#ffd84d', '15px sans-serif');
      lines.forEach((ln, i) =>
        txtL(ln, cx - w / 2 + 34, y + 8 + 16 * i + 8, PAL.sub, '11px sans-serif'));
      y += h + 10;
    });

    y += 8;
    // ⭐ 教学即留存：第一屏就给第 1 课（一分钟学会 + 立刻赢一局 = 最强的 D1 钩子）
    fillRR(cx - 100, y, 200, 46, 13, '#22c55e');
    iconText('scroll', '🎓', T('sol.introLesson'), cx, y + 23, 'bold 15px sans-serif', '#fff', 18);
    addHit(cx - 100, y, 200, 46, 'INTRO_LESSON', {});
    y += 54;
    fillRR(cx - 90, y, 180, 40, 12, 'rgba(255,255,255,0.18)');
    txt(T('sol.introGo'), cx, y + 20, '#fff', '14px sans-serif');
    addHit(cx - 90, y, 180, 40, 'INTRO_GO', {});
    y -= 14;
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
    const L = page(T('sol.settings'), 'settings', '⚙');
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

      // ⭐ 难度**明面阶梯**（取代原来的「混合/简单/困难」三个下拉项）：
      //   每一档是真实存在的难度差（翻牌数 × 池分档），且**每一档都只发已验证可解的局**——
      //   难度上去的是「找到解有多难」，不是「有没有解」。未解锁的档显示还差几胜。
      const unlocked = diffUnlocked();
      const dh = 62;
      fillRR(cx - w / 2, y, w, dh, 10, 'rgba(0,0,0,0.26)');
      txtL(T('sol.difficulty'), cx - w / 2 + 14, y + 16, '#fff', 'bold 13px sans-serif');
      txtR(T('sol.diffLvOf', { n: G.diffLv || 1 }), cx + w / 2 - 14, y + 16, '#ffd84d', 'bold 12px sans-serif');
      const stepW = Math.floor((w - 28 - 4 * 6) / 5);
      DIFF_LADDER.forEach(function (d, i) {
        const bx = cx - w / 2 + 14 + i * (stepW + 6);
        const on = (G.diffLv || 1) === d.lv;
        const locked = d.lv > unlocked;
        fillRR(bx, y + 26, stepW, 26, 7,
               on ? '#22c55e' : locked ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.16)');
        if (locked) uiIcon('lock', '🔒', bx + stepW / 2, y + 39, 18);
      else txt(String(d.lv), bx + stepW / 2, y + 39,
            locked ? 'rgba(255,255,255,0.45)' : '#fff', 'bold 12px sans-serif');
        if (!on && !locked) addHit(bx, y + 26, stepW, 26, 'SET_LV', { lv: d.lv });
      });
      const nextLad = DIFF_LADDER.find(d => d.lv > unlocked);
      txtL(nextLad ? T('sol.diffNext', { n: Math.max(0, nextLad.need - (G.stats.won || 0)), lv: nextLad.lv })
                   : T('sol.diffAllOpen'),
           cx - w / 2 + 14, y + 58, 'rgba(255,255,255,0.55)', '10px sans-serif');
      y += dh + 14;
    }

    // ⭐ Spider 花色档（1/2/4）——它不进可解池，难度就是规则本身给的
    if (G.s.mode === 'spider') {
      const sh = GameGlobal.SH >= 760 ? 60 : 44;
      fillRR(cx - w / 2, y, w, sh, 10, 'rgba(0,0,0,0.26)');
      txtL(T('sol.spSuits'), cx - w / 2 + 14, y + 18, '#fff', 'bold 13px sans-serif');
      [1, 2, 4].forEach(function (n, i) {
        const bx = cx + w / 2 - 14 - (3 - i) * 62 + 4;
        const on = (G.spiderSuits || 1) === n;
        fillRR(bx, y + 6, 56, 26, 8, on ? '#22c55e' : 'rgba(255,255,255,0.16)');
        txt(T('sol.spSuit' + n), bx + 28, y + 19, '#fff', 'bold 11px sans-serif');
        if (!on) addHit(bx, y + 6, 56, 26, 'SET_SUITS', { n });
      });
      if (GameGlobal.SH >= 760) {
        ctx.font = '10px sans-serif';
        wrapLines(T('sol.spSuitSub'), w - 28, 2).forEach((ln, i) =>
          txtL(ln, cx - w / 2 + 14, y + 40 + i * 13, 'rgba(255,255,255,0.55)', '10px sans-serif'));
      }
      y += sh + 10;
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
    if (ph !== 'HOME') root.G.heroIdx = null;    // 离开主界面就作废，下次进来重抽一张主视觉
    if (ph === 'SET') return renderSettings();
    if (ph === 'INTRO') return renderIntro();
    if (ph === 'FAIR') return renderFair();
    if (ph === 'HOME') return renderHome();
    if (ph === 'MENU') return renderMenu();
    if (ph === 'STATS') return renderStats();
    if (ph === 'ACH') return renderAch();
    if (ph === 'HELP') return renderHelp();
    if (ph === 'INSIGHT') return renderInsight();
    if (ph === 'GALLERY') return renderGallery();
    if (ph === 'SHOP') return renderShop();
    clearHits();
    const G = root.G;
    const s = G.s;
    const fc = s.mode === 'freecell';
    const sp = s.mode === 'spider';                       // ⭐ 第三种玩法：10 列、两副牌
    const L = Layout.layout({ noBanner: G.noAds, cols: sp ? 10 : fc ? 8 : 7 });
    Sprite.ensure(L.cardW, L.cardH, G.fourColor, G.bigText);

    const { SW, SH } = GameGlobal;
    Sprite.setBack(Money.state.back);                     // 牌背（收藏品）
    Sprite.drawTable(ctx, 0, 0, SW, SH, Money.state.table);   // 桌布（图片款 cover，渐变兜底）

    // ── 顶排 ──
    if (sp) {
      // 左：剩余发牌堆（每叠 = 一次 10 张，点它发牌）；右：已完成的 8 组
      const rounds = Math.ceil(s.stock.length / 10);
      for (let r = 0; r < rounds; r++) {
        const x = L.stockX + r * Math.round(L.cardW * 0.26);
        ctx.drawImage(Sprite.back(), x, L.topY, L.cardW * 0.9, L.cardH * 0.9);
      }
      if (rounds) {
        addHit(L.stockX, L.topY, L.cardW + rounds * Math.round(L.cardW * 0.26), L.cardH, 'STOCK', {});
      } else {
        drawSlot(L.stockX, L.topY, L.cardW * 0.9, L.cardH * 0.9);
      }
      // 完成组：靠右排开（8 组）
      for (let k = 0; k < 8; k++) {
        const x = L.playX + L.playW - L.gap - (8 - k) * Math.round(L.cardW * 0.42);
        if (k < s.foundations.length) {
          ctx.drawImage(Sprite.face(s.foundations[k][0]), x, L.topY, L.cardW * 0.62, L.cardH * 0.62);
        } else {
          ctx.save(); ctx.globalAlpha = 0.25;
          drawSlot(x, L.topY, L.cardW * 0.62, L.cardH * 0.62);
          ctx.restore();
        }
      }
    } else if (fc) {
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
      // 数量角标压在牌角（照竞品）
      const bw3 = Math.max(20, String(s.stock.length).length * 8 + 8);
      fillRR(L.stockX + L.cardW - bw3 + 3, L.topY + L.cardH - 17, bw3, 16, 6, 'rgba(0,0,0,0.65)');
      txt(String(s.stock.length), L.stockX + L.cardW - bw3 / 2 + 3, L.topY + L.cardH - 9, '#fff', 'bold 10px sans-serif');
    } else {
      drawSlot(L.stockX, L.topY, L.cardW, L.cardH, s.waste.length ? '↻' : '');
    }
    if (!fc) addHit(L.stockX, L.topY, L.cardW, L.cardH, 'STOCK', {});

    // waste（draw-3 时露出最后 3 张的一角）
    if (!fc && !sp && s.waste.length) {
      const show = Math.min(s.drawCount === 1 ? 1 : 3, s.waste.length);
      const fan = Math.round(L.cardW * 0.22);
      for (let k = 0; k < show; k++) {
        const id = s.waste[s.waste.length - show + k];
        const x = L.wasteX + k * fan;
        // ⚠ 正在飞的牌不能在目标位置画（否则同时出现在两处）
        if (!FX.isFlying(id)) ctx.drawImage(Sprite.face(id), x, L.topY, L.cardW, L.cardH);
        if (k === show - 1) addHit(x, L.topY, L.cardW, L.cardH, 'WASTE', {});   // 只有顶牌可点
      }
    } else if (!fc && !sp) {
      drawSlot(L.wasteX, L.topY, L.cardW, L.cardH);
    }

    // foundations（⚠ 只有 Klondike/FreeCell 有 4 门花色；
    //   Spider 的 s.foundations 是「已完成的 0..8 组」，形状完全不同，已在顶排分支画过 ⇒ 整段跳过。
    //   忘了这条 ⇒ s.foundations[fi] 是 undefined，一进 Spider 就白屏。）
    for (let fi = 0; !sp && fi < 4; fi++) {
      const x = L.foundX(fi);
      const f = s.foundations[fi];
      const ftop = f.length ? f[f.length - 1] : null;
      if (ftop != null && !FX.isFlying(ftop)) ctx.drawImage(Sprite.face(ftop), x, L.topY, L.cardW, L.cardH);
      else if (ftop != null && f.length > 1) ctx.drawImage(Sprite.face(f[f.length - 2]), x, L.topY, L.cardW, L.cardH);
      else {
        // 暗位「A♠」占位（照竞品:半透明卡面,一眼读懂目标）
        fillRR(x + 0.5, L.topY + 0.5, L.cardW - 1, L.cardH - 1, Math.max(3, L.cardW * 0.09),
               'rgba(255,255,255,0.08)');
        drawSlot(x, L.topY, L.cardW, L.cardH);
        ctx.globalAlpha = 0.28;
        txt('A', x + L.cardW * 0.26, L.topY + L.cardH * 0.16, '#fff',
            'bold ' + Math.round(L.cardW * 0.34) + 'px sans-serif');
        txt(Sprite.SUIT_SYM[fi], x + L.cardW * 0.62, L.topY + L.cardH * 0.6, '#fff',
            Math.round(L.cardW * 0.5) + 'px sans-serif');
        ctx.globalAlpha = 1;
      }
      // ⭐ 选中了这摞（准备取回）⇒ 描黄框，否则点了没反馈、玩家以为点不动
      if (G.sel && G.sel.p === 'f' && G.sel.fi === fi) {
        ctx.save();
        ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 3;
        Sprite.rr(ctx, x + 1, L.topY + 1, L.cardW - 2, L.cardH - 2, L.cardW * 0.09);
        ctx.stroke(); ctx.restore();
      }
      addHit(x, L.topY, L.cardW, L.cardH, 'FOUND', { fi });
    }

    // ── tableau ──
    for (let ti = 0; ti < L.cols; ti++) {
      const col = s.tableau[ti];
      const x = L.colX(ti);
      const nDown = col.cards.length - col.up;
      const off = L.fitOffsets(nDown, col.up);

      if (!col.cards.length) {
        // Spider 的「先填满空列才能发牌」提示期间，把空列高亮出来（别让玩家自己找）
        if (sp && G.spWarnUntil > Date.now()) {
          fillRR(x, L.tabY, L.cardW, L.cardH, L.cardW * 0.09, 'rgba(255,216,77,0.30)');
        }
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
          // ⭐ 透视（激励视频的局内增益）：暗牌半透明露出牌面。
          //   ⚠ 它**不改牌局、不改随机**，只把已经定死的信息提前给你看 ⇒ 不碰公平红线。
          const peek = !up && G.peekUntil > Date.now();
          if (peek) {
            // ⚠ 别拿牌背半透明盖在牌面上「意思一下」——点数照样看不清 = 等于没给（验图抓出）。
            //   直接画牌面，再罩一层淡绿表示「这是透视出来的，牌还没真的翻开」。
            ctx.drawImage(Sprite.face(id), x, y, L.cardW, L.cardH);
            ctx.save();
            ctx.globalAlpha = 0.22;
            Sprite.rr(ctx, x, y, L.cardW, L.cardH, L.cardW * 0.09);
            ctx.fillStyle = '#7ef2a0'; ctx.fill();
            ctx.restore();
          } else {
            ctx.drawImage(up ? Sprite.face(id) : Sprite.back(), x, y, L.cardW, L.cardH);
          }
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
    if (G.hintMove && !s.won) drawHintMove(s, L, G.hintMove, G.hintWin);

    // ── 拖拽中的牌 ──
    if (G.drag) {
      const d = G.drag;
      d.cards.forEach((id, k) => {
        ctx.drawImage(Sprite.face(id), d.x, d.y + k * L.upOff, L.cardW, L.cardH);
      });
    }

    // ── 纸牌瀑布（合成持久拖尾层）──
    FX.draw(ctx);

    // ── HUD 行1（2026-07-31 布局改版,参照头部竞品）:‹菜单 ⚙ 🎨 + 居中分数胶囊
    //   （⚠ 右上留白给引擎 DOM 语言控件 —— 老坑:那里的东西点不动）──
    const r1y = L.hudY;
    const iconBtn = (x, label, act) => {
      fillRR(x, r1y, 34, 28, 9, 'rgba(0,0,0,0.25)');
      txt(label, x + 17, r1y + 14, '#fff', '15px sans-serif');
      addHit(x, r1y, 34, 28, act, {});
    };
    iconBtn(L.playX + 8, '‹', 'HOME');       // ‹ = 回主界面（MENU 挂在主界面的「⋯ 更多」里）
    fillRR(L.playX + 46, r1y, 34, 28, 9, 'rgba(0,0,0,0.25)');
    uiIcon('settings', '⚙', L.playX + 63, r1y + 14, 18);
    addHit(L.playX + 46, r1y, 34, 28, 'SET', {});
    fillRR(L.playX + 84, r1y, 34, 28, 9, 'rgba(0,0,0,0.25)');
    uiIcon('palette', '🎨', L.playX + 101, r1y + 14, 18);
    addHit(L.playX + 84, r1y, 34, 28, 'SHOP', {});
    // ⚠ Spider 不进可解池 ⇒ 绝不打「✓ 有解」（打了就是系统性撒谎，措辞死线同理）
    const verified = !fc && !sp && Pool.isVerified(s.drawCount, s.seed);
    // 分数胶囊 = 本轮连关累计(含当前关进行分×倍率);点开公平页（✓=已验证可解,措辞死线不变）
    const shown = (G.runScore || 0) + Math.round(s.score * Math.min(G.stage || 1, 5));
    const pillW = 150;
    fillRR(L.cx - pillW / 2, r1y, pillW, 28, 14, 'rgba(0,0,0,0.32)');
    iconText('trophy', '🏆', shown + (verified ? ' ✓' : ''), L.cx, r1y + 14,
             'bold 15px sans-serif', verified ? '#ffd84d' : '#fff', 17);
    addHit(L.cx - pillW / 2, r1y, pillW, 28, 'FAIR', {});

    // ── HUD 行2:Stage ×M | #局号(FC 带 supermove 容量) | 步数 · 用时 ──
    const r2y = L.hud2Y + L.hud2H / 2;
    const mult = Math.min(G.stage || 1, 5);
    txtL(T('sol.stage') + ' ' + (G.stage || 1) + (mult > 1 ? ' ×' + mult : ''),
         L.playX + 8, r2y, PAL.sub, 'bold 11px sans-serif');
    const badge2 = sp ? T('sol.spider') + ' ' + s.drawCount + '♠ · ' + s.foundations.length + '/8'
                  : fc ? T('sol.freecell') + ' ≤' + RulesF.maxMove(s, false)
                  : '#' + s.seed;
    txt(badge2, L.cx, r2y, PAL.sub, '11px sans-serif');
    const liveMs = G.tAcc + (G.tLast && !s.won ? Math.min(Date.now() - G.tLast, 30000) : 0);
    txtR(s.moves.length + ' · ' + fmtTime(liveMs),
         L.playX + L.playW - 8, r2y, PAL.sub, 'bold 11px sans-serif');

    // ⭐ Spider 不给「还有解吗」——104 张状态空间远超 solver，给了就是假承诺。
    //   那条版面改成「剩余发牌次数 / 先填满空列」的状态提示。
    if (sp) {
      const rounds = Math.ceil(s.stock.length / 10);
      const empty = RulesS.hasEmptyCol(s);
      const warn = empty && rounds > 0;
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10,
             warn ? 'rgba(255,216,77,0.22)' : 'rgba(255,255,255,0.10)');
      txt(warn ? '⚠ ' + T('sol.spFillFirst')
               : rounds ? T('sol.spDealsLeft', { n: rounds })
                        : T('sol.spNoStock'),
          L.cx, L.proveY + L.proveH / 2, warn ? '#ffd84d' : PAL.sub, 'bold 12px sans-serif');
      if (rounds && !empty) addHit(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 'STOCK', {});
    }
    // ══ ⭐ 「这局还有解吗？」条 —— 本作唯一没有竞品有的按钮，也是 4.3(a) 的正面回答 ══
    //    它永远免费、永远不看广告：这是产品的灵魂，不是道具（变现红线 §7.4）。
    const P = Prover.st;
    // ⭐ 教学局：这一行整条让给教学横幅（「还差几步」+ 退出）。
    //   ⚠ 它和证明条/「一键走完」是**同一块地皮**——分开画会重叠成一团（验图抓出过一次）。
    //   教学局也**不给「一键走完」**：那等于替玩家把课上了。
    if (G.lesson) {
      const remain = Math.max(0, G.lessonNeed - (s.moves.length - (G.lessonBase || 0)));
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(126,242,160,0.22)');
      txt(T('sol.lessonBar', { n: G.lesson, k: remain }), L.cx - 26, L.proveY + L.proveH / 2,
          '#7ef2a0', 'bold 12px sans-serif');
      const qx = L.playX + L.playW - 8 - 54;
      fillRR(qx, L.proveY + 6, 48, L.proveH - 12, 8, 'rgba(255,255,255,0.18)');
      txt(T('sol.lessonQuit'), qx + 24, L.proveY + L.proveH / 2, '#fff', '10px sans-serif');
      addHit(qx, L.proveY + 6, 48, L.proveH - 12, 'LESSON_QUIT', {});
    }
    else if (sp) { /* Spider 无证明器（见上） */ }
    else if (P.phase === 'proving') {
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
    } else if (Core.canAutoFinish(s)) {
      // ⭐ 稳赢收尾：全明牌 + 牌堆空 ⇒ 剩下的整理不用手磨,solver 播完直接接瀑布
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(126,242,160,0.25)');
      iconText('sparkle', '✨', T('sol.autoFinish'), L.cx, L.proveY + L.proveH / 2, 'bold 14px sans-serif', '#7ef2a0', 17);
      addHit(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 'FINISH', {});
    } else {
      fillRR(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 10, 'rgba(255,255,255,0.14)');
      iconText('search', '🔍', T('sol.prove'), L.cx, L.proveY + L.proveH / 2, 'bold 14px sans-serif', '#fff', 17);
      addHit(L.playX + 8, L.proveY, L.playW - 16, L.proveH, 'PROVE', {});
    }

    // 🃏 已持有的万能牌：悬浮按钮（点一下召唤最缺的 foundation 牌）
    if (!fc && G.jokers > 0 && !s.won) {
      const jx = L.playX + L.playW - 8 - 52, jy = L.proveY - 50;
      fillRR(jx, jy, 52, 42, 12, 'rgba(255,216,77,0.30)');
      txt('🃏×' + G.jokers, jx + 26, jy + 21, '#ffd84d', 'bold 13px sans-serif');
      addHit(jx, jy, 52, 42, 'JOKER_USE', {});
    }

    // 👁 透视暗牌（激励视频·局内增益）：只在**真有暗牌**时出现，透视中显示倒计时。
    //   ⚠ 它不改牌局，只把已经定死的信息提前给你看 ⇒ 不碰公平红线（但计 usedHint，不算干净赢）。
    const downN = fc ? 0 : s.tableau.reduce((a, c) => a + (c.cards.length - c.up), 0);
    if (!fc && !Money.noAds && downN > 0 && !s.won) {
      const peeking = G.peekUntil > Date.now();
      const px2 = L.playX + 8, py2 = L.proveY - 50;
      const left = adLeft('peek');
      fillRR(px2, py2, 52, 42, 12, peeking ? 'rgba(126,242,160,0.30)'
                                 : left ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)');
      if (peeking) {
        const sec = String(Math.ceil((G.peekUntil - Date.now()) / 1000));
        ctx.font = 'bold 13px sans-serif';
        uiIcon('eye', '👁', px2 + 26 - ctx.measureText(sec).width / 2 - 8, py2 + 16, 17);
        txtL(sec, px2 + 26 - ctx.measureText(sec).width / 2 + 3, py2 + 16, '#7ef2a0', 'bold 13px sans-serif');
      } else uiIcon('eye', '👁', px2 + 26, py2 + 16, 18);
      ctx.font = '8px sans-serif';
      txt(peeking ? T('sol.peekOn') : T('sol.adLeft', { n: left }), px2 + 26, py2 + 33,
          'rgba(255,255,255,0.7)', '8px sans-serif');
      if (!peeking) addHit(px2, py2, 52, 42, 'AD_PEEK', {});
    }

    // ── 底部大圆钮（照竞品排版;⛔ 撤销/提示**永远免费无限**,绝不学它的限量道具）──
    //   MODE(切玩法)移到菜单标题旁的 chip —— 工具条只留高频四件
    const tools = sp ? [
      ['↺', T('sol.undo'), 'UNDO', s.moves.length > 0],
      ['hint', T('sol.hint'), 'HINT', true],
      ['🂠', T('sol.spDeal'), 'STOCK', s.stock.length > 0],   // Spider 用发牌代替「自动收牌」
      ['↻', T('sol.newGame'), 'NEW', true],
    ] : [
      ['↺', T('sol.undo'), 'UNDO', s.moves.length > 0],
      ['hint', T('sol.hint'), 'HINT', true],
      ['⤴', T('sol.auto'), 'AUTO', true],
      ['↻', T('sol.newGame'), 'NEW', true],
    ];
    const RB = 24;
    const gapB = (L.playW - 32 - tools.length * RB * 2) / (tools.length - 1);
    tools.forEach(([ic, label, act, on], i) => {
      const cxB = L.playX + 16 + RB + i * (RB * 2 + gapB);
      const cyB = L.barY + RB + 2;
      ctx.beginPath(); ctx.arc(cxB, cyB, RB, 0, 7);
      ctx.fillStyle = on ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.14)'; ctx.fill();
      if (ic === 'hint') {                       // 共享库图标（其余是几何字形，直接画字）
        ctx.globalAlpha = on ? 1 : 0.35;
        uiIcon('hint', '💡', cxB, cyB, 24);
        ctx.globalAlpha = 1;
      } else txt(ic, cxB, cyB, on ? '#fff' : 'rgba(255,255,255,0.35)', '19px sans-serif');
      txt(wrapLines(label, RB * 2 + gapB - 6, 1)[0], cxB, L.barY + RB * 2 + 12,
          on ? PAL.sub : 'rgba(255,255,255,0.3)', '9px sans-serif');
      if (on) addHit(cxB - RB, cyB - RB, RB * 2, RB * 2, act, {});
    });

    // 横幅**预留区**（真广告由 Ads 层贴上；这里只占位，绝不盖住牌）
    if (!G.noAds && L.bannerH) {
      fillRR(0, L.bannerY, SW, L.bannerH, 0, 'rgba(0,0,0,0.28)');
      txt(T('sol.adSlot'), SW / 2, L.bannerY + L.bannerH / 2, 'rgba(255,255,255,0.30)', '11px sans-serif');
    }

    // ── 赢局浮层（教学局单独一套：不谈分数金币排行，只谈「这一课学会了」）──
    if (s.won && !FX.busy() && G.lesson) {
      drawDim('rgba(0,40,20,0.80)');
      uiIcon('check', '✅', L.cx, SH * 0.32, 56);
      txt(T('sol.lessonDone', { n: G.lesson }), L.cx, SH * 0.42, '#fff', 'bold 20px sans-serif');
      ctx.font = '12px sans-serif';
      wrapLines(T('sol.lesson' + G.lesson + 'Tip'), Math.min(L.playW - 60, 340), 3)
        .forEach((ln, i) => txt(ln, L.cx, SH * 0.48 + i * 17, PAL.sub, '12px sans-serif'));
      const more = G.lesson < 4;
      fillRR(L.cx - 100, SH * 0.60, 200, 46, 12, '#22c55e');
      txt(more ? T('sol.lessonNext') : T('sol.lessonAllDone'), L.cx, SH * 0.60 + 23, '#fff', 'bold 15px sans-serif');
      addHit(L.cx - 100, SH * 0.60, 200, 46, more ? 'LESSON_NEXT' : 'LESSON_QUIT', {});
      drawToast();
      return;
    }
    if (s.won && !FX.busy()) {
      drawDim('rgba(0,40,20,0.80)');
      const wcw = Math.min(L.playW - 20, 344), wy0 = SH * 0.28 - 34;
      fillRR(L.cx - wcw / 2, wy0, wcw, winCardH || SH * 0.58, 22, 'rgb(7,45,28)');
      strokeRR(L.cx - wcw / 2, wy0, wcw, winCardH || SH * 0.58, 22, 'rgba(255,255,255,0.16)', 1.5);
      let wy = SH * 0.28;
      txt(T('sol.youWin'), L.cx, wy, '#fff', 'bold 30px sans-serif'); wy += 46;
      const multW = Math.min(G.stage || 1, 5);
      txt(T('sol.finalScore', { n: G.lastStageScore || s.score }) + (multW > 1 ? '  ×' + multW : ''),
          L.cx, wy, '#ffd84d', 'bold 22px sans-serif'); wy += 20;
      txt(T('sol.runTotal', { n: G.runScore || 0 }), L.cx, wy, PAL.sub, '11px sans-serif'); wy += 20;
      txt(T('sol.timeMoves', { t: fmtTime(root.G.tAcc), m: s.moves.length }),
          L.cx, wy, PAL.sub, '11px sans-serif'); wy += 22;
      const clean = !s.usedUndo && !s.usedHint && !s.usedJoker;
      txt(clean ? T('sol.cleanWin') : T('sol.withHelp'), L.cx, wy,
          clean ? '#7ef2a0' : PAL.sub, '13px sans-serif'); wy += 22;
      // 本次赢的金币（×2 翻倍后带 ✓）+ 新解锁的天使
      {
        const wl = T('sol.winCoins', { n: G.lastWinCoins || 0 }) + (G.winDoubled ? '  ×2 ✓' : '');
        if (G.lastAngelGain) iconText('frame', '👼', wl + '   +' + G.lastAngelGain, L.cx, wy, 'bold 13px sans-serif', '#ffd84d', 16);
        else txt(wl, L.cx, wy, '#ffd84d', 'bold 13px sans-serif');
      }
      wy += 22;
      // 🏅 本局排行榜（预设对手,seed 确定性 —— 零后端伪社交,同一局全球同一组分数）
      const rows2 = rivalScores(s.seed).concat([{ name: T('sol.rankYou'), av: -1, score: s.score, you: 1 }])
        .sort((a, b) => b.score - a.score);
      txt(T('sol.rankTitle'), L.cx, wy, PAL.sub, 'bold 11px sans-serif'); wy += 16;
      const lw = 210;
      rows2.forEach((r, i) => {
        const col = r.you ? '#7ef2a0' : 'rgba(255,255,255,0.75)';
        const f2 = (r.you ? 'bold ' : '') + '12px sans-serif';
        txtL((i + 1) + '.', L.cx - lw / 2, wy, col, f2);
        drawAvatar(r.av, L.cx - lw / 2 + 30, wy, 18, r.name);
        txtL(r.name, L.cx - lw / 2 + 42, wy, col, f2);
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
      // ⭐ 主按钮 = 下一关(倍率递增,「再来一关」);次按钮 = 重开一轮
      fillRR(L.cx - 100, wy, 200, 48, 12, '#22c55e');
      txt('▶ ' + T('sol.nextStage', { n: (G.stage || 1) + 1, m: Math.min((G.stage || 1) + 1, 5) }),
          L.cx, wy + 24, '#fff', 'bold 15px sans-serif');
      addHit(L.cx - 100, wy, 200, 48, 'NEXT_STAGE', {});
      wy += 54;
      fillRR(L.cx - 90, wy, 180, 34, 10, 'rgba(255,255,255,0.16)');
      txt('↻ ' + T('sol.newGame'), L.cx, wy + 17, '#fff', '12px sans-serif');
      addHit(L.cx - 90, wy, 180, 34, 'NEW', {});
      wy += 40;
      // 挑战朋友：战绩图卡（支持文件分享时出图，桌面等环境自动降级为链接分享）
      fillRR(L.cx - 90, wy, 180, 40, 12, 'rgba(255,255,255,0.18)');
      iconText('share', '📤', T('sol.challenge'), L.cx, wy + 20, '13px sans-serif', '#fff', 15);
      addHit(L.cx - 90, wy, 180, 40, 'SHARE_CARD', {});
      wy += 48;
      // ⭐ 「金币 ×2」：转化最高的激励位（刚赢、瀑布刚放完）。纯增益；买了去广告的不打扰。
      if (!Money.noAds && G.lastWinCoins > 0 && !G.winDoubled) {
        fillRR(L.cx - 90, wy, 180, 40, 12, 'rgba(255,216,77,0.24)');
        txt('▶ ' + T('sol.adX2') + ' (+' + G.lastWinCoins + ')', L.cx, wy + 20, '#ffd84d', 'bold 13px sans-serif');
        addHit(L.cx - 90, wy, 180, 40, 'WIN_X2', {});
        wy += 48;
      }
      winCardH = wy - wy0 + 8;                 // 量给下一帧的卡片高度
    }

    // 🃏 卡死弹窗（照竞品:居中大卡;真卡死才出,可关掉继续自己找;诚实答案与撤销永远免费在旁）
    if (!fc && G.jokerOffer > Date.now() && G.jokers < 1 && !Money.noAds && !s.won) {
      drawDim('rgba(0,0,0,0.62)');
      const pw = Math.min(320, L.playW - 40), ph = 250;
      const px = L.cx - pw / 2, py = SH * 0.30;
      fillRR(px, py, pw, ph, 18, '#fdfdfb');
      txt('🃏', L.cx, py + 52, '#000', '58px sans-serif');
      txt(T('sol.jokerTitle'), L.cx, py + 106, '#1a1a2e', 'bold 17px sans-serif');
      ctx.font = '11px sans-serif';
      wrapLines(T('sol.hintNone'), pw - 40, 2).forEach((ln, i) =>
        txt(ln, L.cx, py + 128 + i * 14, 'rgba(0,0,0,0.55)', '11px sans-serif'));
      fillRR(px + 24, py + 162, pw - 48, 44, 12, '#22c55e');
      txt('▶ ' + T('sol.jokerAd'), L.cx, py + 184, '#fff', 'bold 13px sans-serif');
      addHit(px + 24, py + 162, pw - 48, 44, 'JOKER_AD', {});
      txt(T('sol.keepLooking'), L.cx, py + 226, '#16a34a', 'bold 13px sans-serif');
      addHit(px + 24, py + 212, pw - 48, 30, 'JOKER_DISMISS', {});
    }
    drawToast();
  }

  const fmtTime = ms => {
    const t = Math.max(0, Math.round(ms / 1000));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };

  /** 提示的源/落点框（与 moveAnim 同一套 cardXY 坐标约定）*/
  /**
   * @param win true = 这一步来自**求解器的解法**（走下去能赢）；false = 启发式兜底。
   * ⛔ 两者必须在 UI 上分得清 —— 把「我猜的」画成「我证明的」就是撒谎（措辞死线的同源要求）。
   */
  function drawHintMove(s, L, m, win) {
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
    box(src, win ? '#7ef2a0' : '#ffd84d');
    box(dst, '#7ef2a0', true);
    // 角标：绿色 ✓ = 求解器证明过的一步；黄色 ~ = 只是「看起来不错」
    if (src) {
      const bx = src.x + L.cardW - 16, by = src.y - 6;
      fillRR(bx, by, 30, 15, 7, win ? '#7ef2a0' : 'rgba(255,216,77,0.92)');
      txt(win ? T('sol.hintWin') : T('sol.hintGuess'), bx + 15, by + 8, '#0a3d22', 'bold 8px sans-serif');
    }
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
