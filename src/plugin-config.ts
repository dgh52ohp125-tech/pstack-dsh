/**
 * Standard Schema v1 Config. Loader validates before apply.
 * Avoids a hard schemastery import so the package still typechecks without DSH.
 */

export interface Config {
  /** In-process subagent provider name. Default `spawn`. */
  spawnProvider?: string
}

export const Config = {
  '~standard': {
    version: 1 as const,
    vendor: 'pstack-dsh',
    validate(value: unknown) {
      if (value === undefined || value === null) {
        return { value: { spawnProvider: 'spawn' } }
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        return { issues: [{ message: 'config must be an object' }] }
      }
      const spawnProvider = (value as { spawnProvider?: unknown }).spawnProvider
      if (spawnProvider !== undefined && (typeof spawnProvider !== 'string' || spawnProvider.length === 0)) {
        return { issues: [{ message: 'spawnProvider must be a non-empty string' }] }
      }
      return { value: { spawnProvider: spawnProvider ?? 'spawn' } }
    },
  },
}
