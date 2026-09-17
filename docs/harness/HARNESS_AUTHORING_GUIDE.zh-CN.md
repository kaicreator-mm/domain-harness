# DomainHarness — Harness 编写指南

> 英文对应文档：`HARNESS_AUTHORING_GUIDE.md`。
>
> 受众：设计或重构 DomainHarness v0.1 工作流的领域工程师、架构师和 Coding Agent。

## 1. 编写目标

一个好的 Harness 应该是：

> 稳定 Domain Process 的薄执行投影。

它应该让 orchestration、validation、waiting、recovery 显式化，但不能变成：

- Domain Model 替代品；
- Giant Prompt Graph；
- Hidden Integration Layer；
- UI State Machine；
- Generic DAG Implementation；
- Opaque Script Application。

核心目标是：每一类工作都选择最小、最正确的 primitive。

## 2. 从一条 Critical Journey 开始

不要从整个项目代码开始。

先选一条真实 E2E Journey，并用普通领域语言写出：

```text
load authoritative context
→ generate proposal
→ validate proposal
→ review quality
→ wait for approval
→ commit approved result
```

然后逐步标记：

- input；
- output；
- owner；
- deterministic / semantic；
- side effect；
- failure meaning；
- retry safety；
- 是否修改 authoritative state。

最后才选择 DomainHarness primitive。

## 3. Primitive Decision Model

### 3.1 JSON Schema 能验证吗？

能就用 Schema。

适合：

- required field；
- type/range；
- discriminator；
- event payload shape；
- Skill/Tool input/output contract。

Schema 能在执行前确定性拒绝的，不要用 Skill/Script 再判断。

### 3.2 JSONata 能清楚确定性表达吗？

能就用 Expression。

适合：

```text
字段选择
简单计算
JSON transformation
threshold route
flag check
```

如果 JSONata 已经复杂到 reviewer 很难理解，就改 Script。

### 3.3 是复杂确定性算法且没有 I/O？

用 Script。

适合：

- graph traversal；
- parser/normalizer；
- deterministic scoring；
- complex validation；
- domain-owned dependency/readiness calculation。

如果要 credential/network/domain DB mutation，就不是 Script，而是 Tool。

### 3.4 是否跨 Runtime Boundary？

用 Tool。

例如：

- authoritative DB read/write；
- GitHub operation；
- HTTP/API；
- object storage；
- Harness 外 filesystem；
- queue/message publish；
- 调用其它 domain service。

所有 Tool 都必须先正确分类 `effect`，否则 Workflow 不能被认为 crash-safe。

### 3.5 是否需要 Semantic AI Judgment / Generation？

用 Skill。

Skill 应足够有边界，能够定义有意义的 JSON output schema。

不要用 Skill 去做“调用 API”或“判断 threshold”这种确定性工作。

### 3.6 是否是同 Harness 内可复用的顺序编排？

用 Child Workflow。

当子流程有自己的 Steps、recovery 和明确 result contract 时适合使用。

不要只是为了减少 parent YAML 几行就过度拆 Child。

### 3.7 是否需要 External / Human Decision？

用 Waiting State + `send()`。

Host 在调用 `send()` 前负责 Domain Authorization。

## 4. 写 YAML 前先划三条边界

先画：

```text
Domain Authority
Harness Execution
Host / External Side Effects
```

对每个数据问：

> 如果 DomainHarness SQLite 丢失，但 Domain Database 还在，这个事实是否仍然是业务权威？

如果 YES，它就应该属于 Domain System of Record，不是 Runtime State。

对每个 operation 问：

> 这个操作是否可能产生在 Runtime crash 后仍然存在的 effect？

如果 YES，它通常应是 Tool，并明确 effect/idempotency。

## 5. 先设计 Tool Table

强 Harness 通常先有 Tool Table，再有 Workflow YAML。

例如：

| Tool | Purpose | Effect | Idempotency | Authority |
|---|---|---|---|---|
| `load_record` | 读取 Domain Record | none | n/a | read-only |
| `save_draft` | upsert Draft | idempotent | run/step key | Domain DB |
| `send_email` | 发送邮件 | non-idempotent，除非 Provider 明确支持 key | explicit | External |

如果 effect 还不确定，先使用更保守分类，直到外部系统语义被证明。

不能因为“正常只调用一次”就把 Tool 标成 idempotent。

## 6. Skill 从 Schema 向外设计

AI Capability 先定义 output contract，再写大段 instruction。

推荐顺序：

```text
expected structured output
→ output JSON Schema
→ required input
→ minimum references
→ instructions/rules
→ examples/counterexamples
→ optional execution profile
```

这样 Skill 会保持一个清晰 semantic capability。

Skill 负责 proposal/assessment/result；Workflow 负责 route；Tool 负责 side effect。

## 7. Workflow State 要有领域语义

State Name 应回答：

> 当前处于哪个 Domain / Execution Stage？

好的：

```text
load_context
analyze
normalize
await_review
commit
completed
failed
```

避免：

```text
handler_1
controller_b
next_step
call_llm
```

也避免 provider-specific：

```text
ask_openai
claude_review
```

