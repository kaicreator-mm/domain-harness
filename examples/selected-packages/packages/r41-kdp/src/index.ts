// r41-kdp 唯一受选 Target 入口：init 是真实 KDP Host Init（kernelLifecycle Element），
// exit 是本 Package 的 Exit Element。引擎实现全部在本 Package 私有 src 内编译/bundle 进
// dist 闭包；本文件不再从 SDK microkernel 导入或转调任何激活逻辑（Foundation A6/R130）。
import { activateKernelLifecycle } from './kernel-lifecycle.js';
import type { KdpBootstrapContext, KdpBootstrapResult, PackageExitContext } from '@kaicreator/domain-harness-contracts';

/** r41 示例 Package 家族共享的进程内生命周期跟踪事件（观测约定，不是机器合同）。 */
function lifecycleEvents(): Array<Record<string, unknown>> {
  const owner = globalThis as { __dhR41Events?: Array<Record<string, unknown>> };
  return (owner.__dhR41Events ??= []);
}

/** 唯一 KDP Host Init：由可信 Boot 单次调用，进入本 Package 私有引擎完成激活。 */
export async function init(context: KdpBootstrapContext): Promise<KdpBootstrapResult> {
  return activateKernelLifecycle(context);
}

/** 本 Package 的真实 Exit Element：由引擎按真实进入记录逆序调用（KDP 最后）。 */
export function exit(context: PackageExitContext): void {
  lifecycleEvents().push({ phase: 'exit', packageId: context.packageId });
}
