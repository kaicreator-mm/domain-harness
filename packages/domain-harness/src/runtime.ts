/**
 * 嵌入 Domain App 的运行时 SDK 入口。
 * 只依赖公开 Contracts 与唯一 Boot/KDP，不加载作者期 Package 组合/BUILD 实现。
 * 已封存的 Package/Lock/Pin 仍由 Boot 做必要可信校验。
 */
export * from '@kaicreator/domain-harness-contracts';
// 公开 SDK 只能通过 Boot Pin 进入受信 KDP；Host-only 服务与私有 Runtime 实现由
// 真实 KDP Package 承载，不再向 Host 暴露（Foundation A6/R130）。
export { boot } from '@kaicreator/domain-harness-microkernel';
