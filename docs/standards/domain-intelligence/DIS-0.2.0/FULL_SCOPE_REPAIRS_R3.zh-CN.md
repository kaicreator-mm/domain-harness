# DIS v0.2.0 — 完整范围 R3 规范修复（当前 Product/L1 审核候选）

> **权威优先级**：本文件针对 R1/R2 全版本审核的**限制性修订**。R1 Element、App Init 及 R2 LLM/Evolution 细节在无冲突处继续有效；如果旧文件中的“Domain 是纯依赖 DAG”“Target 原生 API 可不经任何执行准入”“缓存 PASS 可直接复用当前 Effect”“未知必需扩展可忽略”与此文冲突，以 **R3 fail-closed** 为准。处于 `PRODUCT_L1_REVIEW_PENDING / L2_NOT_FROZEN`。这不是新的运行时 ABI 或授权执行代码。

## 1. Domain、Element 和两个不同的图

**Domain 不等于仅由依赖边组成的 DAG。** 定义：`Domain = Element Set + Semantic Relations + Constraints/Invariants + Collaboration Semantics + Dependency Subgraph`。

- `Element` 是内聚语义/服务微型库，不强制六类 Type。关系、规则、约束、状态策略可体现为 Element、数据或声明式语义。
- **Semantic Graph** 可以循环、双向、含多重关系，必须注明关系标识、适用范围、版本/来源、约束验证规则；不能借语义环获得 Function 调用权限。
- **Element Dependency DAG** 仅含静态调用/资源读取所需的可达依赖，AOT 必须验证无环。Runtime 工作流/Task/Event/循环不改变这个定义，也不免除事件与调用的已选 Catalog、预算和终止条件。
- 具备多个 Public Functions 的 Element 可以一次依赖另一个 Element 的多个 Functions；`functions: []` 仅用于静态声明，不能作为可调用 Reader。读取其资源应通过显式公开 Reader/Query Function 及合法 Resource Binding。

## 2. Function Contract 是唯一语义真相

- 公共 Function 必须具备 `id`、`description`、输入/输出类型、成功/UNKNOWN/失败或业务 outcomes、版本/兼容性边界；可附条件、证据、Effect、示例、实现要求。**Capability Contract 必须从 Function 投影/引用，不产生可漂移的第二份正文。**
- 每个 Function 单独绑定 `Rule | Query | Code | Workflow | LLM/Harness` 中合格实现。Implementation 在 AOT 才能选择，并精确固定 Target、Provider、版本、代码/资源摘要及依赖闭包。静态 Type tags 不可授予权限。
- 将编译层失败（缺失 Function、版本冲突、资源不可读、权限未准入）与运行层合法的 `UNKNOWN/NEEDS_INPUT/FAILED` 区分，不能把不兼容或权限拒绝默默转为 LLM fallback。
- SUCCESS 必须满足当前业务验证义务；调用结果 Schema 正确不意味着真实业务 Outcome 正确。

## 3. AOT / Target / Package 权威

AOT Lock 的**完整闭包**至少固定：
1. Domain/Element 的 identity+version+描述及依赖/语义/约束摘要；
2. 每个 Function 的 Contract 和 Implementation digest、实际可用的 Public API/Export、Dependency Version；
3. KDP Primary、SDK/Business Package DAG、每包 Selected Target、Package Manifest/Lock 和 Extension/Dependency closure；
4. 实际资源字节摘要、Knowledge Reader/Query Binding、Knowledge Snapshot/Schema/Provenance，禁止只相信自报 digest；
5. App Init 唯一入口、全部 ingress、可选 Harness/LLM Provider Catalog、Function Evolution Slot、Effect/Policy/预算与 Compatibility；
6. 可复核的构建者/验证者身份和签发的资格记录（生产跨进程场景）。

可以在构建时使用版本范围寻优，但 Runtime 必须只加载**明确锁定的精确版本**。Runtime 对未知 required Extension、失配 Target/Provider、跨 Package 未导出 Function、未闭合依赖、路径逃逸、资源 digest 漂移必须 fail-closed。Unknown optional Extension 只能忽略其额外功能，不能扩大运行能力。

**物理 API 特别说明**：各 Target 可以有完全不同的原生 API，不要求统一 Host-neutral file/network/process/device Adapter。然而可产生外部副作用的 Function **必须在可信执行边界接受 KDP 或其授权执行者的准入/Effect 治理**。此要求无法单靠 Manifest 限制任意不可信 Node/native 代码，实施必须选择可信代码、隔离进程/沙箱或受控 Adapter；若无隔离能力，不允许将动态 LLM 生成代码引入生产运行实例。这是生产 P0，不可从 MockRuntime 的许可表推出已解决。

