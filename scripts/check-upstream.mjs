#!/usr/bin/env node
// check-upstream.mjs — has the pstack prose moved since this fork synced it?
//
//   node scripts/check-upstream.mjs           # human answer, exit 0/1
//   node scripts/check-upstream.mjs --json    # machine answer, always exit 0
//
// Exit codes: 0 = current, 1 = behind (a sync is due), 2 = could not check.
// "Could not check" is deliberately distinct from "behind": a network failure
// must never look like an upstream release in a scheduled job.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERSION_URL, describeDrift } from './upstream.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pin = JSON.parse(readFileSync(join(root, 'upstream.json'), 'utf8'))
const asJson = process.argv.includes('--json')

async function liveVersion() {
  const response = await fetch(VERSION_URL, { headers: { 'user-agent': 'pstack-dsh-upstream-check' } })
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${VERSION_URL}`)
  const manifest = await response.json()
  if (typeof manifest.version !== 'string') throw new Error('upstream plugin.json has no version field')
  return manifest.version
}

let report
try {
  report = describeDrift(pin.version, await liveVersion())
} catch (error) {
  report = { status: 'unknown', pinned: pin.version, live: null, message: `could not check: ${error.message}` }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = 0
} else if (report.status === 'current') {
  console.log(report.message)
} else if (report.status === 'behind') {
  console.log(report.message)
  console.log('')
  console.log('Next: clone cursor/plugins, then')
  console.log(`  python sync-skills.py --upstream <dir>/${pin.path}/skills --dest skills`)
  console.log('A non-zero exit names every override whose prose moved. Update those by hand,')
  console.log(`then set "version" in upstream.json to ${report.live} and fix the README line.`)
} else {
  console.error(report.message)
}

if (!asJson) {
  process.exitCode = report.status === 'current' ? 0 : report.status === 'behind' ? 1 : 2
}
