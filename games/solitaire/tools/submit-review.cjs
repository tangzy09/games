// 提交审核（reviewSubmissions 购物车流程）。⛔ 对外动作，跑之前必须有用户明确批准。
//
// ⚠ 别反复新建草稿：`canceled:true` 对 draft 不生效 ⇒ 会留下僵尸草稿；一旦某次 add item 成功，
//   version 就归属那个草稿，再建新草稿必 409。**正解：复用已有草稿，直接 PATCH {submitted:true}**。
// ⚠ 提交失败时**外层只会说 "not in valid state"** —— 真信息在每个 item 的 associatedErrors 里
//   （blockblast 2026-08-02 连撞三个 409 都是这么查出来的）。
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const APP = '6790861224', VER = '35e1fbbc-e179-43aa-b814-59c469a882bb';   // Fair Deal 1.0.2

async function dumpItemErrors(subId) {
  const its = await asc.api('GET', `/v1/reviewSubmissionItems?filter[reviewSubmission]=${subId}&limit=10`);
  for (const it of (its.j.data || [])) {
    const a = it.attributes || {};
    const errs = a.associatedErrors || [];
    if (!errs.length) { console.log('  item', it.id, 'state =', a.state); continue; }
    for (const e of errs) console.log('  ⛔', e.code, '|', e.title, '|', e.detail);
  }
}

(async () => {
  // ── 提交前体检：缺一样都别提 ──
  const v = await asc.api('GET', `/v1/appStoreVersions/${VER}?fields[appStoreVersions]=versionString,appStoreState`);
  const b = await asc.api('GET', `/v1/appStoreVersions/${VER}/build`);
  console.log(`版本 ${v.j.data.attributes.versionString} ${v.j.data.attributes.appStoreState}`);
  console.log('build:', b.j.data ? b.j.data.id : '（无）');
  if (!b.j.data) { console.error('✗ 没挂 build，不能提交'); process.exit(1); }

  // ── 找/建草稿 ──
  const subs = await asc.api('GET',
    `/v1/reviewSubmissions?filter[app]=${APP}&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&limit=10`);
  const inflight = (subs.j.data || []).find(s => ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(s.attributes.state));
  if (inflight) { console.log('已在审核队列里：', inflight.id, inflight.attributes.state); return; }
  let sub = (subs.j.data || []).find(s => s.attributes.state === 'READY_FOR_REVIEW');
  if (!sub) {
    const c = await asc.api('POST', '/v1/reviewSubmissions', {
      data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: APP } } } },
    });
    if (!c.ok) { console.error('建草稿失败', c.status, (c.t || '').slice(0, 400)); process.exit(1); }
    sub = c.j.data;
    console.log('新建草稿', sub.id);
  } else console.log('复用已有草稿', sub.id);

  // ── 把版本加进购物车 ──
  const items = await asc.api('GET', `/v1/reviewSubmissionItems?filter[reviewSubmission]=${sub.id}&limit=10`);
  if (!(items.j.data || []).length) {
    const it = await asc.api('POST', '/v1/reviewSubmissionItems', {
      data: { type: 'reviewSubmissionItems',
        relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } },
                         appStoreVersion: { data: { type: 'appStoreVersions', id: VER } } } },
    });
    console.log('加入购物车:', it.ok ? '✓' : '✗ ' + it.status + ' ' + (it.t || '').slice(0, 300));
    if (!it.ok) process.exit(1);
  } else console.log('购物车里已有条目');

  // ── 提交 ──
  const s = await asc.api('PATCH', `/v1/reviewSubmissions/${sub.id}`,
    { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
  console.log('提交:', s.ok ? '✓' : '✗ ' + s.status + ' ' + (s.t || '').slice(0, 300));
  if (!s.ok) { console.log('\n=== item 级错误（真信息在这儿）==='); await dumpItemErrors(sub.id); }

  // ── 回读（地面真值：别信自己的转述）──
  const back = await asc.api('GET', `/v1/reviewSubmissions/${sub.id}`);
  const v2 = await asc.api('GET', `/v1/appStoreVersions/${VER}?fields[appStoreVersions]=appStoreState`);
  console.log('\n回读 submission:', back.j.data.attributes.state);
  console.log('回读 version   :', v2.j.data.attributes.appStoreState);
  process.exit(s.ok ? 0 : 1);
})();
