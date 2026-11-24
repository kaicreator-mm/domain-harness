# DomainHarness v0.11.2 · R28 corrective revision of R26 Native Domain Intelligence + Authorized Action L2 (Candidate)

```ini
OUTPUT_LABEL=DH_V0112_R26_FROZEN_L1_NATIVE_DOMAIN_INTELLIGENCE_L2_DESIGN
REPO=kaicreator-mm/domain-harness
MASTER_ISSUE=#1563
VERSION_ISSUE=#1612
L2_ISSUE=#1703
FROZEN_L1_PR=#1702
FROZEN_L1_TRAIN_MERGE=72b38dff418d43ba35d8c89ef7edd59152460031
PRODUCT_L1=FROZEN_SCOPE
R27_REVIEW=REWORK_P0_0_P1_2_P2_2
R27_REVIEW_HEAD=45cbdddcc3761aee2985b3da8991e1d69ffaee1f
R28_CORRECTION=DESIGN_REWORK_WITH_SQLITE_2_OF_2_PLATFORM_WITNESS_PENDING_R29_SCOPED_REVIEW
PROVIDER_PREFLIGHT=REPORTED_PASS_WIN32_X64_LINUX_X64_GLIBC_2_36_NODE2212
PROVIDER_WITNESS_ISSUE=#1705
R29_INDEPENDENT_REVIEW=PENDING
DESIGN_L2=CANDIDATE_NOT_INDEPENDENTLY_REVIEWED
SDK_SOURCE=NOT_CHANGED
TESTS_CI=NOT_RUN_DOC_ONLY
IMPLEMENTATION=ON_HOLD_PENDING_L2_REVIEW
```

> **范畴：只设计，不编写 SDK 功能代码。** 唯一需求依据：[R25 Scope Freeze](../product/DomainHarness_v0.11.2_R25_PRODUCT_L1_SCOPE_FREEZE.md) + [R21 DI-L1-01–12](../product/DomainHarness_v0.11.2_R21_CONSOLIDATED_PRODUCT_L1_AFTER_R20_REWORK.md)。当前真实基线 API：`index.ts` 导出 `WorkflowElement<Input,Output>` / `StandardWorkflowOutcome` / `StandardWorkflowSession` / `NativeWorkflowContext.invoke/invokeOutcome/child/leaf`、标准 JSON/YAML Reader、生命周期 KDP。下述新类/接口是**L2 候选**，不可当作现有 SDK 或已运行通过的 TypeScript API。

> **R28 补正（R27 REWORK, P1=2/P2=2）**：优先以本文件修正后的 §3、§4、§6 作为 L2 设计合同。SQLite 驱动的**唯一当前优先候选**是 `@photostructure/sqlite@2.5.0`，严格 `npm ci --ignore-scripts`，须以 Node22.12 Windows/Linux 真实 witness 判断能否纳入。Expression 正式选择**SDK 自带的无依赖、有限语法、只读 JSON AST 计算**（不采用 JSONata 作为默认引擎，不承诺 arbitrary-code wall-clock 硬停止）。同步事务的 Promise 拒绝和 Query 完整性边界已明确。**Issue #1705 现已有 Windows/Linux x64 双平台 Node22.12.0 的实际 PASS 回执，已满足限定平台的 Provider preflight 证据门；仍须 R29 非 Writer 独立审核判断 R27 P1-01 是否正式 CLOSED。不得把 preflight 当成 SDK npm pack/实施/CI PASS，也不能在 R29 前开展 SDK 源码实施**。

## 1. 物理模块和不新增的东西

**单 Git monorepo、单公开 SDK `@kaicreator/domain-harness`**，新通用能力可以从同一包根导出而不强制每个功能单独 npm 包：

