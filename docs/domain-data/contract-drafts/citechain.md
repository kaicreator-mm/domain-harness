# Citechain 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/citechain` @ v0.3.0（**TypeScript-first**：`packages/*` 纯 TS 零 native 依赖 + 最小 Rust Trust Kernel `crates/citechain-kernel`（~630 行）+ Tauri 2 桌面壳 + SvelteKit 前端；Implementation Complete / Release Qualification BLOCKED——仅 Linux 桌面构建 tuple NOT_RUN）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（单 commit `677a03f`）
**Date:** 2026-09-20

> 事实修正：v0.3.0 是 Architecture Rebaseline，业务逻辑 100% 在纯 TS 包中（domain/application/harness/projection/projection-sqlite/providers/testing 零 Tauri 零 native，测试直接跑 `node:sqlite`）；Rust 只保留 Trust Kernel。**真正的宿主缺口不是"Rust/Tauri"，而是 Trust Kernel 的三条类型级保证**：`Confirmed<T>` 不可 Deserialize 伪造（compile_fail doctest）、canonical 写盘原子性（write_atomic tmp+rename+fsync + append 时 validate + owner-scope）、hard_gate 不变量不可绕过（TS/Rust 双重校验）。
>
> 硬边界（CLAUDE.md）：canonical truth 数据库无关；projection 可删可重建；**LLM 输出未经 Kernel 人工确认不得成为 confirmed truth**；hard_gate usage 必须 pin snapshot+provenance；impact 边只允许显式 lineage 或确定性派生。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | KnowledgeTask（phase: intent→preparing→creating→reviewing→delivered，append+latest-wins）、Segment、KnowledgeUsage（context/hard_gate 双模式；hard_gate 必须 snapshotRef+provenanceRef 缺失即拒）、Deliverable（delivered 标志）、Lineage（隐式=usage 绑定；显式=LinkRecord append-only）、KnowledgeTaskHarness（内建声明式常量 explainer/structured-comparison；**v0.3 无独立 ValidationRule 实体**——规则=harness.knowledgeRequirements+validateHarness）、CanonicalTruthRecord{kind,value,confirmedAtMs}（内容寻址 append-only 文件日志）、CanonicalSnapshot（fingerprint=全记录序列化排序 sha256，语义指纹） |
| B | 长期/可恢复流程 | 任务相位状态机（冻结转移表；reviewing 可回退 creating；delivered 终态）；deliver 子流程（归属+相位校验→snapshot→harness.validate+deliveryGate→有 error 即拒，HV-13 空 findings 无法绕过→commit）；validateHarness 纯函数（required inputs+按 mode 的 usage 计数≥minItems，latest-wins）；影响分析 findAffectedDeliverables（usage JOIN deliverable）；启动恢复=从 canonical 全量重建 projection；**修订闭环缺失**（delivered 无 reopen——知识变更→交付物修订只有反查没有流程，DomainHarness 可补的最大空白） |
| C | 领域能力（Tool） | commit_task/segment/deliverable、append_link、record_knowledge_usage（均需 HumanConfirmation{actor}；内容级幂等）、read_canonical_snapshot、import_legacy_collection（幂等：固定 ts=0+内容寻址→fingerprint 不变 HV-11）、projector.rebuild（确定性幂等，HV-05/10 删库重建等价、三 adapter 等价）、validateHarness（纯）、providers resolve/assist（外部；**AI client 结构上无 commit 路径**，HV-08 provider 失败/畸形响应不产生 truth） |
| D | 业务 SoR | Canonical Truth bundle（`truth-v3/records/<sha256>.json` append-only 文件日志，schema manifest 不符→read_only fail-closed）+ Projection DB（SQLite/PG/内存三 adapter 过同一 contract suite） |
| E | 每实体组合视图 | **TaskWorkbenchView(taskId)** = {task, harness, usages, deliverables, links, latestFindings, impact refs, phase-allowed actions}（现为 Svelte 组件内拼装——最直接 Projection 候选）；Impact 反查表；LinkCenter 列表；无图形化血缘图 |
| F | 只是交互/本地状态 | 六工作区导航（Home/Prepare/Create/Review/Impact/LinkCenter）、actor 输入（localStorage 自由文本——无认证）、busy/error |
| G | 宿主绑定 | Tauri 2 桌面（KernelPort=Tauri invoke 桥）；纯 TS 栈可直接跑 Node（node:sqlite/pg 已验证）；需要：durable 文件 append 存储（或等价）、投影 DB、可信 actor（人工确认边界）、出站 HTTP（provider/AI JSON transport 仅要求 post()） |
| H | E/R/S 划分 | E：`citechain.task`（key=taskId）；**E（新增）：`citechain.deliverable`**（key=deliverableId，修订生命周期 delivered→stale→revising→delivered，补 C3 缺口）；无 S；kernel owner-scope 检查（跨 task usage 拒绝）即 Scope 语义 |
| I | 命令入口/拒绝路径 | 任务命令发 `citechain.task`；非法相位转移/hard_gate 缺 pin/跨 task usage → `rejected(code)`（现状 throw→UI error，映射拒绝码）；deliver 校验失败=rejected 非 failed |
| J | Mutation Ownership | 见 §7；全部 canonical 写经 Kernel 命令（HumanConfirmation actor 从 session 取，不可客户端自报） |
| K | 外部事件/超时 | v0.3 现役**零主动事件源**（知识变更=人工触发 Impact 查询）；legacy v0.2 monitor 设计是强 Ingress 候选（重抓→hash 未变只更新 fetched_at 不落快照不调 LLM=成本闸；变了→新快照+LLM ChangeGrade 三级→triage 优先级：命中被引 claim 最高、沿引用链反查、cosmetic 不通知；ADR-0009"监测是缓存失效机制不是商品"）；无异步验证故无 timeout 语义 |
| L | 破坏性变更重建 | canonical=append-only 内容寻址（天然可重放）；projection 全量 rebuild（可删可重建是硬边界）；schema fail-closed read_only 保护未来版本 |

