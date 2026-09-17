# Domain Data 编写指南

> 英文对应文档：`DOMAIN_DATA_AUTHORING_GUIDE.md`。
>
> 本指南说明人或 Coding Agent 如何把现有项目中的知识、规则、流程和经验提取成可维护的 Domain Data，同时避免把业务 authority 搬进 DomainHarness。

## 1. 目标

目标不是：

> 把整个项目改写成 YAML。

真正目标是：

```text
现有领域行为
→ 找出 authority 与稳定知识
→ 把规则/约束显式化
→ 区分 deterministic logic 与 AI judgment
→ 隔离 external side effect
→ 适合的部分表达成 Harness asset
→ 用真实 Critical Journey 验证
```

好的 Domain Data extraction 即使最终只有一部分变成可执行 Harness，也会让领域知识更容易理解、审查和演化。

## 2. Authoring 前需要的输入

Agent 至少应收集：

- 当前 PRD / Product Authority；
- Architecture / Decision Record；
- Domain Schema / Type；
- 代表性 Service / Business Code；
- Prompt / Skill；
- Validation / Test；
- 真实 Critical Journey；
- External Integration 清单；
- Domain Glossary / Terminology；
- Known Example / Failure Case。

如果某项 policy 没有明确来源，不要把实现中的偶然行为直接推断成正式领域规则；需要标记为 inference 并进入 review。

## 3. Stage 0 — Pin Authority

提取前先建立 Authority Table：

| Area | Authority | Status | Agent 能否修改 |
|---|---|---|---|
| product scope | PRD | FROZEN | 不可 |
| domain schema | schema/type docs | CONTROLLED | 需 review |
| workflow behavior | production + tests | CONTROLLED | 可提 proposal |
| examples | fixture/docs | EXAMPLE | 可改但需 review |
| generated reports | build/output | DERIVED | 应重新生成 |

这一步用于防止 Agent 把 Example、旧代码或临时 workaround 提升为新 Domain Rule。

## 4. Stage 1 — 建立 Domain Inventory

先扫描项目中的 Domain Concept，不要先选 Runtime primitive。

推荐 inventory 字段：

```text
concept
meaning
owner
source files/docs
authority level
inputs
outputs
side effects
decisions/constraints
AI involvement
current validation
candidate Domain Data class
```

常见来源：

- TypeScript interface/type；
- DB model/migration；
- API schema；
- business service；
- validation function；
- prompt；
- workflow/orchestration code；
- admin config；
- test；
- document；
- historical issue/incident。

Inventory 是 discovery artifact，还不是最终 Domain Data model。

## 5. Stage 2 — 分成六类信息

每个发现项都要先判断属于哪类：

1. **Authority** — 定义 Domain Truth / Invariant。
2. **Executable** — 应直接参与 Harness 执行。
3. **Reference** — 事实/上下文。
4. **Pattern / Recipe** — 可复用领域方法。
5. **Example** — 示例/反例。
6. **Validation / Evidence** — 证明行为。

一个源码文件可能混合多类信息。为了 ownership 和 review 清晰，可以按语义拆分。

## 6. Stage 3 — 统一 Vocabulary

写 Workflow/Skill 前先整理 Domain Glossary。

每个重要 term 应有：

```text
canonical id/name
human label(s)
definition
not-the-same-as
owner
examples
```

不要让同一个概念在 Workflow ID、Skill Name、Tool Name 中出现多个不一致名字。

Executable Asset ID 应稳定、语义化、与显示语言无关。Localize 的 display label 不应该改变 ID。

## 7. Stage 4 — 提取 Rule / Constraint

从 code/test/docs 中寻找等价于这些语义的表达：

```text
must
must not
only when
required
invalid if
before
after
at least
at most
if ... then ...
```

每条规则记录：

```text
Rule ID
Statement
Authority/source
Inputs
Expected outcome
Failure meaning
Deterministic? yes/no
Current implementation
Target representation
Examples/counterexamples
```

不要先把 Rule 写进 Prompt。先判断能否用更强的 deterministic representation。

## 8. Stage 5 — 选择正确表达方式

### 8.1 Structural Validity？

用 JSON Schema。

例如：required field、type、range、enum、payload shape。

### 8.2 Simple Deterministic Mapping / Predicate？

用 JSONata Expression。

例如：字段派生、JSON selection/filter、threshold、route predicate。

### 8.3 Complex Deterministic Logic 且无 External I/O？

用 Script。

例如：graph traversal、complex scoring、parser、normalization。

