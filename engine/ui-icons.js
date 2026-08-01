// engine/ui-icons.js — 跨游戏共享的 UI 图标库(engine/assets/ui/*.webp)
//
// 为什么共用:关闭/返回/声音/星星/奖杯/锁…这些图标**每个游戏都要**,各画一套是纯浪费,
// 而且风格会飘。素材由 tools/gen-ui-icons.cjs 统一生成(本机 Flux),全仓只此一份。
//
// 用法(任意游戏):
//   <script src="../../engine/ui-icons.js?v=N"></script>   ← 放在 config.js 之后即可
//   el.innerHTML = UIIcon.img('star');                     // 回退 emoji 自动从 manifest 取
//   el.innerHTML = UIIcon.img('badge-gold', { cls: 'inl' });
//   img.src = UIIcon.src('close');
//
// ⚠ 路径为什么要在运行时算:
//   网页版页面在 games/<name>/index.html ⇒ 资源在 ../../engine/assets/ui/
//   iOS 包被 build-www 拍平,页面在 www/index.html ⇒ 资源在 engine/assets/ui/
//   两边不一样,而 <img src> 是**相对页面**不是相对 js 文件 ⇒ 写死哪个都会错一边。
//   这里从**已加载的 engine 脚本标签**反推 engine 根(它的路径已被 build-www 改对了),
//   两种布局都自动正确,构建脚本零改动。
const UIIcon = (() => {
  let BASE = null;
  function base() {
    if (BASE) return BASE;
    let root = 'engine/';
    try {
      const s = document.querySelector('script[src*="engine/"]');
      const m = s && s.src && s.src.match(/^(.*\/engine\/)/);
      if (m) root = m[1];
    } catch (e) {}
    BASE = root + 'assets/ui/';
    return BASE;
  }

  // 回退 emoji 表。同步 fetch 不可行 ⇒ boot 时 load() 一次;没加载也能用(回退空 alt)。
  let EMOJI = {};
  async function load() {
    try {
      const r = await fetch(base() + 'manifest.json');
      if (r.ok) EMOJI = await r.json();
    } catch (e) {}
    return EMOJI;
  }

  function src(name) { return base() + name + '.webp'; }

  // ⛔⛔ **方向性/几何字形不要用生成模型画**(games 仓实锤,试了两轮全废):
  //   back/undo 把 prompt 里的 "LEFT" 直接**写在图上**;restart 出两条没箭头的曲线;
  //   play 画成三角套三角;unlock 和 lock 长得一模一样(画不出「打开」的状态)。
  //   扩散模型擅长「实物」(锁/铃铛/奖杯),不擅长「箭头指向哪边」这种纯几何约束。
  //   ⇒ 这几个一律用内联 SVG:任意尺寸都清晰、形状 100% 正确、几百字节、还能跟着文字颜色走。
  const G = (d) => '<svg class="uic uic-g" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    + 'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const GLYPHS = {
    back:    G('<path d="M14 5 L7 12 L14 19"/><path d="M7 12 H19"/>'),
    forward: G('<path d="M10 5 L17 12 L10 19"/><path d="M17 12 H5"/>'),
    play:    G('<path d="M8 5 L19 12 L8 19 Z" fill="currentColor"/>'),
    pause:   G('<path d="M9 5 V19"/><path d="M15 5 V19"/>'),
    // menu 生成版是三条淡粉横杠,34px 下几乎看不见 ⇒ 也转 SVG(跟着文字颜色走,永远够对比)
    menu:    G('<path d="M4 7 H20"/><path d="M4 12 H20"/><path d="M4 17 H20"/>'),
    undo:    G('<path d="M8 8 H15 a4.5 4.5 0 0 1 0 9 H9"/><path d="M11 4.5 L7.5 8 L11 11.5"/>'),
    redo:    G('<path d="M16 8 H9 a4.5 4.5 0 0 0 0 9 H15"/><path d="M13 4.5 L16.5 8 L13 11.5"/>'),
    restart: G('<path d="M19.5 12 a7.5 7.5 0 1 1 -2.6-5.7"/><path d="M19.8 4 V9.2 H14.6"/>'),
    unlock:  G('<rect x="5" y="11" width="14" height="9" rx="2.4" fill="currentColor" stroke="none"/>'
             + '<path d="M9 11 V7.5 a3.5 3.5 0 0 1 6.9-0.8"/>'),
  };

  /**
   * 返回一个 <img> 字符串。
   * ⚠ **emoji 填进 alt** ⇒ 图缺了浏览器直接显示 emoji,零 JS 的天然回退
   *   (与 engine/canvas.js 的 makeArt「缺图回退」同一个思路:换图不改码,丢图不白屏)。
   * @param {string} name 图标名(见 engine/assets/ui/manifest.json)
   * @param {{cls?:string, emoji?:string, alt?:string}} [o] cls 追加 class;emoji 覆盖回退字符
   */
  function img(name, o) {
    o = o || {};
    const cls = o.cls ? ' ' + o.cls : '';
    // 几何字形走 SVG(见 GLYPHS 上面那段);其余是生成的位图
    if (GLYPHS[name]) return GLYPHS[name].replace('class="uic uic-g"', `class="uic uic-g${cls}"`);
    const fb = o.emoji != null ? o.emoji : (EMOJI[name] || '');
    return `<img class="uic${cls}" src="${src(name)}" alt="${fb}" decoding="async">`;
  }

  return { src, img, load, GLYPHS, get EMOJI() { return EMOJI; }, base };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UIIcon;
