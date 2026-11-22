# DomainHarness 0.11.x — 历史 BUILD 实码拆分、归属与精简台账（R33）

> **这是源码审计/迁移规划，不是代码已迁移或认定已接受代码无效的结论。** 基线：`version/v0.11.x@43ce7feab7134e3f61f9b4686f7c8735ce4b1615`。产品归属以 [SDK/Forge/自举 Owner 定义](../specs/DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md) 为准。此前名称 `tooling/build` 和 `buildApp` 是**已有实现位置**，不能据此自动赋予 DomainHarness 所有“从零生产 Package”权力。

```ini
OUTPUT_LABEL=DH_V011X_R33_LEGACY_BUILD_OWNERSHIP_AUDIT
REPO=kaicreator-mm/domain-harness
FOUNDATION=#1564
MASTER=#1563
BASE=43ce7feab7134e3f61f9b4686f7c8735ce4b1615
REVIEW_METHOD=REAL_SOURCE_MODULE_BASIS
SDK_RETAIN=MINIMAL_PACKAGE_ASSEMBLY_AND_TRUST_BOUNDARY
FORGE_TRANSFER=DOMAIN_PACKAGE_PRODUCTION_AND_AUTHORING
REMOVE_OR_SIMPLIFY=ARTIFICIAL_MEGA_BUILD_PRODUCT_AND_DUPLICATED_NONESSENTIAL_MECHANISMS
STATUS=PLAN_ONLY_SOURCE_UNCHANGED
```

> **【R36 覆盖 R34/R35 的 Seed Builder 假设】**：Domain Package **不是由生成器赋予身份的产物**，而是 DIS 适用规范 + 0.11.x Package 契约下的多文件集合；可由 ChatGPT/开发者直接编写。此前本审计所述“保留临时 Seed Builder”“生成后才进入 Assembly”**均不是准入要求**，不再要求新建种子生成工具。#1647 已改为直接编写实际基础 Package 文件的任务。使用多个现成 Packages 组成应用时，仅保留必须的选用/引用/权限/摘要/Target 验证和可信 Boot；`Assembly` 不必作为独立工具产品/必经生产阶段。DomainForge 保持延期。参见 [R36](../specs/DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)。

## 1. 实际职责的归属（R36 优先）

- **S：SDK 必需** = 没有 Forge、仅提供现成 Domain Packages 时，DomainHarness 仍必须能够调用公开组合 API，将它们装配成准确可信的可运行 App/SDK、Boot/KDP 激活，并阻止未授权依赖。这些能力应收敛于 `Package Assembly/Linking/Validation` SDK 实现，不要求用户另外部署“BUILD 服务”。
- **F：Forge 生产职责** = 从需求、Domain Data/Claim/Element/Business 内容或代码草稿**生产**新 Package/实现/资源、生成模板、领域内容编译、根据目标产生多种源和业务逻辑、治理知识/版本等；由在 DomainHarness 上运行的 Forge App 提供，允许 Forge 纯作者 Core 保持独立，经明确的公开 Package 接口交接。
- **V：可选 Package 合规验证器（与作者方式正交）** = 只对**已存在的真实多文件 Package**检查当前已明确且适用的 Manifest/Element/Function/资源/依赖/Target/权限条件。可作为 DomainHarness 的小型测试、校验库或 CLI 逐步实现并复用现有逻辑，未来可以成为 Forge 的部分能力；**既不是 Package 生成器，也不是必经产品平台，不要求 Forge 当下可用**。先用实例和反例补全尚不明确的 DIS/SDK 规范，验证器 `PASS` 只针对覆盖的版本/Target/条件。详见 [R37](../specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)。
- **D：直接编写 Domain Package 文件（不是工具）** = ChatGPT 或开发者直接创建/维护 DomainHarness 本身基础 Package Manifest、Element、资源与 Function 文件，按 DIS 适用条款和 0.11.x 当前规范检查。无需新建 Seed Builder；不应把 Package 生产方式作为身份/合规门槛。详见 [R36](../specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)。
- **X：不必要 / 应精简** = 由于误把 BUILD 设计成另一个产品而造成的额外分层、重复计算、全局硬编码、过度通用编译器/双 Runtime、无限期为所有目标生成全部模板的职责。X 表示**移除不必要机制**，不是删掉有证据要求的安全防线；实施时必须先有同等受信 SDK 装配/Host 守门和受影响负例。

## 2. 按真实文件逐一拆分

