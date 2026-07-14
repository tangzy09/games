// ════════════════════════════════════════
// prover.js — 「这局还有解吗？」的主线程侧（DESIGN §3）。
//
// ⭐ 这是本作**唯一没有竞品有的按钮**，也是 App Store 4.3(a)（「又一个纸牌克隆」）的正面回答。
//   它必须是**一等公民 UI**（大按钮 + 「正在证明…」动画），不是设置里的小开关。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  let worker = null;
  // idle | proving | done
  const st = { phase: 'idle', result: null, deadFrom: null, ms: 0, t0: 0 };

  function ensure() {
    if (worker) return worker;
    try {
      worker = new Worker('js/prover.worker.js');
      worker.onmessage = (e) => {
        st.phase = 'done';
        st.result = e.data.result;
        st.deadFrom = e.data.deadFrom != null ? e.data.deadFrom : null;
        st.ms = e.data.ms;
        if (root.renderAll) root.renderAll();
      };
      worker.onerror = () => { st.phase = 'done'; st.result = 'unknown'; if (root.renderAll) root.renderAll(); };
    } catch (e) { worker = null; }
    return worker;
  }

  /** 问一次。⚠ 永远免费、永远不看广告（变现红线：这是产品的灵魂，不是道具）*/
  function ask(s) {
    const w = ensure();
    if (!w) { st.phase = 'done'; st.result = 'unknown'; return; }
    st.phase = 'proving';
    st.result = null; st.deadFrom = null;
    st.t0 = Date.now();
    w.postMessage({ seed: s.seed, drawCount: s.drawCount, moves: s.moves });
  }

  function reset() {
    st.phase = 'idle'; st.result = null; st.deadFrom = null; st.ms = 0;
  }

  /**
   * 结论文案 —— ⛔ **措辞死线**（DESIGN §2.1 / §3.3）。改这里前先把 CLAUDE.md 那张表读完。
   *   dead 时只陈述事实「第 N 步之后不再有解」，**绝不说「是你走错了」** ——
   *   盲打时走进死局往往是**信息论上不可避免**的，指责它会造出比「你坑我」更毒的差评。
   */
  function verdictKey() {
    if (st.result === 'solvable') return 'proveWin';
    if (st.result === 'dead') return st.deadFrom != null ? 'proveDeadAt' : 'proveDead';
    return 'proveUnknown';                     // ⭐ 「我们算不出来」是一等公民,不许伪装成 dead
  }

  root.Prover = { ask, reset, st, verdictKey };
})(typeof self !== 'undefined' ? self : this);
