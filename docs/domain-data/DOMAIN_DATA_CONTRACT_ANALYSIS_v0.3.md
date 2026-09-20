# DomainHarness SDK Domain Data 契约分析（v0.3 输入）

**Document:** Domain Data Contract Analysis for the DomainHarness SDK
**Status:** ANALYSIS / v0.3 L2 INPUT（非冻结规范）
**Date:** 2026-09-20
**Basis:**
- `DomainHarness v0.3 PRD — FREEZE CANDIDATE`（2026-09-19）
- `Domain App Abstraction & General Design v0.1 / v0.2 Proposal`（2026-09-18 / 2026-09-19）
- 本仓库代码现状（branch `main` @ `4299405`）：`packages/domain-harness`（Runtime SDK）、`packages/domain-harness-compiler`（编译期）、`packages/domain-harness-node` / `packages/domain-harness-expo`（宿主）

> 本文回答一个问题：**SDK（编译器 + 运行时）对项目提供的 Domain Data 到底强制了什么契约、文档额外要求了什么契约、两者差距在哪里。**
> 代码证据均标注文件路径；文档要求标注出处章节。`[现状]` 表示实现观察，不是规范。

---

## 1. 总图：Domain Data 的双形态契约

三份文档一致的公式（General Design v0.1 §2.1 / v0.2 §2 / v0.3 PRD §4）：

```text
Target Compiled Domain Package
= Compiled Domain Data
+ Compiled / Declared Domain Tools
+ Target Host Bindings
+ Package Identity / Compatibility Metadata
```

SDK 对 Domain Data 的契约分两层，**Runtime 只消费编译产物，Raw 只被 Compiler 消费**（General Design v0.1 §17，与代码一致）：

```text
Raw Domain Package ──(domain-harness-compiler)──► Target Compiled Domain Package ──(domain-harness SDK)──► Domain Runtime
      构建期契约                                              运行期契约
```

治理层（不解析、但被文档冻结）另有 `DOMAIN_DATA_SPEC.md` 的资产分类与权威分级契约，见 §4。

---

## 2. 构建期契约（Raw Domain Package → Compiler）

### 2.1 磁盘加载部分（编译器强制）

证据：`packages/domain-harness-compiler/src/raw/load-raw-package.ts`、`src/raw/types.ts`。

| 资产 | 契约要点（代码强制） |
|---|---|
| `harness.yaml` | 仅允许 `schemaVersion: '0.1'`、`id`（→ domainId）、`limits.maxSteps`（正整数）；出现其它键直接报错（closed schema） |
| `workflows/*.yaml` | `initial` + `states`；每个 state：`final`、`invoke`（**恰好一个** `skill/tool/script/expr/workflow`）、`done`/`error` 路由（`{target, when?}`，`when` 为 JSONata 表达式，编译期预编译）、`events`（`{schema?, routes[]}`）、`effects`（`domain-message`：`targetExpression / messageType / payloadExpression? / contractVersion?`） |
| `skills/<id>/` | `SKILL.md`（instructions）+ `skill.harness.yaml` sidecar：**`output.schema` 必填**、`input.schema` 可选、`resources[]`（内容随包冻结为 `{path, content}`）、`profile?` |
| 被引用 Script | 源码构建期冻结（`RawInvoke.scriptSource` 注释：*Build-time only. Never copied into the compiled manifest.*——进 binding 内容，不进 manifest 明文） |
| 被引用 JSON Schema | Ajv Draft 2020-12 必须可编译；引用路径必须相对且不得逃逸包根（`safeExistingPath` / `assertContained`） |

v0.1 Runtime 侧同构 loader 证据：`packages/domain-harness/src/loader/schemas.ts`（zod closed schema：`invoke` 五选一、`route {target, when?}`、event 三种形态、skill sidecar）。

### 2.2 程序化传入部分 —— [现状] 没有磁盘 authoring 格式

证据：`packages/domain-harness-compiler/src/compile/compile-domain-package.ts` 的 `CompileDomainPackageInput`：

