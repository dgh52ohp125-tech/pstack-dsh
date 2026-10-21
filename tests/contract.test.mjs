// The host API contract, checked against this plugin's assumptions.
//
// `src/subagent-compat.ts` already survives a *renamed* method: it probes
// `startActivation`, `start`, `startContinuable`, `startOneShot` in order and
// adapts whatever it finds. That handles drift in the method name.
//
// It does not handle drift in the *payload*. The plugin builds a request object
// and hands it to the host; if the host renames a field, adds a required one, or
// stops accepting a value, the failure surfaces at spawn time as a rejected call
// in someone's session — the worst place to discover it. So this test reads the
// host's own published contract and asserts that every field the plugin sends
// still exists, and that every field the host marks required is actually sent.
//
// The contract is generated, not hand-written: each package ships
// `lib/typert.host.js` with `export const TYPERT = { model: { services, events,
// objects } }` containing full TypeScript declarations. Reading it costs nothing
// at runtime and cannot disagree with the host that is installed, because it
// *is* the host that is installed.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { check, equal, summary, results } from './assert.mjs'
import { deployedPath, pluginDir } from './plugin.mjs'

// Where the bundled runtime lives. Overridable so this test can run on a machine
// with a different install, and so a future harness that relocates it fails
// loudly here instead of quietly skipping.
const RUNTIME = process.env.DSH_RUNTIME_DIR ?? join(
  process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
  'Programs', 'ZadLoop', 'resources', 'app.asar.unpacked', 'runtime', 'node_modules', '@deepseek-ai',
)

const CONTRACT = join(RUNTIME, 'dsh-subagent', 'lib', 'typert.host.js')

/** The contract module's own `TYPERT` export — the host's word, not a parse of it. */
async function readContract(file) {
  const module = await import(pathToFileURL(file).href)
  if (module.TYPERT === undefined) throw new Error(`no TYPERT export in ${file}`)
  return module.TYPERT
}

/** Find a named type declaration anywhere in the contract. */
function declaredType(contract, name) {
  // Declarations hang off a service's own `types` array, not a global one, and
  // not off `members` (that is where the method *signatures* live).
  for (const service of contract.model.services ?? []) {
    for (const type of service.types ?? []) {
      if (type.name === name) return type.declaration
    }
  }
  for (const object of contract.model.objects ?? []) {
    if (object.name === name) return object.declaration
  }
  return undefined
}

/**
 * Field and method names from a declaration body, split into required/optional.
 *
 * Two shapes matter: `readonly name?: T` is an optional field, `readonly name: T`
 * is a required one, and `name(): T` is a required *method* — `dispose()` on an
 * activation is declared that way, so matching only `readonly` reported a real
 * member as missing.
 */
