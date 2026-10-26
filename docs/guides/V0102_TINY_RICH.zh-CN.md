# DomainHarness v0.10.2 —— Tiny / Rich 与外部 producer

> 语言：中文。英文对应文档：`V0102_TINY_RICH.md`。

**T08b 源码指南，候选版尚未发布。** 独立的 clean-install 一致性属于 T09 #1330；README/SDK/guides 强制命令的最终一次执行属于 R01 #1331。

## 三个进程/闭包，不是一个打包应用

1. **外部 producer**（仅 BUILD）：安装选定的 BUILD + Contracts tarball 与精确的 Domain Package payload；用 sealed 的 K/S/B/C 模块调用 `buildV10App`。输出是一个受信任的不可变纯数据 App。`projectSelectedComponents` 是可选的编写期元数据 projection，不是第二个运行时。
2. **Tiny**（仅运行时闭包）：Contracts + Microkernel + 精确选定的 Kernel Primary/Standard Primary/Business/Capability payload。**没有运行时 BUILD、旧 Compiler、可选 host SQLite、未选定的 S feature，也没有深层文件 import。** 使用应用选定的 DocStore；缺少原生 SQLite adapter 不会取消 K 的语义。
3. **Rich**（显式 Host）：加入 `@kaicreator/domain-harness-host-node`，在真正选定时提供真实 SQLite CAS/durable 控制、memory、Shadow/Meta/Evidence 或 CT-02。`better-sqlite3` 在包安装层面是**可选 peer dependency**，只有实际走到原生 SQLite 路径才需要。

两个运行时消费同一 BUILD 输出格式。它们不编译、不发现、不重新选择包。对带多个 Business 的 Rich，每个 selector 都必须识别并授权自己的目标；共享的 workflowId/instanceKey 不能暗示全局读权限。

## T09 必须完成的契约检查

- 独立的 clean producer、Tiny 与 Rich **安装根**；从精确的本地选定 tarball 与所需的选定 Domain Package 安装，而不是从一个没有 `0.10.2-rc.0` 的 registry。保存精确 SHA、归档 hash 与 `package-lock.json` 来源。
- 同时检查**两边**：已安装的 `node_modules` 与 lock 元数据，以及运行时 ESM 解析。确认 Tiny 排除 BUILD、Compiler、Host-node/SQLite 与未选定的 Domain Package；Rich 只 import 被准入的 Host 与选定依赖。
- 执行真实的 Tiny send/query、同消息 replay、变更输入冲突、受治理的异步 `subscribe`、`unsubscribe`，然后 `stop`。事件是冻结的 `{ kind, occurrenceId, target, snapshot? }`，不得含 K 键/receipt 秘密。验证 await 之后的权限回收与 stop 竞态。
- 演练 Rich SQLite 文件支撑的 CAS、并发写冲突、重启与 UNKNOWN/effect 对账、被拒绝的 Business，以及 driver 缺失时的显式拒绝。
- 执行一个外部 producer 生成的 App，并证明运行时→BUILD/Compiler 没有直接 import。私有 `src/` 或 `dist/` 深层 import **必须失败**。
- 区分 `NOT_RUN`、P0/P1 故障与真实通过。不得因为所需的 packed consumer 根缺失，就让可选 fixture 静默跳过。

## Monorepo 预检（可执行命令清单）

在检出的 `v0.10.2` 候选上、以 **Node24** 执行：

```sh
node --version
npm ci
npm run build
npm run lint
npm run typecheck
node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts
```

**不要**把 `npm pack --dry-run` 说成一次隔离的 consumer 安装。T09 拥有可执行的 clean-packed consumer 测试与其新的外部 producer fixture；R01 针对冻结候选一次性执行最终的文档命令清单与 Full/Hidden/Critical。既有的 `examples/v010-clean-consumer/README.md` 记录的是遗留物理场景，但其旧的面向 compiler 的安装命令已被取代。
