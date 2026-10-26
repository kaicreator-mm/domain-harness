# DomainHarness v0.10.2 · Host 与 Tiny/Rich

[文档首页](index.md) · [English version](../en/host.md)

## Host 的职责

Host 负责数据访问、原子 CAS、原生 SQLite 和 Effect Adapter 的物理接口；实际 Kernel **K Primary** 决定状态提交、授权、Journal、Replay 与 UNKNOWN。Microkernel `load(app,{store,...})` 的 `store` 来自用户应用，不能伪装为自动全局数据库。

## 选择运行方式

| 使用场景 | 选择 | 注意 |
| --- | --- | --- |
| 单进程最小闭环 | **Tiny** | 示例 PlainFile Store **仅单进程单写者**，不等于跨进程 CAS |
| 多进程竞争写、持久化 | **Rich** | 使用 Node Host 的 `openSqliteCasStore`、真实 SQLite/WAL/事务 |
| 自有数据库/Host | 自己实现兼容 `V10DocStore` 的物理 Store | 仍需证明 CAS 条件写，不把业务裁决挪到 Host |
| 只需要内存临时状态 | 可选内存 Host | 不承诺持久化或重启恢复 |

Node Host 的 `better-sqlite3` 是**可选 peer**，只有选 SQLite 适配器才需要。Node24 是实测版本线。

## 常见误用
- 把 `./host-seam` 当成安全令牌：**错误**，它只是可信 Host 的公开 API。
- 用 Tiny 文件示例做两个进程同时写：**不受保证**。
- 未取得 K Permit 就把 C Handler 直接发送到外部系统：**错误**；Permitless 的负例应证明 Adapter 发送次数为 0。
- UNKNOWN 当成已成功或盲目重试非幂等调用：**错误**。

详见 [现有物理示例](../../guides/V0102_HOST_INTEGRATION.md)、[Tiny/Rich 契约](../../guides/V0102_TINY_RICH.md)、[Host 源码](https://github.com/kaicreator-mm/domain-harness/blob/v0.10.2/packages/host-node/src/index.ts)。

---

**版本：** 不可变 Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ 为 **CONDITIONAL**，保留 Full `EXIT1` 与 root `NOT_RUN`。本文档仅用于发布后说明，不改变 SDK ABI。
