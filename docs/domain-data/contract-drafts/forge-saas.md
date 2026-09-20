# Forge (forge-saas) 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/forge-saas` @ v2.9.5.2 "Media Design Harness Boundary Refactor"（TypeScript：Next.js web + BullMQ worker + PostgreSQL/RLS + Redis + Cloudflare Pages + R3；IMPLEMENTATION_COMPLETE / NOT_RELEASE_QUALIFIED，刻意无 CI）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20
**Date:** 2026-09-20

> Forge 已自带一套**词汇高度同构**的 Harness 体系（Trade Content Harness / Domain Harness Foundation v2.8 冻结 / Domain Harness v2.9 server-authoritative / 三个媒体设计 Harness），且 `FOUNDATION` 文档**明确 deferred**：通用 Harness DSL、独立 harness runtime/workflow engine、policy compiler、自主 Pattern 进化——**DomainHarness 正是补这块被刻意留空的位置**，而非替换既有权威。
>
> 贯穿红线：上游 Trade Content Harness 是外贸事实与商业语义**唯一权威**，媒体 Harness 只消费 approved TradeCreativeBrief，不得自行裁决事实真伪/证据充分性/声明许可；**LLM 不是完整性预言机**（publication-integrity 是确定性四类不可变事实校验）；provider/model 路由全部外推 AI Runtime（INV-22/23 静态守卫 deny-by-default）；平台身份域（PlatformUser）与租户身份域严格分离（无跨域 FK）。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | TenantFactSnapshot（内容派生 id，不可变，enqueue 前 pin，INV-10/11）、BuyerQuestion（unique(tenantId,question)；candidate→validated/rejected；journeyStage+requiredFactPaths+answerPolicy）、ContentBrief（version+fingerprint；draft→generated→integrity_failed/approved）、ConfirmationTask（open→in_review→resolved/reopened；outcome 含 not_public 阻断发布；cairnWriteId 幂等写回）、**TradeCreativeBriefV2952（编译即批准的冻结纯数据——无表无 id，嵌在 Video.script.mediaDesign**）、TemplateRelease（releaseHash promoted 后不可变 INV-06；current→superseded→retired）、ContentArtifact（unique(tenantId,contractFingerprint,revision)；append-only revision INV-12）、Site/Page/PageTranslation/GateRun/PublishLog（PageStatus 七态；PublishLog unique(siteId,date) 节流）、Video（scripted→rendering→pack_ready/render_failed→published 回填；publishPack.effectKey）、Inquiry/InquiryAnalysis/InboundEvent（unique(channel,providerEventId) BLK-009）、OutboxEvent/ExternalInvocation（idempotencyKey unique INV-20；succeeded 终态；unknown 只能经 reconcile 收敛）、Pattern/Recipe Revision（只有 operator review 可 promote INV-08）、R3Claim/Keyword/GlobalSignal/审计双表 |
| B | 长期/可恢复流程 | **内容执行主流程**（pin 契约+Outbox 同事务→dispatcher lease→BullMQ→AI Runtime→确定性域校验→CAS；恢复身份 `deriveExecutionEventId={tenantId}-generation-{inputFingerprint}` 收敛重试/重投/并发；in-flight 被 promotion 取代→永不重定向按 pin 完成 INV-11）；页面内容流水线（verified Keyword 红线#3→生成→翻译→回译→gates→transitionStatus）；**发布流程**（gated→queued；单一属主 BLK-003；发布前重查 blocked；R3 硬阻断；节流超限自动排期下一槽延迟重入队 红线#2；approved-only immutable snapshot 首建持久化、retry 按最新 publish 观察判定复用 S08；deploy snapshotId compare-before-apply INV-21；PublishLog+Page+Audit 单事务 INV-28/30）；视频渲染（effectKey 重放守卫→禁词闸→月度成本上限→HyperFrames strict→stale 拒绝 compareBeforeApply）；**UNKNOWN reconcile runner**（durable scan、probe 只读观测、决定性证据才收敛、TIMEOUT/UNKNOWN 无限期等待、结构上无 blind retry） |
| C | 领域能力（Tool） | AI Runtime generate、Formula 图像/视频 Operation API（fp_v1 幂等身份+runConsumerEffect）、YISHU 本地化（requestId 派生自 videoId+knowledgeSourceFingerprint，fail-closed 无本地 fallback）、HyperFrames strict 渲染（inputFingerprint 回显比对）、Cloudflare Pages 部署（snapshotId 回显）、Cairn 写回（cairnWriteId 幂等）/dx 查询、Outbox 派发（lease 60s）、compileTradeCreativeBrief（证据不足直接 throw TRADE_CREATIVE_EVIDENCE_INSUFFICIENT）、publication-integrity 校验（PASS/NEEDS_REVIEW/FAIL，禁 silent unit conversion） |
| D | 业务 SoR | PostgreSQL（RLS，GUC `app.tenant_id`；DB 角色三分 app/control/dispatcher+启动安全门；缺租户上下文 fail-closed BLK-012）+ Redis（队列）+ R3（资产）+ CF Pages（站点）；事实生命周期权威外移 Cairn（只存 refs 不复制正文） |
| E | 每实体组合视图 | **GenerationPlan 投影样板**（`loadGenerationPlanForRelease/ForPins`：release+snapshot+pattern/recipe+BuyerQuestion → HarnessExecutionPlanV29{generationState: ready\|needs_input\|needs_review\|blocked, requiredFactStates[]}——**UI 与执行边界消费同一投影**"One semantic source"）；HarnessFormSpec（v2.8 冻结：参数 schema+fact truth state+risk marker；UI 可加展示元数据不可弱化权威）；执行客户端状态机（201/200 created=false 幂等重放/409 HARNESS_PLAN_MISMATCH/422 HARNESS_NOT_READY{missingFields}） |
| F | 只是交互/本地状态 | create/inbox/content 导航、表单态、执行进度轮询 UI |
| G | 宿主绑定 | Node：Next web + 独立 worker 进程（优雅退出）+ BullMQ/Redis + PG；local-runtime profile（node:sqlite+local_job 队列+确定性 LLM+HTTP console，拒绝 NODE_ENV=production，非生产等价物）；外部：Formula/YISHU/AI Runtime/HyperFrames(Chrome/FFmpeg)/CF Pages/Cairn/dx |
| H | E/R/S 划分 | E：`forge.page`（key=pageId）、`forge.video`（key=videoId）、`forge.inquiry`（key=inquiryId）、`forge.confirmation`（key=taskId）；R：`forge.execution`（key=`{tenantId}-generation-{inputFingerprint}`——**收敛身份现成**）；S：`forge.tenant`（key=tenantId，release pin/推荐状态）；平台面（TemplateRelease promotion）留 control 身份域，不建租户实例 |
| I | 命令入口/拒绝路径 | 各 E 实例即命令入口；HARNESS_PLAN_MISMATCH/HARNESS_NOT_READY/evidence_insufficient/integrity_failed → `rejected(code)`（现状 typed 409/422 直接映射）；UNKNOWN **不是拒绝也不是失败**（见 §3 effect 三值） |
| J | Mutation Ownership | 见 §7；append-only revision 语义（ContentArtifact/审计）与 B1 revision 单调天然契合 |
| K | 外部事件/超时 | Ingress：inbound email/whatsapp webhook（unique(channel,providerEventId)+payloadFingerprint 重放检测）、Formula accepted+jobId 轮询/回调、GSC 定时同步、reconcile 轮询、发布节流延迟重入队、视频 published 人工回填；超时：AI Runtime deadline、BullMQ attempts/backoff、lease 60s |
| L | 破坏性变更重建 | pin 契约（TemplateRelease/FactSnapshot/harnessPlanFingerprint）+ append-only revision + immutable snapshot 使执行可从 pin 重放；换代=新 fingerprint 新 lineage（planExecutionRegeneration 既有语义） |

