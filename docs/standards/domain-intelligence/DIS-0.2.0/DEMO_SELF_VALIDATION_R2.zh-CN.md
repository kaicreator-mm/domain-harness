# DIS v0.2.0 R2 — 设计修复及自验证结果

**身份**：Product/L1 设计修复 + 可重复运行的单体概念 Demo。对应 Issue #1496 / Draft PR #1497。**不是 Independent Exact-SHA Review、SDK 已实现证明、Node24/CI PASS、真实 Provider 调用或 L2 Freeze。**

## 1. 已完成

1. 新增 [R2 限制性设计修复](EVOLUTION_DESIGN_REPAIRS_R2.zh-CN.md)，对 12 项自对抗审查发现（P0=3/P1=7/P2=2）均给出拒绝条件与分阶段门禁。
2. 在 `examples/dis-v020-evolution-demo/demo.mjs` 提交 **可审阅的完整自包含源代码**，演示 AOT 已知优先、FakeLLM 模拟未知、可信 Fixture Oracle、Experience、缓存、独立源 Cohort、Rule 候选/受限 DSL、Holdout + Negative、本地任务快照与安全撤销、授权上报、Server 资格与新 Package 摘要。
3. `node --check` 与该脚本的 **E01–E10/N01–N15 共 25 项自验证全部 PASS**，Node `v22.16.0`。源 Git blob `8f3ff4ce32157f8a42aa8e98d6e8eaec1be5ab8b`、源 SHA256 `db74ae5a779e6e0c04e82339391e57180f5fa872aed93fc2ff9059a102e94564`。
4. 另有完整模块化 `node:test` Demo，`npm run verify` 在相同本地环境验证 **25/25** 通过，提供给用户的 ZIP SHA256 为 `8998fbf790e216666a1368f646faf5473d63d648dbdfb1953b384ca89360eab1`；该离线 bundle 不构成 GitHub CI artifact。

## 2. 风险—设计—Self Demo 映射

| 风险 | 设计规则 | 自 Demo 反例 |
| --- | --- | --- |
| A01 P0 LLM 自评成功 | Trusted Domain Oracle + issued Experience | N01 |
| A02 P0 Evolution Slot 越权 | 封闭 AST / 无任意代码/Effect | N02 / N07 / N14 |
| A03 P0 缓存误重放 Effect | 结果/方法分离，当前事实验证 | N03 / N15 |
| A04 P1 多次命中伪样本 | source cohort 去重 | N04 |
| A05 P1 训练/验证泄漏 | Cohort 分组 Holdout | N05 |
| A06 P1 生成式任务误确定化 | 保留 Generative 路径 | E09 / N06 |
| A07 P1 Prompt 注入 | 未知字段/越权规则拒绝 | N07 |
| A08 P1 未授权跨域共享 | Consent / scope / minimal feedback | N08 |
| A09 P1 版本漂移 | version/target/session pins | N09 / N15 |
| A10 P1 成本/重试失控 | 有界模型与生成候选预算 | N10（完整模块化 Demo） |
| A11 P2 Qualification/Promotion 混淆 | 收据 + 审批 + Server 独立验证 | N11 / E08 |
| A12 P2 错误接受被均值掩盖 | 负例误接受拒绝 | N12 |

## 3. 已发现并修正的 Demo 层缺陷

第一次全流程跑通时，本地规则激活后新的成功由 `LOCAL_RULE` 产生，因此不再新增 LLM Experience；测试错误地从 Store 最后一条记录获取需要上报的授权 Experience，导致 `BLOCKED_PRIVACY`。已将测试改为在**激活前的任务快照**下明确走 LLM Fallback，再读取实际生成的 Consent Experience。另在精简 Demo 首次自测时发现 N04 误用了硬编码独立样本数（之前有其他 E07/E08 测试插入 Experience），现已改为比较 **1000 次命中前后独立来源数量不变**。两项均为 Demo 断言与流程修复，不代表生产缺陷已关闭。

## 4. 不能宣称已经验证

**NOT_RUN**：真实 LLM Provider / 真实 Harness Context/Recovery / Node24 / Woodpecker / 机器 Schema 和 SDK ABI / 安全 DSL 解释器的完整实现 / 跨进程签发 / 存储原子性/并发/崩溃恢复 / 实际 Tally/xDownload 等不同消费者 / 真实 Domain-Forge/AOT 构建 / Independent Fresh Exact-SHA Review / L2 Freeze。

**处理建议**：保留 R2 为待审核架构候选；生产实施优先将只读、无 Effect 的局部 Rule Slot 与真实 KDP/AOT 合约对齐。若做不到，应用应仅生成候选并在 Shadow 中验证，不能放开本地任意规则执行。所有旧 DIS 0.1.0 冻结内容保持不变。
