# XLearn 领域契约草案（DomainHarness v0.3）

**Project:** `kaicreator-mm/xlearn` @ v2.3（TypeScript RN+Expo 客户端 / Go control-plane / `domain-packages/` 版本化 Domain Harness 包；Java+Flutter 为迁移 oracle 不作目标；Closure 未 Release PASS）
**Status:** CONTRACT DRAFT — 依据 `docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md` 生成，未经项目 owner 评审
**Evidence baseline:** 浅克隆 @ 2026-09-20（HEAD `a9527b7`）
**Date:** 2026-09-20

> 仓库冻结原则直接约束本草案：**学习执行留在设备端**（高频/低算力/单用户/确定性下放 App，Backend 不存 per-answer 学习历史——`docs/current/PRD.md` 冻结产品声明）；**FSRS=何时复习、BKT/DST=是否学会，语义不得合并**；**LLM 不判题、不改算法状态、不决定 next task**；算法版本 fail-close（新包 `algorithmVersion` ≠ 既有 concept_state → materialization 在任何写入前拒绝并回滚）。
>
> **最重要的映射发现**：`domain-packages/<domainId>/<domainVersion>/`（manifest.json 含 artifacts[{path,digest,size}] + harness/{concepts,recipes,evaluation,algorithm-defaults}.json，minimumRuntimeVersion semver gate）**本身就是 Compiled Domain Data 的成熟形态**——版本化、digest 化、有界性限制（maxConcepts 10k/maxRecipes 50k）、引用完整性+无环校验、双端（TS+Go）验证。它是分析文档 **G1（domain-data 进 manifest）** 的最佳参照实现。

## 0. 适合性判定（十二问速答）

| # | 问题 | 回答 |
|---|---|---|
| A | 长期业务实体 | **设备侧（SoR=App SQLite schema v5）**：Learner（单学习者 `local-default`，终身）、ConceptState（key `(domain_id,concept_id,skill_type)`，FSRS due_at+BKT/DST mastery+algorithm_version）、LearningTask（确定性 id `local:<domainId>:<domainVersion>:<recipeId>:r<n>`；ISSUED/ANSWERED/SKIPPED/EXPIRED/INVALIDATED）、LearningEvent（append-only 证据）、DomainPackageInstallation（INSTALLED/ACTIVE/SUPERSEDED，每 domain 至多一 ACTIVE）、runtime_metadata（daily_new_limit、current_task_id 指针）、cached_content；**后端（Go+PG 4 表）**：domains/domain_versions/package_releases/shared_content |
| B | 长期/可恢复流程 | 学习循环（Task→Answer→Evaluation→Event→FSRS/BKT/DST→Planner→Next，单事务原子，`learning-runtime/src/engine.ts`）；**包生命周期**（manifest fetch→验证→staging→全 artifact 下载→size+SHA-256→commit→原子激活→materialize；幂等重入；rollback 仅限通过完整性校验的版本）；materialization（单排他事务确定性重建，可中断重跑）；备份/恢复（LearningBackupV1）；**调度是拉取式**：无 cron/无 push/无服务端定时器，due_at 数据+打开 App 时 planner |
| C | 领域能力（Tool） | answer 事务、install/activate/rollback、materialize、生成候选（Go 侧 AI Runtime，UNCERTAIN 一律拒绝）、远程任务注入（READY/UNAVAILABLE/REJECTED 三重 re-check）、artifact 分发（digest 校验读）、shared content 缓存、备份导出/恢复、选域/清域 |
| D | 业务 SoR | 学习状态=**设备 SQLite**（后端刻意不存 learner）；包字节=文件系统 `PACKAGE_ARTIFACT_ROOT`；发布权威=后端 PG package_releases |
| E | 每实体组合视图 | LearnerDynamicState：今日队列态势（PlannerInput 有界集合 forced/due/new/early + todayNewCount/dailyNewLimit）、current_task 指针、active domain/version、安装态、有界掌握聚合（`MAX(mastery) GROUP BY concept_id` 现成查询）；**禁止全域内存扫描**（mobile resource gate），集合统计走有界索引（idx_state_due/idx_task_planner） |
| F | 只是交互/本地状态 | ReviewSessionController（IDLE/LOADING/TASK/FEEDBACK/DONE/ERROR，内存态）；屏幕导航；答题即时反馈 UI |
| G | 宿主绑定 | **设备=Expo（DomainHarness 已有 expo-sqlite RuntimeStore 适配器，T004/T019 合规路径）**：expo-sqlite/expo-file-system/expo-crypto/SecureStore；后端=Go+PG（**语言缺口**：SDK 是 TS，Go 侧仅以 http-transport 远程服务形态进契约，不嵌 Runtime） |
| H | E/R/S 划分 | S：`xlearn.learner`（key=learnerId，终身，General Design v0.2 §19 既有判定）；E：`xlearn.domainpackage`（key=domainId，安装/激活/回滚/换代生命周期）；答题**不建 Run 实例**（同步事务+Direct，见 §7） |
| I | 命令入口/拒绝路径 | `xlearn.learner` 为设备唯一命令入口（SelectDomain/RequestRemotePractice/RestoreBackup/…）；stale task（domain/version 已切换）→ `rejected(stale_task)`（现状即显式拒绝语义）；算法版本不符 → `rejected(algorithm_migration_required)` |
| J | Mutation Ownership | 见 §7；concept_state/learning_event 单写者=learning-runtime engine 事务 |
| K | 外部事件/超时 | 拉取式哲学：**不强行引入 push**；候选 Ingress：包发布通知（pull）、远程练习任务就绪、生成 job 完成（PRD 承诺 generation jobs 持久化，**实现缺失**——现状同步 HTTP）；deadline：due_at（数据驱动）、task EXPIRED（枚举存在但 `LocalLearningTask` 契约缺 expiresAt 字段——契约缺口）、AI budget 15s |
| L | 破坏性变更重建 | materialization 本身就是"从包+状态确定性重建"；备份/恢复要求先安装匹配包版本、过期 issued 任务失效而非盲目续跑；算法版本变更=显式迁移+差分验证前提（R3 文档明言），映射为包换代（`xlearn.domainpackage` 新 version + Restore） |

