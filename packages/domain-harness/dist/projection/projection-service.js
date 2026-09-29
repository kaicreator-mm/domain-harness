import { canonicalJsonStringify } from '../contracts/identity.js';
import { SchemaValidator } from '../execution/schema-validator.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1, DomainHarnessJsonSchemaV1Error, DomainHarnessJsonSchemaV1Validator, } from '../schema/domainharness-json-schema-v1.js';
import { SUCCESSOR_COMPILED_ARTIFACT_PROFILE, sameCompiledArtifactProfile, } from '../v2/contracts/compiled-artifact-profile.js';
const PROJECTION_LOGICAL_TIME = '1970-01-01T00:00:00.000Z';
export class ProjectionError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'ProjectionError';
    }
}
export class ProjectionService {
    options;
    validator = new SchemaValidator();
    successorSchemaValidator = new DomainHarnessJsonSchemaV1Validator();
    constructor(options) {
        this.options = options;
    }
    async read(request) {
        assertNonEmpty(request.projectionId, 'projectionId');
        assertNonEmpty(request.key, 'projection key');
        const compiledPackage = this.resolvePackage();
        const descriptor = compiledPackage.manifest.projections[request.projectionId];
        if (!descriptor) {
            throw new ProjectionError('projection_not_found', `Projection ${request.projectionId} does not exist in package ${compiledPackage.manifest.packageId}`);
        }
        const successorBusinessSourceContractsRequired = isSuccessorPackage(compiledPackage);
        const assembled = await this.assembleDeclaredSnapshots(descriptor, request.key, compiledPackage.manifest.packageId, successorBusinessSourceContractsRequired);
        const projectionInput = {
            key: request.key,
            input: request.input ?? null,
            workflows: assembled.workflowSources.map((source) => ({
                address: {
                    workflowId: source.address.workflowId,
                    instanceKey: source.address.instanceKey,
                },
                stateRevision: source.stateRevision,
                state: source.state,
            })),
            business: assembled.businessSnapshots.map((source) => ({
                source: source.source,
                key: source.key,
                revision: source.revision,
                value: source.value,
            })),
            domainData: assembled.domainData.map((entry) => ({
                key: entry.key,
                value: entry.value,
            })),
        };
        let evaluated;
        try {
            evaluated = await this.options.expression.evaluate({
                expression: descriptor.expression,
                input: projectionInput,
                logicalTime: PROJECTION_LOGICAL_TIME,
            });
        }
        catch (error) {
            throw new ProjectionError('evaluation_failed', `Projection ${descriptor.projectionId} evaluation failed`, { cause: error });
        }
        let value;
        try {
            value = this.validator.validate(descriptor.outputSchema, evaluated, 'invalid_output', `Projection ${descriptor.projectionId} output`);
        }
        catch (error) {
            throw new ProjectionError('invalid_output', `Projection ${descriptor.projectionId} produced invalid output`, { cause: error });
        }
        const revision = await this.options.sha256.digestUtf8(JSON.stringify({
            packageId: compiledPackage.manifest.packageId,
            projectionId: descriptor.projectionId,
            workflows: assembled.workflowSources.map((source) => ({
                workflowId: source.address.workflowId,
                instanceKey: source.address.instanceKey,
                stateRevision: source.stateRevision,
            })),
            business: assembled.businessSnapshots.map((source) => ({
                source: source.source,
                key: source.key,
                revision: source.revision,
            })),
        }));
        return {
            projectionId: descriptor.projectionId,
            key: request.key,
            packageId: compiledPackage.manifest.packageId,
            revision,
            value,
            workflowSources: assembled.workflowSources,
            businessSources: assembled.businessSnapshots.map(({ source, key, revision: sourceRevision }) => ({
                source,
                key,
                revision: sourceRevision,
            })),
        };
    }
    resolvePackage() {
        const packageId = this.options.packageRegistry.defaultPackageId;
        const compiledPackage = this.options.packageRegistry.get(packageId);
        if (!compiledPackage) {
            throw new ProjectionError('package_not_found', `Default compiled package ${packageId} is not available`);
        }
        return compiledPackage;
    }
    async assembleDeclaredSnapshots(descriptor, key, packageId, successorBusinessSourceContractsRequired) {
        const workflowSources = [];
        const businessSnapshots = [];
        const domainData = [];
        const observedBusinessRevisions = new Map();
        for (const dependency of descriptor.dependencies) {
            await this.assembleDependency(dependency, key, packageId, successorBusinessSourceContractsRequired, workflowSources, businessSnapshots, domainData, observedBusinessRevisions);
        }
        return { workflowSources, businessSnapshots, domainData };
    }
    async assembleDependency(dependency, key, packageId, successorBusinessSourceContractsRequired, workflowSources, businessSnapshots, domainData, observedBusinessRevisions) {
        if (dependency.kind === 'workflow') {
            const target = resolveWorkflowSelector(dependency.selector, key);
            const snapshot = await this.options.store.getInstance(target);
            if (!snapshot) {
                throw new ProjectionError('workflow_source_missing', `Projection workflow source ${target.workflowId}/${target.instanceKey} does not exist`);
            }
            workflowSources.push({
                address: snapshot.address,
                stateRevision: snapshot.stateRevision,
                state: snapshot.state,
            });
            return;
        }
        if (dependency.kind === 'business') {
            if (!this.options.businessSnapshots) {
                throw new ProjectionError('business_snapshot_port_missing', `Projection requires business source ${dependency.source}, but no BusinessSnapshotPort is configured`);
            }
            assertNonEmpty(dependency.source, 'business source');
            const businessKey = resolveBusinessSelector(dependency.selector, key);
            let contract;
            if (successorBusinessSourceContractsRequired) {
                if (!this.options.businessSourceContracts) {
                    throw new ProjectionError('business_source_contract_missing', `Successor package ${packageId} requires a package-pinned Business Source contract lookup`);
                }
                contract = this.options.businessSourceContracts.get(packageId, dependency.source);
                if (!contract) {
                    throw new ProjectionError('business_source_contract_missing', `Business Source ${dependency.source} is not declared by package ${packageId}`);
                }
                if (contract.schemaContractVersion !== DOMAIN_HARNESS_JSON_SCHEMA_V1
                    || contract.descriptor.source !== dependency.source) {
                    throw new ProjectionError('business_source_contract_invalid', `Business Source contract for ${dependency.source} is not exact package-pinned ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`);
                }
            }
            const snapshot = await this.options.businessSnapshots.read({
                source: dependency.source,
                key: businessKey,
            });
            if (snapshot.source !== dependency.source || snapshot.key !== businessKey) {
                throw new ProjectionError('business_snapshot_mismatch', `Business snapshot identity mismatch for ${dependency.source}/${businessKey}`);
            }
            assertNonEmpty(snapshot.revision, 'business snapshot revision');
            let validatedSnapshot = snapshot;
            if (contract) {
                try {
                    const validatedValue = this.successorSchemaValidator.validate(contract.descriptor.valueSchema, snapshot.value, `Business Snapshot ${dependency.source}/${businessKey}`);
                    validatedSnapshot = { ...snapshot, value: validatedValue };
                }
                catch (error) {
                    if (error instanceof DomainHarnessJsonSchemaV1Error) {
                        throw new ProjectionError('business_snapshot_schema_violation', `Business snapshot ${dependency.source}/${businessKey} violates its package-pinned schema`, { cause: error });
                    }
                    throw error;
                }
                const observationKey = canonicalJsonStringify([
                    validatedSnapshot.source,
                    validatedSnapshot.key,
                    validatedSnapshot.revision,
                ]);
                const canonicalValue = canonicalJsonStringify(validatedSnapshot.value);
                const previousValue = observedBusinessRevisions.get(observationKey);
                if (previousValue !== undefined && previousValue !== canonicalValue) {
                    throw new ProjectionError('business_snapshot_revision_conflict', `Business Source ${validatedSnapshot.source}/${validatedSnapshot.key} returned conflicting values for revision ${validatedSnapshot.revision}`);
                }
                observedBusinessRevisions.set(observationKey, canonicalValue);
            }
            businessSnapshots.push(validatedSnapshot);
            return;
        }
        if (dependency.kind === 'domain-data') {
            assertNonEmpty(dependency.key, 'domain data key');
            if (!this.options.domainData) {
                throw new ProjectionError('domain_data_port_missing', `Projection requires compiled domain data ${dependency.key}, but no CompiledDomainDataPort is configured`);
            }
            const value = this.options.domainData.get(packageId, dependency.key);
            if (value === undefined) {
                throw new ProjectionError('domain_data_not_found', `Compiled domain data ${dependency.key} does not exist in package ${packageId}`);
            }
            domainData.push({ key: dependency.key, value });
            return;
        }
        throw new ProjectionError('unsupported_dependency', `Projection dependency ${String(dependency.kind)} is outside the frozen Workflow/Business/Domain Data dependency kinds`);
    }
}
function isSuccessorPackage(compiledPackage) {
    return sameCompiledArtifactProfile({
        formatVersion: compiledPackage.manifest.formatVersion,
        runtimeContractMajor: compiledPackage.manifest.runtimeContractMajor,
        executionEngineMajor: compiledPackage.manifest.executionEngineMajor,
    }, SUCCESSOR_COMPILED_ARTIFACT_PROFILE);
}
function resolveWorkflowSelector(selector, queryKey) {
    assertSelectorKeys(selector, ['workflowId', 'instanceKey']);
    const workflowId = selector.workflowId;
    if (typeof workflowId !== 'string' || workflowId.length === 0) {
        throw new ProjectionError('invalid_selector', 'Workflow projection selector requires workflowId');
    }
    const selectedInstanceKey = selector.instanceKey;
    if (selectedInstanceKey !== undefined && (typeof selectedInstanceKey !== 'string' || selectedInstanceKey.length === 0)) {
        throw new ProjectionError('invalid_selector', 'Workflow projection selector instanceKey must be a non-empty string');
    }
    return {
        workflowId,
        instanceKey: typeof selectedInstanceKey === 'string' ? selectedInstanceKey : queryKey,
    };
}
function resolveBusinessSelector(selector, queryKey) {
    assertSelectorKeys(selector, ['key']);
    const selectedKey = selector.key;
    if (selectedKey !== undefined && (typeof selectedKey !== 'string' || selectedKey.length === 0)) {
        throw new ProjectionError('invalid_selector', 'Business projection selector key must be a non-empty string');
    }
    return typeof selectedKey === 'string' ? selectedKey : queryKey;
}
function assertSelectorKeys(selector, allowed) {
    const unsupported = Object.keys(selector).filter((key) => !allowed.includes(key));
    if (unsupported.length > 0) {
        throw new ProjectionError('invalid_selector', `Projection selector contains unsupported query behavior: ${unsupported.join(', ')}`);
    }
}
function assertNonEmpty(value, label) {
    if (value.length === 0) {
        throw new ProjectionError('invalid_selector', `${label} must be a non-empty string`);
    }
}
//# sourceMappingURL=projection-service.js.map