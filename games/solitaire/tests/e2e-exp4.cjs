// e2e-exp4.cjs — 四期（竞品对标）：新 HUD 布局 / Stage 连关×倍率 / 每日锦标赛 / 等级+头像 / Joker 弹窗关闭。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8173, SHOT='C:/tmp/solitaire';
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
const winState=(seed)=>`(()=>{ const s=Core.newGame(${seed},3);
  s.stock=[]; s.waste=[]; s.moves=[];
  s.foundations=[0,1,2,3].map(fi=>Array.from({length:12},(_,r)=>r*4+fi));
  s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
  [0,1,2,3].forEach(fi=>{ s.tableau[fi]={cards:[12*4+fi],up:1}; });
  G.s=s; G.sel=null; G.phase='PLAY'; Prover.reset(); FX.reset(); renderAll(); })()`;

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
  await page.waitForTimeout(400);

  // ── ① 新 HUD:三图标钮 + 居中分数胶囊(FAIR) + 四大圆钮 ──
  const hud=await page.evaluate(()=>({acts:[...new Set(hitAreas.map(h=>h.action))]}));
  for (const a of ['MENU','SET','SHOP','FAIR','HINT','AUTO','NEW'])
    ok(hud.acts.includes(a), `HUD/工具条含 ${a} 入口`);
  ok(!hud.acts.includes('MODE'), 'MODE 已移出工具条(菜单 chip)');
  ok(!hud.acts.includes('UNDO'), '0 步时撤销禁用(不注册 hit)');
  await click(page,'STOCK');
  await page.waitForTimeout(250);
  ok(await page.evaluate(()=>hitAreas.some(h=>h.action==='UNDO')), '有步之后撤销圆钮亮起');
  await page.screenshot({path:path.join(SHOT,'p15-01-new-layout.png')});

  // ── ② Stage 连关:赢 → 下一关 ×2 → 累计分 ──
  await page.evaluate(()=>dispatch('TOG_RFX'));
  await page.evaluate(winState(7));
  await click(page,'FINISH');
  await page.waitForTimeout(400);
  const s1=await page.evaluate(()=>({run:G.runScore,last:G.lastStageScore,stage:G.stage,
    day:G.dayScore,xp:G.xp}));
  ok(s1.stage===1&&s1.last>0&&s1.run===s1.last, `⭐ 第 1 关结算(得分 ${s1.last},×1)`);
  ok(s1.day>=s1.last&&s1.xp>=s1.last, '锦标赛当日分 + XP 同步累计');
  await page.screenshot({path:path.join(SHOT,'p15-02-win-nextstage.png')});
  ok(await click(page,'NEXT_STAGE'), '⭐ 赢局屏有「下一关」主按钮');
  await page.waitForTimeout(300);
  ok(await page.evaluate(()=>G.stage===2&&G.runScore>0), '进入第 2 关,本轮累计保留');
  await page.evaluate(winState(8));
  await page.evaluate(()=>{ G.stage=2; });                 // winState 重置了 s,但 stage 保留在 G
  await click(page,'FINISH');
  await page.waitForTimeout(400);
  const s2=await page.evaluate(()=>({last:G.lastStageScore, sc:G.s.score}));
  ok(s2.last===s2.sc*2, `⭐ 第 2 关倍率 ×2 生效（${s2.sc} → ${s2.last}）`);
  await page.evaluate(()=>dispatch('NEW'));
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>G.stage===1&&G.runScore===0), '重开新局 = 连关归零');

  // ── ③ 每日锦标赛:确定性对手场 + 排名爬升 + 菜单卡片 ──
  const tour=await page.evaluate(()=>{
    const f1=JSON.stringify(tourField().slice(0,3));
    const f2=JSON.stringify(tourField().slice(0,3));
    const r0=tourRank().rank;
    G.dayScore=(tourField()[9].score+1);                   // 假设冲到第 10 名之上
    const r1=tourRank().rank;
    return { same:f1===f2, r0, r1 };
  });
  ok(tour.same, '对手场按日期确定(同一天全球同一场)');
  ok(tour.r1<tour.r0&&tour.r1<=10, `⭐ 分数上去名次就爬(${tour.r0} → ${tour.r1})`);
  await page.evaluate(()=>dispatch('MENU'));
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>hitAreas.some(h=>h.action==='DAILY')), '菜单锦标赛卡可点(进每日)');
  await page.screenshot({path:path.join(SHOT,'p15-03-menu-tournament.png')});

  // ── ④ 等级/称号 + 头像 ──
  const lv=await page.evaluate(()=>({l0:levelOf(0),l1:levelOf(299),l2:levelOf(300),big:levelOf(200000)}));
  ok(lv.l0===1&&lv.l1===1&&lv.l2===2&&lv.big>5, `等级曲线(0→Lv1, 300→Lv2, 20万→Lv${lv.big}）`);
  await page.evaluate(()=>{ G.angels=3; dispatch('GALLERY'); });
  await page.waitForTimeout(150);
  await click(page,'GAL_VIEW',{i:0});
  await page.waitForTimeout(150);
  ok(await click(page,'SET_AVA'), '⭐ 图鉴大图可「设为头像」');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>!!G.avatarFile), '头像已设(菜单档案头显示天使)');

  // ── ⑤ Joker 弹窗可关掉继续自己找 ──
  await page.evaluate(()=>{ dispatch('PLAY'); G.jokerOffer=Date.now()+8000; renderAll(); });
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(SHOT,'p15-04-joker-modal.png')});
  ok(await page.evaluate(()=>hitAreas.some(h=>h.action==='JOKER_AD')), 'Joker 弹窗(照竞品)出现');
  ok(await click(page,'JOKER_DISMISS'), '「再找找」可关掉');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.jokerOffer===0), '弹窗关闭,不纠缠');

  // ── ⑥ 持久化:stage/xp/头像/当日分 ──
  await page.reload();
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.waitForTimeout(300);
  ok(await page.evaluate(()=>G.xp>0&&!!G.avatarFile&&G.dayScore>0), '连关外的进度全部持久化');

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 四期 E2E 有失败项':'\nOK 四期 E2E 全绿');
})();
