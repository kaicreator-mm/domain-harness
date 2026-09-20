# Audio Platform 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/audio-platform` @ v1.6.0 "Standalone Audio Capability Baseline"（Python：FastAPI ops-api + 可选 DB-polling worker + React ops-web；SQLite 默认/PG 可选，Alembic 0001–0021；本地验证 978 pytest + 63 vitest passed——**均为仓库文档自述，浅克隆未复验**）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（单 commit `56ba4fd`）
**Date:** 2026-09-20

> **切边结论（本契约最重要的一条）**：仓库已有两条接受的架构决策与"长寿命 workflow 引擎"正面相抵——**ADR-0005**（长寿命业务态放 DB，workflow 引擎只跑机器尺度短阶段；明确否定"三个月的 SongProductionWorkflow"；"a signal must have a workflow to be delivered to"）与 **ADR-0028**（禁止新 internal-app job 启动 Temporal）。因此 DomainHarness 在此的正确定位是：**机器尺度短阶段 Run + 已冻结契约（AudioOperation/ActionPlan/DecisionPacket/OperationEvidence）的持久化与接线 + StageEvent/EventOutbox 的落地承接**——不是把制作流程包成长寿命实例。若 owner 想要更强的 workflow 语义，**必须先写新 ADR 显式取舍**。
>
> 其余硬门：`audio-harness` 契约冻结（ADR-0033："改任何冻结词汇/载荷字段/生命周期边/schema 身份 = CONTRACTS_VERSION bump + 新 ADR，never a refactor"；四个契约测试是其可执行形式）；`audio-harness` **零第三方依赖**（stdlib only——SDK 不得向该层注入运行时依赖）；机械架构门禁（facade 公开表面只减不增、新文件禁依赖 facade、平台层禁音乐词汇、OpenAPI drift 门）——**SDK 接入只能落在 `packages/` 新包或 `apps/` 组合根**。
>
> **双真相源警戒（最大迁移陷阱）**：真正在跑的是 `verticals/burmese-music` 的 LibraryService(2360 行)+Repository(3275 行)+jobs 表；`packages/audio-production` 只有冻结契约与测试、**零 app 接线**。只映射前者会把兼容期 facade 当目标架构，只映射后者会得到"没人跑的领域模型"——本契约以 audio-production 契约为**目标形态**、以 burmese-music+jobs 为**现状权威**，逐条标注。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | Asset（内容寻址 `asset_<hash[:32]>`，对象键 `assets/sha256/<2>/<64>`，**无 updated_at 写后不改**；is_canonical 强制 48kHz）、TrackVersion（lifecycle draft\|final，finalize CAS；**刻意没有** production_status/fingerprint_id/parent_version_id/source_operation_id——lineage 唯一真相=operation graph）、TransformOperation（**单输出不变量**：provider 返回 3 候选=3 operation 共享 1 ExecutionRecord；确定性 id `operation_{job_id}[_{index}]`=幂等关键）、Activity（不产版本）、LineageGraph（派生；拒绝一 version 双 operation 产出；CycleDetected；roots 含零输入生成）、Evidence（apx.evidence/v1 双 hash 重验；EvidenceRequirement 三元组精确匹配；run_ref 过 durable_reference() 禁 query/fragment/绝对路径；MissingEvidence）、OperationEvidence（七段顺序冻结；outcome 五值；harness_snapshot_id 必填=生产只跑 pinned snapshot；**仅 DTO 无表**——"map onto existing Evidence/read-model infrastructure without a second event store"）、Song（**"holds a pointer, not a status"**：active_version_id+revision 乐观锁，select_version CAS）、UploadSession（五态+revision CAS+2GiB 上限+X-Upload-Token 操作员绑定）、Job（**"Jobs are execution mechanics; AudioOperation carries product semantics"**；idempotency_key UNIQUE+payload_hash+attempt/max+correlation_id+cancel_requested+heartbeat_at）、Harness 注册族（Package/Version/Alias/Primitive/ResolvedPrimitive/Snapshot+alias audit） |
| B | 长期/可恢复流程 | **每步一个 durable job 而非长实例**：job kinds（analysis.version/voice.generate/audio.canonicalize/library.scan/harness.replay）+队列/重试预算；TRANSITIONS（created→queued→running→{queued(租约过期重排),succeeded,failed,cancelled}；failed→queued；终态无出边；禁"cancelled running 发布 success"）；原子 claim（UPDATE WHERE state='queued'+attempt+1+heartbeat，rowcount≠1→None）；双执行体（API 内 ThreadPool(4) + DB polling worker）经 claim CAS 安全共存**无 Redis/RQ**；崩溃恢复 reconcile_jobs(lease 1200s)：预算内→queued+worker_lost、预算尽→failed；取消=**durable cancel_requested 标志**（"立即发布取消会允许仍在跑的 handler 之后写成功结果"），handler checkpoint 观察，finish_job 终态提交前再查并抹掉 result；重试分层：retry_job 仅 failed 且预算内；recover_analysis 仅非计费类；**付费副作用 fail-closed**（provider_outcome_unknown→allowed=False"provider side effect may exist"任何路径不自动重试）；进度投影 best-effort（"A projection outage must never fail durable work"，DB 永远赢）。跨天人工流程=PerformanceOrder 状态机（not_requested→preparing→{queued,rejected}→recorded→{accepted,rejected}；CAS expected_revision）+PerformerTask；**人工决策不可绕过**（require_decision() 未决无 fallback——"An API must not make violating its own invariant the easy path"，ADR-0008 机器建议人决定）。Replay=治理级重放（同一 canonical case set 在 baseline/candidate 两个 pinned snapshot 重跑唯一 evaluator 只 diff decision；构造上 DRY RUN：verify_pinned_snapshot 按 snapshot_id+content hash 重载，alias 移动/新编译/篡改无法偷换；报告=(pins,snapshot,cases) 纯函数**不含 wall-clock 两次运行字节相同**；崩溃重试"writes byte-identical bytes over the SAME report file—never a duplicate"） |
| C | 领域能力（Tool） | **Capability Registry 是唯一工具调用面**：AudioCapability{capability_id,category(probe/decode/measure/analyze/transform/model),provider,provider_version,license_expression,input/output_types,parameter_schema,deterministic,destructive,preview_supported,availability,detail}；execute() 未注册→CapabilityNotRegistered、availability≠AVAILABLE→CapabilityUnavailable **fail-closed**、参数过 stdlib-only JSON-Schema 小子集（未知字段放行供 provider 独立演进）；register() 同 id 异定义 fail-loud；目录=FFmpeg/Scientific/NoiseReduce/TorchAudio/ModelCompatibility；**Pedalboard(GPL-3.0)/Essentia(AGPL-3.0) 故意不注册 NOT_ADOPTED**；边界："audio-production never imports third-party DSP/ML directly"、"LLMs may select only registered capabilities; they cannot invent provider calls" |
| D | 业务 SoR | **单一 SQLite 主库即全部真相**（ADR-0034 "Job state in the database is authoritative"；"Missing background infrastructure cannot erase business truth because there is no separate queue authority"）；字节在本地 fs 或可选 S3（bucket 策略：INGESTION non-versioned ttl 3600 / PRIMARY versioned / ARTIFACTS versioned 与音频字节物理隔离 / TRAINING_POOL"consent tiers cannot be enforced by a column"）；PG 可选后端 |
| E | 每实体组合视图 | **Harness Workbench**（package 卡片：三 alias 指针当前位置+depends_on；四态渲染；"Registry rows and JSON payloads never appear as the primary experience"）；`harnessWorkbenchModel.ts` 纯函数投影层（aliasPointers 未设置显式出现 set:false、groupPrimitives kind→authority、provenanceSummary standardRefs=HARD 权威骨干、diffPrimitives 比较 7 个领域字段——"a revision shows up as meaning, not as a hash"）；服务端读模型现成（version_rows_with_assets 3 次批量查询出整张 version 图，"Read models may denormalize for display but never decide domain policy"；harness_read_models 三视图；keyset 分页 (created_at,id)）；**PRD §9 goal-first 八步流程前端尚无页面**（选目标→探测源→预计算上下文→Harness 生成表单→planner 出类型化 plan→预览/审批高风险步→executor 跑注册 capability→前后测量对比→保存 DecisionPacket+evidence） |
| F | 只是交互/本地状态 | ops-web 导航/表单态；FormRenderer 15 widget 闭集渲染 |
| G | 宿主绑定 | Python FastAPI（**语言缺口**：Node sidecar 模式）；组合根 AppContainer 唯一命名具体 store（startup **不建表**"Schema ownership belongs exclusively to Alembic"；health/metrics 从 durable 态派生，未迁移库返回 None 不伪造 0）；CORS 单 origin 校验；统一错误信封+X-Correlation-ID 注入防护+no-store；鉴权 TokenVerifier+require_roles(viewer/operator/reviewer/admin)；写操作要 Idempotency-Key；上传加 X-Upload-Token+操作员归属 hmac compare；environment=internal 禁 dev_token；PATH 需 ffmpeg/ffprobe（shutil.which）；可选 Python 科学栈全 lazy import |
| H | E/R/S 划分 | R：`audio.operation`（key=operationId——AudioOperation 契约的持久化载体，机器尺度短生命）；E：`audio.performance-order`（key=orderId，三天级人工流程，**业务态仍在 PG 表**，workflow 只跑短阶段信号投递——ADR-0005 Option B 原样）；E：`audio.upload`（key=uploadSessionId，摄入→QC 触发："performer 上传落地→启动 VocalQCWorkflow"正是 ADR-0005 点名的信号场景）；**不建**：Song/Version（指针+图，无流程）、长寿命制作流程（ADR 禁止） |
| I | 命令入口/拒绝路径 | 命令发对应 R/E 实例；capability 未注册/不可用→rejected(capability_unavailable)（fail-closed 既有）；plan.operation_id 不匹配/approval 缺失→rejected；pin 校验失败→rejected(snapshot_pin_invalid) **且不写报告** |
| J | Mutation Ownership | 见 §7；jobs=执行机制、AudioOperation=产品语义的双层纪律保留 |
| K | 外部事件/超时 | **零 push ingress**（grep webhook/callback 零命中——全靠 DB 轮询+心跳租约+同步阻塞轮询 provider）；最高价值 Ingress 化：MiniMax `_poll_gmi` 把外部异步作业变成 worker 线程阻塞轮询（deadline 120s 循环）——durable message+callback 的教科书场景；心跳租约过期（1200s）=纯超时事件；StageEvent/EventOutbox **契约现成未接线**（CLI 自报 "short-stage workflow: READY (outbox + idempotency seam)"）；上传会话完成/过期（惰性检测+sweep）；alias 移动审计链（append-only 可作事件源）；人工决策族（CAS+审计） |
| L | 破坏性变更重建 | jobs DB 权威+reconcile 恢复；lineage 从 operation graph 浮现（无冗余列）；Harness snapshot 内容寻址+pin 重载；replay 报告纯函数可重算 |

