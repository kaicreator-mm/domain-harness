# DomainHarness v0.10.2 · 历史材料与冻结规范

[返回文档首页](index.md) · [English version](../en/archive.md)

## 从哪里查找？

**日常使用无需阅读历史研发目录。** 此页仅负责区分两种不同的资料：

| 查找内容 | 推荐入口 |
| --- | --- |
| 仍生效的跨版本原则、Product/L2 冻结、R01 裁决与源码 SHA | [生效规范与冻结证据](../../reference/index.zh-CN.md) |
| 旧版 v0.1–v0.10.2 草案、实验、迁移、工程指南、测试快照 | [历史归档导航](../../archive/index.zh-CN.md) |
| 现在如何用 SDK、构建 Domain Package、配置 Host | [当前中文文档首页](index.md) |

## 为什么不直接搬走数百份旧文件？

旧文件在 GitHub Issue、PR、代码、审核记录中有精确路径及可能的 Blob SHA 引用。移动或批量改写不仅可能造成断链，也会混淆当时真实的 `candidate`、`HOLD`、`FAIL`、`NOT_RUN` 状态。归档索引统一入口，**不更改原始证据**。

**规则：** 对用户和 Agent 的现行说明统一维护在 `docs/current/{zh-CN,en}/`；历史资料不被“归档”自动判定为无效，冻结规范须按正式版本权威使用。

**版本：** v0.10.2 Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ **CONDITIONAL**，历史 Full `EXIT1`、root `NOT_RUN` 保持不变。
