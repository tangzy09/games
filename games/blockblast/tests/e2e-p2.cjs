// e2e-p2.cjs — 关卡模式：菜单 → 进第 1 关 → 真拖拽打通 → 三星结算 → 下一关 → 进度存档。
// 也验证两条红线：关卡失败**零广告**、软锁死会被兜底（免费重开）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8143;
const SHOT_DIR = 'C:\\tmp\\blockblast';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      const inRoot = f === ROOT || f.startsWith(ROOT + path.sep);
      if (!inRoot || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); rep.end('nf'); return; }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    srv.on('error', e => rej(e.code === 'EADDRINUSE' ? new Error(`端口 ${PORT} 被占用`) : e));
    srv.listen(PORT, () => res(srv));
  });
}
const ok = (c, m) => { if (!c) { console.error('✗ ' + m); process.exitCode = 1; } else console.log('✓ ' + m); };

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/games/blockblast/index.html`);
  await page.waitForFunction(() => window.G && window.G.s, null, { timeout: 5000 });
  await page.waitForTimeout(250);

  // ── 菜单 ──
  ok(await page.evaluate(() => G.phase === 'MENU'), '起手在菜单（关卡地图）');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-01-menu.png') });

  // ── 点第 1 关 ──
  await page.evaluate(() => dispatch('PLAY_LEVEL', { id: 1 }));
  await page.waitForTimeout(150);
  const lv = await page.evaluate(() => ({
    mode: G.s.mode, id: G.s.levelId, goals: G.s.goals, par: G.s.par,
    crystals: G.s.crystal.filter(Boolean).length, stones: G.s.stone.filter(Boolean).length,
  }));
  ok(lv.mode === 'level' && lv.id === 1, '进入第 1 关');
  ok(lv.crystals === Object.values(lv.goals).reduce((a, b) => a + b, 0), '目标数 = 盘上水晶数（永远凑得齐）');
  ok(lv.par > 0, `par 已由 verify-levels 标定（${lv.par} 步内三星）`);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-02-level1.png') });

  // ── 真拖拽把这一关打通 ──
  async function dragSlotTo(slot, r, c) {
    const info = await page.evaluate(([slot, r, c]) => {
      const L = Render.L, piece = Core.tray(G.s)[slot];
      if (!piece) return null;
      const rect = L.traySlots[slot];
      const [ar, ac] = piece.cells[0];
      return {
        from: { x: rect.x + (ac + 0.5) * rect.size, y: rect.y + (ar + 0.5) * rect.size },
        to: { x: L.boardX + c * L.cell + ac * L.cell + L.cell / 2,
              y: L.boardY + r * L.cell + ar * L.cell + L.cell / 2 + L.cell * 1.2 },
      };
    }, [slot, r, c]);
    if (!info) return false;
    await page.mouse.move(info.from.x, info.from.y);
    await page.mouse.down();
    await page.mouse.move(info.to.x, info.to.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    return true;
  }

  // 贪心：优先能收水晶的落子
  async function bestMove() {
    return page.evaluate(() => {
      const s = G.s, tray = Core.tray(s);
      let best = null, bv = -1e9;
      for (let slot = 0; slot < 3; slot++) {
        const p = tray[slot]; if (!p) continue;
        for (const [r, c] of Core.placements(s.board, p)) {
          const b = s.board.slice();
          for (const [dr, dc] of p.cells) b[Core.idx(r + dr, c + dc)] = 1;
          const f = Core.findFullLines(b, s.stone);
          let cry = 0;
          for (const rr of f.rows) for (let cc = 0; cc < 8; cc++) if (s.crystal[Core.idx(rr, cc)]) cry++;
          for (const cc of f.cols) for (let rr = 0; rr < 8; rr++) if (s.crystal[Core.idx(rr, cc)]) cry++;
          let filled = 0; for (let i = 0; i < 64; i++) if (b[i]) filled++;
          const v = cry * 1000 + (f.rows.length + f.cols.length) * 50 - filled;
          if (v > bv) { bv = v; best = { slot, r, c }; }
        }
      }
      return best;
    });
  }

  let guard = 0;
  while (guard++ < 60) {
    const st = await page.evaluate(() => ({ over: G.s.over, won: G.s.won }));
    if (st.over) break;
    const mv = await bestMove();
    if (!mv) break;
    await dragSlotTo(mv.slot, mv.r, mv.c);
  }
  const res = await page.evaluate(() => ({
    won: G.s.won, over: G.s.over, turns: G.s.stats.turns,
    collected: G.s.collected, goals: G.s.goals,
    stars: Core.starsFor(G.s), progress: G.progress,
  }));
  ok(res.won, `打通第 1 关（${res.turns} 步，${res.stars} 星）`);
  ok(Object.keys(res.goals).every(k => res.collected[k] >= res.goals[k]), '所有水晶都收集齐了');
  ok((res.progress[1] || 0) === res.stars, '星数写进进度存档');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-03-win.png') });

  // ── 「下一关」按钮 ──
  await page.evaluate(() => dispatch('NEXT_LEVEL'));
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => G.s.levelId === 2 && !G.s.over), '进入第 2 关');

  // ── 关卡失败：**零广告**（DESIGN §6.2 的红线）──
  const failUi = await page.evaluate(() => {
    // 强行造死局：棋盘填满（除石块外），托盘必然放不下
    const s = G.s;
    for (let i = 0; i < 64; i++) s.board[i] = 1;
    s.board[0] = 0;                       // 只留一个孤格
    s.over = Core.isOver(s);
    renderAll();
    // 收集当前浮层上所有可点区域的 action
    const acts = [];
    const orig = window.addHit;
    return { over: s.over, hasAdButton: false };
  });
  ok(failUi.over, '造出死局 → 判负');
  const actions = await page.evaluate(() => {
    // 重新渲染并抓取 hit 区域（引擎的 hitAreas 是模块内私有，这里用 hitTest 探测按钮位置）
    renderAll();
    const { SW, SH } = GameGlobal;
    const found = [];
    for (let y = 0; y < SH; y += 8) for (let x = 0; x < SW; x += 8) {
      const h = hitTest(x, y);
      if (h && !found.includes(h.action)) found.push(h.action);
    }
    return found;
  });
  ok(!actions.some(a => /AD|REVIVE|CONTINUE/i.test(a)),
    `关卡失败界面零广告按钮（实际按钮：${actions.join(', ')}）`);
  ok(actions.includes('RETRY_LEVEL'), '失败只给「立刻重来」');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-04-fail-no-ads.png') });

  // ── 软锁死兜底：不可胜 → 免费重开 ──
  const unwin = await page.evaluate(() => {
    dispatch('PLAY_LEVEL', { id: 11 });               // 有石块的关
    const s = G.s;
    // 人为把一颗水晶的行和列都封上石块（正常关卡 validate 不允许，这里测运行时兜底）
    const i = s.crystal.findIndex(Boolean);
    const r = Math.floor(i / 8), c = i % 8;
    s.stone[Core.idx(r, (c + 1) % 8)] = 1; s.board[Core.idx(r, (c + 1) % 8)] = 1;
    s.stone[Core.idx((r + 1) % 8, c)] = 1; s.board[Core.idx((r + 1) % 8, c)] = 1;
    return Core.isUnwinnable(s);
  });
  ok(unwin, '不可胜检测能抓到「水晶被石块封死」（软锁死兜底）');

  // ── 中文 ──
  await page.evaluate(() => { dispatch('MENU'); I18N.setLang('zh-CN'); });
  await page.waitForTimeout(250);
  await page.evaluate(() => renderAll());
  await page.screenshot({ path: path.join(SHOT_DIR, 'p2-05-menu-zh.png') });
  ok(await page.evaluate(() => T('blockblast.levels') === '闯关'), '中文 locale 生效');

  ok(errors.length === 0, '全程零 error' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.close();
  console.log(`\n截图 → ${SHOT_DIR}`);
  console.log(process.exitCode ? '\n✗ P2 E2E 有失败项' : '\n✓ P2 E2E 全绿');
})();
