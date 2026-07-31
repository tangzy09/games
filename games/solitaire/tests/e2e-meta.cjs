// e2e-meta.cjs — 变现/留存包：首 3 局必 easy / 赢局金币×2 / 成就 / 每日连续天数 / 月度奖牌。
//
// ⚠ 红线回归口径不变（e2e-p5p6 已钉死）：这里加的全是**纯增益**（×2 不看也拿基础金币）
//   和**本地元游戏**（成就/奖牌零后端）。任何一步都不许把撤销/提示/证明锁到广告后面。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8169, SHOT='C:/tmp/solitaire';
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
const winState=`(()=>{ const s=Core.newGame(7,3);
  s.stock=[]; s.waste=[]; s.moves=[];
  s.foundations=[0,1,2,3].map(fi=>Array.from({length:12},(_,r)=>r*4+fi));
  s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
  [0,1,2,3].forEach(fi=>{ s.tableau[fi]={cards:[12*4+fi],up:1}; });
  G.s=s; G.sel=null; Prover.reset(); renderAll(); })()`;

(async()=>{
  fs.mkdirSync(SHOT,{recursive:true});
  const srv=await serve();
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:414,height:896}});
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  page.on('dialog', d => d.accept());          // 模拟看广告的 confirm

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.evaluate(()=>{ if(G.phase==='INTRO') dispatch('INTRO_GO'); });
  await page.waitForTimeout(120);

  // ── ① 首 3 局必 easy（新档案:首次会话赢没赢过一局强烈预测 D1）──
  let d1=await page.evaluate(()=>Pool.difficultyOf(G.s.drawCount,G.s.seed));
  ok(d1==='easy', `⭐ 新玩家第 1 局来自 easy 池（difficultyOf=${d1}）`);
  await page.evaluate(()=>dispatch('NEW'));
  await page.waitForTimeout(120);
  d1=await page.evaluate(()=>Pool.difficultyOf(G.s.drawCount,G.s.seed));
  ok(d1==='easy', `第 2 局仍是 easy（played=${await page.evaluate(()=>G.stats.played)}）`);

  // ── ①' 蜜月期：前 30 盘连横幅位都不占；第 31 盘起亮出 ──
  ok(await page.evaluate(()=>G.noAds===true&&Layout.L.bannerH===0),
     '⭐ 蜜月期（前 30 盘）：横幅位都不占（首因效应/评分关键期）');
  await page.evaluate(()=>{ G.stats.played=30; dispatch('NEW'); });
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.noAds===false&&Layout.L.bannerH>0),
     '⭐ 第 31 盘起横幅亮出（主力收入）');
  await page.evaluate(()=>{ G.stats.played=5; });   // 回到蜜月内，后续赢局不受插屏干扰

  // ── ② 赢局「金币 ×2」：纯增益激励位 ──
  await page.evaluate(()=>dispatch('TOG_RFX'));            // 免瀑布,直接见结算
  await page.evaluate(winState);
  await click(page,'FINISH');
  await page.waitForTimeout(400);
  const st1=await page.evaluate(()=>({won:G.s.won,base:G.lastWinCoins,coins:Money.coins,doubled:G.winDoubled}));
  ok(st1.won&&st1.base>0, `赢局结算:基础金币已发（+${st1.base}，不看广告也拿）`);
  await page.screenshot({path:path.join(SHOT,'p11-01-win-x2.png')});
  ok(await click(page,'WIN_X2'), '⭐ 结算屏有「金币 ×2」按钮');
  await page.waitForTimeout(400);
  const st2=await page.evaluate(()=>({coins:Money.coins,doubled:G.winDoubled,btn:hitAreas.some(h=>h.action==='WIN_X2')}));
  ok(st2.doubled&&st2.coins===st1.coins+st1.base, `⭐ 看完广告金币翻倍（${st1.coins} -> ${st2.coins}）`);
  ok(!st2.btn, '翻过就收起按钮（不许重复领）');

  // ── ③ 成就:首胜自动解锁 + 发金币 + 专页可进 ──
  const ach=await page.evaluate(()=>({first:G.ach&&G.ach.firstWin===1,clean:G.ach&&G.ach.clean1===1}));
  ok(ach.first&&ach.clean, '⭐ 首胜/首个干净胜局 两个成就自动解锁（金币已发）');
  await page.evaluate(()=>dispatch('MENU'));
  await page.waitForTimeout(120);
  ok(await click(page,'ACH'), '菜单有「成就」入口');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.phase==='ACH'), '成就页可进');
  await page.screenshot({path:path.join(SHOT,'p11-02-achievements.png')});
  await click(page,'PLAY');

  // ── ④ 每日连续天数:昨天打过 + 今天进每日 ⇒ streak=2（打卡即续,不要求赢）──
  await page.evaluate(()=>{
    const y=new Date(); y.setDate(y.getDate()-1);
    G.dailyHist={}; G.dailyHist[''+y.getFullYear()+(y.getMonth()+1)+y.getDate()]=1;
    dispatch('MENU');
  });
  await page.waitForTimeout(120);
  await click(page,'DAILY');
  await page.waitForTimeout(200);
  const sk=await page.evaluate(()=>({n:dailyStreakDays(),today:G.dailyHist[(d=>''+d.getFullYear()+(d.getMonth()+1)+d.getDate())(new Date())]}));
  ok(sk.today>=1, '进每日 = 打卡（不要求赢）');
  ok(sk.n===2, `⭐ 连续天数 = 2（昨天+今天,断了才归零）`);

  // ── ⑤ 月度奖牌:上月全勤(赢) ⇒ 金牌 ──
  const badge=await page.evaluate(()=>{
    const now=new Date(), prev=new Date(now.getFullYear(),now.getMonth()-1,1);
    const ym=''+prev.getFullYear()+(prev.getMonth()+1);
    const dim=new Date(prev.getFullYear(),prev.getMonth()+1,0).getDate();
    G.dailyHist={};
    for(let d=1;d<=dim;d++) G.dailyHist[ym+d]=2;
    G.badges={};
    settleMonthBadges();
    return G.badges[ym];
  });
  ok(badge==='gold', `⭐ 上月每日全勤 ⇒ 金牌（badge=${badge}）`);

  // ── ⑥ 高级牌背（本机 Flux 插画）：买 → 装备 → 图片真的加载出来 ──
  await page.evaluate(()=>{ Money.state.coins=2000; Money.save(); dispatch('SHOP'); });
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(SHOT,'p11-03-shop-premium.png')});
  ok(await click(page,'PICK_BACK',{id:'koi'}), '高级牌背可点');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>Money.owns('back','koi')&&Money.state.back==='koi'),
     '⭐ 「锦鲤」买下并装备（收集曲线后段）');
  await page.waitForFunction(()=>Sprite.backReady('koi'),{timeout:5000});
  console.log('OK ⭐ 插画牌背图片加载完成（assets/backs/koi.jpg 经 http 真实拉取）');
  // 高级桌布（Flux 材质）：买 → 装备 → 图片就绪 → 全屏背景换材质
  await page.evaluate(()=>dispatch('SHOP_TAB',{t:'table'}));   // 收藏页已分签
  await page.waitForTimeout(100);
  ok(await click(page,'PICK_TABLE',{id:'walnut'}), '高级桌布可点');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>Money.owns('table','walnut')&&Money.state.table==='walnut'),
     '⭐ 「胡桃木」桌布买下并装备');
  await page.waitForFunction(()=>Sprite.tableReady('walnut'),{timeout:5000});
  console.log('OK ⭐ 材质桌布图片加载完成（assets/tables/walnut.jpg）');
  await page.evaluate(()=>dispatch('PLAY'));
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(SHOT,'p11-04-koi-back-table.png')});

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 变现/留存包 E2E 有失败项':'\nOK 变现/留存包 E2E 全绿');
})();
