// ════════════════════════════════════════
// share.js — 分享（跨游戏共用件；第三个用例出现 ⇒ 按 drag.js 的老规矩抽进 engine）。
//
// ⭐ **分享出去的链接一律指向 App Store，不是网页版**（2026-08-01 用户定的，全游戏适用）。
//   为什么：分享是这类产品最便宜的获客渠道，而网页版**不产生下载量、不产生评分、
//   不进 App Store 排名** —— 把朋友导到网页版，等于把一次真实转化白送掉。
//
// ⚠ 但 App Store 链接**带不了 seed / 局号**（苹果不透传自定义 query 给 app）。
//   所以「一起打同一局」这种玩法价值必须靠**文案里的局号**兑现 ——
//   各游戏都有局号直输入口（solitaire 的 #️⃣、blockblast 的种子查询），
//   分享文案写上「局号 #1234」朋友装完照样能进同一局。
//   ⛔ 只换链接、不把局号写进文案 = 悄悄把分享的玩法价值删掉了。
//
// 未上架的游戏（GAME_CONFIG.appStoreId 为空）**自动回退到网页链接** ——
// 分享出去一个 404 比分享网页版更差。
//
// 用法（GAME_CONFIG 里声明）：
//   appStoreId: '6790861224',            // ASC 的数字 Apple ID；没上架就别填
//   webUrl: 'https://cards.ai-speeds.com/',
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const cfg = () => root.GAME_CONFIG || {};

  /** App Store 链接（不带国家码 —— 苹果会自动跳到用户所在地区的商店）*/
  function storeUrl() {
    const id = cfg().appStoreId;
    return id ? 'https://apps.apple.com/app/id' + id : null;
  }

  /** 网页版链接（回退用；本地起服务时用当前地址，方便调试）*/
  function webUrl() {
    if (root.location && /^https?:/.test(root.location.protocol)
        && !/^(localhost|127\.|192\.168\.)/.test(root.location.hostname)) {
      return root.location.origin + root.location.pathname;
    }
    return cfg().webUrl || (root.location ? root.location.origin + root.location.pathname : '');
  }

  /** ⭐ 分享该用的链接：优先 App Store，没上架才回退网页版。 */
  function link() { return storeUrl() || webUrl(); }

  /** 上架了没（UI 用它决定要不要显示「局号写进文案」的提示）*/
  function hasStore() { return !!cfg().appStoreId; }

  /**
   * 分享一段文字（自动附上链接）。navigator.share → 剪贴板降级。
   * @returns Promise<'shared'|'copied'|'failed'>
   */
  function text(msg, extraUrl) {
    const url = extraUrl || link();
    const full = msg + (url ? '\n' + url : '');
    if (root.navigator && navigator.share) {
      return navigator.share({ text: full }).then(() => 'shared').catch(() => 'failed');
    }
    if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(full).then(() => 'copied').catch(() => 'failed');
    }
    return Promise.resolve('failed');
  }

  /**
   * 分享一张图（战绩卡/壁纸），文字里照样带 App Store 链接。
   * 不支持带文件分享的环境 ⇒ 退回纯文字分享（而不是什么都不做）。
   * @returns Promise<'shared'|'copied'|'failed'>
   */
  function files(file, msg) {
    const url = link();
    const full = (msg || '') + (url ? '\n' + url : '');
    if (root.navigator && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], text: full }).then(() => 'shared').catch(() => 'failed');
    }
    return text(msg || '');
  }

  root.Share = { storeUrl, webUrl, link, hasStore, text, files };
})(typeof self !== 'undefined' ? self : this);
