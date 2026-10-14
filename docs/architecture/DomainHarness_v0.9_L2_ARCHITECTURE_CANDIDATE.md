# DomainHarness v0.9 — JS/TS Core L2 Architecture Candidate R3

```ini
DOCUMENT_STATUS=DRAFT_L2_NOT_FROZEN
PARENT=#1026
PRODUCT_SCOPE=R2_F01_F10_FROZEN_PR1048_MAIN_a51a0c57f1c66d602120e6538b4db24072a2e747
V08_OBSERVED_SOURCE=9ea7f6f12a51c78dec747a823db6ade620a2fa6c_UNQUALIFIED
REUSE_SOURCE_MAP=PR1046_MERGED_MAIN_786f6cff8639280ff8a4b301dcd76343942ed2ff
INDEPENDENT_ADVERSARIAL_L2_REVIEW=R1_FAIL_6173661908_AND_6173675083;R3_DELTA_REVIEW_REQUIRED
FORMAL_IMPLEMENTATION_DAG=NOT_ADMITTED
SOURCE_IMPLEMENTATION=NOT_AUTHORIZED
V09_RELEASE=HOLD
```

## 1. Frozen Product and stage boundary

The normative Product input is R2 F01–F10 accepted by the merged [Product scope checkpoint PR #1048](https://github.com/kaicreator-mm/domain-harness/pull/1048), after the substantive adversarial terminal [#1026@6169545765](https://github.com/kaicreator-mm/domain-harness/issues/1026#issuecomment-6169545765), P0=0/P1=0/P2=2 routed. The historic PRD/roadmap's Node/OS-only P0 statements are superseded by the JS Core successor. Distinct-GitHub-account reviewer approval is **not attested**; do not forge it.

Source reuse now observes **not yet released** `v0.8@9ea7f6f12a51c78dec747a823db6ade620a2fa6c` after #1047 S01 merge; prior exact pre-S01 byte evidence is preserved in #1046. Source facts are not a qualified v0.8 release claim. #1003/#1005/#1023/#1006 and v0.8 release remain their own required gate. This L2 may be reviewed before v0.8 releases, but implementation cannot start or inherit a fictitious release PASS; re-pin final v0.8 tag and artifact digests at implementation admission.

## 2. Selected composition / authorities

```text
External Creator/Forge producer or hand author
 -> BUILD (generic, selected closure + ABI/bindings)
 -> immutable selected K + S + B(Approval/Engineering) + C artifacts
 -> independent DAC/governance approval + protected Host installation
 -> DomainHarness.load(package)  [exactly one argument]
 -> minimal Microkernel (install/bind/hooks/scoped UX facade)
 -> physical selected Kernel Domain Package
      owns State, Guard, Admission, Effect, Journal, CAS decisions,
      replay, WAIT/RESUME, UNKNOWN
 -> physical Standard Domain Package
      owns Schema/Rule/Decision/Workflow/WorkflowRouter/Operation interpretation
 -> selected Capability Domain Packages own Operation/Handler + physical adapter,
      never supersede the Kernel's authority
 -> Business packages supply domain policy & app-specific workflow
```

Architecture decision A01: the Microkernel is not the Domain Runtime mechanism; the selected **Kernel Domain Package** is. No second Runtime Package, `host-node` aggregate Domain Package, Host-owned business Journal, dynamic package market, provider discovery or caller-supplied verifier/Host ports. `DomainHarness.load(package)` accepts one BUILD-sealed selected closed-world closure, **not** `compiledApp`.

A02: Package identity, version, ABI, Kind, Endpoint, capabilityId, operationId and handler export are all BUILD-pinned; C cannot shadow the unique selected K or S. Reuse existing v0.8 K payload blob `2dfec0c44c26d05635751dd13cd970906473d23d`, S payload blob `905d29183efb94bafd3bd2cb2d5a8dfbcf9e4b2a` and v0.8 capability binding/lifecycle; change by narrowly demonstrated delta only. Existing Standard has five Kinds and `interpret('workflow')`, **not** an established `WorkflowRouter` exported contract. #1027 owns a bounded deterministic Router selection/dispatch, preferably a thin existing-semantics binding when sufficient, never a second state machine.

## 3. JS/TS runtime and Host boundary contract

A03: TypeScript is **authoring/typecheck only**. Published SDK and selected package payloads are executable JavaScript ESM. A supported cohort declares a concrete JS engine/version, ESM module resolution and evaluation semantics, Promise/async lifecycle, and its precisely selected protected Host capabilities. A runtime without the declared minimum fails typed during qualification. No Core `node:crypto`, `Buffer`, `data:` URL assumption or native SQLite/OS dependence may become a universal public SDK precondition. **This is a v0.9 design target, not an assertion that v0.8 already meets it.** One actual engine+selected Host profile must be qualified; no all-engine promise.

A04: independent artifact approval and H caller provenance remain **protected Host/deployment authority**, not Business/Package self-attestation or public `load` arguments. The selected installed closure binds a canonical digest over **all transitive executed JS bytes** (not merely filenames or manifest), package/version/ABI/handler identities, declared runtime/Host ABI profile and issuer authorization/currentness. Before *any* unapproved JS package evaluation, the protected H installation path verifies the actual selected byte graph and independent DAC/issuer currentness; deny stale/revoked/alternate Root, forged issuer, caller-supplied module source or Host handle. Repeat approval/currentness checks on every activation/restart. Where cryptography is physically implemented is a **protected selected Host/BUILD detail**, not a replaceable public verifier hook. No external approved Host -> **fail closed**.

A05: v0.8 `contracts.ts` imports Node `createHash`, `trust.ts` Node `createHmac`/`timingSafeEqual`, and `installer.ts` uses `Buffer` + `data:` import. It preflights the whole closure before the first import, **then evaluates modules sequentially**; a late module export mismatch cannot unexecute earlier top-level side effects. L2 must preserve this truth: bound admissible package module graph and zero **unauthorized** evaluation, typed partial-start failure and reverse cleanup; no impossible all-or-nothing JavaScript evaluation claim. R1 architecture design must explicitly choose the protected imported-module strategy and crypto/digest byte/canonical representation before freezing ABI.

A06: issuer authentication, role/tenant/app/instance currentness and read/subscribe revocation are H-verified at appropriate access boundaries. K receives protected, non-forgeable authorized facts through a fixed H→K seam. An untrusted operation argument, UX-provided `caller`, Model/Agent suggestion, Domain Package or `init` script cannot mint the proof. An effectful `OperationCall` must follow K Admission→Journal→Effect/UNKNOWN; read-only Agent defaults remain in force. A C handler can perform physical side effects only through the authorized selected path, not as an externally invocable bypass.

## 4. Package ABI, lifecycle and public consumer

A07: preserve **Component → Capability → Operation → Handler** selected callable identities and separate schema-only semantic declarations from executable Tools. BUILD determines package dependency order. Selected package `init(context)` follows approved order; `dispose(context)` reverse order on stop/failure, with primary failure preserved plus cleanup errors; no arbitrary dynamically discovered init script engine. Package owns its Handler, adapter and optional init/dispose. Do not give lifecycle context raw H secrets or Kernel journal access. An unsupported/missing Host capability refuses typed and does not silently use a weaker fallback.

A08: v0.9 publishes a versioned typed `./v9` JS/TS public SDK API and ESM exports; documented secure bootstrap/deployment path and one-arg `load(package)`, authenticated `send/query/subscribe/stop`, errors/lifecycle, clean consumer samples, and package contract/type declarations. Internal `public-v8/trust`, `kernel-host` and installer deep imports remain internal implementation only; a standalone consumer must never require them.

A09: SDK distributable, K/S/C Domain Packages and Profile/Assembly are **different identifiers and immutable version/digest subjects**; Profile is data, not a Runtime Package. BUILD is domain-neutral and may be shipped with SDK tooling; Forge retains Domain Package authoring/compiler ownership in its own domain scope, not hidden within Microkernel. No pre-v1 historical binary/ABI compatibility promise. A production profile is supported **only** after external clean-install + selected runtime/capability release evidence.

A10: Node Identity + SQLite Storage are **optional conditional reference implementations** owned by #1028. If shipped or advertised, native driver ABI, atomic physical CAS, concurrent revision conflicts, WAL/recovery/crash, lock, resource disposal and backup/restore require real selected-host proof. They are not a universal Core requirement. K remains sole Journal/ACK/UNKNOWN source of truth; physical storage is a selected capability. #1036 Core lifecycle/error/diagnostics is unconditional, adapter-specific performance/operations is conditional.

## 5. DAG mapping and bounded executable falsification

| Contract/Owner | Source concern (reuse-first) | Mandatory proof |
| --- | --- | --- |
| #1027 | K/S/Package ABI, selected C contract, bounded WorkflowRouter | K/S physically selected, two distinct Approval/Engineering users; missing/ambiguous handler/route typed denied |
| #1032 | BUILD, protected installation, cryptographic closure, versioned distribution | source-byte forgery, stale issuer/restart, transitive-byte swap rejected before unauthorized import |
| #1035 | public ESM/TS API and clean developer onboarding | independently installed external repo, no deep imports, typed unsupported host/runtime/ABI |
| #1036 | lifecycle, failure/cleanup, safe diagnostics, operations | init/dispose/partial activation, stop/restart, secrets redaction, truthful journal/UNKNOWN |
| #1037 | independent H/K/caller security, two real Apps, Full/Hidden/CJ/release | cross-tenant reads/subscriptions, unauthorized mutation, replay/CAS/UNKNOWN, exact artifact independent review |
| #1028 | **conditional** Node+SQLite/Identity reference capability | real native crash/CAS/lock/WAL/backup only if selected and advertised |
| #1029/#1030/#1031 | deferred optional multi-repo generator/QuickJS/advanced remote streaming | **not** a v0.9 Core critical-path gate without explicit Product re-admission |

Conformance set L2-01–L2-06 (reusing existing v0.8 P/N/FR/Hidden where applicable):
1. Real TypeScript-to-ESM SDK and selected K/S/B/C closure executes in **one specified** JS engine; unsupported ESM/capability/ABI fails closed.
2. Forged artifact root, duplicate K/S, wrong handler/version, transitive-byte mutation and stale/revoked approval **cannot evaluate unapproved code** or produce an unauthorized effect.
3. Forged caller, cross-tenant query/subscribe, stale UX authentication and unauthorized Agent/Tool mutations are rejected by H/K; independent issuer proof cannot be user supplied.
4. Real two App families share same selected K/S and one reusable Capability; no shadow Journal/state/effect engine; truthful WAIT/RESUME/replay/UNKNOWN.
5. Deterministic init/dispose, failure cleanup/partial-install behavior and selected durable storage/CAS are verified on actual advertised runtime/capability cohort (Node/SQLite specifics conditional).
6. Independent fresh external installation, Full/Hidden/Critical Journeys/Security/Packaging qualification against exactly shipped immutable artifacts; only then Version Closure and Tag.

## 6. Gate decision / open design points

**NOT READY FOR L2 FREEZE until the following are concretely resolved in an exact-head follow-up:**
- L2-R1: precise selected public JS module/async floor and H-protected verified module loading/evaluation ABI, explicitly defining non-Node behavior vs selected engine minimum.
- L2-R2: canonical closure serialization/digest, cryptographic issuer-currentness and bound installed-module artifact shape preserving v0.8 fail-closed semantics.
- L2-R3: exact typed public facade/error surface and S WorkflowRouter behavior; close the boundary between S routing vs K state.
- L2-R4: conditional Node/SQLite task DAG dependency and the distinct-account approval policy check under the pinned ADS.
- L2-R5: **v0.8 qualified baseline absent:** source adoption and actual v0.8 #1006 release evidence must be re-pinned at implementation admission; no source implementation authority until then.

**Review protocol:** one genuinely fresh bounded adversarial L2 architecture review on the exact candidate HEAD after L2-R1–R4 are addressed. Report P0/P1/P2 with real readback and counterexamples. No repetitive review rounds for unchanged findings. A source-author self-check is not a distinct-account independent review. Upon L2 PASS, freeze separate exact-source checkpoint, then convert the six existing owner Issues into a right-sized formal Implementation DAG with conditional #1028. No autonomous formal v0.9 implementation or release is claimed by this candidate.

## 7. R1 bounded proposed ABI resolution (for independent challenge, NOT yet frozen)

### L2-R1: engine envelope and installation ABI

**Proposed minimum compile target:** ES2022 + ESM + Promise/async + typed-array/UTF-8 semantics (the latter may be supplied by the selected protected H), a deterministic serialized data contract, and an explicitly declared **selected Host installation ABI revision**. The SDK Core may not require Node globals (`Buffer`, `process`, `node:crypto`, native SQLite) directly. A selected engine lacking compatible ESM evaluation or one required H ABI reports `UNSUPPORTED_RUNTIME_ABI` / `UNSUPPORTED_HOST_ABI` **before executing user Packages**. ES2022 is a proposed floor to validate against actual K/S source, not yet a tested all-engine support claim.

**Protected internal boundary (logical methods, NOT public `load` options):**

```ts
// Internal H-owned installation seam; runtime names are proposals, not exports.
interface ProtectedInstalledClosure {
  readonly subjectDigest: string;
  readonly runtimeAbi: string;
  readonly selectedPackages: readonly VerifiedModuleHandle[];
}
interface ProtectedHostAssurance {
  verifyCurrentApprovalAndInstall(root: unknown): Promise<ProtectedInstalledClosure>;
  authenticateAndRecheckCaller(input: unknown, purpose: 'send' | 'query' | 'subscribe'): Promise<AuthorizedPrincipal>;
}
interface VerifiedModuleHandle {
  readonly packageId: string;
  readonly abiVersion: string;
  readonly moduleSha256: string;
  // Opaque to public caller: selected H already proved physical source bytes.
  readonly opaqueInternalHandle: unknown;
}
```

This is an **internal conceptual SPI**, not an assertion that mutable JS objects/TS interfaces convey cryptographic provenance. Only trusted H bootstrap can instantiate/bind it, with protected provenance outside arbitrary Business/UX inputs. `DomainHarness.load(package)` remains exactly one public argument. A forged object implementing this interface must convey **no** authority. H must validate the actual transitive ESM module graph, resolving imports from an approved read-only byte map; dynamic external/specifier fetch or ad hoc `data:` import of caller-provided modules is denied unless itself a specifically approved selected loader. H's physical crypto + byte loader are selected implementations, not exposed as a user-changeable Provider.

### L2-R2: frozen digest domain and currentness decision

Adopt **versioned subject separation** rather than reusing v0.8 subject bytes as v0.9 silently. Proposed `dh.v9.qualified-root.subject/1` subject commits: format/version, rootPackageId, exact **ordered** selected package IDs/kinds/ABI/module byte SHA-256, declared transitive import/source dependency digests, exact role/intent/capability operation→handler mapping, selected JS/Host ABI profile revision, and BUILD provenance subject. Use a specified canonical JSON encoding (plain data descriptors only, sorted own string keys, ordered arrays, no accessors/prototype/unsafe keys/NaN/-0) and UTF-8 SHA-256 lowercase hex; **derive this from the observed `computeSubjectDigest` / `canonicalSnapshot` behavior, do not hand-roll a duplicate canonicalizer in K**. This is a proposed *delta*, requiring byte vectors and negative collision/alias tests before Freeze.

Retain protected independent cryptographic issuer authentication at least as strong as v0.8's internal HMAC-SHA256 attestation; a bare SHA/JSON `approved=true` flag is not authority. Add protected currentness/revocation lookup **per activation/restart**, not an optional max-age-only proxy. Recheck H caller/tenant authorization on every sensitive read/query/subscribe/operation boundary. The existing v0.8 trust channel's `maxProofAgeMs` is optional and *does not by itself establish externally revoked approval*, so v0.9 must not falsely count that as revocation proof. Any inability to reach the configured approval/currentness authority fails closed according to an L2-defined typed policy; no silent authority fallback.

### L2-R3: bounded public semantics

Selected `Standard Basic` retains v0.8 `schema/rule/decision/workflow/operation` evaluation. A v0.9 WorkflowRouter call **returns an immutable candidate/selection or typed missing/ambiguous/denied result** based on BUILD-selected operations + K-authenticated context. It does *not* itself advance state or record an Effect/Journal; those remain selected Kernel operations. Reuse a public alias to existing Standard/K selection if executable evidence proves equivalent. Public v0.9 SDK exposes one stable typed `load(package)` + authenticated scoped `send/query/subscribe/stop` facade, typed standard failure codes and explicit supported/unsupported selected runtime/capability; no public `H.verify` or `getModuleNamespace` bypass surface.

### L2-R4: acceptance scope and implementation DAG

Unconditional DAG owners #1027 → #1032/#1035 → #1036 → #1037 with exact tests and independent security/release. #1028 becomes a dependency **only when** a Node/SQLite reference adapter is chosen for that release artifact; if not selected, the chosen *actual* physical durable/identity capability and its qualified owner must replace that proof, not disappear. N03/N04/N05 optional. A single L2 exact-HEAD adversarial review tests R1–R4; review the source-author claim but never misrepresent same-account GitHub activity as a distinct-account credential. Final v0.8 release pin is a separate implementation-admission prerequisite.

## 8. R2 security and ownership decision record (author-side reconciliation, NOT independent review)

### Boundary threat model / selected-runtime limitations

**Trust assumptions:** Domain Packages in the approved sealed closed world are *approved code*, not untrusted adversarial plugins. An arbitrary `load(package)` argument, UX message, AI Tool proposal, forged artifact/issuer/principal or stale authorization **is** adversarial input. The developer/operator with privileged write/execute access to the **same trusted Host process or its protected storage/issuer secrets** is outside the isolation promise. A private TypeScript interface, non-exported source file or opaque-looking plain JS object **alone is not a security boundary** against that privileged actor. H must be furnished by a deployment-controlled module/instance with an externally protected trust-root and immutable byte resolution; do not confuse type erasure with runtime authenticity. If selected Host cannot provide these assurances, **do not qualify it**. Separate-process isolation is **not** a mandatory Core implementation absent an explicit Product selection, but an honest selected-host trust boundary is.

**Module-evaluation caveat:** Approved Package JS may itself have arbitrary top-level side effects; there is no JS module evaluation rollback. The invariant is *no unauthorized module-source graph may be evaluated and no unapproved K-mediated physical Effect occurs*. Static imports and permitted dynamic imports from approved Packages must resolve within the BUILD-pinned closure **or** within explicitly allowed platform/Host builtins pinned by the supported runtime profile. Transitive third-party executable dependencies must be pinned/verified; host engine builtins are qualified by the named runtime/profile rather than hashed as Package source bytes. Any unbound package import, network-loaded code or non-approved module substitution is refused at the selected H resolver boundary. Top-level side-effect containment beyond approved code requires additional isolation and is not silently guaranteed by digest checks.

**Currentness caveat:** v0.8 observed baseline's `trust.ts` checks HMAC and optional proof age, *not general revocation*. v0.8 [#1023 S01 PR #1047](https://github.com/kaicreator-mm/domain-harness/pull/1047) is now **MERGED** to `v0.8@9ea7f6f12a51c78dec747a823db6ade620a2fa6c`: durable protected installed references and per-activation issuer/proof revocation are **accepted branch source reuse candidates**, still **NOT release-qualified**. Re-pin the exact final released source/artifact only after #1006 Release Qualification; do not duplicate S01 mechanics in v0.9. Do not independently rewrite another install/currentness mechanism in v0.9.

### Exact logical H/K/C interaction and failure ownership

| Phase / event | Protected authority and data | Failure/outcome (proposed typed categories) |
| --- | --- | --- |
| BUILD selects K/S/B/C | Producer-neutral BUILD pins module+transitive dependencies, handler/Operation map, approved runtime/Host ABI and digest domain; **does not issue independent trust** | `BUILD_BINDING_INVALID`, `BUILD_ABI_UNSUPPORTED` |
| Governance approves/deploys | External issuer/DAC approves exact closure subject; protected H installation resolves immutable source bytes and independently verifies issuer/currentness | `APPROVAL_UNTRUSTED`, `APPROVAL_REVOKED`, `APPROVAL_STORE_UNAVAILABLE`, `PACKAGE_BYTES_MISMATCH` |
| `load(package)` activates | SDK uses fixed protected H installed-reference binding, not caller-injected H. All verifiable static/source checks preimport; selected module evaluation and export checks thereafter | `INSTALL_HANDLE_UNKNOWN`, `PACKAGE_IMPORT_DENIED`, `PACKAGE_EXPORT_MISMATCH`, `PACKAGE_START_FAILED`; reverse cleanup best effort, do not invent evaluation rollback |
| Authenticated UX `send` / OperationCall | H authenticates principal/tenant/expiry/currentness; Kernel Package alone decides admission + state/Journal/Effect | `CALLER_UNAUTHORIZED`, `ADMISSION_DENIED`, `OPERATION_NOT_BOUND`; no unauthorized Effect |
| Scoped `query/subscribe` and emissions | H enforces caller scope and revocation at read/access and each subsequent sensitive subscription delivery, with Kernel-owned projection | `SCOPE_REVOKED`, `READ_DENIED`; terminate stale subscription rather than leak data |
| Durable effect and restart | K records truthful Journal/ACK/UNKNOWN and owns replay/recovery; selected C implements physical CAS/IO. Restart **revalidates** exact installed artifact + approval before reactivation | CAS conflict, crash, durable receipt uncertain -> typed `UNKNOWN`, never false ACK; no Host-owned shadow Journal |
| `stop` / init failure | Microkernel enforces BUILD-fixed init/dispose order, C closes resources, K controls business state transitions | Typed primary error plus bounded per-package cleanup errors; no credentials/secret material in diagnostics |

These are **proposed portable categories** and required semantic invariants, not a claim that v0.8 or v0.9 already exports these exact strings. The final L2 contract must pin public error naming and validate from actual source; native Node/SQLite fault codes remain selected-adapter-specific and must not leak into Core unless mapped.

### Alternatives, trade-offs, ownership

- **Chosen:** a small v0.9 Core ABI with a fixed protected H installation mechanism and selected physical Capability implementations. **Rejected:** publicly injected `verifyApproval()` or arbitrary per-App provider resolver, which permits an adversarial caller/Business Package to choose its own authority.
- **Chosen:** reuse v0.8 physical Kernel/Standard and minimal bounded Standard WorkflowRouter binding. **Rejected:** creating a second Microkernel state machine, Host Journal, standalone `Runtime Domain Package` or expanding a generic autonomous planner.
- **Chosen:** exact immutable Package byte graph + profile-qualified platform builtins, selected engine ESM support. **Rejected:** asserting that TypeScript output is universally portable to QuickJS/Browser without independently selected crypto/module/Host assurance.
- **Chosen:** retain #1028 as a conditional reference-adapter owner. **Rejected:** Node24/Ubuntu/SQLite platform matrix for **all** JS/TS Core consumers.
- **Accepted cost:** v0.9 must introduce a new selected Host assurance/module-load ABI and independently qualified artifact/install path; not a quick rename of `public-v8`. External Host trust-root management, physical resource ownership and selected runtime support statements remain unavoidable for a real production qualification.
- **Compiler ownership:** **domain-forge** owns Domain Package generation/authoring compiler. `domain-harness-compiler` (legacy repository name) may supply the limited producer-neutral qualified **BUILD closure/seal/ABI selection tool**, **not** a second source compiler that generates Business Domain logic. This aligns with the frozen Product's BUILD-tool distinction and avoids architectural dual ownership.

### Review Policy and bounded unknown disposition

`L2_ARCH_REVIEW_POLICY=required` for protected approval/module-evaluation and K authority boundary; a separate review **session/operator context** must use exact HEAD, even if the GitHub transport account happens to be the same. This author-side reconciliation is **not** independent evidence.

- **R1 JS engine floor:** ES2022 + ESM + async + versioned Host ABI is the proposed bounded floor, with first selected real JS engine to be named and tested by #1037. Do not claim cross-engine support before proof. Lack of chosen concrete engine profile is **validation-admission BLOCKED** and must be concretely named before the selected release tests; it need not imply an OS matrix.
- **R2 cryptographic/loader ABI:** select protected H-approved content-addressed module graph with explicit allowed profile-builtins and canonical UTF-8 subject-digest byte vectors. This is a **bounded design assumption** with #1032 owner; proof of artifact byte identity + effective revocation before any unapproved import is **release-blocking**, not waivable. #1047 is merged on the v0.8 branch; adopt its bounded source seam in design now but do not treat it as release-qualified until #1006 passes.
- **R3 WorkflowRouter and public error ABI:** bounded Router is Standard-only; the final exact API name/error taxonomy is a **#1027 contract-first Task** followed by #1035 public binding, not permission for a second implementation. ABI-breaking changes require explicit frozen L2 successor.
- **R4 review credential:** ADS `standards/CHATGPT_WEB_ROLE.md` permits same GitHub transport identity **when independent Reviewer session_ref/operator_id is distinct from Builder/author**. The author may not invent an independent context. Record exact review provenance at L2 Freeze.
- **R5 inherited release source:** v0.8 #1006 OPEN; do **not** start v0.9 implementation. Re-pin final v0.8 release baseline and accepted S01 before Task implementation dispatch.

**R2 author-side gate:** `L2_DESIGN_R2=SUPERSEDED_BY_R3`; `INDEPENDENT_REVIEW=R1_FAILED_R3_DELTA_REQUIRED`; `L2_FREEZE=NO`; `IMPLEMENTATION=NO`; `V09_RELEASE=HOLD`.

## 9. Post-v0.8-S01 source successor / CI-bypass controller record

The user's `SKIP_CI_AND_CONTINUE` direction **removes the routine PR-phase CI wait for this v0.9 planning progression**. It is not a claim that CI passed or an authorization to waive actual security, Full/Hidden/selected-runtime/clean-consumer/release checks. Existing repository branch protection still applies. The exact documented review and release gate remain separately enforced.

Updated physical readback at **v0.8@9ea7f6f12a51c78dec747a823db6ade620a2fa6c**, after PR #1047 merged:
- `public-v8/deploy.ts` = `20b853ab16fa9be187bc239e786e6b46cd97e4dc` (new protected content-addressed deployment/currentness);
- `public-v8/load.ts` = `22eda49b3298f916ef4d8f37856d60afc6f77d2f`;
- `public-v8/installer.ts` = `c2ce1f36d295d44180232c187c71ef6c80f04345`;
- `host-v8/bootstrap.ts` = `e3183b143a61b65ac9933e50e7da0da56ef5d6f6`;
- `host-v8/kernel-gateway.ts` = `4c26fc49cc618f99a98c576f47fa8494982a18b6`;
- unchanged `contracts.ts` = `cb20695e772862bb2b56569cc5f958b94d3efc5e`, `trust.ts` = `635f833e2b9ef586984b421d12c679e37c9c4bf9`;
- selected K/S payloads unchanged: `2dfec0c44c26d05635751dd13cd970906473d23d` / `905d29183efb94bafd3bd2cb2d5a8dfbcf9e4b2a`.

**Decision:** adopt the *architecture and tested-source intent* of protected installed handle + durable revocation in v0.9 JS/TS Core, where selected H provides the same actual security properties. Do **not** port Node SQLite physical storage into every JS Core implementation. A non-Node selected H must furnish an equivalent protected content-addressed immutable-module resolver and current approval oracle, or be marked `NOT_QUALIFIED`. Selected H's protected registry cannot be manufactured by calling public `load(package)`.

**A source-map freshness exception, not an authority gap:** #1046's already-merged pre-S01 evidence remains an immutable historical observation and is **not retroactively rewritten**; the above successor pins and eventual v0.8 released exact baseline govern future reuse. All actual source implementation still waits for v0.8 Release Qualification, v0.9 L2 Freeze and admitted Task DAG.

**Review path:** author has made design choices and must obtain a truly independent, fresh review session at exact HEAD before claiming L2 PASS; this record does not impersonate a separate reviewer. Release QUALIFICATION remains mandatory even if PR-level CI is deliberately skipped.

## 10. Installed-only v0.9 load boundary — closing the inherited S01 compatibility seam

On merged v0.8 S01 `public-v8/load.ts@22eda49b3298f916ef4d8f37856d60afc6f77d2f`, `load(package)` recognizes an installed handle but **also allows a legacy approved raw sealed-root presentation** after the HMAC/currentness gates. That transitional path is not itself evidence that the v0.9 *new* installed-only Product goal is satisfied. Pre-v1.0 old asset compatibility is explicitly not mandatory.

**v0.9 architecture decision A11:** public `DomainHarness.load(package)` accepts **only a protected-H-bound identity of a previously installed, independently approved immutable selected closure** (exactly one opaque installed-reference string resolved through H protected state; no caller object alternative). Merely presenting a valid-looking or even previously HMAC-approved raw Root does **not** authorize direct source/module evaluation if it was not installed as that current selected artifact. Raw BUILD roots are supplied to trusted *deployment installation*, not public execution. The v0.9 public JS argument is **exactly an opaque H-issued installed-reference string**, not an object union; #1035 only publishes this already-selected shape; a JavaScript object with same shape and property names is not proof of installation.

- The v0.8 raw-approved-root fallback must be **removed or inaccessible from v0.9 public load** (while preserving v0.8's own already-accepted behavior). No v0.9 legacy compatibility obligation can silently weaken Product F03/F05.
- Tampered/stale/cross-audience installed reference, raw uninstalled root, changed module graph or revoked issuer -> typed `PACKAGE_NOT_INSTALLED_OR_AUTHORIZED` class **before any unauthorized import or Effect**.
- The internal selected H installation code may take an inert raw sealed closure to *qualify and publish* content-addressed approved bytes. It may not execute them during this publishing step. `load(package)` activates only the H-resolved current installed closure, with all static preflight before evaluating the first approved module.
- A source-code refactor that removes `node:crypto` or `data:` imports must not reintroduce public Host verifier injection. Alternate JS engines need a real selected H crypto/byte-loading backend and fail closed otherwise.
- **Validation owner:** #1032 tests installed-handle only plus forged raw-root and S01-legacy-raw bypass negatives; #1035 tests public typed API surface; #1037 independently tests zero unauthorized import/Effect and per-restart currentness.

This is a Product-aligned **target v0.9 architectural correction**, not a newly claimed v0.8 P1 defect, retroactive v0.8 regression or a v0.9 implementation PASS.

## 11. R3 normative bounded L2 decisions — closure of both independent R1 reviews

**Disposition authority within this candidate:** this §11 is the *later controlling proposed architecture decision* wherever preceding R0–R2 exploratory method names/unknowns conflict. The earlier numbered sections remain background and exact-source design history, **not unresolved implementation freedom**. This R3 is still a **candidate**, not Frozen L2. Two genuinely distinct review contexts returned [#1049@6173661908](https://github.com/kaicreator-mm/domain-harness/pull/1049#issuecomment-6173661908) (P1×1/P2×5) and [#1049@6173675083](https://github.com/kaicreator-mm/domain-harness/pull/1049#issuecomment-6173675083) (P1×3/P2×2) at the same prior \`d5ebd95296605e642246384b5cd2249d7162934a\`. The findings overlap. All material R1 P1s are addressed **on this R3 authored candidate for delta review**, not declared independently CLOSED.

### D01: concrete first JS runtime and effective import closure (review P1-01 / P1-01)

**First qualified reference cohort selected for v0.9 verification:** Node.js **24.x ESM** module loader, selected protected Node Host, and its existing true-CAS **SQLite** Host registry / real physical Capability adapter. This is one **selected shipping profile**, not a requirement that every v0.9 TypeScript SDK consumer is Node, SQLite, Windows, Linux, WSL2 or a specific OS. \`#1028\` is therefore **SELECTED_FOR_THIS_REFERENCE_PROFILE** and a release prerequisite for that profile; genuinely other selected JS runtime cohorts must independently supply real H/C identity, durable currentness and physical effects. The portable SDK Core remains ES2022 / ESM / async, no direct Node globals or SQLite imports. The first-profile Node-specific Host adapter is qualified under #1032 + #1028; Node22 or browsers/QuickJS are not claimed supported by v0.9 Core merely because JS syntax parses.

**Selected module strategy = BUILD-bundled self-contained ESM per Domain Package + protected H repeated admission AST gate.** There is exactly **zero external module import edge** in each selected Package module. BUILD bundles vendored third-party dependencies into the one module's bytes and signs the exact ordered package module SHA256 list; **C packages also obey this constraint** and access selected physical Host facilities through authenticated protected ports, not unpinned \`node:fs\` imports. The approved K/S/B/C modules MAY export local named declarations but MUST NOT contain:
- static \`import\` declarations, \`export ... from\`, \`export * from\`, \`ImportExpression\` (literal OR computed \`import()\`), \`import.meta\`, CommonJS \`require\` calls, or locally invoked code-string evaluation via \`eval\`/\`Function\`/similar constructors;
- remote/network/file/bare specifier execution pathways represented by an ESM import edge or nonbundled module source; all unpinned dependencies fail qualified BUILD.
- non-approved platform builtins: **Package ESM allowlist is EMPTY** in this first cohort. The Host/Capability *implementation* has a separately qualified \`node:\` builtin allowlist/profile; that privileged Host list is **not** a Package import escape.

BUILD statically checks with a version-pinned **full ESTree-compatible ES2022 parser**, not a regex, and rejects unparsed/unsupported syntax. Independently, trusted H repeats the **same bounded import-closure AST check on actual immutable SHA256-confirmed module bytes before *any* evaluation**, even if BUILD already provided a seal. No user-provided parser, trust callback, module resolver, package namespace or \`node:\` import list is accepted by public \`load\`. Host AST policy version, bundler build revision, import-closure policy, Package SHA256, selected ABI and runtime profile are in the approved subject. A selected Host that cannot run this preflight or supply an engine-local module loader is **NOT_QUALIFIED**.

For the first Node24 profile only, protected H maps each verified package byte source into a **private** Node \`data:\` ESM URL with a fresh nonsecret **per-activation cache discriminator** (fragment/query), after exact whole-closure byte/AST preflight and current issuer resolution. Engine module-cache identity is scoped by protected \`(hostAudience,subjectDigest,installedReference,activationNonce,packageId,moduleSha256)\` and cannot be supplied by a public caller. Repeated loads/restarts must not accidentally share prior instance mutable module state. The engine import only ever evaluates the exact H-verified, bundled module bytes; package module source has no legitimate import edge. Node's module URL/cache semantics, runtime dynamic-import negatives and memory/resource bounds are **mandatory executable selected-profile tests** before release; if a Node24 engine corner case cannot enforce the restriction, that selected Host/profile fails qualification rather than weakening the source gate. The approved-code model **does not provide a malicious-JS sandbox**: the signer-approved Module may perform top-level side effects and might deliberately use indirect runtime reflection to violate an intended convention. That is a trusted-deployment/program-review risk; no claim of isolation from malicious *approved* in-realm JavaScript is made. What IS forbidden/proven at the boundary is caller-forged, unapproved or mutated byte/module entry through protected H and the selected direct ESM import profile.

**#1032/#1037 executable negatives:** an otherwise valid approved-root source with (a) static \`file:\`, relative or bare import, (b) \`export ... from\`, (c) literal \`import()\`, (d) computed \`import()\`, (e) \`import.meta\`, (f) code-string eval/constructor use, (g) transitive vendor module left unbundled, (h) mutable source bytes after issuer approval, (i) reused cached mutable Module from a different activation/audience, (j) invalid/unsupported AST: all refuse typed **before any unapproved module import/Effect**. Positive: actual K/S/B/C self-contained ESM code loads under exact approved identity and two real Apps. For a bundled third-party dependency its compiled bytes are **part of the enclosing Package module SHA**, so changing it necessarily changes the signed subject. No undocumented general Node loader hook is assumed.

### D02: exact governance install vs public load ABI and revocation (review P1-02, P2-02/03/04)

The trusted **deployment-only** entry \`protectedHost.install(sealedQualifiedRoot, issuedApproval, selectedAudience)\` is callable solely through trusted governance/Host bootstrap, **not** SDK Core public API; it executes **no** Domain Package source. It independently validates full package structure/roles, source closure AST+SHA, signed subject, current issuer, immutable artifact CAS and installs in the **#1032-owned protected H registry**, backed for the first Node24 profile by **#1028-selected, true-CAS SQLite**. The result is a fresh opaque random installed-reference string bound to exactly \`(hostAudience,appId,rootPackageId,subjectDigest,issuerId,proofDigest,selectedRuntimeAbi,hostAbi)\`; the artifact is separate immutable content-addressed bytes. #1032 owns registry schema/authorization and every startup precondition; #1028 owns physical CAS durability/locking. H currentness channel **must be established** for all v0.9 load/activation, no v0.8 S01 \`verifyDeploymentCurrentness\` no-op fallback.

The **one public SDK input** \`DomainHarness.load(package: InstalledPackageReferenceString)\` is **only that opaque installed-reference string** (not a plain record, HMAC-approved raw Root, object capability, caller-supplied verifier or \`compiledApp\`). H resolves and authenticates the reference by lookup, audience/app/issuer/ABI match, immutable source bytes, selected current approval and revocation before module activation. A copy of the string in an unauthorized audience cannot replay it; a forged same-shape string has no installed record. \`load\` never itself approves/publishes raw source. The transitional approved-raw-root fallback in v0.8 remains historical v0.8 behavior but MUST NOT be exported/used by \`./v9\`.

**Linearization and revocation:** a protected H CAS transaction provides a serializable decision record for fresh activation, caller authorization and effect permits relative to revoke/withdrawal updates. If revocation commits **before** permit/activation commit, refuse before new import/Effect; if permit commits first, already admitted **in-flight** work may complete with K's truthful Journal/UNKNOWN outcome, but no subsequent permit is issued. An app may be actively loaded when a package is revoked: **all new effectful OperationCalls** must recheck both caller scope **and package approval** at the H protected effect-permit boundary (not merely at activation); new sensitive subscriptions/each subsequent delivery recheck principal authorization/currentness. Revocation invokes best-effort teardown of already loaded package resources; never claim that already-started I/O was rolled back. Read-only public queries/stop are still principal-authorized; \`stop\` is not an App-foreign control path. Host storage outage / issuer-withdrawn / missing deployment channel -> fail closed, never silently skip currentness.

**First-profile H storage authority:** #1032 is the logical owner of immutable artifact registry, audience binding, approval/revocation and currentness. #1028 owns its physical Node24/SQLite CAS semantics, **not** business Journal; the selected Kernel Package alone owns business State/Journal/Effect/UNKNOWN and calls selected physical C operations. A non-Node selected cohort is not qualified until an equivalently reviewed durable H store + identity + C profile exists; conditional #1028 is never a universal Core dependency.

### D03: H→K principal capability, per-op scope, effect dispatch and lifetime (review P1-03)

H mints an **internal non-exported opaque per-operation token/handle** (not a plain \`AuthorizedPrincipal\` object that Business can fabricate), reachable from the Kernel only through a protected H→K call port. H binds \`(hostAudience,appId,tenantId,authenticatedPrincipal,selectedClosureDigest,operationId,purpose,scopeSet,issuerAuthEpoch,expiry,nonce)\` and checks it at the requested purpose, audience and selected K. The user/UX/Business/Package-init/public \`load\` input cannot issue/extend/deserialize such a handle; no public \`getModuleNamespace\` surface may permit bypassing K. Authenticity is enforced through protected H registry/private channel + unforgeable token ownership, not a TS interface.

| Façade action / boundary | Protected H decision | K authority / race rule |
| --- | --- | --- |
| \`send\` including selected OperationCall | H authenticate + current principal/tenant/app scopes at receipt; K receives H-internal scoped token | K alone decides admission, state and Effect/Journal. Before dispatch of any **physical effect** H must mint/recheck short-lived one-shot permit at the CAS linearization point; K consumes exactly that permit under same app/intent/effect identity. No stale token carryover across expiry/tenant/app. |
| \`query\` | H validates current read scope and package approval before each sensitive projection call | K alone owns projection/data; no raw K namespace exposed |
| \`subscribe\` create and **each sensitive event delivery** | H validates current principal scope, tenant, app and expiry; invalid/revoked authorization terminates stream before disclosing new event | K alone produces immutable authorized projection; no post-revocation new delivery |
| \`stop\` | H checks app-owner or explicitly BUILD-approved Host admin scope (app, tenant, closure) | Microkernel disposes in order; Business caller cannot stop another App |
| \`init\` / restart | Only selected H bootstrap/installed artifact; revalidate current root/issuer/audience before any module source | K owns runtime state and replay; no caller-minted principal |
| package approval **revocation** during active app | H rejects new permits after committed revocation (and stops new sensitive queries/subscription deliveries); approved earlier in-flight work may finish | K writes truthfully ACK/UNKNOWN based on physical receipt; no false retrospective rollback |

Authorization permit commit and revocation commit are ordered in the **same protected currentness/epoch authority**, or the selected H fails qualification; do not claim an impossible cross-store atomic transaction. Physical I/O already started under a prior committed permit cannot be undone. Expired or revoked handles are checked *again* at effect permit issue, no time-of-check/time-of-use through a caller-supplied token. No separate H Runtime/Journal/Admission/Transition engine is introduced. #1036 owns scoped lifecycle/call integration, #1032 protected H permit API, #1027 K admission contract, #1037 independent tenant, cross-App, expiration, revoke-vs-dispatch and stale-stream adversarial vectors.

### D04: v0.9 digest/canonical byte vectors and errors (review P2-05, P2-01)

Public v0.9 \`load\` failures for invalid/unknown/foreign/revoked/forged/refused reference or stale approval are **one caller-visible \`PACKAGE_NOT_AUTHORIZED\` family** (avoid reference-existence or revoked-issuer oracle). Protected trusted diagnostics preserve typed \`INSTALL_HANDLE_UNKNOWN\`, \`APPROVAL_REVOKED\`, \`APPROVAL_STORE_UNAVAILABLE\`, \`PACKAGE_BYTES_MISMATCH\`, \`ISSUER_WITHDRAWN\` codes without printing secrets. Trusted \`install\` may return \`BUILD_GRAPH_INVALID\`/\`MODULE_GRAPH_DENIED\`; no arbitrary root can invoke it publicly. Additional stable public families: \`UNSUPPORTED_RUNTIME_ABI\`, \`CALLER_SCOPE_DENIED\`, \`OPERATION_NOT_BOUND\`, \`LIFECYCLE_FAILED\`, \`EFFECT_UNKNOWN\`. #1035 is the single public error/API owner; #1027 cannot independently create public competing code names. Detailed subcodes remain internal unless a reviewed successor contracts them.

Digest v9 is **not** a silent replay of v0.8: \`dh.v9.qualified-root.subject/1\` is the exact domain, and input includes \`formatVersion, rootPackageId, buildId, runtimeAbi, hostAbi, ordered packages[\u007bpackageId,kind,abiVersion,moduleSha256,imports:[]\u007d], ordered bindings\`. Both producer and trusted H recompute lower-case hex **SHA-256 of UTF-8 \`JSON.stringify(canonicalSnapshot(subject))\`** with sorted own keys recursively, arrays in sealed order, identical to v0.8 snapshot discipline where safely reusable, and reject unsafe-key \`__proto__\`/\`prototype\`/\`constructor\`, accessors, inherited exotic objects, sparse arrays, non-enumerable keys, nonfinite numbers, \`-0\`/unsupported types, duplicate package IDs and duplicated/ambiguous bindings; no silent prototype/number normalization. BUILD also seals selected runtime/Host versioned profile, AST/module policy revision and exact capability handler route IDs as binding records; adding/changing one creates a new approved subject. Unknown fields/aliases must be refused at qualified-root boundary instead of ignored.

**Canonical byte-test vector V1 (encoding only, not a complete valid three-role closure):**
\`{"bindings":[{"packageId":"K","role":"kernel"}],"buildId":"build-01","domain":"dh.v9.qualified-root.subject/1","formatVersion":"dh.v9.sealed-root/1","hostAbi":"dh-host-protected/1","packages":[{"abiVersion":"1","imports":[],"kind":"kernel","moduleSha256":"0000000000000000000000000000000000000000000000000000000000000000","packageId":"K"}],"rootPackageId":"example-approuvé","runtimeAbi":"js-es2022-esm-async/1"}\`
→ SHA256 UTF8 \`7da00ca06b5342bd35c4feee7df2e672eb903cd91649470ef3697b0ad43b1a7c\`.
**Canonical byte-test vector V2** \`{"a":[0,1,{"A":"☕","z":true}],"b":"é\n"}\` (the newline is encoded as JSON escaped backslash-n, not a literal newline in the serialized bytes) → \`0bd6186336a8cd1a6bc1e174ae52710451e3ffbbacee80f24bd3b104d6092494\`. Vectors are *candidate wire values* that #1032 MUST independently confirm against a real JS runtime before implementation acceptance. No Product-level signed proof exists for either vector yet.

### D05: Standard-owned minimal WorkflowRouter discriminated ABI (review P2-02)

The Standard Basic pure Router receives BUILD-selected intent/Operation candidates plus K-authenticated immutable context, returns **one**:
\`{kind:'selected',operationId,capabilityId,handlerId,basisDigest}\`,
\`{kind:'missing',intentId}\`,
\`{kind:'ambiguous',intentId,candidateOperationIds:sortedUniqueIds}\`,
\`{kind:'denied',reasonCode}\`.
No first-match fallback on equal priority: deterministic exact-priority tie returns **ambiguous**, stable canonical sorting. A denied admission is always K-owned; Standard's \`denied\` is only a pure eligibility-filter result and never a K authorization decision. K validates the Router candidate against selected bindings and H-authorized principal again, then decides transition/Journal/Effect/UNKNOWN. Router cannot persist state, call Host effects or mint H credentials. \`#1027\` owns this canonical discriminator/bindings and direct tests; \`#1035\` exposes its typed façade **without** alternate semantics, \`#1037\` tests tie/denied/missing/forged-K-token negatives. If the existing Standard \`interpret('workflow')\` can implement this discriminator with thin deterministic binding, reuse it; do not create an independent workflow state machine.

### D06: explicit R1 finding disposition and validation ownership

| Prior independent finding | R3 disposition | Real proof owner |
| --- | --- | --- |
| L2 P1 import-loader (both reviewers) | D01 selects first Node24 + zero-ESM-import bundled per-Package and protected full AST preimport with activation-cache identity; rejects all nonbundled graph edges | #1032 implementation P/N + #1037 adversarial selected-Node24 profile |
| L2 P1 install/load ABI | D02 separates governance-only \`install\` and one public installed-reference string \`load(package)\`; no raw/object union, H CAS registry and activation currentness | #1032 + #1035 + #1037 |
| L2 P1 principal/Effect/stream lifetime | D03 protected per-op H→K handle; stop + every-sensitive-delivery and effect-permit revocation/expiry with honest in-flight rule | #1032 + #1036 + #1037 |
| L2 P2 builtin/side-effect ambiguity | D01 empty package builtin import allowlist for first cohort, C physical ports and approved-code trust limitation | #1027 + #1032 |
| L2 P2 missing deployment authority | D02 mandatory H registry before public load, no v0.8 currentness no-op | #1032 + #1037 |
| L2 P2 post-activation revoke lag | D02/D03 new effect permit gate; no new effects after revocation-first commit | #1036 + #1037 |
| L2 P2 conditional Node store hidden edge | D01/D02 Node24/SQLite **explicitly selected for first reference cohort**; #1028 remains conditional in the Core generically | #1028 + #1032 |
| L2 P2 document/error codes | Header/R3 D04 resolves status and caller-facing family vs protected details | #1035 |
| L2 P2 digest vector | D04 pins 2 canonical UTF8 SHA vectors; physical Node24 runtime verification remains essential | #1032 |
| L2 P2 Router/typed ABI | D05 pins discriminator/tie/K boundary | #1027 + #1035 |

**Next gate:** require **ONE bounded independent exact-R3-HEAD delta review** checking the previous reviewers' P1 closure and P2 routing only; re-reviewer should not restart discovery or create an unbounded second demo wave. No authority to claim R3 approved here. \`L2_FREEZE=NO\`, \`FORMAL_DAG=NO\`, \`V09_SOURCE_IMPLEMENTATION=NO\` while independent review + #1006 v0.8 qualified baseline remain absent. User-directed PR CI wait bypass does **not** remove security, Full/Hidden/selected-runtime/clean-consumer or Release Qualification gates.
