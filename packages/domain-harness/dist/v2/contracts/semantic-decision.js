/**
 * v0.6 T001 (issue #497; frozen L2 A2/A7): the compiled first-class Semantic
 * Decision Declaration/Binding.
 *
 * This is an authoring/compiled CONTRACT, not a new execution engine or
 * planner abstraction. It is exactly sufficient to construct the existing
 * `DecisionResolverInvocation` (rule → exact cache → promoted subworkflow →
 * HarnessMachine) and route a validated structured result through the
 * existing Central Admission authority (A2). The invocation/resolve→admit
 * bridge itself is later Runtime integration (T004) and stays outside this
 * contract.
 *
 * Authority boundaries baked into the closed field set (A2 "MUST NOT" list):
 * the declaration can never carry model/provider names or routing policy,
 * engine/XState state ids selected by a model, mutation capabilities,
 * unconstrained Runtime capability lists, goal/obligation/JIT graph
 * definitions, or generic agent memory/planner state. Unknown keys fail
 * closed at compile/load/activation time.
 */
/**
 * Capability id required by every compiled package that carries semantic
 * decision declarations. Added to `manifest.requiredCapabilities` by the
 * compiler, so a target profile or host that does not support compiled
 * semantic decisions fails closed through the existing capability machinery
 * (A7 rule 4) instead of silently ignoring the declaration.
 */
export const SEMANTIC_DECISION_CAPABILITY = 'semantic-decision@1';
/**
 * Exact declaration contract version recorded next to the compiled
 * descriptors. A manifest whose descriptors were produced under a different
 * declaration contract fails closed rather than being interpreted as
 * "latest" (A7 rule 5). Widen this union only with a reviewed successor
 * version and explicit compatibility handling.
 */
