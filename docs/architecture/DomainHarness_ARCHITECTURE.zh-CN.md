# DomainHarness — 详细系统架构

> 语言：中文。英文对应文档：`DomainHarness_ARCHITECTURE.md`。
>
> 状态：v0.1 实现的描述性技术文档。冻结的产品权威仍然是 `docs/product/DomainHarness_v0.1_PRD_FROZEN.md`；冻结架构决策仍然以 `DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md` 为准。本文件用于把已有契约重新组织成便于实现者和下游项目理解的完整架构说明，不新增 Runtime primitive，也不重新打开产品范围。

## 1. 架构目标

DomainHarness 是一个嵌入式 TypeScript/Node.js Runtime 与 Contract SDK，用于执行由 Skill、Tool、Expression、Script 和 Child Workflow 组成的结构化领域工作流。

它的架构职责非常明确：

> 在不接管领域真相和业务权威的前提下，以持久、确定、可恢复的方式执行领域项目自己定义的工作流。

Host/Domain Project 继续拥有：

- 领域/业务状态；
- 外部系统与凭证；
- UI 与 Admin UI；
- AI provider/model 策略；
- 领域规则、约束和知识；
- 领域数据库与最终 authority。

DomainHarness 只拥有通用执行机制。

v0.1 最关键的架构分离是：

```text
领域权威               → Host / Domain Project
工作流控制             → 私有 XState control machine
可执行 Step 权威        → Runner + Step Journal
持久恢复真相           → Runtime control state + SQLite journal
```

这四个概念不能混在一起。

## 2. 系统上下文

```text
┌──────────────────────────────────────────────────────────────┐
│ Domain Product                                               │
│                                                              │
│ Domain Data / Domain Assets                                  │
│ Domain DB / Business Authority                               │
│ User UI / Admin UI                                           │
│ AI Runtime / Provider Strategy                              │
│ Host Tools / Credentials / External Clients                 │
└───────────────┬───────────────────────┬──────────────────────┘
                │ createDomainHarness() │ Tool / AI Port
                ▼                       ▼
┌──────────────────────────────────────────────────────────────┐
│ DomainHarness                                                │
│                                                              │
│ Definition Plane                                             │
│   Loader → Zod/Ajv/JSONata 检查 → Harness AST → Hash        │
│                                                              │
│ Control Plane                                                │
│   Compiler → 私有 XState v5 machine                          │
│                                                              │
│ Execution Plane                                              │
│   RunLifecycle / RunCoordinator / StepDispatcher             │
│                                                              │
│ Durability Plane                                             │
│   SQLite Store → runs + steps + migrations                   │
│                                                              │
│ Isolation Boundary                                           │
│   Expression Worker / Script Worker                          │
└──────────────────────────────────────────────────────────────┘
```

DomainHarness 运行在 Host 进程内部。v0.1 不是：

- Server；
- 分布式调度器；
- 通用 BPM；
- AI Gateway；
- 数据库抽象层；
- Domain Database；
- Reasoning Engine；
- 通用 Agent Framework。

## 3. 源码模块映射

当前实现按职责拆分为：

```text
packages/domain-harness/src/
├─ loader/       定义加载、Schema/静态验证、definitionHash
├─ compiler/     Harness AST → 私有 XState control machine
├─ runner/       Workflow/Step 驱动与恢复 reconciliation
├─ execution/    Step dispatch、Tool/AI 集成
├─ expression/   JSONata Worker 与确定性时钟
├─ script/       trusted Script Worker
├─ persistence/  SQLite、migration、transaction、journal
├─ recovery/     definition/engine compatibility、crash resume
├─ contracts/    provider-neutral 公共契约与错误/JSON 类型
├─ public/       公共 lifecycle/facade
├─ create-domain-harness.ts
└─ index.ts      只暴露 package root public API
```

这些目录是内部实现边界，不是下游项目的 import 路径。消费者只能从 `@kaicreator/domain-harness` 根包导入。

## 4. 五个架构平面

### 4.1 Definition Plane

Definition Plane 把版本化文件转成经过验证、可以执行、可以做 definition lock 的模型。

加载链路：

```text
Harness filesystem
→ canonical root resolution
→ harness.yaml / Workflow YAML / Skill sidecar
→ Zod 结构验证
→ Ajv 2020-12 JSON Schema 编译
→ JSONata parse / static restriction
→ cross-reference / graph validation
→ Harness AST
→ Runtime-relevant asset canonicalization
→ definitionHash
```

关键性质：

- 所有引用资产必须在 canonical Harness root 内；
- absolute path、symlink/junction 越界必须拒绝；
- Script source 在 load 时读取并冻结，参与定义；
- 不认识的 schemaVersion 必须失败；
- 无效 Harness 应在 SQLite 初始化之前失败；
- Host Tool implementation 不属于 `definitionHash`。

