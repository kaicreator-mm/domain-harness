# v0.8 Specification Conformance R1 — Exact Evidence and Gate Classification

Role: independent specification validator; reference parent #942. Branch spike/v08-spec-conformance-942-r1, Draft PR #948, base PR #945 fixed f7fc99bde58da4a4a16cb433e54963d91d124d38. Main/v0.7/reference PRs untouched. No merge.

## Execution evidence

First green real-host source: ecedde8e2ff5f2f880bfe776780ec2023408a8a0, tree cde94d4990de8f1e5e20585cc4a8290ad63d4796.
Host: GitHub Actions ubuntu-latest, Node v22.23.3.
Run: https://github.com/kaicreator-mm/domain-harness/actions/runs/37800153300.
Commands:
- node --test experiments/v08-spec-conformance-942-r1/tests/conformance.test.mjs
- node --test experiments/v08-spec-conformance-942-r1/tests/known-gaps.test.mjs

29/29 candidate contract test groups PASS; 0 FAIL, 0 SKIP. They contain at least 42 explicit refused-input assertions and one static canonical JSON/SHA-256 golden vector, plus affirmative/metamorphic assertions. The tests are contract MODEL conformance, not direct conformance of #944 B runtime.
5/5 deliberately hostile #944 B witnesses REPRODUCED: mutable handler after seal (P1-F1), forged package provenance (P1-F2), unknown required Semantic Contract (P1-F3), unknown Kind (P1-F3), permissive effect Authority port (KPK/MK). Their green test result documents five architectural violations or integration gaps, NOT five conformance passes.
Initial run at 2cf8b5f reported 21/29 pass and 8 failing due to the test fixture using componentId "x", which this candidate exact ID grammar reserves as a floating-ref selector. Fixed only in this isolated test directory; no reference-runtime code was modified.

## Existing real GitHub reference evidence (NOT rerun by these tests)

- #940: beea9cdd29c51a046b8612871aa53be54b966e7c, 24/24 Linux toy Bootstrap tests; native B absent.
- #944: 80d5ee81e676bdbce49b1c22d592eab892fb2154, 18/18 Linux candidate toy tests; independent review #942 comment 6062395360 NEEDS_REVISION (3 P1 + 2 P2).
- #945: f7fc99bde58da4a4a16cb433e54963d91d124d38, 10/10 bounded + 59/59 actual v0.7 source oracle tests, includes 4 expected-gap witnesses, design NEEDS_REVISION.
- Actual v0.7 live ref checked: version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521. v0.7 production is read-only. ADS fixed reference: ai-development-standard@1edaee9291e25b6dd99303493bed75132cb54881.
- Project designated Windows/ECF Host NOT_RUN; full packageized B Runtime behavior parity NOT_TESTED; v0.7 source oracle from #945 is not a v0.8 cross-version behavioral oracle.

## Specification result (bounded scope)

PACKAGE_FORMAT=PARTIAL (independent schema, byte integrity, forbidden imports/exports; missing trusted B loader, byte-to-executable trust and full canonical collection normalization)
UNIFIED_COMPONENT_B=FAIL (the existing #944 candidate violates P1-F1/F2/F3, although local candidate validator has limited positive tests)
GRAPH_CAPABILITY=PARTIAL (exact relation/pin/0-1-N/cycle tests on candidate model, no native verified B execution)
OPERATION_ABI=FAIL (input/output/error/effect checks in local candidate; #944 handler provenance and real Central Admission not established)
CANONICAL_IDENTITY=PARTIAL (new domain-separated canonical example stable; complete profile and v0.7 parity unproven)
PACKAGE_PROVENANCE=FAIL (forged B Package pin accepted in existing #944)
IMMUTABLE_BINDING=FAIL (post-seal mutable JS handler changes behavior under same B Assembly digest)
MUST_UNDERSTAND_SEMANTICS=FAIL (unknown required semantics and Kind accepted by existing #944)
V07_LEGACY_COMPATIBILITY=PARTIAL (unchanged frozen legacy domain; existing #944 A only bounded real API reuse)

NATIVE_PACKAGE_INTEGRATION=BLOCKED_BY_P1.
V07_PRODUCTION_EQUIVALENCE=NOT_TESTED.
ARCHITECTURAL_FREEZE_READINESS=NEEDS_REVISION.
FORMAL_V08_L2_FREEZE=NO. MAIN_MERGE=NO.

## Specific minimum corrections and follow-up tests

Refer to evidence/gaps.json (P0=0, P1=5, P2=4) and evidence/rule-matrix.json for each bounded test and corresponding negative.
- S-PKG/P1-F2: derive native B Component/Implementation only from verified Package manifest and actual bytes; check declared cross-Package exact imports/exports.
- S-COMP/P1-F3: reuse v0.7 exact understood Kind + Semantic Contract admission and validator.
- S-OP/P1-F1: pin privately owned handler from attested module, prevent same-digest behavior substitution.
- KPK/MK: actual effect/caller/currentness and runtime authority via existing v0.7 owners; remove toy business kernel special branches in the relevant owner scope.
- S-PKG-GOLDEN: specify normalization of unordered Manifest collections and publish independently generated golden vectors (not self-derived expectations only).
- NATIVE-B-INTEGRATION: only after those P1 repairs independently review new exact heads, verify one real Package -> Linker -> Component B -> T002 Assembly -> T004 scoped v0.7 invocation.
- GATE-B: use real v0.7 State/Effect/Replay fault and crash tests (no second journal).

This R1 report is research evidence for #942, NOT authority to fix #944/940/945, alter version/v0.7, claim release qualification, or start formal v0.8 development.