**判定结论：适合（同构度最高的项目之一）**。effect 三值（SUCCESS/…/UNKNOWN + ConsumerJobError 三分 Retryable/Terminal/UnknownOutcome）、幂等键（idempotencyKey unique + effectKey + 收敛 executionEventId）、compare-before-apply CAS、outbox+lease、durable reconcile——**v0.3 PRD Track A 的几乎每条语义 Forge 都已有自建实现**；迁移是"把自建执行语义交给 Runtime 承接"，而不是发明新语义。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `forge.page` | E | pageId | draft→translated→gated→(needs_review\|blocked)→queued→published | P2（内容规划命令前 ensureOpen） | 内容流水线+发布流程命令入口 |
| `forge.video` | E | videoId | scripted→rendering→awaiting→pack_ready→published(回填) | P2（POST /api/videos 语义） | 渲染长作业 E 循环 |
| `forge.execution` | R | `{tenantId}-generation-{inputFingerprint}` | pending→generated/failed（revision 追加） | IngressAdapter/P2（outbox 派发点） | 收敛身份=既有 deriveExecutionEventId；结果回流 page/video E |
| `forge.inquiry` | E | inquiryId | received→analyzing→qualified→responding→closed | Ingress（webhook 幂等落 InboundEvent 后） | 询盘抽取/资格判定/RFQ |
| `forge.confirmation` | E | confirmationTaskId | open→in_review→resolved/reopened | P2/事实入库流 | 人工事实确认+幂等 Cairn 写回 |
| `forge.tenant` | S | tenantId | 长期 | P2 | release pin 态势、推荐状态、节流账本 |

