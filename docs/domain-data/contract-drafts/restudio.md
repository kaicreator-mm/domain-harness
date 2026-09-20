# Restudio 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/restudio` @ v0.2.0 / vNext FROZEN（Python FastAPI 单体 + React 19 前端 + 可选本地 GPU 服务 restudio-model-api；存储=JSON 树 + restudio.db + vnext.db 三处；L2 结论 "evolve, do not rewrite"；验证 198+11 passed 但**真实媒体/模型路径未跑通**，绿测试只覆盖 mock 脊柱）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（单 commit `a5002fe`）
**Date:** 2026-09-20

> 架构锁（不可协商，AGENTS.md/PRD 冻结项）：**Existing-X first**（不是空白画布通用 agent）；**X2T→T2T→T2X 三段固定不可 DAG**；产品状态结构化、chat 不是数据库；Harness 向下编译（PipelineConfig 降级为"编译后的低层执行计划"）；专业服务走自有 port/adapter；旧 Pipeline UI 降级为 Advanced。
>
> **本草案的最大价值定位**：L2 已设计但代码完全不存在的两件事——`ProductionRunState`（L2 §8）与产品状态机 `DRAFT→SOURCE_UNDERSTOOD→TARGET_DESIGNING→TARGET_CONFIRMED→PLAN_COMPILED→RUNNING↔AWAITING_REVIEW→VALIDATING→READY→DELIVERED`（L2 §11）——正是 DomainHarness Workflow Instance 的自然落点；Run 非持久（内存字典，重启全丢且 project.json.status 卡死）是仓库自认的第一缺口。
>
> **宿主语言缺口**：restudio 是 Python，DomainHarness SDK 是 TypeScript。落地形态=**Node sidecar 运行时**经本地 HTTP 调 FastAPI（同 tally 模式）；且 Python 侧无进程内注册绑定可用，**[G3] 的临时方案 A（本地回环）在 Python 宿主上是唯一现实路径**（restudio API 现状无鉴权——sidecar 回环必须先补本地 token，参照 formula 的 session token 模式）。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | Project（JSON 文件 SoR 原子写；created→running→paused→completed/failed/cancelled）、Source X（**仅 InputSpec 内嵌，PRD 列名未实现**）、阶段载荷 stage_x2t/t2t.json（只存当前态无版本历史）、ContentIR v1（**僵尸契约**：仅 round-trip 测试）、TargetDesignSession（design_id+revision 单调；**UI 挂载即新建→会话无限增生缺陷**）、TargetXSpecification（accepted 永远 False，无接受端点）、TransformationHarness（5 个硬编码目录项，version "1.0.0" 静态）、ProductionPlan（pin harness/spec+PipelineConfig 快照；**无读取端点**）、Transformation Run（**内存字典**；持久影子=project.json.status+run_log.json+checkpoint）、Target X 产物（(project_id,format) 覆盖式）、EvidencePackage（**每项目单份覆盖，GET 即重算即写**；checks 仅 3 项，不消费 quality_score/acceptance/pins）、ReviewCase（open→resolved，编排器在 T2T 评审暂停时创建）、RuleProposal/ProductionRule（approve **非幂等**：重复调用派生多条 rule）、ProductionMemory（**从未被读回**——PRD H5 闭环未成立）、Glossary/Voice/PipelineTemplate（restudio.db）、僵尸表（projects/stage_results/artifacts 定义但从未写入） |
| B | 长期/可恢复流程 | 固定三段串行执行（每段落盘可单段重跑）；三种恢复入口（auto_resume 从第一个无输出阶段/start_stage 显式重跑先校验上游/resume_past_pause）；两个人工暂停点（pause_after_x2t 默认 True；T2T 节点 review=True→**durable checkpoint+ReviewCase+REVIEW_REQUIRED**，恢复从 next_index，链尾 clear_checkpoint——修复过 L2 记录的评审恢复死循环）；FIFO 单执行槽（CPU/GPU 争抢串行化）+同项目单 run+协作式取消（仅阶段/节点边界）；WS 断线重连事件重放（run.log 全量保留，attach 先重放后订阅）；**T2X 失败语义缺口**：并行扇出单输出异常被捕获成 ERROR 事件但 run 仍 completed——无 per-output 重试/补偿/失败态 |
| C | 领域能力（Tool） | compile_plan（纯函数，三条编译期校验含**恰好一个 enabled X2T step**）、provider 族（faster_whisper/LLMT2T/QualityJudge/T2X 生成/ffmpeg 子进程）、远程重模型 HTTP（ASR/align/timing/TTS/VAD 600s，separation/diarization 1200s，**同步阻塞无 job id 无回调**）、LLM chat（OpenAI 兼容任意端点；**任何异常重试 3 次且无幂等键**→重复计费风险）、VNextStore.put（(kind,id) upsert 幂等）、ProjectStore 原子 JSON 覆盖、校对写入+术语被动回写、评审决议（两步**非事务**）、规则批准（三步非事务非幂等）、导出（zip 流+containment 检查） |
| D | 业务 SoR | 三处并存：JSON 树（projects/{id}/…）+ restudio.db（glossary/voices/templates）+ vnext.db（vnext_objects 通用 (kind,id,project_id,payload) upsert 文档表）；ADR-vNext-09：FS 存大载荷、SQLite 存紧凑元数据；**明确不需要 PostgreSQL** |
| E | 每实体组合视图 | **ProductionWorkspaceState(projectId)**：前端现拼装 7 个来源（project+status+stage+WS RunContext+queue/runs 2s 轮询+evidence+design session）且**无任何单一聚合端点**——最强 Projection 候选；schema→UI 机制现成（/api/providers param_schema、/api/schema/pipeline JSON Schema——L2 认定 RJSF 动态表单直接路径） |
| F | 只是交互/本地状态 | RunContext reducer（events/running/paused/currentStage/outputs/error）、导航、表单态 |
| G | 宿主绑定 | Python≥3.11 FastAPI 单进程模块级单例；provider 同步+asyncio.to_thread；REST+单 WS（显式拒绝 gRPC/Docker/远程计算节点）；**API 无鉴权**；GPU 侧独立服务（EngineManager 懒加载/闲置 300s 卸载/热切换，V100 一进程一模型）；Tauri+PyInstaller 仅计划；端口冲突隐患（三处默认 8000） |
| H | E/R/S 划分 | E：`restudio.project`（key=projectId，命令入口；L2 §11 产品状态机的载体）；生产运行=**E 循环**（RUNNING↔AWAITING_REVIEW，运行数据=ProductionRunState 落 vnext_objects，S2）；design session 不建实例（收敛为 project 的 designing 相位+ensureOpen"当前会话"，修 UI 增生缺陷） |
| I | 命令入口/拒绝路径 | 全部命令发 `restudio.project`；上游产物缺失的 start_stage、review 未决的推进、非法相位 → `rejected(code)`；provider 失败按 L2 七类归一（transient/unavailable/invalid_request/policy_rejection/quality_failure/unsupported_capability/human_action_required）映射拒绝/失败分界 |
| J | Mutation Ownership | 见 §7；多步写非事务现状（approve/resolve）由 Tool 事务化修复 |
| K | 外部事件/超时 | **零 webhook/回调/队列**；可用事件源：ProgressEvent 9 类（WS+run.log 重放）、provider on_progress 桥接、人工决策入站（chat/select/resolve/approve/校对/cancel）、UI 2s 轮询；**run 无任何超时**——挂死 provider 永久占用唯一执行槽（必须补 job deadline+heartbeat）；GPU 闲置卸载为进程内定时 |
| L | 破坏性变更重建 | 阶段载荷落盘+checkpoint+run_log 可重建执行位置；Plan pin（harness/version/spec）**运行时不校验**（run 执行的是 project.json 的 PipelineConfig 快照、不引用 plan；spec revision/accepted 从不检查——重放/审计声明当前不可强制，迁移时由 Restore+pin 校验修复） |

