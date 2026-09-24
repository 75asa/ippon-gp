#!/usr/bin/env node
// database.rules.json を Realtime Database エミュレータに対して検証する。
// 使い方（エミュレータの起動〜停止まで込み）:
//   npx firebase emulators:exec --only database --project demo-ippon "node scripts/test-rules.mjs"
// もしくは別ターミナルで `firebase emulators:start --only database --project demo-ippon` を起動しておき
//   node scripts/test-rules.mjs
// エミュレータ jar を直接起動した等でルールが未ロードの場合は `--load-rules` を付けると
// database.rules.json を（CLI と同じ手順で）エミュレータに流し込んでから検証する。
// 環境変数: FIREBASE_DATABASE_EMULATOR_HOST（既定 localhost:9000）, GCLOUD_PROJECT（既定 demo-ippon）
// Node 22 以上（グローバル fetch）。追加依存なし。

import { readFile } from 'node:fs/promises';

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || 'localhost:9000';
const ns = process.env.GCLOUD_PROJECT || 'demo-ippon';
const base = `http://${host}`;

// 未認証クライアント（各画面と同じ条件）として REST で書き込む。
async function rest(method, path, body) {
  const res = await fetch(`${base}${path}.json?ns=${ns}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

// エミュレータの管理者トークン（owner）でルールを流し込む（firebase CLI の updateRules と同じ）。
async function loadRules() {
  const rulesPath = new URL('../database.rules.json', import.meta.url);
  const res = await fetch(`${base}/.settings/rules.json?ns=${ns}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: await readFile(rulesPath, 'utf8'),
  });
  if (!res.ok) throw new Error(`rules upload failed: ${res.status} ${await res.text()}`);
  console.log(`loaded rules from ${rulesPath.pathname}`);
}

