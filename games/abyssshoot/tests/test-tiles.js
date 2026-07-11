const assert = require('assert');
const Tiles = require('../js/tiles.js');

// TILES 是按 2 的幂递增的数组,从 2 起
assert(Array.isArray(Tiles.TILES) && Tiles.TILES.length >= 12, 'TILES 至少 12 档');
assert.strictEqual(Tiles.TILES[0].v, 2, '第 0 档是 2');
for (let i = 0; i < Tiles.TILES.length; i++) {
  assert.strictEqual(Tiles.TILES[i].v, 2 ** (i + 1), `第 ${i} 档应为 2^${i + 1}`);
  assert(typeof Tiles.TILES[i].fish === 'string' && Tiles.TILES[i].fish.length > 0, '每档有 fish id');
}

// tierOf: 值→档位下标
assert.strictEqual(Tiles.tierOf(2), 0);
assert.strictEqual(Tiles.tierOf(64), 5);
assert.strictEqual(Tiles.tierOf(3), -1, '非梯值返回 -1');

// fishOf: 值→鱼 id
assert.strictEqual(Tiles.fishOf(2), Tiles.TILES[0].fish);
assert.strictEqual(Tiles.fishOf(999), null, '非梯值返回 null');

// fmt: 巨数缩写
assert.strictEqual(Tiles.fmt(8192), '8192');
assert.strictEqual(Tiles.fmt(1048576), '1M');
assert.strictEqual(Tiles.fmt(2097152), '2M');

// MAX_TILE_VALUE = 最高档值
assert.strictEqual(Tiles.MAX_TILE_VALUE, Tiles.TILES[Tiles.TILES.length - 1].v);

console.log('test-tiles OK');
