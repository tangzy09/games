// e2e-p1.cjs — Playwright 无头：真实 pointer 拖拽 → 落子 → 消行 → game over → 重开 + 截图。
// ⚠ 这是 P1 唯一能证明「拖拽真的能玩」的东西：单测证明不了 pointer 事件链、坐标映射、
//    与 engine Input 的共存。截图存 C:\tmp\blockblast\。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const PORT = 8131;
const SHOT_DIR = 'C:\\tmp\\blockblast';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };

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
    srv.on('error', e => rej(e.code === 'EADDRINUSE'
      ? new Error(`端口 ${PORT} 被占用(另一个会话在跑 e2e?)。等它跑完或改 PORT。`) : e));
    srv.listen(PORT, () => res(srv));
  });
}

const ok = (cond, msg) => { if (!cond) { console.error('✗ ' + msg); process.exitCode = 1; } else console.log('✓ ' + msg); };

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
  await page.evaluate(() => dispatch('PLAY_ENDLESS'));   // P2 起：起手在菜单，先进无尽模式
  await page.waitForTimeout(300);

  ok(errors.length === 0, '加载零 console/page error' + (errors.length ? ': ' + errors[0] : ''));
  await page.screenshot({ path: path.join(SHOT_DIR, 'p1-01-start.png') });

  // ── 用真实 pointer 事件拖一块到棋盘 ──
  // 目标格 (r,c) 的屏幕坐标 → 反推手指该放哪（drag.js 会减去 anchor 和 1.2 格抬起偏移）
  async function dragSlotTo(slot, r, c) {
    const info = await page.evaluate(([slot, r, c]) => {
      const G = window.G, L = Render.L;
      const piece = Core.tray(G.s)[slot];
      if (!piece) return null;
      const ctr = Render.traySlotCenter(slot);
      const size = Math.round(L.cell * L.trayScale);
      const ox = ctr.x - (piece.wdt * size) / 2, oy = ctr.y - (piece.h * size) / 2;
      // 从块的第一个实心格中心按下 ⇒ anchor = 那一格
      const [ar, ac] = piece.cells[0];
      const from = { x: ox + (ac + 0.5) * size, y: oy + (ar + 0.5) * size };
      // 落点：让块的 (0,0) 格落到棋盘 (r,c) ⇒ 反解手指位置
      const cell = L.cell;
      const topX = L.boardX + c * cell, topY = L.boardY + r * cell;
      const to = {
        x: topX + ac * cell + cell / 2,
        y: topY + ar * cell + cell / 2 + cell * 1.2,
      };
      return { from, to, pieceId: piece.id, canPlace: Core.canPlace(G.s.board, piece, r, c) };
    }, [slot, r, c]);
    if (!info || !info.canPlace) return null;
    await page.mouse.move(info.from.x, info.from.y);
    await page.mouse.down();
    await page.mouse.move(info.to.x, info.to.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(60);
    return info;
  }

  // 找一个合法落点并拖过去
  async function playOneMove() {
    const plan = await page.evaluate(() => {
      const G = window.G, s = G.s;
      const tray = Core.tray(s);
      for (let slot = 0; slot < 3; slot++) {
        const p = tray[slot];
        if (!p) continue;
        const ps = Core.placements(s.board, p);
        if (ps.length) return { slot, r: ps[0][0], c: ps[0][1] };
      }
      return null;
    });
    if (!plan) return false;
    const res = await dragSlotTo(plan.slot, plan.r, plan.c);
    return !!res;
  }

  const before = await page.evaluate(() => ({ score: G.s.score, fill: Core.fillCount(G.s.board) }));
  const moved = await playOneMove();
  const after = await page.evaluate(() => ({ score: G.s.score, fill: Core.fillCount(G.s.board), turns: G.s.stats.turns }));
  ok(moved, '拖拽落子成功（真实 pointer 事件链）');
  ok(after.turns === 1, '落子计入 turns');
  ok(after.fill > before.fill, '棋盘多了格子');
  ok(after.score > before.score, '落子得分（= 格子数）');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p1-02-placed.png') });

  // ── 强行造一个「一步消行」的局面，验证消除 + juice 真的触发 ──
  await page.evaluate(() => {
    const s = G.s;
    // 把第 7 行填到只差 (7,0)，并保证 tray[0] 是能放进 (7,0) 的块
    s.board = new Array(64).fill(0);
    for (let c = 1; c < 8; c++) { s.board[Core.idx(7, c)] = 1; G.cellColor[Core.idx(7, c)] = '#22c55e'; }
    // 找一个 1×1 的块流位置：向后扫，直到 tray[0] 是 i1
    for (let k = 0; k < 5000; k++) {
      s.streamIndex = k * 3;
      s.placed = [false, false, false];
      if (Core.tray(s)[0].id === 'i1') break;
    }
    renderAll();
  });
  const trayId = await page.evaluate(() => Core.tray(G.s)[0].id);
  ok(trayId === 'i1', '构造出 1×1 在 slot0（用于精确测消行）');

  const preClear = await page.evaluate(() => ({ score: G.s.score, lines: G.s.stats.lines }));
  await dragSlotTo(0, 7, 0);
  await page.waitForTimeout(120);
  const postClear = await page.evaluate(() => ({
    score: G.s.score, lines: G.s.stats.lines, fill: Core.fillCount(G.s.board), streak: G.s.streak,
  }));
  ok(postClear.lines === preClear.lines + 1, '整行填满 → 消掉 1 条');
  ok(postClear.fill === 0, '那一行被清空（盘上不留格）');
  ok(postClear.score > preClear.score + 1, '消行得分远大于落子分');
  ok(postClear.streak === 1, 'streak 起步');
  await page.screenshot({ path: path.join(SHOT_DIR, 'p1-03-clearing.png') });   // 抓消行动画中

  // ── 一直玩到 game over（验证结束判定 + 浮层 + 重开）──
  let guard = 0;
  while (guard++ < 400) {
    const over = await page.evaluate(() => G.s.over);
    if (over) break;
    const moved2 = await playOneMove();
    if (!moved2) break;
  }
  const overState = await page.evaluate(() => ({ over: G.s.over, score: G.s.score, turns: G.s.stats.turns }));
  ok(overState.over, `玩到 game over（${overState.turns} 次落子，${overState.score} 分）`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT_DIR, 'p1-04-gameover.png') });

  // 重开按钮（这个是 engine 的 hitTest 路径，验证拖拽层没把它抢掉）
  const btn = await page.evaluate(() => {
    const { SW, SH } = GameGlobal;
    return { x: SW / 2, y: SH * 0.68 + 25 };
  });
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(150);
  const restarted = await page.evaluate(() => ({ over: G.s.over, score: G.s.score, fill: Core.fillCount(G.s.board) }));
  ok(!restarted.over && restarted.score === 0 && restarted.fill === 0, '重开 → 新的一局（engine tap 仍然工作）');

  // ── 中英切换（P1 就双语，且零硬编码文案）──
  await page.evaluate(() => I18N.setLang('zh-CN'));
  await page.waitForTimeout(200);
  await page.evaluate(() => renderAll());
  await page.screenshot({ path: path.join(SHOT_DIR, 'p1-05-zh.png') });
  const zhOk = await page.evaluate(() => T('blockblast.restart') === '再来一局' && !T('blockblast.noMoves').includes('blockblast.'));
  ok(zhOk, '中文 locale 生效（key 有解析，不是原样输出）');

  ok(errors.length === 0, '全程零 error' + (errors.length ? ': ' + errors.join(' | ') : ''));

  await browser.close();
  srv.close();
  console.log(`\n截图 → ${SHOT_DIR}`);
  if (process.exitCode) console.log('\n✗ E2E 有失败项');
  else console.log('\n✓ E2E 全绿');
})();
