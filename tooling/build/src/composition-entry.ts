/**
 * 发行 SDK 仅封入 App 选择/组合/封存能力。
 * 生成期的源码静态验证由独立生成者执行，不随 SDK composition bundle 分发。
 */
import { composeApp } from './build.js';
import type { BuildInput, BuildResult } from './types.js';

/** 公开 SDK 仅接受 App 组合输入；不能注入生成期校验回调或访问内部资源作用域。 */
export function buildApp(input: BuildInput): BuildResult {
  return composeApp(input);
}
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
