// games/snake/js/gallery.js — 图鉴:解锁记录/集进度(纯逻辑,双导出)+ 分享卡片(浏览器)
function recordUnlock(save, file) {
  if (!save.gallery.unlocked.includes(file)) save.gallery.unlocked.push(file);
}
function setProgress(save, set) {
  const u = new Set(save.gallery.unlocked);
  return set.images.filter(f => u.has(f)).length;
}
function updateSetsDone(save, manifest) {
  let done = 0;
  for (const set of manifest.sets || []) if (setProgress(save, set) === set.images.length) done++;
  save.stats.setsDone = done;      // 幂等:直接以完成集数为准
}
// 过关分享卡片:offscreen canvas 合成 1080×1350 → Web Share(File)优先,降级下载。
// 仅浏览器调用(node 端 require 不执行 DOM 路径)。texts = { title, score, url }
async function shareCard(img, score, pal, texts) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
  const x = c.getContext('2d');
  x.fillStyle = pal.bg; x.fillRect(0, 0, 1080, 1350);
  x.fillStyle = pal.card; x.fillRect(40, 40, 1000, 1270);
  if (img) x.drawImage(img, 60, 150, 960, 960);
  x.fillStyle = pal.text; x.textAlign = 'center';
  x.font = 'bold 56px sans-serif'; x.fillText(texts.title, 540, 110);
  x.font = 'bold 44px sans-serif'; x.fillText(texts.score, 540, 1180);
  x.font = '28px sans-serif'; x.fillText(texts.url, 540, 1250);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'angel-snake.png', { type: 'image/png' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: texts.title }); return 'shared'; } catch (e) {}
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'angel-snake.png';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

// 存为手机壁纸:1080×1920 竖版,粉彩渐变底 + 居中天使(圆角)+ 柔光。Web Share 优先,降级下载。
async function saveWallpaper(file, pal) {
  const img = await new Promise((res, rej) => {
    const im = new Image(); im.onload = () => res(im); im.onerror = rej;
    im.src = 'assets/angels/' + file;
  }).catch(() => null);
  const W = 1080, H = 1920;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.cloud || '#f3e0ef'); g.addColorStop(1, pal.bg || '#fdf3f7');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const s = 900, sx = (W - s) / 2, sy = (H - s) / 2 - 60;
  // 柔光
  const glow = x.createRadialGradient(W / 2, sy + s / 2, s * 0.2, W / 2, sy + s / 2, s * 0.8);
  glow.addColorStop(0, (pal.glow || '#fff59d') + '88'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = glow; x.fillRect(0, sy - 60, W, s + 200);
  if (img) {
    const r = 56;
    x.save();
    x.beginPath();
    x.moveTo(sx + r, sy); x.arcTo(sx + s, sy, sx + s, sy + s, r); x.arcTo(sx + s, sy + s, sx, sy + s, r);
    x.arcTo(sx, sy + s, sx, sy, r); x.arcTo(sx, sy, sx + s, sy, r); x.closePath(); x.clip();
    x.drawImage(img, sx, sy, s, s);
    x.restore();
  }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], 'angel-wallpaper.png', { type: 'image/png' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f] }); return 'shared'; } catch (e) {}
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'angel-wallpaper.png';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}

const Gallery = { recordUnlock, setProgress, updateSetsDone, shareCard, saveWallpaper };
if (typeof module !== 'undefined' && module.exports) module.exports = Gallery;
