# YISHU（译枢）领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/yishu` @ v2.8.2 "Storage & Validation Closure"（TypeScript monorepo：`packages/core` 纯领域逻辑无 I/O、`packages/server` Hono、`packages/admin-ui` Next BFF；YishuStore：SQLite 默认/PostgreSQL 可选；Git 持有已发布配置真值）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20
**Date:** 2026-09-20

> 仓库不变量直接构成本草案红线（`docs/INVARIANTS.md` 26 条）：**AI 无批准权**（#1/#3/#13/#14：Skill 输出只能进 candidate/evidence 通道）；**hard gates 对全部结果来源成立**（#2：AI/TM/cache/enum/phrase/human/repair 一律过闸，无阈值无松紧）；**cache≠TM**（#10）；**raw/canonical 分离**（#7）；**Git=已发布真值、YishuStore=运营状态**（#15 双 SoR 分工）；**单写者 Git**（多实例需 PG advisory lock，明确不做）。
>
> 切分纪律（General Design v0.2 §19 既有结论）：**workflow 按 Document/Scope，绝不按段落**——段落状态放业务数据，每段翻译是 instance 内的一次 Tool/Skill 调用；批量翻译走长耗时作业模式。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | Git 侧：Published Config（rules/terms/phrases/enums/cases/chars/naming，按 `<direction>/<domain>/` 级联）、Capability Pack、PublishedBehaviorRevision（追加式注册表）；Store 侧：Candidate（三源合流 manual/import/llm）、DraftRow、ImportKeyRow（confirmed 译名禁覆盖）、TranslationReview（fingerprint 去重）、CorrectionEvent（append-only 证据）、TranslationMemoryEntry（origin 分级；**当前无生产写入路径**）、EntityRecord、SessionStateV2（revision 乐观并发）、DocumentMemory（有界 recentSegments）、CaseRun/EvaluationSnapshot、Settings |
| B | 长期/可恢复流程 | 翻译执行（同步每请求 13 步：planning seam→bypass 探测→ExecutionRoute→生成→hard gates→有界 repair(链深1)→restore→缓存写门→provenance，`core/src/translate.ts`）；知识治理/发布（candidate→confirm→draft→publish 回归 gate→git commit+tag→behavior revision→清 draft；**流程状态=数据位置，天然可恢复**）；导入（preview→commit 服务端重分类+10% 强制抽样）；审核/纠错环（flagged→review queue→resolve/ignore+CorrectionEvent） |
| C | 领域能力（Tool） | normalize/applyTerminology/validateTranslation（确定性零模型 #19）、translateSegment（provider 调用）、repair（linked operation）、confirmCandidates、publish/rollback（TOCTOU 守卫）、commitImport、TM/entity/importKey upsert 族、addCorrectionEvent、backupPush |
| D | 业务 SoR | **双 SoR**：Git（isomorphic-git `data/repo`，tag 化发布）+ YishuStore（SQLite `yishu.db` WAL/FK/busy_timeout 5000，或 PG）；文档全文 SoR 在**调用方业务系统**（YISHU 只有 documentId+有界窗口） |
| E | 每实体组合视图 | KnowledgeDynamicState（每 direction/domain scope）≈ EffectiveProfileDryRunDto 素材（resolvedPacks+conflicts+bypass 探测+ExecutionRoute+三类 fingerprint）+ 候选/草稿/评审队列态势 + PublishPreview（新失败/新通过/blocked）；TranslationDocumentDynamicState 由**调用方项目**持有 |
| F | 只是交互/本地状态 | Admin UI 13 页导航/表单态；文件编辑器草稿态 |
| G | 宿主绑定 | Node server（Hono :4180）+ Next BFF（HttpOnly session→服务端注入 Bearer #26）；SQLite/PG；文件系统+Git 工作树；出网 DeepSeek/AI Runtime（SSRF 防护：私网/loopback 默认拒绝）；**无队列/无 worker/无定时器** |
| H | E/R/S 划分 | S：`yishu.knowledge`（key=`{direction}/{domain}`，治理与发布的串行化 lane）；E：`yishu.document`（key=documentId，**由调用方项目宿主运行**，段落进度在其业务数据）；R：批量翻译作业（E 循环 + jobs 表，§9.5 模式） |
| I | 命令入口/拒绝路径 | 治理命令全发 `yishu.knowledge`；publish 回归 gate 新失败 → `rejected(regression_blocked)`（现状=API 阻断，无强制发布入口）；TOCTOU 草稿集变化 → rejected；文档命令发 `yishu.document`（调用方侧） |
| J | Mutation Ownership | 见 §7；Git 写只在 publish/rollback Tool（单写者串行 lane 天然匹配 per-instance serialized lane） |
| K | 外部事件/超时 | Ingress：AI Runtime operation 完成（若异步化，idempotencyKey 已就绪=canonical request SHA-256）、session TTL 过期（现状惰性判定）、定时备份；超时：provider AbortController（http 10s/DeepSeek 30s）、GenerationProfile.timeoutMs、Runtime budget.maxLatencyMs |
| L | 破坏性变更重建 | 发布真值在 Git（tag 可回滚）；运营状态在 Store；behavior revision 注册表重启从 repo bootstrap 重建（既有设计）；Restore 按 {active tag, draft 集, 队列计数} 路由 |

