// e2e-angels.cjs — 天使图鉴：501 张长线收集（素材复用 snake 的同一份，零重复存储）。
//
// ⚠ 测试必须证明**跨游戏引用真的通**：manifest 和 webp 都从 ../snake/assets/angels/
//   经 http 真实拉取（服务器根 = 仓库根，与线上 EC2 目录结构一致）。
const http=require('http'), fs=require('fs'), path=require('path');
const { chromium } = require('playwright');
const ROOT=path.resolve(__dirname,'../../..'), PORT=8170, SHOT='C:/tmp/solitaire';
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
  await page.waitForFunction(()=>Angels.total()>0,{timeout:5000});
  ok(await page.evaluate(()=>Angels.total()===500),
     `⭐ manifest 从 ../snake 真实拉到（${await page.evaluate(()=>Angels.total())} 张）`);

  // ── ① 图鉴入口 + 初始 0 张 ──
  await page.evaluate(()=>dispatch('HOME'));   // 图鉴/成就/教学等入口都在 🏠 主界面（菜单已瘦身成「每日 + 弱点」）
  await page.waitForTimeout(120);
  ok(await click(page,'GALLERY'), '主界面有「天使图鉴」入口');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.phase==='GALLERY'&&G.angels===0), '图鉴可进（新档案 0/500）');
  await page.screenshot({path:path.join(SHOT,'p12-01-gallery-locked.png')});

  // ── ② 赢局 +1；每日赢局 +3 ──
  await page.evaluate(()=>dispatch('TOG_RFX'));
  await page.evaluate(`(()=>{ const s=Core.newGame(7,3);
    s.stock=[]; s.waste=[]; s.moves=[];
    s.foundations=[0,1,2,3].map(fi=>Array.from({length:12},(_,r)=>r*4+fi));
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    [0,1,2,3].forEach(fi=>{ s.tableau[fi]={cards:[12*4+fi],up:1}; });
    G.s=s; G.sel=null; G.phase='PLAY'; Prover.reset(); FX.reset(); renderAll(); })()`);
  await click(page,'FINISH');
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>G.angels===1&&G.lastAngelGain===1), '⭐ 赢一局解锁 1 张（结算屏 👼+1）');
  await page.evaluate(`(()=>{ const s=Core.newGame(8,3);
    s.stock=[]; s.waste=[]; s.moves=[];
    s.foundations=[0,1,2,3].map(fi=>Array.from({length:12},(_,r)=>r*4+fi));
    s.tableau=Array.from({length:7},()=>({cards:[],up:0}));
    [0,1,2,3].forEach(fi=>{ s.tableau[fi]={cards:[12*4+fi],up:1}; });
    G.s=s; G.sel=null; G.dailySeed=s.seed; G.phase='PLAY'; Prover.reset(); FX.reset(); renderAll(); })()`);
  await click(page,'FINISH');
  await page.waitForTimeout(400);
  ok(await page.evaluate(()=>G.angels===4&&G.lastAngelGain===3), '⭐ 每日挑战赢局解锁 3 张（1+2）');

  // ── ③ 图鉴里看广告 +12（2026-07-31 从 +3 加到 +8，08-01 再加到 +12：奖励要一次见效）──
  await page.evaluate(()=>dispatch('GALLERY'));
  await page.waitForTimeout(150);
  ok(await click(page,'GAL_AD'), '图鉴有「看广告 +N」入口');
  await page.waitForTimeout(500);
  ok(await page.evaluate(()=>G.angels===4+AD_GIVE.gallery&&AD_GIVE.gallery===12), `⭐ 看广告 +12（4 -> 16，数量由 AD_GIVE 表定）`);

  // ── ④ 缩略图真实加载 + 大图查看 + 翻页 ──
  await page.waitForFunction(()=>!!Angels.img(Angels.fileAt(0)),{timeout:8000});
  ok(true, '⭐ 天使 webp 从 ../snake 经 http 真实加载出来');
  await page.screenshot({path:path.join(SHOT,'p12-02-gallery-unlocked.png')});
  ok(await click(page,'GAL_VIEW',{i:0}), '已解锁缩略图可点');
  await page.waitForTimeout(200);
  ok(await page.evaluate(()=>G.galView===0), '大图查看打开');
  await page.screenshot({path:path.join(SHOT,'p12-03-gallery-view.png')});
  await click(page,'GAL_CLOSE');
  await page.waitForTimeout(120);
  ok(await page.evaluate(()=>G.galView==null), '点任意处关闭大图');
  ok(await click(page,'GAL_PG',{p:1}), '翻页可点');
  await page.waitForTimeout(150);
  ok(await page.evaluate(()=>G.galPage===1), '翻到第 2 页（换页清图片缓存防内存爆）');

  // ── ⑤ 持久化 ──
  await page.reload();
  await page.waitForFunction(()=>window.G&&window.G.s);
  await page.waitForTimeout(250);
  ok(await page.evaluate(()=>G.angels===4+AD_GIVE.gallery), '解锁数持久化（只存计数,顺序全球一致）');

  ok(errs.length===0, '全程零 error'+(errs.length?': '+errs.join(' | '):''));
  await browser.close(); srv.close();
  console.log(process.exitCode?'\nX 天使图鉴 E2E 有失败项':'\nOK 天使图鉴 E2E 全绿');
})();
