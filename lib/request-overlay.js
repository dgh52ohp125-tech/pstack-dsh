export class RoleEffortMap {
                   bySession = new Map                                                                                       ()

  remember(sessionId        , binding                                                                               )       {
    this.bySession.set(sessionId, binding)
  }

  forget(sessionId        )       {
    this.bySession.delete(sessionId)
  }

  lookup(sessionId        ) {
    return this.bySession.get(sessionId)
  }
}

                             
                  
               
                          
                      
                    
                 
 

/**
 * Apply overlay effort/route on the child request waterfall.
 * Official home is `LlmCallConfig.reasoningEffort` (`packages/llm/llm/src/call-config.ts`),
 * not a spawn-tool field. `agent/request` is the replacement waterfall
 * (`packages/core/agent/src/runtime-types.ts`).
 */
export function applyRoleConfig(base            , binding                                                                             )             {
  if (binding === undefined) return base
  return {
    ...base,
    ...binding.provider ? { provider: binding.provider } : {},
    ...binding.model ? { model: binding.model } : {},
    ...binding.reasoningEffort ? { reasoningEffort: binding.reasoningEffort } : {},
  }
}


//# sourceURL=request-overlay.ts