**判定结论：适合**——知识治理/发布是教科书级长寿命治理 workflow（人工步骤序列 + 回归 gate + 串行化写者）；翻译执行保持同步 Tool 语义（不必 workflow 化每段）。最大机会：**Knowledge Promotion（CorrectionEvent→trusted TM）显式 deferred、TM/entity 表无生产写入路径**——正是"长寿命治理 workflow"的空位（但严禁自动 promotion，#12）。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 备注 |
|---|---|---|---|---|---|
| `yishu.knowledge` | S | `{direction}/{domain}`（如 `zh-my/medical`） | 与知识域同寿 | P2 Provisioner（域首次创建/激活 reconcile） | 治理与发布串行 lane；candidate 审核、draft、publish、rollback 全在此 |
| `yishu.document` | E | documentId | 与调用方文档同寿 | **调用方项目**的 P2（YISHU 作为远程翻译能力被其 Tool 调用） | 段落状态在调用方业务数据（S2）；YISHU 侧只有 DocumentMemory 有界窗口 |
| （批量作业） | E 循环 | 同 `yishu.document` | idle→submitting→awaiting→recording→idle | — | 长耗时批翻走 §9.5 作业模式，jobId 存业务 jobs 表 |

- 翻译会话（SessionStateV2）已有 revision 乐观并发与 TTL，**不建实例**：保持同步 API + Direct 语义（§7）。
- correlationId：knowledge=scope key；document=documentId。

## 2. Raw Domain Package 骨架

```text
domain/
├── harness.yaml               # id: yishu
├── workflows/
│   └── knowledge.yaml         # S 实例治理流（下详）
├── skills/                    # §8：translate / repair / analyze / generate-candidates
├── tools/ · projections/      # [G9] 见 §3/§6
├── business-sources/          # [G2/L2-8] 见 §4
├── schemas/                   # Candidate、DraftRow、TranslationReview、CorrectionEvent、
│                              #   TranslateResultDto（checks/route/flagged/provenance）、
│                              #   PublishPreviewDto、AnalyzeOutput[{i,suspicion,reason}]、
│                              #   GenerateOutput[{source,candidates[]}]（后两者现成 JSON 硬解析契约）
├── rules/                     # 治理层：26 条 INVARIANTS（尤其 AI 无批准权、gates 无豁免、
│                              #   cache≠TM、raw/canonical 分离、单写者 Git、secret 纪律 #20/#26）
└── references/                # GLOSSARY（ExecutionRoute/ContextPack/revision/promotion 术语）
```

`knowledge.yaml` 要点（W1–W6、R1–R4）：

