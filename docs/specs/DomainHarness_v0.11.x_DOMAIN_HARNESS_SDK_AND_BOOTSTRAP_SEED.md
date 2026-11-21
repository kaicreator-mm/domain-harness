# DomainHarness 0.11.x — Domain / Harness / SDK 三名称、完整产品目标与临时自举工具（R34）

> **Owner 最新产品定义的显式细化**。必须与 [SDK–Forge 生态与自举 R33](DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md) 一起使用。本规范修正先前“DomainHarness 就是 BUILD/Compiler/全套业务生产平台”的误归属。**本阶段仅确定产品语义、种子构建边界和验收模型；既有代码尚未整体重构、自举尚未 PASS。**

```ini
OUTPUT_LABEL=DH_V011X_R34_DOMAIN_HARNESS_SDK_THREE_NAMES_AND_TEMP_BOOTSTRAP
MASTER=#1563
FOUNDATION=#1564
VERSION_TRAIN=version/v0.11.x
PRODUCT_GOAL=BUILD_THE_DOMAIN_HARNESS_SDK
DOMAIN=BOUNDED_BUSINESS_SEMANTICS_AND_KNOWLEDGE
HARNESS=BOUNDED_DOMAIN_TASK_EXECUTION_AND_CONTROL
SDK=REUSABLE_EMBEDDABLE_PACKAGE_ASSEMBLY_BOOT_EXECUTION_API
DOMAINFORGE=DOMAIN_HARNESS_SDK_BASED_DOMAIN_APP_PACKAGE_PRODUCER
SEED_BUILDER=DH_ONLY_TEMPORARY_NON_PUBLIC_NON_GENERAL_PURPOSE
SEED_BUILDER_SCOPE=ONLY_DOMAIN_HARNESS_OWN_DOMAIN_PACKAGES
NEXT_STAGE=FORGE_AS_PRODUCTION_PACKAGE_PRODUCER
FINAL_SELF_HOSTING=MANDATORY_NOT_YET_IMPLEMENTED
```

## 1. 三个名称不可混写

| 名称 | 定义 | 0.11.x 中对应的可检查实体 |
|---|---|---|
| **Domain**（领域） | 一个有清晰边界的知识、事实、业务对象、规则、流程、适用条件、版本/来源与权限语义空间。它回答“在**哪个领域**、什么信息与条件成立、允许做什么”。 | `DomainDefinition`、领域 Element/Content/Function/Knowledge/Workflow、Domain Package 内的有版本领域语义；Domain 不是单个运行时进程，也不是泛指 TypeScript Package |
| **Harness**（领域执行支架） | 面向**已选 Domain** 的任务组织、确定性执行、状态与反馈/经验闭环；提供安全边界、可解释 Outcome、授权/宿主适配、控制与限制，必要时才调用受限模型/工具。它回答“怎样在该领域内**稳定地完成任务**”，不是无边界万能 Agent。 | Boot→唯一 KDP/Core.Init→已选 Workflow/Element.Function；0.11.1 确认的 Actor/Hook/Budget，0.11.2–0.11.9 渐进补齐 Domain Intelligence、交互、Effect、Reasoning、Durable/Evidence/Evolution |
| **SDK**（可复用开发工具包） | 开发者可获取、版本固定、可嵌入或组合到不同 Domain App/SDK App 的统一 **Contracts + Boot + Package Assembly + Execution API** 与按需公共 Package。它回答“如何用相同组件和 API 构建不同领域应用”。 | `@kaicreator/domain-harness` 公共 facade 与基础/标准 Packages，Target/Host 适配，Package 装配/Pin/Boot；SDK **本身也是由 Domain Packages 组成的产物** |

**全名必须按这个次序解释：`DomainHarness SDK = Domain-bounded Harness Software Development Kit`**，不是一个名为 BUILD 的生产平台，也不是一个“SDK 只是 `packages/domain-harness` façade、真实产品为编译器”的结构。SDK 的底层 Boot 是最小独立信任根；其余可 Package 化能力应通过同一 Domain Package 规范选择、编排和交付；不宣称初始 Boot 指令必须由 Forge 无中生有。

**0.11.x 的整个产品目标**是构建这个 DomainHarness SDK：先有 Boot/Package 的可用基础 SDK，再持续以普通 Domain Packages 增强 Harness 的领域语义与任务/Agent 能力，直到完整交付且**能够用它自身所依赖的 Forge Domain App 生产后继 SDK 的 Packages，完成自举**。各 `0.11.n` 只是同一 SDK 的内部迭代，而不是每版独立发一个互不相干的 Compiler/Agent 平台。

## 2. DomainForge 的产品位置、运行依赖与无环关系

