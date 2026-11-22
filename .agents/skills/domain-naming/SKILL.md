---
name: domain-naming
description: DomainHarness 新增或修改持久的 Package、Element、Function、Workflow、Content、Schema、TypeScript 标识时的统一命名规范（R87）。
---

# DomainHarness 统一命名 Skill（R87）

**唯一权威入口：[DomainHarness Canonical Spec](../../../docs/specs/DOMAIN_HARNESS_CANONICAL_SPEC.md) §7**。原 [命名规范 R87](../../../docs/specs/DomainHarness_v0.11.x_NAMING_STANDARD.md) 用于来源、例子和迁移分析。 和 [Element/Package 组织规范](../../../docs/specs/DomainHarness_v0.11.x_ELEMENT_PACKAGE_ORGANIZATION_STANDARD.md)。本 Skill 使用 npm package name 约定与 Google TypeScript/官方 typescript-eslint 规则，不创建第二套业务命名标准。

## 稳定结构

- **Package.id**：小写 `kebab-case`，和 npm 包名一致，例如 `dh-kernel`、`dh-standard-file`、`reference-business`；npm scope 有自己的 `@scope/package-name` 语义。
- **ElementDefinition.id**：**`camelCase`，和变量/对象属性一样**，例如 `kernelLifecycle`、`jsonCodec`、`brakeDiagnostics`。**禁止**继续按先前 R86 旧候选使用 `dh.kernel.lifecycle` 这样的点分 `Element.id`。
- **ElementRef.namespace**：独立属性，例如 `dh` 或 `reference`；完整身份结合 `namespace/id/version/digest` 和 Manifest 所属 Package，不把 namespace 拼入 id。
- **Function.id**：`camelCase` 动词，如 `init`、`exit`、`readJson`。Workflow/Content/Node 的可程序引用 ID 也优先 `camelCase`。
- **TS 类/接口/类型**：PascalCase；方法/变量/参数 camelCase；文件/目录 kebab-case；自然常量按 TypeScript 习惯使用 UPPER_SNAKE_CASE 或局部 camelCase。
- **禁止**：以 R41、R60、v011、Issue、PR、Pipeline、Agent 或临时作业号命名持久 Package/Element。数字作为真正有意义的协议、算法、OS/Target、SemVer 属性值允许。

## 先组织再命名

先判断 Element 是否是 **一个内聚职责的微型 Library**：能容纳 0..N Functions、多个 typed Content 和 private helpers；Package 可拥有多个 Elements，且可执行 Package 当前必须拥有真实 Init Element。不能因文件类型不同或两个函数就机械拆成两个 Elements。跨包仅按直接 Extension + 公开 FunctionRef 授权。

## 迁移与质量检查

1. 在 #1668 Owner/L2 通过前，**新命名标准只适用设计/新增候选**，不得假装当前 Build、Schema、Lock 已接受 `camelCase ElementDefinition.id`：当前 `elementNamespace()` 仍假定点分 ID，R86 的示例是旧候选。
2. 对旧 `r41-kdp`、`r41.kdp`、`dh.std.file.json` 等，保留受审 v0.11.1 Source/StageIndex/Digest；迁移要同时更改 Manifest、Definition、ElementRef/FunctionRef、imports/exports、Target、WorkflowRoot、Lock/Pin/Consumer，并重新计算摘要与 Exact-SHA 审核。
3. 静态命名检查可采用 `@typescript-eslint/naming-convention` + 分别约束 Package/Element 的 JSON Schema；不是用一个宽松 IDENTIFIER_PATTERN 管所有逻辑标识，也不能先加全仓禁止规则再把未迁移历史误判成新源码不合格。
4. 审核时输出新增/变更 ID 清单、准确所有者/职责、必要新增 POS/NEG/UNKNOWN/错 Digest 拒绝证据和精确 HEAD；没有运行的测试不得写 PASS。

**参考映射候选**：`r41-kdp → dh-kernel`、`r41.kdp → kernelLifecycle`（Namespace `dh`）；`r60-standard-files → dh-standard-file`、`dh.std.file.json → jsonCodec`（Namespace `dh`）。这不表示旧历史需要重写或新代码已经合格。
