// web/src/shared/agenda.js の単体テスト。node --test tests/unit/ で実行（依存なし）
// PR #92 のレビューで見つかった回帰（動画→別の動画への切替でHOSTの停止ボタンが壊れる）の再発防止。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agendaClearAction } from '../../web/src/shared/agenda.js';

test('動画→別の動画への切替: currentAgendaKey・ボタン表示はHOST側管理なので何もしない', () => {
  const action = agendaClearAction({ hostInitiated: true, replacing: true });
  assert.deepEqual(action, { resetCurrentKey: false, resetButtons: false, restoreMode: false });
});

test('画像→動画への切替: 動画→動画の切替と同じ扱い（何もしない）', () => {
  // toggleAgendaVideo() は切替元が画像キーでも動画キーでも同じ「再生」分岐を通るため、
  // 動画→動画のケースと全く同じ入力・結果になることをそのまま保証する（起点の種類に依存しない）
  const action = agendaClearAction({ hostInitiated: true, replacing: true });
  assert.deepEqual(action, { resetCurrentKey: false, resetButtons: false, restoreMode: false });
});

test('HOSTの明示停止（差し替え無し）: 見た目はリセットするが mode は書き戻さない', () => {
  const action = agendaClearAction({ hostInitiated: true, replacing: false });
  assert.deepEqual(action, { resetCurrentKey: true, resetButtons: true, restoreMode: false });
});

test('HOSTがagendaモードから離脱（待機/お題/採点/結果への遷移）: 停止と同じ扱い', () => {
  const action = agendaClearAction({ hostInitiated: true, replacing: false });
  assert.deepEqual(action, { resetCurrentKey: true, resetButtons: true, restoreMode: false });
});

test('MAIN側の自動終了（動画が最後まで再生された）: 見た目をリセットし、previousModeに戻す', () => {
  const action = agendaClearAction({ hostInitiated: false, replacing: false });
  assert.deepEqual(action, { resetCurrentKey: true, resetButtons: true, restoreMode: true });
});

test('hostInitiated が無い（想定外の削除）ときは安全側に倒して自動終了と同じ扱いにする', () => {
  const action = agendaClearAction({});
  assert.deepEqual(action, { resetCurrentKey: true, resetButtons: true, restoreMode: true });
});
