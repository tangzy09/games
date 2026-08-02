// e2e-freecell.cjs — FreeCell（P4）：真实点击，含 free cell 交互 + 模式切换 + supermove。
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
// ⚠ 正斜杠：反斜杠路径经 shell heredoc 会被吃掉一层（'C:	mp' 里的 	 变成 tab）
const ROOT = path.resolve(__dirname, '../../..'), PORT = 8163, SHOT = 'C:/tmp/solitaire';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json' };
function serve(){return new Promise((res,rej)=>{const srv=http.createServer((q,r)=>{
  let p=decodeURIComponent(q.url.split('?')[0]); if(p.endsWith('/'))p+='index.html';
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(r);});
  srv.on('error',e=>rej(e)); srv.listen(PORT,()=>res(srv));});}
const ok=(c,m)=>{if(!c){console.error('✗ '+m);process.exitCode=1;}else console.log('✓ '+m);};

async function clickAction(page, action, dataMatch) {
  const box = await page.evaluate(({a,dm}) => {
    let hs = hitAreas.filter(x => x.action === a);
    if (dm) hs = hs.filter(x => Object.entries(dm).every(([k,v]) => x.data[k] === v));
    const h = hs.pop(); if (!h) return null;
    const c = document.getElementById('game-canvas').getBoundingClientRect();
    const sx = c.width/GameGlobal.SW, sy = c.height/GameGlobal.SH;
    return { x: c.left+(h.x+h.w/2)*sx, y: c.top+(h.y+h.h/2)*sy };
  }, {a:action, dm:dataMatch});
  if (!box) return false;
  await page.mouse.click(box.x, box.y);
  return true;
}