**判定结论：部分适合（切边后适合）**。自建 Harness 与 SDK 契约**同构度极高**（§5 对照表），迁移难度分层明确（报告 I6）；但长寿命 workflow 立场与 SDK 相反（ADR-0005/0028），本契约严格把实例限定为机器尺度短阶段+三天级人工流程信号投递。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `audio.operation` | R | operationId | draft→planned→running→succeeded/failed/cancelled（AudioOperation 契约状态） | P2/命令（goal-first 流程起点） | **补契约的持久化与接线**（现状无表无路由无 worker）；单 operation=机器尺度（canonicalise→separate→analyse→fingerprint 短阶段链） |
| `audio.performance-order` | E | performanceOrderId | not_requested→preparing→{queued,rejected}→recorded→{accepted,rejected}（三天级） | P2（订单创建） | 业务态在 PG 表（CAS expected_revision 保留）；workflow 承载短阶段信号（"a signal must have a workflow to be delivered to"） |
| `audio.upload` | E | uploadSessionId | created→uploading→completed→imported/expired | P2（上传会话创建） | completed→触发 VocalQC 短阶段链（ADR-0005 点名场景） |

- **不建实例**：Song/TrackVersion/Asset（指针+内容寻址图，无推进语义）；Harness 治理（alias 移动/lifecycle 过渡=Direct CAS+审计，既有）；replay（job 化既有，保持 `harness.replay` job kind + 报告幂等）。
- 制作流程（PRD §9 八步）= `audio.operation` R 实例的相位序列 + 人工审批点（requires_approval），**不是**跨周实例。

