# DomainHarness v0.10.2 — architecture diagrams / 架构图

**Scope:** descriptive explanation of the [frozen v0.10.2 design](DomainHarness_v0.10.2_L2_FREEZE.md) and the [tagged code](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2). The diagrams show **ownership and trust boundaries**, not new public contracts.

## 1. Build-time versus runtime / 构建与运行隔离

~~~mermaid
flowchart TB
  subgraph PRODUCER["External trusted BUILD producer — separate install/process"]
    author["K / S / B / C Package sources + manifests"]
    selected["Exact module selection, ABI, hash and import closure"]
    build["domain-harness-build: buildV10App"]
    app["Immutable sealed plain-data Domain App"]
    author --> selected --> build --> app
  end
  subgraph CONSUMER["Installed Domain App / runtime process"]
    bootstrap["Application-owned Host bootstrap / caller authority"]
    mk["domain-harness-microkernel: load(App, options)"]
    facade["Public facade: send / query / subscribe / stop"]
    k["Selected K Primary Package"]
    s["Selected S Primary + chosen S Features"]
    b["Selected Business Packages"]
    c["Selected Capability/Tool Packages"]
    ports["Host ports: CAS DocStore, optional SQLite, effect adapters"]
    bootstrap --> mk
    app -->|"transfer immutable App artifact"| mk
    mk --> facade
    mk --> k
    mk --> s
    mk --> b
    mk --> c
    bootstrap --> ports
    k -->|"physical CAS operations"| ports
    c -->|"governed effect path; K permit required"| ports
  end
  build -.->|"FORBIDDEN runtime import"| mk
~~~

The dashed edge is a **prohibition**, not an actual module dependency. A loaded App is trusted *only after* external producer/build qualification. Runtime does not discover, select, download or compile a package.

## 2. Responsibility layers / 权责归属

~~~mermaid
flowchart LR
  ux["UX / application caller"] --> f["Microkernel public facade"]
  f --> k["Kernel Primary K\nState • Admission • CAS decision\nJournal • Effect permit • UNKNOWN • Replay"]
  f --> s["Standard Primary S\nSemantic / workflow interpretation"]
  s --> b["Business B\nIntent and business policy"]
  b --> c["Capability C\nDeclared Operations / Tool handlers"]
  k --> h["Host physical persistence / CAS"]
  c --> gate["K-governed effect gate / Host adapters"]
  k -.->|"read-only K permit view"| gate
  gate --> outside["External system"]
~~~

**Hard lines:** K is the only durable authority; Host provides transactions and adapters but must not become a second K State/Journal writer. Microkernel owns wiring/lifecycle, never K's decision algorithm. S/B cannot issue permits; a private JS helper is not automatically a Tool. The `./host-seam` subpath is an API-organization boundary, **not** a security permission.

## 3. Execution lifecycle / 调用序列

~~~mermaid
sequenceDiagram
  actor U as Application / User
  participant P as External BUILD Producer
  participant M as Microkernel
  participant K as Selected K Package
  participant S as Selected S / B / C
  participant H as Host CAS / Effect
  U->>P: select trusted Package bytes / manifests
  P->>P: check graph, digest, role and ABI
  P-->>U: sealed plain-data App artifact
  U->>M: load(app, {store, queryAuthority, ...})
  M->>K: attach selected authoritative Kernel
  M->>S: bind selected semantic and operation modules
  U->>M: send(intent)
  M->>K: govern admission / replay / effect eligibility
  K->>H: read/CAS journaled state
  K->>S: permit admitted domain handling
  S-->>K: semantic result / declared capability request
  K->>H: govern permitted external effect
  K-->>M: typed outcome/receipt
  M-->>U: send() result
  U->>M: query(selector) / subscribe(selector, listener)
  M->>K: resolve scoped target + authority checks
  K-->>M: authorized projection
  M-->>U: scoped answer / redacted event
  U->>M: unsubscribe() / stop()
  M->>M: deactivate, clear queues, dispose
~~~

This sequence is **conceptual**, not a promise that every internal call happens in this exact order. In particular `subscribe` is async and authorization is rechecked before event delivery; a denied observer must not leak raw K documents or receipts.

## 4. Package and distribution graph / 依赖图

~~~mermaid
flowchart LR
  CT["@kaicreator/domain-harness-contracts"]
  BL["@kaicreator/domain-harness-build (producer only)"]
  MK["@kaicreator/domain-harness-microkernel"]
  HN["@kaicreator/domain-harness-host-node (optional)"]
  SQLite["better-sqlite3 (optional peer)"]
  BL --> CT
  MK --> CT
  HN --> CT
  HN --> MK
  HN -. "when selected" .-> SQLite
~~~

At the **tagged tree**, these four public workspaces carry `0.10.2-rc.0` manifest versions and `engines.node >=24.0.0`. Legacy core/compiler/expo workspaces are private. A tagged Git source repository is **not evidence of published registry artifacts**.

## 5. Tiny versus Rich / 最小与扩展实例

| | Tiny | Rich |
| --- | --- | --- |
| BUILD installed in runtime | No | No |
| Microkernel + selected K/S/B/C | Yes | Yes |
| Optional S/Agent features | Only if explicitly selected; standard Tiny omits them | May select independently |
| Persistence example | Single-process plain-file or injected in-memory DocStore | File-backed SQLite Host / real CAS |
| Cross-process CAS proof | **No** for example plain-file store | SQLite-backed Rich fixture |
| Key verification | `send/query/subscribe/stop`, scoped permission | Multi-B, CAS conflict, replay, Effect/UNKNOWN, reboot |

**Source anchors:** [Microkernel public API](../../packages/microkernel/src/index.ts), [runtime facade](../../packages/microkernel/src/domain-app.ts), [Host entry](../../packages/host-node/src/index.ts), [BUILD entry](../../tooling/build/src/index.ts), [Contracts](../../packages/contracts/src/index.ts), [Tiny/Rich fixture](../../tests/integration/v010-clean-consumers/clean-consumers.test.ts), [L2 negative boundary matrix](../validation/v0.10.2/L2_NEGATIVE_BOUNDARY_MATRIX.md).

No portability matrix is claimed beyond actual Node24 qualification. No RAM amount or OS vendor is part of the DomainHarness product interface.
