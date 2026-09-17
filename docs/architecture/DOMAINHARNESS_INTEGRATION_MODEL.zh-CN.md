# DomainHarness — 集成模型

> 英文对应文档：`DOMAINHARNESS_INTEGRATION_MODEL.md`。
>
> 本文定义 Domain Product 接入 DomainHarness v0.1 的推荐边界。内容来自 Frozen PRD、L2 和 Public SDK，不新增 Runtime primitive。

## 1. 集成目标

一个领域项目接入 DomainHarness 的目的，是复用通用执行基础设施，同时保留自己的领域权威。

目标拆分：

```text
Domain Product
├─ Domain Data / Domain Assets
├─ Domain Business Model + Authoritative DB
├─ User UI / Admin UI
├─ Host Integration Layer
│  ├─ Harness Tools
│  ├─ AIOperationPort Adapter
│  └─ DomainHarness Lifecycle Adapter
└─ DomainHarness Runtime
```

只有在 DomainHarness 成为可复用执行引擎、但没有成为第二套业务 System of Record 时，集成才算正确。

## 2. 职责矩阵

| 事项 | Domain Project | DomainHarness | AI Runtime |
|---|---:|---:|---:|
| 业务/领域真相 | 负责 | 不负责 | 不负责 |
| Domain Schema/Knowledge/Rules | 负责 | 加载/执行其中可执行部分 | 不负责 |
| Workflow Definition | 负责 | 验证/执行 | 不负责 |
| Transition Mechanics | 定义 route | 负责确定性执行 | 不负责 |
| Provider/Model 选择 | 不负责 | 不负责 | 负责 |
| Skill AI Contract | 负责领域内容 | 构造/验证 operation | 执行策略 |
| External Side Effect | 通过 Tool 负责 | 调度和 recovery 语义 | 不负责 |
| Credential/Secret | 负责 | 不负责 | 只负责 provider 侧需要的凭证 |
| Runtime Progress Persistence | 不负责 | SQLite 负责 | 不负责 |
| Authoritative Domain Persistence | 负责 | 不负责 | 不负责 |
| UI/Admin | 负责 | 不负责 | 不负责 |
| Workflow Crash Recovery | 接入 | 负责 | 只负责 AI Operation 内部 provider retry |

## 3. 五个集成边界

### 3.1 Domain Data Boundary

Domain Data 与 Domain Project 一起版本化。

DomainHarness 会直接读取其中的可执行子集，例如：

- Harness Manifest；
- Workflow；
- Skill；
- JSON Schema；
- Script；
- declared resources。

但很多 Domain Data 仍然只是普通领域资产，只被 Skill、Tool 或 authoring process 使用。

不要因为某个领域概念被多个 Workflow 使用，就把它移入 Runtime 源码。领域内的复用应优先留在 Domain Data 或 Domain Code。

### 3.2 Tool Boundary

Tool 是显式 Host-owned side-effect boundary。

以下情况应使用 Tool：

- 修改 authoritative domain database；
- external API/network request；
- Harness 之外的 filesystem operation；
- credential 使用；
- queue/service invocation；
- domain service call；
- 任意 externally visible side effect。

Tool implementation 始终属于应用代码。Harness 只引用 Tool name，并通过 JSON 映射 input。

每个 Tool 都必须明确：

```text
none
idempotent
non-idempotent
```

这不是注释性质的元数据，而是 crash recovery 能否安全 replay 的基础。

### 3.3 AI Boundary

一个 Skill Step 等于一次 Domain AI capability invocation。

```text
Skill Package
→ DomainHarness AIOperationRequest
→ AIOperationPort
→ AI Runtime
→ Structured Result
→ DomainHarness Schema Validation
→ Deterministic Workflow Routing
```

Domain Project 负责：

- Skill instruction；
- resource；
- output schema。

AI Runtime 负责：

- provider/model routing；
- strong/weak strategy；
- critic/judge/consensus；
- retry/fallback；
- cost/latency policy。

DomainHarness 负责：

- durable workflow boundary；
- Skill input/output validation；
- deterministic route。

Skill 不应该隐藏 Tool、Child Workflow 或不透明的 durable transition。

### 3.4 Business State Boundary

