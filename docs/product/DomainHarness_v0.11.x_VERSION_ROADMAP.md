# DomainHarness v0.11.x — 0.11.0 已冻结范围与后续无版本号候选能力（R3）
<!-- DH_V011X_ROADMAP_R3_NO_UNAPPROVED_PATCH_VERSIONS_20261121 -->

```ini
OUTPUT_LABEL=DH_V011X_ROADMAP_R3_UNVERSIONED_FUTURE_BACKLOG
CONTROLLER=kaicreator-mm/domain-harness#1563
SOURCE_BRANCH=version/v0.11.x
ONLY_CONFIRMED_IMPLEMENTATION_VERSION=0.11.0
VERSION_0110=INTERNAL_STAGE0_ACCEPTED_NOT_RELEASED
ANY_SUCCESSOR_VERSION=NOT_PROPOSED_NOT_FROZEN_NOT_CREATED
ANY_SUCCESSOR_PRODUCT_L1_L2_TASK_DAG=NOT_ADMITTED
MISTAKEN_SUCCESSOR_TASK=#1600_CLOSED_NOT_PLANNED
MAIN_MERGE=NO
RELEASE=NO
STATUS=OWNER_CONFIRMED_2026_11_21
```

## 1. 版本管理的有效决议

**当前仅确认 v0.11.0 的范围与实现。** 后续可能需要的知识、规则、State/Effect、Interaction、LLM、Workflow、Memory 等均是**无版本号的候选需求**。未经下一轮 Product/L1 内容确认、L2 技术范围决定和必要 Task DAG，不得为其指定任何 `0.11.n` 版本号、里程碑、发布日期、验收门或自动启动的开发任务。