**判定结论：适合（DomainHarness 恰好补上 L2 已设计未实现的全部执行层）**：持久 Run、durable message（checkpoint/ReviewCase 是现成雏形）、effect 三值+幂等键（当前完全没有可依附实现）、Projection 聚合、超时。同时 restudio 反向输入 DomainHarness 四件素材：固定三段拓扑=领域受限编译目标、review=True→checkpoint+ReviewCase 的 HITL 范式、vnext_objects 通用文档存储、Evidence-first 完成判定（"DONE≠完成"）。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `restudio.project` | E | projectId（`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` 既有约束） | L2 §11 产品状态机：DRAFT→SOURCE_UNDERSTOOD→TARGET_DESIGNING→TARGET_CONFIRMED→PLAN_COMPILED→RUNNING↔AWAITING_REVIEW→VALIDATING→READY→DELIVERED | P2（项目创建 + ensureOpen"当前设计会话"） | 唯一命令入口；生产运行/评审为内部 E 循环 |

- **不建实例**：design session/spec/plan（收敛为 project 相位+业务数据；spec 接受补端点后置 accepted=true）；Rule/Memory 治理（Direct+失效，见 §7）；Glossary/Voice/Template（Direct CRUD）。
- ProductionRunState（L2 §8 字段：execution_cursor/status/pending_review/compiled_plan_revision/stage_state/operation_refs/last_durable_event）落 `vnext_objects(kind='production_run')`——workflow 跨消息只存控制相位，运行数据在业务库（S2/[G5] 临时约定）。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml                 # id: restudio
├── workflows/project.yaml
├── skills/                      # §8：LLMT2T 族 / QualityJudge / MultimodalX2T / T2X 生成族 / design-assistant
├── tools/ · projections/        # [G9] 见 §3/§6
├── business-sources/            # [G2] 见 §4
├── schemas/                     # ContentIR v1（激活僵尸契约为正式 schema）、Transcript/Segment（收敛 meta
│                                #   异质语义：_variant/_fork_from/text_<lang>/quality_score/… 类型化——
│                                #   L2 反模式 3 "untyped database" 的修复载体）、ProductionPlan/RunState、
│                                #   EvidencePackage（扩展：quality_score/acceptance[]/pins/provenance 入 checks）、
│                                #   LLMT2T 输出（"ONLY JSON array {id,text[,emotion]}, same ids same order"
│                                #   提示词约定 → 正式 outputSchema）
├── rules/                       # 治理层：三段固定拓扑锁（1 X2T+有序 T2T 链+受控 fork/merge+并行 T2X 扇出；
│                                #   harness 不得引入任意拓扑/用户可执行代码）、review_mode=human_approval→
│                                #   review=True、pause_after_x2t 语义、Evidence-first 完成判定、
│                                #   pin 纪律（harness id/version+spec revision+ContentIR version+rule refs）、
│                                #   安全边界（绝不从受众国籍推断目标语言；关键目标决策必须显式——测试锁定）
└── references/                  # PRD_vNext_FROZEN 8 项冻结项、L2 ADR-vNext-01/02/05/09
```

`project.yaml` 要点：

```text
init                 只收 Restore{projectSnapshot+runState}；按产品状态机+阶段载荷+checkpoint 路由：
                       无 source→draft · 已理解→designing · spec accepted→plan_compiled
                       run_log/checkpoint 存在→running/awaiting_review · READY→validating · 兜底 draft
