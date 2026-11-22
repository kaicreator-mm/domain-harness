# DomainHarness · 工程质量、日志、配置及证据

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

这里规定仓库共用的质量要求和验证原则。具体命令与反例仍可由 [交付手册](../../engineering/DOMAIN_HARNESS_V011X_DELIVERY_QUALITY_PLAYBOOK.md) 提供操作指导，不再构成另一套架构合同。

## 9. 统一研发、审核与版本证据 — CONFIRMED

1. **先 Product WHAT/L1 + 可观察 AC**，再 L2 的身份/权限/Target/Init/Exit/Boot/调用时序冻结，再有限 Task DAG → 实施 → 受影响测试 → 真实消费/负例 → 非 Writer Exact-SHA 独立审核 → StageIndex 归档。明确功能澄清**不能被“候选代码已经 CI 绿灯”替代**。
2. 新变更先语法/Typecheck/Lint、改动设计的测试和必要正反例；能够在当前环境做等价验证，优先自己验证，**只有真实 Host/Registry/平台信任边界必须 CI 时才做一次**。CI/木啄鸟失败按当前 SHA 和错误日志原样诊断，不冒充 PASS。
3. 真实外部 Domain App 必须只直接安装一个公开 SDK，使用普通多文件 Packages，观察完整 **声明→静态选择→安装/SRI→Boot→KDP.Init→Workflow/Function→Outcome→逆序 Exit**，并测试未声明 Extension/过期摘要/错误 Owner/未选 Workflow/UNKNOWN 等拒绝。
4. 每个版本/阶段的实际 Receipt 记录 Source Exact SHA、Node/Target、AppPackage Digest、Lock Digest、CI pipeline、Review、结果和未解决 P2。不得把 docs-only 新提交说成新 SHA 已执行同一个 CI。
5. 0.11.1 历史 R72、R81、R83/R84 已受限接受；两项非阻塞 P2 分别是 Writer `Object.entries` 大对象预枚举、Reference 规则阈值在数据与 ESM 中重复表达。不能凭本规范“已修复”。
6. **改动要归属于最早出错的能力层**：Foundation 的 KDP、Element/Package、Boot、命名/身份问题归 Foundation #1564 / #1668，不在后续版本加入兼容桥，也不能为了保护内部未发行 ABI 再叠一套 Runtime。新基础合同可能要求 v0.11.1 已受审消费者重新验证，但不撤销历史已审事实。
7. 每次任务必须有完结边界；只进行必要变更/Scoped review/一个 checkout、无多余的持续本地 Agent 工作。不要为每条检查增加治理流程或重复建立第二套测试平台。

### 13.6 稳定开发与应用配置原则 — CONFIRMED/按产品适用

- SDK 是嵌入式库，不自行定义每个交互式 Domain App 的 UI、配置向导或持久化形式。**交互式产品**如需要配置，应允许先启动到受限设置界面，再配置和授权业务运行；配置完成前不允许未授权业务操作。CLI、容器或后台服务可根据自己的已声明 Host 启动合同使用启动参数或环境配置，不能强制通用 UI。
- 源码与文档使用无迭代号的稳定语义命名；中文注释必须描述**当前**职责/不变量，不能保留过时“旧 v011”实现说明或通过机械替换改坏类型。Typecheck/Lint/改动范围测试和真实 Consumer 是提交前的必要质量证据，独立 CI 按真实环境与信任边界使用，不以冗余流水线代替自身等价验证。
- 对外 SDK 的错误与日志应能区分无权限/依赖错误、Schema/Content 不合格、运行故障和必要 Host 配置缺失。只规定**可诊断、结构化、脱敏的原则**，不强制每个业务 Package 使用同一个日志框架或把应用启动配置塞进 SDK。
