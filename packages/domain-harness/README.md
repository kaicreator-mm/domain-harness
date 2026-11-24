# @kaicreator/domain-harness · Native SDK public API

单一嵌入式 TypeScript/Node SDK；Package 是原生 ESM 插件文件组合，Element 是可复用 Class，Function 是普通模块函数或 Class 方法。无旧 v0.10.x ABI、Boot/PackageSystem/FunctionRef/Target/Lock/Pin 运行时兼容层。

## 唯一公开入口

`import { KernelLifecycle, JsonReader, StandardWorkflowSession } from '@kaicreator/domain-harness'`

`package.json#exports` **只有 `.` 包根**，没有 `./runtime`、`./composition` 或其它内部子路径。

| 运行时 Value 导出（20 个：0.11.1 原 12 个 + 0.11.2 T01–T04 及 S04 CLI、双角色组合，独立测试预期枚举） | 职责 |
| --- | --- |
| `KernelLifecycle` | 最小 KDP，静态 Core 初始化、资源进入记录和最终逆序 Exit |
| `WorkflowElement`、`XStateWorkflowElement` | Standard 业务工作流抽象和 XState Actor Logic 适配 |
| `NativeWorkflowContext`、`StandardWorkflowSession` | 原生业务 Callback/Guard/Reader/Hook 的共享根预算 |
| `routeWorkflowOutcome` | COMPLETE、REJECT、ASK、WAIT、UNKNOWN、FAILED 的完整具名分支 |
| `runRecognitionHandling` | #1724 S04：固定双叶子角色共享根预算，识别成功后才处理；可选便捷组合 |
| `JsonReader`、`YamlReader` | 可复用 JSON/YAML Class Element |
| `readJson`、`readYaml`、`writeJson`、`writeYaml` | 不强制包装成 Class 的原生 Module Functions |
| `BoundedQueryElement` | v0.11.2 T01：有界、同步、类型化只读数据查询；返回 visited/complete/truncated 和原因，领域 predicate 由业务实现 |
| `SQLiteDatabaseElement`、`SQLiteDatabaseError` | v0.11.2 T02：显式连接生命周期的同步 SQLite Store；真实事务/CAS 与脱敏错误分类 |
| `VectorQueryElement`、`GraphQueryElement` | v0.11.2 T03：显式 Scope 的有限 Top-K、单边类型图有界路径；完整性可观察 |
| `BoundedExpressionElement` | v0.11.2 T04：纯 JSON AST 的有界同步标量计算 |
| `CliElement` | #1724 S04：可信前台进程调用、合计输出限制、超时、脱敏错误与平台限定清理 |

### 公开 TypeScript 类型（33 个独立 type/interface，按职责索引）

| 模块职责 | 类型入口（从同一包根 `import type`） |
| --- | --- |
| 生命周期 | `CorePackageMetadata`、`DomainAppContext`、`LifecycleInitContext`、`PackageInitElement`、`StaticCorePackage`、`LifecycleLogRecord`、`LifecycleLogger` |
| Workflow | `StandardWorkflowOutcome`、`WorkflowLimits`、`WorkflowRoutes` |
| JSON/YAML | `StandardJsonValue`、`StandardFileOutcome` |
| Bounded Query | `BoundedQueryLimits`、`BoundedQueryTruncationReason`、`BoundedQueryResult` |
| SQLite | `SQLiteScalar`、`SQLiteNonThenable`、`SQLiteTransaction`、`SQLiteDatabaseOptions`、`SQLiteErrorCode`、`SQLiteFailureOrigin`、`SQLiteTerminalFailureDetails` |
| Vector | `VectorCandidate`、`VectorQueryOptions`、`VectorMatch`、`VectorQueryResult` |
| Graph | `TypedGraphEdge`、`GraphQueryLimits`、`GraphQueryOptions`、`GraphPath`、`GraphQueryResult` |
| Expression | `ExpressionScalar`、`ExpressionLimits` |

以上类型不构成 JS 运行时导出；根入口导出的 Class 亦可作类型。实际泛型参数、方法和选项以安装的 `dist/index.d.ts` 及其关联声明/TSDoc 为准，不依赖内部模块路径。