**双身份域纪律**：以上全部是租户域实例；TemplateRelease promotion / Pattern·Recipe review / operator 面属 **control 身份域**（PlatformUser，无跨域 FK）——建 `forge.platform`（S，key=platform）实例族或保持 Direct+审计，二选一由 owner 定；本草案默认 Direct+审计（promotion 是低频人工治理动作，INV-06/07/08 闸门已在服务层）。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml                # id: forge
├── workflows/page.yaml · video.yaml · execution.yaml · inquiry.yaml · confirmation.yaml
├── skills/                     # §8
├── tools/ · projections/       # [G9] 见 §3/§6
├── business-sources/           # [G2] 见 §4
├── schemas/                    # HarnessExecutionPlanV29{generationState,requiredFactStates}、HarnessFormSpec、
│                               #   TradeCreativeBriefV2952（version 字段冻结）、ContentArtifact、
│                               #   validateCanonicalOutput 输出形状 {outputs:[{channel,locale,text}]}（白名单+
│                               #   完整覆盖 requestedChannels×requestedLocales+结构性拒绝 provider/model/tier INV-22）、
│                               #   ExternalInvocation 状态机、publishPack{effectKey,…}、InboundEvent
├── rules/                      # 治理层：INV-06..12/19..23/28/30、BLK-003/009/012、红线#2(节流排期不失败)
│                               #   #3(title/meta 只来自 verified 关键词)、NEVER_INVENT 禁造清单、
│                               #   publication-integrity 四类不可变事实（exact_token/formatted_identifier/
│                               #   numeric/numeric_with_unit，禁 silent unit conversion，歧义 fail-closed）、
│                               #   "生成成功≠域成功 fail closed"
└── references/                 # FOUNDATION（Projection-not-invention 原则）、RELEASE_BASELINE、
                                #   trade-packs/industry-packs 语料索引（core→industry→market→channel→tenant 分层）
```

`page.yaml` 要点（其余同构从略）：

```text
init              只收 Restore{pageSnapshot}；按 PageStatus 路由七态（blocked/needs_review 是可见失败相位，
                    不 recovery_required——技术故障除外）
draft             ContentPlanned → plan_check（invoke load_generation_plan_for_pins：服务端重投影比对
                    harnessPlanFingerprint；mismatch→rejected(HARNESS_PLAN_MISMATCH)；blocked/needs_input→
                    rejected(HARNESS_NOT_READY){missingFields}）→ translating
translating       invoke run_content_pipeline（生成→翻译→回译→gates；每 gate 落 GateRun 行；红线#3 校验）
                    → gated / needs_review（gate 判 NEEDS_REVIEW）
gated             RequestPublish → queued（**节流检查：超限不失败**，自动排期下一槽位+延迟重入队 [G6 定时器]）
queued            发布执行（单一属主 BLK-003）：invoke precheck_publish（重查 blocked/needs_review locale——
                    防 out-of-band 变更）→ R3 硬阻断闸 → snapshot_resolve（首建 approved-only immutable
                    snapshot 持久化 AuditLog；retry 按"最新 publish 观察晚于 snapshot"判定复用 S08）
                  → deploying（invoke deploy_snapshot：renderSite→validateHreflangCluster→CF Pages
                    snapshotId compare-before-apply INV-21）
                  → outcome=applied → announcing（PublishLog+Page.published+Audit 单事务 INV-28/30）→ published
                  → outcome=unknown → awaiting_reconcile（静止；ExternalInvocation=unknown，只经 reconcile 收敛）
