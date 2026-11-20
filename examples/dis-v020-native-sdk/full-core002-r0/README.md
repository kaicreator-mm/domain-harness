# full-core002-r0 — CORE-002 Element cohesion, multi-Function identity and Source owner semantics (source-scoped engineering layer)

Lane C2 of DIS 0.2.0 Full Conformance R211 (kaicreator-mm/domain-harness#1545,
parent DAG #1544, parent Draft PR #1497, baseline
`ea12163301e2be629ccf4bb6914f19b33177913b`).

## What this directory adds

CORE-002 is PARTIAL in `matrix.json`: Element identity/version exist, but there
was no executable evidence for

1. one **cohesive business Element** carrying multiple Functions bound through
   **different implementation strategies** (Rule / Query(Knowledge) / Workflow),
   each with a stable typed semantic contract and its own implementation
   digest;
2. an executable **Source owner / version contract**: every Element declares
   its owner repository and version, and AOT assembly verifies the declaration
   against a digest-sealed **locked manifest** before the Microkernel boots;
3. the fail-closed negatives: wrong owner, dependency on a Function the
   manifest does not lock, explicit UNKNOWN rejection for missing/unrecognized
   owner or version, and implementation drift under a same declared version.

The machinery lives in `core002-owner-lock.mjs` (declaration + sealed manifest
+ assembly verifier) and is exercised end-to-end on the REAL assembly seam
(`compileDisV020Aot` → `qualifyDisV020Artifact` → `loadDisV020Aot`) by
`full-core002.test.mjs`.

## The cohesive Element

`core002.gateReview` (domain `core002-gate`) — an in-repo engineering
responsibility: evidence gate review for lane closeout, the discipline this
repository itself runs. Three Functions:

| Function | Strategy | Implementation source |
| --- | --- | --- |
| `core002.gateReview.policy.query` | Knowledge/Query | `gate-policy.mjs` |
| `core002.gateReview.evidence.assess` | Rule | `gate-rule.mjs` |
| `core002.gateReview.readiness.review` | Workflow | `gate-review.mjs` |

`core002.gateCatalog` is the shared Knowledge dependency the review Element
consumes through an exact R52 Function-level reference (`gate-catalog.mjs`).
Unrecognized evidence kinds resolve to a real domain-level UNKNOWN — they never
silently pass. The same owner lock also covers the REAL cross-project
`xdownload.policy` Element (original `kaicreator-mm/xDownload` business bytes),
which is invoked natively in the positive test.

## Provenance honesty

- The four `core002-gate-*` sources are **authored in this lane** inside this
  repository. `CORE002_SOURCES_COMMIT` pins the exact branch commit that
  introduced them; their Git Blob ids are recomputed from the actual bytes on
  every build (`compileDisV020Aot` enforces `gitBlob == bytes`), so any later
  drift is detected at compile time.
- `orders-init` and `xdownload-business` reuse the exact historical pins from
  `examples/dis-v020-native-sdk/native-fixture.mjs` (unchanged bytes).
- Negative-variant artifacts (source overrides, attacker-added elements) are
  in-memory synthetic attack inputs only; their origins carry an explicit zero
  commit and are never persisted or presented as provenance. Real selected
  sources are not overridable by design.

## What this does NOT claim

- The cohesive Element is an engineering-scope Element owned by
  `kaicreator-mm/domain-harness` at the byte level. It is **not** an external
  original business Element, not an independent semantic Oracle, not SAP/ECP,
  and confers no publication rights.
- Owner here is **source owner** (the repository that owns the selected bytes),
  not a publisher's right and not a professionally independent authority.
- Formal original-source owner qualification remains with
  kaicreator-mm/domain-intelligence-engineering#155 (currently
  BLOCKED_ORIGINAL_SOURCE_OR_QUALIFIED_SAP_ECP) and is a separate denominator.
- Engineering delivery in this directory does **not** by itself promote
  `DIS020-CORE-002` to VERIFIED; that assessment belongs to the independent
  non-Writer review, the central Integrator and the Product/L1 chain.

## Run

```bash
npm run build
node --import tsx --test examples/dis-v020-native-sdk/full-core002-r0/full-core002.test.mjs
```

CI: `.woodpecker/dis-v020-full-core002-r0.yaml` (exact-SHA clone + Node >= 24
+ native test lane; never mints qualification, Effect or Release).
