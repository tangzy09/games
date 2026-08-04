// 把 ASC 上那个 marketing 版本 = 1.0.1 的 build 挂到 1.0.1 版本载体上。
// ⚠ builds.version 是**构建号**（1,2,3…），marketing 版本要**单独查** /v1/builds/{id}/preReleaseVersion
//   （`include=preReleaseVersion` 在这个端点上不一定回填 ⇒ 别指望它，实踩：全显示成 '?'）。
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const APP = '6790598746', VER = '25489ff1-ba6b-4443-b91a-f9f5fb281388', WANT = '1.0.1';
(async () => {
  const r = await asc.api('GET',
    `/v1/builds?filter[app]=${APP}&limit=8&sort=-uploadedDate&fields[builds]=version,processingState,uploadedDate,expired`);
  const rows = [];
  for (const b of (r.j.data || [])) {
    const pv = await asc.api('GET', `/v1/builds/${b.id}/preReleaseVersion?fields[preReleaseVersions]=version`);
    rows.push({ id: b.id, num: b.attributes.version, state: b.attributes.processingState,
                mv: pv.j.data ? pv.j.data.attributes.version : '?', at: b.attributes.uploadedDate });
  }
  console.log('最近的 build：');
  for (const b of rows) console.log(`  ${b.mv} (build#${b.num}) ${b.state}  ${b.at}`);
  const ready = rows.find(b => b.mv === WANT && b.state === 'VALID');
  if (!ready) {
    const p = rows.find(b => b.mv === WANT);
    console.log(p ? `\n${WANT} 的 build#${p.num} 还在 ${p.state}` : `\n${WANT} 的 build 还没到 ASC`);
    process.exit(2);
  }
  const at = await asc.api('PATCH', `/v1/appStoreVersions/${VER}/relationships/build`,
    { data: { type: 'builds', id: ready.id } });
  if (!at.ok) console.log('PATCH', at.status, (at.t || '').slice(0, 200));
  const back = await asc.api('GET', `/v1/appStoreVersions/${VER}/build`);
  console.log(`\n挂 build#${ready.num}：`, back.j.data && back.j.data.id === ready.id ? '✓ 回读一致' : '✗ 回读为空');
  process.exit(back.j.data ? 0 : 1);
})();
