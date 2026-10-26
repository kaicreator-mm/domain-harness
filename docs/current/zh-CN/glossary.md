# DomainHarness v0.10.2 · 术语表

[返回文档首页](index.md) · [English version](../en/glossary.md)

| 术语 | 中文解释 |
| --- | --- |
| **Domain Package** | 可独立选型、有身份/ABI/源码封闭的 K/S/B/C 领域模块，**不是**每个 JS 函数 |
| **Domain App** | 外部 BUILD 生成的可信、封闭纯数据 App；运行时加载其内容 |
| **BUILD** | 运行前的选型、校验摘要/ABI/依赖/路由阶段 |
| **Microkernel** | 装载、绑定和生命周期管理；**不**直接实现业务状态决策 |
| **K Primary** | 唯一状态/准入/Journal/Effect/Replay/UNKNOWN 权威 |
| **K Extension** | 只读 advisory Hook，不得代替 K Primary |
| **S Primary / Feature** | 标准语义与 Workflow、Rule 等显式选定扩展 |
| **B Business** | 领域 Intent、业务规则与执行流程 |
| **C Capability / Tool** | 已声明 Operation 的物理或业务能力边界；外部 Effect 需 K Permit |
| **Host / DocStore** | 实际存储、原生 SQLite/CAS、可信权限绑定与 Adapter |
| **CAS** | Compare-and-swap：带条件的原子写；Tiny 文件例子不保证跨进程 CAS |
| **Replay** | K 管理的相同 Message/Intent/Input 幂等重放 |
| **UNKNOWN** | 外部 Effect 结果不确定，不能编造成功或自动非幂等重试 |
| **Scoped Query** | 明确 Business/Workflow/Instance 目标与真实 Host Caller 权限 |
| **RQ CONDITIONAL** | 在可追溯、已批准例外条件下发布，不等于所有命令都执行 PASS |

参见 [架构图](architecture.md) 与 [SDK API](sdk.md)。此表是中文对照，不取代冻结 ABI 类型定义。

---

**权威源：** Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；v0.10.2 的发布资格为 **CONDITIONAL**。文档更新不改变冻结版本或测试事实。
