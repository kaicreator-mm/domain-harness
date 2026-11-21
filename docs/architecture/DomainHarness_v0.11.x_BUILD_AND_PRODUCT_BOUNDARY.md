# DomainHarness 0.11.x — BUILD 定义、产品组成与外部责任边界（R32 候选）

> 本文精确化已确立的 [v0.11.0 Package/Core/BUILD 规范](../specs/DomainHarness_v0.11.0_PACKAGE_CORE_LIFECYCLE_AND_BUILD_SPEC.md) B-01–B-05 与 [Element-First B0](../specs/DomainHarness_v0.11.0_ELEMENT_FIRST_B0_FOUNDATION.md)，为 [v0.11.2 标准 Reader L2](./DomainHarness_v0.11.2_T00_STANDARD_READER_L2_SEAM.md) 提供术语权威。它不新增第二种 BUILD/Kernel/Lock，不推翻 0.11.1 R27 合格的源码，也**不**把完整定义的构建流水线错误宣称为目前全部实现。统一版本列车 `version/v0.11.x@43ce7feab7134e3f61f9b4686f7c8735ce4b1615` 为本候选起点。

```ini
OUTPUT_LABEL=DH_V011X_R32_BUILD_AND_PRODUCT_BOUNDARY
MASTER=#1563
FOUNDATION=#1564
V0111_SOURCE_QUALIFICATION=R27_ACCEPT_SCOPED
V0112_VERSION=#1612
V0112_READER_TASK=#1644
V0112_READER_L2_PR=#1645
FULL_BUILD_SCOPE=INDIVIDUAL_PACKAGE_GENERATION_TO_COMPLETE_COMPOSED_APP_PACKAGE
CURRENT_BUILDAPP_SCOPE=VALIDATE_SELECT_LINK_SEAL_EXISTING_PACKAGE_ARTIFACTS
BUILD_OUTPUT=ONE_DETERMINISTIC_COMPOSED_APP_PACKAGE_AND_ONE_SEALED_LOCK
DOMAINFORGE=OPTIONAL_EXTERNAL_DOMAIN_DATA_AUTHORING_PRODUCER
STANDARD_ELEMENT=ORDINARY_SELECTED_ELEMENT_IN_OPTIONAL_PACKAGE
SECOND_BUILD_OR_KERNEL=FORBIDDEN
SCOPED_DOCS_ONLY=TRUE
```

## 1. 什么是 DomainHarness

**DomainHarness 是以已选择的领域知识、Element、Package 为基础，构建并运行领域有界 Domain App 的 SDK、构建与执行体系。** DomainHarness 既不是单个 `microkernel` 包，也不是单个 SDK npm facade，更不是一个通用知识图生产/训练平台。

| DomainHarness 子系统 | 职责与当前代码位置 | 边界 |
|---|---|---|
| **Contracts / Domain Model** | `packages/contracts`：`DomainDefinition`、`ElementDefinition`、`ContentBlock`、`FunctionContract`、`FunctionRef`、`PackageManifest`、`WorkflowDefinition`、Outcome、Lock 和 Schema | Element 是统一逻辑身份，Function 的目标实现经 BUILD 选定；不能让内容的 `roles` 或语义关系隐式提供执行权 |
| **BUILD / AOT / Composition** | 当前 `tooling/build`：`buildApp`、静态依赖/函数/资源/权限/Target 校验、代码及选定内容闭包、确定性 Lock、最终 AppPackage 封装；完整 BUILD 规范还覆盖 **单 Package 生成** | BUILD 只在构建期运行；不得把 Package 生成后的代码放在未校验的信任边界外 |
| **Standard Elements** | R29 规范、Catalog；未来按需在普通可选 Package 中交付标准 Reader、Validator、Selector、State Transition 模板 | **当前 Standard Element 正式实现为 0**；候选不是额外根 `Element.kind`、额外 Engine 或随 SDK 自动安装的全局能力 |
| **Boot / KDP / Kernel & Execution** | `packages/microkernel`：可信启动 Pin、Order=0 KDP、递归 Init/可选 Exit、已选 Function 调用、Workflow XState Actor、Switch/Hook/共享预算/最小退出兜底 | 仅运行唯一 BUILD 预选并封存的应用；不得重新 BUILD、动态寻优或发现未声明 Extension |
| **Public SDK** | `packages/domain-harness`：公开组合 contracts、`buildApp`、`boot/bootstrap` 的唯一 facade（不是第二套实现） | `@kaicreator/domain-harness` 是产品 API 包的一个入口，不等于整个产品全部源码只在此目录 |
| **验证与交付支持** | `tests/`、`examples/`、`scripts/`、`docs/`、`.woodpecker/`，当前 clean-packed Consumer 和受信 npm 安装验证 | 产物验证与开发工具是产品交付保障，不产生另一套运行时权限 |
| **后续阶段能力** | 0.11.2–0.11.9：领域规则、语义交互、授权操作、可选有界推理、Durable Execution、Execution Evidence、Client/Server 演化 | 在同一 Element/Package/BUILD/KDP 合同中递增，未实施不得写为已有功能 |

