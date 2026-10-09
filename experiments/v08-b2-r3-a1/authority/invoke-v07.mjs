// #984 V08-B2-R3-A1: consume the existing accepted v0.7 T004C effect authority.
//
// Derived from experiments/v08-gatea-repair-942/authority/invoke-v07.mjs at
// base SHA e11a0510134903d6f05a20dd024f3740429edc33 (unchanged behavior,
// re-attributed into the A1 write set so the A1 façade consumes ONE seam).
//
// This is NOT a second runtime, journal, gate, or authority callback.
// Reference the exact same ORIGINAL v0.7 source module instance as the native
// fixtures; mixing dist and source produces two module-private T002B mint
// registries and correctly fails ASSEMBLY_PROVENANCE_UNVERIFIED. No bypass or
// reconstructed mint.
//
// Research limitation inherited from R2 and kept honest: the physical B
// package artifact SHA is not by itself a T003C-native Tool binding; the A1
// Host builds the REAL T003C binding over the attested bytes (see
// ./native-authority-host.mjs). The original Central Admission effect/State/
// Journal/replay semantics are consumed unchanged.
import { invokeEffectfulTool } from '../../../packages/domain-harness/src/contracts/effectful-invocation.ts';

// Keys that would carry caller-supplied effect authority. The ORIGINAL v0.7
// closed input already rejects unknown top-level keys; this wrapper rejects
// them with a precise host code even before that, as defense in depth
// (R2 heritage: E_CALLER_EFFECT_AUTHORITY for #944-style permission
// callbacks). The A1 public façade additionally only ever forwards its closed
// non-authority business input set (see ./native-authority-host.mjs).
const FORBIDDEN_CALLER_AUTHORITY_KEYS = Object.freeze(['effectAuthority', 'effectTools']);

export function invokeWithExistingV07Authority(request) {
  if (!request || typeof request !== 'object') {
    throw Object.assign(new Error('E_NATIVE_INPUT'), { code: 'E_NATIVE_INPUT' });
  }
  for (const key of FORBIDDEN_CALLER_AUTHORITY_KEYS) {
    if (Object.hasOwn(request, key)) {
      throw Object.assign(new Error('E_CALLER_EFFECT_AUTHORITY'), { code: 'E_CALLER_EFFECT_AUTHORITY' });
    }
  }
  return invokeEffectfulTool(request); // T002B/T003C/T004A/T002D/T005C/Central Admission
}
