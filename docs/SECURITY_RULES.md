# Realtime Database セキュリティルール

`database.rules.json` は現行のフラットスキーマ（[ARCHITECTURE.md §3](./ARCHITECTURE.md#3-rtdb-スキーマルート直下フラット)）に対する **M1 最小形** のルールです。
各画面（MAIN / HOST / JUDGE / CAM）のコードは一切変更せず、**未認証クライアントのまま**動く前提で書いてあります。

## 1. 前提: 全クライアントが未認証

今のところどの画面も Firebase Auth を使っていません（`auth == null`）。
そのためルールは「**誰が**書いたか」を判別できず、「**何を**書いたか」（キーと値の形）しか見られません。
HOST 認証は [#36](https://github.com/75asa/ippon-gp/issues/36)、審査員トークンは [#35](https://github.com/75asa/ippon-gp/issues/35) で扱います。

## 2. 守れること / 守れないこと

| | 内容 | 状態 |
|---|---|---|
| 守れる | 未知のトップレベルキー（`/foo` など）の追加、ルートへの一括書き込み | 拒否 |
| 守れる | `mode` に enum 外の値・削除 | 拒否（`taiki\|odai\|saiten\|scoreboard\|agenda` のみ） |
| 守れる | `odai` に 1..6 以外・整数以外・文字列 | 拒否 |
| 守れる | `votes/{seat}` の seat が 1..10 以外、値が `true` 以外 | 拒否 |
| 守れる | **投票済み座席の上書き・個別削除**（再投票・票の取り消し） | 拒否（新規作成のみ許可） |
| 守れる | `scores` の削除、要素数 5 以外、整数 0..99 以外、文字列化 | 拒否 |
| 守れる | `revealed` に boolean 以外、`taiki` / `keep_audio` に `true` 以外 | 拒否 |
| 守れる | `agenda` に `http(s)://` 以外（`javascript:` 等）、2048 文字超 | 拒否 |
| 守れる | `se_trigger` の `key` / `action` が既知の値以外、フィールド欠落・余分なフィールド、削除 | 拒否 |
| 守れる | `se_master` / `camera_room` に英数以外・長すぎる値・オブジェクト | 拒否 |
| **守れない** | 誰でも `mode` を切り替えられる（正しい enum 値なら通る） | → #36 HOST 認証 |
| **守れない** | 誰でも `scores` を「正しい形」で書き換えられる（`[99,0,0,0,0]` 等） | → #36 HOST 認証 |
| **守れない** | 誰でも `votes` をノードごと削除できる（HOST の `resetVotes` と区別できない） | → #36 HOST 認証 |
| **守れない** | 誰でも空いている座席の票を入れられる（JUDGE 端末を装える） | → #35 審査員トークン |
| **守れない** | 誰でも `odai` / `agenda` / `se_trigger` / `camera_room` を正しい形で書ける | → #36 / 名前空間化 |
| **守れない** | 読み取りは全公開（`.read: true`）。スコアやお題番号は URL を知っていれば見える | 仕様（MAIN は未認証で読む必要がある） |

要するに、このルールが止めるのは **誤操作・悪戯による不正な値、未知キーの追加、投票の上書き** です。
「正しい形で、意図的に」書き換える相手は認証が入るまで止められません。社内イベント向けの被害軽減策と考えてください。

### 細かい挙動

- `votes` の一括削除は HOST の `resetVotes()` / モード切替で必要なので許可しています。副作用として、票が 1 件しか無い状態でその 1 件を `remove()` すると、親ノードの削除と区別が付かず通ります（2 件以上ある状態での個別削除は拒否）。
- `scores` は RTDB 上では `{"0":n,"1":n,"2":n,"3":n,"4":n}` として保存されるため、`hasChildren(['0'..'4'])` と `$i` の範囲で「要素 5 個ちょうど」を検証しています。上限 99 は表示桁の想定なので、必要なら `database.rules.json` の `<= 99` を変えてください。
- `answer_text` は現在どの画面も書いていませんが、スキーマに残っているので「2000 文字以内の文字列」として許可しています。
- ルートに `.write` を置いていないため、未知キーは既定で拒否されます。`$other` の `".write": false` は意図を明示するためのものです。

## 3. デプロイ

`.firebaserc` はリポジトリに含めていません（プロジェクト ID はフォークごとに違うため）。`--project` で毎回指定するか、`firebase use` で紐付けてください。

```bash
npm i -g firebase-tools        # 未導入なら
firebase login
firebase deploy --only database --project <your-project-id>
# もしくは一度 firebase use <your-project-id> しておけば --project は省略可
```

`firebase.json` の `database.rules` が `database.rules.json` を指しているので、これだけで RTDB のルールが置き換わります。
Firebase コンソールの「Realtime Database → ルール」で反映を確認できます。

> 注意: デプロイするとコンソール上で手編集したルールは上書きされます。以後はこのファイルを正としてください。

## 4. ローカルで検証する（エミュレータ）

`scripts/test-rules.mjs` は RTDB エミュレータに対して、各画面と同じ **未認証** の REST 書き込みを 60 件ほど投げ、
許可 / 拒否が期待通りかを確認します。Node 22 以上（グローバル `fetch`）と Java（エミュレータ用）が必要で、追加の npm 依存はありません。

### 4.1 firebase CLI 経由（通常はこちら）

```bash
npm i -g firebase-tools   # もしくはリポジトリ内で npm i --no-save firebase-tools して npx
# エミュレータ起動 → スクリプト実行 → 停止 までを一発で
firebase emulators:exec --only database --project demo-ippon "node scripts/test-rules.mjs"
```

`demo-` で始まるプロジェクト ID はオフライン専用の扱いになり、ログイン不要・本番に触りません。
別ターミナルで `firebase emulators:start --only database --project demo-ippon` を起動しておき、`node scripts/test-rules.mjs` を直接叩いても同じです。

### 4.2 エミュレータ jar を直接起動する（CLI がプロキシ等で使えない環境）

`firebase emulators:start` は起動時に `http://localhost:9000/.settings/rules.json` へルールを PUT しますが、
CLI は `HTTPS_PROXY` が設定されているとその localhost 呼び出しまでプロキシに流してしまい（`NO_PROXY` を見ない）、失敗することがあります。
その場合はダウンロード済みの jar を直接起動し、スクリプトに `--load-rules` を付けてルールを流し込みます。

```bash
JAR=~/.cache/firebase/emulators/firebase-database-emulator-v*.jar   # emulators:start を一度走らせるとここに落ちる
java -Duser.language=en -jar $JAR --host 127.0.0.1 --port 9000 &
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 GCLOUD_PROJECT=demo-ippon node scripts/test-rules.mjs --load-rules
kill %1
```

### 4.3 期待する出力

```
RTDB emulator: http://127.0.0.1:9000  namespace: demo-ippon
PASS  PUT    /foo           -> 401 deny  未知のトップレベルキー foo は書けない
PASS  PUT    /votes/1       -> 200 allow votes/1 = true を新規作成できる
PASS  PUT    /votes/1       -> 401 deny  votes/1 の上書き（再投票）は拒否
...
64 passed, 0 failed, 64 total
```

拒否は REST では `401 {"error":"Permission denied"}` として返ります（`.write` 不許可と `.validate` 不合格を区別しません）。
1 件でも FAIL があるとスクリプトは終了コード 1 で終わります。

## 5. スキーマを変えるとき

- `docs/ARCHITECTURE.md §3` のキー表を更新したら、必ず `database.rules.json` と `scripts/test-rules.mjs` のケースも同時に更新してください。ルールに無いキーは書けません。
- 名前空間化（`/events/{id}/...`、#6 / M2）の際はルート直下の各キーをそのまま `$eventId` の下にぶら下げれば流用できます。
