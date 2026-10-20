// The real overlay, against the real machine.
//
// Consolidates the three scripts that used to live in `pstack-verify/` and be run
// by hand:
//   verify-efforts.mjs     — every assigned effort id exists on its provider's
//                            real effort ladder
//   verify-spawn.mjs       — a foreground spawn applies the stored route
//   verify-background.mjs  — a background spawn returns a continuable handle
//                            with the stored route applied
//
// The difference from `spawn.test.mjs`: that one uses a fixture overlay to prove
// the plumbing. This one reads `$DSH_HOME/pstack-dsh.json` exactly as it stands,
// so it fails when a real role is mapped to a route or an effort this machine
// cannot serve — the failure a user would otherwise discover by spawning.
//
// The effort ladder is read from the same provider data the adapters read,
// because the codex adapter throws on resolveModelInfo (see catalog.test.mjs):
// its ladder cannot come from the adapter, and pretending otherwise would make
// this check vacuous.
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { deployedPath } from './plugin.mjs'
import { check, equal, summary, results } from './assert.mjs'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const overlayPath = join(dshHome, 'pstack-dsh.json')

if (!existsSync(overlayPath)) {
  check('a real overlay file exists', false, `no ${overlayPath}; nothing to verify against`)
  const report = summary('live')
  console.log(JSON.stringify({ ...report, checks: results }, null, 2))
  process.exitCode = 1
} else {
  const { readOverlay } = await import(deployedPath('overlay.js'))
  const stored = await readOverlay(dshHome)
  const overlay = stored.overlay

  // Every mapped route, flattened. Inherit roles carry no route, by design.
  const mapped = []
  for (const [role, assignment] of Object.entries(overlay.roles)) {
    if (assignment.inherit === true) continue
    for (const route of assignment.routes) mapped.push({ role, ...route })
  }

  check('the real overlay maps at least one role', mapped.length > 0, `${mapped.length} mapped route(s) across ${Object.keys(overlay.roles).length} role(s)`)
  const unnamed = mapped.filter(entry => typeof entry.provider !== 'string' || entry.provider === '' || typeof entry.model !== 'string' || entry.model === '')
  equal('every mapped route names a provider and a model', unnamed.length, 0, unnamed.map(entry => entry.role).join(' '))

  // --- effort ids against the provider data this machine ships -------------
  const zenPath = join(homedir(), '.opencode2dsh', 'agent-config.json.models.dev.json')
  const codexPath = join(dshHome, 'profiles', 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'providers', 'data', 'openai-codex.json')

  const zenEfforts = (() => {
    if (!existsSync(zenPath)) return undefined
    const zen = JSON.parse(readFileSync(zenPath, 'utf8'))
    const prices = new Map((zen.prices ?? []).map(([id, value]) => [id, value]))
    const LADDER = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    const DEFAULT_LADDER = ['off', 'minimal', 'low', 'medium', 'high']
    return (model) => {
      const price = prices.get(model)
      if (price === undefined || price.reasoning !== true) return undefined
      const declared = []
      for (const value of price.effortValues ?? []) {
        const level = value === 'none' ? 'off' : value
        if (LADDER.includes(level) && !declared.includes(level)) declared.push(level)
      }
      return declared.length > 0 ? declared : DEFAULT_LADDER
    }
  })()

  const codexEfforts = (() => {
    if (!existsSync(codexPath)) return undefined
    const data = JSON.parse(readFileSync(codexPath, 'utf8'))
    const EXTENDED = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    return (model) => {
      const entry = data['openai-codex-responses']?.[`chat:${model}`]
      if (entry === undefined) return { error: `model ${model} is not in the openai-codex provider data` }
      if (entry.reasoning !== true) return ['off']
      return EXTENDED.filter((level) => {
        const value = entry.thinkingLevelMap?.[level]
        if (value === null) return false
        if (level === 'xhigh' || level === 'max') return value !== undefined
        return true
      })
    }
  })()

  if (zenEfforts === undefined || codexEfforts === undefined) {
    check('provider effort data is available', false, `missing ${zenEfforts === undefined ? zenPath : codexPath}`)
  } else {
    const wrong = []
    const unverifiable = []
    for (const entry of mapped) {
      if (entry.reasoningEffort === undefined) continue
      const ladder = entry.provider === 'opencode2dsh'
        ? zenEfforts(entry.model)
        : entry.provider === 'openai-codex'
          ? codexEfforts(entry.model)
          : null
      if (ladder === null) { unverifiable.push(`${entry.role}:${entry.provider}`); continue }
      if (ladder === undefined) {
        wrong.push(`${entry.role}: ${entry.provider}/${entry.model} has no reasoning capability but asks for "${entry.reasoningEffort}"`)
        continue
      }
      if (!Array.isArray(ladder)) { wrong.push(`${entry.role}: ${ladder.error}`); continue }
      if (!ladder.includes(entry.reasoningEffort)) {
        wrong.push(`${entry.role}: "${entry.reasoningEffort}" is not on ${entry.provider}/${entry.model} (has ${ladder.join('/')})`)
      }
    }
    equal('every assigned effort id is on its real provider ladder', wrong.length, 0, wrong.join('; '))
    equal('every mapped provider is one this check can validate', unverifiable.length, 0, unverifiable.join(' '))
  }

  // --- the stored route reaches the child, in both spawn modes -------------
  const deployed = await import(deployedPath('index.js'))

  const registered = new Map()
  let captured
  const fakeSubagents = {
    getProvider: (name) => ({
      name,
      capabilities: { persona: true, agentOptions: true, depthLimit: true, workerHandoff: true },
      prepareContinuable: async () => ({}),
    }),
    resolveMaxDepth: () => 3,
    startActivation: async (spec) => {
      captured = spec
      return { childId: 'child-live', result: Promise.resolve({ output: 'LIVE-OK', stopReason: 'completed' }), dispose: () => {} }
    },
    // Present so a regression back to an older API would be visible rather than
    // silently working.
    start: async () => { throw new Error('OLD-API-CALLED: subagents.start') },
    startContinuable: async () => { throw new Error('OLD-API-CALLED: subagents.startContinuable') },
    startOneShot: async () => { throw new Error('OLD-API-CALLED: subagents.startOneShot') },
  }

  // The plugin applies the effort on the `agent/request` waterfall, keyed by the
  // child id it remembered — not on `agentOptions`. Capture that handler so the
  // effort channel is checked where it actually lives.
  const handlers = new Map()
  const fakeCtx = {
    get: (name) => (name === 'subagents' ? fakeSubagents : undefined),
    tools: { register: (tool) => registered.set(tool.name, tool) },
    skills: { registerProvider: () => {} },
    inject: () => {},
    on: (event, handler) => { handlers.set(event, handler) },
    effect: () => {},
  }

  await deployed.apply(fakeCtx, {})
  const spawn = registered.get('pstack_spawn')
  check('the deployed plugin registers pstack_spawn', spawn !== undefined, [...registered.keys()].join(', '))
  check('the deployed plugin listens on the request waterfall', handlers.has('agent/request'), [...handlers.keys()].join(', '))

  // Resolve the effort the child would actually receive: run the plugin's own
  // `agent/request` handler for the child id the spawn returned.
  const effortFor = async (childId) => {
    const handler = handlers.get('agent/request')
    if (handler === undefined) return undefined
    const base = { provider: 'unchanged', model: 'unchanged' }
    const applied = await handler({ agent: { id: childId } }, async () => base)
    return applied?.reasoningEffort
  }

  if (spawn !== undefined && mapped.length > 0) {
    // Foreground: any mapped role with no effort, or just the first one.
    const foreground = mapped.find(entry => entry.reasoningEffort === undefined) ?? mapped[0]
    const result = await spawn.execute(
      { description: 'live route', prompt: 'say LIVE-OK', role: foreground.role, run_in_background: false },
      { agent: { id: 'parent-live' }, signal: AbortSignal.timeout(15000) },
    )
    equal('a foreground spawn completes', result?.output, 'LIVE-OK')
    equal('the foreground child gets the stored provider', captured?.request?.agentOptions?.provider, foreground.provider)
    equal('the foreground child gets the stored model', captured?.request?.agentOptions?.model, foreground.model)
    if (foreground.reasoningEffort !== undefined) {
      equal('the foreground child gets the stored effort', await effortFor('child-live'), foreground.reasoningEffort)
    }

    // Background: prefer a different role than the foreground one, so the two
    // checks cannot pass on the same route by accident.
    const background = mapped.find(entry => entry.role !== foreground.role) ?? foreground
    captured = undefined
    const handle = await spawn.execute(
      { description: 'live background route', prompt: 'wait', role: background.role, run_in_background: true },
      { agent: { id: 'parent-live' }, signal: AbortSignal.timeout(15000) },
    )
    equal('a background spawn returns a continuable handle', handle?.kind, 'continuable')
    equal('the background child gets the stored provider', captured?.request?.agentOptions?.provider, background.provider)
    equal('the background child gets the stored model', captured?.request?.agentOptions?.model, background.model)
    if (background.reasoningEffort !== undefined) {
      equal('the background child gets the stored effort', await effortFor('child-live'), background.reasoningEffort)
    }
  }

  const report = summary('live')
  console.log(JSON.stringify({ ...report, checks: results }, null, 2))
  if (report.failed > 0) process.exitCode = 1
}
