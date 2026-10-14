# DomainHarness v0.9 — JS/TS Core Execution Contract and Target-Specific Capability Proof

```ini
STATUS=USER_DIRECTED_L1_SUCCESSOR_PROPOSAL_NOT_FROZEN
PARENT=#1026
SUPERSEDES=PR1044_F01_F02_F06_OS_NODE_SQLITE_AS_SDK_WIDE_P0
CORE_REQUIREMENT=JAVASCRIPT_MODULE_EXECUTION_CONTRACT
TYPESCRIPT=DEVELOPMENT_TYPECHECK_AND_BUILD_TO_JAVASCRIPT
OS_MATRIX=NOT_CORE_PRODUCT_ACCEPTANCE
NODE24_SQLITE=REFERENCE_ADAPTER_NOT_CORE_GLOBAL_REQUIREMENT
FORMAL_L1_REVIEW=REQUIRED
IMPLEMENTATION=NOT_AUTHORIZED
V08_INHERITED_GATES=UNCHANGED
```

## 1. Product correction — no OS/Node/SQLite requirement on the Microkernel as such

DomainHarness v0.9's **portable SDK Core** is a JS/TS authoring/consumption contract: build-time TypeScript types and compile-time validation, with **actual execution of the selected JavaScript modules**. Do not require a TS compiler or .ts source loader at Domain App runtime. L2 must pin the **smallest explicit JS language/module/async and Host Capability ABI floor** needed for this SDK, after physical source reuse; do not silently equate 'JavaScript' with unlimited Node/Bun/Deno/QuickJS/browser compatibility.

**Core P0:** independently installable/versioned SDK; `DomainHarness.load(package)` over a BUILD-selected closed executable artifact; exactly one K State/Admission/Effect/Journal/UNKNOWN/Replay authority; Standard Schema/Rule/Decision/Workflow/Operation + selected bounded Router; Business Packages; a target-neutral identity/security/currentness mechanism with **protected external H** provenance, verified actual selected bytes and no self-attestation. Expose async typed connection, scoped callable Operation/Tool semantics, lifecycle and no-unauthorized-effect/fail-closed obligations.

**Not Core P0:** naming Windows, Linux, Ubuntu, WSL2, bare metal, VM, container, fixed Node major, file path conventions, native compiled `better-sqlite3`, a particular SQLite version, mandatory durable journal **storage engine choice**, portable JS across every interpreter, or physical file/OS API. Those are **per selected Host/Capability Package Profile** requirements, not properties of Microkernel.

**Selected capability** (Node native SQLite or otherwise) must satisfy all *applicable* independently verifiable real persistence, CAS, UNKNOWN/recovery, authority, and lifecycle requirements for any deployment that **claims that capability**. To call v0.9 Core 'production-ready', actually execute meaningful end-to-end Domain Apps on **at least one declared supported JavaScript runtime with actually bound qualified capabilities**, including real durable storage for journeys that require it, with failure/security/Full/Hidden/CJ evidence. This does **not** prove any other JS runtime or OS.

**Reference adapter:** reuse existing v0.8 Node + SQLite capability as a convenient **reference/integration fixture and separately releasable Node Basic Profile**. Its platform, driver ABI and measured performance claims are qualified under **its own documentation** *if it is shipped/promised as production-supported*. Failing or lacking unrelated Windows/Linux/WSL2 environment checks never blocks the Core SDK Freeze. Do not silently delete a selected official Node profile's own consumer/security/durable-storage tests either.

## 2. JS execution contract vs Host ports

```text
TypeScript authoring + schema / API types
  -> BUILD compiler (ESM-compatible selected executable JS Package modules)
    -> independent approval + immutable selected artifact / pinned handlers
      -> JS-compatible Microkernel (load/prelinked connect/init/stop)
        -> Standard + one Kernel + Business Packages
          -> selected Capability Package and protected H Host ports
               [crypto/clock/storage/identity/physical effects are OPTIONAL ABI providers,
                but mandatory WHEN the selected App contract requires them]
```