**判定结论：适合（设备侧），且是 DomainHarness expo 宿主的旗舰场景**。后端保持 Go 远程服务边界。核心收益：包生命周期与学习循环的崩溃恢复（Critical Journeys #8/#9）从命令式代码变为 Runtime 保证；domain-packages 与 Compiled Domain Data 契约互相印证。

## 1. 领域实体与实例模型

| workflowId | 类别 | instanceKey | 生命周期 | 开通者 | 宿主 |
|---|---|---|---|---|---|
| `xlearn.learner` | S | learnerId（现 `local-default`；身份来源需先解决，见 §11） | 终身 | 设备 P2（首启 + ensureOpen） | Expo（expo-sqlite RuntimeStore） |
| `xlearn.domainpackage` | E | domainId | 与已安装域同寿（superseded 后 Close） | 设备 P2（安装流程） | 同上 |

- 答题（answer）= **Direct 同步事务**（`RuntimeRepository.transaction`：evaluation 先于写入；appendEvent+saveState+markTaskAnswered+planNext 原子）——高频/低延迟/确定性，不需要 durable message 往返；`current_task_id` guard + `status==='ISSUED'` 检查已是单写者串行化（S1）。workflow 经业务快照**读**学习态势（S3：业务状态不由 workflow 推导）。
- 一次 install/materialize 运行 = `xlearn.domainpackage` 的 E 循环（运行数据=installation 行+jobs，S2）；不建 R 实例（无并行需求）。
- 远程练习（REMOTE 任务）= `xlearn.learner` 内 E 循环：requesting→awaiting（业务表登记）→injecting（三重 re-check）→idle。

## 2. Raw Domain Package 骨架

