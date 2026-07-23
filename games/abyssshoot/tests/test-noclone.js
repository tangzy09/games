// test-noclone.js — Apple 4.3(a) 克隆指纹防回归扫描
// 本作 2026-07-20 被 4.3(a) 拒审(当时名「2048 Shooter: Fish Merge」,盘面印 2/4/…/2048)。
// 整改后立此门禁:面向用户的表面(locale 文案 / 显示层代码 / 网页 / 主屏名)
// 不许再出现 ① "2048"/"Abyss" 品牌词 ② 2 的幂数值泄漏 ③ 绕过 tierDisp 的原始值显示。
// 详见 ~/.claude/skills/avoiding-clone-spam-rejection。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ① locale 值(只走 value 不走 key)不含大 2 的幂。32 以下(2/4/8/16)可能是正常步数/倍数,放行。
const BIG_POW = /(^|\D)(32|64|128|256|512|1024|2048|4096|8192|16384|32768|65536|131072)(\D|$)/;
function walkValues(o, fn, trail) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') walkValues(v, fn, trail + '.' + k);
    else if (typeof v === 'string') fn(v, trail + '.' + k);
  }
}
for (const f of fs.readdirSync(path.join(ROOT, 'locales'))) {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', f), 'utf8'));
  walkValues(j, (v, at) => {
    assert(!BIG_POW.test(v), `locales/${f} ${at} 泄漏 2 的幂: "${v}"`);
    assert(!/2048|abyss/i.test(v), `locales/${f} ${at} 含克隆品牌词: "${v}"`);
    // 游戏已去数字化(玩家只见 Lv.N 与鱼种):文案再提 number/数字 = 把 2048 制服穿回去
    assert(!/number|同数|数字/i.test(v), `locales/${f} ${at} 含数字化措辞: "${v}"`);
  }, '');
}

// ② 显示层代码不许直接调 Tiles.fmt(原始数字显示)——玩家可见数值一律 tierDisp
for (const f of ['js/render.js', 'js/main.js']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert(!src.includes('Tiles.fmt('), `${f} 直接调了 Tiles.fmt —— 玩家可见数值必须走 Tiles.tierDisp`);
}

// ③ 面向用户的静态表面不含 "2048"(index.html 的 GAME_CONFIG.id 'abyss' 是内部代号,只查 2048)
for (const f of ['index.html', 'privacy.html', 'capacitor.config.json']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert(!src.includes('2048'), `${f} 含 "2048"`);
}
// capacitor appName(主屏图标名)与网页 <title> 还要不含 Abyss
const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
assert(!/2048|abyss/i.test(cap.appName), `appName 含克隆品牌词: "${cap.appName}"`);
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const title = (idx.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
assert(!/2048|abyss/i.test(title), `index.html <title> 含克隆品牌词: "${title}"`);
for (const m of idx.match(/content="[^"]*"|<title>[^<]*<\/title>/g) || []) {
  assert(!/number|同数/i.test(m), `index.html 元数据含数字化措辞: ${m}`);
}

console.log('test-noclone OK');
