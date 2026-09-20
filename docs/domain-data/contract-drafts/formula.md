# Formula 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/formula` @ v2.4.2（TypeScript：Electron 桌面壳 + pinned Node 22 sidecar（Next 14 standalone）+ worker；`node:sqlite` + 内容寻址 LocalStore；v2.4.0 = SOURCE COMPLETE，Release PASS open）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20
**Date:** 2026-09-20

> 对齐 General Design v0.2 §18 的既有 Formula 映射，并以仓库实况充实。两条仓库宪法级纪律贯穿本草案：
> ① **INV-01/02**：DesignDocumentV2 是唯一设计真源，只经 Command→Transaction→Reducer 变更，Variant = 另一个 Design（derivedFrom）；
> ② **INV-17 裁决文化**：Product Strong 等发布裁决只能由冻结规则引擎（validation-harness）写入——DomainHarness 侧任何 Projection/自动化**不得触碰** RENDERED verdict、CJ manifest、live ledger。
> 绑定边界：领域纯函数在 `src/vnext/**`（hermetic、零 IO），编排在 `web/lib/**`——契约绑定 `src/vnext` 语义，不复制 web 层耦合。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | Project（brief+acceptedDirections）、Design（head_version_id 唯一可变指针，CAS）、DesignVersion（不可变 append-only）、DesignDocumentV2（docHash=sha256 canonical）、Asset（`sha256:<hex>` 内容寻址）、FrozenDesign、CreativeBranch、ModelRun（成本台账）、DesignEpisode、SemanticTemplate（candidate→trusted→retired）、MetricEvent（7 类封闭）、WorkerJob（lease 队列+idempotency_key 唯一）；ValidationSnapshot **caller-held 无服务端持久层（缺口）** |
| B | 长期/可恢复流程 | Design Save 冻结 7 步（validate→asset durable→BEGIN IMMEDIATE→INSERT Version→CAS head→COMMIT）；Worker lease 队列（reclaimExpired→claim→续租→settle，租约失权丢弃迟到结果）；AI Candidate 管线（StructuredIntent→WriteScope→producer→validator→preview→显式 Accept/Reject→baseHash CAS）；Creative Explore（brief→normalize→K=3 directions+CD-04 多样性门→semantic compile→aesthetic layout）；Certification/Export（per-variant validators，fontCoverage 先于 layout，失败短路） |
| C | 领域能力（Tool） | LLM 回合（5 封闭 capability）、图像生成、Design Save/CAS、Freeze、Asset 入库、Worker enqueue、Chromium Render（三元组 hash 确定性）、导出（plain/certified）、Refine/Adapt（expectedVersionId CAS）、MetricEvent append |
| D | 业务 SoR | `.data/formula-designs.db`（node:sqlite，production 禁 :memory:）+ 内容寻址 LocalStore（temp+fsync+原子 rename+读回校验）；legacy `.data/formula.db`（M2 SaaS 车道，刻意分离） |
| E | 每实体组合视图 | **DesignDynamicState**：FormulaDesignV1 投影（semantic+composition+quality+artifacts，`src/vnext/internal-api/projection.ts` 现成）+ 候选会话态（producing/preview/STALE）+ dirty/save/conflict + next_actions；Layers/Semantic/Issues 均为文档纯投影（byte-identical 重建） |
| F | 只是交互/本地状态 | EditorSessionState（selection/hover/tool/viewport/textDraft，内存态、可 prune 重建）、undo 栈（reopen 清零）、面板布局 |
| G | 宿主绑定 | **Electron 桌面**（loopback-only + 每启动 session token INV-14；凭证 safeStorage INV-13）；node:sqlite；fs LocalStore；Chromium 渲染（RENDER_MAX_CONCURRENCY 信号量）；LLM/图像 provider HTTP |
| H | E/R/S 划分 | E：`formula.design`（key=designId，命令入口）、`formula.generation`（E 循环）、`formula.quality`（E 循环）——General Design v0.2 §18 既有映射；生成/质量运行数据进业务 jobs 表（S2），**不为每次生成开 R 实例** |
| I | 命令入口/拒绝路径 | 全部公开命令发 `formula.design`；VERSION_CONFLICT（CAS 失败）、候选 STALE（docHash≠baseHash，无 auto-rebase）、certification 未过 → `rejected(code)`（**[G4]**；现状是 typed 409/错误信封） |
| J | Mutation Ownership | 见 §7；核心：head_version 只经 CAS Tool 前进；AI 只能产出候选，接受是显式人类命令 |
| K | 外部事件/超时 | Worker 租约过期回收（30s/renew 10s）＝崩溃事件入口；LLM wire 冻结重试（仅 network/timeout/429/5xx，deadline 60s）；图像 provider 现为同步 adapter（**无 push 回调，Ingress 缺口**）；Internal API 入站（Bearer+Service-Id） |
| L | 破坏性变更重建 | Design 权威=DesignVersion 链+head 指针（SQLite）；会话态从文档真源重建（既有设计）；Restore 按 {head version, 候选会话业务表, pending jobs} 路由 |