published         Republish/Retire → 重走 queued · ReconciliationResolved(Ingress) → 按决定性证据 applied/failed
video.yaml：scripted → rendering（invoke start_render：YISHU 本地化 fail-closed→质量 gate→effectKey 重放守卫
  （已 pack_ready 且 effectKey 相同→audit replay 直接返回）→禁词闸→月度成本上限→HyperFrames strict→
  compareBeforeApply stale 拒绝）→ awaiting（外部渲染作业）→ RenderFinished(Ingress)/RenderTimedOut →
  pack_ready / render_failed（可见失败相位+blockedReason）→ published 由人工回填命令
execution.yaml（R）：init→Restore→dispatched（outbox 派发点）→ invoking run_generation
  （verifyPinnedRelease compare-before-start，加载态与 pin 不符 fail-closed）→ ai_calling
  → outcome=SUCCESS → validating（invoke validate_canonical_output 确定性域校验）→ compare-before-apply CAS
    落 ContentArtifact（同 fingerprint 续 revision+1，异 fingerprint 开新 lineage）→ announcing → final
  → outcome=TIMEOUT/语义不明 → unknown_hold（静止；**不映射 failed/success**——可能已计费；
    只经 reconcile probe 决定性证据收敛）→ …
  → outcome=UPSTREAM_REJECTED/INVALID_RESPONSE → failed（终态；重跑=新 R 实例）
