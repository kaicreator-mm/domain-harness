# DomainHarness 0.11.x — 统一命名规范（R87：包名与变量名体系）

> **当前效力**：新的 Foundation **命名设计合同候选，待 #1668 Owner/L2 确认后落实机器 Schema 与代码**；已确认禁止新持久业务名字包含迭代 R41/R60、v011、Issue/CI 等无语义编号。旧 Reference App/stages.json/审核 SHA/Digest 不变。  
> **一项关键修正**：上一版 R86 将 `ElementDefinition.id` 规定为 `dh.kernel.lifecycle` 等点分路径，**不符合 Owner 本轮“Element 按变量命名”的要求，已被 R87 取代**。现在统一为：**Package ID 像 npm 包名（kebab-case），Element ID 像 TypeScript 变量（camelCase），Namespace 单独储存**。在机器 ABI 转换前不得声称当前 BUILD 已接受此新格式。
>
> **来源**：[npm package.json 命名要求](https://docs.npmjs.com/creating-a-package-json-file/)（name 全小写）、[Google TypeScript 命名](https://google.github.io/styleguide/tsguide.html)、[typescript-eslint naming-convention](https://typescript-eslint.io/rules/naming-convention/)；这里采用 npm 包名习惯，**不是**把 Google 另一语言生态的 package 命名格式照抄。Element/Package 具体规则是 DomainHarness 自身的规范决策。

## 1. 总体命名逻辑

- 一个名字应能说明**它是什么/做什么**，不依赖 Issue、轮次、实现者、版本或运行环境的知识才能理解。
- 同一语义只有一个稳定权威名字；`version/schemaVersion/contractVersion/nodeMajor` 等已有专门字段，禁止放进名称。
- **Package** 是对外/包内可选择的独立交付单元，因此用 **全小写 kebab-case**。
- **Element** 是由 Package 拥有的逻辑对象，因此用和 **TypeScript 变量/对象属性相同的 camelCase**。
- **Function** 是 Element 的操作，因此使用 **camelCase 的动作动词**；`init/exit` 为生命周期保留。
- **Namespace**、Package Owner、ID、Version 和 Digest 是**不同属性**；不要把它们压成一个暗含版本的字符串。展示时可以组合成全限定名称，但不能把展示字符串误写为新 Element 的 `id` 字段。
- **物理路径**使用 kebab-case，`package.json`、`index.ts` 等生态固定名字例外；文件布局不等于 Package/Element Owner 或安全授权。
- 别无意义缩写：`Kdp`、`Sdk`、`Json`、`Yaml` 等按 TypeScript 普通单词书写。语义上需要的 `sha256/ipv6` 数字合法，业务版本/工单阶段编号不合法。

## 2. 唯一命名表

| 对象 | 格式 | 正例 | 反例 |
|---|---|---|---|
| npm 对外 SDK name | npm 标准 lower-case + 可选 scope | `@kaicreator/domain-harness` | `DomainHarnessR41` |
| **DomainPackageManifest.id** | `kebab-case` | `dh-kernel`, `dh-sdk-foundation`, `dh-standard-file`, `reference-business` | `r41-kdp`, `r60-standard-files`, `sdk-v011` |
| Domain/逻辑命名空间 | 小写、可独立层级化；不在 Element ID 内重复 | `dh`, `reference`, `vehicle` | `r41`, `v011` |
| **ElementDefinition.id** | **`camelCase`（变量名）** | `kernelLifecycle`, `workflowRuntime`, `jsonCodec`, `brakeDiagnostics` | `dh.kernel.lifecycle`, `r41.kdp`, `json_codec`, `element2` |
| FunctionContract.id | `camelCase`，优先动词 | `init`, `exit`, `readJson`, `writeYaml`, `evaluateRule` | `R41_Execute`, `fn2` |
| ContentBlock.id、Workflow/node ID | `camelCase`，描述领域意义 | `decisionFlow`, `validateInput`, `safetyRules` | `node3`, `r60-flow` |
| TypeScript 接口/类型/类 | `PascalCase` | `PackageInitContext`, `WorkflowOutcome` | `IWorkflow`, `V011Kernel` |
| TypeScript 函数/变量/属性 | `camelCase` | `selectedElement`, `packageSystem`, `isReady` | `pkgSys`, `value2`, `is_ready` |
| 真正公共不可变常量 | `UPPER_SNAKE_CASE`（局部 `const` 仍可 camelCase） | `MAX_WORKFLOW_DEPTH` | `DH_V011_R41_LIMIT` |
| 源文件/目录/普通 Package 资源 | `kebab-case` | `workflow-runtime.ts`, `json-codec.json` | `R41Kdp.ts` |
| Protocol/Schema 版本/日志/CI 标签 | 保留各自协议既有规范 | `dh.element/0.11`, `NODE22_ESM_PROFILE`, `WOODPECKER_2981` | 将上述内容用作 Element ID |

### 2.1 新 Element 身份不是点分 ID

```ts
// 此处仅是未来 Foundation Schema 目标示例；当前源码尚不支持
const kernelElementRef = {
  namespace: 'dh',
  id: 'kernelLifecycle',
  version: '1.0.0',
  digest: '<ContentDigest>',
};

// Package Manifest
// id: 'dh-kernel'
// elements[].id: 'kernelLifecycle'
// ElementDefinition.id: 'kernelLifecycle'
// FunctionContract.id: 'init'
```

完整引用由 `ElementRef(namespace,id,version,digest)`、Manifest Owner 与选定 Lock 形成；**不要**再把 `dh.kernel.lifecycle` 设为 `ElementDefinition.id`，也不要通过给 Element ID 加业务前缀重复模拟 namespace。

**重要机器改动**：当前 `tooling/build/src/build.ts::elementNamespace()` 假定 Element ID 以点分域名前缀开头，当前 `json-schemas.ts` 的 `IDENTIFIER_PATTERN` 也允许 `.`、`_`、`-` 的混合写法。因此 R87 格式尚**不能**只靠文档宣称实施；在 #1668 完成所有受影响机器身份/权限/资源/序列化/引用路径的 L2 与改码后才可强制运行。新设计文档直接用此目标格式；新运行时消费者仍需服从当前被审 Schema。

### 2.2 旧 ID 迁移表（候选，不是已改动）

| 已验收旧身份 | 新 Package / Namespace / Element ID 候选 |
|---|---|
| Package `r41-kdp`、Element `r41.kdp` | `dh-kernel` / `dh` / `kernelLifecycle` |
| Package `r41-sdk-base`、Element `r41.sdk_base` | `dh-sdk-foundation` / `dh` / `sdkLifecycle` |
| Package `r60-standard-files`、Element `r60.files_lifecycle` | `dh-standard-file` / `dh` / `fileLifecycle` |
| Elements `dh.std.file.json` / `dh.std.file.yaml` | 同一 `dh-standard-file` 内 `dh` / `jsonCodec` 与 `yamlCodec`；**原 Element 的 v0.11.1 Accepted 身份只作为不可改写历史，不直接延用该资格** |
| Package `reference-business`、Element `reference.app`/`reference.rule` | Package 保持 `reference-business`；`reference` / `appLifecycle`、`decisionRule` |

**不能把“以前是 `STANDARD_ACCEPTED`”解释为“改成新 ID 后仍无需审核”**。身份改变会使原 ElementRef/FunctionRef/Lock/摘要无效，需建立新 SHA 下的新证据并迁移 Catalog；旧阶段索引保留以供追溯。

## 3. 自动化检查与执行边界

1. TypeScript 采用 [`@typescript-eslint/naming-convention`](https://typescript-eslint.io/rules/naming-convention/)：`typeLike` PascalCase、`variableLike` camelCase，实际 `UPPER_CASE` 常量有限豁免；不放宽当前 eslint/typecheck。
2. Machine Schema 的 **Package.id 与 Element.id 分别验证不同正则**，不能共用宽松 `IDENTIFIER_PATTERN`：Package `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`；Element/Function/Content/Node `^[a-z][a-zA-Z0-9]*$`（由正式 L2 决定保留既有协议特殊 ID 的例外）。要同时验证正则、同名唯一性、Owner/Ref/Version/Digest，不把正则当做全部语义证明。
3. 必须重验 `elementNamespace`、`ElementRef`/所有 `Selected*`、Manifest/DomainDefinition、WorkflowRef、FunctionRef、imports/exports、KDP Pin/Boot、SDK Consumer、Catalog 和全部真实 Fixture；拒绝旧/新混搭、摘要过期、双 owner 和未声明 import。
4. 已经归档的 R72/R81/#2979/#2981、R83/R84 StageIndex 及所有历史 Digest/注释不修改。仅为新 Package/Element 写入新身份记录，证明 Boot/KDP 与 Core.Init 实际运行正反例。
5. 在 Owner/L2 新机器合同未审核前，不自动改写生产/消费者，也不向当前真实 codebase 添加一个必然使已有合规文件失败的全局 lint/Schema Gate。

**作用**：统一 Package 名称与 npm 的包命名习惯，统一 Element 与 TypeScript 变量命名习惯，namespace/Owner/版本/摘要在自己的字段而非 ID 字符串里表达。与 [Element/Package 组织规范](./DomainHarness_v0.11.x_ELEMENT_PACKAGE_ORGANIZATION_STANDARD.md) 同时使用。
