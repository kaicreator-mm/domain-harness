// 当前唯一 KDP：Boot 验证选定资源，初始化 Package 后才开放业务入口。
export { boot } from './boot.js';
export { bootstrap } from './kdp.js';
export { installProcessExitHandoff } from './process-exit.js';
export type { ProcessExitEvent, ProcessExitHost } from './process-exit.js';

export type * from '@kaicreator/domain-harness-contracts';