in-flight pin 取代：promotion 并发发生时**永不重定向，按 pin 完成**（INV-11，resolveExecutionPinCurrency 语义）
```

## 3. Domain Tool 声明（RawToolDefinition）

**effect 三值的现成实现必须保留**：`runConsumerEffect`（ARC-005：deriveConsumerEffectKey{domain,tenantId,businessKey,inputFingerprint} + compareBeforeApply + ConsumerJobError 三分 Retryable/Terminal/**UnknownOutcome**）直接映射 journal 语义；`ExternalInvocation` 状态机（succeeded 终态、history-rewrite 拒绝、同态重放 replay-noop、unknown 只能经 reconcile）映射 recovery 语义。

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `runGeneration`（AI Runtime） | non-idempotent（计费）→三值 | remote | pin 契约+plan → `{outputs:[{channel,locale,text}]}`（白名单字段、完整覆盖、结构性拒绝 provider/model/tier） | 重试复用同 idempotencyKey（INV-20 unique）；TIMEOUT→**unknown** 绝不映射 failed/success | http-transport@1 / resourceKey=aiRuntime |
| `compileTradeCreativeBrief` | none | expression/script | approved facts+intent policies → 冻结 brief（version 字段；证据不足 throw TRADE_CREATIVE_EVIDENCE_INSUFFICIENT；minApprovedItems 下限） | 纯函数（同 pin⇒字节相同+fingerprint 相等 INV-20/21） | expression-jsonata@1 |
| `checkPublicationIntegrity` | none | script | 四类不可变事实校验 → PASS/NEEDS_REVIEW/FAIL（歧义 fail-closed；禁 silent unit conversion） | 纯函数 | script-execution@1 |
| `runFormulaImage/Video` | non-idempotent→三值 | remote | Operation API v1（accepted+jobId/completed+result 信封） | fp_v1 稳定幂等身份 + runConsumerEffect；VIS-002 readiness/成本/时延不过→一等 DEFERRED（不触外调不本地替代） | resourceKey=formula |
| `localizeViaYishu` | non-idempotent→三值 | remote | requestId=`{videoId}:{knowledgeSourceFingerprint}` 派生 | fail-closed：不可部署结果→render_failed，无本地 fallback | resourceKey=yishu |
| `renderHyperFrames` | idempotent | remote/project | strict:true 渲染 → inputFingerprint 回显 | compareBeforeApply stale 拒绝；输出路径含 planFingerprint（内容寻址） | resourceKey=hyperframes |
| `deploySnapshot` | non-idempotent→三值 | remote | approved-only snapshot → CF Pages | snapshotId 回显比对；audit publish 观察作为 retry 判定 | resourceKey=cloudflare |
| `writeBackCairn` | idempotent | remote | resolve 结果 → Cairn | cairnWriteId 幂等 | resourceKey=cairn |
| `dispatchOutbox` | idempotent | **由 Runtime mailbox 承接**（迁移期保留既有 dispatcher） | claim+lease 60s → at-least-once（不宣称 exactly-once） | outbox 行状态 CAS | — |
| `recordInbound` | idempotent | project/Ingress | webhook → InboundEvent | unique(channel,providerEventId)+payloadFingerprint 重放检测 | `forge.appStore@1` |
| `reconcileInvocation` | none（probe 只读观测） | project | unknown 行 → 决定性证据收敛（SUCCESS/UPSTREAM_REJECTED/INVALID_RESPONSE）或保持 unknown（UNAVAILABLE=live-blocked≠terminal） | 结构上无 blind retry 路径 | 同上 |

**[现状缺口]** 图片同步路径（`/api/images/trade` 请求内直连 Formula，30s 超时即 UNKNOWN 但无 durable reconcile 记录）——迁移时必须并入 `forge.execution` R 实例语义，消除与视频/文本路径的幂等纪律不一致。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `forge.page` | pageId | PageStatus+translations 态+GateRun 摘要+PublishLog 节流账本 | 行版本+max(gateRun) | RLS 租户隔离在 Provider 连接（GUC） |
| `forge.generationPlan` | tenantId（或 pin 集） | HarnessExecutionPlanV29{generationState, requiredFactStates[]}（**UI 与执行同源投影**） | plan fingerprint | 即 FOUNDATION "Projection not invention" |
| `forge.facts` | tenantId | TenantFactSnapshot pin+truth states（confirmed/candidate/unknown/conflicted）+risk markers | snapshotHash | 只存 Cairn/dx refs |
| `forge.video` / `forge.inquiry` / `forge.confirmation` | 各 id | 状态+effectKey/analysis 摘要+outcome 枚举 | 行版本 | |
| `forge.invocations` | tenantId | unknown/pending ExternalInvocation 摘要（reconcile 态势） | max(observedAt) | |
| `forge.releases` | templateKey | TemplateRelease pin（current/superseded）+releaseHash | release 行版本 | control 域数据以只读快照进租户投影（不跨域 FK——用值传递） |

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `trade-harness-release:{pack}` | TradeHarnessPack 分层语料（core→industry→market→channel→tenant；immutable TradeHarnessRelease pin pack revisions/content hashes） | compileTradeCreativeBrief 输入 | FROZEN |
| `claim-policy` | NEVER_INVENT 禁造清单 + prohibitedClaims + minApprovedItems 证据下限 + buyer stage/question 裁决规则（answerPolicy ALL/ANY_CONFIRMED/MANUAL_ONLY） | brief 编译闸 | FROZEN |
| `harness-rules:{revision}` | HarnessRuleRevision（**只有 accepted 的不可变规则可执行**；candidate/rejected 不进包） | generationState 判定 | CONTROLLED（INV-08：只有 operator review 可 promote） |
| `integrity-classes` | publication-integrity 四类不可变事实定义+单位换算禁令 | checkPublicationIntegrity | FROZEN |
| `media-style-registries` | Site 12 风格 / Image 10 风格 / Video 8 风格 registry（v2952） | 媒体 plan builder | CONTROLLED（v2.9.3.1 renderer recipes 为兼容层） |
| `r3-policy` | 高危声明扫描规则+发布硬阻断清单 | publish 闸 | FROZEN |
| `throttle-policy` | 发布节流（unique(siteId,date) 计数+下一槽位排期规则） | queued 相位 | CONTROLLED |

**[G1]**：trade-packs/industry-packs/templates 语料是天然 compiled domain data 资产（已 immutable+hash pin）；入包后以 packageId 钉住，替代散落的 fingerprint 手工比对。

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `forge.page-state` | pageId | wf page/execution + business page/generationPlan/facts + domain-data throttle-policy/integrity-classes | 信封 + body{pageStatus、gates 汇总、plan.generationState、requiredFactStates、节流槽位、snapshot pin} |
| `forge.video-state` | videoId | wf video + business video/invocations + domain-data media-style-registries | render 相位、effectKey、成本账（月度上限余量）、unknown 高亮、published 回填态 |
| `forge.inbox-state` | inquiryId | wf inquiry + business inquiry | analysis（running/completed/failed/retry）、qualification{reasons[],confidence}、missingInformation、RFQ 态 |
| `forge.creation-state`（/create 页） | tenantId | wf tenant?（或纯 business）+ generationPlan + releases | 模板优先创建视图：release pin、form spec、执行历史 |

集合视图（home/create/inbox/content 四面 + knowledge/keywords/sites/analytics/videos/backtranslate/r3/lab + operator 面）走 P4 读模型；**operator 面投影严格留在 control 身份域**（不出现在租户导航——既有分离纪律进 §22 自动检查）。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Page.status/PageTranslation | Message → forge.page → run_content_pipeline/transitionStatus（单一实现） | Tool | M1、M2（BLK-003 单一属主） |
| PublishLog/发布快照/CF 部署 | Message → forge.page（queued 相位链） | Tool | M3、M4（INV-21/28/30） |
| ContentArtifact 链 | Message → forge.execution → CAS 落盘 | Tool | M4、M5（append-only revision INV-12） |
| Video.status/publishPack | Message → forge.video | Tool | M2、M3（effectKey） |
| ExternalInvocation/OutboxEvent | Tool 同事务登记（INV-19/20） | Tool | M4（unknown 收敛纪律） |
| Inquiry/InquiryAnalysis | Message → forge.inquiry（Ingress 触发） | Tool | M2 |
| ConfirmationTask.outcome + Cairn 写回 | Message → forge.confirmation（人工命令） | Tool | M3、M4（cairnWriteId 幂等；not_public 阻断发布） |
| BuyerQuestion/FactSnapshot 确认态 | Message → forge.confirmation / 事实入库流 | Tool | M1（answerPolicy 依赖 confirmed 态） |
| TemplateRelease/Pattern/Recipe promotion | Direct（control 域 operator review，INV-06/07/08 闸）+ 失效信号 | 平台服务 | 低频人工治理；审计双表 |
| R3Claim/Keyword/GlobalSignal | Direct（operator 面）+ 失效 | 平台服务 | 读侧消费经投影 |

## 8. Skills / AI 任务（v0.3 Track B）

| skillId | scope | 触发点 | output contract | envelope 要点 |
|---|---|---|---|---|
| `content-generate` | Domain | forge.execution | `{outputs:[{channel,locale,text}]}` ——**确定性域校验 validateCanonicalOutput 后才入 workflow**（"生成成功≠域成功"）；结构性拒绝 provider/model/tier 字段 | allowed context=pinned plan+approved facts；budget 归 AI Runtime；validation repair=新的链接 operation（不在 validator 内藏调用） |
| `pipeline-steps`（生成/翻译/回译/llm-judge/multi-model gates） | Domain | run_content_pipeline 内 | 各 gate 输出落 GateRun | **双轨警戒**：legacy LlmRouter 与 AI Runtime 边界并存——迁移统一走 AI Runtime，legacy 轨标注 deprecated |
| `inquiry-extract` / `inquiry-qualify` | Domain | forge.inquiry | extractedRequirements/completeness/qualification{reasons[],confidence}/missingInformation（可解释）；RFQ requirements 由 Harness 数据驱动无猜测默认值 | produce-result-only |
| `r3-claim-scan` | Domain | publish 前 | 未绑定声明清单（LLM judge 辅助） | **判定权在确定性闸**：扫描结果→R3 硬阻断规则裁决 |
| `trade-intent-router`（新增） | **Control** | 租户自然语言入口 | typed Proposed Domain Command（PlanContent/RequestPublish/…） | propose-only [G8]；契约校验后进 durable message |

边界（既有=目标）：AI Runtime 拥有 model/weak-strong/critic/judge/consensus/escalation；Forge 拥有 goal/context/harness/约束/FormSpec/capability allowlist/human gate/domain validation/Evidence/replay-shadow（AI-RUNTIME-BOUNDARY.md 分工表与 v0.3 PRD §7 逐条对应）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| inbound email/whatsapp webhook | `inbound:{channel}:{providerEventId}` | forge.inquiry | 推进 | unique+payloadFingerprint 重放检测既有（BLK-009） |
| Formula job 完成 | `formula:{jobId}` | forge.execution / forge.video | 推进 | 现状 accepted+jobId 轮询；回调接线后与超时共用 messageId |
| HyperFrames/渲染完成 | `render:{effectKey}` | forge.video | 推进 | effectKey 重放守卫既有 |
| reconcile 收敛 | `reconcile:{invocationId}:{evidenceHash}` | 对应 E/R | 推进（决定性证据才收敛） | durable scan 保留为 P2 调度器职责 |
| GSC 同步 | `gsc:{siteId}:{date}` | —（仅失效 analytics 读模型） | 失效 | JobScheduler 定时既有 |
| 发布节流重排 | `publish:{siteId}:{slot}` | forge.page | 推进（延迟重入队） | **[G6]** 持久定时器；现状 BullMQ delay |
| 视频 published 回填 | 人工命令（非 Ingress） | forge.video | 推进 | 陪跑/客户人工 |

## 10. Target Host Profile 与 capability 需求

```yaml
# host-profiles/forge-server.yaml
platform: node-server              # web + worker 双进程；DomainHarness Runtime 落 worker 侧（消费 outbox 语义移交 mailbox）
capabilities: [expression-jsonata@1, script-execution@1, http-transport@1, secure-random@1, crypto-hash-sha256@1,
               postgres-runtime-store@1]   # ⚠ 平台缺口：RuntimeStore 现状 sqlite-only——按 runtime-store-conformance
                                           #   套件补 PG 适配器（与 xcrossify 同一缺口，可共建）[L2]