| SDK Standard 新增能力 | 最小真实职责 | 显式不得承担 |
|---|---|---|
| `BoundedQueryElement` | 对调用方提供的类型化只读数据有界筛选、稳定结果、已扫描数/终止原因，支持直接 Function 与 Workflow | 不拥有特定领域 Fact/Rule/Source Schema、动态 Knowledge Registry、LLM 检索服务 |
| `SQLiteDatabaseElement` | 选定本地 DB 连接/事务/CAS、受控生命周期和资源错误，允许写**实际动态业务状态** | 不是静态 DataKnowledge 的运行时更新器或 KDP 独占 DB |
| `SQLiteQueryElement` / ordinary SQL helpers | 静态可信参数化 SQL 模板的读取、结果上限和真实错误；单一 SQLite provider 可共享连接 | 任意输入字符串执行 SQL、通用 ORM、独立 SQL parser |
| `VectorQueryElement` | 对显式已选向量集合有界 scoped Top-K 与距离度量 | 生成 embedding、第二 Vector DB、相似度当确定性领域事实 |
| `GraphQueryElement` | 对显式已选有向类型关系图做邻居及有界多跳/path 搜索 | RDF/OWL 推理、分布式图库、自动加载任意远端 URL |
| `ExpressionElement` | 对选定受限表达式及 JSON-compatible 输入计算，有界执行且故障可诊断 | 默认允许任意代码执行、自动把全部业务 TS Rule 转换成 DSL |

**不新增** `KnowledgeRuntime`、`FunctionRef`、`OperationRegistry`、`DynamicRuleEngine`、`DomainResult`、新 Workflow Runtime 或 `KDP.permit`。真正数据知识是生成期进入 Business Package 的 TS immutable data；函数知识是直接可运行的原生 Function/Element 方法；State 是各 Business Element/真实 Provider 的责任。以上 Element 名称可在 L2 审核后按真正复用价值合并为少数 Class + 普通 Function，不以类的数量计交付。

## 2. 生成的 Business Element / 两个 Workflow 角色

业务源码示意（概念 API，并非 SDK 已实现）：

```ts
const knowledge = deepImmutablePlainData({
  types: ['eligible', 'ineligible'],
  threshold: 70,
} as const); // 生成期 helper 或作者常量，不能动态加载并热修改

class EligibilityElement {
  private assessed = 0; // 仅属于本实例；业务决定生命周期
  assess(input: { score: number }) {
    this.assessed++;
    return { allowed: input.score >= knowledge.threshold };
  }
}
// 不需要 OperationDescriptor / OperationId / 强制通用 DomainResult
```

- `deepImmutablePlainData` 只是示意生成期或通用只读辅助方法；实现需限定 plain object/array/primitive、禁止可变 Map/Date/Set、循环及 getter 副作用，或对其采用专门复制/只读视图。只有 `as const` 与最外层 Object.freeze 不足以保护嵌套引用。
- **两个 Workflow 角色是业务生成方式**，不是两个 SDK 派生根类。`StandardWorkflowSession` 只为同一连续业务请求创建**一个 Root**；在 `run(async root => ...)` 内调用 Recognizer/Validator，再根据类型明确的结果显式选择已静态导入的 Handler。子 Workflow 使用 `root.child(...)` 共享 calls/steps/depth，不新建另一满额 Session。单独发起的新请求另建 Session。
- SDK 自身不强制任何 `ValidatedIntent/DomainDecision/Result/Evidence` 业务结构，具体 Business 接口由生成期 TypeScript 类型与测试决定。所有六态仍保留：普通值经 `invoke`，已返回 WorkflowOutcome 的 Function 经 `invokeOutcome/leaf`，**UNKNOWN/REJECT/ASK/WAIT/FAILED 不能成为 COMPLETE.value**。
- 只有已确定/验证的业务 Intent 进入 Handling；歧义与缺失停下，不能默认调用第一个 Tool。State/Capability/Effect 提交前若预算用尽不能触发业务副作用。

## 3. BoundedQueryElement · R28 P2-02 精确可观察合同

```ts
type QueryLimits = Readonly<{ maxVisited: number; maxReturned: number }>;
type QueryResult<T> = Readonly<{
  items: readonly T[];
  visited: number;
  complete: boolean; // **是否已遍历输入的全部记录并判断完所有 predicate**
  truncated: boolean; // 与 complete 严格互补
  truncationReason?: 'VISIT_LIMIT' | 'RESULT_LIMIT';
}>;

class BoundedQueryElement {
  // 可信业务生成期提供 predicate、源顺序；不得把字符串表达式 eval。
  select<T>(
    source: readonly T[],
    predicate: (item: T) => boolean,
    limits: QueryLimits,
  ): QueryResult<T>;
}
```

