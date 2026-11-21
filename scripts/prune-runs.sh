#!/usr/bin/env bash
# Keep exactly one finished workflow run: the latest successful one.
# Deletes every other completed run (failed, cancelled, skipped, older successes).
# Env: GH_TOKEN (required), REPO (owner/name), CURRENT_RUN_ID (optional), CURRENT_OK=true|false (optional)
set -euo pipefail

REPO="${REPO:-${GITHUB_REPOSITORY:?REPO or GITHUB_REPOSITORY required}}"
CURRENT="${CURRENT_RUN_ID:-}"

if [ "${CURRENT_OK:-}" = "true" ] && [ -n "$CURRENT" ]; then
  KEEP="$CURRENT"
else
  KEEP="$(gh api "repos/$REPO/actions/runs?status=success&per_page=1" --jq '.workflow_runs[0].id // empty')"
fi
echo "keeping run: ${KEEP:-none}"

gh api --paginate "repos/$REPO/actions/runs?per_page=100" \
  --jq '.workflow_runs[] | select(.status=="completed") | .id' |
while read -r id; do
  [ -z "$id" ] && continue
  [ "$id" = "$KEEP" ] && continue
  [ "$id" = "$CURRENT" ] && continue
  gh api -X DELETE "repos/$REPO/actions/runs/$id" >/dev/null && echo "deleted run $id" || echo "skip run $id"
done
