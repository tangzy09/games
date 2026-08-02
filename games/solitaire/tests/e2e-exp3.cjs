// e2e-exp3.cjs — 三期：单击自动走牌 / 连击音效计数 / 提示自动翻牌 / 🃏 万能牌 / 过场+发牌动画 / 预设对手榜。
//
// ⚠ 红线口径（写这份测试时再确认一遍）：提示/撤销/证明永远免费；
//   🃏 是「真卡死」时的**救场**（与 snake 的 AI 救场同类），用过不算干净赢。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8172, SHOT='C:/tmp/solitaire';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp'};
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
  page.on('dialog', d => d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.evaluate(()=>{ if(G.phase==='INTRO') dispatch('INTRO_GO'); });
  await page.waitForTimeout(150);

  // ── ① 单击 = 直接自动走牌（Klondike;不再需要第二次点击）──
  await page.evaluate(()=>{
    const s=Core.newGame(41,3);
    s.stock=[]; s.moves=[]; s.waste=[5*4+1];               // 6♥
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    s.tableau[2]={cards:[6*4+0],up:1};                     // 7♠
    G.s=s; G.sel=null; Prover.reset(); FX.reset(); renderAll();
  });
  ok(await click(page,'WASTE'), 'waste 顶牌可点');
  await page.waitForTimeout(250);
  ok(await page.evaluate(()=>G.s.waste.length===0&&G.s.tableau[2].cards.length===2),
     '⭐ 单击一下就走牌（6♥ 直接落到 7♠,不需要第二击）');

  // ── ② 连击：4s 窗口内连续收 foundation ⇒ comboN 递增（音效走 Snd.combo）──
  await page.evaluate(()=>{
    const s=Core.newGame(42,3);
    s.stock=[]; s.moves=[]; s.waste=[];
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    s.foundations=[[],[],[],[]];
    s.tableau[0]={cards:[0*4+0],up:1};                     // A♠
    s.tableau[1]={cards:[0*4+1],up:1};                     // A♥
    G.s=s; G.sel=null; G.comboN=0; G.comboAt=0; Prover.reset(); FX.reset(); renderAll();
  });
  await click(page,'TAB',{ti:0,idx:0});                    // 单击 A♠ → 自动收
  await page.waitForTimeout(200);
  await click(page,'TAB',{ti:1,idx:0});                    // 紧接着 A♥ → 连击 ×2
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>G.comboN===2&&G.s.foundations[0].length+G.s.foundations[1].length===2),
     '⭐ 连击计数 ×2（连续收牌音效上扬 + ×N 浮字）');

  // ── ③ 提示自动翻牌：眼下没有可走步 ⇒ 帮你翻到有为止（要翻多少翻多少）──
  await page.evaluate(()=>{
    const s=Core.newGame(43,3);
    s.moves=[]; s.waste=[];
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    s.tableau[0]={cards:[6*4+0],up:1};                     // 7♠（等一张红 6）
    // 牌堆:6♥ 埋在第 5 张(draw-3 要翻两次才到) —— 注意 draw 是从**末尾** pop
    s.stock=[5*4+1, 9*4+2, 9*4+3, 2*4+2, 2*4+3, 3*4+2];
    G.s=s; G.sel=null; Prover.reset(); FX.reset(); renderAll();
  });
  ok(await click(page,'HINT'), '提示可点');
  await page.waitForTimeout(300);
  const h3=await page.evaluate(()=>({draws:G.s.moves.filter(m=>m.t==='draw').length,
    hint:G.hintMove&&G.hintMove.t, wt:G.s.waste[G.s.waste.length-1]===5*4+1}));
  ok(h3.draws>=2&&h3.hint==='wt'&&h3.wt,
     `⭐ 提示自动翻了 ${h3.draws} 次牌,翻出 6♥ 并指给你看（wt）`);

  // ── ④ 🃏 万能牌：真卡死 ⇒ 看广告拿 ⇒ 一键召唤最缺的牌 ⇒ 不算干净赢 ──
  await page.evaluate(()=>{
    // 死局形状:牌堆翻穿也无步(黑 8 等黑 9 之类凑不上)
    const s=Core.newGame(44,3);
    s.moves=[]; s.waste=[];
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    s.tableau[0]={cards:[0*4+0, 7*4+0],up:1};              // A♠ 压着 8♠(明)
    s.stock=[7*4+2];                                       // 8♣:无处可去
    G.s=s; G.sel=null; Prover.reset(); FX.reset(); renderAll();
  });
  await click(page,'HINT');                                // 翻穿一圈也没步 ⇒ 点亮 🃏 入口
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>G.jokerOffer>Date.now()), '真卡死 ⇒ 🃏 入口点亮');
  ok(await click(page,'JOKER_AD'), '⭐ 「看广告拿万能牌」可点');
  await page.waitForTimeout(500);
  // ⭐ 2026-08-01 再加厚：一次**拉满 3 张** + 附送 30 秒透视（只给两张牌照样卡死在原地）
  ok(await page.evaluate(()=>G.jokers===3&&AD_GIVE.joker===3&&G.peekUntil>Date.now()),
     '⭐ 看完广告 🃏 拉满 ×3 且附送透视（救场要真能救回来）');
  ok(await click(page,'JOKER_USE'), '🃏 悬浮按钮可点');
  await page.waitForTimeout(250);
  const jk=await page.evaluate(()=>({f:G.s.foundations.map(f=>f.length).join(''),
    used:G.s.usedJoker, left:G.jokers}));
  ok(jk.f!=='0000'&&jk.used&&jk.left===2,
     `⭐ 万能牌召唤真牌进 foundation（${jk.f}）,留痕不算干净赢（用掉 1 张，还剩 ${jk.left}）`);

  // ── ⑤ 过场 + 发牌动画：切屏有淡出;发牌飞入期间**输入不上锁** ──
  await page.evaluate(()=>dispatch('MENU'));
  ok(await page.evaluate(()=>FX.busy()), '⭐ 切屏有过场（旧画面淡出中）');
  await page.waitForTimeout(350);
  await page.evaluate(()=>dispatch('PLAY'));
  await page.waitForTimeout(300);
  await page.evaluate(()=>dispatch('NEW'));                // 触发发牌飞入
  const during=await page.evaluate(()=>FX.busy());
  await click(page,'STOCK');                               // 飞入未结束就点翻牌
  await page.waitForTimeout(400);
  ok(during&&await page.evaluate(()=>G.s.moves.length>=1),
     '⭐ 发牌飞入播放中,点击照样生效（输入只在瀑布时上锁）');

  // ── ⑥ 预设对手榜：seed 确定性（同一局全球同一组分数）──
  const rv=await page.evaluate(()=>({a:JSON.stringify(rivalScores(123)),b:JSON.stringify(rivalScores(123)),
    c:JSON.stringify(rivalScores(124))}));
  ok(rv.a===rv.b&&rv.a!==rv.c, '⭐ 对手分数按 seed 确定（可对榜、不可作弊）');
  // 赢一局看排行榜真的画出来（用截图目检）
  await page.evaluate(()=>dispatch('TOG_RFX'));
  await page.evaluate(()=>{
    const s=Core.newGame(7,3);
    s.stock=[]; s.waste=[]; s.moves=[];
    s.foundations=[0,1,2,3].map(fi=>Array.from({length:12},(_,r)=>r*4+fi));
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    [0,1,2,3].forEach(fi=>{ s.tableau[fi]={cards:[12*4+fi],up:1}; });
    G.s=s; G.sel=null; Prover.reset(); FX.reset(); renderAll();
  });
  await click(page,'FINISH');
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>G.s.won===true), '赢局结算出榜');
  await page.screenshot({path:path.join(SHOT,'p14-01-win-leaderboard.png')});

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 三期 E2E 有失败项':'\nOK 三期 E2E 全绿');
})();