```ts
compileDomainPackage({
  raw,                 // LoadedRawDomainPackage（§2.1 加载结果）
  domainVersion,       // 非空字符串
  target,              // TargetHostProfile { id, capabilities: CapabilityId[], bindings: Record<CapabilityId, bindingId> }
  bindingContents,     // 每个 bindingId 的不可变内容 → content-addressed digest；缺失即 fail-closed
  tools?,              // RawToolDefinition[]（程序化传入）
  projections?,        // RawProjectionDefinition[]（程序化传入）
})
```

**Tool 声明契约**（`RawToolDefinition`，`src/raw/types.ts`）：

- `toolId`；`outputSchema` **必填**，`inputSchema` 可选；
- `effect ∈ none | idempotent | non-idempotent`；
- `executionKind`（开放字符串，宿主端口现状只有 expression / script / remote 三类）；
- `bindingCapability` / `requiredCapabilities`：多 capability 时必须显式选择 bindingCapability，且它必须同时出现在 requiredCapabilities 中；
- `config` 为**封闭集合** `LogicalToolBindingConfig { transport?, resourceKey?, path?, method: 'POST' }`。源码注释明确：该封闭集是**结构性排除** secret / endpoint / 运行时句柄进入 Domain Package 的机制（对应 General Design v0.1 §20 红线"Domain Package → 具体 secret/endpoint 禁止"、v0.3 PRD §6.1）。

**Projection 声明契约**（`RawProjectionDefinition`）：

- `projectionId`、`expression`（JSONata，编译期预编译失败即报错）、`outputSchema`；
- `dependencies` 三种且仅三种：`workflow {selector}`、`business {source, selector}`、`domain-data {key}`。

### 2.3 编译期校验规则（fail-closed 清单）

- 同一消息类型跨 state 声明的 payload schema 必须一致（`compile-domain-package.ts`）；
- Tool / Projection id 不得重复；
- capability 需求必须被 `TargetHostProfile.capabilities` 覆盖（`compile/capabilities.ts` 的 `assertTargetCapabilities`）；
- 每个用到的 binding 必须有 `bindingContents`，digest 写入 `bindingDigests`；
- `packageId = sha256(canonical(manifest − packageId))`：内容寻址身份（Runtime 侧对应 `package/validation.ts` 的 `computeCompiledPackageId` / `canonicalPackageIdentityMaterial`）。

---

## 3. 运行期契约（Target Compiled Domain Package → SDK）

### 3.1 包清单与激活校验

证据：`packages/domain-harness/src/v2/contracts/package.ts`、`src/package/validation.ts`、`src/package/activation.ts`、`src/package/registry.ts`。

```ts
CompiledPackageManifest {
  formatVersion: string;
  runtimeContractMajor: number;      // 与宿主 policy 不符 → INCOMPATIBLE_PACKAGE
  executionEngineMajor: number;
  domainId; domainVersion; packageId; targetProfileId;
  requiredCapabilities: CapabilityId[];             // `${string}@${number}`
  workflows:   Record<id, { workflowId, definition: JsonObject /* 可移植控制机 */, messageContracts: Record<type, { type, version?, payloadSchema }> }>;
  tools:       Record<id, { toolId, inputSchema?, outputSchema, effect, execution: { kind, bindingId, digest?, config? }, requiredCapabilities }>;
  projections: Record<id, { projectionId, expression, dependencies, outputSchema }>;
  schemas:       Record<id, JsonSchema>;
  bindingDigests: Record<bindingId, digest>;        // 不匹配 → BINDING_DIGEST_MISMATCH
  compatibility?: JsonObject;
}
TargetCompiledDomainPackage = { manifest, bindings: Record<bindingId, 目标平台可执行句柄> }  // 缺 binding → MISSING_BINDING
```

全部字段必须 JSON 可序列化（禁循环引用、禁非有限数，`assertJsonSerializable`）；`packageId` 与规范身份材料哈希不符 → `PACKAGE_ID_MISMATCH`。激活时另有 pin/retention 契约（`package-pins` 查询、`preflightPackageActivation`），支撑 PRD"实例锁定包版本、被锁定包必须可加载"。

### 3.2 SDK 运行 Domain Data 的四个数据入口端口

