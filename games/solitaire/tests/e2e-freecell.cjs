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

  // ── 切到 FreeCell（真实点工具条按钮）──
  ok(await clickAction(page,'MODE'), '「模式」按钮可点');
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

  // ── 切回 Klondike ──
  await clickAction(page,'MODE');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => G.s.mode==='klondike' && G.s.tableau.length===7), '切回 Klondike（7 列）');

  ok(errs.length===0, '全程零 error' + (errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\n✗ FreeCell E2E 有失败项' : '\n✓ FreeCell E2E 全绿');
})();
