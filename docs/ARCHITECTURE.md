# 現行アーキテクチャ（As-Is）

このドキュメントは **フォーク時点（本家 `main` @ b26839a）** のシステムをリバースエンジニアリングしてまとめたものです。
リファクタリングや本家への提案の共通言語として使います。

## 1. 全体像

```
┌────────────┐   WebRTC (PeerJS)   ┌────────────┐
│  CAM (SP)  │ ───────────────────▶│  MAIN (PC) │──▶ プロジェクター / PA
└─────┬──────┘                     └─────▲──────┘
      │ camera_room                      │ mode / votes / scores / agenda ...
      ▼                                  │
┌─────────────────────────────────────────┴────────────┐
│           Firebase Realtime Database（単一ルート）      │
└─────▲──────────────────────────────────────▲─────────┘
      │ votes/{seat}=true                    │ mode, odai, revealed, scores, se_trigger ...
┌─────┴──────┐                        ┌──────┴──────┐
│ JUDGE (SP) │ ×10                    │  HOST (PC)  │ ←─ 「音マスター」= SE を鳴らす端末
└────────────┘                        └─────────────┘
```

- **サーバーレス**。全ロジックはブラウザ内。Firebase RTDB を「共有ステート + イベントバス」として利用。
- **静的ホスティング**（本家は GitHub Pages）。
- 素材（画像・音声・動画）は Firebase Storage の公開 URL をハードコード。

## 2. 各画面の責務

| 画面 | 読む | 書く |
|---|---|---|
| HOST | `votes`, `scores`, `mode`, `se_master`, `se_trigger`, `agenda`, `answer_text`, `settings/players`, `settings/ipponThreshold`, `settings/odaiCount`, `clients/main`, `camera_quality` | ほぼ全部（下記スキーマ参照） |
| MAIN | `mode`, `taiki`, `odai`, `votes`, `revealed`, `scores`, `agenda`, `answer_text`, `keep_audio`, `camera_room`, `settings/odaiCount` | `agenda` の削除（動画終了時）、`clients/main`（素材読み込み状況、#26）、`camera_quality`（配信品質の要約。変化時 + heartbeat で低頻度に書き、切断時は削除） |
| JUDGE | `mode`, `revealed`, `votes`, `seats`, `settings/judges`, `settings/ipponThreshold` | `votes/{seat} = true`、`seats/{seat}`（座席ロック） |
| ADMIN（設定画面） | `settings/players`, `settings/judges`, `settings/ipponThreshold`, `settings/odaiCount`, `votes` | `settings/judges`（票がある間は名前・種別のみ）、`settings/ipponThreshold`（票が無いときのみ）、`settings/players`（いつでも）、`settings/odaiCount`（いつでも） |
| CAM | — | `camera_room`（PeerJS ルーム ID の公開 / 削除） |

## 3. RTDB スキーマ（ルート直下、フラット）

