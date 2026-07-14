// e2e-slide.cjs — 滑牌动画（牌不再瞬移）。
//
// ⚠ 这个动画有一个**会让牌永久消失**的失败模式：动画期间，正在滑的牌在目标位置
//   被 render **跳过不画**（否则会同时出现在两处）。如果 slide 没能正确结束，
//   那张牌就再也不会被画出来了 —— 盘面上凭空少一张牌，而且**不报任何错**。
//   ⇒ 必须测：动画跑完后 52 张牌一张不少。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8167, SHOT='C:/tmp/solitaire';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
function serve(){return new Promise((res,rej)=>{const srv=http.createServer((q,r)=>{
  let u=decodeURIComponent(q.url.split('?')[0]); if(u.endsWith('/'))u+='index.html';
  const f=path.join(ROOT,u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(r);});
  srv.on('error',rej); srv.listen(PORT,()=>res(srv));});}
const ok=(c,m)=>{if(!c){console.error('X '+m);process.exitCode=1;}else console.log('OK '+m);};

(async()=>{
  fs.mkdirSync(SHOT,{recursive:true});
  const srv=await serve();
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:414,height:896}});
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.evaluate(()=>{ if(G.phase==='INTRO') dispatch('INTRO_GO'); });
  await page.waitForTimeout(80);

  // 走一步合法棋 -> 动画必须启动
  const started = await page.evaluate(()=>{
    const m = RulesK.legalMoves(G.s).find(x=>x.t==='draw');
    doMove(m);
    return FX.busy();
  });
  ok(started, '走一步 -> 滑牌动画启动了（牌不再瞬移）');
  await page.screenshot({path:path.join(SHOT,'p9-01-sliding.png')});   // 抓运动中的一帧

  await page.waitForFunction(()=>!FX.busy(), null, {timeout:5000});
  ok(true, '动画会正常结束（不会卡住）');

  // ⭐ 52 张牌一张不少（滑牌期间目标位置不画 -> 没结束干净就会凭空少牌）
  const count = await page.evaluate(()=>{
    const s=G.s;
    const all=[...s.tableau.flatMap(c=>c.cards), ...s.stock, ...s.waste,
               ...s.foundations.flat(), ...(s.free||[]).filter(x=>x!=null)];
    return { n: all.length, uniq: new Set(all).size, stillFlying: [...Array(52).keys()].filter(i=>FX.isFlying(i)).length };
  });
  ok(count.n===52 && count.uniq===52, `⭐ 52 张牌一张不少（${count.n} 张，去重后 ${count.uniq}）`);
  ok(count.stillFlying===0, '⭐ 动画结束后没有牌还卡在「飞行中」（卡住 = 那张牌永久看不见）');

  // 连续快速走多步（玩家点得飞快）—— 仍然不能丢牌
  await page.evaluate(async ()=>{
    for (let i=0;i<12;i++){
      const ms = RulesK.legalMoves(G.s).filter(m=>m.t!=='recycle');
      if(!ms.length) break;
      doMove(ms[0]);
      await new Promise(r=>setTimeout(r, 25));   // 比动画(130ms)快得多 —— 故意打断
    }
  });
  await page.waitForFunction(()=>!FX.busy(), null, {timeout:8000});
  const c2 = await page.evaluate(()=>{
    const s=G.s;
    const all=[...s.tableau.flatMap(c=>c.cards), ...s.stock, ...s.waste,
               ...s.foundations.flat(), ...(s.free||[]).filter(x=>x!=null)];
    return { n:new Set(all).size, flying: [...Array(52).keys()].filter(i=>FX.isFlying(i)).length };
  });
  ok(c2.n===52 && c2.flying===0,
    `⭐ **狂点 12 步、每步都打断上一个动画** -> 仍然 52 张不少、0 张卡飞行（${c2.n}/${c2.flying}）`);
  await page.screenshot({path:path.join(SHOT,'p9-02-after-rush.png')});

  // autoplay 的一串收牌（错开滑）
  await page.evaluate(()=>dispatch('AUTO'));
  await page.waitForTimeout(1200);
  await page.waitForFunction(()=>!FX.busy(), null, {timeout:8000});
  const c3 = await page.evaluate(()=>{
    const s=G.s;
    const all=[...s.tableau.flatMap(c=>c.cards), ...s.stock, ...s.waste, ...s.foundations.flat()];
    return { n:new Set(all).size, flying:[...Array(52).keys()].filter(i=>FX.isFlying(i)).length };
  });
  ok(c3.n===52 && c3.flying===0, `autoplay 连收后仍 52 张不少（${c3.n}/${c3.flying}）`);

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 滑牌 E2E 有失败项':'\nOK 滑牌 E2E 全绿');
})();