### 8.4 触碰 External System / Authoritative Domain State？

用 Tool / Domain Code。

例如：DB write、API request、GitHub action、object storage、queue publish。

### 8.5 需要 Semantic Judgment / Generation？

用 Skill。

例如：ambiguous classification、proposal generation、semantic review、evidence summary。

Skill output 仍应有 Schema。

### 8.6 Multi-step Sequencing？

用 Workflow；同 Harness 内复用顺序子流程可用 Child Workflow。

### 8.7 是 Domain Truth 但不需要执行？

保留为 Authority / Reference / Rule 文档，不要硬塞进 Runtime。

## 9. Stage 6 — 先设计 Tool Boundary

在写 Workflow 前，先列出 Critical Journey 中所有 Side Effect。

每个 side effect 要记录：

```text
Tool name
purpose
input shape
output shape
authority touched
external system
credential
transaction behavior
effect classification
idempotency mechanism
retry responsibility
timeout/cancel expectation
```

Effect：

- `none`：没有 externally visible side effect；
- `idempotent`：同 identity replay 是安全/可控的；
- `non-idempotent`：不确定中断后禁止自动 replay。

如果团队无法明确分类 Tool，就不能假设 crash recovery 已经安全。

## 10. Stage 7 — Skill 设计成有边界的 Domain Capability

一个 Skill invocation 应对应一次明确的 semantic AI operation。

推荐编写顺序：

1. 先定义 output schema；
2. 定义 task intent；
3. 收集最小必要 reference；
4. 加 domain instruction / decision rule；
5. 必要时加入 positive/negative example；
6. 需要时定义 input schema；
7. 只有 AI Runtime 策略需要时才指定 opaque execution profile。

避免 Giant Skill。

好的 Skill 问题是：

> 给定这个结构化 input 和这些领域 reference，输出这个结构化 domain assessment/proposal。

差的 Skill 问题是：

> 自己决定应用下一步做什么，调用需要的服务并修改业务记录。

## 11. Stage 8 — 从 Domain Process 编写 Workflow，而不是从 UI Flow 编写

先用普通文本写流程：

```text
load authoritative context
→ create proposal
→ deterministic validation
→ domain review
→ wait for approval
→ commit authoritative change
```

再逐步映射 primitive。

不要写 UI rendering step、provider selection、任意 sleep。

好的 state name：

```text
build_proposal
validate
await_approval
commit
completed
failed
```

差的 state name：

```text
show_modal
call_gpt4
sleep_3s
controller_step_7
```

## 12. Stage 9 — Pattern / Recipe / Reference 与 Workflow 分离

不是所有解释都应塞进 Skill 或 Workflow YAML。

Pattern 文档建议包含：

- problem/context；
- when to use；
- invariant/constraint；
- recommended structure；
- failure mode；
- example/counterexample；
- related Skill/Workflow/Tool。

Recipe 建议包含：

- prerequisite；
- ordered domain step；
- selected pattern；
- expected artifact；
- review point；
- optional executable Workflow reference。

## 13. Stage 10 — 大范围迁移前先建立 Validation Asset

每条迁移 Critical Journey 至少准备：

- representative normal input；
- boundary input；
- invalid input；
- counterexample；
- expected Tool call count/effect；
- expected waiting point；
- expected domain outcome；
- expected Runtime status；
- 重要 side effect 的 crash/recovery case。

必须区分 Domain Outcome 与 Runtime Success/Failure。

例如：

```text
Domain outcome: rejected
Runtime status: completed
```

与下面完全不同：

```text
Runtime status: failed
error: tool_error
```

## 14. Stage 11 — Review 后再 Promotion

新提取 Domain Data 应先处于 draft/proposed。

Promotion Checklist：

- Domain Owner 已 review；
- authority conflict 已解决；
- deterministic vs AI representation 已 review；
- Tool effect 已分类；
- Schema 可编译；
- executable reference 可解析；
- 重要 rule 有 example/counterexample；
- 至少一条 Critical Journey E2E 通过；
- 没有引入 duplicate business authority。

然后再按项目治理把 asset 提升为 CONTROLLED/FROZEN。

## 15. 从现有代码提取 Domain Data 的常见模式

### Existing Validation Function

原有：

```text
validateRequest(x)
```

拆解问题：

- shape constraint？→ JSON Schema；
- deterministic cross-field rule？→ Expression/Script；
- authoritative business lookup？→ Tool/Domain Service；
- semantic ambiguity？→ Skill。

### Existing Service Orchestration

原有：

