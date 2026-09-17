# DomainHarness — Harness 技术规范

> 英文对应文档：`HARNESS_TECHNICAL_SPEC.md`。
>
> 状态：基于 Frozen PRD、Frozen L2 Architecture 和当前 Public SDK/源码整理的 v0.1 实现型技术规范。如果本文与冻结权威或可执行源码/测试冲突，以冻结权威和源码契约为准。本文不新增 v0.1 功能。

## 1. Harness 是什么

**Harness** 是由领域项目拥有、被 DomainHarness Runtime 加载执行的领域执行定义。

它用于把稳定领域流程和执行所需资产打包起来，同时把 external side effect、credential、provider strategy 保留在 Host / AI Runtime。

Harness 不是：

- 整个 Domain Database；
- 任意 Plugin 目录；
- Provider 配置包；
- XState Machine 定义；
- Generic DAG Language；
- Server Application。

## 2. Harness Root

推荐结构：

```text
harness/
├─ harness.yaml
├─ workflows/
│  ├─ main.yaml
│  └─ child.yaml
├─ skills/
│  └─ generate/
│     ├─ SKILL.md
│     ├─ skill.harness.yaml
│     ├─ input.schema.json
│     ├─ output.schema.json
│     └─ references/
│        └─ context.md
├─ scripts/
│  └─ normalize.mjs
└─ schemas/
   └─ approval.schema.json
```

只有 Manifest、Workflow、Skill Contract 以及被明确引用的资产，才属于 Runtime execution definition。

所有引用文件必须最终解析在 canonical Harness root 内。

以下情况必须拒绝：

- absolute path escape；
- canonicalized `..` escape；
- symlink/junction 指向 root 外。

## 3. Load Pipeline

Runtime 加载链：

```text
filesystem root
→ canonical root validation
→ harness.yaml parsing
→ Workflow discovery/parsing
→ Skill discovery/sidecar/resource loading
→ Script source loading/freezing
→ JSON Schema loading/compilation
→ JSONata parse/static inspection
→ Zod structural validation
→ cross-reference/static graph validation
→ normalized Harness AST
→ definitionHash
→ private compilation
```

至少应该在 load time 捕获：

- unknown schemaVersion；
- malformed manifest/workflow/sidecar；
- invalid state id；
- missing initial state；
- invalid route target；
- unreachable state；
- 没有 reachable final state；
- missing Skill/Tool/Script/Child Workflow；
- Skill 缺 required output schema；
- invalid JSON Schema；
- invalid / forbidden JSONata；
- Child Workflow cycle；
- Child Workflow 缺 top-level output；
- waiting/executable/final state 组合非法；
- referenced asset 越出 Harness root。

## 4. `harness.yaml`

v0.1：

```yaml
schemaVersion: "0.1"
id: my-domain
limits:
  maxSteps: 100
```

规则：

- `schemaVersion` 必须等于 `"0.1"`；
- `id` 必须非空且作为 Harness 稳定 identity；
- `limits.maxSteps` 必须为 positive integer；
- v0.1 的 Workflow/Skill 文件没有独立 Runtime schemaVersion。

`maxSteps` 限制的是 accepted logical work/visit，而不是进程 retry 次数或 CPU 指令数。

## 5. Workflow Identity

`workflows/` 直接目录下每个 `.yaml` / `.yml` 文件定义一个 Workflow，文件名去掉扩展名就是 Workflow ID。

```text
workflows/main.yaml     → main
workflows/quality.yaml  → quality
```

基本结构：

```yaml
initial: <state-id>
output: <optional JSONata>
states:
  <state-id>:
    ...
```

作为 Child 被引用的 Workflow 必须声明 top-level `output`。

## 6. State ID

State ID 必须匹配：

```text
^[a-z][a-z0-9_]*$
```

推荐稳定语义名：

```text
load_context
build_proposal
await_approval
commit
completed
failed
```

不要把 timestamp、UUID、runtime data 编码进 state id，因为 state id 参与 durable Step identity 和 definition semantic。

## 7. 三类 State

### 7.1 Executable State

声明一个 `invoke`，并至少有一个 `on.done` route。

```yaml
normalize:
  invoke:
    expr: '{"value": input.value}'
  on:
    done:
      - target: completed
```

可以声明 `on.error`。

如果 `on.error` 省略，v0.1 会把 execution error 默认路由到名为 `failed` 的 state；因此依赖默认 error route 时应提供 reachable：

