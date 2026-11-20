// ---- Content kinds and the frozen unknown-kind predicate ----
export const CORE_CONTENT_KINDS = [
    'semantic-model',
    'knowledge',
    'rule',
    'constraint',
    'workflow-definition',
    'state-model',
    'structured-data',
    'interaction',
    'document',
    'validation',
];
export function isUnknownContentKind(kind) {
    return !CORE_CONTENT_KINDS.includes(kind) && !kind.startsWith('dh-ext.');
}
