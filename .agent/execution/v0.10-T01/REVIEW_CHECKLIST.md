# T01 — source-only reviewer checklist

1. Check task PR base **`v0.10`**, HEAD exact SHA, only the six scheduler-only pack artifacts plus one source-only output Markdown; no runtime/Host/BUILD implementation mutations.
2. Exactly 44 unique retained manifest IDs; no reclassification of original historical v08 manifest status/SHAs.
3. Each SELECTED_V9_PN_SOURCE requires *both* selected public reachability and concrete P and N source; source-only evidence != runtime PASS.
4. Uncovered capabilities list owning v0.10 Task K01/K02/T02..T11/T00/C01 as appropriate; optional P1 doesn't block R01.
5. A01 static trust checks at BUILD; K owns live Admission/CAS/fence/effects; Capability I/O READ and governed EFFECT distinct.
6. Inspect changed-risk failures only. Reviewer policy is `recommended`; if SKIP selected, publish explicit REVIEW_DECISION, do not assert Review PASS. Version closure Full/Hidden/CJ/pack NOT_RUN.