## 2. Raw Domain Package 骨架

```text
domain/                            # 落点：packages/ 新包或 apps/ 组合根（架构门禁约束）
├── harness.yaml                   # id: audio-platform
├── workflows/operation.yaml · performance-order.yaml · upload.yaml
├── skills/                        # §8：audio.production.plan / form planner / resolver selection
├── tools/ · projections/          # [G9] 见 §3/§6
├── business-sources/              # [G2] 见 §4
├── schemas/                       # audio-production 冻结契约直接复用：AudioOperation/ContextSnapshot/
│                                  #   ActionPlan/ActionStep/StepOutcome/ExecutionRecord/DecisionPacket/
│                                  #   ABComparison（frozen+slots+assert_canonical_data）；OperationEvidence
│                                  #   七段；apx.harness.* 契约族（CONTRACT_SCHEMAS 生成的 Draft-2020-12
│                                  #   已双向覆盖测试——现成 JsonSchema 源）
├── rules/                         # 治理层：单输出不变量、lineage 唯一真相=operation graph、
│                                  #   "Jobs=execution mechanics / AudioOperation=product semantics"、
│                                  #   付费副作用 fail-closed（provider_outcome_unknown 不自动重试）、
│                                  #   pin 纪律（生产只跑 pinned snapshot；no best-effort pin）、
│                                  #   ACTIVE 只能从 SHADOW 到达（proposal 永不直接 ACTIVE）、
│                                  #   缺失测量≠PASS（MissingInputPolicy）、知识演化硬边界
│                                  #   （Cairn/dx 不得直改 ACTIVE；一次重复教训不得自动升 hard rule）
└── references/                    # ADR-0005/0028/0033/0034/0035、LIBRARY_SUPPORT_MATRIX、
                                   #   BASELINE_PACKAGE_MANIFEST.json（迁移盘点输入）
```

