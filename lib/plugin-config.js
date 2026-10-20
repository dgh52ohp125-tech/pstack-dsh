/**
 * Standard Schema v1 Config. Loader validates before apply.
 * Avoids a hard schemastery import so the package still typechecks without DSH.
 */

                         
                                                            
                        
 

export const Config = {
  '~standard': {
    version: 1         ,
    vendor: 'pstack-dsh',
    validate(value         ) {
      if (value === undefined || value === null) {
        return { value: { spawnProvider: 'spawn' } }
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        return { issues: [{ message: 'config must be an object' }] }
      }
      const spawnProvider = (value                               ).spawnProvider
      if (spawnProvider !== undefined && (typeof spawnProvider !== 'string' || spawnProvider.length === 0)) {
        return { issues: [{ message: 'spawnProvider must be a non-empty string' }] }
      }
      return { value: { spawnProvider: spawnProvider ?? 'spawn' } }
    },
  },
}


//# sourceURL=plugin-config.ts