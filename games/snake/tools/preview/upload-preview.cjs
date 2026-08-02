// games/snake/tools/preview/upload-preview.cjs — 把 App Preview 传进 App Store Connect
//
// 用法：node games/snake/tools/preview/upload-preview.cjs <appStoreVersionId> [locale...]
//   不给 locale 默认传四个英文 locale（片子是英文字幕；其余 locale 苹果会自动回落到主语言）。
//
// ⚠ 这是**传素材**，不是提交审核 —— 提审是另一个动作。
// ⛔ 版本一进 WAITING_FOR_REVIEW，预览片和截图一样锁死（删/改返回 409）⇒ **先传后提审**。
// ⚠ 预览片是**异步转码**的：传完 state 会是 UPLOAD_COMPLETE，要轮询到 COMPLETE 才算数；
//    苹果在这一步才校验分辨率/时长/编码，失败信息在 assetDeliveryState.errors 里。
const crypto = require('crypto'), fs = require('fs'), path = require('path');
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const FILE = 'C:/tmp/snake/preview/snake-preview-en.mp4';
const PREVIEW_TYPE = 'IPHONE_67';          // 6.7" 竖版槽位（886×1920 / 1080×1920）
const POSTER = '00:00:11:00';              // 海报帧：过关那一幕（完整天使 + 三星）
const VER = process.argv[2];
if (!VER) { console.error('用法: node upload-preview.cjs <appStoreVersionId> [locale...]'); process.exit(1); }
const ONLY = process.argv.slice(3).filter(x => !x.startsWith('--'));
const DEFAULT_LOCS = ['en-US', 'en-GB', 'en-AU', 'en-CA'];

(async () => {
  const buf = fs.readFileSync(FILE);
  console.log(`片子 ${(buf.length / 1048576).toFixed(1)}MB`);
  const l = await asc.api('GET', `/v1/appStoreVersions/${VER}/appStoreVersionLocalizations?limit=200`);
  if (!l.ok) throw new Error('取本地化失败 ' + l.status);
  const want = ONLY.length ? ONLY : DEFAULT_LOCS;
  const locs = l.j.data.filter(d => want.includes(d.attributes.locale));
  const done = [];
  for (const d of locs) {
    const loc = d.attributes.locale;
    // 幂等：先找/建 set，删掉旧片
    const sets = await asc.api('GET', `/v1/appStoreVersionLocalizations/${d.id}/appPreviewSets?limit=20`);
    let set = (sets.j.data || []).find(s => s.attributes.previewType === PREVIEW_TYPE);
    if (set) {
      const old = await asc.api('GET', `/v1/appPreviewSets/${set.id}/appPreviews?limit=20`);
      for (const o of (old.j.data || [])) await asc.api('DELETE', '/v1/appPreviews/' + o.id);
    } else {
      const c = await asc.api('POST', '/v1/appPreviewSets', {
        data: { type: 'appPreviewSets', attributes: { previewType: PREVIEW_TYPE },
          relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: d.id } } } },
      });
      if (!c.ok) throw new Error('建 set 失败 ' + loc + ' ' + c.status + ' ' + c.t.slice(0, 300));
      set = c.j.data;
    }
    const res = await asc.api('POST', '/v1/appPreviews', {
      data: { type: 'appPreviews',
        attributes: { fileName: `snake-preview-${loc}.mp4`, fileSize: buf.length, mimeType: 'video/mp4' },
        relationships: { appPreviewSet: { data: { type: 'appPreviewSets', id: set.id } } } },
    });
    if (!res.ok) throw new Error('reserve 失败 ' + loc + ' ' + res.status + ' ' + res.t.slice(0, 300));
    const id = res.j.data.id;
    for (const op of res.j.data.attributes.uploadOperations) {
      const headers = {}; (op.requestHeaders || []).forEach(h => { headers[h.name] = h.value; });
      const r = await fetch(op.url, { method: op.method, headers, body: buf.subarray(op.offset, op.offset + op.length) });
      if (!r.ok) throw new Error('PUT ' + r.status);
    }
    const c2 = await asc.api('PATCH', '/v1/appPreviews/' + id, {
      data: { type: 'appPreviews', id, attributes: {
        uploaded: true,
        sourceFileChecksum: crypto.createHash('md5').update(buf).digest('hex'),
        previewFrameTimeCode: POSTER,
      } },
    });
    if (!c2.ok) throw new Error('commit 失败 ' + loc + ' ' + c2.status + ' ' + c2.t.slice(0, 300));
    console.log(`${loc} ✓ 已上传`);
    done.push({ loc, id });
  }
  // 轮询转码结果（苹果在这一步才校验分辨率/时长/编码）
  console.log('等苹果转码…');
  for (let round = 0; round < 20; round++) {
    await new Promise(r => setTimeout(r, 6000));
    let pending = 0, bad = [];
    for (const x of done) {
      const g = await asc.api('GET', '/v1/appPreviews/' + x.id);
      const a = g.j.data.attributes;
      const st = (a.assetDeliveryState || {}).state, vd = (a.videoDeliveryState || {}).state;
      const errs = ((a.assetDeliveryState || {}).errors || []).concat((a.videoDeliveryState || {}).errors || []);
      if (errs.length) bad.push(x.loc + ': ' + JSON.stringify(errs).slice(0, 300));
      else if (st !== 'COMPLETE' || (vd && vd !== 'COMPLETE')) pending++;
    }
    if (bad.length) { console.error('⛔ 苹果拒绝：\n  ' + bad.join('\n  ')); process.exit(1); }
    if (!pending) { console.log(`全部 ${done.length} 个 locale 转码完成 ✓`); return; }
    process.stdout.write(`·`);
  }
  console.log('\n⚠ 转码仍在进行（不是失败），稍后用同一脚本或 ASC 网页复查');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
