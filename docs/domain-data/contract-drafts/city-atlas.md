# City Atlas 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/city-atlas` @ v0.4.0（Python FastAPI 模块化单体×3 信任域 + RN/Expo 客户端；PostgreSQL+PostGIS 三 schema main/odbl/ops；app_flutter 为 v0.3.0 parity 参照；Release Qualification BLOCKED、原生验证 BLOCKED_ENV）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20
**Date:** 2026-09-20

> 本项目的隐私红线（HR 系列）结构性地决定了 DomainHarness 的落点：**public API 零身份、零可追溯（HR-2），TaskState 是客户端携带的不可变值对象、服务端刻意不落 Task 表**。因此契约分为两个宿主面：
> **① 设备面（RN，expo 宿主）**：任务执行 Run 实例活在设备上（本地 SQLCipher kv 为 SoR），与"零服务端身份"完全相容；
> **② 治理面（ops 信任域，Node sidecar）**：ChangeProposal/AiProposal/TaskDefinition 发布/采集批次是有人工账号、有持久状态的长寿命治理流程。
> 红线全程有效：`launched ≠ completed`（交接无回调，终局只能由用户显式上报）；标准在线任务 **LLM=0**（评估纯函数规则表；AI 仅 intent 解释与 Task Lab 提案）；correction_queue **只写不读**（HR-4）；main/odbl 许可隔离（HR-1）；freshness `unknown ≠ fresh`；内容红线（HR-5/15：汇率/军警/检查站/征兵/出入境全链路禁止）。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | TaskDefinition（`(task_id,version)` 不可变发布快照）、TaskState（**客户端持有**，9 态单向 draft→interpreted→evidence_ready→evaluated→action_ready→handed_off→{user_confirmed\|failed\|corrected}）、ChangeProposal（base_snapshot 并发检测）、AiProposal（DRAFT→REVIEWED→VALIDATED→APPROVED→PUBLISHED，禁 self-review）、Poi/PoiChannel/PoiAnchor、CollectionBatch、CaptureBundle、TaskOutcomeMetric（匿名日聚合桶）、TripState（Redis SETEX TTL≤4h）、UserContextCapsule（设备本地，TTL+坐标量化≈110m）、RouteVersion/AuditLog |
| B | 长期/可恢复流程 | v2 四阶段任务编排（服务端**无状态可重入**，同输入同输出，状态客户端携带，重放 stage 即恢复，无部分推进）；v3 plan→execute 问答环（compile_task_plan 未 ready 则补答案重入）；采集→双重净化→校验→匹配→提案→人工审批→apply（生产唯一写 main 路径，audit 同事务）；AIProposal 五态治理 |
| C | 领域能力（Tool） | applyProposal、publishTaskDefinition、syncAvailability（显式幂等"重跑即最终态"）、channelProbe（外部读 fail-open）、recordOutcome（桶级 upsert）、submitCorrection（append）、tripShare 写（SETEX 幂等）、interpretIntent（AI Runtime，schema-constrained+确定性 fallback）、CLP 地点读（骨架 fail-closed）、RN launcher（tel:/地图/分享——只报告 launched，绝不改任务状态）、本地 kv 读写 |
| D | 业务 SoR | 服务端：PG 三 schema（main 事实/odbl 隔离/ops 治理）+ Redis（trip）；**设备：SQLCipher kv（任务态/待办/收藏/常用线路只存本机 HR-16）**；上游外部 SoR：CLP（地点）、CrawlKit（抓取）、Cairn（知识）——全部 BLOCKED_EXTERNAL 骨架 |
| E | 每实体组合视图 | 设备：TaskRunDynamicState = `{answers, plan(ready/nextQuestions/formSchema), result(decision/reasonCodes/actions/missingFacts/degradations), error, busy}`（现为 TaskHome screen-local useState——最强 Projection 候选）；治理：ProposalDynamicState（提案+审核态+base_snapshot 冲突标记） |
| F | 只是交互/本地状态 | RN 导航/表单/地图视图态；PresentationSchema 渲染选择 |
| G | 宿主绑定 | 服务端 Python FastAPI（**语言缺口**：DomainHarness 以 Node sidecar 进 ops 信任域，经 HTTP 调 admin API）；设备 Expo RN + SQLCipher + expo-location（前台）+ PMTiles 离线地图；**禁后台任务/后台上传/分析 SDK** |
| H | E/R/S 划分 | 设备：R `atlas.taskrun`（key=taskToken 客户端生成，终态后 Close；**重做=新实例**，无重置后门——既有语义）；治理：E `atlas.proposal`（key=proposalId）、E `atlas.taskdef`（key=taskId，发布管线）、S `atlas.batch`（key=batchId 采集批） |
| I | 命令入口/拒绝路径 | 设备命令发 `atlas.taskrun`（Interpret/Evaluate/Actions/Outcome）；非法转移→`rejected(INVALID_TRANSITION)`（现状 409+RFC9457 problem+json，失败矩阵闭集机读码直接映射拒绝码）；治理命令发各 E 实例，self-review/未验证→rejected |
| J | Mutation Ownership | 见 §7；main schema 只经 applyProposal（既有铁律=天然 S1） |
| K | 外部事件/超时 | Ingress：用户 outcome 上报（重复 handed_off 幂等确认）、correction 202 入队、采集批上传、渠道健康巡检；定时：availability 日同步（per-field freshness 策略：availability_today 6h/name 365d/…，"适合 cron"为源码原话）、审计 180 天清理（HR-11）；设备：采集 4h 硬上限自动停止、前台限定 |
| L | 破坏性变更重建 | 设备：atlas-backup v1（PBKDF2+AES-256-GCM，跨 Flutter/RN 兼容为 release blocker）+ Restore；治理：提案/审计全持久，Restore 按提案状态路由 |

