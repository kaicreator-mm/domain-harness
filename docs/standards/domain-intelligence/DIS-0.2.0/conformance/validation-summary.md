# DIS 0.2.0 — versioned conformance coverage snapshot (initial normalization)

**Owner:** [version master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), specification authority [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), implementation [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497).

**Authoritative machine file:** [matrix.json](matrix.json). The table counts below are **requirements**, not Node test counts, CI attempts or a claim of full conformance.

| Scope | VERIFIED | PARTIAL | NOT_RUN | OUT_OF_SCOPE | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core | 9 | 7 | 0 | 0 | 16 |
| Optional profiles | 0 | 0 | 4 | 0 | 4 |
| Governance | 0 | 0 | 1 | 0 | 1 |

**Current status: PARTIAL.** P0 gaps: Function version, I/O Schema / typed Outcome / Evidence; executable constraints and semantic collaboration; native progressive Interaction. P1 optional profiles: Harness+LLM, Experience/Local Evolution/Server promotion, cross-target variants. Governance: independent exact-SHA review and L2 Freeze.

### Normalized Demo plan / history (ADS #1362 practice)

See [Demo index, dependency map and R1–R11 historical evidence](DEMO_INDEX.md). It maps every Core/optional/governance requirement to D00–D08 evidence questions, preserves original files and exact historical receipts, and keeps the failed R11 integration context open. This index is not a second machine matrix or frozen implementation Task DAG.

### Historical verified baseline (do not roll forward implicitly)

- [R9.5 pinned source/CI receipt](receipts/r9.5-baseline.json) — HEAD `7954bd91d51eb13fbeab96385f37ac8d9cd35c5e`, TREE `9250ad08f500bc8924458af1c833947c99ad0d4c`.
- 97 named test cases from actual selected KDP/SDK, real physical SQLite KDP Journal, Tally/Runx/xDownload source-real consumers and native AOT/SDK.
- Woodpecker three exact-SHA contexts SUCCESS; reference CI URLs in the receipt. The new normalization commit is separately validated and has no automatically inherited 97-case result.

### Interpretation and closure

A `VERIFIED` row means the **stated narrow requirement** has a positive+negative executable case associated with an exact historical receipt; it is not proof of all neighboring spec MUSTs. `PARTIAL` rows are not counted as complete. Optional profiles cannot silently disappear; `OUT_OF_SCOPE` requires a Product/L1 decision, and no OS hostile-native sandbox requirement is added. Every planned next implementation must modify the matrix and add its own exact commit receipt after CI success.

Machine validation from monorepo root: `node --test examples/dis-v020-conformance/validate.test.mjs`. This verifies IDs, statuses, source/test paths, named cases, fixed receipt integrity and honest evidence states.

Sub-issues are created only for genuinely independent write sets; the version index owns the final acceptance, Git owns immutable artifacts, Woodpecker owns execution proof.

### R10 new native Interaction coverage (candidate)

- Source-pinned `xdownload.interaction` has **two LOCAL public Functions**; one normalizes bounded Chat/Form/CLI Intent and one merges clarification + explicit user confirmation. Both return `OBSERVATION/NONE` and never issue an Effect permit. The existing real KDP `confirmDownload` remains a distinct call.
- Contract protects `kind=interaction` from `KDP_INTENT` / governed-Effect reclassification; no new OS trust gate or generic UI engine.
- New 6-case native SDK regression is wired through existing `native-consumer.test.mjs` and Woodpecker. **CORE-014 changes NOT_RUN → PARTIAL, not VERIFIED** until matching exact-SHA CI, actual UI adapters and cross-mode conformance are demonstrated.

### R10 exact-SHA blocked receipt (not PASS)

- [R10 current candidate failure receipt](receipts/r10-candidate-blocked.json) pins HEAD `c043fdaf22074cbda8230a2d1c36226205beda17` and all three Woodpecker failures (pipelines 2227/1–3). The GitHub connector does not expose pipeline step logs, so the cause is **UNDETERMINED**, not assumed to be a test assertion.
- Direct checked-out **Git Blob-identical** Interaction source (`f57747aa...`) passed 12 standalone Node22 assertions, and the 21-row matrix passed in-process reference validation; these are only targeted local checks, **not a native SDK/KDP CI qualification**.
- R10 stays PARTIAL until the blocked CI is investigated and a new exact-SHA success receipt is committed. Do not freeze the version or borrow R9.5 green contexts for new code.

### R10 CI recovery receipt (exact-SHA SUCCESS)