Loader 的严格性是有意设计：应尽量在部署/启动时暴露定义错误，而不是让错误进入 durable Run 后才发生。

### 4.2 Control Plane

Compiler 把验证后的 Workflow AST 编译成私有 XState v5 machine。

XState 只做 **control-flow reducer**，不负责：

- Durable Step execution；
- replay authority；
- external side effect；
- 持久化权威；
- public contract。

控制循环概念上是：

```text
当前 Workflow state
→ Runtime 获得 Step result
→ Runtime 按顺序计算 route
→ Runtime 选择 route index
→ 向 XState 发送私有 route event
→ XState reduce 到 next state
→ Runtime 保存 portable control state
```

JSONata 不在 XState Guard 里直接执行。Route decision 先由 Runtime 计算，再交给 XState 做状态归约。

这样可以避免 LLM 输出、JSONata 执行细节或 XState guard 行为变成工作流 authority。

### 4.3 Execution Plane

Execution Plane 负责 public lifecycle 与逻辑 Step 驱动：

- `start`；
- `send`；
- `wait`；
- `resume`；
- `cancel`；
- `get`；
- `listRuns`；
- per-Run serialization；
- Step Journal reconciliation；
- Step dispatch；
- timeout/cancellation；
- route evaluation；
- Child Workflow frame 管理。

一个状态最多只能 invoke 一个 executable Step。

五种 Step：

```text
skill    → AIOperationPort
工具/tool → Host Tool Registry
script   → fresh Script Worker
expr     → Expression Worker
workflow → Child Workflow Frame
```

非 final 且没有 invoke 的状态是 waiting state，可以接受声明过的 external event。

### 4.4 Durability Plane

v0.1 只有 SQLite 一种持久化实现，不存在 ORM 和 storage provider abstraction。

持久权威由两类数据组成：

- `runs`：Run 状态、input/output/error、definition/engine lock、portable control/frame state；
- `steps`：逻辑 Step identity、attempt、input/output/error、时间与 idempotency context。

SQLite 配置：

```text
journal_mode = WAL
synchronous = FULL
busy_timeout = Runtime 配置值
PRAGMA user_version = migration version
```

v0.1 correctness model 是：一个 DomainHarness 进程主动驱动一个 SQLite 文件。

Multi-process、distributed writer、shared-network SQLite 不属于当前正确性契约。

### 4.5 Integration Plane

DomainHarness 与外部世界的显式边界只有两类：

```text
Skill → AIOperationPort → AI Runtime
Tool  → HarnessTool      → Host-owned System/Client
```

AI Runtime 负责：

- provider/model 选择；
- strong/weak model 策略；
- retry/fallback；
- critic/judge/consensus；
- cost/latency policy。

Host Tool 负责：

- credentials；
- network client；
- domain service；
- external side effect。

DomainHarness 只提供 execution identity、effect 分类和 recovery 语义，不提供 secret store，也不变成 integration platform。

## 5. 启动顺序

`createDomainHarness()` 的架构顺序是：

```text
1. Resolve/validate Harness root
2. Load manifest/workflows/Skills/Scripts/schemas/resources
3. Build + static validate Harness AST
4. Build definitionHash
5. Validate required host Tool registrations
6. Compile private workflow machines/control metadata
7. Open/migrate/configure SQLite
8. Construct Runner/lifecycle/recovery components
9. Return public DomainHarness facade
```

其中最重要的约束是：错误的 Harness 定义不应该因为打开数据库或执行 migration 而掩盖真正的配置问题。

## 6. Run Lifecycle

Public Run status 固定为：

```text
running | waiting | completed | failed | cancelled
```

Run 通过：

```ts
start({ workflowId, input })
```

创建，并记录：

- `runId`；
- Harness / Workflow identity；
- input；
- status；
- terminal output/error；
- `definitionHash`；
- `executionEngineMajor`；
- timestamp；
- 内部 portable control/frame state。

`wait()` 只用于等待 Run 到达 waiting/terminal，不是 event API。

`send()` 是让 waiting state 接收已声明外部事件的唯一公共路径。

`resume()` 用于进程中断后继续 persisted `running` Run，不能拿它模拟外部事件。

## 7. 逻辑 Step Identity

持久 Step identity 是：

```text
(runId, workflowInstanceId, stateId, visit)
```

它比某个进程内 invocation object 更重要，因为 crash 后 Runtime 需要回答：

> 这个逻辑 Step 是否已经完成？能否安全 replay？还是必须标记 interrupted？

这个 identity 也用于为 idempotent Tool 提供稳定的幂等上下文。

`visit` 区分同一个 state 的多次访问；`workflowInstanceId` 区分 root 和不同 Child Workflow 实例。

## 8. Step Transaction Model

DomainHarness 不会在 AI、Tool、Worker 执行期间持有 SQLite transaction。

