// games/snake/tools/gen-appicon.js — 合成 iOS 图标/启动屏源图(playwright 无头 canvas)
// 产出 resources/icon.png(1024²,粉彩圆角底 + 精选天使 + 底部粉蛇胶囊)
//     resources/splash.png(2732²,纯粉彩底 + 居中天使 512px)
// 用法: node games/snake/tools/gen-appicon.js   (playwright 走仓库根 node_modules)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const ANGEL = '0bep0x.webp';   // 精选:蓝天底/主体居中/明亮可爱(00wq72 偏暗、08aj1n 太密)
const OUT = path.join(ROOT, 'resources');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b64 = fs.readFileSync(path.join(ROOT, 'assets', 'angels', ANGEL)).toString('base64');
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const dataUrls = await page.evaluate(async (imgB64) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/webp;base64,' + imgB64; });

    function rr(x2, x, y, w, h, r) {
      x2.beginPath();
      x2.moveTo(x + r, y); x2.arcTo(x + w, y, x + w, y + h, r); x2.arcTo(x + w, y + h, x, y + h, r);
      x2.arcTo(x, y + h, x, y, r); x2.arcTo(x, y, x + w, y, r); x2.closePath();
    }

    // —— icon 1024²:粉彩底(iOS 自己切圆角,这里铺满)+ 天使占满内区 + 底部粉蛇胶囊 ——
    const ic = document.createElement('canvas'); ic.width = ic.height = 1024;
    const x = ic.getContext('2d');
    x.fillStyle = '#fdf3f7'; x.fillRect(0, 0, 1024, 1024);
    const pad = 72, iw = 1024 - pad * 2;
    rr(x, pad, pad, iw, iw, 120); x.save(); x.clip();
    x.drawImage(img, pad, pad, iw, iw);
    x.restore();
    rr(x, pad, pad, iw, iw, 120);
    x.lineWidth = 14; x.strokeStyle = '#f7b8d4'; x.stroke();
    // 底部粉蛇胶囊装饰(圆头 + 两眼)
    x.lineCap = 'round';
    x.strokeStyle = '#f7b8d4'; x.lineWidth = 64;
    x.beginPath(); x.moveTo(300, 924); x.quadraticCurveTo(512, 868, 724, 924); x.stroke();
    x.fillStyle = '#f7b8d4'; x.beginPath(); x.arc(724, 924, 44, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(710, 912, 12, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(740, 912, 12, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#5d4a57';
    x.beginPath(); x.arc(712, 914, 6, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.arc(742, 914, 6, 0, Math.PI * 2); x.fill();

    // —— splash 2732²:纯粉彩底 + 居中天使 512(圆角) ——
    const sp = document.createElement('canvas'); sp.width = sp.height = 2732;
    const y = sp.getContext('2d');
    y.fillStyle = '#fdf3f7'; y.fillRect(0, 0, 2732, 2732);
    const s = 512, sx = (2732 - s) / 2;
    rr(y, sx, sx, s, s, 64); y.save(); y.clip();
    y.drawImage(img, sx, sx, s, s);
    y.restore();

    return { icon: ic.toDataURL('image/png'), splash: sp.toDataURL('image/png') };
  }, b64);

  for (const [name, url] of Object.entries(dataUrls)) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    console.log(`resources/${name}.png ${buf.length} bytes`);
  }
  await browser.close();

  // 地面真值:文件存在且尺寸合理
  for (const [f, min] of [['icon.png', 50000], ['splash.png', 10000]]) {
    const sz = fs.statSync(path.join(OUT, f)).size;
    if (sz < min) throw new Error(`${f} too small: ${sz}`);
  }
  console.log('OK gen-appicon');
})();
