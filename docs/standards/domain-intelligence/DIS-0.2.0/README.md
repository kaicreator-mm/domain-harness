# Domain Intelligence Standard (DIS) 0.2.0 — Unified Intelligence Production Model

**Status:** PRODUCT_L1_SUCCESSOR_CANDIDATE / L2_DRAFT / NOT_FROZEN  
**Product/L1 successor decision (pending):** [#1494](https://github.com/kaicreator-mm/domain-harness/issues/1494)  
**Draft controller:** [PR #1493](https://github.com/kaicreator-mm/domain-harness/pull/1493)  
**Predecessor:** DIS 0.1.0 L2 frozen HEAD 9504c78f4651f6c1ebc48c7858fca2d8b061544b  
**Successor Boot/KDP:** #1484

## Product thesis

**Knowledge Structuring → Candidate Intelligence Unit(s) → Qualification/Promotion → recursive Capability-based Unit composition → AOT Domain Package BUILD → Domain App intent-driven execution.**

Exactly three primary intelligence-delivery entities: **Capability Contract** (interface), **Intelligence Unit** (qualified implementation/atomic or composite), and **Domain Package** (sealed carrier). Knowledge, Workflow, Function, Rule, Tool and routing are resources, processing forms or Unit-provided capabilities; they are not separate parallel Runtime systems. Domain Definition and existing Semantic/Tool components remain respected engineering contracts.

### Documentation

- [中文架构与规范候选](./DIS-0.2.0.zh-CN.md)
- [English architecture and specification candidate](./DIS-0.2.0.en.md)
- [中文迁移与简化台账](./SIMPLIFICATION_LEDGER.zh-CN.md)
- [English migration / simplification ledger](./SIMPLIFICATION_LEDGER.en.md)

## Five logical standard areas

1. Unit & Capability Model
2. Knowledge Structuring and Intelligence Production
3. Intent Routing Units, Main Workflow and composed Workflows
4. AOT Package/Domain App compilation and binding
5. Governance, Validation and independent Conformance

They are logical standard sections, not engines, services or independent Runtime authorities.

## Critical architecture invariants

- Intent Recognition and Intent Routing are **Intelligence Units**, not a special platform dispatch subsystem.
- One **pinned App Entry/Main Workflow** bootstraps routing without recursive router discovery. Business Primary can own Domain Main; library-only Packages need not.
- Atomic Units bind functions/rules/parsers/queries/tool operations; Composite Units use Workflows and provide new Capabilities. Child validation never automatically qualifies a Composite.
- No author-maintained Unit DAG is required. Workflows structure behavior, while AOT derives Unit/Package dependency closure; Package dependencies remain a DAG.
- Core workflows retain independent control/data/evidence semantics; bounded Subworkflow Invocation requires a proven opt-in profile, no implicit unbounded loops.
- Production Candidate, independent Validation, explicit Promotion, consumer-specific Selection, Runtime Activation and Execution occurrence are distinct.
- Boot -> KDP Primary -> SDK + Business Primary + optional Extension Packages; KDP/Host retain all state/Effect authority.
- The frozen DIS 0.1.0 artifacts are untouched. DIS version is independent of SDK/ABI version.

## Evidence and authorization

This is **a complete conceptual draft**, not a frozen / implemented standard. Product/L1 #1494 remains to be reviewed; executable 0.2 schemas, a new/updated Reference Consumer, two-domain examples and independent Conformance have NOT yet been completed. No SDK ABI change, KDP/Runtime implementation, release, deployment or evidence of actual Runtime adoption is authorized. See #1486 for adoption and #1476 for Semantic Knowledge storage/access.

For the ADS #1359 Delivery-First implementation sequence, keep one continuous writer for the bounded PR write set, verify Node24/CI, complete independent Exact-SHA review, and only then request formal L2 Freeze.