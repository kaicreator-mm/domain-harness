---
name: domain-naming
description: DomainHarness 的 TypeScript、Package、Element、Function、Workflow、Content、资源路径、日志与审计身份命名规范。创建或重命名持久标识时必须使用。
---

# DomainHarness 统一命名 Skill

**权威规范**：[DomainHarness v0.11.x 统一命名规范](../../../docs/specs/DomainHarness_v0.11.x_NAMING_STANDARD.md)。TypeScript 质量同时阅读 [typescript-quality](../typescript-quality/SKILL.md)。以 Google TypeScript Style Guide / 官方 typescript-eslint 为一般编码习惯基础；**最终产品身份规则以本仓库规范为准**。

## 创建、修改或审核任意标识的检查顺序

1. **说明实体职责**：这是 Package（交付/权限）、Element（内聚责任）、Function（具名行为）、Workflow（流程）、Content（数据/规则），还是编译期实现/private helper？先确认所属，才能命名；不要把源码路径冒充公共身份。
2. **验证稳定含义**：不把 R41/R60、v011、Issue、PR、Agent、CI、日期、迭代阶段放进永久 Package/Element/Public API 名称。保留业务有意义的数字、SemVer 字段及历史证据引用。
3. **检查格式**：TS 类型 PascalCase、变量/函数 camelCase、真正常量 UPPER_SNAKE_CASE；文件 kebab-case；Package ID kebab-case；Element ID dot-separated lowercase semantics；Function id camelCase（生命周期 `init/exit`）；Workflow/Content/Node id kebab-case。
4. **检查已有权威身份**：先看 Manifest/Definitions/Catalog/Locks。已有 `dh.std.file.json/yaml` 不能因为另一种写法更漂亮就任意改名；同一事实不能有两个公开名字。
5. **多文件一致性**：若必须改持久 ID，完整更新 Manifest/ElementRef/FunctionRef/Owner/Target/直接 Extension/Imports/Exports/WorkflowRoot/Lock/Pin/Consumer，重算源与摘要，证明错误混用/越权/过期摘要会拒绝。不要全仓 `sed` 批量改坏已受审证据。
6. **明确历史与新写集**：旧 R41/R60 Reference App 源 SHA、Digest、StageIndex 作为历史来源保留；新写代码从新规范开始，历史迁移仅在 [Foundation Issue #1668](https://github.com/kaicreator-mm/domain-harness/issues/1668) Owner/L2 审核通过后实施。
7. **提交前证据**：列出新增/改名 ID、为何比旧名表达职责更准确、各引用路径、涉 ABI/摘要影响、通过的 changed-seam POS/NEG/ERR；若仅改文档不冒称 Typecheck/E2E 再通过。

## 常用对照

| 不用 | 应使用（作为新身份候选） |
|---|---|
| `r41-kdp` / `r41.kdp` | `dh-kernel` / `dh.kernel.lifecycle` |
| `r41-sdk-base` / `r41.sdk_base` | `dh-sdk-foundation` / `dh.sdk.foundation.lifecycle` |
| `r60-standard-files` / `r60.files_lifecycle` | `dh-standard-file` / `dh.std.file.lifecycle` |
| `V011BuildInput` / `buildV011App` | `BuildInput` / `buildApp` |
| `IWorkflow` / `doWork2` / `pkgSys` | `Workflow` / `executeWorkflow` / `packageSystem` |

**注意**：这些映射尚属整改候选，不是已经实现的向后兼容别名。不得把示例当作真实 Pin/Lock/业务代码已迁移。