- **Module compatibility:** L2 specifies real ESM import/exports, async semantics, module identity, conditional JS APIs and rejection codes; **no runtime-global Node `Buffer`, `process`, `node:crypto` assumption in the Core ABI** without an explicit selected Host bridge.
- **Source reality warning:** the released-unqualified v0.8 Core source currently imports `node:crypto` in `public-v8/trust.ts` and `public-v8/contracts.ts`; its installer uses `Buffer` and `data:` ESM imports. These are **real current Node dependencies**, therefore JS runtime neutrality is a **v0.9 target requiring a bounded L2 assurance design and tests**, not an already demonstrated portability PASS. Preserve independent signature verification, pre-import byte validation and fail-closed authorization when moving platform-specific crypto/loader seams.
- **Storage:** Kernel continues to own effect/journal/UNKNOWN semantics while a selected Capability supplies physical durable CAS/commit/restart with the required guarantee; SQL/SQLite is just one implementation. Without a sufficiently durable selected storage profile, **do not label those persistence journeys production ready**.
- **Security:** nothing about the JS runtime-neutral goal removes protected H caller context, external DAC/currentness, pre-import trusted bytes or per-operation Kernel gate. An unbound environment must refuse typed, not grant implicit Host capabilities.

## 3. Verification ownership

| Scope | Must prove | Must NOT require |
| --- | --- | --- |
| **SDK Core P0** | TS typecheck -> emitted JS/ESM contract; one genuinely executed JS runtime selected for qualification; K/S/B closure and binding, lifecycle, no unauthorized code/import/Effect, selected durable/identity capabilities for real App journeys; tests/Full/Hidden/CJ/release evidence on shipped executable artifact | Windows/Linux/WSL2 matrix, Node24/SQLite globally, blanket all JS engine compatibility |
| **Capability / Host selected profile** | Exact selected runtime APIs, platform driver/storage/network/identity scope and faults; implementation/ABI versions and operational claim checked where relevant | Global OS tests for unrelated or unselected providers |
| **Reference Node Basic (if distributed)** | Node and SQLite specific real P/N/cleanup/crash/lock/backup/profile tests and independently installed clean consumer under precisely declared supported profile | Pretend Node Basic is a second Domain Runtime Package or impose its ABI across SDK Core |
| **Portability breadth** | Each additional advertised JS interpreter, browser, sandbox, alternate OS or specific optional adapter qualified separately | Automatic all-JS-engine support based only on source language |

**Release can PASS only for the exact Core/runtime/capability combination actually demonstrated.** This preserves version-close and safety standards, while eliminating an arbitrary OS acceptance matrix.

## 4. Existing issue ownership; no new research DAG

- **N01 #1027**: generic Package manifests, Standard WorkflowRouter and reusable source.
- **N02 #1028**: Capability-owned Host/Identity/Storage adapters as **implementation-specific** reference, not v0.9 mandatory Windows/Linux/WSL2 suite.
- **N06 #1032**: Core and official Package distribution / JS runtime declared contract; optional Node Profile's own distributable.
- **N07 #1035**: JS/TS SDK consumption and public types; no mandatory Node-only deep-import entry as universal API.
- **N08 #1036**: Core operation/lifecycle/error bounds and **chosen adapter's** realistic performance/durable/ops benchmark, not an OS matrix/SQLite-only global SLO.
- **N09 #1037**: exact actual shipped JS runtime plus selected bound capabilities, independent security/Full/Hidden/CJ/consumer release proof. Additional adapter/runtime support only if advertised; no false PASS on untested environment.

**Phase truth:** PR #1044 Freeze Candidate is **superseded and must not be rubber-stamped at the old exact SHA** because F01/F02/F06 have materially changed by explicit user direction. Revise Product/PRD/Freeze candidate and request one fresh exact-head Product/L1 review. v0.8 unchanged; v0.9 source implementation still waits for the qualified v0.8 baseline and admitted L2/DAG. No second Ubuntu host, no new demo wave, no fabricated validation.
