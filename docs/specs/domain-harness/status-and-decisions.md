# DomainHarness · 实施现状、未决事项、来源和规范变更

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

本模块保留原已受审的证据限定、仍待实现的架构目标与历史来源。它不是新功能开发排期，也不修改其他版本的 Task。

## 10. 适用与迁移表：哪些已做到、哪些仍需做

| 合同切面 | 状态 | 证据或受控下一步 |
|---|---|---|
| Element 统一根类型、0..N Function、typed Content、FunctionRef/Target/显式依赖 | **CONFIRMED / v0.11.0 scoped** | #1564/#1624；现行 TypeScript Contract |
| Core.Order=0 KDP、单轮 Init、直接 Extension、可选 Exit/InitFrom、真实逆序 Exit | **CONFIRMED / v0.11.0 scoped** | #1621/#1622/#1625 及受影响源码 |
| Init→Workflow→Function、标准 JSON/YAML、单公开 SDK、真实 Reference App | **CONFIRMED / v0.11.1 scoped** | #1605/#1656/#1664；R72/#2979、R81/#2981 |
| KDP Element 真正拥有 PackageSystem、Workflow Runtime/DomainApp 启动；Boot 只作预验+单委托 | **MIGRATION_REQUIRED** | 现有 `bootstrap`/Microkernel 双实现所有权差距；#1668 |
| 作者期 App 组合与封存执行能力由真实 SDK Package/Element 拥有 | **MIGRATION_REQUIRED** | 与运行期 App 还未构建的自举问题在 #1668 L2 明确 |
| 新 Package kebab-case、Element camelCase/Namespace 独立、自动化合法性 | **MIGRATION_REQUIRED** | Schema/生成期验证/组合封存/Lock/Pin/Consumer 全链迁移和新摘要 |
| 旧 0.11.1 P2 | **KNOWN_NOT_FIXED** | 如真影响产品边界再做定点修复，不冒充已解决 |
| 完整 0.11.x 主线、跨语言单 App/Forge/正式发布 | **NOT_DELIVERED / OUT_OF_SCOPE** | 不能从 0.11.1 资格推断完成 |

## 11. 一次限定 Foundation 重构（不是重做 0.11.1）

**需要进行一次范围明确的结构修正，理由是当前代码与已确定的统一 Package + Element 所有权、最小 Boot 目标有可观察不一致。** 该工作归 **Foundation 0.11.0 / #1668**，受影响的 v0.11.1 SDK/Reference App **增量复验**，而不是将已关闭 0.11.1 T11–T14/R60/R81 全部推倒重写。

推荐先后顺序：

1. 先冻结本规范集相关模块与 L2 接线：列出 Boot 前验证的最小字段、KDP.Init 的真实可执行 Target、PackageSystem 与 Workflow Engine 的 Element Owner、SDK 作者期组合与封存的无循环装载解法。
2. 把独立 Microkernel 实现转为真实 KDP Package 所有的私有源码/选定 Element Function，不删除真正的 XState 能力或重建第二套引擎；压缩 Boot 为预校验/单次调用。
3. 对作者期组合、Contracts、SDK 公共接口明确真实 Package/Element 所有权，进行新 Namespace + camelCase ID 命名迁移；可选 Element/Package 内部多 Element 结构验证，不强制“一 helper 一 Element”。
4. 检查现有 Standard/Business/Reference Manifest/Target/Lock/Pin/WorkflowRoots/资源、直接 Extension；重新封存新字节和生成**新的** AppPackage/Lock Digest。
5. 仅运行真正受影响的正/UNKNOWN/拒绝/致命退出/干净安装 E2E、Typecheck/Lint 和真实必要 CI；独立 Reviewer 复审改动 HEAD。历史 0.11.1 原始 StageIndex 不改写，追加新 Foundation 技术基线收据。

**禁止事项**：不新建第二 KDP、不能把所有私有 helper 元素化、不重做已经合格的 Workflow/Reader 功能、不能引入 Forge/生成器、不能把此修正推给 0.11.2、不因旧 R41 收据留存就保留产品层不规范命名、不得未审即覆盖稳定历史。

## 12. 规范依据、下位文件与变更办法

> **R90 补充索引**：原 §13 的横切条款现分布于身份、生命周期、信任与工程模块；本模块 §14 列出尚未实施的接口/迁移问题。条款状态比文本存在与否更重要。


来源（按后续已确认裁决筛选，不机械继承旧候选）：

