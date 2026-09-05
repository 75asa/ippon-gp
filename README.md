# IPPON GP — 大喜利王決定戦 採点システム

> 社内フェス向け「IPPON グランプリ」パロディ企画のための、リアルタイム採点・演出システム。
> 本リポジトリは [ryosuke884884-hash/ippon-gp](https://github.com/ryosuke884884-hash/ippon-gp) のフォークです。
> フォーク側で **設定駆動化・複数イベント対応・SaaS 化** を進め、汎用的な改善は本家へ還元します。

- 📍 ロードマップ: [docs/ROADMAP.md](docs/ROADMAP.md)
- 🏗️ 現行アーキテクチャ / RTDB スキーマ: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 💰 SaaS 化・マネタイズ設計: [docs/SAAS_DESIGN.md](docs/SAAS_DESIGN.md)
- 🔁 本家への還元方針: [docs/UPSTREAM.md](docs/UPSTREAM.md)
- 🤝 コントリビュート: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 何ができるか

会場の **プロジェクター（MAIN）**、司会の **操作端末（HOST）**、審査員の **スマホ（JUDGE）**、回答者を映す **スマホカメラ（CAM）** を Firebase Realtime Database 経由で同期し、番組さながらの採点演出を行います。

| 画面 | ファイル | 役割 |
|---|---|---|
| **MAIN** | `ippon_main.html` | 大画面用。待機画面 / お題 / 採点フレーム / IPPON 演出 / スコアボード / OP 動画 / 紹介画像 / カメラ映像を表示 |
| **HOST** | `ippon_host.html` | 司会・進行用。モード切替、お題出し、点数公開、スコア増減、SE（笑い・歓声・拍手・ブザー）、アジェンダ投影 |
| **JUDGE** | `ippon_judge.html` | 審査員用。座席を選んで 1 タップ投票。6 票で IPPON |
| **CAM** | `ippon_camera.html` | スマホカメラ映像を WebRTC（PeerJS）で MAIN に配信 |
| **INDEX** | `index.html` | 各画面へのランチャー + QR コード |

### 進行フロー（1 問あたり）

```
待機 → お題表示（+読み上げ音声） → 採点モード（カメラ + 採点フレーム）
   → 審査員が投票（1票ごとに効果音 + フレーム更新） → 6票で IPPON 演出
   → 「点数を公開」でバッジ表示 → スコア +1 → 結果モード（スコアボード）
```

---

## クイックスタート（現状：静的 HTML のみ）

ビルド不要。任意の静的ホスティング（GitHub Pages など）に 5 つの HTML を置くだけで動きます。

```bash
git clone https://github.com/75asa/ippon-gp.git
cd ippon-gp
python3 -m http.server 8080   # http://localhost:8080/index.html
```

> ⚠️ **現状の制約**: Firebase プロジェクト・素材 URL・出演者名・お題が各 HTML にハードコードされています。
> 自分のイベントで使うには、`firebaseConfig` と素材 URL を書き換える必要があります。
> これを解消する「設定駆動化」が [ロードマップ](docs/ROADMAP.md) の最優先事項です（[#config-extraction](docs/ROADMAP.md#m1-tokyo-ready)）。

### 必要なもの

- Firebase プロジェクト（Realtime Database + Storage）
- 会場 Wi‑Fi（審査員スマホ 10 台 + HOST + MAIN + CAM が同時接続できること）
- MAIN 用 PC（Chrome 推奨、音声出力を会場 PA へ）
- HOST 用 PC またはタブレット（「音マスター」= SE 再生端末）

---

## リポジトリ構成

```
.
├── index.html              # ランチャー
├── ippon_main.html         # 大画面
├── ippon_host.html         # 司会操作
├── ippon_judge.html        # 審査員投票
├── ippon_camera.html       # カメラ配信
├── docs/                   # 設計・計画ドキュメント
├── scripts/                # GitHub Projects などのセットアップスクリプト
└── .github/                # Issue/PR テンプレート、ラベル定義、ワークフロー
```

---

## ライセンス

本家リポジトリにライセンスファイルが存在しないため、**現時点ではライセンス未確定** です。
OSS として公開・SaaS 化するには本家作者の同意が必要です（Issue 参照）。
