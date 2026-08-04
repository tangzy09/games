// games/blockblast/tools/aso-push.cjs — 把 39 语商店页数据写进 App Store Connect
//
// 用法：node games/blockblast/tools/aso-push.cjs            全部 39 语
//       node games/blockblast/tools/aso-push.cjs en-US ja   只推指定 locale
//       node games/blockblast/tools/aso-push.cjs --check    只回读、不写
//
// 写两处（苹果把它们分在两个资源里，很容易只写一半）：
//   · appInfoLocalizations       —— name / subtitle（**跟着 App 走**，不属于某个版本）
//   · appStoreVersionLocalizations —— description / keywords / whatsNew / promotionalText
//                                     / marketingUrl / supportUrl（属于**这个版本**）
// ⛔ marketingUrl 必须填：AdMob 的 app-ads.txt 验证只认商店页的「Developer Website」
//   （= 版本本地化的 marketingUrl），**不认 supportUrl**。1.0 只填了后者，Verify 永远失败。
// ⚠ 已存在的 locale 用 PATCH，不存在的用 POST —— 直接 POST 已存在的会 409。
// ⚠ 每次写完**回读校验**（不信自己的转述，这是本仓的地面真值规矩）。
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const A = require('../docs/aso-1.0.1.cjs');

const APP = '6790598746';
const MARKETING_URL = 'https://blocks.ai-speeds.com';
// ⛔ 新建的 appInfoLocalization **必须自带隐私政策 URL**：缺了不会当场报错，
//   而是**到提交审核那一刻**才以 associatedErrors 的形式拦住你（实踩：37 个新 locale 全缺）。
const PRIVACY_URL = 'https://blocks.ai-speeds.com/privacy.html';
const SUPPORT_URL = 'https://blocks.ai-speeds.com';
const CHECK = process.argv.includes('--check');
const ONLY = process.argv.slice(2).filter(x => !x.startsWith('--'));
const LOCALES = ONLY.length ? ONLY : A.LOCALES;

const ok = r => r.ok || (console.error('  ✗', r.status, (r.t || '').slice(0, 260)), false);

(async () => {
  // ── 找「可编辑」的版本与 appInfo ──
  const vs = await asc.api('GET', `/v1/apps/${APP}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState`);
  const ver = (vs.j.data || []).find(d => d.attributes.appStoreState !== 'READY_FOR_SALE');
  if (!ver) throw new Error('没有可编辑的版本（先在 ASC 建一个新版本）');
  console.log('版本', ver.attributes.versionString, ver.id, ver.attributes.appStoreState);

  const infos = await asc.api('GET', `/v1/apps/${APP}/appInfos?limit=10&fields[appInfos]=appStoreState`);
  const info = (infos.j.data || []).find(d => d.attributes.appStoreState !== 'READY_FOR_SALE') || (infos.j.data || [])[0];
  console.log('appInfo', info.id, info.attributes.appStoreState);

  // ── 现有本地化 ──
  const il = await asc.api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?limit=200&fields[appInfoLocalizations]=locale,name,subtitle`);
  const vl = await asc.api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=200&fields[appStoreVersionLocalizations]=locale`);
  const infoBy = Object.fromEntries((il.j.data || []).map(d => [d.attributes.locale, d.id]));
  const verBy = Object.fromEntries((vl.j.data || []).map(d => [d.attributes.locale, d.id]));
  console.log(`现有：appInfo ${Object.keys(infoBy).length} 语 / version ${Object.keys(verBy).length} 语；本次目标 ${LOCALES.length} 语\n`);

  if (CHECK) {
    for (const loc of LOCALES) console.log(loc.padEnd(8), infoBy[loc] ? 'info✓' : 'info✗', verBy[loc] ? 'ver✓' : 'ver✗');
    return;
  }

  let done = 0, fail = 0;
  for (const loc of LOCALES) {
    const nameAttrs = { name: A.NAME[loc], subtitle: A.SUBTITLE[loc], privacyPolicyUrl: PRIVACY_URL };
    const verAttrs = {
      description: A.DESC[loc], keywords: A.KEYWORDS[loc], whatsNew: A.WHATSNEW[loc],
      promotionalText: A.PROMO[loc], marketingUrl: MARKETING_URL, supportUrl: SUPPORT_URL,
    };
    let good = true;

    // ① name / subtitle
    if (infoBy[loc]) {
      good = ok(await asc.api('PATCH', `/v1/appInfoLocalizations/${infoBy[loc]}`,
        { data: { type: 'appInfoLocalizations', id: infoBy[loc], attributes: nameAttrs } })) && good;
    } else {
      const r = await asc.api('POST', '/v1/appInfoLocalizations', {
        data: { type: 'appInfoLocalizations', attributes: { locale: loc, ...nameAttrs },
          relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } },
      });
      good = ok(r) && good;
      if (r.ok) infoBy[loc] = r.j.data.id;
    }

    // ② description / keywords / whatsNew / promo / urls
    if (verBy[loc]) {
      good = ok(await asc.api('PATCH', `/v1/appStoreVersionLocalizations/${verBy[loc]}`,
        { data: { type: 'appStoreVersionLocalizations', id: verBy[loc], attributes: verAttrs } })) && good;
    } else {
      const r = await asc.api('POST', '/v1/appStoreVersionLocalizations', {
        data: { type: 'appStoreVersionLocalizations', attributes: { locale: loc, ...verAttrs },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } },
      });
      good = ok(r) && good;
      if (r.ok) verBy[loc] = r.j.data.id;
    }

    console.log((good ? '✓ ' : '✗ ') + loc);
    good ? done++ : fail++;
  }

  // ── 地面真值：回读一遍，别信上面的返回 ──
  console.log('\n回读校验…');
  const il2 = await asc.api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?limit=200&fields[appInfoLocalizations]=locale,name,subtitle,privacyPolicyUrl`);
  const vl2 = await asc.api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=200&fields[appStoreVersionLocalizations]=locale,keywords,whatsNew,promotionalText,marketingUrl`);
  const gotInfo = Object.fromEntries((il2.j.data || []).map(d => [d.attributes.locale, d.attributes]));
  const gotVer = Object.fromEntries((vl2.j.data || []).map(d => [d.attributes.locale, d.attributes]));
  const bad = [];
  for (const loc of LOCALES) {
    const i = gotInfo[loc], v = gotVer[loc];
    if (!i || i.name !== A.NAME[loc] || i.subtitle !== A.SUBTITLE[loc]) bad.push(loc + ':name/subtitle');
    if (!i || !i.privacyPolicyUrl) bad.push(loc + ':privacyPolicyUrl');
    if (!v || v.keywords !== A.KEYWORDS[loc]) bad.push(loc + ':keywords');
    if (!v || !v.whatsNew) bad.push(loc + ':whatsNew 空（更新版必填）');
    if (!v || v.marketingUrl !== MARKETING_URL) bad.push(loc + ':marketingUrl');
  }
  console.log(`写入 ${done} 成功 / ${fail} 失败；回读不一致 ${bad.length} 项`);
  if (bad.length) { console.error(bad.slice(0, 20).join('\n')); process.exit(1); }
  console.log('✓ 39 语商店页数据与本地文件一致');
})().catch(e => { console.error(e); process.exit(1); });
