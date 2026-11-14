# R85 — Original CI job provenance + Core state identity source-repair

Source review of R83 integrated into existing Draft #1497, based on exact original `cbf6022f66fb76fc2c009983b8fd4813334dc6bb`. Independent of Product/L1 approval and independent DKE semantic review.

## Specific fail-open predicates found

1. R83 `validateOriginalEvidence` allowed all three SUCCESS contexts to point to **any** `#2397/{1,2,3}` URL. An attacker changing both native receipt and batch manifest could swap native and compatibility job URLs while retaining the three labels and PASS statuses. This is not an assertion that the actual original CI receipt was forged; it is a counterexample to the evidence validator.
2. The original R83 matrix check counted only 12 VERIFIED / 4 PARTIAL Core, so `CORE-005 PARTIAL` and `CORE-009 VERIFIED` could be switched without changing the totals. The model would accept the incorrect set of unresolved obligations.

## Repair and tests

The exact R82 source-qualified original CI lane is now pinned by **context-to-URL bijection**: integration=#2397/1, min-node=#2397/2, generic verify=#2397/3. The original 21 Matrix requirement **IDs and exact states** (16 Core, 4 Optional, 1 Governance) are checked in addition to totals, with explicit remaining Core 002/005/008/016. Two additional adversarial mutations forge coordinated original evidence and identical-total Core state swaps. Current test plan: existing 768-state abstract exhaustive check, 771 original Reader calls, and **14** forged-source/evidence mutations; original R83 historical receipts remain untouched.

This is a fail-closed **source-evidence validator** repair, not a runtime SDK / KDP Effect change, target approval, independent Claim Critic, SAP qualification, or unbounded proof. Do not auto-promote 12/16 or 36/36. The new Node/CI validation is pending until an exact-SHA host execution reports results. When Model/Matrix normative states intentionally evolve, an explicitly versioned new model baseline is required; historical receipts must not be rewritten.