## 4. Package DAG、双层初始化、单 App Init

- Boot 独立启动 KDP，SDK 不得成为 KDP Boot 前提；全部 selected SDK/Business Package 技术初始化必须按 Package DAG 依赖顺序在 App Init 前 READY。
- Runnable Domain App **必须**固定唯一 Business App Init Element 的 `init(context)`。无 Main Workflow 要求；Ingress 可以直接到任意已锁定、已导出的 Public Function。
- Init 结果 `READY | DEGRADED | BLOCKED | FAILED` 有明确语义。仅预先声明的 **optional ingress** 可以在 DEGRADED 暂停；缺失必需服务不允许冒充 READY。
- 单次 Activation 内拒绝重复 Init，异常需要清理**已成功初始化**的 Package 并按逆序 Dispose；重启需要新的受控激活身份与业务态幂等/恢复决策。Init 完成不能推导旧 Task 成功或额外 Effect 权限。
- Package state/journal/lifecycle 权威由 KDP 协调；**业务事实/权限/状态迁移归 Domain**，例如 Tally 对 GitHub 原生事实的复核。对不可重复外部 Effect，要求可信执行收据/幂等策略，不将模型意图或缓存当成许可。

## 5. Domain Knowledge、State、Interaction

- Domain-Forge 负责知识生产/资产化，DIS 负责 Knowledge 的消费边界：Reader/Query Function、查询输入/输出、范围、结构 Schema、版本/来源、实际 Snapshot/有效期与 UNKNOWN；没有私有数据 UnitRef 意味着任意 DB/网络权限。
- 业务 Domain State Element 可以选择 SQLite/JSON/事件等 SDK 服务，但 SDK 不得自动成为业务状态权威。纯查询/规则 Function 不能未经声明直接修改持久业务状态。Mock Demo 使用快照隔离；真实业务隔离要依靠具体实现和可信 Host。
- Interaction 是领域内逐步澄清 Intent 的普通 Element，UI-neutral；`RESOLVED`、表单完成、LLM 提案、缓存命中都不自动授权 Effect。批准信息必须由真实 Domain policy/用户 grant/版本证据复核。

## 6. 统一 LLM、Harness、进化（保留 R2 的严格边界）

- 对可选 Function，AOT 预锁定已知解析、合格精确经验、Promoted subflow、Harness/LLM Fallback 和进化 Slot 的存在/预算/准入策略。`DETERMINIZABLE/HYBRID/GENERATIVE/NONE` 定义不同进化目标；本质生成式任务不硬转静态答案。
- `ExecutionTrace` 与无验证的 `LearningObservation` 不等于 `Experience`；可信 Domain oracle + 真实证据才有可复用经验，LLM 的 PASS 不能签发资格。缓存命中次数不可计作独立样本；Holdout 必须按来源 cohort 分组隔离。
- App 允许在已锁定 **有界声明式规则数据** Slot 中验证、未来任务生效、可撤销地局部激活。新代码、新依赖、提高权限、无安全解释器或没有真实 Task 原子激活能力 → **Candidate + Shadow only**。
- Server Meta 汇总经许可/脱敏的数据，跨域重新验证 Function/Element Candidate；Forge 负责正式生产与知识闭包，Promotion 权威和新 AOT Package 激活独立于 `LOCAL_QUALIFIED`，不自动热更新旧实例。

## 7. R3 完整 Demo 与验收策略

参考模型两种 Domain：Tally-like Task+状态/审核/Effect、Media Player 解析；Demo 包含 74 个 Node Test Case（27 POS/47 NEG），另在其中执行 25 条原先的 FakeLLM/Evolution 断言；它仅验证**这些设计规则在模拟运行模型中没有自相矛盾且可以被具体拒绝**。

真实性限制：真实 SDK ABI、Host/OS Effect 防绕过、实测跨进程 Receipt 签发、原子激活持久化、Domain-Forge/AOT Toolchain、生产 LLM Provider、真实业务用户/设备/外部 GitHub Proof、Node>=24、Woodpecker 与独立 Fresh Exact-SHA Review **仍需完成**。

本阶段不更改冻结 DIS 0.1.0，不新增通用 Host API，不自动合并、不 L2 Freeze、不发布。R3 在 R1/R2 基础上是**Product/L1 设计版的完整修复建议**；正式机器 Schema/ABI 和构建消费者需要后续实施准入和实际独立复核。
