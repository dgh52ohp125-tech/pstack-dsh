---
name: poteto-help
description: Guides users through pstack setup, /pstack:poteto-mode, and picking the skill, playbook, or principle for a task. Type /pstack:poteto-help with a question.
disable-model-invocation: true
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a pstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read [`poteto-mode`](../poteto-mode/SKILL.md), do the work under it, and use the current harness's entry behavior described below.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. Link the installed port file when its behavior differs from upstream. For original content and guide pages, link the public Cursor source and label its UI instructions as Cursor-specific. Follow the [harness mapping](../poteto-mode/references/codex-tools.md) for Claude Code and Codex tools; keep provider routing in [provider-dispatch.md](../poteto-mode/references/provider-dispatch.md). In examples, Claude Code uses `/pstack:<skill>`; in Codex say `Use pstack:<skill>`. Do not promise that Cursor Custom Modes exist in either harness.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with `/pstack:poteto-mode`
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- No `pstack-models.md` in the [resolved harness config home](../poteto-mode/references/codex-tools.md#harness-config-homes) means `/pstack:setup-pstack` hasn't run for this user, so every role uses its default model.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention `/pstack:create-verification-skill` when the question is about proving a change works.
- No formal verification skill in the project means no property is checked past what tests reach. Mention `/pstack:create-formal-verification-skill` when the question is about a race, an invariant, or another case tests rarely hit. When one exists and the code it covers changed after the commit it records as last in sync, mention `/pstack:maintain-formal-verification-skill` if the question touches that code.

When the model rule is missing and it matters, ask whether the user wants to pick a model for each role and a requested effort per assigned model family now. It matters when the user is new, the question is about setup or cost, or the answer depends on which models run. Ask at most once per chat. If the need is also unclear, ask both questions together. Offer two choices:

- Now: give them `/pstack:setup-pstack` to type, and answer their question too.
- Later: answer their question, and add one line saying every role keeps its default model until they run `/pstack:setup-pstack`.

## Get set up

1. Install the Open Pstack marketplace and `pstack@open-pstack` using the commands in the [port README](https://github.com/ericlitman/open-pstack#install). Use the user's fork marketplace when they installed this fork.
2. Run [`/pstack:setup-pstack`](../setup-pstack/SKILL.md). It maps roles, asks one requested effort per assigned family, probes those models, and saves a model sheet only after confirmation. The rule applies to new chats. Then it offers once each to generate a verification skill and a formal verification skill for the project, unless the project already has one.
3. Start a real task with `/pstack:poteto-mode`, a goal, and a check that can pass or fail.

Claude Code loads a SessionStart instruction that can route non-trivial work into poteto-mode. Codex starts when the user asks for the skill by name. The [port README](https://github.com/ericlitman/open-pstack#readme) and [guide page 1](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/01-setup.md) have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. pstack spends extra tokens on subagents and review panels. Rerun `/pstack:setup-pstack` and choose fewer panel entries, a lower requested effort, or different available models explicitly. Never lower effort or substitute a model after a failed probe. A role set to `auto` or `inherit-parent` runs on the chat's model, which saves tokens when the chat runs on Auto or a cheaper model. A shorter panel list runs fewer subagents, one for each entry. Save `/pstack:poteto-mode` for work that needs rigor.

Open Pstack shares the same skill tree between Claude Code and Codex. Native and external model routes differ by the parent harness, and external lanes do not inherit its MCP servers. Keep MCP-dependent roles on `inherit-parent` unless the user explicitly supplies a supported route.

## Start a task with `/pstack:poteto-mode`

`/pstack:poteto-mode` matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Guide page 2](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/02-poteto-mode.md) has examples.

Claude Code can route tasks through its startup instruction; invoke `/pstack:poteto-mode` explicitly when needed. In Codex, ask `Use pstack:poteto-mode` for each new task, or use a standing instruction that the user has chosen. Start a fresh helper for a new task; resume only for the stateful cases in poteto-mode's Subagents section. Claude uses its `poteto-agent` definition; Codex uses the native subagent primitive with instructions to read poteto-mode first.

## Pick a skill

The default answer is `/pstack:poteto-mode`, which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [`/pstack:poteto-mode`](../poteto-mode/SKILL.md) |
| Check that the agent understood their goal and the problem before it starts | [`/pstack:in-your-own-words`](../in-your-own-words/SKILL.md) |
| Aim a task higher before starting: more expert, more outcome-focused, not overspecified | [`/pstack:sharpen`](../sharpen/SKILL.md) |
| Know how code works now, or where new code should live | [`/pstack:how`](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [`/pstack:why`](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [`/pstack:teach`](../teach/SKILL.md) |
| Catch up on their own recent work on a topic | [`/pstack:recall`](../recall/SKILL.md) |
| Catch up on what changed in this chat since their last message, in a few plain sentences and small visuals, with enough context to decide each action item | [`/pstack:ketchup`](../ketchup/SKILL.md) |
| Know what a small diff could break outside itself | [`/pstack:blast-radius`](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [`/pstack:architect`](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [`/pstack:arena`](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers, as cloud agents | [`/pstack:swarm`](../swarm/SKILL.md) |
| Have different models review a diff and try to break it | [`/pstack:interrogate`](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [`/pstack:tdd`](../tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [`/pstack:typescript-best-practices`](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [`/pstack:no-comments`](../no-comments/SKILL.md) |
| Clean AI tells out of prose | [`/pstack:unslop`](../unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [`/pstack:technical-writing`](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [`/pstack:bro`](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [`/pstack:create-verification-skill`](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [`/pstack:maintain-verification-skill`](../maintain-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | [`/pstack:benchmark-checklist`](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [`/pstack:figure-it-out`](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [`/pstack:show-me-your-work`](../show-me-your-work/SKILL.md) |
| Pick a model for each role and a reasoning budget | [`/pstack:setup-pstack`](../setup-pstack/SKILL.md) |
| Turn their own working habits into a personal mode skill | [`/pstack:automate-me`](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [`/pstack:reflect`](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [`/pstack:correct`](../correct/SKILL.md) |
| Build a page whose buttons wake a Grok Bot over a webhook | [`/pstack:make-bot-ui`](../make-bot-ui/SKILL.md) |
| Find their way around pstack | `/pstack:poteto-help` |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- `/pstack:how` explains what the code does. `/pstack:why` explains the reasons. `/pstack:teach` runs one or both and explains the result plainly.
- `/pstack:arena` gives every worker the same brief and merges the best parts. `/pstack:swarm` splits work into slices or a race and returns one report.
- `/pstack:architect` implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- `/pstack:interrogate` reviews the diff. `/pstack:blast-radius` looks for breakage outside the diff and proves the one fact that makes the change safe.
- `/pstack:recall` rebuilds context across recent chats. Resuming one specific chat or branch is the Session pickup playbook.
- `/pstack:figure-it-out` designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Companion features and port differences:

- Open Pstack bundles `deslop` and a standalone `babysit` skill. For control surfaces, use the harness mapping and a project verification skill.
- Claude Code provides `/loop`; Codex follows the supported cadence mapping and must report when no scheduler is available. Skill authoring uses the harness mapping, not Cursor's `/create-skill`.
- `make-bot-ui` is excluded because it depends on Cursor-only UI and webhook primitives.
- pstack has no `/orchestrate` skill. Orchestrate is a `/pstack:poteto-mode` playbook. If the slash menu shows `/orchestrate`, another plugin provides it.

## Playbooks and principles

Playbooks are step lists inside `/pstack:poteto-mode`, not skills, so they have no slash command. Inside `/pstack:poteto-mode`, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "stack them, don't ship" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

Without `/pstack:poteto-mode`, a phrase such as "babysit this pr" can start the bundled standalone babysit skill instead. The Playbooks section of [`poteto-mode`](../poteto-mode/SKILL.md) lists every playbook and when it applies. [Guide page 6](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.

pstack has no planning skill. The active harness's planning mode works alongside it. For work that spans phases or stacked PRs, asking `/pstack:poteto-mode` for a plan runs the [Multi-phase plan playbook](../poteto-mode/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or `/pstack:architect` settles it in code first.

Principles are one-rule skills that `/pstack:poteto-mode` reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Ask the agent to read a named principle when you need one; principle leaves are marked user-hidden. [Guide page 8](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/08-principles.md) lists them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| The mode stopped applying after a few turns | Invoke the skill explicitly for the new task; check the current harness's startup or standing instructions. |
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| A new model choice had no effect | The rule from `/pstack:setup-pstack` applies to new chats. Start one. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Invoke its namespaced skill explicitly. Poteto-mode routes only the skills its selected playbook needs. Poteto-help and Correct require explicit invocation; the benchmark checklist must remain callable by poteto-mode. |
| Parallel agents overwrote each other | Give writers disjoint paths or isolated checkouts using the current harness's supported isolation. Each Codex cloud task already has an isolated environment; do not create an extra worktree unless the user requests one. |
| An overnight run moved but finished nothing | A recurring run needs a check that can pass or fail and an available scheduler in the current harness. See [guide page 7](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/07-overnight.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Guide page 10](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/10-recipes-and-pitfalls.md) has more pitfalls and the recipes worth copying.

## Make pstack my own

- [`/pstack:automate-me`](../automate-me/SKILL.md) drafts a personal mode skill from the user's own history, to use alongside `/pstack:poteto-mode`.
- [`/pstack:reflect`](../reflect/SKILL.md) after a session turns its lessons into skill edits the user approves.
- `/pstack:poteto-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

[Guide page 9](https://github.com/cursor/plugins/blob/main/pstack/docs/guide/09-make-it-yours.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
