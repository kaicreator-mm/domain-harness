# v0.10.2 Glossary / 术语表

| Term | Meaning / 中文 |
| --- | --- |
| Domain Package | Independently versioned, BUILD-selected K/S/B/C module group — 有身份/ABI/依赖边界的领域模块；不等于每个 JS 函数 |
| Domain App / sealed App | Trusted immutable **plain-data** output from external BUILD — 已通过选型/封闭验证的 App；运行时直接装载 |
| Microkernel | Minimal app loader, selected-package wiring and lifecycle; **not** a state/policy engine — 最小装载内核 |
| K Primary (Kernel) | Unique authority for durable state admission, CAS decisions, journal, effects, replay and UNKNOWN — 唯一状态/副作用权威 |
| K Extension | Optional advisory hook; cannot mint permits or become a second K — 只提供建议/观察的可选扩展 |
| S Primary (Standard) | Selected semantic interpreter/router; cannot authorize external effects — 语义/工作流解释 |
| S Feature | Independently selected semantic module (Rule/Workflow/Skill-like kind etc.); not automatically a Tool — 选定语义组件 |
| B (Business) | Owns domain Intent and policy; no independent K authority — 业务包 |
| C (Capability/Tool) | Named, declared operation boundary; module-wide externalEffect classification — 能力/工具 |
| Private helper | Local JS function inside selected package; not automatically a public Tool — 包内私有函数 |
| BUILD | External offline phase pinning graph/digests/roles/routes; not imported by running App — 构建阶段 |
| Host / DocStore | Actual persistence/CAS, caller binding and effects adapters; no K decision authority — 主机物理适配 |
| CAS | Compare-and-swap conditional write, with true concurrent semantics only when physical Host store supports them — 条件原子写 |
| Replay | K-managed idempotent response/receipt replay under identical intent and input — 幂等重放 |
| UNKNOWN | Preserved uncertain external-effect outcome; not fabricated success or automatic retry — 外部副作用未知状态 |
| Public Facade | Frozen runtime interface `send/query/subscribe/stop` — 公开运行接口 |
| Scoped query | Explicit business/workflow/instance target + actual Host-bound read authority — 明确目标及授权查询 |
| Critical Journey | Important multi-component positive/negative execution evidence — 关键业务旅程 |
| Hidden Validation | Independently owned held-out risk tests — 独立隐藏验证 |
| RQ CONDITIONAL | Qualified release with **documented approved nonblocking limitation**, not an all-tests-green claim — 有条件发布 |

For diagrams and runnable examples see [architecture](../architecture/V0102_RUNTIME_DIAGRAMS.md) and [user guide](V0102_USER_GUIDE.zh-CN.md).
