// tools/check-ui-icons.cjs — 共享 UI 图标库的一致性检查(全仓,纯静态)
//
// ⚠ 为什么需要这条:图标名拼错**不会报错**——`<img alt="⭐">` 会安静地退回 emoji,
//   功能测试全绿、E2E 也不红,只有真人盯着看才发现少了个图。所以必须静态查。
//
// 用法:node tools/check-ui-icons.cjs        (退出码 0=通过)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const UIDIR = path.join(ROOT, 'engine', 'assets', 'ui');

let fail = 0;
const bad = m => { console.error('  FAIL ' + m); fail++; };

// ── 库本身 ──
const files = fs.readdirSync(UIDIR).filter(f => f.endsWith('.webp')).map(f => f.replace(/\.webp$/, ''));
const manifest = JSON.parse(fs.readFileSync(path.join(UIDIR, 'manifest.json'), 'utf8'));

for (const n of files) {
  if (!(n in manifest)) bad(`${n}.webp 不在 manifest.json 里(回退 emoji 会是空的)`);
  const kb = fs.statSync(path.join(UIDIR, n + '.webp')).size / 1024;
  if (kb >= 40) bad(`${n}.webp = ${kb.toFixed(0)}KB —— 图标只在 34~62px 显示,不该这么大`);
}
for (const n of Object.keys(manifest)) {
  if (!files.includes(n)) bad(`manifest 里有 ${n} 但没有 ${n}.webp(还没生成?)`);
  if (!manifest[n]) bad(`${n} 没有回退 emoji`);
}

// ── 几何字形(back/play/undo/restart/unlock…)由 engine/ui-icons.js 的内联 SVG 提供,
//    没有也不该有 .webp 文件 ⇒ 引用检查里要认它们 ──
// ⚠ ui-icons.js 只在函数体里碰 document,顶层是纯数据 ⇒ node 可以直接 require。
const GLYPHS = Object.keys(require(path.join(ROOT, 'engine', 'ui-icons.js')).GLYPHS);
for (const g of GLYPHS) {
  if (files.includes(g)) bad(`${g} 既有 SVG 字形又有 ${g}.webp —— 只该留一种(几何字形用 SVG)`);
}

// ── 各游戏的引用都要能解析到库里 ──
const set = new Set([...files, ...GLYPHS]);
const games = fs.readdirSync(path.join(ROOT, 'games')).filter(g => !g.startsWith('_'));
let refs = 0;
for (const g of games) {
  for (const sub of ['js', 'css']) {
    const dir = path.join(ROOT, 'games', g, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      // UIIcon.img('name' …) / UIIcon.src('name') / uiIcon('name' …) / assets/ui/name.webp
      const pats = [/UIIcon\.(?:img|src)\('([\w-]+)'/g, /\buiIcon\('([\w-]+)'/g, /assets\/ui\/([\w-]+)\.webp/g];
      for (const re of pats) {
        for (const m of src.matchAll(re)) {
          refs++;
          if (!set.has(m[1])) bad(`games/${g}/${sub}/${f} 引用了不存在的图标 "${m[1]}"`);
        }
      }
      // ⛔ 游戏不许自建一份图标目录(共享库的意义就在于只有一份)
      if (/['"]assets\/ui\//.test(src)) bad(`games/${g}/${sub}/${f} 直接指向游戏内 assets/ui/ —— 该走 UIIcon(共享库)`);
    }
  }
  if (fs.existsSync(path.join(ROOT, 'games', g, 'assets', 'ui'))) {
    bad(`games/${g}/assets/ui/ 存在 —— 共享图标只该有 engine/assets/ui/ 一份`);
  }
}

if (fail) { console.error(`check-ui-icons: ${fail} 个问题`); process.exit(1); }
console.log(`OK check-ui-icons(库 ${files.size || files.length} 张 · manifest 齐全 · ${games.length} 个游戏共 ${refs} 处引用全部可解析 · 无重复目录)`);
