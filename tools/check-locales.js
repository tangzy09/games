// locale 键集/占位符校验:以 en.json 为准,其余键集必须一致
// 用法: node tools/check-locales.js games/<name>/locales
const fs = require('fs');
const path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/check-locales.js <locales-dir>'); process.exit(2); }

const walk = (o, p = '', a = {}) => {
  for (const k in o) {
    const v = o[k], np = p ? p + '.' + k : k;
    (v && typeof v === 'object') ? walk(v, np, a) : (a[np] = v);
  }
  return a;
};
const tok = s => typeof s === 'string' ? (s.match(/\{\w+\}/g) || []).sort().join(',') : '';

const en = walk(JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8')));
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'en.json');
let bad = 0;
for (const f of files) {
  let d;
  try { d = walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); }
  catch (e) { console.log(`${f} ❌ INVALID JSON: ${e.message}`); bad++; continue; }
  const miss = Object.keys(en).filter(k => !(k in d));
  const extra = Object.keys(d).filter(k => !(k in en));
  const ph = Object.keys(en).filter(k => k in d && tok(en[k]) !== tok(d[k]));
  const ok = !miss.length && !extra.length && !ph.length;
  console.log(`${f.padEnd(12)} keys=${Object.keys(d).length} 缺=${miss.length} 多=${extra.length} 占位符错=${ph.length} ${ok ? '✅' : '⚠️'}`);
  [['缺', miss], ['多', extra], ['占位符', ph]].forEach(([t, a]) => a.length && console.log('  ' + t + ': ' + a.join(', ')));
  if (!ok) bad++;
}
console.log(bad ? 'FAIL' : '0 fail');
process.exit(bad ? 1 : 0);
