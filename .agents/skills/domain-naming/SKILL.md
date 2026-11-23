---
name: domain-naming
description: DomainHarness Language-Native SDK 的 Package ESM 插件、Element Class、模块函数、元数据、Order 和相关 TS 名称审查辅助 Skill。
---

# DomainHarness 命名 Skill

**唯一权威**：[核心](../../../docs/specs/domain-harness/core.md) → [TypeScript Profile](../../../docs/specs/domain-harness/typescript-profile.md) → [身份与命名](../../../docs/specs/domain-harness/identity-naming.md)；根据任务再读 [Element/Package](../../../docs/specs/domain-harness/element-package.md)。本 Skill 仅提供 Agent 检查方法，不维护第二份命名合同。

## 新静态 TS 体系操作顺序

1. 识别对象是 Package 插件的 npm 名/代码元数据、Element Class/逻辑 ID、Package 导出 Function、Class 实例/静态方法、Domain 资源/Workflow 定义、Order 还是普通文件/路径。
2. Package `id` 使用 **kebab-case**，TS Class 用 **PascalCase**，Element `metadata.id` 用 **camelCase**，公共函数与方法用 **camelCase**。独立 `namespace` 只在业务命名确有需要时声明。不可把 R41/R60/v011/Issue 号写入新稳定名称。
3. Module `packageMeta` / Class `static metadata` 是 **框架实际读取的代码**；普通 npm `dependencies/exports` 管理依赖和公开 API。Module 级函数无需归属 Element/包装成静态 Class；无 Init/Exit 的 Package 不创造占位标识。
4. Core 的执行 Order 由代码元数据给出；KDP Order=0，其他 Core Order 互异、非负、可跳号。生成期检测冲突与错误依赖，运行期只读取使用，不另建 Name Registry/Lock/Pin 解析体系。
5. 修改接口或命名时追踪真实 `import/export`、业务调用者、TS 类型、npm 包公开路径与标准库调用，执行相关测试。明确旧→新名称对照、Exact SHA、真实验证与尚未迁移的旧源码，防止把历史受审产物误写为新 SHA PASS。

## HISTORICAL / 对新 v0.11.1 禁止重用的旧清单

旧 `ElementDefinition/ElementRef.namespace/FunctionRef/Target/ImplementationBinding/SelectedFunction/Manifest/Lock/Pin/ContentDigest/WorkflowRef` 的强制身份路径、点分元素 ID、按 Package ID 生成 App Lock 和重新封存 Target Digest 等，是旧运行时架构或历史取证，不是当前 TS 插件/Class/Function 规范。历史 R87 命名设计仍可通过 [旧命名文档](../../../docs/specs/DomainHarness_v0.11.x_NAMING_STANDARD.md) 追溯，不得作为现行机器 ABI。

按 [domain-harness-spec Skill](../domain-harness-spec/SKILL.md) 做总体架构审核；Skill 的主要目标是帮助 Agent 精确应用**一套权威规范**，不要再次引入旧 BUILD、动态选型与专用 runtime 安全验证。
