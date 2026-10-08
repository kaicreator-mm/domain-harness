# SDK Packageization & Minimal Microkernel Validation R1

Authority: #942, research-only. Claim #942 comment 6062095234. Branch spike/v08-sdk-packageization-mk-942-r1. Write set ONLY experiments/v08-sdk-packageization-mk-942-r1/** and .github/workflows/spike-942-sdk-mk-r1.yml. No change to main, version/v0.7, PR #940, PR #944.

## Fixed execution evidence

- Tested SHA: 0431fdc5301f474713071e9c6824b9fe9c72c257
- Tested tree: def9061a41b6923f47452ee801b4e3c90180f78c
- Branch base: PR #944 HEAD 80d5ee81e676bdbce49b1c22d592eab892fb2154, tree 0b491fbdd3338d612101ec18f1b736a7913ea74f
- v0.7 oracle: 86110c616b8cb18c730553e4cdab7ef555214521
- Package source: #938 / PR #940 HEAD beea9cdd29c51a046b8612871aa53be54b966e7c
- ADS research pin: 1edaee9291e25b6dd99303493bed75132cb54881
- Real host: GitHub Actions Ubuntu Linux x86_64, Node v22.23.3
- Run: https://github.com/kaicreator-mm/domain-harness/actions/runs/37793231060
- Commands: node --test experiments/v08-sdk-packageization-mk-942-r1/tests/validation.test.mjs; cd detached-v0.7 && npm ci --ignore-scripts --no-audit --no-fund && cd packages/domain-harness && node --import tsx --test [seven explicit tests, see CI workflow]
- Total 69 pass / 0 fail / 0 skip: 10 independent spike tests (of which four are EXPECTED GAP WITNESSES, not conformances); 59 actual v0.7 source regression tests.
- Previous run 37793108378 failed solely because Node 22 lacks --test-isolation=none. Corrected the workflow command and reran at fixed SHA.
- This document is a docs-only successor commit; only the earlier tested SHA is asserted for the 69 tests until successor CI currentness passes.

## Microkernel Boundary Audit (M=minimal Microkernel, K=Kernel Package, S=SDK Package, B=business, H=Host)

The REASON column identifies the unmovable trust property for M portions. Source paths below are within packages/domain-harness/src of v0.7 oracle. PACKAGE_REPRESENTABLE describes the WHOLE concern or split as stated.

| CAPABILITY | EXISTING_V07_OWNER | CURRENT_LOCATION | RECOMMENDED_LOCATION | REASON / AUTHORITY_DEPENDENCY | PACKAGE_REPRESENTABLE | TEST_REFERENCE |
|---|---|---|---|---|---|---|
| Component identity/canonical digest | contracts/component.ts; component-digest.ts; identity.ts | M | M | digest root must precede trusting ordinary Component | NO (digest gate) | U06, MK04 |
| Graph identity/relations | contracts/definition-graph.ts | M | M mechanics + S/B relations | immutable graph/currentness cannot be ordinary mutable content | PARTIAL | MK04 |
| Trusted Package integrity | package/validation.ts; package/domain-data-integrity.ts; #938 bootstrap.mjs | M | M trusted seed + K loader | verified bytes and first trust root needed before any Package code runs | PARTIAL | KPK02, MK02 |
| Required semantics admission | contracts/component-admission.ts; kind-compatibility.ts | M | M gate + S/B validator | unknown/incompatible required Kind must fail prior to dispatch | PARTIAL | MK04 |
| Package DAG linking | contracts/capability-dependency-closure.ts; #938 kernel/impl.mjs | M + K toy | M trust/cycle mechanics + K Package policy | deterministic pinned closure, no hidden discovery | PARTIAL | KPK04 |
| Kind dispatch | contracts/runtime-assembly.ts admitComponentWithAssembly | M | M generic dispatch + S/B Kind behavior | exact sealed implementation provenance | PARTIAL | MK04 |
| Capability selection/binding | contracts/capability-provision.ts; capability-plane.ts; tool-implementation-binding.ts | M | M gate + K linker facade | no ambiguous/latest/default hidden Provider | PARTIAL | KPK02, MK04 |
| Sealed assembly/currentness | contracts/runtime-assembly.ts | M | M | cannot trust caller mutable pins or torn async evidence | NO (authority seal) | MK04 |
| Occurrence identity/activation | governance/assembly-activation.ts; execution-binding.ts | M | M | only one minting authority, old pins cannot drift | NO (minting authority) | MK04 |
| Central Admission/state commit | admission/admission.ts; admission/contracts.ts | M | M | singleton transition/state writer | NO (admission authority) | MK03/MK05 |
| Effect/outcome journal and replay | admission/effect-journal.ts; execution/journal; recovery/recovery-lifecycle.ts | M + H | M contract/ordering + H store | one durable outcome authority and exact replay | PARTIAL (storage adapter only) | MK05 |
| Workflow Kind | adapters/workflow-kind.ts; workflow-runtime-bridge.ts | S-style concrete | S | v0.7 sealed Kind binding, no Workflow kernel special case | YES (behavior) | U04/KPK01 |
| Rule/Decision semantic implementations | workflow/predicate.ts; decision-resolver/{resolver,harness-runner}.ts | S-style concrete | S | package Kind version and decision receipt | YES (behavior) | KPK03/U02/U03 |
| Tool/Operation implementations | execution/tool-runner; contracts/non-effectful-invocation.ts; contracts/effectful-invocation.ts | M trusted dispatcher + B/S providers | M dispatch + S/B implementation | operation effect class and occurrence/admission scope | PARTIAL | MK03/KPK05 |
| Host resources | contracts/resource-resolution.ts; tool/host-local-contract | M gate + H | M resource checks + H provider | secrets and host handles never become Definition authority | PARTIAL | MK03/MK04 |
| Lifecycle and hooks | package/activation.ts; governance/assembly-activation.ts | M + H | M Ready/authority + K/S optional hooks | pre-ready refusal, failure cleanup, idempotent dispose | PARTIAL | MK06 NOT_RUN |
| Business Domain Operations | Business Definition/tool and #938 business-approval/learning | B | B | M-authorized state/effect path must remain unique | YES | KPK06 |

