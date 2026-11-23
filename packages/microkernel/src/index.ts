// 当前唯一 KDP：公开面仅保留最小可信 Boot（Foundation A6/R130）。
// PackageSystem、Workflow、DomainApp 与 Exit 编排由真实 KDP Package 私有承载，
// 本包不再导出任何 Host 委托或引擎实现符号。
export { boot } from './boot.js';

export type * from '@kaicreator/domain-harness-contracts';
