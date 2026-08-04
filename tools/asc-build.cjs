// tools/asc-build.cjs — 等 ASC 侧真的收到并处理完新 build（跨游戏；出包后必用）。
//
// 用法:
//   node tools/asc-build.cjs <appId>              列出最近 5 个 build
//   node tools/asc-build.cjs <appId> wait <ver>   等到出现 marketing 版本 <ver> 的 build 且 VALID
//
// ⛔ 为什么需要它：**Codemagic 说 "Publishing success" 不等于 ASC 已经有这个 build**。
//   上传完 Apple 还要处理（PROCESSING → VALID），期间 API 里查不到或状态不是 VALID，
//   实测可能要十几分钟。这段时间里「已上传」是个**没有验证过的转述** —— 出包这种不可逆
//   的动作必须用另一条路子复查真实状态（见全局 CLAUDE.md「地面真值」）。
// ⚠ build 的 version 字段是**构建号**（1,2,3…），marketing 版本要顺 preReleaseVersion 查。
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});

const APP = process.argv[2];
const MODE = process.argv[3] || 'list';
const WANT = process.argv[4];

async function builds() {
  const r = await asc.api('GET',
    `/v1/builds?filter[app]=${APP}&limit=5&sort=-uploadedDate` +
    `&fields[builds]=version,processingState,uploadedDate,expired,preReleaseVersion&include=preReleaseVersion&fields[preReleaseVersions]=version`);
  const pre = {};
  for (const i of (r.j.included || [])) pre[i.id] = i.attributes.version;
  return (r.j.data || []).map(d => ({
    id: d.id,
    build: d.attributes.version,
    marketing: pre[(((d.relationships || {}).preReleaseVersion || {}).data || {}).id] || '?',
    state: d.attributes.processingState,
    uploaded: (d.attributes.uploadedDate || '').slice(0, 16),
  }));
}

const line = b => ` ${b.marketing.padEnd(6)} build ${String(b.build).padEnd(4)} | ${b.state.padEnd(10)} | ${b.uploaded} | ${b.id}`;

(async () => {
  if (!APP) { console.log('用法: node tools/asc-build.cjs <appId> [wait <marketingVer>]'); process.exit(2); }
  if (MODE !== 'wait') { (await builds()).forEach(b => console.log(line(b))); return; }

  for (let i = 0; i < 30; i++) {                    // 30 × 60s = 30 分钟上限
    const all = await builds();
    const hit = all.find(b => b.marketing === WANT);
    const t = new Date().toISOString().slice(11, 19);
    if (!hit) console.log(`${t} ASC 还没收到 ${WANT}（最新: ${all[0] ? all[0].marketing + ' build ' + all[0].build : '无'}）`);
    else {
      console.log(`${t} ${hit.marketing} build ${hit.build} → ${hit.state}`);
      if (hit.state === 'VALID') { console.log('\n✓ 已到达且 VALID\n' + line(hit)); process.exit(0); }
      if (hit.state === 'FAILED' || hit.state === 'INVALID') { console.log('\n✕ 处理失败\n' + line(hit)); process.exit(1); }
    }
    await new Promise(r => setTimeout(r, 60000));
  }
  console.log('⚠ 30 分钟还没等到，自己去 ASC 看');
  process.exit(1);
})();