`operation.yaml` 要点：

```text
init              只收 Restore{operationSnapshot}；按 state 路由 draft/planned/running(→recovering)/终态
draft             ContextCaptured → planning：invoke plan_operation（DeterministicPlanner 或 AIRuntimePlanner
                    ——AI 步骤逐 step 校验：registry.describe 未注册即 fail+allowlist（"AI Runtime selected
                    disallowed capability"）+source_artifact_id∈input_artifacts+parameters Mapping+StepRisk 枚举；
                    **requires_approval 由宿主/Tool 声明决定，不从模型输出采纳**——修复 J7"模型可自标不需审批"）
                  → planned
planned           ApprovePlan{approvals} → executing：逐步 invoke capability（经 Registry execute()
                    fail-closed；审批步未批→StepOutcome(approval_required)+ExecutionRecord(blocked) 立即返回
                    ——既有 CapabilityExecutor 语义，**补 step 级 durable 状态与补偿声明**）
                  每步前后测量对比（Evidence 双 hash）→ 全部完成 → invoking record_decision
                    （DecisionPacket+OperationEvidence 七段+harness_snapshot_id pin）→ succeeded
                  单步失败 → failed（StepOutcome{failed,error=<ExcType>:<msg>} 短路；已写文件处置按
                    capability 的 effect 声明——见 §3 覆盖写风险条目）
running/recovering 崩溃恢复：reconcile（lease 1200s）→ 预算内 queued 重排 / 预算尽 failed；
                    cancel_requested durable 标志在 checkpoint 观察；终态提交前再查并抹 result（全部既有语义）
performance-order.yaml / upload.yaml：短阶段信号投递（canonicalise→separate→analyse→fingerprint /
  upload.completed→VocalQC 链）；人工决策点 require_decision() 无 fallback 语义保留为静止等待状态
```

## 3. Domain Tool 声明（RawToolDefinition）

