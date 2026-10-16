import type { DacV0041BusinessSorBoundaryClassification, DacV0041BusinessSorTruthSourceFacts, DacV0041RuntimeActivationVerification, DacV0041RuntimeActivationVerificationInput, DacV0041RuntimeBindingVerification, DacV0041RuntimeBindingVerificationInput } from './contracts.js';
/**
 * Deterministic Runtime binding verification (ASSEMBLY_LIFECYCLE §12).
 * Pure, total and fail-closed over externally owned evidence: composes
 * the A41-003 compatibility view-association/precedence gates and the
 * A41-004 composition-intake gate with the A41-002 designation-chain walk
 * and the A41-001 foundation guards — without issuing or re-deciding any
 * upstream authority. The frozen precedence ladder is documented on
 * {@link DacV0041RuntimeBindingVerification}; `BINDING_VERIFIED` implies
 * no activation, no selection, no compatibility authority and no external
 * Business SoR truth (C107; §17).
 */
export declare function verifyDacV0041RuntimeBinding(input: DacV0041RuntimeBindingVerificationInput): DacV0041RuntimeBindingVerification;
/**
 * Deterministic Runtime activation verification (ASSEMBLY_LIFECYCLE §13).
 * Pure, total and fail-closed: re-verifies the COMPLETE binding evidence
 * bundle at the activation point, checks the separate technical-admission
 * seam (distinct issuing role; own designation; own independently
 * recoverable issuance evidence) and requires the bound RuntimeBindingRef
 * to be CURRENT at activation. `ACTIVATION_VERIFIED` manufactures no
 * upstream promotion/selection/Manifest/compatibility authority and owns
 * no external Business SoR truth.
 */
export declare function verifyDacV0041RuntimeActivation(input: DacV0041RuntimeActivationVerificationInput): DacV0041RuntimeActivationVerification;
/**
 * Deterministic external Business SoR boundary classification
 * (ASSEMBLY_LIFECYCLE §17): Runtime accepted/send-dispatched/provider-
 * acknowledged/execution-success/activation state classes are Runtime
 * mechanics evidence and can NEVER manufacture external authoritative
 * commit truth; external SoR observation/reconciliation material remains
 * externally owned evidence under EXTERNAL_AUTHORITY semantics. Unknown
 * classes fail closed — provenance is never guessed favorable.
 */
export declare function classifyDacV0041BusinessSorTruthSource(facts: DacV0041BusinessSorTruthSourceFacts): DacV0041BusinessSorBoundaryClassification;
//# sourceMappingURL=verifier.d.ts.map