| キー | 型 | 意味 | 書き手 |
|---|---|---|---|
| `mode` | `'taiki' \| 'odai' \| 'saiten' \| 'scoreboard' \| 'agenda'` | MAIN の表示モード | HOST |
| `taiki` | `true` / 削除 | 待機画像の表示フラグ | HOST |
| `odai` | `1..N` / 削除 | 表示中のお題番号（N = `settings/odaiCount`、無ければ 6） | HOST |
| `votes` | `{ [seat: 1..10]: true }` | 投票済み座席。キー数 = 票数 | JUDGE / HOST(削除) |
| `revealed` | `boolean` | 「点数を公開」済みか | HOST |
| `scores` | `number[5]` | 回答者 5 名の累積スコア。`scores[N-1]` が回答者 N（顔写真 `portrait_playerN`）。画面は左から回答者 5 → 1 の順なので、表示位置との変換は `web/src/shared/players.js` の `playerAt()` / `scoreIndex()` で行う | HOST |
| `agenda` | URL string / 削除 | 投影中の画像・動画 URL。`.mp4` 等を含めば動画 | HOST / MAIN(削除) |
| `answer_text` | JSON string `{answer,name}` / 削除 | 一般回答テキスト（現在は画像投影に置換され事実上未使用） | HOST |
| `keep_audio` | `true`（2 秒間） | 採点モード切替時に OP 動画の音声を止めないためのフラグ | HOST |
| `se_master` | string（端末 ID） | SE を実際に再生する HOST 端末 | HOST |
| `se_trigger` | `{ key, action:'play'\|'stop', ts }` | SE 再生イベント（`laugh_1..4`, `se_cheer`, `se_clap`） | HOST |
| `camera_room` | string / 削除 | PeerJS ルーム ID（`ippon-host-{id}`） | CAM |
| `camera_quality` | `{ res, fps, kbps, codec, limit, path, ts }` / 削除 | 配信品質の要約（#63）。`res` は `"1920x1080"`、`kbps` は 100kbps 単位に丸め、`limit` は `qualityLimitationReason`（`none\|bandwidth\|cpu\|other`）、`path` は選択された ICE candidate pair の種別（`host`＝同一ネットワーク内で直結、`nat`＝どちらかが NAT 越え、`unknown`＝未取得）、`ts` はサーバー時刻（`{'.sv':'timestamp'}`）。MAIN の受信側 `getStats()` を 2 秒ごとに見て、値が変わったとき、または前回の書き込みから `QUALITY_HEARTBEAT_MS`（既定 8 秒）経った（heartbeat）ときに `QUALITY_PUBLISH_TICK_MS`（既定 5 秒）間隔目安で書く。`limit` は CAM 側でしか取れないため、CAM が PeerJS の DataConnection 経由で MAIN に送ってくる値を使う。接続が `failed`/`closed` になった・`camera_room` が消えた・ローカルソースに切替・MAIN 自身が切断（`onDisconnect`）のいずれでも削除する（`disconnected` は ICE が自動的に `connected` へ戻ることが多い瞬断なので、そのときは消さずに品質監視だけ一時停止し、復旧したら再開する）。HOST はここを購読し、`ts` がサーバー時刻基準で `QUALITY_STALE_MS`（既定 25 秒。heartbeat の実際の最悪間隔より十分な余白を持たせてある）より古ければ「更新なし」に倒して「CAM: 1080p 4.2Mbps」のように表示する | MAIN |
| `seats` | `{ [seat]: { device, at, from? } }` / 削除 | 審査員の座席ロック（#25）。1 席を持てるのは 1 台（`device` = 端末ごとの ID、localStorage に保存）。端末が消えると `onDisconnect` で外れる。使用中の席は JUDGE で長押しすると引き継げる（`from` = 前の持ち主を入れて 1 回で上書きする。席が空かないので前の端末と取り合いにならず、前の端末は席選択に戻る）。再読み込みすると前回の席に戻る | JUDGE / ADMIN(削除) |
| `settings/judges` | `{ [seat: 1..N]: { name, kind: 'panel'\|'venue' } }` / 削除 | 審査員の席（N = 定員 1〜10 かつ IPPON に必要な票数以上、席番号は連番）。無ければ `web/src/shared/judges.js` の初期値 10 席。`votes` はここにある席にだけ入る | ADMIN |
| `settings/ipponThreshold` | `1..10`（整数）/ 削除 | IPPON に必要な票数。審査員の定員以下。無ければ 6（`web/src/shared/ippon.js`） | ADMIN |
| `settings/players` | `{ [N: 1..5]: { last, first? } }` / 削除 | 回答者の名前（上段は必須、下段は省略可）。無ければ `web/src/shared/players.js` の初期値 | ADMIN |
| `settings/odaiCount` | `1..6`（整数）/ 削除 | お題数。HOST の「問1」〜「問N」ボタン・読み上げボタンと MAIN の `odai_1..N` 表示の上限。素材（お題画像・読み上げ音声）が 6 問分までなのでこの範囲。無ければ 6（`web/src/shared/odai.js`） | ADMIN |
| `clients/main` | `{ loaded, total, failed: string[], failedCount, ts }` / 削除 | MAIN の素材読み込み状況（#26）。`loaded`/`total` は件数、`failed` は失敗した素材の短いパスを最大 10 件（`web/src/shared/mainStatus.js` の `MAX_FAILED`）、`failedCount` は実際の失敗件数（一覧が切り詰められていても件数は正しい）、`ts` は書き込み時刻（`serverTimestamp()`）。HOST は `loaded`/`total`/`failedCount` から進行中・完了・一部失敗を表示する（`mainStatusPhase()`）。読み込み状況が変わるたびに書くが、直近の書き込みから間もない・内容が同じときは間引く（読み込み完了 or 失敗確定の最終状態は必ず書く）。**2 つ MAIN タブが開いている場合は最後に書いた方が勝つ（last-writer-wins）**。MAIN が閉じる・リロードされると `onDisconnect().remove()` で消える（HOST は「未接続」に戻る）。共有ノードなので、もう一方の MAIN タブがまだ動いていても onDisconnect で消えることがある（そのタブの次の状態変化で再び書かれる）。`onDisconnect()` は再接続後に自動で再登録されない（Firebase の既知の仕様）ため、`.info/connected` が `true` になるたびに再登録し、内容が変わっていなくても直前の状態を強制的に書き直す（Wi‑Fi が一瞬切れて RTDB がサーバー側で消した後、復帰しても読み込み状態自体は変化がなく書き直されない、というすり抜けの対策） | MAIN |