**判定结论：部分适合——按双面落点适合**。不替换已冻结的 v2/v3 执行契约（AGENTS.md：不得为简化 RN 代码替换 stable v3 Task API）；DomainHarness 是**设备侧 Run 恢复 + 治理侧长寿命流程**的增量宿主。服务端"用户维度 Entity"结构性不可行（HR-2），本契约不设计任何服务端用户实例。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 宿主面 |
|---|---|---|---|---|---|
| `atlas.taskrun` | R | taskToken（客户端生成，无服务端身份） | 单次任务执行；终态（user_confirmed/failed/corrected）后 Close；重做=新实例 | 设备 P2（开始任务时 ensureOpen） | RN/expo |
| `atlas.proposal` | E | proposalId | submitted→reviewing→approved/rejected→applied | ops P2（提案创建） | Node sidecar（ops 信任域） |
| `atlas.taskdef` | E | taskId | AIProposal/人工提案 → 校验 → 审批 → PUBLISHED（不可变快照追加） | ops P2 | 同上 |
| `atlas.batch` | S | batchId | 采集批：received→sanitized→validated→matched→proposed→closed | ops P2（导入触发） | 同上 |

- 设备实例数据全部本地（SQLCipher）；备份/恢复走 atlas-backup v1（恢复=新设备重放实例+业务快照）。
- v2 服务端编排保持**无状态纯函数**（AC-1 同输入同输出）：它不进 workflow，而是被设备 workflow 以 remote Tool 调用（interpret/evaluate/actions 皆服务端点）。

## 2. Raw Domain Package 骨架

```text
domain/                          # 两个包：atlas-device（expo profile）与 atlas-ops（node profile）
├── harness.yaml                 # id: atlas-device | atlas-ops
├── workflows/taskrun.yaml · proposal.yaml · taskdef.yaml · batch.yaml
├── skills/                      # §8：intent-interpret（运行时唯一 AI）+ task-lab 提案族（离线治理）
├── tools/ · projections/        # [G9] 见 §3/§6
├── business-sources/            # [G2] 见 §4
├── schemas/                     # TaskState（9 态+闭集入口）、TaskPlan{ready,nextQuestions,formSchema(JSON Schema)}、
│                                #   TaskExecution{decision:READY|VERIFY_FIRST|UNCERTAIN|NOT_RECOMMENDED,
│                                #   reasonCodes,actions,missingFacts,degradations}、IntentInterpretation
│                                #   （atlas.intent_interpretation.v1，extra=forbid）、ChangeProposal、
│                                #   AiProposal、CaptureBundle（capture.schema.json 既有）、失败矩阵码表
├── rules/                       # 治理层：HR-1..16、launched≠completed、LLM=0 红线、freshness unknown≠fresh、
│                                #   内容红线词表（content_guard 同源）、license_class 隔离
└── references/                  # PRD v0.3/v0.4、evals golden cases（visit_readiness 等 4 文件）
```

