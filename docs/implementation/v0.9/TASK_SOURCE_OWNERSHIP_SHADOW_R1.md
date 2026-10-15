# DomainHarness v0.9 — Task ↔ Source ownership / ADS v4.12 shadow R1

```ini
RECORD=DH09_TASK_SOURCE_SHADOW_R1
SCOPE=V09_ONLY
STATUS=READ_ONLY_SOURCE_TRUTH_PREIMPLEMENTATION
PINNED_MAIN_BEFORE=92592000e1b54d761bcab58402e749e1153fd858
APPROVED_AUTHORITY=FROZEN_V09_PRODUCT_PR1048_L2_PR1053_DAG_PR1054
CANDIDATE_SHADOW_STANDARD=ADS_V412_PR1101_NOT_NORMATIVE
LIVE_NATIVE_DEPENDENCIES=11_OF_11_JIT_VERIFIED
V08_RELEASE_BASELINE=#1006_OPEN_READ_ONLY
V09_SOURCE_WRITES=NOT_AUTHORIZED
PENDING_SOURCE_FILES=DO_NOT_TREAT_AS_EXISTING
NATIVE_ISSUE_DEPENDENCY_MUTATION=NONE
SCAFFOLD_PAIR_FREEZE=NOT_CLAIMED
SOURCE_OR_RUNTIME_TEST_PASS=NOT_CLAIMED
```

## 1. What actually exists today (not invented Scaffold source)

The mature repository already has an SDK/compiler and a formally frozen v0.9 planning DAG. This R1 is an **advisory effective-write-set view**, not a newly authorized Scaffold, canonical source mapping, Claim, or amendment to the Task DAG. GitHub contents was independently queried against `main@92592000e1b54d761bcab58402e749e1153fd858`.

| Verified exact path or directory | Actual `main` status / Git blob | Single future **writer**, readers; contractual risk |
| --- | --- | --- |
| `packages/domain-harness/package.json` | PRESENT `fde52b39dab92d6896b8ce3370c35b99c87060f6`; no `./v9` export | **#1032 N06** owns package export/manifest edit. #1035 N07 may supply tested `public-v9` module but **must not concurrently edit** this manifest |
| `packages/domain-harness/src/index.ts` | PRESENT `dd9f73a0308a2468e0db6fcd8bd81a643c24c5c8`; current root exports legacy v2/v3/v4/v7 | **#1032 N06** sole central barrel/export integration owner; #1035 reads proposed public types, #1027 owns only its own contracts. Do not add a second public `load` escape |
| `packages/domain-harness-compiler/package.json` | PRESENT `ebea976f967af8abf30048c20eed4dc7b17e81c6` | **#1032 N06** owns packaging / export and version edits, #1027 merely consumes frozen K/S/C contract identity |
| `packages/domain-harness-compiler/src/index.ts` | PRESENT `9d43f1355eb73bd360b093e6e6fdb413179c48c9` | **#1032 N06** owns shared compiler barrel. #1027 owns selected K/S/C ABI declarations and Router internal module, **not this barrel** |
| `packages/domain-harness/src/public-v9/` | ABSENT (GitHub 404 at pinned `main`) | **#1035 N07** future module/type implementation owner; **PENDING/NOT_STARTED**, not a file or approved Scaffold |
| `packages/domain-harness/src/host-v9/` | ABSENT (GitHub 404 at pinned `main`) | **shared architectural seam, not shared write permission:** #1032 owns protected H logical trust/registry; #1028 owns selected Node24/SQLite physical adapter; #1036 owns lifecycle/permit integration. New filenames/module boundaries require explicit JIT nonoverlap and one integration writer |
| `packages/domain-harness-compiler/src/qualified-package/` | ABSENT on `main` (GitHub 404) | **#1027** owns newly versioned Kernel/Standard/Capability interfaces and pure Router; **#1032** owns qualified BUILD, host-bound sealing, manifest and module-loader glue. Split by **file/module** before Claim; do not let both edit `build.ts` or a shared barrel |
| `packages/domain-harness/tests/v09-integration/` | ABSENT on `main` (GitHub 404) | #1027 creates bounded shared K/S/C tests when admitted; #1036 owns lifecycle/actual operation integration cases; #1037 owns independent *release evidence*, not retroactive product-code edits |
| `packages/domain-harness-compiler/tests/v09-qualification.test.ts` | ABSENT on `main` (GitHub 404; example only) | **no actual test**; qualification negatives owned #1032, K/S/C binding tests #1027; agreed final exact test filenames come from real Builder work |

**Read-only reuse from a different, NOT-yet-release-qualified `v0.8` branch** (not current v0.9 `main` source): `packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs` blob `06c7988992478fb0614bf6e4d106f3ec6f7f8c44`; Kernel payload `9f5cdd7de267846f413ea6316c1aa85bace1e550`. A final qualified v0.8 tag/Host/ABI/currentness **must** be repinned after #1006 qualifies, not silently copied under old proof. N01 [L3 reference](N01_KS_C_WORKFLOW_ROUTER_L3_PREP.md) has tests-first contract without implemented source.

## 2. Effective future writer/consumer map (not Claim accepted)

