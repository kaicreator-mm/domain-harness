# DIS v0.2.0 — R9 原生 Element / Function / AOT 契约与 SDK 消费

**状态：正式机器契约的可执行候选实现，R9；尚未 L2 Freeze / 合并 / 发布。** 权威：Issue #1496、Draft PR #1497。本文件定义具体可用的公共 SDK 子路径、验证规则和兼容性，而不把 R7/R8 的 Demo Sidecar 当作标准 ABI。

## 1. 从三个真实项目得到的强制语义

| 消费者 | Element | Function 实现 | Runtime 结果 | 不允许的隐式推断 |
|---|---|---|---|---|
| Tally 工程 Task/Release | rule、knowledge、依赖及约束 | LOCAL，真实已锁定源函数 | `{kind:OBSERVATION,authority:NONE,value}` | 源码/证据/检查结果不产生 Claim、Merge、Release 权限 |
| Runx Agent Presence | stateful、生命周期语义 | LOCAL，真实有状态对象（非 Business Policy） | `OBSERVATION`，返回本地观察者实例 | last_seen / incarnation 不是 live Lease 或调度执行批准 |
| xDownload 获取能力 | knowledge + effect、依赖关系 | KDP_INTENT，真实已选 `confirmDownload → acquisition.acquire` | `{kind:KDP_RECEIPT,authority:KDP,receipt}` | 声明 Effect / 路由存在不允许绕过 KDP 执行、也不代表物理下载成功 |

Domain **不是 Element 集合**：`domains` 给出领域身份和说明；`elements` 逐层表达领域内容；`dependsOn` 构成可验证无环图；`relations` 给出 `depends-on` / `defines` / `constrains` / `cooperates` 的跨层/跨域语义；`global` Element 可以只表达全局语义而不暴露可调用 Function。

## 2. 规范化机器对象

- `DisV020Program`：`format='dis.v0.2.program/1'`、`appId`、`domains[]`、`elements[]`、`relations[]`、`appInit`。Element 限定 `id/domainId/kind/description/packageId?/dependsOn/functions`。Function 限定 `id/kind/effect/optional?/binding`，不允许私自新增隐式权限字段。
- `DisV020Function.binding` 仅有两种：`{type:'local',sourceId}`（知识/规则/有状态观察与 App Init，`effect=none`）；或 `{type:'kdp-intent',intentId}`（必须指向已选 Business `provides` + Capability Handler + 精确 BUILD Route，真实 Effect 必须与 `externalEffect` 一致）。
- `App Init` 必须恰好一个，属于已选 Business Package，且为 LOCAL、无 Effect。SDK 首先加载真实 KDP/SDK，然后执行该唯一 Init；仅 `READY` 或只禁用 `optional` Function 的 `DEGRADED` 可开放入口。失败时 SDK 停止并拒绝所有业务 Function。
- `DisV020Aot`：`format='dis.v0.2.aot/1'`、**原样包含 canonical `V10BuiltApp`**、Program、已选来源 Pin（repo/commit/path/Git Blob + SHA256）、`digest=sha256Canonical({format,built,program,sources})`。BUILD 锁定整个已选 Module/Route/预算/LoadOrder；SDK 重新验证字节、关系、Function 和摘要，不重新选择执行路径。
- 来源 `sourceText` 只在 BUILD 阶段消费；`expectedSourceOrigins` 为**独立的可信来源目录**，不可由待编译数据自报。任意 Git Blob 字节漂移、仓库/提交/路径不匹配必须拒绝。运行时封闭 Registry 中各 LOCAL Implementation 也必须与其 SourceId、SHA256、Git Blob、origin 匹配。
- SDK 接收**安装方单独提供的 `expectedDigest`**；仅有文件里自带的 AOT Digest 不能自授权。已选 KDP 是 Admission/Journal/Effect 的唯一权威；SDK 不能 mint Permit，也不能将 LOCAL 输出提升为 KDP Receipt。

## 3. 正式新增的公开包入口

```js
import {compileDisV020Aot, buildDisV020Aot}
  from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot}
  from '@kaicreator/domain-harness-microkernel/dis-v020';
import {qualifyDisV020Artifact, DIS_V020_AOT}
  from '@kaicreator/domain-harness-contracts/dis-v020';
```