SDK 直接运行依赖只有 `xstate@5.33.2`、`yaml@2.9.1` 与 `@photostructure/sqlite@2.5.0`（exact pin；tarball 自带预编译二进制，npm lifecycle 全程保持被忽略）。SDK **消费者** Node >=22.12.0；本仓库的完整开发工具链因 ESLint 10.11 要求 >=22.13.0，不应将二者混为一谈。SDK 不做 Package/Element 生成期静态正确性验证，作者可按需执行 `scripts/validate-native-generation.mjs`，不强制 Forge 或任何 Package 生成器。

## 人与 Agent 的消费入口

安装的是单一 SDK；先检查实际 `node_modules/@kaicreator/domain-harness/package.json`、本 README 和公开 `dist/index.d.ts`。使用根入口，不需要 Forge、额外生成器、特殊 DSL 或第二个 Runtime。

本 README 的配套规范快照：`3161e47ccb5c39843b1bb3593f8b54566a3d4440`（0.11.2 已交付 SDK + R9 冻结原则 + S04 CLI 已接受源码及双角色组合候选；该快照是导航依据，不是当前 tarball 的源码运行证书）。以下为不可变 Git 提交链接，而非浮动分支：

1. [权威规范目录](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/docs/specs/domain-harness/README.md) → [核心原则 CORE-01..14](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/docs/specs/domain-harness/core.md) → [TypeScript Profile](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/docs/specs/domain-harness/typescript-profile.md)。
2. [Agent Skill](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/.agents/skills/domain-harness-spec/SKILL.md) 与 [需求驱动应用资格实践](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/.agents/skills/domain-harness-spec/references/application-qualification.md)；按需读 [Element/Package](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/docs/specs/domain-harness/element-package.md)、[Lifecycle/Workflow](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/docs/specs/domain-harness/lifecycle-workflow.md)、[QA](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/docs/specs/domain-harness/engineering-quality.md)。
3. [真实原生应用](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/examples/native-domain-app/main.mjs)、[0.11.2 领域应用（R69/R71 历史，R72/R73 最终裁决及 S04 迁移说明）](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/examples/qualification/README.md)、[状态与验收证据](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/docs/specs/domain-harness/status-and-decisions.md)。

仓库可能需要授权访问。离线时本 README 与安装的声明仍可用于已公开 API 的基本消费；完整规范和 Skill 不在当前包内，不能把摘要当完整规范或假定已读。需要规范生成/审核时取得匹配快照（可使用已授权 Git checkout）；不要切换到未知的新分支来猜测 API。后续 SDK 改变规范或公开合同，应同步更新此固定快照与 API 文档，保留证据归属。

开发顺序：先分析领域需求、知识、约束、异常与验收；查现有 Standard，直接复用已有实现；用原生 TS 函数/Class/静态模块实现领域专有部分；验证类型、业务正反例与资源所有权。缺少共同能力时记录实际用途、重复职责和缺口，不虚构接口或把通用实现反复生成。正确性仍由生成者在生成阶段负责，KDP 只提供生命周期与最后兜底。

### 最短使用路径

以下为原生 TypeScript ESM 示例（`.mts` 或 `type: module` 工程，使用正常 TypeScript 工具编译；不是新的 DSL）：

```ts
import { BoundedQueryElement, StandardWorkflowSession } from '@kaicreator/domain-harness';

const query = new BoundedQueryElement();
const session = new StandardWorkflowSession({ maxCalls: 1, maxSteps: 2, maxDepth: 0 });
const outcome = await session.run(root => root.invoke(() =>
  query.select([{ id: 'A', available: true }], item => item.available,
    { maxVisited: 2, maxReturned: 2 }),
));
if (outcome.status === 'COMPLETE' && outcome.value.complete) {
  console.log(outcome.value);
}
// COMPLETE 只是 Workflow 调用成功；查询完整性仍按业务判断。
```

- 不需要完整 App 生命周期时可直接使用 Standard；有 Core/Init/Exit 的应用使用 `KernelLifecycle`，静态导入实际 Core，唯一 Order=0 KDP，生成期保证结构。一次业务用 `run`；长期 App 用 `start`、多个 `execute`，外层最终 `[Symbol.asyncDispose]()`。关闭需等待已进入业务收敛；业务体不可等待依赖自身结束的关闭操作。
- 普通值用 `root.invoke`；已经返回 `StandardWorkflowOutcome` 的业务函数用 `invokeOutcome` 或 `leaf`，保留 REJECT/ASK/WAIT/UNKNOWN/FAILED。子 Workflow 用 `child` 共享根预算；固定业务阶段全量前置条件由业务负责。每个独立根创建自己的 Session，`run` 单次；ASK/WAIT 本身不提供恢复，不将 .3/.6 尚未交付能力当作现有 API。
- JSON/YAML Reader 处理文本与数据；文件 I/O、路径及业务权限由调用方负责。查询结果不完整不能当作不存在；数据库显式管理连接、事务与资源；领域知识、规则、授权与真实 Effect 由应用/资源所有者负责，不调用不存在的统一 Intent 或 Tool Runtime。

