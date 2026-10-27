# DomainHarness · 历史归档导航

[文档中心](../README.md) · [English version](index.en.md) · [当前中文手册](../current/zh-CN/index.md) · [生效冻结规范](../reference/index.zh-CN.md)

> **归档是检索入口，不是执行入口。** 此处按阶段组织旧资料；原始文件未搬迁、未重命名、未重新写成“已通过”。精确 Blob/Issue 链接仍有效。被引用的冻结规范参见 [生效规范索引](../reference/index.zh-CN.md)。

## 按资料类型查找

| 历史资料 | 原位置 | 使用提示 |
| --- | --- | --- |
| 历代 Product、PRD、amendment | [product/](../product/) | 核对版本冻结，不等于现在的 SDK 手册 |
| 历代 L2、审查候选、决策记录 | [architecture/](../architecture/) | 区分 `CANDIDATE` 与 `FREEZE` |
| 任务分解、L3、Task DAG | [implementation/](../implementation/) · [tasks/](../tasks/) | 仅作为当时工作的审计线索 |
| 真正执行过的测试与失败、Hidden/CI | [validation/](../validation/) | 保留字面 `PASS` / `FAIL` / `NOT_RUN` |
| 旧版 API / SDK / 用户手册 | [sdk/](../sdk/) · [manual/](../manual/) | 切勿直接采用 v0.1 或候选 API |
| 旧版 Package / Host / Tiny/Rich 工程指南 | [guides/](../guides/) · [agents/](../agents/) | 开发体验记录，不是最新推荐路径 |
| 历代迁移、Host 集成 | [migration/](../migration/) · [integration/](../integration/) | 仅匹配当时目标版本 |
| 研究、实验、领域数据 | [research/](../research/) · [experiments/](../experiments/) · [domain-data/](../domain-data/) | 不保证进入发布代码 |
| Harness、产品路线、技术备忘 | [harness/](../harness/) · [roadmap/](../roadmap/) · [technical/](../technical/) | 先检查版本与权威状态 |
| 历代发布候选与关闭回执 | [release/](../release/) · [v0.10.2/](../v0.10.2/) | 版本最终裁定看 Issue 和固定 SHA |

## 按版本阅读

- **v0.1–v0.4**：从 [历史 SDK](../sdk/) / [版本实现](../implementation/) / [早期架构](../architecture/) 和 [早期首页](../DomainHarness_v0.1_INDEX.md) 开始。
- **v0.7–v0.9**：从 [Product](../product/) / [Implementation](../implementation/) / [Validation](../validation/) 查对应版本文件。
- **v0.10–v0.10.2**：先确认 [Release Issue #1331](https://github.com/kaicreator-mm/domain-harness/issues/1331) 与 [v0.10.2 Git Tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2)，再核验相关冻结证据。

**新增说明放哪里？** 当前可操作内容只提交到 `docs/current/zh-CN/` 与 `docs/current/en/`；原始冻结材料保留。无需为了“整理”再次复制历史全文或生成几百份翻译。
