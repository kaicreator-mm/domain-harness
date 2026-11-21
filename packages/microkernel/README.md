# @kaicreator/domain-harness-microkernel

当前 v0.11.0 代码模块。仅通过包根导出；不含旧版兼容入口。

## 阅读入口

[源码逻辑与完整调用流程](../../docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md)：`boot` 验证安装记录/Pin/Lock/KDP 字节后才导入入口；`bootstrap` 复验、初始化 Package/Hook/App Init；`DomainApp` 负责调用、检查与释放。
