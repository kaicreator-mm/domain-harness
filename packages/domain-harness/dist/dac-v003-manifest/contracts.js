// Issue #328 / DAC v0.0.3 V3-004 (reviewed #319 R1 Task DAG, planning gate
// PASS comment 5793326420): immutable Application Manifest composition
// consumption.
//
// This module is the Manifest-side bounded closure of the reviewed R1 line.
// It CONSUMES already-produced exact references/results as immutable
// composition metadata only; it never creates promotion, selection or
// compatibility authority. Inputs are the merged surfaces:
//
//   - A2 #310 Manifest foundation (src/application-manifest/**) — the
//     v0.0.2 consumption pattern: four-role manifest identity set,
//     canonical content digest, fail-closed adoption, evidence kept OUTSIDE
//     the definition. Consumed as a pattern only; the historical adapter
//     stays byte-separate and separately testable.
//   - #323 V3-001 reference foundation (src/dac-v003/**) — every carried
//     reference is a genuinely adopted DAC v0.0.3 envelope bound to the exact
//     semantic freeze (commit 3322b21… / tree 163d2a4…).
//   - #325/#339 V3-002 compatibility closure
//     (src/dac-v003-compatibility/**) — the exact requirement/evidence/target
//     /UX declarations the manifest carries, and the single
//     subject/target-bound compatibility-validation authority whose minted
//     result this module associates EXTERNALLY.
//   - #327 V3-003 external-operation roles (src/dac-v003-external/**) — only
//     the `ExternalAuthorityRef` declarations, and only where the supported
//     Manifest path declares external-authority declarations APPLICABLE.
//
// Manifest-side cardinality/closure checks owned here (DAC v0.0.3
// APPLICATION_MANIFEST §4/§7/§8/§9, CROSS_LAYER_REFERENCES §6):
//
//   - selected Domain Data cardinality 1..n, each entry carrying EFFECTIVE
//     upstream promotion evidence and TOTAL upstream ApplicationSelection
//     coverage supplied by upstream authority (checked as exact identity
//     alignment; the manifest never minted either authority);
//   - exactly one primary Runtime contract AND one explicit Runtime
//     compatibility target;
//   - exactly one DomainUXDefinitionRef and exactly one
//     RuntimeInteractionContractRef (the supported composition requires
//     both; no renderer/presentation identity exists anywhere on the
//     surface);
//   - exact Capability/Port/Host-Binding requirement declarations plus
//     references to satisfaction evidence from V3-002, closed
//     manifest-side only to the extent that every referenced evidence links
//     a requirement THIS manifest declares (compatibility evaluation stays
//     with V3-002);
//   - the external-authority applicability decision recorded EXPLICITLY:
//     either APPLICABLE with ≥1 genuine #327 ExternalAuthorityRef
//     declarations, or NOT_APPLICABLE with recorded applicability evidence.
//
// R1 P2 clarification (mandatory acceptance detail): the exact
// subject/target-bound compatibility validation result is represented ONLY
// as an associated external validation record
// (`DacV003ManifestCompatibilityAssociation`), never as a required field
// inside immutable Manifest content whose digest that same result validates.
// The adopted manifest record structurally has no validation/result slot,
// the canonical digest material structurally cannot cover one, and
// presenting a V3-002 validation/result object anywhere inside manifest
// definition content fails closed (`MANIFEST_EVIDENCE_ABSORPTION`). This
// avoids the self-reference cycle and preserves the frozen
// Manifest/content-digest boundary.
//
// The Manifest MUST NOT (each enforced fail-closed):
//
//   - absorb promotion/selection authority (no ref is ever minted as a
//     decision here; provenance is pass-through upstream evidence);
//   - absorb compatibility computation/authority (no disposition is ever
//     produced here; V3-002 remains the single authority);
//   - absorb Runtime binding or activation evidence (`runtime-binding` /
//     `runtime-activation` identity, #307 evidence objects → fail closed);
//   - absorb live instance/process/execution/UX state (closed recognized
//     instance-state vocabulary → `INSTANCE_STATE_LEAKAGE`);
//   - absorb live external operation/reconciliation state (#327 live
//     logical-operation/attempt/provider-operation/observation/
//     reconciliation/effect records → `LIVE_EXTERNAL_STATE_ABSORPTION`).
//
// Like every V3 leaf, this module freezes NO wire schema, transport
// encoding or serialization format (DAC v0.0.3 keeps those PROVISIONAL);
// the canonical digest projection below is revision-bound to this adapter
// version only. Portable leaf module: no Node built-ins, no engine/
// observation/control imports, no DAC product dependency. Composition
// happens only in the public barrel.
/**
 * Exact identity of this adapter surface. Carried by every adopted manifest
 * record so foreign/mis-tagged objects fail closed instead of being guessed.
 */
export const DAC_V003_MANIFEST_ADAPTER_VERSION = 'dac-v003-manifest-adapter/1';
/**
 * The exact manifest contract version this adapter is version-bound to. Any
 * manifest presented under a different contract version is rejected
 * (`UNSUPPORTED_MANIFEST_CONTRACT_VERSION`) rather than interpreted. This is
 * the v0.0.3 line; the historical v0.0.2 `dac-application-manifest/v0.0.2`
 * stays owned by the #310 adapter and is never relabeled here.
 */
export const DAC_V003_MANIFEST_CONTRACT_VERSION = 'dac-application-manifest/v0.0.3';
/**
 * Exact identity of the external manifest↔compatibility-validation
 * association surface minted by this module (R1 P2: the associated external
 * validation record).
 */
export const DAC_V003_MANIFEST_VALIDATION_ASSOCIATION_VERSION = 'dac-v003-manifest-validation-association/1';
/**
 * Adapter-recognized live instance-state field vocabulary (DAC
 * APPLICATION_MANIFEST §12, same closed recognized subset as the #310
 * adapter, duplicated so this leaf never edits the reviewed #310 surface).
 * An exact top-level match inside opaque-preserved areas is rejected
 * (`INSTANCE_STATE_LEAKAGE`): the manifest definition must not absorb live
 * Business/Process/Execution/UX instance facts. Novel state-shaped fields
 * can only ever land in opaque storage where they are preserved verbatim
 * and never read, so they can never acquire manifest authority.
 */
export const DAC_V003_MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY = [
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
/** Fail-closed error surface for the DAC v0.0.3 manifest adapter. */
export class DacV003ManifestError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(`[${code}] ${message}`);
        this.name = 'DacV003ManifestError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=contracts.js.map