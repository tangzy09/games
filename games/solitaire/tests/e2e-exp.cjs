// e2e-exp.cjs — 体验包：提示可视化 / 稳赢一键走完 / 减弱动态 / 拖拽吸附 / 每日日历。
//
// ⚠ 为什么值得一个专门的 E2E：这批功能修的是「按了没反应」级别的体验坑 ——
//   提示按钮此前**扣了统计却什么都不画**（哑按钮），测试必须钉死「点了提示看得见东西」。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8168, SHOT='C:/tmp/solitaire';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
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

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.evaluate(()=>{ if(G.phase==='INTRO') dispatch('INTRO_GO'); });
  await page.waitForTimeout(120);

  // ── ① 提示：点了必须看得见东西（此前是哑按钮：扣了统计、什么都不画）──
  await page.evaluate(()=>{   // 保证有非翻牌的可走步（没有就翻几张）
    let guard=0;
    while(guard++<30 && !RulesK.legalMoves(G.s).some(m=>m.t!=='draw'&&m.t!=='recycle'))
      dispatch('STOCK');
  });
  ok(await click(page,'HINT'), '提示按钮可点');
  await page.waitForTimeout(150);
  const hint=await page.evaluate(()=>({m:G.hintMove,used:G.s.usedHint}));
  ok(hint.m!=null&&hint.m.t, `⭐ 提示画出来了（${hint.m&&hint.m.t}）——不再是哑按钮`);
  ok(hint.used===true, '用了提示有留痕（零提示口径不被架空）');
  await page.screenshot({path:path.join(SHOT,'p10-01-hint.png')});

  // ── ② 稳赢一键走完：全明牌 + 牌堆空 ⇒ ✨按钮 ⇒ solver 播完 ⇒ 赢 + 瀑布 ──
  await page.evaluate(()=>{
    const s=Core.newGame(7,3);
    s.stock=[]; s.waste=[]; s.moves=[];
    s.foundations=[0,1,2,3].map(fi=>Array.from({length:12},(_,r)=>r*4+fi)); // A..Q 全收
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    [0,1,2,3].forEach(fi=>{ s.tableau[fi]={cards:[12*4+fi],up:1}; });        // 4 张 K 明牌
    G.s=s; G.sel=null; Prover.reset(); renderAll();
  });
  ok(await click(page,'FINISH'), '⭐ 「自动走完」按钮出现且可点');
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>G.s.won===true), '⭐ solver 把剩下的牌走完了——不用手磨');
  ok(await page.evaluate(()=>FX.busy()), '赢局接瀑布（默认动态开）');
  await page.evaluate(()=>FX.skip());

  // ── ③ 减弱动态：开了之后赢局不放瀑布，直接进结算 ──
  await page.evaluate(()=>dispatch('TOG_RFX'));
  ok(await page.evaluate(()=>G.reduceFx===true), '减弱动态开关生效');
  await page.evaluate(()=>{
    const s=Core.newGame(8,3);
    s.stock=[]; s.waste=[]; s.moves=[];
    s.foundations=[0,1,2,3].map(fi=>Array.from({length:12},(_,r)=>r*4+fi));
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    [0,1,2,3].forEach(fi=>{ s.tableau[fi]={cards:[12*4+fi],up:1}; });
    G.s=s; G.sel=null; Prover.reset(); renderAll();
  });
  await click(page,'FINISH');
  await page.waitForTimeout(300);
  ok(await page.evaluate(()=>G.s.won===true&&!FX.busy()),
     '⭐ 减弱动态：跳过瀑布/滑牌，直接结算（晕动症用户）');
  await page.screenshot({path:path.join(SHOT,'p10-02-reducefx-win.png')});
  await page.evaluate(()=>dispatch('TOG_RFX'));   // 关回去

  // ── ④ 拖拽吸附：松手点落在列缝里，也吸到最近的合法落点 ──
  await page.evaluate(()=>{
    const s=Core.newGame(9,3);
    s.stock=[]; s.moves=[];
    s.waste=[5*4+1];                                   // 6♥
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    s.tableau[2]={cards:[6*4+0],up:1};                 // 7♠
    G.s=s; G.sel=null; Prover.reset(); renderAll();
  });
  const drag=await page.evaluate(()=>{
    const c=document.getElementById('game-canvas').getBoundingClientRect();
    const sx=c.width/GameGlobal.SW, sy=c.height/GameGlobal.SH;
    const from=Layout.cardXY(G.s,{p:'w'});
    const L=Layout.L;
    return { fx:c.left+(from.x+L.cardW/2)*sx, fy:c.top+(from.y+L.cardH/2)*sy,
             // 松手点故意偏出 7♠ 那列大半张牌宽（落在隔壁空列/缝隙里）
             tx:c.left+(L.colX(2)+L.cardW*1.55)*sx, ty:c.top+(L.tabY+L.cardH*0.4)*sy };
  });
  await page.mouse.move(drag.fx,drag.fy);
  await page.mouse.down();
  for(let i=1;i<=8;i++) await page.mouse.move(drag.fx+(drag.tx-drag.fx)*i/8, drag.fy+(drag.ty-drag.fy)*i/8);
  await page.mouse.up();
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>G.s.waste.length===0&&G.s.tableau[2].cards.length===2),
     '⭐ 拖歪了也吸附到 7♠（手抖用户拖不准——吸附只认合法落点）');

  // ── ⑤ 撤销反滑（⚠ 必须用**真实对局**：撤销=按 seed 重放，手搓盘面天然不可撤销）──
  await page.evaluate(()=>dispatch('NEW'));
  await page.waitForTimeout(150);
  await click(page,'STOCK');                       // 翻一次牌
  await page.waitForTimeout(150);
  const w1=await page.evaluate(()=>G.s.waste.length);
  await page.evaluate(()=>dispatch('UNDO'));
  await page.waitForTimeout(250);
  ok(w1>0 && await page.evaluate(()=>G.s.waste.length===0), '撤销复原（反向滑牌不报错）');

  // ── ⑥ 每日日历渲染（有完成记录时）──
  await page.evaluate(()=>{
    const d=new Date();
    G.dailyHist={}; G.dailyHist[''+d.getFullYear()+(d.getMonth()+1)+d.getDate()]=1;
    dispatch('MENU');
  });
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(SHOT,'p10-03-menu-calendar.png')});

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 体验包 E2E 有失败项':'\nOK 体验包 E2E 全绿');
})();
