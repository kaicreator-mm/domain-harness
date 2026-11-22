# @kaicreator/domain-harness

DomainHarness v0.11.x 是嵌入 Domain App 的单一 SDK 产品。Boot 位于 Package 外，KDP 是稳定 Kernel 部分；每个 App 从实际多文件 SDK/Business Domain Packages 中选定所需能力。不引入 Forge、Package Generator 或第二套 Runtime。

## 公共 API

- `@kaicreator/domain-harness/runtime`：**运行中的 Domain App** 使用；只重导出公共 Contracts 和 Boot/KDP API，不导入 `tooling/build`。已选 Package/Lock/Pin 的启动可信校验仍由 Boot/KDP 执行。
- `@kaicreator/domain-harness/composition`：**选择和封存现有 Domain Packages** 时使用；提供当前 `buildApp`、构建结果/错误和字节摘要辅助 API；不负责创建 Domain Package 文件。
- `@kaicreator/domain-harness`：同一 SDK 的统一公共包根，继续组合前述能力；不另立 BUILD 平台或第二 Kernel。

子路径是**按加载职责分离的公共 API**，不是另一个 SDK 产品。当前包根仍直接依赖 `@kaicreator/domain-harness-build`，因此此步骤只实现 **runtime import 不求值 BUILD 模块**，**不声称** runtime-only npm 安装已移除其构建依赖。后续应基于真正干净的外部安装记录，评估是否需要进一步拆分安装期可选依赖，而不影响使用现有 Package 的普通 Domain App。

## 阅读入口

[源码逻辑与完整调用流程](../../docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md) · [R39 Package/SDK 分层](../../docs/specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)
