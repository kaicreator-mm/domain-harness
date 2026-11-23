# DomainHarness · 设计现状与迁移清单

> [权威目录](./README.md) · Owner 新决议 [#1685](https://github.com/kaicreator-mm/domain-harness/issues/1685)。**本规范更新为 docs-only；不表示旧 SDK Contracts、Runtime 或 Domain App 已完成代码迁移。**

## 新架构状态

| 切面 | 状态 | 待办 |
|---|---|---|
| Package=静态 ESM 插件、Element=Class、Function=普通函数/方法 | **CONFIRMED / SOURCE MIGRATION_REQUIRED** | 删除旧独立 FunctionRef/Target/Adapter 执行机制 |
| Standard=SDK 内置应用级复用、Business 优先使用 Standard | **CONFIRMED / SOURCE MIGRATION_REQUIRED** | Standard Workflow/XState 和真实业务消费 |
| KDP/SDK/App 全都使用同一模型 | **CONFIRMED / SOURCE MIGRATION_REQUIRED** | 最小 KDP，去除旧三套职责/执行混合 |
| Metadata 是框架读取的可执行代码，Skill+TSDoc 面向 Agent | **CONFIRMED / SOURCE MIGRATION_REQUIRED** | packageMeta/Class 静态字段 |
| Order 唯一、KDP=0、可选 Init/Exit | **CONFIRMED / SOURCE MIGRATION_REQUIRED** | 生成期错误检测、生命周期根/逆序退出 |
| 静态可信，无自建 Runtime Lock/Pin/权限证明 | **CONFIRMED / SOURCE MIGRATION_REQUIRED** | 移除旧受选 KDP Host、Lock/Pin/Record |
| Workflow/Reader/UNKNOWN/Hook/退出语义 | **保留有价值的行为，机器实现待迁移** | 按应用级 Standard 与原生 Class 重新实现 |
| Node >=22.12.0、v0.11.x 完全重写 | **CONFIRMED** | 不要求 Node24；不保留 v0.10.x ABI |

## 旧架构替换（不是并行维护两套实现）

| HISTORICAL / 待删除 | 新版 |
|---|---|
| K/S/B 固定 Package 技术体系 | Kernel/SDK/App 是不同业务角色，Package/Element 技术统一 |
| JSON ElementDefinition 作为运行时可执行对象 | TS Class + 必需 Code Metadata |
| FunctionRef → ImplementationBinding → Target | 原生 TS 模块/类函数调用 |
| PackageSystem Loader/Extension Registry | 静态 import/export、普通 Class 组合和直接 npm 依赖 |
| boot(pin, context) / kdp-host-init/1 动态受选 Host | 静态入口、最小 KDP 顺序和退出 |
| 自建 App Lock/Boot Pin/InstalledRecord/Runtime Digest | 标准 npm 锁和可信交付过程 |
| 每包强制 Init/独立 Exit Element | 可选 Init.start()/Symbol.asyncDispose |
| KDP 独占 XState/Workflow 与业务转发 | SDK Standard Workflow，可供任何业务直接使用 |
| 给 Agent 的元数据与框架元数据两份 | Metadata 属于代码；Skill+TSDoc 是 Agent 指导 |

## 迁移次序与验收

1. **#1685** 冻结 Canonical Spec + TS Profile + Agent Skill，经独立文档审查。
2. **#1668 / #1682** 停止“旧 PackageSystem 全量搬进 KDP”路线。实现原生 Package 插件 + Standard Workflow/Reader + 业务 Element + 最小 KDP；同步修订版本 L2。
3. 重建旧 Contracts/SDK/Composition/Boot/Reference App/npm Consumer，明确新公开 API、Order/Init/Exit、静态依赖、功能行为；直接删除无价值旧执行层，不做兼容桥。
4. 生成期负例、真实业务正反/UNKNOWN/ASK/WAIT、退出、Node22/独立 npm 消费者、必要同 SHA CI/独立 Review。
5. 在 **v0.11.1** 完成受影响 Foundation 修正，不拖到 0.11.2；任何未完成必须标记 BLOCKED 而非宣称完成。

## 历史与证据

- 旧 #1681 R129 Review Exact `c87b45e4d30bbd28dd0ea06395fecdfb06f557c8`、Woodpecker #3090 SUCCESS；旧 #1684 R131 Review Exact `1fc0c0820b1633d824672816fb91ec50bbb87eed`、Woodpecker #3091 SUCCESS；R131 旧机器修复合入 `a159f17fecf0431cf4cf41c4c8e892b574f1afc8`。它们都是**历史限定证据**，不是新执行模型已验证。
- [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)、[#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、[#1668](https://github.com/kaicreator-mm/domain-harness/issues/1668)、[#1682](https://github.com/kaicreator-mm/domain-harness/issues/1682) 继续追踪实现；旧文档/PRD/L2 只记录历史，不可对抗新规范。
