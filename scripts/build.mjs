// build.mjs — compile the plugin's TypeScript host sources to ESM JavaScript
// using Node's built-in TypeScript support. No dependencies, no network.
//
// Why this works: every source file imports its siblings with an explicit
// `.ts` extension. Stripping types per file and rewriting those specifiers to
// `.js` produces a runnable ESM tree that keeps the plugin's real directory
// inside the profile's node_modules, which is the only place bare
// `@deepseek-ai/*` specifiers resolve from.

import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const srcDir = join(root, 'src')
const outDir = join(root, 'lib')

function rewriteSpecifiers(code) {
  // Relative sibling imports carry `.ts`; the emitted files are `.js`.
  return code.replace(/(from\s+['"])(\.\.?\/[^'"]+?)\.ts(['"])/g, '$1$2.js$3')
}

function buildFile(name) {
  const source = readFileSync(join(srcDir, name), 'utf8')
  const stripped = stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: name })
  return rewriteSpecifiers(stripped)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const sources = readdirSync(srcDir).filter(name => name.endsWith('.ts'))
const failures = []
for (const name of sources) {
  try {
    const code = buildFile(name)
    writeFileSync(join(outDir, name.replace(/\.ts$/, '.js')), code, 'utf8')
  } catch (error) {
    failures.push({ file: name, error: String(error && error.message || error) })
  }
}

// Preserve the shipped client bundle: this fork changes host behaviour only.
const shippedClient = join(root, 'lib.client.js')
if (existsSync(shippedClient)) {
  writeFileSync(join(outDir, 'client.js'), readFileSync(shippedClient))
}

// Re-parse every emitted file through the same TypeScript parser. This proves
// the rewrite produced syntactically valid ESM. Bare `@deepseek-ai/*` imports
// cannot resolve from this repo, so real module loading is checked after deploy
// by `node scripts/verify-imports.mjs`, which runs inside the profile.
const parseFailures = []
for (const name of sources) {
  const out = name.replace(/\.ts$/, '.js')
  try {
    stripTypeScriptTypes(readFileSync(join(outDir, out), 'utf8'), { mode: 'strip', sourceUrl: out })
  } catch (error) {
    parseFailures.push({ file: out, error: String(error && error.message || error).split('\n')[0] })
  }
}

console.log(JSON.stringify({
  built: sources.length,
  failures,
  syntaxChecked: sources.length - parseFailures.length,
  parseFailures,
}, null, 2))

if (failures.length > 0 || parseFailures.length > 0) process.exitCode = 1
