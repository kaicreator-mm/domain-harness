# DomainHarness v0.11.x — Domain / Harness / SDK、直接编写 Domain Package 与生态边界（R36）

> **Owner 最新裁决（2026-11-22）**：Domain Package 是**一组满足 DIS 适用规范及 DomainHarness v0.11.x Package 契约的真实文件**，不因作者身份或生产方式而改变性质。**可以由 ChatGPT 直接编写这些文件**，不必使用任何生成器、临时 Seed Builder、DomainForge 或专用 Package 生产流程。本规范覆盖此前 R33–R35 中“必须先生成 Package”“必须经独立 Assembly 阶段”“自举必须依赖工具/Forge”等错误前提。只保留对实际使用的文件、引用、权限、目标和启动的必要验证。

```ini
OUTPUT_LABEL=DH_V011X_R36_PACKAGE_FILES_NO_GENERATOR
MASTER_ISSUE=#1563
FOUNDATION_ISSUE=#1564
PACKAGE_ISSUE=#1647
PRODUCT=DOMAIN_HARNESS_SDK
PACKAGE=DIS_CONFORMANT_COLLECTION_OF_REAL_FILES
AUTHOR=ANY_HUMAN_CHATGPT_AGENT_OR_FUTURE_FORGE
GENERATOR=OPTIONAL_NEVER_REQUIRED
SEED_BUILDER=NOT_REQUIRED_NOT_PLANNED
SEPARATE_PACKAGE_ASSEMBLY_STAGE=NOT_REQUIRED
COMPOSITION=RESOLVE_SELECTED_PACKAGES_WHEN_NEEDED
VALIDATION=REAL_REFERENCES_DEPENDENCIES_PERMISSIONS_TARGET_DIGEST_AND_BOOT
FORGE=DEFERRED_UNTIL_SDK_COMPLETE_NOT_A_BLOCKER
```

## 1. 产品三名称与交付边界

| 名称 | 精确定义 |
|---|---|
| **Domain** | 有界领域事实、知识、对象、业务规则、适用范围与版本/来源语义，说明要处理哪个领域以及什么条件有效 |
| **Harness** | 在已选 Domain 上组织任务、状态、工作流、受限行动、反馈/经验的可控执行系统 |
| **SDK** | 公开可复用的 Package/Element/Function 合同、最小 Boot/KDP、运行及应用组合 API，可被不同领域应用嵌入；DomainHarness SDK **自身**亦是同类 Domain Packages 的组成 |

0.11.0–0.11.9 是同一个 DomainHarness SDK 完全重写的内部迭代。它不是 Domain Package 自动生成平台或大型 BUILD 工具产品。

## 2. Domain Package 具体是什么

**Domain Package 是若干真实文件的逻辑集合与交付边界**，不等于通过某个工具“生成出来”的特殊二进制封装。它通常包含以下当前有效合同所需的文件（实际可为 JSON、TypeScript 编译产物、ESM、文档/资源等，按适用 Target 和合同决定）：

- **Package Manifest**：`kind: DomainPackage`、身份/版本、包含的 Elements、显式 `dependsOn/imports/exports`、`targetVariants`、Core.Order（仅 Core 必需）、拥有的 Init Element 与可选 Exit Element；
- **Element Definitions / Content / Domain 材料**：按需声明的 Element 内容、FunctionContracts、知识/规则/Workflow/Schema 与 `ResourceRef`，并保持 Owner、路径及必要摘要的对应关系；
- **Function 实现和其它资源**：真实 Target ESM、模块公开导出、引用的 JSON/YAML/Schema/业务数据、必要的宿主约束等。

**谁编写的并不构成资格判断**：ChatGPT 直接向仓库提交这些文件、人手工写、Agent 写、已有资产导入，或未来 DomainForge 产生，都同等以**实际文件、引用和运行结果**验收。编写操作本身不叫产品 BUILD，也没有“必须把手写文件再送到 Package Generator 生成一遍”的合同。

**DIS 的适用 Package 规范 + v0.11.x 当前 Element-First/Package Schema** 构成必须核对的技术要求；应逐项确认适用条款，避免把历史 DIS 工程 Demo、Full 21/21 资格或旧 0.10 ABI 冒充新 0.11.x 已验收。结构/静态检查通过亦不自动产生外部业务知识与来源权威。

## 3. 为什么不需要“Package Assembly”这个额外生产阶段

必须区分两个词：

- **Package 的文件组织/创建**：文件已在仓库中且满足 Manifest/ResourceRef 等相互引用关系时，Package 就存在。它不需要编译平台为它“组包”，也不需要专用 `assemblePackage()`。
- **用多个 Packages 构成一个 Domain App**：当 App 需要同时使用若干 Packages 时，应按照现成声明确定**实际选用哪些 Package、依赖和 Target/入口**。这是应用组合/引用确定，不是新 Package 的生产；若这些关系已经固定并且可信，**不必额外引入独立 Assembly 工具/工作流**。

