#!/usr/bin/env bash
# Keep the latest successful workflow run per active branch (main and open-design),
# deleting older completed runs to keep Actions history clean.
set -euo pipefail

REPO="${REPO:-${GITHUB_REPOSITORY:?REPO or GITHUB_REPOSITORY required}}"
CURRENT="${CURRENT_RUN_ID:-}"

KEEP_MAIN="$(gh api "repos/$REPO/actions/runs?branch=main&status=success&per_page=1" --jq '.workflow_runs[0].id // empty')"
KEEP_OD="$(gh api "repos/$REPO/actions/runs?branch=open-design&status=success&per_page=1" --jq '.workflow_runs[0].id // empty')"
if [ "${CURRENT_OK:-}" = "true" ] && [ -n "$CURRENT" ]; then
  KEEP_CUR="$CURRENT"
else
  KEEP_CUR=""
fi

echo "keeping runs: main=${KEEP_MAIN:-none} open-design=${KEEP_OD:-none} current=${KEEP_CUR:-none}"

gh api --paginate "repos/$REPO/actions/runs?per_page=100" \
  --jq '.workflow_runs[] | select(.status=="completed") | .id' |
while read -r id; do
  [ -z "$id" ] && continue
  [ "$id" = "$KEEP_MAIN" ] && continue
  [ "$id" = "$KEEP_OD" ] && continue
  [ "$id" = "$KEEP_CUR" ] && continue
  [ "$id" = "$CURRENT" ] && continue
  gh api -X DELETE "repos/$REPO/actions/runs/$id" >/dev/null && echo "deleted run $id" || echo "skip run $id"
done
