# ロードマップ & マイルストーン計画

最終更新: 2026-09-28

## 現在地（2026-09-28）

- 東京フェス、関西フェス（2026-09-18）は **どちらも終了済み**。本番は旧 Firebase プロジェクト `song-fes-ippon-gp`（私たちのアカウントでは管理できない）のまま運用した。
- 終了後に、自前プロジェクト `song-ogiri-gp` への移行（#83）と、設定画面（`web/admin/`: 回答者・審査員・IPPON に必要な票数）を入れた。
- 次回イベントの時期は未定。M1 / M2 は大会名ではなく「次回イベントまで」「セルフサービス化」の段階として扱う。

## ゴール

1. **次回イベント**を、自前 Firebase と設定画面だけで（コードを触らずに）準備・運用できる状態にする。
2. お題・素材の差し替えや、複数イベントの切り替えまでセルフサービスにする。
3. その先で **社外にも提供できる SaaS**（大喜利 / 投票型イベント演出ツール）へ育てる。
4. 汎用的な改善は **本家（ryosuke884884-hash/ippon-gp）へ PR で還元**する。

## 原則（スコープ判断の物差し）

- **本番優先**: イベント直前は演出・音のタイミングを変えない（リハーサル後はコードフリーズ、[REHEARSAL.md](REHEARSAL.md)）。
- **設定 > コード**: 名前・お題・素材・閾値はコードから追い出す。
- **段階的**: 「動く HTML を保ったまま」小さく分割。ビルドツール導入は M2 以降。
- **本家に返せる形で**: 会社固有の要素（名前、素材、Firebase プロジェクト）は設定に隔離し、汎用部分だけを本家に出す（本家が 404 の間は M4 は blocked）。本家の UI デザインは変えてよい（2026-09-27 決定、#74）。
- **SaaS を見据えるが、SaaS のために今を遅らせない**: M0〜M2 の設計判断は M3 で「捨てなくて済む」かで検証する。

## マイルストーン一覧

| # | 名前 | 期限（目安） | 完了条件（Definition of Done） |
|---|---|---|---|
| **M0** | Foundation — フォークの土台 | 2 週間 | README/設計ドキュメント、Issue/PR テンプレ、ラベル、Projects、ライセンス方針の確認依頼、Firebase 設定の外出し、index のリンク修正 |
| **M1** | Next Event Ready — 次回イベント | **次回イベント前**（時期未定） | 自前 Firebase で本番実施。名前・定員・票数・お題が設定画面から変えられる。RTDB / Storage ルール適用。回答画像を含む素材がそろっている。Runbook とリハーサルチェックリスト完備 |
| **M2** | Self-service & Multi-event — 複数イベント & セルフサービス | M1 の後 | `events/{eventId}` 名前空間。設定画面からイベント作成・お題・素材アップロード。審査員 PIN。結果エクスポート。ローカル開発（Emulator）と E2E スモークテスト |
| **M3** | SaaS Alpha — 社外提供の最小形 | M2 + 2〜3 ヶ月 | マルチテナント、ログイン、Stripe 課金、プラン別機能制限、ブランド差替、LP。詳細は [SAAS_DESIGN.md](SAAS_DESIGN.md) |
| **M4** | Upstream — 本家還元 | 継続 | M0〜M2 の汎用部分を本家へ PR。方針は [UPSTREAM.md](UPSTREAM.md) |

> 次回イベントの開催日が決まったら、GitHub Milestone の due date を更新してください。

---

## M0: Foundation（フォークの土台）

**狙い**: 以降の作業を安全・並列に進められる状態を作る。コードの挙動は変えない。

- [x] README / ARCHITECTURE / ROADMAP / SAAS_DESIGN / UPSTREAM ドキュメント
- [x] Issue / PR テンプレート、ラベル定義、GitHub Projects（ロードマップビュー）
- [ ] ライセンス方針を本家作者に確認（**OSS / SaaS 化のブロッカー**。本家が 404 のため連絡手段から確認）
- [x] `index.html` の本家 GitHub Pages 絶対 URL → 相対パス化（フォークをデプロイしても本家に飛ばないように）
- [x] `firebaseConfig` と Storage ベース URL を `config.js` に外出し（4 画面共通）
- [x] GitHub Pages デプロイワークフロー（`web/` だけを公開、#73）
- [x] 旧ホスティング向けバッジ除去コードの削除
- [ ] `answer_text` 周りの不要コード整理
- [ ] 外部依存の固定（unpkg → cdnjs or vendoring、SRI）

## M1: Next Event Ready（次回イベント）

**狙い**: 「自分たちのイベント」として、自前の環境と設定画面だけで本番運用できる。

