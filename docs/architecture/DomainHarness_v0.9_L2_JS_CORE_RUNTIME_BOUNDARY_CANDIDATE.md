# DomainHarness v0.9 — Provisional L2 JS Runtime / Host Assurance Boundary

```ini
STATUS=SOURCE_MAPPED_L2_PREPARATION_NOT_NORMATIVE
PARENT=#1026
PRODUCT_SUCCESSOR_PR=#1045_PENDING
PRODUCT_FREEZE=NO
L2_FREEZE=NO
IMPLEMENTATION_TASK_DAG=NOT_ADMITTED
NEW_SOURCE_IMPLEMENTATION=NO
V08_SOURCE_BASE=3c79a4bf1cd761c61c91079e7b0b5fb2e2914ae2_PROVISIONAL
SCOPE=ONLY_JS_CORE_HOST_CRYPTO_MODULE_BOUNDARY
```

## 1. L2 driver and source readback — the only material JS portability delta

Product direction (2026-10-14) is an independently distributable **JS/TS SDK Core** whose Packages are selected executable JavaScript modules. TypeScript is a build/typecheck authoring format, **not** a runtime dependency. Windows/Linux/WSL2/Node24/SQLite are **not universal Core gates**. Each explicitly selected/admitted Capability implementation may have its own runtime/OS/native requirements, but they must not leak into Microkernel/Kernel/Standard portable API.

On the **current non-release v0.8 source snapshot**:

| Source | Observed binding | Adoption at v0.9 L2 |
| --- | --- | --- |
| `packages/domain-harness/src/public-v8/contracts.ts` | `createHash` from `node:crypto`, `sha256Hex`/canonical closure digest | Preserve canonical serialisation and digest binding while **moving cryptographic physical implementation behind selected protected H/BUILD port**; L2 must pin algorithm/byte encoding and async/verification shape, not silently rewrite hashes |
| `packages/domain-harness/src/public-v8/trust.ts` | Node `createHmac`, `timingSafeEqual`, internal single-process trust registry | Preserve true independent issuer approval/currentness and constant-time-equivalent verification assurance; neither B nor caller may install its own trust root; no `Host.verify` function injected from public `load` arguments |
| `packages/domain-harness/src/public-v8/installer.ts` | whole-closure hash/ABI preflight then `Buffer` + `data:` dynamic import | The accepted **immutable, independently authorised** executable bundle/exports must be statically prelinked or bound through an H-owned, non-caller-forgeable capability **before any untrusted Package code evaluation**; do not promise all interpreters can import `data:` URLs |
| `packages/domain-harness/src/public-v8/load.ts` | `assertQualifiedRoot` → `verifyLoadApproval` → `installQualifiedPackages`; one-arg `load(package)` | Reuse fail-closed sequential ordering. v0.9 may replace *how* H does preimport install, not remove the security property. Caller-supplied `moduleSource`/Provider/Root may not be imported |
| `packages/domain-harness/src/public-v8/microkernel.ts` and `kernel-host.ts` | scoped `send/query/subscribe/stop`, protected fixed Host binding | Continue no raw Kernel/Journal access and no public mutable Host injection; preserve authenticated caller, read revocation and Kernel-only business admission |
| `packages/domain-harness/src/host-v8/{bootstrap,identity,sqlite-cas-store}.ts` | actual Node `node:crypto`, selected SQLite resource and physical CAS | **Node reference adapter** of H/C, not the required universal Core substrate; keep as a tested concrete backend **if selected and distributed**, with no duplicate K State/Effect/Journal |
| `packages/domain-harness-compiler/src/qualified-package/payload/{kernel-mechanism-v1,standard-sdk-v1}.mjs` | physically selected K/S in v0.8, Standard five-Kind `interpret('workflow')` | Wrap/publish the existing semantic engines, only add bounded Standard Router contract where missing; **no second Runtime** |
| `packages/domain-harness/package.json` | public `./v8`, **not** `./v9` | Ship explicit typed stable v0.9 JS/TS public entry and ESM-selected exports, qualified by external clean consumer; do not claim existing v0.9 code present |

This map **does not** assert code pass, portability to non-Node JavaScript engines, or an exact release baseline. After v0.8 Release PASS, replace current source SHA with qualified tag/physical payload digests and run bounded relevant tests.

## 2. Proposed minimal runtime boundary

