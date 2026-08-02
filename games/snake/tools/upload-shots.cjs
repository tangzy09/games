// games/snake/tools/upload-shots.cjs — 把 39 locale × 2 槽位 × 8 张截图传进 App Store Connect
//
// 用法：node games/snake/tools/upload-shots.cjs <appStoreVersionId> [locale...]
//   不给 locale 就传全部。**幂等**：每个 set 先删旧图再传，重跑不会出现重复/串号。
//
// ⚠ PNG 1290×2796 每张 ~1.7MB，624 张 ≈ 1GB，家用上行会传到天荒地老 ⇒ **转 JPEG q88 再传**
//   （苹果两种都收；实测体积降到 ~1/6，肉眼无损）。
// ⚠ 创建顺序 = 商店里的展示顺序，所以要按文件名排序**串行**传。
// ⚠ 版本进入 WAITING_FOR_REVIEW 后截图会锁死（删图 409）——**先传图后提审**。
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const sharp = require('c:/Users/tangz/Documents/Projects/language-study/node_modules/sharp');
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const FIN = 'C:/tmp/snake/store-shots/final';
const DEVICE_SET = { iphone: 'APP_IPHONE_67', ipad: 'APP_IPAD_PRO_3GEN_129' };
const VER = process.argv[2];
if (!VER) { console.error('用法: node upload-shots.cjs <appStoreVersionId> [locale...]'); process.exit(1); }
const ONLY = process.argv.slice(3).filter(x => !x.startsWith('--'));
// --device=iphone|ipad：只传一个槽位（两个设备的图不是同时出好的，分开传省一轮重传）
const DEV_ONLY = (process.argv.find(x => x.startsWith('--device=')) || '').split('=')[1];

const jpegCache = new Map();
async function jpeg(file) {
  if (jpegCache.has(file)) return jpegCache.get(file);
  const buf = await sharp(file).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer();
  jpegCache.set(file, buf);
  return buf;
}

async function uploadOne(setId, file, name) {
  const buf = await jpeg(file);
  const res = await asc.api('POST', '/v1/appScreenshots', {
    data: { type: 'appScreenshots', attributes: { fileName: name, fileSize: buf.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } } },
  });
  if (!res.ok) throw new Error('reserve ' + res.status + ' ' + res.t.slice(0, 200));
  const id = res.j.data.id;
  for (const op of res.j.data.attributes.uploadOperations) {
    const headers = {}; (op.requestHeaders || []).forEach(h => { headers[h.name] = h.value; });
    const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
    if (!r.ok) throw new Error('PUT ' + r.status);
  }
  const c = await asc.api('PATCH', '/v1/appScreenshots/' + id, {
    data: { type: 'appScreenshots', id, attributes: { uploaded: true, sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex') } },
  });
  if (!c.ok) throw new Error('commit ' + c.status + ' ' + c.t.slice(0, 200));
  return buf.length;
}

(async () => {
  const l = await asc.api('GET', `/v1/appStoreVersions/${VER}/appStoreVersionLocalizations?limit=200`);
  if (!l.ok) throw new Error('取本地化失败 ' + l.status + ' ' + l.t.slice(0, 200));
  const locs = l.j.data.filter(d => !ONLY.length || ONLY.includes(d.attributes.locale));
  let done = 0, bytes = 0, t0 = Date.now();
  const total = locs.length * Object.keys(DEVICE_SET).length * 8;
  for (const d of locs) {
    const loc = d.attributes.locale;
    for (const [dev, type] of Object.entries(DEVICE_SET)) {
      if (DEV_ONLY && dev !== DEV_ONLY) continue;
      const dir = path.join(FIN, loc, dev);
      if (!fs.existsSync(dir)) { console.log('缺目录，跳过', loc, dev); continue; }
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
      // 幂等：先找/建 set，把旧图删干净
      const sets = await asc.api('GET', `/v1/appStoreVersionLocalizations/${d.id}/appScreenshotSets?limit=20`);
      let set = (sets.j.data || []).find(s => s.attributes.screenshotDisplayType === type);
      if (set) {
        const old = await asc.api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots?limit=20`);
        for (const o of (old.j.data || [])) await asc.api('DELETE', '/v1/appScreenshots/' + o.id);
      } else {
        const c = await asc.api('POST', '/v1/appScreenshotSets', {
          data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type },
            relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: d.id } } } },
        });
        if (!c.ok) throw new Error('建 set 失败 ' + loc + ' ' + c.status + ' ' + c.t.slice(0, 200));
        set = c.j.data;
      }
      for (const f of files) {
        bytes += await uploadOne(set.id, path.join(dir, f), `${loc}-${dev}-${f.replace('.png', '.jpg')}`);
        done++;
      }
      const mins = (Date.now() - t0) / 60000;
      console.log(`${loc}/${dev} ✓ ${files.length} 张  (${done}/${total}, ${(bytes / 1048576).toFixed(0)}MB, ${mins.toFixed(1)}min)`);
    }
  }
  console.log(`\n全部完成：${done} 张 / ${(bytes / 1048576).toFixed(0)}MB / ${((Date.now() - t0) / 60000).toFixed(1)} 分钟`);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
