// 跨游戏工具:把 monorepo 布局组装成 Capacitor webDir(www/)。
// 用法:在游戏目录下跑 `node ../../tools/build-www.cjs`(或传游戏目录为参数)。
// 做三件事:拷 engine/ + 游戏静态目录 → 重写 index.html 的 ../../engine/ 路径 → 自校验。
const fs = require('fs');
const path = require('path');

const GAME = path.resolve(process.argv[2] || process.cwd());
const ROOT = path.join(__dirname, '..');
const WWW = path.join(GAME, 'www');

if (!fs.existsSync(path.join(GAME, 'index.html'))) {
  throw new Error('not a game dir (no index.html): ' + GAME);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

copyDir(path.join(ROOT, 'engine'), path.join(WWW, 'engine'));
// 游戏静态目录:有哪个拷哪个(mines 没有 css/,snake 有)
for (const dir of ['js', 'css', 'assets', 'locales', 'fonts']) {
  const src = path.join(GAME, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(WWW, dir));
}

const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8')
  .replace(/\.\.\/\.\.\/engine\//g, 'engine/');
fs.writeFileSync(path.join(WWW, 'index.html'), html);

// 地面真值:重写真的生效、关键文件真的在
const out = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
if (out.includes('../../engine/')) throw new Error('engine path rewrite failed');
for (const f of ['engine/canvas.js', 'js/main.js', 'locales/en.json']) {
  if (!fs.existsSync(path.join(WWW, f))) throw new Error('missing in www: ' + f);
}
console.log('www assembled OK (' + path.basename(GAME) + '):', fs.readdirSync(WWW).join(', '));
