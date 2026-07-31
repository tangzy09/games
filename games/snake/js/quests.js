// quests.js — 每日任务（纯逻辑，node 可单测）
//
// 全仓统一打法（casual-game-meta §5.7）的 snake 版。四条铁律照做：
//   ① 由日期字符串**确定性生成**（同一天全球同一组），存档只存进度不存题面；
//   ② 进度挂在**既有 core 事件流/既有计数器**上，绝不另铺埋点；
//   ③ 完成**自动发奖**，不做「领取」按钮；
//   ④ 只做顺手能完成的量——它是回访理由，不是第二套肝度系统。
//
// snake 没有金币经济 ⇒ 奖励 = **直接解锁一张天使图**（与每日礼物同一种货币，
// 省掉玩家整整一关的时间，是这个游戏里最实的东西）。
//
// ⚠ 日期用 `YYYY-MM-DD` 字符串（与 main.js 的 ymd()/每日礼物同口径），不用天序号。

const Q_POOL = [
  { t: 'apples',  mode: 'sum', targets: [30, 50, 80] },     // 吃苹果
  { t: 'levels',  mode: 'sum', targets: [2, 3, 5] },        // 过关（揭满几张图）
  { t: 'cells',   mode: 'sum', targets: [300, 500, 800] },  // 揭开格子
  { t: 'special', mode: 'sum', targets: [5, 8, 12] },       // 吃特殊果
  { t: 'combo',   mode: 'max', targets: [5, 8, 10] },       // 单局最高连击
  { t: 'noDeath', mode: 'sum', targets: [1, 2, 2] },        // 零死亡过关
];
const Q_REWARD_ANGELS = 1;      // 每完成一个任务解锁一张天使图

/** FNV-1a：日期串 + 盐 → 32 位（确定性，不用 Math.random）*/
function qHash(day, salt) {
  let h = 2166136261 >>> 0;
  const s = String(day) + '|' + salt;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** 今天的 3 个任务（同一天恒同组；类型互不重复）*/
function qTodays(day) {
  const out = [];
  let salt = 0;
  while (out.length < 3 && salt < 64) {
    const q = Q_POOL[qHash(day, salt) % Q_POOL.length];
    salt++;
    if (out.some(p => p.t === q.t)) continue;
    out.push({ t: q.t, mode: q.mode, target: q.targets[qHash(day, salt + 100) % q.targets.length] });
  }
  return out;
}

/** 确保 save.quests 是「今天」的（跨天自动重置）*/
function qEnsure(save, day) {
  if (!save.quests || save.quests.day !== day) save.quests = { day, prog: {}, done: [] };
  if (!save.quests.prog) save.quests.prog = {};
  if (!Array.isArray(save.quests.done)) save.quests.done = [];
  return save.quests;
}

/**
 * 上报进度。返回**这次新完成**的任务数组（调用方发奖励）。
 * mode=max 传当前值（如本局连击），sum 传增量。
 * ⚠ prog 的 key 是任务序号的字符串（存档里是开放 map，见 storage.js 的空默认铁律）。
 */
function qBump(save, day, type, n) {
  if (!(n > 0)) return [];
  const st = qEnsure(save, day);
  const done = [];
  qTodays(day).forEach((q, i) => {
    if (q.t !== type || st.done.indexOf(i) >= 0) return;
    const cur = st.prog[i] || 0;
    st.prog[i] = q.mode === 'max' ? Math.max(cur, n) : cur + n;
    if (st.prog[i] >= q.target) { st.done.push(i); done.push(q); }
  });
  return done;
}

/** 任务页/主界面用：[{t,target,prog,done}] */
function qStatus(save, day) {
  const st = qEnsure(save, day);
  return qTodays(day).map((q, i) => ({
    t: q.t, target: q.target,
    prog: Math.min(st.prog[i] || 0, q.target),
    done: st.done.indexOf(i) >= 0,
  }));
}

const Quests = { POOL: Q_POOL, REWARD_ANGELS: Q_REWARD_ANGELS, todays: qTodays, ensure: qEnsure, bump: qBump, status: qStatus };
if (typeof module !== 'undefined' && module.exports) module.exports = Quests;
