# Domain Data 规范

> 英文对应文档：`DOMAIN_DATA_SPEC.md`。
>
> 状态：基于 DomainHarness Frozen PRD 的跨项目 Domain Data 编写与治理规范。它定义领域项目应如何组织和治理 Domain Data，但**不是**新的 DomainHarness v0.1 Runtime Schema。DomainHarness 只解析其中可执行的 Harness 子集。

## 1. 定义

**Domain Data** 是领域项目长期维护、可版本化的领域知识、执行定义、规则、约束、Schema、模式和证据资产。

它既不等同于数据库，也不等同于 Harness definition。

概念结构：

```text
Domain Data
├─ Domain Authority Definitions
├─ Executable Harness Assets
├─ Decision / Routing Rules
├─ Constraints / Validation Rules
├─ Domain Schemas
├─ Skills
├─ Workflows
├─ Facts / References
├─ Technical Patterns
├─ Recipes / Templates
├─ Examples / Counterexamples
├─ Tool Usage Policies
└─ Validation / Evidence Assets
```

Domain Data 的所有权属于**领域项目**，不是 DomainHarness Runtime。

## 2. 核心原则

### DD-P1 — Domain Ownership

每个重要 Domain Data asset 都必须有明确的领域 owner。DomainHarness 即使读取或执行某个 asset，也不会因此成为它的语义权威。

### DD-P2 — Files First，只有执行需要时才变成 Primitive

大部分领域知识应该保留为普通版本化文件。

不要因为有一条规则、一种 Pattern 或一个 Knowledge Object，就立即发明一个新的 Runtime primitive。

### DD-P3 — 区分 Truth 与 Execution Projection

可执行 Workflow 可以投影或协调 domain state，但不能在没有明确设计的情况下变成 authoritative business model。

### DD-P4 — Deterministic Before AI

如果某个判断可以用 Schema、Constraint、Expression、deterministic Script 或 explicit Tool policy 表达，应优先使用确定性机制，而不是隐式依赖 LLM 判断。

### DD-P5 — Explicit Provenance

会影响关键决策的事实、规则和示例应记录 source、owner 或 rationale，让未来 Agent 能区分：

- Evidence；
- Project Convention；
- Derived Rule；
- Example。

### DD-P6 — Versionable / Reviewable

Domain Data 必须能够被版本化和审查。会改变行为的 Domain Data change 应像代码一样进入 review。

### DD-P7 — No Secrets

Domain Data 不得存储生产 credential、provider secret、token。Tool 与 AI Runtime 通过 Host configuration 管理凭证。

## 3. 六类 Domain Data Asset

### 3.1 Authority Assets

Authority Asset 定义 domain truth 与 invariant。

例如：

- Domain entity/schema definition；
- state meaning；
- TaskDAG semantic；
- publishing governance；
- knowledge promotion rule；
- creative quality definition；
- trade claim policy；
- CompletionContract；
- permission / ownership rule。

这些通常由 Domain Code、Admin、Agent 使用。DomainHarness 不会自动解释它们。

### 3.2 Executable Harness Assets

以下资产会被 DomainHarness v0.1 直接读取：

```text
harness.yaml
workflows/*.yaml
skills/<id>/SKILL.md
skills/<id>/skill.harness.yaml
referenced JSON Schema
referenced Skill resources/assets
referenced executable Script source
```

它们必须遵守独立的 Harness Technical Specification。

### 3.3 Knowledge / Reference Assets

这类资产提供事实、解释和背景，但不是 Runtime control primitive。

例如：

```text
references/
  regulations.md
  product-evidence.md
  domain-glossary.md
  terminology.md
  case-studies.md
  source-notes.md
```

Skill 可以把其中一部分声明为 resource；Tool 和 authoring Agent 也可以使用这些资料。

### 3.4 Pattern / Recipe Assets

Pattern 描述可复用的领域解决结构；Recipe 描述如何把一个或多个 Pattern 应用到常见领域任务。

例如：

```text
patterns/
  high-confidence-extraction.md
  buyer-question-coverage.md

recipes/
  create-b2b-product-page.md
  resolve-knowledge-conflict.md
```

Pattern 通常是解释性/约束性资产。Recipe 可以最终映射到 Workflow，但并不自动等于 Workflow。

### 3.5 Example Assets

推荐结构：

```text
examples/
  positive/
  negative/
  edge-cases/
```

重要 Example 不应只有输入/输出，还应说明为什么正确或错误。

只有 label 没有 rationale 的 Example 对 Agent 价值很低。

### 3.6 Validation / Evidence Assets

