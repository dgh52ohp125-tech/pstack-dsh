import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Official precedence: `$DSH_HOME`, then `~/.dsh`. `packages/util/home-paths/README.md`. */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DSH_HOME?.trim()
  if (fromEnv) return resolve(fromEnv)
  return join(homedir(), '.dsh')
}

export function dshHomeDisplay(env: NodeJS.ProcessEnv = process.env): string {
  return env.DSH_HOME?.trim() ? '$DSH_HOME' : '~/.dsh'
}
