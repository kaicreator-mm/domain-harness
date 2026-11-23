# DomainHarness v0.11.2 · R26 Native Domain Intelligence + Authorized Action L2 Design (Candidate)

```ini
OUTPUT_LABEL=DH_V0112_R26_FROZEN_L1_NATIVE_DOMAIN_INTELLIGENCE_L2_DESIGN
REPO=kaicreator-mm/domain-harness
MASTER_ISSUE=#1563
VERSION_ISSUE=#1612
L2_ISSUE=#1703
FROZEN_L1_PR=#1702
FROZEN_L1_TRAIN_MERGE=72b38dff418d43ba35d8c89ef7edd59152460031
PRODUCT_L1=FROZEN_SCOPE
DESIGN_L2=CANDIDATE_NOT_INDEPENDENTLY_REVIEWED
SDK_SOURCE=NOT_CHANGED
TESTS_CI=NOT_RUN_DOC_ONLY
IMPLEMENTATION=ON_HOLD_PENDING_L2_REVIEW
```

> **范畴：只设计，不编写 SDK 功能代码。** 唯一需求依据：[R25 Scope Freeze](../product/DomainHarness_v0.11.2_R25_PRODUCT_L1_SCOPE_FREEZE.md) + [R21 DI-L1-01–12](../product/DomainHarness_v0.11.2_R21_CONSOLIDATED_PRODUCT_L1_AFTER_R20_REWORK.md)。当前真实基线 API：`index.ts` 导出 `WorkflowElement<Input,Output>` / `StandardWorkflowOutcome` / `StandardWorkflowSession` / `NativeWorkflowContext.invoke/invokeOutcome/child/leaf`、标准 JSON/YAML Reader、生命周期 KDP。下述新类/接口是**L2 候选**，不可当作现有 SDK 或已运行通过的 TypeScript API。

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

## 3. BoundedQueryElement L2 最小公共 API 候选

```ts
type QueryLimits = Readonly<{ maxVisited: number; maxReturned: number }>;
type QueryResult<T> = Readonly<{
  items: readonly T[]; visited: number; truncated: boolean;
}>;

// 以下 T / 业务 predicate 必须来自生成期可信业务代码。
class BoundedQueryElement {
  select<T>(
    source: readonly T[],
    predicate: (item: T) => boolean,
    limits: QueryLimits
  ): QueryResult<T>;
}
```

- 限制必须是安全非负整数（业务可以选择 maxReturned=0 返回空）；**超 maxVisited 的 scan 不得先调用后续 predicate**，超 maxReturned 的额外命中必须按明确截断策略处理（不能默默当完整事实）。若业务需要“不能截断仍做确定决定”，应按 `truncated` 返回业务 UNKNOWN，而不是把部分列表当完备结论。
- Query 不拥有 Domain/Version/Source/Time schema。**由 Business 提供类型化 predicate、来源/适用范围与可信排序函数**，SDK 提供可复用的上限/稳定顺序/失败边界；不能要求业务数据先注册在 SDK 语义表。
- 运行时只验证真实的调用输入/限额，不复查已生成 Package/Element 的静态正确性。trusted `predicate` 可能抛异常，按普通函数错误向业务 Workflow 映射 FAILED；不执行动态 eval/predicate 文本。
- 多领域直调 Query 与 Workflow 调用必须真正使用**同一 SDK 实现**；测试缺失/矛盾/失效/超时范围、无效日期和未知来源由各 Business 确切语义负责，SDK 不把未知事实神奇当真。
- 如果后续数据规模较大，可用 Iterator/limit 扩展，但 v0.11.2 不引入通用数据库游标注册表或工作线程池。

## 4. SQLite Store + 受控 SQL（硬实施可行性门）

### 4.1 后端选择事实与初步结论

