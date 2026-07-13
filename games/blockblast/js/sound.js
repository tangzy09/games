// ════════════════════════════════════════
// sound.js — WebAudio 合成音效（零素材）。
// 为什么不用引擎的 Sfx：引擎 Sfx 是「音效名 → wav 文件」，音高固定；
// 而本作最重要的正反馈是 **streak 音高沿音阶上行**（DESIGN §8），需要可变音高 ⇒ 合成。
// 音效开关沿用引擎的 AudioState.sfxOn（设置里的同一个开关，不另起一套）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  let ac = null;
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

  /** 一个音：freq(Hz) / dur(s) / 波形 / 音量 / 延迟 */
  function blip(freq, dur, type, gain, delay) {
    if (!on()) return;
    const c = ctxOf(); if (!c) return;
    const t0 = c.currentTime + (delay || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain || 0.18, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  // C 大调音阶（含高八度）：streak 越长，音越高 —— 最便宜也最上瘾的正反馈
  const SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50];

  const Sound = {
    place()        { blip(180, 0.07, 'triangle', 0.12); },
    /** 消行：音高随 streak 上行；同时消多条再叠一个高音 */
    clear(streak, L) {
      const i = Math.min(Math.max(streak - 1, 0), SCALE.length - 1);
      blip(SCALE[i], 0.16, 'sine', 0.2);
      if (L >= 2) blip(SCALE[i] * 1.5, 0.18, 'sine', 0.14, 0.05);
      if (L >= 3) blip(SCALE[i] * 2, 0.2, 'sine', 0.12, 0.1);
    },
    /** SWEEP / PERFECT：上行琶音，PERFECT 最高最长 */
    sweep(kind) {
      const notes = kind === 'perfect' ? [523, 659, 784, 1047, 1319]
                  : kind === 'deep'    ? [523, 659, 880]
                  : [523, 784];
      notes.forEach((f, i) => blip(f, 0.3, 'sine', 0.2, i * 0.07));
    },
    over() { [392, 330, 262].forEach((f, i) => blip(f, 0.3, 'triangle', 0.16, i * 0.12)); },
    pick() { blip(320, 0.05, 'sine', 0.08); },
    invalid() { blip(120, 0.08, 'square', 0.06); },
  };

  root.Sound = Sound;
})(typeof self !== 'undefined' ? self : this);