```yaml
failed:
  final: true
```

### 7.2 Waiting State

无 `invoke`、不是 final，并声明 external event：

```yaml
await_approval:
  on:
    approve:
      schema: schemas/approval.schema.json
      target: completed
    reject:
      target: rejected
```

Waiting State 不能声明 `done` / `error` route。

### 7.3 Final State

```yaml
completed:
  final: true
```

Final State 不能 invoke 或 transition。

ID 恰好为 `failed` 的 final state 是唯一 Runtime failure terminal。

其它 final state 即使领域结果为负面，比如：

```text
rejected
abstained
not_recommended
```

仍然属于 Runtime successful completion。

## 8. Invoke Model

Executable State 必须且只能使用五类 invocation 中的一类。

### Skill

```yaml
invoke:
  skill: classify
  input: '{"text": input.text}'
  timeoutMs: 30000
```

### Tool

```yaml
invoke:
  tool: load_record
  input: '{"id": input.id}'
```

### Script

```yaml
invoke:
  script: scripts/normalize.mjs
  input: "steps.load_record"
```

### Expression

```yaml
invoke:
  expr: '{"score": input.a + input.b}'
```

### Child Workflow

```yaml
invoke:
  workflow: quality_review
  input: "steps.generate"
```

`invoke.input` 是 JSONata。

如果省略，则传递当前 Workflow Frame 的 input。

v0.1 一个 state 不能 multi-invoke。

## 9. Route Model

Direct form：

```yaml
on:
  done:
    target: completed
```

List form：

```yaml
on:
  done:
    - target: review
      when: "output.score < 0.8"
    - target: completed
```

Route 按顺序求值。

如果 route set 中存在 `when`，最后一条必须是 unconditional fallback。

`when` 必须返回严格 boolean，不能依赖 truthy/falsy coercion。

Error route 采用相同的 ordered/fallback 规则。

## 10. Runtime Expression Scope

Base JSONata scope 概念结构：

```json
{
  "input": "<current workflow frame input>",
  "steps": {
    "<stateId>": "<latest completed output in this workflow instance>"
  },
  "run": {
    "visits": {
      "<stateId>": 1
    }
  }
}
```

额外 scope：

- successful route：`output`；
- error route：`error`；
- waiting event route：`event`。

Runtime 不提供 general mutable `assign`。

派生状态应通过显式 `expr` Step 或 Script result 表达。

## 11. JSONata 限制

JSONata 用于：

- `invoke.input`；
- `expr`；
- route `when`；
- Workflow top-level `output`。

限制：

```text
$random  → forbidden
$eval    → forbidden
external I/O extension → not registered
route predicate → strict boolean
$now/$millis → Runtime logical time
```

## 12. Skill Contract

Skill 位于：

```text
skills/<skillId>/
```

Invokable Skill 最低要求：

```text
SKILL.md
skill.harness.yaml
required output JSON Schema
```

示例：

```yaml
input:
  schema: input.schema.json
output:
  schema: output.schema.json
resources:
  - references/context.md
profile: high-quality-generation
```

Sidecar 支持：

- optional input schema；
- required output schema；
- optional resources；
- optional opaque `profile`。

Runtime 语义：

> 一个 Skill Step 等于一次 `AIOperationPort.execute()`。

Request 包含 provider-neutral identity、instruction/resource、JSON input、output schema、optional profile、AbortSignal。

Skill 不得隐藏 durable Tool、调用其它 Harness Skill、拥有 nested Workflow，或自行决定 arbitrary transition。

## 13. AI Operation Contract

Identity：

```ts
interface AIOperationIdentity {
  runId: string;
  workflowInstanceId: string;
  stepId: string;
  attempt: number;
}
```

Host 提供：

```ts
interface AIOperationPort {
  execute(request: AIOperationRequest): Promise<JsonValue>;
}
```

Provider/model strategy 不属于 Harness Definition。

返回值必须通过 Skill output schema，才能成为有效 Step output。

## 14. Tool Contract

Host Tool 由 application code 注册。

Public Contract：

```ts
interface HarnessTool<I = unknown, O = unknown> {
  input?: JsonSchema;
  output?: JsonSchema;
  effect: 'none' | 'idempotent' | 'non-idempotent';
  execute(input: I, ctx: ToolContext): Promise<O>;
}
```

ToolContext 包含：