- **DomainForge = 基于 DomainHarness SDK 构建的 Domain App**。**这是当前 Owner 的产品定义和新依赖规则，不是一个“未来可选集成”**：Forge 需要依赖**已发布/可安装且版本精确固定的公开 DomainHarness SDK**；可以直接调用 `@kaicreator/domain-harness` public root 组成自己的 Boot/Domain Packages/SDK App。Forge 创作逻辑仍是 Forge 私有 Domain Package/Functions/Elements，不直接拥有 KDP Runtime 代码。
- **Forge 负责生产新 Domain Packages**：领域内容作者、源与权利验证、模型生成、Package 模板/源码/资源生成、Target 处理、生产者证据；生成后的 Domain Package 由 DomainHarness SDK 的统一 Assembly API 接收、验证和装配。
- **代码依赖无环**：`DomainForge App → DomainHarness SDK(public)`；`DomainHarness SDK → 已有基础 Domain Packages + Boot`，**绝不** `DomainHarness SDK → DomainForge App`。Forge 生产后继 SDK Package 是**时间分代的工件流**，不构成当前进程的模块 import 环。
- **现行状态必须诚实**：DomainForge 已冻结的 v0.0.3 R-005 对一切 Harness import 的禁令是过时规则；本轮应在 **domain-forge** 当前非冻结政策/测试中改成“允许公开 SDK、拒绝私有编译/runtime API”，保持历史冻结证据不变。本规范与 [domain-forge 修正规则 PR #217](https://github.com/kaicreator-mm/domain-forge/pull/217) 联动；**允许依赖 != 已实际接线/安装/运行**。在 Forge 还没通过真实 Boot/Package 生产 E2E 前必须标为 `FORGE_AS_DOMAIN_APP_RUNTIME_NOT_YET_PROVEN`，而不是因为政策改变直接宣布实现合格。

## 3. 临时 DH-only Domain Package 构建工具是允许的，而且必要时应保留

解决“Forge 要依赖 Harness，但初版 Harness 又需要 Packages 才能存在”的启动问题：

**允许在 `domain-harness` 仓库保留一个简单的 `bootstrap-domain-package-builder` 作为临时种子生产工具**。它只服务 DomainHarness **自己** 的基础 Domain Packages，从已有源码/声明/资源**确定性地输出包文件/Manifest/Content Digest**，为首版 SDK 的 Boot 与 Assembly 提供最小输入。它不是开发者公共 SDK、不是 DomainForge 替代品、不是生态通用 Domain Package Compiler，也不代表 Harness 未来有“生产任意 Domain Package”的能力。

**必须满足的范围上限：**

1. **只处理本仓库维护的、明确列举的 DomainHarness 基础/SDK/标准 Package 种子**；不能接收外部业务 Domain Data、用户领域创作请求或动态 Model/Agent 生成任务。
2. **只做最小机械转换**：从现成包定义/目标源码/资源得到普通 `DomainPackageManifest` 和 Package 文件、版本/摘要；可借用开发期 Node/TypeScript/文件拷贝/签名工具。不创造另一种 Package 格式、Core 生命周期或与 SDK Assembly 并列的运行权威。
3. **不作为 SDK 公共 API 发布**：建议暂放 `tooling/bootstrap-seed/` 或 `scripts/bootstrap/`（实际落位需源码设计决定），明确 `internal / bootstrap-only / no third-party Domain`；不要在 `packages/domain-harness` 公共入口暴露任意 Package 生成命令。
4. **同一安全规则**：临时工具生成的 Package 不因“第一方”就跳过 SDK 的 Owner、Direct Extension、Target、Resource Digest、可信加载/Pin/真实 Boot 校验；同一个 AppPackage 仍使用原来已审必要权限边界。签名、重现性、Package 精确来源/依赖应有最小记录。
5. **可替换且有结束条件**：在 DomainForge Domain App 已能生产与临时工具**同一公开 Package 合同**的 DH 基础 Package，并通过跨代 SDK 自举 E2E 验证时，删除/冻结该临时生产入口；其测试样例可以保留为 Forge 的**参照/golden fixture**，但不能形成永久“Forge 和 DH 两个通用生成器”。
6. **研发态种子不等于线上运行依赖**：Seed Builder 只在初始或需要的自举构建时运行；Runtime/普通 App Consumer 不要调用它。正常 Domain App 用已产出的 Package + 公共 SDK Assembly/Boot 即可启动，**不需要运行 Forge 和临时 Builder**。

**现有代码映射**：`examples/basic-domain-app/consumer.mjs::authoring()` 已在测试中从模板写出示例 Package 资源和 Manifest；这是**真实存在的最小种子生成机制候选证据**，但当前只是在 Demo Fixture 中运作，不得把它宣称为正式可供 DH 自举的 Seed Builder。受审 `tooling/build/src/build.ts::buildApp` 已接收既有 `PackageRoots/Artifacts`，主要执行 Assembly/Validation/Sealing 而非通用源码生产。下一步优先从已存在的测试 fixture/固定源创建一个**仅 DH 自用、一次性有限**的 Seed Builder，避免重写大型工具。

## 4. 如何生成不同的 SDK App：一套组合机制，不是三套产品构建器

```text
初始已有/Seed 固定的 DomainHarness 基础 Packages + Boot
                             ↓
                  DomainHarness SDK 可运行实例
                       │               │
     现成领域 Packages┘               └── Forge Domain App（基于同一个 SDK）
               ↓                                    ↓
    SDK Package Assembly                   生产新的 Domain Package
               ├────────────────────────────────────┘
               ↓
      Boot + Selected Packages + Target/Host Adapter
               ├─ CLI Domain App
               ├─ Server/API Domain App
               ├─ Client/UI Domain App
               ├─ Agent/Domain Harness App
               ├─ DomainForge Domain App
               └─ 新的 DomainHarness SDK 自身（基础/标准 Packages）
```

**每一个 App（包括 Forge、SDK 自身）共享**：相同的 Domain Package Schema、ElementRef/FunctionRef、Core.Order、Init/Exit/Extension 明确声明、SDK Assembly 检查、可信 Boot、KDP 与必要的 Target/Host 适配。各 Target 的 Host 功能可以分期支持，**当前 Node ESM 验收不能冒称已支持移动端/浏览器的物理交付**。

**SDK App 与普通 Domain App 的区别**只在它导出了给其它开发者可嵌入/可复用的 SDK API、包组合和目标适配；底层不是另一种“SDK Package 类型”，也没有额外的全局 Package Registry/特殊权限。应用级 Boot 封装/Target 安装方式允许不同，但都必须来源于相同选定 Packages 与身份权限协议。

## 5. 为什么之前的“完整 BUILD”不再是目标

**SDK 中只留下 Package Assembly/Linking + 必要验证**。它验证已有 Package 的合法性、引用/接口/Target/资源/安全启动闭包，并产生一个可复现的目标应用产物/Pin。它不负责创造业务 Domain 内容或通用 Package 编译语义。源码目录 `tooling/build`、公共 `buildApp`、`DH_BUILD_*` 仍是已受审实现的历史名称；不能把迁移重命名当作已经完成，也不能仅因词语过时就卸除安全门。

**真正 Package Production** 归 DomainForge；**初始自举 Package Production** 可以暂由 DH-only Builder 负责，只限 DH 自己并须有明确替换计划；**完全没有价值的大 BUILD 产品愿景、双 Compiler、二次 Loader、过度重跑已审相同资源**应退出 Product/L2 范围。详见 [源码逐文件归属审计](../architecture/DomainHarness_v0.11.x_LEGACY_BUILD_OWNERSHIP_AUDIT.md)。

## 6. 所有 0.11.x 阶段必须遵守的 7 项准入

每一版在 Product/L1→L2→Task→代码→验收时须能回答：

1. 本版交付的是否仍是**DomainHarness SDK** 的可复用/可嵌入能力，而不是新的通用 Domain Package 生成平台？
2. 领域事实/规则/流程是否留在 Domain/普通 Domain Packages，而 Domain 执行/工作流/预算/授权属于 Harness？
3. SDK 的公共 API/基础 Package/标准 Package 是否可由其它 Domain App 与 Forge 复用？不需要 Forge 在线才能运行现成 App？
4. 新功能归属 **SDK Assembly**、**Harness Runtime**、**Standard Element**、**DomainForge Package Production** 还是临时 DH-only Bootstrap Builder？是否已经删去无理由的重复 BUILD 功能？
5. 该版是否使用同一个 Boot/Core.Order/Extension/FunctionRef 权限模型？是否保留必要的摘要/Target/权限/可重现性安全？
6. 真正 Forge App 是否只依赖公开 DomainHarness SDK，未通过私有 KDP/BUILD 实现绕过合同？DomainForge v0.0.3 的过时禁令是否由**当前规则**替代、历史冻结快照未篡改？
7. 对新旧 SDK Package 生成是否存在真实可复现跨代自举证据？**无证据必须写 `NOT_IMPLEMENTED`**，整个 0.11.x 最终 Release 不可虚报自举成功。

**阶段目标与总控**：#1564 负责 0.11.0 SDK/Boot/最小装配及 DH-only Seed；#1612 负责 Domain Intelligence/Standard Reader 等基础复用，不把 Forge 包生产强塞 Reader 任务；#1563 负责整个 0.11.x 包含自举在内的 SDK 最终合格。其余版本按正常产品功能交付，不创建无期限的“BUILD 完善任务”。
