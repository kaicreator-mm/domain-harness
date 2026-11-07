# DIS 0.2.0 概念收敛与迁移台账

**状态：Product/L1 后继架构候选 / L2 DRAFT / NOT_FROZEN。**
**上位议题：** #1494；**候选 PR：** #1493；**前序冻结：** 0.1.0 @ `9504c78f4651f6c1ebc48c7858fca2d8b061544b`。
**架构不变：** Boot/KDP #1484、KDP/SDK/Business #1480。以下仅为 0.2.0 待评审决定，不改写 0.1.0。

| 0.1.0 / 旧候选概念 | 处理 | 0.2.0 目标及理由 |
|---|---|---|
| Domain Intelligence 是目标 | KEEP | Package 是材料化载体，不取代领域智能目标 |
| Domain Scope / Consumer Profile | KEEP | 生产、适用条件和合格目标输入 |
| Knowledge Corpus / 原始素材 | KEEP | 来源而非自动可信的 Runtime 资源 |
| 单独 Structured Knowledge 抽象 | REMOVE | Knowledge Structuring 是生产过程；结构化是 Data Unit 的可消费要求 |
| Knowledge Structuring / Unit Production | ADD | 规范 Candidate Unit 及来源/工具/验证收据 |
| Knowledge 与处理分为两套对象 | MERGE | Data/Processing/Composite 是同一 Intelligence Unit Profile |
| 数据 Fact/配置/规则/文件 | REVISE | 组织为语义完整的 Data Unit，文件/索引只是 payload；不要求一条 Fact 一个 Unit |
| 一律要求 Unit 提供 Capability | REVISE | Data Unit 可无 callable provides；Processing/Composite 必须提供能力 |
| Unit 七种 Role | REVISE | 兼容语义标签，非七个 Unit 类或 Engine |
| Intelligence Unit 身份 | KEEP | ID、revision、digest、owner、scope、authority、provenance、资格 |
| Capability requires/provides | KEEP | 保持独立稳定的接口身份、版本、语义与兼容性 |
| Unit 实现策略 | REVISE | Processing 可为 Function/Parser/Rule/Tool；Composite 可使用 Workflow |
| Data Unit Representation | ADD | format/mediaType/schema/typed semantic revision/resourceRef/digest |
| Data Unit Reader/Access | ADD | 已绑定的 SDK/Business Parser/Codec、只读查询策略、bounds、错误处理 |
| 单独 Knowledge Runtime / Universal DB | REMOVE | Data Unit payload 使用可选物理存储，不强制 DB；跨 Package 查询须 Capability/Tool |
| 每个 Unit 强制手写 init 空函数 | REMOVE | 统一生命周期契约，默认 initialize:none 由 KDP 提供等价空操作 |
| Unit initialize / invoke / read / dispose | ADD | 公共生命周期/接口语义，字段按 Data/Processing/Composite Profile 约束 |
| Package init / dispose | KEEP/REVISE | 保留原有 Package 生命周期，允许委托给可选 Init Unit，不产生第二 Init Engine |
| Main Workflow + N Workflows 强制模式 | REMOVE | Package 自治，Main、Public Workflows、直接 Unit 等都是可选实现 |
| 唯一 App Entry/Main Workflow | REVISE | 由 App 精确声明一个或多个 ingress bindings，不要求 Workflow |
| Unit DAG 作为人工管理模型 | REMOVE | BUILD 推导 Unit 引用闭合/无环，Package DAG 仍需合法 |
| Workflow / Pipeline / Graph | MERGE | Workflow 是 Composite 实现，Graph 是可验证表示，Pipeline 非独立规范资产 |
| 控制/数据/证据三种 Edge | KEEP | 只对使用 Workflow 的 Unit 生效，保留独立验证与无隐式透传 |
| Intent Recognizer Output | MERGE | 统一 Structured Intent 和 Slot/Provenance |
| Intent Router 独立 Engine | REMOVE | Intent Routing 是普通 Unit 提供的 Capability |
| SDK Domain Package | KEEP | 保留标准中间层，用通用 Units 提供 Parser、Rule Engine、Validator 等公共能力 |
| Boot + KDP Primary | KEEP | 已冻结的分层/单一 Runtime 权威不动；KDP 内调整 Unit 装配/Init/入口 |
| Business Primary / Extensions | KEEP | 领域知识及具体 Capability，由多个 Package 协作构成 App |
| Runtime/Build/Provenance 资源闭包 | KEEP/REVISE | 按目的分开、精确固定 payload/reader/实施资源 |
| Unit 生成 + 组合验证 | ADD | Data/Processing/Composite 生产收据、子 Unit PASS 不等于组合 PASS |
| 生命周期与治理五维 | KEEP | Qualification、Disposition、Selection、Activation、Execution 分离 |
| 独立结构/行为/Consumer 符合性 | KEEP | 加入生产和 Unit Lifecycle 证据 Profile |
| 任意循环/未验证重试 | DEFER | 只能引入经过独立证明的有界可选 Profile |
| 0.1.0 冻结基线与真实 Runtime 采用 | KEEP/SEPARATE | 原标准不改，#1486 仍负责证明 Runtime 真的消费 |

