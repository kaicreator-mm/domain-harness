# @kaicreator/domain-harness · Native SDK public API

单一嵌入式 TypeScript/Node SDK；Package 是原生 ESM 插件文件组合，Element 是可复用 Class，Function 是普通模块函数或 Class 方法。无旧 v0.10.x ABI、Boot/PackageSystem/FunctionRef/Target/Lock/Pin 运行时兼容层。

## 唯一公开入口

`import { KernelLifecycle, JsonReader, StandardWorkflowSession } from '@kaicreator/domain-harness'`

`package.json#exports` **只有 `.` 包根**，没有 `./runtime`、`./composition` 或其它内部子路径。

| 运行时 Value 导出（0.11.1 原 12 个 + 0.11.2 T01/T02 新增，独立测试枚举） | 职责 |
| --- | --- |
| `KernelLifecycle` | 最小 KDP，静态 Core 初始化、资源进入记录和最终逆序 Exit |
| `WorkflowElement`、`XStateWorkflowElement` | Standard 业务工作流抽象和 XState Actor Logic 适配 |
| `NativeWorkflowContext`、`StandardWorkflowSession` | 原生业务 Callback/Guard/Reader/Hook 的共享根预算 |
| `routeWorkflowOutcome` | COMPLETE、REJECT、ASK、WAIT、UNKNOWN、FAILED 的完整具名分支 |
| `JsonReader`、`YamlReader` | 可复用 JSON/YAML Class Element |
| `readJson`、`readYaml`、`writeJson`、`writeYaml` | 不强制包装成 Class 的原生 Module Functions |
| `BoundedQueryElement` | v0.11.2 T01：有界、同步、类型化只读数据查询；返回 visited/complete/truncated 和原因，领域 predicate 由业务实现 |
| `SQLiteDatabaseElement`、`SQLiteDatabaseError` | v0.11.2 T02：显式连接生命周期的同步 SQLite Store；真实事务/CAS 与脱敏错误分类 |
| `VectorQueryElement`、`GraphQueryElement` | v0.11.2 T03：显式 Scope 的有限 Top-K、单边类型图有界路径；完整性可观察 |

公开的 **TypeScript 类型入口（不构成 JS 运行时导出）**：`CorePackageMetadata`、`DomainAppContext`、`LifecycleInitContext`、`PackageInitElement`、`StaticCorePackage`、`LifecycleLogRecord`、`LifecycleLogger`、`StandardWorkflowOutcome<T>`、`WorkflowLimits`、`WorkflowRoutes<T,R>`、`StandardJsonValue`、`StandardFileOutcome<T>`、`BoundedQueryLimits`、`BoundedQueryTruncationReason`、`BoundedQueryResult<T>`、`SQLiteScalar`、`SQLiteNonThenable<T>`、`SQLiteTransaction`、`SQLiteDatabaseOptions`、`SQLiteErrorCode`、`SQLiteFailureOrigin`、`SQLiteTerminalFailureDetails`。根入口导出的类还可用于 TS 类型。

SDK 直接运行依赖只有 `xstate@5.33.2`、`yaml@2.9.1` 与 `@photostructure/sqlite@2.5.0`（exact pin；tarball 自带预编译二进制，npm lifecycle 全程保持被忽略）。SDK **消费者** Node >=22.12.0；本仓库的完整开发工具链因 ESLint 10.11 要求 >=22.13.0，不应将二者混为一谈。SDK 不做 Package/Element 生成期静态正确性验证，作者可按需执行 `scripts/validate-native-generation.mjs`，不强制 Forge 或任何 Package 生成器。

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

T01 使用现有公开 SDK 根入口，不依赖动态 Knowledge Store，也不要求所有 Business Function 返回统一领域 Outcome。一次 Query 的 `complete=false` 时，实际业务必须根据需要拒绝或输出 UNKNOWN，不能把部分结果当完整事实。此处仅为 T01 源码增量，正式 Node 22 clean SDK-only 与 Woodpecker 验收仍取决于当前 Exact HEAD 的真实执行记录。

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
- 平台范围：driver tarball 内含 darwin、linux-arm64、win32-arm64 预编译文件和 musl 变体，但**真实见证只覆盖 Windows x64 与 Linux x64 glibc 2.36（均为 Node 22.12.0）**；其余 OS/arch、musl 与更旧的 glibc 未经见证，不得宣称兼容。`select` 只是 L2 连接级基础读取（受 `limit` 约束），完整 SQL/Vector/Graph Query 能力属于后续任务。
- driver `@photostructure/sqlite@2.5.0` 以 exact 版本锁入 workspace lockfile；安装脚本（`node-gyp-build`）保持被 `--ignore-scripts` 忽略，不执行源码编译或外部下载。

## v0.11.2 T03：Vector / Graph 有界查询（实现中的模块）

`VectorQueryElement.search(candidates, query, inScope, {topK,maxVisited,dimension,metric})` 先调用可信业务 Scope，再计算 COSINE 距离（1−cos）或 L2；按距离、id、原始位置稳定排序，只保留 Top-K 候选。每次访问都计入 `visited`；预算不足时 `complete=false`、`truncationReason='VISIT_LIMIT'`，不能把未找到当成事实。空源可为完整；非空源 `topK=0` 明确非完整。

`GraphQueryElement.search(edges, {start,target?,direction,relationTypes?,limits})` 使用 BFS 和 cycle visited 集合。图遍历预算 `maxVisited` 指实际检查的原始边次数（同一条边在不同扩展重复检查仍计费）；`maxDepth` 限路径 hops，`maxReturned` 限返回路径。若指定 target，则第一条找到的最短路径能完成“存在”查询；无路径但 `complete=false` 不等同不存在。**不**自动推导业务权限或事实，不创建向量/图数据库。对外可信 TypeScript 业务数据并非恶意 Proxy 沙箱。

T03 SQL 部分**复用**已通过 T02 的 `SQLiteDatabaseElement.select(fixedSql, parameters, limit)` 与 SQLite authorizer，不另做 SQL parser/ORM。SQL + Vector/Graph 整体 SDK packed consumer/CI 仍须以 T03 新 Exact SHA 验收，不把独立纯算法测试当正式 SQL 集成。
