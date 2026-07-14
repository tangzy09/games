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