draft                AttachSource{inputSpec} → invoking understand_source（X2T 可含 multimodal LLM；
                       产物 stage_x2t 落盘；pause_after_x2t 默认→paused_for_review 静止）→ source_understood
designing            DesignChat → invoking design_assist（提案+确定性打分；revision++）→ designing
                     SelectTarget → invoking compile_spec_plan（spec 生成+compile_plan 三校验+pin 落盘；
                       **同事务置 spec.accepted**——修复"永远 False"）→ plan_compiled
plan_compiled        StartProduction → running：invoke execute_stage（单执行槽语义由 per-instance lane 承接；
                       阶段推进写 ProductionRunState.execution_cursor；LLM/媒体调用带幂等键+journal——
                       修复"任何异常重试 3 次无幂等键"）
                     T2T 节点 review=True → awaiting_review（静止；checkpoint+ReviewCase 既有语义原样：
                       save_stage_variants→save_checkpoint("t2t_review",{node_id,next_index,variants})→
                       创建 ReviewCase→REVIEW_REQUIRED）
awaiting_review      ResolveReview{caseId,resolution,correction?} → invoking resolve_review
                       （ReviewCase+Memory.corrections **同事务**——修复两步非事务）→ running（从 next_index；
                       链尾 clear_checkpoint）
running              RunFailed{七类归一码} → failed_phase（可见失败相位；transient→可重试命令；
                       quality_failure→回 awaiting_review/designing）
                     StageDone → 下一阶段/全部完成 → validating
