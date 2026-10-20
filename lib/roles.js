/**
 * pstack role keys used by playbooks and Settings → pstack.
 * These are pstack names, not Cursor slugs and not grok-build `subagent_type` values.
 */

export const SCALAR_ROLES = [
  'feature',
  'refactoring',
  'bug-fix',
  'perf-issue',
  'hillclimb',
  'judgment-and-prose',
  'hardest-tasks',
  'how-explorer',
  'how-explainer',
  'why-investigators',
  'why-synthesizer',
  'reflect-tooling',
  'reflect-judgment',
  'swarm-workers',
  'independent-verifier',
  'poteto-agent',
  'comment-sicko',
]         

export const PANEL_ROLES = [
  'how-critics',
  'arena-runners',
  'arena-cross-judge-pool',
  'architect-runners',
  'interrogate-reviewers',
]         

export const ALL_ROLES = [...SCALAR_ROLES, ...PANEL_ROLES]         

                                                      
                                                    
                                                   

export function isPstackRole(value        )                      {
  return (ALL_ROLES                     ).includes(value)
}

export function isPanelRole(value        )                     {
  return (PANEL_ROLES                     ).includes(value)
}

/** Alias accepted from Cursor-era skills. */
export function normalizeRole(raw        )         {
  const trimmed = raw.trim()
  if (trimmed === 'Comment Sicko' || trimmed === 'comment sicko') return 'comment-sicko'
  if (trimmed === 'poteto-agent' || trimmed === 'Poteto Agent') return 'poteto-agent'
  if (trimmed === 'generalPurpose' || trimmed === 'general-purpose') return 'poteto-agent'
  return trimmed
}


//# sourceURL=roles.ts