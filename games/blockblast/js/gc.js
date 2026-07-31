// ════════════════════════════════════════
// gc.js — Game Center 双榜（@openforge/capacitor-game-connect）。
//
// 榜 id 与 ASC 一字对齐（gameCenterLeaderboards 已建）：
//   无尽最高分  cubeblast.endless.best
//   每日谜题    cubeblast.daily.best
//
// 这是「每日谜题同种子、分数可比、可做榜」承诺的兑现——零后端。
// web / 插件缺失 / 未登录 = 全部静默 no-op（绝不打断玩法）。
// ════════════════════════════════════════
(function (root) {
  'use strict';

  const BOARDS = { endless: 'cubeblast.endless.best', daily: 'cubeblast.daily.best' };
  let signedIn = false;

  function plugin() {
    const c = root.Capacitor;
    if (!c || !c.isNativePlatform || !c.isNativePlatform()) return null;
    return (c.Plugins && c.Plugins.GameConnect) || null;
  }

  async function signIn() {
    const p = plugin();
    if (!p) return false;
    try { await p.signIn(); signedIn = true; } catch (e) { /* 玩家拒绝登录 = 静默 */ }
    return signedIn;
  }

  /** 提交分数（BEST_SCORE 榜：苹果只保留最好成绩，重复提交无害）*/
  async function submit(board, score) {
    const p = plugin();
    if (!p || !signedIn || !(score > 0) || !BOARDS[board]) return;
    try { await p.submitScore({ leaderboardID: BOARDS[board], totalScoreAmount: Math.floor(score) }); }
    catch (e) { /* 静默：榜挂了不能影响游戏 */ }
  }

  async function show(board) {
    const p = plugin();
    if (!p) return false;
    if (!signedIn) await signIn();
    try { await p.showLeaderboard({ leaderboardID: BOARDS[board] || BOARDS.endless }); return true; }
    catch (e) { return false; }
  }

  const API = { signIn, submit, show, get available() { return !!plugin(); } };
  root.GC = API;
})(typeof self !== 'undefined' ? self : this);
