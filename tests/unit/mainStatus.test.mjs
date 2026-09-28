// web/src/shared/mainStatus.js の単体テスト。node --test tests/unit/ で実行（依存なし）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENTS_MAIN_PATH,
  MAX_FAILED,
  FAILED_LABEL_MAX_LEN,
  shortLabel,
  buildMainStatus,
  statusEquals,
  shouldWriteNow,
  mainStatusPhase,
} from '../../web/src/shared/mainStatus.js';

test('CLIENTS_MAIN_PATH は clients/main', () => {
  assert.equal(CLIENTS_MAIN_PATH, 'clients/main');
});

test('shortLabel: Storage の URL からパス部分だけ取り出してデコードする', () => {
  const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/image_agenda%2Fanswer_question1_1.png?alt=media';
  assert.equal(shortLabel(url), 'image_agenda/answer_question1_1.png');
});

test('shortLabel: /o/ が無い URL はそのまま返す', () => {
  assert.equal(shortLabel('not-a-storage-url'), 'not-a-storage-url');
});

test('shortLabel: デコードできない場合は生のまま返す（例外で落ちない）', () => {
  const url = 'https://x/o/%E0%A4%A?alt=media'; // 壊れた % エンコード
  assert.equal(shortLabel(url), '%E0%A4%A');
});

test('shortLabel: 長すぎるラベルは切り詰める', () => {
  const longName = 'a'.repeat(FAILED_LABEL_MAX_LEN + 50);
  const url = `https://x/o/${longName}?alt=media`;
  const out = shortLabel(url);
  assert.equal(out.length, FAILED_LABEL_MAX_LEN);
});

test('buildMainStatus: 読み込み中・成功・失敗を数える', () => {
  const order = ['a', 'b', 'c', 'd'];
  const state = { a: 'ok', b: 'ok', c: 'error', d: 'loading' };
  const status = buildMainStatus(order, state);
  assert.deepEqual(status, { loaded: 2, total: 4, failed: ['c'], failedCount: 1 });
});

test('buildMainStatus: 空の一覧は total 0', () => {
  assert.deepEqual(buildMainStatus([], {}), { loaded: 0, total: 0, failed: [], failedCount: 0 });
});

test('buildMainStatus: failed は MAX_FAILED 件までしか積まないが failedCount は実数', () => {
  const order = Array.from({ length: MAX_FAILED + 5 }, (_, i) => `u${i}`);
  const state = Object.fromEntries(order.map((u) => [u, 'error']));
  const status = buildMainStatus(order, state);
  assert.equal(status.failed.length, MAX_FAILED);
  assert.equal(status.failedCount, MAX_FAILED + 5);
  assert.equal(status.total, MAX_FAILED + 5);
  assert.deepEqual(status.failed, order.slice(0, MAX_FAILED).map(shortLabel));
});

test('statusEquals: loaded/total/failedCount/failed が同じなら true', () => {
  const a = { loaded: 3, total: 5, failed: ['x'], failedCount: 1 };
  const b = { loaded: 3, total: 5, failed: ['x'], failedCount: 1 };
  assert.equal(statusEquals(a, b), true);
});

test('statusEquals: どれか違えば false（null も false）', () => {
  const base = { loaded: 3, total: 5, failed: ['x'], failedCount: 1 };
  assert.equal(statusEquals(base, { ...base, loaded: 4 }), false);
  assert.equal(statusEquals(base, { ...base, failed: ['y'] }), false);
  assert.equal(statusEquals(base, { ...base, failed: ['x', 'y'], failedCount: 2 }), false);
  assert.equal(statusEquals(null, base), false);
  assert.equal(statusEquals(base, null), false);
});

test('shouldWriteNow: 初回（lastWriteAt が無い）は必ず書く', () => {
  assert.equal(shouldWriteNow(null, 1000, 300, false), true);
});

test('shouldWriteNow: finished なら間引かない', () => {
  assert.equal(shouldWriteNow(1000, 1050, 300, true), true);
});

test('shouldWriteNow: 間隔が短ければ間引く、十分空けば書く', () => {
  assert.equal(shouldWriteNow(1000, 1200, 300, false), false);
  assert.equal(shouldWriteNow(1000, 1300, 300, false), true);
});

test('mainStatusPhase: データが無い/形が違うと unknown', () => {
  assert.equal(mainStatusPhase(null), 'unknown');
  assert.equal(mainStatusPhase({}), 'unknown');
  assert.equal(mainStatusPhase({ loaded: 0, total: 0 }), 'unknown');
});

test('mainStatusPhase: 失敗があれば error、無くて完了なら done、途中なら loading', () => {
  assert.equal(mainStatusPhase({ loaded: 5, total: 10, failedCount: 1, failed: ['a'] }), 'error');
  assert.equal(mainStatusPhase({ loaded: 10, total: 10, failedCount: 0, failed: [] }), 'done');
  assert.equal(mainStatusPhase({ loaded: 4, total: 10, failedCount: 0, failed: [] }), 'loading');
  // failedCount 省略時は failed 配列の長さで判定
  assert.equal(mainStatusPhase({ loaded: 5, total: 10, failed: ['a', 'b'] }), 'error');
});
