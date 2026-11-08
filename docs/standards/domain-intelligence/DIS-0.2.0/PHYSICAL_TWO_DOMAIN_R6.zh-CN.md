# DIS v0.2.0 — R6 物理 KDP Journal 跨进程恢复及第二真实 Business Domain

**Product/L1 Demo-first 对照验证**；Issue #1496 / Draft PR #1497。本文针对真实源码/CI 准入，**不是**已发布 DIS 原生 AOT/SDK ABI 或正式 L2 Freeze。

## 1. 两种真正不同的 Domain

- **orders**：原有 `business-order-approval@v08.1.0.0`，已选 Function `orders.approval.requestDecision` → `submitQuoteDecisionDynamic` → `ledger.reserve`，触发真实 KDP Effect/Journal。
- **inventory**：新增自建封闭的 `business-inventory@v08.1.0.0`，具有**独立的 `domainId=inventory`、`inventory-reservation` Workflow、`reserveInventory` Intent、SKU/quantity/approved 的领域约束**。公开 `inventory.stock.reserve` → `reserveInventory` 通过真正 BUILD 选中的 `ledger.preview` 路由受 KDP 调度；该 Domain 是 KDP 内部的库存预留**决策记录**，没有真实外部库存修改 Effect，不能将它说成库存已在仓库系统中扣减。

两者共享已选 KDP/SDK、一个合法 Business App Init，但选中**两个独立 Business Package**，从而可用同一个 `instanceKey` 验证 KDP 物理记录的 Business ID 命名空间隔离。库存缺授权时由真实 KDP Guard 拒绝，不由桥接层模拟。

## 2. 物理 Journal 恢复完整链

`examples/dis-v020-real-aot-bridge/two-domain-physical.test.mjs` 使用真实 `buildV10App`、`load`、`openSqliteCasStore`，共享测试 SQLite 文件，而不是 `PlainCasDocStore`。该文件是通过 `SqliteCasStore` 真实 SQLite WAL/CAS 语义持久化的。

1. 首个进程构建订单+库存两个 Business Package，并以两个不同的 Public Function 调用 KDP；每次由真实 KDP 返回 admitted，记录 Effect Journal 与两份业务实例。
2. 读取 `v10/k/` 下的真实 `wf-instance`、`effect-journal`、`original-receipt` 记录，计算内容及 revision 快照摘要；检查 SQLite 文件头。
3. 关闭真实 Microkernel App facade，关闭实际 SQLite 数据库，保存 DIS Projection 为纯 JSON（不自带信任授权）。
4. 启动新的 Node 子进程，使用**独立传入的可信投影 Digest**、重新 BUILD 两个不同 Business Package，再执行 `restoreProjectionRecord`/业务 Init 并重新打开相同 SQLite 文件。
5. 使用和父进程**相同的消息 ID、instanceKey、业务输入**重发两个 Domain 的 Function。要求从原始 KDP Journal 返回 `idempotentReplay=true`，不新增 Effect、实例或原始回执，不允许冒充新的业务执行成功。
6. 错误独立 AOT Digest 的第二个进程必须**在打开 SQLite 前**拒绝，数据库文件字节不变化。

## 3. 正反测试/可观察收据

新增 7 个 Node 断言：双独立 Business 身份；双 Public Function 实际 admitted；库存 Guard 拒绝；错误 Business/Intent 绑定拒绝；同 `instanceKey` 的物理分离；真实第二进程 SQLite Journal/原始 Receipt 恢复；无效 AOT 信任锚拒绝且不写入物理文件。

新的 Woodpecker `dis-v020-integration` lane 在现有 R5 34 项桥接、真实 KDP C01 Gate 的基础上增加该 7 项物理测试。**不引入 Node 主版本限制**；使用仓库已安装的实际 `better-sqlite3`，仅操作并清理临时 SQLite 文件。应以最终 Exact-HEAD 的 CI 结果为准，不能以模拟测试或此前的 27 项 PASS 代替。

## 4. 真实边界

这是两个**选中且实际执行的独立 Business Domain**，不是两份虚构的 Parser Mock。但第二个库存 Business 只声明/履行领域内决策，未执行外部设备、数据库库存扣减或真实用户授权，因此不宣称完整库存业务上线。跨进程恢复的是**真实 KDP SQLite Journal 原始结果**，而不是操作系统全程沙箱；自建可信原生代码无需 OS 隔离，业务 Effect 仍必须经过 KDP 的合法准入与回执。

DIS v0.2.0 的最终 Element/Function/App Init 原生 SDK/AOT ABI、跨进程签名安装记录、正式双 Domain Package 的版本晋升、独立 Exact-SHA Review、L2 Freeze 仍需后继实施及审核。
