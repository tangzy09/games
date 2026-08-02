// games/blockblast/tools/asc-status.cjs — 一眼看清 ASC 现状：版本 / 39 语本地化 / 截图集 / 预览片 / App 名称。
// 用法: node games/blockblast/tools/asc-status.cjs   （只读，不写任何东西）
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const APP = '6790598746';
(async () => {
  const v = await asc.api('GET', `/v1/apps/${APP}/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appStoreState,platform,createdDate,releaseType`);
  console.log('=== 版本 ===');
  for (const d of (v.j.data || [])) console.log(d.id, d.attributes.versionString, d.attributes.appStoreState, d.attributes.releaseType);
  const cur = (v.j.data || []).find(d => d.attributes.appStoreState !== 'READY_FOR_SALE');
  if (!cur) { console.log('（没有编辑中的版本）'); return; }
  console.log('\n编辑中的版本 id =', cur.id, cur.attributes.versionString);
  const loc = await asc.api('GET', `/v1/appStoreVersions/${cur.id}/appStoreVersionLocalizations?limit=50&fields[appStoreVersionLocalizations]=locale,whatsNew,description,keywords,promotionalText,marketingUrl`);
  const rows = (loc.j.data || []).map(d => ({
    id: d.id, locale: d.attributes.locale,
    whatsNew: (d.attributes.whatsNew || '').length,
    desc: (d.attributes.description || '').length,
    kw: (d.attributes.keywords || '').length,
    promo: (d.attributes.promotionalText || '').length,
  }));
  console.log('\n=== 版本本地化（' + rows.length + ' 个 locale）===');
  for (const r of rows) console.log(`${r.locale.padEnd(8)} whatsNew=${r.whatsNew} desc=${r.desc} kw=${r.kw} promo=${r.promo}`);
  // 截图集
  const sets = await asc.api('GET', `/v1/appStoreVersionLocalizations/${rows[0].id}/appScreenshotSets?limit=20`);
  console.log('\n=== ' + rows[0].locale + ' 的截图集 ===');
  for (const d of (sets.j.data || [])) console.log(d.attributes.screenshotDisplayType, d.id);
  // 预览片
  const pv = await asc.api('GET', `/v1/appStoreVersionLocalizations/${rows[0].id}/appPreviewSets?limit=20`);
  console.log('预览片集:', (pv.j.data || []).map(d => d.attributes.previewType).join(',') || '（无）');
  // app 级信息
  const info = await asc.api('GET', `/v1/apps/${APP}/appInfos?limit=5`);
  const infoId = info.j.data && info.j.data[0] && info.j.data[0].id;
  if (infoId) {
    const il = await asc.api('GET', `/v1/appInfos/${infoId}/appInfoLocalizations?limit=50&fields[appInfoLocalizations]=locale,name,subtitle`);
    console.log('\n=== App 信息本地化（' + (il.j.data || []).length + ' 个）===');
    for (const d of (il.j.data || []).slice(0, 8)) console.log(d.attributes.locale, '|', d.attributes.name, '|', d.attributes.subtitle);
  }
})();