Runtime State 和 Business State 是两件不同的事。

Runtime 可以保存：

```text
Run status
current workflow frame
Step journal
Step output/error
waiting event payload
definitionHash
logical time
```

Domain Project 保存 authoritative entities，例如：

```text
Task / TaskDAG
Knowledge Object
Creative Artifact
Trade Content Item
POI / Publication State
Order / Customer / Project
```

Workflow result 如果需要成为 domain truth，应通过 domain Tool 做 validation 和 commit。

### 3.5 UI Boundary

UI 应调用 Domain Application API/Service，而不是直接操作 Runtime internals。

推荐：

```text
UI Action
→ Domain Application Service
→ Domain Validation/Authorization
→ DomainHarness start/send/cancel
→ HarnessRun 映射成 Domain/API Response
```

UI 不应看到：

- raw SQLite rows；
- XState state；
- Runner internal object。

## 4. 推荐的 Host Adapter

下游项目应在 DomainHarness 外面建立一层很薄的 domain-owned service，例如：

```ts
class ContentHarnessService {
  async startDraft(input: DraftInput) { ... }
  async approve(runId: string, actor: Actor) { ... }
  async cancel(runId: string) { ... }
  async getStatus(runId: string) { ... }
}
```

这一层负责：

- domain authorization；
- domain ID → Harness JSON input；
- 选择 root Workflow；
- `HarnessRun` → API/domain response；
- 需要时通过 Tool 写入最终 domain truth；
- 防止 Runtime `runId` 变成 business ID。

## 5. 集成生命周期

### Phase A — Inventory

先选一条真实 Critical Journey，把现有操作分类：

```text
pure mapping/calculation     → Expression
complex deterministic logic → Script
external side effect        → Tool
semantic AI capability      → Skill
reusable sequential flow    → Child Workflow
human/external decision     → Waiting Event
business authority          → 保留在 Domain Project
```

### Phase B — 定义 Domain Data

把稳定的：

- instruction；
- schema；
- decision rule；
- reference；
- example；
- workflow；
- validation constraint；

整理成版本化 Domain Data。

不要一开始就把整套业务代码改写为 Workflow YAML。

### Phase C — 建立 Host Boundary

先实现 Tool Registry 和 AIOperationPort adapter。

每个 Tool 至少记录：

- name；
- input/output JSON contract；
- owner module/service；
- credential；
- external effect；
- `effect` classification；
- idempotency handling；
- timeout/cancel behavior。

### Phase D — 迁移一条 Harness Journey

先建立一个 root Workflow，只覆盖一条真实 Critical Journey。

Domain write 留在 Tool；AI 留在 Skill。

先验证这一条 Journey，再迁移其它流程。

### Phase E — Lifecycle Integration

把应用行为映射到：

```text
start
wait/get
send
cancel
resume（仅 process recovery）
```

如果业务未来需要重新打开或观察 Run，下游项目可以自己保存 business entity ID 与 `runId` 的关联关系。

### Phase F — Authority Validation

迁移完成必须证明：

- 没有形成重复的 domain authority；
- Tool side effect 仍通过 domain validation/authorization；
- provider/model 细节没有泄漏进 Skill/Workflow；
- Runtime restart 不会破坏 domain state；
- waiting event 不会绕过 domain authorization；
- negative domain outcome 与 Runtime failure 保持区分。

## 6. Domain State Commit Pattern

### Pattern 1 — Proposal → Approval → Commit

```text
Skill/Script 生成 proposal
→ deterministic validation/routing
→ waiting human approval
→ Tool 写入 authoritative domain DB
→ Workflow completed
```

AI 生成内容不能自动成为权威状态时，优先采用这个模式。

### Pattern 2 — Read → Compute → Write

```text
Tool 读取 authoritative snapshot
→ Expression/Script 做确定性计算
→ Tool 写回 validated result
```

适用于算法是确定性的，但数据访问必须由 Host 拥有的情况。

### Pattern 3 — AI Recommendation Only

```text
Skill
→ schema validation
→ completed Workflow output
```

调用方 Domain Service 决定是否采用 recommendation。没有 side effect 时不必强行增加 Tool。

### Pattern 4 — Reusable Child Capability

