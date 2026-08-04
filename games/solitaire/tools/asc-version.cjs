// games/solitaire/tools/asc-version.cjs — 建/更新 ASC 版本载体 + 两语 whatsNew。
// 用法: node games/solitaire/tools/asc-version.cjs 1.0.2
// ⛔ 只写「待提交」状态,**不提交审核**（提交是另一个动作,必须单独经用户批准）。
// ⚠ 不碰截图/预览片:新版本会沿用上一版的媒体（用户 2026-08-03 定的默认,要重截会明说）。
const asc = require('c:/Users/tangz/.claude/skills/appstore-listing/asc-lib.cjs')({
  keyId: '6TLMXCG564', issuer: 'f723569b-c38d-4acf-96da-fde9db2b0b63',
  p8Path: 'C:/Users/tangz/Documents/credentials/AuthKey_6TLMXCG564.p8',
});
const APP = '6790861224';
const VER = process.argv[2] || '1.0.2';

const NOTES = {
  'en-US': `Cleaner board, richer rewards.

• The play area is yours again — we removed the bottom banner ad entirely. More room for the cards, especially in Spider.
• Every rewarded video now says exactly what it gives you before you watch, and the first one each day pays double.
• Bigger rewards across the board: coins, angel cards, win bonuses and the daily gift were all increased.
• Back buttons moved to the top-left corner everywhere, so they're always where you expect.
• Fixed a layout bug where buttons near the bottom of the screen could be covered on some iPhones.

Undo, hints, restart and the solver are still free. Always.`,
  'zh-Hans': `牌面更清爽，奖励更丰厚。

• 彻底移除了底部横幅广告——牌面重新属于你，蜘蛛纸牌的十列尤其明显。
• 每个激励视频现在都会先说清楚给什么，而且每天第一条奖励翻倍。
• 全面加厚奖励：金币、天使收藏、胜局礼包、每日礼物都提高了。
• 所有返回按钮统一到左上角，永远在你以为的位置。
• 修复了部分 iPhone 上屏幕底部按钮可能被遮挡的问题。

撤销、提示、重开和求解器依然永远免费。`,
};

(async () => {
  // 1) 找/建版本
  const vs = await asc.api('GET', `/v1/apps/${APP}/appStoreVersions?limit=10&fields[appStoreVersions]=versionString,appStoreState`);
  let ver = (vs.j.data || []).find(d => d.attributes.versionString === VER);
  if (ver) {
    console.log('版本已存在:', ver.id, VER, ver.attributes.appStoreState);
  } else {
    const r = await asc.api('POST', '/v1/appStoreVersions', {
      data: { type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: VER, releaseType: 'AFTER_APPROVAL' },
        relationships: { app: { data: { type: 'apps', id: APP } } } },
    });
    if (!r.ok) { console.log('建版本失败', r.status, JSON.stringify(r.j).slice(0, 600)); process.exit(1); }
    ver = r.j.data;
    console.log('已建版本:', ver.id, VER);
  }

  // 2) 两语 whatsNew（更新版必填,缺了提交那一刻才拦）
  const loc = await asc.api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=20&fields[appStoreVersionLocalizations]=locale,whatsNew`);
  for (const d of (loc.j.data || [])) {
    const note = NOTES[d.attributes.locale];
    if (!note) { console.log('  跳过（没准备文案）:', d.attributes.locale); continue; }
    const r = await asc.api('PATCH', `/v1/appStoreVersionLocalizations/${d.id}`,
      { data: { type: 'appStoreVersionLocalizations', id: d.id, attributes: { whatsNew: note } } });
    console.log(`  ${d.attributes.locale} whatsNew ${r.ok ? 'OK' : 'FAIL ' + r.status}`);
  }

  // 3) 回读校验（⛔ 别信自己的转述,重新查一遍真实状态）
  const back = await asc.api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=20&fields[appStoreVersionLocalizations]=locale,whatsNew`);
  console.log('\n=== 回读 ===');
  for (const d of (back.j.data || [])) {
    const n = (d.attributes.whatsNew || '');
    console.log(`${d.attributes.locale.padEnd(9)} whatsNew=${n.length} 字  ${n ? '「' + n.slice(0, 24).replace(/\n/g, ' ') + '…」' : '⛔ 空'}`);
    // 顺带确认截图确实沿用了上一版（我们没上传任何图）
    const sets = await asc.api('GET', `/v1/appStoreVersionLocalizations/${d.id}/appScreenshotSets?limit=10`);
    console.log(`          截图集 ${(sets.j.data || []).length} 组（沿用上一版,本次未重截）`);
  }
})();