The v0.7 frozen L2 A7 rule is: if a concern can use Component/Capability/Package WITHOUT breaking identity, authority, durability or recovery, move its implementation outside M. Actual frozen owner list: docs/architecture/DomainHarness_v0_7_FINAL_L2_SDK_CLOSURE.md section 2; A7/A8: docs/architecture/DomainHarness_v0.7_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md sections 10/11.

Microkernel irreducibility rationale: ordinary Components cannot authorize their own initial identity validator, sealed binding, occurrence, state writer or effect journal without recursive trust and unauthorized alternative authorities. Those generic mechanisms remain M; algorithms for Workflow/Rule/Decision, resource implementations and business operations are ordinary package/host providers.

## Source and executable falsifications

1. PR #940 real chain: bootstrap.mjs verifies pinned Kernel module and manifest -> kernel/impl.mjs linker stages exact SDK/Business/Support -> seal derives bindings -> dynamic implementation modules -> sdk/impl.mjs Workflow -> scoped Rule/Business calls -> toy kernel State and Receipt. New tests #1/2 remove SDK or required Rule; both fail before activation/effect. #3 replaces actual sdk/impl.mjs Rule and updates exact module/manifest pins: score 50 first selected node changes from review to notice, new Assembly digest, old live instance remains original. #4 accepts declared diamond deterministically, #5 consumes a Support Package implementation under a newly declared Semantic Kind without Kernel source changes.
2. PR #940 NON-minimal Kernel code: kernel/impl.mjs explicitly obtains business.workflow@1 and business.action@1, validates workflow.definition@1, and activate() extracts fixed workflow/state/effect/action capability IDs. This is a business/Standard-specific Kernel branch, confirmed by new test #10. Its toy state commit precedes receipt; #938 P2-L1 test proves state may advance after receipt recording fails. NOT a production v0.7 finding.
3. PR #944 unified.mjs B uses supplied packages and supplied JavaScript handler map independently of Package Loader verification. B invokes fixture handlers rather than the actual verified #938 modules. New #7 proves forged Package digests are accepted by sealB and still executable. New #8 proves identical implementationDigest and Assembly digest may coexist with different actual Decision handler outcome. The missing bridge is VERIFIED PACKAGE MODULE -> IMPLEMENTATION PIN -> B SEALED INVOCATION; it is not a claim that v0.7 core has this flaw.
4. B candidate effectAuthority can be arbitrary caller-injected port, invoked without v0.7 Occurrence and Central Admission. New #9 demonstrates that integration gap; does NOT prove bypass of a production v0.7 trusted Host interface.
5. #938 has no general provider-before-consumer activate hook, reverse rollback or idempotent dispose proof. B has no v0.7 production journal. Real 59 accepted v0.7 tests prove source-only regression baseline, NOT packageized production replay parity.

