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
- **静的ホスティング**（本家は GitHub Pages、`netlify` バッジ除去コードの名残あり）。
- 素材（画像・音声・動画）は Firebase Storage の公開 URL をハードコード。

## 2. 各画面の責務

| 画面 | 読む | 書く |
|---|---|---|
| HOST | `votes`, `scores`, `mode`, `se_master`, `se_trigger`, `agenda`, `answer_text` | ほぼ全部（下記スキーマ参照） |
| MAIN | `mode`, `taiki`, `odai`, `votes`, `revealed`, `scores`, `agenda`, `answer_text`, `keep_audio`, `camera_room` | `agenda` の削除（動画終了時） |
| JUDGE | `mode`, `revealed`, `votes` | `votes/{seat} = true` |
| CAM | — | `camera_room`（PeerJS ルーム ID の公開 / 削除） |

## 3. RTDB スキーマ（ルート直下、フラット）

| キー | 型 | 意味 | 書き手 |
|---|---|---|---|
| `mode` | `'taiki' \| 'odai' \| 'saiten' \| 'scoreboard' \| 'agenda'` | MAIN の表示モード | HOST |
| `taiki` | `true` / 削除 | 待機画像の表示フラグ | HOST |
| `odai` | `1..6` / 削除 | 表示中のお題番号 | HOST |
| `votes` | `{ [seat: 1..10]: true }` | 投票済み座席。キー数 = 票数 | JUDGE / HOST(削除) |
| `revealed` | `boolean` | 「点数を公開」済みか | HOST |
| `scores` | `number[5]` | 回答者 5 名の累積スコア。**index が UI と逆順**（`4 - pi`） | HOST |
| `agenda` | URL string / 削除 | 投影中の画像・動画 URL。`.mp4` 等を含めば動画 | HOST / MAIN(削除) |
| `answer_text` | JSON string `{answer,name}` / 削除 | 一般回答テキスト（現在は画像投影に置換され事実上未使用） | HOST |
| `keep_audio` | `true`（2 秒間） | 採点モード切替時に OP 動画の音声を止めないためのフラグ | HOST |
| `se_master` | string（端末 ID） | SE を実際に再生する HOST 端末 | HOST |
| `se_trigger` | `{ key, action:'play'\|'stop', ts }` | SE 再生イベント（`laugh_1..4`, `se_cheer`, `se_clap`） | HOST |
| `camera_room` | string / 削除 | PeerJS ルーム ID（`ippon-host-{id}`） | CAM |

### 3.1 既知の設計課題

- **単一ルート**: イベント（東京 / 関西）や「問」ごとの名前空間が無い。同時に 2 会場で使えない。
- **セキュリティルール未定義**（少なくともリポジトリには無い）。URL を知っていれば誰でも `scores` を書き換えられる可能性がある。
- **状態遷移が暗黙的**: `showTaiki()` は `agenda` を削除 → HOST 側の `agenda` リスナーが `mode` を `previousMode` に戻す → その後 `mode='taiki'` を書く、という順序依存がある。競合するとモードが巻き戻る恐れ。
- **`scores` の index 逆順** (`4 - pi`) が HOST / MAIN の両方に散らばっている。
- **`answer_text` と `agenda` の二重経路**（テキスト投影 → 画像投影に切り替えた名残）。
- **`keep_audio` の 2 秒 setTimeout** はタイミングハック。

## 4. 投票 → 演出パイプライン

```
JUDGE: set(votes/{seat}, true)
  └─▶ MAIN: onValue(votes) → 50ms デバウンス → 票数差分をキューに積み 150ms 間隔で
           main_{n}.png（フレーム）を切替。6 票で ipponTriggered=true → main_IPPON.png 全画面
  └─▶ HOST: onValue(votes) → 票数差分をキューに積み、1.mp3..5.mp3 を順次再生。
           6 票目は 6.mp3 → IPPON.mp3。AudioBuffer に事前デコードして遅延ゼロ化
HOST: 「点数を公開」 set(revealed,true) + no-ippon.mp3
  └─▶ MAIN: kekka_{n}.png（左下バッジ）表示
```

- IPPON 閾値 **6** は JUDGE / MAIN / HOST の 3 箇所にハードコード。
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

- `firebase-app.js` / `firebase-database.js` 12.15.0（gstatic）
- `peerjs@1.5.2`（unpkg）
- `qrcodejs 1.0.0`（cdnjs、index のみ）
- Google Fonts（Bebas Neue, Zen Kaku Gothic New, Black Han Sans）

## 9. To-Be（M1〜M2 で目指す形）

```
config/
  event.json        # 出演者・審査員・お題・閾値・テーマ
  assets.json       # 素材マニフェスト（キー → URL）
  firebase.js       # Firebase 設定（プロジェクトごとに差し替え）
src/
  shared/           # firebase 初期化、state machine、audio engine
  main/ host/ judge/ camera/
```

- RTDB は `events/{eventId}/...` に名前空間化し、`config` は `events/{eventId}/config` にも複製（HOST の管理 UI から編集）。
- 状態遷移は `mode` を単一の真実とし、付随キー（`taiki`, `odai`）を `mode` の派生に統合する。
- 詳細は [ROADMAP.md](ROADMAP.md) と [SAAS_DESIGN.md](SAAS_DESIGN.md) を参照。
