# Domain Intelligence Standard (DIS) 0.2.0

**Status:** ARCHITECTURE_CANDIDATE / NOT_FROZEN  
**Controller:** [domain-harness#1493](https://github.com/kaicreator-mm/domain-harness/issues/1493)  
**Branch:** `dis/0.2.0-l2-candidate`  
**Predecessor:** DIS 0.1.0, frozen at `9504c78f4651f6c1ebc48c7858fca2d8b061544b`  
**Authority:** Product/L1 #1477 and successor Boot/KDP checkpoint #1484

## Purpose

DIS 0.2.0 is a deliberate simplification and evolution of DIS 0.1.0. It retains the valuable Domain Intelligence, provenance, evidence, authority, deterministic composition and reproducibility contracts, while reducing overlapping concepts and filling the structured-intent gap.

This is a **standard candidate**, not a Runtime or SDK implementation. DIS 0.1.0 remains immutable and independently frozen.

## Documents

- [DIS 0.2.0 — 中文规范候选](./DIS-0.2.0.zh-CN.md)
- [DIS 0.2.0 — English specification candidate](./DIS-0.2.0.en.md)
- [概念简化与迁移台账](./SIMPLIFICATION_LEDGER.zh-CN.md)
- [Simplification and migration ledger](./SIMPLIFICATION_LEDGER.en.md)

## Five logical areas

1. Domain Intelligence Model
2. Intent Interaction Model
3. Workflow Composition Model
4. Package & Materialization Model
5. Validation & Conformance Model

These are logical areas of one standard, **not five engines, runtimes, services or projects**. Lifecycle governance and execution occurrence are cross-cutting contracts.

## Candidate decisions

- Workflow + Composition Graph are the normative composition model; Pipeline is descriptive, not a third independent artifact.
- Intelligence Unit roles remain semantic profiles; they do not imply one engine per role.
- Graph Nodes reference exact Units; no parallel Node taxonomy is introduced.
- Recognizer, Structured Intent and Dynamic Form share one canonical intent model.
- Control, Data and Evidence Edges remain distinct.
- Resource closure is split by runtime, build/validation and provenance purpose.
- Qualification, governance disposition, selection, activation and execution are separate dimensions.
- Bounded Subworkflow Invocation is an optional profile under evaluation; no Loop Node or Loop Engine is introduced.

## Current evidence state

- Normative bilingual draft: **initial candidate**
- Machine-readable DIS 0.2.0 schemas: **not yet authored**
- Reference Consumer: **not yet adapted**
- Independent Conformance: **not yet run**
- Exact-SHA review / formal L2 Freeze: **not yet performed**

Do not describe this candidate as frozen, implemented, adopted by the DomainHarness Runtime, or release-qualified.

## Authority boundary

No SDK ABI, Boot/KDP, Host, Runtime, Hook or physical-effect implementation change is authorized. Actual Runtime adoption remains separate under #1486. DIS 0.1.0 F012 and release qualification remain separate under #1490/#1491/#1492. Semantic Knowledge storage/access remains under #1476.
