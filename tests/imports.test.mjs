// 1. Every deployed module imports cleanly inside the profile.
// 2. The entry point exposes the plugin contract the host calls.
// 3. No source module still carries a type-only import that survived stripping.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { pluginDir } from './plugin.mjs'
import { check, equal, summary, results } from './assert.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const libDir = join(pluginDir, 'lib')
const modules = existsSync(libDir)
  ? readdirSync(libDir).filter(name => name.endsWith('.js') && name !== 'client.js' && !name.startsWith('client.')).sort()
  : []

equal('deployed lib exists', existsSync(libDir), true)
check('deployed lib holds modules', modules.length > 0, `${modules.length} modules`)

const failed = []
for (const name of modules) {
  try {
    await import(pathToFileURL(join(libDir, name)).href)
  } catch (error) {
    failed.push({ module: name, error: String(error && error.message || error).split('\n')[0] })
  }
}
equal('every deployed module imports', failed.length, 0)
if (failed.length > 0) check('import failures', false, JSON.stringify(failed))

const entry = await import(pathToFileURL(join(libDir, 'index.js')).href)
equal('entry exports apply', typeof entry.apply, 'function')
// `inject` is the service-dependency list the host reads before apply(), not a function.
check('entry exports inject as a service list', Array.isArray(entry.inject) && entry.inject.includes('tools'), JSON.stringify(entry.inject))
equal('plugin name is pstack-dsh', entry.name, 'pstack-dsh')

// Client bundle is shipped, not rebuilt by this fork — it must still be present.
// Checked in BOTH trees on purpose. The deployed check catches a build that
// deleted it (which happened: the build wiped lib/ and read the bundle from a
// path that no longer existed). The repo check catches the other half: a clone
// ships whatever is committed, so the bundle must be in git or a fresh install
// has no Settings UI even though the local tree looks fine.
check('client bundle preserved in the deployed plugin', existsSync(join(libDir, 'client.js')), 'lib/client.js')
check('client bundle is committed, so a clone has one too', existsSync(join(repoRoot, 'lib', 'client.js')), 'lib/client.js in the repo')

// No emitted module may still import a `.ts` specifier: that only resolves under
// Node's type stripping, never in the host's loader.
const tsSpecifiers = []
for (const name of modules) {
  const text = readFileSync(join(libDir, name), 'utf8')
  for (const match of text.matchAll(/from\s+['"](\.[^'"]+\.ts)['"]/g)) {
    tsSpecifiers.push(`${name} -> ${match[1]}`)
  }
}
equal('no emitted module imports a .ts specifier', tsSpecifiers.length, 0)
if (tsSpecifiers.length > 0) check('ts specifiers found', false, JSON.stringify(tsSpecifiers))

const report = summary('imports')
console.log(JSON.stringify({ ...report, checks: results, modules: modules.length }, null, 2))
if (report.failed > 0) process.exitCode = 1