**输入**：`source` 是当前调用可完整枚举的只读数组，采用**调用方现有稳定顺序**（无隐式排序）；业务如需自定义全局稳定排序，须在调用前使用可信业务 comparator 排序，且该排序操作/成本不被 SDK scan limit 包装为“免费”，L2 对内存上限必须如实限定。所有上限为安全非负整数，单次调用是同步只读过程，不修改源或 Domain Knowledge。断言业务传入真实 Array 或不可变可枚举 Array；不接受不可信 Proxy/getter 或 async predicate，后者返回 Thenable 应作为 invalid callback 拒绝。函数抛错直接以安全、受控错误传播给业务映射为 FAILED，而不是返回部分成功。

**停止/完整性的唯一规则**：
- 按源顺序读取每个元素，然后每项**最多调用一次** predicate；`visited` 是实际已求值条数，绝不超过 `maxVisited`。
- 每次访问之前，如果 `visited === maxVisited` 且尚有未访问元素，立即以 `complete=false,truncated=true,reason=VISIT_LIMIT` 停止；绝不执行下一条 predicate。
- 若 `maxReturned>0` 且新匹配项使 `items.length === maxReturned`，只有**当前项正好是源数组最后一项**时才 `complete=true`；否则立即停止，`complete=false,truncated=true,reason=RESULT_LIMIT`。不多访问一条未知项来证明“后续无其他匹配”。
- 若扫描完 `source.length` 且尚未触发上限，`complete=true,truncated=false`，包括正好 `maxVisited=source.length`、正好 `maxReturned=匹配总数` 且最后一项匹配。
- `maxReturned=0`：如果 `source.length=0`，`complete=true` 且 `visited=0`；非空源不调用 predicate，立即 `complete=false,reason=RESULT_LIMIT,visited=0`。若 `maxVisited=0` 且输入非空而 `maxReturned>0`，为 `VISIT_LIMIT`；所有上限=0 时优先 `RESULT_LIMIT`（明确固定）。
- 任何 `complete=false` 代表**候选/适用范围判断不完整**；对于需要完备事实才可授权/变更的业务，必须由该业务返回 UNKNOWN 或拒绝。SDK 不发明业务真值，不隐式增加预算，不使用“空结果=不存在”的推理。

**最小边界负例**：空源和 0/0，1 项源和 1/1 且匹配，2 项源和 maxReturned=1（第二项是否匹配不得被预先判断），2 项源和 maxVisited=1（第二项绝不被调用），输入顺序保持、非法 limit/同步抛错、同领域数据来自不同来源/失效由业务回调决定；在两个实际不同 Business Package 中复用同一 Standard Function/Element。

## 4. SQLite Store + 受控 SQL（R28 P1-01、P2-01）

### 4.1 当前受控驱动选择 · 必须有可重复证据的 admission

**本版最低 `Node >=22.12.0`、Windows/Linux、无需额外启动参数、不需要预置配置文件；安装脚本默认不获批。** 22.12 的 `node:sqlite` 需要 `--experimental-sqlite`，不得偷偷升级 Node 最低版本。R27 核实 `@photostructure/sqlite@0.5.0` 元数据包含 `"install":"node-gyp-build"`，即“随包 prebuild”并不等于生命周期脚本自动符合政策。同期 `@appthreat/sqlite3` 最新已提升到 Node>=24，不符合本版最低 Node 限定，不能据“bundled no-install”说明直接采用。

