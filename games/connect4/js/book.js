// ════════════════════════════════════════
// book.js —— 开局库的**读取**与二进制格式（DESIGN §2.1 / §9.2，P1 Task 7）。
// 生成在 tools/gen-book.js（离线 Node，几小时）；本文件只负责「把那个文件变成 O(1) 查表」。
//
// ⛔⛔ **本文件的第一纪律：库缺失 / 损坏 / 版本不符 / 没下完 ⇒ 游戏照常可玩，只是慢。**
//   `get()` 查不到就返回 `undefined`，solver 收到 undefined 就照常搜索 —— 答案一位都不会变。
//   ⛔ 绝不许「猜一个分数」或「返回 0 当和棋」：库一旦说谎，提示、复盘、精准度、课程判分
//      会**全部一起说谎，且无一处报错**（solitaire 的教训：规则一变，「已验证可解」立刻变成
//      系统性谎言）。所以本文件里每一条读到的字节都要么被校验过，要么被当成「不知道」。
//
// ─── 格式（版本 1）───
//   0..3    'C4BK'
//   4       格式版本（FORMAT）
//   5       规则集（0 = classic，将来 Pop Out 另一份，⚠ 两份的局面集合完全不同，别混用）
//   6..7    ply N（u16 LE）—— 库里全部局面的手数
//   8..11   条目数 count（u32 LE）
//   12..15  生成时三份源码的哈希（u32 LE，**信息用**，判据见 tests/test-book.js）
//   16..19  正文校验和（u32 LE，FNV-1a over 全部正文字节）
//   20..31  保留（0）
//   32..    桶索引：BUCKETS+1 个 u32 LE，第 i 个 = 高 9 位 == i 的第一条记录的下标
//   ...     keys：count × 5 字节（key 的**低 40 位**，大端）
//   ...     scores：count × 1 字节（int8）
//
// ─── 为什么是「桶 + 40 位」而不是直接存 49 位 ───
//   key 有 49 位 = 7 字节，加 1 字节分数 = 8 字节/条。ply 10 有 634,338 条 ⇒ **5.07 MB**，
//   正好压在 DESIGN §9.2 的 5MB 红线上（iOS 包体要盯）。把高 9 位提出来做 512 个桶
//   （索引固定 2,052 字节），每条只剩 5+1 = 6 字节 ⇒ **3.63 MiB**，且仍然是纯二分查找、
//   没有解压依赖（⚠ gzip 能更小，但要多一条 DecompressionStream 的失败路径，
//   而本文件的第一纪律是「少一条会静默变错的路」）。
//
// ─── key 是 solver.js 的 keyOf（**已镜像归一**）───
//   ⇒ 一条记录同时服务一个局面和它的镜像，库直接小一半；也因此库里**只存分数、不存着法**
//     （着法跨镜像必须翻列号，翻错是静默的错答案）。
//   ⛔ 别在本文件里另写一份 key 函数：两份定义漂移之后，库会安静地按错 key 命中。
// ════════════════════════════════════════
(function (root) {
  const inNode = (typeof module !== 'undefined' && module.exports);
  const S = inNode ? require('./solver.js') : root.Solver;

  const FORMAT = 1;
  const RULESET_CLASSIC = 0;
  const RULESET_POPOUT = 1;
  const HEADER = 32;
  const BUCKET_BITS = 9;               // key < 2^49 ⇒ 高 9 位 ∈ [0, 512)
  const BUCKETS = 1 << BUCKET_BITS;
  const LOW_BITS = 49 - BUCKET_BITS;   // 40
  const LOW_SPAN = Math.pow(2, LOW_BITS);
  const IDX = HEADER + (BUCKETS + 1) * 4;

  // ⚠ 这三个状态变量必须**声明在 tryParse 之前**：tryParse 里给 _fail 赋值，
  //   `let` 有 TDZ，声明写在后面的话「模块加载期间就调一次 tryParse」会当场炸。
  let _state = 'none', _fail = '', _book = null;

  /** 一个 count 条的库文件有多少字节（gen-book 报体积、测试算预期都读它）。 */
  function byteSize(count) { return IDX + count * 6; }

  function fnv1a(bytes, from, to) {
    let h = 0x811c9dc5;
    for (let i = from; i < to; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }

  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function setU32(b, o, v) { b[o] = v & 255; b[o + 1] = (v >>> 8) & 255; b[o + 2] = (v >>> 16) & 255; b[o + 3] = (v >>> 24) & 255; }

  /**
   * ⭐ 打包成库文件。keys 可以是任意顺序（gen-book 给的是 DFS 序），本函数**按 key 升序重排**
   * 并同步搬动 scores —— 二分查找的前提就是有序。
   * @param o { ply, keys: Float64Array|number[], scores: Int8Array|number[], srcHash, ruleset }
   * @returns Uint8Array
   */
  function encode(o) {
    const n = o.keys.length;
    if (o.scores.length !== n) throw new Error('keys/scores 长度不一致');
    if (!Number.isInteger(o.ply) || o.ply < 1) throw new Error('ply 必须是正整数');
    const ord = new Uint32Array(n);
    for (let i = 0; i < n; i++) ord[i] = i;
    const keys = o.keys;
    // ⚠ TypedArray.prototype.sort 带比较器是稳定且原地的；key 是 < 2^49 的整数，相减不会溢出精度。
    ord.sort((x, y) => keys[x] - keys[y]);

    const out = new Uint8Array(byteSize(n));
    out[0] = 0x43; out[1] = 0x34; out[2] = 0x42; out[3] = 0x4B;   // 'C4BK'
    out[4] = FORMAT;
    out[5] = o.ruleset | 0;
    out[6] = o.ply & 255; out[7] = (o.ply >> 8) & 255;
    setU32(out, 8, n);
    setU32(out, 12, o.srcHash >>> 0);
    // 16..19 校验和最后填

    let prev = -1, b = 0;
    for (let i = 0; i < n; i++) {
      const k = keys[ord[i]];
      if (!Number.isInteger(k) || k < 1 || k >= LOW_SPAN * BUCKETS) throw new Error('key 越界：' + k);
      if (k === prev) throw new Error('key 重复：' + k + '（枚举去重漏了）');
      prev = k;
      const hi = Math.floor(k / LOW_SPAN);
      while (b <= hi) { setU32(out, HEADER + b * 4, i); b++; }
      const lo = k - hi * LOW_SPAN;
      const p = IDX + i * 5;
      out[p] = Math.floor(lo / 4294967296);
      const l32 = lo % 4294967296;
      out[p + 1] = (l32 >>> 24) & 255; out[p + 2] = (l32 >>> 16) & 255;
      out[p + 3] = (l32 >>> 8) & 255; out[p + 4] = l32 & 255;
      const s = o.scores[ord[i]];
      if (!Number.isInteger(s) || s < -128 || s > 127) throw new Error('分数越界：' + s);
      out[IDX + n * 5 + i] = s & 255;
    }
    while (b <= BUCKETS) { setU32(out, HEADER + b * 4, n); b++; }
    setU32(out, 16, fnv1a(out, HEADER, out.length));
    return out;
  }

  /**
   * ⭐ 解析（严格）。任何一处不对就**抛错** —— 调用方 tryParse/load 会把它变成「没有库」。
   * @returns { ply, count, ruleset, srcHash, format, get(key) }
   */
  function parse(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < IDX) throw new Error('开局库太短：' + b.length + ' 字节');
    if (b[0] !== 0x43 || b[1] !== 0x34 || b[2] !== 0x42 || b[3] !== 0x4B) throw new Error('开局库魔数不对（不是 C4BK 文件）');
    const format = b[4];
    if (format !== FORMAT) throw new Error('开局库格式版本 ' + format + '，本代码只认 ' + FORMAT + ' —— 请重新生成');
    const ruleset = b[5];
    const ply = b[6] | (b[7] << 8);
    const count = u32(b, 8);
    const srcHash = u32(b, 12);
    const want = byteSize(count);
    if (b.length !== want) throw new Error('开局库长度不符：' + b.length + ' ≠ ' + want + '（count=' + count + '）');
    if (ply < 1 || ply > 42) throw new Error('开局库 ply 不合法：' + ply);
    const sum = u32(b, 16);
    // ⚠ 校验和必须真算（3.6 MiB 扫一遍 ≈ 几毫秒，只在加载时一次）：
    //   一个坏掉几个字节的库不会崩，只会**安静地给错分数** —— 那正是本文件最怕的事。
    const got = fnv1a(b, HEADER, b.length);
    if (got !== sum) throw new Error('开局库校验和不符（文件损坏或没下完）：' + got + ' ≠ ' + sum);
    if (u32(b, HEADER + BUCKETS * 4) !== count) throw new Error('桶索引末尾 ≠ count（索引损坏）');

    const keysOff = IDX, scoresOff = IDX + count * 5;

    function lowAt(i) {
      const p = keysOff + i * 5;
      return b[p] * 4294967296 + (((b[p + 1] << 24) | (b[p + 2] << 16) | (b[p + 3] << 8) | b[p + 4]) >>> 0);
    }

    /** @returns 该局面的精确分数，或 **undefined = 库里没有**（调用方必须照常搜索）。 */
    function get(key) {
      // ⚠ 类型守卫不能省：拿一个非数（比如没算 key 就传了棋盘对象）进来，
      //   Math.floor(NaN/x) = NaN、NaN 比较恒假 ⇒ 会走完二分再返回 undefined（不报错、只是白跑）。
      if (typeof key !== 'number' || !Number.isInteger(key)) return undefined;
      const hi = Math.floor(key / LOW_SPAN);
      if (hi < 0 || hi >= BUCKETS) return undefined;
      let lo = u32(b, HEADER + hi * 4), hiIdx = u32(b, HEADER + (hi + 1) * 4) - 1;
      const target = key - hi * LOW_SPAN;
      while (lo <= hiIdx) {
        const mid = (lo + hiIdx) >> 1;
        const v = lowAt(mid);
        if (v === target) return (b[scoresOff + mid] << 24) >> 24;   // int8 还原
        if (v < target) lo = mid + 1; else hiIdx = mid - 1;
      }
      return undefined;
    }

    /** 第 i 条记录（测试/门禁遍历用）。⚠ 顺序 = key 升序，不是生成顺序。 */
    function at(i) {
      if (i < 0 || i >= count) throw new Error('下标越界 ' + i);
      let bkt = 0;
      // 桶索引是单调的 ⇒ 二分找 i 落在哪个桶
      let l = 0, r = BUCKETS - 1;
      while (l <= r) { const m = (l + r) >> 1; if (u32(b, HEADER + m * 4) <= i) { bkt = m; l = m + 1; } else r = m - 1; }
      return { key: bkt * LOW_SPAN + lowAt(i), score: (b[scoresOff + i] << 24) >> 24 };
    }

    return { ply: ply, count: count, ruleset: ruleset, srcHash: srcHash, format: format,
             bytes: b.length, get: get, at: at };
  }

  /** 宽容版：坏了就 null（绝不抛）。⭐ 运行时**只许**走这一条。 */
  function tryParse(bytes) {
    try { return parse(bytes); }
    catch (e) { _fail = String(e && e.message || e); return null; }
  }

  // ─────────── 运行时装载（DESIGN §9.2：懒加载，首屏不等库）───────────
  // ⭐ 状态机只有四态，UI 直接读它决定提示按钮显示「提示」还是「计算中」：
  //   'none'（没装/没开始）→ 'loading' → 'ready' | 'failed'
  // ⛔ 'failed' **不是错误弹窗**，是「这局慢一点」——游戏照常可玩，绝不许因此拦住玩家。
  function status() { return { state: _state, ply: _book ? _book.ply : 0, count: _book ? _book.count : 0, error: _fail }; }

  /** 装进求解器（唯一入口）。@returns true = 装上了 */
  function install(bk) {
    if (!bk) return false;
    S.setBook(bk);
    _book = bk; _state = 'ready'; _fail = '';
    return true;
  }
  function uninstall() { S.setBook(null); _book = null; _state = 'none'; _fail = ''; }

  /**
   * ⭐ web 懒加载：**永不抛、永不 reject**，失败只是 resolve(false)。
   * 首屏不要 await 它 —— 让玩家先落子，库到位后自然变快（DESIGN §9.2）。
   */
  function load(url) {
    _state = 'loading'; _fail = '';
    return Promise.resolve()
      .then(() => fetch(url))
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then(buf => {
        const bk = tryParse(new Uint8Array(buf));
        if (!bk) throw new Error(_fail || '解析失败');
        install(bk);
        return true;
      })
      .catch(e => {
        _state = 'failed'; _fail = String(e && e.message || e);
        // ⚠ 只 warn，不 throw、不弹窗：库没到 = 慢，不是错。
        if (typeof console !== 'undefined') console.warn('[book] 开局库未就位（游戏照常可玩，只是提示会慢）：' + _fail);
        return false;
      });
  }

  /** Node 侧同步加载（tools / tests 用）。同样**不抛**：@returns 库对象或 null */
  function loadFileSync(p) {
    if (!inNode) throw new Error('loadFileSync 只在 Node 里可用');
    _state = 'loading'; _fail = '';
    let buf;
    try { buf = require('fs').readFileSync(p); }
    catch (e) { _state = 'failed'; _fail = String(e && e.message || e); return null; }
    const bk = tryParse(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
    if (!bk) { _state = 'failed'; return null; }
    install(bk);
    return bk;
  }

  const API = Object.freeze({
    FORMAT, RULESET_CLASSIC, RULESET_POPOUT, BUCKETS, HEADER, byteSize,
    encode, parse, tryParse, install, uninstall, load, loadFileSync, status
  });
  // ⚠ 浏览器侧在加载时就取 root.Solver ⇒ index.html 的脚本顺序必须是
  //   bitboard.js → rules-classic.js → solver.js → **book.js**（乱了是「S is undefined」当场炸，
  //   响的，不是静默错，但别踩）。
  if (inNode) module.exports = API;
  else root.Book = API;
})(typeof self !== 'undefined' ? self : this);
