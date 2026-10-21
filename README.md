# pstack for DeepSeek Harness

pstack's per-role model routing, working on DSH, owned here instead of upstream.

Upstream pstack is written for Cursor: it reaches for Cursor tools, Cursor's
model names, and Cursor's bugbot reviews. This package keeps the prose — the
skills, the personas, the docs — and replaces the layer that has to know what
DSH is.

## Why this fork exists

Two things made the published `pstack-dsh` unusable on a real machine:

1. **Save wiped every role mapping.** The Settings catalog decided a route was
   selectable by looking for an `apiKeyEnv` string in DSH settings. On a machine
   where every provider is signed in through a plugin or the keyring, no such
   string exists, so the catalog came back empty. The Save handler then read an
   empty catalog as "all 24 mappings went stale" and wrote them all away.
2. **One harness upgrade broke spawning.** `pstack_spawn` called
   `subagents.startActivation(...)` directly. When the harness exposes a
   different entry point, the tool throws instead of spawning.

Both are fixed here, and both have regression tests.

## What is different from upstream pstack

- **Selectability is what the harness can run**, not what a credential looks
  like on disk. A registered adapter that answers `listModels` is a live route.
- **An unreadable effort ladder is not an empty one.** When a provider plugin
  fails to describe its own model, the route stays selectable and keeps any
  effort it was assigned; the failure is reported in the route `hint` instead of
  being silently flattened into "no effort dial".
- **An empty catalog cannot destroy an overlay.** `catalogEmpty` is surfaced, the
  stored overlay is returned unchanged, and a save that would erase every
  mapping is refused with an explanatory error.
- **Spawning probes for the API the harness actually has**
  (`startActivation`, `start`, `startContinuable`, `startOneShot`), so the next
  DSH upgrade is a normalisation branch rather than a rewrite.

## Layout

| Path | Role |
| --- | --- |
| `src/` | Host source. Compiled to `lib/` with node's built-in type stripping. |
| `lib/` | Built host output. **Committed**, so a deploy needs no toolchain. |
| `lib/client.js` | Prebuilt Settings UI bundle. Not rebuilt here. |
| `overrides/` | The hand-made DSH edits to upstream prose, as data (3 whole files, 9 patches). |
| `skills/` | Mirrored from upstream and **committed**, so a clone installs with answers intact. Re-sync instead of editing. |
| `agents/` | Persona files, mirrored from upstream and committed. |
| `scripts/build.mjs` | Compile `src/*.ts` → `lib/*.js`. No dependencies, no network. |
| `scripts/deploy.mjs` | Install the build into a DSH profile plugin directory. |
| `tests/` | 100 checks over catalog, overlay, spawn, skills, seam, imports and the live overlay. |
| `capture-seam.py` | Record the local edits to upstream prose as `overrides/`. |
| `sync-skills.py` | Rebuild `skills/` from upstream plus `overrides/`. |

## Install

The repo is self-contained: `lib/` and `skills/` are both committed, so a
clone installs a working plugin with no build step and no sync.

**From GitHub (recommended).** Pin a commit, not the branch — a moving branch
would let an unrelated upstream change alter the running harness unasked:

```powershell
dsh plugin --profile <profile> add "git+https://github.com/dgh52ohp125-tech/pstack-dsh.git#<sha>"
```

`dsh plugin` forwards its arguments to pnpm, so any spec pnpm accepts works.
pnpm records the resolved tarball and integrity hash in `pnpm-lock.yaml`.

**From a working checkout**, to iterate on the plugin itself:

```powershell
node scripts/build.mjs     # compiles src/ into lib/
node scripts/deploy.mjs    # copies the build into a profile's plugin directory
```

Deploy backs up the previous `lib/` to `lib.backup-<timestamp>`, keeps
`client.js`, and refuses to shrink the deployed `skills/` tree — a fork checkout
that has not been synced yet cannot erase a good install.

Then restart the harness. The host keeps the previous module in memory, so an
edited file on disk is inert until restart.

## Re-adapting after an upstream pstack release

This is the point of the fork. The seam is data, so a sync is mechanical.

**Currently synced to Cursor pstack 0.15.29** (`cursor/plugins`, last upstream
commit 2026-10-20). That is the newest prose anywhere: the `open-pstack`
release layer (1.15.0) still carries 0.15.25. To check for a newer one:

```powershell
git clone --depth 1 --filter=blob:none --sparse https://github.com/cursor/plugins.git <dir>
cd <dir>; git sparse-checkout set pstack
(Get-Content pstack\plugin.json -Raw | ConvertFrom-Json).version
```

If that version is above 0.15.29, sync:

```powershell
# 1. Point at the new upstream tree
python sync-skills.py --upstream <dir>/pstack/skills --dest skills

# 2. See whether the new prose still accepts the seam
python capture-seam.py --upstream <dir>/pstack/skills --installed skills
```

A non-zero exit from step 1 names every override that no longer applies. That is
the whole review list: re-read those files by hand, update `overrides/*.patch`,
and re-run until the exit is 0. Everything else is automated.

`capture-seam.py` reports `added` / `changed` / `upstream-only`. A patch that no
longer applies is a prose change to re-read — it is the one thing a sync cannot
do for you. Anything else is automated.

If the DSH host API moved instead of the prose, run `npm test`: the spawn group
exercises every start shape, and the imports group fails loudly when a
`@deepseek-ai/*` export this package needs has disappeared.

## Tests

```powershell
npm test          # build, deploy, then run every group
npm run test:keep # skip the deploy step
```

Groups: `build`, `deploy`, `imports`, `catalog`, `overlay`, `spawn`, `skills`,
`seam`, `live` — 100 checks. The `live` group reads your real
`$DSH_HOME/pstack-dsh.json` and the provider data this machine ships, so it fails
when a real role points at a route or an effort the machine cannot serve.
`npm run test:keep` runs everything except `deploy`.

Tests load the **deployed** tree, not `src/`, because the loader resolves bare
`@deepseek-ai/*` specifiers only from inside the profile's `node_modules`.

A fresh clone is enough to run them: `lib/` and `skills/` are both committed.
The `seam` group compares the committed `skills/` tree against upstream when
`PSTACK_UPSTREAM` (or the local `upstream` junction) points at one, and reports
`skipped, not run` rather than passing silently when neither is present.

## Environment notes

- `node_modules/@deepseek-ai` in this repo is a **junction** to the DSH runtime
  scope. It makes bare specifiers resolve from the repo root, and it is
  machine-specific — never committed. To recreate it:

  ```powershell
  New-Item -ItemType Junction -Path node_modules\@deepseek-ai `
    -Target "<DSH runtime>\node_modules\@deepseek-ai"
  ```

- `overrides/*.patch` are unified diffs against LF files. `.gitattributes` pins
  them to `eol=lf`; without it a Windows checkout turns them into CRLF and
  `sync-skills.py` fails with `patch does not apply` — but only in a fresh clone.
- `dotenv`-style `.env` files are not read. Configuration lives in
  `$DSH_HOME/pstack-dsh.json` for role routing.
- `dsh --profile desktop` is refused; the Electron app owns that profile
  exclusively. Verify against a separate profile
  (`dsh plugin --profile <name> add link:<this repo>`), which mounts this repo
  through `cordis.patch.yml`.
- The desktop profile can still be changed, just not through `dsh plugin`: edit
  `$DSH_HOME/profiles/desktop/package.json` and run `pnpm install` in that
  directory. `dsh plugin` is a thin `pnpm` forwarder, so the result is the same
  install. Restart the app afterwards — the host holds the old module in memory
  and a file on disk is inert until then.