projectBindings:                   # [G3/PRD-CR-1]
  forge.appStore@1: { module: bindings/app-store.ts, resources: [appRuntimeDb] }   # RLS GUC 租户连接，BLK-012 fail-closed
runtimeResources(resourceKey): appRuntimeDb(forge_app_runtime), dispatcherDb(forge_dispatcher_runtime 最小权限),
  redis, aiRuntime, formula, yishu, hyperframes, cloudflare, cairn, dx, r3, videoOutputDir
# host-profiles/forge-local.yaml（local-runtime profile）：sqlite-runtime-store@1 + local_job 队列 + 确定性 LLM
#   —— 对应 v0.3 demo §26.3 的 deterministic fake AI 路径；拒绝 production 语义保留
```

DB 角色三分映射：Runtime/binding 只用 `forge_app_runtime`（RLS）与既有最小权限角色；迁移/schema 所有权留在 `forge_app_admin`（Runtime 启动不建表的纪律与 xlearn 一致）。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| appStore 写 Tool | **[G3]/PRD-CR-1** | binding=既有 service 方法（runConsumerEffect 纪律原样保留） |
| MISMATCH/NOT_READY/evidence_insufficient = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；typed 409/422 直接映射 |
| execution pin 契约/unknown_hold 跨消息保持 | **[G5]** | S2：pin 列与 invocation 行已是业务数据（现状即可） |
| ensureOpen（五类实例）+ 节流/reconcile/GSC 定时 | **[G6]** | BullMQ delay/JobScheduler 先行，P2 调度器统一 |
| Plan/FormSpec/Brief schema 入包 | **[G2]/[G9]** | zod schema 现成（media-design-v2952），导出 JSON Schema |
| Skill envelope/双轨统一 | **[G8]** | AI Runtime 边界已冻结（INV-22/23 静态守卫）；legacy LlmRouter 轨迁移期标注 |
| trade-harness 语料入包 | **[G1]** | 已 immutable+hash pin，编译入包即可 |
| 类型化执行客户端 | **[G7]/L2-6** | use-content-execution 状态机语义进生成契约 |
| RuntimeStore PG 适配器 | 平台缺口 | 与 xcrossify 共建 conformance 实现 |

## 12. 迁移路径建议

1. **只读接入**：generationPlan/facts/page Provider + `forge.page-state`/`forge.creation-state` Projection（/create 与 /content 切 view/watch；"One semantic source" 原则从代码约定升级为包内契约）；
2. **执行 R 实例**：`forge.execution` 承接内容执行（outbox+dispatcher 语义移交 Runtime mailbox/journal；deriveExecutionEventId=收敛身份原样进 instanceKey；unknown_hold 相位接 reconcile Ingress）；**同步收编图片路径缺口**；
3. **页面/视频 E 实例**：发布流程（节流/快照/部署/单事务落库）与视频渲染（effectKey/成本上限/stale 拒绝）迁入；BLK-003 单一属主由 per-instance serialized lane 天然保证；
4. **询盘/确认 E 实例**：webhook Ingress + 资格判定 + ConfirmationTask 人工闸；
5. **AI Scoped 化**：content-generate/inquiry/r3 Skill 按 §8；legacy LlmRouter 双轨收敛到 AI Runtime 边界；
6. **平台面保持 Direct**：TemplateRelease/Pattern/Recipe promotion 留 control 域（INV-06/07/08 闸不动）；trade-harness 语料随包版本化后，promotion 产物→新包发布的通道由 G1/G9 编译管线承接。