`taskrun.yaml`（设备）要点：

```text
init              只收 Restore{taskStateSnapshot}；按 TaskState.stage 路由（闭集）：
                    draft/interpreted/evidence_ready/evaluated/action_ready/handed_off → 对应静止状态
                    终态 → 直接 Close/final；兜底 → drafting
drafting          InterpretRequested → interpreting（invoke interpret_stage：本地 context capsule 装配 →
                    远程 v2 interpret（可含 AI intent 解释，仅 draft 态允许）；AI 降级码 AI_INTERPRET_DEGRADED
                    透传，不阻断）→ interpreted · 上游不可用 → rejected(UPSTREAM_UNAVAILABLE|CONTEXT_EXPIRED) 原地
interpreted       GatherEvidence（本地证据装配/定位采样，前台+4h 上限）→ evidence_ready
evidence_ready    Evaluate → evaluating（invoke evaluate_stage：服务端纯函数规则表；**结构上不 import AI**）
                    → evaluated{decision,reasonCodes,…} · UNCERTAIN/NOT_RECOMMENDED 也是 applied（决策≠成功推进）
evaluated         RequestActions → actions_ready（action cards 装配：白名单 DTO、语言中性 key、
                    provider 原始字段黑名单断言）
action_ready      Handoff{cardId} → handing_off（invoke launch_action：tel:/地图/分享——**只记录 launched**）
                    → handed_off（静止；等待外部世界，无回调）
handed_off        ReportOutcome{user_confirmed|failed|corrected} → 对应终态 → announcing → Close/final
                    （重复上报幂等确认——既有语义）
全部静止状态接受全部消息；不适用 → {S}__reject（W3/R4）；无重置后门：重做=新 taskToken 新实例
```

治理面 `proposal.yaml`：`init→Restore→pending_review`（静止）→ Review{approve|reject}（**reviewer≠proposer 强制**）→ applying（invoke apply_proposal：base_snapshot 比对，不符→rejected(stale_base)；成功=写 main+audit 同事务）→ applied → Close。`taskdef.yaml`：五态推进，VALIDATED 前跑确定性校验（结构/词表/内容红线 guard），PUBLISHED 产出不可变 `(task_id,version)` 快照（唯一约束天然幂等）。

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `interpretStage` / `evaluateStage` / `composeActions` | none | remote（v2/v3 服务端点，纯函数可重入） | TaskState+capsule → 下一阶段值对象（失败矩阵闭集码） | 服务端无状态天然幂等 | http-transport@1 / resourceKey=atlasApi |
| `interpretIntent`（AI） | none | remote（AI Runtime） | draft 态输入 → `atlas.intent_interpretation.v1`（extra=forbid 本地校验，不过=SCHEMA_MISMATCH 降级） | 零留痕（不落库不缓存——隐私） | resourceKey=aiRuntime |
| `launchAction` | non-idempotent（设备外部效果） | **project** [G3]（RN 注册绑定） | `{cardId}` → `{launched:true\|false, fallbackChain[]}`——**绝不改任务状态** | 无（外部世界效果）；人工恢复说明必须 | `atlas.deviceLauncher@1` |
| `recordTaskOutcome` | idempotent | remote/project | 匿名日桶 `(day,task_id,version,decision,outcome,degradation)` upsert count+1 | 桶级 ON CONFLICT（聚合语义可接受重复计 1） | http-transport@1 |
| `submitCorrection` | non-idempotent | remote | append correction_queue（202） | **现状重复行**——契约要求补 dedupeKey（内容 hash） | 同上 |
| `applyProposal` | idempotent | remote（ops admin API） | `{proposalId, baseSnapshot}` → CommandResult（**生产唯一写 main 路径**；audit 同事务；odbl→main CHECK 兜底） | base_snapshot 乐观并发 + 状态 CAS | resourceKey=atlasAdmin |
| `publishTaskDefinition` | idempotent | remote | 校验后提案 → 不可变快照 | `(task_id,version)` 唯一约束 | 同上 |
| `syncAvailability` | idempotent | project/script | "任何时间点重跑一遍就是最终状态"（按 reason 增删；自定义闭店不覆盖） | 显式幂等（源码自证） | `atlas.opsStore@1` |
| `ingestCaptureBundle` | idempotent | remote | 双重净化（EXIF 全剥离/相对时间/禁字段 schema 拒绝）→校验→匹配→提案 | batch_id+条目内容 hash | resourceKey=atlasAdmin |
| `writeTripShare` | idempotent | remote | Redis SETEX 覆盖写，TTL≤4h，无 trips 表 | 覆盖写=幂等 | http-transport@1 |
| `localKvWrite`（设备） | idempotent | project | SQLCipher kv（fail-closed：不可用拒开库；replaceAll 先全量校验再事务替换） | (kind,key) upsert | `atlas.deviceStore@1` |