validating           invoke build_evidence（Evidence-first：execution_completed+no_open_reviews+has_artifacts
                       +**quality_score 汇总+acceptance[] 逐项+pins 校验+provenance**——扩展既有 3 项弱 checks；
                       evidence 按 run 归档不再覆盖式单份）
                     → outcome=applied → ready · 未过 → awaiting_review/failed_phase
ready                Deliver → delivered（Close 前静止）· RerunStage{stage}（先校验上游产物存在——既有语义）
                       → running
任意静止状态          Cancel（协作式：cancel_requested 标志，checkpoint 边界生效——既有语义）→ final
                     全部消息类型可达；不适用 → {S}__reject（W3/R4）
```

**T2X per-output 失败态**（修复"吞异常仍 completed"）：T2X 扇出每输出独立 StepOutcome 落 RunState.operation_refs；单输出失败→partial 结果+显式失败清单进 evidence；重试=per-output 命令。

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `compilePlan` | none | expression/script | TargetSpec+Harness →（ProductionPlan, PipelineConfig）；三校验（源类型/target 匹配/恰好一个 X2T） | 纯函数 | expression-jsonata@1 |
| `runStageX2T/T2T/T2X` | non-idempotent（模型计费/媒体写） | remote（Python API 回环）| 阶段执行 → 载荷落盘+ProgressEvent | **新增**：`{projectId}:{stage}:{nodeId}:{inputHash}` 幂等键 + applied_effects（修复 LLM 盲目重试重复计费）；重试仅 transient 类 | http-transport@1 / resourceKey=restudioApi |
| `runHeavyMedia`（ASR/align/TTS/separation/diarization） | non-idempotent | remote（model-api） | **目标形态：提交+operation_ref+回调/轮询**（L2 §6.5 OperationResult=Completed\|Pending(operation_ref)\|Failed 七类归一）；现状同步 600–1200s 阻塞 | operation_ref + jobs 业务表 + deadline/heartbeat（**[G6] 必须**：现 run 无超时，挂死=永久占槽） | resourceKey=modelApi |
| `saveStageOutput` / `saveProjectState` | idempotent | remote/project | 原子 JSON 覆盖（tmp+replace 既有） | 路径幂等（内容非确定→以 inputHash 键判重） | `restudio.store@1` |
| `resolveReview` | idempotent | remote/project | ReviewCase+Memory.corrections **同事务** | already_resolved→rejected | 同上 |
| `approveRuleProposal` | idempotent | remote/project | proposal→approved+派生 ProductionRule+Memory.rule_ids **同事务** | **新增** applied_effects（修复重复批准派生多条 rule） | 同上 |
| `proofreadSegment` | idempotent | remote/project | 段文本修改+术语被动回写（glossaries.upsert_term PK 幂等既有） | (stage,segmentId) 键 | 同上 |
| `buildEvidence` | idempotent | remote/project | 按 run 归档 EvidencePackage（扩展 checks） | run_id 键（替代 per-project 覆盖+GET 即写） | 同上 |
| `exportProject` | none/idempotent | remote | zip 流+containment 检查（既有安全语义保留） | 给定产物集确定 | 同上 |
| `ingestSourceAsset` | idempotent | remote/project | Source X 登记（**补 PRD SourceX 实体**：哈希登记+存在性校验） | 内容寻址 | `restudio.store@1` |

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `restudio.project` | projectId | project.json+config+artifacts 索引+status | 文件 mtime+内容 hash（B1/B2） | JSON 树读取 |
| `restudio.runState` | projectId | ProductionRunState（execution_cursor/pending_review/operation_refs/last_durable_event）+queue 态势（单执行槽） | vnext_objects 行版本 | |
| `restudio.design` | projectId | **当前** design session（收敛后单一）+spec{revision,accepted}+plan pins | revision 单调 | 修 UI 增生后每项目至多一活跃会话 |
| `restudio.stageOutputs` | projectId | stage_x2t/t2t 存在性+摘要（Transcript 变体统计；不出全文防快照过大） | 文件 hash | |
| `restudio.review` | projectId | open ReviewCase[]+rule proposals 态势+Memory 摘要 | max(updatedAt) | |

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `harness-catalog` | 5 个种子 Harness（technical-video-localization/course-to-notes/repair-to-checklist/knowledge-video-to-article/knowledge-to-visual-summary）：steps+acceptance[]+evidence[]——**从硬编码常量升级为持久化+版本化**（直接编辑候选 #5） | compile_plan 输入 | CONTROLLED（version 字段真实化） |
| `topology-lock` | 三段固定拓扑规则（1 X2T+有序 T2T+受控 fork/merge+并行 T2X；禁任意拓扑/用户代码） | 编译期校验 | FROZEN（ADR-vNext-01/05） |
| `compile-rules` | 恰好一个 enabled X2T、源类型支持、target 匹配、target_language 下沉、review_mode 提升、pause_after_x2t=False | compilePlan | FROZEN |
| `evidence-policy` | Evidence-first 完成判定（DONE≠完成）+扩展 checks 定义+pin 清单（harness/version/spec/ContentIR/rules） | validating 相位 | FROZEN（PRD §15） |
| `safety-boundaries` | 绝不从受众国籍推断目标语言；关键目标决策必须显式（测试锁定语义） | design_assist 闸 | FROZEN |
| `failure-taxonomy` | L2 七类归一失败（transient/unavailable/invalid_request/policy_rejection/quality_failure/unsupported_capability/human_action_required） | 拒绝/失败分界 | CONTROLLED |

## 6. Projection / Dynamic Domain State

`restudio.workspace-state`（key=projectId）：依赖 wf project + business 全部五源 + domain-data harness-catalog/evidence-policy。

body = **前端 7 来源拼装的合并**（报告认定无单一聚合端点）：{project 摘要, 产品状态机 phase, design{session,spec,plan pins}, stage_availability, run{cursor,queue 态势,outputs[format],error}, open_review_cases, artifacts, evidence.checks（扩展版）, applied_assets(glossary/voices)}；信封 `pending`=awaiting_review/长媒体作业（operation_ref+deadline）；`availableActions` 由相位+pin 校验派生（RerunStage 需上游产物存在）。

集合视图（ProjectList/QueueView/GlossaryTemplateList/VoiceAssetList 等）走 P4 读模型；QueueView 2s 轮询由 watch 信号替代。reviews/rules/memory 端点已实现但前端零引用——Inbox 界面（PRD §13 Review→Rule 闭环）以 `restudio.review` 源+投影补全。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| project.status / 产品状态机相位 | Message → restudio.project | Tool | M2 |
| stage 载荷 / checkpoint / run_log / ProductionRunState | Message → runStage*/执行循环 | Tool | M1（execution_cursor 与评审串行化）、M5 |
| TargetXSpecification.accepted / ProductionPlan | Message → compile_spec_plan（同事务） | Tool | M2、M4（pin 审计） |
| ReviewCase / ProductionMemory.corrections | Message → resolve_review（同事务） | Tool | M4 |
| ProductionRule（approve 派生） | Message → approve_rule（同事务+幂等键） | Tool | M4（修复非幂等） |
| Target X 产物文件 / artifacts.json | Message → T2X 执行 | Tool | M5 |
| EvidencePackage | Message → build_evidence（按 run） | Tool | M4（Evidence-first） |
| design session（chat/select） | Message（收敛单一会话；ensureOpen 语义修增生） | Tool | M2 |
| Glossary/Voice/PipelineTemplate | Direct（CRUD+校对被动回写保留） | 业务服务 | 无流程依赖 |
| Source X 登记 | Message/Direct（ingestSourceAsset） | Tool | M4（哈希登记） |

## 8. Skills / AI 任务（v0.3 Track B）

现状纪律与缺口并存：LLM 只 propose（QualityJudge 从不改文本、Target Design 关键决策必须显式）＝produce-result-only 已有；但**无幂等键、无 outputSchema 正式化、无 operation_ref**——正是 v0.3 Track B 要补的。

| skillId | scope | 触发点 | output contract | envelope 要点 |
|---|---|---|---|---|
| `t2t-transform`（scrub/glossary/translate/summarize/rewrite——"新能力=新 prompt 不是新代码"） | Domain | T2T 节点 | **正式 outputSchema**：JSON array `{id,text[,emotion]}` same ids same order（提示词约定升级；repair_json_array 容错留 AI Runtime 边界）；工程约束入 execution policy：token 预算分块+overlap+前块上下文、按 chunk 术语过滤上限、max_ms 时长约束、情感闭集、source_text 保留、refine"缺失草稿保留原样绝不丢译文"、length_overflow 只诊断不改文 | 幂等键+journal（修复重复计费）；committed result replay 复用 |
| `quality-judge` | Domain | T2T 评审辅助 | 每段 fidelity/fluency/term_consistency(0-5)+issues → Segment.meta | produce-result-only（从不改文本既有）；缺分段优雅跳过、评分失败绝不中断流水线 |
| `multimodal-x2t` | Domain | X2T 槽位（声明 prompt 参数即 LLM 类实现） | 结构化理解产物 | 同上 |
| `t2x-generate`（blog/show_notes/highlights/chapters） | Domain | T2X 扇出 | 各格式产物 schema | per-output 失败态（§2） |
| `design-assistant`（替换现关键词正则启发式） | Domain | designing 相位 | 提案+打分（现固定目录加权 0.55/+0.30/+0.25/+0.15/+0.10 上限 0.99 语义保留为确定性 fallback） | **安全边界测试锁定**：绝不从受众国籍推断目标语言；assistant 固定字符串回复升级需过同一边界 |
| `restudio-intent-router`（新增） | **Control** | 自然语言入口 | typed Proposed Domain Command | propose-only [G8] |
| （规划）外部专业服务五端口 | Domain | Knowledge/Reasoning/Translation/AudioProduction/VisualProduction → Cairn/dx/YISHU/AudioPlatform/Formula | OperationResult=Completed\|Pending(operation_ref)\|Failed(七类) | **零调用脚手架现状**——按 L2 §6.3-6.6 契约实装；与四兄弟项目契约草案的外部服务面互相咬合 |

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| 重媒体作业完成（operation_ref 引入后） | `media:{operationRef}` | restudio.project | 推进（running） | **前提**：model-api 异步化（现状同步阻塞是最大缺口） |
| 作业超时/心跳丢失 | `media:{operationRef}:timeout`（与完成共用先到者生效） | 同上 | 推进（failed_phase, transient） | **[G6] 必须**：现 run 无超时，挂死=永久占唯一执行槽 |
| 外部专业服务异步结果 | `svc:{service}:{operationRef}` | 同上 | 推进 | 七类归一失败 |
| 人工决策（resolve/approve/select/校对） | 命令（非 Ingress） | 同上 | 推进 | 走 facade command |
| GPU 引擎闲置卸载 | —（进程内） | — | — | 不进契约 |

## 10. Target Host Profile 与 capability 需求

```yaml
platform: node-sidecar             # 与 FastAPI 单进程并存；本地回环 HTTP + **先补本地 token 鉴权**
                                   #   （restudio API 现状无鉴权；参照 formula session-token 模式）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1,
               secure-random@1, crypto-hash-sha256@1]
