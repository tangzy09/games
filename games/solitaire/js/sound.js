// ════════════════════════════════════════
// sound.js — WebAudio 合成音效（零素材）。
//
// ⚠ 为什么这不是可有可无的润色：**纸牌游戏的声音就是它的质感**。
//   一副没有声音的牌，玩起来立刻显得廉价 —— 而 App Store 4.3 判的是
//   「unique **and high-quality** experience」，quality 这一半就靠这种地方。
//   （我们此前 `sfx: {}` 是空的：发牌、落牌、收牌、赢局，全程静音。）
//
// 沿用引擎的 AudioState.sfxOn 开关（不另起一套）。
// 纸牌的声音不是「音乐」，是**物理**：牌与牌的摩擦、落到桌面的闷响、收进 foundation 的清脆。
// ⇒ 主要靠**噪声**（摩擦/拍打）而不是纯音，纯音会像电子玩具。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  let ac = null;
  let noiseBuf = null;
  const on = () => (typeof AudioState === 'undefined' ? true : AudioState.sfxOn);

  function ctxOf() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  /** 一段白噪声（牌的摩擦声全靠它）*/
  function noise(c) {
    if (!noiseBuf) {
      const n = c.sampleRate * 0.25;
      noiseBuf = c.createBuffer(1, n, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  /** 噪声爆发（牌落在桌上 / 牌与牌摩擦）：freq = 带通中心，dur 越短越「脆」*/
  function thud(freq, dur, gain, delay, q) {
    if (!on()) return;
    const c = ctxOf(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const src = noise(c);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(freq, t0);
    bp.Q.value = q || 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);       // 极快起音 = 「啪」
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** 一个音（只用于收牌/赢局的「清脆感」，别多用，多了就像电子玩具）*/
  function blip(freq, dur, gain, delay, type) {
    if (!on()) return;
    const c = ctxOf(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const API = {
    /** 牌落到 tableau：闷、短 */
    place() { thud(420, 0.08, 0.28, 0, 0.9); thud(140, 0.06, 0.16, 0.005, 1.4); },

    /** 从牌堆翻一张：轻微的「刷」*/
    draw() { thud(2600, 0.05, 0.13, 0, 0.7); thud(900, 0.05, 0.10, 0.01, 0.9); },

    /** 收进 foundation：脆 + 一点上扬（这是正反馈，要好听）*/
    found(n) {
      thud(1800, 0.05, 0.16, 0, 1.6);
      const scale = [523, 587, 659, 698, 784, 880, 988, 1046];   // 收得越多，音越高
      blip(scale[Math.min(scale.length - 1, n || 0)], 0.14, 0.10, 0.01);
    },

    /** 搬一叠（supermove）：连续几下摩擦 */
    run(n) {
      const k = Math.min(6, Math.max(2, n || 2));
      for (let i = 0; i < k; i++) thud(500 + i * 60, 0.05, 0.13, i * 0.028, 1.0);
    },

    /**
     * ⭐ 连击收牌：**越连越爽**——这是全作最容易做出「手感」的一处，只上扬半个音是浪费。
     * 三档（4 秒窗口内连续收 foundation 才触发）：
     *   2-3 → 双音上行（清脆）
     *   4-6 → 大三和弦琶音 + 低频支撑（开始有「成串」的重量）
     *   7+  → 五音快速上行 + 鼓点 + 高频闪 + 余韵（「爆」的那一档）
     * 音高随 n 一路爬，封顶后**升八度继续爬** ⇒ 连到 10+ 声音仍在变化（停止变化 = 连击感当场消失）。
     */
    combo(n) {
      const k = Math.max(2, n || 2);
      const SC = [523, 587, 659, 698, 784, 880, 988, 1046];
      const oct = Math.floor((k - 2) / 8);
      const base = SC[Math.min(7, k - 2)] * Math.pow(2, Math.min(2, oct));
      thud(1800 + Math.min(600, k * 60), 0.05, 0.17, 0, 1.7);       // 收牌的「脆」
      if (k <= 3) {
        blip(base, 0.13, 0.12, 0);
        blip(base * 1.5, 0.17, 0.10, 0.06);
      } else if (k <= 6) {
        [1, 1.26, 1.5].forEach((r, i) => blip(base * r, 0.16, 0.11, i * 0.045));
        thud(220, 0.10, 0.12, 0, 1.0);                              // 低频支撑
      } else {
        [1, 1.26, 1.5, 2, 2.52].forEach((r, i) => blip(base * r, 0.20, 0.10, i * 0.038));
        thud(180, 0.16, 0.20, 0, 0.9);                              // 鼓点
        thud(5200, 0.05, 0.10, 0.02, 2.2);                          // 高频闪
        blip(base * 3, 0.30, 0.05, 0.20, 'sine');                   // 余韵
      }
    },

    /**
     * ⭐ Spider 专属：**凑齐一组 K→A**（13 张一次飞走）——这是蜘蛛全场最大的正反馈，
     * 此前它跟「随手挪一张牌」是同一记闷响（声音按 move 类型分派，而蜘蛛只有 tt/deal10
     * 两种 move ⇒ 最爽的一刻反而是哑的）。这里给它 Klondike 收牌的「脆」的加重版：
     * 13 张滑走的摩擦 + 大三和弦上行，且**第 n 组比第 n−1 组高**（8 组一路爬到胜利）。
     */
    set(n) {
      const k = Math.max(1, Math.min(8, n || 1));
      for (let i = 0; i < 7; i++) thud(900 + i * 130, 0.05, 0.11, i * 0.028, 0.9);   // 13 张滑走
      const base = 523 * Math.pow(2, (k - 1) / 12);                                   // 每组升半音
      [1, 1.26, 1.5, 2].forEach((r, i) => blip(base * r, 0.22, 0.11, 0.06 + i * 0.05));
      thud(200, 0.14, 0.16, 0.05, 0.9);                                               // 低频支撑
    },

    /** ⭐ Spider 专属：发一排（10 张同时落桌）——一记 place() 表达不了「哗地铺一排」 */
    dealRow() {
      for (let i = 0; i < 10; i++) thud(380 + i * 22, 0.055, 0.13, i * 0.022, 0.95);
      thud(150, 0.09, 0.12, 0.02, 1.3);
    },

    /** FreeCell 专属：牌进自由格 —— 比落桌更「空」的一声（提示它被架起来了，不是落到牌堆上）*/
    cell() { blip(880, 0.07, 0.07, 0, 'sine'); thud(520, 0.05, 0.14, 0, 1.6); },

    /** 撤销：反向的、略沉的一下 */
    undo() { thud(300, 0.07, 0.18, 0, 1.0); blip(330, 0.09, 0.05, 0.01); },

    /** 洗牌 / 发新的一局：一串摩擦声 */
    deal() {
      for (let i = 0; i < 9; i++) thud(1400 + Math.random() * 900, 0.045, 0.10, i * 0.045, 0.8);
    },

    /** ⭐ 赢局：大三和弦琶音 + 纸牌瀑布的「哗啦」 */
    win() {
      [523, 659, 784, 1046, 1319].forEach((f, i) => blip(f, 0.5, 0.13, i * 0.09));
      for (let i = 0; i < 16; i++) thud(1200 + Math.random() * 1400, 0.05, 0.07, 0.5 + i * 0.055, 0.8);
    },

    /** 走不通 / 非法落点：一声短促的低音（不刺耳，别惩罚玩家） */
    nope() { blip(180, 0.09, 0.06, 0, 'sine'); },

    /** 证明器出结论 */
    verdict(good) {
      if (good) { blip(659, 0.12, 0.09, 0); blip(988, 0.16, 0.08, 0.1); }
      else { blip(392, 0.14, 0.07, 0); blip(311, 0.2, 0.06, 0.12); }
    },
  };

  root.Snd = API;
})(typeof self !== 'undefined' ? self : this);