**判定结论：适合（概念契合度高）**。append-only durable truth≈durable message log、`stage=f(objects)`（legacy 纯函数阶段推导）/Projector≈Projection→DynamicState、Harness≈Skill 声明、KernelPort 命令≈Domain Tool（hash 级幂等）。主要工程量：**Kernel 信任边界宿主化**（§11）与**修订 Workflow 补全**，而非领域模型本身。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `citechain.task` | E | taskId | intent→preparing→creating→reviewing→delivered（reviewing 可回退 creating；delivered 后 Close） | P2（任务创建 + ensureOpen） | 命令入口：AdvancePhase/SaveSegments/Deliver/RecordUsage/AppendLink |
| `citechain.deliverable` | E（**新增，补修订闭环**） | deliverableId | delivered→stale（KnowledgeChanged 命中 impact）→revising→delivered(v+1)→… | P2（Impact 命中时开通/唤醒） | 修订流程载体；stale 标记由 Ingress 确定性派生（显式 lineage 或 usage JOIN——不猜测） |

- legacy 导入（import_legacy_collection）是一次性命令，不建实例；v0.2 monitor 若复活，watch 循环留 P2 Ingress（成本闸语义：hash 未变零 LLM 零快照），**不建 watch 实例**。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml                # id: citechain
├── workflows/task.yaml · deliverable.yaml
├── skills/                     # §8：assist（现状）+ legacy cc-propose 契约族（outline/recall/source-candidate/change-grade）
├── tools/ · projections/       # [G9] 见 §3/§6
├── business-sources/           # [G2] 见 §4
├── schemas/                    # KnowledgeTask/Segment/KnowledgeUsage（mode+pin 必填规则）/Deliverable/
│                               #   LinkRecord{relation,targetKind∈闭集,targetRef}/ValidationFinding{code,
│                               #   severity,message,subjectRef}/CanonicalTruthRecord/Harness 声明形状
├── rules/                      # 治理层：ADR-0003（LLM 只提议，人只在三处决定：确认来源/裁决矛盾/决定发布；
│                               #   否决 LLM 判定循环退出条件）、hard_gate pin 不变量、owner-scope、
│                               #   impact 边只允许显式 lineage 或确定性派生、latest-wins by confirmedAtMs
└── references/                 # ADR 12 条（0001 db=index(files)、0008 preflight warns never blocks、
                                #   0010 privacy-boundary-is-a-type、0012 metering-per-artifact…）