**CLP/CrawlKit/Cairn/dx-service/YISHU 上游**：全部 BLOCKED_EXTERNAL 骨架——binding 缺失时 fail-closed（`UNSUPPORTED_CAPABILITY`："没交付"≠"不存在"≠空结果），与 MISSING_BINDING 语义一致；**不得以 fixture 冒充交付**。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 宿主面 |
|---|---|---|---|---|
| `atlas.taskState` | taskToken | TaskState 值对象（stage+answers+evidence refs+result） | stage 序号+内容 hash | 设备（本地 kv） |
| `atlas.deviceContext` | taskToken | UserContextCapsule 投影（用途白名单决策表、TTL、量化坐标） | capturedAt | 设备 |
| `atlas.proposal` | proposalId | 提案+审核态+base_snapshot 指纹 | ops 行版本 | sidecar（读 ops PG） |
| `atlas.taskdef` | taskId | 已发布版本列表+最新快照摘要 | max(version) | sidecar |
| `atlas.batch` | batchId | 采集批状态+accepted_count | 行版本 | sidecar |
| `atlas.poiFreshness` | poiId | per-field verified_at+freshness 判定（策略注册表 FRESHNESS_POLICIES_V1） | max(verified_at) | sidecar（只读 main） |

**隐私约束进 Provider 实现**：任何快照不得聚合出"某人某时在某地"（HR-2/13）；设备源不出本机；sidecar 源仅 ops 信任域可见。

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `task-stage-rules` | v2 阶段决策表+结局路径表+失败矩阵闭集码（INVALID_TRANSITION/CONTEXT_EXPIRED/EVIDENCE_UNAVAILABLE/HARNESS_UNAVAILABLE…） | taskrun 路由与拒绝码 | FROZEN |
| `task-definitions:{taskId}:{version}` | 已发布 TaskDefinition 快照（六件套：EvidenceProfile/Primitive/Workflow/ActionPolicy/Presentation） | v3 plan/execute 的编译输入 | FROZEN（不可变快照） |
| `freshness-policies` | per-field TTL 注册表（availability_today 6h…；无通配兜底；生产者 TTL 只能报短） | evaluate/poiFreshness | CONTROLLED |
| `content-guard` | 内容红线词表/规则（HR-5/15，与 `core/content_guard.py` 同源） | 提案/采集/Skill 输出闸 | FROZEN |
| `primitive-registry` | 评估原语规则表（READY/VERIFY_FIRST/UNCERTAIN/NOT_RECOMMENDED + reason codes + claim 分级） | evaluate 投影参照 | FROZEN |
| `license-classes` | main/odbl 隔离规则 + per-item license_class 标注要求 | Provider/投影组装 | FROZEN（HR-1） |

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `atlas.taskrun-state`（设备） | taskToken | wf taskrun + business taskState/deviceContext + domain-data task-stage-rules/freshness-policies | 信封 + body{answers, plan{ready,nextQuestions,formSchema}, result 五元组（decision/reasonCodes/actions/missingFacts/degradations **必须全部可见**，PRD v0.4 §5.1）} |
| `atlas.proposal-state`（治理） | proposalId | wf proposal + business proposal + domain-data content-guard/license-classes | 审核态、冲突标记、guard 结果 |
| `atlas.taskdef-state` | taskId | wf taskdef + business taskdef | 五态进度、已发布版本 |

