import { type DacV0041AuthorityRefusalEvidenceVerification, type DacV0041AuthorityRefusalFacts, type DacV0041CompositionIntakeInput, type DacV0041CompositionIntakeVerification } from './contracts.js';
/** Slot metadata for one issuer designation-chain check (pass 7). */
/**
 * Verify one seam-typed `AuthorityRefusalRef` presented as evidence
 * (F-04 §4.2; C142). Pure and total: never throws, never repairs, never
 * re-types a refusal into an invocation failure or vice versa, and never
 * creates refusal authority — the refusal was issued by its owning seam;
 * this only verifies the presented evidence.
 */
export declare function verifyDacV0041AuthorityRefusalEvidence(facts: DacV0041AuthorityRefusalFacts): DacV0041AuthorityRefusalEvidenceVerification;
/**
 * Deterministic composition-intake verification (F-04; C140–C143). Pure,
 * total and fail-closed over externally owned evidence: verifies the exact
 * application-identity establishment, the application selection that binds
 * promotion-covered subjects to that established identity, the successor
 * Manifest evidence, the total selected-Domain-Data coverage and the
 * seam-typed material refusal evidence — without issuing, selecting,
 * refusing, promoting, drafting or absorbing anything, and without any
 * live-state read or write.
 */
export declare function verifyDacV0041CompositionIntake(input: DacV0041CompositionIntakeInput): DacV0041CompositionIntakeVerification;
//# sourceMappingURL=verifier.d.ts.map