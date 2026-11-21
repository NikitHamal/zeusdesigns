#!/bin/sh
# usage: sh scripts/push.sh "commit message"   (run from project root)
set -e
sh scripts/sync-repo.sh
cd zeusdesigns
git config user.name "Claude Sonnet 5.5"
git config user.email "sonnet@zeusdesigns.dev"
git add -A
git commit -qm "$1" || true
export GIT_ASKPASS=/tmp/gitenv.sh GIT_TERMINAL_PROMPT=0
git pull --rebase origin main 2>&1 | tail -2
git push origin HEAD:main 2>&1 | tail -3
