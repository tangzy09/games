// test-noclone.js — 商标词门禁（Hasbro "Connect 4 / Connect Four" 是活跃注册商标）
// 见 DESIGN.md §0.1 / §0.2、~/.claude/skills/avoiding-clone-spam-rejection。
//
// ⭐ 判据（面向用户的串 vs 路径/代码）：
//   面向用户的串 = 最终会被玩家看到/读屏读到，或者作为 metadata 提交进 Apple/Google
//     审核队列与商店记录的文本 —— locale 字符串「值」、<title>、<meta content>、
//     alt/aria-label、HTML 文本节点、capacitor.config.json 里会写进 Bundle ID/
//     商店记录的字段（appId/appName…）、review-notes 模板正文。
//   路径/代码 = 只用来让源码正确运行、从不作为内容提交给任何人看的记号 ——
//     文件路径注释（如 css 文件头 "games/connect4/css/game.css"）、
//     <script src>/<link href> 相对路径、CSS url(...) 资源路径、
//     HTML/CSS 注释里的开发笔记、id/class 选择器名、JS 变量名/对象键名。
//   ⚠ 边界不是「用户会不会在屏幕上看到」，是「这份内容会不会被提交进 Apple/Google
//   的审核队列或商店记录」——appId 长得像技术标识符、UI 里用户也看不到，但它会写进
//   App Store Connect / Play Console 的 Bundle ID 记录，所以仍要扫；反过来 css 里的
//   路径注释、script src 的相对路径永远只留在仓库和源码里，不提交给任何审核队列，
//   予以放行。这条判据是本文件唯一的取舍依据，改判据前先想清楚会不会破坏它。
//
// 已知边界（有意为之，不是遗漏）：
//   - css 的 url(...) 内容整体挖空后再扫——resource path，不是文本。
//   - review-notes 模板走「文件名含 review+note」发现式匹配，不是白名单固定文件名；
//     只扫文件名，不扫目录里其它文件。
//   - js/ 一律不扫（本门禁职责是 P2a Task 7 划定的四类面向用户表面，js 是代码）。

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 商标词：Connect 4 / Connect Four。
// [\s_-]* 容许空格/连字符/下划线任意组合与个数（含零个，抓 "connect4" / "Connect4"）；
// \b 防止命中 "reconnect four"（"re" 是词字符，"connect" 前没有词边界，不会误伤）。
const TRADEMARK_RE = /\bconnect[\s_-]*(4|four)\b/i;

function clean(s) {
  // NFKC 折叠全角字母数字（Ｃｏｎｎｅｃｔ４ → Connect4）；
  // 剔除零宽字符（U+200B-200D/FEFF）防止用零宽间隔拆词规避。
  return s.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function assertClean(value, where) {
  const v = clean(String(value));
  assert(!TRADEMARK_RE.test(v), `${where} 含商标词 "Connect 4/Connect Four": "${value}"`);
}

let checked = 0;

function walkValues(o, fn, trail) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object') walkValues(v, fn, trail + '.' + k);
    else if (typeof v === 'string') { fn(v, trail + '.' + k); checked++; }
  }
}

// ---- ① locales/*.json —— 只扫字符串「值」，不扫 key；目录下全部文件自动纳入 ----
// （不写死 en.json / zh-CN.json 两个文件名：以后加语言，readdirSync 自动覆盖新文件。）
const localesDir = path.join(ROOT, 'locales');
for (const f of fs.readdirSync(localesDir).filter((n) => n.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(localesDir, f), 'utf8'));
  walkValues(j, (v, at) => assertClean(v, `locales/${f} ${at}`), '');
}

// ---- ② index.html —— 只抽「会渲染/会提交」的子串，不扫 <script> 代码块与注释 ----
{
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // 去掉 HTML 注释（开发笔记，允许提内部代号）与 <script>…</script>（代码不是文本节点）。
  const noComments = raw.replace(/<!--[\s\S]*?-->/g, '');
  const noScript = noComments.replace(/<script[\s\S]*?<\/script>/gi, '');

  const titleM = noScript.match(/<title>([^<]*)<\/title>/i);
  if (titleM) { assertClean(titleM[1], 'index.html <title>'); checked++; }

  // <meta ... content="...">：description/keywords/og:*/twitter:*/application-name 等。
  for (const m of noScript.matchAll(/<meta\b[^>]*\bcontent="([^"]*)"/gi)) {
    assertClean(m[1], 'index.html <meta content>'); checked++;
  }

  // alt= / aria-label=：读屏能读到，属于面向用户，不是纯 DOM 钩子。
  for (const m of noScript.matchAll(/\b(?:alt|aria-label)="([^"]*)"/gi)) {
    assertClean(m[1], 'index.html alt/aria-label'); checked++;
  }

  // 剩余文本节点：整体去掉标签（连同 src=/href=/id=/class= 等属性一起丢弃 —— 那些是
  // 路径/DOM 钩子不是用户可见文本），只留标签之间可能出现的裸文本。
  const textOnly = noScript.replace(/<[^>]*>/g, ' ');
  assertClean(textOnly, 'index.html 文本节点'); checked++;
}

// ---- ③ css/*.css —— 去掉注释（路径头注释合法藏内部代号）与 url(...) 资源路径后再扫 ----
const cssDir = path.join(ROOT, 'css');
for (const f of fs.readdirSync(cssDir).filter((n) => n.endsWith('.css'))) {
  const raw = fs.readFileSync(path.join(cssDir, f), 'utf8');
  const noComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const noUrls = noComments.replace(/url\([^)]*\)/gi, 'url()');
  assertClean(noUrls, `css/${f}`); checked++;
}

// ---- ④ 将来的文件：不存在就跳过，一旦出现自动纳入 ----

// capacitor.config.json：appId 会写进 App Store Connect / Play Console 的 Bundle ID
// 记录——虽然长得像技术标识符、UI 里用户也看不到，但它提交给了审核队列，照样要扫。
const capPath = path.join(ROOT, 'capacitor.config.json');
if (fs.existsSync(capPath)) {
  const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
  walkValues(cap, (v, at) => assertClean(v, `capacitor.config.json ${at}`), '');
}

// review-notes 模板：命名还没定，用「文件名含 review 又含 note(s)」做发现式匹配
// （大小写/分隔符不敏感），不管以后叫 review-notes.md / reviewNotes.txt /
// review_notes.json 哪种都能自动被捞到，不必再改这份测试。
function findReviewNotesFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findReviewNotesFiles(p));
    else if (/review/i.test(entry.name) && /note/i.test(entry.name)) out.push(p);
  }
  return out;
}
for (const p of findReviewNotesFiles(ROOT)) {
  const raw = fs.readFileSync(p, 'utf8');
  assertClean(raw, path.relative(ROOT, p));
  checked++;
}

assert(checked > 0, 'test-noclone 一条断言都没跑，门禁形同虚设');
const nLocales = fs.readdirSync(localesDir).filter((n) => n.endsWith('.json')).length;
console.log(`test-noclone OK（核验 ${checked} 处字符串，覆盖 ${nLocales} 个 locale 文件）`);