```text
domain/                            # 设备侧包（xlearn-device）
├── harness.yaml                   # id: xlearn
├── workflows/learner.yaml · domainpackage.yaml
├── skills/                        # §8：practice-item / explanation 生成（服务端触发、设备消费）
├── tools/ · projections/          # [G9] 见 §3/§6
├── business-sources/              # [G2] 见 §4
├── schemas/                       # LearningTask（含补齐的 expiresAt?）、ConceptState、LearningEvent、
│                                  #   InstallationRecord、PlannerInput、JourneyFeedback、Candidate
├── rules/                         # 治理层：FSRS/BKT/DST 语义分离、LLM 硬边界、算法版本 fail-close、
│                                  #   WRITING 过滤、mobile resource gate（有界查询）
└── references/                    # LEARNING_MODEL.md、DATA_MODEL.md 摘录

domain-packages/<domainId>/<version>/   # 【既有资产，直接映射 Compiled Domain Data】
├── manifest.json                  # schemaVersion/domainId/domainVersion/minimumRuntimeVersion/
│                                  #   artifacts[{path,digest:"sha256:…",size}]
└── harness/{concepts,recipes,evaluation,algorithm-defaults}.json
```

`domainpackage.yaml` 要点：

```text
init              只收 Restore{installationSnapshot}；按 status 路由：
                    未安装→idle · INSTALLED(未激活)→installed · ACTIVE→active · SUPERSEDED→Close→final
idle              InstallRequested{version} → staging（invoke stage_package：manifest 验证→staging dir→
                    全 artifact 下载→size+SHA-256 校验；失败→stage.discard→rejected(reason) 回 idle）
                  → committing（invoke commit_install：filesystem commit + installation 行 INSTALLED）
                  → installed
installed         ActivateRequested → gate（invoke algorithm_gate：新包 algorithmVersion vs 既有
                    concept_state.algorithm_version——不符且无迁移→**rejected(algorithm_migration_required)**，
                    在任何写入前拒绝）→ activating（原子 SQLite 激活：旧 ACTIVE→SUPERSEDED，部分唯一索引兜底；
                    失败→committed.remove() 回滚）→ materializing（invoke materialize：单排他事务 8 步确定性重建，
                    幂等可中断重跑；旧 ISSUED LOCAL 任务→INVALIDATED）→ active
active            RollbackRequested{version} → 校验目标版本仍过 size+digest → 重走 activating/materializing
                  PackageSuperseded/Close → final
learner.yaml：
init→Restore{learnerSnapshot}→idle（有 active domain）/setup（无）
setup             SelectDomain → 发 ActivateRequested 给 xlearn.domainpackage（workflow 间 durable message）
                  → awaiting_activation → DomainActivated → idle
idle              RequestRemotePractice → requesting（invoke request_practice：purpose=practice-item，
                    选 review_count 最高 concept）→ awaiting_remote（静止；业务表登记 {requestId,deadline}）
                  RemoteTaskReady(Ingress) → injecting（invoke inject_remote_task：网络/schema 验证全部在
                    SQLite 事务之前；事务内三重 re-check：active domain/version、concept algorithm_version、
                    current_task_id 空闲 → READY|UNAVAILABLE|REJECTED）→ idle
                  RestoreBackup → restoring（要求先安装匹配包版本；过期 issued 任务失效）→ idle
                  ClearDomain → setup
```

## 3. Domain Tool 声明（RawToolDefinition）

| toolId | effect | executionKind | input → output | 幂等机制 | binding / capability |
|---|---|---|---|---|---|
| `stagePackage` / `commitInstall` / `activatePackage` / `rollbackPackage` | idempotent | **project** [G3]（expo 侧注册绑定） | manifest/artifact refs → CommandResult（两阶段 stage/commit/discard；激活失败 remove 新包） | 已安装+verify 通过→直接 activateExisting（既有幂等重入）；digest 内容寻址 | `xlearn.packageStore@1` / sqlite-runtime-store@1 + 文件系统 |
| `materializeHarness` | idempotent | project | `{domainId, version}` → CommandResult（8 步：ACTIVE 确认→算法 gate→upsert learner→INSERT OR IGNORE concept_state→eligible recipes(0.85 阈值)→失效旧任务→确定性 taskId upsert task+payload→planner 元数据） | upsert/INSERT OR IGNORE + 排他事务（既有实现） | 同上 |
| `answerTask`（引擎入口，Direct 路径复用） | idempotent | project/expression | `{taskId, response, rating}` → JourneyFeedback{correct,rating,dueAt,mastery,evidence}（evaluation 先于任何写入） | 事务内 `status==='ISSUED'` guard 防重复消费 | `xlearn.learningStore@1` |
| `requestRemotePractice` | idempotent | remote | Go `POST /v1/generation/candidates` → Candidate（结构校验+DomainValidator 过 concepts.json digest 重验） | **现状缺口**：每次调用随机 Idempotency-Key；契约要求改为 `practice:{learnerId}:{conceptId}:r{reviewCount}` 确定性键 + applied_effects | http-transport@1 / resourceKey=controlPlane |
| `injectRemoteTask` | idempotent | project | Candidate → learning_task(REMOTE)（三重 re-check；READY/UNAVAILABLE/REJECTED） | 事务前验证+事务内 re-check（既有） | `xlearn.learningStore@1` |
| `selectActiveDomain` / `clearDomain` | idempotent | project | 排他事务写 learner_state.active_domain_id + runtime_metadata，清 current_task_id | 事务+guard | 同上 |
| `exportBackup` / `restoreBackup` | none / idempotent | project | LearningBackupV1（不含包字节） | 恢复=整体替换+stale 任务失效 | 同上 |
| `cacheSharedContent` | idempotent | project | read-through 写 cached_content（失败回退缓存，不触 learner state） | (domain,domainVersion,contentId) 键 | 同上 |