```text
init                只收 Restore{governanceSnapshot}；按数据位置路由：
                      有 draft 集→drafting · 仅队列→curating · 兜底 curating
curating            静止：CandidateConfirmed/CandidateRejected（人工，Admin UI 命令）
                      → invoking confirm_candidates（先全量预校验再写，避免半提交；LLM 来源与
                         抽样组禁批量确认在服务端强制）→ curating
                    ImportCommitted → invoking commit_import（提交时刻服务端重跑分类，
                      不信任客户端 disposition；同 key 更新不堆重复；ceil(10%) 抽样）→ curating
                    CandidatesGenerated（Skill 产物回流，§8）→ curating（只入候选队列）
drafting            静止：SaveDraft/DiscardDraft → invoking draft_write（Direct 亦可，见 §7）
                    RequestPublish → previewing
previewing          invoke publish_preview（纯读：用已发布配置重跑 evaluation cases，
                      产出 新失败/新通过 对比 + blocked 判定；TOCTOU 记录草稿集指纹）
                    → publish_ready（静止）/ publish_blocked（静止，展示新失败清单，无强制发布入口）
publish_ready       ApprovePublish（人类）→ invoking publish（TOCTOU 守卫：指纹不符→rejected(stale_drafts)；
                      回归 gate 新失败→rejected(regression_blocked)；成功=git commit+tag+behavior
                      revision 追加+清 draft，单事务/单写者 lane）→ announcing(Published) → curating
published(任意静止) Rollback{tag} → invoking rollback（反向提交+active 指针移动，非破坏）→ curating
                    Close（W5）→ final
全部静止状态接受全部入站消息类型，不适用者 → {S}__reject（W3/R4）
```

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `translateSegment` | non-idempotent（provider 计费） | remote / AI Runtime port | `{text, direction, domain, sessionId?, documentId?, sequence?}` → TranslateResultDto（**输出=纯文本+checks+provenance**；空输出=显式 EmptyTranslationError 不降级） | Runtime 路径 `computeIdempotencyKey`=canonical request SHA-256（禁换 key 重试）；singleflight+L0/L1 缓存降压 | http-transport@1 / resourceKey=aiRuntime 或 llmDirect |
| `repairSegment` | non-idempotent | remote | linked Operation B（parentIntent='TRANSLATE' 类型层限定，链深=1）；repair 后**完整重跑 gates** | parentOperationId/operationGroupId | 同上 |
| `validateTranslation` | none | expression/script | runChecks（6 gates 固定序：zawgyi→target-script→protected→quantities→terms→names；zawgyi 失败其余 skip）+ estimateQualityRisk；**零模型调用（#19）** | 纯函数 | expression-jsonata@1 |
| `applyTerminology` / `normalize` | none | expression | AC 自动机匹配/normalizeForMatch/ForOutput（raw/canonical 严格分离 #7） | 纯函数 | 同上 |
| `confirmCandidates` | idempotent（事实性 exactly-once） | **project** [G3] | `{candidateIds[], edits?, commandId}` → CommandResult（成功后候选被删，重放=rejected(already_processed)） | 先全量预校验再写 + applied_effects | `yishu.store@1` |
| `commitImport` | idempotent | project | 批次 → `{new/skip/review 计数}`（服务端重分类） | 同 key 同文 skip / 变文更新既有条目 | `yishu.store@1` |
| `publishConfig` | non-idempotent | project | `{scopeKey, draftsFingerprint, commandId}` → CommandResult{outcome, tag?}（TOCTOU+回归 gate，R3 结构化 outcome） | git tag 不可变；重放=新 tag 被 gate 阻断 | `yishu.gitStore@1`（**单写者：必须落在 S 实例串行 lane 内**） |
| `rollbackConfig` | non-idempotent | project | `{scopeKey, tag}` → CommandResult | 反向提交+指针移动，重复回滚同 tag=幂等重放 | 同上 |
| `resolveReview` | idempotent | project | `{reviewId, resolution, humanCorrection?}` → CommandResult；附 correction 时**同事务** append CorrectionEvent（证据，不自动晋升 #12） | review 状态已决→rejected(already_settled) | `yishu.store@1` |
| `promoteToTM`（**新增，补 deferred 空位**） | idempotent | project | `{correctionEventIds[], targetOrigin: human\|reviewed}` → CommandResult；**仅人工命令触发，AI 提案只能进候选** | applied_effects + origin 分级校验 | 同上 |
| `upsertSession/DocumentMemory` | idempotent | project | revision guard（sequential 强制 revision+1；parallel 冲突重读重试一次） | 乐观并发 409 | 同上 |
| `backupPush` | idempotent | remote | push 分支+全部 tag | 标签不可变，同 oid 重推 no-op | http-transport@1 / resourceKey=gitRemote |

