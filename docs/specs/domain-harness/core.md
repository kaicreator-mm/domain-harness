# DomainHarness · 核心规范

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

此文件只放跨所有版本、所有 Package 都要遵守的**根原则**。执行时从 [目录](./README.md) 选择主题模块；详细的权限、生命周期和安全拒绝以相关模块的条款为准。一个规范集内有冲突必须在 #1668 / 相关 Owner-L2 裁决后统一修正，不允许 Agent 自选方便的解释。

## 核心架构不变量（速览与路由）

| 编号 | 根原则 | 具体权威细节 |
|---|---|---|
| CORE-01 | DomainHarness 是嵌入式 SDK；消费者仅需一个公开 SDK 产品 | [§1](./core.md)、[§6](./composition-trust.md) |
| CORE-02 | Domain Package 是可直接编写的文件集合，作者工具/Forge/额外 Assembly 非必需 | [§3](./element-package.md)、[§6](./composition-trust.md) |
| CORE-03 | 可执行能力属于真实 Package + 内聚 Element；普通源码 helper 不必逐个 Element 化 | [§2–§3](./element-package.md)、[§A](./architecture.md) |
| CORE-04 | 唯一最小可信 Boot → 唯一真正 KDP.Init；不得有第二 Kernel 或第二 App Init | [§A/§5](./architecture.md)（当前实现仍 MIGRATION_REQUIRED） |
| CORE-05 | 单轮 Core.Order/显式直接 Extension Init；退出按真实进入逆序可选 Exit | [§4](./lifecycle-workflow.md) |
| CORE-06 | 唯一作者期静态组合/Lock/Pin 与受信执行；运行期不得重新选型或越权 | [§6/§13.4](./composition-trust.md) |
| CORE-07 | Package 身份、Element/FunctionRef、Namespace、Target、Digest 独立；统一稳定语义命名 | [§7/§13.1–2](./identity-naming.md)（命名迁移待实现） |
| CORE-08 | Workflow/Function/AppStatus 严格区分，未知不得变成功；运行预算需受限 | [§4/§13.3/§13.5](./lifecycle-workflow.md) |
| CORE-09 | 一个 Package 和一个 Domain App 直接执行闭包只用同一语言及 Runtime | [§1](./core.md)、[§6](./composition-trust.md) |
| CORE-10 | 所有接受结论必须与实际 Source SHA/目标平台/审查和测试匹配，不得伪造成功 | [§9](./engineering-quality.md)、[§10](./status-and-decisions.md) |

## 0. 规范状态与阅读规则

本文件所有条款按下面四种状态理解：

- **CONFIRMED**：已有 Owner 明确决议或当前 0.11.0/0.11.1 适用且受审的基础语义，可作为新的设计约束；但不表示全部源码已经按最新语义实现。
- **MIGRATION_REQUIRED**：明确的 Owner 新要求和拟纳入的目标合同，与现行 Schema、源码、安装消费者有真实差距；实施前必须独立审查受影响 L2/ABI/安全和测试。这类内容是**设计规则，不是实现验收状态**。
- **CANDIDATE**：非必需字段、未来宿主/语言、具体重命名、性能策略等尚待 L2/实际例子确定，不得强制作为全局 ABI。
- **HISTORICAL**：被后续决议取代的旧主张和先前已审证据，只用于追溯，不得重新用作当前架构的命令。

“一套规范”表示**一处维护基础语义、分主题存储多份文件**；它不取消各版本 Product WHAT/AC、L2 接口细节、DIS 标准原文、实际 Manifest/Schema/Lock 或测试。那些文件提供具体实现/适用标准与证据，不构成第二套 DomainHarness 基础规范。

## 1. 产品、版本和对象边界 — CONFIRMED

1. **DomainHarness 是嵌入 Domain App 的 SDK**，不是单独运行的业务 App、通用智能体平台、Package 生成器、DomainForge 或第二个 Runtime。消费者只有一个直接公开 SDK 产品：`@kaicreator/domain-harness`；`/runtime` 和 `/composition` 是同一 SDK 的功能入口，内部传递依赖合法。
2. **版本 0.11.0–0.11.9 是同一次完整重写的内部阶段**，不是互相需要兼容的十个独立正式版本；全部阶段完成后才按正式发布门禁合并 main/打 Tag/发布。旧 0.10.x ABI、源码和旧 App 不作为新 Runtime 兼容义务。
3. **Domain** 表达领域语义、关联关系和约束。**Element** 是一个内聚职责的领域知识/能力微型库。**Function** 是该 Element 选定的公开操作合同。**Package** 是该 Element、实现文件、资源、权限与版本的物理拥有/交付和组合单元。**Workflow/Task** 是受选 Function 的实际执行图，不能混为 Element 依赖图。
4. 正常业务执行链为 **`Boot → KDP.Init → selected Package.Init → selected Workflow → Element.Function`**；某 Package 没有业务 Workflow 时只执行自己的 Init，不需要虚构一个 Workflow 或默认 Main。
5. 仅有 K/S/B **三种 Package 层职责** `kernel|sdk|business`；每个 Package 共享同一种技术 Manifest/Element/Function/Init/Exit 合同。实际启动由 `Core.Order` 与显式直接 Extension 依赖确定，不能把 K/S/B 数量/层级写死成固定三节点循环。
6. 一个 Package、一个 Domain App 的**直接执行闭包只能用一种编程语言和 Runtime**。多语言仅属于 DIS/Package 规范可分别描述的不同独立 App/Package；跨语言经受控外部进程协议，不在一个 App 内混合两种 VM 或直接跨语言 FunctionRef。
