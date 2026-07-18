/* feedback-client.js — 全 app 通用的意见反馈客户端(drop-in,vanilla JS,零依赖)。
   新 app 接入 = 复制本文件 + 改下面 CONFIG.app + 放一个入口按钮调 Feedback.openForm()。
   端点是共享 hub,填对 app 名即可在总览面板按 app 归类。

   设计依据见全局 skill `app-ratings-feedback`:
   - 站内一页式表单,不跳出、不用 mailto(安卓/国内大量无邮件客户端)
   - 诊断静默打包;端点不通入本地队列,下次启动补发,对用户一律显示「已收到」
   - 表单内绝不问「你喜欢这个 app 吗/会给几星」(Google 明禁的前置问题)
   文案走 i18n:若 app 有 reg()/t() 就用,否则回退内置中英。类名 fbk- 前缀 + 内联样式。 */

const FB_CONFIG = {
  app: "angel-snake",   // 面板归类名(feedback.ai-speeds.com/admin)
  endpoint: "https://feedback.ai-speeds.com/api/feedback",
  queueKey: "fbkQueue_v1",
};

/* ---- 文案:优先用 app 自己的 i18n,没有就用内置双语 ---- */
const _FB_STR = {
  "fbk.title": ["Send feedback", "意见反馈"],
  "fbk.desc": ["Bugs, ideas, anything — read by a human.", "报 bug、提建议、随便说 —— 有人看。"],
  "fbk.placeholder": ["What happened? One line is enough.", "说一句就行,发生了什么?"],
  "fbk.cat.bug": ["Bug", "程序问题"],
  "fbk.cat.idea": ["Idea", "功能建议"],
  "fbk.cat.other": ["Other", "其他"],
  "fbk.send": ["Send", "发送"],
  "fbk.cancel": ["Cancel", "取消"],
  "fbk.empty": ["Write a line first.", "先写一句吧。"],
  "fbk.thanks": ["Got it — thank you.", "收到了,谢谢。"],
};
function _fbLang() {
  const l = (typeof I18N !== "undefined" && I18N.lang) || (typeof navigator !== "undefined" && navigator.language) || "en";
  return /^zh/i.test(l) ? "zh" : "en";
}
function _t(key) {
  if (typeof T === "function") {
    const s = T(key);
    if (s && s !== key) return s; // snake I18N 有该 key(10 语)
  }
  const pair = _FB_STR[key];
  return pair ? pair[_fbLang() === "zh" ? 1 : 0] : key;
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => (window.__lastError = { msg: String(e.message || ""), at: Date.now() }));
  window.addEventListener("unhandledrejection", (e) => (window.__lastError = { msg: "unhandled: " + String((e.reason && e.reason.message) || e.reason || ""), at: Date.now() }));
}

