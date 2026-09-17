# Harness Documentation / Harness 文档

The Harness documentation describes the executable domain-definition layer consumed by DomainHarness Runtime: manifest, workflows, Skills, Tools, Expressions, Scripts, Child Workflows, waiting events, journaling/recovery semantics and authoring practice.

Harness 文档描述 DomainHarness Runtime 直接消费的可执行领域定义层：Manifest、Workflow、Skill、Tool、Expression、Script、Child Workflow、Waiting Event，以及 Journal/Recovery 语义和编写实践。

## English

1. `HARNESS_TECHNICAL_SPEC.md` — complete v0.1 technical contract: loading, DSL, scopes, Step kinds, Tool/AI contracts, persistence/recovery, definition lock and errors.
2. `HARNESS_AUTHORING_GUIDE.md` — design decision model, authoring patterns, anti-patterns, recovery-aware review and validation checklist.

## 中文

1. `HARNESS_TECHNICAL_SPEC.zh-CN.md` — v0.1 Harness 技术规范：加载链、DSL、Scope、五种 Step、Tool/AI Contract、Persistence/Recovery、Definition Lock、Error Contract。
2. `HARNESS_AUTHORING_GUIDE.zh-CN.md` — Harness 设计决策模型、编写模式、反模式、Recovery-aware Review 与 Validation Checklist。

## Read with / 建议配套阅读

- Runtime architecture: `../architecture/DomainHarness_ARCHITECTURE.md`
- Runtime 架构：`../architecture/DomainHarness_ARCHITECTURE.zh-CN.md`
- Domain Data: `../domain-data/README.md`
- Public SDK contract: `../sdk/DomainHarness_v0.1_SDK_REFERENCE.md`

The technical specification is descriptive of the current v0.1 implementation and does not override the frozen PRD/L2 authority.

技术规范描述当前 v0.1 实现，不覆盖 Frozen PRD / L2 Architecture 的权威性。
