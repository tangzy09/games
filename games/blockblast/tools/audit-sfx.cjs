// tools/audit-sfx.cjs — 音效验收：把 js/sound.js 的每个音**离线渲染成 wav**，导出给人听 + 自动断言。
//
// ⛔ 音效是少数「测试全绿也可能很难听」的东西 —— 唯一的收货方式是**真的听一遍**。
//   这个脚本负责把「听」这件事变得零成本：一条命令出 13 个 wav + 一个 all.wav（按顺序播全部）。
//
// 自动断言只挡**机器能挡的**那几类翻车：削顶（peak≥0.99）、静音（几乎没声）、
// 长得离谱（拖尾盖住下一次操作）。好不好听机器不管，那是耳朵的事。
//
// 用法: node games/blockblast/tools/audit-sfx.cjs     产物 C:/tmp/blockblast/sfx/
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const OUT = 'C:/tmp/blockblast/sfx';
const SOUND_JS = path.join(__dirname, '..', 'js', 'sound.js');

// name, 渲染时长(s), 参数, 期望的有效发声时长上限(s)
const CASES = [
  ['place', 0.5, [], 0.25],
  ['pick', 0.5, [], 0.25],
  ['tap', 0.4, [], 0.2],
  ['invalid', 0.5, [], 0.3],
  ['clear-s1', 1.2, ['clear', 1, 1], 0.9],
  ['clear-s5', 1.2, ['clear', 5, 1], 0.9],
  ['clear-s8-L3', 1.4, ['clear', 8, 3], 1.1],
  ['sweep', 1.6, ['sweep', 'sweep'], 1.3],
  ['sweep-deep', 1.8, ['sweep', 'deep'], 1.5],
  ['sweep-perfect', 2.4, ['sweep', 'perfect'], 2.1],
  ['over', 1.8, [], 1.5],
  ['coin', 1.2, ['coin', 3], 0.9],
  ['collect', 1.0, [], 0.8],
  ['brilliant', 1.4, [], 1.1],
  ['levelUp', 1.6, [], 1.4],
  ['heartbeat', 1.0, [], 0.8],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const src = fs.readFileSync(SOUND_JS, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ content: src });
  await page.evaluate(() => { Sound.setJitter(false); });   // 离线渲染要确定性

  const rows = [];
  const wavs = [];
  for (const [label, dur, args, maxTail] of CASES) {
    const voice = args.length ? args[0] : label;
    const rest = args.slice(1);
    const r = await page.evaluate(async ([voice, rest, dur]) => {
      const SR = 44100;
      const c = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
      Sound.VOICES[voice](c, 0.02, rest[0], rest[1]);
      const buf = await c.startRendering();
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      let peak = 0, sum = 0, last = 0;
      for (let i = 0; i < L.length; i++) {
        const v = Math.max(Math.abs(L[i]), Math.abs(R[i]));
        if (v > peak) peak = v;
        sum += v * v;
        if (v > 0.001) last = i;
      }
      // 转 16bit 立体声 wav（base64 传回 node）
      const n = L.length, bytes = new Uint8Array(44 + n * 4), dv = new DataView(bytes.buffer);
      const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); wr(8, 'WAVE');
      wr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
      wr(36, 'data'); dv.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      return { peak, rms: Math.sqrt(sum / L.length), tail: last / SR, b64: btoa(bin) };
    }, [voice, rest, dur]);

    fs.writeFileSync(path.join(OUT, label + '.wav'), Buffer.from(r.b64, 'base64'));
    wavs.push({ label, b64: r.b64 });
    const bad = [];
    if (r.peak >= 0.99) bad.push('削顶');
    if (r.peak < 0.05) bad.push('几乎没声');
    if (r.rms < 0.002) bad.push('RMS 过低');
    if (r.tail > maxTail) bad.push(`拖尾 ${r.tail.toFixed(2)}s > ${maxTail}s`);
    rows.push({ label, peak: r.peak, rms: r.rms, tail: r.tail, bad });
  }

  // 一次听完：按顺序拼成 all.wav（每个之间留 0.35s 静音）
  const GAP = Math.round(44100 * 0.35) * 4;
  const bodies = wavs.map(w => Buffer.from(w.b64, 'base64').subarray(44));
  const total = bodies.reduce((a, b) => a + b.length + GAP, 0);
  const head = Buffer.from(wavs[0].b64, 'base64').subarray(0, 44);
  head.writeUInt32LE(36 + total, 4); head.writeUInt32LE(total, 40);
  fs.writeFileSync(path.join(OUT, 'all.wav'),
    Buffer.concat([head, ...bodies.flatMap(b => [b, Buffer.alloc(GAP)])]));

  await browser.close();

  console.log('\n音效                 峰值    RMS     发声时长   判定');
  let fail = 0;
  for (const r of rows) {
    if (r.bad.length) fail++;
    console.log(
      r.label.padEnd(20) +
      r.peak.toFixed(3).padStart(6) +
      r.rms.toFixed(4).padStart(8) +
      (r.tail.toFixed(2) + 's').padStart(10) + '   ' +
      (r.bad.length ? '✗ ' + r.bad.join(' / ') : '✓')
    );
  }
  console.log(`\n${rows.length} 个音 → ${OUT}\n⭐ 一次听完：${OUT}/all.wav`);
  if (fail) { console.error(`✗ ${fail} 个音有问题`); process.exit(1); }
  console.log('✓ 机器能挡的都过了 —— 好不好听请**真的听一遍** all.wav');
})().catch(e => { console.error(e); process.exit(1); });
