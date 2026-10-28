# DomainHarness v0.10.3 — GitHub SDK 安装包

> 这是一份候选分发说明。只有在独立验收与真实 GitHub Release 附件上传之后，以下下载方式才可使用。这不是 npm Registry 发布。

## 版本与原始源码

已发布 Git 源码标签：[v0.10.3](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.3)。Commit 为 061376f4a023070f215f9feffad5c24d96d503cb，Git Tree 为 099cdc831aef63befd62aaede7e7a853d1be468f。

原 Tag 的公开 workspace manifest 仍为 0.10.2-rc.0。分发脚本从这个**不可变的源码版本**构建，只在一次性临时 worktree 中，将四个 npm 包的版本与内部依赖边都改为 0.10.3。**这属于公开披露的包元数据覆盖，不是修改 Tag 或运行时契约。**

四个公共包：

- @kaicreator/domain-harness-contracts
- @kaicreator/domain-harness-microkernel
- @kaicreator/domain-harness-build（仅生产端）
- @kaicreator/domain-harness-host-node（可选 Host）

要求 Node.js >=24。历史私有 workspace 与 Kernel Domain Package 不作为本次安装附件。

## 下游使用方式（附件上传完成后）

1. 从对应 GitHub Release 下载全部四个 .tgz 文件，以及 SHA256SUMS 和 SDK_PROVENANCE.json。
2. 核对文件的 SHA256 与发布清单，并阅读其中标注的原始源码 Tag、commit/tree 和分发脚本 SHA。
3. 在 Node24 项目中，把上述四个包分别声明为本地包依赖。例如 package.json 中写： "@kaicreator/domain-harness-contracts": "file:./vendor/kaicreator-domain-harness-contracts-0.10.3.tgz"。另三个包同理，再执行 npm install。
4. 运行时只选用明确的 K/Microkernel/Host 能力；BUILD 用于生产阶段。下游项目把实际分发包及 SHA256 锁定，避免隐式升级。

**不要用 ^0.10.3 形式的 npm Registry 依赖**：本分发不表示这些 SDK 包已发布到 npmjs.com。其他第三方依赖可能仍需要普通 npm 缓存或网络。

## 构建／验证（授权本地 Agent）

在 distribution/v0.10.3-sdk-tgz 分支，Node24，向仓库之外的绝对空目录输出：

    node scripts/distribution/pack-sdk-v0103.mjs --out C:\xDev\_artifacts\domain-harness-v0103

脚本核查原 Git Tag 与 Git Tree，创建临时 worktree，在覆写元数据前运行 npm ci、build、typecheck、lint 和现有 tarball inventory。随后只在临时工作树改四份 package.json，真实执行四次 npm pack，验证 tarball 内部元数据及 dist 文件，再于新的离线消费项目安装四包并测试 ESM 导入。输出四个 tgz、SHA256SUMS 和 SDK_PROVENANCE.json。**不会执行 npm publish、改写 Git Tag 或自动上传 GitHub。**

独立代码审核、真实 Node24 打包、Tally 和 ai-rexform 下游安装验证及额外分发 RQ 完成前，禁止声称附件可用或发起最终 GitHub Release 上传。

## 安全限制与反馈

公开 SDK 原有 #1437 raw DomainApp.send 不可信嵌套 DTO 的 Effect Journal 污染风险仍在。应用必须独占使用**可信的发送前 Host Gateway**；已经污染的 Case 没有合格的通用恢复。新颖/歧义线上 Guided Journey 模型选步和真实跨任务 Meta 生产闭环分别延期交 ai-rexform F02 与 task-meta/Tally。Hidden 7/7 没有覆盖新 LLM 私有 oracle，属于明确披露范围。

docs/current 和已安装 Agent Skill 仍按原独立授权保持旧版状态，不因本次分发自动切换。下游发现兼容性问题时，在 [DomainHarness Issues](https://github.com/kaicreator-mm/domain-harness/issues) 提交脱敏复现、包 SHA256、预期/实际结果和下游版本，不上传凭据或私人数据。
