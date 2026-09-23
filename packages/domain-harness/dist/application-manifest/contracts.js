// Issue #310 / A2 I-007 (reviewed Product/L2 A2 chain): PROVISIONAL
// Application Manifest composition adapter — narrow consumption of
// composition metadata OWNED by the DAC/application-composition layer
// (DAC v0.0.2 APPLICATION_MANIFEST, baseline commit
// `9c3ef91b8b40d893e4fe2b0370200e765816ec2b`).
//
// The Manifest here is an INPUT to composition validation, never an
// authority. This adapter freezes ONLY:
//
//   - the nominal manifest roles required to consume an already-selected
//     composition (identity set, selected Domain Data entries, runtime
//     declarations, UX interaction-contract requirements, external-authority
//     declarations, capability requirements, provenance);
//   - the exact DAC baseline + manifest contract version it binds to
//     (fails closed on any other);
//   - opaque preservation of unknown/PROVISIONAL source fields.
//
// It does NOT freeze a wire schema, serialization format or field
// cardinality beyond the minimum needed for fail-closed consumption
// (L2 A2 §7.3: bind to an approved canonical contract/adapter revision; do
// not silently hard-freeze a divergent local encoding).
//
// Mandatory authority boundaries (PRD A2 §7 / L2 A2 §7 / DAC
// APPLICATION_MANIFEST §§1-3,12,14 — each enforced structurally and
// fail-closed at runtime):
//
// ```text
// Manifest = composition metadata, NOT a fourth semantic pillar
// Manifest NEVER promotes Domain Data / authors application selection
// Manifest NEVER selects a revision by order/defaults
// ApplicationSemanticIdentity != ApplicationRevisionIdentity
//   != ManifestIdentity != ManifestContentDigest != locator
// same ManifestIdentity + different authoritative digest => FAIL CLOSED
// Manifest definition NEVER absorbs live instance state        (N17)
// binding/activation/execution evidence stays OUTSIDE the
//   Manifest definition, as separate evidence referencing the exact
//   manifest identity/digest                                 (C38/N18)
// external Business SoR identity is never substituted by
//   Runtime implementation/host identity                     (N16)
// ```
//
// The adapter consumes the already-landed A2 surfaces: the #305 DAC
// reference adapter core (all lifecycle refs are #305-adopted objects),
// the #306 composition intake (the ONLY compatibility validation
// authority), the #307 runtime binding/activation evidence (the ONLY
// binding/activation authorities, correlated as separate evidence), the
// #308 UX correlation bridge (renderer-independent UX contract anchors)
// and — only where external-authority declarations are part of the
// supported composition path — #309 external-authority references.
//
// Portable leaf module: no Node built-ins, no engine/observation/control
// imports, no DAC product dependency, no Forge/Simulator/Domain UX
// implementation import. Composition happens only in the public barrels.
/**
 * Exact identity of this adapter surface. Carried by every adopted manifest
 * record so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export const APPLICATION_MANIFEST_ADAPTER_VERSION = 'application-manifest-adapter/1';
/**
 * The exact manifest contract role vocabulary this adapter is version-bound
 * to (DAC v0.0.2 APPLICATION_MANIFEST `contract_version` role). Any manifest
 * presented under a different contract version is rejected
 * (`UNSUPPORTED_MANIFEST_CONTRACT_VERSION`) rather than interpreted.
 */
export const APPLICATION_MANIFEST_CONTRACT_VERSION = 'dac-application-manifest/v0.0.2';
/** Exact identity of the composition-evidence surface minted by #310. */
export const MANIFEST_COMPOSITION_ADAPTER_VERSION = 'manifest-composition/1';
/** Exact identity of the manifest↔binding correlation surface minted by #310. */
export const MANIFEST_BINDING_CORRELATION_VERSION = 'manifest-binding-correlation/1';
/** Exact identity of the manifest↔activation correlation surface minted by #310. */
export const MANIFEST_ACTIVATION_CORRELATION_VERSION = 'manifest-activation-correlation/1';
/**
 * Closed vocabulary of the UX interaction-contract requirement roles a
 * manifest may declare (DAC APPLICATION_MANIFEST §6). The descriptor SHAPE
 * per role stays PROVISIONAL — preserved opaquely, never interpreted.
 */
export const MANIFEST_UX_CONTRACT_ROLES = [
    'domain-ux-definition',
    'runtime-interaction-contract',
    'affordance',
    'view',
    'outcome',
    'snapshot-watch',
];
/**
 * Adapter-recognized live instance-state field vocabulary (DAC
 * APPLICATION_MANIFEST §12). An exact top-level match inside the manifest's
 * opaque-preserved areas is rejected (`INSTANCE_STATE_LEAKAGE`) instead of
 * being preserved: the manifest definition must not absorb live
 * Business/Process/Execution/UX instance facts. The vocabulary is closed and
 * non-exhaustive by design — novel state-shaped fields can only ever land in
 * opaque storage where they are preserved verbatim and never read, so they
 * can never acquire manifest authority.
 */
export const MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY = [
    'currentWorkflowStep',
    'currentTaskStep',
    'currentStep',
    'currentBusinessRecordState',
    'businessRecordState',
    'currentEffectOutcome',
    'effectOutcome',
    'mailboxState',
    'journalState',
    'retryState',
    'localUxSelection',
    'uxDraft',
    'uxDraftState',
    'runtimeRecoveryProgress',
    'recoveryProgress',
    'liveInstanceState',
    'instanceState',
    'processState',
    'executionState',
    'uxState',
];
/** Fail-closed error surface for the Application Manifest adapter. */
export class ApplicationManifestError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(`[${code}] ${message}`);
        this.name = 'ApplicationManifestError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=contracts.js.map