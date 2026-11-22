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

## 9.1 Package/Element 实现修改的静态选择与摘要联动（R94 · 本次实证补充）

> **CONFIRMED 的工程检查原则**：变更任何将被 SDK/BUILD 选定的 ESM Target Function，即使只修改私有循环、注释或业务逻辑，也必须与当前 Package 静态准入规则、封存资源字节、所有 Target Bindings 和实际消费者保持一致。此节来自 #1669 / Woodpecker #2986、#2988 的真实失败，不改变 Foundation 机器 ABI。

1. **BUILD 静态执行子集优先于运行期“能运行”**：当前 `tooling/build/src/static-package-guard.ts` 禁止计算成员访问 `value[key]`、不受控反射、未知代码加载与未声明 Extension。**不要**为了性能优化绕开或放宽这些规则；候选实现须能在真正 BUILD 的源代码门禁下通过，而不只是 Node 单独运行通过。精确允许语法以当前已审静态守门实现和 Target Profile 为准，不把一个列表固定为未来所有语言共同语法。
2. **改代码就必须重新封存**：任何字节变动都要求更新所选资源的 SHA256 和引用它的全部 `ImplementationBinding.entry.module.digest`，以及真实组合时的 Package/Lock/Pin/安装记录与必要收据。不得用历史受审摘要解释新实现，也不得关闭 Digest 校验来通过演示。
3. **预算与权限一同验证**：对不受信输入采用可证伪的早拒绝与预算检查；优化 `Object.entries()` 一类集中分配行为时，同时检验有界数量、早期拒绝、getter/Proxy 的副作用边界、语义不变和 BUILD 静态准入。未证明 JS 引擎的内存上界时，不得声称任意恶意对象已具严格常量空间保证。
4. **单次有界失败诊断**：对 CI 首次失败，优先定位第一真实失败步骤和原始错误码（例如 `DH_BUILD_RESOURCE_DIGEST_MISMATCH`、`DH_BUILD_DEPENDS_ON_UNSELECTED`），只修正实际违规的 Target/Binding；测试和 Digest 在同一 Exact HEAD 后再复验。旧 FAILURE/PASS 与当前新 HEAD 的结论不能混用。

上述规则适用于后续任何 v0.11.x Package/Standard Element 改动；并**不**表示 #1669 已合并或其剩余 Profile/P2 风险已自动解决。其限定实证仍由对应 PR / Review / CI 记录。