| Existing Issue | Single primary concern + reserved *kind* of files | Consumes | Current execution state |
| --- | --- | --- | --- |
| **#1027 N01** | selected versioned K/S/C contract + pure Standard WorkflowRouter module and targeted binding tests | released v0.8 selected source, frozen L2, BUILD boundary ABI | BLOCKED by **#1006**; no source Claim |
| **#1032 N06** | privileged BUILD, protected H logical identity/approval/installed reference, distribution and all package/barrel manifests | #1027 canonical contract, #1028 physical store interface | BLOCKED by #1027 |
| **#1035 N07** | public `./v9` façade/types/onboarding tests and consumer documentation; **does not edit package export manifests** | #1027 contract, #1032-owned physical package export at integration | BLOCKED by #1027 |
| **#1028 N02** | first chosen Node24/SQLite Host physical CAS and capability operation adapter, not business K Journal or H governance decisions | #1027 K/C port contract, #1032 protected H port ABI | BLOCKED by #1027 |
| **#1036 N08** | protected per-operation H→K auth, lifecycle/Effect permit integration, scoped subscriber delivery and diagnostics | #1032+#1035+#1028 actual merged source | BLOCKED by all three |
| **#1037 N09** | independent selected actual-source/packed security Full/Hidden/critical-journey evidence; cannot mutate review target code | #1032+#1035+#1028+#1036 exact artifact | BLOCKED by all four |

**Collision findings (source-grounded, not actual conflicting Claims yet):**

- **C01 central SDK `package.json` / `src/index.ts`:** both N06 and N07 must participate in `./v9` product delivery, but **#1032 is the only writer** for existing package manifest / shared root barrel. N07 provides new façade module and its type contract. This avoids parallel merge conflicts and inconsistent package exports.
- **C02 compiler central `src/index.ts`:** N01 selected K/S/C internals and N06 producer-neutral BUILD both connect to the compiler. **#1032 owns the shared barrel**, N01 contributes internal module with versioned agreed exports.
- **C03 future Host identity/SQLite:** protected H registry ownership is #1032, physical CAS ownership #1028, per-operation lifecycle/effect route ownership #1036. *Directory name similarity is not accepted Claim overlap*; distinct concrete filenames become mandatory to prove once real files exist, and a single owner of each physical integration file is selected JIT.
- **C04 test identity:** independent #1037 cannot be author of Product implementation source that it is judging. Targeted tests in N01/N06/N07/N02/N08 do not become final release PASS simply because a reusable helper was observed.

All above are planning **owner defaults**, not substitutes for real GitHub Work Item accepted Claims; a changed final Task scope/writer is a bounded ADS DAG/Claim review at that time. No new native Issue graph edges are justified by these **import/coauthor relationships** alone.

## 3. ADS v4.12 FR-04 shadow falsifiers and decision

| Candidate v4.12 assertion | Real-current check | Disposition |
| --- | --- | --- |
| Every required current real Scaffold anchor has a real Git object | No v0.9 Scaffold was lawfully created; four future source/test areas above 404 at current `main` | **PENDING/UNKNOWN**, not FAILED implementation or paired Freeze PASS |
| A file may have only one effective writer | Existing manifests/barrels assigned #1032, new public façade assigned #1035; actual writer Claims do not yet exist | **SHADOW_OWNER_PLAN_SUPPORTED**, real Claim exclusivity **NOT_RUN** |
| An import/consumer edge is a GitHub `blocked_by` edge | Existing native 11 DAG edges were independently read; these possible shared exports **do not authorize new edges** | **DENY** auto edge insertion |
| `Task→source` reverse mapping may include nonexistent files marked real | Four future source/test areas confirmed absent; only path proposals with explicit PENDING state | **DENY** hypothetical fixture; real generator **NOT_RUN** |
| A missing Scaffold demands rebuilding the already frozen DAG | Mature-project v0.9 legitimately has a frozen Task DAG with no preimplementation scaffold source | **DENY** retroactive new requirement; mature project `REUSE_EXISTING_STRUCTURES` |
| The Node24 reference automatically entails OS matrix/QuickJS acceptance | Product/L2 deliberately limits the first selected runtime while JS/TS Core remains portable by ABI | **DENY** universal OS/engine scope inflation |

**Outcome:** one concrete source-reuse/collision-prevention map, **not** a new normative v4.12 implementation or a second DAG. `EXISTING_SOURCE_PATHS_READ_BACK=4`, `PENDING_SOURCE_PATHS_CHECKED=5`, `NATIVE_DEPENDENCIES=11/11`, `ACTUAL_WELCOME_CLAIMS=0`, `ACTUAL_V09_CODE=0`, `CHECKER_CODE_RUN=NO`. The 5 pending paths include a single example test path; they are not an implementation quota.

## 4. Trigger for change-impact re-evaluation

Only after #1006 actually releases, #1027 is officially unblocked, final release artifact pins have been read and a lawful N01 **actual source Claim** is accepted: (1) verify exact new selected modules and individual write sets; (2) recheck each EXISTING/PENDING path against actual Git tree; (3) confirm one physical writer per shared manifest/barrel; (4) if a material shared writer conflict exists, resolve through preexisting Controller/Claim rules before source edits; (5) **only then** apply v4.12's prospective task-source trace checker in shadow, without forcing a retroactive Scaffold Freeze. Use actual tests/Review, not planning documents, for implementation or security PASS.

```ini
SHADOW_TERMINAL=SOURCE_TRUTH_VERIFIED_PREIMPLEMENTATION
NEW_SOURCE_CODE=NO
RELEASE_GATE_CHANGE=NO
V09_IMPLEMENTATION=0_OF_6
COST_SAVINGS_QUANTIFIED=UNKNOWN
```
