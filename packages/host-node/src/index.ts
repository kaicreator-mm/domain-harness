/**
 * DomainHarness v0.10.2 — the Host (Node) package entry.
 * =====================================================================
 *
 * T03a (#1347) delivered the Host foundations (SQLite CAS contract + in-memory
 * store, scoped memory capability, durable external-work / child-invocation /
 * poison-recovery controls); T03b (#1325) completes the Host by moving its
 * remaining owners here from the legacy Compiler tree — the governed BUILD
 * deployment ledger (`deployment.ts`), the read-only Shadow L4 verifier
 * (`shadow-l4-readonly.ts`), the meta-feedback workflow
 * (`meta-feedback-workflow.ts`), the decision-evidence observer
 * (`decision-evidence-observer.ts`) and the CT-02 data-only feature invoker
 * (`ct02-invoker.ts`). Every activation dependency goes through the
 * Microkernel `./host-seam` (the true `isV10AppFacade` brand and the
 * activation-origin `readSelectedShadowBinding`); every shared constant/type
 * comes from Contracts; the physical SQLite adapter
 * (`sqlite-adapter.ts`) keeps `better-sqlite3` an OPTIONAL peer (dynamic
 * import, no hard dependency).
 *
 * The optional subpath decomposition planned for finalization
 * (`./shadow`, `./meta-feedback`, `./decision-evidence`, `./ct02-invoker`)
 * is not yet reflected in the package export map (manifest changes are the
 * exclusive T07 owner's); until then the same surfaces are reachable from
 * this root entry.
 */

// ---- T03a foundations -------------------------------------------------------
export {
  HostBoundaryError,
  InMemoryCasStore,
  probeTrueCasStore,
  validateWriteCondition,
} from './sqlite-cas.js';
export type {
  CasDocumentStore,
  CasGetResult,
  CasPutConditions,
  ValidatedWriteCondition,
} from './sqlite-cas.js';
export { openSqliteCasStore, SqliteCasStore } from './sqlite-adapter.js';
export type { SqliteCasStoreOptions } from './sqlite-adapter.js';
export { createV10ScopedMemory, V10MemoryError } from './scoped-memory.js';
export type {
  V10MemoryAuthRequest,
  V10MemoryHost,
  V10MemoryOperation,
  V10MemoryProvenance,
  V10MemoryRead,
  V10MemoryScope,
  V10ScopedMemoryCapability,
} from './scoped-memory.js';
export {
  ChildInvocationCoordinator,
  DurableControlError,
  ExternalWorkCoordinator,
  PoisonRecoveryCoordinator,
  childInvocationCorrelationId,
  childInvocationDocKey,
  externalWorkDocKey,
  kernelTurnSourceOf,
  poisonRecoveryActionId,
  poisonRecoveryDocKey,
  poisonRecoveryTurnMessageId,
} from './durable-controls.js';
export type {
  AuthorizePoisonRecoveryInput,
  ChildInvocationRecord,
  ChildInvocationTurnPlan,
  DeliverPoisonRecoveryOutcome,
  DurableControlErrorCode,
  ExternalWorkRecord,
  ExternalWorkTurnSource,
  PoisonRecoveryRecord,
  PoisonRecoveryTurnSource,
  RegisterExternalWorkInput,
  SettleCallbackOutcome,
  SettleDeadlineOutcome,
} from './durable-controls.js';

// ---- T03b governed deployment ledger ---------------------------------------
export {
  V10DeploymentError,
  activateGovernedV10Build,
  readV10DeploymentActivationRecord,
  readV10OccurrenceBuildPin,
  v10BuildActivationDecisionDigest,
  v10BuildPackageClosureDigest,
  v10DeploymentActivationKey,
  v10OccurrenceBuildPinKey,
} from './deployment.js';
export type {
  ActivateGovernedV10BuildOptions,
  V10BuildActivationDecision,
  V10DeploymentActivationRecord,
  V10DeploymentAuthorizationAuthority,
  V10DeploymentAuthorizationRequest,
  V10DeploymentAuthorizationVerdict,
  V10DeploymentIdentity,
  V10GovernedBuildActivation,
  V10GovernedBuildIdentity,
  V10OccurrenceBuildPin,
  V10OccurrenceTarget,
} from './deployment.js';

// ---- T03b read-only Shadow L4 verifier --------------------------------------
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

// ---- T03b meta-feedback workflow --------------------------------------------
export {
  MAX_META_EVIDENCE_KEYS,
  MAX_META_RECORD_CHARS,
  MAX_META_ROUNDS,
  META_FEEDBACK_ABI,
  META_FEEDBACK_CLAIM_KIND,
  META_FEEDBACK_CLAIM_PREFIX,
  META_FEEDBACK_CLAIM_STATE,
  META_FEEDBACK_EVIDENCE_KEY_PREFIX,
  META_FEEDBACK_LEDGER_KIND,
  META_FEEDBACK_LEDGER_PREFIX,
  META_FEEDBACK_LEDGER_STATE,
  MetaFeedbackError,
  metaFeedbackClaimKey,
  metaFeedbackEvidencePrefix,
  metaFeedbackLedgerKey,
  runMetaFeedbackWorkflow,
} from './meta-feedback-workflow.js';
export type {
  MetaFeedbackAuthorityFlags,
  MetaFeedbackResult,
  MetaFeedbackScope,
  MetaFeedbackSources,
  MetaFeedbackWorkflowAddress,
  RunMetaFeedbackWorkflowOptions,
} from './meta-feedback-workflow.js';

// ---- T03b decision-evidence observer ----------------------------------------
export {
  DecisionEvidenceObserverError,
  OBSERVER_ABI,
  createDecisionEvidenceObserver,
} from './decision-evidence-observer.js';
export type {
  CreateDecisionEvidenceObserverDeps,
  DecisionEvidenceObservation,
  HostKernelOutcome,
  ObserveDecisionEvidenceRequest,
  ObserverSemanticBoundary,
} from './decision-evidence-observer.js';

// ---- T03b CT-02 data-only feature invoker -----------------------------------
export { FeatureInputNotPlainDataError, invokeAgentImprovementFeature } from './ct02-invoker.js';
export type { Ct02FeatureFacade } from './ct02-invoker.js';
