/** v0.10.2 T05: canonical BUILD-only source migration. No runtime or Host imports. */
/**
 * BUILD-only deterministic closure resolution. Pure data, no import/eval,
 * no clock, no authority or runtime ports.
 *
 * Same role-stable DFS order and refusal codes as the v0.10 T00 baseline.
 * Keep this private to BUILD: no new public package API.
 */
import type { V10ModuleRole } from '@kaicreator/domain-harness-contracts';
import { V10BuildError } from '@kaicreator/domain-harness-contracts';

const ROLE_RANK: Record<V10ModuleRole, number> = {
  'kernel-primary': 0,
  'standard-primary': 1,
  'standard-feature': 2,
  business: 3,
  capability: 4,
  'kernel-extension': 5,
};

export interface V10ClosureModule {
  readonly packageId: string;
  readonly role: V10ModuleRole;
  readonly dependencies: readonly string[];
  readonly provides: readonly string[];
  readonly requires: readonly string[];
}

export interface V10SelectedClosure<M extends V10ClosureModule> {
  readonly selectedIds: ReadonlySet<string>;
  readonly byId: ReadonlyMap<string, M>;
  readonly loadOrder: string[];
}

export function resolveV10SelectedClosure<M extends V10ClosureModule>(
  selected: readonly M[],
): V10SelectedClosure<M> {
  const selectedIds = new Set(selected.map((module) => module.packageId));
  for (const module of selected) {
    for (const dependency of module.dependencies) {
      if (!selectedIds.has(dependency)) {
        throw new V10BuildError('V10_DEPENDENCY_MISSING',
          `${module.packageId} declares a dependency on ${dependency} which is not part of the selected closure`);
      }
    }
  }
  const byId = new Map(selected.map((module) => [module.packageId, module]));
  const loadOrder: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (module: M): void => {
    const status = state.get(module.packageId);
    if (status === 'done') return;
    if (status === 'visiting') {
      throw new V10BuildError('V10_DEPENDENCY_CYCLE',
        `the declared dependency graph reaches ${module.packageId} twice; the composition contains a cycle`);
    }
    state.set(module.packageId, 'visiting');
    for (const dependency of module.dependencies) {
      const target = byId.get(dependency);
      if (target !== undefined) visit(target);
    }
    state.set(module.packageId, 'done');
    loadOrder.push(module.packageId);
  };
  for (const module of [...selected].sort((left, right) => ROLE_RANK[left.role] - ROLE_RANK[right.role])) visit(module);

  const provided = new Set(selected.flatMap((module) => [...module.provides]));
  for (const module of selected) {
    for (const feature of module.requires) {
      if (!provided.has(feature)) {
        throw new V10BuildError('V10_FEATURE_MISSING',
          `${module.packageId} requires feature ${feature} which no selected package provides`);
      }
    }
  }
  return { selectedIds, byId, loadOrder };
}
