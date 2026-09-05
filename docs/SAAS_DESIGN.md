# SaaS 化・マネタイズを意識した設計

ステータス: Draft（M0 時点の方針。M2 完了時に見直す）

## 1. プロダクト定義

**「イベント向けリアルタイム投票・演出ツール」**。大喜利は最初のユースケースであり、投票 → 演出 → スコアの汎用エンジンとして設計する。

| 顧客セグメント | 例 | 支払い主体 |
|---|---|---|
| 社内イベント（初期ターゲット） | 全社会、忘年会、キックオフの企画 | 総務・人事・カルチャー担当 |
| イベント制作会社・MC | 企業イベントの請負 | 制作会社（回数課金と相性良） |
| 学校・サークル・コミュニティ | 文化祭、勉強会の LT 投票 | 個人（Free 〜 低額） |

**名称**: 「IPPON」は商標リスクがあるため SaaS では別名を採用する（候補は Issue で決める。例: *Ogiri Live*, *Waraiten*）。リポジトリ名は当面据え置き。

## 2. 収益モデル

### プラン案

| | Free | Pro（イベント単位） | Team（月額） | Enterprise |
|---|---|---|---|---|
| 価格 | ¥0 | ¥3,000〜5,000 / イベント | ¥5,000〜10,000 / 月 | 個別見積 |
| イベント数 | 1（アーカイブ 7 日） | 1 イベント有効 30 日 | 無制限 | 無制限 |
| 審査員席 | 5 | 10 | 20 | 無制限 + 観客投票 |
| 同時接続 | 30 | 100 | 300 | 個別 |
| ブランド差替（ロゴ / 色） | ✗（フッターに "Powered by"） | ○ | ○ | ○ + カスタムドメイン |
| 素材アップロード | 50MB | 1GB | 5GB | 個別 |
| カメラ配信（WebRTC/TURN） | ✗ | ○ | ○ | ○ + 専用 TURN |
| 結果エクスポート / 履歴 | ✗ | ○ | ○ | ○ + API |
| サポート | コミュニティ | メール | メール（優先） | Slack 共有チャンネル |

**設計への含意**: 「イベント単位課金」を第一候補にする。社内イベントは年 1〜2 回で月額サブスクと相性が悪く、稟議も「1 イベント ¥5,000」の方が通りやすい。

### 使用量メータリング（課金の裏付け）

課金ゲートに使う指標は最初から計測する:
- `events.created`, `event.durationMinutes`
- `judges.max`（ラウンドごとの最大投票席数）, `viewers.peak`（同時接続ピーク）
- `assets.bytes`, `camera.minutes`（TURN 利用分は原価に直結）

## 3. アーキテクチャ方針

### 3.1 データモデル（テナント階層）

```
tenants/{tenantId}
  ├─ profile        { name, plan, stripeCustomerId, brand{logo,colors} }
  ├─ members/{uid}  { role: owner|admin|host|judge }
  └─ events/{eventId}
       ├─ config    { players[], judges[], questions[], threshold, theme }
       ├─ state     { mode, currentQuestion, revealed, votes{}, scores{} }   ← 現在のフラット RTDB に相当
       ├─ rounds/{roundId}  { questionId, votes{}, result, endedAt }        ← 履歴
       └─ assets/{assetId}  { kind, storagePath, url }
```

- M2 の `events/{eventId}` 名前空間化は、この `tenants/{tenantId}/events/{eventId}` の **中間形**。M2 では `tenantId` を固定値（`default`）にして先に実装し、M3 で複数テナントに広げる。
- `state` は「現在の 1 ラウンド」だけを持つ小さなドキュメントにし、リアルタイム性を維持。履歴は `rounds` に追記。

### 3.2 リアルタイム基盤の選択

| 選択肢 | 長所 | 短所 | 判断 |
|---|---|---|---|
| **Firebase RTDB + Auth + Storage（現状）** | 既存コードをそのまま活かせる。低遅延。無料枠が大きい | ルールの表現力が弱い。テナント跨ぎのクエリが苦手。Stripe 連携は Functions 必須 | **M2 まで継続**。テナント分離はルールで実現できる |
| Supabase (Postgres + Realtime) | RLS で強いテナント分離。SQL で履歴集計。Stripe 連携例が豊富 | 投票の 50ms デバウンス相当の遅延特性を検証必要。全面書き換え | M3 で ADR を書いて比較検証。**ourframe 側の知見を流用できる** |
| 自前 WebSocket（Cloudflare Durable Objects 等） | 最安・最速 | 運用コスト。開発量 | 見送り |

