// #960 A1: consume the existing accepted v0.7 T004C effect authority.
// This is NOT a second runtime, journal, gate, or authority callback.
// Research limitation: B2 pure Kind's artifact SHA is not a T003C-native
// Tool binding; this facade by itself does NOT prove native B→T003C identity.
import { invokeEffectfulTool } from '../../../packages/domain-harness/dist/contracts/effectful-invocation.js';

export function invokeWithExistingV07Authority(request){
  if(!request || typeof request!=='object')throw Object.assign(new Error('E_NATIVE_INPUT'),{code:'E_NATIVE_INPUT'});
  // Explicitly reject old #944 user-injected permission callbacks even if the
  // accepted T004C validator would separately reject unknown top-level keys.
  if(Object.hasOwn(request,'effectAuthority') || Object.hasOwn(request,'effectTools'))
    throw Object.assign(new Error('E_CALLER_EFFECT_AUTHORITY'),{code:'E_CALLER_EFFECT_AUTHORITY'});
  return invokeEffectfulTool(request); // T002B/T003C/T004A/T002D/T005C/Central Admission
}