**红线**：`publishConfig`/`promoteToTM`/`resolveReview` 的**批准语义只能来自人类命令**——任何 Skill/自动化产出都不得直接触发（INV #1/#3/#13/#14 映射 v0.3 PRD §9–10 produce-result-only）。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `yishu.governance` | `{direction}/{domain}` | {activeTag, activeRevisionId, draftCount, draftsFingerprint, queueCounts{manual/import/llm}, openReviews, lastPublished} | git tag/oid + store 单调计数（B1/B2） | 双 SoR 聚合在一个 Provider 读事务内（B3 按源一致） |
| `yishu.candidates` | 同上 | 候选队列摘要（按 origin 分组；LLM 来源与抽样组标记） | max(updatedAt) | |
| `yishu.reviews` | 同上 | open review 摘要（确定性 severity 投影：gate 权重派生） | 计数+max | advisory 标注不入 revision（stale fencing 在 Tool 侧） |
| `yishu.evaluation` | 同上 | 最新发布 CaseRun 基线摘要（新失败判定的对比锚点） | releaseTag+scope+caseId | |
| `yishu.documentMemory` | documentId | recentSegments（有界默认 8）+decisions+pinnedProfile | revision | 调用方宿主使用 |

## 5. Compiled Domain Data

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `hard-gates` | 6 gate 定义与固定顺序、失败处置分岔（machine→逐字节返回原文；human→flagged） | validateTranslation/路由 | FROZEN（#2 无豁免） |
| `execution-routes` | exact/light/context/session/high-risk 判定规则 | planning seam | FROZEN |
| `bypass-policy` | trusted-origin exact TM/enum/phrase 可 bypass 生成，**但命中也必须过完整 gates，被拒落回生成路径** | translate 路由 | FROZEN |
| `prompt-compilation` | 确定性 prompt 编译规则：rules.md+命中术语+角色性别（chars.tsv 缅语人称强制）+≤8 相关案例+protected placeholder；版本化 compiler | translate Skill | CONTROLLED（同配置同输入→同 prompt，回归可重放） |
| `repair-policy` | risk≠low 触发、链深=1、repair 后完整重跑 gates、repair_context ≤256KiB | repair | FROZEN |
| `sampling-policy` | 导入 ceil(10%) 强制抽样；LLM 来源禁批量确认 | commitImport/confirm | CONTROLLED |
| `tm-origin-policy` | origin ∈ human/reviewed/published-case/machine；仅 trusted 参与 exact bypass；fuzzy 恒 canBypass:false | promoteToTM/bypass | FROZEN |

**[G1]** 带外提供；这些规则现固化在 `core/src/**` 纯函数中——入包不改变执行位置（core 仍是权威实现），包内副本供 Projection/路由声明引用，以 packageId 钉住防漂移。

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `yishu.knowledge-state` | `{direction}/{domain}` | wf `yishu.knowledge` + business governance/candidates/reviews/evaluation + domain-data sampling-policy | 治理阶段（curating/drafting/publish_ready/blocked）、队列态势、drafts 指纹、publish 预览（新失败清单）、active tag/revision、open reviews（severity 排序） |
| `yishu.document-state`（调用方宿主） | documentId | wf `yishu.document` + business documentMemory + 调用方段落业务源 | 段落进度（业务数据）、flagged 段、pinned profile、session 态势 |

