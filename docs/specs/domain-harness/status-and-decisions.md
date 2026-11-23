# DomainHarness · 设计现状与迁移清单

> [权威目录](./README.md) · Owner 新决议 [#1685](https://github.com/kaicreator-mm/domain-harness/issues/1685)。**本规范是设计和验收权威；代码迁移在 Draft #1694 的候选树中完成，但在该 PR 正式合并前不属于版本列车。**

> **R160 当前状态（R151 P1/P2 整改已提交，独立限定复审待完成）**：新语言原生规范 R140、KDP/XState R143、Reader R145、Workflow R154、生成期 R158 均有各自 Exact-SHA 的限定独立审核。**R140、R145 原审核各保留一个 P2**（R140 GEN-08 后由 R145 合入处置；R145 Reader 边界测试后续扩展）；不得改写原始审核数量。
>
> - **已合并的版本列车**：Workflow [PR #1692](https://github.com/kaicreator-mm/domain-harness/pull/1692) R154 `ACCEPT_SCOPED P0/P1/P2=0`，merge `b88137c7b2b2e1a5b6676a7a86a715458ac05ac4`；作者侧生成工具 [PR #1693](https://github.com/kaicreator-mm/domain-harness/pull/1693) R158 同样 `ACCEPT_SCOPED 0/0/0`，merge `caea4cc0ce0a206c92748074c72d39322e56a9e7`。历史 #3147 被取消，等价源 Blob #3148 SUCCESS 的区别已由 R158 明确。
> - **原生 SDK 完整替换** [Draft PR #1694](https://github.com/kaicreator-mm/domain-harness/pull/1694)：以已接受的版本列车为父提交，候选已物理删除旧 Contracts/Microkernel/BUILD/Boot/PackageSystem/FunctionRef/Target/Lock/Pin 相关 151 个文件路径，保留单 SDK Workspace、五个生产 TS 模块、标准 Workflow/Reader、最小 KDP 与真实仓外仅直接依赖 SDK 的 npm 消费者。此删除**尚未合并到版本列车**。
> - **R151 完整独立审核结论是 REWORK P0=0/P1=2/P2=5**，Exact `aaf6c930f9541768119991500c7bc7811898e18d`。两个 P1 为 Workflow 构造/运行预算不同快照、仓外 Domain App 四次 Reader 漏记根预算。新版修复已在 Draft 提交 `5b56a89743a10c2271b435879115dc2b32c734c2`，Woodpecker [#3150](https://ci.kaicreator.com/repos/18/pipeline/3150/1) **SUCCESS**：预算构造时复制/验证一致、Reader 在真实业务 ctx.invoke 计费，仓外 App 有足额/Reader 拒绝/Hook 拒绝/步骤拒绝的正负例。
> - **五项 P2 处置**：Windows npm.cmd 改成 process.execPath 驱动 npm CLI（**Windows 真机验证尚未做，不声明 Windows PASS**）；当前英文/原生 App README 和旧路线图标记/链接纠正；开发 CI Node 下限 >=22.13 与 SDK 消费者 >=22.12 分离；Writer getter/own-enumerable/动态 Proxy 快照回归恢复；SDK 包根 12 个运行时导出及类型入口文档列出。合并前必须经新 SHA 的独立限定审核确认是否全部可接受。
> - **最终门槛**：对本轮整改的实际 Diff 独立非 Writer 复审，接受后才允许将 Draft 转 Ready、合并与关闭 #1682/#1668。旧架构历史只能作带 SHA 的证据，不是当前可执行合同。

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

## 历史 CORE 条款编号对照（R135 P2-01）

> **禁止无版本地复用 CORE-11/CORE-12 引用。** 旧 R118/R119 与 R134 采用了相同编号但不同内容；旧 Issue/L2/Review 原句仅保留历史含义，不得按新条款解释。

| 旧历史引用及含义 | 现行唯一权威 | 说明 |
|---|---|---|
| `CORE-11@R118`：Package/Element 正确性由生成者负责，SDK 仅兜底 | [GEN-02](./composition-trust.md)、[CORE-07](./core.md)、[QA-01](./engineering-quality.md) | **不是**现行 CORE-11；旧链涉及 Pin/Lock 的 runtime fallback 已废止 |
| `CORE-12@R119`：区分生成、生成期验证、App 组合/封存、编译与运行等阶段 | [core.md 三阶段](./core.md)、[GEN-02..05](./composition-trust.md) | **不是**现行 CORE-12；旧独立 Lock/Pin 封存被静态 npm 组合取代 |
| `CORE-11@R134+`：单 Package/App 同一语言与 Runtime | [CORE-11](./core.md) | 新编号，只适用于新规范 |
| `CORE-12@R134+`：Exact-SHA 测试与审查证据 | [CORE-12](./core.md)、[QA-03](./engineering-quality.md) | 新编号，只适用于新规范 |

## 迁移次序与验收

1. **#1685** 冻结 Canonical Spec + TS Profile + Agent Skill，经独立文档审查。
2. **#1668 / #1682** 停止“旧 PackageSystem 全量搬进 KDP”路线。实现原生 Package 插件 + Standard Workflow/Reader + 业务 Element + 最小 KDP；同步修订版本 L2。
3. 重建旧 Contracts/SDK/Composition/Boot/Reference App/npm Consumer，明确新公开 API、Order/Init/Exit、静态依赖、功能行为；直接删除无价值旧执行层，不做兼容桥。
4. 生成期负例、真实业务正反/UNKNOWN/ASK/WAIT、退出、Node22/独立 npm 消费者、必要同 SHA CI/独立 Review。
5. 在 **v0.11.1** 完成受影响 Foundation 修正，不拖到 0.11.2；任何未完成必须标记 BLOCKED 而非宣称完成。

## 历史与证据

- 旧 #1681 R129 Review Exact `c87b45e4d30bbd28dd0ea06395fecdfb06f557c8`、Woodpecker #3090 SUCCESS；旧 #1684 R131 Review Exact `1fc0c0820b1633d824672816fb91ec50bbb87eed`、Woodpecker #3091 SUCCESS；R131 旧机器修复合入 `a159f17fecf0431cf4cf41c4c8e892b574f1afc8`。它们都是**历史限定证据**，不是新执行模型已验证。
- [#1563](https://github.com/kaicreator-mm/domain-harness/issues/1563)、[#1605](https://github.com/kaicreator-mm/domain-harness/issues/1605)、[#1668](https://github.com/kaicreator-mm/domain-harness/issues/1668)、[#1682](https://github.com/kaicreator-mm/domain-harness/issues/1682) 继续追踪实现；旧文档/PRD/L2 只记录历史，不可对抗新规范。

## R139 · 全体系独立审查后整改状态

[#1689](https://github.com/kaicreator-mm/domain-harness/issues/1689) 初始 SHA `80f5af907c07a9930aeb05aa24280dbe542ef3aa` 的 R139 `REWORK P1=5/P2=4` 已由 R140 [PR #1690](https://github.com/kaicreator-mm/domain-harness/pull/1690) 独立审查 **ACCEPT_SCOPED P1=0/P2=1** 并合入，唯一 GEN-08 导航 P2 随 R145 [PR #1691](https://github.com/kaicreator-mm/domain-harness/pull/1691) 合入。R138 源码 4 项 P1、4 项 P2 由 R143 独立复审 **ACCEPT_SCOPED P0/P1/P2=0**，随后合并 [PR #1688](https://github.com/kaicreator-mm/domain-harness/pull/1688)。以上限定事实并不代表 #1682 完整旧执行层删除、外部 SDK 消费者与版本发布已通过。
