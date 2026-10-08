# #947 V08-947-R3 successor specification validator hardening

Source ancestor: PR #948 `f97610a904c7969836165b65ab53e575bd67d43b`, tree `a208746bfe3404f28964c9fadafb988158634689`. This file accompanies successor-only changes and is not the historical R1 test terminal.

- P1-R2-01: injective composite Graph IDs for slash-bearing legal package/component IDs; explicit duplicate Graph node guard. The two colliding historical pairs are tested with declared imports/exports, independently resolved providers, DAG edges and permutations.
- P1-R2-02: descriptor-first array canonicalization; no `map`/getter evaluation during element visits; dense own data indices only, no extra properties, symbols, holes or non-intrinsic prototype.
- Original 29 research-contract test groups and 5 old architectural **gap witnesses** remain present. Five green witnesses **do not** equal #944 B Runtime conformance.
- New adversarial suites: 4 Graph + 8 Array = 12. Test commands: `node --test experiments/v08-spec-conformance-942-r2/tests/conformance.test.mjs`; `node --test experiments/v08-spec-conformance-942-r2/tests/known-gaps.test.mjs`; `node --test experiments/v08-spec-conformance-942-r2/tests/r3-adversarial.test.mjs`.
- P2-R2-01 fixture artifacts / matrix self-SHA: inline assertions labeled as such; exact tested SHA is proven by external CI run and #947 terminal, not embedded recursively within tracked rule-matrix bytes.
- P2-R2-02 numeric-like JavaScript object keys vs claimed code-unit order: **OPEN/DEFERRED**.
- P2-R2-03 published JSON Schema / JS validator exact ID-policy equivalence: **OPEN/DEFERRED**.
- Architectural open P1: #944 F1/F2/F3, #945 K1, fake effect authority. Native B→v0.7 composition, actual durable state/effect equivalence, v0.8 Product/PRD freeze: **NOT PROVEN**.
- Runtime hostile Proxy traps / concurrent mutation are not claimed covered by the candidate in-memory record validator. Trusted immutable Package input and host admission remain separate layers.
- CI provenance: see exact-head GitHub Actions push run / #947 terminal. This document does not assert a future run succeeded.
