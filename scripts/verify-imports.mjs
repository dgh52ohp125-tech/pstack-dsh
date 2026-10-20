// verify-imports.mjs — the import check that cannot run from this repo.
//
// Every plugin module imports bare `@deepseek-ai/*` packages, which resolve only
// from inside the DSH profile's node_modules. This script therefore loads the
// DEPLOYED tree, module by module, and reports the first failing import.
//
//   node scripts/verify-imports.mjs

import { pathToFileURL } from 'node:url'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const target = process.env.PROFILE_PLUGIN
  ?? join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'pstack-dsh')
const libDir = join(target, 'lib')

if (!existsSync(libDir)) {
  console.error(`verify-imports: deployed lib/ not found at ${libDir}`)
  process.exit(1)
}

const modules = readdirSync(libDir)
  .filter(name => name.endsWith('.js') && name !== 'client.js' && !name.startsWith('client.'))
  .sort()

const loaded = []
const failed = []
for (const name of modules) {
  try {
    const mod = await import(pathToFileURL(join(libDir, name)).href)
    loaded.push({ module: name, exports: Object.keys(mod).length })
  } catch (error) {
    failed.push({ module: name, error: String(error && error.message || error).split('\n')[0] })
  }
}

// The entry point must expose the plugin contract the host calls.
const entry = join(libDir, 'index.js')
let contract = {}
if (existsSync(entry)) {
  const mod = await import(pathToFileURL(entry).href)
  contract = {
    hasApply: typeof mod.apply === 'function',
    hasName: typeof mod.name === 'string' || typeof mod.default?.name === 'string',
    exports: Object.keys(mod),
  }
}

const report = {
  target,
  modulesLoaded: loaded.length,
  modulesFailed: failed.length,
  failed,
  contract,
}
console.log(JSON.stringify(report, null, 2))
if (failed.length > 0) process.exitCode = 1
