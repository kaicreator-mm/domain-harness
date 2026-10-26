# DomainHarness v0.10.2 · 历史资料归档

[返回文档首页](index.md) · [English version](../en/archive.md)

## 为什么历史文档仍在仓库？

早期 v0.1–v0.10.2 研发期间产生了很多 Product/PRD/L2/Task DAG/测试记录，部分仍标记“候选版”“主分支 HOLD”“尚未测试”。这是**特定日期的真实历史证据**，不能直接删除、批量改写或假称当时已经通过。它们也不是用户现在应该依次阅读的手册。

**当前用户入口始终是** [中文目录](index.md)，Agent 是 [英文目录](../en/index.md)。

| 需要查什么 | 原始历史目录 |
| --- | --- |
| 版本 Product/PRD 和冻结范围 | [`docs/product/`](../../product/) |
| L2 候选、冻结与架构决策 | [`docs/architecture/`](../../architecture/) |
| Task DAG 和各阶段 L3 | [`docs/implementation/`](../../implementation/) |
| 实际验收、Hidden/CI/Release 回执 | [`docs/validation/`](../../validation/) · [`docs/release/`](../../release/) |
| v0.10.2 当时编写的工程指南 | [`docs/guides/`](../../guides/) · [`docs/sdk/`](../../sdk/) |
| 历史研究、实验、旧版本 | [`docs/research/`](../../research/) · [`docs/experiments/`](../../experiments/) |
| 最终发布裁决 | [Issue #1331](https://github.com/kaicreator-mm/domain-harness/issues/1331) |

**维护规则：** 新的常规用户说明必须中英成对提交到 `docs/current/{zh-CN,en}/`；不再直接往历史根目录追加一个“当前指南”。正式冻结证据与签名/版本 Tag 不得为了翻译改内容。如确需正式规范翻译，应在对应版本另走审核和授权，不以用户文档取代原文。

---

**权威源：** Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；v0.10.2 的发布资格为 **CONDITIONAL**。文档更新不改变冻结版本或测试事实。
