/**
 * 嵌入 Domain App 的运行时 SDK 入口。
 * 只依赖公开 Contracts 与唯一 Boot/KDP，不加载作者期 Package 组合/BUILD 实现。
 * 已封存的 Package/Lock/Pin 仍由 Boot 做必要可信校验。
 */
export * from '@kaicreator/domain-harness-contracts';
export { boot, bootstrap, installProcessExitHandoff } from '@kaicreator/domain-harness-microkernel';
export type { ProcessExitEvent, ProcessExitHost } from '@kaicreator/domain-harness-microkernel';
