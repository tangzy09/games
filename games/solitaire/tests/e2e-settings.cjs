// e2e-settings.cjs — 设置页（四色牌 / 大字号 / 音效 / 翻牌数）。
//
// ⚠ 为什么值得一个专门的 E2E：这四个功能**代码里一直都有，但玩家一个都开不了**（零 UI 入口）
//   —— 等于死代码。尤其 draw-1（可解率 90.5%、盲打胜率 32%，是老年/休闲玩家的首选），
//   此前根本进不去。测试必须证明**真实用户点得到、且真的生效**。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8166, SHOT='C:/tmp/solitaire';
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
  await page.waitForTimeout(80);

  // 真实用户路径：菜单 -> 设置
  ok(await click(page,'MENU'), '菜单可进');
  await page.waitForTimeout(120);
  ok(await click(page,'SET'), '⭐ 设置页有入口（此前这四个功能玩家一个都开不了）');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.phase==='SET'), '进入设置页');
  await page.screenshot({path:path.join(SHOT,'p8-01-settings.png')});

  // 四色牌（无障碍标配）
  ok(await click(page,'TOG_4COLOR'), '四色牌开关可点');
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>G.fourColor===true), '⭐ 四色牌真的打开了');

  // 大字号
  await click(page,'TOG_BIGTEXT');
  await page.waitForTimeout(100);
  ok(await page.evaluate(()=>G.bigText===true), '大字号真的打开了');
  await page.screenshot({path:path.join(SHOT,'p8-02-settings-on.png')});

  // ⭐ draw-1（此前根本进不去的模式）
  const d0 = await page.evaluate(()=>G.s.drawCount);
  ok(await click(page,'SET_DRAW',{n:1}), '「翻 1 张」可点');
  await page.waitForTimeout(200);
  const after = await page.evaluate(()=>({draw:G.s.drawCount, seed:G.s.seed,
    verified: Pool.isVerified(G.s.drawCount, G.s.seed)}));
  ok(after.draw===1, `⭐ 切到 draw-1（${d0} -> ${after.draw}）—— 老年/休闲玩家的首选，此前进不去`);
  ok(after.verified, '⭐ 而且换过去发的仍然是**已验证可解**的牌局（draw-1 用的是它自己的池）');

  // 回牌桌：四色牌真的画出来了
  await click(page,'PLAY');
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(SHOT,'p8-03-fourcolor-table.png')});

  // 设置要持久化（重开还在）
  await page.reload();
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.waitForTimeout(250);
  ok(await page.evaluate(()=>G.fourColor===true && G.bigText===true), '设置重开后仍在（持久化）');

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 设置 E2E 有失败项':'\nOK 设置 E2E 全绿');
})();