正确模式：

```text
TX A
  create/observe started Step journal
COMMIT

在事务外执行 Tool / AI / Script / Expression

TX B
  persist terminal Step result
  persist compatible Run/control transition
COMMIT
```

这个事务间隙是有意存在的，因此 Tool 必须分类 effect。

数据库事务无法给外部系统提供 exactly-once。

因此 v0.1 的承诺是：

```text
at-least-once execution + journal deduplication
```

而不是 exactly-once。

## 9. Recovery 与 Replay Authority

Step Journal 比 reconstructed control state 更有权威。

Recovery Matrix：

| Journal 状态 | Step 类型 | 恢复动作 |
|---|---|---|
| completed | 任意 | 复用 output，永不再次执行 |
| started | expr | 可重新执行 |
| started | script | 可重新执行 |
| started | skill | 可重新执行 |
| started | tool / `effect:none` | 可重新执行 |
| started | tool / `effect:idempotent` | 使用同一个 idempotency identity 重试 |
| started | tool / `effect:non-idempotent` | 禁止自动 replay，进入 interrupted/error route |

典型 crash 边界：

```text
Step completion 已 commit
control transition 尚未 commit
```

恢复时必须：

```text
复用 terminal journal result
→ 用 persisted logical time 重新计算确定性 route
→ 推进 control state
→ 保存新的位置
```

不能重新执行 side effect。

## 10. Portable Control State

Raw XState actor snapshot 不是 canonical persistence format。

Runtime 保存的概念结构是：

```ts
interface RuntimeControlState {
  schemaVersion: 1;
  frames: WorkflowFrame[];
}

interface WorkflowFrame {
  workflowId: string;
  workflowInstanceId: string;
  stateId: string;
  visits: Record<string, number>;
  lastDecisionAt: string;
}
```

XState 状态由 compiled machine + 当前 state identity 在内部重建。

即使不持久 raw snapshot，`executionEngineMajor` 仍必须存储，因为不同 engine major 的编译语义可能不兼容。

## 11. Child Workflow 架构

Child Workflow 是 same-Harness、sequential composition。

Identity 例子：

```text
root
root/creative#1
root/creative#2
root/creative#1/quality#1
```

执行流程：

```text
parent workflow Step = started
→ push deterministic child frame
→ execute/resume child frame
→ child successful final
→ evaluate child workflow.output
→ parent Step completed(output = child result)
→ pop child frame
→ route parent
```

Child scope 独立拥有：

```text
child.input
child.steps
child.run.visits
```

Child 不能直接读取 parent `steps`，父数据必须通过 `invoke.input` 明确传递。

名为 `failed` 的 child final state 会在 parent Step 边界转成 `child_workflow_error`。

其它 final state 即使语义是 `rejected`、`not_recommended`，仍然是 Runtime 成功完成，而不是执行失败。

Workflow recursion 和 dependency cycle 在 load time 拒绝。

## 12. Expression 确定性架构

所有 JSONata 都通过内部 ExpressionRuntime 执行。

规则：

- `$random` 禁止；
- `$eval` 禁止；
- 不注册 external I/O function；
- route predicate 必须返回严格 boolean；
- `$now()` / `$millis()` 使用 persisted logical time；
- JSON input/output 有界；
- Worker 有 timeout、terminate、resource limits。

Logical time 绑定到 durable event：

- executable Step expression 使用 `started_at`；
- waiting event route 使用 event acceptance timestamp；
- workflow output 使用 frame `lastDecisionAt`；
- initially-final workflow fallback 到 Run createdAt。

这样 recovery 重算时不会因为 wall clock 改变而产生不同 route。

## 13. Script 架构

Script 是 trusted deterministic extension，不是 hostile-code sandbox。

v0.1 当前语义：

- Script source 在 Loader 阶段读取并冻结；
- 当前可执行契约是 JavaScript ESM，例如 `.mjs`；Runtime 不在执行时转译 TypeScript Script asset；
- 每次 invocation 创建 fresh Worker；
- `env: {}` 避免常规环境变量继承；
- JSON-only input/output；
- timeout / AbortSignal / terminate / V8 resourceLimits；
- Script 必须位于 canonical Harness root 内。

Script 按契约不得负责 external I/O。外部 I/O 应放在 Tool 中，以便 effect classification 和 recovery 行为明确可审计。

## 14. Waiting / Event 架构

Waiting state 是 durable workflow position，不是内存 callback。

`send(runId, event)`：

```text
load Run
→ status 必须为 waiting
→ event 必须由当前 waiting state 声明
→ 验证 optional event JSON Schema
→ 确定性计算 event route
→ 原子写入 accepted event output + control transition
```

Rejected event 不允许修改 persistence。

Accepted event payload 会成为该 waiting state 的 output，也就是当前 workflow instance 中的：