**effect 标注是迁移新增**（现状 AudioCapability 只有 deterministic/destructive/preview_supported，且 destructive 几乎全 False 连 ffmpeg transform 也是——J5/J7）：契约要求每个 Tool 补 `effect ∈ none|idempotent|non-idempotent`，审批权从 plan 数据移到 Tool 声明。

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `capability.execute:{id}`（Registry 统一面） | 按 capability 标注（probe/measure=none；filter/transcode=**idempotent 要求内容寻址输出键**，见下） | project（Python 侧经 sidecar 回环）/script | 参数过 validate_parameters（stdlib JSON-Schema 小子集）；availability fail-closed | 未注册/不可用→拒绝 | `audio.capabilityRegistry@1` |
| `runCanonicalization` | idempotent | project | ffmpeg(timeout 300)→canonical wav→sha256→put(PRIMARY, asset_key)→**get-before-create** asset/version/operation/activity | 强幂等既有：内容寻址键+operation_{job_id}+每步先 get 后 create；非 48kHz→content_conflict | `audio.libraryStore@1` |
| `runGeneration`（MiniMax 等付费） | non-idempotent | remote | N 候选→N version/operation（单输出不变量：3 候选=3 operation 共享 1 ExecutionRecord） | 确定性 version/operation id；provider hash 与本地重算不符→integrity conflict；human_gates_enabled=False→failed/human_gate_missing；**provider_outcome_unknown→不自动重试（既有 paid_retry_policy 原样进恢复语义）** | http-transport@1 / resourceKey=generation |
| `filterAudio`/`transcode`（ffmpeg 直写族） | **现状风险条目**：`-y` 覆盖调用方 output_uri，无 temp+原子 rename 无内容寻址——暴露给重试/AI 前**必须**改为内容寻址输出键（对齐 runCanonicalization 模式），否则可能覆盖已被 version_assets 引用的字节 | project | 产物路径 | 改造后=内容寻址幂等 | `audio.capabilityRegistry@1` |
| `repairSpectralGate` | idempotent（改造后） | project | 写前 _require_finite（NaN/Inf→AudioNonFiniteError"no artifact was written"；多声道按通道分派） | 同上内容寻址要求 | 同上 |
| `ingestUpload` / `sweepExpiredIngestion` | idempotent | project | UploadSession 五态+CAS | X-Upload-Token+操作员归属；惰性过期+主动 sweep 双轨既有 | `audio.ingestionStore@1` |
| `finalizeVersion` / `selectActiveVersion` / `transitionPerformanceOrder` | idempotent | project | CAS（expected_state/expected_revision） | 既有 | `audio.libraryStore@1` |
| `runHarnessReplay` | idempotent | project | 报告字节相同重放；pin 失败→snapshot_pin_invalid 不写报告 | `<replay_id>.json` 同名覆写=byte-identical | `audio.harnessRegistry@1` |
| `moveAlias` / `transitionHarnessVersion` | idempotent | project | CAS（expected_revision/expected_status）+冻结 lifecycle 边校验；**仅 registry 接受后追加审计**（失败 CAS 不留审计行） | 既有 | 同上 |
| `cleanupOrphans` | non-idempotent（删除） | project | CleanupApprovalRequired/CleanupSetChanged（exact 未过期 approval；候选集变化即拒） | dry_run 默认 | `audio.objectStore@1` |
| `exportAsset` | none | remote | 同步授权/presign（ADR-0028 保留） | 只读 | resourceKey=objectStore |

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `audio.song` | songId | pointer（active_version_id）+revision+version 图摘要（version_rows_with_assets 3 批查询语义） | song.revision（乐观锁天然单调） | lineage 从 operation graph 派生（无冗余列） |
| `audio.operation` | operationId | AudioOperation 持久化后的状态+ActionPlan 摘要+StepOutcome[] | 行版本 | **前提：补 Run/Step 持久化表**（J6：包装现有 executor 不够） |
| `audio.jobs` | correlationId/operationId | job 行摘要（state/attempt/heartbeat/cancel_requested） | 行版本 | DB 权威（ADR-0034） |
| `audio.performance` | orderId | PerformanceOrder+PerformerTask+pending decision | expected_revision | |
| `audio.harnessRegistry` | packageId | 三 alias 指针+versions+snapshot pin 摘要（alias_resolution_view/package_registry_view 语义） | alias revision | |
| `audio.evidence` | operationId | Evidence/OperationEvidence 摘要（七段中可展示段） | run_id+result_hash | telemetry 不替代业务 Evidence |

## 5. Compiled Domain Data（自建 Harness ≈ SDK 包的知识子集）

**同构映射（可直接字段级迁移，报告 I5）**：HarnessPackage/Version≈Raw Domain Package；compile_snapshot 十步（schema 校验→Kahn 拓扑→拒环→引用解析（rules package-scoped）→规则可达性+可执行性（HARD/CONDITIONAL 必绑 rule）→tool capability（缺 catalog 即 CapabilityViolation）→provenance（可执行权威≥1 SourceRef）→canonical 序列化→content hash→不可变 snapshot）≈ Compiler；Snapshot+content_hash+verify_integrity≈Compiled Package+digest；Alias{active,shadow,candidate}+revision CAS+audit≈package pin（resolve-once）；HarnessPin 按值持有（"deliberately carries no way to re-enter the alias"）≈Run 级 pin；authoring-only 字段（notes/review/confidence/status）不进 payload/hash≈Raw→Compiled 裁剪；DRAFT→…→SHADOW→ACTIVE+shadow_compare≈灰度/晋升闸；replay decision-diff≈包升级影响回放。

