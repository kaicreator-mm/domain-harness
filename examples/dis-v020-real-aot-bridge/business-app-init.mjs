/** Business-owned init selected by DIS bridge, not a KDP second kernel. */
export async function init(context){
 if(!Object.isFrozen(context)||!(context.bindings?.length>=1&&context.bindings.length<=2)||!context.bindings.includes('approveQuote')||new Set(context.bindings).size!==context.bindings.length||!context.bindings.every(id=>['approveQuote','reserveStock'].includes(id)))return {status:'BLOCKED',reason:'binding context invalid'};
 if(context.config.mode==='test-blocked')return {status:'BLOCKED',reason:'fixture-declared-business-init-blocked'};
 if(context.config.mode==='test-degraded-mandatory')return {status:'DEGRADED',unavailableOptionalServices:['approveQuote']};
 return {status:'READY',evidenceRefs:['demo:init-context-readback']};
}