| 端口 | 契约 | 证据 |
|---|---|---|
| **CompiledDomainDataPort** | `get(packageId, key) → JsonValue \| undefined`；纯内存查找、不可变、无 I/O、按 packageId 钉住身份 | `src/projection/compiled-domain-data.ts` |
| **BusinessSnapshotPort** | `read({source, key}) → {source, key, revision, value}`；返回身份与请求不符 → `business_snapshot_mismatch`；revision 必须非空。设计文档追加 B1–B5（value 变⇔revision 必变、单源一致、只读、可缓存；General Design v0.2 §11.4） | `src/v2/contracts/projection.ts`、`src/projection/projection-service.ts` |
| **RuntimeHostBindings + RuntimeResources** | `sha256 / secureRandom / expression(JSONata) / script? / remoteTransports?`；`RuntimeResources[resourceKey]` 句柄值只在激活期注入，包内只有 `resourceKey` 引用 | `src/v2/contracts/host.ts` |
| **AIOperationPort** | `execute({ identity{runId, workflowInstanceId, stepId, attempt}, skillId, instructions, resources[{path,content}], input, outputSchema, profile?, signal }) → JsonValue`；输出按 outputSchema 校验后入 journal（`journaled-skill-runner.ts`） | `src/contracts/ai.ts` |

### 3.3 Projection 输入契约（Dynamic Domain State 的唯一合法来源）

`src/projection/projection-service.ts` 组装给表达式的输入是**固定形状**：

```jsonc
{
  "key": "<查询 key>",
  "input": <可选查询输入 | null>,
  "workflows":  [{ "address": {workflowId, instanceKey}, "stateRevision", "state" }],
  "business":   [{ "source", "key", "revision", "value" }],
  "domainData": [{ "key", "value" }]          // ← Compiled Domain Data 的唯一入口
}
```

冻结约束（v0.2 PRD，v0.3 PRD §17 继承）：deterministic、只用声明依赖、无 Tool / AI / 外部 I/O、派生非权威。错误契约：`projection_not_found` / `workflow_source_missing` / `business_snapshot_port_missing` / `business_snapshot_mismatch` / `domain_data_port_missing` / `domain_data_not_found` / `evaluation_failed` / outputSchema 校验失败。

[现状] 与 General Design v0.2 §11.1 的观察一致：workflow 依赖一对一（instanceKey 缺省 = 查询 key）；依赖实例不存在则整个 Projection 失败；输入不含实例 lifecycle；用 registry 默认包执行。

### 3.4 消息与结果契约

证据：`src/v2/contracts/message.ts`、`src/messaging/`。

```ts
DomainMessage { messageId, target{workflowId,instanceKey}, type, payload, correlationId?, causationId?, contractVersion? }
MessageAcceptedAck { status: 'accepted' | 'duplicate', messageId, target, targetSequence, packageId, acceptedAt }
MessageDisposition = 'accepted' | 'processing' | 'processed' | 'failed' | 'abandoned'   // [现状] 无 rejected
```

payload 按**目标实例锁定包**的 `messageContracts.payloadSchema` 校验；去重按 messageId。ACK 语义 = validated + durably accepted + ordered（General Design v0.1 §11.1）。

### 3.5 Tool 执行与 effect journal 契约

证据：`src/v2/contracts/effect.ts`、`src/execution/`。

```ts
EffectExecutionContext { effectId, target, sourceMessageId, logicalTime, attempt, idempotencyKey, signal? }
EffectJournalRecord { effectId, target, sourceMessageId, effectKind, effectSemantics, status: started|completed|failed, attempt, input?, output?, error?, startedAt, completedAt? }
```

effect 三值语义决定恢复行为（non-idempotent 歧义 → `recovery_required`）。[现状] `idempotencyKey` 已存在但未传入 Script/Remote 执行请求（General Design v0.2 §9.4，[L2-4]）。

### 3.6 实例状态契约（决定 Domain Data 能依赖什么记忆）

证据：`src/v2/contracts/workflow.ts`、`src/runtime/compiled-workflow-runtime.ts`。

```text
WorkflowInstanceSnapshot.state ≈ { stateId, data(开通输入，不可变), lastMessage(瞬时), lastResult(瞬时，done 路由携带) }
WorkflowLifecycle = active | waiting | recovery_required | completed | failed | cancelled | terminated
```

