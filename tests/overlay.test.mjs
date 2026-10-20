// Saving must never erase role mappings because the catalog happened to read empty.
//
// Regression this guards: with an empty catalog, `dropUnselectableRoles` reset
// every role in the rendered draft, so pressing Save wrote an all-inherit overlay
// over a good file. 24 mappings were destroyed that way.
import { loadDeployed } from './plugin.mjs'
import { check, equal, summary, results } from './assert.mjs'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { loadSettingsSnapshot, saveSettingsOverlay } = await loadDeployed('settings-api.js')

const MAPPED = {
  version: 1,
  roles: {
    feature: { inherit: false, routes: [{ provider: 'opencode2dsh', model: 'glm-5.3-flash-free', reasoningEffort: 'max' }] },
    'poteto-agent': { inherit: false, routes: [{ provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: 'high' }] },
    'bug-fix': { inherit: true, routes: [] },
  },
}

function harness(home, options = {}) {
  const live = options.live !== false
  return {
    llm: live
      ? {
        listProviders: () => [{ id: 'opencode2dsh', name: 'OpenCode' }, { id: 'openai-codex', name: 'Codex' }],
        listConfigurableProviders: () => [],
        listModels: async (provider) => provider === 'opencode2dsh'
          ? [{ id: 'glm-5.3-flash-free', name: 'GLM' }]
          : [{ id: 'gpt-6-astra', name: 'Astra' }],
        resolveModelInfo: async (_p, model) => ({ id: model, name: model, reasoning: { efforts: [{ id: 'max', name: 'Max' }, { id: 'high', name: 'High' }] } }),
      }
      : {
        listProviders: () => [],
        listConfigurableProviders: () => [],
        listModels: async () => [],
        resolveModelInfo: async () => { throw new Error('none') },
      },
    credentials: { describe: async () => ({ configured: true }), listRecords: async () => [] },
    settings: { describe: () => [] },
    dshHome: home,
    env: {},
  }
}

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'pstack-overlay-'))
  writeFileSync(join(home, 'pstack-dsh.json'), JSON.stringify(MAPPED, null, 2))
  return home
}

function mappedRoles(overlay) {
  return Object.entries(overlay.roles).filter(([role, value]) => role !== 'how-critics' && !value.inherit && value.routes.length > 0)
}

// --- snapshot with a live catalog: mappings survive, dropped list is empty --
{
  const home = fixture()
  const snapshot = await loadSettingsSnapshot(harness(home))
  equal('live catalog: both mappings survive', mappedRoles(snapshot.overlay).length, 2)
  equal('live catalog: nothing is reported dropped', snapshot.droppedRoles.length, 0)
  equal('live catalog: catalog is not empty', snapshot.catalogEmpty, false)
  rmSync(home, { recursive: true, force: true })
}

// --- snapshot with an empty catalog: file is shown untouched ---------------
{
  const home = fixture()
  const snapshot = await loadSettingsSnapshot(harness(home, { live: false }))
  equal('empty catalog: catalogEmpty is flagged', snapshot.catalogEmpty, true)
  equal('empty catalog: mappings are shown as stored', mappedRoles(snapshot.overlay).length, 2)
  equal('empty catalog: nothing is reported dropped', snapshot.droppedRoles.length, 0)
  equal('empty catalog: catalog has no routes', snapshot.catalog.selectableCount, 0)
  rmSync(home, { recursive: true, force: true })
}

// --- a save that would erase every mapping is refused ----------------------
{
  const home = fixture()
  const before = readFileSync(join(home, 'pstack-dsh.json'), 'utf8')
  const emptied = { version: 1, roles: { feature: { inherit: true, routes: [] }, 'poteto-agent': { inherit: true, routes: [] } } }
  let refused = ''
  try {
    await saveSettingsOverlay(harness(home, { live: false }), emptied)
  } catch (error) {
    refused = String(error && error.message || error)
  }
  check('an empty catalog refuses to wipe mappings', refused.includes('refusing to save'), refused.split('\n')[0])
  equal('the overlay file is untouched after refusal', readFileSync(join(home, 'pstack-dsh.json'), 'utf8'), before)
  rmSync(home, { recursive: true, force: true })
}

// --- a deliberate save with a live catalog writes normally ----------------
{
  const home = fixture()
  const result = await saveSettingsOverlay(harness(home), MAPPED)
  check('a live-catalog save writes the file', existsSync(result.path), result.path)
  equal('a live-catalog save keeps both mappings', mappedRoles(result.overlay).length, 2)
  rmSync(home, { recursive: true, force: true })
}

// --- a stale route is still reported when the catalog is live -------------
{
  const home = mkdtempSync(join(tmpdir(), 'pstack-overlay-'))
  writeFileSync(join(home, 'pstack-dsh.json'), JSON.stringify({
    version: 1,
    roles: { feature: { inherit: false, routes: [{ provider: 'gone-provider', model: 'gone-model' }] } },
  }, null, 2))
  const snapshot = await loadSettingsSnapshot(harness(home))
  equal('a genuinely stale route is still dropped', mappedRoles(snapshot.overlay).length, 0)
  check('a genuinely stale role is reported', snapshot.droppedRoles.includes('feature'), snapshot.droppedRoles.join(','))
  rmSync(home, { recursive: true, force: true })
}

const report = summary('overlay')
console.log(JSON.stringify({ ...report, checks: results }, null, 2))
if (report.failed > 0) process.exitCode = 1
