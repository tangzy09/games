// tools/shot-notch.cjs — 刘海/灵动岛适配目检：__forceSafeTop=59 模拟 iPhone Pro 顶部安全区,
// 每个游戏截一张图,顶部叠红色半透明带(0..59px = 会被灵动岛/刘海压住的区域)。
// 用法: node tools/shot-notch.cjs   → C:/tmp/notch-check/*.png
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'..'), PORT=8179, SHOT='C:/tmp/notch-check';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav'};
// 每项可以是游戏名，也可以是 {id, extras:[{label, js}]} —— extras 用来多截几屏
// （有独立主界面/菜单的游戏，光截牌桌是查不出那些页的刘海问题的）。
const GAMES=['minesweeper','snake','abyssshoot',
  {id:'blockblast', extras:[{label:'home', js:"G.phase='HOME'; renderAll();"}]},
  {id:'solitaire', extras:[{label:'home', js:"G.seenIntro=1; G.phase='HOME'; renderAll();"}]}];

function serve(){return new Promise((res,rej)=>{const srv=http.createServer((q,r)=>{
  let u=decodeURIComponent(q.url.split('?')[0]); if(u.endsWith('/'))u+='index.html';
  const f=path.join(ROOT,u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(r);});
  srv.on('error',rej); srv.listen(PORT,()=>res(srv));});}

(async()=>{
  fs.mkdirSync(SHOT,{recursive:true});
  const srv=await serve();
  const browser=await chromium.launch();
  for (const gi of GAMES){
    const g = typeof gi==='string' ? gi : gi.id;
    const extras = (typeof gi==='string' ? null : gi.extras) || [];
    const page=await browser.newPage({viewport:{width:393,height:852}});   // iPhone 15 Pro 逻辑尺寸
    page.on('dialog',d=>d.accept());
    try{
      await page.goto(`http://127.0.0.1:${PORT}/games/${g}/index.html`,{timeout:20000});
      await page.waitForTimeout(2500);
      await page.evaluate(()=>{
        GameGlobal.__forceSafeTop = 59;                    // canvas 侧测试钩子
        document.documentElement.style.setProperty('--sat','59px');   // DOM 顶栏(engine.css)
        window.dispatchEvent(new Event('resize'));         // 走各游戏自己的 re-layout 路径
      });
      await page.waitForTimeout(800);
      // 跳过首启浮层(尽力而为,各游戏 action 不同)
      await page.evaluate(()=>{
        try { if (window.G && G.phase === 'INTRO' && typeof dispatch === 'function') dispatch('INTRO_GO'); } catch(e){}
        try { if (typeof hideHome === 'function') hideHome(); } catch(e){}
      });
      await page.waitForTimeout(400);
      // 红色半透明「灵动岛区」叠加(DOM,不碰 canvas 状态)
      await page.evaluate(()=>{
        const d=document.createElement('div');
        d.style.cssText='position:fixed;left:0;top:0;right:0;height:59px;background:rgba(255,0,0,0.35);z-index:9999;pointer-events:none;';
        const c=document.createElement('div');
        c.style.cssText='position:absolute;left:50%;top:14px;transform:translateX(-50%);width:120px;height:34px;border-radius:17px;background:#000;';
        d.appendChild(c);
        document.body.appendChild(d);
      });
      await page.screenshot({path:path.join(SHOT,g+'.png')});
      console.log(g,'OK');
      for (const ex of extras){                              // 额外几屏（主界面/菜单…）
        await page.evaluate(ex.js);
        await page.waitForTimeout(500);
        await page.screenshot({path:path.join(SHOT,g+'-'+ex.label+'.png')});
        console.log(g+'-'+ex.label,'OK');
      }
    }catch(e){ console.log(g,'FAIL',String(e).slice(0,120)); }
    await page.close();
  }
  await browser.close(); srv.close();
  console.log('shots →',SHOT);
})();
