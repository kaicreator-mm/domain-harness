// 同一个嵌入式 SDK 的公共入口：运行与应用组合分别位于可独立加载的子模块。
// 保持当前 v0.11.x 包根既有导出，避免已验收的 Domain App Consumer 发生无关变化。
export * from './runtime.js';
export * from './composition.js';

// 语言原生 KDP 生命周期 Element；迁移期间旧 ABI 仍未删除。
export * from './kernel-lifecycle.js';
