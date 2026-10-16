// Issue #359 / A41-005 (reviewed #353 Task DAG; trigger comment 5855667505):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// Runtime binding/activation successor semantics at the exact successor
// semantic freeze pinned by the A41-001 foundation (commit 75fee75b… /
// tree c74cf5e3…):
//
//   - ASSEMBLY_LIFECYCLE.md §12 (Runtime binding: exact composition whose
//     required selection and compatibility evidence is current and valid;
//     exact Manifest/composition identity, current compatibility
//     validation/result, exact Runtime implementation and Host Binding
//     evidence where material, binding issuer designation/provenance;
//     `RuntimeHostBindingRef != RuntimeBindingRef`,
//     `CompatibilityValidationRef != RuntimeBindingRef`; binding-time
//     Harness verification stays binding-authority evidence);
//   - ASSEMBLY_LIFECYCLE.md §13 (Runtime activation: separate technical
//     admission decision binding an exact CURRENT `RuntimeBindingRef` plus
//     exact composition/Manifest identity; `RuntimeBindingRef !=
//     RuntimeActivationRef`; binding does not imply activation and
//     activation manufactures no missing upstream promotion/selection/
//     Manifest/compatibility authority);
//   - ASSEMBLY_LIFECYCLE.md §14 (boundary currentness re-establishment),
//     §15 (contradictory results fail closed — consumed upstream), §16
//     (co-location does not collapse seams: binding issuer role !=
//     activation issuer role, each with its own valid designation; C100/
//     C113/C154) and §17 (external Business SoR boundary: Provider
//     acceptance, Runtime success or activation state never manufactures
//     external authoritative commit truth);
//   - ASSEMBLY_PROFILES.md §15 (F-07/N-003 subject-contribution and
//     separation-of-duties clarification: deciding issuer != every
//     subject-contributing identity; co-hosting needs BOTH explicit SoD
//     permission and disclosed provenance; legitimate separately
//     designated multi-role identities — including a compatibility
//     validator later acting as Runtime binding issuer consuming its own
//     valid upstream authority result — remain preserved; C148/C149/C169);
//   - ASSEMBLY_CAPABILITY_EXCHANGE.md §10 (§10/§11 engineering/concrete
//     implementation: a later concrete implementation choice must not
//     retroactively strengthen an earlier abstract compatibility result;
//     implementation-specific claims bind the concrete exact refs);
//   - CROSS_LAYER_REFERENCES.md §3.1 (request-role minima:
//     `RuntimeBindingRequestRef` != `RuntimeBindingRef` !=
//     `RuntimeHostBindingRef` != activation request;
//     `RuntimeActivationRequestRef` != `RuntimeActivationRef`), §6 (anti-
//     alias family C108/C155) and §9 (fail-closed currentness).
//
// This module COMPOSES the already-reviewed upstream consumer surfaces
// without reissuing any upstream authority: the A41-002 designation-chain /
// AuthorityAdoption verifier, the A41-003 compatibility two-view/precedence
// classifiers and the A41-004 composition-intake verifier are consumed as
// evidence gates; nothing here re-evaluates, re-decides, re-issues or
// absorbs promotion/ApplicationSelection/Manifest/compatibility/designation
// authority (APPLICATION_MANIFEST §10 / C107: compatibility PASS != binding
// != activation; ASSEMBLY_LIFECYCLE §1: no arrow implies authority
// transfer). It also never issues a `RuntimeBindingRef`, a
// `RuntimeActivationRef` or a Runtime/Host Binding result: issuer-side
// designation/provenance facts arrive as externally recovered evidence and
// are only VERIFIED.
//
// Like the foundation and the sibling A41 modules, this module freezes NO
// wire schema, serialization, cryptography, clock, storage or transport;
// every fact arrives as a plain immutable record whose recoverability was
// established upstream. Portable: no Node built-ins, no engine internals,
// no imports from any historical DAC adapter. Imports only the A41-001
// foundation and the A41-002/-003/-004 leaf modules.
/**
 * Registry roles this seam consumes in evidence positions. Shared
 * VOCABULARY only: presence of a name here creates no issuance, decision
 * or lifecycle authority. `runtime-binding-request` has the dedicated C108
 * nominal constructor in the foundation; the remaining roles are adopted
 * through the generic registry constructor like every non-foundation
 * request role.
 */
export const DAC_V0041_RUNTIME_SEAM_ROLES = [
    'runtime-binding-request',
    'runtime-binding',
    'runtime-host-binding',
    'runtime-implementation',
    'runtime-activation-request',
    'runtime-activation',
    'compatibility-validation-request',
    'compatibility-validation',
    'compatibility-result',
    'manifest',
];
/**
 * Seam-FIXED issuing-authority roles (ASSEMBLY_LIFECYCLE §§12–13, §16; C142/
 * C154). Each Runtime authority-bearing seam owns exactly one issuing role;
 * the verifier — never the caller — fixes it. A caller-supplied
 * `requiredIssuingRole` token can never define or substitute the seam's
 * issuing authority: a coherent substitution that changes both the asserted
 * token and the chain-current leaf to another valid role still fails closed.
 * The same identity MAY validly hold both separately designated roles (C169).
 */
export const DAC_V0041_RUNTIME_BINDING_ISSUER_SEAM_ROLE = 'runtime-binding';
export const DAC_V0041_RUNTIME_ACTIVATION_ISSUER_SEAM_ROLE = 'runtime-activation';
/**
 * Closed §8.2 current-authoritative-reuse vocabulary for Runtime
 * implementation / Host Binding / binding reuse at the Runtime seams
 * (ASSEMBLY_PROFILES §§8.2–8.3). Same deterministic semantics as the
 * composition-intake vocabularies: `revoked`/`voided` are explicit
 * invalidations that FAIL CLOSED for new authoritative use;
 * `stale`/`superseded` are ordinary non-current states that are STALE;
 * `current` passes only when the determination covers the evaluation
 * point. `reselected` is a selection-only state and is NOT a Runtime-seam
 * state.
 */
export const DAC_V0041_RUNTIME_REUSE_CURRENTNESS_STATES = [
    'current',
    'stale',
    'superseded',
    'revoked',
    'voided',
];
/**
 * Closed vocabulary of Runtime-side state classes that can be observed
 * around Runtime binding/activation/execution (ASSEMBLY_LIFECYCLE §17).
 * None of them is — or can ever be presented as — external Business
 * System-of-Record truth: Provider acceptance, Runtime success, send
 * dispatch or activation state does not manufacture external authoritative
 * commit truth.
 */
export const DAC_V0041_RUNTIME_NON_SOR_STATE_CLASSES = [
    'runtime-accepted',
    'runtime-send-dispatched',
    'provider-acknowledged',
    'runtime-execution-success',
    'activation-state',
];
/**
 * Closed vocabulary of external Business SoR evidence classes
 * (EXTERNAL_AUTHORITY evidence-not-truth stance): even these remain
 * externally owned evidence under the frozen DAC external-authority /
 * logical-operation / observation / reconciliation semantics — the Runtime
 * never becomes their authority by binding, activating or executing.
 */
export const DAC_V0041_EXTERNAL_SOR_EVIDENCE_CLASSES = [
    'external-sor-observation',
    'external-sor-reconciliation',
];
//# sourceMappingURL=contracts.js.map