服务端（Go）工具面**不进设备包**：artifact 分发（digest 校验读+ETag）、package_releases 发布、generation 服务保持远程契约（http-transport + OpenAPI `control-plane.openapi.yaml` 为唯一机器可读契约源）。

## 4. 业务数据源声明（BusinessSnapshotProvider 输入）

| source | key | value schema 摘要 | revision 策略 | 备注 |
|---|---|---|---|---|
| `xlearn.learner` | learnerId | {activeDomainId, activeVersion, currentTaskId, planner 元数据(dailyNewLimit/earlyReview/…)} | runtime_metadata 单调计数 | current_task_id 恢复校验（status=ISSUED 且 domain/version 仍 active，否则清指针——既有语义） |
| `xlearn.queue` | learnerId | PlannerInput 有界集合：forced/due/new/early + todayNewCount（`due_at<=today` 走 idx_state_due） | max(due 集指纹) | **有界查询强制**（mobile resource gate） |
| `xlearn.tasks` | learnerId | ISSUED 任务摘要（含 domain_version、expiresAt? 补齐后） | 表内版本列 | |
| `xlearn.mastery` | `{domainId}` | 概念级 `MAX(mastery)` 有界聚合（Top-N + 分桶） | 聚合指纹 | 集合统计走读模型原则 |
| `xlearn.installation` | domainId | {status, version, manifest 摘要, algorithmVersion} | (status,version) | |

## 5. Compiled Domain Data（**G1 的参照实现**）

| key | 内容摘要 | 用途 | 治理 |
|---|---|---|---|
| `harness:{domainId}:{version}:concepts` | concepts[{id,skillTypes[],prerequisites[]}]（无环校验、引用完整性） | materialize/planner | FROZEN（digest 钉住） |
| `harness:{domainId}:{version}:recipes` | recipes[{id,conceptId,skillType,taskType,presentation{prompt,answerType,options,hints},evaluationRuleId}] | 任务物化 | FROZEN |
| `harness:{domainId}:{version}:evaluation` | rules[{id,kind:OPTION_ID\|EXACT_TEXT,expectedAnswer,caseSensitive}] | answerTask 确定性评估 | FROZEN |
| `harness:{domainId}:{version}:algorithm-defaults` | algorithmVersion + planner{dailyNewLimit,earlyReviewEnabled,prerequisiteMasteryThreshold=0.85} + initialState{mastery,stability,difficulty,…} | FSRS/BKT/DST 初始参数与 planner | FROZEN（fail-close gate 的比较对象） |
| `planner-priority` | P1 forced→P2 due→P3 new(dailyNewLimit)→P4 early review；WRITING 与近期概念过滤 | queue 投影/planNext | FROZEN |

**建议**：v0.3 G1 的 manifest `domainData` 声明直接采用 xlearn 形态——`{key, artifactPath, digest, size}` + 有界性限制 + 引用完整性校验；`minimumRuntimeVersion` 对应 `runtimeContractMajor` 语义。**[现状缺口]** 同一 digest 在 manifest.json / `002_baseline_packages.sql` / `store/baseline.go` 三处手工同步——需要 G9/G7 的编译发布管线消灭三重冗余。