这些 API 的实现**位于现有正式 BUILD / Contracts / Microkernel 包**，并提供对应 TypeScript `.d.mts` 类型声明及 npm `exports`；不是只在 examples 中可调用的 Sidecar。新的子路径采取增量版本命名，不改变已有 v0.10 `load()` Facade、原始 BUILD 格式 `dh.v10.build/1` 或旧版 SDK/ABI。声明 `V10BuiltApp` 是底层部署目标，不意味着将旧 SDK 突然改名为 v0.2。

## 4. 执行生命周期

`Forge/Producer → canonical BUILD 选定 Package/Route → compileDisV020Aot 绑定真实 Element/Function/来源 → 可信安装 Digest → loadDisV020Aot 复核 → 真实 Microkernel load → Business App Init → Function invoke`。

- LOCAL 返回 `OBSERVATION/NONE`，不创建真实 KDP Intent 或外部 Effect；有状态对象由应用方可信代码负责生命周期。
- KDP_INTENT 调用底层 public `DomainApp.send`，并透传真实 KDP 回执，外层只标记为 `KDP_RECEIPT/KDP`；`admitted`、`pending`、`UNKNOWN` 的语义仍归 KDP，不自行提升为物理终态。
- `stop()` 关闭入口并关闭底层 SDK；非法 Input、错误来源、错误函数、隐式 Effect 升级、重复 Init、依赖环/缺失统一 fail-closed。
- `sources` 及 built 均为无动态加载路径的受控产物；**自建封闭代码是可信的**，任意敌意原生模块 OS 沙箱不属于用户批准的 DIS 0.2 范围。信任域外来源不得自动加入本契约。

## 5. R9 验收方法与边界

本仓库 `examples/dis-v020-native-sdk/native-consumer.test.mjs` 使用 R7 精确原始 Tally/Runx/xDownload 源码、R8 真实 canonical BUILD 和**新的公开 SDK 子路径**执行 17 项真正的 AOT 编译/执行/拒绝/恢复用例；继续在同一 Woodpecker 里执行 R6 物理 SQLite/C01 回归。该测试不是重新发明三个 Domain 的行为，直接调用原始实现并仅提供必要的可信本地注册函数。

本次已实现**正式机器 Contract + BUILD/SDK 原生消费入口**，但仍为 DIS v0.2 R9 候选，不等于三个原产品应用已经迁移到该 SDK；外部真实下载/Agent 执行/GitHub Claim 授权仍归各自 Provider。发布前还须独立 Fresh Exact-SHA Review、Product/L1 冻结与 L2 准入。成功的旧 Demo CI 不能替代当前 R9 精确 SHA 的新流水线。

## 6. R9.1 真实 TypeScript SDK 包消费准入

三个公共包子路径各包含可以随 npm Package 发布的 `.mjs` 实现和 `.d.mts` API 声明；新增 `examples/dis-v020-native-sdk/types-smoke.mts` 用 TypeScript `moduleResolution=NodeNext` 直接从三个正式 npm 包入口导入 `DisV020Aot`、`compileDisV020Aot`、`loadDisV020Aot` 与相关输入/输出类型，并检查 `KDP_RECEIPT` / `OBSERVATION` 的联合结果收窄。在 Woodpecker 的实际 `npm ci && npm run build` 后运行 `tsc -p examples/dis-v020-native-sdk/tsconfig.json`；此项是**包声明兼容性**而不是新模拟 Domain。不得以纯 JS 通过就宣称 `.d.mts` 对外可编译；真实结果须以该次 exact-SHA CI 回执为准。

## 7. R9.2 降级语义的真实修复

进一步对抗审核发现：初版 SDK 对每个 LOCAL 都强制要求实现，实际上让 `optional` Function 无法通过 `DEGRADED` 进入有界的降级模式，可能让一个可选 Runx/Tally 观察者阻塞必需的 KDP 业务。现修复为：**仅可选非 Init LOCAL 实现允许缺席**；Business App Init 必须以 `DEGRADED` 和完整的 `unavailable` Function ID 列表明确承认该缺席，SDK 禁用对应 Function，保留其它真实 Function/KDP 权限的原始语义。未明确声明缺席、把必需 Function 降级、或企图将唯一 Business Init 标成 optional 均 fail-closed。不允许静默将缺席改为 READY。

