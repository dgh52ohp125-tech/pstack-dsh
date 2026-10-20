import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { OVERLAY_FILENAME } from './ids.js'
import { resolveDshHome } from './home.js'
import { emptyOverlay, parseOverlay,              } from './overlay-model.js'

export {
  OVERLAY_VERSION,
  emptyOverlay,
  parseOverlay,
  routeKey,
  resolveRole,
  validateOverlayAgainstCatalog,
} from './overlay-model.js'
                                                                            

export function overlayPath(dshHome = resolveDshHome())         {
  return join(dshHome, OVERLAY_FILENAME)
}

export async function readOverlay(dshHome = resolveDshHome())                                                                {
  const path = overlayPath(dshHome)
  try {
    const text = await readFile(path, 'utf8')
    return { path, overlay: parseOverlay(text), missing: false }
  } catch (error) {
    if ((error                         ).code === 'ENOENT') {
      return { path, overlay: emptyOverlay(), missing: true }
    }
    throw error
  }
}

export async function writeOverlay(overlay         , dshHome = resolveDshHome())                  {
  const path = overlayPath(dshHome)
  const body = `${JSON.stringify(overlay, null, 2)}\n`
  await writeFileAtomic(path, body, { mode: 0o600, dirMode: 0o700 })
  return path
}


//# sourceURL=overlay.ts