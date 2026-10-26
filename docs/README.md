# DomainHarness 文档中心

**日常使用请只从下面两个入口开始，不再按历史研发目录逐层寻找：**

<details>
<summary>语言 / Language</summary>

- **中文用户文档（默认）：[current/zh-CN/index.md](current/zh-CN/index.md)**
- **English documentation for Agents and developers: [current/en/index.md](current/en/index.md)**

</details>

当前文档的 **14 个主题中英一一对应**：快速开始、架构图、SDK、Package、Host、迁移、Skill、Agent、反馈、排障、发布状态、术语和历史资料导航。维护与反馈入口见 [中文首页](current/zh-CN/index.md)。

**旧目录：历史与冻结证据（不删除、不改写）**。例如 `product/` 存 Product，`architecture/` 存 L2，`validation/` 存真实执行证据，`guides/` 与 `sdk/` 存旧实现期间的技术说明。它们原有的 `candidate`、`NOT_RUN` 或 `main HOLD` 记录是**历史事实**，不是当前状态。需要查证时从 [中文归档导航](current/zh-CN/archive.md) 或 [English archive map](current/en/archive.md) 进入。

**维护约束：** 新增或修改**当前指南**必须同 PR 提供 `docs/current/zh-CN/<topic>.md` 和 `docs/current/en/<topic>.md`；两者链接、功能、限制与命令含义一致，代码/API 名保持原文。README 给人展示中文，`AGENTS.md` / `llms.txt` 为 Agent 指向英文。冻结版本不能因为翻译被改动。

正式发布为 [v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2)，RQ 是 **CONDITIONAL**，原始 Full `EXIT1` / root `NOT_RUN` 必须保留。
