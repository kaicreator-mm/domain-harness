# DomainHarness 0.11.x — SDK、DomainForge 生态、Package 构建与自举（R33 Owner 方向修正规范）

> **最高优先级的 0.11.x 产品边界修正候选。** 本文件响应 Owner 关于 DomainHarness / DomainForge / 自举和所谓“BUILD”的明确裁决。待独立审核并合入版本列车后，它在**产品定位、构建责任归属和产品间依赖**方面优先于 0.11.0 的 B-01“从生成 Package 到应用组合都是 Harness BUILD”、R29 Roadmap、未合并 R31/R32 等旧表述。保留这些历史文档作为演化证据，**不因此撤销未改变的 v0.11.0/0.11.1 实码限定验收**；对真实 ABI/信任门的迁移需另行实施/验证。

> **【R34 Owner 追加确定】** `0.11.x` 的完整产品目标是 **DomainHarness SDK**，其中 **Domain** 是有界领域语义/知识/规则，**Harness** 是该领域任务的受控执行与经验闭环，**SDK** 是通过公开 API、Boot、Domain Packages 和 Assembly 构成、可供其它 Domain App 使用的可复用交付物。为解决 SDK 自举的鸡蛋问题，**允许在 domain-harness 保留一个仅供本项目自身生产基础 Domain Packages 的临时 Seed Builder**；它属于开发期一次性工具，未来由 DomainForge 接替，不能变成 SDK 公共 Package 生产引擎。完整定义见 [R34 三名称与临时 Seed Builder](DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_AND_BOOTSTRAP_SEED.md)。DomainForge 的过时禁止所有 SDK import 规则已由 [Forge PR #217](https://github.com/kaicreator-mm/domain-forge/pull/217) 更新为“允许公开 SDK 依赖，拒绝私有模块”的候选；不得在其合入/验收前声明规则生效于 main。

```ini
OUTPUT_LABEL=DH_V011X_R33_SDK_FORGE_SELF_HOSTING_OWNER_CORRECTION
REPO=kaicreator-mm/domain-harness
MASTER_ISSUE=#1563
FOUNDATION_ISSUE=#1564
NEXT_VERSION=#1612
SOURCE_TRAIN=version/v0.11.x@43ce7feab7134e3f61f9b4686f7c8735ce4b1615
DOMAINHARNESS=BOOT_PLUS_DOMAIN_PACKAGE_BASED_DOMAIN_HARNESS_SDK
DOMAINFORGE=DOMAIN_APP_BUILT_ON_DOMAINHARNESS_TO_PRODUCE_DOMAIN_PACKAGES
ECOSYSTEM_OUTPUT=DOMAIN_PACKAGE_COMPOSED_TARGET_SPECIFIC_SDK_APPS
DOMAINHARNESS_SELF_HOSTING=REQUIRED_TARGET_NOT_YET_ACCEPTED
LEGACY_BUILD_OWNERSHIP=SUPERSEDED_RECLASSIFICATION_REQUIRED
CROSS_PRODUCT_CYCLE=FORBIDDEN
BOOTSTRAP_SEED=MINIMAL_VERSION_PINNED_AUDITABLE
STANDARDS=ORDINARY_OPTIONAL_DOMAIN_PACKAGES
CODE_STATUS=DESIGN_ONLY_NO_SOURCE_REFACTOR_CLAIM
```

## 1. 首先定义产品——不再用 BUILD 反推产品

**DomainHarness 是“基于 Boot + Domain Package 构建的领域 Harness SDK”。** 它提供所有 Domain App 可以共享的最小协议、最小启动与装配、运行机制、标准 Element/Package 能力以及 SDK API。它是**生态基础设施**，但不是必须自带知识创作、Package 自动生产和业务代码生成的平台。它自身的可交付 SDK 也应由同一组 Domain Package 组成，不能永久享有另一条特权构建链。

**DomainForge 是一个使用 DomainHarness 公开 SDK 的 Domain App；这种 SDK 产品依赖是 Owner 的现行要求，不是可选的未来方向。** 它把领域需求、来源、事实、知识、模型、人或 Agent 的创作结果变成经验证可交付的 **Domain Package**（具体的源码生成、内容编译和目标代码生成属于 Forge 的功能）。Forge 不是 Boot 的依赖、不是 DomainHarness 的内置构建引擎，也不要求所有业务开发必须在线运行 Forge：开发者已拥有合格 Domain Package 时可以直接用 DomainHarness SDK 装配运行。

**Domain App 是由 Boot + 经过选定的 Domain Packages + 目标/部署适配配置组成的应用。** Domain Package 是同一种可组装产物，既可以提供 Business Domain，又可以提供标准 Reader、Kernel/SDK 基础能力、Client/Server/CLI 功能。差异来自**已选 Package、接口绑定、Target、Host adapter**，而不是针对“SDK App”“Forge App”分别创建第二套 Runtime 或 BUILD。

**此处“构建”有两种不同动作，不能再混称为一套大 BUILD：**

| 概念 | 做什么 | 产品所有权 |
|---|---|---|
| **Package Production**（生产/编译） | 从需求/Domain Data/Element、源码或模板生成新的 Domain Package、资源、实现、Manifest；提供来源、合法性和版本元数据 | **DomainForge Domain App**；早期 seed 可以有极小临时生产步骤，但不得升级为 DomainHarness 永久功能 |
| **Package Assembly / Linking**（装配/链接） | 对已有 Domain Package 选版本/Target/直接依赖与导出、验证静态授权、封存资源/接口/启动 Pin，产生可运行 Domain App 或 SDK App | **DomainHarness SDK 基础能力**，可用工具或 SDK API 包装。只做完成一次装配所必需的事，不承担领域内容生产 |
| **Boot / Execution** | 定位、验证、激活 Package，并执行业务 Workflow/Element Function | **DomainHarness SDK 运行基础**。不生产/链接新 Package，不动态填补缺失依赖 |

**结论：旧“BUILD 必须覆盖单个 Package 生产到 App 组合，因循环依赖所以全归 Harness”的逻辑已被 Owner 否决。** 历史 `buildApp` 可保留为过渡代码事实，不再作为未来产品概念或新功能命名的权威；演进时把真正的装配能力划入 SDK，生产能力回归 DomainForge，不能为了维护历史 BUILD 概念继续添加功能。

## 2. 统一的 SDK / Domain App 构造方式

```text
[DomainHarness SDK：Boot + 基础/公共 Domain Packages]
       │
       ├── 消费已存在的 Domain Package
       │       ↓
       │   SDK Package Assembly / Linking  ──→ Boot + 已选 Packages + Pins
       │                                         ├─→ CLI Domain App
       │                                         ├─→ Server / API Domain App
       │                                         ├─→ Client / UI Domain App
       │                                         ├─→ Agent / Domain Harness App
       │                                         └─→ DomainHarness SDK 自身的可交付实例
       │
       └── 运行 [DomainForge Domain App]
                 │ 需求 / 来源 / 授权 / 领域知识 / 代码
                 ↓
          生产新的 Domain Package
                 └──→ 回到上方同一个 SDK 装配入口
```

- 每种目标均使用**同一套** Element/Function/Package/Init/Exit/Extension、Boot/KDP 的语义；`Host Adapter`/Target 负责真实 UI、网络、设备、存储等宿主差异，适用平台能力要通过显式声明、选择和授权。0.11.0–0.11.2 已有 Node ESM 路径，不意味着 CLI/UI/Server/Mobile/Browser 等所有 Target 都已经实现。
- **组装输入**：已有 Domain Package（携带 Element/Function/资源/实现/Manifest/可用 Target）、应用所需 Package 根与角色、目标 Profile、外部能力限制和配置。不得把任意新领域知识草稿当成合格 Package 直接执行。
- **装配输出**：可检查的确定性 App/SDK 装配清单、已选 Package/Functions/Resources/Target 及精确版本/摘要/启动 Pin，最终的安装/发行产物。使用已有 `DomainAppLock` 可满足当前安全目标，**但不能把“Lock 文件名/复杂 Schema/当前 npm 包装方式”视为产品本体或永久独立 BUILD 机制**。
- **装配时必要的安全守门**：合法 Package 身份/完整性、唯一 Core.Order=0 KDP、Core 初始化链、直接 Extension 的已声明调用、公开接口、选定 Function、目标兼容、已使用资源/实现引用和所需权限，不能只因为移除 BUILD 概念就允许未知代码或未授权调用。无法证明的执行边仍拒绝或显式 UNKNOWN；何时进行这些验证可以在生成、包验收、装配和可信运行交接间合理分层，**最终 SDK 不得默认信任没有经过资格验证的 Forge 输出**。
- **无额外构建特权**：DomainForge、DomainHarness SDK、业务 App 都调用相同的公开 Package Assembly API；一个有现成 Package 的 Consumer 不需要运行 Forge、也不需要引入完整创作模型/源代码分析器。后续 API 可以命名为 `assembleDomainApp/composeDomainApp` 等，当前已有 `buildApp` 的改名/迁移应单独做有界源码变更、测试，**不为 v0.10.x 或临时历史接口引入多余兼容层**。

## 3. 为什么不会发生真正的循环依赖：自举而非永久 BUILD

**逻辑依赖方向是单向的：DomainForge App → DomainHarness SDK；DomainHarness SDK → 已有/可信的 Domain Packages，不依赖 DomainForge 运行。** 但目标是让未来版本的 DomainHarness 自己也作为 Package 组合而成，这会产生一个*时间上的生产先后关系*，不能因此把 Forge 代码塞回 SDK。

建议使用**分阶段自举**而不是一条互相导入的代码环：

1. **Seed / Stage-0（最小可信根）**：使用已确认的极小 Boot + Loader / Package Contract、固定的基础 KDP/SDK Package artifact（可由已知工具链直接编译或一次性产生），完整记录 Seed 源、Target、版本/摘要/发布资格。它必须能**装配与运行既有 Package**，不需要能根据自然语言“生产” Package。Seed 不是永久第二 Kernel、第二 Package 协议或长期扩张的 BUILD 平台。
2. **Stage-1（Forge 建立生产能力）**：在 Stage-0 DomainHarness SDK 上运行 Forge Domain App。Forge 根据自身作者/生产能力和公开 Package Contract 生成需要的新 Domain Packages；它不加载 DomainHarness 内部 Compiler 私有 API，也不要求被生产的 Package 在生产时反向执行 Forge。
3. **Stage-2（自举 DomainHarness）**：把 DomainHarness 自己的基础能力（可交付 Boot 的极小外壳 + Core/SDK/Standard Element 对应 Packages）当作同样的生产/装配目标。Forge 生产或更新这些 Packages；现有 SDK 装配并产出 **新版 DomainHarness SDK**，它能够再次运行 Forge 并装配其它 App。
4. **Stage-3（闭环验证）**：在固定 Target/输入/Pin 下，新 SDK 能装配自己的后继 SDK 与同一代表性 Domain App；通过独立验证的签名、身份、接口/行为、装配稳定性及必要的字节可重现性证据后才能宣称自举资格。初始 Seed 和结果可以有不同实现方式，不得在没有确定性约束证据前强制虚构“二进制逐字相等”。有一次能用 Forge 生产 DH Package 不等于 Forge 已具备全部 DomainHarness 构建能力。

**必要的不变量**：
- 运行期依赖图永不出现 `DomainHarness Runtime -> DomainForge Runtime`，也没有 `DomainForge -> 私有 DomainHarness Compiler -> DomainForge`。
- 自举以**前一代已固定、已验收 SDK**生成/装配下一代，不能让尚未完成的新 SDK 在同一构建中自我作为唯一生产前置。
- Boot/最小 Package Contract 是可信根的组成，不强制宣称最初完全没有非 Package 代码；目标是**可交付的 DomainHarness SDK 按同一 Package 组装语义构成**，而不是用 Forge 生成运行前所需的第一条 CPU 指令。
- 同一个 Package 规范、合法性/权限/版本规则也适用于 Forge 和 DomainHarness 自身，不得为 SDK 自举豁免静态依赖检查。
- Stage-2/3 是**架构要求与未来资格验收**，不是声称当前 `version/v0.11.x` 已经验证 Forge→Harness SDK 自举链。完整自举的实施必须排入明确的后续 0.11.x 阶段/资格，而非偷偷扩大 0.11.2 Reader T00 范围。

## 4. 已有 DomainForge 冻结边界与本目标的差异（必须显式解决）

当前 `kaicreator-mm/domain-forge@main` README 的 v0.0.3 R-005/#44 **明确禁止 Forge Core import 任何 DomainHarness 公共或内部编译/运行包**，并通过源码静态扫描验证。它当前把 Forge 定位为 `AuthoredCandidate` 生产者、通过公开 DAC 和未来 adapter 进行交接。这是**已存在的阶段性技术事实**，与 Owner 当前要求的“Forge 是运行在 DomainHarness SDK 上的 Domain App”**尚不一致**。

- **历史冻结 Core 与当前产品规则分离**：Forge 旧 R-005 的一切 Harness import 禁令现在已被 Owner 废止，新的 [Forge PR #217](https://github.com/kaicreator-mm/domain-forge/pull/217) 正在更改两套机械门禁为 **允许 `@kaicreator/domain-harness` 公开 SDK 依赖、禁止私有/深层实现依赖**。保留旧冻结文件作为历史证据，不据此宣布 Forge App Boot/E2E 已合格。
- 本规范指定**未来整合目标**：Forge 作为 Host SDK 上的 Domain App，真正 Package 生产通过明确定义的公共接口/适配器与当前 Forge Core 对接；可保留 Forge 的纯作者核心库（无 runtime 依赖），但**外层 Forge Domain App** 必须真实使用 DomainHarness SDK/Boot/Package。现存 R-005 对“Forge Core”的禁止可继续成立；不可把它扩大成永久禁止所有 Forge 产品有 DomainHarness Domain App 外壳。
- Forge 要从“只生产候选”升级为“可生成可交付 Domain Package”，需要在 DomainForge **自己的未来 Product/L2 版本和 DAC 交接合同**中确认产物/适用 Target/证据/权限与测试。不要在本仓库修改冻结 DAC/Forge 契约，不得把缺少这个交接权威当作已完成的自举证据。
- 上游的 Domain Data / Claim / 权利/适用范围资格并不因为 Forge “运行在 Harness 上”就自动晋升；Harness SDK 的 Package 合法性也不因为 Forge 声称通过而自动合格。

## 5. 0.11.x 中从此必须维护的复用、版本责任

- **0.11.0 Foundation（#1564）**：定义最小 SDK Boot + Package 架构与装配 API/规则，明确 Domain/Harness/SDK 三术语，以及**仅供 DomainHarness 自己自举使用的临时 Seed Domain Package Builder**（不进公共 SDK、不生产其它领域 Package、将来由 Forge 替换），形成 Source→基础 Domain Package→可交付 SDK App 的最小可证实形状。保留已合格的 Element-First、Init/Exit、Core.Order、Direct Extension、T11/T14 真实运行证明；但撤回 B-01“全生产都在 DomainHarness BUILD”的产品归属。代码清理/重命名只能在单独有限任务中实施。
- **0.11.1 Task Execution（#1605，已 Scoped 接受）**：Workflow/XState/Task 是 SDK Package 可复用执行能力；不因本规范重写或重新审已接受源码。现有 `buildApp` 的演示调用只是其时的技术实现，不等于“BUILD 是整个平台”的产品定义。
- **0.11.2 Domain Intelligence（#1612）**：Domain/Rule/Reader/Decision 的通用可复用能力作为**Standard Elements**；领域知识/业务规则仍由 Domain Package 携带，源创作/Package 生产属于 Forge。原先 #1644 的 Reader 解析职责设计，需要**重新以 SDK Package/Forge 生产分工为前提**审查，不得继续把“DomainHarness BUILD 复用 Reader 纯解析库”设为 Product 必须。
- **0.11.3–0.11.6**：交互、授权 Effect、有界 LLM、Durable Task 都应作为 SDK 基础合同与可选标准/领域 Package 增量；禁止创造第二应用 Runtime、领域 Package 自动生产器或 Forge 替身。
- **0.11.7–0.11.9**：执行证据、客户端经验、服务器汇总产出候选知识/流程改进；**真正新 Package 的生产/重新构建走 Forge Domain App**，使用 SDK 装配/激活新版本，不能由 SDK Server Meta 后台直接热写已运行 Package。
- **自举目标进度与总 Release 资格**：Owner 已明确要求 **DomainHarness 自身也必须由 Domain Package 构建出来**，因此这是 **0.11.x 最终完整生态验收的必要条件**，不是可选特性；在总控 #1563 维持跨阶段资格 `SDK_SELF_HOSTING_NOT_YET_IMPLEMENTED`，完成真实 Stage-0→Forge App→新 DH Package→新 DH SDK→重复装配的 E2E 验收之前，不得宣称整个 0.11.x 自举完成或最终产品 Release 合格。每个内部阶段仅承担自己真实范围，不把自举的所有代码塞进 0.11.2 T00；Seed 绝不可冒充完成自举。
- **标准 Element** 仍为普通选定的 Element/Package，按 R29 Catalog 递增；DomainForge 可以生产标准 Package 候选，但只有合格版本/来源/可复用真实 Consumer 与独审证据才可晋升 `STANDARD_ACCEPTED`。

## 6. 准入验收、否定标准及与旧规范的优先关系

本次 Owner 决议及该文档（审合后）的最低可证伪目标：
1. 两个现成普通业务 Domain Packages 与一个标准 Package，能在**不启动 Forge**时通过同一 SDK Assembly + Boot 形成至少一个真实 Domain App；未导出、未声明、错误摘要/版本不因删掉“BUILD”概念而绕过拒绝。
2. 在该同一 SDK 上，Forge 以真实 Domain App 的身份运行并**生产**一个新的有版本、有资源、有目标实现的 Domain Package；该新 Package 经 SDK 同一装配/启动路径成为第二个运行 App。若当前 Forge 只生产候选，应如实标记 NOT_IMPLEMENTED，而非让 SDK “代生产”冒领。
3. DomainHarness 自身的至少一个 Core/SDK 组件由符合相同公开 Package 规范的包构成，并通过固定 Seed/Stage-1/Stage-2 产生后继 SDK；完整自举资格以真实跨代端到端证据为准。
4. 主仓库不得留下两个相互竞争的 Package 组合权威或两份长久独立的“生成引擎”；传统 `tooling/build` 源码功能逐项定责后迁移/精简，不能只改文字而永远保持旧生态权力。
5. 后续每个版本 Product/L1、L2、Task、PR 在新设计前必须先回答：“这是 **SDK 装配/运行**？还是 **Forge Package 生产**？还是 **可删除的历史 BUILD 复杂度**？” 没有明确归属不得开始重复实现。

**文档优先级（审合后）**：本页的 **产品所有权/生态关系/自举** > R29/R32 相关产品句子与 v0.11.0 B-01“BUILD 包含生产”旧决定；**已有 Element/FunctionRef、Init/Exit、Core.Order、显式 Extension、受信加载等仍为有效运行/安全基础**，不因“旧 BUILD”词语失效。任何此前把缺失“完整 Package 生成器”认作 DomainHarness Foundation 必须加功能的执行指令均暂缓，重新分类后才能实施。