集合视图（任务目录+本地化 fallback、POI 搜索按 verified_at 加权、地图 PMTiles）走 P4 读模型；correction_queue **永不进任何读模型**（HR-4，自动检查项）。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| TaskState.stage/answers（设备） | Message → atlas.taskrun → 阶段 Tool | Tool | M2（单向状态机+闭集入口） |
| main.Poi/channels/anchors | **仅** Message → atlas.proposal → applyProposal | Tool | M3、M4（唯一写路径+audit 同事务——既有铁律） |
| task_definition 快照 | Message → atlas.taskdef → publishTaskDefinition | Tool | M2、M4（不可变版本） |
| task_outcome_metric 桶 | Message/Ingress → recordTaskOutcome | Tool | M4（匿名聚合） |
| correction_queue | Direct（202 append，只写不读） | 业务服务 | 无流程依赖（审核在 ops 侧另起提案） |
| trip 分享 | Direct（SETEX 覆盖+TTL） | 业务服务 | 无流程依赖 |
| 设备 kv（待办/收藏/线路） | Direct（HR-16 只存本机） | 设备服务 | 无流程依赖 |
| capture 批次/提案 | Message → atlas.batch → ingestCaptureBundle | Tool | M4（双重净化+审计） |

## 8. Skills / AI 任务（v0.3 Track B）

**双层纪律**：运行时标准任务 LLM=0（evaluate 结构上不 import AI，门禁测试锁死）；AI 只在 ① intent 解释（draft 态）与 ② Task Lab/治理提案（离线，不可信输出→确定性校验→人工 review→publish）。

| skillId | scope | 触发点 | output contract | envelope 要点 |
|---|---|---|---|---|
| `intent-interpret` | Domain | interpreting（仅 draft TaskState） | `atlas.intent_interpretation.v1`（Pydantic frozen+extra=forbid→JSON Schema 现成） | **allowed context=TASK_SCOPED_NON_IDENTIFYING_PROFILE（冻结隐私 profile——v0.3 §13 declared-context-only 的既有实现）**；确定性 fallback（AI_INTERPRET_DEGRADED）；零留痕 |
| `task-lab-analyze` | Domain（治理，离线） | Task Lab/dx-service | 参数/workflow 发现、反事实、规则批判、golden-case 提案——全部**不可信提案** | 人工 review/approve/publish 三段闸；AI 直写生产禁止 |
| `atlas-ops-router`（可选） | **Control** | 治理台自然语言 | typed Proposed Domain Command（Review/Publish/Ingest） | propose-only；reviewer≠proposer 在 Tool 侧强制 [G8] |

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| 用户 outcome 上报（`POST /v2/tasks/outcome`） | `outcome:{taskToken}:{stage}` | atlas.taskrun（设备本地投递） | 推进（重复 handed_off 幂等确认） | 外部世界**唯一**回流通道（launched≠completed） |
| correction/feedback 202 入队 | `corr:{dedupeKey}` | atlas.proposal（ops 审核后） | 推进 | 只写队列→人工转提案 |
| 采集批上传 | `batch:{batchId}` | atlas.batch | 推进 | 双重净化在 Tool 内 |
| availability 日同步 | `avail:{date}` | —（syncAvailability 幂等重跑） | 推进 | **[G6]** 前进程内 cron（现状 `@tools/sync_availability` "适合 cron"） |
| 采集 4h 硬上限 | `capture:{sessionId}:limit` | 设备采集会话 | 终止 | 前台限定，离开前台即停（既有） |
| 审计 180 天清理（HR-11） | `purge:{date}` | — | 维护 | 定时 |

