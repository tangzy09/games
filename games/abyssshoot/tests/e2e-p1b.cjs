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
    // web 端 Ads 降级成 confirm() 模拟 → 必须应答,否则页面挂死
    let adAnswer = true;                       // 用例可切换:模拟「看完」or「关掉」
    page.on('dialog', d => d.accept());        // confirm 一律确认(=看完广告)

    await page.goto(`http://localhost:${PORT}/games/abyssshoot/`);
    await page.waitForFunction(() => window.G && window.G.phase === 'HOME', { timeout: 8000 });
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-1-home.png') });
    console.log('OK HOME 渲染');

    // 开局
    // ⚠ P3a 插屏「每 3 局一次」不是本文件要测的东西(它靠跨 RESTART 的计数,和后面
    //   大量 setup 用的 RESTART 混一起会不确定命中第 3 次——命中时 newGame() 会被
    //   Ads.showInterstitial().finally() 推迟到微任务,若同一个 evaluate 里紧跟着
    //   还有 dispatch('SHOOT',...) 就会打在「还没 newGame」的旧盘上,静默失败）。
    //   故这里每次 START/RESTART 前都把计数清零,让插屏逻辑不在本测试里意外触发。
    await page.evaluate(() => { if (G.save) G.save.stats.runsSinceAd = 0; dispatch('START', {}); });
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

    // ── 道具:锤子 ──
    await page.evaluate(() => { G.save.stats.runsSinceAd = 0; dispatch('RESTART', {}); G.noAnim = true;
                                for (let i = 0; i < 10; i++) dispatch('SHOOT', { col: i % 5 });
                                G.save.coins = 999; });
    const t0 = await page.evaluate(() => ({ coins: G.save.coins, tiles: G.s.board.flat().length }));
    await page.evaluate(() => dispatch('TOOL', { k: 'hammer' }));
    const aiming = await page.evaluate(() => G.tool);
    if (aiming !== 'hammer') throw new Error('点锤子应进入瞄准模式');
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-tool-aim.png') });
    await page.evaluate(() => { const c = G.s.board.findIndex(col => col.length); dispatch('TOOL_CELL', { c, i: 0 }); });
    await page.waitForFunction(() => window.G.anim === null, { timeout: 5000 });
    const t1 = await page.evaluate(() => ({ coins: G.save.coins, tiles: G.s.board.flat().length, tool: G.tool }));
    if (t1.coins !== t0.coins - 60) throw new Error(`锤子应扣 60 币,实为 ${t0.coins - t1.coins}`);
    if (t1.tool !== null) throw new Error('用完应退出瞄准模式');
    console.log(`OK 锤子:扣 60 币,格子 ${t0.tiles}→${t1.tiles}`);

    // ── 道具:撤销(精确回退,不能刷弹药) ──
    const u0 = await page.evaluate(() => {
      G.save.coins = 999;
      const before = { board: JSON.stringify(G.s.board), ammo: G.s.ammo, score: G.s.score };
      dispatch('SHOOT', { col: 0 });
      return before;
    });
    await page.waitForFunction(() => window.G.anim === null, { timeout: 5000 });
    // ⚠ 这一发本身可能触发合并/连锁(newGame 用 Date.now() 播种,非固定种子),
    // 会先给一笔 coinsFor 收益——所以撤销扣币要比「撤销前一刻」少 COST.undo,
    // 不能想当然假设射这一发净不赚币(999 - 30 会在撞上合并时误报)。
    const coinsBeforeUndo = await page.evaluate(() => G.save.coins);
    await page.evaluate(() => dispatch('TOOL', { k: 'undo' }));
    const u1 = await page.evaluate(() => ({ board: JSON.stringify(G.s.board), ammo: G.s.ammo, score: G.s.score, coins: G.save.coins }));
    if (u1.board !== u0.board) throw new Error('撤销后盘面应回到射击前');
    if (u1.ammo !== u0.ammo) throw new Error('撤销后弹药应回到射击前');
    if (u1.score !== u0.score) throw new Error('撤销后分数应回退');
    if (u1.coins !== coinsBeforeUndo - 30) throw new Error('撤销应精确扣 30 币,实为 ' + (coinsBeforeUndo - u1.coins));
    console.log('OK 撤销:盘面/弹药/分数精确回退,扣 30 币');

    // ── 金币不够时:按钮点不动 ──
    await page.evaluate(() => { G.save.coins = 0; dispatch('TOOL', { k: 'hammer' }); });
    const poor = await page.evaluate(() => G.tool);
    if (poor !== null) throw new Error('金币不够时不该进入瞄准模式');
    console.log('OK 金币不够:道具点不动');

    // ── 广告:看广告换金币 ──
    await page.evaluate(() => { G.save.stats.runsSinceAd = 0; dispatch('RESTART', {}); G.noAnim = true;
                                for (let i = 0; i < 4; i++) dispatch('SHOOT', { col: i % 5 });
                                G.save.coins = 0; });
    await page.evaluate(() => dispatch('AD_COINS', {}));
    await page.waitForFunction(() => window.G.adBusy === false, { timeout: 8000 });
    const adc = await page.evaluate(() => G.save.coins);
    if (adc !== 100) throw new Error(`看广告应 +100 币,实为 ${adc}`);
    console.log('OK 看广告换金币:+100');

    // ── 广告:死亡复活(削顶部,列高应下降) ──
    await page.evaluate(() => {
      G.save.stats.runsSinceAd = 0; dispatch('RESTART', {}); G.noAnim = true;
      // 造一个必死盘:一列填满不相邻同值
      const alt = []; for (let i = 0; i < G.s.rows; i++) alt.push(i % 2 === 0 ? 2 : 4);
      G.s.board = [alt, [], [], [], []];
      G.s.ammo = 8;
      dispatch('SHOOT', { col: 0 });
    });
    await page.waitForFunction(() => window.G.phase === 'DEAD', { timeout: 5000 });
    const d0 = await page.evaluate(() => ({ h: G.s.board[0].length, revives: G.revives }));
    await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-ad-revive.png') });
    await page.evaluate(() => dispatch('REVIVE', {}));
    await page.waitForFunction(() => window.G.adBusy === false && window.G.anim === null, { timeout: 8000 });
    const d1 = await page.evaluate(() => ({ phase: G.phase, h: G.s.board[0].length, revives: G.revives, dead: G.s.dead }));
    if (d1.phase !== 'PLAYING') throw new Error(`复活后应回到 PLAYING,实为 ${d1.phase}`);
    if (d1.dead) throw new Error('复活后 core 的 dead 应清除');
    if (!(d1.h < d0.h)) throw new Error(`复活应削掉格子(列高 ${d0.h}→${d1.h})`);
    if (d1.revives !== 1) throw new Error('复活次数应 +1');
    console.log(`OK 死亡复活:列高 ${d0.h}→${d1.h},回到 PLAYING`);

    // ── 复活次数用尽后,按钮不再生效 ──
    await page.evaluate(() => { G.revives = 2; G.phase = 'DEAD'; dispatch('REVIVE', {}); });
    const spent = await page.evaluate(() => G.phase);
    if (spent !== 'DEAD') throw new Error('复活次数用尽后不该还能复活');
    console.log('OK 复活上限:用尽后点不动');

    // ── 整局:重开,关动画瞬间结算(保持快且确定)──
    await page.evaluate(() => { G.save.stats.runsSinceAd = 0; dispatch('RESTART', {}); G.noAnim = true; });

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

    // ── 存档续玩:射几发 → 重新载入页面 → 整个 run 原样恢复 ──
    // ⚠ 这里是**唯一**验证「真实浏览器 + Platform.storage + localStorage + JSON 往返」整条链路的地方
    //   (test-storage.js 用的是内存假后端,走最短路径)。故 run 的每个可玩字段都要逐个断言:
    //   若 ammo/queue 在真实 localStorage 往返后丢了却没影响 board/score,只验 3 个字段的旧断言
    //   会绿灯放行,等真机上「续玩后弹药显示异常」才发现。
    const snapOf = () => page.evaluate(() => ({
      phase: G.phase,
      board: JSON.stringify(G.s.board),
      queue: JSON.stringify(G.s.queue),
      ammo: G.s.ammo, score: G.s.score, maxTile: G.s.maxTile, shots: G.s.shots,
      codexSeen: JSON.stringify(G.save.codex.seen),
    }));
    // 开一次图鉴,数一下解锁格数(reload 后要比对同一口径)
    const codexUnlocked = () => page.evaluate(() => {
      dispatch('CODEX', {});
      const n = [...document.querySelectorAll('.cx-item')].filter(i => !i.classList.contains('locked')).length;
      document.getElementById('panel-close').click();
      return n;
    });

    await page.evaluate(() => { G.save.stats.runsSinceAd = 0; dispatch('RESTART', {}); G.noAnim = true;
                                for (let i = 0; i < 6; i++) dispatch('SHOOT', { col: i % 5 }); });
    const before = await snapOf();
    const cxBefore = await codexUnlocked();
    await page.reload();
    await page.waitForFunction(() => window.G && window.G.s && window.G.save);
    const after = await snapOf();
    const cxAfter = await codexUnlocked();

    if (after.phase !== 'PLAYING') throw new Error('重载后应恢复续玩(PLAYING),实为 ' + after.phase);
    for (const k of ['board', 'queue', 'ammo', 'score', 'maxTile', 'shots']) {
      if (after[k] !== before[k])
        throw new Error(`重载后 ${k} 应原样恢复:before=${before[k]} after=${after[k]}`);
    }
    if (!(after.ammo > 0)) throw new Error('重载后弹药必须是正数(不能是 undefined/0),实为 ' + after.ammo);
    if (JSON.parse(after.queue).length === 0) throw new Error('重载后预览队列不该为空');
    if (!JSON.parse(after.queue).every(v => typeof v === 'number' && v > 0))
      throw new Error('重载后预览队列必须全是正数,实为 ' + after.queue);
    // 图鉴也要跨 reload 存活(storage + codex 两个新模块的完整回归)
    if (after.codexSeen !== before.codexSeen)
      throw new Error(`重载后图鉴 seen 应原样恢复:before=${before.codexSeen} after=${after.codexSeen}`);
    if (cxAfter !== cxBefore)
      throw new Error(`重载后图鉴解锁数应一致:before=${cxBefore} after=${cxAfter}`);
    if (!(cxAfter >= 3)) throw new Error('重载后图鉴解锁数应 >= 3,实为 ' + cxAfter);
    console.log(`OK 存档续玩:重载后 board/queue/ammo(${after.ammo})/分数(${after.score})/最深(${after.maxTile})/发数(${after.shots}) 全部原样恢复`);
    console.log(`OK 图鉴跨 reload 存活:${cxAfter} 条解锁,seen 集一致`);

    // 重开
    await page.evaluate(() => { G.save.stats.runsSinceAd = 0; dispatch('RESTART', {}); });
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
