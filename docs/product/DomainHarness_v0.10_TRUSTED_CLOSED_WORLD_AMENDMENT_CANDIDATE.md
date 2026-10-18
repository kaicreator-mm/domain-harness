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
- Shift any source/dep/ABI/selection checks out of runtime SDK into producer/BUILD qualification where useful; the SDK consumes already-built modules and known bindings. The BUILD may use ordinary ecosystem tools rather than implement a second package manager.
- L2 should first decide the simplest Node App packaging arrangement (prefer ordinary Node ESM resolution in a built, immutable deployment directory). Drop the older zero-import/`data:` module policy for v0.10 **only after this scoped Product amendment is accepted**; never weaken the already released v0.9 baseline retroactively.
- A small real Node Domain App demonstrating `node:fs` and one npm dependency plus K/S/B/C composition, normal load/init/execute/dispose, a missing-hook typed failure and a real effect/CAS negative test is enough for this architectural change. No recurring BUILD-vs-SDK hash/AST comparison, no Browser/QuickJS matrix, no cryptographic red-team proving trusted Package provenance.
- Reuse T00 (assembly) and T11 (real packed consumers); C01 handles external Effect semantics if relevant. **Do not open new independent Host security-framework issues**.

## 5. Decision record and current limitations

`DESIRED_PRODUCT_ARCHITECTURE=TRUSTED_BUILD_OUTPUT`

`REPEATED_RUNTIME_PACKAGE_VALIDATION=REMOVE`

`PC05_STATIC_ZERO_IMPORT_POLICY=AMEND_TO_ORDINARY_BUILD_RESOLVED_IMPORTS`

`SDK_ROLE=LOAD_LINK_INIT_EXECUTE_DISPOSE`

`PRODUCT_FREEZE=UNCHANGED_PENDING_TARGETED_AMENDMENT`

`L2_FREEZE=NOT_CLAIMED`

**Important:** Frozen v0.10 PRD still requires certain current Host approval/currentness, externally authenticated caller and effect-permit behaviors. This candidate **does not silently delete every security or runtime correctness promise**. During targeted Product impact review, distinguish Package/artifact trust rechecks (to remove) from live caller authorization and external-effect/Kernel correctness (preserve only if required). Do not allow an L2-only commentary to override a frozen Product requirement.