// エミュレータの管理者トークン（owner）でルールを迂回して初期化する。
async function resetDb() {
  const res = await fetch(`${base}/.json?ns=${ns}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  });
  if (!res.ok) throw new Error(`reset failed: ${res.status} ${await res.text()}`);
}

const ALLOW = 'allow';
const DENY = 'deny';
const put = (path, body) => ({ method: 'PUT', path, body });
const del = (path) => ({ method: 'DELETE', path });

// [説明, リクエスト, 期待] の順に実行する。前のケースの結果に依存するものは順番を入れ替えない。
const cases = [
  // 未知キー / ルート
  ['未知のトップレベルキー foo は書けない', put('/foo', 'bar'), DENY],
  ['ルートへの一括書き込みは拒否', put('/', { mode: 'taiki' }), DENY],

  // votes: JUDGE が唯一書く場所
  ['votes/1 = true を新規作成できる', put('/votes/1', true), ALLOW],
  ['votes/2 = true を新規作成できる', put('/votes/2', true), ALLOW],
  ['votes/1 の上書き（再投票）は拒否', put('/votes/1', true), DENY],
  ['votes/1 の個別削除は拒否', del('/votes/1'), DENY],
  ['votes/3 = false は拒否', put('/votes/3', false), DENY],
  ['votes/3 = "yes" は拒否', put('/votes/3', 'yes'), DENY],
  ['votes/0 は座席範囲外で拒否', put('/votes/0', true), DENY],
  ['votes/11 は座席範囲外で拒否', put('/votes/11', true), DENY],
  ['votes/abc は座席範囲外で拒否', put('/votes/abc', true), DENY],
  ['votes 全体の削除（HOST の resetVotes）は許可', del('/votes'), ALLOW],
  ['votes 全体への一括書き込みも各座席の検証を通る（不正値は拒否）', put('/votes', { 1: true, 12: true }), DENY],

  // mode
  ['mode = "saiten" は許可', put('/mode', 'saiten'), ALLOW],
  ['mode = "hack" は enum 外で拒否', put('/mode', 'hack'), DENY],
  ['mode = 1 は型違いで拒否', put('/mode', 1), DENY],
  ['mode の削除は拒否', del('/mode'), DENY],

  // taiki / odai / revealed / keep_audio
  ['taiki = true は許可', put('/taiki', true), ALLOW],
  ['taiki = false は拒否', put('/taiki', false), DENY],
  ['taiki の削除は許可', del('/taiki'), ALLOW],
  ['odai = 3 は許可', put('/odai', 3), ALLOW],
  ['odai = 7 は範囲外で拒否', put('/odai', 7), DENY],
  ['odai = "3" は型違いで拒否', put('/odai', '3'), DENY],
  ['odai = 2.5 は整数でないので拒否', put('/odai', 2.5), DENY],
  ['odai の削除は許可', del('/odai'), ALLOW],
  ['revealed = false は許可', put('/revealed', false), ALLOW],
  ['revealed = "x" は拒否', put('/revealed', 'x'), DENY],
  ['revealed の削除は許可', del('/revealed'), ALLOW],
  ['keep_audio = true は許可', put('/keep_audio', true), ALLOW],
  ['keep_audio = false は拒否', put('/keep_audio', false), DENY],
  ['keep_audio の削除は許可', del('/keep_audio'), ALLOW],

  // scores
  ['scores = [0,0,0,0,0] は許可', put('/scores', [0, 0, 0, 0, 0]), ALLOW],
  ['scores = [1,2,3,4,5] は許可', put('/scores', [1, 2, 3, 4, 5]), ALLOW],
  ['scores 要素 3 個は拒否', put('/scores', [1, 2, 3]), DENY],
  ['scores 要素 6 個は拒否', put('/scores', [1, 2, 3, 4, 5, 6]), DENY],
  ['scores に文字列を含むと拒否', put('/scores', [1, 2, 3, 4, 'x']), DENY],
  ['scores に 100 を含むと拒否', put('/scores', [1, 2, 3, 4, 100]), DENY],
  ['scores に負数を含むと拒否', put('/scores', [-1, 2, 3, 4, 5]), DENY],
  ['scores に小数を含むと拒否', put('/scores', [1.5, 2, 3, 4, 5]), DENY],
  ['scores/0 単体の更新も検証される（許可）', put('/scores/0', 9), ALLOW],
  ['scores/0 = 999 は拒否', put('/scores/0', 999), DENY],
  ['scores を文字列で置き換えるのは拒否', put('/scores', 'zero'), DENY],
  ['scores の削除は拒否', del('/scores'), DENY],

  // agenda / answer_text
  ['agenda = https URL は許可', put('/agenda', 'https://firebasestorage.googleapis.com/v0/b/x/o/a.mp4?alt=media'), ALLOW],
  ['agenda = javascript: URL は拒否', put('/agenda', 'javascript:alert(1)'), DENY],
  ['agenda = 空文字は拒否', put('/agenda', ''), DENY],
  ['agenda の削除（MAIN の動画終了）は許可', del('/agenda'), ALLOW],
  ['answer_text = JSON 文字列は許可', put('/answer_text', '{"answer":"a","name":"b"}'), ALLOW],
  ['answer_text = オブジェクトは拒否', put('/answer_text', { answer: 'a' }), DENY],
  ['answer_text の削除は許可', del('/answer_text'), ALLOW],

  // se_master / se_trigger
  ['se_master = 8 文字 ID は許可', put('/se_master', 'k3j9x1qz'), ALLOW],
  ['se_master = 長すぎる文字列は拒否', put('/se_master', 'a'.repeat(40)), DENY],
  ['se_trigger {key,action,ts} は許可', put('/se_trigger', { key: 'laugh_1', action: 'play', ts: Date.now() }), ALLOW],
  ['se_trigger key=se_clap action=stop は許可', put('/se_trigger', { key: 'se_clap', action: 'stop', ts: Date.now() }), ALLOW],
  ['se_trigger key が未知なら拒否', put('/se_trigger', { key: 'evil', action: 'play', ts: 1 }), DENY],
  ['se_trigger action が未知なら拒否', put('/se_trigger', { key: 'laugh_1', action: 'loop', ts: 1 }), DENY],
  ['se_trigger ts が欠けると拒否', put('/se_trigger', { key: 'laugh_1', action: 'play' }), DENY],
  ['se_trigger に余計なフィールドがあると拒否', put('/se_trigger', { key: 'laugh_1', action: 'play', ts: 1, x: 1 }), DENY],
  ['se_trigger の削除は拒否', del('/se_trigger'), DENY],

  // camera_room
  ['camera_room = 6 文字 ID は許可', put('/camera_room', 'AB12CD'), ALLOW],
  ['camera_room = 空文字は拒否', put('/camera_room', ''), DENY],
  ['camera_room = オブジェクトは拒否', put('/camera_room', { id: 'x' }), DENY],
  ['camera_room の削除（CAM 停止）は許可', del('/camera_room'), ALLOW],

  // 読み取り
  ['ルートの読み取りは誰でも可', { method: 'GET', path: '/' }, ALLOW],
];

function classify(status, text) {
  if (status === 200) return ALLOW;
  if ((status === 401 || status === 403) && /permission denied/i.test(text)) return DENY;
  return `unexpected(${status} ${text.trim().slice(0, 80)})`;
}

console.log(`RTDB emulator: ${base}  namespace: ${ns}`);
if (process.argv.includes('--load-rules')) await loadRules();
await resetDb();
let pass = 0;
let fail = 0;
for (const [name, req, expected] of cases) {
  const { status, text } = await rest(req.method, req.path, req.body);
  const actual = classify(status, text);
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${req.method.padEnd(6)} ${req.path.padEnd(14)} -> ${String(status).padEnd(3)} ${expected.padEnd(5)} ${name}${ok ? '' : `  (got ${actual})`}`);
}
console.log(`\n${pass} passed, ${fail} failed, ${cases.length} total`);
process.exit(fail === 0 ? 0 : 1);