**最低 Node `>=22.12.0`、无额外启动配置、Windows/Linux。** [Node 22.12 的官方 SQLite API 文档](https://nodejs.org/download/release/v22.12.0/docs/api/sqlite.html) 显示 `node:sqlite` 在该精确版本需 `--experimental-sqlite`；不能直接选它作为所有环境的**无启动参数**唯一 Provider。Node22.13+ 不要求该 flag 也不代表可以悄悄提高 SDK Node 最小版本。候选：
- **首选评估** `@photostructure/sqlite`：宣称 Node22+、Windows/Linux 预编译库随 npm 包提供、不依赖安装期下载，参考 [其使用文档](https://photostructure.github.io/node-sqlite/) 和 [library comparison](https://photostructure.github.io/node-sqlite/documents/library-comparison.html)。**尚未在项目 Node22.12 Windows/Linux clean install 实测**；必须核对 lockfile、npm pack、原生模块 License/供应链、无未允许 npm lifecycle、副本 ABI、可运行的 file-backed transaction/CAS。不得把供应商宣称当 PASS。
- **候选备选** `better-sqlite3` 最新支持版本：API 成熟，但可能带 node-gyp/install scripts 与平台二进制分发差异；如不符合既定生成/交付策略不可擅自增加 postinstall。
- **条件备选** Node 内置 `node:sqlite`：只在已选运行环境和启动合同允许时；不能对所有 Node22.12 用户偷偷要求 flag。
- WASM SQLite（如 `@sqlite.org/sqlite-wasm`）可作无 addon 候选，但**文件 VFS 持久化、跨进程 CAS/锁、事务语义必须真实验证**；单纯数据库序列化为文件不是可靠的跨进程事务边界。

**L2 入场阻断条件**：选定 provider 不经过真实 Node22.12 clean packed SDK 的 Win/Linux 安装、启动、重开和双连接版本冲突试验前只能称 `PROVIDER_CANDIDATE_UNVERIFIED`。能由当前 Cloud/Linux 环境完成的测试先自行执行；只有必须 Windows 的有限环境结果才由一次性本地任务补证。若没有任何候选能满足目标环境，L2 必须 REWORK 或向 Owner 报明确产品约束冲突；不得不告知而降低/提高 Node 门槛、添加配置文件或取消 CAS。

### 4.2 API、生命周期与事务

```ts
// L2 轮廓，类型细节/同步或异步择一仍须真实 driver spike 验证。
interface SQLiteConnection {
  select<T>(staticSql: string, parameters: readonly SQLiteScalar[], limit: number): T[];
  transaction<T>(work: (tx: SQLiteTransaction) => T): T;
  close(): void;
}
type SQLiteScalar = string | number | bigint | Uint8Array | null;
```

- 连接由明确创建的 **SDK Standard SQLite Element 实例** 拥有；Business 创建/传递，不由 KDP 统一注册 DB。真实资源关闭由实例的 `Symbol.asyncDispose` 或明确 `close` 处理，服从已选 App 生命周期。若 driver 只有 sync API，不能把同步阻塞伪装成异步；长事务上限要受控制。
- 只在受信任业务代码中选 SQL 文本/表名/列名，运行时不接受客户端提交的任意 SQL；**参数值使用 prepared/bind**，SQL query 模块只读，写操作封装在业务 Store/显式 transaction。禁止把对象键/字段名作为 SQL 字符串直接拼接。
- SQLite 侧 state version compare-and-set 通过单个 **条件 UPDATE/INSERT + affected rows/unique key** 达成；BUSY/LOCKED/READONLY/CONSTRAINT 分类必须映射实际失败，不能捏造成功。事务回滚+重开读回+两个不同连接并发负例是硬 Oracle。
- 可选择 WAL 与 busy timeout，但默认值/路径/并发范围受 Business 文件所有权约束，**首次应用启动不需要预制配置文件**；DB 文件路径可在启动后由 App 提供，未配置时不得未经允许创建业务文件。

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

## 6. Expression：选择受限库与实际取消边界

- 由 Business 生成期选定表达式并在函数/Workflow 中显式调用；不允许把外部模型返回的任意 JS/TS 源码当作可执行表达式。输入限定 JSON-compatible plain data，限制体积、深度、表达式复杂度及输出大小。无系统 FS、网络、Host Function 注册或不受限任意回调。
- JSONata 可作为现有来源候选，但 JSONata 2.x `evaluate()` 是 async（[官方文档](https://docs.jsonata.org/2.1.0/using-nodejs)），当前 2026 年安全修复要参考 [GHSA-66mm-25pp-rfff](https://github.com/jsonata-js/jsonata/security/advisories/GHSA-66mm-25pp-rfff)：**不能继承旧 2.0.0 版本作为无需补丁的默认安全方案**；L2 选实际受维护并已修复版本，或选择等价更小的表达式库。
- 若需向应用承诺真正的墙钟强制停止，必须采用**可终止的实际 Worker/子进程隔离执行**并测试同步 CPU 密集表达式、memory limit、并发、超时 terminate 和清理；单纯 `Promise.race` 或内部 `Date.now` 检查不等于硬取消。若不做隔离，明确仅支持可信有限表达式与协作预算，不能宣称 arbitrary untrusted expression hard kill。L1 `bounded` 的可观察测试必须与真实隔离能力匹配，不能缺省吞异常。
- 性能优化/缓存仅属于这个 Element 实例，不改变 DataKnowledge，不创建 Global Expression Registry。Expression 结果返回业务值或明确的受控失败，不强制业务 `DomainResult` 结构。

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
