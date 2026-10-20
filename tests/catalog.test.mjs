// The Settings catalog must describe what this harness can actually run.
//
// Regression this guards: selectability was inferred from an `apiKeyEnv` string
// found in settings. Every route on this machine is backed by a plugin sign-in
// or a keyring record, so the catalog came back empty, Settings rendered "no
// routes", and the next Save wrote 24 emptied role mappings over a good overlay.
//
// Runs against the deployed build, because that is the code the harness loads.
import { loadDeployed } from './plugin.mjs'
import { check, equal, summary, results } from './assert.mjs'

const { buildCatalog } = await loadDeployed('catalog.js')

function harness(overrides = {}) {
  return {
    llm: {
      listProviders: () => [
        { id: 'opencode2dsh', name: 'OpenCode Zen' },
        { id: 'openai-codex', name: 'OpenAI Codex' },
      ],
      listConfigurableProviders: () => [],
      listModels: async (provider) => provider === 'opencode2dsh'
        ? [{ id: 'glm-5.3-flash-free', name: 'GLM 5.3 Flash Free' }]
        : [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }],
      resolveModelInfo: async (_provider, model) => ({
        id: model,
        name: model,
        reasoning: { efforts: [{ id: 'medium', name: 'Medium' }, { id: 'max', name: 'Max' }], defaultEffort: 'medium' },
      }),
    },
    credentials: {
      describe: async () => ({ configured: false }),
      listRecords: async () => [{ key: 'llm-pi-ai/opencode2dsh' }, { key: 'codex-subscription/records' }],
    },
    settings: { describe: () => [] },
    dshHome: 'C:/Users/User/.dsh-test-fixture',
    env: {},
    ...overrides,
  }
}

// A route the harness can serve is selectable even when pstack cannot see a key.
const live = await buildCatalog(harness())
equal('two providers produce two routes', live.routes.length, 2)
check('every enumerated route is selectable', live.routes.every(route => route.selectable), live.routes.map(r => `${r.model}:${r.selectable}`).join(' '))
equal('selectableCount tracks routes', live.selectableCount, 2)
check('effort ladders come from the adapter', live.routes.every(route => route.efforts.length === 2), live.routes.map(r => `${r.model}:${r.efforts.map(e => e.id).join(',')}`).join(' '))
equal('no false "sign in" advice on a populated catalog', live.recommendOauthLogin, false)
check('catalog records the overlay path', live.overlayPath.endsWith('pstack-dsh.json'), live.overlayPath)
check('credential provenance is described', live.routes.every(route => route.source === 'oauth' || route.source === 'api-key'), live.routes.map(r => `${r.model}:${r.source}`).join(' '))
check('a matching credential record marks the route signed in', live.routes.find(r => r.model === 'glm-5.3-flash-free')?.source === 'oauth', live.routes.map(r => `${r.model}:${r.source}:${r.hint}`).join(' | '))

// A provider whose adapter exists but returns no models contributes nothing,
// and must not be reported as if it were runnable.
const emptyModels = await buildCatalog(harness({
  llm: { ...harness().llm, listModels: async () => [] },
}))
equal('no models means no routes', emptyModels.routes.length, 0)
equal('empty catalog says so', emptyModels.selectableCount, 0)
check('empty catalog explains itself', typeof emptyModels.emptyReason === 'string' && emptyModels.emptyReason.length > 0, emptyModels.emptyReason)

// No llm service at all: still a valid, explained empty catalog.
const noLlm = await buildCatalog(harness({ llm: undefined }))
equal('no llm service yields no routes', noLlm.routes.length, 0)
check('no llm service explains itself', String(noLlm.emptyReason).includes('no registered LLM providers'), noLlm.emptyReason)

// A failing resolver must not drop the route; the lister already proved it.
const flakyResolve = await buildCatalog(harness({
  llm: {
    ...harness().llm,
    resolveModelInfo: async () => { throw new Error('adapter offline') },
  },
}))
equal('a failed effort lookup keeps the route', flakyResolve.routes.length, 2)
check('a failed effort lookup yields an empty ladder, not a crash', flakyResolve.routes.every(route => route.efforts.length === 0), JSON.stringify(flakyResolve.routes.map(r => r.efforts)))

// A key present in settings still describes the route, and never hides it.
const withKey = await buildCatalog(harness({
  credentials: { describe: async () => ({ configured: true }), listRecords: async () => [] },
  settings: { describe: () => [{ ns: 'llm', value: { providers: { opencode2dsh: { apiKeyEnv: 'OPENCODE_KEY' } } } }] },
  llm: {
    ...harness().llm,
    listConfigurableProviders: () => [{ provider: 'opencode2dsh', displayName: 'OpenCode', settingsNs: 'llm', settingsPath: ['providers', 'opencode2dsh'] }],
  },
}))
equal('a configured key does not duplicate routes', withKey.routes.length, 2)
check('a configured key is reported as api-key provenance', withKey.routes.some(route => route.source === 'api-key'), withKey.routes.map(r => `${r.model}:${r.source}:${r.hint}`).join(' | '))

// A provider plugin that cannot describe its own route must not be read as a
// provider with no effort dial. Regression: this harness's `openai-codex` route
// throws `Cannot read properties of undefined (reading 'get')` from
// PiAiAdapter.modelInfo (dsh-llm-pi-ai/lib/index.js:14852) because
// dsh-codex-subscription builds its profile from an object it cannot reach.
// The empty ladder is that plugin's bug, so pstack records the failure and keeps
// any stored effort it cannot actually disprove.
const broken = flakyResolve.routes.find(route => route.model === 'gpt-6-astra')
equal('a failed resolve still yields a selectable route', broken?.selectable, true)
check('a failed resolve is recorded, not swallowed', String(broken?.effortsUnavailable).startsWith('adapter offline'), broken?.effortsUnavailable)
check('the failure reaches the hint text', typeof broken?.hint === 'string' && broken.hint.includes('effort ladder unavailable'), broken?.hint)

// Validation and stripping both have to honour that distinction.
const { validateOverlayAgainstCatalog } = await loadDeployed('overlay-model.js')
const { stripIllegalEffort } = await loadDeployed('settings-draft.js')
const storedRoute = { provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: 'high' }
const storedOverlay = {
  version: 1,
  roles: Object.fromEntries([['bug-fix', { inherit: false, routes: [storedRoute] }]]),
}
const errors = validateOverlayAgainstCatalog(storedOverlay, flakyResolve.routes)
equal('an unreadable ladder does not invalidate a stored effort', errors.length, 0)
const kept = stripIllegalEffort(storedRoute, flakyResolve.routes)
equal('an unreadable ladder keeps the stored effort', kept.reasoningEffort, 'high')

const report = summary('catalog')
console.log(JSON.stringify({ ...report, checks: results }, null, 2))
if (report.failed > 0) process.exitCode = 1