```

`task.yaml` 要点：

```text
init              只收 Restore{taskSnapshot}；按 phase 路由五静止状态；兜底 intent
intent/preparing/creating/reviewing/delivered(=Close 前静止)
  AdvancePhase{target,commandId} → invoking commit_task（Kernel 校验冻结转移表+HumanConfirmation{actor 取自
    session}）→ outcome=applied → announcing → 目标相位 · outcome=rejected(illegal_transition|cross_task_usage|
    hard_gate_unpinned) → 原相位（R4）
  SaveSegments（creating）/ RecordUsage / AppendLink → invoking 对应 commit Tool → 原相位
  Deliver（仅 reviewing）→ delivering：invoke deliver_gate（归属+snapshot+harness.validate+deliveryGate.
    validateDelivery——**校验器必须实装**，见 §11 缺口）→ 有 error→rejected(findings) 回 reviewing ·
    全过→commit deliverable(delivered:true)+commit task(delivered) → announcing → delivered
deliverable.yaml（新增）：
init→Restore→delivered（静止）
  KnowledgeChanged(Ingress：providerId+knowledgeRef+fromHash+toHash+grade) → 若 impact 命中（findAffected
    Deliverables 确定性派生）→ invoking mark_stale（append stale 记录+lineage 边）→ stale（静止）
  ReviseRequested（人工）→ revising（关联新/原 task 的 creating 相位工作）→ ReDelivered → delivering → delivered
  未命中的 KnowledgeChanged → 仅失效（不进实例）
