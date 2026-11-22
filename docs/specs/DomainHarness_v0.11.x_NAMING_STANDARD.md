# DomainHarness 0.11.x — 统一命名规范（代码、Package、Element、身份与文件）

> **规范地位：** 对提交后的**新增或修改的持久命名**生效。既有经 Exact-SHA 验收的 Reference App/Lock/Digest 是不可改写的历史基线；旧 ID 的实际改名须通过 [Foundation 整改 Issue #1668](https://github.com/kaicreator-mm/domain-harness/issues/1668) 进行**整条引用链迁移**，不能仅改字符串或伪称旧收据仍验证新代码。  
> **Agent 执行入口：** [`domain-naming` Skill](../../.agents/skills/domain-naming/SKILL.md)；TypeScript 代码质量同时遵循 [`typescript-quality`](../../.agents/skills/typescript-quality/SKILL.md)。  
> **上游参考**：[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)、[Microsoft TypeScript Coding Guidelines](https://github.com/microsoft/TypeScript/wiki/Coding-guidelines)、[`@typescript-eslint/naming-convention`](https://typescript-eslint.io/rules/naming-convention/)。外部规则只提供通用编码习惯，**DomainHarness 的 Package/Element/Function 身份规则由本文自行定义**。

## 1. 优先级与基本原则

1. **语义优先**：名称反映真实所属领域、职责及稳定合同，而非任务、PR、CI、轮次、工作者、日期或实现语言版本；禁止把 `r41`、`r60`、`v011`、`i1656` 等内部实施代号用于**新的永久 Package/Element/API 身份**。
2. **职责命名**：Package 是可选的交付/权限单元；Element 是 Package 内有边界的职责单元；Function 是 Element 的命名操作；Content 是具名数据/语义；变量表达数据含义与单位/状态。不得将 TS 物理文件路径、任务名或源码类名直接等同对外 Element 身份。
3. **同一语义一个权威名字**：避免 `ruleData` 与 `ruleConfig` 分别指同一权威配置；同一个 Package/Element/FunctionRef 在 Manifest、Definition、Imports/Exports、Lock、流程和消费者中严格一致。版本写入 `version/schemaVersion/contractVersion` 等**专用字段**，不要塞进名称。
4. **数字有条件合法**：具有明确业务含义的 `sha256`、`node22`（仅 Target/profile 字段）、`json2`（若业务标准真如此）或 `ipv6` 可保留；无语义的 `r41`、`k02`、`tmp7` 不得成为稳定资产 ID。业务版本只用 SemVer 字段，不用 `FooV2` 分叉 SDK 符号。
5. **类型与运行时分离**：一个 Package、Domain App 的实际执行闭包只能同语言/运行时；文件后缀可标识 `.ts/.mjs/.json`，持久语义 ID 不增加 `Ts`/`Node22` 后缀替代 Target 元数据。
6. **原地历史保真**：旧锁、CI 收据、Digest、评审 SHA 与真实源路径是审计证据，不能为美观而回写历史；迁移只能形成新版本化身份、从真实字节重算摘要、重新验证引用和行为。

## 2. 各类名字的唯一规则

| 类别 | 强制格式 / 语义 | 合格示例 | 不合格示例 |
|---|---|---|---|
| 本仓库 TS 类型、类、接口 | `PascalCase`，业务名词或明确角色；无 `I` 类型前缀 | `PackageInitContext`、`WorkflowOutcome`、`DomainHarnessError` | `IWorkflow`、`V011BuildInput`、`Data1` |
| 函数、方法、参数、变量、属性 | `camelCase`；函数动词起头，布尔谓词 `is/has/can/should` | `selectWorkflow`、`isSelected`、`packageDigest` | `doIt`、`value2`、`tmp`（跨作用域） |
| 确实不可变且公开稳定的常量 | `UPPER_SNAKE_CASE`；局部只读值仍可 `camelCase` | `MAX_WORKFLOW_DEPTH`、`lockDigest` | `DH_V011_BUILD2` |
| 文件/目录（源与结构文件） | `kebab-case`；入口可用约定的 `index.ts` 等 | `package-system.ts`、`workflow-execution.ts` | `r41KDP.ts`、`V011-Builder.ts` |
| **Domain Package.id** | 稳定、全小写 `kebab-case`，按产品/领域命名；不含任务/轮次/版本 | `dh-kernel`、`dh-sdk-foundation`、`dh-standard-file`、`reference-business` | `r41-kdp`、`r60-standard-files`、`sdk-v011` |
| **ElementDefinition.id** | 领域/产品命名空间的**小写 dot-separated 语义路径**；每段为明确名词或职责 | `dh.kernel.lifecycle`、`dh.sdk.foundation.lifecycle`、`dh.std.file.json`、`reference.rule` | `r41.kdp`、`r41.sdk_base`、`foo.v2.rule` |
| FunctionContract.id | Element 内稳定的 `camelCase` 动词/操作；生命周期例外保留 `init/exit` | `init`、`exit`、`readJson`、`evaluateRule` | `f1`、`callR41`、`Execute_V011` |
| Workflow/content/node ID | 具名 `kebab-case`（现存公开合同需迁移才统一）；反映业务动作或路径 | `decision-flow`、`validate-input`、`retry-denied` | `workflow2`、`node3`、`r41-flow` |
| Interface/Capability 名 | 统一小写命名空间与清晰职责，精确匹配 Manifest `provides/imports/exports` | `dh.sdk.workflow`、`dh.std.file.read` | `r41.sdk`、`api2` |
| npm Package/CLI/Host 外部名称 | 遵守所属生态约定；与 **DomainPackage.id** 不是同一字段 | `@kaicreator/domain-harness`、`/runtime` | 将 npm 名称自动当作 ElementRef |
| 日志/Issue/CI/Review 标签 | **允许**稳定问题编号、阶段号、版本号，用于溯源而非产品标识 | `DH_V0111_R81_...`、`WOODPECKER_2981` | 把 `R81` 变成新业务 Element.id |

**缩写规则**：仅保留统一领域术语 **KDP、SDK、DIS、JSON、YAML、ESM、SRI、SHA、URL、ID、CI** 等；在 TypeScript 名字里按单词大小写处理，例如 `KdpBootstrapContext`、`readJson`、`lockDigest`、`sourceUrl`。不凭个人习惯创造 `pkgSys`、`wfExec` 等难搜索缩写。已冻结的第三方 API 名称保持原样，不为风格改写外部协议。

**明确不能误判**：`Core.Order=0`、`contractVersion='1'`、`nodeMajor=22`、内容 SHA、`stages.json` 的旧 R41/R60 证据、CI pipeline ID 都是**有定义的元数据/审计标识**，不是需要被禁用的“数字命名”。

## 3. KDP 和既有 Reference App 的命名整改清单（候选，并非已改名）

| 当前真实 ID | 建议新身份 | 注意 |
|---|---|---|
| Package `r41-kdp` | `dh-kernel` | 只有 KDP 真正实现归属调整后才能正式迁移 |
| Element `r41.kdp` | `dh.kernel.lifecycle` | `ElementRef.namespace/id/version/digest` 全部重算，Init/Exit Target 与 Pin 绑定一致 |
| Package `r41-sdk-base` | `dh-sdk-foundation` | 清楚区分公开 npm SDK 产品与 K/S/B 中的 SDK Domain Package |
| Element `r41.sdk_base` | `dh.sdk.foundation.lifecycle` | Core.Order 与直接 Extension、exports/imports 同步迁移 |
| Package `r60-standard-files` | `dh-standard-file` | 是物理 Package 实例命名迁移，不能取消本版已接受的标准资产身份证据 |
| Element `r60.files_lifecycle` | `dh.std.file.lifecycle` | `dh.std.file.json/yaml` **保留现有被接受的 Element ID**，不能无意义重命名 |
| Package `reference-business` | **保持不变** | 已有清晰语义；`reference.app` 与 `reference.rule` 保持 |

### 正确迁移次序（禁止简单全局替换）

1. 冻结被审的历史 Reference App、`stages.json` 原始 v0.11.1 摘要，建立旧 → 新身份映射与真正迁移依赖关系。
2. 逐一修改新的 Package Manifest/Definition/Function/Target，包括 `dependsOn`、`imports/exports`、`provides`、`workflowRoots`、`Kdp Pin` 与 Schema 权限；一个业务身份不得出现双 authoritative source。
3. 通过同一 SDK 的组合/Lock/Boot 正例，测试不存在旧名字时仍成功；测试旧/新混搭、拼写碰撞、未声明 import、过期 digest、未选 Workflow 必须拒绝。
4. 生成新真实 Digest/新 StageIndex 条目与源 SHA，完成 Exact-SHA 非 Writer 审核；旧历史记录保留，不标记旧 SHA 已验证新身份。

## 4. 静态检查的落地方式

- **现在**：提交本规范与 [Agent Skill](../../.agents/skills/domain-naming/SKILL.md)；`AGENTS.md` / `typescript-quality` 链接两者，所有**新生成或修改**的持久标识在 Review 时检查规则。
- **后续在 #1668 的受控源码迁移阶段**：为新/改 TS 标识符配置 [`@typescript-eslint/naming-convention`](https://typescript-eslint.io/rules/naming-convention/)（类型 PascalCase、变量/函数 camelCase、真正常量 UPPER_CASE），给机器 Schema 的 Package/Element ID 增加由一份规范维护的语义/语法检查，扫描新引入的 `r[0-9]+`、`v0?11` 等轮次标记并允许有证据的历史 fixture 白名单。不能一刀切把已有审核快照弄坏或通过放松全仓 ESLint 来假装合格。
- **审核**：新增 ID 时先回答“它代表什么领域职责？哪个 Package/Element 拥有？是否已有权威 ID？是否可跨迭代稳定？所有 Ref/摘要是否匹配？”；任一否定不得授予 Standard/SDK Contract 合格。

## 5. 一页示例

```ts
// Package: dh-kernel
// Element: dh.kernel.lifecycle
// Function: init
export async function init(context: KdpInitContext): Promise<PackageInitResult> {
  const packageSystem = context.packageSystem;
  const selectedWorkflow = packageSystem.findWorkflow(context.initialWorkflowRef);
  return packageSystem.initialize(selectedWorkflow);
}
```

这段仅是**命名示意，不是已存在的 KdpInitContext API、实施承诺或可执行的 KDP 初始化合同**。具体职责和 Boot/KDP 交界以 [架构自举设计审计](../architecture/DomainHarness_v0.11.x_ELEMENT_FIRST_BOOTSTRAP_OWNERSHIP_REVIEW.md) 与 Issue #1668 的 Owner/L2 审核为准。