export const SEMANTIC_DECISION_CONTRACT_VERSION_V1 = 'semantic-declaration.v1';
const DECISION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DECLARATION_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const DESCRIPTOR_KEYS = [
    'decisionId',
    'inputSelection',
    'resultSchema',
    'allowedOutcomes',
    'allowedEventTypes',
    'queryCapabilityIds',
    'dependencyMaterial',
    'cachePolicy',
    'promotedReference',
    'policy',
    'unavailable',
    'declarationDigest',
];
const DEPENDENCY_MATERIAL_KEYS = ['requiredProjectionIds', 'requiredRevisionSourceIds'];
const HARNESS_POLICY_KEYS = ['maxSteps'];
const CACHE_POLICY_ELIGIBLE_KEYS = ['mode'];
const CACHE_POLICY_BYPASS_KEYS = ['mode', 'reason'];
const PROMOTED_VERSION_KEYS = ['kind', 'artifactId', 'version'];
const PROMOTED_ALIAS_KEYS = ['kind', 'artifactId', 'alias'];
const UNAVAILABLE_FAIL_CLOSED_KEYS = ['kind'];
const UNAVAILABLE_DECLARED_EVENT_KEYS = ['kind', 'eventType', 'outcome'];
const CACHE_BYPASS_REASONS = new Set([
    'non-cacheable',
    'time-sensitive',
    'live-dependency-without-semantic-revision',
    'dynamic-dependency-not-prebound',
    'explicit-domain-policy',
]);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function keyIssues(value, allowed, path) {
    const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
    return unexpected.length ? [`${path} has unsupported keys: ${unexpected.sort().join(', ')}`] : [];
}
function nonEmptyStringIssues(value, path) {
    return typeof value === 'string' && value.length > 0 ? [] : [`${path} must be a non-empty string`];
}
/** Closed string-array validation: non-empty entries, unique, sorted. */
function sortedUniqueStringArrayIssues(value, path, allowEmpty) {
    if (!Array.isArray(value))
        return [`${path} must be an array of strings`];
    if (!allowEmpty && value.length === 0)
        return [`${path} must be a non-empty array`];
    const issues = [];
    for (const [index, entry] of value.entries()) {
        if (typeof entry !== 'string' || entry.length === 0)
            issues.push(`${path}[${index}] must be a non-empty string`);
    }
    if (issues.length > 0)
        return issues;
    const entries = value;
    const unique = new Set(entries);
    if (unique.size !== entries.length)
        issues.push(`${path} must not contain duplicates`);
    const sorted = [...entries].sort();
    if (sorted.some((entry, index) => entry !== entries[index]))
        issues.push(`${path} must be sorted`);
    return issues;
}
function cachePolicyIssues(value, path) {
    if (!isRecord(value))
        return [`${path} must be an object`];
    const mode = value.mode;
    if (mode === 'eligible') {
        return keyIssues(value, CACHE_POLICY_ELIGIBLE_KEYS, path);
    }
    if (mode === 'bypass') {
        const issues = keyIssues(value, CACHE_POLICY_BYPASS_KEYS, path);
        if (typeof value.reason !== 'string' || !CACHE_BYPASS_REASONS.has(value.reason)) {
            issues.push(`${path}.reason must be one of the frozen resolver bypass reasons: ${[...CACHE_BYPASS_REASONS].sort().join(', ')}`);
        }
        return issues;
    }
    return [`${path}.mode must be 'eligible' or 'bypass'`];
}
function promotedReferenceIssues(value, path) {
    if (!isRecord(value))
        return [`${path} must be an object`];
    if (value.kind === 'version') {
        return [
            ...keyIssues(value, PROMOTED_VERSION_KEYS, path),
            ...nonEmptyStringIssues(value.artifactId, `${path}.artifactId`),
            ...nonEmptyStringIssues(value.version, `${path}.version`),
        ];
    }
    if (value.kind === 'alias') {
        return [
            ...keyIssues(value, PROMOTED_ALIAS_KEYS, path),
            ...nonEmptyStringIssues(value.artifactId, `${path}.artifactId`),
            ...nonEmptyStringIssues(value.alias, `${path}.alias`),
        ];
    }
    return [`${path}.kind must be 'version' or 'alias'`];
}
function unavailableIssues(value, path, allowedEventTypes, allowedOutcomes) {
    if (!isRecord(value))
        return [`${path} must be an object`];
    if (value.kind === 'fail-closed') {
        return keyIssues(value, UNAVAILABLE_FAIL_CLOSED_KEYS, path);
    }
    if (value.kind === 'declared-event') {
        const issues = keyIssues(value, UNAVAILABLE_DECLARED_EVENT_KEYS, path);
        for (const field of ['eventType', 'outcome']) {
            if (typeof value[field] !== 'string' || value[field].length === 0) {
                issues.push(`${path}.${field} must be a non-empty string`);
            }
        }
        if (issues.length > 0)
            return issues;
        const eventType = value.eventType;
        const outcome = value.outcome;
        // A3: the Runtime must never choose an undeclared fallback, so the
        // declared disposition can only reference declared finite vocabulary.
        if (!allowedEventTypes.has(eventType)) {
            issues.push(`${path}.eventType '${eventType}' is not in the declaration's allowedEventTypes`);
        }
        if (!allowedOutcomes.has(outcome)) {
            issues.push(`${path}.outcome '${outcome}' is not in the declaration's allowedOutcomes`);
        }
        return issues;
    }
    return [`${path}.kind must be 'fail-closed' or 'declared-event'`];
}
function descriptorIssues(value, path) {
    if (!isRecord(value))
        return [`${path} must be an object`];
    const issues = keyIssues(value, DESCRIPTOR_KEYS, path);
    for (const field of ['decisionId', 'inputSelection']) {
        if (typeof value[field] !== 'string' || value[field].length === 0) {
            issues.push(`${path}.${field} must be a non-empty string`);
        }
    }
    if (typeof value.decisionId === 'string' && !DECISION_ID_PATTERN.test(value.decisionId)) {
        issues.push(`${path}.decisionId must match ${DECISION_ID_PATTERN.source}`);
    }
    if (value.resultSchema === undefined || !isRecord(value.resultSchema)) {
        issues.push(`${path}.resultSchema must be a JSON schema object`);
    }
    issues.push(...sortedUniqueStringArrayIssues(value.allowedOutcomes, `${path}.allowedOutcomes`, false));
    issues.push(...sortedUniqueStringArrayIssues(value.allowedEventTypes, `${path}.allowedEventTypes`, false));
    issues.push(...sortedUniqueStringArrayIssues(value.queryCapabilityIds, `${path}.queryCapabilityIds`, true));
    const dependencyMaterial = value.dependencyMaterial;
    if (!isRecord(dependencyMaterial)) {
        issues.push(`${path}.dependencyMaterial must be an object`);
    }
    else {
        issues.push(...keyIssues(dependencyMaterial, DEPENDENCY_MATERIAL_KEYS, `${path}.dependencyMaterial`));
        issues.push(...sortedUniqueStringArrayIssues(dependencyMaterial.requiredProjectionIds, `${path}.dependencyMaterial.requiredProjectionIds`, true));
        issues.push(...sortedUniqueStringArrayIssues(dependencyMaterial.requiredRevisionSourceIds, `${path}.dependencyMaterial.requiredRevisionSourceIds`, true));
    }
    issues.push(...cachePolicyIssues(value.cachePolicy, `${path}.cachePolicy`));
    if (value.promotedReference !== undefined) {
        issues.push(...promotedReferenceIssues(value.promotedReference, `${path}.promotedReference`));
    }
    const policy = value.policy;
    if (!isRecord(policy)) {
        issues.push(`${path}.policy must be an object`);
    }
    else {
        issues.push(...keyIssues(policy, HARNESS_POLICY_KEYS, `${path}.policy`));
        if (!Number.isSafeInteger(policy.maxSteps) || policy.maxSteps < 1) {
            issues.push(`${path}.policy.maxSteps must be a positive safe integer`);
        }
    }
    const allowedEventTypes = new Set(Array.isArray(value.allowedEventTypes) ? value.allowedEventTypes : []);
    const allowedOutcomes = new Set(Array.isArray(value.allowedOutcomes) ? value.allowedOutcomes : []);
    issues.push(...unavailableIssues(value.unavailable, `${path}.unavailable`, allowedEventTypes, allowedOutcomes));
    if (typeof value.declarationDigest !== 'string' || !DECLARATION_DIGEST_PATTERN.test(value.declarationDigest)) {
        issues.push(`${path}.declarationDigest must be a lowercase sha256 hex digest`);
    }
    return issues;
}
/**
 * Structural validation of the `manifest.semanticDecisions` material.
 * Compiler-independent: used by the compiler's manifest assertion, by
 * manifest-shape activation validation, and by tests, so a hand-built or
 * tampered artifact can never carry a malformed declaration. Package-level
 * reference closure (projections/business sources/tools) requires the whole
 * manifest and is validated by the successor activation validator.
 */
export function semanticDecisionManifestIssues(value) {
    if (!Array.isArray(value))
        return ['manifest.semanticDecisions must be an array'];
    if (value.length === 0)
        return ['manifest.semanticDecisions must not be empty when present'];
    const issues = [];
    const seen = new Set();
    for (const [index, entry] of value.entries()) {
        issues.push(...descriptorIssues(entry, `manifest.semanticDecisions[${index}]`));
        if (isRecord(entry) && typeof entry.decisionId === 'string') {
            if (seen.has(entry.decisionId)) {
                issues.push(`manifest.semanticDecisions contains duplicate decisionId '${entry.decisionId}'`);
            }
            seen.add(entry.decisionId);
        }
    }
    const ordered = value
        .map((entry) => (isRecord(entry) && typeof entry.decisionId === 'string' ? entry.decisionId : undefined))
        .filter((id) => id !== undefined);
    const sorted = [...ordered].sort();
    if (ordered.length === value.length && sorted.some((id, index) => id !== ordered[index])) {
        issues.push('manifest.semanticDecisions must be sorted by decisionId');
    }
    return issues;
}
//# sourceMappingURL=semantic-decision.js.map