## 6. Projection / Dynamic Domain State

| projectionId | key | 依赖 | body 摘要 |
|---|---|---|---|
| `xlearn.learner-state` | learnerId | wf `xlearn.learner` + business learner/queue/tasks/mastery + domain-data planner-priority、algorithm-defaults | 今日队列态势、current task（含 presentation 渲染数据）、active domain/version、掌握聚合（有界）、远程练习 pending |
| `xlearn.package-state` | domainId | wf `xlearn.domainpackage` + business installation + domain-data harness manifest 摘要 | 安装/激活态、算法 gate 结果、materialize 进度、可回滚版本列表 |

信封照 TEMPLATE §6；`availableActions`：Answer/Next 仅当 current task ISSUED 且 domain/version active；`phase`=学习相位（setup/idle/awaiting_remote/restoring）。Admin 集合视图（Go catalog + Java legacy 双客户端，无静默 fallback）不进 Projection。

## 7. Mutation Ownership Table（S1 单写者）

| 实体.字段 | 写入路径 | 写入方 | 依据 |
|---|---|---|---|
| concept_state.* / learning_event / learning_task.status | Direct：learning-runtime engine 事务（answerTask 唯一入口） | 引擎 | M1 已由排他事务+guard 满足；高频低延迟不宜消息往返（v2.3 冻结哲学） |
| runtime_metadata.current_task_id | Direct：engine planNext | 引擎 | M1（与答题串行化） |
| learner_state.active_domain_id | Message → xlearn.learner → selectActiveDomain | Tool | M2（触发 domainpackage 激活/失效链） |
| domain_package_installation.* | Message → xlearn.domainpackage → activate/rollback | Tool | M2、M4（fail-close gate+审计） |
| cached_content | Direct（read-through 缓存；只失效不裁决） | 缓存服务 | 无流程依赖 |
| 后端 PG（domains/releases/shared_content） | **不进本契约**（Go control-plane 自有权威；设备侧只读） | control-plane | 语言/信任边界 |

## 8. Skills / AI 任务（v0.3 Track B）

AI 边界现状已是 v0.3 语义的样板：`Provider` 是唯一 AI 集成点、**对 learner state 零写权限**、输出三态（SUCCEEDED/FAILED/**UNCERTAIN 一律拒绝**）、网络类错误归一 PROVIDER_UNAVAILABLE、assurance profile（ECONOMY/BALANCED/HIGH_QUALITY/HIGH_ASSURANCE）+ budget（max_attempts=2/cost≤$0.05/deadline 15s/max_tokens 1200）——直接映射 AI Operation 的 Execution Policy。

| skillId | scope | 触发点 | output contract | envelope 要点 |
|---|---|---|---|---|
| `practice-item-generation` | Domain | RequestRemotePractice（服务端执行） | Candidate{domainId,domainVersion,conceptId,contentType:LEARNING_TASK,body{presentation,evaluation}}——**必须过 PackageValidator**（concept 存在、skillType 允许、OPTION↔OPTION_ID/TEXT↔EXACT_TEXT 配对、expected option 存在） | produce-result-only；注入设备前再经 injectRemoteTask 三重 re-check；UNCERTAIN→rejected 不挂起（现状）→ **[G5/jobs]** 落地后可改为 awaiting+deadline |
| `explanation-generation` | Domain | 共享内容种子 | Candidate{contentType:EXPLANATION} | 同上；进 shared_content 不进 learner state |
| `learning-intent-router`（可选新增） | **Control** | 自然语言入口（Admin/未来 Tutor） | typed Proposed Domain Command（SelectDomain/RequestRemotePractice/…） | propose-only [G8]；**v2.3 明确不做 AI Tutor 扩张**——此项仅在产品解冻后启用 |

硬边界入 rules/：LLM 不判题、不改 FSRS/BKT/DST、不决定 next task；provider 失败降级为确定性本地行为；AI Runtime E2E 未对真实部署验证（契约标注置信度）。

## 9. Ingress 外部事件与超时

| 事件源 | messageId 派生 | 目标 | 处置 | 备注 |
|---|---|---|---|---|
| 远程练习候选就绪（若 generation 异步化/jobs 落地） | `gen:{candidateRequestId}` | xlearn.learner | 推进（injecting） | **现状同步 HTTP**；PRD 承诺的 generation jobs 表缺失——[G6]+jobs 表补 |
| 包发布通知 | `release:{domainId}:{version}` | xlearn.domainpackage | 仅失效/提示（安装是用户命令） | 拉取式哲学：不自动安装 |
| 远程任务过期 | `task:{taskId}:expired` | xlearn.learner | 推进（EXPIRED） | **契约缺口**：LocalLearningTask 补 expiresAt 字段 |
| 复习到期 | —（**不建 Ingress**） | — | due_at 数据+打开 App 拉取（既有设计） | 引入 push 提醒是产品决策，非契约要求；[G6] 定时器仅服务 jobs/过期 |

## 10. Target Host Profile 与 capability 需求

```yaml
# host-profiles/xlearn-expo.yaml —— 设备侧（DomainHarness expo 宿主既有合规路径 T004/T019）
platform: expo-hermes              # RN 0.86/Expo SDK 57；Hermes 约束走 conformance suite
capabilities: [expo-sqlite-runtime-store@1, expression-jsonata@1, http-transport@1, secure-random@1, crypto-hash-sha256@1]
projectBindings:                   # [G3]：RN script tool 拿不到句柄 → 注册绑定是设备侧唯一落点
  xlearn.packageStore@1:  { module: bindings/package-store.ts,  resources: [deviceDb, packageRoot] }
  xlearn.learningStore@1: { module: bindings/learning-store.ts, resources: [deviceDb] }
runtimeResources(resourceKey): deviceDb(expo-sqlite), packageRoot(expo-file-system), controlPlane(URL+token, SecureStore), clock(注入式 Clock 既有契约)
```

Go control-plane 不嵌 Runtime（语言边界）；设备→后端只经 http-transport + OpenAPI 契约。**/v2 入口注意**（General Design v0.2 [现状] #139：RN 目标只能从可移植入口导入）。