**判定结论：适合（General Design 的头号示例项目）**。Electron+本地 SQLite 形态正是 v0.3 registered/local Tool（G3/PRD-CR-1）的动机场景；仓库已有 lease 队列、CAS、幂等键、内容寻址、封闭 capability 等全部纪律，映射成本低。最大缺口：certification ledger 无服务端持久层、async job 路径未接线、图像生成无回调 Ingress。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `formula.design` | E | designId | drafting→reviewing→approved→exported（+Close） | P2 Provisioner（createDesign 流程 + ensureOpen 懒开通） | 唯一命令入口（GenerateVariant/SelectArtifact/ApproveDesign/ExportDesign/Restore/Close） |
| `formula.generation` | E | designId（同 key，Projection 可选中） | 长期 idle 循环：idle→starting→awaiting→recording→announcing→idle | P2 | 图像/创意生成长耗时作业；jobId 存业务 jobs 表（§9.5 模式） |
| `formula.quality` | E | designId | idle→checking→idle 循环 | P2 | 质量阶梯评估；结果写业务表供审批重校验 |

- v0.1 设想的 ApprovalWorkflow **并入** `formula.design`（General Design v0.2 §18 既有决定：审批只是主流程阶段）。
- AI 结构化编辑（structured.edit）不建实例：候选会话状态（producing/preview/accepted/rejected/STALE）存业务表 `formula.candidate_sessions`（**[G5]** 前不入 workflow data），Accept 命令走 `formula.design`。
- CreativeBranch 决策（choose/reject 单向）保持业务数据 + Direct/命令混合（§7）。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml               # id: formula
├── workflows/
│   ├── design.yaml            # 主流程（下详）
│   ├── generation.yaml        # E 循环（General Design v0.2 §9.5 模板）
│   └── quality.yaml
├── skills/                    # §8：5 个封闭 capability + control intent router
├── tools/ · projections/      # [G9] 逻辑声明见 §3/§6
├── business-sources/          # [G2/L2-8] 见 §4
├── schemas/                   # DesignDocumentV2（封闭 nodeType 词汇 group/text/image/shape）、
│                              #   DesignCommandV2（封闭 kind 集）、DesignTransactionV2（actor/provenance）、
│                              #   DesignCandidateV2{baseHash,operations}、StructuredIntent（A1-01 封闭注册表）、
│                              #   FormulaDesignV1、AcceptedOperationV1/CompletedOperationV1、ValidationSnapshot
├── rules/                     # 治理层：INV-01..17（尤其 WriteScope rule/Hash rule/单 provider 无 fallback/
│                              #   裁决引擎独占 verdict）、W13a producer rulebook（封闭 nodeType+per-nodeType set-prop 白名单）
└── references/                # PRD v2.4.2、STRUCTURED_AI_INTERACTION、PERSISTENCE、AI_EXECUTION
```

`design.yaml` 要点：

```text
init                 只收 Restore{designSnapshot}；按 approvalStatus+head 态势路由：
                       drafting / reviewing / approved / exported / 兜底 drafting
drafting             静止：GenerateVariant → announcing(StartGeneration → formula.generation) → drafting
                     SubmitForReview → reviewing（校验 head 存在质量结果，R3 结构化 outcome）
                     CommitEdit（人类命令事务）/ AcceptCandidate{candidateRef}（baseHash CAS，STALE→rejected）
                     Rename/Brief 类 → 拒绝路径（Direct 写，§7）
reviewing            静止：ApproveDesign → invoking approve_design（事务内重校验质量结果+选中 artifact）
                       outcome=applied → approved · outcome=rejected(quality_not_passed|stale_selection) → reviewing
                     RequestChanges → drafting · GenerateVariant → 同 drafting