## 交付验证

`npm run verify` 在开发 Node >=22.13 环境中执行构建、类型检查、Lint、Standard/生成期正反例及原生 Domain App。仓外 `scripts/verify-native-sdk-clean-install.mjs` 会通过 `npm pack` 安装**唯一直接依赖 SDK** 的新项目、检查 TypeScript/ESM/私有路径，并验收 Guard、两份 JSON + 两份 YAML Reader 和子 Hook **确实共享根预算**；同一干净安装还会从 SDK 根入口跑真实 SQLite 文件（rollback、两连接 CAS、reopen、脱敏 open 错误）。终态事务故障与 `IO`/`LOCKED` 分类由独立测试进程在真实 SQLite 上做受控故障注入验证（`CONTROLLED_FAULT_INJECTION`），不代表真实磁盘损坏或进程失联的见证；故障注入只存在于测试专用的临时 instrumented 副本中，正式 SDK 包（根入口与模块文件）不含任何事务控制替换入口。Windows npm CLI 通过 `process.execPath` 调用，独立 Windows 真实验证应单独记录，不得引用 Linux CI 冒充跨平台 PASS。

## v0.11.2 T01：通用 Bounded Query

```ts
import { BoundedQueryElement } from '@kaicreator/domain-harness';
const result = new BoundedQueryElement().select(
  [{id:'A',available:2},{id:'B',available:0}],
  item => item.available > 0,
  {maxVisited:2,maxReturned:1},
);
// result.complete=false: 第一条即满足结果上限，不能据此认定余项已判断。
```

T01 使用现有公开 SDK 根入口，不依赖动态 Knowledge Store，也不要求所有 Business Function 返回统一领域 Outcome。一次 Query 的 `complete=false` 时，实际业务必须根据需要拒绝或输出 UNKNOWN，不能把部分结果当完整事实。T01–T07 已在 0.11.2 R65 限定接受；证据只绑定受审工件/平台，不表示新 SHA 自动通过。

## v0.11.2 T02：SQLite Database Element（同步连接、显式事务与 CAS）

```ts
import { SQLiteDatabaseElement } from '@kaicreator/domain-harness';
const db = new SQLiteDatabaseElement('./data/store.sqlite', { busyTimeoutMs: 3000 });
const applied = db.transaction(tx => {
  // 只允许可信业务固定 SQL + 参数绑定；SQLite authorizer 拒绝写边界外的副作用。
  const row = tx.get<{ version: number }>('SELECT version FROM resource WHERE id=?', [42]);
  return row ? tx.run('UPDATE resource SET version=version+1 WHERE id=? AND version=?', [42, row.version]).changes : 0;
});
db.select('SELECT id FROM resource ORDER BY id', [], 100); // 超过 limit 拒绝，不冒称完整
db.close(); // 业务显式 close；关闭后所有操作按 CLOSED 拒绝
```

