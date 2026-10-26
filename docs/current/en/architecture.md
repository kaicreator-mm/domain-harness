# DomainHarness v0.10.2 — System architecture

[Documentation index](index.md) · [中文版本](../zh-CN/architecture.md)

The system is an **external BUILD producer + Microkernel + selected Domain Packages + optional Host**, not a second state/admission engine inside Microkernel.

## Build/runtime boundary

```mermaid
flowchart TB
  subgraph P["Trusted BUILD producer (separate install/process)"]
    A["Selected K/S/B/C modules"] --> B["Validate ABI / hashes / imports / routes"]
    B --> C["buildV10App"]
    C --> D["Sealed plain-data Domain App"]
  end
  subgraph R["Runtime consumer"]
    U["Application Host: DocStore / caller authority / deployment"] --> M["Microkernel.load"]
    D --> M
    M --> F["send / query / subscribe / stop"]
    M --> K["Single selected K Primary"]
    M --> S["Selected S + B + C modules"]
    K --> H["Physical Host CAS / optional SQLite"]
    S --> H
  end
```

## Role ownership

```mermaid
flowchart LR
  UX["User / UX"] --> MK["Microkernel: wiring and lifecycle"]
  MK --> K["K: State / Admission / Journal / Effect permit / Replay / UNKNOWN"]
  MK --> S["S: semantic / workflow"]
  S --> B["B: Intent and domain rules"]
  B --> C["C: declared Tool Operations"]
  K --> H["Host: physical CAS and adapters"]
  C --> G["K-governed effect boundary"]
  G --> EXT["External system"]
```

## Conceptual journey

```mermaid
sequenceDiagram
  participant A as Application
  participant P as BUILD
  participant M as Microkernel
  participant K as K Primary
  participant H as Host
  A->>P: Select Package / ABI / routes
  P-->>A: Trusted prebuilt App
  A->>M: load(App, Store / Authority)
  A->>M: send(intent)
  M->>K: Admission / replay / Effect decision
  K->>H: Read and CAS / governed effect
  K-->>M: Receipt / state
  M-->>A: Outcome
  A->>M: query / subscribe
  M-->>A: Authorized snapshot / redacted event
  A->>M: unsubscribe / stop
```

**Invariant:** K uniquely owns durable business-state decisions, effect permits and UNKNOWN. Host offers physical operations; `microkernel/host-seam` is API organization, not authorization. A private JS helper is not automatically a Tool. These are conceptual diagrams, not a literal internal call trace. See [frozen L2](../../architecture/DomainHarness_v0.10.2_L2_FREEZE.md).

---

**Version:** immutable tagged runtime `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL** (Full `EXIT1`, root `NOT_RUN` retained). This is post-release explanatory documentation, not a changed ABI.