AI Runtime 可以更换 provider，而 Domain Process 不应该因此改名。

## 8. State 要短，Output 要明确

每个 executable state 做一件逻辑上清晰的事。

`steps.<stateId>` 的 output 应该容易理解。

例如：

```yaml
lookup:
  invoke:
    tool: load_record
    input: '{"id": input.id}'
```

后续读取：

```text
steps.lookup
```

如果一个 output 混杂很多互不相关职责，说明 State/Tool/Skill 可能太大。

## 9. Route 设计

Route condition 应 deterministic、短、可 review。

推荐：

```yaml
on:
  done:
    - target: review
      when: "output.confidence < 0.8"
    - target: completed
```

不要在 route expression 里写第二套程序。

复杂 deterministic decision：

```text
先在 Script/Expression Step 计算 explicit decision
→ route 只判断一个简单字段
```

这样更容易测试，也更容易 crash replay。

有 conditional route 时一定要有 unconditional fallback。

## 10. Error Route 设计

区分三种语义：

1. Runtime/Executor Error；
2. Recoverable Domain Condition；
3. Successful Negative Domain Outcome。

例如：

```text
Tool network failure → on.error / Runtime error
proposal needs human review → successful Step + route to waiting
review rejects proposal → final `rejected` / Runtime completed
```

不要把所有负面业务结果都送到 `failed`。

`failed` final state 保留给 Runtime failure semantic。

## 11. Waiting State 设计

当 Workflow 确实需要 external/human event 才能继续时使用 Waiting。

Waiting State 应明确：

- allowed event type；
- payload schema；
- deterministic target/route；
- host authorization expectation。

示例：

```yaml
await_approval:
  on:
    approve:
      schema: schemas/approval.schema.json
      target: commit
    reject:
      target: rejected
```

不要在 Script 内 poll，也不要在等人审批时不断 invoke AI。应持久化 waiting state，由 Host 调 `send()`。

## 12. Child Workflow 设计

当以下条件都成立时适合 Child Workflow：

- 子流程可复用或概念上独立；
- 能接受 explicit JSON input；
- 有明确 output contract；
- 属于同一个 Domain/Harness；
- sequential composition 足够。

Child 不应依赖 parent `steps` 的隐式访问；需要的数据全部通过 `invoke.input` 传入。

正确边界：

```text
parent invoke.input
→ child isolated scope
→ child workflow.output
→ parent Step output
```

## 13. Expression vs Script Review Rule

优先 Expression：

- 只有少量可读 transformation/condition；
- 天然 JSON-oriented；
- 很容易做 fixture table test。

优先 Script：

- loop / graph traversal；
- JSONata 可读性差；
- intermediate data structure 很重要；
- error diagnosis 需要代码结构。

Script 不能因为方便而接管 external I/O。

## 14. Script 编写规则

Script 应相对于 input 和 Runtime logical context 保持确定性。

推荐：

```js
export default function execute(input) {
  return result;
}
```

不要依赖：

- process environment credential；
- 任意 filesystem/network I/O；
- global mutable state；
- wall clock 控制 Workflow；
- random value。

Script 是 trusted code，但仍应遵守 deterministic extension contract。

## 15. Tool 编写规则

Tool 是清晰的 Host Capability Boundary。

Review Checklist：

- input/output JSON-compatible；
- 需要时提供 schema；
- effect 有充分依据；
- idempotent Tool 在外部系统需要时正确使用 supplied `idempotencyKey`；
- 尽可能响应 `AbortSignal`；
- timeout 语义清楚；
- credential 留在 Host config；
- business authorization 在 Domain Layer 完成；
- error 不泄漏 secret。

对于 non-idempotent Tool，必须接受 v0.1 的恢复规则：uncertain started execution → `interrupted`，Runtime 拒绝自动 replay。

## 16. Skill 编写规则

Skill 应包含 Domain Intelligence，不包含 Runtime Intelligence。

好的 Skill instruction 包含：

- Domain Task；
- Input Interpretation；
- Relevant Constraint；
- Reference；
- Structured Result；
- 必要时的 abstention/uncertainty 规则。

避免：

- provider name；
- retry loop；
- 决定 next Workflow state；
- DB/API mutation；
- hidden calls to other Skills；
- 要求忽略 output schema。

## 17. Schema 设计

重要 trust boundary 使用 Schema：

```text
external event payload
Tool input/output（适用时）
Skill input/output
important JSON structure
```

能机械验证的规则优先 Schema，而不是 prose。

Critical Skill 不应使用“任意 object 都合法”的宽松 output schema，否则 structured validation 失去意义。

## 18. `maxSteps` 估算

估算最长合法路径，包括 loop/review、nested child 和 accepted waiting event。

例如：

```text
normal journey: 12 visits
worst valid review loop: +12
nested child maximum: +18
reasonable headroom: x2
maxSteps: 84 或 100
```

没有证据不要随便设成一百万。

## 19. Recovery-Aware Authoring

每个 Tool Boundary 都要推演：

```text
crash before Tool executes
crash during Tool
crash after external side effect but before journal completion
crash after journal completion but before route/control commit
```