[现状] 跨消息只保留 `stateId` 与开通 `data`；无 assign/Process Data 机制（General Design v0.2 §10.1；v0.3 PRD §6.2 将其列为必须补齐项）。这直接约束 Domain Data 的写法：**跨消息流程数据必须放业务库**（S2 约定）。

---

## 4. 治理层契约（不被解析、但被文档冻结）

证据：`docs/domain-data/DOMAIN_DATA_SPEC.md`。

- **六类资产**：authority / executable harness / knowledge-reference / pattern-recipe / example / validation-evidence；
- **五级权威**：`FROZEN > CONTROLLED > REFERENCE / EXAMPLE / DERIVED`，低级别不得静默覆盖高级别；
- **DD-P1~P7**：领域所有权、files-first、真相与执行投影分离、确定性优先于 AI、显式溯源、可版本化可评审、**无 secret 材料**；
- **解析边界（§19）**：Runtime 只解析 executable Harness 子集（manifest、workflows、skills、被引用 schema/resources/script）。Pattern、recipe、fact、template、authority 文档保持普通文件，**不得**为每条领域知识发明 Runtime primitive；
- **变更分类（§15）**：editorial / behavioral-compatible / behavioral-breaking；breaking 变更必须影响 `definitionHash`（v0.1）或 `packageId`（v0.2 内容寻址），并触发评审与 fixture 更新。

---

## 5. 差距矩阵：文档要求的契约 vs 代码现状

| # | 文档要求（出处） | 代码现状 | 差距性质 |
|---|---|---|---|
| **G1** | Compiled Domain Data 是包的一等公民（General Design v0.1 §2.1；Projection 三类依赖之一） | **manifest 无 `domainData` 字段**；compiler 不加载任何 domain-data 目录；`CompiledDomainDataPort` 由宿主带外提供、按 packageId 键控（测试为手工 fixture）。包既不声明包含哪些 key，也不声明需要哪些 key | **契约断裂**：`domain-data` 依赖的 key 合法性无法编译期校验；packageId ↔ data 绑定靠约定 |
| **G2** | 业务数据源在包内声明 name + value schema（General Design v0.2 §15 `business-sources/`，[L2-8]） | `business` 依赖只有 `source` + `selector`，无 value schema；Runtime 不校验 Provider 返回值 | 缺声明契约 |
| **G3** | 项目绑定 / registered Tool（v0.3 PRD §6.1；PRD-CR-1） | `executionKind` 是开放字符串，但宿主端口只有 expression / script / remote；无 `project` binding、无 `ProjectToolContext`（`{effectId, idempotencyKey, sourceMessageId, target, logicalTime}` + 声明 resources 子集注入） | v0.3 新增契约 |
| **G4** | 命令结果 `applied / rejected(code)`（v0.3 PRD §6.3–6.4；PRD-CR-2） | `MessageDisposition` 无 `rejected`；[现状] 不适用消息 → failed → `recovery_required` | v0.3 新增契约 |
| **G5** | Durable Workflow Process Data（v0.3 PRD §6.2） | state 仅 `{stateId, data(不可变), lastMessage, lastResult}`，无更新机制 | v0.3 新增契约 |
| **G6** | 幂等 Provisioning + 持久 Timer（v0.3 PRD §6.5–6.6） | [现状] `openInstance` 非幂等（INSERT 冲突即失败、terminal 占址）；无定时器原语 | v0.3 新增契约 |
| **G7** | 生成类型化 App 契约：command / outcome / view / watch + AI Task I/O（v0.3 PRD §6.7；[L2-6]） | compiler 有 `module-emitter`（发包模块），无从 messageContracts / projection outputSchema 生成客户端类型的通道 | v0.3 新增契约 |
| **G8** | AI Operation = Skill + Declared Context + Capability Envelope + Authority Mode + Output Contract + Execution Policy（v0.3 PRD §7–14） | `AIOperationRequest` 只有 skill / instructions / resources / input / outputSchema / profile；**无** envelope、allowed context sources、propose-only vs produce-result-only 权威模式、Control/Domain scope 区分、committed AI result replay 契约 | v0.3 新增契约（差距最大） |
| **G9** | tools / projections 有磁盘 authoring 格式（General Design v0.2 §15 `domain/tools/`、`domain/projections/`） | 只能程序化传入 `compileDomainPackage`；raw loader 不读这两类文件 | authoring 契约缺失 |
| **G10** | `DynamicStateEnvelope`（key / phase / availableActions / pending / lastOutcome / body；General Design v0.2 §11.5） | 仅 `[约定]`，SDK outputSchema 不强制 | 项目级约定，可接受 |