```

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `commitTask` / `commitSegment` / `commitDeliverable` / `appendLink` / `recordKnowledgeUsage` | idempotent（内容级） | **project** [G3]（Kernel 桥） | record+HumanConfirmation{actor} → CommandResult（kernel validate+owner-scope+hard_gate pin 校验；R3 结构化 outcome） | 同记录+同 actor+同 confirmedAtMs→同 hash→跳过写；重复调用产生新记录 latest-wins 收敛 | `citechain.kernel@1` |
| `readCanonicalSnapshot` | none | project | → CanonicalSnapshot{fingerprint, records} | 纯读 | 同上 |
| `importLegacyCollection` | idempotent | project | v0.2 canonical（只读源，忽略 .index）→ 批量 append | 固定 confirm_at(...,0)+内容寻址→重复导入 fingerprint 不变（HV-11） | 同上 |
| `rebuildProjection` | idempotent（派生写） | project | snapshot → projection 全量 reset+按 confirmedAtMs 重放 | 确定性（HV-05/10 删库重建等价） | `citechain.projectionDb@1` |
| `validateHarness` | none | expression/script | (harness, task, snapshot) → ValidationFinding[] | 纯函数 | expression-jsonata@1 |
| `findAffectedDeliverables` | none | project | (providerId, knowledgeRef) → 反查表 | 纯读（usage JOIN deliverable） | `citechain.projectionDb@1` |
| `resolveKnowledge`（provider） | none | remote | POST /knowledge/resolve（CompositeKnowledgeProvider allSettled 降级聚合） | 只读 | http-transport@1 |
| `assistAI` | none | remote | POST /operations → string（现状）/**结构化提案（目标，§8）** | **结构上无 commit 路径**（HV-08：失败/畸形响应不产生 truth） | resourceKey=aiAssist |

**[现状缺口→契约要求]** `DeliveryGate.validateDelivery()` 是空壳（恒返回 []）——PRD §6 要求确定性 license/usage gates（legacy LicenseGate：商用覆盖/到期日 vs 下架日/平台覆盖，全系统唯一可拦截检查，未迁移）。接入 DomainHarness 前必须实装，否则 deliver 闸形同虚设（冻结语义与实现的已知差距）。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `citechain.task` | taskId | task 记录（latest-wins）+phase | confirmedAtMs max | 读经 projection（可重建） |
| `citechain.usages` | taskId | KnowledgeUsage[]（mode/pin/knowledgeRef） | max confirmedAtMs | hard_gate pin 完整性在此可见 |
| `citechain.deliverables` | taskId（或 deliverableId） | deliverable[]+delivered 标志+stale 记录 | 同上 | |
| `citechain.links` | taskId | LinkRecord[] | 同上 | append-only |
| `citechain.snapshotMeta` | singleton | canonical fingerprint+record 计数+schema manifest 状态（read_only?） | fingerprint | fail-closed 态势进投影 |

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `harnesses` | 内建 Harness 声明（explainer/structured-comparison：inputFields/knowledgeRequirements/steps/generationGuidance）——新增 Harness=加一个常量，与 Skill 声明天然同构 | Prepare/Create 引导 + Review 验证（同一 Harness 双用） | CONTROLLED |
| `phase-transitions` | 任务相位冻结转移表 | commitTask 校验与拒绝码 | FROZEN |
| `usage-modes` | context/hard_gate 语义 + pin 必填规则 | recordKnowledgeUsage 闸 | FROZEN |
| `lineage-policy` | impact 边=显式 lineage 或确定性派生（禁猜测）；HumanRelation vs DerivedRelation 分离（ADR-0002） | deliverable stale 判定 | FROZEN |
| `change-grades`（若 monitor 复活） | cosmetic/substantive/… 三级 + NoticePriority 路由（被引 claim 命中最高；cosmetic 不通知） | Ingress triage | CONTROLLED |

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `citechain.task-workbench` | taskId | wf task + business task/usages/deliverables/links + domain-data harnesses/usage-modes | 信封 + body{task, harness, usages, deliverables, links, latestFindings（validateHarness 结果）, phaseAllowedActions}——组件拼装的现有一站式聚合外提 |
| `citechain.deliverable-state` | deliverableId | wf deliverable + business deliverables/usages + domain-data lineage-policy | stale/revise 态势、impact 来源（providerId+knowledgeRef+grade） |

Impact 反查（跨 deliverable 集合）与 LinkCenter 列表**不走 Projection**（集合视图走 P4 读模型=ProjectionStore 查询面 + contract suite）。血缘图形化是 UI 增量，数据面已足。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| KnowledgeTask.phase / Segment / Deliverable.delivered / LinkRecord / KnowledgeUsage | Message → citechain.task(.deliverable) → Kernel commit Tool | Tool（HumanConfirmation actor 取 session） | M2、M4（append-only 证据链+owner-scope） |
| Canonical truth 文件日志 | **仅** Kernel（write_atomic+validate+schema fail-closed） | Kernel | M4（信任边界，不可旁路） |
| Projection DB | rebuild/upsert（派生，可删可重建） | Tool/Runtime | 派生非权威 |
| stale 标记 | Message(Ingress) → mark_stale | Tool | M2（修订流程推进） |
| actor 身份 | session（**不可客户端自报**） | 宿主 | 审计问责链前提 |
| v0.2 导入 | 一次性命令 → importLegacyCollection | Tool | M4（幂等 fingerprint） |

## 8. Skills / AI 任务（v0.3 Track B）

现役 AI 面薄（assist 纯文本无 schema）；**legacy cc-propose 契约族是更完整的 Skill 素材**（Proposed<T> 类型化人机边界、ProposalSite 封闭 7 位置、cost/quota/byo、ChangeGrade）。按 v0.3 收编：

| skillId | scope | 触发点 | output contract | envelope 要点 |
|---|---|---|---|---|
| `assist`（现状保留） | Domain | Create/Review 辅助 | string（advisory；chat 不是导航或权威状态转移机制——PRD §5） | produce-result-only；无 commit 路径（HV-08 结构性保证） |
| `outline-proposal`（legacy 契约复活） | Domain | preparing | OutlineScheme{questions[], strategy}（Proposed<T>） | 人在三处决定之一：确认来源 |
| `recall-sources` | Domain | preparing/creating | RecallHit[]{coverage} | 引用只进 usage 候选 |
| `source-candidate` | Domain | monitor 变更分析 | SourceCandidate{tier_guess, fetched hash} | tier_guess 是可被人推翻的提议，不污染事实层 |
| `change-grade` | Domain | KnowledgeChanged Ingress | ChangeGrade 三级 | 定级→收件箱优先级；否决"LLM 互审"与"虚拟专家人格"（既有 ADR） |
| `workbench-intent-router`（新增） | **Control** | 自然语言入口 | typed Proposed Domain Command（AdvancePhase/Deliver/Revise…） | propose-only [G8]；**LLM 输出未经 Kernel 人工确认不得成为 confirmed truth**（=v0.3 §14 人工闸的既有形态） |

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| KnowledgeChanged（monitor 复活后） | `kc:{providerId}:{knowledgeRef}:{toHash}` | citechain.deliverable（命中者） | 推进（mark_stale）；未命中仅失效 | 成本闸：hash 未变零 LLM 零快照；单来源失败降级不中断整轮 |
| 人工修订裁决 | `revise:{deliverableId}:{actor决策id}` | citechain.deliverable | 推进 | |
| legacy 导入完成 | `import:{collectionFingerprint}` | —（一次性） | 失效+rebuild | 幂等 HV-11 |
| 超时 | **无**（验证是同步纯函数；无异步 provider） | — | — | 引入异步 resolve 才需要；不预建 |

## 10. Target Host Profile 与 capability 需求

```yaml
platform: node-desktop             # Tauri 壳 + Node sidecar（formula Electron 模式同款）；
                                   #   纯 TS 包零改动可跑（node:sqlite 已验证）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1,
               secure-random@1, crypto-hash-sha256@1]
