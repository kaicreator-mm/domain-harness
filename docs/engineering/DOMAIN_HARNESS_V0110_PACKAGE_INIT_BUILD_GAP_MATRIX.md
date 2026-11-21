# DomainHarness 0.11.0 — Package/BUILD/Init 新规则与现有实现 Gap Matrix（审核候选）

> **证据基准**：\`kaicreator-mm/domain-harness@b8e5c2bc6eee8615bbc9aabcdb3afd4aa2baa6b2\`（\`version/v0.11.x\`）。这是静态源码/已有测试证据对照，不等于已经重新运行验证。根据讨论的 Owner 修订候选 [L1](../product/DomainHarness_v0.11.0_PACKAGE_BUILD_INIT_L1_RFC.md)、[L2](../architecture/DomainHarness_v0.11.0_PACKAGE_BUILD_INIT_L2_RFC.md)。
>
> **类别**：KEEP=已有可保留；PARTIAL=已有基础需扩展；MISSING=新需求尚未实现；CONFLICT=当前已实现行为与新设计相反。**本矩阵不直接改生产代码。**

| ID | 状态 | 新规则 | 当前 0.11.0 证据 | 建议补齐/修订 |
|---|---|---|---|---|
| G01 | KEEP | Element-First 结构与唯一 owner | \`packages/contracts/src/element-contracts.ts\`、\`tooling/build/src/build.ts\` Element/owner 解析 | 保留并作为 Init Element 与 Function 的统一身份基础 |
| G02 | PARTIAL | 统一 Core+Extensions Package | \`package-manifest.ts:13-15\` layer/role，\`build.ts:162-262\` 三层 Primary + dependsOn 闭包 | 保留角色，**不要**推导 Core 初始化独占特权 |
| G03 | MISSING | 每个 Package 必须定义自己的 Init Element | \`package-manifest.ts:70-71\` 仅可选 \`technicalInit/technicalDispose\`；\`app-descriptor.ts:29\` 单独 \`businessAppInit\` | 统一单包 Init Element，规则覆盖单包/组合包 BUILD |
| G04 | CONFLICT | Package 自行组织 Init 与跨包调用 | \`kdp.ts:163\` → \`PackageSystem.runTechnicalInit()\`；\`package-system.ts:129-168\` 全局顺序/回滚 | 改为调用已编译 Init Element/调用绑定，不用中央技术生命周期 |
| G05 | MISSING | Core.Order 必须、Extension.Order 可选 | \`package-manifest.ts\` 目前没有 Order；\`app-lock.ts\` 只有 \`technicalInitOrder\` | BUILD 编译确定默认 Core 入口序列，拒绝缺 Order/冲突 |
| G06 | PARTIAL | 显式 Extension 依赖声明 | \`package-manifest.ts:24-28,64-66\` \`dependsOn/imports/exports\`；\`app-descriptor.ts:27-28\` 有全局扩展选择 | 新设调用者直接声明的 Extension 边，并编译可调用绑定 |
| G07 | MISSING | 调用者不得直接调用未声明 Extension | \`build.ts:208-241,419-488\` 有 dependsOn、公开/可见性验证，但没有“全部实际跨包调用都来自该调用者直接 Extension”的闭包证明 | 同时比对跨包导入/调用图和每个 Package 的直接 Extension 声明 |
| G08 | MISSING | A→B→C 不代表 A→C 可用 | 当前运行期 SelectedFunction 是全局已选闭包，\`package-system.ts:220+\` \`functionByRef()\` 不携带调用者直接 Extension 授权 | BUILD 精确生成每个调用者可引用的绑定表，不运行时查权限 |
| G09 | PARTIAL | Package 依赖无环 | \`build.ts:659-668\` 已验证 \`dependsOn\` DAG，\`build.ts:332-367\` 校验 Element 构建依赖 | 增加 Init 显式调用图/静态跨包调用图环与主链 Order 冲突 |
| G10 | MISSING | 真实动态导入不得绕开声明依赖 | 当前 BUILD 钉选模块资源，未见针对任意 \`import(variable)\` /裸包跨包 import 的一般静态调用封闭机制 | 限定允许的构建 Profile，不能证明时 BUILD 拒绝 |
| G11 | CONFLICT | BUILD 输出完整确定性的组合 Package | \`tooling/build/src/types.ts:8-13\` \`BuildSuccess\` 仅 \`lock\`/\`lockBytes\`；\`build.ts:720-761\` 构建 Lock；独立 tarball 安装由 Demo 外部驱动 | 新建单包生成与组合打包输出，保留内嵌 Lock/Pin，不只测 Lock 字节一致 |
| G12 | PARTIAL | 顺序只由 BUILD 固定 | \`app-lock.ts:83-84\` \`technicalInitOrder\` / \`DisposeOrder\`；\`build.ts:659+\` topo | 替换为 Core.Order 默认主链 + Package 自己声明的 Init 调用序列 |
| G13 | CONFLICT | 重复 Init 由 Package 自己决定 | \`package-system.ts:129+\` 全局一次性遍历计划；\`domain-app.ts:216+\` 全局 Dispose 单次 Promise | 不再施加 Kernel 级 Init once/dedup；Package 可自行决定重复调用效果；正常 SDK Dispose 自身接口幂等性可单独保留，不得混为 Init once |
| G14 | PARTIAL | Hook BUILD 绑定并由 Owner 真正调用 | \`build.ts:570-638\` 封存，\`package-system.ts:197-220\` 只 \`sealHooks\`；\`kdp-lifecycle.test.ts:56\` 断言 Provider **未调用** | 在 Owner 已编译授权的触发点执行，Init 激活，补真 Provider 正/反例 |
| G15 | CONFLICT | Element/Package 处理自身异常 | \`domain-app.ts:22-108,124-188\` Kernel 对输入输出/Outcome 校验、捕获任意 impl 抛错并转换业务 FAILED/UNKNOWN；\`kdp.ts:225-236\` 特殊 AppInit 错误包装 | 调整责任到 Element/已编译入口，系统只有最终诊断与退出；不删已有业务拒绝反例而不给替代覆盖 |
| G16 | CONFLICT | 不运行中央异常回滚 | \`package-system.ts:149-166,169-195\` 技术 Dispose 逆序；\`kdp.ts:254+\` 初始化失败后统一清理 | 移除中央通用业务恢复；Package 自有清理，Host 接受停止信息 |
| G17 | KEEP + REVIEW | 最小 Boot + 已封存内容装载 | \`boot.ts:78-106\` 安装 Pin/Lock/摘要与最小 KDP 引导；\`verify.ts\` 有安装身份和字节核对 | 保留必要的产物身份/完整性；不要扩展成 Runtime 业务权限/安全校验 |
| G18 | PARTIAL | 现有真 Consumer/回归测试 | \`examples/basic-domain-app/consumer.mjs\` 经封存 Package 启动，证明技术 Init/Lock/Business Init/Dispose | 换为**完整组合 Package 真实可独立安装**、Core.Order/Extension 跨包调用/自治重复/致命失败测试 |
| G19 | CONFLICT | 与 0.11.1 的 Init 合同一致 | [0.11.1 Product #1605](https://github.com/kaicreator-mm/domain-harness/issues/1605) F01、F10、AC18 明确区分/保留 \`technicalInit\` 与 \`businessAppInit\`；[L2 #1608](https://github.com/kaicreator-mm/domain-harness/issues/1608) 第 2 条同样 | 仅在本新 Stage0 设计经 Owner 认可后，同步改为**唯一统一 Package Init**；0.11.1 Workflow/Task 范围不被扩大 |
| G20 | PARTIAL | 版本级决策和质量资格区分 | [0.11.0 #1564](https://github.com/kaicreator-mm/domain-harness/issues/1564) 历史 R15 ACCEPT_SCOPED，当前 [旧 PRD](../product/DomainHarness_v0.11.0_ELEMENT_FIRST_PRODUCT_PRD_CANDIDATE.md) 仍规定不同两类 Init | 评审后一次更新现有 Product/L2 权威正文；现有 R15 不代表新合同通过 |

## 已确定不应回退的能力

- Element 唯一 owner、可见性、直接 Package/Element 静态依赖无环、Lock/安装身份与 digest 的已知基础。
- 三层 Core/Extension 逻辑身份、单一公共 SDK 出口、正式 Test Typecheck、真实独立 Demo 思路。
- Build 的 schema/资源/Target/导出检查等能在新 Package 生成/组合流程中复用的部分。
- 0.11.0 旧合同的已经审查/验证内容仍作为基线，**新合同只对影响范围补新证据**，不重复所有已通过模块的完整审核。

## 建议的实施切分（**全部等待 Owner 审核，不授权开始**）

1. **T0 合同归一**：在现有 #1564/#1574 正文把两种 Init 与 technicalDispose 替为统一 Init Element、直接 Extension 声明、Core.Order；同步机器 Schema、TypeScript 公共类型与负例；明确与 #1605/#1608 的交叉边界。
2. **T1 BUILD 完整产物**：单包编译、组合 Package 输出、静态调用封闭、Extension 直接授权与 Init/Order/DAG；保证产物真正可重现并可离仓安装。
3. **T2 最小运行链**：Boot→KernelCore.Init→已编译 Core 主链与 Extension.Init，Hook 真正执行；取消技术生命周期中央编排、统一业务异常映射/跨包回滚（保留最小致命记录与停止）。
4. **T3 真实消费者与一次集成**：使用组合 Package 的 clean-install E2E、G01–G20 受影响部分的 POS/NEG/ERR。一个变更模块一次必要的增量独立审核，复用旧 R15 未改变模块的证据；Woodpecker 单一验证，不把历史 PASS 冒充新版本源码成功。

## 评审用停点

**本评审交付：** L1 规则候选 + L2 合同候选 + 对照现有源码 Gap Matrix + 拟 Task 切分。**没有代码、测试、CI、Runtime、发行操作；没有将候选设计合并到版本分支**。

**Owner 审核重点**：A) “每个 Package 必有 Init”是否包括纯静态包（建议使用空操作 Init）；B) Core 主链是否作为组合根入口而非 Core 直接调用另一个 Core；C) Core.Order 同值时是否 BUILD 拒绝；D) 任意 JS 跨包动态 import 是否必须在 BUILD 拒绝；E) KDP 现有 Schema/Outcome 校验哪些迁移到 Element，哪些仅保留装载完整性。
