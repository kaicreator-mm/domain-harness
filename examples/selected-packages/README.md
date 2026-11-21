# R41 — 直接编写的多文件 Kernel / SDK / Business Domain Packages

本目录是 **实际仓库文件**，不是测试运行时创建的 Package，也不依赖 DomainForge、Package Generator 或独立 Package Assembly 工具。DomainHarness 是嵌入 Domain App 的 SDK；Boot 是 Package 外的最小技术引导。

| Package | 层级 | Core.Order | App basic | App extended |
| --- | --- | ---: | :---: | :---: |
| `r41-kdp` | kernel / 稳定 KDP | 0 | ✓ | ✓ |
| `r41-sdk-base` | sdk / 基础功能 | 1 | ✓ | ✓ |
| `r41-sdk-extra` | sdk / 按需选用的功能 | 2 | — | ✓ |
| `r41-business` | business / 业务应用 | 3 | ✓ | ✓ |

每个 Package 都直接拥有实际的 `manifest.json`、`definitions/lifecycle.json`、`dist/index.mjs`、`package.json`；KDP 另有 `dist/bootstrap.js` 作为 Boot 技术入口。Manifest 的 ElementRef Digest 使用**定义的规范化 JSON 语义**；ResourceRef Digest 使用**磁盘文件的实际 SHA-256 字节**。文件可直接由开发者/ChatGPT/Agent 修改，但修改任一被引用文件后必须更新相应摘要，否则 BUILD 必须拒绝。

`apps/basic.json` 和 `apps/extended.json` 都选择同一 KDP 和基础 SDK，但后一份还选用 `r41-sdk-extra`，未选 SDK 功能不会进入前者的 Lock/运行安装闭包。Business Core.Order 固定为 3，展示合法的 Order 空档。每个 Core.Init 决定是否调用封存的 `nextCore`；Extension 与 Core 的选定/依赖职责不混同。

`packages/domain-harness/tests/core/static-authored-packages.test.ts` 使用**公共 SDK API** 对这些原始磁盘文件进行 BUILD、Lock、实际 `boot`/Init/Exit 和负例验证。测试中的安装目录与 InstalledRecord/Pin 是消费已有 Package 的安装产物，不创建或修改源 Package 文件。不存在第二 Kernel、运行时动态选择或 Package 生成工具。

本轮 **未实现** 单物理二进制融合（仅明确允许且要求保留逻辑身份/静态权限等价），不授予完整 DIS Conformance，也不代表 R37/R39 所有后续源码整理全部完成。
