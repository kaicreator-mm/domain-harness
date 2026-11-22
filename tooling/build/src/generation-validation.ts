/**
 * Package/Element 生成期独立准入；SDK 发行构建不导入本模块。
 * 人、Agent 或任何生成工具可在交付前调用，用静态证明拒绝不合格源码。
 */
import { composeApp } from './build.js';
import { verifyGeneratedPackageImports, verifyImplementationExport } from './static-package-guard.js';
import type { BuildInput, BuildResult } from './types.js';

/**
 * 生成期验证与 App 组合共用同一个受选闭包和资源作用域。
 * 静态验证在输出 Lock/安装产物之前执行，形成完整传递资源封存。
 */
export function buildApp(input: BuildInput): BuildResult {
  return composeApp(input, (scope, manifests, artifacts, functions) => {
    for (const selected of functions) {
      verifyImplementationExport(
        scope,
        selected.implementation,
        `${selected.ref.element.id}.${selected.ref.functionId}`,
      );
    }
    verifyGeneratedPackageImports(scope, manifests, artifacts);
  });
}
