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
