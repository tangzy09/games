// e2e-p1b.cjs — Playwright 无头:整局跑通(HOME→射击→连锁→死亡→重开)+ 截图。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');   // 仓库根
const PORT = 8127;
const SHOT_DIR = 'C:\\tmp\\abyssshoot';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
               '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((req, rep) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      // 路径穿越判断:必须是 ROOT 本身或 ROOT/ 下的真子路径。
      // 用裸 startsWith(ROOT) 会把 `games-backup` 这类兄弟目录也当成命中。
      const inRoot = f === ROOT || f.startsWith(ROOT + path.sep);
      if (!inRoot || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rep.writeHead(404); rep.end('nf'); return;
      }
      rep.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rep);
    });
    // 本仓多会话并行共用:端口被别的会话占着时给一句人话,别抛裸 EADDRINUSE。
    srv.on('error', e => rej(e.code === 'EADDRINUSE'
      ? new Error(`端口 ${PORT} 被占用(另一个会话在跑 e2e?)。等它跑完或改 PORT。`)
      : e));
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  const srv = await serve();
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`http://localhost:${PORT}/games/abyssshoot/`);
    await page.waitForFunction(() => window.G && window.G.phase === 'HOME', { timeout: 8000 });
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1-home.png') });
    console.log('OK HOME 渲染');

    // 开局
    await page.evaluate(() => dispatch('START', {}));
    let st = await page.evaluate(() => ({ phase: G.phase, dead: G.s.dead, shots: G.s.shots }));
    if (st.phase !== 'PLAYING') throw new Error('START 后应进 PLAYING,实为 ' + st.phase);
    console.log('OK START → PLAYING');

    // ── 动画:确定性设局 + 冻结取样 ──────────────────────────────────
    // 动画放慢,让「中途态」有稳定窗口可截;再用 freeze() 停掉 RAF 把进度钉死在指定 p,
    // 截图/取像素/断言都在同一冻结帧上做 —— 不赌时序,重跑必得同样结果。
    await page.evaluate(() => { ANIM.fly = 1200; ANIM.merge = 1200; G.noAnim = false; });

    // 冻结当前动画帧到进度 p(停 RAF → 钉 elapsed → 手动重画一帧)
    const freezeAt = (p) => page.evaluate((prog) => {
      cancelAnimationFrame(window.rafId); window.rafId = null;
      G.anim.elapsed = prog * G.anim.steps[G.anim.i].dur;
      renderAll();
    }, p);
    const resume = () => page.evaluate(() => {
      if (!G.anim) return;
      G.anim.last = 0;
      window.rafId = requestAnimationFrame(frame);
    });
    // 取某列内一像素的红色分量(列背景区,tile 上方)。红洗/红框会把它显著推高。
    // 无红警:colBg #0d2740 → r≈13(DEAD 的 dim 之下更低)。有红洗:r≈50+。阈值 35。
    const colRed = (c) => page.evaluate((col) => {
      const L = layout(G.s);
      const dpr = window.devicePixelRatio || 1;
      const d = ctx.getImageData(Math.round((L.boardX + col * L.cell + L.cell / 2) * dpr),
                                 Math.round((L.boardY + 3) * dpr), 1, 1).data;
      return d[0];
    }, c);

    // ① 多轮连锁合并:col0 = [4,2] + 弹药 2 → [4,2,2] → 2,2合4 → 4,4合8(两轮 merge step)
    await page.evaluate(() => {
      G.s.board = [[4, 2], [], [], [], []];
      G.s.ammo = 2; G.s.shotsSinceSpawn = 0;
      dispatch('SHOOT', { col: 0 });
    });
    const chainSteps = await page.evaluate(() => G.anim && G.anim.steps.map(s => s.type));
    if (!chainSteps) throw new Error('射击后 G.anim 应非 null(动画应启动)');
    if (chainSteps.filter(t => t === 'merge').length !== 2)
      throw new Error('应编排出两轮 merge step(连锁),实为 ' + JSON.stringify(chainSteps));
    // 等它自然走到第一个 merge step,冻在半程截图 —— 此刻应看得见「合并中间态」
    await page.waitForFunction(() => window.G.anim && window.G.anim.steps[window.G.anim.i].type === 'merge',
      { timeout: 5000 });
    // 两个时刻各截一张:早段 = 参与格正在坍缩/飞向锚点(锚点还是旧值 2);
    // 晚段 = 锚点已换成新值 4 并弹跳放大。两张都必须是「中间态」,不是终局盘。
    await freezeAt(0.25);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1b-anim-merge-early.png') });
    await freezeAt(0.68);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1b-anim-merge-pop.png') });
    await resume();
    await page.waitForFunction(() => window.G.anim === null, { timeout: 8000 });
    const afterChain = await page.evaluate(() => ({ col0: G.s.board[0], score: G.s.score }));
    if (JSON.stringify(afterChain.col0) !== JSON.stringify([8]))
      throw new Error('连锁后 col0 应为 [8],实为 ' + JSON.stringify(afterChain.col0));
    console.log('OK 连锁合并动画:fly → merge×2 → 落定 [8]');

    // ② 动画期间输入被封锁
    const blocked = await page.evaluate(() => {
      G.s.board = [[2], [], [], [], []]; G.s.ammo = 4; G.s.shotsSinceSpawn = 0;
      dispatch('SHOOT', { col: 0 });
      const shotsBefore = G.s.shots;
      if (G.anim) { dispatch('SHOOT', { col: 2 }); return G.s.shots === shotsBefore; }
      return true;   // 动画太快已结束,不算失败
    });
    if (!blocked) throw new Error('动画播放期间应封锁输入');
    await page.waitForFunction(() => window.G.anim === null, { timeout: 8000 });
    console.log('OK 动画期封锁输入');

    // ③ 必死那一炮:弹药要【视觉上越过死线】,而红警【不许】从动画早期就亮(剧透死亡)
    await page.evaluate(() => {
      const alt = [];
      for (let i = 0; i < G.s.rows; i++) alt.push(i % 2 === 0 ? 2 : 4);   // 相邻不同值,不会合并
      G.s.board = [alt, [], [], [], []];
      G.s.ammo = 8; G.s.shotsSinceSpawn = 0;
      dispatch('SHOOT', { col: 0 });
    });
    const deathSteps = await page.evaluate(() => G.anim && G.anim.steps.map(s => s.type));
    if (!deathSteps || deathSteps[0] !== 'fly' || !deathSteps.includes('death'))
      throw new Error('必死那炮应编排 fly → death,实为 ' + JSON.stringify(deathSteps));
    const flyToI = await page.evaluate(() => G.anim.steps[0].toI);
    if (flyToI < 9) throw new Error('落点 index 应 >= rows(越线),实为 ' + flyToI);
    // 冻在 fly 步骤末段(p=0.92):弹药此刻应已压过死线
    await freezeAt(0.92);
    const redDuringFly = await colRed(0);
    if (redDuringFly >= 35)
      throw new Error(`红警不该在弹药还在飞时就亮(死亡剧透),列0 红色分量=${redDuringFly}`);
    // 弹药确实画在死线【下方】的越线位:采样该处应是亮色 tile,不是背景
    const ammoBelowLine = await page.evaluate(() => {
      const L = layout(G.s), dpr = window.devicePixelRatio || 1;
      const d = ctx.getImageData(Math.round((L.boardX + L.cell / 2) * dpr),
                                 Math.round((L.lineY + L.cell * 0.25) * dpr), 1, 1).data;
      return d[0] + d[1] + d[2];   // 背景 #04121f 很暗(和≈50);tile 很亮(和 > 250)
    });
    if (ammoBelowLine < 250)
      throw new Error('fly 末段弹药应已越过死线(死线下方该有格子),取样亮度=' + ammoBelowLine);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1b-anim-death-fly.png') });
    console.log(`OK 必死那炮:弹药越过死线(线下亮度 ${ammoBelowLine})且红警未提前亮(红=${redDuringFly})`);
    // 放完 → death step 亮红警 → DEAD
    await resume();
    await page.waitForFunction(() => window.G.anim === null && window.G.phase === 'DEAD', { timeout: 8000 });
    const redAfterDeath = await colRed(0);
    if (redAfterDeath <= 35)
      throw new Error(`死亡后红警应亮起(顶爆列红洗),列0 红色分量=${redAfterDeath}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1b-anim-death-red.png') });
    console.log(`OK 动画播完才亮红警 → DEAD(红 ${redDuringFly} → ${redAfterDeath})`);

    // ── 整局:重开,关动画瞬间结算(保持快且确定)──
    await page.evaluate(() => { dispatch('RESTART', {}); G.noAnim = true; });

    // 连射直到死(确定性选列,上限保护)
    let guard = 0;
    while (guard < 3000) {
      const dead = await page.evaluate(n => {
        if (G.phase !== 'PLAYING') return true;
        dispatch('SHOOT', { col: n % G.s.cols });
        return G.phase !== 'PLAYING';
      }, guard);
      guard++;
      if (dead) break;
    }
    st = await page.evaluate(() => ({ phase: G.phase, dead: G.s.dead, shots: G.s.shots,
                                      score: G.s.score, maxTile: G.s.maxTile,
                                      breached: G.s.board.filter(c => c.length > G.s.rows).length }));
    if (st.phase !== 'DEAD') throw new Error('连射到底应进 DEAD,实为 ' + st.phase);
    if (!st.dead) throw new Error('DEAD 相位下 core 应 dead');
    if (!(st.score > 0)) throw new Error('整局下来分数应 > 0,实为 ' + st.score);
    if (!(st.maxTile >= 4)) throw new Error('整局下来应至少合出过 4,实为 ' + st.maxTile);
    if (!(st.shots > 5)) throw new Error('局长应 > 5 发,实为 ' + st.shots);
    // 顶爆的那一格(index === rows)是死因的空间信息,渲染必须有东西可画。
    if (!(st.breached >= 1)) throw new Error('死亡时应至少有一列越过死线(length > rows),实为 ' + st.breached);
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-2-dead.png') });
    console.log(`OK 整局跑通:${st.shots} 发 / 分 ${st.score} / 最深 ${st.maxTile} / 顶爆 ${st.breached} 列 → DEAD`);

    // ── 图鉴:打开、显示进度、未解锁灰剪影 ──
    await page.evaluate(() => dispatch('CODEX', {}));
    const cx = await page.evaluate(() => {
      const panel = document.getElementById('panel');
      const items = [...document.querySelectorAll('.cx-item')];
      return {
        open: !panel.classList.contains('hidden'),
        total: items.length,
        unlocked: items.filter(i => !i.classList.contains('locked')).length,
        sub: document.getElementById('panel-sub').textContent,
      };
    });
    if (!cx.open) throw new Error('图鉴面板应打开');
    if (cx.total !== 17) throw new Error('图鉴应有 17 档,实为 ' + cx.total);
    if (!(cx.unlocked >= 3)) throw new Error('整局跑完至少解锁 3 条鱼,实为 ' + cx.unlocked);
    if (cx.unlocked >= cx.total) throw new Error('不该一局就全解锁(否则收集没意义)');
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-codex.png') });
    console.log(`OK 图鉴:${cx.unlocked}/${cx.total} 解锁 · "${cx.sub}"`);
    await page.evaluate(() => document.getElementById('panel-close').click());

    // ── 存档续玩:射几发 → 重新载入页面 → 盘面/分数原样恢复 ──
    await page.evaluate(() => { dispatch('RESTART', {}); G.noAnim = true;
                                for (let i = 0; i < 6; i++) dispatch('SHOOT', { col: i % 5 }); });
    const before = await page.evaluate(() => ({ board: JSON.stringify(G.s.board), score: G.s.score, shots: G.s.shots }));
    await page.reload();
    await page.waitForFunction(() => window.G && window.G.s);
    const after = await page.evaluate(() => ({ phase: G.phase, board: JSON.stringify(G.s.board), score: G.s.score, shots: G.s.shots }));
    if (after.phase !== 'PLAYING') throw new Error('重载后应恢复续玩(PLAYING),实为 ' + after.phase);
    if (after.board !== before.board) throw new Error('重载后盘面应原样恢复');
    if (after.score !== before.score || after.shots !== before.shots)
      throw new Error('重载后分数/发数应原样恢复');
    console.log(`OK 存档续玩:重载后盘面/分数(${after.score})/发数(${after.shots}) 原样恢复`);

    // 重开
    await page.evaluate(() => dispatch('RESTART', {}));
    st = await page.evaluate(() => ({ phase: G.phase, shots: G.s.shots, score: G.s.score }));
    if (st.phase !== 'PLAYING' || st.shots !== 0 || st.score !== 0)
      throw new Error('RESTART 应回到全新 PLAYING 局,实为 ' + JSON.stringify(st));
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-3-restart.png') });
    console.log('OK RESTART → 全新一局');

    if (errors.length) throw new Error('页面有 JS 错误:\n' + errors.join('\n'));

    console.log(`e2e-p1b OK (截图在 ${SHOT_DIR})`);
  } finally {
    // 失败也必须回收:否则留下孤儿 Chromium + 占着端口,坑下一个并行会话。
    if (browser) await browser.close();
    srv.close();
  }
})().catch(e => { console.error('e2e-p1b FAIL:', e.message); process.exit(1); });
