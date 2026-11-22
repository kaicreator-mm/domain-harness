# DomainHarness · 身份、Schema/Content、版本、命名

> **权威**：本文件是 [DomainHarness 规范集](./README.md) 的组成模块；所有模块共同构成**一套**规范，不是独立规范版本。
> **状态**：`CONFIRMED`=已确定原则；`MIGRATION_REQUIRED`=目标明确但机器合同/源码未迁移；`CANDIDATE`=待决策。不得从规范条款推导源码或 CI 已 PASS。
> **条款编号**：保留原 R90 单文件规范的编号以便 GitHub Issue、Review 和旧链接溯源；跨文件引用以目录索引为准。

Package 使用包名规则、Element 使用变量名规则；Namespace 为独立身份字段。R87 的目标需要全链机器 ABI 迁移，不能凭改名保留旧 Digest。

## 7. 统一命名 — CONFIRMED 目标 / MIGRATION_REQUIRED 机器合同

**命名依据**：npm 包名风格 + TypeScript 变量/类型风格，不再使用 PR/任务/阶段产生的 R41、R60、v011、i1656 等数字作为新的**永久产品 ID**。真正有业务意义的数字（如 `sha256`、`ipv6`）、SemVer 字段、Node Profile、CI/Issue/历史收据标签不在禁令内。

| 身份 | 统一格式 | 示例 |
|---|---|---|
| DomainPackage.id | 小写 `kebab-case` | `dh-kernel`、`dh-standard-file`、`reference-business` |
| **ElementDefinition.id** | **变量风格 `camelCase`** | `kernelLifecycle`、`workflowRuntime`、`jsonCodec` |
| ElementRef.namespace | 独立稳定的逻辑命名空间字段 | `dh`、`reference` |
| FunctionContract.id | 动词起头 `camelCase`，生命周期 `init/exit` | `readJson`、`evaluateRule` |
| Content/Workflow/Node 的新程序 ID | 按属性/变量风格 `camelCase` | `safetyRules`、`decisionFlow` |
| TS 类型/接口/类 | `PascalCase` | `PackageInitContext` |
| TS 变量/函数/属性 | `camelCase` | `selectedElement`、`isSelected` |
| 必要全局常量 | `UPPER_SNAKE_CASE`；局部不可变值可 `camelCase` | `MAX_WORKFLOW_DEPTH` |
| 源码文件/目录 | `kebab-case`，生态固定文件名例外 | `workflow-runtime.ts`、`package.json` |
| npm 公开包名 | npm `name` 格式，可使用 scope | `@kaicreator/domain-harness` |

**Namespace、Element.id、Owner Package、Version、Digest 各为不同属性**。不再把 `dh.kernel.lifecycle` 点分串写入**新** ElementDefinition.id；可用作展示历史全限定引用，不能代替逻辑对象独立属性。

**当前机器合同差距**：`tooling/build/src/build.ts::elementNamespace()` 仍基于点分 Element ID 推断 Namespace；`json-schemas.ts::IDENTIFIER_PATTERN` 对不同 ID 类型太宽松。新 Schema/生成期校验/Ref/Lock/Pin/Manifest/Catalog/Consumer 的身份格式、同名唯一性、旧→新迁移、Digest/版本重算仍需 #1668 L2/源码/独立 E2E。**不能当前就对所有历史 fixture 加一个会误判的全仓 Gate**。

**旧→新仅为迁移候选，不是已改代码**：`r41-kdp/r41.kdp → dh-kernel / dh:kernelLifecycle`；`r60-standard-files/dh.std.file.json → dh-standard-file / dh:jsonCodec`。旧锁、审查 SHA、`STANDARD_ACCEPTED` 及历史 StageIndex 永久保留，不自动把原资格搬到新身份。

### 13.1 多重身份、规范化序列化与版本边界 — CONFIRMED 原则

- **逻辑身份与物理身份严格区分**：Domain/Package/Element/Function/Workflow/Content 的逻辑 ID、版本和 Owner；Definition/Contract/Implementation/Target/Resource 的具体字节与 Digest；App Descriptor、Lock/Pin、安装记录与 Receipt，各自承担不同责任。不得通过路径、显示名或文本相等替代精确的权威身份。
- ElementRef 持有 `namespace/id/version/digest`，FunctionRef 另有 `functionId/contractVersion`；WorkflowRef 指向已选 Element 与其 `contentId`。**当前点分 Element ID 的 Namespace 派生与 R87 的变量式 ID 目标存在差距**，属于 #1668 的机器 ABI 迁移，不得只变更文本描述。
- 生成期应证明 Definition、Target 实现、资源及 Package 的结构和正确性，App 组合与封存阶段应按适用规范化与 Digest 约束确定性封存；相同有效输入/Target 应产生等价的 Lock 和受信安装身份。**Digest 不保证来源权威，身份校验也不赋予未声明的调用或 Effect 权限**。
- `schemaVersion`、Element `version`、Function `contractVersion`、Package SemVer、Target Profile、Lock/Pin 版本与 npm 发布版本不同；不混为一个全局版本号。对尚未发布的 `0.11.x` 内部阶段没有 ABI 兼容义务；对未来已发布合同的演进规则需要正式 L1/L2 决议。

### 13.2 Content、Schema、Ref 与可见性 — CONFIRMED 原则

- 已选 Element 内容使用 `contentKind + schemaRef` 的有类型内容块；资源 `value` 与 `ref` 的选用、必填/可选属性、inline/资源字节的规范化和摘要须由当前生成期 Schema 与 App 封存合同明确，不靠运行时猜测格式。
- **未知必需内容不能在没有已确认类型/Schema 时默默接受；未知可选内容必须可确定性排除并可从 Lock/收据审计**。允许的扩展类型前缀不自动代表任意未知语义已受审或有权限执行。
- 所属 Package、Element Visibility、直接 Extension、选定 FunctionRef、Target、具体资源/HostPort 共同构成授权边界；元数据能被索引不代表原始私有资源被任何 Package 读取。
- 纯数据/零 Function Element 可以合法静态存在，运行期 Reader/Query 必须是实际选定并被授权的普通 Element.Function；**不得因 Content.Kind 为 `rule` 或 `workflow-definition` 自动获得执行能力**。