### 3.1 既知の設計課題

- **単一ルート**: イベント（東京 / 関西）や「問」ごとの名前空間が無い。同時に 2 会場で使えない。
- **セキュリティルールは M1 最小形のみ**: [`firebase/database.rules.json`](../firebase/database.rules.json) で「既知キーのみ・値の形・投票の上書き禁止」を検証している（意図と限界は [SECURITY_RULES.md](./SECURITY_RULES.md)）。全画面が未認証なので、正しい形なら誰でも `mode` / `scores` を書き換えられる点は残っており、HOST 認証（#36）・審査員トークン（#35）で対応する。
- **状態遷移が暗黙的**: `showTaiki()` は `agenda` を削除 → HOST 側の `agenda` リスナーが `mode` を `previousMode` に戻す → その後 `mode='taiki'` を書く、という順序依存がある。競合するとモードが巻き戻る恐れ。
- **`answer_text` と `agenda` の二重経路**（テキスト投影 → 画像投影に切り替えた名残）。
- **`keep_audio` の 2 秒 setTimeout** はタイミングハック。
- **回答者数（5）は未設定化（#18）**: `scores` は要素 5 個ちょうどのルール、HOST の PC スコア欄（`sc-0..4` / `addScore(0..4,±1)`）とスマホのサブ画面（`sub-score-0..4`）、MAIN のスコアボード（`renderScoreboard()` の卓の連結装飾 SVG が卓 5 台前提の座標で書かれている）が、いずれも 5 人分を前提にした固定マークアップ・固定ロジックで書かれており、生成的に N 人分へ展開していない。設定値を追加するだけでは動かず、この 3 箇所を N 人分のテンプレート化・座標の一般化にリファクタする必要があるため、お題数（#18 の残り）とは切り離して別途対応する。

## 4. 投票 → 演出パイプライン