---

## 6. 结论：SDK 视角下"一份合格 Domain Data"的完整契约清单

综合文档冻结语义与代码强制，项目交付的 Domain Data 契约 = 六组：

1. **身份与兼容**：`domainId / domainVersion / schemaVersion`；内容寻址 `packageId`；`formatVersion + runtimeContractMajor + executionEngineMajor`；`targetProfileId`；`requiredCapabilities`（`name@major`）。
2. **行为定义**：workflows（控制机 + 每消息类型 `payloadSchema`）；tools（`outputSchema` 必填 + effect 三值 + 封闭逻辑 binding config）；projections（JSONata expression + 三类声明依赖 + `outputSchema`）；skills（instructions + 必填 outputSchema + 冻结 resources）。
3. **数据引用**：schemas（Ajv 2020-12）；Compiled Domain Data key（**待 G1 补声明机制**）；business source 名（**待 G2 补 value schema**）。
4. **宿主绑定**：`TargetHostProfile`（capability → bindingId）+ 不可变 `bindingContents`（digest 入包）+ `RuntimeResources` 只留 `resourceKey` 引用。
5. **禁入物**（结构性排除、编译期 fail-closed）：secret / endpoint / 文件路径 / 运行时句柄；provider/model 路由；UI 语义；项目业务概念进入 SDK。
6. **治理属性**（不解析但冻结）：owner、authority level、可版本化、provenance、变更分类。

## 7. 对 v0.3 L2 / 最小验证 demo 的建议优先级

1. **G1 + G2**（Domain Data 与 business source 的包内声明）是 Domain Data 契约本身最需要先补的两块：否则 `domain-data` 依赖与快照校验都停留在"约定可用"而非"契约保证"。
2. **G3–G6** 是 v0.3 Track A 的运行时新契约；demo（PRD §26 的 D1–D4）最小闭环需要 G3（registered/local Tool）+ G4（rejected outcome）+ G5（Process Data）+ G6（幂等 ensure/open）。
3. **G8** 是 Track B 的全部增量：需要在 L2 从零设计 AI Operation 的 envelope / scope / context assembly / replay 契约形态（demo D5、D6 依赖它的最小版本）。
4. **G7 + G9** 决定"项目不手写重复 schema"能否成立，是 Compiler 侧的两个 authoring/codegen 通道。

---

## 附：证据索引

| 契约 | 代码位置 |
|---|---|
| Raw 加载 | `packages/domain-harness-compiler/src/raw/load-raw-package.ts`、`raw/types.ts`、`raw/validation.ts` |
| 编译 | `packages/domain-harness-compiler/src/compile/compile-domain-package.ts`、`compile/capabilities.ts`、`package/manifest.ts`、`package/module-emitter.ts`、`package/canonical.ts` |
| 包校验/激活 | `packages/domain-harness/src/package/validation.ts`、`activation.ts`、`registry.ts` |
| v2 冻结契约 | `packages/domain-harness/src/v2/contracts/{package,workflow,message,projection,query,subscription,effect,host,capability,runtime,store}.ts` |
| Projection / Domain Data | `packages/domain-harness/src/projection/{projection-service,compiled-domain-data,authoritative-revalidation}.ts` |
| AI / Skill | `packages/domain-harness/src/contracts/ai.ts`、`src/runtime/journaled-skill-runner.ts`、`src/execution/skill-executor.ts` |
| v0.1 loader（同构参照） | `packages/domain-harness/src/loader/{schemas,load-harness,static-validation}.ts` |
| 治理规范 | `docs/domain-data/DOMAIN_DATA_SPEC.md`、`docs/harness/HARNESS_TECHNICAL_SPEC.md` |
