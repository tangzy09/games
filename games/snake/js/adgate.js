// adgate.js — 插屏总闸门（纯逻辑，node 可单测）
//
// 对齐全仓统一模型（casual-game-meta §1「极简闸门变体」）：
//   **前 50 关零插屏** → 之后**每 10 关至多 1 个** + **距上次 ≥2 分钟**，
//   且只在**过关**（正反馈时刻）问。⛔ 死亡/局中永远不问（调用方只在过关分支调）。
//
// ⚠ 这是对上线参数的下调：旧规则是「每 2 关一插屏」——按 snake 一关 1-3 分钟算，
//   相当于几分钟一个插屏，是这个品类差评的头号来源。收入损失可控（插屏本就是姿态，
//   收入主力是自愿的救场/图鉴激励视频），换 D1 与评分。

const AD_GATE = {
  graceLevels: 50,      // 蜜月期：前 50 关一个插屏都不出
  everyLevels: 10,      // 之后每 10 关至多 1 个
  minGapMs: 120000,     // 任意两个插屏至少隔 2 分钟
};

/** 现在能不能出插屏（stats = save.stats；nowMs 用墙钟 Date.now()）*/
function adCanShow(stats, nowMs) {
  if (!stats) return false;
  if ((stats.levelsCleared | 0) <= AD_GATE.graceLevels) return false;
  if ((stats.levelsSinceAd | 0) < AD_GATE.everyLevels) return false;
  return (nowMs - (stats.lastAdAt || 0)) >= AD_GATE.minGapMs;
}

/** 出过之后记账（计数归零 + 记时刻）*/
function adNoteShown(stats, nowMs) {
  stats.levelsSinceAd = 0;
  stats.lastAdAt = nowMs;
}

const AdGate = { AD_GATE, canShow: adCanShow, noteShown: adNoteShown };
if (typeof module !== 'undefined' && module.exports) module.exports = AdGate;
