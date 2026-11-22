/**
 * DomainHarness SDK 内部的 Package 选择、校验与组合入口。
 * 本文件定义稳定公开 TypeScript 类型；发布的 dist/composition.js
 * 由同一仓库的内部组合实现构建并封入 SDK，无任何外部 BUILD 包。
 * 不生成 Domain Package，不引入 Forge 或第二个运行时。
 */
import type { BuildErrorCode, ContentDigest } from '@kaicreator/domain-harness-contracts';
import type { BuildInput, BuildResult } from './composition-types.js';

export type {
  BuildInput,
  BuildResult,
  BuildSuccess,
  BuildFailure,
  KdpArtifactInput,
  AppPackageFile,
  ComposedAppPackage,
} from './composition-types.js';

/** 确定性地验证并封存用户已提供的 Domain Packages。 */
export declare function buildApp(input: BuildInput): BuildResult;

/** BUILD 阶段的稳定拒绝错误，归属 SDK 的组合能力而非独立产品。 */
export declare class BuildRefusal extends Error {
  readonly code: BuildErrorCode;
  readonly refPath: string | undefined;
  constructor(code: BuildErrorCode, message: string, refPath?: string);
}

/** 用于验证已有 Package 资源的字节摘要。 */
export declare function digestOfBytes(bytes: Uint8Array): ContentDigest;
