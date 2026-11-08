/** Business-owned init selected by DIS bridge, not a KDP second kernel. */
export async function init(context){
 if(!Object.isFrozen(context)||context.bindings?.length!==1||!context.bindings.includes('approveQuote'))return {status:'BLOCKED',reason:'binding context invalid'};
 return {status:'READY',evidenceRefs:['demo:init-context-readback']};
}