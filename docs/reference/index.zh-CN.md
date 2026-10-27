# DomainHarness · 生效规范与冻结证据

[文档中心](../README.md) · [English version](index.en.md) · [最新中文用户手册](../current/zh-CN/index.md)

这里记录**仍需遵守的版本冻结规范和权威证据入口**。它们通常保存在旧研发目录，但“文件创建时间早”不等于“规范失效”。不能用新版手册覆盖冻结 Product、L2 或版本裁决。

| 核验目标 | 权威材料 |
| --- | --- |
| 跨版本架构原则（CV 约束） | [DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md](../architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md) |
| v0.10.2 Product 冻结 | [Product Freeze](../product/DomainHarness_v0.10.2_PRODUCT_FREEZE.md) |
| v0.10.2 L2 冻结 | [L2 Freeze](../architecture/DomainHarness_v0.10.2_L2_FREEZE.md) |
| Task 并行与写集限制 | [A6 并行执行设计](../architecture/V0102_A6_PARALLEL_TASK_EXECUTION.md)（原文为候选期标题；[Issue #1356 通过](https://github.com/kaicreator-mm/domain-harness/issues/1356)，[PR #1357 已合并](https://github.com/kaicreator-mm/domain-harness/pull/1357)）· [历史 Task 文件](../tasks/) |
| 验证与源文件溯源 | [Validation](../validation/) · [v0.10.2 源清单](../validation/v0.10.2/L2_SOURCE_INVENTORY.md) |
| 发布资格与例外范围 | [Release Issue #1331](https://github.com/kaicreator-mm/domain-harness/issues/1331) · [当时的 Release 文件](../release/V0102_RELEASE_STATUS.md) |
| 固定的发布源码 | [v0.10.2 Git Tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) |

## 如何正确使用

1. **普通用户或 SDK 集成**先看 [当前中文手册](../current/zh-CN/index.md)；Agent 先看 [英文手册](../current/en/index.md)。
2. **正式设计、代码修改、独立审核**按版本、Issue 和精确 SHA 核对 Product/L2/Task 文件及批准的 amendment，不可将候选文件直接当成冻结约束。
3. **历史候选与研究**到 [归档索引](../archive/index.zh-CN.md) 寻找；不得以旧版 `main HOLD`、`NOT_RUN` 记录推断今天的状态。

**状态快照：** v0.10.2 Tag 固定在 `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ 为 **CONDITIONAL**。历史 Full `EXIT1` / root `NOT_RUN` 继续保留。