- 连接由业务实例显式拥有：构造即打开真实文件（import 不建库、无配置文件、无全局路径），`close()` 显式释放；关闭/失活连接一律拒绝。本版未提供 `Symbol.dispose`，使用显式 `close()`。
- `transaction()` 是同步事务：`BEGIN IMMEDIATE` → 同步回调 → `COMMIT`；异步回调/`Promise`/thenable 结果在 COMMIT 前拒绝并回滚，不撤销已发生的任意业务副作用。事务对象回调结束后立即失活，重用与重入一律拒绝；事务控制 SQL（`BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`/`ATTACH`/`PRAGMA`）由 SQLite authorizer 实际拒绝，不以 `SELECT` 前缀字符串判断隔离；一条 Statement 处理中再次进入 `run`/`get` 不得改变 authorizer 模式。
- **单语句 SQL 限制合同**：每条 `run`/`get`/`select` 只接受一条 SQL 语句 —— 非空字符串，且文本中**不得出现分号 `;` 或 NUL**，无论它位于末尾、注释、引号字面量/标识符还是触发器体内；否则在 `prepare` 之前以 `INVALID_INPUT (statement)` 同步拒绝，不会只执行第一条就返回成功。这是可信 SQL 的限制合同，不是通用 SQL 解析：本版因此不支持带分号的 `CREATE TRIGGER` 定义与尾随分号；需要分号的数据请用绑定参数传递（`'a;b'` 合法）。绑定字符串含 NUL 时同样拒绝（driver 会在 NUL 处静默截断该值），BLOB 不受影响。
- 错误按 SQLite 主码分类为 `BUSY/LOCKED/READONLY/CONSTRAINT/IO/OPEN/AUTH/SQL` 等脱敏码；消息不含路径、SQL 文本、绑定值。可回滚的失败先回滚，再把原始业务错误原样抛给调用方。回滚失败（`ROLLBACK_FAILED`）或提交结果不明（`COMMIT_UNKNOWN`）是终态故障：抛出带 `primaryCode`（SDK 归类码或 `BUSINESS`）与 `rollbackCode` 的 `SQLiteDatabaseError`，`cause` 只含脱敏描述，不保留业务或驱动的原始错误对象；连接随即隔离（只允许 `close()`），SDK 不会自动重试，提交结果不明时由业务重新读取后自行决定。
- CAS 是业务自己的参数化 `UPDATE … WHERE version=?` 加 `changes` 计数；SDK 不造通用 Domain State Schema，不强制每表 version 字段。`PRAGMA` 与必须在事务外执行的维护语句（如 `VACUUM`）不在本 Element 能力内。
- 平台范围：driver tarball 内含 darwin、linux-arm64、win32-arm64 预编译文件和 musl 变体，但**真实见证只覆盖 Windows x64 与 Linux x64 glibc 2.36（均为 Node 22.12.0）**；其余 OS/arch、musl 与更旧的 glibc 未经见证，不得宣称兼容。`select` 提供受 `limit` 约束的 SQL 读取；T03 复用该方法并提供独立 Vector/Graph 查询，不是通用 ORM、向量或图数据库。
- driver `@photostructure/sqlite@2.5.0` 以 exact 版本锁入 workspace lockfile；安装脚本（`node-gyp-build`）保持被 `--ignore-scripts` 忽略，不执行源码编译或外部下载。

## v0.11.2 T03：Vector / Graph 有界查询

`VectorQueryElement.search(candidates, query, inScope, {topK,maxVisited,dimension,metric})` 先调用可信业务 Scope，再计算 COSINE 距离（1−cos）或 L2；按距离、id、原始位置稳定排序，只保留 Top-K 候选。每次访问都计入 `visited`；预算不足时 `complete=false`、`truncationReason='VISIT_LIMIT'`，不能把未找到当成事实。空源可为完整；非空源 `topK=0` 明确非完整。

调用方须保持源集合成员及顺序、已接纳 item 的业务属性稳定；SDK 不深拷贝业务对象，也不保证检测等长替换。查询向量在入口按分量快照；每个访问候选只读取一次 item，Scope 接纳后才读取一次 id 和向量及其各分量，返回同一接纳 item 引用。观察到源长度变化即抛出 `DH_STD_QUERY_VECTOR_SOURCE_CHANGED`，不返回 COMPLETE；不预扫未访问候选。COSINE 按最大绝对分量缩放后归一化，支持非零有限次正规及大数向量，零向量拒绝；L2 仅在实际距离不可表示时拒绝溢出。距离仍是有限精度浮点数，不承诺任意精度。

`GraphQueryElement.search(edges, {start,target?,direction,relationTypes?,limits})` 使用 BFS 和 cycle visited 集合。图遍历预算 `maxVisited` 指实际检查的原始边次数（同一条边在不同扩展重复检查仍计费）；`maxDepth` 限路径 hops，`maxReturned` 限返回路径。若指定 target，则第一条找到的最短路径能完成“存在”查询；无路径但 `complete=false` 不等同不存在。**不**自动推导业务权限或事实，不创建向量/图数据库。对外可信 TypeScript 业务数据并非恶意 Proxy 沙箱。

T03 SQL 部分**复用**已通过 T02 的 `SQLiteDatabaseElement.select(fixedSql, parameters, limit)` 与 SQLite authorizer，不另做 SQL parser/ORM。SQL + Vector/Graph 的 R65 组合 SDK 验收见下方证据；不把独立算法测试或历史证据当新 SHA 的集成资格。

## v0.11.2 T04：有界 Expression

