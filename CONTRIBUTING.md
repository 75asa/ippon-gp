# Contributing

## ブランチ / PR

- `main` は常にデプロイ可能（GitHub Pages）。
- 作業ブランチ: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`。
- PR は 1 関心事。演出・音のタイミングに影響する変更は、リハーサルの動画 / スクショを添付。
- PR テンプレートのチェックリストを埋める。

## Issue

- テンプレート（Bug / Feature / Task）を使う。
- ラベルは `type:*` + `area:*` を最低 1 つずつ。優先度は `priority:P0`（本番ブロッカー）〜 `P2`。
- Epic（マイルストーン単位）にサブ Issue として紐付ける。

## コーディング規約（現状）

- ビルドレス。ES Modules（`<script type="module">`）を維持。
- Firebase 設定・素材 URL・出演者名などはコードに書かない（`config/` へ）。
- 既存 HTML の挙動を変える場合は、`docs/ARCHITECTURE.md` の該当箇所も更新する。

## 本家への還元

`docs/UPSTREAM.md` を参照。本家向け PR はフォーク固有の差分（自社名・素材・Firebase 設定）を含めない。

## 動作確認

```bash
python3 -m http.server 8080
# MAIN / HOST / JUDGE を別タブで開き、JUDGE の投票が MAIN/HOST に反映されることを確認
```

Firebase Emulator でのローカル実行は M2 で整備予定。
