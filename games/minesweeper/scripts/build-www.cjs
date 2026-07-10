// Assemble www/ (Capacitor webDir) from the monorepo layout:
//   games/minesweeper/{index.html,js,assets,locales} + ../../engine → www/{...,engine}
// index.html script/css paths are rewritten from ../../engine/ to engine/.
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..');
const ROOT = path.join(GAME, '..', '..');
const WWW = path.join(GAME, 'www');

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
copyDir(path.join(GAME, 'js'), path.join(WWW, 'js'));
copyDir(path.join(GAME, 'assets'), path.join(WWW, 'assets'));
copyDir(path.join(GAME, 'locales'), path.join(WWW, 'locales'));

const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8')
  .replace(/\.\.\/\.\.\/engine\//g, 'engine/');
fs.writeFileSync(path.join(WWW, 'index.html'), html);

// ground truth: verify the rewrite actually happened and files exist
const out = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
if (out.includes('../../engine/')) throw new Error('engine path rewrite failed');
for (const f of ['engine/canvas.js', 'js/main.js', 'locales/en.json', 'assets/sprites/dragon.webp']) {
  if (!fs.existsSync(path.join(WWW, f))) throw new Error('missing in www: ' + f);
}
console.log('www assembled OK:', fs.readdirSync(WWW).join(', '));
