// The compatibility shim: one tool implementation, every harness API shape.
//
// pstack_spawn broke on every harness upgrade because it called one specific
// subagents method. This test drives the deployed tool through each shape the
// shim supports, and proves an unknown shape fails with a message that names
// what the harness does offer.
import { loadDeployed } from './plugin.mjs'
import { check, equal, summary, results } from './assert.mjs'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const { apply } = await loadDeployed('index.js')
const { detectApiShape, startChild, unsupportedApiMessage } = await loadDeployed('subagent-compat.js')

// A throwaway DSH home whose overlay maps two roles at distinct routes.
const home = mkdtempSync(join(tmpdir(), 'pstack-test-'))
writeFileSync(join(home, 'pstack-dsh.json'), JSON.stringify({
  version: 1,
  roles: {
    feature: { inherit: false, routes: [{ provider: 'opencode2dsh', model: 'glm-5.3-flash-free', reasoningEffort: 'max' }] },
    'how-critics': { inherit: false, routes: [{ provider: 'openai-codex', model: 'gpt-6-astra', reasoningEffort: 'medium' }] },
    'bug-fix': { inherit: true, routes: [] },
  },
}))

function mountWith(subagents) {
  const registered = new Map()
  // The tool resolves DSH_HOME at execute time, not at mount time, so this
  // override has to stay in place for the whole file.
  process.env.DSH_HOME = home
  const ctx = {
    get(name) {
      if (name === 'subagents') return subagents
      if (name === 'llm') {
        return {
          listProviders: () => [{ id: 'opencode2dsh', name: 'OpenCode Zen' }, { id: 'openai-codex', name: 'OpenAI Codex' }],
          listConfigurableProviders: () => [],
          listModels: async (provider) => provider === 'opencode2dsh'
            ? [{ id: 'glm-5.3-flash-free', name: 'GLM 5.3 Flash Free' }]
            : [{ id: 'gpt-6-astra', name: 'GPT-6 Astra' }],
          resolveModelInfo: async (_p, model) => ({ id: model, name: model, reasoning: { efforts: [{ id: 'max', name: 'Max' }, { id: 'medium', name: 'Medium' }] } }),
        }
      }
      if (name === 'credentials') return { describe: async () => ({ configured: true }), listRecords: async () => [] }
      return undefined
    },
    tools: { register(tool) { registered.set(tool.name, tool) } },
    skills: { registerProvider() {} },
    inject() {},
    on() {},
    effect() {},
    llm: undefined,
  }
  apply(ctx, {})
  return registered
}

// --- shape detection -------------------------------------------------------
equal('detects start', detectApiShape({ start: async () => ({}) }), 'start')
equal('detects startContinuable', detectApiShape({ startContinuable: async () => ({}) }), 'startContinuable')
equal('detects startOneShot', detectApiShape({ startOneShot: async () => ({}) }), 'startOneShot')
equal('no method is none', detectApiShape({ getProvider: () => undefined }), 'none')
equal('absent service is none', detectApiShape(undefined), 'none')
check('unsupported message names the offered functions', unsupportedApiMessage({ getProvider: () => undefined }).includes('getProvider'), unsupportedApiMessage({ getProvider: () => undefined }))

// --- startActivation (current harness) -------------------------------------
{
  let captured
  const subagents = {
    getProvider: () => ({ capabilities: { persona: true } }),
    resolveMaxDepth: () => 3,
    async startActivation(spec) {
      captured = spec
      return { childId: 'child-a', result: Promise.resolve({ output: 'DONE-A', stopReason: 'completed' }), dispose: () => {} }
    },
    async start() { throw new Error('WRONG-API: start') },
  }
  const tools = mountWith(subagents)
  check('pstack_spawn is registered', tools.has('pstack_spawn'), [...tools.keys()].join(','))
  const result = await tools.get('pstack_spawn').execute(
    { description: 'feature work', prompt: 'do it', role: 'feature', run_in_background: false },
    { agent: { id: 'parent-1' }, signal: AbortSignal.timeout(5000) },
  )
  equal('foreground returns the child output', result.output, 'DONE-A')
  equal('foreground reports stop reason', result.stopReason, 'completed')
  equal('mapped route is applied to the child', captured?.request?.agentOptions?.provider, 'opencode2dsh')
  equal('mapped model is applied to the child', captured?.request?.agentOptions?.model, 'glm-5.3-flash-free')
  equal('max depth is forwarded', captured?.request?.maxDepth, 3)
  equal('delivery is parent', captured?.delivery, 'parent')
}