**方針**: M3 の入口で「RTDB のまま Cloud Functions + Stripe」と「Supabase 移行」を PoC で比較する（Issue: *SaaS アーキテクチャ ADR*）。
どちらでも困らないよう、M1〜M2 のクライアントコードは **`StateStore` インターフェース**（`subscribe(path, cb)`, `set(path, value)`, `remove(path)`）越しに RTDB を触るよう抽象化する。

### 3.3 認証・認可

- **HOST / 管理者**: Firebase Auth（Google ログイン + メールリンク）。`members/{uid}.role` で判定。
- **JUDGE**: ログイン不要。イベントごとに発行する **署名付きトークン**（`?t=...`）を URL に埋め、ルールで `events/{eventId}/state/votes/{seat}` の書き込みを許可。座席は初回タップで `claimedBy` を記録して排他。
- **MAIN / 観客**: 読み取り専用トークン。
- **ルール例（RTDB）**:

```json
{
  "rules": {
    "tenants": {
      "$tenantId": {
        ".read": "auth != null && root.child('tenants/'+$tenantId+'/members/'+auth.uid).exists()",
        "events": {
          "$eventId": {
            "state": {
              ".read": true,
              ".write": "auth != null && root.child('tenants/'+$tenantId+'/members/'+auth.uid+'/role').val() in ['owner','admin','host']",
              "votes": { "$seat": { ".write": "auth != null && auth.token.eventId == $eventId && auth.token.role == 'judge'" } }
            }
          }
        }
      }
    }
  }
}
```

（JUDGE トークンは Cloud Functions でカスタムトークンとして発行し `auth.token.eventId` を持たせる）

### 3.4 課金

- Stripe Checkout（イベント単位 = 1 回払い、Team = サブスク）。
- Webhook（`checkout.session.completed`, `customer.subscription.updated`）→ `tenants/{id}/profile.plan` を更新。
- **機能ゲートはクライアントではなくルール / Functions 側で**（審査員席数の上限はルールで `newData` を検証、素材容量は Storage ルール）。
- 無料枠の乱用対策: Free は "Powered by" フッター固定 + イベント 1 つ。

### 3.5 素材・ブランド

- テナントの Storage パス `tenants/{tenantId}/assets/...`。公開 URL は署名付き（期限付き）に。
- **デフォルト素材セット**（採点フレーム、SE、待機画面）を自前制作し、本家素材への依存を断つ。
- テーマは CSS カスタムプロパティ（`--brand-primary` 等）に集約し、`config.theme` で上書き。

### 3.6 運用・可観測性

- エラーは Sentry（ブラウザ）、使用量は Functions から BigQuery / Analytics へ。
- **イベント本番中の障害は返金対象になり得る**ため、ステータスページと「オフライン継続モード（RTDB 断でも HOST ローカルで進行を続け、復帰時に同期）」を M3 の必須要件に入れる。

## 4. M0〜M2 で「SaaS のために」やっておくこと

| 今やる | 理由 |
|---|---|
| `config.js` / `event.json` への外出し | テナント設定の原型 |
| `events/{eventId}` 名前空間 | テナント階層の中間形。移行コストを 1 段減らす |
| `StateStore` 抽象化 | RTDB ↔ Supabase の差し替え余地 |
| セキュリティルール + JUDGE トークン | 課金ゲートの土台（席数上限） |
| ラウンド履歴 | Pro 機能「結果エクスポート」の元データ |
| 使用量ログ（同時接続、席数） | 料金設計の実データ。東京・関西で取る |
| 商標回避の名称決定 | LP・ドメイン取得に先行 |

## 5. 未決事項（Issue で議論）

- [ ] SaaS 名称とドメイン
- [ ] RTDB 継続 vs Supabase 移行（PoC 後に ADR）
- [ ] 本家作者との権利関係（ライセンス、素材、収益分配の要否）
- [ ] 観客投票（数百人規模）の同時接続コストと料金への転嫁
- [ ] 特定商取引法表記・インボイス対応の主体（個人 / 法人）
