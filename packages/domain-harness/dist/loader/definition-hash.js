import { createHash } from 'node:crypto';
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === 'object') {
        const source = value;
        return Object.fromEntries(Object.keys(source)
            .sort()
            .map((key) => [key, canonicalize(source[key])]));
    }
    return value;
}
function sortedEntries(map) {
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
function workflowDefinition(workflow) {
    const { sourcePath: _sourcePath, ...definition } = workflow;
    return definition;
}
function skillDefinition(skill) {
    const { directory: _directory, ...definition } = skill;
    return definition;
}
export function buildDefinitionHash(harness) {
    const payload = {
        manifest: harness.manifest,
        // Deployment paths are diagnostic metadata, not Runtime definition. Hash
        // logical definitions and frozen asset contents so relocating an identical
        // Harness does not invalidate active Runs.
        workflows: sortedEntries(harness.workflows)
            .map(([id, workflow]) => [id, workflowDefinition(workflow)]),
        childDependencies: sortedEntries(harness.childDependencies),
        skills: sortedEntries(harness.skills)
            .map(([id, skill]) => [id, skillDefinition(skill)]),
        scripts: sortedEntries(harness.scripts),
        schemas: sortedEntries(harness.schemas),
    };
    return createHash('sha256')
        .update(JSON.stringify(canonicalize(payload)))
        .digest('hex');
}
//# sourceMappingURL=definition-hash.js.map