`new BoundedExpressionElement().evaluate(astJson, inputJson, limits?)` 接收两个原始 JSON 字符串；生成期可信 AST 同样以 JSON 文本消费。不得先对不可信 JS 对象调用 JSON.stringify。非字符串拒绝，不读取 getter、Proxy、Promise 或对象图；limits 只接受普通/空原型对象的已知自有数据属性（未指定使用默认值，不读取未知属性）。SDK 不承诺隔离已经能在同一进程任意执行 JS 的调用方。

AST 原始文本固定上限 32 KiB；输入文本在 JSON.parse 前按 maxInputBytes 检查 UTF-8 字节。采用标准 JSON.parse 语义（重复键以后项为准），不提供自定义 JSON parser。整棵 AST 验证节点数、深度、形状及 arity，包括短路分支。内置最大值：128 节点、深度16（根=1）、输入32768字节、256运算、路径8段、字符串4096 UTF-8字节。调用方可降低限制，不能升高。每个求值节点及每个实际读取的路径段先扣一次运算额度；输入验证独立受原始字节限制，迭代检查。get 只访问非数组 JSON 对象的自有属性；路径非空，拒绝 __proto__/prototype/constructor，输入对象也拒绝这些键。缺失或非标量字段拒绝，不猜测；and/or 短路但不放过非法 AST。支持 literal/get/not、and/or、eq/ne、lt/le/gt/ge、add/sub/mul/div；不做数组遍历运算、字符串拼接、I/O、函数调用或业务权限判断。

返回 ExpressionScalar（string/number/boolean/null）；ExpressionLimits 是可选限制的类型合同。严格同类型 eq/ne，布尔和数字无隐式转换，除零、非有限数字、负零、超安全整数范围拒绝；小数按 JS IEEE-754 有限精度计算，不承诺十进制精确运算或检测所有舍入/下溢。TypeError.message 固定为 EXPRESSION_INVALID/LIMIT/INPUT/EVALUATION（完整前缀 EXPRESSION_），不包含原始输入或异常 cause。同步有限计算不承诺任意 JS 的抢占式墙钟硬终止；不是 Rule VM，也不验证 Package/Element 生成正确性。

```ts
import { BoundedExpressionElement } from '@kaicreator/domain-harness';
const expr = new BoundedExpressionElement();
const available = expr.evaluate(
  '{"op":"sub","args":[{"op":"get","path":["stock"]},{"op":"get","path":["reserved"]}]}',
  '{"stock":12,"reserved":3}',
);
// available = 9
```

## v0.11.2 T07：生成新 Business Package 与最低消费者 Node

生成者先读仓库真实 `.agents/skills/domain-harness-spec/SKILL.md` 及其规范目录，再以本公开 API README、根入口导出的声明/TSDoc 和实际领域资料编写普通 TS ESM 模块；SDK 不承担 Package 生成或正确性验证。两个新领域的源码、资料到规则映射和组合验收见 `examples/native-domain-app/combined/`。开发 Node >=22.13 不改变 SDK 消费者 Node >=22.12.0。真实仓外消费脚本支持独立消费者 Node/npm 可执行路径，记录实际运行时版本和 tarball SHA256；须有对应工件的真实 Windows/Linux witness 才能宣告双平台最低版本通过。

### 已接受工件与当前边界