var Feedback = (function () {
  const CATS = ["bug", "idea", "other"]; // 内容型 app 可加 "content" + 就地纠错,见 skill

  function appVersion() {
    const s = document.querySelector('script[src*="feedback-client"],script[src*="app.js"]');
    const m = s && s.getAttribute("src").match(/[?&]v=([^&]+)/);
    return (m && m[1]) || "dev";
  }

  function diagnostics(extra) {
    const cap = typeof window !== "undefined" && window.Capacitor;
    return Object.assign(
      {
        version: appVersion(),
        platform: (cap && cap.getPlatform && cap.getPlatform()) || "web",
        ua: navigator.userAgent,
        lang: _fbLang(),
        screen: window.innerWidth + "x" + window.innerHeight,
        online: navigator.onLine,
        lastError: window.__lastError || null,
      },
      extra || {}
    );
  }

  function queue(payload) {
    try {
      const q = JSON.parse(localStorage.getItem(FB_CONFIG.queueKey) || "[]");
      q.push(payload);
      localStorage.setItem(FB_CONFIG.queueKey, JSON.stringify(q.slice(-20)));
    } catch (e) {}
  }

  async function post(payload) {
    const r = await fetch(FB_CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error("http " + r.status);
    return true;
  }

  async function submit(text, category, context) {
    const payload = {
      app: FB_CONFIG.app,
      text: String(text || "").trim().slice(0, 2000),
      category: category || "other",
      diag: diagnostics(context),
      ts: Date.now(),
    };
    if (!payload.text) return { ok: false };
    try {
      await post(payload);
      return { ok: true };
    } catch (e) {
      queue(payload);
      return { ok: true, queued: true };
    }
  }

  async function flushQueue() {
    let q;
    try {
      q = JSON.parse(localStorage.getItem(FB_CONFIG.queueKey) || "[]");
    } catch (e) {
      return;
    }
    if (!q.length || !navigator.onLine) return;
    const left = [];
    for (const p of q) {
      try {
        await post(p);
      } catch (e) {
        left.push(p);
      }
    }
    localStorage.setItem(FB_CONFIG.queueKey, JSON.stringify(left));
  }

  // 粉彩风(与 Angel Snake 主界面一致)
  const S = {
    ov: "position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(122,92,114,.45);padding:20px",
    card: "max-width:360px;width:100%;background:#fff;border-radius:22px;padding:22px;box-shadow:0 16px 48px rgba(0,0,0,.24);color:#7a5c72",
    title: "font-weight:800;font-size:19px;margin:0 0 4px;color:#d6336c",
    desc: "color:#a85d7a;font-size:12.5px;margin:0 0 14px;line-height:1.5",
    cats: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px",
    chip: "cursor:pointer;font:inherit;font-weight:600;font-size:13px;padding:8px 14px;border-radius:999px;border:0;background:#f6d5e5;color:#7a5c72",
    chipOn: "cursor:pointer;font:inherit;font-weight:700;font-size:13px;padding:8px 14px;border-radius:999px;border:0;background:#e79cc2;color:#fff",
    ta: "width:100%;box-sizing:border-box;min-height:100px;resize:vertical;font:inherit;font-size:14px;color:#7a5c72;background:#fdf3f7;border:1px solid #f6d5e5;border-radius:14px;padding:11px",
    send: "cursor:pointer;font:inherit;font-weight:800;font-size:16px;color:#fff;background:linear-gradient(#f489b6,#e3629d);width:100%;padding:13px;border:0;border-radius:999px;margin-top:14px",
    cancel: "cursor:pointer;font:inherit;font-size:13px;color:#a85d7a;background:transparent;border:0;width:100%;padding:10px;margin-top:2px",
    err: "color:#e0544f;font-size:12.5px;margin-top:8px;text-align:center",
    ok: "text-align:center;color:#d6336c;font-weight:800;font-size:17px;padding:20px 0",
  };

  function openForm(opts) {
    opts = opts || {};
    const cats = opts.cats || CATS;
    let cat = opts.category || cats[0];
    const old = document.getElementById("fbk-ov");
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = "fbk-ov";
    el.style.cssText = S.ov;

    const paint = () => {
      const chips = cats
        .map((c) => '<button style="' + (c === cat ? S.chipOn : S.chip) + '" data-fbk-cat="' + c + '">' + _t("fbk.cat." + c) + "</button>")
        .join("");
      el.innerHTML =
        '<div style="' + S.card + '" role="dialog" aria-modal="true">' +
        '<h3 style="' + S.title + '">' + (opts.title || _t("fbk.title")) + "</h3>" +
        '<p style="' + S.desc + '">' + (opts.desc || _t("fbk.desc")) + "</p>" +
        (cats.length > 1 ? '<div style="' + S.cats + '">' + chips + "</div>" : "") +
        '<textarea style="' + S.ta + '" data-fbk-text placeholder="' + _t("fbk.placeholder") + '"></textarea>' +
        '<button style="' + S.send + '" data-fbk="send">' + _t("fbk.send") + "</button>" +
        '<button style="' + S.cancel + '" data-fbk="cancel">' + _t("fbk.cancel") + "</button>" +
        "</div>";
      bind();
    };
    const bind = () => {
      const ta = el.querySelector("[data-fbk-text]");
      el.querySelectorAll("[data-fbk-cat]").forEach((b) => {
        b.onclick = () => {
          const keep = ta ? ta.value : "";
          cat = b.getAttribute("data-fbk-cat");
          paint();
          const t2 = el.querySelector("[data-fbk-text]");
          if (t2) { t2.value = keep; t2.focus(); }
        };
      });
      el.querySelectorAll("[data-fbk]").forEach((b) => {
        b.onclick = async () => {
          if (b.getAttribute("data-fbk") === "cancel") return el.remove();
          const text = (ta && ta.value) || "";
          if (!text.trim()) {
            let e = el.querySelector(".fbk-err");
            if (!e) { e = document.createElement("div"); e.className = "fbk-err"; e.style.cssText = S.err; el.firstChild.appendChild(e); }
            e.textContent = _t("fbk.empty");
            return;
          }
          b.disabled = true;
          await submit(text, cat, opts.context);
          el.firstChild.innerHTML = '<div style="' + S.ok + '">✓ ' + _t("fbk.thanks") + "</div>";
          setTimeout(() => el.remove(), 1400);
        };
      });
    };
    el.addEventListener("click", (e) => { if (e.target === el) el.remove(); });
    document.body.appendChild(el);
    paint();
    const ta = el.querySelector("[data-fbk-text]");
    if (ta) ta.focus();
  }

  /* 内容型 app 的就地纠错:传内容 ID + 快照(字段名去源码核实!),打包进 content 分类 */
  function reportContent(contentId, snapshot, title, desc) {
    openForm({
      category: "content",
      cats: ["content"],
      context: { question: Object.assign({ id: contentId }, snapshot) },
      title: title,
      desc: desc,
    });
  }

  return { submit, flushQueue, openForm, reportContent, diagnostics };
})();

if (typeof window !== "undefined") window.Feedback = Feedback;