```text
runId
workflowInstanceId
stepId
attempt
idempotencyKey
signal
now()
```

### `effect:none`

没有 externally visible side effect。中断后可 replay。

### `effect:idempotent`

使用相同 logical identity/idempotency key 重复执行在 Tool 的 external semantics 上必须安全/可控。

### `effect:non-idempotent`

如果 crash 发生在 `started` 后但 terminal journal 之前，禁止自动 replay，因为 side effect 可能已经发生。

## 15. Script Contract

Script 是用于复杂确定性逻辑的 trusted deterministic code。

当前 v0.1 可执行 asset 是 JavaScript ESM，通常 `.mjs`：

```js
export default async function execute(input) {
  return { ...input, normalized: true };
}
```

要求：

- default export 可调用；
- input/output JSON-serializable；
- source 在 Harness load 时读取并冻结；
- 按 Domain Contract 不得 external I/O；
- 每次 invocation fresh Worker；
- timeout/resource limit；
- AbortSignal terminate；
- `env: {}`；
- Runtime 不在执行时 transpile TypeScript Script。

Worker isolation 不是 malicious-code sandbox；Script 是 trusted repository code。

## 16. Expression Step

适合简单确定性 JSON transformation/check：

```yaml
invoke:
  expr: '{"total": input.price * input.quantity}'
```

如果 deterministic algorithm 在 JSONata 中已经难以审查，应改为 Script。

## 17. Child Workflow Contract

Child Workflow 是 sequential same-Harness composition。

规则：

- Child 必须存在于同 Harness；
- Child 必须声明 top-level `output`；
- Child input 就是 parent `invoke.input` 结果；
- Child 不能直接访问 parent `steps`；
- 禁止 recursion/cycle；
- 禁止 dynamic spawn；
- v0.1 禁止 parallel child invocation。

Parent 把 Child 看作一个 logical Step，但 Child 内部 Step 独立 journal，以支持 crash recovery。

## 18. Workflow Output

```yaml
output: '{"result": steps.commit}'
```

Successful final 时：

```text
workflow.output
→ Workflow Result
```

Root：

```text
Workflow Result → HarnessRun.output
```

Child：

```text
Workflow Result → Parent Workflow Step Output
```

Runtime 不会自动泄漏 Child 全部内部 `steps`，也不会把“最后一个 Step output”猜成 Workflow Result。

## 19. Waiting Event Contract

Event 只有在以下条件成立时才能接受：

- Run 为 `waiting`；
- 当前 state 声明该 event type；
- optional payload schema 通过；
- route evaluation 成功。

Accepted event payload 会成为 waiting state output，并与 transition 原子持久化。

Rejected send 必须做到 zero durable mutation。

Domain Authorization 应在 Host 调用 `send()` 前完成；DomainHarness 负责 workflow/event contract，不负责产品用户权限。

## 20. Logical Time

确定性时间用于防止 recovery 后 route 因 wall clock 改变而不同。

Evaluation Clock：

- executable Step：persisted `started_at`；
- waiting event：persisted event acceptance timestamp；
- Workflow output：frame `lastDecisionAt`；
- initially-final Workflow：Run creation time fallback。

`ToolContext.now()` 和 expression time 都是 Runtime-controlled logical-time surface。

## 21. Step Identity / Visit / Attempt

Logical identity：

```text
(runId, workflowInstanceId, stateId, visit)
```

`visit` 表示一个 state 的逻辑访问次数。

`attempt` 表示 replayable work 实际重新执行的次数。

二者不能混淆。

Recovery 复用 completed Step 时，仍然是同一个 logical Step，不会产生新 visit。

## 22. `maxSteps`

`limits.maxSteps` 统计 accepted logical work/visit，包括 accepted waiting-event visit。

它不是 retry counter。

超过后 Runtime 使用：

```text
step_limit_exceeded
```

不要用不断提高 maxSteps 来掩盖 accidental loop。

## 23. Persistence Model

概念上只有：

```text
runs
steps
```

Run persistence 包含：

- status；
- input/output/error；
- definitionHash；
- executionEngineMajor；
- portable control/frame state；
- timestamp。

Step persistence 包含：

- logical identity；
- kind/status/attempt；
- started/completed time；
- normalized input/output/error；
- stable idempotency key。

SQLite transaction 不跨 Tool/AI/Worker execution。

## 24. Recovery Matrix

