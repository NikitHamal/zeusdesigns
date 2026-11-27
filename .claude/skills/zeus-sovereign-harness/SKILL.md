---
name: zeus-sovereign-harness
description: Work on the Zeus Sovereign Design Harness (src/lib/sovereign/*): streaming FSM parser, SEARCH/REPLACE patch engine, anti-truncation guard, versioned VFS, skill router and prompt compiler, sandbox telemetry bridge, self-healing loop, DOM inspector. Use when changing how designs are prompted, parsed, patched, previewed, snapshotted, repaired or inspected.
---

# Zeus Sovereign Design Harness

Read `docs/SOVEREIGN_HARNESS.md` first, then `AGENTS.md` (the design laws apply to every prompt you write).

## Layout rule: pure core, thin shell
- PURE (no store, no DOM, unit tested): `types, events, fsm, patch, diff, guard, vfs, skills, prompt, sanitizer, resolver, bridgeScript, runtime`.
- STORE-BOUND: `state, vfsBinding, healer, host, integration`. `engine.ts` talks to the harness ONLY through `integration.ts`.
- A new capability starts as a pure function with a test in `scripts/test-sovereign.mjs`, then gets a one-line hook in `integration.ts`.

## Invariants (do not break)
1. A harness bug must never break a generation: every `integration.ts` entry point degrades to a no-op.
2. Streams without `<zeus_*>` tags parse byte-identically to before (`zeusToArtboards` returns the input untouched).
3. Stored artboard HTML is never modified at render time. The import map and bridge are injected into the iframe `srcDoc` only, tagged `data-zeus-edit` so the editor, `hasCustomScript` and `stripKitBoilerplate` ignore them.
4. The parser never throws and never drops a character. Fuzz and chunk-size tests guard this.
5. Prompts obey the Zeus laws: no shadows, no emojis, no LIVE badges, no blue/purple gradients, no CDNs in generated screens, Material Symbols via `<i data-i>`, bundled fonts only. A test asserts no emoji in skill prompts.
6. Auto self-heal is capped at `MAX_AUTO_HEAL_ATTEMPTS` (2) per user turn. Manual "Fix with Zeus" is always allowed.
7. VFS snapshots store kit-stripped HTML; restoring re-hardens through `harden()`.

## Adding a skill
Add the prompt to `SKILL_LIBRARY` and a rule to `routeSkills` in `skills.ts` (max 4 per turn, healer excludes aesthetics). Add a router test and keep the prompt under ~12 lines.

## Verify
Run the `zeus-harness-verify` skill.
