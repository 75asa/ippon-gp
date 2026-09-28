// web/src/shared/mode.js の単体テスト。node --test tests/unit/ で実行（依存なし）
// #22: 各 HOST 遷移が「1 パッチ = 1 回の update()」になっていて、
// 影響するキーがすべて含まれる（＝別々の set/remove に分解して途中状態を晒さない）ことを確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeUpdates, MODES } from '../../web/src/shared/mode.js';

test('taiki: 前の問の残骸を片付けて taiki を出す', () => {
  const patch = modeUpdates('taiki');
  assert.equal(patch.mode, 'taiki');
  assert.equal(patch.taiki, true);
  assert.equal(patch.odai, null);
  assert.equal(patch.agenda, null);
  assert.equal(patch.answer_text, null);
  assert.equal(patch.votes, null);
  assert.equal(patch.revealed, null);
  // keep_audio には触れない（saiten 専用）
  assert.ok(!('keep_audio' in patch));
});

test('saiten: keep_audio を同じパッチに含める（agenda:null と同時に書く）', () => {
  const patch = modeUpdates('saiten');
  assert.equal(patch.mode, 'saiten');
  assert.equal(patch.keep_audio, true);
  assert.equal(patch.agenda, null);
  assert.equal(patch.taiki, null);
  assert.equal(patch.odai, null);
  assert.equal(patch.votes, null);
  assert.equal(patch.revealed, null);
});

test('scoreboard: taiki/odai/votes/revealed/agenda を片付ける', () => {
  const patch = modeUpdates('scoreboard');
  assert.equal(patch.mode, 'scoreboard');
  assert.equal(patch.taiki, null);
  assert.equal(patch.odai, null);
  assert.equal(patch.votes, null);
  assert.equal(patch.revealed, null);
  assert.equal(patch.agenda, null);
});

test('odai: n を書き、revealed は false（削除ではない）', () => {
  const patch = modeUpdates('odai', { n: 3 });
  assert.equal(patch.mode, 'odai');
  assert.equal(patch.odai, 3);
  assert.equal(patch.revealed, false);
  assert.equal(patch.taiki, null);
  assert.equal(patch.votes, null);
  assert.equal(patch.agenda, null);
});

test('odai: n が範囲外・非整数なら投げる（ルールの enum とも一致させる）', () => {
  assert.throws(() => modeUpdates('odai', { n: 0 }));
  assert.throws(() => modeUpdates('odai', { n: 7 }));
  assert.throws(() => modeUpdates('odai', { n: 2.5 }));
  assert.throws(() => modeUpdates('odai', { n: '3' }));
  assert.throws(() => modeUpdates('odai', {}));
});

test('resetVotes: mode には触れない', () => {
  const patch = modeUpdates('resetVotes');
  assert.deepEqual(patch, { votes: null, revealed: false });
  assert.ok(!('mode' in patch));
});

test('agendaClear: agenda だけ消す。mode には触れない', () => {
  const patch = modeUpdates('agendaClear');
  assert.deepEqual(patch, { agenda: null });
});

test('未知の action は投げる', () => {
  assert.throws(() => modeUpdates('nope'));
});

test('mode を書く全アクションの値は database.rules.json の enum に含まれる', () => {
  for (const action of ['taiki', 'saiten', 'scoreboard']) {
    assert.ok(MODES.includes(modeUpdates(action).mode));
  }
  assert.ok(MODES.includes(modeUpdates('odai', { n: 1 }).mode));
});

test('odai: お題数の設定（max）を超える番号は投げる。省略時の上限は 6', () => {
  assert.equal(modeUpdates('odai', { n: 3, max: 3 }).odai, 3);
  assert.throws(() => modeUpdates('odai', { n: 4, max: 3 }));
  assert.equal(modeUpdates('odai', { n: 6 }).odai, 6);
  assert.throws(() => modeUpdates('odai', { n: 7 }));
});
