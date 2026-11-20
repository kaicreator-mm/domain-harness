// 公共 SDK 唯一入口：只组合契约、BUILD 和 Microkernel，不复制实现。
export * from '@kaicreator/domain-harness-contracts';
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
} from '@kaicreator/domain-harness-build';
export { boot, bootstrap } from '@kaicreator/domain-harness-microkernel';
