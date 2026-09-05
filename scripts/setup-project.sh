#!/usr/bin/env bash
# GitHub Projects (v2) "IPPON GP Roadmap" を作成し、フィールドと全 open Issue を追加する。
# 使い方:  gh auth refresh -s project && bash scripts/setup-project.sh <owner> <owner/repo>
# 冪等: 同名プロジェクトがあれば再利用する。
set -euo pipefail
OWNER="${1:?owner}"; REPO="${2:?owner/repo}"
TITLE="IPPON GP Roadmap"

num=$(gh project list --owner "$OWNER" --format json --limit 100 | jq -r --arg t "$TITLE" '.projects[] | select(.title==$t) | .number' | head -n1)
if [ -z "$num" ]; then
  num=$(gh project create --owner "$OWNER" --title "$TITLE" --format json | jq -r .number)
  echo "created project #$num"
else
  echo "reuse project #$num"
fi

has_field() { gh project field-list "$num" --owner "$OWNER" --format json | jq -e --arg n "$1" '.fields[] | select(.name==$n)' >/dev/null; }
has_field "Priority"  || gh project field-create "$num" --owner "$OWNER" --name "Priority"  --data-type SINGLE_SELECT --single-select-options "P0,P1,P2"
has_field "Area"      || gh project field-create "$num" --owner "$OWNER" --name "Area"      --data-type SINGLE_SELECT --single-select-options "main,host,judge,camera,config,infra,saas,upstream,ops,docs"
has_field "Iteration" || gh project field-create "$num" --owner "$OWNER" --name "Iteration" --data-type ITERATION || true
has_field "Target"    || gh project field-create "$num" --owner "$OWNER" --name "Target"    --data-type DATE

# 全 open Issue を追加（既に追加済みはエラーにならない）
gh issue list -R "$REPO" --state open --limit 200 --json url --jq '.[].url' | while read -r url; do
  gh project item-add "$num" --owner "$OWNER" --url "$url" >/dev/null && echo "added $url"
done

echo
echo "Project: https://github.com/users/$OWNER/projects/$num"
echo "次にやること: Status 列を Backlog / Ready / In progress / In review / Done に、ビューを Board / Roadmap(Milestone) / Table(Priority) で追加してください。"
