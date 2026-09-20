# Contract Validation Suite（领域契约验证套件）

按 [`DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md`](../../docs/domain-data/DOMAIN_DATA_CONTRACT_ANALYSIS_v0.3.md) 定义的契约，为 [`docs/domain-data/contract-drafts/`](../../docs/domain-data/contract-drafts/) 下 13 个项目的领域契约草案填充**模拟真实领域情况的验证数据包**，并结合 DomainHarness SDK（真实 compiler + 真实 `createDomainRuntime`）做端到端领域验证；发现的问题汇总为 findings 并提报 GitHub issue。

## 运行

```bash
npm ci --ignore-scripts     # 验证链路纯 JS（不需要 better-sqlite3 原生构建）
npm run test:contracts      # 或 npm test（已并入根 test 链）
```

产出：`reports/findings.json` / `reports/findings.md`（每次运行重新生成，随仓库提交作为 issue 证据快照）。

## 结构

```text
tests/contract-validation/
├── runner/
│   ├── memory-runtime-store.ts   # NodeSqliteRuntimeStore 的内存行为镜像（单写者语义逐条对齐）
│   ├── host.ts                   # 真实 sha256 + ExpressionRuntime(JSONata+policy) + 可控时钟
│   ├── business-store.ts         # 模拟 P4：B1/B2 revision 纪律 + dirty→invalidation
│   ├── sim-ports.ts              # CompiledDomainDataPort / AIOperationPort(确定性 fake) /
│   │                             #   进程内 RemoteTransport（= G3 临时方案 A 的忠实复现）
│   ├── pack.ts                   # 数据包加载 + loadRawDomainPackage + compileDomainPackage + validateCompiledPackage
│   └── execute.ts                # 场景解释器（open/send/settle/expect-*/restart/recover/finding…）
├── packs/<project>/              # 每项目一个验证数据包（13 个）
│   ├── pack.json                 # tier: executable | data-only（+blockers）
│   ├── raw/                      # Raw Domain Package（harness.yaml/workflows/schemas/skills）
│   ├── tools.json projections.json host-profile.json bindings/ tool-handlers.json handlers/
│   ├── business/ business-sources.json   # 模拟业务数据 + value schema 声明（[G2/L2-8] 的活体提案）
│   ├── domain-data/              # Compiled Domain Data 条目（经端口带外交付，packageId 钉住）
│   ├── ai-responses.json         # 确定性 fake AI（v0.3 PRD §26.3）
│   └── scenarios/                # 有序步骤 + 期望 + finding 声明
└── reports/                      # findings 汇总（生成物）
```

## 两层验证

1. **结构校验（全部 13 包）**：业务种子数据必须满足 `business-sources.json` 声明的 value schema（Ajv 2020-12）；projection 表达式必须可编译（JSONata）；tool 声明必须含 outputSchema/effect；场景步骤词汇合法。
2. **可执行验证（executable tier，当前 4 包）**：真实编译（`compileDomainPackage` → 内容寻址 packageId）→ 真实包校验（`validateCompiledPackage`）→ 真实运行时（`createDomainRuntime` + 内存 RuntimeStore）回放场景：Restore 路由、命令 applied/rejected、Skill 调用与 journal、跨 workflow durable message、业务写与失效、投影信封、restart 恢复、recovery（retry/terminate）、messageId 去重。

## tier 说明

- **executable**（formula / tally / triphub / yishu）：设计文档已给出映射的四个项目，全链路跑通（229 场景步）。
- **data-only**（其余 9 包）：模拟数据 + 契约声明面 + 目标旅程场景已就绪并通过结构校验；升级 executable 的前置条件记录在各 `pack.json.blockers`（宿主语言 sidecar、expo/Capacitor 设备宿主、PG RuntimeStore、仓库 ADR 流程等）。

## Findings 纪律

- 场景对**现状行为**断言（保持套件绿色），对契约差距以 `finding` 步骤显式记录（severity: `divergence`/`defect`/`info`），证据落 `reports/`。
- `divergence` findings 是 GitHub issue 的证据源；提报前须与既有 issue（#135–#139、#150 等）去重——已覆盖的以评论补充复现证据（如 #137）。

## 已验证成立的关键模式（正向结论）

- R3/R4 结构化拒绝：Tool 返回 `{outcome: applied|rejected, code, commandId}` + done 路由分流 + lastResult 保留 → 领域拒绝不毒化实例（4 包全部验证）。
- S2 流程数据进业务库：jobId/quote/fingerprint/运行游标全部落业务源，workflow 跨消息只存控制相位。
- 确定性知识先于 AI（DD-P4）：CompletionContract 评估（tally）与回归 gate（yishu）以包内表达式/Tool 落地；Skill 输出只经 Tool 进权威数据（formula design-critique）。
- restart 恢复：4 包全部通过（activation recovery + 等待态跨重启 + AI 不重调用）。
- 三值付费副作用建模模式（供后续包参考）：provider TIMEOUT → Tool 返回 `{status:'unknown'}` → 业务台账驻留 unknown_hold 静止态 → 只经 reconcile 决定性证据收敛；Tool 抛错路径则依赖 non-idempotent + started-not-completed → `recovery_required`（SDK 既有矩阵）。
