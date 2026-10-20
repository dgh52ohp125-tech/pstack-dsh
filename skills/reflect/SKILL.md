---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

**Dispatch contract.** Resolve every configured role through [`provider-dispatch.md`](../poteto-mode/references/provider-dispatch.md). Reviewers need the parent's live MCP surface, so the default and supported portable route is `inherit-parent` (or its `auto` alias). Pass the transcript or digest plus any required evidence paths. On Codex, resolve remaining Claude tool names via [`codex-tools.md`](../poteto-mode/references/codex-tools.md).

## When to invoke

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

The parent finds its own transcript file before fanning out. The system prompt names Claude Code's per-project transcripts directory at `~/.claude/projects/<encoded-cwd>/`. Use that path. Do not glob across `~/.claude/projects/`. That crosses workspace boundaries and reads private chats from unrelated projects.

```bash
ls -t ~/.claude/projects/<encoded-cwd>/*.jsonl 2>/dev/null | head -10
```

That covers the legacy flat (`<id>.jsonl`), current nested (`<id>/<id>.jsonl`), and subagent (`<parent>/subagents/<child>.jsonl`) layouts. For each candidate, read the first JSONL line. Take the file whose `message.content[0].text` contains the conversation's opening user prompt. If none matches, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

Start all three read-only lanes in one fan-out phase through provider dispatch. Reviewers need MCP access for context lookups (tickets, chat threads, observability traces referenced in the transcript), so keep them native to the parent. The prompt forbids file writes; the parent applies edits.

| Lens | Model descriptor | Prompt template |
|---|---|---|
| Judgment | the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `inherit-parent`) | `references/judgment-reviewer.md` |
| Tooling | the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `inherit-parent`) | `references/tooling-reviewer.md` |
| Divergent | the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `inherit-parent`) | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the `Agent` response body.

## 3. Synthesize

Dispatch one lane using the `reflect tooling, judgment, divergent, synthesizer` descriptor (default `inherit-parent`). Preserve relevant MCP access because the synthesizer spot-verifies citations. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

File each Backlog item to your team's devex or backlog tracker without waiting. Only the Accepted list waits for approval.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to the **plugin-dev:skill-development** skill and run its draft / test / iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to `plugin-dev:skill-development` and run its description-optimization loop.
- `new skill via plugin-dev:skill-development: <kebab-name>`: hand creation to `plugin-dev:skill-development`. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
