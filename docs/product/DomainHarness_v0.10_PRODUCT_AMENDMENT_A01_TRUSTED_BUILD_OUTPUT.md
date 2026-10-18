# DomainHarness v0.10 — Product Amendment A01: Trusted BUILD Output and Earliest-Feasible Checks

> **Status: SCOPED AMENDMENT / PROPOSED NORMATIVE SUCCESSOR / INDEPENDENT DELTA REVIEW PENDING.** This is the proposed exact Product A01 overlay for Product #1139. It does not retroactively alter v0.9, nor replace the historical v0.10 R3 Product Freeze checkpoint. Effective only after its separately recorded Product acceptance. Scope limited to SDK/Host/BUILD ownership of static Package qualification and the PC-05 zero-import policy, with bounded adjacent PC-06, PC-08 and prior P2-5 acceptance changes.
>
> Frozen source: `docs/product/DomainHarness_v0.10_PRD_CANDIDATE.md` blob `673da42ad90acde5ef942beb8ac63b58836a649f`; Freeze blob `985833413e3be20b26b95b1ce066ca24e0a34745`; Crosswalk blob `2832ce0b4269737d934b071a6c2e830deefec629`; informative DAG blob `74898ff80cfeeb9dfd74464a2e5235098003c916`. Direct Product input: [trusted-closed-world candidate](DomainHarness_v0.10_TRUSTED_CLOSED_WORLD_AMENDMENT_CANDIDATE.md) blob `e63915afc5bc6e2985dcedca8a7da5f63bdb1e4e` (PRs #1156/#1157). ADS `4.13.1@f35fcdb153ff171aaa0027b6e1b9c7592f28d3cd`.

## 1. Product intent / controlling invariant

**Domain App is a trusted, closed-world, prebuilt executable.** SDK and Domain Packages both have implementations targeted to a specific Runtime. Package generation and Domain App BUILD choose one compatible target profile and produce a complete ordinary executable; v0.10 implements only **TypeScript → JavaScript → Node.js 24**. Future runtimes may use other SDK and Package implementations, not necessarily the same internal source.

**One verification, earliest viable owner:** Package generation tests code/contracts/dependencies; BUILD resolves compatible SDK+K/S/B/C variants and their dependencies/exports/selected bindings and constructs the App; deployment prepares target environment/config/artifacts if applicable. The SDK loads/links the generated App, calls necessary `init` hooks, executes, and disposes. Trusted selected Package code is not a security adversary. **Do not transfer static source/graph/trust checks into runtime SDK or reproduce them there.** Runtime checks are for *new information*: caller/business input, actual State concurrency/CAS and real irreversible Effect admission/outcomes where needed.

## 2. Proposed exact successor requirements (delta only)

### A01-PC05 replaces frozen PC-05's packaging/verification strategy

> **A01-PC05 (P0).** The BUILD/compiler shall select exactly one compatible **target Runtime profile**, target SDK implementation and the exact intended Kernel Primary/Extensions, Standard Primary/Features, Business and Capability implementations for one executable Domain App. During Package generation and BUILD, resolve and prepare normal module dependencies, verify selected contracts/required interfaces, deterministic binding/role identity, missing/duplicate required providers and selected dependency compatibility, and assemble a complete runnable deployment. **Normal Node ESM imports, Node built-in modules, npm dependencies and installed native add-ons are allowed implementation details**; no per-Package zero-import ESM obligation. BUILD does not enable unselected Package discovery, provider replacement or Package hot swap in a running App.
>
> The SDK/Microkernel consumes the resulting trusted App through the normal selected Runtime module system. It **MUST NOT** conduct per-load/per-request Package source AST inspections, whole-graph dependency recomputation, package digest/installed-byte attestation, issuer-signature approval, provenance/compatibility certification or Package-origin security screening. Any verification desired for distribution/installation is owned by deployment, *before execution*, never delegated to the SDK.

**Qualification bound:** Verifying static BUILD outputs need not create a custom ecosystem parser/module graph checker; use ordinary TypeScript/Node/npm/build/test processes. Versions/tags help BUILD choose a candidate, not runtime dynamic resolution. Scope of runtime fail-fast is limited to actual missing callable hooks/config/resource failures that could not reasonably be established at BUILD/deployment.

### A01-KERNEL-HOST + PC-08 residual negatives — exhaustive scoped disposition

Frozen PRD **Kernel Package family** prose (§3, L42) says the approved Host protects “caller identity, actual bytes/currentness and one-shot permits.” Under A01 this has the following **explicit narrow precedence**: immutable code/artifact bytes and selected-Package currentness are **producer/BUILD decisions**, with **optional deployment-owned integrity checks before App start** where needed; **the running SDK/Host does not attest installed bytes or redo static Package version/currentness proofs**. The Host/K runtime still enforces **actual live caller identity/scope and one-shot Effect permission** where the deployed application exposes such boundaries. This is a Product scope correction to the named §3 Host sentence, not an implied deletion of its live responsibilities.

Frozen **PC-08 negative cases are all accounted for**: two primaries, duplicate Kind/provider, missing or wrong version and declared dependency cycle → **BUILD failures**; “post-seal drift” / altered installed artifact → **deployment/install qualification when applicable**, not continuous SDK byte monitoring (no runtime drift/attestation test); “forged extension hook” → wrong selected hook/provider fails **BUILD**, malformed/unauthorized *advice or output* fails K Primary's **live authority revalidation**; “foreign Host scope” → **live caller/B/tenant-scope refusal before read/state/Effect**, not source-provenance inspection; wrong direct K commit access/partial init → **runtime operational boundary/lifecycle negatives** without treating trusted modules as a hostile sandbox. Tests are staged at their actual check owner; no repeated runtime checks of immutable BUILD facts.

### A01-PC06 adjusts activation interpretation only

> **A01-PC06 (P0).** One generated executable App contains one fixed runtime profile and selected K/S/B/C composition. SDK connects known preselected exports and invokes necessary Package `init/dispose` in appropriate order; an init failure prevents the partially initialized public facade and cleans up successfully initialized Package-owned resources. Restart uses the same deployed App until independent BUILD/deployment produces and activates a replacement. The Microkernel is **not** an install-time or per-activation Package approval authority and does not negotiate/revalidate a static selected graph.

This retains one K Primary authority and physical selected feature packages. Historical digest/currentness facts may be BUILD/deployment metadata; they are not a mandate to reproduce an SDK approval machine.

### A01-PC08 / frozen Product P2-5 — move static negatives upstream

- Frozen PC-08 **two independent packed consumers, real K/S physical composition, negative duplicate provider/cycle/missing dependency**, K-authority denial, cross-B scope and partial init remain in scope. **Static wrong implementation/dependency/contract tests occur at Package generation/BUILD**; deployment rejects missing install/native ABI where applicable. Do not require an SDK runtime hash/AST/approval adversarial matrix.
- Frozen Product Freeze P2-5 wording (full selected closure before any ESM evaluation) is fulfilled by **BUILD/deploy producing the closed executable before SDK launch**, not by SDK performing its own per-activation cryptographic inspection. This is a **material precedence override** to the earlier frozen P2-5 mechanism, not a claim that original wording already permitted the new model.
- Keep the real runtime falsifiers: failed init cannot expose a partly ready facade, selected K is the only authoritative State/Admission/Journal/Effect owner, business scope may not alias another B, effect not dispatched without current runtime preconditions, no double-commit or fabricated terminal outcomes.

## 3. Checks must occur at the earliest phase where the facts exist

| Stage | Normative responsibility | Do not repeat later |
| --- | --- | --- |
| Package authoring/generation | Source types, public declarations, local tests, npm/native dependency selection for target | No runtime AST audit or parser rerun |
| Domain App BUILD | One target/runtime and compatible SDK+Package variants; static provider binding, dependency resolution/assembly and selected workflow/schema contracts | No dynamic SDK version, Package and dependency discovery |
| Deployment/installation | File deployment, native target compatibility/config/secrets and optional distribution integrity, if needed | No per-load SDK package attestation |
| Package init | Actual DB/file/network handle availability, config/resources that only exist at launch | Do not delay obvious init failure until unrelated Tool request |
| Before a live state/effect action | Actual requester/tenant authorization when applicable, Guard, revision/CAS/fence, supported idempotency/admission | No avoidable failures after irreversible dispatch |
| After a real external attempt | Observe terminal result or retain UNKNOWN and reconcile real provider state | No invented success on mere acceptance/timeout |

No duplicate static checks or artificial SDK Host ports simply because v0.9 historically had an H governance layer. Internal use of `node:async_hooks`, `node:crypto`, `node:fs`, SQLite, Ajv, Acorn, XState, JSONata or YAML is permitted on the current Node implementation. An internal library call is **not** automatically a Tool/Operation boundary.

## 4. Explicit unchanged authority and exclusions

**Effect authority clarification / EX-01 interpretation (normative):** Permission to import `node:*`, npm or native libraries addresses **module mechanics, not authority to execute side effects**. Every **business-meaningful external state-changing/irreversible/non-idempotent operation governed by CT-04 and EX-01..04** (remote payment/job/device/HTTP business write or equivalent) MUST be requested via **K Primary Admission → selected C Operation/deployment adapter → K Journal/effectId/idempotency/UNKNOWN reconciliation**, whichever library implements the transport. Business, Standard and private helpers MAY use ordinary imports for reads, computation and Package-owned lifecycle resources, but MUST NOT independently dispatch such governed effects around K. Frozen EX-01 wording “without arbitrary package network imports” is **narrowly superseded in import mechanics** and **preserved as “without arbitrary Package network-effect dispatch bypassing K Admission”**. Enforcement is by accepted code/contract/build qualification and the actual selected effect port, **not a new SDK import scanner, network sandbox or generic Host proxy**. A business-owned internal database/resource write that is itself within the governing external Effect contract is not exempt merely because its driver is a private library.

**Unchanged Product obligations:** PC-01/02/03/04/07 physical selected roles, one K Primary, typed Standard dispatch; CT-01..06 semantic vs Tool distinction and C effect exposure; all AW/MC/EV; KH-01/02/03 CAS/UNKNOWN/turn dedup + exact original receipt replay; EX-01..04 actual external effect acknowledgment/reconciliation and runtime caller/Effect permissions when needed; QR-01/03 authorized scoped Business and physical namespace isolation; safe Shadow and two real qualified consumers.

Removing redundant *static Package/code trust* verifications does **not** delete dynamic tenant identity, runtime business policy, current CAS/fence, effect journal/recovery or protections against potentially untrusted external user/model/network data. Conversely, do not preserve duplicated checks merely by relabeling them "runtime authorization" when they only confirm an immutable generated Package's provenance.

**Not added:** universal Host abstraction, Sandbox/QuickJS/Browser/multilanguage implementation, new per-package VM, arbitrary executable module discovery/hot reload, new generic npm verifier, security-by-Owner-account, v0.9 compatibility/migration, or unnecessary test matrix.

## 5. Product-to-L2 and DAG consequences

- **L2 #1148 / PR #1149:** replace v9-derived per-activation `host-v9/registry.ts` SHA/AST/issuer-approval architecture with ordinary pre-built Node App module loading and minimal Microkernel lifecycle; retain physical CAS and genuine runtime effect/caller authority. Do not expand K or replicate BUILD checks in Host.
- **Task T00:** selected v10 SDK + K/S/B/C composition and target-specific BUILD, generated Node ESM/npm native-import consumer. **Task T11:** two real packed Apps, basic and rich, including Node internal library and native/third-party dependency; negative static tests at BUILD and real init/Effect CAS safety at runtime. **C01:** independent generic external-effect semantics, NOT a requirement to proxy Package's private npm/fs library calls.
- Existing [#1150](https://github.com/kaicreator-mm/domain-harness/issues/1150) two genuine K extension feasibility remains a separate evidence condition. L2 R2 PR #1149 describes **DESIGN-level repairs** for the previously found P1 on multi-B durable-key isolation and original-receipt persistence/replay, pending independent amended L2 review; this is **not** implementation proof. Their real runtime/packed-consumer falsifiers remain mandatory. Do not erase them by this amendment.
- Keep one-concern/one-PR and targeted delta verification; concentrate version-level full tests in version closure.

## 6. Amendment acceptance and precedence

**Review scope** is ONLY the differences in §2–§5 versus frozen PC-05, PC-06, PC-08, P2-5, the §3 Kernel-family Host “actual bytes/currentness” wording, the EX-01 “arbitrary package network imports” **mechanism only**, and adjacent Host artifact governance. Live CT-04/EX-01..04 authority is preserved as explicitly clarified above. Reviewer should flag any changed dynamic caller or live-effect guarantee, unnecessary BUILD/security scope inflation or conflict with one-K correctness. A bounded independent impact-aware Product review is required before this A01 document is marked `ACCEPTED`.

Until accepted: `PRODUCT_AMENDMENT_A01=PROPOSED`, `FROZEN_PRD_BLOBS=UNCHANGED`, `L2=NOT_FROZEN`, `EXECUTABLE_DAG=NOT_ADMITTED`, `V010_IMPLEMENTATION=NOT_PROVEN`. Once accepted, this document is normative for **only its expressly named successor clauses**; all other frozen Product requirements and historical proof pins remain unmodified.
