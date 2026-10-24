import { V10BuildError } from '@kaicreator/domain-harness-contracts';
const ROLE_RANK = {
    'kernel-primary': 0,
    'standard-primary': 1,
    'standard-feature': 2,
    business: 3,
    capability: 4,
    'kernel-extension': 5,
};
export function resolveV10SelectedClosure(selected) {
    const selectedIds = new Set(selected.map((module) => module.packageId));
    for (const module of selected) {
        for (const dependency of module.dependencies) {
            if (!selectedIds.has(dependency)) {
                throw new V10BuildError('V10_DEPENDENCY_MISSING', `${module.packageId} declares a dependency on ${dependency} which is not part of the selected closure`);
            }
        }
    }
    const byId = new Map(selected.map((module) => [module.packageId, module]));
    const loadOrder = [];
    const state = new Map();
    const visit = (module) => {
        const status = state.get(module.packageId);
        if (status === 'done')
            return;
        if (status === 'visiting') {
            throw new V10BuildError('V10_DEPENDENCY_CYCLE', `the declared dependency graph reaches ${module.packageId} twice; the composition contains a cycle`);
        }
        state.set(module.packageId, 'visiting');
        for (const dependency of module.dependencies) {
            const target = byId.get(dependency);
            if (target !== undefined)
                visit(target);
        }
        state.set(module.packageId, 'done');
        loadOrder.push(module.packageId);
    };
    for (const module of [...selected].sort((left, right) => ROLE_RANK[left.role] - ROLE_RANK[right.role]))
        visit(module);
    const provided = new Set(selected.flatMap((module) => [...module.provides]));
    for (const module of selected) {
        for (const feature of module.requires) {
            if (!provided.has(feature)) {
                throw new V10BuildError('V10_FEATURE_MISSING', `${module.packageId} requires feature ${feature} which no selected package provides`);
            }
        }
    }
    return { selectedIds, byId, loadOrder };
}
