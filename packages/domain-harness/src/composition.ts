/**
 * Domain App 组合时使用的 SDK 入口。
 * 从已经编写的 Package 文件选择、验证和封存确定性 App；
 * 不创建 Domain Package，也不依赖 Forge/Package Generator。
 */
export {
  buildApp,
  BuildRefusal,
  digestOfBytes,
} from '@kaicreator/domain-harness-build';
export type {
  BuildInput,
  BuildResult,
  BuildSuccess,
  BuildFailure,
  KdpArtifactInput,
  AppPackageFile,
  ComposedAppPackage,
} from '@kaicreator/domain-harness-build';