```text
service A → prompt → API → if/else → DB update
```

可能拆成：

```text
Tool(read domain state)
→ Skill
→ Expression/Script validation
→ waiting/review
→ Tool(commit)
```

### Existing Prompt

拆成：

```text
stable intent/instruction → SKILL.md
input/output structure    → JSON Schema
reference facts           → references/
workflow branching        → Workflow
external action           → Tool
```

### Existing Rules Spreadsheet

按语义拆分：

- controlled enum/threshold → Schema/Expression；
- complex deterministic rule → Script/Domain Rule File；
- human interpretation → Reference/Pattern；
- semantic judgment → Skill + Example。

## 16. Agent 操作流程

使用 Coding Agent 时，应把任务限制在一个可审查切片。

推荐：

1. 读取 Frozen Authority；
2. 读取 Domain Data Spec；
3. 只做 Inventory；
4. 输出 Classification / Migration Map；
5. 识别 Conflict/Unknown；
6. 通过已有 authority 或 review 解决；
7. 实现一个 Asset Class / 一条 Critical Journey；
8. 验证；
9. 再继续下一块。

不要直接要求：

> 把整个项目改造成 DomainHarness。

更好的任务：

> 分析 Critical Journey X。先输出每一步对应的 Domain Authority/Reference/Schema/Expression/Script/Skill/Tool/Workflow 映射，不修改代码。列出所有 Side Effect 并分类 Tool effect。保持 Frozen PRD 和现有 Domain Authority 不变。

## 17. Agent Handoff 模板

```text
Task: Extract Domain Data and prepare one DomainHarness migration slice.

Authority:
- Product/PRD: <path/ref>
- Architecture: <path/ref>
- Development standard: <path/ref>
- Domain Data Spec: docs/domain-data/DOMAIN_DATA_SPEC.md
- DomainHarness SDK/technical docs: <exact SHA + paths>

Target Critical Journey:
<journey>

Required outputs before implementation:
1. domain concept inventory;
2. authority/reference/example/derived classification;
3. rule/constraint table;
4. primitive mapping (Schema/Expr/Script/Skill/Tool/Workflow/keep-in-domain);
5. Tool side-effect/effect classification;
6. proposed directory/assets;
7. validation cases;
8. unresolved contradictions.

Rules:
- do not reopen frozen scope;
- do not move domain authority into DomainHarness;
- deterministic before AI;
- external side effects remain Tools/domain code;
- no provider-specific model logic in Skill/Workflow;
- implement only after mapping is internally consistent.
```

## 18. Review 问题

Reviewer 应主动问：

- 这是 Domain Rule 还是 implementation detail？
- 为什么需要 AI，为什么不能 deterministic？
- 为什么是 Script 而不是 Domain Code/Tool？
- Tool 真的 idempotent 吗？
- Authoritative Data 最终写在哪里？
- 在这个 crash boundary 会发生什么？
- 是否把 Example 当成 Rule？
- Reference 有没有 provenance？
- Child Workflow 能否只靠 explicit input，而不是读取 parent state？
- Workflow 表达的是 Domain Process 还是 UI/provider mechanics？

## 19. 质量特征

好的 Domain Data 通常有：

- 稳定 semantic vocabulary；
- 小而有边界的 Skill；
- explicit side-effect Tool；
- strong Schema；
- 大量 deterministic validation；
- Example + Counterexample；
- provenance；
- clear owner/authority；
- reusable Pattern/Recipe；
- Domain Expert 能看懂的 Workflow；
- 与 Critical Journey 绑定的 validation。

差的 Domain Data 通常有：

- giant prompt；
- giant opaque Script；
- provider name 到处出现；
- Tool effect 未说明；
- duplicate domain state；
- Workflow 只是 UI/controller code 翻译；
- Example 没 rationale；
- Source Fact 与 Project Interpretation 混在一起。

## 20. 持续维护循环

Domain Data 应持续演化：

```text
real usage / incident / new evidence
→ identify knowledge/rule gap
→ update authority/reference/pattern/example
→ 只在必要时更新 executable asset
→ rerun affected validation/Critical Journey
→ record behavior/version impact
```

目标是持续积累显式 Domain Capability，而不是持续扩大 Runtime 复杂度。

## 21. 相关文档

- `DOMAIN_DATA_SPEC.zh-CN.md`
- `../harness/HARNESS_AUTHORING_GUIDE.zh-CN.md`
- `../harness/HARNESS_TECHNICAL_SPEC.zh-CN.md`
- `../architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`
- `../sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`