然后确认 effect classification 对这些场景的行为可接受。

高风险 Workflow 应对关键 crash boundary 做自动化测试。

## 20. Definition Lock Awareness

以下 executable asset 的 meaningful change 会影响 `definitionHash`：

- Workflow；
- Skill；
- Resource；
- Schema；
- Script。

部署 breaking Harness definition 前如果存在 active Runs，要决定：

```text
drain
cancel
finish on old definition
或 controlled version rollout
```

v0.1 不会自动迁移 active Run。

Host Tool code 不进 definitionHash，因此 Tool deployment 要单独做 behavior compatibility 管理。

## 21. Harness Review 顺序

推荐 review 顺序：

1. Domain Authority Boundary；
2. Tool Effect；
3. Skill Schema / Boundary；
4. Deterministic Logic Placement；
5. Workflow Structure；
6. Route / Fallback；
7. Waiting Event Authorization Boundary；
8. Child Scope / Output；
9. Recovery；
10. `maxSteps` / Loop；
11. Validation Coverage。

如果只先看 YAML 语法，很容易漏掉真正严重的架构错误。

## 22. 新 Harness 的 Validation Suite

### Loader / Static

- valid Harness loads；
- missing Skill/Tool/Script/Child fails；
- invalid target/unreachable/cycle fails；
- forbidden JSONata fails；
- path/symlink escape fails。

### Primitive

- Skill success + invalid output；
- Tool effect behavior；
- Expression result/error；
- Script result/timeout/cancel；
- Child result/failure/recovery；
- waiting valid/invalid event。

### Lifecycle

- start → completed；
- start → waiting → send → completed；
- cancel active work；
- resume persisted running work；
- get/listRuns。

### Recovery

- completed Step reuse；
- idempotent Tool stable key replay；
- non-idempotent Tool interrupted；
- terminal journal/control-lag reconciliation；
- definition/engine mismatch rejection。

### Domain Journey

- real positive Critical Journey；
- negative-but-successful domain outcome；
- domain/external failure journey。

## 23. 反模式目录

### Giant Workflow

几百个 state 复制应用内部流程。按稳定领域子流程拆分，或者不稳定的 application orchestration 保留在 Domain App。

### Giant Skill

一个 Prompt 同时做 research、plan、approval、mutation。拆分 semantic capability、deterministic logic、Workflow、Tool。

### Giant Script

Script 变成第二套应用。I/O 和 business authority 移回 Domain Code/Tool，只保留 deterministic algorithm。

### Tool Without Effect

Crash behavior 无法定义。Effect classification 是必要条件。

### Hidden Parent/Child Coupling

Child 假设可以读取未显式传入的 parent data。全部通过 input mapping 传入。

### UI Workflow

State 只是 screen/button 翻译，而不是 Domain Process。

### Provider Workflow

State 写死 model/provider。Model strategy 应留在 AI Runtime。

### Error as Business Outcome

把 `rejected` / `not_recommended` 送到 `failed`。应使用 successful domain final state。

### Infinite Review Loop + Huge maxSteps

修 Loop Policy，而不是用巨大 limit 掩盖问题。

## 24. Authoring Checklist

Merge 前：

- [ ] Domain Authority Boundary 已记录；
- [ ] 选定一条真实 Critical Journey；
- [ ] 每个 state 只有一个清晰 responsibility；
- [ ] 遵循 deterministic-before-AI；
- [ ] 所有 Tool 注册且 effect 有依据；
- [ ] Skill 有 required output schema 且范围有限；
- [ ] Harness 不包含 provider-specific routing；
- [ ] route deterministic 且有 fallback；
- [ ] waiting event schema / authorization boundary 明确；
- [ ] Child input/output 显式且无 cycle；
- [ ] Script 按 contract 无 external I/O；
- [ ] `maxSteps` 有依据；
- [ ] positive/negative/recovery test 存在；
- [ ] active-run compatibility 已考虑；
- [ ] Domain Asset 没有泄漏 XState/Store/Runner internal API。

## 25. 推荐 Agent Workflow

```text
1. Read Frozen PRD/Architecture/Domain Authority.
2. Read Domain Data Spec + Harness Technical Spec.
3. Map one Critical Journey.
4. Produce Tool effect table.
5. Produce primitive mapping.
6. Draft schemas first.
7. Draft Skills/Tools contract.
8. Draft Workflow/Child Workflows.
9. Add examples/fixtures.
10. Run static validation/tests.
11. Review recovery boundaries.
12. Only then refactor adjacent journeys.
```

永远不要让 Agent 从 Runtime implementation 反推 Domain Authority。

## 26. 相关文档

- `HARNESS_TECHNICAL_SPEC.zh-CN.md`
- `../domain-data/DOMAIN_DATA_SPEC.zh-CN.md`
- `../domain-data/DOMAIN_DATA_AUTHORING_GUIDE.zh-CN.md`
- `../architecture/DOMAINHARNESS_INTEGRATION_MODEL.zh-CN.md`
- `../sdk/DomainHarness_v0.1_AGENT_MIGRATION_GUIDE.md`
