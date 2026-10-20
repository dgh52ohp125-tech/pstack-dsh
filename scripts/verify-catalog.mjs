// verify-catalog.mjs — import the DEPLOYED plugin and run buildCatalog against
// a recording stand-in for the harness, then assert the fix in real terms.
//
// Runs from inside the profile so bare @deepseek-ai/* resolve exactly as they
// do at load time.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'

const profile = 'C:/Users/User/.dsh/profiles/desktop'
const entry = `${profile}/node_modules/pstack-dsh/lib/catalog.js`
if (!existsSync(entry)) {
  console.error('verify: deployed catalog.js missing — run scripts/deploy.mjs')
  process.exit(1)
}

const mod = await import(pathToFileURL(entry).href)

// The credential-record API the real harness exposes.
const credentials = {
  async describe() {
    // Deliberately unconfigured: this machine has no apiKeyEnv refs in settings.
    return { configured: false }
  },
  async listRecords() {
    return [
      { key: 'llm-pi-ai/opencode2dsh', kind: 'grant' },
      { key: 'codex-subscription/accounts', kind: 'grant' },
      { key: 'deepseek-account-platform/default', kind: 'grant' },
    ]
  },
}

// Two registered adapters, both of which are genuinely usable on this machine.
const llm = {
  listProviders() {
    return [
      { id: 'opencode2dsh', name: 'OpenCode' },
      { id: 'openai-codex', name: 'OpenAI Codex' },
    ]
  },
  listConfigurableProviders() { return [] },
  async listModels(provider) {
    if (provider === 'opencode2dsh') return [{ id: 'glm-5.3-flash-free', name: 'GLM 5.3 Flash' }]
    if (provider === 'openai-codex') return [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }]
    return []
  },
  async resolveModelInfo(provider, model) {
    return {
      id: model,
      name: model,
      reasoning: { efforts: [{ id: 'max', name: 'Max' }, { id: 'medium', name: 'Medium' }], defaultEffort: 'medium' },
    }
  },
}

const catalog = await mod.buildCatalog({
  llm,
  credentials,
  settings: { describe() { return [] } },
  dshHome: 'C:/Users/User/.dsh',
  env: {},
})

const checks = []
const push = (name, ok, detail) => checks.push({ name, ok, detail })

push('routes enumerated', catalog.routes.length === 2, `routes=${catalog.routes.length}`)
push('every route selectable', catalog.routes.every(route => route.selectable), catalog.routes.map(route => `${route.provider}/${route.model}:${route.selectable}`).join(' | '))
push('selectableCount matches', catalog.selectableCount === 2, `selectableCount=${catalog.selectableCount}`)
push('efforts resolved live', catalog.routes.every(route => route.efforts.length === 2), catalog.routes.map(route => `${route.model}:${route.efforts.map(e => e.id).join(',')}`).join(' | '))
push('no bogus oauth recommendation', catalog.recommendOauthLogin === false, `recommendOauthLogin=${catalog.recommendOauthLogin}`)
push('overlay path reported', typeof catalog.overlayPath === 'string' && catalog.overlayPath.endsWith('pstack-dsh.json'), catalog.overlayPath)

const failures = checks.filter(check => !check.ok)
console.log(JSON.stringify({ checks, passed: checks.length - failures.length, failed: failures.length }, null, 2))
if (failures.length > 0) process.exitCode = 1
