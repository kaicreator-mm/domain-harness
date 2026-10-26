# DomainHarness v0.10.2 · v0.10.2 发布状态

[返回文档首页](index.md) · [English version](../en/release.md)

## 版本已经发布，但属于有条件通过

| 项目 | 结果 |
| --- | --- |
| Git Tag | [v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) → `cee14399d9d0af4e20e34b9111861b16a465b690` |
| 冻结 Git Tree | `9618e88b32f16a63164f65b8fbdf4457c96f5e76` |
| `main` 集成 | 原版本已通过 [PR #1387](https://github.com/kaicreator-mm/domain-harness/pull/1387) 合并；后续 `main` 增加了文档 |
| Product/L2/Task DAG | 8/8 P0、2/2 必需 P1 合格；20/20 已完成 |
| Hidden Validation | 当前候选 7/7 PASS |
| 独立 R3 / RQ | R3 PASS；**RQ CONDITIONAL** |
| Full Regression | **`npm test EXIT1`**：3986 中 3979 PASS，7 项操作系统/Runner 资源失败 |
| `test:root` | **NOT_RUN**（该次 Full 未运行到根测试阶段） |
| 允许的例外 | `EX-v0.10.2-R01-FULL-OS-01`，只对此精确 SHA，有 Owner 批准与第三独立复审 |
| 遗留 P2 | 8 项保留（不同于当前文档审核 P2） |

**不要把有条件发布写成 Full PASS。** 历史根测试及风险相关证据复用已获授权，不代表 Full 命令真实返回 0；此例外不会自动延续到 v0.10.3。

SDK 四个 public workspace 清单依然标 `0.10.2-rc.0`，不能声称已发布 npm registry。Node24 是真实验收版本线，不要求特定 OS 或 128GB 内存。当前 `main` 的用户/Agent 文档属于**发布后更新**，不会修改冻结 Tag。

权威依据：[R01 关闭记录](https://github.com/kaicreator-mm/domain-harness/issues/1331) · [原始发布说明](../../release/V0102_RELEASE_STATUS.md)。

---

**权威源：** Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；v0.10.2 的发布资格为 **CONDITIONAL**。文档更新不改变冻结版本或测试事实。
