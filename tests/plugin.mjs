// Resolve the DEPLOYED plugin, not the repo source.
//
// Every plugin module imports bare `@deepseek-ai/*` packages, which resolve only
// from inside the DSH profile's node_modules. Testing the deployed tree is also
// the honest choice: it is the code the running harness actually loads.

import { join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'

export const pluginDir = process.env.PROFILE_PLUGIN
  ?? join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'pstack-dsh')

export function deployedPath(name) {
  const file = join(pluginDir, 'lib', name)
  if (!existsSync(file)) {
    throw new Error(`deployed module missing: ${file} — run \`node scripts/build.mjs && node scripts/deploy.mjs\``)
  }
  return pathToFileURL(file).href
}

export async function loadDeployed(name) {
  return import(deployedPath(name))
}
