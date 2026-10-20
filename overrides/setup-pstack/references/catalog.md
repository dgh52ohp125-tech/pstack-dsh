# Live catalog

`pstack_catalog` lists routes this DSH can actually call. It is not a vendor catalog. The Settings → pstack page calls the same `buildCatalog` through `GET /plugins/pstack-dsh/settings`.

## Selectable

A route is selectable when both are true:

1. `ctx.llm.listProviders()` includes the adapter.
2. Either an API key is configured (`credentials.describe(ref).configured`, refs collected from settings `apiKeyEnv`, plus `DEEPSEEK_API_KEY` for `deepseek-official`) **or** the dsh-oauth-login / dsh-antigravity-oauth store already has that provider's id **and** the matching adapter (`pi-*` or `agy-*`) is registered.

`listModels` + `resolveModelInfo` supply model ids and `reasoning.efforts`. If `efforts` is empty or missing, setup omits effort for that route.

Secrets are never returned. `describe()` answers configured-or-not.

## Empty

`selectableCount === 0`: every role inherits this conversation. Tell the user to add a key in DSH settings, or install and login [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) / dsh-antigravity-oauth. Do not block. Do not ask them to paste a vendor list.

## OAuth peer

If `recommendOauthLogin` is true, one line: subscription logins (ChatGPT, Claude, Grok, Copilot, OpenRouter, Kimi, Google Antigravity) show up as `pi-*` or `agy-*` routes after installing and signing in with dsh-oauth-login or dsh-antigravity-oauth. API-key-only users keep working without them.

Store files: `$DSH_HOME/.dsh-oauth-auth.json`, `$DSH_HOME/.dsh-antigravity-oauth.json`. Do not read `~/.pi`, `~/.codex`, `~/.claude`, or grok CLI login files.

## Overlay

`pstack_overlay_read` / `pstack_overlay_write` own `$DSH_HOME/pstack-dsh.json`. Write validates every provider/model/effort against this catalog. Unknown roles and extra fields fail loud.