## Validation matrix

| ID | Result | Precise reason |
|---|---|---|
| KPK-01 | FAIL | #938 Kernel contains business Workflow/Action branches; #944 B has unverified executable handlers |
| KPK-02 | PASS (bounded toy) | new test #1-2 fail-close missing SDK/Rule before effects |
| KPK-03 | PARTIAL | new #3 module replacement and old in-memory pin pass; B same-pin handler spoof is accepted; no durable old occurrence replay |
| KPK-04 | PARTIAL | existing #938 3/4 Package cases plus new diamond #4; lifecycle provider-first cleanup unproved |
| KPK-05 | PARTIAL | new #5 actual package module with open Semantic Kind; new #6 B custom Kind/typed missing implementation; no integrated verified Package-to-B handler |
| KPK-06 | PARTIAL | reference Package implementations run Approval/Learning; B consumer handlers are fixtures; no clean-installed production SDK |
| MK-01 | FAIL | source audit finds specific non-irreducible business branches in reference Kernel |
| MK-02 | PARTIAL | #938 tamper/absence pinned bootstrap cases; no full transitive trust/target compatibility proof |
| MK-03 | PARTIAL | scope negatives and real v0.7 source oracle; full candidate-to-production Authority binding absent |
| MK-04 | PARTIAL | selective 59 v0.7 identity/currentness/activation/async tests PASS; B binding spoof refutes end-to-end pin trust |
| MK-05 | PARTIAL | selective actual v0.7 effect/admission/recovery regression PASS; packageized durable parity, crash/UNKNOWN/concurrency/old Assembly replay NOT_RUN |
| MK-06 | NOT_RUN | resource activation failure cleanup and idempotent disposal absent |

## Outcome and bounded repair

MICROKERNEL_BOUNDARY=PARTIAL
MICROKERNEL_MINIMALITY=FAIL
STANDARD_SDK_PACKAGEIZATION=PARTIAL
HIDDEN_KERNEL_FALLBACKS=NONE_OBSERVED_FOR_REMOVED_RULE_BUT_BUSINESS_WORKFLOW_HARDCODE_PRESENT
DUPLICATED_RUNTIME_AUTHORITIES=NONE_IN_PRODUCTION_V07;TOY_STATE_AND_TOY_RECEIPT_NOT_PRODUCTION
V07_BEHAVIORAL_COMPATIBILITY=PARTIAL_SOURCE_ORACLE_ONLY
V08_PRODUCTION_EQUIVALENCE=NOT_PROVEN
ARCHITECTURE_VERDICT=NEEDS_REVISION
FRESH_REVIEW=REQUIRED
MAIN_MERGE=NO
V07_INTERFERENCE=NO

Minimal bounded repairs, not formal v0.8 implementation:
1. Move Workflow/Action-specific validation and activation behavior out of #938 toy Kernel into selected Kind/SDK/Business implementations; keep pinned generic loader/admission mechanism in M/K.
2. Connect B executable binding ONLY to trusted #938-verified Package closure/module identity; reject arbitrary package digest, unchanged implementation pin with different handler, absent exact module. No second Package Loader or Registry.
3. Integrate B effectful path through existing v0.7 Sealed Assembly, Occurrence, Central Admission and Effect/Recovery authority; no Toy Journal graduation.
4. Add provider-first activate, partial-init reverse cleanup, idempotent dispose and pre-ready denial tests.
5. Differential Gate B on real hosts against accepted v0.7 state/effect/recovery/cancel/UNKNOWN/async snapshots, including durable old Assembly replay. Project designated Windows/ECF host NOT_RUN.

Separate fresh READ_ONLY reviewer must freeze test SHA 0431fdc5301f474713071e9c6824b9fe9c72c257 (tree def9061a41b6923f47452ee801b4e3c90180f78c), exact #938/#944/v0.7 reference SHAs above, and CI run 37793231060. Reviewer MUST distinguish expected-gap test successes from architectural conformance, and must not be the builder who authored the tests. No merge authorization.
