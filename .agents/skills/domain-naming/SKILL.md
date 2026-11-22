---
name: domain-naming
description: DomainHarness 新增或修改持久 Package、Element、Function、Workflow、Content、Schema、TypeScript 标识时的任务化检查指引。
---

# DomainHarness 命名 Skill

**唯一规则源**：[规范目录](../../../docs/specs/domain-harness/README.md) → [核心](../../../docs/specs/domain-harness/core.md) → [身份/Schema/命名细则 §7/§13.1–§13.2](../../../docs/specs/domain-harness/identity-naming.md)。原 [R87 命名文档](../../../docs/specs/DomainHarness_v0.11.x_NAMING_STANDARD.md) 只是历史设计说明，**不复制或覆盖**当前规范。

1. 判断实体是 npm SDK 包、Domain Package、ElementDefinition、ElementRef.namespace、Function、Content、Workflow、TypeScript 标识还是磁盘路径；根据权威文件选择相应命名方式，而非按随意前缀归类。
2. 先核对所属 [Element/Package 职责](../../../docs/specs/domain-harness/element-package.md)：一个职责能包含多个 Function/Content，避免把文件名、任务轮次、版本编号当产品身份。
3. 搜索实际 Manifest、Definitions、Contracts、Lock、Index、Function/Target 绑定及消费者；提出新旧身份对照。当前 r41/r60 与点分 Element ID 迁移属于 [#1668](https://github.com/kaicreator-mm/domain-harness/issues/1668) 的 **MIGRATION_REQUIRED**，不假定文档改名后现有 BUILD 已支持。
4. 修改真实身份之前，核对受影响的 Namespace、Owner、Version、Digest、Target、Imports/Exports、WorkflowRoots、Lock/Pin/Standard Catalog，并准备非法混搭/过期 Digest 的拒绝用例。
5. 提交时报告旧→新命名列表、涉及条款、Exact HEAD、重新生成的真实摘要、POS/NEG/ERR、审查状态。旧 R72/R81/R83/R84 证据只作历史，不重写为新 SHA 验收。

需要对整个 DomainHarness 做设计/审查，请使用 [domain-harness-spec Skill](../domain-harness-spec/SKILL.md) 路由其余模块。