**部署/产物边界**：DomainHarness 产品（SDK、BUILD 工具与运行时）在开发/构建环境中生成 **Domain App 的完整组合 Package**；交付的 AppPackage 内含经 BUILD 选定的业务/标准/基础 Package、唯一 DomainAppLock、Boot 入口、封存资源及受限依赖安装说明。**不是把全部标准库、DomainForge、编译器、历史业务 App 随每一个运行时 App 一起打包**。只有被选并符合直接依赖/导入导出合同的普通 Package/Element 才进入该 App。

## 2. BUILD 的规范定义：从生成 Package 到组合完整 Package

**BUILD 是完整的构建期流程（不是 `buildApp()` 这一个函数的同义词）**。以已批准/已选择的 Domain 数据与目标环境、源代码/资源/Package 声明为输入，生成、验证、选择、组合、封存一份**完整、确定性、可独立安装和验证的 Domain AppPackage**。

```text
外部领域知识候选 / 人工作者 / Standard Element Catalog / 已有 Package 源
               ↓ 仅作为输入，不直接获得信任或运行时授权
         [ BUILD：唯一构建期信任边界 ]
  ① 单个 Package 生成/编译（Element、Function、Manifest、
     Target 实现、资源、生命周期接口；可由适配器或作者提供）
               ↓
  ② 单包校验与目标选择（身份、版本、Schema、实现位置、资源）
               ↓
  ③ 全应用依赖闭包和静态权限校验（Core.Order、Direct Extension、
     元素/函数/Hook/Workflow/Reader/Switch/代码/导出/安装依赖）
               ↓
  ④ 确定性组合与最终产物复核
               ↓
        DomainAppLock + ComposedAppPackage + 摘要/Pin
               │
          （构建结束）
               ↓
  受信安装/完整性校验 → Boot → KDP(Order=0) → Core.Init
               ↓
    Package.Init → 已选 Workflow → 已选 Element.Function
```

**BUILD 责任**：
- **Package 生成**：将已选 Element/Function/Content、目标实现、资源和授权关系变成可验证的普通 Package Manifest/文件产物。是否由 DomainHarness 内的 authoring adapter、外部工具或已有静态工程提供这些输入，不改变**最终构建必须验证生成后真实代码和资源**的义务。
- **单包与组合验证**：不能仅检查 Manifest；必须核对最终 ESM 静态调用/Import、明确 Direct Extension 与 Function 导入导出、唯一 Owner/Target、Core.Order、Init/Exit 身份/绑定、读写权限、依赖图、资源 digest、Workflow 及 Runner 约束等；不可证明时拒绝。
- **单一输出**：唯一 BUILD 的结果是一份由已选 Package 组成的 **`ComposedAppPackage`**，带唯一 `DomainAppLock`、完整封存文件与 digest；可附构建收据，但不产生第二个权威 Lock。相同输入/Target/工具与 pin 应给出相同字节级语义产物，拒绝漂移。
- **安全安装属于 BUILD→Boot 交接**：BUILD 封存安装清单与可信第三方版本/SRI；安装器执行预检和受信安装，Boot 再验 Pin；**npm 安装、Boot 和 Runtime 都不是第二次 BUILD**，也不会自动修复缺失 Extension/知识或重新选择方案。

## 3. 完整 BUILD 合同与现有代码：必须明确区分

| BUILD 能力 | 0.11.x 规范目标 | 当前在 `version/v0.11.x` 可确认事实 |
|---|---|---|
| 从模型/源码生成一个可独立分发的普通 Domain Package | 属于唯一 BUILD 的前半段，可由作者/上游适配器提供但最终必须受检 | **不能声称 `buildApp` 已内建通用 Package 代码生成器**：当前 `BuildInput` 明确要求 `packages[]`、`packageRoots`、`packageArtifacts`、`kdpArtifact` 等输入 |
| 组合、静态授权、Target/Resource/Workflow/Schema 选择 | 属于唯一 BUILD 的后半段 | `tooling/build/src/build.ts`、`workflow-selection.ts`、`static-package-guard.ts` 等已有实现与受审证明 |
| 生成唯一 Lock、AppPackage、双次确定性自检 | 必须在构建期完成 | `build.ts` 中的 `assemble()`、`composeAppPackage()`、`sameAppPackageBytes()` 已实现 |
| 标准 Element 自动生成/全库安装 | **不是** BUILD 必需范围 | 当前 Standard Catalog 仍为候选；未来只选择需要的可选普通 Extension Package |
| 运行时动态解析版本/依赖/生成 Package | 严禁 | 现有 Boot/KDP 只消费封存的 Package/Lock，运行时不再求解或编译 |