```text
Parent Workflow
→ Child Workflow(explicit input)
→ child output
→ parent deterministic route
```

这是 same-Harness sequential composition，不是跨服务 orchestration。

## 7. 反模式

### 7.1 把 Runtime 当 Domain Database

不能把 `steps.output_json` 当成 authoritative business record。

### 7.2 把 Tool 写成 Hidden Workflow

Tool 应是一个清晰的 Host capability / side-effect boundary，不应该偷偷实现一整套 opaque orchestration，与 Harness 重复。

### 7.3 把 Skill 写成 Autonomous Agent

Skill 不应该私下调用其它 Skill/Tool，也不能绕过 Workflow 决定 durable transition。

### 7.4 把 Provider Configuration 放进 Domain Data

不要把 GPT/Claude/provider retry/model routing 写入 Workflow/Skill contract。应该使用 opaque profile，由 AI Runtime 解释。

### 7.5 全项目到处直接调用 Runtime

不要在大量业务模块中散布 `createDomainHarness` 和 lifecycle call。应该通过 domain-owned integration service 统一封装。

### 7.6 Duplicate Workflow Authority

不要同时让 Domain DB 维护一套 mutable workflow truth、DomainHarness 又维护另一套互相竞争的 state machine。必须明确哪个 state 是 authoritative，哪个只是 execution projection。

## 8. 项目映射示例

### Tally 类工程系统

```text
TaskDAG truth / CompletionContract / evidence authority → Tally
Workflow execution/recovery                           → DomainHarness
LLM operation strategy                               → AI Runtime
GitHub/local build action                             → Tally Tools
```

DomainHarness 可以执行 Task projection，但不能重新定义 TaskDAG semantic。

### Cairn 类知识系统

```text
knowledge schema/evidence/governance/promotion truth → Cairn
repeatable extraction/validation workflow mechanics   → DomainHarness
complex reasoning                                    → dx-service
provider/model strategy                              → AI Runtime
```

### Formula 类创意系统

```text
creative direction/layer/artifact/quality semantics → Formula
repeatable generation/review mechanics              → DomainHarness
image/render API                                    → Formula Tool/Service
AI strategy                                         → AI Runtime
```

### Forge 类外贸内容系统

```text
buyer/trade/content/RFQ semantics → Forge
content-production workflow       → DomainHarness
site/media/distribution           → Forge Tools
AI strategy                       → AI Runtime
```

### City Atlas 类本地生活系统

```text
canonical POI/publishing governance → City Atlas
review/enrichment workflow mechanics → DomainHarness
map/data-provider side effect        → City Atlas Tools
```

## 9. Version Pinning 与 Rollout

正式 package release 前，下游项目应 pin：

- exact DomainHarness commit；
- exact tarball；
- 下游自己的 integration commit。

建议记录：

```text
DomainHarness source SHA
package tarball identity/checksum
Harness definitionHash
Downstream integration commit
Validation evidence
```

更换 Runtime version 或 Harness definition 时，必须考虑 active Run compatibility。

DomainHarness 遇到 definition/engine mismatch 会拒绝 continuation，而不是猜测 migration。

## 10. 集成验收清单

下游项目完成接入至少应满足：

- 一条真实 Critical Journey E2E 跑通；
- Domain authority 保留在下游项目；
- external side effect 全部显式为 Tool；
- 每个 Tool 的 effect classification 正确；
- Skill provider-neutral 且 schema-bounded；
- 能用 deterministic logic 的地方优先 Expression/Script，而不是 AI；
- waiting event 在 `send()` 前经过 domain authorization；
- Runtime ID 没有替代 business ID；
- crash/restart 做过验证；
- package 和 Harness definition 被 pin/version；
- 下游没有 import XState/Store/Runner internals；
- 没有为了模拟 v0.1 未支持能力而破坏现有契约。

## 11. 相关文档

- `DomainHarness_ARCHITECTURE.zh-CN.md`
- `../domain-data/DOMAIN_DATA_SPEC.zh-CN.md`
- `../domain-data/DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md`
- `../harness/HARNESS_TECHNICAL_SPEC.zh-CN.md`
- `../harness/HARNESS_AUTHORING_GUIDE.zh-CN.md`
- `../sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`
