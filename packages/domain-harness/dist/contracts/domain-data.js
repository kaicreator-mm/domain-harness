import { computeCanonicalJsonDigest, isContentDigest, } from './identity.js';
export const COMPILED_ARTIFACT_KINDS = [
    'rule',
    'knowledge',
    'skill',
    'tool',
    'output-schema',
    'workflow',
    'promoted-subworkflow',
    'harness-config',
];
export class DomainDataContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'DomainDataContractError';
        this.code = code;
    }
}
function requireNonEmpty(value, label) {
    if (value.length === 0) {
        throw new DomainDataContractError('INVALID_DOMAIN_DATA_IDENTITY', `${label} must be non-empty`);
    }
}
function requireDigest(value, label) {
    if (!isContentDigest(value)) {
        throw new DomainDataContractError('INVALID_DOMAIN_DATA_IDENTITY', `${label} must be a non-empty content digest`);
    }
}
function lexicalCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
function artifactSortKey(identity) {
    return `${identity.kind}\u0000${identity.artifactId}\u0000${identity.contentDigest}`;
}
function projectionSortKey(projection) {
    return `${projection.source}\u0000${projection.projectionId}\u0000${projection.descriptorDigest}`;
}
function revisionSortKey(revision) {
    return `${revision.sourceId}\u0000${revision.revision}`;
}
function pathSortKey(path) {
    return JSON.stringify(path);
}
function normalizeProjectionDefinition(definition) {
    requireNonEmpty(definition.projectionId, 'projectionId');
    const seen = new Set();
    const selectors = [...definition.selectors]
        .map((selector) => ({ path: [...selector.path] }))
        .sort((left, right) => lexicalCompare(pathSortKey(left.path), pathSortKey(right.path)));
    for (const selector of selectors) {
        const key = pathSortKey(selector.path);
        if (seen.has(key)) {
            throw new DomainDataContractError('INVALID_SEMANTIC_PROJECTION', `projection ${definition.projectionId} contains duplicate selector ${key}`);
        }
        seen.add(key);
    }
    return { projectionId: definition.projectionId, source: definition.source, selectors };
}
function validateArtifactIdentity(identity) {
    requireNonEmpty(identity.artifactId, 'artifactId');
    requireDigest(identity.contentDigest, `artifact ${identity.artifactId} contentDigest`);
}
async function verifyProjectionDescriptor(descriptor, sha256) {
    const normalized = normalizeProjectionDefinition(descriptor);
    requireDigest(descriptor.descriptorDigest, `projection ${descriptor.projectionId} descriptorDigest`);
    const actualDescriptorDigest = await computeCanonicalJsonDigest(normalized, sha256);
    if (actualDescriptorDigest !== descriptor.descriptorDigest) {
        throw new DomainDataContractError('INVALID_SEMANTIC_PROJECTION', `projection ${descriptor.projectionId} descriptorDigest does not match its definition`);
    }
    return normalized;
}
function compareBy(key) {
    return (left, right) => lexicalCompare(key(left), key(right));
}
function ensureUnique(values, logicalKey, label) {
    const seen = new Set();
    for (const value of values) {
        const key = logicalKey(value);
        if (seen.has(key)) {
            throw new DomainDataContractError('INVALID_DOMAIN_DATA_IDENTITY', `${label} contains duplicate logical identity ${key}`);
        }
        seen.add(key);
    }
}
export async function compileCompiledArtifactIdentity(descriptor, sha256) {
    requireNonEmpty(descriptor.artifactId, 'artifactId');
    const contentDigest = await computeCanonicalJsonDigest({
        kind: descriptor.kind,
        artifactId: descriptor.artifactId,
        semanticMaterial: descriptor.semanticMaterial,
    }, sha256);
    return descriptor.version === undefined
        ? { kind: descriptor.kind, artifactId: descriptor.artifactId, contentDigest }
        : {
            kind: descriptor.kind,
            artifactId: descriptor.artifactId,
            version: descriptor.version,
            contentDigest,
        };
}
export async function compileSemanticContextProjectionDescriptor(definition, sha256) {
    const normalized = normalizeProjectionDefinition(definition);
    const descriptorDigest = await computeCanonicalJsonDigest(normalized, sha256);
    return { ...normalized, descriptorDigest };
}
function readPath(root, path, projectionId) {
    let current = root;
    for (const segment of path) {
        if (typeof segment === 'number') {
            if (!Number.isSafeInteger(segment) ||
                segment < 0 ||
                !Array.isArray(current) ||
                segment >= current.length) {
                throw new DomainDataContractError('MISSING_SEMANTIC_INPUT', `projection ${projectionId} is missing required path ${pathSortKey(path)}`);
            }
            current = current[segment];
            continue;
        }
        if (typeof current !== 'object' ||
            current === null ||
            Array.isArray(current) ||
            !Object.prototype.hasOwnProperty.call(current, segment)) {
            throw new DomainDataContractError('MISSING_SEMANTIC_INPUT', `projection ${projectionId} is missing required path ${pathSortKey(path)}`);
        }
        current = current[segment];
    }
    if (current === undefined) {
        throw new DomainDataContractError('MISSING_SEMANTIC_INPUT', `projection ${projectionId} resolved undefined at ${pathSortKey(path)}`);
    }
    return current;
}
export async function resolveSemanticContextProjection(descriptor, sourceValue, sha256) {
    const normalized = await verifyProjectionDescriptor(descriptor, sha256);
    const selected = normalized.selectors.map((selector) => ({
        path: selector.path,
        value: readPath(sourceValue, selector.path, descriptor.projectionId),
    }));
    const valueDigest = await computeCanonicalJsonDigest(selected, sha256);
    return {
        projectionId: descriptor.projectionId,
        source: descriptor.source,
        descriptorDigest: descriptor.descriptorDigest,
        valueDigest,
    };
}
export async function compileDomainIntelligencePackageIdentity(descriptor, sha256) {
    requireNonEmpty(descriptor.domainId, 'domainId');
    requireNonEmpty(descriptor.version, 'version');
    requireNonEmpty(descriptor.packageId, 'packageId');
    requireNonEmpty(descriptor.formatVersion, 'formatVersion');
    for (const artifact of descriptor.artifacts)
        validateArtifactIdentity(artifact);
    for (const projection of descriptor.semanticContextProjections) {
        await verifyProjectionDescriptor(projection, sha256);
    }
    ensureUnique(descriptor.artifacts, (artifact) => `${artifact.kind}:${artifact.artifactId}`, 'artifacts');
    ensureUnique(descriptor.semanticContextProjections, (projection) => `${projection.source}:${projection.projectionId}`, 'semanticContextProjections');
    const artifacts = [...descriptor.artifacts]
        .sort(compareBy(artifactSortKey))
        .map(({ kind, artifactId, contentDigest }) => ({ kind, artifactId, contentDigest }));
    const projections = [...descriptor.semanticContextProjections]
        .sort(compareBy(projectionSortKey))
        .map(({ projectionId, source, descriptorDigest }) => ({
        projectionId,
        source,
        descriptorDigest,
    }));
    const contentDigest = await computeCanonicalJsonDigest({ domainId: descriptor.domainId, artifacts, semanticContextProjections: projections }, sha256);
    return {
        domainId: descriptor.domainId,
        version: descriptor.version,
        packageId: descriptor.packageId,
        contentDigest,
        formatVersion: descriptor.formatVersion,
        runtimeContractMajor: descriptor.runtimeContractMajor,
        executionEngineMajor: descriptor.executionEngineMajor,
        requiredCapabilities: [...descriptor.requiredCapabilities],
    };
}
export async function requireSemanticRevision(request, port) {
    requireNonEmpty(request.sourceId, 'semantic revision sourceId');
    const revision = await port.resolveRevision(request);
    if (revision === undefined) {
        throw new DomainDataContractError('MISSING_SEMANTIC_REVISION', `semantic revision source ${request.sourceId} did not return a required revision`);
    }
    if (revision.sourceId !== request.sourceId || revision.revision.length === 0) {
        throw new DomainDataContractError('INVALID_SEMANTIC_REVISION', `semantic revision source ${request.sourceId} returned an invalid revision identity`);
    }
    return revision;
}
export async function computeBehaviorallyRelevantDependencyDigest(dependencies, sha256) {
    const artifacts = [...(dependencies.artifacts ?? [])];
    const projections = [...(dependencies.projections ?? [])];
    const revisions = [...(dependencies.revisions ?? [])];
    for (const artifact of artifacts)
        validateArtifactIdentity(artifact);
    for (const projection of projections) {
        requireNonEmpty(projection.projectionId, 'projectionId');
        requireDigest(projection.descriptorDigest, `projection ${projection.projectionId} descriptorDigest`);
        requireDigest(projection.valueDigest, `projection ${projection.projectionId} valueDigest`);
    }
    for (const revision of revisions) {
        requireNonEmpty(revision.sourceId, 'semantic revision sourceId');
        if (revision.revision.length === 0) {
            throw new DomainDataContractError('INVALID_SEMANTIC_REVISION', `semantic revision source ${revision.sourceId} returned an empty revision`);
        }
    }
    ensureUnique(artifacts, (artifact) => `${artifact.kind}:${artifact.artifactId}`, 'artifacts');
    ensureUnique(projections, (projection) => `${projection.source}:${projection.projectionId}`, 'projections');
    ensureUnique(revisions, (revision) => revision.sourceId, 'revisions');
    return computeCanonicalJsonDigest({
        artifacts: artifacts
            .sort(compareBy(artifactSortKey))
            .map(({ kind, artifactId, contentDigest }) => ({ kind, artifactId, contentDigest })),
        projections: projections
            .sort(compareBy(projectionSortKey))
            .map(({ source, projectionId, descriptorDigest, valueDigest }) => ({
            source,
            projectionId,
            descriptorDigest,
            valueDigest,
        })),
        revisions: revisions
            .sort(compareBy(revisionSortKey))
            .map(({ sourceId, revision }) => ({ sourceId, revision })),
    }, sha256);
}
//# sourceMappingURL=domain-data.js.map