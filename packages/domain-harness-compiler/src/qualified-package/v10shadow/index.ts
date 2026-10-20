/**
 * v0.10 T07 (#1174) — Host-owned read-only Shadow L4 surface.
 *
 * This module is deliberately separate from `v10build/activation.ts`
 * (T10's single-writer file) and from the selected T06 evidence observer.
 */
export {
  SHADOW_K_DOCS_PREFIX,
  SHADOW_L4_ABI,
  SHADOW_L4_EVIDENCE_KIND,
  ShadowL4Error,
  pinCandidateSource,
  runShadowL4,
  selectedFallbackPin,
  selectedFallbackProvenance,
} from './shadow-l4-readonly.js';
export type {
  ShadowKObservation,
  ShadowKReadStore,
  ShadowL4ApprovalState,
  ShadowL4CaseEvidence,
  ShadowL4Failure,
  ShadowL4Kind,
  ShadowL4Report,
  ShadowL4RunnerOptions,
  ShadowL4VersionPin,
} from './shadow-l4-readonly.js';
