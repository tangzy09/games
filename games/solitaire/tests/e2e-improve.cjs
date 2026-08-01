// e2e-improve.cjs — 1.0.1 改良包：分享链接进同一局 / 舒适模式 / 难度旋钮 / 瀑布收藏 / 每日 AI 对比。
//
// ⚠ 为什么值得一个专门的 E2E：这批功能全是「把已建好的护城河变成玩家看得见的东西」——
//   seed 分享靠 deal(seed) 纯函数，AI 对比靠 ai-blind.js 与公平页基线同源。
//   测试必须证明**链路真的通**（链接进来是同一局、AI 真的跑出结果），不是 UI 摆设。
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
  const ctx=await browser.newContext({viewport:{width:414,height:896},
    permissions:['clipboard-read','clipboard-write']});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  const base=`http://127.0.0.1:${PORT}/games/solitaire/index.html`;

  // ── ① 分享链接 = 同一局（Klondike，draw 模式进链接）──
  await page.goto(base+'#d3-12345');
  await page.waitForFunction(()=>window.G&&window.G.s);
  let st=await page.evaluate(()=>({seed:G.s.seed,draw:G.s.drawCount,mode:G.s.mode,hash:location.hash}));
  ok(st.seed===12345&&st.draw===3&&st.mode==='klondike', `⭐ #d3-12345 进来就是那一局（seed=${st.seed}, draw=${st.draw}）`);
  ok(st.hash==='', 'hash 已消费（刷新不会困在这局里）');

  // ── ② FreeCell 用微软局号分享（同文档 hash 导航 ⇒ 走 hashchange 路径）──
  await page.goto(base+'#fc-11982');
  await page.waitForFunction(()=>window.G&&window.G.s&&G.s.seed===11982,{timeout:5000}).catch(()=>{});
  st=await page.evaluate(()=>({seed:G.s.seed,mode:G.s.mode}));
  ok(st.seed===11982&&st.mode==='freecell', `⭐ #fc-11982 = 微软 #11982（32000 局唯一无解局也能被分享出来围观）`);

  // ── ③ 分享按钮 → 剪贴板里是 **App Store 链接 + 局号**（2026-08-01 改：不再分享网页版）──
  //    ⚠ 这条断言原来钉的是网页挑战链接 `#fc-11982`。策略变了 ⇒ **把断言改成钉新策略**，
  //      不是删掉（跨游戏红线另有 tools/test-share-links.cjs 守着）。
  await page.evaluate(()=>{ if(G.phase==='INTRO') dispatch('INTRO_GO'); });
  await page.evaluate(()=>dispatch('FAIR'));
  await page.waitForTimeout(120);
  ok(await click(page,'SHARE'), '公平页有「分享此局」按钮');
  await page.waitForTimeout(250);
  const clip=await page.evaluate(()=>navigator.clipboard.readText());
  ok(clip.includes('apps.apple.com/app/id6790861224') && !clip.includes('ai-speeds.com'),
     `⭐ 剪贴板是 App Store 链接，不是网页版（…${clip.slice(-30)}）`);
  ok(clip.includes('11982'), '⭐ 局号仍在文案里（App Store 链接带不了 seed ⇒ 靠局号直输兑现「同一局」）');
  ok(await page.evaluate(()=>!!G.toast), '复制成功有 toast 反馈');
  await page.evaluate(()=>dispatch('PLAY'));

  // ── ④ 舒适模式：一键 = 四色 + 大字 + 放宽点击 ──
  await page.evaluate(()=>{ if(G.s.mode==='freecell') dispatch('MODE'); });   // 难度块只在 Klondike 设置里
  await page.waitForTimeout(150);
  await click(page,'MENU'); await page.waitForTimeout(120);
  await click(page,'SET'); await page.waitForTimeout(150);
  ok(await click(page,'TOG_COMFORT'), '舒适模式开关可点');
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>G.comfort===true&&G.fourColor===true&&G.bigText===true),
     '⭐ 舒适模式一键把四色牌+大字号一起打开（65+ 主力人群）');

  // ── ⑤ 难度**明面阶梯**（已取代原来的「混合/简单/困难」三个下拉项）：
  //     选档 = 换翻牌数 + 换池，且**每一档都只发已验证可解的局**。
  await page.evaluate(()=>{ G.stats.won=10; G.stats.played=20; dispatch('SET'); });
  await page.waitForTimeout(120);
  ok(await click(page,'SET_LV',{lv:3}), '难度阶梯第 3 档可点（已解锁）');
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>G.diffLv===3&&G.s.drawCount===3), '⭐ 选档立刻换局（第 3 档 = 翻 3 张 · easy 池）');
  await page.evaluate(()=>dispatch('NEW'));
  await page.waitForTimeout(200);
  st=await page.evaluate(()=>({v:Pool.isVerified(G.s.drawCount,G.s.seed),
    d:Pool.difficultyOf(G.s.drawCount,G.s.seed),draw:G.s.drawCount}));
  ok(st.v&&st.d==='easy'&&st.draw===3, `⭐ 「换一局」也照阶梯发（翻 ${st.draw} 张 · 难度=${st.d} · 已验证可解）`);

  // ── ⑥ 瀑布收藏：金币买 → 装备 ──
  await page.evaluate(()=>{Money.state.coins=1000;Money.save();dispatch('SHOP');});
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(SHOT,'p9-01-shop-fx.png')});
  await page.evaluate(()=>dispatch('SHOP_TAB',{t:'fx'}));      // 收藏页已分签
  await page.waitForTimeout(100);
  ok(await click(page,'PICK_FX',{id:'rainbow'}), '瀑布特效可点');
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>Money.owns('fx','rainbow')&&Money.state.fx==='rainbow'),
     '⭐ 「彩虹瀑布」买下并装备（激励视频消耗端加深）');

  // ── ⑦ 每日挑战：盲打 AI 打同一局，结果确定性可复算 ──
  await page.evaluate(()=>dispatch('MENU'));
  await page.waitForTimeout(120);
  ok(await click(page,'DAILY'), '每日挑战可进');
  await page.waitForFunction(()=>G.dailyAI!=null, {timeout:5000});
  st=await page.evaluate(()=>({ai:G.dailyAI,seed:G.dailySeed,same:G.dailyAI.seed===G.dailySeed}));
  ok(st.same&&typeof st.ai.won==='boolean',
     `⭐ 盲打 AI 打完了今天这局（won=${st.ai.won}, ${st.ai.moves} 步）——赢局结算时对比`);

  // ── ⑧ 持久化：难度 + 舒适模式重开还在 ──
  await page.reload();
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.waitForTimeout(250);
  ok(await page.evaluate(()=>G.diffLv===3&&G.comfort===true), '难度档/舒适模式持久化');

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 改良包 E2E 有失败项':'\nOK 改良包 E2E 全绿');
})();