[0.11.2 R65](https://github.com/kaicreator-mm/domain-harness/issues/1612#issuecomment-7141533062) / [R64](https://github.com/kaicreator-mm/domain-harness/issues/1718#issuecomment-7141467905)：受审 `566cd3129a6ef51bfc40e7d4a018530cabd965a8`，Woodpecker #3184 SUCCESS，127 core / 16 generation / 8 regression PASS、DI-L1 12/12。[R63](https://github.com/kaicreator-mm/domain-harness/issues/1718#issuecomment-7140817171) 同一旧 SDK tarball SHA256 `a3cd22d2a514fb2f6321218b1dba27b9bd5b17b6fac7bbe2daf00b02cc25a5ff`，Node22.12.0 Windows x64 / Linux x64 glibc2.36 实际消费者通过。此 README 修改会改变新打包工件字节，不把旧哈希、CI 或平台证据冒充新打包结果。[R73](https://github.com/kaicreator-mm/domain-harness/issues/1720#issuecomment-7143329514) 两领域资格仅 Linux 留存依赖范围，fresh lock/install UNKNOWN、该资格 Windows NOT_RUN。

[0.11.3 R9](https://github.com/kaicreator-mm/domain-harness/issues/1613#issuecomment-7145891451) 是冻结产品合同，不是已实现 Interaction API；[SDK 专项 #1724](https://github.com/kaicreator-mm/domain-harness/issues/1724) 期间以实际安装的声明和经审验源码为准。无 .5 LLM/.6 durable 能力声明，不恢复旧 ABI，不表示 npm 正式发布。

## S04 · 可信前台 CLI Standard（#1724 R9 源码提取已接受）

`import { CliElement } from '@kaicreator/domain-harness'`。直接复用实例的 `run(file, args): Promise<string>`，默认 `new CliElement(10_000, 65_536)`（超时毫秒、stdout/stderr 合计字节）。二者须为 1..2147483647 的安全整数，否则构造抛出 `CLI_INVALID_LIMIT`。独立并发调用的计时、输出、进程归属独立；无 shell、stdin 忽略，成功返回 UTF-8 stdout（不返回 stderr）。调用方明确选择可信程序和参数、安装专业工具及验证结果；继承调用进程环境、工作目录和权限，非沙箱、授权器、通用进程树管理器或领域工具注册中心。

失败 Promise 拒绝，消息为脱敏 `CLI_SPAWN`、`CLI_STREAM`、`CLI_TIMEOUT`、`CLI_OUTPUT_LIMIT`、`CLI_EXIT_<code>`（信号为 `CLI_EXIT_SIGNAL`）、`CLI_CLEANUP_FAILED` 或 `CLI_REAP_TIMEOUT`；不把原始参数、路径、stderr 或驱动异常写入错误。成功 stdout 可能含业务数据，由业务负责使用。输出限制针对累计流字节，不是整个进程内存限制；超时为事件循环上的协作计时，不承诺抢占或硬墙钟。Linux 清理当前命令进程组，包括 leader 正常退出/失败/信号退出；其他平台仅负责直接子进程，不承诺逃离进程组的后代或任意子树，也不承诺后代已全部回收。调用方仍负责业务授权、预算、文件和副作用，按领域语义通过 `invokeOutcome` 映射错误，不用 exit0 代替专业验证。

媒体归档的 FFmpeg/ffprobe、维修排程的 Python/SciPy 已改为使用该根导出，删除旧 shared CLI 实现，领域专业知识/计算与独立 npm 依赖不变。新工件的完整消费、平台范围及实际领域验收以 #1724 后续证据为准；不能使用历史 R63 工件证明新导出。

## S04 · 固定双角色组合（#1724 候选）

当真实业务正好是一次识别和一次处理，且两者各为固定叶子回调时，直接使用根入口的 `runRecognitionHandling(limits, recognize, handle)`；原生 TS 泛型从识别结果与处理结果推导各自领域类型，不要求统一 Intent Schema 或额外 Class。

```ts
import { runRecognitionHandling } from '@kaicreator/domain-harness';
// recognize / handle 是应用提供的领域函数，可同步或异步，返回 StandardWorkflowOutcome。
const outcome = await runRecognitionHandling(
  { maxCalls: 2, maxSteps: 5, maxDepth: 1 },
  () => recognize(request),
  intent => handle(intent),
);
```

以上为调用形状，`request`、`recognize`、`handle` 由应用定义。每次调用内部只创建一个 `StandardWorkflowSession`；两个静态 child(0) 各调用一次 `invokeOutcome`。完整路径 2 calls / 5 steps / 1 depth；识别任何非 COMPLETE 终态原样返回，不调用处理；处理终态亦不二次包装。额度按既有逐次预留，识别可能在处理额度不足时已经执行，**不是全业务预算预检**，因此需要全阶段先验额度的业务仍自行检查。异常保留既有脱敏 FAILED 语义；真实授权、命令身份、receipt/readback、UNKNOWN、领域证据仍由应用负责。ASK/WAIT 不自动恢复；复杂分支、并行、额外 child、Hook、多轮 Interaction 直接复用 Session/Context 等现有机制，不强制使用此函数。

[五个实际迁移模块及既有业务验收范围](https://github.com/kaicreator-mm/domain-harness/blob/3161e47ccb5c39843b1bb3593f8b54566a3d4440/examples/native-domain-app/README.md)：维修报价、AQI、图书目录、水硬度和库存 Reservation。无需重复生成固定双角色执行组合；保留真实领域类型、知识、规则、权威 Host 和持久账本。新工件完整验收仍由 #1724 记录，不扩张 R65 历史证据。