用于证明 Domain Data 和 executable projection 是否符合预期。

例如：

- fixture input；
- expected output；
- Critical Journey；
- counterexample；
- schema validation case；
- domain review checklist；
- held-out validation case（必要时保持与公开 tuning path 隔离）。

## 4. 推荐目录结构

下面是推荐约定，不是 DomainHarness parser 的硬性目录：

```text
domain/
├─ README.md
├─ glossary/
├─ authority/
├─ schemas/
├─ rules/
├─ constraints/
├─ references/
├─ patterns/
├─ recipes/
├─ templates/
├─ examples/
│  ├─ positive/
│  ├─ negative/
│  └─ edge-cases/
├─ validation/
└─ harness/
   ├─ harness.yaml
   ├─ workflows/
   ├─ skills/
   └─ scripts/
```

项目也可以把 `harness/` 放在 repo root 或其它目录。

真正重要的是 semantic ownership 和 authority，而不是文件夹名字完全一致。

## 5. Asset Metadata 约定

DomainHarness v0.1 不要求全局 Domain Data Manifest。

领域项目可以为需要治理的资产添加 repository-level metadata，例如：

```yaml
id: buyer-question-coverage
kind: pattern
owner: forge-content
status: active
version: 1
source:
  - type: project-evidence
    ref: docs/research/...
related:
  - recipes/create-product-page.md
  - harness/skills/plan-page/SKILL.md
```

除非某个领域项目另行定义 schema，否则这只是 project convention，DomainHarness 不应该偷偷开始解析它。

## 6. Authority Level

建议重要资产标记 authority level：

```text
FROZEN       已冻结权威；修改需要正式 reopen/version 流程
CONTROLLED   当前规范性规则；通过 review 修改
REFERENCE    信息来源/背景；自身不是规则
EXAMPLE      示例；不能自动当成普遍真理
DERIVED      从上游 authority 生成；应该重新生成而不是手改
```

Agent 不允许让 `EXAMPLE` 或 `DERIVED` asset 静默覆盖 `FROZEN` / `CONTROLLED` authority。

## 7. Domain Schema

Schema 表达稳定数据契约，不能包含 AI provider/model 细节。

Runtime 需要做验证的边界使用 JSON Schema。

领域项目可以在自身模型中使用其它 Schema 技术，但进入 Harness executable boundary 的契约必须是 portable JSON-compatible contract。

Schema 编写原则：

- required field 显式声明；
- 能用 discriminated structure 时避免模糊 union；
- enum 只用于真正受控集合；
- 有意识地区分 missing 和 `null`；
- 可以确定性验证的约束直接写进 Schema；
- 不要把 workflow transition 写进 schema description。

DomainHarness 直接使用的 JSON Schema 按 Ajv Draft 2020-12 行为编译。

## 8. Rule / Constraint 分类

先分类，再决定表达方式：

| Rule 类型 | 推荐表示 |
|---|---|
| structural validity | JSON Schema |
| simple deterministic mapping/check | JSONata Expression |
| complex deterministic algorithm | Script |
| authoritative external/domain decision | Tool / Domain Code |
| semantic assessment/recommendation | Skill |
| multi-step execution ordering | Workflow |
| reusable sequential subflow | Child Workflow |

这样可以避免两个常见极端：

- 什么都写成 opaque code；
- 什么都扔给 LLM Prompt。

## 9. Skill 作为 Domain Data

Skill 是 AI-oriented domain capability package，不是 autonomous workflow。

高质量 Skill 应包含：

- clear task intent；
- domain instruction；
- declared reference/resource；
- 必要的 example/counterexample；
- input schema（适用时）；
- required output schema；
- optional opaque execution profile。

Skill 不得：

- 拥有 durable Workflow transition；
- 在 Runtime 外偷偷调用其它 Harness Skill；
- 隐藏 Tool side effect；
- 写死 provider/model routing；
- 直接修改 authoritative domain state。

## 10. Workflow 作为 Domain Data

Workflow YAML 是 domain-owned executable policy。

它表达：

> 什么时候调用哪个通用 primitive，以及 validated result 如何 route。

Workflow 应表达稳定领域流程，而不是 UI implementation 或 provider strategy。

好的例子：

```text
collect → validate → review → approve → commit
```

差的例子：

```text
click button X → render modal Y → call GPT-X → sleep 3 seconds
```

前者是领域流程，后者把 UI/provider/implementation 泄漏进 Domain Data。

## 11. Tool Policy 作为 Domain Data

Tool implementation code 属于 Host，但 Tool 的领域策略应该被 Domain Data 文档化。

建议每个 Tool Policy 说明：

