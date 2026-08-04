// tools/cm-build.cjs — Codemagic 构建的查询/等待（跨游戏；出包必用）。
//
// 用法:
//   node tools/cm-build.cjs status <buildId>     一次性查状态
//   node tools/cm-build.cjs wait   <buildId>     每 60s 轮询,跑完/失败才退出（退出码 0/1）
//   node tools/cm-build.cjs last                 最近 8 个构建
//
// ⛔ 本文件**只读 + 等待**，不触发构建 —— 触发出包必须先经用户批准（见全局 CLAUDE.md 铁律）。
const https = require('https'), fs = require('fs');
const TOKEN = fs.readFileSync('C:/Users/tangz/Documents/credentials/codemagic-api-token.txt', 'utf8').trim();
const APP = '6a5159920057b5324b000964';           // Codemagic app「games」= 本 monorepo 全部游戏共用

const get = p => new Promise((res, rej) => {
  const r = https.request({ hostname: 'api.codemagic.io', path: p, method: 'GET',
    headers: { 'x-auth-token': TOKEN } },
    x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } }); });
  r.on('error', rej); r.end();
});

const one = b => `${b._id} | ${(b.config && b.config.name) || b.workflowId} | ${b.status}` +
                 ` | ${(b.commit && b.commit.hash || '').slice(0, 8)} | ${b.branch || ''}`;

(async () => {
  const [cmd, id] = process.argv.slice(2);
  if (cmd === 'last') {
    const j = await get(`/builds?appId=${APP}&limit=8`);
    for (const b of (j.builds || [])) console.log(one(b));
    return;
  }
  if (!id) { console.log('缺 buildId'); process.exit(2); }

  const poll = async () => {
    const j = await get(`/builds/${id}`);
    return j.build || j;
  };

  if (cmd === 'status') { console.log(one(await poll())); return; }

  // wait：⚠ Codemagic 的 status 会经过 queued → preparing → building → publishing → finished
  const DONE = { finished: 0, failed: 1, canceled: 1, timeout: 1, skipped: 1 };
  let last = '';
  for (let i = 0; i < 40; i++) {                  // 40 × 60s = 40 分钟上限（iOS 包通常 ~12 分钟）
    const b = await poll();
    if (b.status !== last) { last = b.status; console.log(new Date().toISOString().slice(11, 19), b.status); }
    if (b.status in DONE) {
      console.log('\n' + one(b));
      // 成功时把 TestFlight 侧的产物也报出来（别只信 "finished" 三个字）
      const arts = (b.artefacts || b.artifacts || []).map(a => a.name).filter(n => /\.ipa$/i.test(n));
      if (arts.length) console.log('产物:', arts.join(', '));
      process.exit(DONE[b.status]);
    }
    await new Promise(r => setTimeout(r, 60000));
  }
  console.log('⚠ 超过 40 分钟仍未结束，自己去 Codemagic 看');
  process.exit(1);
})();
