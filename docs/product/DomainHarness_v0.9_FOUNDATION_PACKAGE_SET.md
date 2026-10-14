# DomainHarness v0.9 — JS Core Foundation Package Set and optional Node Basic Profile (Product Contract Proposal)

```ini
STATUS=PROPOSED_PRODUCT_CONTRACT_PENDING_INDEPENDENT_L1_REVIEW
PARENT=#1026
OWNERS=N01:#1027;N02:#1028;N06:#1032;N07:#1035
IMPLEMENTATION=NOT_AUTHORIZED
V08_CLAIMS=UNCHANGED
RELEASE=NOT_QUALIFIED
```

## Controlling JS/TS Core scope successor (2026-10-14)

User-confirmed current Core requirements: JavaScript module execution after TypeScript authoring/build, not a specific OS, Node version or SQLite. **The mandatory Foundation Core** is SDK Microkernel, selected executable Kernel+Standard Domain Packages, producer-neutral BUILD and the contract for **selected** Business/Capability Packages with independent H trust. `Identity.node`, `Storage.sqlite` and `Node Basic Profile` below are **REFERENCE/SELECTED implementations only**, **not mandatory for every DomainHarness SDK consumer**. These concrete packages retain their own real validation obligations **if shipped/promised**, including native SQLite durability, but must not drive a Windows/Linux/WSL2 P0 matrix for the Core.

See [JS runtime successor](./DomainHarness_v0.9_JS_RUNTIME_CONTRACT_SUCCESSOR.md). Actual v0.8 Core imports `node:crypto` and uses `Buffer`/`data:` imports; L2 must prove portability seams **without removing current security checks**. Do not misstate all-JS-engine portability already achieved. **Where historic Node-only P0 statements below conflict, this user successor controls** until formal refreshed Product Freeze.

## 1. Decision — core is a **small official package set**, not a second Runtime

**Scope to Product-freeze for v0.9:** ship a separately identifiable, reproducible **Foundation Package Set** containing the minimal Microkernel SDK, physically executable Kernel Basic and Standard Basic Domain Packages, two Node capability implementations (Identity, SQLite Storage), and producer-neutral qualified BUILD tooling. A **Node Basic Runtime Profile** pins the set. The Profile is metadata/selection/deployment policy, **NOT** another Domain Package and **NEVER** a State/Effect/Journal engine.

This separates three identities which must not be conflated:

1. **SDK/distribution artifacts** (npm-compatible tarball/immutable release archive; installation/developer-facing version).
2. **Domain Packages** (BUILD-selected executable unit, each independently versioned and hashed, even if several are delivered in one physical release archive).
3. **App Assembly/Runtime Profile** (a locked composition of Package versions, Node target, ABI/Handler/Capability binding, independent installation/activation evidence; not an executable module or a trust authority in itself).

Do not require a new npm workspace for each Domain Package merely for aesthetics. **Independently addressable and installable Package artifacts** are P0; separate npm packages per Domain Package are an implementation choice. A consumer must not need a compiler source-path or private test fixture.

## 2. Official minimum v0.9 shipped components

| Deliverable ID (candidate) | Form | What it owns | P0 status / packaging |
| --- | --- | --- | --- |
| `@kaicreator/domain-harness` (public `/v9`) | Microkernel SDK artifact | `load(package)`, fixed connection, lifecycle, public typed façade, host-gateway contract; no domain State/Effect/Journal or active provider discovery | **P0**; reuse current workspace implementation, add unambiguous v0.9 public consumption surface |
| `kaicreator.kernel.basic` | Official **Kernel Domain Package** | one selected State/Transition/Guard/Admission/Effect/Journal/UNKNOWN/Replay authority; adapter to selected physical ports | **P0**; package v0.8 physically executed selected Kernel code with no rewritten second engine |
| `kaicreator.standard.basic` | Official **Standard Domain Package** | Schema, Rule, Decision, Workflow (including WorkflowRouter), Operation semantics and authorized resolver; no State/Journal engine | **P0**; first implementation reuse v0.8 Standard module; internal modules may be separate but one public Package for now |
| `kaicreator.capability.identity.node` | Capability Domain Package (Node target) | credential-verification implementation/Handler, interface, init/dispose, scoped output. **H still owns independent caller provenance and protected trust provision** | **P0** physical selected implementation; do not allow package to mint its own issuer/verified facts |
| `kaicreator.capability.storage.sqlite` | Capability Domain Package (Node target) | SQLite DB access + atomic CAS primitives, resource lifecycle and physical error mapping; **K retains policy and Journal/Effect admission** | **P0** physical selected implementation; reuse v0.8 real SQLite storage and security tests |
| `@kaicreator/domain-harness-compiler` | Independent BUILD **toolchain**, **not** a Runtime Domain Package | qualified Package selection, K/S/B/Capability closure and Handler binding, pinned profile packing and subject digest; external DAC approval remains independent | **P0**; existing compiler reusable, Forge is the authoring/Business Package generator outside Harness |
| `kaicreator.node.basic` | **Runtime Profile** (lock/manifest, not runnable handler) | exact K/S/Identity/Storage versions and digests, ABI version, deployment target, consumer SDK version, protected approval reference | **P0** distribution convenience; never instantiate a second Runtime or authorize itself |

