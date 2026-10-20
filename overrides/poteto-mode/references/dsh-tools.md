# DSH tool mapping for pstack

pstack skills keep Claude Code tool language (`Skill`, `Agent`, `AskUserQuestion`) in shared prose. On DeepSeek Harness (DSH) the files are the same; only those tool names resolve differently. This file is the DSH counterpart of [`codex-tools.md`](codex-tools.md). Read the Codex file only for harness-agnostic background; for anything a DSH session must *do*, this file wins.

Where a skill's Platform note says "on Codex or another non-Claude runtime, resolve via `codex-tools.md`", on DSH resolve from **this** file instead. The two differ: DSH has no `spawn_agent`, `wait_agent`, `close_agent`, `update_plan`, or `apply_patch`.

## Tool actions

| pstack / Claude action | DSH equivalent |
|---|---|
| Read a file | `read` (`offset` / `limit` to page) |
| Create or overwrite a file | `write` |
| Edit a file in place | `edit` (exact literal `old_string` → `new_string`) |
| Find files by path pattern | `glob` (not `find`) |
| Search file contents | `grep` (not `rg` / `grep` in a shell) |
| Run a shell command | `pwsh` (PowerShell 7, `pwsh -Command`, one fresh process per call) |
| Fetch a URL | `web_fetch` |
| Search the web | `web_search` |
| Invoke a skill (the `Skill` tool, `/command`) | `skill` tool with the exact skill name. A skill the user invokes directly arrives as a `<skill_content>` block — follow it and do **not** call `skill` again. |
| Dispatch a subagent (the `Agent` / `Task` tool) | `subagent` (one-shot) or `subagent_fork` (inherits this conversation); `pstack_spawn` for a role-routed child |
| Dispatch N parallel subagents in one turn | N calls in one assistant message, so they run concurrently |
| Wait for a subagent result | You are notified on settle. `send_message` to steer a running child or continue a finished one. |
| Free a finished subagent slot | `interrupt_agent` (continuable child) or `job_kill` (background job) |
| Track tasks (todolist / `TodoWrite`) | `todo_write({ todos: [{ content, status }] })` — wholesale replace, no `id`/`merge`/`cancelled`; status is `pending` \| `in_progress` \| `completed` |
| Ask the human a fixed-choice question (`AskUserQuestion`) | `ask_user_question` |
| Long-running objective across turns (`/goal`, `/loop`) | `create_goal` then `get_goal` / `update_goal` with the exact revision. Goal continuation is **not** a timed scheduler; do not promise cadence. |
| List a background job's output | `job_output` (`wait: true` only when genuinely blocked) |

## Subagent dispatch

Three ways, in order of preference for pstack roles:

1. **`pstack_spawn`** — the role-routed child. Sends `description`, `prompt`, `role`, optional `run_in_background` and `route_index`. Never send model, provider, effort, thinking, isolation, or `subagent_type`: the overlay at `$DSH_HOME/pstack-dsh.json` supplies route and reasoning effort, and DSH rejects those fields.
2. **`subagent`** — the official model-facing tool. Only `description`, `prompt`, `run_in_background`. It cannot take a pstack role or a per-call model, so it always inherits this conversation's route. Use it when `pstack_spawn` is absent.
3. **`subagent_fork`** — inherits this conversation's full history. Use for a review or continuation that needs what is already in context.

There is no `subagent_type` field. pstack's `subagent_type: "poteto-agent"` or `"comment-sicko"` becomes `pstack_spawn` `role: poteto-agent` / `role: comment-sicko`. When a playbook asks for an ad-hoc agent in poteto-mode's style, tell it in the prompt to read the `poteto-mode` skill in full first.

There is no isolation, worktree, or `environment: "cloud"` field. Spawn-in-process inherits the parent's working directory. The **parent** may `git worktree add` and pass that path in the prompt. Nested spawn depth defaults to 3.

`pstack_spawn` children are continuable: you get a settlement notice and continue with `send_message`. `subagent` defaults to background; `subagent_fork` defaults to foreground.

