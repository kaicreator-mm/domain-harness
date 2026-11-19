# DIS Runtime 0.11.0-dev D3 — 双领域真实端到端消费（Tally + xDownload source-pinned E2E）

Issue: kaicreator-mm/domain-harness#1532。基准 `origin/main` = `b1b2c182`。

本示例在既有已验证 Runtime 面上，用**真实** canonical `buildV10App`（`tooling/build` dist）
组装并引导（public microkernel facade `load()`）两个本质不同的真实领域：

- `tally-engineering`（工程 Claim/Evidence 评估）— 源 Pin 自
  `kaicreator-mm/tally@e9883214`：
  - `snapshots/tally/business.mjs` ← `packages/tally-engineering-business/src/index.mjs`
    （blob `54015fb6…97f4`）
  - `snapshots/tally/release-readiness.mjs` ← `packages/tally-engineering-business/src/release-readiness.mjs`
    （blob `2d4d6e74…88e1`）
- `downloads`（xDownload 确认/受控采集）— 源 Pin 自
  `kaicreator-mm/xDownload@e904f08c`（物化自本仓 #1497 对象库快照，逐字节比对一致）：
  - `snapshots/xdownload/business-download.mjs` ← `packages/download-domain-app/src/business/business-download.mjs`
    （blob `a7dba9a8…cdfc`）
  - `snapshots/xdownload/capability-acquisition-stub.mjs` ← `packages/download-domain-app/src/business/capability-acquisition-stub.mjs`
    （blob `2bfa722f…ef39`）

`manifest.json` 记录每个文件的 `repository` / `sourceCommit` / `originalPath` /
`gitBlob`；测试启动时按 `git hash-object` 语法（`gitBlobSha`）逐文件校验，任何
一个字节漂移都会在装配前 fail-closed（`DIS_SOURCE_BYTES_DRIFT`）。

## 每领域一条 E2E 链

```
领域 manifest 资格化 → 真实 buildV10App 组装 → public load() 引导 →
执行选中 Function → Journal/文档读回
```

- **Tally**：发送已密封路由的 `inspectTaskReadiness` intent，选中 rule Function
  `tally.tasks.assessTaskEvidence` 在真实 Kernel effect 链内执行，结果
  （`OBSERVED_INPUT_ONLY` / `admitted:false` / `taskPass:false`）经 Kernel 持久
  effect journal 读回；随后 `tally.release.projectReleaseReadiness` 消费该
  任务输出（manifest 声明的 `tally.tasks` 静态依赖），诚实保持 `BLOCKED` /
  `authorization:'NONE'`。Business 的 effect handler 经 Kernel 密封 resources
  端口调用本示例自带的**只读观察 capability fixture**
  （`src/capability-tally-observation-fixture.mjs`，非 Pin 源、无
  externalEffect、无网络/GitHub/DB）。
- **Downloads**：选中 knowledge Function
  `downloads.confirmation.describeDownloadPolicy` 被消费（policy 身份、
  intent/effect 绑定、1 MiB profile bound）；`downloads.acquisition.acquire`
  **从未被授权执行**：consumer adapter 拒绝直接调用
  （`DIS_EXTERNAL_EFFECT_KDP_REQUIRED`）；K→C gate 对无 permit 派发 typed 拒绝
  （`V10_EFFECT_PERMIT_REQUIRED`，零 adapter 派发）；Pin 策略自身 guard 对超
  预算 intent 在产生任何 effect 前拒绝（`refuse` 转移，零 effect）；trusted
  Host acquisition bridge 在整个 demo 中从未安装。

## 运行

依赖已按锁文件就位、`npm run build` 已产出 workspace dist 后，从仓根：

```sh
node --import tsx --test "examples/dis-v011-dual-domain/test/"*.test.mjs
```

## 诚实边界（务必阅读）

- 快照是 **test-only fixture**，不是生产分发库；跨项目源 Pin 只是源码引用，
  不改变 Tally / xDownload 任何仓库的治理语义。
- **无**真实 Provider 调用、下载流量、Claim/Release 下载授权、生产 DB、用户数据。
- 文档存储用本示例自带的进程内 plain CAS store（`src/plain-doc-store.mjs`），
  明确**不是**物理宿主/SQLite 证据；物理两进程证明在 runtime 自身的 host 测试
  与 `examples/dis-0.1.0-runtime-consumer`。
- `selected-source` 状态不是任何 Claim/Release/Download 权威：Tally 投影恒
  `BLOCKED`/`advisoryOnly`，acquire 的 external-effect 在本 demo 中永远不被
  授权执行（红线）。
- 本示例不合并、不修改 #1497，不动 `docs/standards/**`，不是 npm workspace
  成员（自带 package.json 仅为本示例标记）。
