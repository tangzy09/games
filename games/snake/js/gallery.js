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
const Gallery = { recordUnlock, setProgress, updateSetsDone };
if (typeof module !== 'undefined' && module.exports) module.exports = Gallery;