| key | 内容摘要 | 治理 |
|---|---|---|
| `harness-snapshot:{snapshotId}` | 既有 HarnessSnapshot（primitives+rules+required_tools+provenance_refs）——**入包方式=引用 pin**（snapshot 权威仍在 Registry；DH 包记 snapshot_id+content_hash） | FROZEN（write-once+hash 重验） |
| `workflows-spec` | WORKFLOWS 七条（source_inspection/delivery_qc/mix_diagnosis/mastering/audio_repair/vocal_processing/mixing：capabilities+validation_capabilities）——纯数据 dict 外置（直接编辑候选 #1；"Harness 可细化阈值与选择，但不能绕过 capability 注册与审批门"） | CONTROLLED（**注意 J12：是"分析优先地基"非校准配方**） |
| `capability-catalog` | AudioCapability 注册表快照（含 license_expression/availability）+**tool token↔capability id 映射表**（迁移必须补：seed 的 loudness_meter/media_probe vs 真实 audio.loudness.ebur128/media.probe——否则包声明与可执行工具脱节） | CONTROLLED |
| `rules-ast` | 12 算子闭集 typed AST+MissingInputPolicy{unknown,not_applicable,fail}（**PASS 不可表示**）+深度 16/节点 128 预算 | FROZEN（若转译为 SDK expression 必须保留三值语义——"缺失测量≠PASS"） |
| `formspec-widgets` | 15 widget 闭集+FORBIDDEN_PRESENTATION_KEYS 反注入清单+VALUE_TYPES（无 object） | FROZEN |
| `seed-knowledge` | source_inspection/delivery_qc seeds（provenance 纪律：只有已发布标准可验证数值才 HARD——EBU R128 v5.0 −1dBTP、ITU-R BS.1770-5 −70 LUFS；工程默认降级 CONDITIONAL+WARNING+production_evidence；噪声地板/相位知识永不绑 rule） | CONTROLLED |

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `audio.operation-state` | operationId | wf operation + business operation/jobs/evidence + domain-data workflows-spec | goal-first Workbench 组合态（PRD §9 八步的 UI 数据面：plan/审批点/测量对比/DecisionPacket） |
| `audio.harness-workbench` | packageId | business harnessRegistry + domain-data capability-catalog | aliasPointers/groupPrimitives/provenanceSummary/diffPrimitives 四纯函数原样复用为投影表达式素材 |
| `audio.song-state` | songId | business song（version 图）+ jobs | VersionDag/AssetInspector 数据面 |
| `audio.performance-state` | orderId | wf performance-order + business performance | 订单+任务+pending decision |

集合视图（jobs/evals/benchmarks/qc/operators/uploads/system 清单）走 P4 读模型（keyset 分页既有）；OpenAPI 生成客户端+drift 门（`pnpm api:check`）保持——与 **[G7]** 生成契约方向一致。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Asset/TrackVersion/Operation/Activity 行 | Message → audio.operation → 各 Tool（get-before-create+CAS） | Tool | M1、M4（lineage 图完整性） |
| Song.active_version_id | Message/命令 → selectActiveVersion（CAS） | Tool | M2 |
| Job 行 | Runtime/jobs 表（执行机制层） | Tool/Runtime | M5（"execution mechanics"纪律） |
| PerformanceOrder/PerformerTask | Message → audio.performance-order（CAS expected_revision） | Tool | M2、人工决策闸 |
| UploadSession | Message → audio.upload（CAS+token 校验） | Tool | M2 |
| Harness Registry（alias/version/snapshot） | Direct（CAS+审计，治理动作） | Registry 服务 | 低频治理；审计链 append-only |
| Evidence/OperationEvidence | Tool 同事务随 execution | Tool | M4 |
| 对象存储字节/清理 | Tool（cleanup 需 exact approval） | Tool | M3（删除类唯一入口） |

## 8. Skills / AI 任务（v0.3 Track B）

**AIExecutionPort 是 v0.3 envelope 的又一既有样板**：请求全过 assert_canonical_data、mapping 构造复制；trace/operation id 逐字传播；错误三态稳定 kind（timeout/invalid_output/unavailable）；`required_output_fields` 是 port 侧唯一被理解的 schema 子集，其余 dialect 故意 opaque（"inventing it would mean guessing the real AI Runtime contract"——与 YISHU NOT_PINNED、xcrossify 契约纪律同族）。