信封照 TEMPLATE §6；`availableActions`：publish 仅在 publish_ready 且人类角色时 enabled（**决策参考非授权**：服务端 gate 才是权威）；`lastOutcome`=publish/confirm 的 applied/rejected(code)。集合视图（domains 树、files merged 视图、history=git log+tags、sessions 列表）走 P4 读模型。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| Git 已发布配置（terms/phrases/rules/…） | Message → yishu.knowledge → publishConfig/rollbackConfig | Tool（单写者 lane） | M1（TOCTOU 串行化）、M2、M3、M4 |
| BehaviorRevision 注册表 | publish Tool 同事务追加 | Tool | M2（pin 语义） |
| Candidate 队列（confirm/reject） | Message → confirmCandidates | Tool | M1（发布 gate 依赖 draft 集完整）、M4 |
| DraftRow | Direct（PUT/DELETE /api/files/draft，带格式校验）+ 失效信号 | Admin UI 服务 | 无流程依赖（publish 时 TOCTOU 指纹兜底） |
| ImportKeyRow / TM / Entity / DocumentMemory | Direct（upsert 族；confirmed 译名禁覆盖硬约束在 store 层） | 服务 | 无流程依赖；promoteToTM 例外走 Message |
| TranslationReview 状态 + CorrectionEvent | Message → resolveReview（同事务 append 证据） | Tool | M4（证据链） |
| SessionStateV2 | Direct（同步 API + revision guard） | 服务 | 高频、无跨步流程依赖 |
| CaseRun/EvaluationSnapshot | publish Tool 同事务追加 | Tool | M4（发布基线） |
| Settings（remoteUrl/token） | Direct；**secret 不进任何读视图/日志/provenance/backup**（#20/#26） | 服务 | — |

## 8. Skills / AI 任务（v0.3 Track B）

双模式即 AI Runtime 边界的现成实现：`YISHU_LLM_MODE=direct|runtime` **显式互斥、双向无隐藏回退**；runtime 模式下 provider/model/tier/retry/fallback/budget 全归 AI Runtime（域输入禁含这些字段）——与 v0.3 PRD §7.2 完全一致；未配置=显式 ProviderNotConfiguredError，绝不静默 echo。

| skillId | scope | 触发点 | output contract | envelope 要点 |
|---|---|---|---|---|
| `translate` | Domain | translateSegment Tool 内 | **自由文本**（非 JSON）；质量由后置 hard gates 确定性裁决；空输出=显式失败 | 确定性编译 prompt（domain data `prompt-compilation`）； independence：生成/评估独立性须由 provider/model/execution identity 证明，不可证明→UNVERIFIED（#4） |
| `repair` | Domain | risk≠low 且装配 repairer | 修复译文（同 gates） | 链深=1 类型层限定；budget 必填 |
| `analyze-risk` | Domain | review 辅助 | **结构化 JSON 数组** `[{i, suspicion∈[0,1], reason}]`（现成硬解析契约）；仅附加标注，stale fencing 拒旧 | 无批准权、失败不阻断；direct 模式保守"未分析" |
| `generate-candidates` | Domain | 专名译名生成 | 结构化 `[{source, candidates[]}]`，解析失败响亮报错不猜 | 产物**只进候选队列**，永不直写表 |
| `dev-echo`（测试） | — | YISHU_DEV_ECHO=1 | synthetic 占位 | 恒标 synthetic、不进缓存/TM（确定性 fake AI，对应 v0.3 demo §26.3） |

**[G8]** envelope 未落地前：outputSchema（analyze/generate 已有事实 schema）+ 确定性 gates + "Skill 产物只入候选通道"的 workflow 路由兜底；committed AI result 复用 Runtime idempotencyKey（canonical SHA-256）防重复计费。**NOT_PINNED 警戒**：AI Runtime consumer contract v1.0.0 四项 NOT_PINNED（OPENAPI_REVISION/AUTH/ERROR_BODY/BUDGET_WIRE）未 pin 前不得写生产 transport——本契约的 runtime binding 同样受此约束。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| AI Runtime operation 完成（若异步化） | `aiop:{idempotencyKey}` | yishu.document（调用方侧） | 推进 | idempotencyKey 已就绪；现状 M1 同步 execute，无轮询循环 |
| 批量翻译作业完成/超时 | `job:{jobId}:finished` | yishu.document | 推进（先到者生效） | §9.5 模式；**[G6]** 前 P2 调度器 |
| Session TTL 过期 | `session:{id}:expired` | —（仅失效/清理） | 现状惰性判定，可保持 | 不建 workflow |
| 定时备份 | `backup:{date}` | yishu.knowledge（S 实例 lane 内执行，保单写者） | 推进 | backupPush 幂等 |