| 现有文件（均在 `tooling/build/src/`） | 当前已存在的主要职责 | 新归属 | 需要的具体处理 |
|---|---|---|---|
| `build.ts` (969 行) | `buildApp(input: BuildInput)`；读取既有 manifests/roots/artifacts，选 Core、Package/Element/Function/Target、闭合依赖/资源、装配唯一 Lock/AppPackage、双次确定性比较 | **S（精简核心） / F（将未来任何“生产生成”请求迁出） / X（去除大 BUILD 产品地位）** | 将入口重新定位 `assembleDomainApp` 语义、按 SDK 可信组合职责拆开；留最小确定性装配/安全拒绝。当前并**无**通用 Package 生产器，禁止要求它“补齐所有生成” |
| `graph.ts` | 小型 SemVer 约束检查、确定性依赖拓扑 | **S** | 作为 SDK Package 选择/依赖辅助函数复用；不扩展成 Forge 全领域知识 DAG 编译器 |
| `resources.ts` | 安全 Package Root、realpath、资源摘要、封存文件闭包 | **S** | SDK 装配阶段保留可信文件/摘要验证；Forge 生产时也应验证自己输出，但不能由此推断此模块负责生成业务内容 |
| `schema-check.ts` | Manifest/Domain/Element/Function 的 JSON Schema 编译与结构验证 | **S + F 分层** | SDK 仅保留**包接口/引用/被选执行契约必需**的验证；高级 Domain 内容真实性/知识格式生产校验应在 Forge/领域专属 Validator，避免 SDK 逐年演化为“全领域格式生产引擎” |
| `selection-types.ts` | 内部 LoadedElement/ResolvedFunction 选定载体 | **S** | 保留内部轻量类型，不新增外部 DSL/编译 IR 体系 |
| `app-package.ts` | `sealPackageManifest/resolveExportedModule/composeAppPackage`；封存 Package 文件、唯一 Boot、生成当前 Node/npm AppPackage | **S + X（可选 Host/Target adapter）** | 保留最小 Compose/App 装配接口；`node/npm` 的 scripts/安装模板放在可选 Node Target adapter，不能当成所有 Client/Server/App 的通用编译主路径 |
| `trusted-runtime.ts` | 固定 `xstate@5.33.2`、`yaml@2.9.1` SRI/安装器/验证器并生成受信安装文件 | **S（当前安全事实） + X（减少永久硬编码）** | 在当前已接受 Node/Workflow Target 上保留必要 SRI/安装防线，未来放入 Host/Target-specific trusted dependency policy；**不允许**因“BUILD 不属产品”就关闭 Pin/SRI 或允许任意 npm install。中长期清理硬编码版本和重复安装器逻辑，须受影响测试 |
| `workflow-selection.ts` | 选定 Workflow/FunctionRef/Reader Resource，验证直接依赖与导出，拒绝非法 YAML/JSON | **S（Workflow/Ref 链接） + F/Standard Element（数据作者期解析）** | SDK 必须验证节点引用/选中能力/闭包；业务内容格式解释优先由选定 Reader 标准 Element 或 Forge 生产校验承担。BUILD 时额外跑全格式解析不可自动成为 SDK 长期必需：保留等价安全门前不得直接删除 |
| `static-package-guard.ts` | TS AST 遍历 ESM、禁止非法 dynamic import、验证显式 Export/Function Target/句柄跨 Package 透传 | **S（必要组合验证） + F（Package 生产后的源码验证） + X（避免泛化 TS 编译器）** | **拒绝未声明 Extension 的规则必须保留**；未来 Forge 可以在生成包时执行完整源码审计，SDK 要有最小且可证实的 Package 资格/调用闭包校验。不能简单删掉源码 AST 扫描后盲信任 Package；可分层/缓存已审 Packaged Artifact 的有效证明，减少每次应用重扫 |
| `refusal.ts` | 统一拒绝错误类型与代码 | **S** | 移入 SDK Package 组合/校验错误表；Legacy `DH_BUILD_*` 错误码目前受证实，不为改名无谓破坏测试，实际迁移版本中可原子更名 |
| `types.ts` | `BuildInput` 要求已有 `packages/roots/artifacts`；`BuildSuccess` 提供 Lock/AppPackage | **S** | 新 API 以**已有 Package、目标配置、可信验证和组合结果**为核心，不新增生成请求；公开 ABI 在有限版本升级中收敛，保留实际已接受可用性 |
| `index.ts` | 导出 `buildApp`、`BuildRefusal`、各构建类型 | **S（保留 SDK facade） + X（历史概念名）** | 公共 SDK 对外提供装配/验证入口；以后不以单独的“BUILD 平台”作为业务产品卖点或永久自立运行时 |

**直接编写现状与说明**：`examples/basic-domain-app/consumer.mjs::authoring()` 用代码写出文件只是当前 Demo Fixture 的**一种作者方法**，并非 Domain Package 的必需生成步骤。未来 #1647 按需直接编写真实基础 Package 文件（Manifest/Element/ESM/资源），不建立 `tooling/bootstrap-seed/` 或 `scripts/bootstrap/`。静态验证/摘要/Boot 继续由现有可信能力负责；不得要求文件必须出自此 Fixture。