之前路线图 R1/R2 把大量候选能力预分配给连续 Patch 版本，容易使读者误以为范围已确定；**这些预分配全部撤销**。旧版 R1/R2 保留在 Git 历史供追溯，不能作为当前版本实施权威。误创建的 [#1600](https://github.com/kaicreator-mm/domain-harness/issues/1600) 已关闭且不再具有实施效力。

**当前分支关系：**
- `main`：现有已发行主线，0.11.x 的整体交付边界未确定前不合并。
- `version/v0.11.0`：原始 v0.11.0 架构与首轮交付的历史快照。
- **`version/v0.11.x`**：当前 v0.11.0 的实际已验收源码与 Demo 所在分支；未来是否承接新增阶段，需要经过新的 Product 决议，**不能仅凭分支名认为下一 Patch 已存在**。
- 只有一个经过批准的完整发布范围达到资格，才另行决定 `main` 合并、最终 Tag/Release 和发行包；**不把内部阶段合并等同于正式发行**。

## 2. v0.11.0 已确定并实现的 Product Outcome

本版本是 **Element-First 基础架构与可运行 Domain App**；不要求兼容 v0.10.x 的旧 App/SDK，也不要求迁移其全部业务能力。

| 已确定能力 | 对外可观察的最小行为 | 验收来源 |
|---|---|---|
| Domain/Element 统一模型 | 0..N Function、typed ContentBlock、语义关系和独立依赖关系、已选 Element 唯一 owner | PRD AC01–AC03 |
| 三层 Package | Kernel/SDK/Business Primary+Extension、显式导入导出、Hook、确定的装载与技术生命周期 | PRD AC03–AC04 |
| BUILD/AOT 与 Lock | schema/资源/Target/版本/依赖校验、确定性 Lock、非法配置构建期拒绝 | PRD AC02/AC07 |
| Boot→唯一 KDP | 可信安装记录/Pin、只加载已选可验证代码、确定性 technical init/dispose | PRD AC05 |
| 唯一 Business App Init + 选定 Function | 初始化后直接调用 no-effect Function，正例/否例/UNKNOWN，异常回滚和 DEGRADED 可选入口 | PRD AC06/AC09 |
| 公共 SDK / 四包安装 | Node >=22.12.0，四个实际 npm tarball，工作树外 fresh install、BUILD→Boot→invoke→dispose | PRD AC08 |
| 可维护性与范围诚实性 | 机器契约/TS 类型、中英文作者文档、Core 不硬编码示例业务逻辑，不冒称尚未实现的能力 | PRD AC09–AC10 |

**单一 Demo 与证据**：[`examples/v011-basic-app/`](https://github.com/kaicreator-mm/domain-harness/tree/version/v0.11.x/examples/v011-basic-app) 是 **唯一 v0.11.0 验收 Demo**，不是为每个未来版本创建的独立项目。它通过真实四包安装、两套已选规则内容对同一代码产生不同结果、正/负/UNKNOWN、构建拒绝矩阵、Boot/KDP 篡改拒绝、App Init 失败清理、DEGRADED、入口/输入边界及确定性 Lock 验收 **AC01–AC10 Scoped PASS**。记录见 [#1597](https://github.com/kaicreator-mm/domain-harness/issues/1597) 和集成 [PR #1601](https://github.com/kaicreator-mm/domain-harness/pull/1601)；成功候选 `bb5d6f682f9d9a2a8817d9612fa359ed98c23877` 的 Woodpecker #2759 SUCCESS，与集成提交 `bae3a3309439f09c57730d6b2630c6cca2797bf3` 的 Git Tree 完全一致。

**证据边界**：这些验收属于冻结的 0.11.0 AC01–AC10；已有部分细项以真实 Demo + 经审查上游测试组合证明，**不是所有细项都重新由单一黑盒 Demo 直接证明**。验收未发现新的已确认生产 P0/P1；这既不等于零潜在缺陷，也不证明未选的 Effect/State/LLM/正式 Oracle/完整 DIS 等能力。

## 3. 后续能力是无版本号的候选池，而非版本安排

这些内容只供未来需求分析使用，**没有承诺先后顺序、固定拆分、目标版本或交付期限**。实际哪些能力属于下一轮版本，以及是否合并或拆分，须先核对首个真实消费者的需求、可复用代码与成本。

| 候选 Concern | 待确认的实际需求 | 本轮状态 |
|---|---|---|
| 确定性领域规则/识别/校验/决策 | 实际 Domain Consumer 是否需要通用结构化规则解释和 UNKNOWN 策略 | 候选，未选 |
| Business State / Effect / Host/Capability | 哪些真实外部操作必须有授权、执行、提交和读回闭环 | 候选，未选 |
| Knowledge Reader / Query | 领域来源、版本、适用性、索引和检索的实际需求 | 候选，未选 |
| Interaction / Guided Journey | UI-neutral Intent、动态表单、对话引导的真实消费者 | 候选，未选 |
| 可选 LLM Provider / Bounded Harness | 哪些确定性路径不足，模型如何被 KDP 约束 | 候选，未选 |
| Workflow / Events / Tool 互操作 | 跨 Element/Package 的已授权业务编排 | 候选，未选 |
| Memory / Experience / Feedback / Meta | 候选证据、反馈与后续版本的受控晋升 | 候选，未选 |
| 跨平台 / 深层自举 / 正式 Conformance | 经具体消费者和外部权威证明确实需要 | 候选，未选 |

候选方向的背景见 [#1567](https://github.com/kaicreator-mm/domain-harness/issues/1567)、[#1477](https://github.com/kaicreator-mm/domain-harness/issues/1477)、[#1478](https://github.com/kaicreator-mm/domain-harness/issues/1478)、[#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)。它们是研究来源，并非下一版本的自动入场依据。

## 4. 现在应执行什么

1. 仅围绕 **0.11.0 已冻结 PRD/L2** 维护其同一个 Demo 和必要缺陷修复；首先复用已有 AC01–AC10 的真实验收证据，不重复造 Demo、重复跑全套测试或要求每个微改动独立审核。
2. 只有 Demo 发现实质的未满足要求、真实功能缺陷，或修改了受影响源码，才立一个**完整独立模块**的必要修复任务并在模块完成后审核；无证据的假设不能扩大既定版本。
3. 未经 Owner 后续确认，不启动下一版本的 Product Freeze、代码开发、合并 `main`、创建 Release。
4. 旧 roadmap R1/R2、候选名称和所有历史任务中出现的下一 Patch 版本名，均只是**已失效历史记录**，不是已建立的当前版本。

<!-- /DH_V011X_ROADMAP_R3_NO_UNAPPROVED_PATCH_VERSIONS_20261121 -->
