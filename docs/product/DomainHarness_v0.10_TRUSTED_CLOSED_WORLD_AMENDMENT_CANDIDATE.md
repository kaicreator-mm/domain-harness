# DomainHarness v0.10 — Trusted Closed-World Runtime Simplification (Scoped Product Amendment Candidate)

> **Status:** USER_ARCHITECTURE_CORRECTION / PRODUCT_AMENDMENT_CANDIDATE / NOT YET NORMATIVE. Informed by discussion on 2026-10-18. Does **not** rewrite the exact-R3 frozen v0.10 PRD (blob `673da42ad90acde5ef942beb8ac63b58836a649f`), Product Freeze or implementation DAG. Relevant L2: [#1148](https://github.com/kaicreator-mm/domain-harness/issues/1148); preceding audit: [Host/runtime audit](../architecture/DomainHarness_v0.10_HOST_RUNTIME_ABSTRACTION_AUDIT.md).

## 1. Correct controlling meaning of "closed world"

**All executable SDK/Package code in a generated Domain App is trusted and already selected.** Domain App generation and BUILD own source/variant/dependency resolution, schema/contract conformance checks for static code and declared metadata, version compatibility, artifact assembly and qualifying tests. Build selects the **one target Runtime** (current TypeScript → JS on Node.js 24) and creates a complete executable App. The SDK must **not** treat these trusted modules as hostile, requalify their identity, redo BUILD selection or create an internal artifact-signing/approval system.

**Runtime goal:** `load already-built modules → connect selected interfaces → call necessary init hooks → execute → dispose`. Package may use ordinary Node and npm dependencies via the runtime's native module system. No per-Package VM, Host-local Tool wrapper for private library use, run-time dependency discovery/installation, or special sandbox is required.

**Internal abstraction follows real code design needs**, not speculative cross-runtime compatibility. Another runtime later may have its own SDK and Package implementation cohort.

## 2. Responsibilities, with no repeated static validation inside SDK

| Concern | Producer / BUILD / deployment | SDK / Microkernel during App execution |
| --- | --- | --- |
| Target Runtime, SDK + Package variant and ABI selection | Decide and build the compatible combination | Use provided build output; **no runtime provider selection** |
| npm packages, Node built-ins, native binaries and transitive dependencies | Resolve/build/install and test before release | Use the normal selected runtime module loader; **no SDK dependency scanner** |
| Package sources, graph, export types, Schema/declared contract validity | Analyze/compile/test at build | Link known exports; only simple fail-fast for actually missing/incompatible callable hook as runtime robustness |
| Artifact digest, signatures, provenance, approval and installed-file integrity | Optional BUILD/deployment/distribution governance **outside SDK** | **No SDK rehashing, signed-root verification, AST reparse, approval recheck on each load** |
| Config and runtime resources | Provide build-time defaults/deployment configuration | Package `init/dispose` opens/closes its own connections/files; ordinary failures remain typed/observable |
| Tool/Operation exposure | Compile declared public capability bindings | Invoke exposed capability; private functions and `node:fs` do **not** require Tool Call |
| Live business requests and effect outcomes | Cannot be fully checked before runtime | Owning B/C validates untrusted *runtime input* as appropriate; Kernel manages actual State CAS / Effect identity / Journal / UNKNOWN / idempotency / recovery when functionality requires |

**Trust is about installed code, not future network/user/model inputs or live effect outcomes.** Runtime checks that are necessary to safely handle new data or competing writers are not Package trust verification; keep them only when they support actual runtime correctness, business policy or external callers. Avoid blanket redundant permission checks between trusted internal Package calls. Preserve the frozen product's Kernel correctness goals unless independently respecified.

## 2a. Earliest-feasible validation is the default (not deferred SDK revalidation)

**Principle: perform each check once, at the earliest phase where its relevant facts are knowable and actionable; do not repeat a completed static decision at load, on each Tool Call, or after effects.** "Fail early" is not "run a second verifier during SDK start-up." Package source and dependency facts are known at Package generation/BUILD; artifact distribution issues belong to deployment; live state and unpredictable external outcomes belong to runtime.

| Stage / known facts | Place the decision here | Do NOT defer to |
| --- | --- | --- |
| Package creation: source, types, schema/contract declarations, SDK/Package target compatibility, third-party imports and test fixtures | Producer checks/build/tests while creating each target Package implementation | SDK import, Package `init`, first business turn |
| Domain App BUILD: exact selected Runtime, Package variant/ABI, K/S/B/C mapping, interface collisions/dependency closure, permissions *encoded in the generated static contract*, bundled assets | BUILD resolves and rejects invalid composition; emit a normal complete Node executable App | Dynamic provider discovery or second graph validation during `load` |
| Distribution/deployment: artifact installation, file presence, OS/native binary availability, secrets/config provided at deploy, installation integrity *if required by the deploy environment* | Installation/deployment system checks before starting the App | SDK's per-activation artifact hash, AST parsing, issuer/Package-trust ceremony |
| Startup: resources whose availability depends on the actual running Host (e.g. file access, DB open, socket bind) | Package `init` or deployment readiness checks once, with clear error/cleanup if it fails | First unrelated business request; repeated validation on every turn |
| Business request: actual caller data, tenant/access context, current State revision, Guard and runtime constraints that are not build-time constants | Owning B/K/C evaluates **before** state mutation or external dispatch, once per authoritative turn under its real scope | After a failed/unauthorized mutation or late duplicated validation in unrelated layers |
| External non-idempotent Effect: current reservation/CAS fence, authorized Operation, selected endpoint availability and proven preconditions | Kernel commits necessary durable admission/reservation **before dispatch**; refuse unsupported Effect profile before any external side effect | Discovering an avoidable conflict only after the Effect was dispatched |
| Outcome: remote ACK vs true terminal result, remote failure, crash, timeout or uncertain completion | Observe and reconcile **only when the outcome actually exists**; preserve UNKNOWN and original effect identity | Pretending BUILD or pre-dispatch validation can certify a future remote result |

**Three review questions for every proposed check:** (1) Can it be completely decided before this stage? If yes, move it earlier. (2) Has an upstream producer/BUILD/deploy step already established this immutable fact? If yes, remove the duplicate. (3) Is it actually a live input/state/outcome concern? If yes, place the minimal necessary check immediately **before** the irreversible boundary; only post-execution outcome reconciliation remains afterward. A check without a demonstrable owner, actionable failure and correctness value should be deleted, not relocated.

Build/installation may rely on standard TypeScript/Node/npm tools and tests: **do not replace SDK runtime validation with a new bespoke validation framework elsewhere**. The chosen BUILD qualification depth follows real engineering needs, not automatic maximal adversarial validation. Runtime avoids treating trusted package code as malicious; externally sourced user/model/network input remains data with its own appropriate policies. Keep K's required CAS/admission/Effect/UNKNOWN guarantees, but do not multiply the same check across Microkernel, Host, K and Tool adapter without a demonstrable need.

## 3. Minimal requested v0.10 Product delta (requires targeted amendment disposition)

Frozen Product PC-05 currently mandates per-Package **self-contained zero-import ESM**, imported-byte rechecks, and a closed roster. The previous additive Product Clarification/audit still required pre-evaluation Host verification, and therefore **does not yet reflect this corrected trust model**. This proposal intentionally overrides those recommendations *if adopted*; until adopted, do not claim that the frozen text already permits them.

Proposed **PC-05 successor**:

> BUILD generates a self-contained **Domain App deployment** for one target Runtime. The App may contain many JS/ESM modules, including normal static relative imports, Node built-ins, and BUILD-resolved npm/native dependencies. Dependencies, capability mappings and Package implementations are fixed in the generated App and verified/tested during development/BUILD. SDK/Microkernel loads the already-built App using that selected Runtime's normal module system; it does not repeat artifact-integrity, dependency-closure, Package-trust, provenance or compatibility certification at runtime. No dynamic installation/selection/hot swap of Package implementations during App execution.

Proposed adjacent changes to **PC-06 and L2**:
- Reinterpret "approved Assembly" and "closed graph" as a **completed BUILD/deployment result**, not an SDK-run approval machine. Keep `init/dispose` and deterministic selected binding.
- Remove unnecessary protected Host package-governance controls when they only recheck trusted generated artifacts (e.g. v0.9 `host-v9/registry.ts` repeated hash/zero-import AST/approved-root verification at every activation). Preserve a simple deploy/bootstrap ownership boundary and any real external-caller/Effect correctness contracts independently.
- **No fresh `RuntimeProfileVerifier`, `ModuleLoaderPort`, `SQLCasDocumentStore`, parser gate, sandbox, QuickJS or universal module-graph checker in SDK**.
- Retain runtime-necessary functionality (e.g. CAS concurrency, effect dedup/UNKNOWN, runtime input policy) only on its own merits, not as a reason to rebuild Package trust checks.

## 4. Scope, implementation and evidence

- Reuse selected Node24 SDK/Kernel/Standard/Business/Capability execution code; do not refactor Node APIs out of Core. Package generation or BUILD resolves and prepares npm + native addon dependencies.
- Apply the **earliest-feasible/once-only** decision table above: source/dep/ABI/selection checks belong to producer/BUILD, install/runtime-resource checks to deploy/startup, and live Guard/CAS/Effect admission immediately before an irreversible action. The SDK consumes already-built modules and known bindings. Use ordinary ecosystem tools rather than inventing a new validation framework.
- L2 should first decide the simplest Node App packaging arrangement (prefer ordinary Node ESM resolution in a built, immutable deployment directory). Drop the older zero-import/`data:` module policy for v0.10 **only after this scoped Product amendment is accepted**; never weaken the already released v0.9 baseline retroactively.
- A small real Node Domain App demonstrating `node:fs` and one npm dependency plus K/S/B/C composition, normal load/init/execute/dispose, a missing-hook typed failure and a real effect/CAS negative test is enough for this architectural change. No recurring BUILD-vs-SDK hash/AST comparison, no Browser/QuickJS matrix, no cryptographic red-team proving trusted Package provenance.
- Reuse T00 (assembly) and T11 (real packed consumers); C01 handles external Effect semantics if relevant. **Do not open new independent Host security-framework issues**.

## 5. Decision record and current limitations

`DESIRED_PRODUCT_ARCHITECTURE=TRUSTED_BUILD_OUTPUT`

`REPEATED_RUNTIME_PACKAGE_VALIDATION=REMOVE`

`VALIDATION_PLACEMENT=EARLIEST_FEASIBLE_ONCE_ONLY`

`RUNTIME_PRE_EFFECT_GUARDS=KEEP_ONLY_IF_LIVE_CORRECTNESS_REQUIRES`

`PC05_STATIC_ZERO_IMPORT_POLICY=AMEND_TO_ORDINARY_BUILD_RESOLVED_IMPORTS`

`SDK_ROLE=LOAD_LINK_INIT_EXECUTE_DISPOSE`

`PRODUCT_FREEZE=UNCHANGED_PENDING_TARGETED_AMENDMENT`

`L2_FREEZE=NOT_CLAIMED`

**Important:** Frozen v0.10 PRD still requires certain current Host approval/currentness, externally authenticated caller and effect-permit behaviors. This candidate **does not silently delete every security or runtime correctness promise**. During targeted Product impact review, distinguish Package/artifact trust rechecks (to remove) from live caller authorization and external-effect/Kernel correctness (preserve only if required). Do not allow an L2-only commentary to override a frozen Product requirement.
