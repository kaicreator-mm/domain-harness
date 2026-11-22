# DomainHarness 规范目录

**本目录是 DomainHarness 0.11.x 单一规范的正式入口。** 规范由核心文件及分主题详细规范共同组成；人类和 LLM 使用同一批 Markdown 原文，不存在另一个隐藏的“Skill 版本规范”。

## 推荐阅读路径

- **任何任务先读**：[核心规范](./core.md)（根原则、状态解释、术语和条款索引，尤其 **CORE-11：生成期负责 Package/Element 正确性、SDK 仅做最后兜底**）。
- **按实际任务读取对应细节**：参见下面的目录。没有触及的模块不需要全部加载。
- **设计新功能或审核现有功能**：同时阅读 [实施状态和决策](./status-and-decisions.md)，区分已确认设计与尚未实现的新合同；需要精确 ABI 时再查当前 TypeScript Contracts、版本 Product/L1、L2 和真实 Source SHA。
- **LLM / Agent**：使用 [domain-harness-spec Skill](../../../.agents/skills/domain-harness-spec/SKILL.md) 作为导航/检查流程；Skill **不复制、不修改**本目录中的规范条款。

## 规范文件

| 文件 | 内容与条款 | 何时阅读 |
|---|---|---|
| [core.md](./core.md) | 核心原则、术语、状态及 §0/§1 | **始终** |
| [architecture.md](./architecture.md) | §A/§5：系统蓝图、Boot/KDP 自举、模块职责、ARCH 不变量 | 架构、Kernel、Boot、职责调整 |
| [element-package.md](./element-package.md) | §2/§3/§8：Element 内聚与多 Function/Content、Package 多 Element、Standard 准入 | 创建 Package/Element、代码归属、标准资产 |
| [lifecycle-workflow.md](./lifecycle-workflow.md) | §4/§13.3/§13.5：Init/Exit、Core.Order、Outcome、Workflow/Hook/预算 | 生命周期、Workflow、状态及失败 |
| [composition-trust.md](./composition-trust.md) | §6/§13.4：生成期验证、App 组合与封存、Lock/Pin、安装完整性、资源/Effect | 生成、组合、安装、可信加载与权限 |
| [identity-naming.md](./identity-naming.md) | §7/§13.1/§13.2：名称、Version/Digest、Ref/Content/Schema | 命名、序列化、Schema、版本迁移 |
| [engineering-quality.md](./engineering-quality.md) | §9/§13.6：TypeScript、日志/配置、测试、Exact-SHA | 编码、CI、错误诊断、工程审核 |
| [status-and-decisions.md](./status-and-decisions.md) | §10/§11/§12/§14：现行证据、未决设计、来源、变更控制 | 版本规划、Foundation #1668、合规判断 |

**条款 ID 保留原单文件 Canonical Spec 的章节编号**，方便历史 Issue、PR、Review 引用。原 §13 横切合同将身份、状态、预算、权限、日志等已确认原则分别归入对应的主题文件；没有把现行 Schema 字段拼写、哈希实现算法或历史 L2 示例自动提升为永久公共 ABI，精确机器合同仍以受审 Contracts、Lock/Target 及适用 L2 为准。章节拆到不同文件不代表改变此前已确定的语义。

## 规范状态与优先级

| 状态 | 正确解释 |
|---|---|
| `CONFIRMED` | 设计原则已被确定或当前适用合同已受审；**不自动表示新源码符合要求** |
| `MIGRATION_REQUIRED` | 新目标与当前 Schema/源码/消费者存在差距，必须单独实施和核验 |
| `CANDIDATE` | 实际案例与 L1/L2 尚未确认，不能强加为全局机器 ABI |
| `HISTORICAL` | 旧方案/旧受审证据，保留追溯但不覆盖最新决议 |

适用的 **DIS 外部规范**仍有效；DomainHarness 本规范是 SDK 层的实施约束，不能单方面重新定义 DIS。核心和详细文件**共同构成一套规范**：核心不替代细则，细则不得推翻核心；遇到冲突，按最新 Owner 决议与实际源证据提出明确变更，不能由阅读者自行选择一份有利版本。某版本的 Product/L1/L2 定义具体新接口，但如果改变跨版本基础原则，需先修改本规范并通过 Owner/L2 审核。

## 人与 LLM 均适用的使用方法

1. 先确认目标任务、仓库版本、Exact SHA、涉及的 Package/Element/Function 及风险边界。
2. 阅读 `core.md` + 最相关的一个或多个主题文件，不做无意义的全部规范全文载入。
3. 区分**规范目标、现有代码事实、验收证据**，记录受影响条款编号；对 `MIGRATION_REQUIRED`/未审代码不写 PASS。
4. 修改代码时从 L2/Contracts/Manifest/Target 获取确切机器格式，不能从规范的示例名称反推当前 ABI。
5. 修改跨版本基础规则时只维护本目录的相应模块，更新本索引和必要的 Issue/L2 引用；不得在 Agent Skill、旧 PRD 或工程手册中维护另一套权威正文。

## 历史资料与兼容入口

旧入口 [DOMAIN_HARNESS_CANONICAL_SPEC.md](../DOMAIN_HARNESS_CANONICAL_SPEC.md) 仅做跳转，不再维护正文。此前的 Foundation 生命周期、R87 命名、Package/Element 组织、Standard Element、R90 单文件等属于设计来源、专项参考与 Git 历史，**不应继续以独立“唯一规范”身份修改**。旧 R90 的完整原文可通过 Git 提交 `9eee30fae292decbeb2505b9f706efe54fd234f0` 检索。

[Foundation 统一整改 #1668](https://github.com/kaicreator-mm/domain-harness/issues/1668) 持续处理 KDP 实现所有权、最小 Boot、作者期 Composition Element 与命名的机器迁移；仍须 Owner/L2、真实代码和受影响消费者的 Exact-SHA 测试。v0.11.1 的历史受审收据保持不变，不触碰 0.11.2。
