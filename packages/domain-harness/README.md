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

公开的 **TypeScript 类型入口（不构成 JS 运行时导出）**：`CorePackageMetadata`、`DomainAppContext`、`LifecycleInitContext`、`PackageInitElement`、`StaticCorePackage`、`LifecycleLogRecord`、`LifecycleLogger`、`StandardWorkflowOutcome<T>`、`WorkflowLimits`、`WorkflowRoutes<T,R>`、`StandardJsonValue`、`StandardFileOutcome<T>`、`BoundedQueryLimits`、`BoundedQueryTruncationReason`、`BoundedQueryResult<T>`、`SQLiteScalar`、`SQLiteNonThenable<T>`、`SQLiteTransaction`、`SQLiteDatabaseOptions`、`SQLiteErrorCode`。根入口导出的类还可用于 TS 类型。

SDK 直接运行依赖只有 `xstate@5.33.2`、`yaml@2.9.1` 与 `@photostructure/sqlite@2.5.0`（exact pin；tarball 自带预编译二进制，npm lifecycle 全程保持被忽略）。SDK **消费者** Node >=22.12.0；本仓库的完整开发工具链因 ESLint 10.11 要求 >=22.13.0，不应将二者混为一谈。SDK 不做 Package/Element 生成期静态正确性验证，作者可按需执行 `scripts/validate-native-generation.mjs`，不强制 Forge 或任何 Package 生成器。

## 交付验证

`npm run verify` 在开发 Node >=22.13 环境中执行构建、类型检查、Lint、Standard/生成期正反例及原生 Domain App。仓外 `scripts/verify-native-sdk-clean-install.mjs` 会通过 `npm pack` 安装**唯一直接依赖 SDK** 的新项目、检查 TypeScript/ESM/私有路径，并验收 Guard、两份 JSON + 两份 YAML Reader 和子 Hook **确实共享根预算**；同一干净安装还会从 SDK 根入口跑真实 SQLite 文件（rollback、两连接 CAS、reopen、脱敏 open 错误）。Windows npm CLI 通过 `process.execPath` 调用，独立 Windows 真实验证应单独记录，不得引用 Linux CI 冒充跨平台 PASS。

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
- **每条 `run`/`get`/`select` 的 SQL 文本只编译并执行第一条语句**：`@photostructure/sqlite@2.5.0` 的 `prepare` 忽略第一个分号之后的文本（不执行、不报错），SDK 不另造 SQL parser 去识别尾部。业务不得在一条文本里书写多条语句；该语义由回归测试钉住，驱动升级若改变它会立即失败。
- 错误按 SQLite 主码分类为 `BUSY/LOCKED/READONLY/CONSTRAINT/IO/OPEN/AUTH/SQL` 等脱敏码；消息不含路径、SQL 文本、绑定值。提交失败会先回滚再抛出；回滚失败或提交状态不明时连接保守隔离（poisoned）。
- CAS 是业务自己的参数化 `UPDATE … WHERE version=?` 加 `changes` 计数；SDK 不造通用 Domain State Schema，不强制每表 version 字段。`PRAGMA` 与必须在事务外执行的维护语句（如 `VACUUM`）不在本 Element 能力内。
- 平台范围：driver tarball 内含 darwin、linux-arm64、win32-arm64 预编译文件和 musl 变体，但**真实见证只覆盖 Windows x64 与 Linux x64 glibc 2.36（均为 Node 22.12.0）**；其余 OS/arch、musl 与更旧的 glibc 未经见证，不得宣称兼容。`select` 只是 L2 连接级基础读取（受 `limit` 约束），完整 SQL/Vector/Graph Query 能力属于后续任务。
- driver `@photostructure/sqlite@2.5.0` 以 exact 版本锁入 workspace lockfile；安装脚本（`node-gyp-build`）保持被 `--ignore-scripts` 忽略，不执行源码编译或外部下载。
