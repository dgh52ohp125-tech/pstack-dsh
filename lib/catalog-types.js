                             
                     
                       
                               
 

                            
                           
                               
                        
                            
                                                                                              
                              
                                      
                                  
                                   
                                         
                                 
     
                                                                                 
                                                                                
                                                                             
                             
     
                                      
                        
 

                                
                              
                                  
                                      
                                     
                                           
                              
                                  
                              
                                       
                               
 

/** Hints for known logins whose adapter is missing; not an allowlist for live adapters. */
export const OAUTH_ROUTE_BY_STORE_ID                                   = {
  'openai-codex': 'pi-openai-codex',
  anthropic: 'pi-anthropic',
  xai: 'pi-xai',
  'github-copilot': 'pi-github-copilot',
  openrouter: 'pi-openrouter',
  'kimi-coding': 'pi-kimi-coding',
  antigravity: 'agy-google-antigravity',
}

export function storeIdForRoute(route        )                     {
  // dsh-oauth-login publishes pi-<credential-store-id>. buildCatalog calls this
  // only for registered adapters and separately requires that exact login id.
  // dsh-antigravity-oauth publishes agy-google-antigravity (or agy-*).
  // New login providers must not need a second registration in pstack.
  if (route.startsWith('pi-') && route.length > 3) return route.slice(3)
  if (route === 'agy-google-antigravity' || route.startsWith('agy-')) return 'antigravity'
  return undefined
}


//# sourceURL=catalog-types.ts