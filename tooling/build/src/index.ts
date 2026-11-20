/** 构建期职责：校验并封存选定的依赖、资源和函数，保证生成确定性 Lock。 */
export { buildApp } from './build.js';
export type {
  BuildInput,
  BuildResult,
  BuildSuccess,
  BuildFailure,
  KdpArtifactInput,
} from './types.js';
export { BuildRefusal } from './refusal.js';
export { digestOfBytes } from './resources.js';
