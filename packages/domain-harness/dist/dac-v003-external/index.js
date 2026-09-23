// Issue #327 / DAC v0.0.3 V3-003: external-operation / idempotency /
// reconciliation exact role binding (leaf module). Portable: no Node
// built-ins, no engine/store/journal dependency, no redesign of the A2 #309
// durable external-effect evidence surface (consumed read-only) and no edits
// to the V3-001 foundation or V3-002 compatibility surface (both stay
// byte-separate and separately testable). Composition happens only in the
// public barrel (exports only).
//
// The guard/evaluate layers are enumerated EXPLICITLY instead of
// `export *`: the mint registries' registration functions stay
// module-internal so no foreign code can add records to the private WeakSet
// that proves a role wrapper was genuinely minted by this surface.
export * from './contracts.js';
export { adoptDacV003ExternalAuthorityRef, adoptDacV003LogicalOperationRef, adoptDacV003ProviderOperationRef, adoptDacV003AttemptRef, adoptDacV003AuthoritativeEffectRecordRef, adoptDacV003IdempotencyIdentityRef, adoptDacV003ExternalObservationRef, adoptDacV003ObservationFromV002Evidence, declareDacV003RecoveryCapability, declareDacV003ExternalCapability, isDacV003ExternalAuthorityRef, isDacV003LogicalOperationRef, isDacV003ProviderOperationRef, isDacV003AttemptRef, isDacV003AuthoritativeEffectRecordRef, isDacV003IdempotencyIdentityRef, isDacV003ExternalObservationRef, isDacV003RecoveryCapabilityRef, isDacV003ExternalCapabilityRef, isDacV003UpstreamV002Evidence, isDacV003IdempotencyGuaranteeProven, expectDacV003ExternalAuthorityRef, expectDacV003LogicalOperationRef, expectDacV003ProviderOperationRef, expectDacV003AttemptRef, expectDacV003AuthoritativeEffectRecordRef, expectDacV003IdempotencyIdentityRef, expectDacV003ExternalObservationRef, expectDacV003RecoveryCapabilityRef, expectDacV003ExternalCapabilityRef, expectDacV003UpstreamV002Evidence, assertDacV003LogicalOperationContinuity, assertDacV003AttemptIdentitiesDistinct, assertDacV003IdempotencyReuseForLogicalEffect, assertDacV003CapabilitySatisfaction, assertDacV003ReconciliationActionSemantics, assertDacV003CompositionHandoffIsDeclarative, maxJustifiedMeaningForAttemptEvidence, dacV003ExternalOutcome, isDacV003ExternalOutcome, refuteDacV003HarnessSideIdentityAsExternalAuthority, refuteDacV003AttemptAsLogicalOperation, refuteDacV003ProviderOperationAsAuthoritativeEffectRecord, refuteDacV003LocalCauseAsRemoteTruth, } from './guards.js';
export { adjudicateDacV003ObservationCurrentness, reconcileDacV003ExternalOperation, evaluateDacV003SafeRetry, } from './evaluate.js';
//# sourceMappingURL=index.js.map