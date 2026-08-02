// shot-sheet.cjs — 把一批 png 拼成联络表（验图用：一眼看整体排版/空白/遮挡）
// 用法：node games/solitaire/tools/shot-sheet.cjs <图目录> <输出png> [列数] [每列宽]
// ⚠ 联络表只用来找「哪张有问题」，**逐张 Read 的验图 GATE 不能省**（skill 硬要求）。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const dir = process.argv[2], out = process.argv[3], cols = +(process.argv[4] || 4), cw = +(process.argv[5] || 380);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
const cells = files.map(f => `<figure><img src="file:///${path.join(dir, f).replace(/\\/g, '/')}"><figcaption>${f}</figcaption></figure>`).join('');
const html = `<!DOCTYPE html><meta charset="utf-8"><style>
body{margin:0;background:#222;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:10px;padding:10px}
figure{margin:0}img{width:${cw}px;display:block;background:#fff}
figcaption{color:#ffd84d;font:14px sans-serif;padding:4px 0}</style><body>${cells}`;
const f = path.join(require('os').tmpdir(), 'sheet.html');
fs.writeFileSync(f, html, 'utf8');
(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: cols * (cw + 10) + 10, height: 1000 } });
  await pg.goto('file:///' + f.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  await pg.screenshot({ path: out, fullPage: true });
  await br.close();
  console.log('sheet →', out, files.length, '张');
})();
