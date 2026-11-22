/**
 * 发行 SDK 仅封入 App 选择/组合/封存能力。
 * 生成期的源码静态验证由独立生成者执行，不随 SDK composition bundle 分发。
 */
export { composeApp as buildApp } from './build.js';
export type {
  BuildInput,
  BuildResult,
  BuildSuccess,
  BuildFailure,
  KdpArtifactInput,
  AppPackageFile,
  ComposedAppPackage,
} from './types.js';
export { BuildRefusal } from './refusal.js';
export { digestOfBytes } from './resources.js';