基于真实 Tally Release Function 和订单 KDP Intent 增加两项用例，不新增虚构 Domain；因此原生 SDK Suite 增至 19 项，DIS 专项总计 95 项。对应每次只认最新提交精确 SHA 的 Woodpecker 成功回执。

## 8. R9.3 三真实项目的 Domain 来源与关系一致性修复

规范的 Domain 不只是代码 Element 集合，也有明确的**来源范围与跨 Element 协作语义**。初版 `sourcePin` 已锁定来源四元组，但仍可把真实 Tally 的 LOCAL Implementation 错误声明在 Runx 领域；同理，`relations[]` 的 `depends-on` 可以与 `dependsOn[]` DAG 相互矛盾。R9.3 为每个 `domains[]` 条目加入非空的 `repositories[]`（允许一域由多个经批准仓库共同生产），任何 LOCAL Function 的 `sourcePin.origin.repository` 必须属于它所在 Domain 的已声明来源范围；否则 `DIS_SOURCE_DOMAIN_MISMATCH`。并要求每条 `from → to`、`kind=depends-on` 的关系必须得到 `to.dependsOn` 精确支持，否则 `DIS_RELATION_DEPENDENCY_MISMATCH`，确保全局语义不能在 AOT 编译时与依赖 DAG 冲突。

这两项来自 Tally/Runx/xDownload 实际不同源码归属的反事实验证，属于**真实领域约束修复**而非增加模拟产品。R9.3 原生 Suite 为 21 项，连同先前 R6/R7/R8 的 76 项共 **97 项**；必须在最新 Exact-SHA Woodpecker 中通过才能标记完成。这里的 `effect=none` 严格指没有 KDP 外部 Host Effect 的执行权限，并不否认 KDP 内部 Workflow 可以更新其自身状态；不应把它解释成所有内部计算均无状态。

## 9. R9.4 通用 `verify` 静态校验修复

R9.3 精确 SHA `8f78d389ed813a39a8576cfbc329934ef1e59a41` 的 DIS 集成流水线 `2221/1` 和 `verify-min-node` `2221/2` 均 SUCCESS，通用 `verify` `2221/3` FAIL。结合通用 `verify` 包含 `npm run lint` 且 eslint.config.mjs Node 全局定义缺少 `structuredClone`，定位新增 BUILD 子路径三个裸全局调用为可疑失败点。R9.4 在**原 BUILD 单文件写集**中将其改为 `globalThis.structuredClone`，不修改现有 Node 版本规则、ESLint 配置、其他包业务 ABI，也不重跑或派发仅验证任务。本次原因属于源码静态分析，最终是否关闭以 R9.4 精确 SHA **全部三项 CI** 结果为准，不将上一提交的失败误报成已修复。

## 10. R9.5 v0.10 分发清单与 v0.2 增量子路径的精确兼容性修复

通用 `verify` 包含 `v0102-tarball-inventory.test.ts`，其 v0.10 公开包 `exports` **固定白名单**与本次新 `./dis-v020` 增量导出发生冲突。此项是本次原生正式 ABI 修改所必需的分发契约升级，不应为通过验证而放宽导出集合。R9.5 将三个包 Contracts / BUILD / Microkernel 的白名单精确更新为包含 `./dis-v020`，并且独立断言三个包的 subpath 类型路径必须是 `./dis-v020.d.mts`、实现路径必须是 `./dis-v020.mjs`，`files` 白名单和真实 `npm pack --dry-run --json` 清单都必须包含这两份文件。旧 `.` 入口、host-seam、Host Node Provider 的导出完全保留，任意其它导出仍被拒绝。

前一提交还修复新 BUILD 中 ESLint 非白名单裸全局 `structuredClone` 为 `globalThis.structuredClone`；不改全仓库 lint 设置或用户已排除的 OS 沙箱。**原始 `2221/3` verify FAIL 的具体日志在本连接不可读，因此两处是源码与检查规则确认的真实不兼容点，不能冒称已看过日志。全部工作以最新 SHA 的 DIS / Node / 通用 verify 三项 PASS 为准。**
