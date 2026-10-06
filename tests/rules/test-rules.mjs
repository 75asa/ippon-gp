#!/usr/bin/env node
// database.rules.json を Realtime Database エミュレータに対して検証する。
// 使い方（エミュレータの起動〜停止まで込み）:
//   npx firebase emulators:exec --only database --project demo-ippon "node tests/rules/test-rules.mjs --load-rules"
// もしくは別ターミナルで `firebase emulators:start --only database --project demo-ippon` を起動しておき
//   node tests/rules/test-rules.mjs
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
  const rulesPath = new URL('../../firebase/database.rules.json', import.meta.url);
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
const patch = (path, body) => ({ method: 'PATCH', path, body });
const del = (path) => ({ method: 'DELETE', path });

// settings/players の値を作る（回答者 1..5）
const players = () => Object.fromEntries([1, 2, 3, 4, 5].map((n) => [String(n), { last: `P${n}`, first: `F${n}` }]));

// seats/{seat} の値を作る（at はサーバー時刻）
const seat = (device) => ({ device, at: { '.sv': 'timestamp' } });
const DEV_A = 'dabcdef1234';
const DEV_B = 'dzyxwvu9876';

// settings/judges の値を作る（席 1..n、7 席目以降は会場審査員）
const judges = (n) => Object.fromEntries(
  Array.from({ length: n }, (_, i) => [String(i + 1), { name: `J${i + 1}`, kind: i >= 6 ? 'venue' : 'panel' }]),
);

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

  // camera_quality（配信品質の要約。MAIN が書く。#63）
  ['camera_quality の正しい形は許可', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'host', ts: Date.now() }), ALLOW],
  ['camera_quality limit=bandwidth も許可', put('/camera_quality', { res: '1280x720', fps: 24, kbps: 900, codec: 'VP8', limit: 'bandwidth', path: 'nat', ts: Date.now() }), ALLOW],
  ['camera_quality path=unknown も許可', put('/camera_quality', { res: '1280x720', fps: 24, kbps: 900, codec: 'VP8', limit: 'none', path: 'unknown', ts: Date.now() }), ALLOW],
  ['camera_quality フィールド欠け（ts 無し）は拒否', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'host' }), DENY],
  ['camera_quality フィールド欠け（path 無し）は拒否', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', ts: 1 }), DENY],
  ['camera_quality res の形が不正（x なし）だと拒否', put('/camera_quality', { res: '1920', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'host', ts: 1 }), DENY],
  ['camera_quality res が数値だと拒否', put('/camera_quality', { res: 0, fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'host', ts: 1 }), DENY],
  ['camera_quality fps が範囲外（負数）だと拒否', put('/camera_quality', { res: '1920x1080', fps: -1, kbps: 4200, codec: 'H264', limit: 'none', path: 'host', ts: 1 }), DENY],
  ['camera_quality fps が小数だと拒否', put('/camera_quality', { res: '1920x1080', fps: 29.5, kbps: 4200, codec: 'H264', limit: 'none', path: 'host', ts: 1 }), DENY],
  ['camera_quality kbps が上限超えだと拒否', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 200000, codec: 'H264', limit: 'none', path: 'host', ts: 1 }), DENY],
  ['camera_quality codec に記号があると拒否', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264;evil', limit: 'none', path: 'host', ts: 1 }), DENY],
  ['camera_quality limit が未知の値だと拒否', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'evil', path: 'host', ts: 1 }), DENY],
  ['camera_quality path が未知の値（relay 等）だと拒否', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'relay', ts: 1 }), DENY],
  ['camera_quality に余計なフィールドがあると拒否', put('/camera_quality', { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'host', ts: 1, note: 'x' }), DENY],
  ['camera_quality の個別フィールド更新も検証される（fps だけ不正）', put('/camera_quality/fps', -1), DENY],
  ['camera_quality の個別フィールド更新も検証される（path だけ不正）', put('/camera_quality/path', 'relay'), DENY],
  ['camera_quality の削除（カメラ停止）は許可', del('/camera_quality'), ALLOW],

  // settings/judges（設定画面）。ここに来た時点で votes は空
  ['settings/judges 8 席は許可', put('/settings/judges', judges(8)), ALLOW],
  ['settings/judges 5 席は下限未満で拒否', put('/settings/judges', judges(5)), DENY],
  ['settings/judges 11 席は上限超えで拒否', put('/settings/judges', judges(11)), DENY],
  ['settings/judges 席番号の欠け（1..6, 8）は拒否', put('/settings/judges', { ...judges(6), 8: { name: 'X', kind: 'venue' } }), DENY],
  ['settings/judges 名前が空だと拒否', put('/settings/judges', { ...judges(6), 1: { name: '', kind: 'panel' } }), DENY],
  ['settings/judges 名前 21 文字は拒否', put('/settings/judges', { ...judges(6), 1: { name: 'a'.repeat(21), kind: 'panel' } }), DENY],
  ['settings/judges 名前の前後に空白があると拒否', put('/settings/judges', { ...judges(6), 1: { name: ' KIHARA', kind: 'panel' } }), DENY],
  ['settings/judges 名前の末尾が全角スペースだと拒否', put('/settings/judges', { ...judges(6), 1: { name: 'KIHARA　', kind: 'panel' } }), DENY],
  ['settings/judges 名前の途中の空白は許可', put('/settings/judges', { ...judges(6), 1: { name: '会場 審査員', kind: 'panel' } }), ALLOW],
  ['settings/judges 名前が数値だと拒否', put('/settings/judges', { ...judges(6), 1: { name: 1, kind: 'panel' } }), DENY],
  ['settings/judges 種別が未知だと拒否', put('/settings/judges', { ...judges(6), 1: { name: 'A', kind: 'boss' } }), DENY],
  ['settings/judges 席に余計なフィールドがあると拒否', put('/settings/judges', { ...judges(6), 1: { name: 'A', kind: 'panel', x: 1 } }), DENY],
  ['settings/judges 日本語名 20 文字は許可', put('/settings/judges', { ...judges(8), 1: { name: 'あ'.repeat(20), kind: 'panel' } }), ALLOW],
  ['settings/judges 席 6 を消すと下限割れで拒否', del('/settings/judges/6'), DENY],
  ['settings/judges 末尾の席 8 を消すのは許可', del('/settings/judges/8'), ALLOW],
  ['settings/judges を 8 席に戻す', put('/settings/judges', judges(8)), ALLOW],
  ['settings の未知キーは拒否', put('/settings/theme', 'dark'), DENY],

  // 設定があるときの投票: 設定にある席だけ
  ['votes/9 は設定に無い席なので拒否', put('/votes/9', true), DENY],
  ['votes/8 は設定にある席なので許可', put('/votes/8', true), ALLOW],

  // 票が入っている間は、席の構成は変えられないが名前・種別は変えられる
  ['投票中に settings/judges を置き換えるのは拒否', put('/settings/judges', judges(9)), DENY],
  ['投票中に settings/judges を消すのは拒否', del('/settings/judges'), DENY],
  ['投票中に席 9 を追加するのは拒否', put('/settings/judges/9', { name: 'J9', kind: 'venue' }), DENY],
  ['投票中に席 9 の名前だけ作るのも拒否', put('/settings/judges/9/name', 'J9'), DENY],
  ['投票中に末尾の席 8 を消すのは拒否', del('/settings/judges/8'), DENY],
  ['投票中でも席 3 の名前は変えられる', put('/settings/judges/3/name', 'SHIBUTANI'), ALLOW],
  ['投票中でも席 3 の種別は変えられる', put('/settings/judges/3/kind', 'venue'), ALLOW],
  ['投票中でも名前・種別の一括更新はできる', patch('/settings/judges', { '1/name': 'KIHARA', '2/name': 'HARADA', '3/kind': 'panel' }), ALLOW],
  ['投票中でも不正な名前には変えられない', put('/settings/judges/3/name', ''), DENY],
  ['席 3 の名前の削除は拒否', del('/settings/judges/3/name'), DENY],

  // 票をリセットすれば初期値に戻せる。設定が無ければ従来どおり 1..10 に投票できる
  ['votes を消す', del('/votes'), ALLOW],
  ['票が無ければ settings/judges を消せる（初期値に戻す）', del('/settings/judges'), ALLOW],
  ['設定が無いときは votes/10 に投票できる', put('/votes/10', true), ALLOW],
  ['後片付け: votes を消す', del('/votes'), ALLOW],

  // settings/ipponThreshold（IPPON に必要な票数）。ここに来た時点で votes と settings/judges は空
  ['ipponThreshold = 5 は許可（審査員は初期値の 10 席）', put('/settings/ipponThreshold', 5), ALLOW],
  ['ipponThreshold = 0 は拒否', put('/settings/ipponThreshold', 0), DENY],
  ['ipponThreshold = 11 は拒否', put('/settings/ipponThreshold', 11), DENY],
  ['ipponThreshold = 2.5 は拒否', put('/settings/ipponThreshold', 2.5), DENY],
  ['ipponThreshold = "5" は型違いで拒否', put('/settings/ipponThreshold', '5'), DENY],
  ['票数 5 のとき審査員 4 席は拒否（定員 < 票数）', put('/settings/judges', judges(4)), DENY],
  ['ipponThreshold = 3 は許可', put('/settings/ipponThreshold', 3), ALLOW],
  ['票数 3 なら審査員 4 席は許可', put('/settings/judges', judges(4)), ALLOW],
  ['票数 3 のとき審査員 2 席は拒否', put('/settings/judges', judges(2)), DENY],
  ['審査員 4 席のとき票数 5 は拒否', put('/settings/ipponThreshold', 5), DENY],
  ['審査員 4 席のとき票数を消す（初期値 6 に戻す）のは拒否', del('/settings/ipponThreshold'), DENY],
  ['票数 4 は許可（定員ちょうど）', put('/settings/ipponThreshold', 4), ALLOW],
  ['votes/1 に投票', put('/votes/1', true), ALLOW],
  ['投票中は票数を変えられない', put('/settings/ipponThreshold', 3), DENY],
  ['投票中は票数を消せない', del('/settings/ipponThreshold'), DENY],
  ['votes を消す（票数の検証の続き）', del('/votes'), ALLOW],
  ['ipponThreshold = 1 は許可', put('/settings/ipponThreshold', 1), ALLOW],
  ['票数 1 なら審査員 1 席も許可', put('/settings/judges', judges(1)), ALLOW],
  ['審査員を 8 席に戻す', put('/settings/judges', judges(8)), ALLOW],
  ['審査員 8 席なら票数を消せる（初期値 6）', del('/settings/ipponThreshold'), ALLOW],
  ['票数 6（初期値）のとき審査員 5 席は拒否', put('/settings/judges', judges(5)), DENY],
  ['審査員 8 席のとき票数 8 は許可', put('/settings/ipponThreshold', 8), ALLOW],
  ['審査員 8 席のとき票数 9 は拒否', put('/settings/ipponThreshold', 9), DENY],
  ['後片付け: 票数を消す', del('/settings/ipponThreshold'), ALLOW],
  ['後片付け: 審査員の設定を消す', del('/settings/judges'), ALLOW],

  // settings/players（回答者の名前）
  ['settings/players 5 人は許可', put('/settings/players', players()), ALLOW],
  ['settings/players 4 人は拒否', put('/settings/players', { ...players(), 5: undefined }), DENY],
  ['settings/players 回答者 6 は拒否', put('/settings/players', { ...players(), 6: { last: 'X' } }), DENY],
  ['settings/players 下段の名前は省略できる', put('/settings/players', { ...players(), 1: { last: 'SAGAWA' } }), ALLOW],
  ['settings/players 上段の名前が無いと拒否', put('/settings/players', { ...players(), 1: { first: 'SO' } }), DENY],
  ['settings/players 上段の名前が空だと拒否', put('/settings/players', { ...players(), 1: { last: '' } }), DENY],
  ['settings/players 名前 21 文字は拒否', put('/settings/players', { ...players(), 1: { last: 'a'.repeat(21) } }), DENY],
  ['settings/players 名前の前後に空白があると拒否', put('/settings/players', { ...players(), 1: { last: 'SAGAWA ' } }), DENY],
  ['settings/players 余計なフィールドは拒否', put('/settings/players', { ...players(), 1: { last: 'A', photo: 'x' } }), DENY],
  ['回答者 3 の名前だけ変えられる', put('/settings/players/3/last', 'TOKUMOTO'), ALLOW],
  ['回答者 3 を消すのは拒否（5 人そろっていない）', del('/settings/players/3'), DENY],
  ['votes/1 に投票（回答者の検証の続き）', put('/votes/1', true), ALLOW],
  ['投票中でも回答者の名前は変えられる', put('/settings/players/3/last', 'TOKUMOTO2'), ALLOW],
  ['後片付け: votes を消す（回答者）', del('/votes'), ALLOW],
  ['settings/players を消せる（初期値に戻す）', del('/settings/players'), ALLOW],

  // settings/odaiCount（お題数、#18）。odai はこの上限（無ければ 6）を超えられない
  ['odai = 6 は許可（お題数の設定が無いので既定 6 まで）', put('/odai', 6), ALLOW],
  ['odai の削除', del('/odai'), ALLOW],
  ['odaiCount = 3 は許可', put('/settings/odaiCount', 3), ALLOW],
  ['odai = 4 はお題数 3 を超えるので拒否', put('/odai', 4), DENY],
  ['odai = 3 はお題数以内なので許可', put('/odai', 3), ALLOW],
  ['odai の削除（続き）', del('/odai'), ALLOW],
  ['odaiCount = 0 は拒否', put('/settings/odaiCount', 0), DENY],
  ['odaiCount = 7 は拒否（素材は 6 問分まで）', put('/settings/odaiCount', 7), DENY],
  ['odaiCount = 2.5 は整数でないので拒否', put('/settings/odaiCount', 2.5), DENY],
  ['odaiCount = "3" は型違いで拒否', put('/settings/odaiCount', '3'), DENY],
  ['後片付け: odaiCount を消す（初期値 6 に戻す）', del('/settings/odaiCount'), ALLOW],
  ['odaiCount を消した後は odai = 6 が再び許可', put('/odai', 6), ALLOW],
  ['後片付け: odai を消す', del('/odai'), ALLOW],

  // settings/playerCount（回答者数、#18）。2〜5 の整数のみ。scores は常に 5 要素のまま
  ['playerCount = 3 は許可', put('/settings/playerCount', 3), ALLOW],
  ['playerCount 設定中も scores = [0,0,0,0,0]（5 要素）は許可', put('/scores', [0, 0, 0, 0, 0]), ALLOW],
  ['playerCount 設定中は scores 要素 3 個は拒否（要素数は 5 のまま）', put('/scores', [0, 0, 0]), DENY],
  ['playerCount = 1 は拒否', put('/settings/playerCount', 1), DENY],
  ['playerCount = 6 は拒否（顔写真・scores は 5 人分まで）', put('/settings/playerCount', 6), DENY],
  ['playerCount = 2.5 は整数でないので拒否', put('/settings/playerCount', 2.5), DENY],
  ['playerCount = "3" は型違いで拒否', put('/settings/playerCount', '3'), DENY],
  ['playerCount = 5 は許可', put('/settings/playerCount', 5), ALLOW],
  ['後片付け: playerCount を消す（初期値 5 に戻す）', del('/settings/playerCount'), ALLOW],

  // seats（座席ロック）。ここに来た時点で votes・settings は空
  ['seats/1 を端末 A が取れる', put('/seats/1', seat(DEV_A)), ALLOW],
  ['seats/1 を端末 B が上書きするのは拒否', put('/seats/1', seat(DEV_B)), DENY],
  ['seats/1 を端末 A が取り直せる', put('/seats/1', seat(DEV_A)), ALLOW],
  ['seats/2 の端末 ID の形が不正だと拒否', put('/seats/2', seat('evil<script>')), DENY],
  ['seats/2 の at が未来だと拒否', put('/seats/2', { device: DEV_B, at: Date.now() + 3600e3 }), DENY],
  ['seats/2 の at が無いと拒否', put('/seats/2', { device: DEV_B }), DENY],
  ['seats/2 に余計なフィールドがあると拒否', put('/seats/2', { ...seat(DEV_B), x: 1 }), DENY],
  ['seats/11 は席の範囲外で拒否', put('/seats/11', seat(DEV_B)), DENY],
  ['seats/1 の device だけを端末 B に書き換えるのは拒否', put('/seats/1/device', DEV_B), DENY],
  ['seats/1 を端末 B が from 違いで引き継ぐのは拒否', put('/seats/1', { ...seat(DEV_B), from: 'dnotowner99' }), DENY],
  ['seats/1 を端末 B が from = 今の持ち主で引き継げる（長押し）', put('/seats/1', { ...seat(DEV_B), from: DEV_A }), ALLOW],
  ['引き継がれた seats/1 を端末 A が普通に取り返すのは拒否', put('/seats/1', seat(DEV_A)), DENY],
  ['seats/1 を端末 B が取り直せる（from なし）', put('/seats/1', seat(DEV_B)), ALLOW],
  ['seats/2 の from の形が不正だと拒否', put('/seats/2', { ...seat(DEV_A), from: 'x' }), DENY],
  ['seats/1 を外せる（戻る・onDisconnect・長押しの引き継ぎ）', del('/seats/1'), ALLOW],
  ['外れた seats/1 を端末 A が取れる', put('/seats/1', seat(DEV_A)), ALLOW],
  ['審査員を 8 席に設定', put('/settings/judges', judges(8)), ALLOW],
  ['seats/9 は設定に無い席なので拒否', put('/seats/9', seat(DEV_A)), DENY],
  ['seats/8 は設定にある席なので許可', put('/seats/8', seat(DEV_A)), ALLOW],
  ['seats 全体を消せる（設定画面の片付け）', del('/seats'), ALLOW],
  ['seats 全体への一括書き込みは拒否', put('/seats', { 1: seat(DEV_A) }), DENY],
  ['後片付け: 審査員の設定を消す（座席）', del('/settings/judges'), ALLOW],

  // clients/main（MAIN の素材読み込み状況。#26）
  ['clients/main {loaded,total,ts} は許可', put('/clients/main', { loaded: 51, total: 51, ts: { '.sv': 'timestamp' } }), ALLOW],
  ['clients/main に failed / failedCount を付けても許可', put('/clients/main', { loaded: 44, total: 51, failed: ['a.png', 'b.png'], failedCount: 2, ts: { '.sv': 'timestamp' } }), ALLOW],
  ['clients/main の ts が欠けると拒否', put('/clients/main', { loaded: 1, total: 1 }), DENY],
  ['clients/main の total が文字列だと拒否', put('/clients/main', { loaded: 1, total: '1', ts: { '.sv': 'timestamp' } }), DENY],
  ['clients/main の loaded が負数だと拒否', put('/clients/main', { loaded: -1, total: 1, ts: { '.sv': 'timestamp' } }), DENY],
  ['clients/main の loaded が小数だと拒否', put('/clients/main', { loaded: 1.5, total: 1, ts: { '.sv': 'timestamp' } }), DENY],
  ['clients/main の ts が未来だと拒否', put('/clients/main', { loaded: 1, total: 1, ts: Date.now() + 3600e3 }), DENY],
  ['clients/main に余計なフィールドがあると拒否', put('/clients/main', { loaded: 1, total: 1, ts: { '.sv': 'timestamp' }, x: 1 }), DENY],
  ['clients/main の failed が 10 件ちょうどなら許可', put('/clients/main', { loaded: 0, total: 20, failed: Array.from({ length: 10 }, (_, i) => `f${i}`), failedCount: 10, ts: { '.sv': 'timestamp' } }), ALLOW],
  ['clients/main の failed が 11 件だと拒否（添字が 2 桁になる）', put('/clients/main', { loaded: 0, total: 20, failed: Array.from({ length: 11 }, (_, i) => `f${i}`), failedCount: 11, ts: { '.sv': 'timestamp' } }), DENY],
  ['clients/main の failed の要素が長すぎると拒否', put('/clients/main', { loaded: 0, total: 1, failed: ['a'.repeat(101)], failedCount: 1, ts: { '.sv': 'timestamp' } }), DENY],
  ['clients/main の failed の要素が数値だと拒否', put('/clients/main', { loaded: 0, total: 1, failed: [1], failedCount: 1, ts: { '.sv': 'timestamp' } }), DENY],
  ['clients/main は MAIN が閉じたときに消せる（onDisconnect）', del('/clients/main'), ALLOW],
  ['clients に main 以外の子（未知の画面）は書けない', put('/clients/host', { loaded: 1, total: 1, ts: { '.sv': 'timestamp' } }), DENY],
  ['clients 全体への一括書き込みは拒否', put('/clients', { main: { loaded: 1, total: 1, ts: { '.sv': 'timestamp' } } }), DENY],
  ['後片付け: clients/main を消す', del('/clients/main'), ALLOW],

  // #22: HOST の modeUpdates() が返す複数キーのパッチを、update()（REST では PATCH）で
  // 1 回のアトミック書き込みにする。ここに来た時点で votes・settings/judges は空
  ['複数キー同時PATCH（採点モードへの遷移）は許可', patch('/', {
    mode: 'saiten', keep_audio: true, agenda: null, answer_text: null, odai: null, taiki: null, votes: null, revealed: null,
  }), ALLOW],
  ['複数キー同時PATCH（お題2への遷移）は許可', patch('/', {
    mode: 'odai', odai: 2, revealed: false, agenda: null, answer_text: null, taiki: null, votes: null,
  }), ALLOW],
  ['複数キー同時PATCHでも odai の範囲検証は効く（範囲外は拒否）', patch('/', { mode: 'odai', odai: 9, revealed: false }), DENY],
  ['複数キー同時PATCHでも mode の enum 検証は効く（不正値は拒否）', patch('/', { mode: 'hack', taiki: true }), DENY],
  ['複数キー同時PATCHでも votes への上書きは拒否される（削除以外は不可）', patch('/', { mode: 'taiki', votes: { 1: true } }), DENY],
  ['複数キー同時PATCH（待機モードへの遷移）は許可', patch('/', {
    mode: 'taiki', taiki: true, odai: null, agenda: null, answer_text: null, votes: null, revealed: null,
  }), ALLOW],
  ['複数キー同時PATCH（投票リセット、mode は変えない）は許可', patch('/', { votes: null, revealed: false }), ALLOW],

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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${req.method.padEnd(6)} ${req.path.padEnd(24)} -> ${String(status).padEnd(3)} ${expected.padEnd(5)} ${name}${ok ? '' : `  (got ${actual})`}`);
}
console.log(`\n${pass} passed, ${fail} failed, ${cases.length} total`);
process.exit(fail === 0 ? 0 : 1);