// --- start (older harness) -------------------------------------------------
{
  let captured
  const subagents = {
    getProvider: () => ({ capabilities: { persona: true } }),
    async start(spec) {
      captured = spec
      return { runId: 'run-b', result: Promise.resolve({ output: 'DONE-B', stopReason: 'completed' }) }
    },
  }
  const tools = mountWith(subagents)
  const result = await tools.get('pstack_spawn').execute(
    { description: 'feature work', prompt: 'do it', role: 'feature', run_in_background: false },
    { agent: { id: 'parent-2' }, signal: AbortSignal.timeout(5000) },
  )
  equal('start shape returns output', result.output, 'DONE-B')
  equal('start shape uses runId as the id', result.runId, 'run-b')
  equal('start shape still applies the route', captured?.request?.agentOptions?.model, 'glm-5.3-flash-free')
}

// --- startContinuable (background-only harness) ----------------------------
{
  let captured
  const subagents = {
    getProvider: () => ({ capabilities: {} }),
    async startContinuable(spec) {
      captured = spec
      return { childId: 'child-c' }
    },
  }
  const tools = mountWith(subagents)
  const result = await tools.get('pstack_spawn').execute(
    { description: 'feature work', prompt: 'do it', role: 'feature' },
    { agent: { id: 'parent-3' }, signal: AbortSignal.timeout(5000) },
  )
  equal('continuable shape returns a subagent id', result.subagentId, 'child-c')
  equal('continuable shape reports kind', result.kind, 'continuable')
  equal('continuable shape applies the route', captured?.request?.agentOptions?.provider, 'opencode2dsh')
}

// --- startOneShot (oldest harness) -----------------------------------------
{
  const subagents = {
    getProvider: () => ({ capabilities: {} }),
    async startOneShot() { return { output: 'DONE-D', stopReason: 'completed', runId: 'run-d' } },
  }
  const tools = mountWith(subagents)
  const result = await tools.get('pstack_spawn').execute(
    { description: 'feature work', prompt: 'do it', role: 'feature', run_in_background: false },
    { agent: { id: 'parent-4' }, signal: AbortSignal.timeout(5000) },
  )
  equal('one-shot shape returns output', result.output, 'DONE-D')
}

// --- unmapped role inherits ------------------------------------------------
{
  let captured
  const subagents = {
    getProvider: () => ({ capabilities: {} }),
    async startActivation(spec) { captured = spec; return { childId: 'child-e', result: Promise.resolve({ output: 'X' }) } },
  }
  const tools = mountWith(subagents)
  const result = await tools.get('pstack_spawn').execute(
    { description: 'design', prompt: 'design it', role: 'bug-fix', run_in_background: false },
    { agent: { id: 'parent-5' }, signal: AbortSignal.timeout(5000) },
  )
  equal('unmapped role inherits the parent', result.inherit, true)
  equal('unmapped role sends no agentOptions', captured?.request?.agentOptions, undefined)
}

// --- unknown shape fails loudly -------------------------------------------
{
  const tools = mountWith({ getProvider: () => ({ capabilities: {} }) })
  let message = ''
  try {
    await tools.get('pstack_spawn').execute(
      { description: 'x', prompt: 'y', role: 'feature', run_in_background: false },
      { agent: { id: 'parent-6' }, signal: AbortSignal.timeout(5000) },
    )
  } catch (error) {
    message = String(error && error.message || error)
  }
  check('an unsupported harness refuses to spawn', message.includes('no supported subagent start method'), message.split('\n')[0])
}

rmSync(home, { recursive: true, force: true })

const report = summary('spawn')
console.log(JSON.stringify({ ...report, checks: results }, null, 2))
if (report.failed > 0) process.exitCode = 1
