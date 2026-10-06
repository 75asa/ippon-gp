// web/src/shared/players.js の回答者数まわりの単体テスト。node --test tests/unit/ で実行（依存なし）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playerCountFromValue, isPosVisible, DEFAULT_PLAYER_COUNT } from '../../web/src/shared/players.js';

test('playerCountFromValue: 2〜5 の整数はそのまま', () => {
  for (const n of [2, 3, 4, 5]) assert.equal(playerCountFromValue(n), n);
});

test('playerCountFromValue: 無い・範囲外・整数でない・型違いは既定値（5）', () => {
  for (const v of [null, undefined, 0, 1, 6, 2.5, '3', NaN, {}]) assert.equal(playerCountFromValue(v), DEFAULT_PLAYER_COUNT);
  assert.equal(DEFAULT_PLAYER_COUNT, 5);
});

test('isPosVisible: 既定（5 人）は全位置が見える', () => {
  for (let pos = 0; pos < 5; pos++) assert.equal(isPosVisible(pos, 5), true);
});

test('isPosVisible: N 人のときは右端から N 位置だけ見える（回答者 1..N）', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((pos) => isPosVisible(pos, 3)), [false, false, true, true, true]);
  assert.deepEqual([0, 1, 2, 3, 4].map((pos) => isPosVisible(pos, 2)), [false, false, false, true, true]);
});