**解释缺口的正确归属**：如果下一阶段需要把独立 Package 的自动生成器/编译器做成正式公共 API，应归 **0.11.0 Foundation BUILD 责任范围 #1564** 明确缺项与有界交付，而不能把它隐式强加给 0.11.2 Reader、DomainForge Core 或添加第二个 Compiler。文档可完整描述 BUILD 合同，但不能据此冒领已经完整实现的泛用 authoring/generation API。

## 4. DomainForge、Standard Element 与 DomainHarness 的依赖方向

| 资产/系统 | 主要产出 | 是否属于 DomainHarness 运行核心 |
|---|---|---|
| **DomainForge**（独立上游领域数据生产/作者平台） | 经来源、权限、适用范围治理的 Domain Data/知识候选，或通过显式适配器提供可构建输入 | **否**。DomainForge Core 不得引入 DomainHarness 私有 Compiler/Runtime/内部类型的强耦合；不能因为提供候选就获得执行/部署授权 |
| **DomainHarness BUILD** | 选定、生成/接收并验证 Package、解决目标绑定、组合 App、封存 Lock/Pin | **是，构建期**。从 Forge 或人工来源接受输入仍须由当前 BUILD 证明生成代码/权限/资源的合法性 |
| **Standard Element Catalog / Package** | 可复用、有版本、已审的普通 Element/Function、精确 Package 引用 | **规范与可选资产属于 DomainHarness 产品体系**；实际 App 仅按需 BUILD 选用，不能全局免授权 |
| **Domain Element / Domain Package** | 具体业务事实、规则、适用条件、Workflow、目标 Function 实现 | **是可组合的应用输入与 App 内资产**，不一定由 DomainHarness 核心仓库编写；其业务真实性不因 BUILD 结构通过自动得到领域权威 |
| **KDP/Boot/Host** | 启动与已授权执行业务，未来才扩展 Host/Effect/LLM 等阶段功能 | **是，运行期及适配边界**；无权反向制造领域真相、热替换已封存的知识或重做 BUILD |

DomainForge 作为上游生产者是**可选输入来源**；由人工定义或其它合规工具生成的 Package 也应能进入同一个 BUILD。跨产品结构交接优先通过外部共同冻结的 DAC/显式适配层，不能要求 DomainForge Core 直接 import DomainHarness 编译器内部实现。本段不宣称目前已经拥有完整 Forge→Harness 自动编译集成。

## 5. 对标准 Reader R31 和后续版本的直接约束

1. **Reader 的可复用业务语义属于 Standard Element**。对已选 JSON/YAML 的安全解析，应通过被 BUILD 选中的 `JsonReader/YamlReader FunctionRef` 实际执行；不能把 Demo 中只转发 `value` 的旧函数直接标记为已标准化。
2. **BUILD 阶段始终要校验已封存资源**：包括 bytes、maxBytes、strict UTF-8、固定安全 JSON/YAML 格式规则和目标授权。为了让构建预检与运行时使用**同一解析语义**，可抽一个受审核/固定版本的纯解析库供 BUILD 使用，并作为选定 Standard Reader 代码的一部分复用。**BUILD 绝不能为验证资源而执行任意、未经选择和独立信任的业务 Element 模块**；所谓共享 Parser 不是在 BUILD 时动态调用任意第三方 Package 初始化。
3. **KDP 只守运行权威**：选定 ResourceRef/Lock/Pin/解码、Hook/预算/Actor/Function Outcome 及 Exit，不再在 KDP 内实现第二套业务格式解析；Runtime Reader 也不自行读取任意 path/fs/network。
4. **可信 YAML 依赖不可被自动放权**：允许 Standard YamlReader 使用受当前 Lock/SRI/构建期静态边界约束的已知 `yaml`，**必须由具体选定的模块/包精确证明**，不能为了共享解析器而放宽所有业务 Package 的裸第三方 import；实施方案无法保持安全边界时先停在有界设计整改。
5. **同一个 BUILD，从 v0.11.2 逐步增加 Standard Elements**：Catalog 记录候选、实现/受审、已选消费证据。上一个版本合格的 Engine 与 Reader 语义不是每版重写的理由，未受审的候选也不是现成组件。

## 6. 验收与维护边界

- 本文仅精确化已经确认的规范定义及当前源码状态，不要求重新验证未修改的 v0.11.1 功能。
- 未来 Package 自动生成能力是否已达到完整规范，需要在 #1564 根据**实际生成代码的闭包和独立安装 Consumer**验证；不得在 #1644 的 Reader 实施中假定此能力已经存在。
- 0.11.2 T00 的 L2 独立审核必须特别检查共享解析器不能造成 BUILD 执行任意未受信源码、静态 ESM Guard 拓宽、跨 Package 权限扩张，或构建/运行两套互相冲突的解析语义。
- 不创建第二 BUILD 工具、第二标准 Element 根类型、强制全局 Catalog Server、新 Runner/Package 管理器或主线之外的正式 Release；整个 0.11.x 单一重写列车保持不变。
