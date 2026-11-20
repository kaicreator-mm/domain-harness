/** 构建期职责：校验并封存选定的依赖、资源和函数，保证生成确定性 Lock。 */
import type { BuildErrorCode } from '@kaicreator/domain-harness-contracts';

export class BuildRefusal extends Error {
  readonly code: BuildErrorCode;
  readonly refPath: string | undefined;

  constructor(code: BuildErrorCode, message: string, refPath?: string) {
    super(message);
    this.name = 'BuildRefusal';
    this.code = code;
    this.refPath = refPath;
  }
}

export function refusal(
  code: BuildErrorCode,
  message: string,
  refPath?: string,
): BuildRefusal {
  return new BuildRefusal(code, message, refPath);
}