**Business Packages:** Approval and Engineering are **distinct consumer/demo/conformance packages** and are not bundled as mandatory SDK business logic. At least one actual external app can author its own B package via the public BUILD interface.

**Model, Network, File, Script, Device** are optional and independently selected capabilities; adding them must not increase required Node Basic install closure unless Product specifically admits a real use case. Builtin Node modules and OS APIs are external implementation dependencies, **not** Domain Packages by themselves.

### Fresh source baseline audit — do not confuse proposed Router with shipped v0.8 function

On `v0.8@fd53e09826fe304e4f2f8e15fd291dd52c917e5a`, the selected physical `standard-sdk-v1.mjs` exports `STANDARD_KINDS = ['schema','rule','decision','workflow','operation']`, plus `interpret(...)` and resolver support, **but has no exported `WorkflowRouter` or `workflowRouter` symbol**. Therefore `WorkflowRouter inside Standard Basic` is a **v0.9 P0 target**, **NOT** proven delivered by v0.8's existing five-Kind interpreter. The old five-Kind `workflow` evaluation must remain supported and reusable.

**Smallest Router contract to admit at L2:** given BUILD-selected Workflow/Rule/Decision semantics and authenticated Kernel-approved execution context, produce a bounded, deterministic **Workflow handler selection/dispatch** with typed no-candidate/ambiguous/denied failures. The selected Kernel still owns actual per-occurrence State, WAIT/RESUME, Effect/Journal and recovery. No separate generalized planner/agent/Workflow runtime and no automatic candidate promotion. Test two real Approval and Engineering selected Workflow graphs (positive) and wrong provider, ambiguous candidate, unauthorized admission, expired context (negative). If this adds zero demonstrated value beyond the existing `interpret('workflow')` and currently selected Kernel Workflow routing, permit an **explicit public alias/facade over existing logic** after L2 source proof; do not introduce a duplicate state machine just for the `WorkflowRouter` name.

### Workflow placement — settled scope proposal

Workflow and WorkflowRouter **stay in `kaicreator.standard.basic` for v0.9**. Standard defines Workflow/Decision/Rule routing; the Kernel owns occurrence state, WAIT/RESUME commits, admission/Journal/Effect/replay. Business declares concrete workflows. A separate `standard.workflow` package may be considered **only later** for independently justified ABI lifecycle/reuse; not required by the v0.9 Product exit.

### No `Runtime Domain Package` as a second engine

`Kernel Basic` is the **actual generic Domain Runtime mechanism Package**. A package named `runtime-basic` would be redundant and prohibited **if it owns State/Effect/Journal**. The supported `node-basic` is only the BUILD-locked combination/version/support profile. Do not create `host-node` as a catch-all Domain Package: **capability ownership** determines Package bounds; deployment/H Host assurance remains an external role.

## 3. Package metadata contract (illustrative shape, exact ABI decided at L2)

Each Foundation Domain Package MUST have:

- Stable `packageId`, `packageVersion`, ABI major, entry/exported endpoints, own capability contracts, scoped requirement/provider declaration, target profile, BUILD pin and content digest. Every dependency points at the exact selected identity+version+hash (no runtime semver float).
- Optional `init(ctx)` / `dispose(ctx)` scoped to its own capability handles and config. Failure stops activation and disposes already-initialized prefix in reverse order; don't promise undo of imported top-level JS or of already committed external effects.
- For a callable endpoint: versioned Operation identity + input/output/error/effect class; build-qualified **fixed Handler identity**. A declarative Schema or plain Workflow definition is not automatically a callable Tool.
- No package-controlled trust-root assignment, external approval issuance, second independent Kernel, direct LLM/agent effectful mutation, or dynamic local/remote plugin discovery. Build targets may be producer-neutral and assembled by Creator, but do not authorize their own artifact.
- Node/SQLite implementation package may rely on driver/native module installed as approved dependent artifact; do not pretend portable JS can access Node physical APIs without an adapter.

**Profile example, conceptual only; do NOT treat the following names, fields or version strings as already implemented ABIs:**