上游（CLP/CrawlKit/Cairn/AI Runtime）回调：**当前全部无**（骨架）；接线时按 `{source}:{externalEventId}` 派生并过 content-guard。

## 10. Target Host Profile 与 capability 需求

```yaml
# host-profiles/atlas-device.yaml（RN/expo）
platform: expo
capabilities: [expo-sqlite-runtime-store@1, expression-jsonata@1, http-transport@1, secure-random@1, crypto-hash-sha256@1]
projectBindings:
  atlas.deviceStore@1:   { module: bindings/device-store.ts,   resources: [cipherKv] }   # SQLCipher fail-closed
  atlas.deviceLauncher@1:{ module: bindings/launcher.ts,       resources: [] }           # tel:/maps/share/clipboard
runtimeResources: atlasApi(public :8000), aiRuntime, cipherKv(SecureStore key), clock(可注入)
---
# host-profiles/atlas-ops.yaml（Node sidecar，ops 信任域 :8100 侧）
platform: node-sidecar
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, http-transport@1, secure-random@1, crypto-hash-sha256@1]
projectBindings:
  atlas.opsStore@1: { module: bindings/ops-store.ts, resources: [opsDbReadOnly, adminApi] }
runtimeResources: adminApi(化名员工账号鉴权), opsDbReadOnly, atlasApi
```

Python FastAPI 不嵌 SDK（语言边界）；sidecar 经 admin API 行使写路径（applyProposal 等），**绝不直连 main schema**。禁后台执行（设备）：恢复只在用户打开 App 时发生（Restore/ensureOpen）。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| 设备 kv/launcher 注册绑定 | **[G3]/PRD-CR-1** | expo 绑定；CR 前 launcher 保持 Direct（本就只报告 launched） |
| INVALID_TRANSITION 等 = 领域拒绝 | **[G4]/PRD-CR-2** | 失败矩阵闭集码 → 拒绝码一一映射（RFC9457 信封保留） |
| ensureOpen（taskToken）+ cron/deadline | **[G6]** | 客户端生成 token 天然幂等开通；availability/purge 定时先留进程内 cron |
| TaskState/capsule value schema | **[G2]/L2-8** | Pydantic frozen 模型已是 schema 源，导出 JSON Schema 入包 |
| intent-interpret envelope | **[G8]**（隐私 profile=declared context 的既有样板，可反向输入 v0.3 L2） | extra=forbid+fallback 兜底 |
| task-definitions 入包 vs 服务端快照 | **[G1]** | 发布快照经 domain-data key 引用（版本化天然对齐 packageId 钉住） |
| 类型化 RN 客户端 | **[G7]/L2-6** | `app_rn/src/task/models.ts` 手写 parser 先行+契约测试 |

## 12. 迁移路径建议

1. **设备只读接入**：taskState/deviceContext Provider + `atlas.taskrun-state` Projection（TaskHome 的 screen-local useState 外提为 view/watch——报告认定这是最强 DynamicState 候选）；
2. **设备命令入口**：`atlas.taskrun` R 实例承接阶段推进；v2/v3 服务端点保持冻结契约以 remote Tool 调用（AC-1 无状态可重入=天然幂等 Tool）；
3. **备份/恢复整合**：atlas-backup v1 信封扩展携带实例快照（Restore 路径），跨 Flutter/RN 兼容纪律不变；
4. **治理面 sidecar**：`atlas.proposal`/`atlas.taskdef`/`atlas.batch` 承接 ops 长寿命流程（reviewer≠proposer、base_snapshot CAS、audit 同事务原样进 Tool）；
5. **定时语义**：availability/purge/freshness 巡检经 P2 调度器（[G6] 后转持久定时器）；
6. **红线守卫**：HR-1..16 逐条进一致性清单（自动：correction_queue 无读路径依赖检查、evaluate 无 AI import、odbl 隔离；评审：隐私投影不聚合身份）。