```text
Tool Name
Domain Purpose
Input / Output Contract
Authority Touched
Credential / External System
Effect: none | idempotent | non-idempotent
Idempotency Mechanism
Expected Failure Classes
Timeout / Cancellation
Authorization Requirement
```

这样 Agent 和人都可以理解 side effect，而不需要把 credential/implementation 放进 Harness。

## 12. Reference / Fact 规范

一个事实性 reference 应区分：

- Source Fact；
- Project Interpretation；
- Derived Rule；
- Unresolved Uncertainty。

推荐结构：

```markdown
## Claim
...

## Source
...

## Interpretation
...

## Operational consequence
...

## Confidence / unresolved questions
...
```

不要把不确定 evidence 直接变成 hard constraint 而不记录 decision。

## 13. Pattern / Recipe / Template / Workflow 的术语

**Pattern**：可复用的领域解决原则或结构。

**Recipe**：将一个或多个 Pattern 应用于重复领域任务的具体步骤。

**Template**：带 placeholder 的可复用输入/输出骨架。

**Workflow**：由 DomainHarness 解释执行的 state/Step definition。

Recipe 可以引用 Workflow，但二者不是同义词。

## 14. Example / Counterexample

Example 至少应覆盖：

- normal case；
- boundary case；
- negative/counterexample；
- 领域本身存在不确定性时的 ambiguous case。

Counterexample 对 Skill 与 Review Rule 尤其重要，因为它定义“什么不能被接受”。

如果 Example 暴露出一个真正的 rule，应把 rule 提升为 CONTROLLED/FROZEN asset，而不是长期靠 Example 隐式表达。

## 15. Change Management

Domain Data change 分三类：

### Editorial

文字/组织变化，不应改变行为。

### Behavioral-compatible

扩展或澄清数据，但保持 executable contract 与 active-run compatibility。

### Behavioral-breaking

改变以下内容之一：

- Workflow route；
- Schema；
- Skill semantic；
- Script bytes；
- declared resource；
- 其它可能改变 `definitionHash` 或 domain outcome 的内容。

Behavioral-breaking change 应：

- 由 domain owner review；
- 更新 validation fixture / Critical Journey；
- 考虑 active Run；
- executable asset 改动时产生新的 definitionHash；
- 记录 downstream migration implication。

## 16. 多语言 / Localization

多语言 Domain Data 应：

- 使用与显示语言无关的 canonical semantic ID；
- executable contract ID 不翻译；
- display copy 与 rule identity 分离；
- translated reference 保持同样 authority level；
- derived translation 记录 source language/version。

Translation 不能静默改变 rule meaning。

## 17. Generated / Derived Asset

可重建的 generated asset 应声明 upstream source 与 regeneration path。

例如：

```text
compiled lookup table
search index
generated prompt bundle
derived examples
materialized workflow projection
```

如果 authoritative source 在别处存在，就不应该手改 derived asset，而应该重新生成。

## 18. Domain Data Quality Gate

成熟 Domain 至少应能回答：

- 每个重要 rule 是否有 domain owner？
- 是否能区分 authority/reference/example/derived？
- executable asset 与 supporting knowledge 是否分开？
- external side effect 是否都有明确 Tool policy？
- deterministic constraint 是否尽量确定性编码？
- Skill 是否 schema-bounded、provider-neutral？
- fact/provenance 与 project interpretation 是否可区分？
- example 是否有 rationale？
- breaking Domain Data change 是否可 review/version？
- Agent 是否知道什么可改、什么不能自行 reinterpret？

## 19. DomainHarness v0.1 实际解析什么

v0.1 Runtime 只直接解析 executable Harness contract 与明确引用资产：

```text
harness.yaml
workflows/*.yaml
skills/*/SKILL.md
skills/*/skill.harness.yaml
referenced JSON Schema
referenced Skill resource/asset files
referenced Script source
```

Pattern、Recipe、Fact、Template、Authority Doc 和很多 Example 仍然只是普通文件，除非它们被明确声明为 Skill Resource 或被 Host/Domain Tooling 使用。

这是有意设计。

DomainHarness 是 execution runtime，不是 universal domain knowledge database。

## 20. 与其它规范的关系

- Runtime 架构：`../architecture/DomainHarness_ARCHITECTURE.zh-CN.md`
- 集成边界：`../architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`
- Domain Data 编写指南：`DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md`
- Harness 执行契约：`../harness/HARNESS_TECHNICAL_SPEC.zh-CN.md`
- Harness 编写指南：`../harness/HARNESS_AUTHORING_GUIDE.zh-CN.md`