## 11. v0.3 增量依赖清单

| 契约条目 | 依赖 | 临时约定 |
|---|---|---|
| domain-packages → 包内 domainData 声明 | **[G1]**（xlearn 形态即参照） | CompiledDomainDataPort 按 `{packageId}` → harness artifact 键值提供；digest 三处冗余先以脚本同步 |
| packageStore/learningStore 设备本地写 | **[G3]/PRD-CR-1** | expo 注册绑定；CR 前 learning 循环保持 Direct（本就如此），仅 package 生命周期先行 |
| stale task/算法 gate = 领域拒绝 | **[G4]/PRD-CR-2** | R1–R4 拒绝路径 |
| generation jobs 持久化 + UNCERTAIN 挂起 | **[G5]/[G6]** + 后端 jobs 表 | 现状同步+UNCERTAIN 拒绝（fail-close 保持） |
| learner 身份来源（`local-default` 硬编码） | 项目决策 | 单用户设备语义下 learnerId=设备稳定 id；多用户前先解冻 PRD |
| Candidate/PlannerInput schema 入包 | **[G2]/[G9]** | schemas/ 先行 |
| 类型化客户端 | **[G7]/L2-6** | packages/contracts 既有 TS 契约复用 |

## 12. 迁移路径建议

1. **只读接入（设备）**：learner/queue/tasks Provider + `xlearn.learner-state` Projection（Home/Review 屏切 view/watch；有界查询纪律进 Provider 实现）；
2. **包生命周期 workflow 化**：`xlearn.domainpackage` 承接 install/activate/rollback/materialize（installer.ts 幂等重入语义原样进 Tool；算法 gate 保持写入前拒绝）；DomainSetupScreen 切 command/outcome；
3. **远程练习 E 循环**：requesting→awaiting→injecting（补确定性 idempotency key 与 expiresAt 契约）；
4. **恢复语义移交**：Critical Journeys #8/#9（重启/离线恢复）改由 Runtime processing-reclaim + Restore 承接；materialize 保持"确定性重建"作为换代工具；
5. **后端保持边界**：Go control-plane 不换宿主；generation jobs 表按其自身路线补齐后再接 Ingress；
6. **oracle 纪律**：Java SRS/Flutter 仅作行为对照（golden fixtures `test-fixtures/v2.3/learning-runtime/*.json` 为行为真值），不进契约。
