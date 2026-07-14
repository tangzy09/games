#!/usr/bin/env node
/**
 * build.cjs — App Store App Preview 一键出片。
 *
 *   stage.html --(Playwright recordVideo)--> webm --(ffmpeg)--> 886x1920 H.264 + stereo AAC
 *
 * ⚠ 苹果的硬规格（错一条就退回）：
 *   886×1920（一稿通吃 iPhone 全槽位） / 15-30s / **≤30fps** / H.264 / **stereo AAC**
 *   —— mono AAC 会在苹果转码段 `FAILED MOV_RESAVE_STEREO`，混音链尾必须 aformat=stereo。
 * ⚠ 内容红线：**只许 app 真实画面 + 文字浮层**。
 * ⚠ recordVideo 录不到页面音频 ⇒ 音轨全在 ffmpeg 阶段合成（BGM + 音效）。
 */
'use strict';
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');       // 仓库根（stage 和 app 必须同源）
const OUTDIR = 'C:/tmp/solitaire/preview';
const REC = path.join(OUTDIR, 'rec');
const OUT = path.join(OUTDIR, 'solitaire-preview.mp4');
const PORT = 8171;
const W = 886, H = 1920, FPS = 30;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.wav': 'audio/wav' };

function serve() {
  return new Promise((res, rej) => {
    const srv = http.createServer((q, r) => {
      let u = decodeURIComponent(q.url.split('?')[0]);
      if (u.endsWith('/')) u += 'index.html';
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    });
    srv.on('error', rej);
    srv.listen(PORT, () => res(srv));
  });
}

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.rmSync(REC, { recursive: true, force: true });
  fs.mkdirSync(REC, { recursive: true });

  // ① BGM（合成，零素材零版权）
  const bgm = path.join(__dirname, 'bgm.wav');
  if (!fs.existsSync(bgm)) execSync(`node "${path.join(__dirname, 'gen-bgm.cjs')}" "${bgm}"`, { stdio: 'inherit' });

  // ② 录像
  const srv = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,                                  // ⚠ dsf 不放大录制面，别靠它提分辨率
    recordVideo: { dir: REC, size: { width: W, height: H } },
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));

  console.log('录制中…');
  await page.goto(`http://127.0.0.1:${PORT}/games/solitaire/tools/preview/stage.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
  await page.waitForTimeout(700);                          // 定帧（否则末尾被截）

  const audio = await page.evaluate(() => window.__audio);
  const caps = await page.evaluate(() => window.__caps);
  await ctx.close();                                       // ⚠ close 才 flush 视频
  await browser.close();
  srv.close();
  if (errs.length) console.warn('页面 error:', errs.slice(0, 3));

  const webm = fs.readdirSync(REC).find(f => f.endsWith('.webm'));
  if (!webm) throw new Error('没录到视频');
  const src = path.join(REC, webm);
  console.log(`原始 ${(fs.statSync(src).size / 1024 / 1024).toFixed(1)}MB`);

  // ③ 音效（现合成，不需要素材）
  const SFX = {
    think: 'sine=frequency=520:duration=0.10,volume=0.22',
    good:  'sine=frequency=784:duration=0.16,volume=0.30',
    pop:   'sine=frequency=988:duration=0.12,volume=0.26',
    win:   'sine=frequency=1046:duration=0.5,volume=0.30',
  };
  const ins = [`-i "${src}"`, `-i "${bgm}"`];
  const parts = [];
  const mixIn = [];
  (audio.sfx || []).forEach((s, i) => {
    const f = SFX[s.type];
    if (!f) return;
    parts.push(`${f},adelay=${Math.round(s.t * 1000)}:all=1,aformat=channel_layouts=stereo[s${i}]`);
    mixIn.push(`[s${i}]`);
  });

  // BGM：先归一到 -20 LUFS 再压音量（否则电平乱），静态增益 = 恒定响度（不随画面起伏）
  parts.push(`[1:a]aloop=loop=-1:size=2e9,atrim=0:30,loudnorm=I=-20,volume=0.42,aformat=channel_layouts=stereo[bg]`);
  mixIn.push('[bg]');

  const amix = `${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:duration=first,` +
               `alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11,` +
               `aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[aout]`;   // ⭐ stereo（苹果硬要求）
  const fc = [...parts, amix].join(';');

  const cmd = [
    'ffmpeg -y',
    ...ins,
    `-filter_complex "${fc}"`,
    '-map 0:v -map "[aout]"',
    `-vf "fps=${FPS},scale=${W}:${H}:flags=lanczos"`,
    '-c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow',
    '-c:a aac -b:a 192k -ac 2',                            // ⭐ -ac 2 双保险
    '-movflags +faststart',
    '-t 30',                                               // 硬上限 30s
    `"${OUT}"`,
  ].join(' ');

  console.log('转码 + 混音…');
  execSync(cmd, { stdio: ['ignore', 'ignore', 'pipe'] });

  // ④ 独立复查（不信自己的转述 —— 规格错一条就被苹果退回）
  const probe = JSON.parse(execSync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${OUT}"`).toString());
  const v = probe.streams.find(s => s.codec_type === 'video');
  const a = probe.streams.find(s => s.codec_type === 'audio');
  const dur = parseFloat(probe.format.duration);
  const fpsNum = eval(v.r_frame_rate);

  const checks = [
    [`尺寸 ${v.width}×${v.height}`, v.width === W && v.height === H],
    [`时长 ${dur.toFixed(1)}s`, dur >= 15 && dur <= 30],
    [`帧率 ${fpsNum.toFixed(0)}fps`, fpsNum <= 30],
    [`视频 ${v.codec_name}`, v.codec_name === 'h264'],
    [`音频 ${a && a.codec_name}`, a && a.codec_name === 'aac'],
    [`⭐ 声道 ${a && a.channels}（必须 2 —— mono 会被苹果转码打回）`, a && a.channels === 2],
  ];
  console.log('\n规格自检：');
  let bad = 0;
  checks.forEach(([m, ok]) => { if (!ok) bad++; console.log(`  ${ok ? 'OK ' : 'X  '}${m}`); });

  fs.writeFileSync(path.join(OUTDIR, 'caps.json'), JSON.stringify(caps, null, 2));
  console.log(`\n${bad ? '⛔ ' + bad + ' 项不合规' : '✓ 规格全部合规'}`);
  console.log(`→ ${OUT}  (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)}MB)`);
  process.exit(bad ? 1 : 0);
})();
