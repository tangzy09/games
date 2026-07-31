// ════════════════════════════════════════
// canvas.js — canvas setup, hit areas, draw primitives, text wrapping, art loader.
// Immediate-mode contract: the game's renderAll() calls clearHits() then repaints
// everything from its state object, addHit()-ing every clickable region.
// Engine calls the global renderAll() (if defined) when async art finishes loading.
// ════════════════════════════════════════
let canvas, ctx;
let hitAreas = [];
const T = (k, p) => I18N.t(k, p);

// Screen metrics + safe areas (top control bar clearance).
// ⚠ ctrlH = 右上 DOM 控制栏（#controls：语言下拉等）的高度。它是 fixed 在
//   `safeTop + 8` 处的**右上禁区**：canvas 在这一带画的东西会被它盖住、**且点不动**
//   （solitaire 的「✓ 有解」角标、abyssshoot 的 Deepest/Coins 都实踩过）。
//   ⇒ 右上要放 canvas 内容时，y 从 `safeTop + ctrlH + 8` 起，或整块左移避开。
const GameGlobal = { SW: 0, SH: 0, safeTop: 44, safeBottom: 0, ctrlH: 34 };

// ⚠ 刘海/灵动岛适配（2026-07-31 用户点名,全游戏铁律）:safeTop **不能写死**。
//   iPhone X 类≈44/47/48,灵动岛机型(14/15/16 Pro)= **59** —— 写死 44 顶部会被压 15px。
//   实测 env(safe-area-inset-top)(需 index.html viewport-fit=cover,全游戏已配),
//   与 44 取大值:web/安卓 env=0 时保留 44 给引擎顶栏(#controls)让位。
//   __forceSafeTop 是 E2E 模拟刘海用的测试钩子(headless 里 env 恒 0)。
function measureSafeInset(prop) {
  try {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;pointer-events:none;'
      + 'height:env(' + prop + ',0px);';
    document.body.appendChild(el);
    const h = el.getBoundingClientRect().height;
    el.remove();
    return h || 0;
  } catch (e) { return 0; }
}

function initCanvas() {
  canvas = document.getElementById(CFG.canvasId);
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  GameGlobal.SW = W; GameGlobal.SH = H;
  GameGlobal.safeTop = Math.max(44, Math.round(measureSafeInset('safe-area-inset-top')),
                                GameGlobal.__forceSafeTop || 0);
  GameGlobal.safeBottom = Math.round(measureSafeInset('safe-area-inset-bottom'));
}

// ── hit areas (tap targets rebuilt every frame) ──
function clearHits() { hitAreas = []; }
function addHit(x, y, w, h, action, data) { hitAreas.push({ x, y, w, h, action, data: data || {} }); }
function hitTest(tx, ty) {
  for (let i = hitAreas.length - 1; i >= 0; i--) {
    const h = hitAreas[i];
    if (tx >= h.x && tx <= h.x + h.w && ty >= h.y && ty <= h.y + h.h) return h;
  }
  return null;
}

// ── draw primitives ──
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
function fillRR(x,y,w,h,r,color){ctx.fillStyle=color;roundRect(x,y,w,h,r);ctx.fill();}
function strokeRR(x,y,w,h,r,color,lw=1){ctx.strokeStyle=color;ctx.lineWidth=lw;roundRect(x,y,w,h,r);ctx.stroke();}
function clean(s){return s?String(s).replace(/️/g,''):'';}
function txt(text,x,y,color,font){ctx.fillStyle=color;ctx.font=font;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(clean(text),x,y);}
function txtL(text,x,y,color,font){ctx.fillStyle=color;ctx.font=font;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(clean(text),x,y);}
function txtR(text,x,y,color,font){ctx.fillStyle=color;ctx.font=font;ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillText(clean(text),x,y);}

// wrap text into ≤maxLines lines fitting maxW (px); breaks at spaces when possible,
// else char-by-char (CJK); ellipsizes the last line if it still overflows. Set ctx.font first.
// i18n rule: EVERY non-fixed-length user string drawn on canvas goes through this —
// canvas fillText never wraps, and long locales (de/ru) overflow silently otherwise.
// 避头尾(禁则处理):这些字符绝不能出现在行首。CJK 没有空格,断行是逐字符的,
// 不做禁则处理就会出现「。」「，」「」」自己占一行的孤字行 —— 中文排版一眼就看出是外行做的。
const NO_LINE_START = '。，、；：？！）」』》〕】〉”’·…—,.;:?!)]}»›';
function wrapLines(text,maxW,maxLines){const s=clean(String(text));const lines=[];let cur='';
  for(let i=0;i<s.length;i++){const ch=s[i];
    if(ctx.measureText(cur+ch).width<=maxW){cur+=ch;continue;}
    // ⭐ 禁则:收尾标点宁可让本行轻微超宽,也不另起一行
    if(cur&&NO_LINE_START.indexOf(ch)>=0){cur+=ch;continue;}
    if(lines.length>=maxLines-1){let rest=cur;while(rest.length>1&&ctx.measureText(rest+'…').width>maxW)rest=rest.slice(0,-1);lines.push(rest+'…');return lines;}
    const br=cur.lastIndexOf(' ');
    if(br>0){lines.push(cur.slice(0,br));cur=cur.slice(br+1)+ch;}else{lines.push(cur);cur=ch;}}
  if(cur)lines.push(cur);return lines;}
// draw ≤2 lines left-aligned, vertically centered around cy
function txtLWrap(text,x,cy,maxW,color,font,lh){ctx.font=font;const ls=wrapLines(text,maxW,2);const y0=cy-(ls.length-1)*lh/2;ls.forEach((ln,i)=>txtL(ln,x,y0+i*lh,color,font));}

// dim the screen behind an overlay
function drawDim(color){ctx.fillStyle=color||'rgba(0,0,0,0.75)';ctx.fillRect(0,0,GameGlobal.SW,GameGlobal.SH);}

// ── art loader: preload assets/<dir>/<id>.webp; draw falls back to emoji ──
// A missing/failed image silently falls back — games ship playable with emoji
// placeholders and upgrade to real art incrementally.
function makeArt(dir, ids){
  const imgs = {}; let started = false;
  return { load(){ if (started) return; started = true;
    ids.forEach(id => { const im = new Image();
      im.onload  = () => { imgs[id] = im; if (typeof renderAll==='function') { try { renderAll(); } catch(e){} } };
      im.onerror = () => {};
      im.src = `assets/${dir}/${id}.webp`; }); },
    get(id){ return imgs[id]; } };
}
// draw an art image centered at (cx,cy), else its emoji fallback
function drawArtIcon(art, id, emoji, cx, cy, size, emojiColor, emojiFont){
  const im = art.get(id);
  if (im) ctx.drawImage(im, cx - size/2, cy - size/2, size, size);
  else txt(emoji, cx, cy, emojiColor, emojiFont);
}
