# <项目名> 领域契约草案（DomainHarness v0.3）

**Project:** <repo> @ <版本/基线>（<语言/运行形态>）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20
**Date:** 2026-09-20

> 标记约定（沿用 General Design v0.2 §0.2）：
> `[约定]` 项目级约定，不需改 PRD/SDK · `[L2-x]` 待 L2 决定 · `[PRD-CR-x]` 需 PRD 变更 · `[G1–G10]` 分析文档差距矩阵条目 · `[现状]` 实现观察

## 0. 适合性判定（十二问速答，General Design v0.2 §20）

| # | 问题 | 回答（一句话 + 证据路径） |
|---|---|---|
| A | 长期业务对象（实体） | |
| B | 长期/可恢复流程 | |
| C | 领域能力（Tool）与执行种类 | |
| D | 业务 SoR 在哪里 | |
| E | 每实体组合视图（DynamicState） | |
| F | 哪些只是交互/导航/本地状态 | |
| G | 宿主绑定（SQLite/fs/HTTP/AI/device） | |
| H | E/R/S 实例划分、instanceKey、开通者 | |
| I | 命令入口 workflow、拒绝路径 | |
| J | Mutation Ownership（M1–M5） | |
| K | 外部事件（推进 vs 失效）、超时 | |
| L | 长期实例的破坏性变更重建路径 | |

**判定结论：** 适合 / 部分适合（原因）/ 不适合（原因）

## 1. 领域实体与实例模型

| workflowId | 类别 E/R/S | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|

地址约定：同一实体的全部 E workflow 共享 instanceKey（= 实体 key）；correlationId 约定；`{domain}.{name}` 命名。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml            # schemaVersion '0.1', id: <domainId>, limits.maxSteps
├── workflows/              # 每个 workflow 的状态/路由要点（init 只收 Restore、
│                           #   每个静止状态含 {S}__reject 拒绝路径 W3、Close 命令 W5、
│                           #   条件路由以无条件兜底结尾 R2、静止状态无 invoke/effect W1/W2）
├── skills/                 # SKILL.md + skill.harness.yaml（output.schema 必填）
├── tools/                  # [G9] 暂无磁盘格式——列出逻辑声明，编译期程序化传入
├── projections/            # [G9] 同上
├── business-sources/       # [G2/L2-8] 待平台支持；先以本文件 §4 表格为准
├── schemas/                # Ajv Draft 2020-12
├── rules/ · references/    # 治理层资产（不解析）
```

每个 E workflow 给出：状态清单（静止/瞬时）、消息类型 → 路由表（含拒绝路径）、invoke 的 Tool/expression、message effects。

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output（schema 摘要） | 幂等机制 | binding / capability |
|---|---|---|---|---|---|

约定：写业务 Tool 在**同一业务事务**内重新校验权威事实（PRD §17.4）→ 提交 → 写 `applied_effects(idempotency_key, result_json)` → 以结构化 `{outcome: applied|rejected, commandId, code?, reason?}` 返回（R3）；抛错只留给技术故障。本地业务写依赖 **[PRD-CR-1 / G3] 项目绑定 Tool**；CR 前临时方案 A（本地回环）/ B（Direct 化）。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略（B1/B2） | 缓存/失效（B5） |
|---|---|---|---|---|

Provider 契约：B1 value 变⇔revision 必变；B2 不变则不变；B3 单源一致；B4 只读无副作用；B5 低成本（按 `(source,key)` 缓存 + InvalidationSource 驱逐）。

## 5. Compiled Domain Data（包内不可变领域数据）

| key | 内容摘要 | 用途（规则表/阈值/路由表） | 变更治理（authority level） |
|---|---|---|---|

**[G1]** 当前 manifest 无 `domainData` 字段、编译器不加载 domain-data 资产；契约草案按目标形态声明，落地前由宿主以 `CompiledDomainDataPort` 带外提供并按 packageId 钉住。

## 6. Projection / Dynamic Domain State

每个实体一个 `{Entity}DynamicState`（查询 key = 实体 key），依赖 = 同 key 的 E workflow 实例 + 同 key 业务快照 + domain-data；**不做跨实例集合 Projection**（集合视图走 P4 读模型，§11.3）。

outputSchema 统一信封（General Design v0.2 §11.5）：

```jsonc
{ "key", "phase", "availableActions": [{ "type", "enabled", "disabledReason?" }],
  "pending": [{ "kind", "since?" }],
  "lastOutcome": { "commandId", "outcome": "applied|rejected", "code?", "reason?" } | null,
  "body": { /* 领域专属 */ } }
```

| projectionId | key | 依赖（workflow / business / domain-data） | body 摘要 |
|---|---|---|---|

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据（M1 串行化 / M2 推进流程 / M3 外部非幂等副作用 / M4 恢复审计 / M5 长耗时 / Direct） |
|---|---|---|---|

## 8. Skills / AI 任务（v0.3 Track B）

| skillId | scope（Control / Domain） | 触发点 | input contract | output contract（必填 schema） | envelope 要求 |
|---|---|---|---|---|---|

约定：Control Skill 输出**只能是** typed Proposed Domain Command（propose-only，经契约校验后进 durable message）；Domain Skill 输出结构化结果（produce-result-only），验证后由 Workflow 决策、经 Tool 落权威变更；committed AI result 入 journal，replay 复用（v0.3 PRD §9–§14，**[G8]** 平台 envelope 契约未落地前先以 Skill outputSchema + workflow 路由兜底）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生（确定性） | 目标 workflow | 处置（推进 / 仅失效） | 死信策略 |
|---|---|---|---|---|

长耗时作业模式（§9.5）：提交 Tool（业务 jobs 表登记 `{jobId, deadline, status}`）→ workflow 静止于 `awaiting` → 回调与超时共用 messageId `job:{jobId}:finished` → 先到者生效。**[G6]** 持久定时器未落地前由 P2 超时调度器扫描 jobs 表。

## 10. Target Host Profile 与 capability 需求

```yaml
platform: <electron-node | expo | server-node | ...>
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1?, http-transport@1?, ...]
projectBindings:            # [PRD-CR-1 / G3]
  <domain>.<store>@1: { module: <packages/domain-runtime/bindings/...>, resources: [businessDb] }
runtimeResources(resourceKey): <businessDb, aiRuntime, ...>   # 值只在激活期注入，不进包
```

AI Runtime：`AIOperationPort` 连接（provider/model 路由留在 AI Runtime 边界外，v0.3 PRD §7.2）。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | CR/L2 前的临时约定 |
|---|---|---|

## 12. 迁移路径建议

1. 只读接入：BusinessSnapshotProvider + 每实体一个 Projection（DynamicState 读模型先行）；
2. 命令入口：单一 E workflow 承接公开命令（含 Restore/Close、拒绝路径）；
3. Tool 化业务写：按 Mutation Ownership Table 将 M1–M5 字段迁到 Message→Tool 路径；
4. AI Scoped 化：Control/Domain Skill 按 §8 收编；
5. 长耗时作业与 Ingress 按 §9 模式接入。