(async () => {
  fs.mkdirSync(SHOT,{recursive:true});
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport:{width:414,height:896} });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(() => window.G && window.G.s);
  // 首启一屏（4.3(a) 防线）会挡住一切 —— 测试里先跳过它
  await page.evaluate(() => { if (G.phase === 'INTRO') dispatch('INTRO_GO'); });
  await page.waitForTimeout(80);

  // ── 切到 FreeCell（真实点按钮）──
  // ⭐ 2026-08-01 起玩法是**三选一直选**（主界面主按钮上方那一行，菜单里也有一份）：
  //   点哪个是哪个，不再是「一个 chip 轮转」——旧写法的标签在三个玩法上必然撒谎。
  await clickAction(page,'HOME'); await page.waitForTimeout(250);
  ok(await clickAction(page,'MODE_SET',{m:'freecell'}), '主界面「FreeCell」可直选');
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({ mode:G.s.mode, seed:G.s.seed, cols:G.s.tableau.length,
    free:G.s.free.length, down:G.s.tableau.reduce((n,c)=>n+(c.cards.length-c.up),0) }));
  ok(st.mode === 'freecell', `切到 FreeCell（局号 #${st.seed}）`);
  ok(st.cols === 8, '8 列');
  ok(st.free === 4, '4 个 free cell');
  ok(st.down === 0, '⭐ 全明牌，一张暗牌都没有');
  ok(st.seed >= 1 && st.seed <= 32000, `局号在微软的 1..32000 区间内（#${st.seed}）`);
  await page.screenshot({ path: path.join(SHOT,'p4-01-freecell.png') });

  // ── ⭐ 把一张牌拖进 free cell（点选顶牌 → 点空格子）──
  const before = await page.evaluate(() => G.s.free.filter(x=>x!=null).length);
  const col0Top = await page.evaluate(() => {
    const c = G.s.tableau[0];
    return { ti:0, idx:c.cards.length-1 };
  });
  await clickAction(page,'TAB',{ti:col0Top.ti, idx:col0Top.idx});   // 拿起列0顶牌
  await page.waitForTimeout(80);
  await clickAction(page,'CELL',{ci:0});                            // 放进 0 号格子
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => ({ n:G.s.free.filter(x=>x!=null).length, moves:G.s.moves.length }));
  ok(after.n === before+1 || after.moves > 0, `⭐ 牌能放进 free cell（占用 ${after.n} 个格子）`);
  await page.screenshot({ path: path.join(SHOT,'p4-02-cell-used.png') });

  // ── 撤销把它拿回来 ──
  await clickAction(page,'UNDO');
  await page.waitForTimeout(120);
  ok(await page.evaluate(() => G.s.free.every(x=>x==null)), '撤销 ⇒ free cell 空回来');

  // ── 「这局还有解吗」在 FreeCell 上也要能跑（worker 要能加载 rules-freecell.js）──
  ok(await clickAction(page,'PROVE'), 'FreeCell 也能问「还有解吗」');
  await page.waitForFunction(() => Prover.st.phase==='done', null, {timeout:40000});
  const v = await page.evaluate(() => ({...Prover.st}));
  ok(v.result === 'solvable',
    `⭐ FreeCell 开局 → 「${v.result}」（微软 32000 局里只有 #11982 无解 ⇒ 几乎必然 solvable，${v.ms}ms）`);
  await page.screenshot({ path: path.join(SHOT,'p4-03-freecell-solvable.png') });

  // ── 直选 Spider，再直选回 Klondike（⛔ 标签写什么就必须去哪：这条钉的正是旧 bug）──
  await clickAction(page,'HOME'); await page.waitForTimeout(250);
  await clickAction(page,'MODE_SET',{m:'spider'}); await page.waitForTimeout(250);
  ok(await page.evaluate(() => G.s.mode==='spider'), '点「Spider」就去 Spider');
  await clickAction(page,'HOME'); await page.waitForTimeout(250);
  await clickAction(page,'MODE_SET',{m:'klondike'}); await page.waitForTimeout(250);
  ok(await page.evaluate(() => G.s.mode==='klondike' && G.s.tableau.length===7), '点「Klondike」就去 Klondike（7 列）');
  // ⛔ 菜单里那一份也必须是直选（两处共用同一个 modeRow）
  await clickAction(page,'HOME'); await page.waitForTimeout(250);   // ⚠ MENU 入口在 HOME 底栏，不在牌桌上
  await clickAction(page,'MENU'); await page.waitForTimeout(200);
  const menuModes = await page.evaluate(() => hitAreas.filter(h => h.action === 'MODE_SET').map(h => h.data.m).sort());
  ok(JSON.stringify(menuModes) === JSON.stringify(['freecell','spider']),
     '菜单里也是三选一（当前项不可点）：' + menuModes.join('/'));

  // ── ⭐ 音效：FreeCell 的三类动作都要有声（进自由格是「架起来」，不是落桌）──
  const snd = await page.evaluate(() => {
    const hit = {};
    ['cell','place','found','combo','run'].forEach(k => { Snd[k] = function(){ hit[k]=(hit[k]||0)+1; }; });
    G.stage = 1; newGame(undefined, 'freecell'); G.phase = 'PLAY';
    const ms = Core.rules(G.s).legalMoves(G.s);
    const tc = ms.find(m => m.t === 'tc');            // 牌 → 自由格
    if (tc) doMove(tc);
    // ⚠ 别假定「刚放进格子的牌一定能回到某一列」（常常无处可放）——
    //   要验的是「非自由格动作照常有落牌声」，那就找**任何**非 tc 的合法着法。
    const other = Core.rules(G.s).legalMoves(G.s).find(m => m.t !== 'tc');
    if (other) doMove(other);
    return Object.assign(hit, { other: other && other.t });
  });
  ok(snd.cell >= 1, '⭐ 牌进自由格有专属音效');
  ok((snd.place || 0) + (snd.run || 0) >= 1, '自由格出牌/搬牌照常有落牌声');

  ok(errs.length===0, '全程零 error' + (errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\n✗ FreeCell E2E 有失败项' : '\n✓ FreeCell E2E 全绿');
})();
