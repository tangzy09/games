// ════════════════════════════════════════
// sound.js — WebAudio 合成音效（零素材，一个音频文件都不带）。
//
// 为什么不用引擎的 Sfx（「音效名 → wav」）：本作最重要的正反馈是 **streak 音高沿音阶上行**
// （DESIGN §8），需要可变音高 ⇒ 只能合成。合成还白送三样：包体零增长、随手加新音、
// 每次播放可以**微微不一样**（同一个采样听两百遍只剩噪音感 —— snake 实锤）。
//
// 结构（2026-08-02 打磨批）：
//   voice 层：osc / 噪声瞬态 / 滤波 / 包络   ——  单个音怎么发声
//   bus  层：master → compressor → destination，外加一条并行**混响**（IR 也是合成的）
//   Sound：12 个事件音（原来只有 6 个，而且收水晶/领奖/任务/超越全在复用 sweep ⇒ 听感上"什么都一样"）
//
// ⭐ **AudioContext 可注入**：所有发声函数吃 `c`（默认全局 ac），于是同一份代码能跑在
//   `OfflineAudioContext` 上离线渲染成 wav ⇒ `tools/audit-sfx.cjs` 能把每个音导出来**让人真的听**，
//   并对峰值/RMS/时长下断言。⛔ 音效是少数「测试全绿也可能很难听」的东西，只能靠耳朵收货。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  let ac = null;
  const on = () => (typeof AudioState === 'undefined' ? true : AudioState.sfxOn);

  function ctxOf() {
    if (!ac) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  // ── 每个 ctx 一套总线（离线渲染时会是另一个 ctx，所以按 ctx 缓存）──
  const BUS = new WeakMap();
  /** 合成一段混响脉冲：指数衰减的噪声。零素材，够用（我们要的只是"有点空间感"）*/
  function makeIR(c, dur, decay) {
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
    }
    return buf;
  }
  function busOf(c) {
    let b = BUS.get(c);
    if (b) return b;
    // ⚠ **响度**是这批打磨里最容易被忽略的一半：原来各音峰值只有 0.03~0.29，
    //   玩家必须把系统音量开到很大才听得见，然后被别的 app 的声音吓一跳。
    //   做法是标准的响度链路 —— master 推上去，靠压缩器把过响的压回来（而不是各处调 gain 猜）。
    //   目标：最响的 PERFECT ≈ 0.75 峰值，最轻的 tap ≈ 0.1，都由 audit-sfx.cjs 量。
    const master = c.createGain();
    master.gain.value = 3.2;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 8;
    comp.attack.value = 0.003; comp.release.value = 0.16;
    const verb = c.createConvolver();
    verb.buffer = makeIR(c, 0.9, 2.6);
    const wet = c.createGain();
    wet.gain.value = 0.16;                       // 干湿比：只要一点点，多了发糊
    master.connect(comp); comp.connect(c.destination);
    // ⚠ **短促的 UI 音必须绕开混响**：落子/点击本身只有 0.03~0.08s，挂上 0.9s 的混响尾
    //   会让每一次操作都"嗡"一下，快速连点时糊成一片（audit-sfx 量出来：place 发声 0.49s）。
    //   ⇒ 两个入口：wetIn 走混响（爆炸/庆祝类），dryIn 直连（操作反馈类）。
    const dryIn = c.createGain();
    dryIn.gain.value = 3.2;                      // ⚠ 与 master 同增益，只是不进混响（否则干音会明显偏小）
    dryIn.connect(comp);
    master.connect(verb); verb.connect(wet); wet.connect(comp);
    b = { master, dryIn, wet };
    BUS.set(c, b);
    return b;
  }

  // ── 每次播放微微不一样（防机械重复）。⚠ 可关：离线渲染要确定性，否则回归断言不稳 ──
  let jitter = true;
  const jit = (v, pct) => (jitter ? v * (1 + (Math.random() * 2 - 1) * pct) : v);

  /**
   * 一个乐音。opt: { f, f2（滑到的频率）, dur, type, gain, delay, q（带通）, detune }
   * 包络是「快起 + 指数落」——短音听着干脆，长音留尾。
   */
  function tone(c, t0, o) {
    const osc = c.createOscillator(), g = c.createGain();
    const f = jit(o.f, 0.012), dur = jit(o.dur, 0.06);
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, jit(o.f2, 0.012)), t0 + dur);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    const peak = o.gain == null ? 0.18 : o.gain;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.atk || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.q) {                                    // 带通：把方波/锯齿削软，避免刺耳
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = o.q;
      osc.connect(bp); node = bp;
    }
    const bus = busOf(c);
    node.connect(g); g.connect(o.dry ? bus.dryIn : bus.master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  /** 噪声瞬态（"嗒/沙"的那一下）。滤波类型 lp/hp/bp + 中心频率 */
  function noise(c, t0, o) {
    const dur = jit(o.dur, 0.08);
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.f2), t0 + dur);
    f.Q.value = o.q == null ? 1 : o.q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain == null ? 0.12 : o.gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const bus2 = busOf(c);
    src.connect(f); f.connect(g); g.connect(o.dry ? bus2.dryIn : bus2.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // C 大调音阶（两个八度）：streak 越长音越高 —— 最便宜也最上瘾的正反馈
  const SCALE = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50,
                 1174.66, 1318.51, 1396.91, 1567.98];

  // ── 12 个事件音。每个都写成 `render(c, t0)`，实时播放和离线渲染共用 ──
  const VOICES = {
    /** 落子：木块扣上 —— 低频 thump + 极短带通噪声。**全场最高频的音，必须干净不刺耳** */
    place(c, t) {
      tone(c, t, { f: 210, f2: 120, dur: 0.075, type: 'triangle', gain: 0.13, atk: 0.003, dry: 1 });
      noise(c, t, { f: 1900, f2: 700, dur: 0.035, gain: 0.05, q: 0.9, dry: 1 });
    },
    /** 消行：基音沿音阶上行 + 五度泛音 + 轻上滑；同时消多条再叠八度 */
    clear(c, t, streak, L) {
      const i = Math.min(Math.max((streak | 0) - 1, 0), SCALE.length - 1);
      const f = SCALE[i];
      tone(c, t, { f, f2: f * 1.02, dur: 0.22, type: 'sine', gain: 0.2 });
      tone(c, t, { f: f * 1.5, dur: 0.16, type: 'sine', gain: 0.07 });
      if (L >= 2) tone(c, t + 0.05, { f: f * 2, dur: 0.2, type: 'sine', gain: 0.12 });
      if (L >= 3) {
        tone(c, t + 0.1, { f: f * 3, dur: 0.22, type: 'sine', gain: 0.09 });
        noise(c, t + 0.02, { f: 5200, f2: 2600, dur: 0.16, gain: 0.045, q: 0.7 });   // 一点"碎裂"
      }
    },
    /** SWEEP / DEEP / PERFECT：上行琶音；PERFECT 最长，尾巴加一道高频闪光 */
    sweep(c, t, kind) {
      const notes = kind === 'perfect' ? [523, 659, 784, 1047, 1319]
                  : kind === 'deep'    ? [523, 659, 880]
                  : [523, 784];
      const step = kind === 'perfect' ? 0.075 : 0.07;
      notes.forEach((f, i) => tone(c, t + i * step, {
        f, dur: kind === 'perfect' ? 0.34 : 0.26, type: 'sine', gain: 0.18,
      }));
      if (kind === 'perfect') {
        noise(c, t + notes.length * step, { f: 2200, f2: 9000, dur: 0.5, gain: 0.06, q: 0.6, filter: 'bandpass' });
        tone(c, t + notes.length * step, { f: 1568, dur: 0.7, type: 'sine', gain: 0.1 });
      }
    },
    /** 结束：下行三音 + 失谐 + 低通渐闭 —— "泄气"而不是"惩罚" */
    over(c, t) {
      [392, 330, 262].forEach((f, i) => {
        tone(c, t + i * 0.13, { f, f2: f * 0.97, dur: 0.34, type: 'triangle', gain: 0.15, detune: i * -6 });
      });
      tone(c, t + 0.26, { f: 131, f2: 98, dur: 0.5, type: 'sine', gain: 0.09 });
    },
    /** 拾起 / 轻交互 */
    pick(c, t) { tone(c, t, { f: 620, f2: 760, dur: 0.055, type: 'sine', gain: 0.08, dry: 1 }); },
    /** 菜单按钮：比 pick 更轻更短（每次点按都会响，不能有存在感）*/
    tap(c, t) { tone(c, t, { f: 880, dur: 0.03, type: 'sine', gain: 0.05, dry: 1 }); },
    /** 非法落点：闷响，⛔ 不用刺耳的蜂鸣（那是惩罚，我们只是"放不下"）*/
    invalid(c, t) {
      tone(c, t, { f: 150, f2: 110, dur: 0.09, type: 'square', gain: 0.05, q: 2.5, dry: 1 });
    },
    /** 金币到账：n 越多叮当越密（封顶 5 颗，再多就吵）*/
    coin(c, t, n) {
      const k = Math.max(1, Math.min(n | 0 || 1, 5));
      for (let i = 0; i < k; i++) {
        tone(c, t + i * 0.055, { f: 1046 + i * 90, dur: 0.13, type: 'sine', gain: 0.1 });
        tone(c, t + i * 0.055, { f: 1568 + i * 130, dur: 0.09, type: 'sine', gain: 0.05 });
      }
    },
    /** 水晶 / 画像收集：玻璃质感（高频 + 五度 + 一点噪声亮点）*/
    collect(c, t) {
      tone(c, t, { f: 1318, dur: 0.2, type: 'sine', gain: 0.11 });
      tone(c, t + 0.04, { f: 1976, dur: 0.24, type: 'sine', gain: 0.07 });
      noise(c, t, { f: 6000, f2: 3000, dur: 0.1, gain: 0.035, q: 0.8 });
    },
    /** ✨ 妙手：上行小三度 + 闪光 —— 要一耳朵听出「这是夸你」*/
    brilliant(c, t) {
      [1046, 1318, 1568].forEach((f, i) => tone(c, t + i * 0.06, { f, dur: 0.26, type: 'sine', gain: 0.13 }));
      noise(c, t + 0.12, { f: 4000, f2: 11000, dur: 0.3, gain: 0.045, q: 0.6 });
    },
    /** 升级 / 解锁：大三和弦琶音（比 sweep 更"典礼"）*/
    levelUp(c, t) {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.08, { f, dur: 0.45, type: 'triangle', gain: 0.14 }));
    },
    /** 濒死心跳：低频双击。⚠ 音量必须很轻 —— 它是**氛围**，不是警报 */
    heartbeat(c, t) {
      tone(c, t, { f: 78, f2: 52, dur: 0.14, type: 'sine', gain: 0.11 });
      tone(c, t + 0.17, { f: 68, f2: 46, dur: 0.17, type: 'sine', gain: 0.075 });
    },
  };

  /** 实时播放：拿全局 ctx + currentTime，尊重音效开关 */
  function play(name, a, b) {
    if (!on()) return;
    const c = ctxOf(); if (!c) return;
    const v = VOICES[name]; if (!v) return;
    try { v(c, c.currentTime + 0.001, a, b); } catch (e) {}
  }

  const Sound = {
    place() { play('place'); },
    clear(streak, L) { play('clear', streak, L); },
    sweep(kind) { play('sweep', kind); },
    over() { play('over'); },
    pick() { play('pick'); },
    tap() { play('tap'); },
    invalid() { play('invalid'); },
    coin(n) { play('coin', n); },
    collect() { play('collect'); },
    brilliant() { play('brilliant'); },
    levelUp() { play('levelUp'); },
    heartbeat() { play('heartbeat'); },
    // 给离线渲染 / 测试用
    VOICES, SCALE,
    setJitter(v) { jitter = !!v; },
  };

  root.Sound = Sound;
})(typeof self !== 'undefined' ? self : this);