projectBindings:                   # [G3/PRD-CR-1]
  citechain.kernel@1:      { module: bindings/kernel-bridge.ts, resources: [truthStorePath] }
  citechain.projectionDb@1:{ module: bindings/projection-db.ts,  resources: [projectionDb] }
runtimeResources: truthStorePath(canonical 文件日志), projectionDb(node:sqlite|pg), aiAssist, knowledgeProviders, actorSession
```

**Kernel 信任边界三选一（owner 决策，§11 J 级风险）**：
- **A（推荐）**：Rust kernel 保留为 sidecar 进程，binding 经 RPC——保住 `Confirmed<T>` 不可伪造与 write_atomic 的类型级/系统级保证；
- **B**：TS 重实现（InMemoryKernelPort 路线已证明接口可替换），但把"结构性拒绝非法状态"降级为运行时约定——必须补：content-hash 校验+加载时重验证（read_snapshot 做法可移植）+contract suite 全量过；
- **C**：混合——canonical 写盘/hash 链留 Rust，投影与编排全 TS。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| Kernel commit 命令 → Tool | **[G3]/PRD-CR-1** | binding 桥（方案 A 的 RPC 或 Tauri invoke 转发） |
| 非法转移/hard_gate 缺 pin/跨 task = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；kernel throw 映射拒绝码 |
| 修订闭环（stale→revising→delivered） | 本草案新增（仓库 C3 缺口） | `citechain.deliverable` E 实例；impact 判定保持确定性派生 |
| DeliveryGate 实装 | 仓库缺口（空壳） | legacy LicenseGate 迁移为确定性 validator（PRD §6 冻结语义要求） |
| ensureOpen（task/deliverable） | **[G6]** | 先查后开（kernel owner-scope 校验兜底） |
| Harness/转移表入包 | **[G1]** | 常量声明数据化入 domain-data |
| usage/task value schema | **[G2]/L2-8** | domain 包类型（88 行纯 TS）导出 JSON Schema |
| Skill 结构化输出（assist 升级） | **[G8]** | legacy Proposed<T> 契约作 outputSchema 蓝本 |
| 全量 rebuild 性能 | 仓库已知债务 | Runtime 增量 Projection 是明确改进点（projection upsert 已幂等，可增量） |

## 12. 迁移路径建议

1. **只读接入**：task/usages/deliverables/links Provider + `citechain.task-workbench` Projection（Svelte 组件的一站式聚合外提为 view/watch；三 adapter contract suite 复用为 Provider 测试）；
2. **命令入口**：`citechain.task` 承接相位推进与 commit 族（KernelPort 六端口签名不动，application 层改调 P2 facade——仓库报告认定的最核心直接编辑候选，108 行单文件）；
3. **修订闭环**：`citechain.deliverable` + KnowledgeChanged Ingress（monitor 按 legacy 契约复活，成本闸纪律保留）；
4. **DeliveryGate 实装**：LicenseGate 迁移（唯一可拦截检查，先于 workflow 化——否则 deliver 闸空转）；
5. **AI Scoped 化**：assist 保持 advisory；outline/recall/source-candidate/change-grade 按 legacy 契约收编为 Skill；
6. **信任边界决策**：§10 三选一由 owner 定案后，binding 层落地；hidden validation 与 exact-SHA 验证纪律（issue #15 candidate pin）全程保留。
