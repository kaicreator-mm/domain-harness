# DomainHarness v0.10.1 → v0.10.2 迁移

> 语言：中文。英文对应文档：`MIGRATING_V0101_TO_V0102.md`。

**版本候选指南，不是发布兼容性保证。** T08b #1329 源码，基于 T07b 之后的 `v0.10.2@51dadcbb`。最终的 clean-installed Node24 证明属于 T09；只有 R01 能验证本发布。

## 迁移的是职责，不是 K policy

| 之前 | v0.10.2 去处 | 动作 |
| --- | --- | --- |
| Compiler `/v10build` 或深层 build import | `@kaicreator/domain-harness-build` | 把 BUILD 移到外部的、独立的 producer 进程 |
| 遗留复制的 K/S 模块 | 独立密封的 K/S Domain Package | 钉住选定模块字节/ABI；保持 K 所有权 |
| 旧 Compiler 里的共享 v10 类型 | `@kaicreator/domain-harness-contracts` | 只从 Contracts 导入公开声明 |
| 旧遗留接口面上的运行时激活 | `@kaicreator/domain-harness-microkernel` | 调用 `load(prebuiltApp, {store, ...})`，绝不运行时编译 |
| 旧 Host 树里的存储/原生 adapter | 可选的 `@kaicreator/domain-harness-host-node` | 显式 Rich Host 选择；只有在真正使用时才注入真实 CAS/SQLite |
| 裸 observer/receipt | Microkernel 的 `await subscribe(selector, listener)` | 查询范围内的、脱敏的实时观察，unsubscribe 与 stop |

在运行时，`send` 保留 Kernel 自有的持久准入与原始 receipt replay；相同 `messageId` 携带冲突 intent/input 必须类型化拒绝，绝不让 effect 生效两次。Query 与 subscription 拒绝未授权目标。K 权威与持久化的 wire 字面量在这次内部拆分中保持稳定；改个名字不能替代迁移测试。

## 移植步骤

1. 钉住精确的受信任源码 SHA、选定的 K/S/B/C Domain Package 字节、BUILD 目标 ABI 与 deployment identity。
2. 移除 Compiler `/v10*`、源码 `dist/` 与其他私有路径。使用精确的四个公开选定 npm 包根；`@kaicreator/domain-harness-microkernel/host-seam` 只用于受信任的 Host bootstrap。
3. 在运行时依赖图之外用 `buildV10App` 构建 App。A8b 的 `projectSelectedComponents` projection 可以选定*已密封*的 semantic/advisory Tool 模块；它不能授权未知 hook 或 remote transport。
4. 通过公开 `load` 加载预构建 App；注入一个被批准的 store，然后把 UI 调用替换为 `send`、`query`、异步 `subscribe` 与 `stop`。
5. 在 Node24 上执行 T09 的 clean-installed Tiny/Rich/外部 producer 与禁止 import 负例，包括只在显式需要时的原生 SQLite。
6. R01 阶段在冻结的精确候选 SHA 上**一次性**运行所列文档命令，并记录真实退出码 + tarball 摘要，与 Full/Hidden/Critical/Packaging 并列。不要把 docs/CI 绿单独当成 release PASS。

当前所有选定的公开 npm manifest 都声明 `engines.node >=24.0.0` 与 `0.10.2-rc.0`。这不意味着包已发布到 registry。本发布通道不支持 Node22；其他更新的 Node 大版本仍未验证。

**不会仅为了保住 1.0 之前的遗留 consumer 而添加兼容层或独立的运行时 policy 引擎。** 如果某个真实行为仍然需要，就通过它选定的 Domain Package/Host 携带它，并在最终的 pack/install 测试下证明它。