approved             静止：ExportDesign{variantKey, mode:plain|certified} → invoking export
                       certified 需 docHash==certification.docHash 且 verdict=CERTIFIED（label 永不信任，只重推导）
                       → announcing → exported(可重复导出，回 approved 保持)
任意静止状态          Close（W5）→ final；全部其它消息 → {S}__reject（W3/R4）
generation.yaml      idle → StartGeneration → starting（invoke start_generation：worker_jobs 登记
                       {jobId, idempotencyKey=wjk:v1:<kind>:<sha256>, deadline}，重复提交返回既有 job）
                     → awaiting（静止）→ JobFinished{jobId}（Ingress/轮询）→ recording
                       invoke record_artifact（事务内核对 jobs：是否当前作业；产物 sha256 入 FrozenAssetStore）
                       outcome=applied → announcing(ArtifactGenerated → formula.quality) → idle
                       outcome=rejected(superseded|stale_callback) → awaiting/idle
                     StartGeneration 在 awaiting 重入 = 新作业取代旧作业（旧 job 标 superseded）
quality.yaml         idle → QualityRequested → checking（invoke validate_artifact：确定性阶梯
                       schema→layout→确定性视觉→OpenCV→(轻 Vision)→LLM Critic 顺序，前层失败短路）
                     → announcing(QualityCompleted{findings,score} → formula.design) → idle