| Journal 状态 | Step | v0.1 行为 |
|---|---|---|
| completed | 任意 | 复用，不再执行 |
| started | expr | 可 replay |
| started | script | 可 replay |
| started | skill | 可 replay |
| started | tool `none` | 可 replay |
| started | tool `idempotent` | 用稳定 identity/key replay |
| started | tool `non-idempotent` | 禁止自动 replay，走 `interrupted` |
| active child | workflow | 恢复 child frame/journal，不从头重启 child |

不声明 exactly-once。

## 25. Definition Lock

Active Run 保存：

```text
definitionHash
executionEngineMajor
```

`definitionHash` 覆盖 Runtime-relevant Workflow/Skill/Schema/Resource/Script content，不包括 absolute deployment path 和 Host Tool implementation code。

Mismatch 必须拒绝 active continuation。

v0.1 没有自动 active-run migration。

## 26. Cancellation

`cancel(runId)`：

- 与同 Run 其它 mutation 串行；
- 通过 AbortSignal 传播到支持的 Tool/AI/Worker；
- 持久化 terminal `cancelled`；
- late executor result 不得覆盖 terminal state。

Cancellation 是 Runtime lifecycle outcome，不是 YAML 中的 domain final state。

## 27. Public Lifecycle API

```ts
interface DomainHarness {
  start(request: StartRunRequest): Promise<HarnessRun>;
  send(runId: string, event: ExternalEvent): Promise<HarnessRun>;
  wait(runId: string, options?: WaitOptions): Promise<HarnessRun>;
  resume(runId: string): Promise<HarnessRun>;
  cancel(runId: string): Promise<HarnessRun>;
  get(runId: string): Promise<HarnessRun | null>;
  listRuns(query?: ListRunsQuery): Promise<HarnessRun[]>;
}
```

Run Status：

```text
running
waiting
completed
failed
cancelled
```

XState/Store/Runner/Recovery Internal Type 不属于 public SDK。

## 28. Error Contract

Public normalized error code 固定为：

```text
timeout
cancelled
interrupted
step_limit_exceeded
invalid_input
invalid_output
expression_error
script_error
tool_error
ai_error
child_workflow_error
```

Public Shape：

```ts
interface HarnessError {
  code: HarnessErrorCode;
  message: string;
  details?: JsonValue;
}
```

Domain-specific negative outcome 应尽量使用 successful final state/output，而不是发明新的 Runtime error code。

## 29. v0.1 不支持的能力

Harness Language 当前不支持：

- Static Parallel Composition；
- Generic DAG Execution；
- Dynamic Spawn；
- Full Hierarchical XState DSL；
- History；
- `after` / `always` / entry/exit action DSL；
- multiple invokes/state；
- distributed execution；
- cross-Harness Child Workflow；
- general mutable context assign；
- arbitrary plugin execution model。

不要依赖 undocumented internal 去模拟这些能力。

## 30. Compatibility

下游应 pin 已验证的 DomainHarness package/source。

Rollout 要考虑：

```text
Runtime package version
executionEngineMajor
Harness definitionHash
Host Tool behavior compatibility
active Run population
```

Tool implementation code 不进入 `definitionHash`，因此如果 Host 部署了 breaking Tool implementation，应保证 active Run 使用行为兼容版本，或者先 drain/cancel active Runs。

## 31. 技术验收清单

真实项目使用前至少检查：

- manifest schemaVersion = `0.1`；
- Workflow static validation 全通过；
- 所有 Skill/Tool/Script/Child reference 存在；
- 所有 Child 有 output；
- JSON Schema 可编译；
- JSONata 可 parse 且无 forbidden function；
- Tool effect 正确；
- Script trusted + deterministic by contract；
- waiting event schema/route 通过；
- root output 语义明确；
- `maxSteps` 不掩盖 loop；
- normal Critical Journey PASS；
- failure route PASS；
- waiting/send PASS；
- 重要 Tool effect crash recovery 已测试；
- definition mismatch 行为明确；
- 下游只 import package root。

## 32. 相关文档

- `HARNESS_AUTHORING_GUIDE.zh-CN.md`
- `../architecture/DomainHarness_ARCHITECTURE.zh-CN.md`
- `../domain-data/DOMAIN_DATA_SPEC.zh-CN.md`
- `../sdk/DomainHarness_v0.1_SDK_REFERENCE.md`
- `../operations/DomainHarness_v0.1_STORAGE_RECOVERY.md`