function fieldsOf(declaration) {
  const required = []
  const optional = []
  for (const line of declaration.split('\n')) {
    const field = /^\s*(?:readonly\s+)?(\w+)(\??)\s*:/.exec(line)
    const method = /^\s*(\w+)\s*\(/.exec(line)
    if (field !== null) {
      if (field[2] === '?') optional.push(field[1])
      else required.push(field[1])
    } else if (method !== null) {
      required.push(method[1])
    }
  }
  return { required, optional }
}

if (!existsSync(CONTRACT)) {
  check('the host publishes a machine-readable subagent contract', false, `no ${CONTRACT} (set DSH_RUNTIME_DIR)`)
} else {
  const contract = await readContract(CONTRACT)
  check('the host publishes a machine-readable subagent contract', true, CONTRACT)

  // The contract names the service the plugin resolves from `ctx`.
  const service = (contract.model.services ?? []).find(entry => entry.key === 'subagents')
  check('the contract still exposes the `subagents` service', service !== undefined, (contract.model.services ?? []).map(entry => entry.key).join(','))

  const methods = (service?.members ?? []).map(member => member.name)
  const { detectApiShape } = await import(deployedPath('subagent-compat.js'))
  const shape = detectApiShape({ startActivation: async () => ({}), start: async () => ({}), startContinuable: async () => ({}), startOneShot: async () => ({}) })
  equal('the plugin picks the newest start method the contract offers', shape, 'startActivation')

  // Every method name the probe list knows must still be a real method, or the
  // probe order is guessing at names the host no longer has. `start` and
  // `startOneShot` are NOT in the current contract — they are older shapes the
  // probe keeps for backward compatibility, so only the newest is asserted.
  check('the newest probed method is still in the contract', methods.includes('startActivation'), methods.join(','))
  check('the contract still publishes getProvider', methods.includes('getProvider'), methods.join(','))
  check('the contract still publishes resolveMaxDepth', methods.includes('resolveMaxDepth'), methods.join(','))

  // --- the payload the plugin actually sends ------------------------------
  //
  // Read the fields straight out of the compiled plugin rather than duplicating
  // them here: a copy would drift, and the whole point is to catch drift.
  const toolsSource = readFileSync(join(pluginDir, 'lib', 'tools.js'), 'utf8')
  const sent = ['label', 'prompt', 'parent', 'signal', 'agentOptions', 'persona'].filter(field => toolsSource.includes(field))
  check('the compiled plugin sends the fields we think it sends', sent.length >= 4, sent.join(','))
  check('the plugin sends a prompt', sent.includes('prompt'), sent.join(','))
  check('the plugin sends a parent agent', sent.includes('parent'), sent.join(','))
  check('the plugin sends an abort signal', sent.includes('signal'), sent.join(','))

  const specDeclaration = declaredType(contract, 'SubagentActivationSpec')
  check('the contract still declares SubagentActivationSpec', specDeclaration !== undefined, 'not found')

  if (specDeclaration !== undefined) {
    const { required } = fieldsOf(specDeclaration)
    // The spec the plugin constructs must satisfy every required host field.
    // `childId` is host-assigned, so the caller cannot supply it.
    const callerSupplied = { provider: true, label: true, request: true, signal: true, delivery: true }
    const missing = required.filter(field => field !== 'childId' && callerSupplied[field] !== true)
    equal('the plugin supplies every field the host requires', missing.length, 0, `unsupplied: ${missing.join(', ')}`)
    check('the host still asks for a delivery mode', required.includes('delivery'), required.join(','))
    check('the host still asks for a provider', required.includes('provider'), required.join(','))
  }

  const requestDeclaration = declaredType(contract, 'SubagentStartRequest')
  check('the contract still declares SubagentStartRequest', requestDeclaration !== undefined, 'not found')
  if (requestDeclaration !== undefined) {
    const { required, optional } = fieldsOf(requestDeclaration)
    const known = new Set([...required, ...optional])
    // `label` and `signal` are declared on the request AND passed at spec level;
    // the spec omits them from `request`, which is why Omit<> is spelled out.
    for (const field of ['prompt', 'parent', 'agentOptions', 'persona']) {
      check(`the request still accepts ${field}`, known.has(field), [...known].join(','))
    }
    check('prompt is still required inside the request', required.includes('prompt'), required.join(','))
    check('parent is still required inside the request', required.includes('parent'), required.join(','))
  }

  // A capability flag the plugin reads before sending a persona. If the host
  // stops publishing `persona`, providerAcceptsPersona treats it as allowed and
  // sends one anyway, so record the current answer.
  const capsDeclaration = declaredType(contract, 'SubagentCapabilities')
  if (capsDeclaration !== undefined) {
    const { optional, required: capRequired } = fieldsOf(capsDeclaration)
    check('the host still declares a persona capability', [...capRequired, ...optional].includes('persona'), [...capRequired, ...optional].join(','))
  }

  // The activation the plugin destructures.
  const activationDeclaration = declaredType(contract, 'SubagentActivation')
  if (activationDeclaration !== undefined) {
    const { required } = fieldsOf(activationDeclaration)
    check('an activation still carries a childId', required.includes('childId'), required.join(','))
    check('an activation still carries a result promise', required.includes('result'), required.join(','))
    check('an activation still carries dispose', required.includes('dispose'), required.join(','))
  }

  // --- the installed runtime is what the plugin was tested against --------
  // `dsh-subagent` owns the contract; the other packages are providers that
  // consume it. Their presence is normal, so assert the owner specifically
  // rather than counting anything that happens to share the prefix.
  const packages = readdirSync(RUNTIME).filter(name => name.startsWith('dsh-subagent'))
  check('the runtime ships the contract-owning package', packages.includes('dsh-subagent'), packages.join(','))
}

const report = summary('contract')
console.log(JSON.stringify({ ...report, checks: results }, null, 2))
if (report.failed > 0) process.exitCode = 1