## 迁移规则

1. Knowledge Role、Fact、Rule Set 或领域配置按合理语义边界映射为 Data Unit，或作为 Unit 内 payload；保留原资源身份、Schema、Digest、证据与来源。**不伪造 Data Unit 的可调用 Capability。**
2. 每个 Data Unit 明确 Format/Schema/Reader/Access；无 Reader 时必须明确消费方案，不得由 Runtime 猜测或任意动态导入。
3. Processing/Composite 保留真实 Capability/Implementation/Graph Identity，且可引用 Data Unit。组合结果须重新验证；子单元 PASS 不自动证明组合。
4. Package init/dispose 原有入口保持，附加可选 Init Unit 绑定，不得制造平行权限或并发竞争的初始化调度器。缺省 `initialize:none` 不强制写空函数。
5. App 入口改由一个或多个已固定 ingress bindings 表达；缺乏原有入口信息必须显式记录待裁定，而非默认 Main Workflow。
6. KDP/SDK/Business Layer 和 Package DAG 保持；不能把 SDK 的通用 Parser 逻辑移入 KDP Kernel Core 或将业务规则全部公共化到 SDK。
7. 所有变化采用新 0.2.0 Profile 并记录有损迁移，禁止伪造历史 Qualification、Promotion、Runtime Adoption。

## 最小验证用例

- Data Unit 使用 JSON 和 YAML 等不同 Format/Profile，分别由已选 SDK Parser Unit 正确加载、查询、验证；错误 Schema/Digest/Reader 版本被拒绝。
- 多事实数据集不需要逐条 Unit，Processing Unit 引用 Data Unit；对外公开时须满足 Capability/授权。
- Processing/Composite Unit 展示 Capability Provider 替换、AOT 唯一选择、输入输出和失败语义；子 PASS/组合 FAIL 的反例可检出。
- Package `init:none` 和 `Init Unit` 两条路径，验证 READY/FAILED、错误时清理/逆序 Dispose，重复初始化不能破坏状态。
- 包含 SDK Primary、Business Primary 与 Extension 的 Package DAG，KDP 独立自举，SDK 先就绪、Business 后就绪；Main Workflow 缺省也可完成真实调用。
- 多 ingress + Intent Routing Unit 的已锁定入口不会“寻找 Router 要先调用 Router”；不相关入口可不经过 Router。
- xDownload 与非媒体领域共享 Unit/Lifecycle/Conformance 规范，但不共享具体业务知识。
- 未授权 Tool/Host Effect、伪造 Promotion、缺失 Provenance、越界循环和未锁定实现均 fail-closed。

所有项目在 #1494 Product/L1 决策与真实 Schema/Demo/Conformance 通过之前均为候选。