```
JUDGE: set(votes/{seat}, true)
  └─▶ MAIN: onValue(votes) → 50ms デバウンス → 票数差分をキューに積み 150ms 間隔で
           main_{step}.png（フレーム）を切替。必要な票数（既定 6）で ipponTriggered=true → main_IPPON.png 全画面
  └─▶ HOST: onValue(votes) → 票数差分をキューに積み、1.mp3..5.mp3 を順次再生。
           IPPON の票は 6.mp3 → IPPON.mp3。AudioBuffer に事前デコードして遅延ゼロ化
HOST: 「点数を公開」 set(revealed,true) + no-ippon.mp3
  └─▶ MAIN: kekka_{n}.png（左下バッジ）表示
```

- IPPON に必要な票数は `settings/ipponThreshold`（既定 6、#79）。素材は 6 段（`main_0..6`、`1..6.mp3`）なので、IPPON 前の票は `voteStep()` で 1〜5 段に割り振る（票数 6 なら票数そのまま）。結果バッジ `kekka_n` は票数の数字で、画像の無い 6 票以上は MAIN が SVG で描く。
- 審査員は **10 席**（6 名の固定名 + 会場審査員 4）。座席の排他制御は無い（同じ席を 2 台で選べる）。

## 5. 音声

- HOST が全 SE を保持。`new Audio()` 群 + 投票音のみ Web Audio API（`AudioBuffer`）。
- iOS の自動再生制限対策として初回タップで全音声を無音再生（unlock）。
- `se_master`: 複数 HOST 端末（PC + スマホのサブ画面）がある場合、実際に鳴らすのは 1 台だけにする仕組み。PC は自動でマスターになる。
- 5 分ごとに `audio.load()` でキャッシュ維持、30 秒ごとに `audioCtx.resume()`。

## 6. カメラ（PeerJS）

- CAM が `Peer('ippon-host-' + roomId)` を作り、`camera_room` に roomId を公開。
- MAIN は `camera_room` を監視 → DataConnection で `join:{myId}` を送る → CAM が `peer.call()` で映像を送る。
- 8 Mbps / 30fps を `setParameters` で要求。PeerJS の公開シグナリングサーバー（`0.peerjs.com`）と STUN のみ。**TURN 無し**のため会場ネットワークによっては繋がらない。
- **配信品質の可視化（#63）**: CAM・MAIN とも `web/src/shared/webrtc-stats.js`（純粋関数）を使い、`RTCPeerConnection.getStats()` を 2 秒ごとに見る。ビットレートは前回サンプルとの `bytes`/`timestamp` の実差分から計算する（ポーリング間隔がタブのバックグラウンド化などで一定にならなくても、間隔を仮定しないので狂わない。再接続等で `bytes` カウンターがリセット＝新しい SSRC になった回は `null` を返し、誤ったスパイク値を出さない）。
  - CAM: 送信側 `outbound-rtp` から解像度・fps・ビットレート・`qualityLimitationReason`・selected ICE candidate pair の種別（`path`）を出し、status 欄に `1920×1080 30fps 4.2Mbps H264 (bandwidth) [NAT]` のようにそのまま表示する。同時に `limit`（`qualityLimitationReason`）を PeerJS の DataConnection（MAIN が `join:` を送るのに使っているのと同じ接続）で MAIN に送る。`qualityLimitationReason` は Chrome の送信側にしか無い統計なので、受信側の MAIN 単独では取れない。
  - MAIN: 受信側 `inbound-rtp` + selected candidate pair から解像度・fps・ビットレート・`path` を出し、CAM から届いた `limit` と合わせてカメラ設定パネル（🎥 カメラ、操作員用。全画面にすると自動で閉じるので客席には映らない）に表示する。値が変わったとき、または heartbeat（`QUALITY_HEARTBEAT_MS`、既定 8 秒）で `QUALITY_PUBLISH_TICK_MS`（既定 5 秒）間隔目安で `camera_quality` に書く。接続が `failed`/`closed` になった・`camera_room` 消失・ローカルソース切替・MAIN 自身の切断（`onDisconnect`）のいずれかで削除する。`disconnected`（ICE の瞬断。自動的に `connected` へ戻ることが多い）ではこの pc の品質監視だけ一時停止し、値は残す（`watchConnectionState` が復旧を検知すると監視を再開する）。
  - HOST: `camera_quality` を購読し、既存の音マスターバーの下に「CAM: 1080p 4.2Mbps H264」のように表示。`limit` が `bandwidth` / `cpu` のときは赤くする。`path` が `nat`（NAT 越え）のときは末尾に `[NAT]` を付け、`chrome://webrtc-internals` を開かなくてもエンコーダ制限か経路の問題かを切り分けられるようにする。`ts`（サーバー時刻）が `QUALITY_STALE_MS`（既定 25 秒。MAIN の実際の最悪書き込み間隔より十分な余白を持たせてある）より古ければ「更新なし（配信が切れている可能性）」に倒す（`.info/serverTimeOffset` でクライアント時計のズレを補正）。

