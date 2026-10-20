/** Same-origin Settings snapshot/save. Overlay file is `$DSH_HOME/pstack-dsh.json`. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { CatalogHost } from './catalog.ts'
import { SETTINGS_SAVE_PATH, SETTINGS_SNAPSHOT_PATH } from './ids.ts'
import { json, readJson, trustedRequest } from './http-trust.ts'
import { loadSettingsSnapshot, saveSettingsOverlay } from './settings-api.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function handleSnapshot(host: CatalogHost, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'method not allowed' })
    return
  }
  json(res, 200, await loadSettingsSnapshot(host))
}

async function handleSave(host: CatalogHost, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'PUT' && req.method !== 'POST') {
    json(res, 405, { error: 'method not allowed' })
    return
  }
  try {
    const body = await readJson(req)
    const overlay = isRecord(body) && 'overlay' in body ? body.overlay : body
    const saved = await saveSettingsOverlay(host, overlay)
    json(res, 200, saved)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'save failed'
    const errors = error instanceof Error && 'errors' in error && Array.isArray(error.errors)
      ? error.errors as string[]
      : undefined
    json(res, 400, { error: message, ...errors === undefined ? {} : { errors } })
  }
}

export function registerPstackSettingsRoutes(ctx: Context, host: CatalogHost): void {
  const webServer = ctx.webServer
  if (webServer === undefined) return
  ctx.effect(() => {
    const routes = [
      webServer.register({
        kind: 'exact',
        path: SETTINGS_SNAPSHOT_PATH,
        handler: async (req, res) => {
          const rejection = ctx.connection.requestRejection(req)
          if (rejection !== undefined) {
            json(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
            return
          }
          if (!trustedRequest(req)) {
            json(res, 403, { error: 'forbidden' })
            return
          }
          if (req.method === 'GET') {
            await handleSnapshot(host, req, res)
            return
          }
          await handleSave(host, req, res)
        },
      }),
    ]
    return () => {
      for (const dispose of routes) dispose()
    }
  }, 'pstack-dsh: Settings overlay routes')
}

export const SETTINGS_HTTP = {
  snapshot: SETTINGS_SNAPSHOT_PATH,
  save: SETTINGS_SAVE_PATH,
} as const