**唯一第一轮受控候选：`@photostructure/sqlite@2.5.0`（npm 发布确切版本，正式依赖必须经 lockfile 完整 pin；当前还不是 SDK 已接入依赖）**。目标仅验证 `win32-x64` 和 `linux-x64 + glibc >=2.31` 的预编译分发 profile；Windows ARM64、Linux ARM64/musl、旧 glibc 和其他 Target 在真实见证前不能宣称完整兼容，若现有产品范围被理解为需要这些平台本版强制交付，则须在范围冲突记录中裁定，不可静默降级。GitHub 上的 [Node >=22 声明](https://photostructure.github.io/node-sqlite/) 和 [GLIBC 门槛](https://photostructure.github.io/node-sqlite/documents/getting-started.html) 仅用于候选选择。

**安装策略（先于 SDK 实施）**：在隔离临时项目用 exact `Node v22.12.0`、npm CLI、`npm install --save-exact --ignore-scripts @photostructure/sqlite@2.5.0`，然后从完整真实 `package-lock.json` 用 `npm ci --ignore-scripts` 重装；不执行任何传递依赖 install/prepack/prepare，不需要 `--experimental-*`。核对实际 npm pack/lock integrity、manifest 所有 lifecycle、实际 `prebuilds/`、已装载的 .node 对应 OS/arch/ABI 及开源许可/依赖，不允许静默触发源编译或外部二进制下载。**包的元数据含 install 字段可以记录为被忽略，不算满足“无脚本被执行”的反证**；若无脚本时预编译模块无法载入，候选就不合格，不能暗中放开脚本。

**两种平台必须实际通过一份同样的验收程序**：
1. 精确 Node22.12、环境（OS、arch、Linux libc）、实际 install 命令/exit、lock hash、package 版本、已安装二进制 digest、`--ignore-scripts` witness；
2. 实际 ESM `import { DatabaseSync } from '@photostructure/sqlite'` 无 flags，真实基于临时路径的 DB 文件 open/create/commit/close/reopen/readback；
3. 同一 file-backed DB **两个独立连接**竞争更新相同 resource/version：`UPDATE ... SET version=version+1 WHERE id=? AND version=?` 的 affected changes 总和恰为 1，另一方没有提交真实 Effect；独立事务失败触发 ROLLBACK；busy/locked 与权限错误分类可观察；
4. 清理临时文件，输出脱敏日志与 SHA256，不回写仓库源码，不写密钥。生成的二进制和第三方代码不可当作 SDK 已验收发行产物。

**证据门 R28 已取得限定资格回执**：[#1705 原始测试回执](https://github.com/kaicreator-mm/domain-harness/issues/1705#issuecomment-7117468436) 报告 Windows x64 Node22.12 与 Linux x64/glibc 2.36 Node22.12 **2/2 PASS**；`npm ci --ignore-scripts`（manifest 存在 install hook 但被禁止）、无启动 flags、原生打包预构建文件加载、真实 SQLite DB reopen/rollback、不同独立进程同一资源版本 CAS 最终 `version=1,effect_count=1` 均有原始脚本/Hash/日志摘要。详见 [R28 Provider 证据索引](./DomainHarness_v0.11.2_R28_SQLITE_PROVIDER_QUALIFICATION_EVIDENCE.md)。**针对这两个精确平台/版本，设计层 Provider Feasibility=PRECHECK_PASS_REPORTED，未取得独立 R29 复审；SDK npm pack/clean Consumer、其它 OS/arch/较旧 glibc/远程 Host 仍 NOT_RUN。** 若其它平台后续入必选范围，需补相应证据；如新 SDK 集成违反 no-hidden-script、版本/ABI 或 CAS 不变量则实际实现 REWORK。

### 4.2 SQLite 同步事务 API · R28 P2-01

以 `DatabaseSync` 驱动作为**本版最小确定性合同**，不提供伪 async transaction：

```ts
type NonThenable<T> = T extends PromiseLike<unknown> ? never : T;
type SQLiteScalar = string | number | bigint | Uint8Array | null;
interface SQLiteTransaction {
  readonly active: boolean;
  // 仅可信调用方/业务声明的 SQL 与 bind 值；tx 失效后立即拒绝。
  run(sql: string, parameters: readonly SQLiteScalar[]): { changes: number };
  get<T>(sql: string, parameters: readonly SQLiteScalar[]): T | undefined;
}
interface SQLiteConnection {
  select<T>(trustedSql: string, params: readonly SQLiteScalar[], limit: number): readonly T[];
  transaction<T>(work: (tx: SQLiteTransaction) => NonThenable<T>): T;
  close(): void;
}
```

**硬执行顺序**：`BEGIN IMMEDIATE` → 同步 callback → 如果返回 `PromiseLike` / thenable，**在 COMMIT 之前同步拒绝并 ROLLBACK** → 普通结果才 COMMIT；callback throw/SQLite 错误先 ROLLBACK，记录原始主因并做脱敏错误分类。遇到同期激活 transaction 的嵌套/重入按明确业务合同拒绝或受控 SAVEPOINT，不能默默共享。回调返回后 Tx 对象即标为 inactive，之后任何 `run/get` 必须拒绝；检查 Node TypeScript `async () => ...`、返回真实 Promise、伪装 thenable、抛错/回滚、use-after-close 的正反例。静态 `NonThenable` 约束只是方便性，`any/unknown/JS` 必须依赖运行时 PromiseLike 拒绝。

- 连接由普通应用实例拥有、可选 Exit/close，不由 KDP 调用中心创建。同步 DB 操作阻塞 Node JS 线程，事务设计需短、有限，不把已运行的数据库 IO 假装 async。业务持久状态/Attempt CAS 从真实 SQLite/Host 读取，生成期不可变 Data Knowledge 不得被 UPDATE 热改。
- 只允许受信任 Business 提供 SQL 文本与选定表/列；参数使用预编译绑定，SQL Query 能力默认仅已解析的 readonly SELECT，写入在明确业务 Store/transaction；不要相信前缀 `SELECT` 的简单字符串判断即可隔离全部写副作用，必须依赖 prepared statement readonly/SQLite authorizer/可信 SQL 固定集合并测试侧效应。
- 真实文件权限、BUSY/LOCKED/READONLY/CONSTRAINT/SQLITE_IOERR 按故障类型分类，不返回假 COMPLETE。开启 WAL 或 busy timeout 是 Resource Owner 明确选择，不强制业务启动前预置配置文件。

## 5. Vector 与 Graph Query 不另造 DBMS

### Vector

```ts
// Business 明确提供 id/vector/Scope 元素，SDK 不定义领域对象表。
type VectorCandidate<T> = { item: T; vector: readonly number[]; id: string };
type VectorQueryOptions = { topK: number; maxVisited: number; dimension: number; metric: 'COSINE' | 'L2' };
```

- 对输入向量与每个候选逐一校验有限数、维数、零向量规则，**先执行可信领域 scope predicate 才做距离/Top-K**，再稳定按 score + id 排序；Top-K 上限、扫描上限明确，截断结果不能自动视为完备事实。候选集合可以是 SQLite 表读取后提供，也可以来自生成期静态 readonly 数组。
- 小集合可用普通 TS 计算，只有真实性能瓶颈才评估 SQLite extension；无 embedding 生成或动态联网要求，Vector 相似度不是确定性的业务 Rule。

### Graph

```ts
type TypedEdge = Readonly<{ from: string; to: string; type: string }>;
type GraphLimits = { maxDepth: number; maxVisited: number; maxReturned: number };
```

- 对生成期显式边/SQLite 有界查询结果运行 BFS/DFS 之一；按 from/to/type 和方向筛选，`visited` 集合限制环路和重复节点，每一 hop 在访问前检查预算；方向/关系类型必须由调用者确定，不把图路径推导成新领域真值。
- 用真实负例：图环、逆向边、type 错配、无路径、非法上限/节点数量。不能从静态知识自动导出“有权写入新关系”。

## 6. Expression · R28 P1-02 选择有限、纯 JSON AST，不引入默认 JSONata

**最终 L2 选择**：SDK Standard `BoundedExpressionElement` 提供**语义明确、无循环/无函数调用的只读 JSON AST 运算**。Domain Package 在生成期写死 AST/纯数据；允许 Consumer 将通过上述**同一严格验证器**检查的纯 JSON AST 作为输入，但**不能**包含 JS function、getter、Proxy、Promise、可执行源码、callback、远端 API 或未选 Tool。实际业务复杂 Rule 仍是直接调用的原生 TS Function；本版绝不把全部 Rule 迁移到表达式 DSL，不建立第二 Workflow VM。

```ts
type Literal = string | number | boolean | null;
// L2 示例，最终公开 names 以真实 SDK 的 TS 类型与测试为准。
type Expr =
  | { op: 'literal'; value: Literal }
  | { op: 'get'; path: readonly string[] }
  | { op: 'not'; arg: Expr }
  | { op: 'and' | 'or' | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
      | 'add' | 'sub' | 'mul' | 'div'; args: readonly Expr[] };
type ExpressionLimits = {
  maxAstNodes: number;
  maxAstDepth: number;
  maxInputBytes: number;
  maxOperations: number;
  maxPathSegments: number;
  maxStringBytes: number;
};
```

**允许语法最小集**：literal/get/not、and/or 的短路、eq/ne 类型严格相同的标量比较、lt/le/gt/ge 有限数字比较、add/sub/mul/div 有限数字操作（div 除零拒绝、禁止 NaN/Infinity），不包含字符串拼接、regex、遍历、map/filter/transform、Lambda、函数/外部 Host 调用、任意原型查找、对象写入或用户自定义扩展。每种 op 限定 arity（not=1，and/or 1..8，比较/四则=2），严格标量类型，查找只允许当前 Plain JSON 输入自身显式拥有的字段（不走 prototype/getter，`__proto__`/`prototype`/`constructor` 永远拒绝）。缺失字段明确 INVALID_INPUT/UNKNOWN，不默认 0 或 false。接口只返回标量或受控错误；不能将不完整计算当确定结果。

**有界执行方式**：先深度/广度检查整棵 AST，循环、自引用、过长字段与已知不支持的 op 立即 INVALID_EXPRESSION；输入受 `maxInputBytes` JSON-compatible 纯数据和 `maxStringBytes` 限制；递归 AST 只在 maxAstDepth 之内（也可实现迭代），每个 AST 节点及每一段 `get.path` 消耗 operation budget，在读取和计算**之前**检查剩余额度。预算必须有内置最大硬上限：默认 maxAstNodes<=128、maxAstDepth<=16、maxOperations<=256、maxPathSegments<=8、maxInputBytes<=32KiB、maxStringBytes<=4KiB；业务可选择更小但不能通过选项升高超过内建最大。所有 JS Number 有限且正确拒绝负零/安全精度损失时按具体算术 contract 处理。结果为单个纯标量，string <=maxStringBytes，不允许动态巨大对象/数组输出。

**同步与终止**：所有操作无异步、等待、用户 callback、I/O 或 unbounded loop，因此在接受的 AST+Input 受控范围内以**有限节点/路径次数**确定终止。明确**不承诺面对任意恶意 JS 代码/Proxy/Getter 的抢占式 wall-clock CPU 强制杀死**；没有 Worker，也不对不可信任意表达式做 `Promise.race` 虚假超时。业务原生 TS Function 不受此受限表达式的运行预算保护。若未来要 JSONata/第三方表达式、递归/数组处理、hard timeouts，必须另行 L2 设计与真实隔离测试；JSONata <2.2.1 已有 [GHSA-66mm-25pp-rfff](https://github.com/jsonata-js/jsonata/security/advisories/GHSA-66mm-25pp-rfff)，**本阶段 SDK 不默认依赖 JSONata**，因此无需为本次新增安全依赖。

**可证伪负例**：未知 `op`、非法 arity、嵌套超过 16、129 个 AST nodes、257 个操作步骤、过长输入、16KiB 字符串、除零、NaN、非 JSON getter/Proxy、async/Promise/返回 thenable、constructor/prototype path、无字段、循环 AST、短路路径没有调用不必要分支、无任何外部副作用/文件变化。永不允许改动任何生成期 Data Knowledge；输出错误码 `EXPRESSION_INVALID`、`EXPRESSION_LIMIT`、`EXPRESSION_INPUT`、`EXPRESSION_EVALUATION` 稳定且信息脱敏。

**跨平台**：这是独立于 SQLite addon 的 TypeScript/Node22 同构 Standard Element，不引入 npm install scripts、特定 Host OS 或第二 Language Runtime。其真实 TS/Node 测试仍留待 L2 独立 ACCEPT 后的实施任务 T04。

## 7. Authorized Action 的可信边界（全部在 0.11.2）

```text
Business Handling Workflow
  → native Business Guard + current authoritative State
  → selected Tool Function / Resource Owner
      ├─ PREAUTHORIZED: no extra user prompt
      └─ USER_APPROVAL: verify PER_CALL or bounded SESSION approval
  → authority's conditional admission BEFORE real irreversible effect
  → durable (commandId,inputDigest,resourceId,expectedVersion,attemptId,disposition)
  → provider executes or returns existing disposition
  → actual ACK / Receipt / source-of-truth readback
  → Business outcome: COMPLETE / REJECT / UNKNOWN / FAILED
```

**业务 Owner 生成并静态选定具体 TS Tool/Host Function**；如果适合，复用 SDK SQLite/Query 通用能力，但 SDK 不要求所有 Tool 实例必须实现新的 Host/Permit/Tool Registry。权限检查是**真正 OS/DB/Host 当前已授权资源的真实 enforcement**；PREAUTHORIZED 无新的每次用户许可，USER_APPROVAL 回调需要主体/租户/资源/操作/参数 digest/有效期真实匹配。LLM/Knowledge 不能通过字符串把 USER_APPROVAL 降格为 PREAUTHORIZED。

### 7.1 Command/Approval/Receipt 的**业务最小元数据**，不是跨领域通用协议

```ts
// Consumer Business 的一个例子：不强制所有领域使用相同 I/O/类名。
type CommandIdentity = Readonly<{
  commandId: string;
  inputDigest: string;       // hash of canonical business input and selected target
  resourceId: string;
  expectedVersion: string;
}>;
type ApprovalDecision =
  | { mode: 'PREAUTHORIZED' }
  | { mode: 'PER_CALL'; commandId: string; grantId: string }
  | { mode: 'SESSION'; grantId: string; scope: string; expiresAt: string };
type AttemptDisposition = 'NOT_SUBMITTED' | 'ADMITTED' | 'APPLIED' | 'REJECTED' | 'UNKNOWN';
```

- **PER_CALL** 被接受时必须与一个逻辑 commandId 原子消费/绑定，两个并发使用相同批准但不同 commandId 至多一个成功；同参数新 commandId 也不能复用旧 grant。同一 commandId+同摘要重发**仅查看原 Attempt/Readback**，不能再执行一遍；同一 commandId 不同摘要立刻拒绝。
- **SESSION** 只有在用户/租户/资源/操作、参数范围与有效期覆盖当次请求时才可复用；撤销/实际资源授权变化必须阻断下次提交。用户确认不是 Host 资源能力本身。
- **同一 resource/version 的不同 commandId 并发命令**：由**权威资源所有者**在不可逆动作发生前做原子条件提交或持久排他 admission + fencing；本地 SQLite 预留不能自动保证另一个远端 Host 的 Effect。若外部 Provider 不支持条件执行/可靠幂等与可观察结果，此类互斥操作 **fail closed**（拒绝/UNKNOWN），不能靠事后 CAS 或进程 Mutex 虚报事务安全。
- **效果事实**只以真实 Host 回复或权威 readback 为准；丢 ACK、提交后本地日志断电/隔离、失联时保留 UNKNOWN 或相同 Attempt 查询。若远端可证明 ALREADY_APPLIED，返回已知事实而不重播。使用本地 SQLite 的业务示例可把条件提交、状态写入和 attempt journal 放入一个真实原子事务；另一个真实远端 Host 示例须证明相同不变量，不能假设跨系统 ACID。
- 若普通 `invokeOutcome` 遇逃逸异常会映射成 `FAILED`，**可能已提交的 Host 异常必须在实际 Provider 边界先捕获并转 UNKNOWN**，不能让 Workflow 无法区分“失败前未提交”和“提交后 ACK 丢失”。
- SDK 提供通用 DB/Workflow 机制而非统一域权限中央系统；领域级 Agent/LLM 始终没有自授工具权限。0.11.3 UI 只作为确认接口的可选实现，0.11.6 TaskRun checkpoint/异步恢复与本版基本 Attempt/Receipt 分离。

> **R27 所指出的真正 L2 阻断项**：P1-02 Expression 在本 R28 文本中已选择具体可反证的 AST profile（不再等实现时选 JSONata/worker）；P2-01 同步事务和 P2-02 Query 完整性也有精确合同。**#1705 双平台 SQLite preflight 已按所选 profile 报告 PASS，并有可重放原脚本、依赖锁与 SHA256**；其证据被收录在 [R28 资格索引](./DomainHarness_v0.11.2_R28_SQLITE_PROVIDER_QUALIFICATION_EVIDENCE.md)；但 **R29 独立审查未完成，不提前把 R27 P1-01 宣告 CLOSED 或称完整 L2 ACCEPT**。SDK 源码、真实 SDK 消费者/CI 和独立远端 Host Effect 测试仍未开始。

## 8. 最小任务 DAG、真实 Consumer 与否定证据

**仅在 L2 独立审核 ACCEPT 后开启源码 DAG。** 所有增量是有限一次性任务，完成一个独立模块再做一次 scoped 审核；不启动持续运行的本地 Agent。

```text
L2 ACCEPT
 ├─ T01 BoundedQuery + 静态知识只读 / 两领域   ─┐
 ├─ T02 SQLite provider feasibility + Store ───┤
 ├─ T03 SQL/Vector/Graph Query (T01,T02) ──────┤
 ├─ T04 Expression isolation (independent T01) ┤
 ├─ T05 Business Intent two Workflow examples ┤
 └─ T06 Authorized Action + Actual Host (T02,T05) ─┤
      └─ T07 Native SDK-only combined E2E / scoped review
```

- **T01**：通用 Query 对任意 `readonly T[]` 复用，测试读取/限额/冲突/未知/Source/Time 由 Business predicate 明确，不因历史静态知识数据库消失使 SDK 空心化。
- **T02**：先 Node22.12/Windows/Linux 实测 driver 实体再做 DB Element，必须有 open/update-where-version/rollback/reopen/close 与无额外启动 flag 的真实 evidence；必须检查安装生命周期与单 SDK 发包。
- **T03**：SQL 不可任意拼接；向量 scoped Top-K、维度错误；图有向/环/深度/结果上限；可由 T02 同一 SQLite provider 服务，但功能要真实单独验证。
- **T04**：Expression 的真实限制/worker 或协作定位及安全公告检查；不把旧 JSONata 2.0 漏洞引入 SDK。若 Worker 方案过重，应在 L2 把可接受信任范围/裁剪参数写明而非隐藏。
- **T05**：两个 Business Package 的 Recognition/Handling；一个来自陌生领域资料。**同一业务根预算共享**，六态 Outcome，真实不调用 Host 的拒绝路径。
- **T06**：选择实际业务资源（例如实际本地 SQLite-backed inventory service 或独立 HTTP Host + 真实 SQLite DB），证明有真实物理持久 state 更新和读回；PREAUTHORIZED 与 USER_APPROVAL 两模式，PER_CALL 抢批准，同资源同版本不同 ID 并发、同 ID/异摘要、lost ACK 均观察真实 Host 侧 Effect 计数。仅 Mock provider **不计正式通过**。
- **T07**：干净 Node>=22.12 ESM Consumer 仅安装**新构建的同一个公开 SDK 包**，不借 repo 私有入口，跨两个领域复用模块；类型编译、必要反例、依赖/配置/供应链、真实 Woodpecker Exact HEAD、非 Writer 独立审查。

**实施前必须完成：** driver 可行性、Expression 信任/取消边界、Host authoritative admission 示例可证、公开最小 TS API 不破坏 0.11.1，SDK Node engines 不偷升、无第二 Runtime、无动态 Tool Registry。以上若不足 L2 Reviewer 给 REWORK，而不是放行源码后再发散。

## 9. L2 审核边界和阶段状态

- 本 R26 是 **L2 Candidate**，不具有发布 API/测试证据。可被一个非 Writer 审核者针对真实 PR Exact HEAD 验证与批注；如有未闭合的 provider feasibility 应明确 OPEN/REWORK，不可“设计了接口”就报实现 PASS。
- R22/R24 仅已接受不变的 L1 产品/范围，不是本 L2 的独立审核。R25 文档已合入 train，但 0.11.2 SDK 扩展、版本功能验收尚全部 NOT_RUN。
- 任何 JSONata、SQLite 第三方库的版本、预编译工件/跨平台行为，**最终依据真实 npm pack、Node 22.12 ESM 消费、Win/Linux 测试结果**，本文件网络引用只是技术候选来源，不能替代可运行证据。