- The R10 block was diagnosed from the Woodpecker step logs as **CI infrastructure, not candidate code**: npm runs unreviewed dependency install scripts with only an advisory warning, so `better-sqlite3`'s install script fetched its prebuilt binary from github.com releases on every `npm ci`; the worker's direct GitHub egress returned 504s and prebuild-install fell back to node-gyp, which needs make the agent image does not ship. The lockfile is byte-identical to the R9.5 baseline (#2223 SUCCESS), and R9.5's green run only differed by a lucky GitHub download 82 minutes earlier.
- Fix: the three PR workflows pin the prebuild download to the npmmirror binary mirror (`npm_config_better_sqlite3_binary_host_mirror`, a native prebuild-install option); a local Node24 full gate additionally surfaced a staged/live pack inventory divergence in the new-workspace test staging, fixed in the same candidate.
- [R10 CI recovery receipt](receipts/r10-ci-recovery.json) pins HEAD `c9cc8d63e13b150cf462af05a58daef5748f0030` with all three Woodpecker contexts SUCCESS (pipelines 2229/1–3): 103 named demo cases (native consumer 27, including the 6 new Interaction cases; bridge 34; physical 7; source consumer 26; source selected 9), plus the 5-case matrix validator and the 12-case C01 assembly context.
- CORE-014 remains **PARTIAL** (real Chat/Form/CLI UI transports, external download Host and cross-mode conformance still missing); the coverage table above is unchanged. The docs commit that adds this receipt is validated by its own separate pipeline and inherits nothing automatically.

### R11 Function Contract candidate (no exact-SHA CI receipt yet)

- `DIS020-CORE-003` is **PARTIAL**: real original-source Tally task assessment and both xDownload native Interaction Functions now carry `dis.v0.2.function-contract/1` checked by published Contracts/Microkernel subpaths. Added 8 targeted positive/negative native tests, with no new fake Domain.
- Input/output record types are checked before typed disposition classification. Tally `UNQUALIFIED_INPUT` remains `UNKNOWN`; xDownload `READY_FOR_KDP` becomes `PENDING_AUTHORIZATION`, never Effect permission. The returned source pin is provenance, not independent business attestation; declared evidence references alone are never trusted as facts. `SUCCEEDED` without required references is rejected.
- Strict compatible reader/major is included in AOT and optional explicit caller version expectation rejects a stale consumer. Existing unprofiled R9 Functions remain outside CORE-003 completion. This candidate **cannot inherit R10 CI SUCCESS**; retain PARTIAL until new exact-SHA Woodpecker receipt and all remaining functions/typed KDP receipts/full schema/evidence verification are covered.

### R11 failure receipt and stale matrix test repair (R13)

- [R11 blocked receipt](receipts/r11-integration-blocked.json) binds original R11 code HEAD `4632d5e0b331f0119da0c8d78249b7c1437856a1` to actual **DIS integration FAILURE, min-node SUCCESS, verify SUCCESS**. The receipt is historical *negative evidence*, never a VERIFIED receipt. Matrix root index includes it, but CORE-003 `receiptIds=[]` and state `PARTIAL` remain unchanged.
- Source inspection found a real outdated validator-test assertion: `core:NOT_RUN > 0` on a legitimate matrix of **9 VERIFIED / 7 PARTIAL / 0 NOT_RUN**. The test now checks 16 Core entries and that some remain unresolved, without requiring fake NOT_RUN coverage. An additional negative test refuses to use the BLOCKED receipt as SUCCESS.
- **No ungrounded causal claim:** GitHub CI status alone cannot identify the first failing Woodpecker step. This test inconsistency is a deterministically failing source assertion if reached, but full pipeline resolution requires newly matched exact-SHA Woodpecker success. R10 success cannot be borrowed.

### R14 — D01 recovered; D02/D03 native consumer candidate; D04 applicability boundary

- **D01 verified limited execution:** matching exact SHA `51a39d293c06402835a28ac9a766f94d4933eccc`, TREE `9c1676c446f30e2b150b1d1b4dd047d1aac6eb30`, Woodpecker #2234 contexts **3/3 SUCCESS**. Checked-in [r14-d01-ci-recovered](receipts/r14-d01-ci-recovered.json) is a **historical success**, not a verdict for the commit adding this record. R11 original mixed-status failure remains immutable. `CORE-003` stays **PARTIAL**, despite now having a narrow successful source+typed test receipt.
- **D02 candidate (NOT YET CI-QUALIFIED):** using the actual source-pinned Tally task/rule and release projection, compare intact split Elements vs a fused parent Element with identical two public Functions, outcome-by-outcome. Add the distinct negative cases: static DAG cycle fails, semantic cooperation cycle is allowed, and an absent constraint owner is refused. This is a structural/observable counterfactual, **not** an independent semantic oracle or a generalized invariant ownership algorithm.
- **D03 candidate (NOT YET CI-QUALIFIED):** distinct deterministic Chat text, browser-form `URLSearchParams` and CLI `argv` parsing adapters call the **real selected native SDK Function** twice (inspect → confirm); bypass/unknown options fail. No production UI deployment or authorized external transfer is claimed.
- **D04:** current original-source selected BUILD/KDP evidence does not establish a complete Target applicability matrix. Windows/Android/Linux-specific execution is **NOT PROVEN** unless individually pinned and executed; Product/L1 #1496 retains the actual applicable Target set decision. No invented OUT_OF_SCOPE verdict.
- **Current commit boundary:** the newly added D02/D03 tests and D04 report require *new* matching Woodpecker context results before being treated as executed; current Core/Optional/Governance counts stay **9 VERIFIED / 7 PARTIAL; 4 NOT_RUN; 1 NOT_RUN**.


### R15 exact-SHA native D02/D03 PASS and R16 D01 KDP admission candidate

- **R15 exact qualified HEAD** `d2dbda617ed93ad59a33f4e57af2b4858cc41c2e`, TREE `01746a654b1747992da38de8568e21d354f0012e`; [#2235/1](https://ci.kaicreator.com/repos/18/pipeline/2235/1) Integration, [#2235/2](https://ci.kaicreator.com/repos/18/pipeline/2235/2) Node and [#2235/3](https://ci.kaicreator.com/repos/18/pipeline/2235/3) Verify all **SUCCESS**. [Receipt](receipts/r15-d02-d03-native.json) pins the old HEAD only, including native split-vs-parent source-real Tally cases and distinct input adapters. D02 independent semantic oracle and production D03 UI/Host remain **NOT PROVEN**.
- **R16 candidate** adds opt-in `dis.v0.2.kdp-receipt-contract/1` to the *already selected* orders KDP Intent, separate from existing LOCAL `dis.v0.2.function-contract/1`. Real `app.send()` admission may be typed `ADMITTED`; unfamiliar receipt status is `UNKNOWN`; no receipt status can be reinterpreted as completed Effect, current business fact, independent evidence or `SUCCEEDED`. Version guard rejects stale consumers before KDP send; AOT rejects forged `ADMITTED` mappings and a LOCAL binding masquerading as KDP.
- **R16 new tests are candidate only** until this new code HEAD's Woodpecker integration / Node / general verification succeeds. No reviewer, L2 or release claimed. Core remains **9 VERIFIED / 7 PARTIAL**, optional **4 NOT_RUN**, governance **1 NOT_RUN**. Full I/O schema vocabulary, remaining public Function profile, independent business evidence Oracle and cross-version structural diffs still unresolved.


### R16 all three Woodpecker contexts SUCCESS / R17 bounded schema and compatibility candidate

- **R16 exact SOURCE** \`db10ddbc4977a35c31754e4a8e23cdacb063f9a5\`, TREE \`5398b312a36e345c06dd796063f4516c07d34d6e\`; Woodpecker **#2237/1–3 all SUCCESS**. Historical native receipt [r16-kdp-admission-ci.json](receipts/r16-kdp-admission-ci.json) covers real KDP_INTENT typed admission (not Effect completion), source-pinned Tally non-attestation, version guard and fake receipt negatives.
- **R17 new candidate:** bounded \`record\` shape additionally supports explicit \`optional\` fields and \`additionalProperties:false\`; a separate *v2 major* opt-in contract runs against unchanged original Tally source, rejects unexpected keys/nonfinite numbers, preserves real UNKNOWN/OBSERVED. Original v1.0.0 AOT fixture remains unchanged.
- **Compatibility obligation:** \`compareDisV020FunctionContracts(previous,next)\` checks same-major *structural consumer compatibility*: monotone SemVer, input narrowing, existing output field removal/type drift, outcome remapping and evidence-policy weakening. Same-version drift is forbidden. A v2 breaking opt-in Schema is deliberately **not** represented as a compatible in-place update. This pure comparator does not automatically authorize updating a running AOT nor replace independent semantic/business evidence validation.
- R17 tests and source are **NOT CI-VERIFIED** until the newer exact SHA has a successful Woodpecker integration context; distinct general CI contexts must also pass. Counts stay **Core 9 VERIFIED / 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN**.


### R17 3/3 exact-SHA SUCCESS; R18 Tally Release Evidence obligation candidate

- R17 historical HEAD `fe51db3b70450ae3abcc3d42f944d972af20cc2c` / TREE `50496119e01ee54d793be897fb1946d79f585f0f` qualified by Woodpecker [#2238/1](https://ci.kaicreator.com/repos/18/pipeline/2238/1), [#2238/2](https://ci.kaicreator.com/repos/18/pipeline/2238/2), [#2238/3](https://ci.kaicreator.com/repos/18/pipeline/2238/3), **all SUCCESS**; immutable [receipt](receipts/r17-bounded-schema-ci.json) is pinned only to that code HEAD, not this receipt commit or later tests.
- R18 newly profiles original source-pinned Tally `tally.projectReleaseReadiness` as an optional native typed LOCAL Function. A complete-looking 13-gate caller-reported PASS set must still yield `OBSERVATION/NONE`, `UNKNOWN`, `BLOCKED`, `INDEPENDENT_RQ_AND_AUTHORITY_NOT_ATTESTED`, no merge/tag/publish and `evidence.attested=false`. Wrong source SHA, future timestamp, malformed identity and forged `RELEASE_PASS` are negative cases. Unlike an invented business proof, this candidate explicitly **demonstrates non-attestation** of supplied claims.
- Not yet delivered: an actual independent native GitHub C/RQ source attestation, complete Public Function profiles, full recursive I/O Schema, broad cross-version abi. This candidate's new cases require **new matching exact-SHA CI**; do not mark CORE-003 VERIFIED or fake release approvals. Core **9 VERIFIED / 7 PARTIAL**, Optional **4 NOT_RUN**, Governance **1 NOT_RUN**.

### R19 candidate — source-real Knowledge typed Function + Effect receipt contract (no Host dispatch)

- Selected xDownload `getPolicy()` is consumed through the existing **native SDK Function** with `domainId=downloads → OBSERVED`, source pin and `evidence.attested=false`; nested acquisition policy remains KDP-owned. Negative tests reject arbitrary Effect parameters, a forged Domain status, and malformed policy result shapes. This covers one previously unprofiled native Public Function, not a full knowledge-graph query Schema.
- Selected `xdownload.confirmDownload` KDP_INTENT gains a versioned receipt contract, but testing is deliberately **preflight-only**: stale expected version and invalid envelope reject without invoking a non-idempotent external Host acquisition. AOT forbids turning arbitrary terminal status into ADMITTED. Actual terminal Effect receipt, native Host and Target applicability **not proven**.
- The remaining **Runx stateful** Public Function returns a class instance, not a plain structured record; must be treated as an explicit unprofiled lifecycle/opaque-return question, **not forced into a fake record Schema**. Product/L1 decides valid Function result representation. Core 9 VERIFIED / 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN. R19 new tests require its own matched SHA CI.


### R19 #2240 blocked, R19.1 zero-argument Knowledge ABI repair candidate

- Exact historical R19 HEAD `d96fca1e45612cf07102f307f9bb90727a0380a2`/TREE `5be1a1a99aabe1d4eb4547723e7dcecfed03edc3`: [#2240/1](https://ci.kaicreator.com/repos/18/pipeline/2240/1) Integration **FAILURE**, [#2240/2](https://ci.kaicreator.com/repos/18/pipeline/2240/2) Node **SUCCESS**, [#2240/3](https://ci.kaicreator.com/repos/18/pipeline/2240/3) General **SUCCESS**. [Blocked historical receipt](receipts/r19-native-integration-blocked.json) explicitly cannot support a VERIFIED requirement. **Root cause of CI failure UNKNOWN** without step logs.
- Independent source-level compatibility issue: public xDownload Knowledge `invoke('xdownload.describePolicy')` was previously valid with no argument, but the newly added closed-record input would reject it. R19.1 adds bounded `allowAbsent:true` on **only a zero-field closed input**, not output or open/nonempty schemas; no-arg and `{}` both preserve typed `OBSERVED/NONE`, while `null` and injected Effect fields still fail. Same-major ABI comparator rejects removing this permission in a successor.
- These new tests **require new exact-SHA CI**. The original R18 #2239 remains PENDING, and no historical R18 PASS is invented. Core remains 9/16 VERIFIED, 7 PARTIAL; no L2 freeze, merge, or release.


### R19.1 actual CI blocked / R20 Runx native stateful Handle candidate

- R19.1 exact HEAD `4af4cfd82cd6983970279f454e365ecd2b338089`, TREE `7517d615f12f92dc26967c6790d96ff16cdf214f`, [#2241/1](https://ci.kaicreator.com/repos/18/pipeline/2241/1) **FAILURE**, [#2241/2](https://ci.kaicreator.com/repos/18/pipeline/2241/2) and [#2241/3](https://ci.kaicreator.com/repos/18/pipeline/2241/3) **SUCCESS**. The [blocked historical receipt](receipts/r19.1-integration-blocked.json) is *negative evidence*. Root cause of integration failure not conclusively established without step logs.
- R20 real selected `runx.createPresenceObserver` returns `EnvironmentAgentPresence` class instance, with `observe/list/latest` methods, live in-memory state and no execution lease. Add separately versioned `dis.v0.2.local-handle-contract/1` with bounded method shape and `PROCESS_LOCAL` lifetime. This does **not** pretend the handle is JSON-serializable, remotely transportable, or independently attested. SDK preserves `OBSERVATION/NONE`, exact source pin, stale consumer rejection and plain-object forgery refusal. Already-returned handles are **not** claimed to be revoked on `stop()`; KDP maintains its own independent execution authority.
- R20 tests need **fresh exact-SHA native CI** and do not repair/qualify the unresolved R18/R19/R19.1 prior run history automatically. Core 9 VERIFIED / 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN. No L2 Freeze, merge or release.


### R18–R20 native integration repair — first failure from real step logs, exact-SHA SUCCESS

- **Diagnosis (not status guessing):** authenticated Woodpecker step logs for [#2240/1](https://ci.kaicreator.com/repos/18/pipeline/2240/1), [#2241/1](https://ci.kaicreator.com/repos/18/pipeline/2241/1) and [#2242/1](https://ci.kaicreator.com/repos/18/pipeline/2242/1) show all three runs failed on exactly one test: `native compiler rejects Effect downgrade from KDP_INTENT to arbitrary LOCAL rule`. Its `assert.throws` validator received `DisV020Error: DIS_KDP_RECEIPT_BINDING_UNSUPPORTED` from `qualifyDisV020Artifact`'s R16 receipt-binding guard instead of the expected `DIS_LOCAL_NOT_QUALIFIED`: R19 had installed a typed receipt contract on `xdownload.confirmDownload`, so the legacy negative test mutating only `binding` violated the earlier R16 guard. The product check order is load-bearing (pinned by the dedicated R16 test), so the defect was the incomplete fixture mutation, not product code.
- **Repair at exact HEAD `dfba82a7723d709ee22acd65b079fdcc98000f69` / TREE `57b789dff8039888f39e7045e0216b9962ae87fb`:** the downgrade test clone also strips `receiptContract`, restoring a pure KDP_INTENT→LOCAL downgrade mutation. Woodpecker **[#2243/1](https://ci.kaicreator.com/repos/18/pipeline/2243/1) Integration, [#2243/2](https://ci.kaicreator.com/repos/18/pipeline/2243/2) Node and [#2243/3](https://ci.kaicreator.com/repos/18/pipeline/2243/3) Verify all SUCCESS**; 65/65 native consumer tests including R18 (3), R19 (4), R19.1 (3), R20 (4), and the two lane commands after the previously failing one (matrix validator 6/6, C01 assembly 12/12) ran to completion (170 passing lane cases). Immutable [receipt](receipts/r18-r20-native-integration-repaired.json); #2239 canceled and #2240/#2241/#2242 failures stay untouched negative history.
- **Runtime facts, not semantic gates** (Owner clarification 2026-11-08): reproduced pre-repair on Node v26.13.0, verified post-repair on Node v24.21.0 matching the CI worker; engine version is not a conformance precondition. Local gate outside the PR lanes: lint/typecheck green, `test:root` 449+21 passing under Node v24.21.0; the pre-existing Windows-only tar-path failure in `domain-harness-node` packed-stage-equivalence P2-01 reproduces on clean base `4f48c22f`, sits outside the PR #1497 write-set and is not part of any PR CI context.
- Counts unchanged: **Core 9 VERIFIED / 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN**; `CORE-003` stays **PARTIAL** (full public Function profiles, complete recursive I/O schema vocabulary, independent business evidence attestation and broad cross-version ABI remain open). No merge, Freeze or release.

### R21 completed narrow native AOT/SDK semantic conformance (engine-only CI ERROR retained)

- Exact historical SHA `3f6393c49cad2b8e8768c46f5c4b267114ce5ea5` / TREE `a608548721b42cb7ce9f0ed06957b3c59e2e9b34`. [Woodpecker #2249/1](https://ci.kaicreator.com/repos/18/pipeline/2249/1) native Integration **SUCCESS** (selected DKE ED06 Functions actually invoked through AOT/KDP-backed native SDK), [#2249/3](https://ci.kaicreator.com/repos/18/pipeline/2249/3) general Verify **SUCCESS**, [#2249/2](https://ci.kaicreator.com/repos/18/pipeline/2249/2) engine-only verify-min-node **ERROR**. Following Owner's explicit semantic-vs-runtime separation, [r21-native-dke-semantic-ci.json](receipts/r21-native-dke-semantic-ci.json) is marked **DIS_SEMANTIC_ONLY**; no false statement that the overall CI is 3/3 SUCCESS. Existing historical 3/3 receipt checks remain unchanged. New conformance regressions reject missing/failed DIS Integration or general verification even in semantic-only mode.
- Source-real DKE `CONTEXT/REVIEWER_ROOT/GLOBAL` variants used 24 exact-source CQ calls (Tally 12 UNKNOWN, Textile 6 OBSERVED/6 UNKNOWN), plus bounded real-source and registry/reader/evidence fail-closed cases. Cross-project original code and fixed projection are checked in the prior Issue report; external full source graphs and accepted Claims are **not** replaced by a 19-node projection.
- Existing selected DKE LOCAL Knowledge Function does **not** constitute installed DKE Business Package, selected external ECP or reverse CQ→SAP→Package dependency registration. A source pin/declared evidence ref is not an independent Oracle. CORE-002/003/005/016 remain **PARTIAL**; Core 9 VERIFIED/7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN; no merge, Freeze or Release.

### R22 — first bounded AOT source-to-selected-Function reverse dependency

- R21 sealed AOT contains **two separately pinned sources**: DKE original executable core and the Tally/Textile reduced projection. R22 explicitly declares `sourceDependencies:[dke-ed06-projection]` on each of the **three actually selected LOCAL Knowledge Functions**; the existing code `binding.sourceId=dke-ed06-consumer` remains unchanged. Qualification builds `sourceConsumers[sourceId] → selected Function IDs` directly from the sealed AOT, not an invented external registry.
- New native positive verifies the original code *and* the real fixed data projection both map to the three selected Function IDs; native negatives reject missing, duplicated, same-as-execution, cross-origin (Tally-owned source in DKE Domain) and KDP_INTENT source-dependency forgery **before KDP boot**.
- **Boundary:** this is a static trusted AOT provenance edge only. It **does not** demonstrate real external change notification, automatic SAP re-qualification, complete CQ→SAP→external Package/ECP reverse closure, independent graph-Claim acceptance, or runtime authority. Original pin replacement still needs independent trusted builder, new AOT and installed digest. R22 tests are candidates until Woodpecker confirms their exact SHA. Existing R21 semantic-only receipt remains bound to its earlier HEAD `3f6393c`.
- Conformance remains Core **9 VERIFIED / 7 PARTIAL**, Optional **4 NOT_RUN**, Governance **1 NOT_RUN**, no Merge/Freeze/Release and no Node-version gate for semantic checks.


### R25 original Git source evolution QUALIFIED; R26 load-time source pin check CANDIDATE
R25 DIS `58e27c52d35f45557398d56d0cfe72eac08f4ccf` achieved 3/3 SUCCESS at Woodpecker #2261/1–3. Original immutable Tally graph evolved 793→807 with 14 genuine source records, two selected read-only DKE Business Readers reported original source presence only; no semantic Oracle or SAP accepted.
R26 adds an **opt-in**, trusted-installer-provided `expectedSourcePins` map to native DIS `loadDisV020Aot`: validates selected consumed source identifiers, checks AOT SHA256 and full original Git origin identity, and refuses unexpected/malformed/stale pins **before KDP boot**. This is an explicit **checkpoint**, not a watch, automatic revocation/reselection, independent upstream fetch, full-source dependency closure, or semantic authority. R26 must run its own exact SHA native CI before its scoped proof can be marked verified. Core remains **9 VERIFIED / 7 PARTIAL**, Optional **4 NOT_RUN**, Governance **1 NOT_RUN**.


### R27 proposed bounded CQ→SAP→selected Business Function impact (candidate)
R26 exact HEAD `25f13b1...` 3/3 Woodpecker contexts SUCCESS. R27 consumes original DKE R26 Catalog **with exact copied Git Blob**, independently qualifies old/new R25 original Tally source projection versions (793→807, 14 added), compares the two actual selected Business Functions, and demands full bounded Evidence→Locator→Source closure while keeping independent Oracle and both SAPs explicitly **UNQUALIFIED**. The native source anchor rejects a trusted old AOT when the installer selects the newer original source, while unchanged `CQ-T-CROSSCUT` remains semantically stable. Do not imply cross-world source completeness: **two selected readers only, 14-node bounded view**, no automatic revocation or ECP. R27 is PENDING exact-HEAD CI. Core 9 VERIFIED / 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN.


### R28 evidence normalization and remaining round forecast
Historical R27 exact `349b58f985970aeeaf77621a4451154e4cd6a353` (tree `d310878eeb2127adbfc4fa9d2bb368446e6d203b`) achieved **3/3 SUCCESS** at Woodpecker #2263/1–3. R28 adds `r27-native-impact-ci` Git receipt to the machine matrix, references the original four R27 CI-included tests for **CORE-003/005/016 PARTIAL only**, and adds adversarial matrix status/reference tests. R28 also versions the exact outstanding Core **7** and optional **4** in [closure-plan-r28.json](closure-plan-r28.json) and [closure analysis](R28_CLOSURE_PLAN.md). **Forecast after R28:** 5–8 integrated Core+Governance rounds; +2–4 if all Optional profiles required (7–12 total). These are scope-conditional planning ranges, not a promised finish. R28 new HEAD has no inherited CI PASS. Counts stay **Core 9 VERIFIED / 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN**.


### R29 C1 source-first owner split vs generic case Element (candidate)
R28 exact HEAD `2793e61f1cf798d2c3b3ac24abb5c293dbfe4bdf` received Woodpecker #2264/1–3 **3/3 SUCCESS**. R29 adds original DKE exact-Blob source-first ledger + original **synthetic, unapproved** GH recovery locator proposal and a native checker to assess case-specific Element ownership without claiming that a Business Package implementation is the same as an Element semantic owner. The selected two Business Knowledge readers still return `PENDING_REVIEW` and `attested:false`; forged acceptance and closure, omitted original Evidence, and source-identity drift must be rejected. The original GH Case's **16:24→23:03** evidence localization gap is still open; no original Tally change or AOT update is made for the synthetic overlay. C1 remains incomplete due to independent source-owner and SAP approval and versioned Element validation. R29 pending matching CI, Core **9 VERIFIED / 7 PARTIAL**, optional **4 NOT_RUN**, governance **1 NOT_RUN**.


### R30 C1 technical Element versioning and bounded source validation (candidate)
R29 repair `91e48b1b0d6a30173cc0b3cce001040878e381bb` reached Woodpecker **#2266/1–3 all SUCCESS**. R30 registers historical R29 case ownership/semantic gap receipt and implements the previously missing **normative required Element version** and optional source-pin-backed `validation` with `authority:'NONE'`, plus a bounded same-major structural comparator. Native original Tally/Runx/xDownload and DKE selected Business Reader fixtures are explicitly versioned; negative tests reject unversioned Element, forged independent validator, unbound source and incompatible Element export/owner. This is a **Draft v0.2 breaking program-ABI revision** requiring new AOT digest; old unversioned experimental AOTs fail closed. Independent SAP/owner truth and 16:24→23:03 original GH source locator repair remain unqualified. **CORE-002/005 remain PARTIAL; Core 9/16 VERIFIED**, optional 4 NOT_RUN, governance 1 NOT_RUN. R30 new exact-SHA CI pending.


### Batch-first execution adoption / R30 exact CI final
R30 repaired HEAD `4d3e52bc1a14a7c6d1557fd0589f8de3afe600c8` has Woodpecker **#2271/1–3 SUCCESS** at that exact SHA. Its versioned Element/source metadata is a bounded native C1 technical proof, not an authorized semantic SAP; Core remains **9 VERIFIED/7 PARTIAL**; Optional **4 NOT_RUN**, Governance **1 NOT_RUN**. Subsequent DIS v0.2 Demo work follows [Batch policy](BATCH_POLICY.md) and [B01 manifest](batches/B01/manifest.json): 3 default planned rounds (C2 Function schema/evidence, state authority, compatibility/closure) with **each round committed and receipted independently**, batch-level summary only at finish. Policy creation does not execute B01 or promote Core, and current policy commit needs its own exact-SHA CI.


### B01 Batch 3/3 scoped rounds — full native replay exact CI 3/3 SUCCESS
B01 executed three separately committed and versioned rounds R32 Typed Function I/O/Evidence, R33 actual Runx PROCESS_LOCAL state ownership and Rule/Knowledge isolation, R34 Function/Element structural compatibility and stale AOT/source rejection. Each owns four native cases and a distinct original Git test Blob, has separate round.json, ROUND.md and exact-source Git receipt. Original R32 min-node CI ERROR and R33/R34 prior native FAILURE kept; same Writer repaired false policy callback identity comparison. Final qualified replay HEAD `0e0d9ad8b227ed1f1ef90af648e423cd43214563` / TREE `707a0b11b9a8691b7dc7efad7c5d91d3e735edda` passed Woodpecker #2276/1–3 **all SUCCESS**; test Blob fidelity in each receipt. Scope remains bounded; no independent semantic acceptance or complete Domain state profile. [B01 summary](batches/B01/BATCH_SUMMARY.md). **Core 9 VERIFIED / 7 PARTIAL (56.25%), Optional 4 NOT_RUN, Governance 1 NOT_RUN**. No merge/freeze/release.


### B02 scoped source-target/Interaction 3/3 PASS — no premature Core promotion
R35 original Tally/xDownload Business Package and source/AOT lock, R36 UI-neutral Chat/Form/CLI parity, and R37 malicious token URL / oversized bytes / forged Effect negatives were independently Git-committed and receipted with 10 native cases. Earlier #2278/1 and #2279/1 integration ERROR kept; all original round tests requalified under exact `1a803ac452348dc73afea1483a9283cfe527abfc` / TREE `8a478066e61e304c77b9515ee6e92712734b61f4` Woodpecker **#2280/1–3 3/3 SUCCESS**. [B02 summary](batches/B02/BATCH_SUMMARY.md) documents the P1 that current DIS AOT has **no native OS Target variant contract**; native adapters are not production Chat/Form/CLI UI transports. Product/L1 scope and a genuine Target contract/independent semantic owner approval are still needed, so CORE-008/014 **PARTIAL**, total Core **9/16 VERIFIED (56.25%)**, 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN.


### B03 Target-selected module and independent installer / SAP non-authority: 3/3 exact CI PASS
R38/R39/R40 were independently committed and source/CI receipted with 11 new native positive/negative tests. Target `dis.v0.2.selected-target/1` is an optional, digest-sealed original BUILD module roster, and SDK `expectedTarget` independent installer preflight rejects mismatch before real KDP boot; legacy untargeted ABI remains admissible. R40 proves identical real module bytes can be labelled Linux/Windows, and original DKE SAP/source owner remain unapproved/UNKNOWN. Historical #2282/1 and #2283/2 ERROR preserved; full-source exact `2d04fa512b5928c3796dbc6d1173a966c55a6286` / TREE `d2a4fa1bdb14a939067c551353de2e158ec6498d` Woodpecker **#2284/1–3 3/3 SUCCESS**. [B03 report](batches/B03/BATCH_SUMMARY.md). Technical conformance improves, but OS-native Target variant and independent source/SAP authority NOT verified, so Core **9/16 VERIFIED (56.25%)**, 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN.


### B04 C4 source/CI evidence and seven-Core closure gate — CI_PENDING
Three independent code-and-round commits R41/R42/R43 added 11 named positive/negative tests checking B01–B03 nine exact receipt/source paths, historical-vs-current changed test Blob, 21 normative requirement DAG, open original Tally/SAP source owner gate, and false Freeze/Release claims. Original R41 #2286/1 native SUCCESS but #2286/2 ERROR; R42 #2287/1 ERROR; R43 cumulative [#2288/1–3](https://ci.kaicreator.com/repos/18/pipeline/2288/1) **PENDING** at snapshot. No unqualified receipt accepted; [B04 status](batches/B04/BATCH_STATUS.md). Core 9/16 VERIFIED (56.25%); 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN.


### B05 R44–R46 Host/Source native preflight (candidate, CI_PENDING)
Three individually committed source-locked rounds (11 named native cases) add **real process OS/architecture Target mismatch refusal**, opt-in **full original consumed-source installer coverage**, and cross-Domain original Tally/Runx/xDownload + KDP typed admission. Exact candidate `42fc7bde28bdbc653113651f2f87aa1021df614c`, TREE `48bd574c89c1c47e0858ff6d937b255610540035`; #2290/1, #2291/1 and #2292/1 native Integration SUCCESS, but #2290/2 and #2291/2 historical ERROR; full #2292/2–3 PENDING at snapshot. [Batch status](batches/B05/BATCH_STATUS.md). Independent receipts remain PENDING and are not machine accepted; original Business/SAP ownership and independent cross-OS source variant still missing. Core remains 9/16 VERIFIED (56.25%), Optional 4 NOT_RUN, Governance 1 NOT_RUN.


## Final cumulative exact-SHA qualification — supersedes earlier pending snapshot

**VERIFIED for all three source-scoped rounds.** Git HEAD `1a00ecad9dcb795eb6df55cd2f53bd6208e7b9de`, TREE `4c3e3ecbac8cf1489fc807a60ce22806672f414f`, [Woodpecker #2293/1](https://ci.kaicreator.com/repos/18/pipeline/2293/1) native SUCCESS, [#2293/2](https://ci.kaicreator.com/repos/18/pipeline/2293/2) minimum-node SUCCESS, [#2293/3](https://ci.kaicreator.com/repos/18/pipeline/2293/3) Verify SUCCESS. All six original R41–R46 test Git Blobs were re-read and matched the successful cumulative source exactly. Earlier `ERROR` statuses had GitHub descriptions `Pipeline was canceled`, not demonstrated test failures, and remain historical. Separate `round.json`, `manifest.json` and independent `receipts/` now bind qualifying SHA; no full Core promotion, SAP authority, platform multi-variant or Release.


### B06 R47–R49 real HTTP native Chat/Form transport — VERIFIED
Three separate Git source commits introduce real loopback HTTP Form/Chat POST through original AOT-selected xDownload Interaction; negative parser/forged Effect/oversize tests and six-session concurrency/SDK STOP. Eight native cases qualified at exact source `272cc9e52df02a1261cc79b96fa2acd683e88680` / #2300/1-3 3/3 SUCCESS with the three original test Git Blobs unchanged. The #2294/#2295 native failures were root-caused to a B04/B05 receipt-field validator regression (prose in machine-reserved `qualification`), repaired in the same bounded write set without touching any assertion. No inflated Core-014 (still PARTIAL), no production HTTP UI or Host effects. [B06 status](batches/B06/BATCH_STATUS.md).


## R51 exact-source CI qualification — B07-01 VERIFIED (2026-11-09)

Qualification **source HEAD** [`61f32bfc274b701f6b4d8ffcd66f58d4349f22fc`](https://github.com/kaicreator-mm/domain-harness/commit/61f32bfc274b701f6b4d8ffcd66f58d4349f22fc), TREE `1dbcc01229a75dbb259d3f0d96c93b8a33c11369`. Native Integration [#2302/1](https://ci.kaicreator.com/repos/18/pipeline/2302/1), min compatibility [#2302/2](https://ci.kaicreator.com/repos/18/pipeline/2302/2), General Verify [#2302/3](https://ci.kaicreator.com/repos/18/pipeline/2302/3) **3/3 SUCCESS**; original test Git Blob `639cfbcaa09f829f1b0687fff961c99e04a9da9c` unchanged. R51 replays B01–B06 18 source-scoped round receipts and negative forgeries, accepts context/job reordering, and preserves B02 R35 later-source drift as historical. [B07 receipt](receipts/r51-b07-full-ledger-ci.json).

**B07 now 1 VERIFIED / 2 NOT_STARTED**, without declaring three-round batch complete. Core **9/16 VERIFIED / 7 PARTIAL**; Optional 4 NOT_RUN, Governance 1 NOT_RUN. The observed CI confirms executable stored-evidence checks, NOT live independent CI attestation, independent Tally/SAP semantics, applicable Target/Interaction scope, or final L2 Freeze.


## B07-02/R52 and B07-03/R53 exact cumulative replay (supersedes original CI_PENDING)

Original test-source commits remain immutable and distinct: R52 `f2130918d9863aeabd36227886c05cc44c5670cd` / Git Blob `c579299182569a5641683ec93a624eaba703e94b`; R53 `0b4df62efa77e28fc9763f383706199074156170` / Git Blob `dc0a51bfbdae6aba620f7ed596aedcd862732d9b`. They both were present unchanged in full cumulative source `0918e6eb25bc6010b9a31ad58b71fe7e00f4ae3f`, TREE `6fecc2a8c48f69996113d4f4d4fce1f037d79bcf` with Woodpecker [#2305/1](https://ci.kaicreator.com/repos/18/pipeline/2305/1) native, [#2305/2](https://ci.kaicreator.com/repos/18/pipeline/2305/2) min, [#2305/3](https://ci.kaicreator.com/repos/18/pipeline/2305/3) Verify **3/3 SUCCESS**.

R52 now validates exact multi-Function dependency+contract version, including legacy compatibility and fail-closed drift; R53 validates provenance/version-linked semantic relation with a genuinely invoked original xDownload Knowledge verifier but **authority NONE**. No new independent SAP/semantic acceptance, no physical Effects or production Target qualification. [B07 manifest](batches/B07/manifest.json): **3/3 source-scoped rounds VERIFIED**. B01–B07 cumulative **21/21 qualified rounds**, Core **9/16 VERIFIED, 7 PARTIAL**, optional 4 NOT_RUN, governance 1 NOT_RUN. This does not constitute complete DIS product/conformance acceptance.


## B08 R54 genuine Domain-Forge → Domain-Harness production-receipt interop

Original DKE #209 `domain-forge@880a24e...` R6 byte-identical receipt Git Blob `62a992b...` selected as data-only AOT source dependency to read-only DIS Knowledge Function (plus pinned LOCAL reader implementation). Actual old/new Tally source graph versions, original five evidence paths, typed OBSERVED/UNKNOWN, source/exec-origin false-claim negative tests. Source `23dbb0ea5dabe661fb2a309adba00e4dbffe0c89`, TREE `fab96c9328a7bae37336b30a18f3cdc8d131a396`, real #2309/1-3 **3/3 SUCCESS**; previous #2307/#2308 native failures kept as immutable historical negatives. No independent semantic/SAP approval; output authority NONE, no Effect and Core-003/006/016 stay PARTIAL. Total 22/22 scoped Demo rounds, 9/16 Core, 4 Optional NOT_RUN, Governance NOT_RUN.


### B09-01 / R55 — real DKE R9 conditional symbolic proof → native DIS/KDP Knowledge consumer (exact CI VERIFIED)

[Original B09 round](batches/B09/rounds/B09-01/ROUND.md), [B09 closeout](batches/B09/BATCH_SUMMARY.md), [source-verified manifest](batches/B09/manifest.json), and [actual R55 machine receipt](receipts/r55-b09-dke-conditional-proof-native-ci.json). Exact qualifying DIS source `2d96e16942dcff518619b37e4b6c0664ca032ae3`, TREE `f2d708c797216c94439e8b24d4e011699da266fe`, original selected test Git Blob `973eaffc13dd059f929a6ee77045fc11ea86ad93`: true [Woodpecker #2312/1](https://ci.kaicreator.com/repos/18/pipeline/2312/1) native, [#2312/2](https://ci.kaicreator.com/repos/18/pipeline/2312/2) compatibility and [#2312/3](https://ci.kaicreator.com/repos/18/pipeline/2312/3) Verify **3/3 SUCCESS at same source SHA**.

Selected `dke.r9.readProof` Function uses real BUILD/SDK/KDP and exact original upstream DKE R9 DATA Git Blobs `426c7d165c19b7aa459de82d5d776962dba13fb0` + `7387ca838e37d314e28a33e35ef21ba2f4358730`, with separately pinned LOCAL reader Git Blob `5aba024775a759ba992d1bd06f71770c408f3cec`. All 11 source-scoped logical queries preserve 2 ENTAILED, 2 REFUTED, 7 UNKNOWN and `authority:NONE`; the refuted outcome is an observation of refutation, not positive certified knowledge. Immutable R0 overbroad-source and R1 source-first repair histories remain auditable.

**Demo count B01–B09 = 23/23 scoped VERIFIED; product Core 9/16 VERIFIED + 7 PARTIAL, Optional 4 NOT_RUN, Governance 1 NOT_RUN.** Original DKE R9 source facts still same-model authored, SAP=0 and Effect denied. New DKE R10 complete replayable source-conditional SAT certificate is **not consumed by this R55 version** and must not inherit #2312 CI. This docs-only bookkeeping is not a fresh source CI run, Product/L2 Freeze or release.
