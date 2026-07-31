// e2e-exp2.cjs — 体验/留存二期：集组奖励 / 壁纸导出 / 补签 / 局号直输 / 长按连撤 / 帮助页 / 演3步 / 成就分页。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8171, SHOT='C:/tmp/solitaire';
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
  // prompt 用于局号直输；confirm 用于模拟看广告
  page.on('dialog', d => d.type()==='prompt' ? d.accept('12345') : d.accept());

  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/index.html`);
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.evaluate(()=>{ if(G.phase==='INTRO') dispatch('INTRO_GO'); });
  await page.waitForFunction(()=>Angels.total()>0,{timeout:5000});

  // ── ① 集组奖励：跨过 25 张边界发金币 ──
  const set=await page.evaluate(()=>{
    G.angels=24; const c0=Money.coins;
    const got=gainAngels(2);                     // 24 -> 26,跨过第 1 集(25)
    return { got, dc: Money.coins-c0, angels: G.angels, toast: !!G.toast };
  });
  ok(set.got===2&&set.dc===50&&set.toast, `⭐ 集组奖励:跨过 25 张 ⇒ +50 金币 + toast（24→26）`);

  // ── ② 图鉴:集进度头 + 大图里的「存壁纸」按钮 ──
  await page.evaluate(()=>{ G.galPage=0; dispatch('GALLERY'); });
  await page.waitForTimeout(200);
  await page.screenshot({path:path.join(SHOT,'p13-01-gallery-set.png')});
  ok(await click(page,'GAL_VIEW',{i:0}), '大图可开');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>hitAreas.some(h=>h.action==='GAL_WALL')), '⭐ 大图里有「存壁纸」按钮（snake 同款体验）');
  await page.evaluate(()=>dispatch('GAL_CLOSE'));

  // ── ③ 补签:昨天缺卡+前天有卡 ⇒ 菜单出补签行 ⇒ 看广告补上 ──
  await page.evaluate(()=>{
    const k=n=>{const d=new Date();d.setDate(d.getDate()-n);return ''+d.getFullYear()+(d.getMonth()+1)+d.getDate();};
    G.dailyHist={}; G.dailyHist[k(2)]=1;         // 前天来过,昨天没来
    dispatch('MENU');
  });
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>canMakeup()), '补签条件成立（连续天数正要断）');
  ok(await click(page,'MAKEUP'), '⭐ 菜单出现「补签」行');
  await page.waitForTimeout(500);
  ok(await page.evaluate(()=>!canMakeup()&&dailyStreakDays()>=1), '⭐ 看广告补上昨天（连续天数保住）');

  // ── ④ 成就分页:18 项 ⇒ 2 页 ──
  await click(page,'ACH');
  await page.waitForTimeout(150);
  ok(await click(page,'ACH_PG',{p:1}), '成就页可翻页');
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>G.achPage===1), '第 2 页(天使/连续天数/奖牌系列)');
  await page.screenshot({path:path.join(SHOT,'p13-02-ach-page2.png')});
  await click(page,'PLAY');

  // ── ⑤ 局号直输:设置里 #️⃣ ⇒ prompt 12345 ⇒ 开那一局 ──
  await page.evaluate(()=>dispatch('SET'));
  await page.waitForTimeout(150);
  ok(await click(page,'ENTER_SEED'), '设置里有「输入局号」');
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>G.s.seed===12345&&G.phase==='PLAY'), '⭐ 输入 12345 ⇒ 直接开那一局（与分享链接闭环）');

  // ── ⑥ 帮助页 ──
  await page.evaluate(()=>dispatch('SET'));
  await page.waitForTimeout(120);
  ok(await click(page,'HELP'), '设置里有「怎么玩」');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.phase==='HELP'), '帮助页可进（含 supermove 公式）');
  await page.screenshot({path:path.join(SHOT,'p13-03-help.png')});
  await click(page,'PLAY');

  // ── ⑦ 长按撤销 = 连续撤 ──
  await page.evaluate(()=>dispatch('NEW'));
  await page.waitForTimeout(150);
  // ⚠ 间隔要 > 滑牌动画 130ms —— FX.busy() 期间 input 吞点击（120ms 连点会丢一次,实踩）
  for (let i=0;i<3;i++){ await click(page,'STOCK'); await page.waitForTimeout(280); }
  const m0=await page.evaluate(()=>G.s.moves.length);
  const ub=await page.evaluate(()=>{
    const h=hitAreas.filter(x=>x.action==='UNDO').pop();
    const c=document.getElementById('game-canvas').getBoundingClientRect();
    const sx=c.width/GameGlobal.SW, sy=c.height/GameGlobal.SH;
    return {x:c.left+(h.x+h.w/2)*sx, y:c.top+(h.y+h.h/2)*sy};
  });
  await page.mouse.move(ub.x,ub.y);
  await page.mouse.down();
  await page.waitForTimeout(1000);               // 450ms 起步 + 150ms/步 ⇒ ~3 步
  await page.mouse.up();
  await page.waitForTimeout(200);
  const m1=await page.evaluate(()=>G.s.moves.length);
  ok(m0===3&&m1===0, `⭐ 长按撤销连续回退（${m0} -> ${m1} 步）`);

  // ── ⑧ 演 3 步:prover 证明有解 ⇒ ▶ 按钮 ⇒ 头 3 步慢速演示 ──
  await page.evaluate(()=>dispatch('NEW'));
  await page.waitForTimeout(150);
  await page.evaluate(()=>dispatch('PROVE'));
  await page.waitForFunction(()=>Prover.st.phase==='done',{timeout:20000});
  const pv=await page.evaluate(()=>({r:Prover.st.result,n:(Prover.st.solMoves||[]).length}));
  ok(pv.r==='solvable'&&pv.n>0, `prover 有解 + 解法头 ${pv.n} 步在手`);
  const mv0=await page.evaluate(()=>G.s.moves.length);
  ok(await click(page,'DEMO3'), '⭐ 「演 3 步」按钮出现且可点');
  await page.waitForTimeout(300);
  const dm=await page.evaluate(()=>({n:G.s.moves.length,hint:G.s.usedHint}));
  ok(dm.n===mv0+3&&dm.hint, `⭐ 解法头 3 步演完（${mv0} -> ${dm.n}），且按提示留痕`);

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 体验二期 E2E 有失败项':'\nOK 体验二期 E2E 全绿');
})();
