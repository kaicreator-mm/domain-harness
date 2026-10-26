# v0.10.2 Node Host 集成 —— 可选的数据面端口

> 语言：中文。英文对应文档：`V0102_HOST_INTEGRATION.md`。

只有选定的 Node24 profile 经过验证。公开 Host 包 `@kaicreator/domain-harness-host-node` 暴露 `InMemoryCasStore`、`openSqliteCasStore`、受治理的 deployment/Shadow/Meta/Evidence/CT-02 helper、durable 控制与 scoped memory；可选的 `better-sqlite3` peer 只在真正选定 SQLite adapter 时才需要。Microkernel 暴露有界的受信任 bootstrap 子路径 `@kaicreator/domain-harness-microkernel/host-seam`，含 `activateV10App` 与窄的 Host helper。这是 API 组织安排，**不是权限令牌**。

集成方提供真实的 Host 资源、选定的 deployment identity、物理的 `V10DocStore`/CAS 实现，以及经过认证的调用方的 scoped query authority。调用方无法通过向一个不受限的公开方法传数据来伪造 grant。选定的 K Primary 独立治理 effect permit/admission/journal/replay。Host 存储 adapter 提供持久的物理条件写，但不重新实现 K 状态机，也不做 BUILD 验证。

**存储选择是显式的：** 内存 store 用于有界示例；Tiny 的 `examples/v010-clean-consumer/runtime/plain-store.mjs` 只实现**单进程/单写者**的整文件快照。它的原子 rename 不是跨进程 CAS。Rich 的 `examples/v010-clean-consumer/runtime/runtime-core.mjs` 使用真实 SQLite 事务/WAL，是这里唯一的双进程竞争写者 fixture。不要把 Tiny 文件 store 宣传成 SQLite 的通用替代品，也不要宣传成对并发写者安全。

开发者参考：`packages/host-node/src/index.ts`、`packages/microkernel/src/host-seam.ts`、`tests/integration/v010-clean-consumers/clean-consumers.test.ts`。在一个干净的 Node24 release candidate 上把后者精确执行一次以验证 Host/Rich 旅程；保存 SQLite 产物与真实的 `better-sqlite3` 加载输出。K 无 permit 负例必须展示零外部 provider 派发；UNKNOWN 必须保留含糊外部尝试的真相。v0.10.2 不继承任何独立的 Expo/browser/QuickJS Host 要求。
