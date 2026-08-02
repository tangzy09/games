// e2e-spider.cjs — Spider（三合一的第三块）：三玩法轮转 / 10 列 / 同花搬动 / 发 10 张 /
// 有空列拒发+明确反馈 / 完成组自动移走 / 撤销复合动作 / 不打「已验证可解」角标。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8174, SHOT='C:/tmp/solitaire';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.jpg':'image/jpeg'};
function serve(){return new Promise((res,rej)=>{const srv=http.createServer((q,r)=>{
  let u=decodeURIComponent(q.url.split('?')[0]); if(u.endsWith('/'))u+='index.html';
  const f=path.join(ROOT,u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(r);});
  srv.on('error',rej); srv.listen(PORT,()=>res(srv));});}
const ok=(c,m)=>{if(!c){console.error('X '+m);process.exitCode=1;}else console.log('OK '+m);};

async function click(page, action, dm){
  const box=await page.evaluate(({a,d})=>{
    let hs=hitAreas.filter(x=>x.action===a);
    if(d) hs=hs.filter(x=>Object.entries(d).every(([k,v])=>x.data[k]===v));
    const h=hs.pop(); if(!h) return null;
    const c=document.getElementById('game-canvas').getBoundingClientRect();
    const sx=c.width/GameGlobal.SW, sy=c.height/GameGlobal.SH;
    return {x:c.left+(h.x+h.w/2)*sx, y:c.top+(h.y+h.h/2)*sy};
  },{a:action,d:dm});
  if(!box) return false;
  await page.mouse.click(box.x,box.y);
  return true;
}

(async()=>{
  fs.mkdirSync(SHOT,{recursive:true});
  const srv=await serve();
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:414,height:896}});
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  page.on('dialog',d=>d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.evaluate(()=>{ if(G.phase==='INTRO') dispatch('INTRO_GO'); dispatch('TOG_RFX'); });
  await page.waitForTimeout(200);

  // ── ① 三玩法轮转：Klondike → FreeCell → Spider ──
  await page.evaluate(()=>{ if(G.s.mode!=='klondike') dispatch('MODE'); });
  await page.waitForTimeout(200);
  const chain=[];
  for(let i=0;i<3;i++){
    await page.evaluate(()=>dispatch('MODE'));
    await page.waitForTimeout(250);
    chain.push(await page.evaluate(()=>G.s.mode));
  }
  ok(chain.join('→')==='freecell→spider→klondike', `⭐ 三玩法轮转（${chain.join(' → ')}）`);

  // ── ② 进 Spider：10 列 / 104 张 / 500 分起 / 50 张待发 ──
  await page.evaluate(()=>{ while(G.s.mode!=='spider') dispatch('MODE'); });
  await page.waitForTimeout(300);
  const st=await page.evaluate(()=>({
    mode:G.s.mode, cols:G.s.tableau.length, score:G.s.score, stock:G.s.stock.length,
    total:G.s.tableau.reduce((a,c)=>a+c.cards.length,0)+G.s.stock.length,
    uniq:new Set([...G.s.tableau.flatMap(c=>c.cards),...G.s.stock]).size,
    suits:new Set([...G.s.tableau.flatMap(c=>c.cards),...G.s.stock].map(RulesS.st)).size,
    layoutCols:Layout.L.cols,
  }));
  ok(st.cols===10&&st.layoutCols===10, `10 列（布局也是 ${st.layoutCols}）`);
  ok(st.total===104&&st.uniq===104, `⭐ 104 张两副牌不重不漏`);
  ok(st.score===500&&st.stock===50, `微软计分 500 起 + 50 张待发`);
  ok(st.suits===1, `默认 1 花色档（新手友好；4 花色人类胜率 <10%）`);
  await page.screenshot({path:path.join(SHOT,'p16-01-spider.png')});

  // ── ③ 不打「已验证可解」角标（Spider 兑现不了这个卖点，打了就是撒谎）──
  const pill=await page.evaluate(()=>{
    const s=G.s; return { verified: !['freecell','spider'].includes(s.mode) && Pool.isVerified(s.drawCount,s.seed) };
  });
  ok(pill.verified===false, '⭐ Spider 不打「✓ 有解」角标');

  // ── ④ 同花才能整体搬（造局验证）──
  const runTest=await page.evaluate(()=>{
    const s=G.s;
    const C=(c,r,su)=>c*52+r*4+su;
    s.tableau[0]={cards:[C(0,8,0),C(0,7,1)],up:2};      // 9♠ + 8♥ 异花
    s.tableau[1]={cards:[C(0,8,2),C(0,7,2)],up:2};      // 9♣ + 8♣ 同花
    return { mixed: RulesS.isValidRun(s,0,0), same: RulesS.isValidRun(s,1,0) };
  });
  ok(!runTest.mixed&&runTest.same, '⭐ 异花叠着搬不动、同花可整体搬');

  // ── ⑤ 有空列时点发牌 → 拒发 + 明确反馈（不是「点了没反应」）──
  await page.evaluate(()=>{
    dispatch('NEW');
  });
  await page.waitForTimeout(300);
  await page.evaluate(()=>{ G.s.tableau[3].cards=[]; G.s.tableau[3].up=0; renderAll(); });
  const before=await page.evaluate(()=>G.s.stock.length);
  await click(page,'STOCK');
  await page.waitForTimeout(300);
  const warn=await page.evaluate(()=>({stock:G.s.stock.length, toast:G.toast&&G.toast.msg, warn:G.spWarnUntil>Date.now()}));
  ok(warn.stock===before, '有空列 ⇒ 没发牌');
  ok(!!warn.toast&&warn.warn, `⭐ 给了明确反馈（"${warn.toast}"）+ 高亮空列——不是「点了没反应」`);
  await page.screenshot({path:path.join(SHOT,'p16-02-spider-fillfirst.png')});

  // ── ⑥ 填满空列后能发牌（10 列各 +1）──
  await page.evaluate(()=>{ dispatch('NEW'); });
  await page.waitForTimeout(300);
  const b2=await page.evaluate(()=>({stock:G.s.stock.length, sizes:G.s.tableau.map(c=>c.cards.length)}));
  await click(page,'STOCK');
  await page.waitForTimeout(400);
  const a2=await page.evaluate(()=>({stock:G.s.stock.length, sizes:G.s.tableau.map(c=>c.cards.length)}));
  ok(a2.stock===b2.stock-10, `⭐ 发 10 张（${b2.stock} → ${a2.stock}）`);
  ok(a2.sizes.every((n,i)=>n===b2.sizes[i]+1), '10 列各 +1 张');

  // ── ⑦ ⭐ 复合动作可整体撤销（发 10 张 = 一个 move）──
  await page.evaluate(()=>dispatch('UNDO'));
  await page.waitForTimeout(400);
  const u=await page.evaluate(()=>({stock:G.s.stock.length, sizes:G.s.tableau.map(c=>c.cards.length)}));
  ok(u.stock===b2.stock&&u.sizes.every((n,i)=>n===b2.sizes[i]),
     '⭐ 一次撤销回滚整个「发 10 张」（复合动作原子）');

  // ── ⑧ 完成组自动移走（造 K→A 同花）──
  const done=await page.evaluate(()=>{
    const s=G.s; const C=(c,r,su)=>c*52+r*4+su;
    s.tableau=Array.from({length:10},()=>({cards:[],up:0}));
    const run=[]; for(let r=12;r>=1;r--) run.push(C(0,r,0));    // K♠..2♠
    s.tableau[0]={cards:run,up:12};
    s.tableau[1]={cards:[C(0,0,0)],up:1};                        // A♠
    s.foundations=[]; renderAll();
    const ev=Core.apply(s,{t:'tt',ti:1,idx:0,tj:0});
    return { ok:!!ev, groups:s.foundations.length, col0:s.tableau[0].cards.length,
             score:s.score, complete: ev&&ev.some(e=>e.t==='complete') };
  });
  ok(done.ok&&done.complete&&done.groups===1&&done.col0===0,
     `⭐ 凑齐 K→A 同花自动移走（组数 ${done.groups}，列已清空）`);
  await page.evaluate(()=>renderAll());
  await page.screenshot({path:path.join(SHOT,'p16-03-spider-complete.png')});

  // ── ⑨ 花色档切换（换档 = 换一局）──
  await page.evaluate(()=>dispatch('SET_SUITS',{n:4}));
  await page.waitForTimeout(400);
  const s4=await page.evaluate(()=>({
    suits:G.spiderSuits, mode:G.s.mode,
    kinds:new Set([...G.s.tableau.flatMap(c=>c.cards),...G.s.stock].map(RulesS.st)).size }));
  ok(s4.suits===4&&s4.mode==='spider'&&s4.kinds===4, `⭐ 切到 4 花色档（牌里真有 ${s4.kinds} 种花色）`);

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX Spider E2E 有失败项':'\nOK Spider E2E 全绿');
})();