```text
ChatGPT / 开发者直接编写一组 Package 文件
       ↓
文件符合 DIS 适用约束 + 当前 v0.11.x Package/Element 合同
       ↓
已有 Package + 其它已选 Packages + Target/Boot
       ↓
必要的引用/权限/完整性与启动检查（可复用现有代码，无专用生产阶段）
       ↓
一个 DomainHarness SDK 实例或普通 Domain App
```

**不能因取消必经 Assembly 阶段而取消安全保证**：仍要能证明每个 Core.Order、直接 Extension、公开 Function、Target 实现、资源路径/摘要及实际 Boot/KDP 的合法性。现有 `tooling/build/src/build.ts::buildApp` 主要读取已有 Package 文件/Artifacts、做验证/应用组合及封存，属于当前代码实现路径，**不是将来每个 Domain Package 的生成必要条件**。如交付目标/受信安装需要 Lock/Pin、可复现 Package 文件闭包，它们只是**具体 Target/应用实例所需的确定性与安全证据**，不应因此扩大一项独立的产品 BUILD。

## 4. DomainHarness SDK 本身如何构成，以及不依赖 Forge 的自举

1. 直接在 `kaicreator-mm/domain-harness` 仓库中**编写**基础 KDP/Core/SDK/Standard Domain Packages 的真实 Manifest、Elements、ESM/资源文件。必要时可由 ChatGPT 修改/补齐文件；**不需要为此开发 Seed Builder**（[#1647](https://github.com/kaicreator-mm/domain-harness/issues/1647) 已改为直接编写文件任务）。
2. 对真实文件和依赖做适用 DIS/当前 Schema 与静态授权检查，按需要将现有 Packages 与最小 Boot 作为 DomainHarness SDK 运行。现有安全验收路径可继续使用，不能要求新建一套 Build/Assembly/Lock/Kernel。
3. 若验证“SDK 能以自身公开能力服务下一代 SDK”，可直接修改/编写一组新版本 Packages，并用已存在 SDK 的 Package/Boot 能力组合、启动代表性新版 SDK/独立 Consumer。**考察的是同一 Package 模型的复用和实际可运行，不是生产工具是否自举**。
4. 无外部 Forge 代码、无 Seed Builder、无自动生成步骤仍可完成 DomainHarness 0.11.x 全部内部阶段与 Release 资格。不存在“必须先有一个自动 Package 生成器”才能开始的鸡蛋问题。

**自举在这里指 DomainHarness SDK 由普通 Domain Packages 构成并可使用同一 SDK 能力组织和运行后续 SDK 实例**；不强制以自写编译器重编译自身源码。保留最小 Boot/可信 Target 编译和安装工具是工程事实，不为它们发明额外的领域 Package 生成平台。

## 5. DomainForge 的后续位置（只保留一个状态 Issue）

DomainForge 是未来**基于已完成 DomainHarness SDK 的 Domain App**，可以提供更大规模的领域 Package 作者/生产功能，但目前不可用，**无需开发，也不阻塞 DomainHarness 0.11.x**。唯一 [Forge #218](https://github.com/kaicreator-mm/domain-forge/issues/218) 暂缓 Issue；此前过早的 [Forge PR #217](https://github.com/kaicreator-mm/domain-forge/pull/217) 已关闭未合并。Forge 以后生成的多文件 Package 与今天 ChatGPT 直接编写的 Package 使用**同一规范**，不享有特殊运行授权。

## 6. 跨版本最小验收

- **0.11.0 Foundation #1564**：合同/Boot/KDP/真实 Package 文件与其必要验证。原 B-01 的“必须生成 Package/全套 BUILD 才有 Package”产品前提由本规范纠正；Core.Order、直接 Extension、真实源码/目标、摘要和 Boot 约束保留。
- **#1647**：**直接创建/修正基础 Domain Package 文件**，不开发 Seed Builder。接受条件是文件与实际引用、必要正反例和真实 Consumer 运行，不是工具产物生成数量。
- **0.11.1 #1605**：已接受的 Workflow/Task Loop 继续复用，无需为本次产品定义重跑不变的测试。
- **0.11.2–0.11.9 #1612–#1619**：同一 SDK 的领域语义、交互、授权、推理、持久化、执行信息/经验演化，优先用普通 Packages/Standard Elements 递增；不以 Forge、Seed Builder 或“更复杂的 BUILD”作为 Gate。
- **总控 #1563**：最终验收完整 Domain/Harness/SDK、实际 Packages/Boot 组成、真实 Consumer 与必要同 SHA 证据。**不要求 Package Generator/独立 Assembly 工具/Forge E2E**；源/包格式及安全前置仍必须符合实际有效规范。

本文属于待独立审核并合入 `version/v0.11.x` 的规范候选；文档纠正不等于已创建/修改全部真实 Package 文件或已经达成最终 SDK 合格。