## Models and providers

DSH routes come from the harness, not from a vendor catalog: `ctx.llm.listProviders()` for registered adapters and `resolveModelInfo(provider, model).reasoning.efforts` for the effort ids each one actually accepts. A descriptor whose effort id is not in that list is rejected at call time.

Do not copy Codex's `gpt-6.1-sol`, Claude's `opus`, Grok's `grok-4.7`, or Cursor's panel slugs into a DSH route. Map each pstack descriptor onto a route that exists on this machine. `$DSH_HOME/pstack-dsh.json` is the overlay; Settings → pstack is its editor. A role with `inherit: true` runs on this conversation's route.

When the catalog is empty, every child inherits the parent. That is a working configuration, not an error — say so instead of inventing slugs.

## Claude built-in skills pstack references

These ship with Claude Code, not pstack, and do not exist on DSH. Substitute the behavior:

| Claude built-in | On DSH |
|---|---|
| `run` (drive a CLI/TUI to see a change work) | Run the program yourself through `pwsh` and read the real output. |
| `verify` (drive a UI to confirm a fix) | Drive the UI with whatever automation you have, or hand the user a concrete manual check. Do not claim done without observing the artifact. |
| `plugin-dev:skill-development` (SKILL.md authoring) | Follow `authoring-a-skill` in `poteto-help`. Keep kebab-case `name` plus `description` frontmatter and progressive disclosure. |
| `loop` (recurring re-invocation, used by `babysit`) | No `loop` and no scheduler. Re-run the step yourself on a cadence, or use `create_goal` for a long objective. |
| `AskQuestion` | `ask_user_question` |
| `create-skill` | `authoring-a-skill` playbook |
| `cursor-team-kit` (`deslop`, `control-ui`, `control-cli`) | Not shipped. Use `unslop` and `no-comments`; drive the real surface (browser, CLI, tests). |
| Graphite `gt` | Optional. If `gt` is not on PATH, use `gh` + `git`. |

## Paths and config home

The parent's config home is `$DSH_HOME` when set, otherwise `~/.dsh`. The overlay lives at `$DSH_HOME/pstack-dsh.json`. pstack's `<config-home>` means that directory on DSH.

Skill locations, in the order the harness prefers them: project `.dsh/skills/`, `$DSH_HOME/skills/`, `.agents/skills/`, then this plugin's bundled `skills/`. Verification skills pstack generates go under `$DSH_HOME/skills/verify-<app>/`.

Do not write `~/.cursor/rules` or `~/.claude/rules`. DSH reads neither.

## Instructions file

Where a pstack skill says "your instructions file", on DSH that is `AGENTS.md` — the project root, plus `$DSH_HOME/AGENTS.md` for global rules.

## Vendored scripts

`skills/poteto-mode/scripts/` ships `watch-pr`, the `orch` store CLI, `worktree-audit.sh`, and `runner/pstack-runner`. They are bun and bash. There is no `bun` on this machine, so the external `pstack-runner` launcher is superseded: `pstack_spawn` already applies the overlay route and effort in-process. Do not try to install bun to make the launcher work.

`worktree-audit.sh` reads Claude Code transcripts under `~/.claude/projects/`. DSH session logs are elsewhere; point it at the DSH log directory or skip it.

## Frontmatter the DSH loader actually accepts

The bundled loader parses only `name`, `description`, `whenToUse`, `disable-model-invocation`, and `user-invocable` from a single-line `key: value` frontmatter block. `name` must match `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`; a name that fails the pattern makes the loader **silently drop the skill**, with no error.

Files must be LF. A CRLF file leaves `\r` on every parsed value, which fails the name pattern and drops the skill the same way. Any sync from an upstream tree must normalize line endings.

`disable-model-invocation: true` means the model cannot call the skill; the user can still invoke it. Upstream ships it on 55 of 56 skills because upstream expects the user to type the slash command. This port keeps most skills model-invocable so the model can reach for them mid-task. Keep that property when re-syncing: a naive "take upstream verbatim" silently re-blocks skills.
