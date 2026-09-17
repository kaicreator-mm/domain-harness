# Domain Data Documentation / Domain Data 文档

Domain Data is the domain-owned, versioned layer that contains domain authority, schemas, rules, constraints, references, patterns, recipes, examples, validation assets and the executable Harness subset.

Domain Data 是由领域项目拥有和版本化的资产层，包含 Domain Authority、Schema、Rule、Constraint、Reference、Pattern、Recipe、Example、Validation Asset，以及其中可执行的 Harness 子集。

## English

1. `DOMAIN_DATA_SPEC.md` — normative authoring/governance model, asset classes, authority levels, schemas/rules/Skills/Workflows/Tool policies, versioning and Runtime parsing boundary.
2. `DOMAIN_DATA_AUTHORING_GUIDE.md` — step-by-step extraction/refactor process for humans and coding Agents.

## 中文

1. `DOMAIN_DATA_SPEC.zh-CN.md` — Domain Data 规范、资产分类、Authority Level、Schema/Rule/Skill/Workflow/Tool Policy、变更治理和 Runtime 解析边界。
2. `DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md` — 面向人和 Coding Agent 的 Domain Data 提取、建模和重构指南。

## Important boundary / 重要边界

Most Domain Data is **not** parsed by DomainHarness Runtime. DomainHarness v0.1 directly parses only the executable Harness contract and explicitly referenced assets. Do not turn every domain rule or knowledge artifact into a Runtime primitive.

大多数 Domain Data **不会**被 DomainHarness Runtime 直接解析。v0.1 只解析 executable Harness contract 和明确引用的资产。不要把每一条领域知识或规则都强行变成 Runtime primitive。

Related:

- `../architecture/DOMAINHARNESS_INTEGRATION_MODEL.md`
- `../architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`
- `../harness/README.md`
