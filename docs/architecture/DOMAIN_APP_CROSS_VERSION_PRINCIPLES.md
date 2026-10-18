# DomainHarness — Cross-Version Domain App Runtime Principles

> **Scope:** domain-harness Product/L1, L2, Task DAG, implementation and release planning for v0.10 and **later versions**, including future SDK/Package target runtimes. This is a **project-specific enduring architectural decision**, not an ADS rule for unrelated repositories. Historical released versions and previously frozen exact-SHA decisions remain immutable. Adopted through the project's normal reviewed PR path; an in-flight frozen Product contradiction requires its own scoped amendment before implementation.
>
> **Canonical entrypoint:** root [AGENTS.md](../../AGENTS.md) → [.dev-standard/PROJECT_OVERRIDES.md](../../.dev-standard/PROJECT_OVERRIDES.md) → **this document**. The parent project repository, not conversation memory or a v0.10 Issue comment, is the authority for these continuing decisions.
>
> Related historical decisions: [v0.10 trusted-closed-world Product Amendment A01](../product/DomainHarness_v0.10_PRODUCT_AMENDMENT_A01_TRUSTED_BUILD_OUTPUT.md) (PR #1158; **proposed/pending independent Product acceptance** as recorded when this document was authored), [A01 intake](../product/DomainHarness_v0.10_TRUSTED_CLOSED_WORLD_AMENDMENT_CANDIDATE.md), and [Host/runtime audit](DomainHarness_v0.10_HOST_RUNTIME_ABSTRACTION_AUDIT.md). They are evidence/history; the cross-version principles do not silently approve a pending version-specific amendment.

## 1. The enduring model

> **SDK and Domain Packages are implemented for a target Runtime. Package generation / Domain App BUILD resolves, selects, verifies as needed and composes them; execution runs one determined, trusted, closed-world Domain App. Internal abstractions follow normal software engineering needs.**

**CV-01 — Trusted Domain App composition.** A deployed Domain App consists of selected, prebuilt SDK + Kernel/Standard/Business/Capability Package implementations. This code is trusted/approved by the development/BUILD/deployment process, not an untrusted plugin population that runtime SDK must re-certify. Trust in *installed code* does **not** imply that new user, network, Agent or model inputs are trustworthy.

**CV-02 — One chosen runtime; independent implementation variants.** Both the **SDK** and **Domain Packages** may have different implementations per target runtime. Domain App BUILD selects exactly one compatible *local execution runtime/Host profile* and the corresponding SDK and Package implementations; all local modules use that same selected environment. Versions/tags may help choose compatible candidates at BUILD, but no Package-level local interpreter, on-demand variant switching, unbounded plugin discovery or dynamic dependency installation is required at runtime. **v0.10 has only TypeScript → JavaScript on Node.js as an implemented target**; other runtimes are a possible future implementation, not today's compatibility obligation.

**CV-03 — Package owns private implementation.** Package generation prepares private source, build configuration and dependencies for a target Runtime. Domain App BUILD assembles selected implementations and uses the target runtime's normal module system. Inside the trusted generated App, ordinary functions, Node built-ins, npm modules, native dependencies, validators, parsers, Workflow engines, database drivers and internal helper abstractions are **normal implementation details**. A Package may own scoped runtime config, connections, files and `init/dispose` resources, **not** a separate JS runtime per Package. Cross-Package **public semantic/capability contracts** must not leak accidental implementation classes/resources or secrets.

**CV-04 — Check at the earliest feasible owner, once.** Do a check **only if it provides a concrete correctness/product value**, and place it at the first stage when its facts are known:
- Package producer: source/types/schema/dependency declarations, local tests.
- Domain App BUILD: selected Runtime, SDK+Package compatibility, dependency closure, contracts, deterministic providers/routes/initialization composition.
- Deployment: install completeness, environment/native module availability and optional distribution integrity, where genuinely applicable.
- Startup Package `init`: actual live resource availability and appropriate cleanup on failure.
- Before an irreversible runtime operation: only **live** user/caller/business/State/CAS/Effect constraints that could not be decided earlier.
- After an actual external attempt: only observable outcomes and necessary UNKNOWN/recovery handling.

Never use "fail early" to justify **another SDK-time static trust check** already done by producer/BUILD/deployment. Do not move redundant SDK checks into a new redundant compiler/approval framework either. Do not mandate maximum adversarial verification of every trusted Package. For each proposed check ask: *could it have been done earlier; has it already been done; is it live data/outcome-dependent?* Remove duplicate/no-value checks.

**CV-05 — Minimal runtime SDK.** Generated App consumption is **load known compiled modules → connect known interfaces → necessary init → execute → dispose**. The SDK/Microkernel is not a runtime Package publisher verifier, signature authority, dependency-tree analyzer, per-load module checksum service, AST import scanner, multi-runtime compatibility negotiator or per-Package sandbox. Build/deploy decisions are not re-litigated at each startup or request. Ordinary Node/native/npm imports in Package implementation need **no Tool Call wrapper** merely because they are imports.

**CV-06 — Preserve actual runtime correctness.** A trusted executable still handles unknown *future* inputs, changing State, concurrent writers and external effects. Retain exactly the live rules needed for one Kernel Primary's authoritative Admission/State/Journal/Effect/Replay/UNKNOWN, physical true CAS, idempotency/original-receipt replay, tenant/Business scope where applicable, effective business Guards before mutation, and real remote outcome reconciliation. Avoid repeated security/permission rituals between trusted internal packages; do not drop authentic external caller boundaries or allow model output to mint an Effect merely by calling it trusted code.

**CV-07 — Distinguish internal calls and exposed capabilities.** A Package's private libraries/helpers are not automatically Tools. Independently callable capability offered to a different Package, Workflow or client is a selected Tool/Operation interface; semantic S components dispatch through their semantic contracts; the single Kernel remains authoritative for mutations. Do not invent a generic Tool runtime, Host plugin system or native-library proxy to satisfy the existence of npm/Node imports.

**CV-08 — Abstraction only when justified.** Create a Port/interface/adapter if a **real current boundary** requires it (e.g. physical CAS persistence, separately provided Capability, actual external effect adapter, testability/maintainability). Do **not** mandate `NodePort`, `CryptoPort`, `ModuleLoaderPort`, `ParserPort`, `ValidatorPort`, `XStatePort`, `SQLCasDocumentStore`, a QuickJS engine or a cross-OS test matrix for speculative multi-runtime portability. Implementation can freely use `node:*`, SQLite, Ajv, Acorn, XState, JSONata, YAML etc. inside a Node-targeted implementation. Future targets may have independent SDK/Package code instead of forcing one source tree to support every runtime.


**CV-09 — Embedded Domain App SDK, not an ecosystem replacement.** DomainHarness supplies the execution SDK/Microkernel, Kernel and Standard semantics, Package contracts and the selected runtime lifecycle. It is not a second generic Agent platform, provider/model orchestration gateway, domain database, UI framework, knowledge production service or engineering environment manager. Domain Data authoring/generation, simulation and UX belong to their owning ecosystem components; model/provider policy belongs to AI Runtime or the chosen provider capability. Named integrations remain **external consumers/adapters**, not forced DomainHarness runtime dependencies. This is a responsibility boundary, not a ban on separately selected capabilities.

**CV-10 — Minimal Basic composition and optional features.** A useful Domain App can be generated with one K Primary, one S Primary, its Business Package(s) and only the needed Capability Package(s). Advanced Workflow, Agent, Memory, Evidence, Shadow, optional K/S extensions and other richer semantics are **selected when needed**, not mandatory modules or separate always-on engines for every App. Rich Apps may compose separate optional implementation Packages; optional feature absence does not cause eager import/init of an unselected implementation. Exact version-specific feature counts and test matrices belong to the version's PRD, not to this principle.

**CV-11 — Runtime execution truth is not business/domain truth.** The single K Primary owns its admitted execution State, Journal/Effect/Replay/UNKNOWN and CAS discipline. Domain Facts, business entities, domain-facing policy/data and external system reality belong to the relevant Business/Capability/Domain service; K execution records are **not** automatically a domain database or permission to change external facts. Domain Data and compiled intelligence, business state and run-control state must have explicit owners and update boundaries. A new SDK version must not silently move business authority into Microkernel, Standard, Model output, a Tool adapter or an observation record.

**CV-12 — Optional intelligence/evidence cannot self-authorize production.** When the App selects Memory, semantic cache, Context, Runtime Evidence, Candidates, Shadow or Meta workflows, they remain scoped **non-authoritative** data/semantic components relative to K State/Journal/Effect. Evidence or a DecisionReceipt must not fabricate a committed ACK; Memory and cache are not replay or Journal truth. Shadow/simulation does not mutate production state/effects; Candidate proposal/validation/promotion and deployment/activation are distinct decisions. Agent/LLM/model content may propose actions, but cannot gain production Effect authority merely by saying so. The exact capabilities and activation workflow for a release remain version-scoped; **do not impose absent optional features on Basic Apps**.

## 2. Status and precedence (critical for ongoing v0.10)

- The **original frozen v0.10 PRD** (Product R3 exact blob `673da42ad90acde5ef942beb8ac63b58836a649f`) and freeze checkpoint remain historically valid. Frozen PC-05 currently says **zero-import selected ESM** and Host/runtime Package integrity checks; this conflicts with the intended v0.10 application of CV-03/04/05.
- [Product Amendment A01 PR #1158](https://github.com/kaicreator-mm/domain-harness/pull/1158) is the **version-specific authority path** to replace conflicting PC-05/adjacent PC-06/PC-08/P2-5 clauses with trusted BUILD output, ordinary Node/npm imports and early one-time checks. **Do not treat this cross-version document or AGENTS link as A01 acceptance**. Until A01 is independently accepted, its v0.10 overrides remain **PENDING**, and L2 cannot silently implement a contradiction.
- This distinction is **deliberate**: cross-version intent can be stable while previously frozen Product commitments require explicit, scoped correction. Don't weaken real external-effect and replay guarantees under cover of removing duplicate Package trust validation.
- ADS controls **development process and evidence**; this project document controls DomainHarness-specific *product architecture*. Neither overrides a formal unamended frozen product contract by inference.

## 3. Required lightweight inheritance procedure — every new version

At new version intake, before generating a PRD/L1, L2 or implementation Task DAG:

1. Read this file from the **current repository main** through the root AGENTS and project overrides. Record a short `Cross-version principles: inherited` reference in the new Product or architecture document (a file path and observed commit SHA suffice).
2. State only any **intentional deviation** from CV-01–12: `Principle ID → change and reason → impacted Product/L2/Package contract → review/amendment path`. If none, write `CV-01..12: INHERITED_UNCHANGED`. **Do not** copy twelve paragraphs into every version PRD or create twelve verification Issues.
3. At L2/Task DAG derivation, ensure build-time validation is not pushed into runtime SDK; normal imports are not converted into Tool adapters; target runtime support is not silently expanded; Kernel live correctness is retained. One concise cross-reference is enough.
4. At code review, reject a material violation **only if it actually changes a listed principle or an accepted version contract**. Fix by deleting unnecessary work or by a focused Product/Architecture amendment, not by introducing a generic framework.
5. At version closure, test affected runtime behavior once in existing clean packed consumers and targeted negative cases; no new recurring checklist runner, unrelated matrix, hidden security theater or repeated full regression for untouched design notes is required.

If the project **intentionally revises a principle**, update this document in a **focused, reviewed architecture decision PR** with rationale and effects on active version-specific freezes; reference it from version PRD/L2. The old decision remains in Git history. A new version must never silently forget a principle just because its PRD doesn't reprint it.

## 4. Anti-regression examples

- "SDK must be platform independent, so replace every Node API and third-party library with a Port" → **REJECT** (CV-02/08).
- "Runtime checks every installed Package's SHA/AST/approval on each load for safety" → **REJECT for trusted generated code**, pending the explicit A01 disposition for v0.10 (CV-01/04/05).
- "Every Package runs its own VM/QuickJS or installs own npm modules at runtime" → **REJECT** (CV-02/03).
- "A Package that calls `node:fs` must define and invoke a public Tool instead" → **REJECT** for private implementation calls (CV-03/07).
- "Skip CAS / business target separation / original receipt replay because Packages are trusted" → **REJECT**: those protect dynamic concurrency and effect truth, not static Package origin (CV-06).
- "Static provider collision will be discovered by SDK when the first request arrives" → **REJECT**: producer/BUILD ownership (CV-04).
- "DomainHarness should own the user/domain database, AI provider router and UI as native Microkernel services" → **REJECT**: explicit ecosystem/domain ownership (CV-09/11).
- "Every App must initialize Agent, Memory and Shadow components even when it only uses Basic K/S" → **REJECT**: optional selection (CV-10/12).
- "Observed Evidence or a Shadow Candidate may complete an Effect or activate itself as production" → **REJECT**: independent K/outcome and deployment authority (CV-06/12).

**This is a low-overhead prevention mechanism for architecture drift, not a new runtime or validation feature.**
