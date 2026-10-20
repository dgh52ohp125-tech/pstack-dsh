# NOTICE

This package is a fork of MIT-licensed work by other people. All upstream
copyright notices and license terms are preserved.

## Upstream sources

| Component | Upstream | Copyright | License |
| --- | --- | --- | --- |
| The pstack skills, agent personas and documentation under `skills/` and `agents/` | [cursor/plugins/pstack](https://github.com/cursor/plugins/tree/main/pstack), tracked through [ericlitman/open-pstack](https://github.com/ericlitman/open-pstack) 1.7.0 (pstack 0.15.25) | (c) 2026 Lauren Tan | MIT |
| Several skills vendored into pstack from `cursor-team-kit` (`deslop`, `fix-ci`, `fix-merge-conflicts`, `get-pr-comments`, `make-pr-easy-to-review`, `thermo-nuclear-code-quality-review`, `what-did-i-get-done`) | [cursor/plugins/cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit) | (c) 2026 Cursor | MIT |
| The DSH host layer this fork started from (`src/`, `lib/client.js`) | [aa2246740/pstack-dsh](https://github.com/aa2246740/pstack-dsh) 0.2.3 | (c) 2026 aa2246740 | MIT |

The full per-file attribution trail for the mirrored prose is maintained
upstream in `open-pstack`'s `NOTICE.md`. This fork re-syncs that prose rather
than editing it, so that trail stays intact.

## What this fork changes

The fork's own changes are confined to the DSH host layer — `src/*.ts`,
`scripts/`, `tests/`, `capture-seam.py`, `sync-skills.py` — and to the twelve
recorded edits in `overrides/`. See `README.md`.
