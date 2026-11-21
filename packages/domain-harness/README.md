# @kaicreator/domain-harness

当前 v0.11.0 代码模块。仅通过包根导出；不含旧版兼容入口。

## 阅读入口

[源码逻辑与完整调用流程](../../docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md)：本包仅以单一公共 SDK 包根统一导出 Contracts、`buildApp` 和 `boot`，避免复制 BUILD/Microkernel 实现。
