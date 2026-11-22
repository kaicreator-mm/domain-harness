/**
 * Package/Element 生成期准入入口；生成者可用独立工具和测试调用。
 * SDK App 组合入口不依赖本模块，不把生成期源码检查打包进 Runtime/Composition。
 */
import type { DomainPackageManifest } from '@kaicreator/domain-harness-contracts';
import { composeApp } from './build.js';
import { BuildRefusal } from './refusal.js';
import { ResourceScope } from './resources.js';
import { verifyGeneratedPackageImports, verifyImplementationExport } from './static-package-guard.js';
import type { BuildInput, BuildResult } from './types.js';

/**
 * 生成阶段以完整的 App 选定 Target 为依据证明源码可执行子集合法。
 * 先使用组合器取得确定性选择结果，随后生成方静态验证，再交付此结果。
 * 组合器不执行候选代码；静态验证失败不会产生可交付的 AppPackage。
 */
export function buildApp(input: BuildInput): BuildResult {
  const composed = composeApp(input);
  if (!composed.ok) return composed;

  try {
    const packageIds = new Set(composed.lock.selectedPackages.map((pkg) => pkg.packageId));
    const manifests = (input.packages as readonly DomainPackageManifest[])
      .filter((pkg) => packageIds.has(pkg.id));
    if (manifests.length !== packageIds.size) {
      return {
        ok: false,
        code: 'DH_BUILD_SCHEMA_INVALID',
        message: 'selected Package manifest is missing from the generated source input',
      };
    }

    const scope = new ResourceScope(input.packageRoots);
    for (const selected of composed.lock.selectedFunctions) {
      verifyImplementationExport(
        scope,
        selected.implementation,
        `${selected.ref.element.id}.${selected.ref.functionId}`,
      );
    }

    verifyGeneratedPackageImports(scope, manifests, [
      ...composed.lock.selectedPackages.map((pkg) => pkg.artifact),
      ...composed.lock.selectedFunctions.map((fn) => fn.implementation.module),
    ]);
    return composed;
  } catch (error) {
    if (error instanceof BuildRefusal) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        ...(error.refPath !== undefined ? { path: error.refPath } : {}),
      };
    }
    throw error;
  }
}
