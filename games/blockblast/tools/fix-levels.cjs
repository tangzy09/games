#!/usr/bin/env node
/**
 * fix-levels.cjs — 生成 300 关并**自动把不达标的关降难度重生成**，直到通关率门禁全过。
 *
 * 为什么要它：难度是程序生成的，参数曲线再讲究也总会有几关"运气不好"（水晶线交汇处
 * 恰好卡死、石块位置刁钻）。人工一关关调 300 关不现实 ⇒ 把「跑门禁 → 找出不达标的关 →
 * 只把那几关降一档 → 再跑」这件事写成循环。收敛后的结果是**确定性**的（gen 用 id 散列）。
 *
 * ⚠ 它只会往「更容易」的方向调，不会为了过门禁而改动门禁本身。
 *
 * 用法: node tools/fix-levels.cjs [--runs 120] [--rounds 8]
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const RUNS = (() => { const i = args.indexOf('--runs'); return i >= 0 ? args[i + 1] : '120'; })();
const ROUNDS = (() => { const i = args.indexOf('--rounds'); return i >= 0 ? +args[i + 1] : 8; })();
const DIR = __dirname;

const run = (script, extra) =>
  execFileSync(process.execPath, [path.join(DIR, script), ...extra], { encoding: 'utf8', maxBuffer: 1 << 26 });

/** 跑门禁，返回不达标的关 id 列表（不看退出码，只解析表格）*/
function verify() {
  let out;
  try { out = run('verify-levels.js', ['--runs', RUNS]); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  const bad = [];
  for (const line of out.split('\n')) {
    // ⚠ 别拿显示的百分比当判据：它是 toFixed(0) 四舍五入的，**79.5% 会显示成 80%**
    //   ⇒ 循环以为过了、verify 自己却判不过，两边打架（实锤：卡在第 298 关）。
    //   只认 verify 打的那个 ✗ 标记。
    if (!line.includes('✗')) continue;
    const m = line.match(/^\s*(\d+)\s/);
    if (m) bad.push(+m[1]);
  }
  return { bad, out };
}

const ease = [];        // 累积：同一个 id 出现几次 = 降几档
let last = null;
for (let round = 1; round <= ROUNDS; round++) {
  run('gen-levels.js', ['--write', ...(ease.length ? ['--ease', ease.join(',')] : [])]);
  const { bad, out } = verify();
  last = out;
  console.log(`第 ${round} 轮：${bad.length} 关不达标` + (bad.length ? ` → ${bad.slice(0, 14).join(',')}${bad.length > 14 ? '…' : ''}` : ''));
  if (!bad.length) {
    // ⚠ 收敛后**必须**再跑一次 --write 标定 par：gen 生成的关卡是**没有 par 字段**的，
    //   而 starsFor() 在 !par 时直接返回 1 星 ⇒ 忘了这步，300 关的三星系统整个失效、
    //   星星经济归零，而且任何测试都不会报错。
    console.log('\n收敛 ✓ —— 标定 par（三星基准）…');
    console.log(run('verify-levels.js', ['--runs', RUNS, '--write']).split('\n').slice(-3).join('\n'));
    process.exit(0);
  }
  ease.push(...bad);
}
console.error(`\n✗ ${ROUNDS} 轮仍未收敛 —— 说明难度曲线本身越界了，别再堆 ease，回去改 autoSpec 的参数上限`);
console.error(last.split('\n').slice(-3).join('\n'));
process.exit(1);
