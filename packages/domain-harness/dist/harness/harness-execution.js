import { canonicalizeJson, isContentDigest } from '../contracts/identity.js';
import { validateObservedDependencySet, } from '../semantic-cache/exact-semantic-cache.js';
import { createHarnessExecutionOperationIdentity, executeJournaledHarnessOperation, } from './execution-journal.js';
export class HarnessExecutionIntegrationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'HarnessExecutionIntegrationError';
        this.code = code;
    }
}
function asRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return null;
    return value;
}
function errorMessage(value) {
    return value instanceof Error ? value.message : String(value);
}
function captureReturned(value) {
    try {
        return { kind: 'returned', value: canonicalizeJson(value) };
    }
    catch (error) {
        return { kind: 'invalid-output', message: errorMessage(error) };
    }
}
async function captureCall(signal, invoke) {
    try {
        const value = await invoke();
        if (signal.aborted)
            throw new Error('operation cancelled after external completion before journal commit');
        return { status: 'succeeded', value: captureReturned(value) };
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        return {
            status: 'succeeded',
            value: { kind: 'threw', message: errorMessage(error) },
        };
    }
}
function decodeCaptured(outcome) {
    if (outcome.status === 'failed') {
        return { kind: 'invalid-output', message: `${outcome.code}: ${outcome.message}` };
    }
    const record = asRecord(outcome.value);
    if (record === null || typeof record.kind !== 'string') {
        return { kind: 'invalid-output', message: 'committed operation outcome is not a captured call' };
    }
    if (record.kind === 'returned' && Object.prototype.hasOwnProperty.call(record, 'value')) {
        return { kind: 'returned', value: canonicalizeJson(record.value) };
    }
    if ((record.kind === 'threw' || record.kind === 'invalid-output')
        && typeof record.message === 'string') {
        return { kind: record.kind, message: record.message };
    }
    return { kind: 'invalid-output', message: 'committed operation outcome has an invalid capture envelope' };
}
function artifactKey(value) {
    return `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
}
function projectionKey(value) {
    return `${value.source}\u0000${value.projectionId}\u0000${value.descriptorDigest}\u0000${value.valueDigest}`;
}
function revisionKey(value) {
    return `${value.sourceId}\u0000${value.revision}`;
}
function exactArtifact(value) {
    return { kind: value.kind, artifactId: value.artifactId, contentDigest: value.contentDigest };
}
function dedupeBy(values, keyOf) {
    const map = new Map();
    for (const value of values)
        map.set(keyOf(value), value);
    return [...map.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([, value]) => value);
}
function normalizeSemanticDependencies(value = {}) {
    return {
        artifacts: dedupeBy((value.artifacts ?? []).map(exactArtifact), artifactKey),
        projections: dedupeBy((value.projections ?? []).map((projection) => ({
            source: projection.source,
            projectionId: projection.projectionId,
            descriptorDigest: projection.descriptorDigest,
            valueDigest: projection.valueDigest,
        })), projectionKey),
        revisions: dedupeBy((value.revisions ?? []).map((revision) => ({
            sourceId: revision.sourceId,
            revision: revision.revision,
        })), revisionKey),
        unversionedLiveSourceIds: [],
    };
}
function validateSelectedProvenance(input) {
    for (const dependency of input.selectedDependencies ?? []) {
        const value = dependency;
        if ((value.kind !== 'domain-fact' && value.kind !== 'compiled-intelligence')
            || typeof value.identity !== 'string'
            || value.identity.trim().length === 0) {
            throw new HarnessExecutionIntegrationError('INVALID_SELECTED_DEPENDENCY_PROVENANCE', 'selectedDependencies may contain only runtime-validated domain-fact/compiled-intelligence provenance');
        }
    }
}
function validateHarnessProducerIdentity(identity) {
    if (identity.kind !== 'harness-config'
        || identity.artifactId.trim().length === 0
        || !isContentDigest(identity.contentDigest)) {
        throw new HarnessExecutionIntegrationError('INVALID_HARNESS_PRODUCER_IDENTITY', 'Harness execution must bind an exact harness-config producer identity');
    }
}
function validateToolIdentity(capabilityId, identity) {
    if (identity === undefined)
        return;
    if (identity.kind !== 'tool'
        || identity.artifactId.trim().length === 0
        || !isContentDigest(identity.contentDigest)) {
        throw new HarnessExecutionIntegrationError('INVALID_CAPABILITY_SEMANTIC_IDENTITY', `capability ${capabilityId} must bind an exact tool artifact identity`);
    }
}
function parseQueryDependency(value) {
    const output = asRecord(value);
    if (output === null || !Object.prototype.hasOwnProperty.call(output, 'value'))
        return 'invalid';
    if (!Object.prototype.hasOwnProperty.call(output, 'dependency'))
        return null;
    const dependency = asRecord(output.dependency);
    if (dependency === null)
        return 'invalid';
    const keys = Object.keys(dependency);
    if (!keys.every((key) => key === 'kind' || key === 'identity' || key === 'revision'))
        return 'invalid';
    if (dependency.kind !== 'query'
        || typeof dependency.identity !== 'string'
        || dependency.identity.trim().length === 0)
        return 'invalid';
    if (dependency.revision !== undefined
        && (typeof dependency.revision !== 'string' || dependency.revision.trim().length === 0))
        return 'invalid';
    return {
        kind: 'query',
        identity: dependency.identity,
        ...(dependency.revision === undefined ? {} : { revision: dependency.revision }),
    };
}
function invalidQueryResult(message) {
    // Intentionally omits the required `value` key so the existing HarnessMachine
    // fails closed through its QUERY_OUTPUT_INVALID contract.
    return { journalIntegrationError: message };
}
function cloneInputWithWrappers(options, evidence, semantic, tools, setJournalFailure) {
    let aiOrdinal = 0;
    let queryOrdinal = 0;
    const wrappedModel = {
        async generate(request, signal) {
            aiOrdinal += 1;
            const identity = await createHarnessExecutionOperationIdentity(options.execution, 'ai', aiOrdinal, canonicalizeJson({ request }));
            const result = await executeJournaledHarnessOperation(options.execution.journal, identity, signal, async () => captureCall(signal, () => options.input.model.generate(request, signal)));
            if (result.status === 'cancelled')
                throw new Error('journaled model operation cancelled');
            if (result.status === 'journal-failure') {
                setJournalFailure({
                    code: result.code,
                    message: result.message,
                    operationKind: 'ai',
                    operationOrdinal: aiOrdinal,
                });
                throw new Error(`Harness execution journal ${result.code}: ${result.message}`);
            }
            evidence.push(result.evidence);
            const captured = decodeCaptured(result.evidence.outcome);
            if (captured.kind === 'threw')
                throw new Error(captured.message);
            if (captured.kind === 'invalid-output') {
                throw new Error(`model output is not journal-safe canonical JSON: ${captured.message}`);
            }
            return captured.value;
        },
    };
    const wrappedCapabilities = options.input.capabilities.map((capability) => {
        if (capability.kind !== 'query')
            return capability;
        const toolIdentity = options.capabilitySemanticIdentities?.[capability.capabilityId];
        validateToolIdentity(capability.capabilityId, toolIdentity);
        return {
            ...capability,
            async execute(value, signal) {
                queryOrdinal += 1;
                const identity = await createHarnessExecutionOperationIdentity(options.execution, 'query', queryOrdinal, canonicalizeJson({
                    capabilityId: capability.capabilityId,
                    description: capability.description,
                    inputSchema: capability.inputSchema ?? null,
                    input: value,
                    toolIdentity: toolIdentity === undefined ? null : exactArtifact(toolIdentity),
                }));
                const result = await executeJournaledHarnessOperation(options.execution.journal, identity, signal, async () => captureCall(signal, () => capability.execute(value, signal)));
                if (result.status === 'cancelled')
                    throw new Error('journaled query operation cancelled');
                if (result.status === 'journal-failure') {
                    setJournalFailure({
                        code: result.code,
                        message: result.message,
                        operationKind: 'query',
                        operationOrdinal: queryOrdinal,
                    });
                    return invalidQueryResult(`Harness execution journal ${result.code}`);
                }
                evidence.push(result.evidence);
                if (toolIdentity !== undefined) {
                    const exact = exactArtifact(toolIdentity);
                    tools.push(exact);
                    semantic.artifacts = dedupeBy([...semantic.artifacts, exact], artifactKey);
                }
                else {
                    semantic.unversionedLiveSourceIds = dedupeBy([...semantic.unversionedLiveSourceIds, `tool:${capability.capabilityId}`], (item) => item);
                }
                const captured = decodeCaptured(result.evidence.outcome);
                if (captured.kind === 'threw') {
                    semantic.unversionedLiveSourceIds = dedupeBy([...semantic.unversionedLiveSourceIds, `query:${capability.capabilityId}`], (item) => item);
                    throw new Error(captured.message);
                }
                if (captured.kind === 'invalid-output') {
                    return invalidQueryResult(`query output is not journal-safe canonical JSON: ${captured.message}`);
                }
                const dependency = parseQueryDependency(captured.value);
                if (dependency === 'invalid') {
                    return invalidQueryResult('query dependency provenance must be an actual kind=query observation');
                }
                if (dependency === null) {
                    semantic.unversionedLiveSourceIds = dedupeBy([...semantic.unversionedLiveSourceIds, `query:${capability.capabilityId}`], (item) => item);
                }
                else if (dependency.revision === undefined) {
                    semantic.unversionedLiveSourceIds = dedupeBy([...semantic.unversionedLiveSourceIds, dependency.identity], (item) => item);
                }
                else {
                    semantic.revisions = dedupeBy([
                        ...semantic.revisions,
                        { sourceId: dependency.identity, revision: dependency.revision },
                    ], revisionKey);
                }
                return captured.value;
            },
        };
    });
    return {
        ...options.input,
        model: wrappedModel,
        capabilities: wrappedCapabilities,
    };
}
/**
 * Integrate durable AI/query execution facts around one existing HarnessMachine
 * invocation without creating a second workflow/runtime authority.
 */
export function createJournaledHarnessExecutionIntegration(options) {
    validateSelectedProvenance(options.input);
    validateHarnessProducerIdentity(options.harnessProducerIdentity);
    const evidence = [];
    const producerIdentity = exactArtifact(options.harnessProducerIdentity);
    const semantic = normalizeSemanticDependencies(options.selectedSemanticDependencies);
    semantic.artifacts = dedupeBy([...semantic.artifacts, producerIdentity], artifactKey);
    const tools = [];
    let journalFailure;
    let completed = false;
    const input = cloneInputWithWrappers(options, evidence, semantic, tools, (value) => {
        journalFailure ??= value;
    });
    return {
        input,
        complete(result) {
            if (completed)
                throw new Error('journaled Harness execution may be completed only once');
            completed = true;
            const semanticObserved = {
                artifacts: dedupeBy(semantic.artifacts, artifactKey),
                projections: dedupeBy(semantic.projections, projectionKey),
                revisions: dedupeBy(semantic.revisions, revisionKey),
                unversionedLiveSourceIds: dedupeBy(semantic.unversionedLiveSourceIds, (item) => item),
            };
            let cacheWriteEligibility;
            if (result.status !== 'ok') {
                cacheWriteEligibility = { eligible: false, reason: 'harness-not-successful' };
            }
            else if (options.cachePreReadDependencies === undefined) {
                cacheWriteEligibility = { eligible: false, reason: 'pre-read-ineligible' };
            }
            else {
                const validation = validateObservedDependencySet(options.cachePreReadDependencies, semanticObserved);
                cacheWriteEligibility = validation.eligible
                    ? { eligible: true }
                    : { eligible: false, reason: validation.reason, identity: validation.identity };
            }
            const observedDependencies = {
                provenance: result.observedDependencies,
                semantic: semanticObserved,
                toolArtifacts: dedupeBy(tools, artifactKey),
            };
            return {
                harnessResult: result,
                observedDependencies,
                cacheWriteEligibility,
                cacheWriteHandoff: {
                    producerIdentity,
                    observedDependencies: semanticObserved,
                    dependencyEligibility: cacheWriteEligibility,
                },
                journalEvidence: [...evidence],
                ...(journalFailure === undefined ? {} : { journalFailure }),
            };
        },
    };
}
//# sourceMappingURL=harness-execution.js.map