projectBindings:                   # Python 宿主上 [G3] 注册绑定不可进程内直调 → 回环 HTTP 为 CR-1 前主路径
  restudio.store@1: { module: bindings/vnext-store.ts, resources: [vnextDb] }   # vnext_objects 直读（SQLite 可跨语言）
runtimeResources(resourceKey): restudioApi(localhost:8000+token), modelApi(GPU 服务), vnextDb, restudioDb,
  projectTreeRoot(data_dir——注意 CWD 相对解析陷阱), llmEnv(RESTUDIO_* 注入), clock
```

文件系统沙箱是宿主责任（客户端提交路径 input.path/artifact/ref_audio_path 被直接信任，现仅 ID 正则+is_relative_to——binding 层必须加沙箱校验）。Tauri 桌面化（计划中）落地后与 sidecar 模式合流。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| Run 持久化/恢复 | 仓库缺口（L2 §8 已设计）+**[G5]** | ProductionRunState 落 vnext_objects；workflow 只存相位 |
| Python 侧写 Tool | **[G3]**（跨语言限制） | 回环 HTTP+token（方案 A）；SQLite 直读用于 Provider |
| 非法相位/上游缺失 = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；七类归一码映射拒绝/失败分界 |
| ensureOpen（当前设计会话）+ 媒体作业 deadline/heartbeat | **[G6]** | 先查后开；P2 调度器扫 runState.operation_refs |
| ContentIR/Segment/RunState schema 入包 | **[G2]/[G9]** | 激活僵尸 ContentIR 契约；Segment.meta 类型化收敛 |
| Skill 幂等键/outputSchema/operation_ref | **[G8]** | Runtime journal+确定性键先行；repair_json_array 留 AI Runtime |
| harness-catalog 持久化版本化 | **[G1]** | 常量→domain-data 入包（pin 纪律随之可强制） |
| 类型化前端客户端 | **[G7]/L2-6** | OpenAPI（FastAPI 自带）→生成；api/vnext.ts 手写先行 |

## 12. 迁移路径建议

1. **修缺陷先行（不依赖 DomainHarness）**：spec.accepted 端点、approve 幂等、resolve 事务化、design session 收敛（当前会话端点）、run 超时+取消强化——这些是契约成立的前提；
2. **只读接入**：五源 Provider + `restudio.workspace-state` Projection（替代前端 7 来源拼装与 2s 轮询）；
3. **Run 持久化**：RunManager 落 vnext_objects+启动 reconcile（清僵尸 running/paused——仓库自认缺口的直接修复）；
4. **命令入口**：`restudio.project` 承接产品状态机（L2 §11 从文档变成 workflow 定义）；checkpoint/ReviewCase 语义原样进 awaiting_review 相位；
5. **媒体作业异步化**：model-api 加 operation_ref+回调，接 §9 Ingress+deadline（消除 600–1200s 阻塞占槽）；
6. **AI Scoped 化**：五类 Skill 按 §8 收编（幂等键+outputSchema+journal）；外部专业服务五端口按 L2 契约实装；
7. **Evidence-first 收口**：build_evidence 扩展 checks+按 run 归档+pin 校验——READY→DELIVERED 的完成判定与 PRD §15 对齐；真实媒体路径验证（M1 双语 SRT/M3 BGM 保留）进 Critical Journeys。
