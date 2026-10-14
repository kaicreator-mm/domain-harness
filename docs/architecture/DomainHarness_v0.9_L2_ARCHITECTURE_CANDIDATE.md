# DomainHarness v0.9 — JS/TS Core L2 Architecture Candidate R0

```ini
DOCUMENT_STATUS=DRAFT_L2_NOT_FROZEN
PARENT=#1026
PRODUCT_SCOPE=R2_F01_F10_FROZEN_PR1048_MAIN_a51a0c57f1c66d602120e6538b4db24072a2e747
V08_OBSERVED_SOURCE=3d1b50bc7cea6af29c847755de9b425aa8e3b4a3_UNQUALIFIED
REUSE_SOURCE_MAP=PR1046_DRAFT_PREPARATORY
INDEPENDENT_ADVERSARIAL_L2_REVIEW=NOT_RUN
FORMAL_IMPLEMENTATION_DAG=NOT_ADMITTED
SOURCE_IMPLEMENTATION=NOT_AUTHORIZED
V09_RELEASE=HOLD
```

## 1. Frozen Product and stage boundary

The normative Product input is R2 F01–F10 accepted by the merged [Product scope checkpoint PR #1048](https://github.com/kaicreator-mm/domain-harness/pull/1048), after the substantive adversarial terminal [#1026@6169545765](https://github.com/kaicreator-mm/domain-harness/issues/1026#issuecomment-6169545765), P0=0/P1=0/P2=2 routed. The historic PRD/roadmap's Node/OS-only P0 statements are superseded by the JS Core successor. Distinct-GitHub-account reviewer approval is **not attested**; do not forge it.

Source reuse starts from **observed, not released** `v0.8@3d1b50bc7cea6af29c847755de9b425aa8e3b4a3`, with exact byte evidence in #1046. #1003/#1005/#1023/#1006 and v0.8 release remain their own required gate. This L2 may be reviewed before v0.8 releases, but implementation cannot start or inherit a fictitious release PASS; re-pin final v0.8 tag and artifact digests at implementation admission.

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