```text
steps.<waitingStateId>
```

## 15. 并发与取消

v0.1 在拥有数据库的进程内对同一个 Run 的 lifecycle mutation 做串行化。

这用于防止：

- 两个并发 send 都被接受；
- cancel 与 Step commit 竞争；
- late executor result 覆盖 terminal state。

Terminal fencing：

```text
Run 已 cancelled/failed/completed
→ late executor result 不得覆盖 terminal Run
```

`cancel()` 会向支持的 Tool/AI/Worker 传播 `AbortSignal`，并持久化 `cancelled`。即使 executor 忽略取消，其 late result 仍不能覆盖已经落盘的 terminal Run。

## 16. Definition Lock

`definitionHash` 是 Runtime-relevant definition content 的 SHA-256，不应绑定部署路径。

概念上包含：

- `harness.yaml` Runtime 字段；
- normalized Workflow AST；
- Child Workflow dependency graph；
- normalized Skill sidecar；
- invokable `SKILL.md`；
- declared Skill resources/assets；
- referenced JSON Schema；
- referenced Script source bytes。

明确不包含：

- absolute filesystem deployment path；
- Host Tool implementation code。

Active continuation：

```text
stored definitionHash != loaded definitionHash
或 stored executionEngineMajor != current engine major
→ refuse continuation
```

v0.1 不提供自动 active-run definition migration。

## 17. 信任与安全模型

DomainHarness 提供 correctness/isolation boundary，不提供通用 hostile-code security boundary。

**Runtime 负责：**

- canonical root containment；
- schema/static validation；
- bounded Worker execution；
- Script Worker env isolation；
- package export containment；
- deterministic replay；
- persistence fencing；
- provider-neutral contract。

**Host 负责：**

- Script code review；
- Tool credentials；
- authentication/authorization；
- network policy；
- Tool implementation correctness；
- domain access control；
- AI Runtime/provider 安全配置。

Worker Thread 不能被描述成对恶意代码安全的 sandbox。

## 18. 部署拓扑

v0.1 支持的 correctness topology：

```text
one host process
  └─ one DomainHarness runtime instance（常规模式）
       └─ one SQLite file actively driven by that process
```

不在范围内：

- active-active Runtime；
- distributed scheduling；
- multi-process writer；
- network-shared SQLite。

Host 应把 Runtime 当作 process-lifetime infrastructure，而不是每个请求创建一个 Runtime instance。

## 19. Domain Authority Boundary

DomainHarness 可以保存 execution history、Step output 和 Workflow result，但这些不是自动成为 domain business truth。

例如：

- Tally TaskDAG truth 仍归 Tally；
- Cairn knowledge promotion truth 仍归 Cairn；
- Formula creative/design truth 仍归 Formula；
- Forge trade-content truth 仍归 Forge；
- City Atlas canonical publishing truth 仍归 City Atlas。

如果 Workflow 需要修改 authoritative domain state，通常应通过 domain-owned Tool 完成；其 validation、credential、业务语义继续归 Host。

## 20. v0.1 之后的扩展策略

Static Parallel Composition 是已确认的未来方向，但不是 v0.1 primitive。

Generic DAG Execution 仍是 evidence-gated。

默认应优先使用：

```text
Domain-owned dependency/readiness model
→ Script/Tool 计算 readiness
→ Child Workflow 执行
→ Future Parallel Composition
```

只有真实项目证据表明这些能力无法清晰表达需求时，才考虑引入 generic DAG Runtime primitive。

## 21. 不可破坏的架构不变量

1. XState 不得成为 public API 或 durable side-effect truth。
2. LLM output 不得直接拥有 workflow transition authority。
3. completed journal Step 不得再次执行。
4. uncertain started non-idempotent Tool 不得自动 replay。
5. external/AI/Worker 执行期间不得持有 SQLite transaction。
6. Domain business authority 必须留在 Domain Project。
7. Child Workflow scope 必须显式且隔离。
8. definition/engine mismatch 必须拒绝 active continuation。
9. 所有 Harness 引用资产必须留在 canonical Harness root 内。
10. v0.1 Runtime 必须保持 provider-neutral，并保持固定 SQLite persistence model。

## 22. 相关文档

- 冻结 PRD：`docs/product/DomainHarness_v0.1_PRD_FROZEN.md`
- 冻结 L2：`docs/architecture/DomainHarness_v0.1_L2_ARCHITECTURE_EVIDENCE.md`
- 集成模型：`docs/architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`
- Domain Data 规范：`docs/domain-data/DOMAIN_DATA_SPEC.zh-CN.md`
- Harness 技术规范：`docs/harness/HARNESS_TECHNICAL_SPEC.zh-CN.md`
- SDK Reference：`docs/sdk/DomainHarness_v0.1_SDK_REFERENCE.md`
- Storage/Recovery：`docs/operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`
