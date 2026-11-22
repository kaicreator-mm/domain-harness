# @kaicreator/domain-harness

DomainHarness v0.11.x 是嵌入 Domain App 的单一 SDK 产品。Boot 位于 Package 外，KDP 是稳定 Kernel 部分；每个 App 从实际多文件 SDK/Business Domain Packages 中选定所需能力。不引入 Forge、Package Generator 或第二套 Runtime。

## 公共 API

- `@kaicreator/domain-harness/runtime`：**运行中的 Domain App** 使用；只重导出公共 Contracts 和 Boot/KDP API，不导入 `tooling/build`。已选 Package/Lock/Pin 的启动可信校验仍由 Boot/KDP 执行。
- `@kaicreator/domain-harness/composition`：**选择和封存现有 Domain Packages** 时使用；提供当前 `buildApp`、构建结果/错误和字节摘要辅助 API；不负责创建 Domain Package 文件。
- `@kaicreator/domain-harness`：同一 SDK 的统一公共包根，继续组合前述能力；不另立 BUILD 平台或第二 Kernel。

子路径是**同一个 SDK 产品**的加载/安装职责分离，不创建第二 SDK/Kernel。运行时必需依赖只有 Contracts 与 Microkernel；BUILD 实现是 **可选 Peer**（固定当前 `0.11.0`），npm 不应因纯 Runtime Consumer 自动安装。需要应用组合能力时，Consumer 应明确安装同版本 `@kaicreator/domain-harness-build`，再导入 `@kaicreator/domain-harness/composition` 或公共包根；**未安装 BUILD 时仅导入 `/runtime`，不能导入包根或 `/composition`**（ESM 会因缺少声明的可选 Peer 而拒绝）。

```js
// 已选 Domain App Package/Lock/Pin 的纯运行场景
import { boot } from '@kaicreator/domain-harness/runtime';

// 组合已有 Domain Packages 的构建场景：需显式安装同版 -build Peer
import { buildApp } from '@kaicreator/domain-harness/composition';
```

外部 clean-packed Consumer 应验证：仅安装 SDK + Contracts + Microkernel 时，不出现 BUILD/TypeScript/Ajv，`/runtime` 可正常导入且 `/composition` 拒绝；显式安装四包时，既有 root `buildApp`/Boot 端到端验收保持不变。此处仅为 Node/npm 版 SDK 入口与安装的分离，不涉及物理 KDP/SDK 二进制融合。

## 阅读入口

[源码逻辑与完整调用流程](../../docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md) · [R39 Package/SDK 分层](../../docs/specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)