**特别澄清**：`packages/contracts/src/*` 的 Element/Package/Function/Outcome/ResourceRef 合同 **属于 SDK 的公共 ABI**；Forge 是这些公共合同的消费者/Package 生产者，不能把基础 Package Schema 因“Forge 要生成”就全部抽离 Harness。类似地 `packages/microkernel/src/*` 的 Boot/KDP/Init/Exit/Workflow 是运行基础，绝不能为了抛弃 BUILD 一并迁入 Forge。`packages/domain-harness/src/index.ts` 是 facade，不是额外 Runtime；可继续导出最小装配/运行能力而非泛用 Package 生产接口。

## 3. 必须删除的“概念债”及可审范围

**X1：删除“DomainHarness BUILD = 全生态 Package 生产平台”的产品主张。** 本轮文档直接修正，不要求删掉正在保障安全的模块。

**X2：撤销“将缺少通用 Domain Package 生成器视为 0.11.0 Foundation 不合格缺口”的自动 Gate。** DomainHarness Foundation 验收基于实际 Domain Package 文件、SDK 的应用选定/静态授权/封存及 Boot；**没有必须实施的 Bootstrap Seed 或其它生成器例外**。Package 由 ChatGPT、开发者或 Agent 直接编写即可以现有规范校验，未来 Forge 可以选择提供生成能力，但不是 DH 0.11.x 前置条件。

**X3：禁止第二 BUILD/Compiler/Lock/Service/Runner。** 凡是仅为了给 Standard Element 再造 Loader、为不同 Target 单独维护新 Kernel、为了 Forge 自动生成反向引入私有 Harness 编译实现的设计，均视为不必要的重复。

**X4：精简无产品价值的模板与重复验证。** 重复 JSON/YAML 解析器、两套 Package/Workflow Schema 真相、对同一已签名且未变 Package 的无谓全源二次编译、与应用需求无关的强制 npm/npm Registry/Node Host 模板等，均需**先说明语义和信任边界**，再设计替代与删除，不得草率移除已接受安全拒绝。

**X5：不得从“代码目前在 `tooling/build`”推导产品所有权。** 移动工具包的源码不能自动改变受控公开包的访问权限；迁移需保持相同拒绝/版本/摘要/密封含义及 clean-packed Consumer 验证。

## 4. 有限实施顺序（不研发 Package Generator）

**步骤 A · R36 产品规范**：Domain Package 是多文件集合，不要求工具生成；应用可能需要选择多个现有 Packages，但这种“组合”不是单 Package 生产步骤。撤回旧 BUILD 平台、Seed Builder 生成器和强制独立 Assembly 流程的主张。

**步骤 B · #1647 直接文件实施/逐项确立规范**：根据真实 DIS 适用 Package 规范和 0.11.x Element-First 合同，**由 ChatGPT/开发者直接创建/修正 DomainHarness 基础 Package 文件**。复用已有验证、现有 Boot 与实际 Consumer；只在必要时使用 `buildApp` 等历史已有代码确认目标 App 引用闭合，不据此要求先开发工具。

**步骤 C · 0.11.x SDK 逐阶段开发**：继续 0.11.2–0.11.9 的真实 SDK 功能；以实际 Package/Consumer/负例记录 `CONFIRMED / PROPOSED / UNKNOWN / NOT_APPLICABLE` 并完善必要合同和类型/测试。**按需可建设 Validator** 检查已写出的文件，复用现有验证代码；它不生成 Package，不要求独立 Assembly 平台，也不成为 Forge 前置。已接受且未变的安全规则照旧保留。

**步骤 D · Forge 将来开发**：只记录 [Forge #218](https://github.com/kaicreator-mm/domain-forge/issues/218)；它以后如何生产同规范 Package、是否复用/引入上述 Validator，均不在当前任务范围，也不会改变手写 Package 的资格。

## 5. 每版交付必须回答的问题（小型 Review Checklist）

每个 `0.11.x` 版本在新增模块和 Issue 时只回答：
1. 使用的功能**是否是所有 Domain App 必需的 SDK/Assembly/Boot 机制**？如果仅为创作/生产新 Package，则归 Forge。
2. 如果是新通用行为，它是不是可选 **Standard Element/Package**，而非写死在 SDK 的大型编译模块？
3. 是否存在多余的 `BUILD` 控制面、重复 Parser/Loader/Package System、运行时动态二次编译？有则削减。
4. 它是否允许现成 Package 在**完全不运行 Forge**的情况下装配执行？允许 Forge App 同样走普通 Boot+Package 路径吗？
5. 它是否能通过当前版本的受影响正反例和同 SHA 独审证明，且不将“规划的自举”当成已完成？

没有真实源码/消费者/验收，所有迁移继续标为 **PENDING**；不把审计文档中的建议伪装成已执行的源码删除。
