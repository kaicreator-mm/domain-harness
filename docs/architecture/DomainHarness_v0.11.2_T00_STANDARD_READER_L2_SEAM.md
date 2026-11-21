# DomainHarness v0.11.2 · T00 — Standard JSON/YAML Reader L2 实际接线决定（R31）

> **设计候选，不能当成代码已经完成。** 本合同实现 [R29 Standard Element 规范](./DomainHarness_v0.11.x_STANDARD_ELEMENT_SYSTEM.md) 的第一项有限任务 [#1644](https://github.com/kaicreator-mm/domain-harness/issues/1644)，遵守 0.11.0/0.11.1 已接受的唯一 Element/Function、Package/Direct Extension、BUILD/Lock、KDP/Workflow/XState、可信安装。适用源码基线 `version/v0.11.x@43ce7feab7134e3f61f9b4686f7c8735ce4b1615`。本 R31 **必须先由独立审阅者审核接口和信任边界，再触碰源码**。

```ini
OUTPUT_LABEL=DH_V0112_T00_R31_READER_L2_SEAM_DECISION
REPO=kaicreator-mm/domain-harness
VERSION_ISSUE=#1612
TASK_ISSUE=#1644
R29_STANDARD_ARCH=#1643_MERGED_ACCEPT_SCOPED
BASE_TRAIN=43ce7feab7134e3f61f9b4686f7c8735ce4b1615
MODE=DOCS_ONLY_L2_PREIMPLEMENTATION
PARSER_SEMANTIC_OWNER=STANDARD_READER_SHARED_SINGLE_PARSER_IMPLEMENTATION
KDP_RESOURCE_AUTHORITY=UNCHANGED
KDP_UTF8_SIZE_SEALING=UNCHANGED
BUILD_STATIC_DATA_VALIDATION=UNCHANGED_IN_SCOPE_SHARED_IMPLEMENTATION
READER_INPUT_MIGRATION=FORMAT_SOURCE_ONLY
ROOT_ELEMENT_KIND=UNCHANGED
SECOND_ENGINE_OR_LOCK=NO
SOURCE_IMPLEMENTATION=NOT_STARTED
STANDARD_ACCEPTED=0
```

## 1. 先读现有代码：问题的准确范围

- `packages/microkernel/src/workflow-execution.ts:80–108` 的 `prepareDataInput(node,input,driver)` 在 KDP 内调用 `driver.read(selected ResourceRef)`，强制 `node.data.maxBytes`、`TextDecoder('utf-8',{fatal:true})`，继而自己 `JSON.parse` / `yaml.parseDocument`，最后 `canonicalJson`/plain JsonValue 检验，生成 **`{format,source,value}`**。
- `examples/basic-domain-app/consumer.mjs:85–98` 的 `basic.rules.jsonReader/yamlReader` 只是检查 `input.value` 并转发，它们**没有执行格式解析**。这两个 FunctionRef 不能因 T14 的 2 JSON+2 YAML E2E 通过，就被称为可独立复用的标准 Reader。
- `tooling/build/src/workflow-selection.ts:165–206` 已在 BUILD 选定时校验同一封存 ResourceRef 的字节/大小/严格 UTF-8/JSON/YAML，并固定各 FunctionRef 的 Owner/Direct Extension/Import/Export。KDP 和 BUILD 当前各自有一份格式解析算法，尚未形成 Standard Reader 共享实现。
- `packages/microkernel/src/workflow-run.ts` 的 XState Actor/受控 Switch/预算/深度与数据 Reader 分层独立，**本任务完全不改其执行器**。

## 2. 唯一明确的架构决定：选定 Reader Element 是格式解析者

**决定：把 JSON/YAML 解析和可规范化 JSON 值的算法所有权集中到同一个可复用的标准 Reader 源实现；KDP 不再自己运行 JSON.parse/yaml.parseDocument。** Standard Element 是普通 `ElementDefinition(kind:'Element')` / `FunctionContract` / 有版本 `FunctionRef`；BUILD 和 Runtime 复用**同一份解析规则**，分别用于构建期拒绝与运行期 Function 解析，而不是两套分叉的 parser。可由 monorepo 的标准 Reader 模块公开受控的纯格式解析帮助函数供 BUILD 使用，但最终应用运行时只通过 **BUILD-selected Reader FunctionRef** 走 KDP 既有 `invokeSelectedFunction`；没有第二入口。

### 明确的责任表

| 边界 | 仍归谁所有 | 不允许的行为 |
|---|---|---|
| Data ResourceRef 的来源/Owner/Direct Extension/Content Digest/封存 | 原 `tooling/build` 和 `DomainAppLock` | Standard Reader 自选路径、经 Runtime 动态发现数据、绕过 Lock |
| ResourceRef 的只读访问、摘要、maxBytes 与严格 UTF-8 解码 | **KDP**，当前 `driver.read()` 的 Pin 校验不变 | Reader 自己使用 `node:fs`、network 或裸 Host path |
| 格式解析、YAML 安全选项、JSON-compatible 值归一/拒绝 | **标准 Reader 源实现**；BUILD 使用其等价、受控的纯解析接口进行选定资源预校验，Runtime Reader Function 执行同一实现 | 在 KDP 和 Reader 分别实现两套可分叉的 JSON/YAML Parser；放宽 YAML alias/tag 或不可控类型 |
| `FunctionOutcome`/Input/Output Schema、UNKNOWN/FAILED、Hook/预算、XState | 现有 **KDP/Contracts** 的机器合同 | 业务标准 Reader 获得隐式特权、复制 Outcome 验证器、把失败升级 COMPLETE |
| App 依赖安装与 SHA512 SRI 校验 | 原唯一 BUILD/Lock、`trusted-runtime.ts` | 自由 npm install、未声明第三方模块、把 `yaml` 暴露给任何未选业务代码 |

**重要区分**：BUILD 对静态已选数据进行**预检**与 Runtime 的标准 Reader **解析**是不同生命周期步骤；允许二者调用同一受控 parser *implementation*；不能为“无重复”删掉 BUILD 正反例静态拒绝，也不能让 KDP 再私下解析并把结果注入 Reader。

## 3. 接口迁移是实际 Contract Delta，禁止静默兼容

**当前已接受的 0.11.1 Reader 输入**是 `WorkflowReaderInput={format:'json'|'yaml',source:string,value:JsonValue}`。

**T00 新决定**：仅对带 `WorkflowFunctionNode.data` 的已选 Reader leaf，KDP 执行：
```text
BUILD 静态 ResourceRef/Format/FunctionRef 选定
→ KDP Lock Pin→可信封存 bytes→maxBytes→严格 UTF-8 source
→ KDP 通过原 selected FunctionHandle.invoke({format,source})
→ 标准 JsonReader/YamlReader 解析出 JsonValue
→ SUCCEEDED({真实解析的 value}) 或 FAILED(明确错误)
→ 原有 Switch/Outcome/Hook/end/根预算
```

- `WorkflowReaderInput` 调整为 `{format,source}`，不得仍声明 `value` 是 KDP 已计算后又要求 Reader 再 parse。同次重构必须更新 T11 Contracts/TypeScript 类型、相关 Schema、T13 Runner 单测、T14 fixture + consumer、T12 BUILD 的受影响代码与文档，**保持版本列车只使用新版合同，不建立两套 ABI 或 v0.10 兼容适配**。
- `source` 是已经 Lock 验证并严格 UTF-8 解码的**原文字符串**，而不是任意来自用户输入的 Host 路径。Standard Reader 自己负责非空/格式匹配、解析、安全规范化与明确 `SUCCEEDED({id, ...})` 或 `FAILED` 的机器 Outcome。外部普通 Function 调用若没有 ResourceRef 封存路径，不可冒称具备“文件读取权限”。
- 单节点与多个 JSON/YAML 数据 Element 仍引用**同一个标准 JsonReader/YamlReader FunctionRef**；如果普通 Function 业务需要直接处理传入的纯 JSON/YAML 字符串，也可经已选 Function 输入 Schema 调用，但这不授予任意文件/Effect 权限。

## 4. 安全与错误合同：不能因为提取而放松旧保证

- **BUILD 负例仍然必须拒绝**：错误资源摘要/越界路径/缺失直接 Extension/Function Import/无效 JSON/YAML/非法 UTF-8/过量字节/不合法 YAML alias、标签、重复 key、不可规范化数值。BUILD 预检与 Runtime Reader 应调用同一安全解析实现，确保选定 Data 在构建时就不会被错误接受。
- YAML 规则沿用 **YAML 1.2 core、strict:true、uniqueKeys:true、logLevel:silent、toJS({maxAliasCount:32})**，并拒绝警告、非法 Tag、非 JSON 类型、循环、非有限数值和危险资源膨胀。按已有 `canonicalJson`/plain JsonValue 契约校验输出；如果发现旧 BUILD/KDP 实际不一致（如仅一侧拒绝非普通对象），先用一个受控同义修复统一，再接受标准化。不能未经分析扩大支持的 YAML 子集。
- Runtime KDP 继续在调用 Reader **之前**验证 sealed resource、大小、UTF-8：越权/Pin/未受信安装/大小/非法 UTF-8 仍无 Reader 业务调用；Reader 格式语法错误产生显式 `FAILED(DH_WORKFLOW_READER_INVALID)`（不得泄露原始敏感数据），由已有 Switch fail-closed/Element end 机制保持终态。因 BUILD 已预检，正常被封存的业务资源**不应**在运行时出现语法失效；实际字节篡改应在 Boot/Pin 或 KDP 先拒绝。现存测试中“注入未通过 BUILD 的非法 YAML，必须在 Reader 调用前拒绝”只适用于**旧 KDP 同时解析**的边界；迁移后必须改成 **BUILD 拒绝 + Runtime Reader FAILED** 两类精确测试，不能错把合理变化声称行为完全等价。
- 仍在 `invokeLeaf` 进入前预约 start+Function+end 全部预算；start Hook 和 end Hook 的次数/await/finally 保留。一次 Reader Function 只计一次 Element 调用。UNKNOWN/FAILED 原由保留，不洗白为 COMPLETE；XState root/child Actor 和最大祖先深度未改。

## 5. `yaml` 可信依赖与静态 ESM Guard：新增最小受信边

目前 `tooling/build/src/static-package-guard.ts` **默认拒绝普通 Package 的外部裸 `import 'yaml'`**，这是有效的已审安全边界，不能简单为所有业务 Package 全局加白名单。

- 推荐让标准 Reader 的可执行入口由**普通被选 Standard Extension Package** 提供，仍经原 Manifest/FunctionRef/Target、Linkage 静态选择与本地 sealed `package.json` 无自由依赖。
- YAML runtime 的唯一第三方可执行依赖使用当前 **`yaml@2.9.1` + SHA512 SRI 已在 `trustedRuntimeIntegrity` 固定的 Archive**，随唯一组合 App 受控安装。**实现必须限定** Standard YamlReader 的确切已选 Element/Function/module 可引入已被 Lock 认可的 `yaml`；其余 Package 直接 `import 'yaml'` 继续 `DH_BUILD_DEPENDS_ON_UNSELECTED`。不可将 `node:fs`、网络、广义 npm Registry 任意代码一并列入许可。
- 若在现有静态 ESM/Package Owner 模型中不能证明这种特许最小可控，则不得通过全局白名单“先跑起来”，应先用正反例证明可行的首方 ESM封装/选定导出方案再实施。不能降低 0.11.1 的 Boot/SRI/FunctionRef/Direct Extension 授权；这会是 T00 的 **P1 阻断项**，不是可忽略的小问题。
- `xstate@5.33.2` 仍仅供唯一 KDP Workflow Actor，T00 **不**复制/迁出 XState engine；Standard State Transition Element 只有第二个真实 Domain Workflow 消费时才可实施。

## 6. 源码模块与受影响测试面（增量验证）

建议在 Git monorepo 增设 `packages/standard-elements/`（精确 npm workspace/构建布局由实现确定），仅把首批 `dh.std.reader.json` 和 `dh.std.reader.yaml` 组织为可选择的普通 Element 资产；一个标准 Extension Package 可以包含两个 Element。目录本身不赋予权限，真正运行 Package 通过 Manifest + 已选 `ElementRef`/FunctionRef/Target/资源 digest 与 BUILD 选中。

**最小实际变更面（只在 L2 独审后开始）：**

1. 标准 Reader 模块与 Package Manifest/ElementDefinitions/版本/FunctionContracts/业务输入输出 Schema；BUILD 共享 parser/静态选择与可信 `yaml` 静态解析的有限证明。
2. `packages/contracts/src/workflow-contracts.ts` 的 ReaderInput 类型（以及相关 Schema/测试），`packages/microkernel/src/workflow-execution.ts` 去除其独立解析、保留 Lock/size/UTF8，和 `tooling/build/src/workflow-selection.ts` 复用同一格式规则。
3. `examples/basic-domain-app/workflow-fixture.mjs` 与 `consumer.mjs` 的 `basic.rules` Reader 替换为真实跨包标准 Reader 的 FunctionRefs，所有直接 Extension/Imports/Exports、Target、生成文件和 Package 受检；更新 T14 真实 E2E 断言，不抹掉既有 fatal cleanup、预算、YAML/JSON 资源负例。
4. 0.11.2 第一份实际领域 Fact/Knowledge Consumer **再使用同一被选 Standard Reader**；不是在原 T14 DEMO 同一个业务 Package 里四份资源就认定跨领域资格。
5. 只覆盖受影响 seam 的 Builder 测试、合同测试、运行时测试、真实 clean-packed Install/Boot/E2E。必须提供无越权、非法 YAML、大小、UTF8、SRI、非直接 Extension、unselected Reader 的**负例**；正常两个 JSON + 两个 YAML 正例。旧 T11–T14 未修改范围继续复用独立审过的证据；一次必要 CI + Exact-SHA 独立增量 Reviewer，不能把源码候选直接提升 `STANDARD_ACCEPTED`。

**结束边界**：T00 只有在可复用的正式 Reader 元数据/字节/Package 真的被**两个用途的 Consumer**静态选中、正反例与审核合格后，才把 [Standard Element Catalog](./DomainHarness_v0.11.x_STANDARD_ELEMENT_CATALOG.md) 中相应项升级为 `STANDARD_ACCEPTED`，给出真实版本与 FunctionRef/Owner/digest/CI。若涉及核心安全例外无法证明，明确 `BLOCKED_STATIC_GUARD_PROOF` 停止本 Task，不得无期限重试。未独立实现的 `dh.std.workflow.transition` 保持 `CANDIDATE`。

## 7. 限定 L2 审核必须核对的决策

- **Parser ownership**：KDP 必须仅处理受信资源/字节/UTF-8，实际业务格式解析和安全 JSON value 归同一个 Standard Reader 解析实现；BUILD 只在编译阶段使用等价的同源 parser 做静态拒绝。
- **Migration**：旧 `{format,source,value}` 到新 `{format,source}` 是明确合同变化且每个受影响 Consumer/测试必须同批更新，没有假兼容。
- **Permission**：只允许已经被选的标准 YamlReader 使用 Lock/SRI 固定的 `yaml`，不可把它变成所有业务 Package 的自由 npm import。
- **Effect/Outcome**：Reader 无任意文件读取/网络/Host 权限；invalid/UNKNOWN/FAILED、Hook/budget/Ancestor/XState 正反例不倒退。
- **Qualification**：本 R31 的 GitHub 文档和 Issue 决议只决定**下一次源码实现的安全接口**，不是 `0.11.2 Product/L1` 已冻结，亦不是两个 Standard Element 已实现/正式合格的证据。
