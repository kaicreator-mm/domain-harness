# DomainHarness v0.10.2 · 版本迁移

[文档首页](index.md) · [English version](../en/migration.md)

## 从旧版本迁移的最小清单

| 旧接口/布局 | v0.10.2 正确目标 |
| --- | --- |
| 私有 Compiler `/v10build`、`src/dist` 直引 | 外部 `@kaicreator/domain-harness-build` |
| 共享 Runtime/Compiler 类型 | `@kaicreator/domain-harness-contracts` |
| 老的 Runtime/Core 装载入口 | `@kaicreator/domain-harness-microkernel.load(prebuiltApp, options)` |
| 隐含本地 DB/原生存储 | 显式 Host Port；需要跨进程 CAS 才选 Rich SQLite |
| 无订阅/原始 Receipt 推送 | 授权后的异步 `subscribe(selector,listener)` 和脱敏事件 |

迁移时先固定原项目与 SDK 的精确 SHA，记录 K/S/B/C 包身份和现有 Critical Journey。按**构建生产者→封闭 App→安装运行时→业务交互→最小负例**逐步迁移，不能靠一次 TypeScript 编译通过就宣称安装制品有效。1.0 前不新增为旧私有接口保留的兼容层。

迁移后重点验证：幂等 Replay、相同 `messageId` 不同输入 Conflict、Business 目标授权、Effect Permit、UNKNOWN、停机生命周期。旧迁移文档 [原版历史资料](../../migration/MIGRATING_V0101_TO_V0102.md) 保留当时的 `candidate/NOT_RUN` 快照，不代表现在的 RQ 状态。

---

**版本：** 不可变 Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ 为 **CONDITIONAL**，保留 Full `EXIT1` 与 root `NOT_RUN`。本文档仅用于发布后说明，不改变 SDK ABI。