现状**零 webhook/零 cron**——全部同步 HTTP；上表除备份外均为增量能力，迁移时按需要接入，不为接而接。

## 10. Target Host Profile 与 capability 需求

```yaml
platform: node-server              # Hono :4180 单实例（单写者假设必须保持：Runtime 宿主与 YISHU server 同进程或严格单实例）
capabilities: [sqlite-runtime-store@1, expression-jsonata@1, script-execution@1, http-transport@1, secure-random@1, crypto-hash-sha256@1]
projectBindings:                   # [G3/PRD-CR-1]
  yishu.store@1:    { module: bindings/yishu-store.ts,  resources: [yishuDb] }
  yishu.gitStore@1: { module: bindings/git-store.ts,    resources: [gitRepoPath] }   # isomorphic-git，单写者
runtimeResources(resourceKey): yishuDb(file:/postgresql: via YISHU_STORAGE_URL), gitRepoPath, gitRemote(token 仅注入), aiRuntime | llmDirect(二选一，互斥), adminSession
```

Admin UI 走同源 BFF（session→服务端注入 Bearer）——P2 facade 置于 server 侧，Admin UI 经既有 `/api/yishu/*` BFF 消费，不直接触 Runtime。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| store/git 本地写 Tool | **[G3]/PRD-CR-1** | 方案 A：server 进程内回环（单进程成本低）；或 publish 暂保持 Direct+人工阻断语义 |
| gate 阻断/TOCTOU/already-settled = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4；现状 API 阻断语义直接映射拒绝码 |
| publish 预览快照/草稿指纹跨消息保留 | **[G5]** | S2：draftsFingerprint 存 governance 业务源（TOCTOU 已如此实现） |
| ensureOpen（scope 实例）+ 备份/作业定时 | **[G6]** | 先查后开 + P2 调度器 |
| governance/candidates 源 value schema | **[G2]/L2-8** | DTO 已存在（EffectiveProfileDryRunDto 等），schema 化入包 |
| Skill envelope/independence 证明 | **[G8]** | #4 independence 纪律 + idempotencyKey 兜底 |
| hard-gates 等规则入包 | **[G1]** | CompiledDomainDataPort 带外 |
| Admin 类型化客户端 | **[G7]/L2-6** | openapi.json 既有，先手写+契约测试 |

## 12. 迁移路径建议

1. **只读接入**：governance/candidates/reviews Provider + `yishu.knowledge-state` Projection（Admin home/candidates/publish 页切 view/watch；EffectiveProfile Inspector 保持既有 dry-run seam——它与生产共享 planning seam 的纪律 #9 必须保留）；
2. **治理命令入口**：`yishu.knowledge` S 实例承接 confirm/import/publish/rollback；per-instance serialized lane 天然满足 Git 单写者；
3. **补 promotion workflow**：CorrectionEvent→候选→人工 promoteToTM（填 deferred 空位；严禁自动晋升）；
4. **调用方文档流**：`yishu.document` 模板包（E + 批翻作业循环）供集成项目复用，translateSegment/repair 作为远程 Tool/Skill 暴露；
5. **AI Scoped 化**：四 Skill 按 §8 收编；direct/runtime 双模式映射为两个 host profile 的 binding 差异；
6. **纪律守卫**：26 条 INVARIANTS 逐条映射进 §22 式一致性清单（尤其 AI 无批准权、gates 无豁免、cache≠TM、secret 纪律），自动化检查 + 评审双轨。
