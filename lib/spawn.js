                                                         
import { resolveRole } from './overlay.js'
import { normalizeRole } from './roles.js'

                               
                       
                              
                         
                                   
                              
 

                               
                   
                
 

                                
                       
                              
                         
                                   
                           
                                      
                                   
                               
 

export function resolveSpawn(overlay         , request              )                {
  const role = normalizeRole(request.role)
  const assignment = resolveRole(overlay, role)
  const inherit = assignment.inherit || assignment.routes.length === 0
  const index = request.routeIndex ?? 0
  const route = inherit ? undefined : assignment.routes[index] ?? assignment.routes[0]
  return {
    role,
    description: request.description,
    prompt: request.prompt,
    runInBackground: request.runInBackground,
    inherit,
    ...route === undefined
      ? {}
      : {
        agentOptions: { provider: route.provider, model: route.model },
        route,
        ...route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort },
      },
  }
}

/** Fields a skill may send on pstack_spawn. Official `subagent` has no model/effort. */
export const SPAWN_MODEL_FIELDS = ['description', 'prompt', 'role', 'run_in_background', 'route_index']         


//# sourceURL=spawn.ts