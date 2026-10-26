# DomainHarness v0.10.2 · 故障排查

[返回文档首页](index.md) · [English version](../en/troubleshooting.md)

优先记录 **错误码、公开 API、精确源码 SHA、最小输入和命令真实 EXIT**，不要贴私有 K 文档或敏感日志。

| 症状 | 优先核查 | 行动 |
| --- | --- | --- |
| 公开包 `ERR_MODULE_NOT_FOUND` | 制品安装闭包与 lockfile | Tag 不等于 registry 发布；用实际本地 tarballs |
| 老 `compiler/v10build` 不可导入 | 已退役私有 API | BUILD 改用 `domain-harness-build`，运行用 `microkernel` |
| `V10_APP_INVALID` | App 是否由可信 BUILD 封闭、Store 是否完整 | 检查 App ABI/摘要/导入图，别在 runtime 里构建 |
| `QUERY_SELECTOR_INVALID` / 多 B 拒绝 | 目标与可信 Caller 权限 | 明确 Business/Workflow/Instance 范围 |
| Effect 被拒绝或 UNKNOWN | 真实 K Permit、C 声明、外部结果 | 不能绕过许可或假装已成功 |
| SQLite driver 缺失 | 是否真的选 Rich SQLite | 只在需要 SQLite 时安装 `better-sqlite3` |
| Tiny 文件 Store 双写冲突 | 单写者限制 | 选 Rich SQLite 真实事务 CAS |
| `FACADE_CLOSED` | 已 stop 的 Runtime | 重新装载，不继续使用旧 Facade |
| Node 子进程资源失败 | OS/CI Runner | 与 SDK 代码缺陷分开归因，不盲目改内核 |

**只选择与当前风险相符的最小验证**：投影用 `projection-smoke.mjs`，Authoring/Permit 用 `authoring-template-check.mjs`，安装 Tiny/Rich 用 `clean-consumers.test.ts`。完整旧版故障详解见 [原始排障手册](../../manual/V0102_TROUBLESHOOTING.md)。

确认 SDK 真的违反契约后按 [Issue 反馈](feedback.md) 上报，而不是每次失败都建 Issue。

---

**权威源：** Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；v0.10.2 的发布资格为 **CONDITIONAL**。文档更新不改变冻结版本或测试事实。
