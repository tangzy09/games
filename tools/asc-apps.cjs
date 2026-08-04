// tools/asc-apps.cjs — 一眼看清**账号下所有 app** 的真实版本状态 + 审核排队了多久。
//
// ⛔ 存在的理由：文档会过时，而且过时得很隐蔽。2026-08-04 一次连查出两处：
//   solitaire 和 blockblast 的 CLAUDE.md 都写着「1.0.1 审核中」，而它们**早就上架了**。
//   ⇒ **改任何版本状态的文字之前，先跑这个**（本仓「地面真值」那条规矩的落地工具）。
// 顺带算出「提交单等了几天」——苹果通常 24-48h，等超过一周基本就是出事了
//   （API 查不出原因：被拒会变 REJECTED/UNRESOLVED_ISSUES；卡着不动多半是审核员
//    在 Resolution Center 要补充信息，那**只能人去后台看**）。
//
// 用法: node tools/asc-apps.cjs            全部
//       node tools/asc-apps.cjs snake      名字模糊匹配
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const FILTER = (process.argv[2] || '').toLowerCase();
const DAY = 86400000;

(async () => {
  const apps = await asc.api('GET', '/v1/apps?limit=100&fields[apps]=name,bundleId');
  const rows = [];
  for (const a of (apps.j.data || [])) {
    const name = a.attributes.name;
    if (FILTER && !name.toLowerCase().includes(FILTER) && !a.attributes.bundleId.toLowerCase().includes(FILTER)) continue;

    const v = await asc.api('GET',
      `/v1/apps/${a.id}/appStoreVersions?limit=3&fields[appStoreVersions]=versionString,appStoreState`);
    const vers = (v.j.data || []).map(d => `${d.attributes.versionString}:${d.attributes.appStoreState}`);

    // 排队中的提交单等了多久
    let waiting = '';
    if (vers.some(x => /WAITING_FOR_REVIEW|IN_REVIEW/.test(x))) {
      const s = await asc.api('GET',
        `/v1/reviewSubmissions?filter[app]=${a.id}&limit=5&fields[reviewSubmissions]=state,submittedDate`);
      const cur = (s.j.data || []).find(d => /WAITING_FOR_REVIEW|IN_REVIEW/.test(d.attributes.state));
      if (cur && cur.attributes.submittedDate) {
        const days = Math.floor((Date.now() - new Date(cur.attributes.submittedDate)) / DAY);
        waiting = `已等 ${days} 天${days >= 7 ? '  ⚠ 异常（去 ASC 后台看 Resolution Center）' : ''}`;
      }
    }
    rows.push({ app: name, 版本: vers.join('  '), 排队: waiting });
  }
  console.table(rows);
  const stuck = rows.filter(r => r.排队.includes('⚠'));
  if (stuck.length) console.log(`\n⚠ ${stuck.length} 个 app 排队超过一周 —— API 查不出原因，要人去后台看有没有审核员消息。`);
})();
