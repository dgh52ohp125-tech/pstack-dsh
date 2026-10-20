                                               
import { buildCatalog } from './catalog.js'
                                                       
import {
  parseOverlay,
  readOverlay,
  validateOverlayAgainstCatalog,
  writeOverlay,
               
} from './overlay.js'
import { resolveDshHome } from './home.js'
import { dropUnselectableRoles } from './settings-draft.js'

                                   
                        
                  
              
                  
                        
     
                                                                         
                                                                             
                                                          
     
                       
 

function mappedRoleCount(overlay         )         {
  let count = 0
  for (const [role, assignment] of Object.entries(overlay.roles)) {
    if (role === 'how-critics') continue
    if (!assignment.inherit && assignment.routes.length > 0) count += 1
  }
  return count
}

/**
 * Load the Settings snapshot.
 *
 * An empty catalog means "pstack could not enumerate this harness", not "every
 * role is stale". Treating the two as the same dropped all 24 saved mappings
 * from the rendered draft, and the next Save wrote that emptied draft back over
 * a perfectly good overlay file. Show the stored overlay unchanged instead, and
 * let the client render its own "no routes" notice.
 */
export async function loadSettingsSnapshot(host             )                            {
  const dshHome = host.dshHome ?? resolveDshHome(host.env)
  const catalog = await buildCatalog({ ...host, dshHome })
  const current = await readOverlay(dshHome)
  const catalogEmpty = catalog.selectableCount === 0
  if (catalogEmpty) {
    return {
      catalog,
      overlay: current.overlay,
      path: current.path,
      missing: current.missing,
      droppedRoles: [],
      catalogEmpty: true,
    }
  }
  const { overlay, droppedRoles } = dropUnselectableRoles(current.overlay, catalog.routes)
  return {
    catalog,
    overlay,
    path: current.path,
    missing: current.missing,
    droppedRoles,
    catalogEmpty: false,
  }
}

/**
 * Write the overlay, refusing a save that would silently erase mappings because
 * the harness could not enumerate its routes at that moment.
 */
export async function saveSettingsOverlay(host             , raw         )                                              {
  const dshHome = host.dshHome ?? resolveDshHome(host.env)
  const overlay = typeof raw === 'string' ? parseOverlay(raw) : parseOverlay(JSON.stringify(raw))
  const catalog = await buildCatalog({ ...host, dshHome })

  if (catalog.selectableCount === 0) {
    const current = await readOverlay(dshHome)
    const before = mappedRoleCount(current.overlay)
    const after = mappedRoleCount(overlay)
    if (before > 0 && after === 0) {
      const error = new Error(
        'refusing to save: this harness reported no runnable routes, so every role would be reset to inherit and '
        + `${String(before)} saved mapping(s) would be erased. The overlay file was left untouched. `
        + 'Reopen Settings once a provider is signed in.',
      )
      ;(error                                ).errors = [error.message]
      throw error
    }
  }

  const errors = validateOverlayAgainstCatalog(overlay, catalog.routes)
  if (errors.length > 0) {
    const error = new Error(`overlay rejected against live catalog:\n${errors.join('\n')}`)
    ;(error                                ).errors = errors
    throw error
  }
  const path = await writeOverlay(overlay, dshHome)
  return { path, overlay }
}


//# sourceURL=settings-api.ts