## 7. 素材（Firebase Storage）

| 種別 | パス例 | 用途 |
|---|---|---|
| 採点フレーム | `scoring_system/main_0..6.png`, `main_IPPON.png` | 票数ごとの枠。透過 PNG でカメラが透ける |
| 結果バッジ | `scoring_system/kekka_0..5.png` | 「点数を公開」時の左下バッジ |
| お題 | `image_question/image_question1..6.png` + `mp3_question/*.mp3` | お題画像と読み上げ |
| 紹介 | `image_introduce/*_judge1..5.png`, `*_player1..5.png` | 審査員・回答者紹介 |
| 顔写真 | `image_portrait/portrait_player1..5.png` | スコアボード |
| アジェンダ | `image_agenda/*.png`, `movie/*.mp4` | ルール・QR・優勝・OP 動画 |
| SE | `mp3/1..6.mp3, IPPON.mp3, laugh1..4.mp3, ...` | 効果音 |

素材の **命名規則が事実上の API**。設定駆動化ではこの規則をマニフェスト（JSON）に落とす。

## 8. 外部依存

- `firebase-app.js` / `firebase-database.js` 12.15.0（gstatic）。各画面は `web/src/shared/firebase.js` 経由で import し、バージョンはそこ 1 箇所で管理する（ES Modules には SRI を付けられないため、URL のバージョン固定で担保）
- `peerjs 1.5.2`（cdnjs、SRI 付き。MAIN / HOST / CAM）
- `qrcodejs 1.0.0`（cdnjs、SRI 付き。ランチャーのみ）
- Google Fonts（Bebas Neue, Zen Kaku Gothic New, Black Han Sans）。CSS が動的に返るので SRI は付けられない。読み込めなくても代替フォントで表示は続く

## 9. To-Be（M1〜M2 で目指す形）

```
web/                  # 公開ルート（Pages にはここだけデプロイ。将来ビルドを入れる場合もここを root にする）
  index.html
  main/ host/ judge/ camera/   # 各画面（index.html）。旧 URL ippon_*.html はリダイレクト
  config/
    config.js         # Firebase 設定（プロジェクトごとに差し替え）※ 移行済み
    event.json        # 出演者・審査員・お題・閾値・テーマ
    assets.json       # 素材マニフェスト（キー → URL）
  src/
    shared/           # firebase 初期化、RTDB パス定義、素材解決、audio engine
    main/ host/ judge/ camera/
  vendor/             # 固定バージョンの外部ライブラリ
firebase/             # RTDB / Storage ルール ※ 移行済み
tests/                # rules/（移行済み）, e2e/
```

- RTDB は `events/{eventId}/...` に名前空間化し、`config` は `events/{eventId}/config` にも複製（HOST の管理 UI から編集）。
- 状態遷移は `mode` を単一の真実とし、付随キー（`taiki`, `odai`）を `mode` の派生に統合する。
- 詳細は [ROADMAP.md](ROADMAP.md) と [SAAS_DESIGN.md](SAAS_DESIGN.md) を参照。
