# DomainHarness v0.10.1 — L2 Architecture Evidence R0 (REVIEW CANDIDATE)

> **Status:** L2_CANDIDATE / L2_INDEPENDENT_REVIEW_NOT_RUN / L2_NOT_FROZEN / TASK_DAG_NOT_ADMITTED / FEATURE_DRAFTS_NOT_MERGED.
>
> **Product source:** Independently reviewed PR [#1284](https://github.com/kaicreator-mm/domain-harness/pull/1284) R2 exact HEAD `38bea6d93b4f22654282a3ec37e8696e048aa458`, two independent PASS reviews, P0=0/P1=0; PRD Git blob `52b7169f62f040f9c869b288a7e78639473642db`; Research Owner Crosswalk blob `a7bc928424b34e7339dd91f59a0b741620064639`; byte-identical merged `v0.10.1@a17b7fdf8b156d210efeb4e8a1d5d035f9833ad6`.
>
> **Formal Product Freeze checkpoint:** [PR #1285](https://github.com/kaicreator-mm/domain-harness/pull/1285) source HEAD `2e954241cfa35e776e1ddeeb32a4ce64b1992d40`, merged `v0.10.1@208c35592d7d3c8d40bb6ab0720722e1193f31cd`, Freeze blob `edd24015b42084c15b61d12282585d60af37d50e`. **Product FROZEN**, independent L2 Review/Freeze remain NOT_RUN. Docs-only checkpoint min-node CI SUCCESS and full CI PENDING with explicit bounded waiver, not a claim of full CI PASS.
>
> **Effective standard:** ADS 4.13.1@`f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`; `CV-01..12: INHERITED_UNCHANGED`. No new Kernel authority, K/S ABI or Agent engine.

## A. Architecture question / source inventory

Can four research-inspired, read/evaluation **Standard Feature packages** be independently sealed by the existing v0.10 `buildV10App` mechanism, safely invoked by a Domain App as CT-02 named semantic calls, and composed into a physical clean-installed Rich App without another K Primary, Facade permission engine or duplicated T06/T07/Memory?

**Source pins (current v0.10.1 branch predecessor):**
- `packages/domain-harness-compiler/src/qualified-package/v10build/build.ts` (blob `635453a1b4deb6c7e038e7e1473582e5f5188a99`): roles, ABI/refusal, one K/S Primary, `requires` and import closure, unique selected Feature identity.
- `packages/domain-harness-compiler/src/qualified-package/v10build/activation.ts` (blob `62f1ae979fa0267ed6341e01f64d0a2618a1c611`): CT-02 `invokeSelectedStandardFeature(key,request,trustedDependencies)`; its two data channels currently pass directly to the sealed export, **not** runtime-sanitized. Missing/unselected Features refuse typed. **State-changing Decision features are a different path owned by #1267.**
- `packages/domain-harness-compiler/src/qualified-package/v10build/import-policy.ts` (blob `d422ce7ed172a2a84cdb02c5e44e354bbfa0021a`): sealed import allowlist checked before ESM evaluation but explicit caveat that global/aliased ambient capabilities are not sandboxed.
- `examples/v010-clean-consumer/build-apps.mjs` and `examples/v010-clean-consumer/apps/rich/app-definition.mjs` (blob `c7189184f9765224cb533a269275a0ba1c9926d3` for latter): existing T11 Tiny/Rich qualified target baseline and physical pack/installed-Host acceptance scheme.
- Existing Feature references: `sfeature-decision-evidence-v1.mjs` blob `f41b8d5226a60f93b5fbd029c655d63fc856aa78`; `sfeature-candidate-validation-v1.mjs` blob `2801aada10c838e2e836dbb30dd97a79ebe56824`. These already normalize evidence and validate candidate reports. **New C01/C02 must not duplicate these owners.**
**Additional original owners checked for this L2 delta:** T09 `standard:meta-feedback/1` + `v10meta/meta-feedback-workflow.ts` already normalize bounded Meta proposals (MAX_NODES/DEPTH, AUTHORITY_KEYS): C04 only formulates independent experimental comparison plans. T07 existing Candidate Validation and `snapshot()` already check candidate reports: C02 only compares matched, independent verifier/oracle evidence and is not a second T07 verifier. `standard:context-assembly/1` assembles Context: C03 only screens source-qualified experience applicability and does not assemble Context or store Memory. Reuse T07/T09 snapshot patterns without copying their responsibilities.

## B. Selected deployment and compile-time graph

One Node24 Domain App composed by **the existing Domain App BUILD**:
```text
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
```

The selectable Feature set is `F={C01,C02,C03,C04}`; **all 2^4 = 16 subsets**, including none, compile and can be physically packed independently. Each selected feature is one physically independent `standard-feature` module using **existing ABI `dh.v10.standard-feature/1`**, exactly one `provides`, exactly one named callable `featureExport`, `dependencies:[]`, `requires:[]`, and `externalImports:{node:[],npm:[],native:[]}`. `featureExport` must be callable **at selected load/invocation**, not falsely claimed statically proven by BUILD. No Feature has a required Capability or Business dependency beyond the enclosing valid Domain App's K/S/B graph.

| Feature | Key / export / identity | Input → output summary | Dependency/authority |
| --- | --- | --- | --- |
| C01 #1275 | `standard:agent-diagnostics/1` / `analyzeAgentRun` / `sfeature-agent-diagnostics@v0101.0.0` | source-qualified *already normalized* events and verifier refs → observed first divergence/parallel ambiguous, repetition candidate, missing evidence | T06 normalization is upstream data-only; no Gate PASS/Task ownership |
| C02 #1276 | `standard:candidate-evaluation/1` / `evaluateCandidateEvidence` / `sfeature-candidate-evaluation@v0101.0.0` | verifier+oracle+holdout+matched cases → provisional comparison or `INCONCLUSIVE/INVALID_EVALUATION` | T07/Host runs Shadow/verifier; no scoring authority or promotion |
| C03 #1277 | `standard:experience-reuse/1` / `assessExperienceApplicability` / `sfeature-experience-reuse@v0101.0.0` | pinned current scope + candidate refs → review candidates, unknowns, rejected conflicts | Memory C/Context only supply data; no store or automatic authority |
| C04 #1278 | `standard:bounded-experiment/1` / `planBoundedExperiment` / `sfeature-bounded-experiment@v0101.0.0` | hypothesis, verifier plan, budget, preconditions → bounded *proposal*, never execution | business selects plan, K/Host owns permission/physical isolation |

**C05 #1279 disposition: `NO_NEW_PACKAGE` pending public selected ABI reuse confirmation.** The existing T02 SemanticDecision and T03 Workflow Control S Features already define bounded generic semantics; application-specific `CONTINUE/PIVOT/REVISIT` variants are Business intents under the Tally domain, not new universal Standard rules. Source tests must demonstrate this or report precise missing generic predicate to Product owner.

### B1. Independent package production and distribution

**Product distinction:** The existing Draft PRs #1280–#1283 store prototype sources and private pack recipes under `examples/v0101-*`. That is **not** sufficient for final SDK Package delivery, even if `npm pack` accepts the private producer. Formal accepted implementation must package each C01–C04 as its **own installable ESM artifact**, not four exports hidden in one aggregate library or four unqualified example scripts.

**Selected packaging route:** Each concern's Builder owns one independent package producer under `extensions/agent-improvement/packages/<feature>/` with a unique `@kaicreator/domain-feature-*` package identity, independent source entrypoint, `package.json` exports, module/manifest declaration, source tests, and pinned version. **Root CI enrollment is explicitly owned by the single integration Task T05.** Keep existing root `workspaces:["packages/*"]`, root `package.json` and package-lock unchanged. Independent `extensions/agent-improvement/packages/<feature>/` tarball producers are NOT root workspaces and need explicit `npm test --prefix extensions/agent-improvement/packages/<feature>`. T05 creates `tests/hosts/node/v0101-feature-suite.test.ts` and `tests/conformance/v0101-sdk-features.test.ts`, both already selected by existing `test:root` globs `tests/hosts/node/*.test.ts` and `tests/conformance/*.test.ts`. These filenames are planned implementation paths, not files claimed present. No four-PR write collision on root package.json. If the existing globs are insufficient, require a bounded L2 amendment rather than silently changing workspaces. Source prototypes may be moved from `examples/v0101-*` to these producer paths in the same concern PR; do not preserve duplicate authoritative code copies.

**Consumer contract:** BUILD consumes the exact installed producer module bytes as `moduleSource`, computes `moduleSha256`, seals feature key/exports/import allowances and writes them into the Domain App artifact. The App's clean installation must contain each selected sealed module physically, and contain none of its unselected counterparts. A producer `npm pack` PASS alone does **not** prove the selected Application package, CT-02 runtime invocation or offline installed behavior. No new generic package loader, runtime plugin marketplace or dynamic import path is introduced.

**Acceptance / traceability:** `npm pack` each selected producer in a clean staging location; install it into a separate isolated BUILD directory using the tarball (not monorepo absolute path); BUILD the selected Tiny and Rich Apps; inspect installed module resolution and manifest byte hashes; exercise all 16 allowed selection sets and at least Tiny/Rich physical execution, negative invalid/duplicate/tamper inputs, teardown and existing v0.10 Effect/Journal regressions. If package-private `private: true` remains, explicitly label distribution as local pack/install rather than publishability; do not assert npm registry publication.

### B2. BUILD/activation exact failure semantics

1. BUILD role cardinality first (`V10_ROLE_CARDINALITY`), then per-role ABI (`V10_ABI_UNSUPPORTED`), then Feature declared shape (`BUILD_GRAPH_INVALID`).
2. BUILD provider/feature identity collision (`V10_FEATURE_COLLISION`), optional feature selection/skip, then dependency/required-feature/cycle closure (`V10_DEPENDENCY_*`, `V10_FEATURE_MISSING`).
3. BUILD sealed byte digest (`V10_DIGEST_MISMATCH`), then external-import validation (`V10_IMPORT_POLICY_DENIED`) **before any module evaluation**. BUILD does not execute ESM modules or prove their exports are callable.
4. Activation requires the **exact sealed namespace** `MODULE_ID`, `PACKAGE_KIND`, `FEATURE_ABI`, `FEATURE_KEY`, `init`, one declared `featureExport`, with only `dispose` additionally allowed. A missing `featureExport`, missing `init`, or an extra export (such as an exported `*Error` class) fails **`V10_EXPORT_CONTRACT_REFUSED` during activation**, before init. Four Draft C01–C04 prototypes had this actual defect; their error classes have now been made private without removing their observable error `code`.
5. A declared `featureExport` that exists but is not callable fails **`V10_FEATURE_ABI_INVALID` at selected invocation**. This is different from missing/extra export. Mandatory `init(context)` must return `ok:true` and sealed `featureKey` with only the existing `INIT_RETURN_FIELDS` (`ok,providerId,hook,featureKey,observedContext`). An illegal top-level `appId` fails **`V10_INIT_CONTRACT_REFUSED`**; all four prototypes now put it inside `observedContext:{appId}`. Real Node24 Activation witnesses remain NOT_RUN.
6. Selected closure is immutable on restart; no runtime feature installation or dynamic replacement.

All real C01–C04 packages have `requires:[]`; the required-feature negative must be a synthetic Feature declaring `requires:['standard:missing/1']`. A forbidden `node:fs` import with recomputed digest checks import closure separately from digest corruption.

## C. CT-02 two-channel pure data — exact Host owner, restricted to four keys (L2 P2-A, R0 P1-2)

The existing general facade `invokeSelectedStandardFeature(featureKey,request,trustedDependencies)` passes both arguments as-is. **Do not modify it** and do not apply a JSON-only policy to other v0.10 Standard Features. T02 `standard:semantic-decision/1` legitimately uses callable dependencies (`model`, `tool`, `now`, timeout control and a `procedures` Map); a global data-only wrapper would break T02 and FR08.

**Single Host owner:** integration Task T05 implements `extensions/agent-improvement/host/ct02-data-only-invoker.mjs`, exporting `invokeAgentImprovementFeature(facade, featureKey, request, trustedDependencies)` and `FeatureInputNotPlainDataError` with `code='FEATURE_INPUT_NOT_PLAIN_DATA'`. The error class is exported by the Host adapter only; no additional export is permitted in the sealed C01–C04 Feature namespaces. The Host adapter has an **exact allowlist of four feature keys**: `standard:agent-diagnostics/1`, `standard:candidate-evaluation/1`, `standard:experience-reuse/1`, `standard:bounded-experiment/1`. It rejects every nonlisted key; existing T02/T03/T06/T09 invoke paths continue unchanged using their current legitimate dependency contracts.

The T05 Host adapter normalizes/validates **both request and trustedDependencies before invocation**. Input contract: bounded plain JSON-like data, finite numbers, capped depth/nodes/bytes and dense arrays; own data properties only; no getters/setters, functions, symbols, bigint, class instances, handles/effectors, DB connections or secrets. Reject dangerous authority-shaped keys, and preserve source reference strings as data only. Denial raises the Host-local typed error **before** reaching the Feature; no K/Tool Effect or Feature invocation is permitted on that call. Avoid depending on shallow `isPlainRecord` as a deep validator. Reject or normalize through a trusted JSON parser any opaque/Proxy-like input; JS Proxy introspection may itself trigger traps, so no general claim of zero-trap hostile Proxy validation is authorized.

**Defence in depth:** each C01–C04 producer also retains its own bounded, accessor-free first-argument schema/snapshot checks, but these do not replace the Host adapter. It is one shared Host boundary, not four independent validators. Selected read/evaluation calls through this Host adapter never become an S Primary interpret route; state-changing S→K dispatch is owned by #1267.

**Tests:** for each of four keys, genuine data-only request/dependencies accepted; injected effector/getter in request refused, injected effector/getter in trustedDependencies refused; denial has zero selected Feature calls and zero K/Tool Effects. In the **same Rich App**, T02 must still pass callable model/tool/procedure dependencies under its existing direct contract. This is a mandatory FR08 regression witness.

## D. Ambient Node globals and approved producer boundary (L2 P2-B)

Existing BUILD import-policy already checks `eval`, Function-family constructors, `require`, `.constructor`, computed import and undeclared ESM/module imports with the pinned vendored Acorn parser. **Do not duplicate or fork these existing checks.** Empty `externalImports` does NOT sandbox `fetch`, `WebSocket`, `process`, `globalThis`, timers or Buffer.

Add one **producer-path-only delta hygiene** test for direct ambient I/O usage (`fetch`, `WebSocket`, `process`, `globalThis`, timers, `Buffer`) using the existing pinned parser or already-locked ESLint `no-restricted-globals`; no new dependency or change to import-policy ABI. This is bounded source hygiene, not a proof against aliases or malicious approved code. Preserve the CV-01 trusted-closed-world Package assumption; truly untrusted JS would need a separately authorized security product.

Supplement with real Node24 clean-installed Rich/Tiny tests, zero-effect counters for exercised code paths, and input data-only Host boundaries. Report physical results only after actual tests. No new Kernel, sandbox, loader or global monkey patching.

## E. Input/evidence and fault semantics

**Four S packages share only the existing selected ABI**, not an additional shared data wire protocol or central event bus. Each owns versioned bounded pure-input/output schema, exactly one named `featureExport`, **mandatory** init return confirming `ok:true` and `featureKey`, deterministic failure/refusal, explicit `ADVISORY_ONLY` and `NOT_DETERMINED` outputs.

- C01 uses normalized event provenance, disjoint physical retry vs semantic Repair attempts; no manufactured total order of two independent Agents, and a repeated signature alone is not a proven loop root cause.
- C02 comparer requires same cohort/Verifier identity and complete provenance, independently qualified oracle. Missing or leaked holdout prevents even provisional winner classification. Downstream promotion separately authorized by Business governance.
- C03 similarity/provenance not a new memory authority; stale/lost current pin leads to uncertain/refuse, never active-rule override.
- C04 proposal budgets bounded, real Host/Shadow verifier attestation separately established; no `READY` flag may be reinterpreted as a K `EffectPermit`.

No new domain harness SDK `KERNEL_*` error code for analytic data failures; error types are local Feature/Host-adapter identities. Unselected key: `V10_FEATURE_NOT_SELECTED`; missing/extra sealed export: `V10_EXPORT_CONTRACT_REFUSED` at activation; present-but-noncallable export: `V10_FEATURE_ABI_INVALID` at invocation; bad mandatory init: `V10_INIT_CONTRACT_REFUSED`. The new Host error `FEATURE_INPUT_NOT_PLAIN_DATA` is defined only by the T05 Host adapter, never by K Primary or Feature module.

## F. Validation and resource-aware Task DAG **proposal only**

**Target:** Node24/ESM and native SQLite for actual Domain App; do not require Windows/Linux/WSL2 parity as separate OS Gate or Python 3.14. No real remote GitHub effects in baseline validation; synthetic adapters and explicit counters.

| Phase | Positive / negative executable evidence | Intended owner |
| --- | --- | --- |
| V00 - L2/design | exact frozen Product link, data-boundary double channel, ambient caveats, B/S/K/C and C05 reuse disposition | Web Controller and independent L2 Reviewer |
| V01 - Source four PRs | bounded deterministic P/N for one Feature at a time, readonly advice, no K/Host effect, direct ESM unit execution | C01–C04 independent |
| V02 - BUILD 16 subsets | 0, 4 singles, 6 pairs, 4 triples, all four; verify nonselected sources NOT installed/imported, manifest + declared ABI/ref hashes | integration Task |
| V03 - BUILD and activation negatives | wrong ABI, synthetic missing `requires`, duplicate Provider, tampered SHA, forbidden import at BUILD; missing/extra export at activation; present/noncallable export at invocation; bad init, source evidence conflict | integration Task |
| V04 - CT-02 two-channel | one Host adapter with four-key allowlist; safe request/deps plus injected callback/getter in both channels per feature; in same Rich App T02 callable deps continue unchanged | T05 integration Task |
| V05 - exact pack/install | real packed standalone Feature producer, copied BUILD source digests, isolated clean-installed Tiny and Rich under Node24 with file-backed SQLite; genuine named Feature invocation | integration Task |
| V06 - regression | old Tiny/Rich v0.10 cases, guarded Effect denial, Shadow zero production write and old version pin / restart if relevant | final Version validation |
| R01 - version closure | independent exact-SHA code reviews, CI/waiver truth, limited full regression + critical journeys + Hidden only if applicable, release decision | Version controller |

**Possible DAG, not yet admitted:** `ProductFreeze → L2Freeze → DAGAdmission → {C01,C02,C03,C04} → T05 Integration + optionality → R01 Qualification`; C05 is a source-only reuse disposition, not a fifth Feature PR. Do NOT inflate this proposal into live GitHub native `blocked_by` edges before L2 Freeze.

**Existing source spikes** [#1280](https://github.com/kaicreator-mm/domain-harness/pull/1280)–[#1283](https://github.com/kaicreator-mm/domain-harness/pull/1283) were not separately admitted formal Task PRs. After DAG admission, refresh their exact HEAD/claims and independent reviews, retarget any source fixes to the frozen L2; never count pre-admission V8 probes as the physical validation required in V05.

## G. L2 review ask / release boundary

Independent Reviewer must compare this L2 against the **byte-identical Frozen Product** (and verify integrated Product Freeze #1285 exact blob/merged baseline) and inspect current v10 selected ABI, Feature imports, Host CT-02 callsite, original v0.10 regression evidence, and #1267/#1270 ownership. Output `P0/P1/P2, L2_DESIGN_READY, COMPAT_DECISION, PASS/BLOCK` at one exact commit. If a P1 is found, edit only the bounded L2 delta then re-review exact HEAD. Product change requires thaw/amendment; don't silently patch the reviewed PRD.

Only after independent L2 acceptance and explicit Architecture Freeze may a real Task DAG and formal implementation admission proceed. L2 PASS never proves Node24 execution or v0.10.1 release.
