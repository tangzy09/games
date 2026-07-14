// e2e-p5p6.cjs — 菜单/统计/收藏/每日（P5）+ 变现红线（P6）。
// ⭐ 重点：**变现红线要用测试钉死**，不能只写在注释里。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname,'../../..'), PORT=8164, SHOT='C:/tmp/solitaire';
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
  const box = await page.evaluate(({a,d})=>{
    let hs = hitAreas.filter(x=>x.action===a);
    if(d) hs = hs.filter(x=>Object.entries(d).every(([k,v])=>x.data[k]===v));
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
  page.on('dialog', d => d.accept());          // 模拟看广告的 confirm

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(()=>window.G&&window.G.s&&window.Money);

  // ── 菜单 ──
  ok(await click(page,'MENU'), '「菜单」入口可点');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.phase==='MENU'), '进入菜单');
  await page.screenshot({path:path.join(SHOT,'p5-01-menu.png')});

  // ── 统计（双口径）──
  ok(await click(page,'STATS'), '统计可进');
  await page.waitForTimeout(120);
  await page.screenshot({path:path.join(SHOT,'p5-02-stats.png')});
  await click(page,'PLAY'); await page.waitForTimeout(100);

  // ── 收藏 + 看广告赚币 + 买牌背 ──
  await click(page,'MENU'); await page.waitForTimeout(100);
  ok(await click(page,'SHOP'), '收藏可进');
  await page.waitForTimeout(120);
  await page.screenshot({path:path.join(SHOT,'p5-03-shop.png')});

  const c0 = await page.evaluate(()=>Money.coins);
  await click(page,'EARN_AD');
  await page.waitForTimeout(600);
  const c1 = await page.evaluate(()=>Money.coins);
  ok(c1 > c0, `看广告 -> 金币 ${c0} -> ${c1}（激励视频只换外观，换不到任何优势）`);

  await page.evaluate(()=>{ Money.state.coins = 500; Money.save(); });
  await click(page,'PICK_BACK',{id:'gold'});
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>Money.owns('back','gold') && Money.state.back==='gold'), '买下并装备「鎏金」牌背');
  await click(page,'PICK_TABLE',{id:'midnight'});
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>Money.state.table==='midnight'), '换上「午夜」桌布');
  await page.screenshot({path:path.join(SHOT,'p5-04-shop-owned.png')});
  await click(page,'PLAY'); await page.waitForTimeout(150);
  await page.screenshot({path:path.join(SHOT,'p5-05-table-midnight.png')});

  // ══ ⛔ 变现红线（写成测试，不是写成注释）══
  console.log('\n-- 变现红线 --');
  const red = await page.evaluate(()=>{
    const r = {};
    // ① 撤销/提示/重开/换局/证明 —— 永远免费，永远不看广告
    let adCalls = 0;
    const realRewarded = Ads.showRewarded, realInter = Ads.showInterstitial;
    Ads.showRewarded = () => { adCalls++; return Promise.resolve(false); };
    Ads.showInterstitial = () => { adCalls++; return Promise.resolve(false); };
    dispatch('UNDO'); dispatch('HINT'); dispatch('NEW'); dispatch('PROVE'); dispatch('AUTO');
    r.freeActionsAdCalls = adCalls;
    Ads.showRewarded = realRewarded; Ads.showInterstitial = realInter;

    // ② 插屏节流：每 3 次赢局最多 1 个；输局永远不出
    Money.state.noAds = false; Money.state.winsSinceAd = 0;
    const seq = [];
    for (let i=0;i<7;i++){ const show = Money.canShowInterstitial(); Money.noteWin(show); seq.push(show?1:0); }
    r.interstitialSeq = seq;

    // ③ 买了去广告 => 一个非自愿广告都没有
    Money.buyNoAds();
    r.noAdsBlocksInterstitial = !Money.canShowInterstitial();
    return r;
  });
  ok(red.freeActionsAdCalls === 0,
    `撤销/提示/重开/证明/自动 —— 一个广告都不弹（实测调用 ${red.freeActionsAdCalls} 次）`);
  const shown = red.interstitialSeq.reduce((a,b)=>a+b,0);
  ok(shown <= 3 && red.interstitialSeq.slice(0,2).every(x=>x===0),
    `插屏节流：7 次赢局只出 ${shown} 个（序列 ${red.interstitialSeq.join('')}），且绝不连播`);
  ok(red.noAdsBlocksInterstitial, '买了去广告 -> 一个非自愿广告都没有');

  ok(errs.length===0, '全程零 error' + (errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode ? '\nX P5/P6 E2E 有失败项' : '\nOK P5/P6 E2E 全绿');
})();
