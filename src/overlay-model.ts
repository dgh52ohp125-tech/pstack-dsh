import { ALL_ROLES, isPanelRole, isPstackRole, type PstackRole } from './roles.ts'
import type { LiveRoute } from './catalog-types.ts'

export const OVERLAY_VERSION = 1 as const

export interface OverlayRoute {
  readonly provider: string
  readonly model: string
  /** Adapter-owned effort id for this exact route. Omit when the route has no effort field. */
  readonly reasoningEffort?: string
}

export interface OverlayRole {
  /** Child inherits the parent conversation route and effort. */
  readonly inherit: boolean
  /** One spawn per entry. Empty when inherit is true. */
  readonly routes: OverlayRoute[]
}

export interface Overlay {
  readonly version: typeof OVERLAY_VERSION
  readonly roles: Record<string, OverlayRole>
}

export function emptyOverlay(): Overlay {
  const roles: Record<string, OverlayRole> = {}
  for (const role of ALL_ROLES) {
    roles[role] = { inherit: true, routes: [] }
  }
  return { version: OVERLAY_VERSION, roles }
}

export function routeKey(provider: string, model: string): string {
  return `${provider}::${model}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRoute(raw: unknown, path: string): OverlayRoute {
  if (!isRecord(raw)) throw new Error(`${path} must be an object`)
  const provider = raw.provider
  const model = raw.model
  if (typeof provider !== 'string' || provider.length === 0) {
    throw new Error(`${path}.provider must be a non-empty string`)
  }
  if (typeof model !== 'string' || model.length === 0) {
    throw new Error(`${path}.model must be a non-empty string`)
  }
  const effort = raw.reasoningEffort
  if (effort !== undefined && (typeof effort !== 'string' || effort.length === 0)) {
    throw new Error(`${path}.reasoningEffort must be a non-empty string when set`)
  }
  const extra = Object.keys(raw).filter(key => key !== 'provider' && key !== 'model' && key !== 'reasoningEffort')
  if (extra.length > 0) throw new Error(`${path} has unknown fields: ${extra.join(', ')}`)
  return effort === undefined
    ? { provider, model }
    : { provider, model, reasoningEffort: effort }
}

function parseRole(raw: unknown, role: string): OverlayRole {
  if (!isRecord(raw)) throw new Error(`roles.${role} must be an object`)
  const extra = Object.keys(raw).filter(key => key !== 'inherit' && key !== 'routes')
  if (extra.length > 0) throw new Error(`roles.${role} has unknown fields: ${extra.join(', ')}`)
  const inherit = raw.inherit === true
    || raw.inherit === 'true'
    || raw.inherit === 'inherit-parent'
    || raw.inherit === 'auto'
  const routesRaw = raw.routes
  const routes = Array.isArray(routesRaw)
    ? routesRaw.map((entry, index) => parseRoute(entry, `roles.${role}.routes[${index}]`))
    : []
  if (inherit) return { inherit: true, routes: [] }
  if (routes.length === 0) return { inherit: true, routes: [] }
  if (!isPanelRole(role) && routes.length !== 1) {
    throw new Error(`roles.${role} is a scalar role and may have at most one route`)
  }
  return { inherit: false, routes }
}

export function parseOverlay(text: string): Overlay {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new Error('pstack-dsh overlay is not valid JSON')
  }
  if (!isRecord(value)) throw new Error('pstack-dsh overlay must be an object')
  if (value.version !== OVERLAY_VERSION) {
    throw new Error(`pstack-dsh overlay version ${String(value.version)} is unsupported`)
  }
  const extra = Object.keys(value).filter(key => key !== 'version' && key !== 'roles')
  if (extra.length > 0) throw new Error(`pstack-dsh overlay has unknown fields: ${extra.join(', ')}`)
  const rolesRaw = value.roles
  if (!isRecord(rolesRaw)) throw new Error('pstack-dsh overlay.roles must be an object')
  const roles: Record<string, OverlayRole> = {}
  for (const role of ALL_ROLES) {
    const entry = rolesRaw[role]
    roles[role] = entry === undefined ? { inherit: true, routes: [] } : parseRole(entry, role)
  }
  for (const key of Object.keys(rolesRaw)) {
    if (!isPstackRole(key)) throw new Error(`unknown pstack role "${key}"`)
  }
  return { version: OVERLAY_VERSION, roles }
}

export function validateOverlayAgainstCatalog(overlay: Overlay, routes: readonly LiveRoute[]): string[] {
  const errors: string[] = []
  const live = new Map(routes.filter(route => route.selectable).map(route => [routeKey(route.provider, route.model), route]))
  for (const role of ALL_ROLES) {
    if (role === 'how-critics') continue
    const assignment = overlay.roles[role] ?? { inherit: true, routes: [] }
    if (assignment.inherit) continue
    for (const [index, entry] of assignment.routes.entries()) {
      const found = live.get(routeKey(entry.provider, entry.model))
      if (found === undefined) {
        errors.push(`${role}[${index}]: ${entry.provider}/${entry.model} is not a logged-in live route`)
        continue
      }
      if (entry.reasoningEffort === undefined) continue
      // An unreadable ladder is not an empty one. Rejecting here would delete a
      // correct stored effort because a provider plugin failed to report its
      // capabilities, which is the provider's bug to fix, not the user's.
      if (found.effortsUnavailable !== undefined) continue
      if (found.efforts.length === 0) {
        errors.push(`${role}[${index}]: ${entry.provider}/${entry.model} has no effort field; omit reasoningEffort`)
        continue
      }
      if (!found.efforts.some(effort => effort.id === entry.reasoningEffort)) {
        errors.push(
          `${role}[${index}]: effort "${entry.reasoningEffort}" is not accepted by ${entry.provider}/${entry.model} (live: ${found.efforts.map(effort => effort.id).join(', ')})`,
        )
      }
    }
  }
  return errors
}

export function resolveRole(overlay: Overlay, role: string): OverlayRole {
  const key = role as PstackRole
  return overlay.roles[key] ?? { inherit: true, routes: [] }
}
