// games/snake/tools/pick-images.js — 从 language-study 抽 N 张词图 + 生成 manifest
// 用法: node games/snake/tools/pick-images.js --count 24 --seed 1
const fs = require('fs'), path = require('path');
const PRNG = require('../../../engine/prng.js');

const SRC = 'C:/Users/tangz/Documents/Projects/language-study/images';
const DST = path.join(__dirname, '..', 'assets', 'angels');
const args = process.argv.slice(2);
const get = (k, dflt) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : dflt; };
const count = parseInt(get('--count', '24'), 10);
const rand = PRNG.create(parseInt(get('--seed', '1'), 10));

const all = fs.readdirSync(SRC, { withFileTypes: true })
  .filter(e => e.isFile() && e.name.endsWith('.webp') && !e.name.startsWith('_'))
  .map(e => e.name);
if (all.length < count) throw new Error(`源图不足: ${all.length} < ${count}`);
for (let i = all.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]];
}
const picked = all.slice(0, count).sort();
fs.mkdirSync(DST, { recursive: true });
// 重跑前清空旧素材,防不同参数重抽后残留孤儿文件
fs.readdirSync(DST)
  .filter(f => f.endsWith('.webp') || f === 'manifest.json')
  .forEach(f => fs.unlinkSync(path.join(DST, f)));
for (const f of picked) fs.copyFileSync(path.join(SRC, f), path.join(DST, f));
fs.writeFileSync(path.join(DST, 'manifest.json'),
  JSON.stringify({ v: 1, images: picked }, null, 1));
console.log(`copied ${picked.length} -> ${DST}`);
