# DomainHarness v0.10.1 — L2 Architecture Evidence R0 (REVIEW CANDIDATE)

> **Status:** L2_CANDIDATE / L2_INDEPENDENT_REVIEW_NOT_RUN / L2_NOT_FROZEN / TASK_DAG_NOT_ADMITTED / FEATURE_DRAFTS_NOT_MERGED.
>
> **Product source:** Independently reviewed PR [#1284](https://github.com/kaicreator-mm/domain-harness/pull/1284) R2 exact HEAD \`38bea6d93b4f22654282a3ec37e8696e048aa458\`, two independent PASS reviews, P0=0/P1=0; PRD Git blob \`52b7169f62f040f9c869b288a7e78639473642db\`; Research Owner Crosswalk blob \`a7bc928424b34e7339dd91f59a0b741620064639\`; byte-identical merged \`v0.10.1@a17b7fdf8b156d210efeb4e8a1d5d035f9833ad6\`.
>
> **Formal Product Freeze checkpoint:** [PR #1285](https://github.com/kaicreator-mm/domain-harness/pull/1285) source HEAD \`2e954241cfa35e776e1ddeeb32a4ce64b1992d40\` (VERIFY INTEGRATION before L2 Freeze). Preparing architecture while checkpoint CI may still be pending does not retroactively freeze L2.
>
> **Effective standard:** ADS 4.13.1@\`f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd\`; \`CV-01..12: INHERITED_UNCHANGED\`. No new Kernel authority, K/S ABI or Agent engine.

## A. Architecture question / source inventory

Can four research-inspired, read/evaluation **Standard Feature packages** be independently sealed by the existing v0.10 \`buildV10App\` mechanism, safely invoked by a Domain App as CT-02 named semantic calls, and composed into a physical clean-installed Rich App without another K Primary, Facade permission engine or duplicated T06/T07/Memory?

**Source pins (current v0.10.1 branch predecessor):**
- \`packages/domain-harness-compiler/src/qualified-package/v10build/build.ts\` (blob \`635453a1b4deb6c7e038e7e1473582e5f5188a99\`): roles, ABI/refusal, one K/S Primary, \`requires\` and import closure, unique selected Feature identity.
- \`packages/domain-harness-compiler/src/qualified-package/v10build/activation.ts\` (blob \`62f1ae979fa0267ed6341e01f64d0a2618a1c611\`): CT-02 \`invokeSelectedStandardFeature(key,request,trustedDependencies)\`; its two data channels currently pass directly to the sealed export, **not** runtime-sanitized. Missing/unselected Features refuse typed. **State-changing Decision features are a different path owned by #1267.**
- \`packages/domain-harness-compiler/src/qualified-package/v10build/import-policy.ts\` (blob \`d422ce7ed172a2a84cdb02c5e44e354bbfa0021a\`): sealed import allowlist checked before ESM evaluation but explicit caveat that global/aliased ambient capabilities are not sandboxed.
- \`examples/v010-clean-consumer/build-apps.mjs\` and \`examples/v010-clean-consumer/apps/rich/app-definition.mjs\` (blob \`c7189184f9765224cb533a269275a0ba1c9926d3\` for latter): existing T11 Tiny/Rich qualified target baseline and physical pack/installed-Host acceptance scheme.
- Existing Feature references: \`sfeature-decision-evidence-v1.mjs\` blob \`f41b8d5226a60f93b5fbd029c655d63fc856aa78\`; \`sfeature-candidate-validation-v1.mjs\` blob \`2801aada10c838e2e836dbb30dd97a79ebe56824\`. These already normalize evidence and validate candidate reports. **New C01/C02 must not duplicate these owners.**

## B. Selected deployment and compile-time graph

One Node24 Domain App composed by **the existing Domain App BUILD**:
\`\`\`text
                 Domain App: host-owned trusted BUILD
        K Primary (one) + S Primary (one) + B (>=1) + selected C
                           |
              [optional S Features 0..4]
        +-------------+------------+-------------+--------------+
        | C01 diagnostics | C02 evaluation | C03 experience | C04 experiment |
        +-------------+------------+-------------+--------------+
                 (CT-02 direct read/evaluation facade)
                           |
              bounded data from caller-owned C/B
\`\`\`

The selectable Feature set is \`F={C01,C02,C03,C04}\`; **all 2^4 = 16 subsets**, including none, compile and can be physically packed independently. Each selected feature is one physically independent \`standard-feature\` module using **existing ABI \`dh.v10.standard-feature/1\`**, exactly one \`provides\`, exactly one named callable \`featureExport\`, \`dependencies:[]\`, \`requires:[]\`, and \`externalImports:{node:[],npm:[],native:[]}\`. \`featureExport\` must be callable **at selected load/invocation**, not falsely claimed statically proven by BUILD. No Feature has a required Capability or Business dependency beyond the enclosing valid Domain App's K/S/B graph.

| Feature | Key / export / identity | Input → output summary | Dependency/authority |
| --- | --- | --- | --- |
| C01 #1275 | \`standard:agent-diagnostics/1\` / \`analyzeAgentRun\` / \`sfeature-agent-diagnostics@v0101.0.0\` | source-qualified *already normalized* events and verifier refs → observed first divergence/parallel ambiguous, repetition candidate, missing evidence | T06 normalization is upstream data-only; no Gate PASS/Task ownership |
| C02 #1276 | \`standard:candidate-evaluation/1\` / \`evaluateCandidateEvidence\` / \`sfeature-candidate-evaluation@v0101.0.0\` | verifier+oracle+holdout+matched cases → provisional comparison or \`INCONCLUSIVE/INVALID_EVALUATION\` | T07/Host runs Shadow/verifier; no scoring authority or promotion |
| C03 #1277 | \`standard:experience-reuse/1\` / \`assessExperienceApplicability\` / \`sfeature-experience-reuse@v0101.0.0\` | pinned current scope + candidate refs → review candidates, unknowns, rejected conflicts | Memory C/Context only supply data; no store or automatic authority |
| C04 #1278 | \`standard:bounded-experiment/1\` / \`planBoundedExperiment\` / \`sfeature-bounded-experiment@v0101.0.0\` | hypothesis, verifier plan, budget, preconditions → bounded *proposal*, never execution | business selects plan, K/Host owns permission/physical isolation |

**C05 #1279 disposition: \`NO_NEW_PACKAGE\` pending public selected ABI reuse confirmation.** The existing T02 SemanticDecision and T03 Workflow Control S Features already define bounded generic semantics; application-specific \`CONTINUE/PIVOT/REVISIT\` variants are Business intents under the Tally domain, not new universal Standard rules. Source tests must demonstrate this or report precise missing generic predicate to Product owner.

### B1. BUILD/ABI failure ordering

At BUILD, use the existing \`buildV10App\`:
1. Check exactly one K Primary and S Primary and >=1 B; every role selected ABI (e.g. \`V10_ABI_UNSUPPORTED\`).
2. Check closed dependency graph / missing \`requires\`, duplicate Features (e.g. \`V10_FEATURE_COLLISION\`), authority-namespace forgery, duplicate package IDs.
3. SHA256 pin every selected \`moduleSource\`, error \`V10_DIGEST_MISMATCH\` on changed bytes, and check sealed static import closure \`V10_IMPORT_POLICY_DENIED\` prior to ANY selected module evaluation.
4. On activation, selected-only named CT-02 export exists and is callable, else typed \`V10_FEATURE_ABI_INVALID\`; do not dynamically import a missing module.
5. Immutable selected closure on restart, not runtime hot install of a replacement candidate.

The four actual Features have **no missing \`requires\`** by design; that negative is a SYNTHETIC selected Feature with \`requires:['standard:missing/1']\`. A deliberate bad \`import 'node:fs'\` whose hash is updated tests IMPORT_POLICY denial separately from a tampered digest test.

## C. Two channels: pure data, not ambient sandbox (L2-P2-A)

Current Facade \`invokeSelectedStandardFeature(featureKey,request,trustedDependencies)\` gives the selected export **both** values. The generic Facade does not sanitize either field. Therefore the **Host/Domain App CT-02 callsite must**:
- run both through a **bounded plain-data inspection/copy before the Facade call**, or pass a generated consumer schema-validated snapshot with equivalent effect;
- accept JSON-compatible only (null, bounded string, finite number, boolean, dense bounded arrays, own enumerable plain record keys), a bounded depth/node/byte count, no accessor property, Proxy-derived side effects, functions, symbols, bigint, class instances, Buffer, Dates, K handles, capabilities, effectors, database connections, credentials/secrets;
- refuse or abstain when evidence is incomplete. An **Object getter must not be executed** when validating. Symbol/non-enumerable hidden keys must be rejected or filtered by an independently established safe data projection before input reaches the Feature;
- handle Proxies conservatively: JS Proxy with user-defined traps cannot be proved safe by arbitrary introspection; only accept evidence generated by a trusted data parser/Host projection (e.g. parsed bounded JSON bytes) or a strict producer-owned serialization barrier. Never promise that arbitrary hostile JS Proxy inputs can be sanitized with zero trap execution;
- emit typed/structured local \`FEATURE_INPUT_NOT_PLAIN_DATA\` (Host adapter error, **not** a claimed existing v10 Kernel/ABI error). Denial must yield **zero Feature invocation and zero Kernel/Tool Effect**. This check is Host/producer-owned and does not alter K authority or the existing Facade signature.

**Required witness:** For C01–C04 individually, a legitimate data-only request/dep pair runs; a hostile effector supplied through **request** is denied / unreachable, another through **trustedDependencies** is denied / unreachable; accessor/getter and Host object/secret tests show no effect after the validation boundary. No K/admission receipt may be claimed by an advisory feature.

An implementation **must not "fix" #1267** by altering the state-changing S Primary→K route, and cannot turn a plain advisory observation into a Kernel-permitted event.

## D. Ambient globals: trusted producer boundary and probes (L2-P2-B)

\`externalImports:{node:[],npm:[],native:[]}\` refuses undeclared **ESM imports** but not direct Node global capability or a disguised alias to \`fetch\`, \`WebSocket\`, \`process\`, \`globalThis\`, \`console\`, Node Buffer, timers, etc. The selected import closure is **not a JS capability sandbox**. Per CV-01 selected Package source is trusted/approved at BUILD; ordinary Node globals are a normal trusted runtime facility.

**Chosen strategy (bounded, not a new SDK runtime feature):**
1. Producer source review/AST-based **hygiene test** on C01–C04: no free \`fetch\`/\`WebSocket\`/\`process\`/\`globalThis\`, \`eval/Function\`, \`require\`, \`import()\`, static/indirect forbidden imports, direct \`fs\`/network/process execution or undisclosed side effects; fail explicitly on visible forbidden patterns.
2. Supplement with a physically isolated Node24 test harness that supplies data-only request/deps and instrumented authorized Tool/Effect counters; prove no external-effect dispatch **for the exercised paths**, not universal no side effects.
3. Document source hygiene limitations (aliasing/dynamic JS and ambient globals cannot be exhaustively proven from static text); any need to run *untrusted* Package code requires a separate security Product change and runtime isolation, **not** a hidden promise inside these Feature Packages.

No Kernel code, import-policy semantics, Facade ABI or Host security model change authorized by this L2.

## E. Input/evidence and fault semantics

**Four S packages share only the existing selected ABI**, not an additional shared data wire protocol or central event bus. Each owns versioned bounded pure-input/output schema, exactly one named \`featureExport\`, optional init return confirming \`featureKey\`, deterministic failure/refusal, explicit \`ADVISORY_ONLY\` and \`NOT_DETERMINED\` outputs.

- C01 uses normalized event provenance, disjoint physical retry vs semantic Repair attempts; no manufactured total order of two independent Agents, and a repeated signature alone is not a proven loop root cause.
- C02 comparer requires same cohort/Verifier identity and complete provenance, independently qualified oracle. Missing or leaked holdout prevents even provisional winner classification. Downstream promotion separately authorized by Business governance.
- C03 similarity/provenance not a new memory authority; stale/lost current pin leads to uncertain/refuse, never active-rule override.
- C04 proposal budgets bounded, real Host/Shadow verifier attestation separately established; no \`READY\` flag may be reinterpreted as a K \`EffectPermit\`.

No new domain harness SDK \`KERNEL_*\` error code for analytic data failures; error types are local Feature/Host-adapter identities. Missing selected feature / bad declared callable remains existing \`V10_FEATURE_NOT_SELECTED\`/\`V10_FEATURE_ABI_INVALID\`.

## F. Validation and resource-aware Task DAG **proposal only**

**Target:** Node24/ESM and native SQLite for actual Domain App; do not require Windows/Linux/WSL2 parity as separate OS Gate or Python 3.14. No real remote GitHub effects in baseline validation; synthetic adapters and explicit counters.

| Phase | Positive / negative executable evidence | Intended owner |
| --- | --- | --- |
| V00 - L2/design | exact frozen Product link, data-boundary double channel, ambient caveats, B/S/K/C and C05 reuse disposition | Web Controller and independent L2 Reviewer |
| V01 - Source four PRs | bounded deterministic P/N for one Feature at a time, readonly advice, no K/Host effect, direct ESM unit execution | C01–C04 independent |
| V02 - BUILD 16 subsets | 0, 4 singles, 6 pairs, 4 triples, all four; verify nonselected sources NOT installed/imported, manifest + declared ABI/ref hashes | integration Task |
| V03 - BUILD negatives | wrong ABI, synthetic missing \`requires\`, duplicate Provider, tampered SHA, forbidden import, missing/non-callable export, source/Evidence conflict | integration Task |
| V04 - CT-02 two-channel | one safe request+deps; injected Host function/effect handles in request and dependencies; getter, object, secret failure *per feature* | integration Task |
| V05 - exact pack/install | real packed standalone Feature producer, copied BUILD source digests, isolated clean-installed Tiny and Rich under Node24 with file-backed SQLite; genuine named Feature invocation | integration Task |
| V06 - regression | old Tiny/Rich v0.10 cases, guarded Effect denial, Shadow zero production write and old version pin / restart if relevant | final Version validation |
| R01 - version closure | independent exact-SHA code reviews, CI/waiver truth, limited full regression + critical journeys + Hidden only if applicable, release decision | Version controller |

**Possible DAG, not yet admitted:** \`ProductFreeze → L2Freeze → DAGAdmission → {C01,C02,C03,C04} → T05 Integration + optionality → R01 Qualification\`; C05 is a source-only reuse disposition, not a fifth Feature PR. Do NOT inflate this proposal into live GitHub native \`blocked_by\` edges before L2 Freeze.

**Existing source spikes** [#1280](https://github.com/kaicreator-mm/domain-harness/pull/1280)–[#1283](https://github.com/kaicreator-mm/domain-harness/pull/1283) were not separately admitted formal Task PRs. After DAG admission, refresh their exact HEAD/claims and independent reviews, retarget any source fixes to the frozen L2; never count pre-admission V8 probes as the physical validation required in V05.

## G. L2 review ask / release boundary

Independent Reviewer must compare this L2 against the **byte-identical Frozen Product** (or declare \`PRODUCT_FREEZE_INCOMPLETE\` if PR #1285 not formally integrated) and inspect current v10 selected ABI, Feature imports, Host CT-02 callsite, original v0.10 regression evidence, and #1267/#1270 ownership. Output \`P0/P1/P2, L2_DESIGN_READY, COMPAT_DECISION, PASS/BLOCK\` at one exact commit. If a P1 is found, edit only the bounded L2 delta then re-review exact HEAD. Product change requires thaw/amendment; don't silently patch the reviewed PRD.

Only after independent L2 acceptance and explicit Architecture Freeze may a real Task DAG and formal implementation admission proceed. L2 PASS never proves Node24 execution or v0.10.1 release.