- [#1563 R5 Element/Package 组织讨论](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7020667768)；[DIS #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)；[Package #1480](https://github.com/kaicreator-mm/domain-harness/issues/1480)；[Boot/KDP #1484](https://github.com/kaicreator-mm/domain-harness/issues/1484)。
- [v0.11.0 生命周期规范](../DomainHarness_v0.11.0_PACKAGE_CORE_LIFECYCLE_AND_BUILD_SPEC.md)、[#1624 B0](https://github.com/kaicreator-mm/domain-harness/issues/1624)；[KDP/XState Owner 决议](https://github.com/kaicreator-mm/domain-harness/issues/1563#issuecomment-7054968780)。
- [SDK/Package/Forge 边界](../DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)、[多语言单闭包](../DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)、[Standard Element 系统](../../architecture/DomainHarness_v0.11.x_STANDARD_ELEMENT_SYSTEM.md)。
- [v0.11.1 PRD](../../product/DomainHarness_v0.11.1_Task_Execution_PRD.md)、[#1656 R60](https://github.com/kaicreator-mm/domain-harness/issues/1656)、[v0.11.1 事后复盘](../../engineering/DOMAIN_HARNESS_V0111_VERSION_RETROSPECTIVE.md)、[Reference StageIndex](../../../examples/reference-domain-app/stages.json)。
- [R87 Element/Package 组织分析](../DomainHarness_v0.11.x_ELEMENT_PACKAGE_ORGANIZATION_STANDARD.md)、[命名分析和迁移表](../DomainHarness_v0.11.x_NAMING_STANDARD.md)、[Boot/KDP 源码差距审计](../../architecture/DomainHarness_v0.11.x_ELEMENT_FIRST_BOOTSTRAP_OWNERSHIP_REVIEW.md)、[交付质量手册](../../engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md)。

**维护规则**：以后任何 Product、L2、Build、Agent、PR 想增加基础规范，应**首先修改规范集对应的唯一权威模块**，说明状态由何证据从 CANDIDATE→CONFIRMED 或 MIGRATION_REQUIRED→已实现、受影响 ABI/Schema 与验证范围；其它文档只保留参考链接或具体实现决议。不允许出现另外一份自称“当前唯一规则”且内容相反的基础规范，也不以文档修改等价代码已完成。

## 14. 规范仍缺哪些决策（设计候选，不得冒充强制 ABI）

| 优先级 | 待冻结的关键设计问题 | 原因与正确归口 |
|---|---|---|
| **P0 / Foundation 先行** | R87 `ElementDefinition.id` camelCase、`namespace` 独立后的完整机器身份和 canonical digest、Package Owner/重复定义冲突、旧 Lock/Pin/Target 的迁移规则 | 影响引用唯一性与所有已选权限，归 #1668 L2；当前点分 ID 仍在代码中 |
| **P0 / Foundation 先行** | Boot 到真实 KDP.Init 的唯一 Target/Pin、入口执行前字节验证与文件替换/TOCTOU、KDP 实现代码归属与失败清理顺序 | 影响自举正确性和受信边界，归 #1668 L2；不能将验证移到未验证的 KDP 自己 |
| **P0 / Foundation 先行** | 作者期 Composition/Contracts 如何有真实 Package+Element 所有权，怎样通过已安装 SDK 固定入口构建尚未启动的 App | 不能产生第二套 App 组合机制或自举环，归 #1668 L2 |
| **P1 / 真实用例驱动** | 通用 Resource/HostPort/Effect 能力约束、动态权限/资源消耗范围、失败原因与 KDP 技术兜底接口 | 仅对具体新能力/Host/Target 需求进行 L1/L2，不提前实现通用 Effect 平台 |
| **P1 / 真实用例驱动** | 公共 Schema/Definition/Function/Package 的发布后演化、破坏性兼容与跨版本消费矩阵；多 Target 的物理实现差异 | 内部 0.11.x 当前不承诺 ABI 兼容，正式 Release 前由 Product/L2 确定；不得自行假设跨语言 ABI |
| **P1 / 真实用例驱动** | 未来持久化、ASK/WAIT 恢复、取消/并发/超时以及业务状态恢复的完整合同 | 不是 0.11.1 已实现能力，待拥有该 Product 范围的阶段设计，不因此提前改后续版本 |
| **P2 / 按风险选择** | 大对象预枚举/严格内存预算、规则事实源单一性、性能与可诊断性基准 | 当前 v0.11.1 有非阻塞 P2 和真实边界；只有目标能力需要更强保证时才新增代码验收 |

**规范维护准则**：这份表是**差距/设计议题登记**，不是向其它版本下发实现任务，更不自动重开已完成的 v0.11.1。每项在有实际 Product/Owner 决议、L2 和必要源码/消费者证据后，才能提升为正式机器合同。凡是 DIS 自有规范，应链接其适用条款，**不要用 DomainHarness 文档重新定义一份相互冲突的 DIS**。
