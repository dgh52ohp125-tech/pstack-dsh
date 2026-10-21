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
| `tests/` | 142 checks by default (`npm test`) over catalog, overlay, spawn, the host API contract, skills, seam and upstream; 156 with `npm run test:live`, which adds this machine and its real overlay. |
| `capture-seam.py` | Record the local edits to upstream prose as `overrides/`. |
| `sync-skills.py` | Rebuild `skills/` from upstream plus `overrides/`. |
| `upstream.json` | The upstream release this tree was synced to. `check-upstream` and the `upstream` test group both read it. |
| `scripts/check-upstream.mjs` | Ask the live `cursor/plugins` manifest whether a newer release exists. |
| `.github/workflows/upstream.yml` | Runs that check daily and opens one issue per new upstream version. |

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

**Currently synced to Cursor pstack 0.15.29.** Two layers sit above this fork,
and knowing which one to sync from is the whole trick:

| Layer | What it is | Sync from it? |
|---|---|---|
| `cursor/plugins/pstack` | Lauren Tan's original. Written for Cursor's tools. | **No** — see below |
| `open-pstack` (`sync/0.15.29`) | A port that rewrites Cursor tool calls into provider-neutral dispatch contracts. | **Yes** |
| this repo | `open-pstack`'s prose plus the DSH seam in `overrides/`. | — |

Syncing straight from `cursor/plugins` fails: nine of the seams are patches
against sentences the middle layer already rewrote, and the tree comes out 7
skills short (`babysit`, `deslop`, `fix-ci`, `fix-merge-conflicts`,
`get-pr-comments`, `make-pr-easy-to-review`,
`thermo-nuclear-code-quality-review`, `what-did-i-get-done` are vendored by the
middle layer). Measured, not assumed: raw source gives `56 skills, 9 overrides
failed`; the port tree gives `63 skills, 0 failed`.

So the pin records the **port** revision, and the port in turn records which
Cursor release it carries. You do not have to watch either by hand: a daily
GitHub Action (`.github/workflows/upstream.yml`) compares `upstream.json`
against the live `cursor/plugins` manifest and opens one issue per new version.
To ask the same question locally:

```powershell
npm run check-upstream            # prints the answer, exit 1 if a sync is due
npm run check-upstream -- --json  # machine-readable
```

When it reports a new version, sync in two steps:

```powershell
# 1. Take the new Cursor release into the middle layer and push a sync branch.
#    (That repo has its own sync tooling; follow its UPSTREAM.md. The branch is
#    what makes the prose reproducible — an uncommitted mirror is not.)

# 2. Rebuild this repo's skills from that pushed branch.
git clone --depth 1 -b sync/0.15.29 https://github.com/dgh52ohp125-tech/open-pstack.git <dir>
python sync-skills.py --upstream <dir>/plugins/pstack/skills --dest skills
python capture-seam.py --upstream <dir>/plugins/pstack/skills --installed skills
```

A non-zero exit from `sync-skills.py` names every override that no longer
applies. That is the whole review list: re-read those files by hand, update
`overrides/*.patch`, and re-run until the exit is 0. Everything else is
automated. Mojibake is repaired automatically by `sync-skills.py`, because the
same UTF-8-read-as-CP1252 corruption has appeared twice in this pipeline.

Then set `version`, `skillDirs` and `skillFiles` in `upstream.json` and update
the "Currently synced to" line above. `npm test` fails until you do — the
`upstream` group cross-checks the pin, the tree, the override counts and the
README against each other, so a half-finished sync cannot ship.

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

Groups: `build`, `deploy`, `imports`, `catalog`, `overlay`, `spawn`, `contract`,
`skills`, `seam`, `upstream` — 142 checks in about three seconds, all offline, all
passing on any machine.

The `live` group is **opt-in** (`npm run test:live`, 156 checks): it reads your
real `$DSH_HOME/pstack-dsh.json`, loads the provider data this machine ships, and
spawns actual children, so it fails when a real role points at a route or an
effort the machine cannot serve. That is the question it exists to answer, which
is why it is not in the default run — a fresh clone has no overlay and no
provider data, and a suite that is red by default teaches people to ignore red.

A check whose input is genuinely optional reports as **skipped** — not failed,
not passed. A fresh clone has no `upstream/` tree, so the byte-for-byte re-sync
check reports `checksSkipped: 1` with its reason instead of turning the suite red.

The `live` group is the deliberate exception. It is opt-in precisely because it
**fails on a machine that is not configured** — you ask for it, so a red result is
information rather than noise. It validates that every role points at a provider,
model and effort this machine can actually serve, a check worth nothing if it
quietly retires itself. The failure message names the file it wanted and the two
ways to make one.

### Line endings are the trap in this repo

Twice now, a fresh clone behaved differently from the machine that made it, and
both times the cause was Git converting text to CRLF on checkout on Windows.

- Round one: `.gitattributes` pinned `*.md` and friends but not `*.patch`, so
  every seam diff failed with `patch does not apply` on a clone.
- Round two: the allowlist still omitted `.sh`, `.lock` and `.tsv`, so three
  skills came out of a clone with CRLF while a local sync produced LF — six files
  differed between a stranger's sync and the committed tree.

The rule is now `* text=auto eol=lf` with binary types opted out by name, and
`tests/seam.test.mjs` asserts the property directly: no committed skill file and
no seam patch may contain a CR byte. Verified by planting one — the guard names
`bro/SKILL.md` and fails.

### The `contract` group: how this fork survives a harness upgrade

The failure this fork exists to prevent is not "pstack prose is stale". It is
"DSH changed its subagent API and `pstack_spawn` threw in someone's session".

`src/subagent-compat.ts` already survives a **renamed** method: it probes
`startActivation`, `start`, `startContinuable`, `startOneShot` in order and adapts
whatever it finds, so adding a future shape is one line there.

It cannot survive a changed **payload**. The plugin builds a request object and
hands it over; if the host renames a field or adds a required one, nothing fails
until a real spawn is attempted.

So `tests/contract.test.mjs` reads the host's own generated contract —
`@deepseek-ai/dsh-subagent/lib/typert.host.js`, which exports `TYPERT` with full
TypeScript declarations for `SubagentActivationSpec`, `SubagentStartRequest`,
`SubagentActivation` and the method list — and asserts that every field the plugin
sends still exists, that every field the host requires is still supplied, and that
the newest probed method is still a real method. It costs nothing at runtime and
cannot disagree with the installed host, because it *is* the installed host.

Proven by simulation, not assertion: a fake contract with `startActivation`
renamed to `startDelegation` and `signal` renamed to `cancellation` fails two
checks and names the unsupplied field — before any spawn is attempted.

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