### 設定駆動化
- [x] 回答者・審査員の名前を設定画面から編集（RTDB の `settings/players` / `settings/judges`、#78 / #80）
- [x] 審査員の定員と IPPON に必要な票数を設定化（#78 / #79）
- [x] お題数（6 固定）を設定化（`settings/odaiCount`、#18）
- [ ] 回答者数（5 固定）の設定化は見送り。HOST のスコア欄（PC / スマホ）と MAIN のスコアボード装飾が 5 人分の固定マークアップ・固定座標で書かれており、N 人分へのテンプレート化が必要（#18 のコメント参照）
- [ ] 素材 URL のマニフェスト化（`config/assets.json`）。命名規則からの自動生成をサポート
- [ ] 「一般回答」テキスト（`ANSWER_TEXTS`）の設定化

### 堅牢性
- [x] RTDB / Storage のセキュリティルール（`firebase/`）と、エミュレータでのテスト（CI）
- [x] 自前 Firebase プロジェクト `song-ogiri-gp` への移行（#83）
- [ ] 回答画像など、Storage に無い素材 7 点をそろえる（#84）
- [ ] 状態遷移（mode）の整理と RTDB スキーマのドキュメント化（競合の解消）
- [x] HOST のスコアリセットを長押しに（#71）
- [ ] JUDGE の座席ロック（同じ席を 2 台で選べない）と再読込時の座席復元
- [ ] MAIN の素材プリロード進捗表示とロード失敗時のフォールバック
- [ ] CAM: 再接続、TURN サーバー設定（会場 Wi‑Fi 対策）

### 運用
- [x] 本番 Runbook（[RUNBOOK.md](RUNBOOK.md)）
- [x] リハーサルチェックリスト（[REHEARSAL.md](REHEARSAL.md)）

## M2: Self-service & Multi-event（複数イベント & セルフサービス）

**狙い**: エンジニア以外が次回イベントを準備できる。SaaS のテナント概念の前身。

- [ ] RTDB を `events/{eventId}/...` に名前空間化。URL クエリ `?event=kansai-2027` で切替
- [ ] 設定画面（`web/admin/`）にイベント作成・お題の編集（#33）と素材アップロード（#34）を追加。回答者・審査員・票数の編集は M1 で実装済み
- [ ] 審査員 PIN / トークン付き URL（観客が JUDGE を開いても投票できない）
- [ ] HOST 認証（Firebase Auth 匿名 + パスコード、または Google ログイン）
- [ ] ラウンド履歴と結果エクスポート（JSON / CSV）
- [ ] 観客参加モード（会場全員がスマホで投票 → 集計して 1 席分として反映）
- [ ] テーマ / ブランド差替（色・ロゴ・フォント）を設定で
- [ ] i18n（ja / en）
- [ ] コード分割（`src/shared`, 画面ごと）。ビルドレス ES Modules を維持
- [ ] Firebase Emulator でのローカル開発、Playwright E2E スモークテスト、CI

## M3: SaaS Alpha

[SAAS_DESIGN.md](SAAS_DESIGN.md) を参照。要点:

- [ ] 商標リスクの回避（「IPPON」はテレビ番組名。SaaS 名は別途決定）
- [ ] マルチテナント設計（`tenants/{tenantId}/events/{eventId}`）とテナント単位のセキュリティルール
- [ ] ログイン / 組織 / メンバー招待
- [ ] Stripe（Checkout + Webhook）と Free / Pro / Enterprise のプラン制御
- [ ] 使用量計測（イベント数、審査員数、同時接続数）
- [ ] LP / オンボーディング / 利用規約 / プライバシーポリシー

## M4: Upstream（本家還元）

- [ ] 還元ポリシー（[UPSTREAM.md](UPSTREAM.md)）に沿って、M0/M1 の汎用 PR を本家へ
- [ ] 本家作者との連絡窓口・レビュー体制

---

## 進め方（プランニング）

- **Projects**: 「IPPON GP Roadmap」ボード。ビュー = Board（Status）/ Roadmap（Milestone × Iteration）/ Table（Priority）。
- **Iteration**: 2 週間。各 Iteration の頭で M1 の残 Issue から `priority:P0` → `P1` の順に取り込む。
- **ラベル**: `type:*`（bug/feature/docs/chore/refactor/security）、`area:*`（main/host/judge/camera/infra/config/saas/upstream）、`priority:P0..P2`、`epic`、`good first issue`。
- **Issue 階層**: Epic（マイルストーンごと 1 つ）→ サブ Issue。Epic の進捗 = マイルストーンの進捗。
- **PR**: 1 PR = 1 関心事。演出に影響する変更は「本番と同じ端末構成でのリハーサル動画 or スクショ」を PR に添付。
- **リリース**: マイルストーン完了時にタグ（`v1.0-tokyo`, `v1.5-kansai`, `v2.0-saas-alpha`）。

## やらないこと（Out of Scope）

- ネイティブアプリ化（PWA で十分）
- 動画編集・MV 制作の機能（企画側の作業。ツールは投影のみ担当）
