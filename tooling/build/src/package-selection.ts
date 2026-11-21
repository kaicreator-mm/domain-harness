/**
 * Domain App 的 Package 选定边界。
 * KDP 是唯一必须选定的稳定 Core(Order=0)；SDK 及 Business 功能由
 * App 的显式 Core/Extension 和直接依赖选定，未选的候选 Package 不进入闭包。
 * 本模块只确定身份/依赖闭包，不读文件、不加载代码、不生成 Package。
 */
import type {
  DomainAppDescriptor,
  DomainPackageManifest,
} from '@kaicreator/domain-harness-contracts';
import { refusal } from './refusal.js';
import { satisfiesSemver } from './graph.js';

export interface SelectedPackageClosure {
  readonly selected: Map<string, DomainPackageManifest>;
  readonly dependsOnEdges: Map<string, readonly string[]>;
}

/** 只选择 App 显式要求或直接依赖到的 Package，保留原 BUILD 拒绝语义。 */
export function selectPackageClosure(
  descriptor: DomainAppDescriptor,
  pool: ReadonlyMap<string, DomainPackageManifest>,
): SelectedPackageClosure {
  // 第 2 段：从唯一 KDP 与 BUILD 选定的任意数量 Core 出发，沿 dependsOn 扩展闭包。
  const selected = new Map<string, DomainPackageManifest>();
  const rootCoreIds = new Set<string>();
  const selectCore = (
    ref: DomainAppDescriptor['roots']['cores'][number],
    slot: string,
    requiredLayer?: 'kernel',
  ): void => {
    const manifest = pool.get(ref.package);
    if (!manifest || manifest.version !== ref.version) {
      throw refusal(
        'DH_BUILD_REF_UNRESOLVED',
        `descriptor roots.${slot} references '${ref.package}@${ref.version}' which is not in the package pool`,
        `roots.${slot}`,
      );
    }
    if (manifest.role !== 'primary') {
      throw refusal(
        'DH_BUILD_LAYER_ROLE_MISMATCH',
        `roots.${slot} package '${ref.package}' declares role='${manifest.role}'; a Core root must reference a primary package`,
        `roots.${slot}`,
      );
    }
    if (requiredLayer !== undefined && manifest.layer !== requiredLayer) {
      throw refusal(
        'DH_BUILD_PRIMARY_MISSING',
        `roots.${slot} package '${ref.package}' declares layer='${manifest.layer}'; KDP must be the kernel Core`,
        `roots.${slot}`,
      );
    }
    if (rootCoreIds.has(manifest.id)) {
      throw refusal('DH_BUILD_PRIMARY_DUPLICATE', `Core '${manifest.id}' is selected by more than one root entry`);
    }
    rootCoreIds.add(manifest.id);
    selected.set(manifest.id, manifest);
  };
  selectCore(descriptor.roots.kernelPrimary, 'kernelPrimary', 'kernel');
  descriptor.roots.cores.forEach((ref, index) => selectCore(ref, `cores[${index}]`));
  for (const [index, ref] of descriptor.extensions.entries()) {
    const manifest = pool.get(ref.package);
    if (!manifest || manifest.version !== ref.version) {
      throw refusal(
        'DH_BUILD_REF_UNRESOLVED',
        `descriptor extensions[${index}] references '${ref.package}@${ref.version}' which is not in the package pool`,
        `extensions[${index}]`,
      );
    }
    selected.set(manifest.id, manifest);
  }

  const queue = [...selected.keys()].sort();
  const dependsOnEdges = new Map<string, readonly string[]>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    const manifest = selected.get(id)!;
    const edges: string[] = [];
    for (const dep of manifest.dependsOn) {
      const targetManifest = pool.get(dep.package);
      if (!targetManifest || !satisfiesSemver(targetManifest.version, dep.version)) {
        throw refusal(
          'DH_BUILD_DEPENDS_ON_UNSELECTED',
          `'${id}' depends on '${dep.package}@${dep.version}' which is not selected and cannot be resolved`,
          'dependsOn',
        );
      }
      const exportedInterfaces = new Set(
        targetManifest.exports
          .map((entry) => entry.interfaceId)
          .filter((value): value is string => value !== undefined),
      );
      if (!exportedInterfaces.has(dep.interface)) {
        throw refusal(
          'DH_BUILD_EXPORT_MISSING',
          `'${id}' depends on interface '${dep.interface}' which '${dep.package}' does not export`,
          'dependsOn',
        );
      }
      edges.push(dep.package);
      if (!selected.has(dep.package)) {
        selected.set(dep.package, targetManifest);
        queue.push(dep.package);
        queue.sort();
      }
    }
    dependsOnEdges.set(id, edges);
  }

  for (const manifest of selected.values()) {
    if (manifest.role === 'primary' && !rootCoreIds.has(manifest.id)) {
      throw refusal(
        'DH_BUILD_PRIMARY_MISSING',
        `selected Core '${manifest.id}' is not declared in descriptor roots; every Core must be BUILD-selected explicitly`,
      );
    }
  }
  return { selected, dependsOnEdges };
}
