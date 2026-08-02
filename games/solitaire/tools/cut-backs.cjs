// games/solitaire/tools/cut-backs.cjs — 把 gen-backs 出的 1024² 原图切成入库规格的牌背
//
// 用法：node games/solitaire/tools/cut-backs.cjs
// 输入：C:/tmp/solitaire/backs-raw/<id>.png   输出：games/solitaire/assets/backs/<id>.jpg
//
// 规格与既有 14 张一致：**360×512 JPEG**（牌背是 cover 裁切进牌面的，比例只要接近牌就行）。
// ⚠ 中心裁 62% 再缩：一是避开 Flux 常在边缘留的接缝/暗角，二是让图案单元在牌面上**大一点**
//   —— 牌在手机上只有 54×77，图案太密就糊成一片噪点。
// ⚠ 用 Playwright 的 canvas 做缩放/编码（仓库没有 sharp；浏览器的 JPEG 编码器够用且零依赖）。
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const SRC = 'C:/tmp/solitaire/backs-raw';
const DST = path.resolve(__dirname, '../assets/backs');
// ⚠ CROP 0.62 → 0.5（实拍调）：牌在手机上只有 54×77，裁得越松图案单元越小，
//   浅色款（奶油底 + 淡粉图案）缩到那个尺寸直接**发白成一张空牌**。收紧 = 图案大 24%。
// ⚠ 顺带轻微提饱和/对比：Flux 的粉彩本来就淡，缩小后对比进一步丢失（缩放是低通滤波）。
const W = 360, H = 512, CROP = 0.5, Q = 0.86, FILTER = 'saturate(1.14) contrast(1.08)';

(async () => {
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.png'));
  if (!files.length) { console.error('没有原图，先跑 gen-backs.cjs'); process.exit(1); }
  const br = await chromium.launch();
  const pg = await br.newPage();
  let n = 0;
  for (const f of files) {
    const id = path.basename(f, '.png');
    const b64 = fs.readFileSync(path.join(SRC, f)).toString('base64');
    const jpg = await pg.evaluate(async ({ b64, W, H, CROP, Q, FILTER }) => {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.src = 'data:image/png;base64,' + b64; });
      // 以目标比例在原图中心取一块（边长 = 短边 × CROP 的等比框）
      const ar = W / H;
      let cw = im.width * CROP, ch = cw / ar;
      if (ch > im.height * CROP) { ch = im.height * CROP; cw = ch * ar; }
      const sx = (im.width - cw) / 2, sy = (im.height - ch) / 2;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.filter = FILTER;
      g.drawImage(im, sx, sy, cw, ch, 0, 0, W, H);
      g.filter = 'none';
      return c.toDataURL('image/jpeg', Q).split(',')[1];
    }, { b64, W, H, CROP, Q, FILTER });
    const buf = Buffer.from(jpg, 'base64');
    fs.writeFileSync(path.join(DST, id + '.jpg'), buf);
    n++;
    console.log('OK', id + '.jpg', (buf.length / 1024).toFixed(0) + 'KB');
  }
  await br.close();
  console.log('入库', n, '张 →', DST);
})();
