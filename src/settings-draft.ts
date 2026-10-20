import { ALL_ROLES, isPanelRole, type PstackRole } from './roles.ts'
import type { LiveRoute } from './catalog-types.ts'
import {
  emptyOverlay,
  routeKey,
  type Overlay,
  type OverlayRoute,
} from './overlay-model.ts'

export type InheritChoice = 'inherit-parent' | 'auto'

export interface RoleDraft {
  readonly role: PstackRole
  readonly panel: boolean
  inherit: boolean
  inheritChoice: InheritChoice
  routes: OverlayRoute[]
}

export function selectableRoutes(routes: readonly LiveRoute[]): LiveRoute[] {
  return routes.filter(route => route.selectable)
}

export function overlayToDraft(overlay: Overlay): RoleDraft[] {
  return ALL_ROLES.map(role => {
    const assignment = overlay.roles[role] ?? { inherit: true, routes: [] }
    const inherit = assignment.inherit || assignment.routes.length === 0
    return {
      role,
      panel: isPanelRole(role),
      inherit,
      inheritChoice: 'inherit-parent' as InheritChoice,
      routes: inherit ? [] : assignment.routes.map(route => ({ ...route })),
    }
  })
}

export function draftToOverlay(drafts: readonly RoleDraft[]): Overlay {
  const overlay = emptyOverlay()
  for (const draft of drafts) {
    if (draft.inherit || draft.routes.length === 0) {
      overlay.roles[draft.role] = { inherit: true, routes: [] }
      continue
    }
    overlay.roles[draft.role] = {
      inherit: false,
      routes: draft.panel ? draft.routes.map(route => ({ ...route })) : [draft.routes[0]!],
    }
  }
  return overlay
}

export function liveFor(routes: readonly LiveRoute[], provider: string, model: string): LiveRoute | undefined {
  return routes.find(route => route.selectable && route.provider === provider && route.model === model)
}

export function stripIllegalEffort(route: OverlayRoute, live: readonly LiveRoute[]): OverlayRoute {
  const found = liveFor(live, route.provider, route.model)
  if (found === undefined) return { provider: route.provider, model: route.model }
  if (route.reasoningEffort === undefined) return { provider: route.provider, model: route.model }
  // Keep a stored effort when the harness simply refused to describe the route:
  // an unreadable ladder must not be read as an absent one.
  if (found.effortsUnavailable !== undefined) {
    return { provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort }
  }
  if (found.efforts.length === 0) return { provider: route.provider, model: route.model }
  if (!found.efforts.some(effort => effort.id === route.reasoningEffort)) {
    return { provider: route.provider, model: route.model }
  }
  return { provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort }
}

/** Stale overlay entries become inherit in the returned overlay; original file is not written. */
export function dropUnselectableRoles(overlay: Overlay, live: readonly LiveRoute[]): {
  overlay: Overlay
  droppedRoles: string[]
} {
  const next = emptyOverlay()
  const droppedRoles: string[] = []
  const selectable = new Set(live.filter(route => route.selectable).map(route => routeKey(route.provider, route.model)))
  for (const role of ALL_ROLES) {
    const assignment = overlay.roles[role] ?? { inherit: true, routes: [] }
    if (role === 'how-critics') {
      next.roles[role] = { inherit: assignment.inherit, routes: assignment.routes.map(route => ({ ...route })) }
      continue
    }
    if (assignment.inherit || assignment.routes.length === 0) {
      next.roles[role] = { inherit: true, routes: [] }
      continue
    }
    const kept = assignment.routes
      .filter(route => selectable.has(routeKey(route.provider, route.model)))
      .map(route => stripIllegalEffort(route, live))
    if (kept.length === 0) {
      droppedRoles.push(role)
      next.roles[role] = { inherit: true, routes: [] }
      continue
    }
    if (kept.length !== assignment.routes.length) droppedRoles.push(role)
    next.roles[role] = {
      inherit: false,
      routes: isPanelRole(role) ? kept : [kept[0]!],
    }
  }
  return { overlay: next, droppedRoles }
}

export function applyInheritAll(drafts: RoleDraft[], choice: InheritChoice = 'inherit-parent'): RoleDraft[] {
  return drafts.map(draft => draft.role === 'how-critics' ? draft : ({
    ...draft,
    inherit: true,
    inheritChoice: choice,
    routes: [],
  }))
}

export function applyRouteToAll(drafts: RoleDraft[], route: OverlayRoute, live: readonly LiveRoute[]): RoleDraft[] {
  const cleaned = stripIllegalEffort(route, live)
  if (liveFor(live, cleaned.provider, cleaned.model) === undefined) return drafts
  return drafts.map(draft => draft.role === 'how-critics' ? draft : ({
    ...draft,
    inherit: false,
    inheritChoice: 'inherit-parent',
    routes: draft.panel ? [{ ...cleaned }] : [{ ...cleaned }],
  }))
}

export function routeSelectValue(draft: RoleDraft, index = 0): string {
  if (draft.inherit || draft.routes.length === 0) return draft.inheritChoice
  const route = draft.routes[index]
  if (route === undefined) return draft.inheritChoice
  return routeKey(route.provider, route.model)
}

export function parseRouteSelectValue(
  value: string,
  live: readonly LiveRoute[],
): { inherit: true; inheritChoice: InheritChoice } | { inherit: false; route: OverlayRoute } {
  if (value === 'inherit-parent' || value === 'auto') {
    return { inherit: true, inheritChoice: value }
  }
  const separator = value.indexOf('::')
  if (separator <= 0) return { inherit: true, inheritChoice: 'inherit-parent' }
  const provider = value.slice(0, separator)
  const model = value.slice(separator + 2)
  const found = liveFor(live, provider, model)
  if (found === undefined) return { inherit: true, inheritChoice: 'inherit-parent' }
  return { inherit: false, route: { provider: found.provider, model: found.model } }
}
