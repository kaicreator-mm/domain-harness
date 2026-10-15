import { type DacV0041AuthorityAdoptionFacts, type DacV0041AuthorityAdoptionVerification, type DacV0041DesignationChainInput, type DacV0041DesignationChainVerification, type DacV0041HistoricArtifactUseClassification, type DacV0041HistoricArtifactUseFacts } from './contracts.js';
/**
 * Deterministic designation-chain verifier (F-01 §§2–8; C118–C132,
 * C159–C162, C166–C168, C172). Pure, total, fail-closed; see the module
 * header for the frozen pass order and the result type for the outcome
 * precedence. The verifier never repairs, truncates or normalizes an
 * over-broad grant, never merges partial owner anchors, never re-parents
 * superseded descendants, and never lets a rejected end act rewrite
 * `end(L)`.
 */
export declare function verifyDacV0041DesignationChain(input: DacV0041DesignationChainInput): DacV0041DesignationChainVerification;
/**
 * Deterministic AuthorityAdoption verifier (F-06 §6; C145–C147, C163–C165).
 * Consumer-only: it never creates adoption authority — it decides whether a
 * PRESENTED adoption act is valid, with the frozen precedence ladder
 * documented on the result type. The issuer designation chain is evaluated
 * chain-current at the adoption act's evidenced issuance point regardless of
 * the chain input's own evaluation point (§6.2 element 1: "at the adoption
 * point"). New authority becomes effective only from the adoption point;
 * adoption never repairs a malformed source chain, manufactures provenance,
 * widens authority or backdates effect.
 */
export declare function verifyDacV0041AuthorityAdoption(facts: DacV0041AuthorityAdoptionFacts): DacV0041AuthorityAdoptionVerification;
/**
 * Deterministic classifier for presenting a historic (older-baseline)
 * authority-bearing artifact for DIRECT v0.0.4.1 authoritative use
 * (F-06 §6.1; C145). A genuinely historic artifact without v0.0.4.1-valid
 * issuance-time designation evidence is `ADOPTION_REQUIRED` — the only
 * positive paths are fresh issuance or a valid AuthorityAdoptionRef; a
 * predecessor artifact is never consumer-wrapped into successor authority.
 */
export declare function classifyDacV0041HistoricAuthorityArtifactUse(facts: DacV0041HistoricArtifactUseFacts): DacV0041HistoricArtifactUseClassification;
//# sourceMappingURL=verifier.d.ts.map