---
name: zeus-harness-verify
description: Verification gate for Zeus harness changes. Typecheck, run the sovereign unit tests, build, and confirm the working tree is clean of research artifacts and secrets before committing.
---

# Zeus harness verification gate

Run from the repository root, in order. Every step must be green before a commit.

```bash
npm ci                      # only if node_modules is missing
npm run typecheck           # tsc --noEmit, strict + noUnusedLocals (this repo's lint gate)
npm run test:sovereign      # parser, patch, guard, VFS, skills, prompt, sanitizer, resolver, bridge, events
npm run build               # must end with "built in"
```

Then audit the tree:
```bash
git status --short          # only src/lib/sovereign/**, harness UI, scripts/test-sovereign.mjs, docs, .claude/skills
git diff --stat
git grep -nE "gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|BEGIN (RSA|OPENSSH)" -- . ':!package-lock.json' || echo "no secrets"
```
Never commit `dist/`, `node_modules/`, `.env`, or external clones (research happens in `/tmp`).
Never push to `main`/`master`; never open a pull request unless the user asks.
