import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadDeployed } from './plugin.mjs'

const home = mkdtempSync(join(tmpdir(), 'pstack-dbg-'))
writeFileSync(join(home, 'pstack-dsh.json'), JSON.stringify({
  version: 1,
  roles: {
    feature: { inherit: false, routes: [{ provider: 'opencode2dsh', model: 'glm-5.3-flash-free', reasoningEffort: 'max' }] },
    'bug-fix': { inherit: true, routes: [] },
  },
}))

process.env.DSH_HOME = home

const overlay = await loadDeployed('overlay.js')
const spawn = await loadDeployed('spawn.js')

const read = await overlay.readOverlay(home)
console.log('home:', home)
console.log('bug-fix assignment:', JSON.stringify(read.overlay.roles['bug-fix']))
console.log('how-critics assignment:', JSON.stringify(read.overlay.roles['how-critics']))
console.log('resolved bug-fix:', JSON.stringify(spawn.resolveSpawn(read.overlay, {
  role: 'bug-fix', description: 'd', prompt: 'p', runInBackground: false,
})))
