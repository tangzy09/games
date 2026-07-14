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
const GameGlobal = { SW: 0, SH: 0, safeTop: 44, safeBottom: 0 };

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
