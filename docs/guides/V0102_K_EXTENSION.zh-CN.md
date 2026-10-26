# v0.10.2 K 扩展指南

> 语言：中文。英文对应文档：`V0102_K_EXTENSION.md`。

K Primary 是**唯一一个**单独选定的 Domain Package，独占 state、admission、journal、effect permit、UNKNOWN 与 replay。额外的 K 扩展**只是 advisory（建议性）**；它不能变成另一个 Primary，也不能靠命名一个 Hook 就声索 K 权威。

编写一个导出有界 advisory 函数的 ESM 模块，然后为它提供选定的 `kernel-extension` BUILD 输入：精确的 `dh.v10.kernel-extension/1`、稳定的 `providerId`、`hookExport`、源码字节与 SHA256。Component 编写声明使用 `class:'hook'`、`kind:'kernel-advisory'`、`modulePackageId`，以及与 `hookExport` 完全相等的 `entry`。builder 校验的是选定引用；它从不仅为了“发现模块”而去执行一个模块。

既有已检查参考：`examples/v010-clean-consumer/apps/rich/app-definition.mjs` 选定了两个不同的 advisory K 扩展。`tooling/build/tests/component-view.test.ts` 检查 projection 身份。build 之后在 Node24 上运行它。验证以下负例：重复的 `providerId`、未声明的 Hook 导出，以及尝试 `lifecycle`/event/observer Hook 的拒绝；`projectSelectedComponents` 必须拒绝不受支持的 kind。

Host 启动可以提供物理资源，但 K 的状态迁移/effect 权威绝不委托给该扩展。本版本没有通用的全新 `onInit/onDispose` 注册 ABI：选定的激活会绑定 advisory，并经 Microkernel lifecycle 反向释放。本指南描述的是已发布契约，**不是**一个独立验证过的第三方 K 扩展构建结果；Issue #1379 保留 Node24 外部模板验收门。