| skillId | scope | output contract | envelope 要点 |
|---|---|---|---|
| `audio.production.plan`（AIRuntimePlanner） | Domain | ActionPlan steps——**逐 step 确定性校验**（registry 注册+allowlist+source_artifact∈inputs+StepRisk 枚举） | allowed_capabilities=operation.requested_capabilities；**requires_approval 不从模型输出采纳**（契约修正，J7）；DeterministicPlanner 为默认 fallback |
| `form.plan`（FormPlannerPort） | Domain | PlannedForm（frozen+hashed）：recommended_values/alternatives/reason/risk/**missing_information/validation_requirements/evidence_refs** 一等字段 | guards(size/depth/text)→严格解码→深度一致性→任何失败**降级确定性 fallback form.fallback.confirm-goal**（服务端永不崩、永不渲染未验证 planner 数据）；请求只给小 canonical 无 secret 上下文 |
| `resolver.select`（SelectionPort stage-2） | Domain | 候选选择（结构上只见 bounded CandidateSet 默认 32，truncated 暴露；**永远看不到整个 snapshot/registry/corpus**） | 0/1 候选短路不调 AI；默认 DeterministicSelector（ai_assisted=False） |
| `audio-ops-router`（可选新增） | **Control** | typed Proposed Domain Command | propose-only [G8] |

职责切分（AI-RUNTIME-BOUNDARY 原样=v0.3 §7.2）：平台拥有 Goal/Context/Harness/约束/FormSpec/allowlist/human gate/domain validation/Evidence/replay-shadow；AI Runtime 拥有 model/weak-strong/critic/judge/consensus/escalation；**禁止平台侧新建 provider routing/fallback matrix**。Fake adapter（无 wall-clock/random/network；镜像类型不 import；契约测试报警漂移）= v0.3 demo §26.3 deterministic fake 的现成实现。**外部契约不可猜**（CLAUDE：Cairn/dx-service/AI Runtime 真契约缺席时保持 Port/Fake/contract-test 边界）——接真实 AI Runtime 前无契约可对接（J9）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| 生成作业完成（MiniMax 等，异步化后） | `gen:{jobId}` | audio.operation | 推进 | **最高价值**：替代 worker 线程阻塞轮询（deadline 120s 循环）；与超时共用 messageId |
| 心跳租约过期 | `job:{jobId}:lease-expired` | 对应实例 | 推进（worker_lost 重排/failed） | reconcile_jobs(1200s) 既有→durable timer [G6] |
| 上传完成/过期 | `upload:{sessionId}:{completed\|expired}` | audio.upload | 推进（→VocalQC 链） | 惰性+sweep 双轨既有 |
| StageEvent/Outbox | `stage:{event_id}`（content_hash 派生，apx.stage-event/v1） | 各实例 | 推进 | **契约现成未接线**；OutboxDispatcher"先 start 成功再 acknowledge"；与 ADR-0028 Temporal 禁令的取舍：DH mailbox 承接=满足禁令（非 Temporal） |
| alias 移动/治理事件 | `alias:{kind}:{revision}` | —（失效） | 失效 | 审计链 append-only 可作源 |
| 人工决策族 | 命令（非 Ingress） | — | 推进 | CAS+审计 |
| 超时 | canonicalization subprocess 300s / 下载 timeout / direct backend timeoutMs | — | — | 短生命周期超时留 Tool 内部；durable deadline 只用于生成作业与租约 |

## 10. Target Host Profile 与 capability 需求

```yaml
platform: node-sidecar             # Python 宿主（同 tally/restudio 模式）；SDK 落 packages/ 新包或 apps/ 组合根
                                   #   （机械架构门禁：facade 只减不增、新文件禁依赖 facade、平台层禁音乐词汇）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1,
               secure-random@1, crypto-hash-sha256@1]
projectBindings:                   # [G3]：Python 进程内不可直调 → sidecar 回环 HTTP（先补本地 token——
                                   #   ops-api 已有 TokenVerifier/require_roles/Idempotency-Key 机制可复用）
  audio.capabilityRegistry@1: { module: bindings/capability-registry.ts, resources: [opsApi] }
  audio.libraryStore@1:       { module: bindings/library-store.ts,       resources: [opsApi, dbReadOnly] }
  audio.harnessRegistry@1:    { module: bindings/harness-registry.ts,    resources: [opsApi] }
  audio.ingestionStore@1:     { module: bindings/ingestion.ts,           resources: [opsApi] }
  audio.objectStore@1:        { module: bindings/object-store.ts,        resources: [objectStoreRoot] }
runtimeResources(resourceKey): opsApi(localhost+token), dbReadOnly, objectStoreRoot(fs|S3), generationProvider,
  aiRuntime(Port/Fake/contract-test 边界保持), clock(OrchestratorClock 注入式既有), ffmpegBinaries(PATH 探测既有)
```

**audio-harness 零依赖约束**：SDK 不向该层注入任何依赖；对接只发生在 adapters/组合根（fake.py 镜像类型模式=边界范本）。SQLite 侧无 DB 级不可变触发器（仅应用级 CAS，J15）——Runtime 侧不依赖 DB 触发器语义，与现状一致。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| AudioOperation/Step 持久化（Run/Step 表+恢复协议） | 仓库缺口（J6：包装现有 executor 不够）+**[G5]** | contracts.py 加持久化表起步（不受 ADR-0033 冻结面约束——该包不在 contracts freeze 内） |
| Python 侧 Tool 绑定 | **[G3]**（跨语言） | sidecar 回环+既有鉴权/Idempotency-Key |
| capability 拒绝/approval 缺失/pin 失败 = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；fail-closed 错误族直接映射拒绝码 |
| ensureOpen + 租约/生成作业 deadline | **[G6]** | reconcile/轮询既有→P2 调度器统一 |
| effect 三值标注 + ffmpeg 直写族内容寻址改造 | 本契约新增（J5/J7） | 先改造后暴露（否则重试/AI 可覆盖已引用字节） |
| apx.harness.* schema 入包 | **[G2]/[G9]**（CONTRACT_SCHEMAS 现成 Draft-2020-12） | 引用 pin 方式入 domain-data（§5） |
| Rule AST → SDK expression 转译器 | 迁移工程量（报告 I6 中高） | 保留三值+预算+trace；转译前 rules_eval 仍是唯一 evaluator |
| Skill envelope | **[G8]**（AIExecutionPort 是样板方） | exactKeys/canonical/错误三态模式建议反向输入 v0.3 L2 |
| 长寿命语义扩张 | **ADR-0005/0028 冲突** | 本契约严格限定短阶段；扩张须新 ADR 显式取舍 |
| 模型/许可门 | ADR-0035 | requires_model/NOT_ADOPTED/BLOCKED capability **不得**直接暴露给 AI（绕过 benchmark/license 门）；LOCAL-15 听评 PENDING"not claimable autonomously"语义保留 |

## 12. 迁移路径建议

1. **契约持久化先行（不动架构门禁）**：audio-production 契约加 Run/Step/DecisionPacket 持久化表（Alembic 新迁移；组合根接线）——这是"没人跑的领域模型"变成执行真相的前提；
2. **只读接入**：song/operation/harnessRegistry Provider + 四个 Projection（harnessWorkbenchModel 纯函数与 read_models SQL 视图直接复用；goal-first Workbench UI 顺势补 PRD §9 缺口）；
3. **短阶段 workflow**：`audio.operation` R 实例承接 canonicalise→separate→analyse→fingerprint 链（jobs 表继续做执行机制层——双层纪律不变）；`audio.upload` 触发 VocalQC（ADR-0005 点名场景落地）；
4. **Outbox 接线**：StageEvent/EventOutbox → DH durable message（满足 ADR-0028：非 Temporal；TemporalStageStarter 桥保留至兼容迁移结束）；
5. **生成作业异步化**：MiniMax 阻塞轮询 → 提交+`gen:{jobId}` Ingress+deadline（消除 worker 线程长阻塞）；paid_retry_policy fail-closed 原样进恢复语义；
6. **effect 改造**：ffmpeg 直写族内容寻址化 + AudioCapability 补 effect 字段（触发 ADR-0035 边界复审+契约测试更新——走正规流程不绕过）；
7. **Replay/治理保持 Direct**：alias/lifecycle/replay 不进 workflow（CAS+审计+字节相同报告已完备）；
8. **验证纪律**：`make arch`/`make check`/OpenAPI drift 门全程绿；LIBRARY_SUPPORT_MATRIX 的 requires_model/NOT_ADOPTED/BLOCKED/PENDING 状态词表原样进投影（诚实状态，不折叠）。
