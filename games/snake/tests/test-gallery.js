const assert = require('assert');
const Gallery = require('../js/gallery.js');

const manifest = { images: [], sets: [] };
for (let s = 0; s < 25; s++) {
  const imgs = [];
  for (let i = 0; i < 20; i++) { const f = `img${s}_${i}.webp`; imgs.push(f); manifest.images.push(f); }
  manifest.sets.push({ key: 'set' + (s + 1), images: imgs });
}
// 解锁记录:去重
{
  const save = { gallery: { unlocked: [] }, stats: { setsDone: 0 } };
  Gallery.recordUnlock(save, 'img0_0.webp');
  Gallery.recordUnlock(save, 'img0_0.webp');
  assert.strictEqual(save.gallery.unlocked.length, 1, '去重');
}
// setsDone:集齐 20 张 → +1,不重复
{
  const save = { gallery: { unlocked: [] }, stats: { setsDone: 0 } };
  for (let i = 0; i < 20; i++) Gallery.recordUnlock(save, `img3_${i}.webp`);
  Gallery.updateSetsDone(save, manifest);
  assert.strictEqual(save.stats.setsDone, 1, '集齐一集');
  Gallery.updateSetsDone(save, manifest);
  assert.strictEqual(save.stats.setsDone, 1, '幂等');
}
// 集进度
{
  const save = { gallery: { unlocked: ['img5_0.webp', 'img5_1.webp'] }, stats: { setsDone: 0 } };
  assert.strictEqual(Gallery.setProgress(save, manifest.sets[5]), 2);
}
console.log('OK test-gallery');
