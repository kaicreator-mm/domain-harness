# DomainHarness v0.8 — 前期预研归并、研究退出与最大化复用交接

> **RESEARCH_EXIT / EVIDENCE_HANDOFF / NON-NORMATIVE / NOT A TASK DAG**
>
> 2026-10-11 live GitHub 复核；主线基准 `main@b5d851b568ffc7edec89ddbac0f706cf6301e8fe`，以 live GitHub 后续变化为准。本文件属于独立的**研究资料整编 PR**，不修改 v0.8 Product PR #991、研究 PR #994、生产代码、main、v0.7 或当前 Agent 的写集。不能由此宣布 Product Freeze / L2 / Task DAG / Release PASS。
>
> **机器可读资产索引：** [V08_PRE_RESEARCH_ASSET_INDEX.json](./V08_PRE_RESEARCH_ASSET_INDEX.json)（15 组，精确 HEAD、文件路径、用途、局限）。参照 ADS 的 [Research Convergence & Exit Draft PR #1055](https://github.com/kaicreator-mm/ai-development-standard/pull/1055)，该 ADS PR 尚未正式合并，不冒充强制标准。已决定的最小范围见 [#949 Controller 100](https://github.com/kaicreator-mm/domain-harness/issues/949#issuecomment-6105898109) 与 [#953 Controller 100](https://github.com/kaicreator-mm/domain-harness/issues/953#issuecomment-6105904073)。

## A. 一句话结论和正式交接前提

**不要重新研发 Kernel。优先从 #994 精确实验实现选择性移植真实代码与 KPK 测试；用 #978/#948/#963/#988 补它没有覆盖的静态包绑定、身份和 Host 负例；用 #949、#972、v0.6/v0.7 证据补产品安全、运行时功能和恢复测试；用 #996 已合并的 CI 基建。**

已有材料足以准备 L2 Architecture Adoption Map，禁止再重复第三个 A/B App、第 N 轮 Package Demo 或重新测试同一问题来延迟 Product Freeze。**但**正式架构、实现和 Release 仍须对应 stage authority + 真实测试；研究 PASS 只是限定条件下的参考证据。用户已决定 **不要求旧版本 API/ABI/Package/Journal 跨版本兼容，要求保留先前所有有用功能** [#942@6093650132](https://github.com/kaicreator-mm/domain-harness/issues/942#issuecomment-6093650132)。

目前 #990 **Controller 100 final Product doc** 已有 Claim（#990@6105983066），属于另一运行中的写集；本索引绝不代替作者、#992 独立 Product Review、#953 Freeze 或未来正式 L2。

## B. 15 组预研资产：唯一事实源、保留哪些、弃用哪些

| 集合 | GitHub 证据 | 重用裁决 | 后续真正接收者 |
| --- | --- | --- | --- |
| R00 Product/Design | #942 / #949 / [PR #989](https://github.com/kaicreator-mm/domain-harness/pull/989) / [PR #991](https://github.com/kaicreator-mm/domain-harness/pull/991) | PRODUCT/DIRECTION；最终以已签署 Freeze checkpoint 为准，旧文本不能并列成多产品权威 | L2 Driver/IN-OUT/Acceptance |
| R01 首代 Package-first | [PR #940](https://github.com/kaicreator-mm/domain-harness/pull/940) @ `beea9cdd` | 只收首代 Bootstrap 反例、SMOKE；不迁入其玩具 Kernel | BUILD/Host 负例 |
| R02 Unified Component A→B | [PR #944](https://github.com/kaicreator-mm/domain-harness/pull/944) @ `80d5ee81`、[PR #945](https://github.com/kaicreator-mm/domain-harness/pull/945) | 选择性拿 Component 模型、A/B 和 Kind 测试；旧 A family 只做参照 | Contract/Kind L2 |
| R03 Package/Component/Graph/Operation | [PR #948](https://github.com/kaicreator-mm/domain-harness/pull/948) @ `f97610a9` | 提取 Schema/validator 候选与记录的反例，**known-gap green 不等于已通过规范** | BUILD Contract/negative suite |
| R04 Trusted physical Handler Binding | [PR #963](https://github.com/kaicreator-mm/domain-harness/pull/963) @ `d9fd8b92` | 保留 exact handler/Kind/attestation 安全负例；不要保留另一套 Host Runtime | BUILD/Host |
| R05 手工 Genesis + 全 Assembly Seal | [PR #978](https://github.com/kaicreator-mm/domain-harness/pull/978) @ `f87cfdfc` | 复用 G0 producer-neutral、Host trust roots、真实 bytes/manifest/closure 负例；其 K0 不是目标 K1 | Package Producer/Host install |
| R06 旧原生 T004 权威连接 | [PR #985](https://github.com/kaicreator-mm/domain-harness/pull/985) / [#986](https://github.com/kaicreator-mm/domain-harness/pull/986) / [#988](https://github.com/kaicreator-mm/domain-harness/pull/988) @ `cdf893d2` | 作为 v0.7 行为 oracle、授权/Effect/Host 负例；**禁止** Host-private 旧引擎作为正式 Kernel | Kernel differential & Host security |
| **R07 物理 Kernel 主实现** | **[PR #994](https://github.com/kaicreator-mm/domain-harness/pull/994) @ `b9ea4d1`**，[#993 independent](https://github.com/kaicreator-mm/domain-harness/issues/993#issuecomment-6104775952) | **核心源码/契约/测试候选**，以其 source map 和 KPK01–15 正反例为优先复用对象；不是全部直接合并 | L2 → Kernel/Core/Package SDK PR |
| R08 双应用产品价值 | [#972 canonical A/B](https://github.com/kaicreator-mm/domain-harness/issues/972#issuecomment-6098188937) + [collision decision](https://github.com/kaicreator-mm/domain-harness/issues/972#issuecomment-6098219217) | 已支持有界复用价值和动态 Effect 负例；scratch 不再当现成代码；较新 KPK15 提供已跟踪源码测试 | Product value decision + Effect tests |
| R09 PF-02 caller 授权读回与计量 | [#949 C097/C098](https://github.com/kaicreator-mm/domain-harness/issues/949#issuecomment-6105481529) / [#953 matrix](https://github.com/kaicreator-mm/domain-harness/issues/953#issuecomment-6105802152) | 只将威胁模型/测试向量纳入 L2；scratch 57/57 不是 PR #994 补丁 | Kernel/H/UX/SDK security |
| R10 PF-03 观察/可靠性 | [#949 durability falsifier](https://github.com/kaicreator-mm/domain-harness/issues/949#issuecomment-6105486287) | 保留既有有用的 observation / Journal / UNKNOWN / typed error；新原子 mandatory receipt 按 Product IN/OUT 决策，不自造 K/H primitive | Product Scope + Release |
| R11 v0.1–v0.7 已交付功能 | #949 功能清单 / #990 Evidence / v0.7 @ `86110c61` | **正负覆盖全部有用功能**：34 FR/HF + NEW-FUNCTION-01–06，以及 FR08 分立语义验收槽；不复原旧 ABI | SDK/K/Host/UX Task + Closure |
| R12 CI | **[PR #996](https://github.com/kaicreator-mm/domain-harness/pull/996) 已合并 main** | 直接使用 immutable fixture staging 和 worker oracle；[#953 T022](https://github.com/kaicreator-mm/domain-harness/issues/953#issuecomment-6105936070) 遗留 t016 dist-write 并发问题仅需小范围 infra 修复 | CI/Test Infrastructure |
| R13 Engineering DomainHarness 自举 | [#973](https://github.com/kaicreator-mm/domain-harness/issues/973) | **真正 v0.8 第二个交付 App，尚未实施**，将其 Task Pack 作为 Post-L2 验收 | App Integration + Release |
| R14 R1/R2/R3 旧 Product 草案 | PR #957 / #967 / #976 | 历史 provenance only，不再作为活跃合同；由最终 #991 successor 继承有用证据 | 追溯归档 |

**重要防复用误判：**#972 两个运行者曾撞同一 Claim，唯一 canonical A/B 为 @6098111826 → @6098188937；@6098140056 是 supplementary、非新的授权 Review。已完成结论不能凭空增加第二个独立 actor。

## C. #994 源码移植顺序：先精确引用，按代码关切分拆

唯一代码主候选：`experiments/v08-package-kernel-ownership-kpk01/`，精确 commit `b9ea4d1f42246c61d5382328788c50741cac8e43`、tree `f08ea04fe45d668d9475ca9288b257502a306958`，selected Kernel-v1 模块实际字节 SHA-256 `c87b1b7ac5df64734d7c0835a368bbcac84cd3a15294e9e8633407e2b211d756`。上述是 **experiment identity**，不是生产发布版本，后续改动需产生自己的版本身份。

| 正式目标关切（待 L2） | 直接复用/评估的研究文件 | 必须一起搬入的反例/检验 |
| --- | --- | --- |
| Minimal Microkernel | `src/microkernel/contracts.mjs`, `src/microkernel/load.mjs`, `index.mjs` | `tests/kpk01-*.test.mjs`, `kpk02-*`, `kpk03-*`, `kpk10-*`, `kpk12-*`；无第二 Runtime/无 runtime builder |
| Selected Kernel Domain Package | `src/producer/payload/kernel-mechanism-v1.mjs` + `OWNERSHIP_MAP.md` + `MIGRATION_MAP.json` | `kpk04`, `kpk05`, `kpk06`, `kpk07`, `kpk09`, `kpk14`；v0.7 original SOURCE differential |
| Per-occurrence Effect binding | 同 Kernel module 的 `wireAdmissionEffectBindings` / `resolveAdmissionEffectIntents` / `snapshotEffectBinding`；Approval/Inventory packages | `tests/kpk15-dynamic-effect-binding.test.mjs`，多业务变量 input/idempotency key、mutation、UNKNOWN、forged caller |
| Build-controlled Package closure | `src/producer/build-package.mjs`；`src/producer/payload/generate-kernel-v2.mjs` | #978 D1 的 Host-attested byte/Assembly negatives，#948 Schema/Graph negatives |
| Standard SDK | `src/producer/payload/sdk-standard.mjs`、`tests/kpk08-two-business.test.mjs` | **先修**当期模型计数字段不得 hardcode 1/false；增加 FR08/cache/promoted/typed unavailable 等历史功能覆盖 |
| Host ports / Persistence | `src/host/memory-host.mjs`, `src/host/file-host.mjs` | `kpk06`, `kpk07`, `kpk11`；真实 Node Host/断进程/损坏存储、权限与 observer 校验 |
| Business Package 及 UX | `src/producer/payload/business-approval.mjs`, `business-parts.mjs`, `business-inventory.mjs`, `src/ux/ux-client.mjs` | `kpk08`, `kpk11`, `kpk13`, `kpk15`；保留有界 typed UX 意图/观察 |
| Clean packaging / real consumer | `consumer/demo-consumer.mjs`, `package.json`, `.github/workflows/v08-kpk01.yml` | `kpk13`、真实消费者 Node 22/24；历史 exact CI 是 benchmark/reference，不代替新 HEAD 验证 |
| Evidence tooling | `tests/evidence.mjs`、`tests/helpers.mjs`、已提交 `evidence/kpk*.json` | 仅采用其 verifiable receipt pattern，避免环境字段/CRLF/mkdtemp 带来“错误的跨平台字节一致性”承诺 |

**目标不是再造一份相同的 Kernel**：可将经过 L2 分层、Review Policy、清洁 API、安全补洞的研究实现逐层整合到正式 package；允许 REUSE/ADAPT/REIMPLEMENT 对每个文件独立选择，必须在 Task evidence 中写明判断与正式源码 SHA。没有规定必须先把所有研究 Demo 再执行一次然后才允许实施。

### 必须保留的 v0.7 机制来源（可直接读取 MIGRATION_MAP）

- `packages/domain-harness/src/admission/admission.ts`：`admitCentralDecision` / `executeEffectIntents` / `deriveDurableControlTurnId`；
- `packages/domain-harness/src/workflow/predicate.ts`：Guard/Hard Invariant；
- `packages/domain-harness/src/admission/effect-journal.ts`：Journal/UNKNOWN/Replay；
- `packages/domain-harness/src/engine/workflow-instance-engine.ts`：合法 State transition；
- `packages/domain-harness/src/instance/persistent-workflow-instance.ts` + serialization lane：状态持久化/并发；
- `packages/domain-harness/src/governance/identity.ts`：不可伪造的已批准版本/治理事实消费边界；
- `packages/domain-harness/src/decision-resolver/resolver.ts`：Rule/cache/promoted/Model operation evidence 的功能 oracle。

采用新 v0.8 架构需要保留**功能结果和正确拒绝路径**，不强制源文件逐字移植或使用旧 API/ABI。

## D. 不得从研究直接继承的风险（最小正式 Task 入口）

| 风险/缺口 | 实际来源 | 可前进条件 |
| --- | --- | --- |
| **Public query/journal/observe/kernelRuntime 越权读回** | #994 `src/microkernel/load.mjs` + #949 readback scratch 反例 | L2 定义 H 签发/验证主体、tenant/app/instance/operation + B-reader/role/workflow；K 授权只读，撤销或一律安全 gate 原始表面；**写路径 caller.role 亦须 H 验证**；正负/零 Effect 测试 |
| **ModelPort 调用次数伪造** | #994 `src/producer/payload/sdk-standard.mjs` 仍 hardcode `freshModelCallCount:1`，真实执行零次 | K/H 从可信发生事实/Journal 得数；没计量则 `unmeasured|unsupported`，拒绝假 0/1；测试涉及真实 ModelPort |
| **Host-store journal 完整性** | #994 OWNERSHIP_MAP 指出 hostile Host-store writer 可注入 completed journal；KPK11 仅验证可信 Host/route-boundary | L2 明确 Trusted Host/Store 的威胁模型；若承诺 hostile-writer resistance，必须增加真正 MAC/隔离/验证；未证明前不作生产安全保证 |
| **实际崩溃/多进程 Host 恢复** | KPK07 bounded File Host，不等价 E3 crash-mid-write | 真实 Node/SQLite、断进程、重启、冲突及 UNKNOWN/retry 的 CI/Validation；现有 Journal 恢复保证不得缩水 |
| **openInstance 并发与全局业务键语义** | #993 independent P2；跨实例 business key 不在 KPK 的完整证明范围 | L2/Task ownership 与真实负例，不必预研期间再建 Demo |
| **PF-03 强制多记录原子收据** | #949 C098 实证当前 SDK/Host 缺少 ABI carrier | Product 初始范围可 OUT，但不能丢已有 durable observation、optional typed error、K Journal；若 IN，则实证 K/H atomicity，绝不能假造 durable ACK |
| **旧 Functionality 未正式移植** | #949 34 FR/HF + NEW-FUNCTION-01–06 / FR08 SD acceptance 仍 `PLANNED_NOT_RUN` | L2 绑定单个 Kernel/SDK/Business/Host/UX owner；实施和 Full Regression/Hidden 正负覆盖 |
| **CI 并发 dist 读取竞态** | #996 merged + [#953@6105936070](https://github.com/kaicreator-mm/domain-harness/issues/953#issuecomment-6105936070) | 修改 `packages/domain-harness-node/tests/store/t016-package-consumer.test.ts` 的仍在 parallel suites 内写 shared dist 的路径，复用现有 immutable staging；不再研究 T022 产品 crash 逻辑 |

上述未完成项均不因本文件而自动成为 Product Freeze 阻断者；是否属于 Product/Architecture/Implementation/Release gate，须由各原有 authority 按材料性裁决，禁止假装已通过。新重要安全 P0/P1 可开针对性研究，不得用“避免预研”豁免。

## E. 从现有研究到 L2/Task DAG 的最短真实接力

**不现在抢跑物化 Implementation Task DAG。** 必须先使 Product #991 完成 Owner scope / #992 fresh Review / #953 Freeze，L2 再凭本复用包确定 Contract 和 DAG。建议未来的**最小关切结构**（只是 handoff，不是新 Issue 任务）：

| 未来包 | 先决条件 | 复用文件/证据 | 交付/后置接力 |
| --- | --- | --- | --- |
| **A Contract + BUILD Qualification** | Product Freeze、静态 Identity/Compatibility/Binding 责任确定 | R02/R03/R04/R05，#948 conformance & #978 tamper | 唯一 Package/Kind/Handler/Host ABI，按需图/Schema negatives |
| **B Minimal Microkernel + Host installer** | A 可信约束固定 | R07 load/contract + R05 trust tests | 唯一真实 load(package)、安装错误和 sealed endpoint |
| **C Kernel authority + Effect** | A + stable B contracts，和 B 可分写集并发 | R07 Kernel/迁移图/KPK04–07/14/15，R06 旧 oracle | 当前版本 State/Guard/Journal/UNKNOWN/动态 Effect，无第二 Runtime |
| **D Standard SDK + historical functions** | A 的 Kind 合同，C 的 authority contract | R07 sdk + R11 FR/HF/NF/FR08 evidence | Rule/Decision/Workflow/Operation + truthful ModelPort observability |
| **E Scoped query/UX + Host Security** | B/C/H principal typed contracts | R09/R10 + R07 UX + #949 C098 反例 | 无越权读、无未授权执行，保留合法 observer/subscription，typed faults |
| **F Business App integration** | B/C/D/E 相关可运行关切 | R07 Approval + Inventory，R08 A/B，R13 #973 | **同一 K1/S* 运行正式 Approval 与 Engineering 两个不同 Domain Harness Apps**；Inventory/Parts 用于回归/变体 |
| **G Test Infra + Version Closure** | 最早可独立修 test infra；完整 closure 需集成候选 | R12 #996 和 t016 小范围修复；R11 retained function register；R07 全 KPK | 新 SHA 的 CI + clean Host + fault injection + Full Regression/Hidden/Critical Journeys/Packaging/RQ |

### 并发建议

- A 合同冻结前只允许**非冲突的 evidence preparation**，不要让 Local Builder 同时改它与 B/C/D 的真实 ABI。
- A 完成后，B/C/D/CI 可以按**明确独立写集**尽量并发；E 依赖身份/读回合同，F 依赖 B/C/D/E 的可用结果；不为已完成研究另建 Builder/Reviewer 循环。
- 独立 Review 按风险选择：authority/security/public ABI 必须独立 Review；普通 docs/fixture/局部实现按 ADS risk-based Review Policy，而不是所有 PR 无差别重新进行多轮全量审核。
- 原有 research PR 仍 OPEN/DRAFT/DO NOT MERGE；不自动合并 #940/#944/#945/#948/#961/#963/#978/#985/#986/#988/#994。需要源代码时，以 exact reviewed SHA 作文件级 selective port，经正式 Review/CI 验证。
- 将当前 #949/#953 的**已完成实验**标记为 CONSUMED_IN_L2，而非再物化为新研究 Issue；已经启动的 Product author #990 不可重复 Claim。

## F. 研究退出卡（待 Product/L2 消费）

~~~ini
RESEARCH_EXIT_CARD
SUBJECT=domain-harness_v0.8_package_kernel_selected_runtime
DECISION_CONSUMER=product_949_then_L2_owner_after_953_freeze
PRIMARY_CODE_EVIDENCE=PR994@b9ea4d1f42246c61d5382328788c50741cac8e43
PROVEN=bounded_physically_selected_K_mechanism;thin_microkernel;two_business_cases;dynamic_effect_KPK15;verified_negative_cases
NOT_PROVEN=production_secret_principal;hostile_host_store_integrity;real_multihost_crash;full_FR_HF_functionality;actual_engineering_domain_app;full_release
SECONDARY_BUILD_EVIDENCE=PR948@f97610a9;PR963@d9fd8b92;PR978@f87cfdfc
SECONDARY_ORACLE=PR988@cdf893d2;v0.7@86110c61
PRODUCT_VALUE=#972@6098188937_canonical
SECURITY_NEGATIVES=#949@6105481529_and_6105155249
INFRA=PR996_MERGED_MAIN_b5d851b;T022_#953@6105936070_t016_residual
CODE_ACTION=PR994_SELECTIVE_REUSE_OR_ADAPT_AFTER_L2_REVIEW
TEST_ACTION=KPK01_TO_15_PLUS_G22_G26_PLUS_SCHEMA/GRAPH_AND_FR_HF_NEGATIVES
SCRATCH_ASSETS=LOG_ONLY_NOT_DIRECT_COPY
STOP_DUPLICATES=ALL_REDUNDANT_KPK_AND_THIRD_A_B_DEMOS
NEXT_PRE_L2=EXISTING_990_AUTHOR_THEN_992_REVIEW_THEN_953_FREEZE
PRODUCT_FREEZE=NOT_CLAIMED
L2=NOT_AUTHORIZED
TASK_DAG=NOT_AUTHORIZED
FORMAL_IMPLEMENTATION=NOT_AUTHORIZED
RELEASE=NOT_CLAIMED
~~~

**本 Research Exit 仅确定“已研究足够、下一步如何最大化使用”，不把某个实验的 PASS、历史 CI、特殊 Review 或 Source-level evidence 伪造成 Formal L2/生产/Release 的 PASS。**
