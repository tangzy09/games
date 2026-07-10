// games/snake/tools/build.js — 组装自包含 dist:游戏文件 + engine 拷入,路径重写
// 用法: node games/snake/tools/build.js
// dist 提交入库(monorepo 约定,EC2 直接 serve;Capacitor webDir 也指它)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');            // games/snake
const REPO = path.join(ROOT, '..', '..');
const OUT = path.join(ROOT, 'dist');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'engine'), { recursive: true });
// 1) engine 全量(js + css)
for (const f of fs.readdirSync(path.join(REPO, 'engine')))
  if (f.endsWith('.js') || f.endsWith('.css'))
    fs.copyFileSync(path.join(REPO, 'engine', f), path.join(OUT, 'engine', f));
// 2) 游戏静态目录
for (const dir of ['js', 'css', 'locales', 'assets'])
  fs.cpSync(path.join(ROOT, dir), path.join(OUT, dir), { recursive: true });
// 3) index.html:../../engine/ → engine/
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/\.\.\/\.\.\/engine\//g, 'engine/');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('dist assembled:', OUT);