```text
TypeScript authoring / independently qualified BUILD
 → emitted JavaScript ESM selected K + S + B + C closure
 → immutable sealed artifact with selected ABI and Handler pins
 → external independent deployment / H assurance:
    * approval issuer + actual-byte validation, expiry/currentness
    * create an opaque fixed artifact reference + protected Host bridge
    * install/resolve supported module graph without executable bytes substitution
 → DomainHarness.load(package)     # one argument, no public verifier/Host options
    * selected module wiring / fixed async lifecycle
    * scoped typed send/query/subscribe/stop
 → K (single State/Admission/Journal/Effect/UNKNOWN)
 → selected C implementation (crypto/identity/storage/physical effect/clock as needed)
```

**Requirement, not an implementation authorization:** L2 must specify the smallest JavaScript module/async/evaluation guarantees needed (ESM import graph, Promise/lifecycle, isolated installation/Host port assumptions and typed errors). Runtime-neutral API means **only explicit declared selected Host capabilities** may require runtime-specific crypto/filesystem/OS APIs. A particular ECMAScript engine is *not* universally promised; at least one real engine+selected capability cohort must qualify at release.

The **external approval/currentness verifier is not an open Provider plugin**. The installer must authenticate actual imported bytes and resolve pinned export identities **before executing** any unapproved module. Any untrusted caller-supplied `load(package)` value must fail against protected prelinked identity before reaching a code-evaluating import. A platform without the required selected H assurance must fail closed with typed error, not replace cryptographic checks with self-computable SHA.

Current Node reference Host may be used as a source oracle; L2 must **not** add another Host Domain Package or a runtime plugin resolver. Physical Storage provider is a selected Capability; K remains Journal admission/UNKNOWN authority.

## 3. Falsifiable contract gates (no new demo campaign)

**JS01 — runtime envelope:** typecheck TS API, compile a real selected official K/S+B/C package to JS, execute it with a public v0.9 entry on **one actually declared JS runtime**. Test unsupported feature/provider/ABI with typed refusal. No requirement to run every JS interpreter or OS.

**JS02 — preimport trust and byte identity:** approve sealed Artifact A, mutate one transitive executable byte/handler, revoke approval or offer a forged Root B / callable Host handle before/after process restart. Verify denied **before unauthorized JS module evaluation** with zero unauthorized effects.

**JS03 — H and K ownership:** caller-supplied principal/role cannot mint H identity; protected revocation verified on reads/subscriptions and OperationCalls; effectful requests route K Admission→Journal→Effect/UNKNOWN, never a physical selected Handler directly. Agent callable default stays read-only.

**JS04 — real selected C lifecycle:** optional `init/dispose` under fixed Package order, failure cleanup and no partial facade; real selected physical storage capability implements durable CAS where the Business App needs Journal/recovery. Test crashes/restarts on selected actual runtime/provider, not mandatory SQLite for every installation.

**JS05 — two real consumers and public artifact:** reuse existing v0.8 Approval and Engineering actual Business Apps as baseline, with same selected K/S; independent install consumes versioned SDK/BUILD/K/S plus chosen C artifact via public paths only; no deep imports or private monorepo fixtures. No third fake app.

**JS06 — release separation:** qualified v0.8 inheritance, independent source/security review, Full/Hidden/Critical Journeys/packaging and typed unsupported-target status. **Any optional Node+SQLite profile which is advertised** needs corresponding driver/WAL/CAS/physical fault evidence. Zero universal Windows/Linux/WSL2 matrix.

## 4. Formal L2 decisions still required after Product Freeze

1. Exact JS module/ESM/async runtime floor and import-security ABI; no Node builtin in public Core contract.
2. Where byte digest/canonicalization run (BUILD/installer/H), and how H provides independently verifiable issuer/caller currentness without a public Host verifier argument.
3. Opaque handle/selected module identity and per-process restart reapproval, trust-root rotation/revocation and no evaluation of unapproved modules.
4. Fixed selected Capability contracts and async lifecycle with scoped resource handles; no Host-owned Business state.
5. Public TS exports (source root `./v9`), compiled JS artifact and runtime error mapping, optional selected reference profiles.
6. Selected storage CAS/durability vs K Journal semantics, exactly which full/hidden/security probes apply to the Core and chosen adapters.

**Owner mapping (existing issues, not a formal new DAG):** N01 #1027 K/S/Package/Standard Workflow semantics; N06 #1032 BUILD/distribution/protected installed modules; N07 #1035 public JS/TS entry; N09 #1037 independent security/release; N02 #1028 only a selected Node/SQLite reference implementation if shipped; N08 #1036 Core operation/lifecycle and chosen reference capability ops. Reuse frozen v0.8 material. One PR per concern.

`PRODUCT_FREEZE=NO; L2_FREEZE=NO; FORMAL_DAG=NO; SOURCE_BUILD_TESTS=NOT_RUN; RELEASE=HOLD`.