```yaml
profileId: kaicreator.node.basic
profileVersion: 0.9.0
sdk: "@kaicreator/domain-harness/v9"
target: "node24-linux-x64"
packages:
  kernel: { id: kaicreator.kernel.basic, version: "<pinned>", digest: "<verified>" }
  standard: { id: kaicreator.standard.basic, version: "<pinned>", digest: "<verified>" }
  capabilities:
    - { id: kaicreator.capability.identity.node, version: "<pinned>", digest: "<verified>" }
    - { id: kaicreator.capability.storage.sqlite, version: "<pinned>", digest: "<verified>" }
business: "<consumer-specific BUILD-selected Business Package>"
```

A shipped profile must use **actual tested hashes** and independent DAC/deploy subject binding, not placeholder fields. A profile cannot substitute for a verifiable sealed executable App artifact, nor can the SDK select alternate modules from untrusted caller input.

## 4. ABI/version and official distribution decisions

- Publish the **SDK release version** (v0.9.x) separately from every Foundation **Domain Package implementation version**; each Package has a frozen **ABI major + content SHA**. The built Assembly records exact identities, not a moving latest Package.
- Within the **supported v0.9.x line**, public documented API, type/errors, package metadata and selected Handler semantics must have declared stability/change policy. Breaking changes require a new supported ABI major/qualified target and revalidation. **NO old v0.1–v0.8 ABI, serialized state, rolling upgrade or cross-version in-flight replay obligation before v1.0**.
- Default official distribution: **version-tagged, immutable, checksum-listed release archives/tarballs** for SDK, BUILD and independently addressable K/S/Identity/Storage; npm publication is optional. The actual channel must be verified via a separate clean project, no monorepo-private `src`, fixtures, or privileged deep imports.
- One release manifest contains package IDs/version/digests, target/native-driver platform ABI, transitive dependency facts, link of reproducible build input SHA/tree, issuer/activation verification policy and exactly one selected K, S and preapproved capabilities. Build emits a prelinked installable bundle; independent H/deployment verifies actual installed executable bytes and current authorization on **every process activation/restart before import**. Do not rewrite existing v0.8 security checks until stronger equivalence is established.

## 5. Foundation positive/negative P0 acceptance — external clean consumer

**P1.** Package A Approval and Package B Engineering from the **existing real v0.8 assets** build and execute with **identical** foundation Kernel+Standard digests; both consume the same actual Identity/Storage capability implementations. A third-party consumer assembles its own B source from the documented API and uses independently installed official artifacts, not a test fixture. No third bespoke demo is needed: a minimal consumer exercise using the existing two Apps is enough.

**P2.** Actual logged `load(package)` instantiates one closed Foundation cohort with optional package lifecycle, authenticated UX query/send/subscribe and pure/effectful OperationCalls through fixed selected Handlers; real SQLite restart/replay/UNKNOWN and scoped results have executable P/N evidence.

**N1.** Unsupported target, missing/duplicate/ambiguous provider, cross-version ABI mismatch, forged `packageId`, unsigned or replaced installed module, expired/revoked DAC designation **after installation**, forged prelinked handle, wrong K, shadowing Identity, unauthorized caller/agent mutation: typed refusal before unauthorized import/State/Effect/Journal.

**N2.** An independent clean consumer cannot deep-import secrets/Host handles to bypass caller authentication; provenance and H assurance are external to Identity implementation and BUILD self-signing; rejected caller leaves zero unauthorized effects.

**N3.** Missing native SQLite driver, read-only storage, CAS conflict, corrupt schema, aborted init, repeated stop and crash windows preserve Kernel authority and typed error/UNKNOWN with no false durable ACK.

## 6. Existing assets and scope control

Reuse v0.8 `packages/domain-harness/src/public-v8`, compiler `qualified-package` and physical `payload/{kernel-mechanism-v1,standard-sdk-v1}.mjs`, `host-v8` Node physical sources and the approved Approval/Engineering packages. Exact v0.8 merge SHAs evolve; import only the **released** v0.8 baseline after #1006 qualifies it. Current v0.8 S02a generic capability ABI is evidence, **not proof of a production distributable Foundation Set**.

Scope N01-min/#1027 owns package reuse/metadata; N02-min/#1028 owns actual Identity/Storage Node physical binding; N06/#1032 owns packaging/profile/compatibility/install; N07/#1035 owns public consumer developer API/docs; N09/#1037 owns independent qualification. One concern/PR per owner; no second DAG for Package names.

`L1_PRODUCT_SCOPE=PROPOSED; ABI_L2=NOT_FROZEN; TESTS=NOT_RUN; NO_V08_REQUIREMENTS_MOVED=YES.`