```

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `saveDesignVersion` | idempotent | **project** [G3] | `{designId, transaction, expectedHeadVersionId, commandId}` → CommandResult（7 步冻结序列；CAS 0 行命中=rejected(version_conflict)，绝不 last-write-wins） | expected-head CAS + applied_effects | `formula.designStore@1` / sqlite-runtime-store@1 |
| `startGeneration` | idempotent | project/remote | 生成请求 → `{jobId, created}`（HTTP 只校验+持久 enqueue+返回 id） | `wjk:v1:<kind>:<sha256>` 唯一约束，重复提交返回既有 job（created=false，不重复计费） | `formula.workerStore@1` |
| `recordArtifact` | idempotent | project | `{jobId, artifactBytesRef}` → CommandResult（事务内核对 jobs 表当前作业） | FrozenAssetStore sha256 命中即复用（存储层幂等）+ applied_effects | `formula.assetStore@1` |
| `validateArtifact` | none | script/expression | 质量阶梯确定性层 → `{findings, score, shortCircuit?}`（**零模型调用层优先**；LLM Critic 是 Skill 不是 Tool） | 纯函数 | script-execution@1 |
| `selectArtifact` / `approveDesign` | idempotent | project | `{designId, artifactId?, commandId}` → CommandResult{outcome:applied\|rejected, code}（事务内重校验权威事实，R3） | applied_effects | `formula.designStore@1` |
| `freezeDesign` | idempotent | project | document → FrozenDesign（id=docHash） | 同 hash 重复 freeze 幂等；篡改大声报错 | 同上 |
| `ingestAsset` | idempotent | project | 字节 → `sha256:<hex>`（temp+fsync+rename+读回校验；文档只存引用） | 内容寻址 | `formula.assetStore@1` |
| `renderDesign` | idempotent | script | (documentHash, irHash, htmlHash) → 渲染产物 | 三元组身份，任意两次一致；信号量限流 | script-execution@1 |
| `exportDesign` | idempotent | project/script | `{designId, variantKey, mode, certificationRef?}` → 产物路径（certified：docHash 绑定裁决；override 必须绑定"当前最新" snapshot 且携带 provenance） | 给定 doc+cert 确定 | `formula.designStore@1` |
| `refineInternal` / `adaptInternal` | non-idempotent→idempotent | project | Internal API set-text/set-visibility 等 typed changes → CommandResult | expectedVersionId CAS → rejected(version_conflict) | 同上 |
| `runLLMTurn` | non-idempotent | remote | 5 capability 之一 → 结构化输出（schema 校验在 transport 之上；2xx 畸形=typed invalid-structured-output，wire 恰好一次） | operationId + ModelRun 记账；重试仅 network/timeout/429/5xx | http-transport@1 / resourceKey=llm |
| `appendMetricEvent` | idempotent | project | 7 类封闭事件 | (task_id,event_id) 唯一；同 id 异内容拒绝 | `formula.designStore@1` |

**[现状缺口→契约要求]** ① Certification/ValidationSnapshot 需服务端持久表（否则审批 workflow 不可恢复，caller-held ledger 是硬缺口）；② Internal API render 恒 501（UNSUPPORTED_CAPABILITY）——binding 缺失时 fail-closed 语义与 MISSING_BINDING 一致，不得伪造成功；③ generate/refine/adapt 全同步、`AcceptedOperationV1` 未接线——迁移时以 `formula.generation` E 循环补长作业语义。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `formula.design` | designId | head versionId、docHash、brief、selectedArtifactId、approvalStatus、derivedFrom | designs_v2.updated_at + head seq（单调，B1/B2） | 写入出口=store，变更事件→InvalidationSource |
| `formula.artifacts` | designId | FrozenAsset 摘要[]、variant 目录 | 内容 hash 聚合 | |
| `formula.jobs` | designId | worker_jobs 未完成 {jobId,kind,deadline,status,attempt}[] | 表内 updated_at max | 取代 lease 队列的进度可见性 |
| `formula.certification` | designId | 最新 ValidationSnapshot{frozenDesignHash,variantKey,verdict,override?} | snapshot 内容寻址 id | **需新增持久层** |
| `formula.candidateSessions` | designId | 活跃候选会话 {candidateRef,baseHash,state} | revision | [G5] 前的会话态落点 |

Provider 由 P2 实现（读 `formula-designs.db` 只读连接 + LocalStore 索引），B1–B5 全适用；**不读 legacy `formula.db`**（M2 车道隔离）。

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `llm-capabilities` | 5 封闭 capability（brief.normalize/copy.suggest/creative.direction/design.critique/structured.edit + requiresJsonSchema/requiresVision）——capability 是域侧唯一需求身份，永不携带 provider/model/tier | Skill 声明与预算闸 | FROZEN |
| `budget-matrix` | BudgetMatrix（capability×操作格，零格永不生成，如 ADAPT/LOCAL_EDIT×imageGen=0） | authorizeGenerativeCall | FROZEN |
| `quality-ladder` | 阶梯顺序与短路规则（schema→layout→确定性视觉→OpenCV→轻 Vision→LLM Critic；FONT_COVERAGE_FAILED 先于 layout 失败短路） | formula.quality | FROZEN |
| `certification-policy` | per-variant（FrozenDesign×Target×Locale×Format）validators、revalidate 使旧 override 失效、导出默认仅 CERTIFIED | export/approve 闸 | FROZEN |
| `write-scope-rules` | WriteScope 由 Formula 侧先算、producer 不能设置/加宽；全文档 scope 仅显式用户选择 | structured.edit 候选校验 | FROZEN |
| `node-vocabulary` | 封闭 nodeType 词汇 + per-nodeType set-prop 允许清单（W13a producer rulebook——CJ-03 live UNKNOWN 的修复产物） | 候选 schema 校验 | FROZEN |
| `creative-policy` | K=3、CD-04 成对多样性门（≥2 维度差异）、最多 3 次 LLM attempt、stop stage 词表（analysis/policy/directions/assets） | creative explore 路由 | CONTROLLED |
| `template-governance` | SemanticTemplate 单向状态（candidate→trusted\|rejected；trusted→retired，禁回退） | 模板晋升闸 | CONTROLLED |

**[G1]**：落地前经 `CompiledDomainDataPort` 带外提供；这些常量现散落于 `src/vnext/**` 冻结模块，编译入包即获得 packageId 钉住与版本化（替代"exact-build sha 才有效"的裁决绑定方式）。

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `formula.design-state` | designId | wf design/generation/quality（同 key）+ business design/artifacts/jobs/certification/candidateSessions + domain-data quality-ladder/certification-policy/creative-policy | FormulaDesignV1（semantic/composition/quality/artifacts）+ candidate 会话态 + pending jobs + certification verdict |
| （集合视图） | — | **不走 Projection** | Project→Designs 列表、versions、jobs、FrozenDesigns、Episodes、`/internal/v1/capabilities` 走 P4 读模型 |

信封：`phase`=approvalStatus+生成相位；`availableActions` 复用 Internal API 既有 **typed `next_actions`** 语义（调用方不猜合法转移——与信封 availableActions 完全同构）；`pending`=jobs+候选会话；`lastOutcome`=命令入口 workflow lastResult（R4）。质量面板/Issues/Layers 保持文档纯投影（不进 workflow 依赖）。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Design.head_version_id / DesignVersion 链 | Message → formula.design → saveDesignVersion | Tool | M1（CAS 串行化）、M4 |
| DesignDocumentV2 内容 | 仅经 DesignTransaction（人类命令 或 AcceptCandidate） | Tool | M1；INV-02 |
| AI 候选（DesignCandidateV2） | producer 输出 → 业务表 candidate_sessions（**preview 不落真源**） | Tool/Skill 产物 | AI 无权威：Accept 是显式人类命令（INV-03） |
| Project.brief / acceptedDirections | Direct（store.updateBrief/setAcceptedDirections 既有） | 业务服务 | 无流程依赖（General Design v0.2 §18 Direct 清单） |
| selectedArtifactId / approvalStatus | Message → selectArtifact/approveDesign | Tool | M1、M2（质量检查与审批之间必须不变） |
| FrozenDesign / Asset / 产物文件 | Message → freezeDesign/ingestAsset/recordArtifact | Tool | M2、M4（内容寻址天然幂等） |
| exported 产物 + publish 状态 | Message → exportDesign | Tool | M3（certified 导出是对外承诺） |
| ModelRun 成本台账 / MetricEvent | Tool 副作用记账 | Tool | M4；estimated→billed 只回填 cost 两列 |
| SemanticTemplate.status | Message（治理命令）→ 晋升 Tool | Tool | M2、M4（单向禁回退） |
| WorkerJob 行 | Runtime/jobs 表（迁移期双轨：现 lease 队列，目标由 Runtime mailbox 承接） | Tool/Runtime | M5 |
| 裁决 verdict（Product Strong 等） | **不进本契约**——validation-harness 冻结规则引擎独占 | 规则引擎 | INV-17 红线 |

## 8. Skills / AI 任务（v0.3 Track B）

仓库纪律与 v0.3 PRD 高度一致：capability=需求身份、域内无 provider 路由（INV-06/07/08）、LLM 只 propose/critique 验证确定性（INV-11）、结构化输出 schema 校验在 transport 之上。映射：

| skillId | scope | capability（既有） | output contract | envelope 要点 |
|---|---|---|---|---|
| `brief-normalize` | Domain | brief.normalize | 规范化 brief（zod schema） | 预算闸 authorizeGenerativeCall |
| `creative-direction` | Domain | creative.direction | frozen responseSchema；封闭词汇（CompositionArchetype/PaletteFamily/TypographicHierarchy）；K=3+CD-04 | ≤3 attempts；超预算整体停止并给 stopped-budget/stopped-provider 可解释状态 |
| `copy-suggest` | Domain | copy.suggest | 文案候选（schema） | WriteScope 限定 |
| `design-critique` | Domain | design.critique | findings（不改文档） | produce-result-only；质量阶梯最后层 |
| `structured-edit` | Domain | structured.edit | **DesignCandidateV2{baseHash, operations}**（A1-01 封闭操作注册表；W13a rulebook 约束词汇） | ScopedContext 由 contextCompiler 组装（=declared context only）；STALE 只由 docHash≠baseHash 派生，无 auto-rebase |
| `studio-intent-router`（新增） | **Control** | — | typed Proposed Domain Command（GenerateVariant/SelectArtifact/ApproveDesign/ExportDesign） | propose-only，经 §2 消息契约校验 [G8] |

AI Runtime 边界（repo 已声明 deferred 的 `AIOperation →(StructuredIntent+ScopedContext+budget+requiredCapabilities)→ Candidate(s)`，payload 携带 routing 键即 parse 失败）＝ v0.3 §7.2 的同构物：接入时以 `AIOperationPort` 适配，budget/requiredCapabilities 直接进 AI Operation 的 Execution Policy 字段（**[G8]** 落地前以 capability+zod schema+预算闸兜底）。凭证纪律 INV-13：DomainHarness 侧不得缓存/持久化 provider 凭证（RuntimeResources 注入，用后即弃）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| Worker 作业完成/失败 | `job:{jobId}:finished` | formula.generation | 推进 | 现状轮询 `GET /api/jobs/[id]`；迁移为 worker settle 时投递 |
| Worker 租约过期（崩溃） | `job:{jobId}:lease-expired` | formula.generation | 推进（attempt+1 回队或 rejected） | reclaimExpiredLease 既有语义 → Runtime processing reclaim（I135） |
| 图像 provider 完成 | `img:{operationId}:done` | formula.generation | 推进 | **[现状缺口]** 同步 adapter 无回调；接线后与超时共用 messageId |
| Internal API 入站命令 | `internal:{serviceId}:{requestId}` | formula.design | 推进（Bearer+Service-Id 鉴权在 P2） | 可信系统/Agent 与 Studio 是兄弟适配器，共用命令入口 |
| LLM wire 事件 | —（Skill 内部重试，不进 Ingress） | — | — | 冻结重试语义留在 AI Runtime/execution port 边界内 |

超时/deadline：LLM 单请求 deadline 60s（含完整 body 读取；外部 AbortSignal 是终态）；lease 30s/renew 10s/poll 1s；渲染信号量等待。**[G6]** 前由 P2 调度器扫 `formula.jobs`。Legacy billing webhook 属 M2 车道，不进本契约。

## 10. Target Host Profile 与 capability 需求

```yaml
# host-profiles/formula-electron.yaml —— General Design v0.1 §6 的 FormulaDomainRuntime 示例落地
platform: electron-node            # main/preload 监督 pinned Node 22 sidecar；loopback-only + session token（INV-14）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1, secure-random@1, crypto-hash-sha256@1, compiled-package-module@1]
projectBindings:                   # [G3/PRD-CR-1] —— binding 实现只依赖 src/vnext 纯模块 + store，不触 Runtime 内部
  formula.designStore@1: { module: bindings/design-store.ts,  resources: [designDb] }
  formula.assetStore@1:  { module: bindings/asset-store.ts,   resources: [assetStoreRoot] }
  formula.workerStore@1: { module: bindings/worker-store.ts,  resources: [designDb] }
runtimeResources(resourceKey): designDb(.data/formula-designs.db), assetStoreRoot, llmEndpoint+llmApiKey(safeStorage 解密后临时注入), imageEndpoint, sessionToken
```

CR-1 前的临时方案：sidecar 进程内回环 HTTP（方案 A，Electron loopback 已有 session token 机制，成本低）或业务写暂 Direct（方案 B，仅 title/brief 类）。**双车道警戒**：binding 只接 `formula-designs.db`/LocalStore，legacy `formula.db`（M2 SaaS：projects/entries/brands/billing）不进契约。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| designStore/assetStore/workerStore 本地写 | **[G3]/PRD-CR-1** | 方案 A 回环（session token 已具备） |
| CAS 冲突/STALE/质量不过 = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4 拒绝路径 + lastOutcome（现有 typed 409 直接映射拒绝码） |
| 候选会话态（baseHash/preview/scope） | **[G5]** Process Data | S2：candidate_sessions 业务表 |
| ensureOpen + job/lease deadline | **[G6]** | 先查后开 + P2 调度器扫 jobs；租约回收→processing reclaim |
| typed next_actions → 生成客户端 | **[G7]/L2-6** | Internal API 已 contract-first 单一契约源→多投影（registry→JSON Schema/OpenAPI/SDK/Tool Catalog/MCP），是 G7 的最佳实践参照；先复用其生成链 |
| AI Operation envelope/budget/replay | **[G8]** | capability+zod+BudgetMatrix 兜底；committed 候选结果入 journal 防重复计费 |
| capability/budget/ladder 常量入包 | **[G1]** | CompiledDomainDataPort 带外 + packageId 钉住 |
| 业务源 value schema | **[G2]/L2-8** | schemas/ 先行入包供消息校验 |

## 12. 迁移路径建议

1. **只读接入**：`projectFormulaDesignV1` 现成投影 → `formula.design-state` Projection；Studio 面板切 view/watch（Layers/Issues 保持文档纯投影不动）；
2. **持久化补缺**：ValidationSnapshot 服务端持久表（审批可恢复的前提）；candidate_sessions 表；
3. **命令入口**：`formula.design` 承接 Save/Accept/Select/Approve/Export；现有 HTTP save/restore/export 路由改经 P2 facade（CAS 语义原样进 Tool）；
4. **生成/质量 E 循环**：worker_jobs 语义移交 Runtime（mailbox+journal），lease/reclaim 纪律由 effect journal 承接；图像 provider 接回调 Ingress；
5. **AI Scoped 化**：5 capability → §8 Skills；structured.edit 候选管线整体映射 v0.3 Domain AI canonical flow（propose→validate→preview→人类 Accept→CAS commit 与 PRD §10 逐步对应）；
6. **裁决红线**：validation-harness（CJ/live ledger/verdict）保持独立，不进包、不进 Projection——在 §22 一致性清单中加自动检查。
