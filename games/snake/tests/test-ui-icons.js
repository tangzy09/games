// test-ui-icons.js — UI 图标资源与引用的一致性(纯静态检查,不起浏览器)
// ⚠ 这类 bug 没有报错:名字拼错 → 线上一个破图/退回 emoji,功能测试全绿、E2E 也不会红。
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'ui');
const files = new Set(fs.readdirSync(DIR).filter(f => f.endsWith('.webp')).map(f => f.replace(/\.webp$/, '')));

const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'game.css'), 'utf8');

// ① js 里 uiIcon('name', …) 引用的每个名字都要有文件
const used = new Set();
// ⚠ 末尾是 '-' 的是拼接调用(`uiIcon('q-' + q.t, …)`),不是真名字 ⇒ 跳过,由下面按任务类型展开
for (const m of main.matchAll(/uiIcon\('([a-zA-Z0-9-]+)'/g)) if (!m[1].endsWith('-')) used.add(m[1]);
// 任务图标是拼出来的:'q-' + q.t ⇒ 六个任务类型各要一张
const Quests = require('../js/quests.js');
for (const q of Quests.POOL) used.add('q-' + q.t);
// 成就两档也是三元拼的
used.add('ach-gold'); used.add('ach-locked');

const missing = [...used].filter(n => !files.has(n));
assert.deepStrictEqual(missing, [], '这些图标在代码里被引用但 assets/ui/ 里没有: ' + missing.join(', '));

// ② css 里 url(../assets/ui/x.webp) 也要有文件
const cssUsed = [...css.matchAll(/assets\/ui\/([a-z0-9-]+)\.webp/g)].map(m => m[1]);
const cssMissing = cssUsed.filter(n => !files.has(n));
assert.deepStrictEqual(cssMissing, [], 'css 引用了不存在的图标: ' + cssMissing.join(', '));

// ③ 反向:仓库里别躺着没人用的图(生成一批忘了删 = 白占体积进包)
const orphan = [...files].filter(n => !used.has(n) && !cssUsed.includes(n));
assert.deepStrictEqual(orphan, [], '这些图没有任何引用,该删或该接上: ' + orphan.join(', '));

// ④ 体积闸门:图标只在 34~62px 显示,单张超 40KB 说明忘了压/尺寸放大了
for (const n of files) {
  const kb = fs.statSync(path.join(DIR, n + '.webp')).size / 1024;
  assert(kb < 40, `${n}.webp = ${kb.toFixed(0)}KB,图标不该这么大(检查是不是没走 cut-ui-icons.py)`);
}

console.log(`OK test-ui-icons(${files.size} 张,引用 ${used.size + cssUsed.length} 处,零缺失零孤儿)`);
