# ロードマップ & マイルストーン計画

最終更新: 2026-09-05

## ゴール

1. **今年の東京フェス**で、フォーク版（自前 Firebase）で本番運用できる状態にする。
2. **次回の関西フェス**では、コードを触らずに出演者・お題・素材を差し替えられる状態にする。
3. その先で **社外にも提供できる SaaS**（大喜利 / 投票型イベント演出ツール）へ育てる。
4. 汎用的な改善は **本家（ryosuke884884-hash/ippon-gp）へ PR で還元**する。

## 原則（スコープ判断の物差し）

- **本番優先**: 東京フェスを壊さない。演出・音のタイミングは現状維持を最優先。
- **設定 > コード**: 名前・お題・素材・閾値はコードから追い出す。
- **段階的**: 「動く HTML を保ったまま」小さく分割。ビルドツール導入は M2 以降。
- **本家に返せる形で**: 会社固有の要素（名前、素材、Firebase プロジェクト）は設定に隔離し、汎用部分だけを本家に出す。
- **SaaS を見据えるが、SaaS のために今を遅らせない**: M0〜M2 の設計判断は M3 で「捨てなくて済む」かで検証する。

## マイルストーン一覧

| # | 名前 | 期限（目安） | 完了条件（Definition of Done） |
|---|---|---|---|
| **M0** | Foundation — フォークの土台 | 2 週間 | README/設計ドキュメント、Issue/PR テンプレ、ラベル、Projects、ライセンス方針の確認依頼、Firebase 設定の外出し、index のリンク修正 |
| **M1** | Tokyo Ready — 東京フェス本番 | **東京フェス前**（日付は要設定） | 自前 Firebase + 自前素材で本番実施。出演者/お題/閾値が設定ファイル化。RTDB セキュリティルール適用。運用 Runbook とリハーサルチェックリスト完備 |
| **M2** | Kansai Ready — 複数イベント & セルフサービス | **関西フェス前** | `events/{eventId}` 名前空間。管理 UI からイベント作成・出演者・お題・素材アップロード。審査員 PIN。結果エクスポート。ローカル開発（Emulator）と E2E スモークテスト |
| **M3** | SaaS Alpha — 社外提供の最小形 | M2 + 2〜3 ヶ月 | マルチテナント、ログイン、Stripe 課金、プラン別機能制限、ブランド差替、LP。詳細は [SAAS_DESIGN.md](SAAS_DESIGN.md) |
| **M4** | Upstream — 本家還元 | 継続 | M0〜M2 の汎用部分を本家へ PR。方針は [UPSTREAM.md](UPSTREAM.md) |

> 東京・関西の開催日が決まり次第、GitHub Milestone の due date を更新してください。

---

## M0: Foundation（フォークの土台）

**狙い**: 以降の作業を安全・並列に進められる状態を作る。コードの挙動は変えない。

- [ ] README / ARCHITECTURE / ROADMAP / SAAS_DESIGN / UPSTREAM ドキュメント
- [ ] Issue / PR テンプレート、ラベル定義、GitHub Projects（ロードマップビュー）
- [ ] ライセンス方針を本家作者に確認（**OSS / SaaS 化のブロッカー**）
- [ ] `index.html` の本家 GitHub Pages 絶対 URL → 相対パス化（フォークをデプロイしても本家に飛ばないように）
- [ ] `firebaseConfig` と Storage ベース URL を `config.js` に外出し（4 画面共通）
- [ ] GitHub Pages デプロイワークフロー
- [ ] Netlify バッジ除去コードなど不要コードの削除
- [ ] 外部依存の固定（unpkg → cdnjs or vendoring、SRI）

## M1: Tokyo Ready（東京フェス本番）

**狙い**: 「自分たちのイベント」として本番運用できる。演出は現状踏襲。

### 設定駆動化
- [ ] 出演者（5 名）・審査員（10 席）の名前を `config/event.json` に（HOST の 3 箇所 + MAIN + JUDGE から排除）
- [ ] お題数（現在 6 固定）・回答者数（5 固定）・審査員数（10 固定）・IPPON 閾値（6 固定）を設定化
- [ ] 素材 URL のマニフェスト化（`config/assets.json`）。命名規則からの自動生成をサポート
- [ ] 「一般回答」テキスト（`ANSWER_TEXTS`）の設定化

### 堅牢性
- [ ] RTDB セキュリティルール（`database.rules.json`）を追加し、`firebase deploy --only database` で適用できるようにする
- [ ] 状態遷移（mode）の整理と RTDB スキーマのドキュメント化（競合の解消）
- [ ] HOST の破壊的操作（スコアリセット / 投票リセット）に確認ダイアログ
- [ ] JUDGE の座席ロック（同じ席を 2 台で選べない）と再読込時の座席復元
- [ ] MAIN の素材プリロード進捗表示とロード失敗時のフォールバック
- [ ] CAM: 再接続、TURN サーバー設定（会場 Wi‑Fi 対策）

### 運用
- [ ] 本番 Runbook（機材、ネットワーク要件、当日手順、トラブル時の代替手順）
- [ ] リハーサルチェックリスト（音出し、10 台同時投票、カメラ、OP 動画）

## M2: Kansai Ready（複数イベント & セルフサービス）

**狙い**: エンジニア以外が次回イベントを準備できる。SaaS のテナント概念の前身。

- [ ] RTDB を `events/{eventId}/...` に名前空間化。URL クエリ `?event=kansai-2027` で切替
- [ ] 管理 UI（`admin.html`）: イベント作成、出演者・審査員・お題の編集、素材アップロード（Firebase Storage）
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
- 本家の UI デザインの大幅変更（本家還元の妨げになる）
