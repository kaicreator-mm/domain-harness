import { IdentityContractError, canonicalizeJson, } from '../contracts/identity.js';
import { CompiledWorkflowIrError, decodeCompiledWorkflowDefinition, } from '../runtime/compiled-workflow-ir.js';
import { PackageActivationError } from './errors.js';
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function failInvalid(message) {
    throw new PackageActivationError('INVALID_COMPILED_PACKAGE', message);
}
function requireRecordField(record, field) {
    const value = record[field];
    if (!isRecord(value))
        failInvalid(`compiled package manifest field "${field}" must be an object`);
    return value;
}
function requireStringField(record, field) {
    const value = record[field];
    if (typeof value !== 'string' || value.length === 0) {
        failInvalid(`compiled package manifest field "${field}" must be a non-empty string`);
    }
    return value;
}
function requireIntegerField(record, field) {
    const value = record[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        failInvalid(`compiled package manifest field "${field}" must be a non-negative integer`);
    }
    return value;
}
function requireStringArray(value, path) {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
        failInvalid(`${path} must be an array of non-empty strings`);
    }
    return value;
}
function validateCapabilityIds(value, path) {
    const capabilities = requireStringArray(value, path);
    for (const capability of capabilities) {
        if (!/^.+@\d+$/.test(capability))
            failInvalid(`${path} contains invalid capability id "${capability}"`);
    }
    return capabilities;
}
function assertJsonSerializable(value, path, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            failInvalid(`${path} contains a non-finite number`);
        return;
    }
    if (Array.isArray(value)) {
        if (ancestors.has(value))
            failInvalid(`${path} contains a circular reference`);
        ancestors.add(value);
        value.forEach((entry, index) => assertJsonSerializable(entry, `${path}[${index}]`, ancestors));
        ancestors.delete(value);
        return;
    }
    if (isRecord(value)) {
        if (ancestors.has(value))
            failInvalid(`${path} contains a circular reference`);
        ancestors.add(value);
        for (const [key, child] of Object.entries(value)) {
            assertJsonSerializable(child, `${path}.${key}`, ancestors);
        }
        ancestors.delete(value);
        return;
    }
    failInvalid(`${path} contains a non-JSON value`);
}
function validateWorkflows(workflows) {
    for (const [workflowKey, workflowValue] of Object.entries(workflows)) {
        if (!isRecord(workflowValue))
            failInvalid(`workflow "${workflowKey}" must be an object`);
        requireStringField(workflowValue, 'workflowId');
        const definition = requireRecordField(workflowValue, 'definition');
        assertJsonSerializable(definition, `workflow "${workflowKey}" definition`);
        // Fail-closed executable-IR gate (#167/#168): the same authoritative decoder
        // the runtime interpreter uses. Malformed states/routes/invokes/effects and
        // unsupported invoke kinds are rejected at activation instead of surfacing
        // mid-drain, satisfying the PRD R4 corrupt-package fail-closed criterion.
        try {
            decodeCompiledWorkflowDefinition(workflowKey, definition);
        }
        catch (error) {
            if (error instanceof CompiledWorkflowIrError) {
                failInvalid(`workflow "${workflowKey}" definition is not executable compiled IR: ${error.message}`);
            }
            throw error;
        }
        const messageContracts = requireRecordField(workflowValue, 'messageContracts');
        for (const [messageKey, messageValue] of Object.entries(messageContracts)) {
            if (!isRecord(messageValue))
                failInvalid(`workflow "${workflowKey}" message "${messageKey}" must be an object`);
            requireStringField(messageValue, 'type');
            if (messageValue.version !== undefined &&
                (typeof messageValue.version !== 'string' || messageValue.version.length === 0)) {
                failInvalid(`workflow "${workflowKey}" message "${messageKey}" version must be a non-empty string`);
            }
            const payloadSchema = requireRecordField(messageValue, 'payloadSchema');
            assertJsonSerializable(payloadSchema, `workflow "${workflowKey}" message "${messageKey}" payloadSchema`);
        }
    }
}
function validateTools(tools, bindingDigests) {
    for (const [toolKey, toolValue] of Object.entries(tools)) {
        if (!isRecord(toolValue))
            failInvalid(`tool "${toolKey}" must be an object`);
        requireStringField(toolValue, 'toolId');
        if (toolValue.inputSchema !== undefined) {
            const inputSchema = requireRecordField(toolValue, 'inputSchema');
            assertJsonSerializable(inputSchema, `tool "${toolKey}" inputSchema`);
        }
        const outputSchema = requireRecordField(toolValue, 'outputSchema');
        assertJsonSerializable(outputSchema, `tool "${toolKey}" outputSchema`);
        if (!['none', 'idempotent', 'non-idempotent'].includes(String(toolValue.effect))) {
            failInvalid(`tool "${toolKey}" effect is invalid`);
        }
        validateCapabilityIds(toolValue.requiredCapabilities, `tool "${toolKey}" requiredCapabilities`);
        const execution = requireRecordField(toolValue, 'execution');
        requireStringField(execution, 'kind');
        const bindingId = requireStringField(execution, 'bindingId');
        if (execution.digest !== undefined && (typeof execution.digest !== 'string' || execution.digest.length === 0)) {
            failInvalid(`tool "${toolKey}" execution digest must be a non-empty string`);
        }
        if (execution.config !== undefined) {
            assertJsonSerializable(execution.config, `tool "${toolKey}" execution config`);
        }
        const manifestDigest = bindingDigests[bindingId];
        if (typeof manifestDigest !== 'string' || manifestDigest.length === 0) {
            throw new PackageActivationError('BINDING_DIGEST_MISMATCH', `tool "${toolKey}" binding "${bindingId}" has no manifest binding digest`);
        }
        if (execution.digest !== undefined && execution.digest !== manifestDigest) {
            throw new PackageActivationError('BINDING_DIGEST_MISMATCH', `tool "${toolKey}" binding digest does not match manifest bindingDigests`);
        }
    }
}
function validateProjections(projections) {
    for (const [projectionKey, projectionValue] of Object.entries(projections)) {
        if (!isRecord(projectionValue))
            failInvalid(`projection "${projectionKey}" must be an object`);
        requireStringField(projectionValue, 'projectionId');
        requireStringField(projectionValue, 'expression');
        if (!Array.isArray(projectionValue.dependencies)) {
            failInvalid(`projection "${projectionKey}" dependencies must be an array`);
        }
        for (const [index, dependency] of projectionValue.dependencies.entries()) {
            if (!isRecord(dependency))
                failInvalid(`projection "${projectionKey}" dependency ${index} must be an object`);
            switch (dependency.kind) {
                case 'workflow': {
                    const selector = requireRecordField(dependency, 'selector');
                    assertJsonSerializable(selector, `projection "${projectionKey}" dependency ${index} selector`);
                    break;
                }
                case 'business': {
                    requireStringField(dependency, 'source');
                    const selector = requireRecordField(dependency, 'selector');
                    assertJsonSerializable(selector, `projection "${projectionKey}" dependency ${index} selector`);
                    break;
                }
                case 'domain-data':
                    requireStringField(dependency, 'key');
                    break;
                default:
                    failInvalid(`projection "${projectionKey}" dependency ${index} kind is invalid`);
            }
        }
        const outputSchema = requireRecordField(projectionValue, 'outputSchema');
        assertJsonSerializable(outputSchema, `projection "${projectionKey}" outputSchema`);
    }
}
function validateManifestShape(value) {
    if (!isRecord(value))
        failInvalid('compiled package manifest must be an object');
    requireStringField(value, 'formatVersion');
    requireIntegerField(value, 'runtimeContractMajor');
    requireIntegerField(value, 'executionEngineMajor');
    requireStringField(value, 'domainId');
    requireStringField(value, 'domainVersion');
    requireStringField(value, 'packageId');
    requireStringField(value, 'targetProfileId');
    validateCapabilityIds(value.requiredCapabilities, 'compiled package requiredCapabilities');
    const workflows = requireRecordField(value, 'workflows');
    const tools = requireRecordField(value, 'tools');
    const projections = requireRecordField(value, 'projections');
    const schemas = requireRecordField(value, 'schemas');
    const bindingDigests = requireRecordField(value, 'bindingDigests');
    for (const [bindingId, digest] of Object.entries(bindingDigests)) {
        if (bindingId.length === 0 || typeof digest !== 'string' || digest.length === 0) {
            failInvalid('bindingDigests must map non-empty binding ids to non-empty digest strings');
        }
    }
    for (const [schemaId, schema] of Object.entries(schemas)) {
        if (!isRecord(schema))
            failInvalid(`schema "${schemaId}" must be an object`);
        assertJsonSerializable(schema, `schema "${schemaId}"`);
    }
    if (value.compatibility !== undefined) {
        if (!isRecord(value.compatibility))
            failInvalid('compiled package compatibility must be an object');
        assertJsonSerializable(value.compatibility, 'compiled package compatibility');
    }
    validateWorkflows(workflows);
    validateTools(tools, bindingDigests);
    validateProjections(projections);
    assertJsonSerializable(value, 'compiled package manifest');
}
function validateBindings(manifest, bindings) {
    if (!isRecord(bindings)) {
        throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package bindings must be an object');
    }
    for (const [toolKey, tool] of Object.entries(manifest.tools)) {
        const bindingId = tool.execution.bindingId;
        if (!Object.prototype.hasOwnProperty.call(bindings, bindingId)) {
            throw new PackageActivationError('MISSING_BINDING', `compiled package is missing executable binding "${bindingId}" required by tool "${toolKey}"`);
        }
    }
}
/**
 * v0.2 package identity canonicalization used ordinary object assignment.
 * Keep that exact byte behavior for packageId compatibility, including its
 * historical treatment of an own "__proto__" JSON key, after the shared
 * canonicalizer has validated and normalized the semantic input.
 */
function canonicalizeLegacyPackageIdentity(value) {
    if (Array.isArray(value))
        return value.map((entry) => canonicalizeLegacyPackageIdentity(entry));
    if (isRecord(value)) {
        const result = {};
        for (const key of Object.keys(value).sort()) {
            result[key] = canonicalizeLegacyPackageIdentity(value[key]);
        }
        return result;
    }
    return value;
}
export function canonicalPackageIdentityMaterial(manifest) {
    const { packageId: _packageId, ...identityMaterial } = manifest;
    assertJsonSerializable(identityMaterial, 'compiled package identity material');
    let sharedCanonical;
    try {
        sharedCanonical = canonicalizeJson(identityMaterial);
    }
    catch (error) {
        if (error instanceof IdentityContractError) {
            failInvalid(`compiled package identity material failed canonical identity validation: ${error.message}`);
        }
        throw error;
    }
    const encoded = JSON.stringify(canonicalizeLegacyPackageIdentity(sharedCanonical));
    if (encoded === undefined)
        failInvalid('compiled package identity material is not serializable');
    return encoded;
}
export async function computeCompiledPackageId(manifest, sha256) {
    return sha256.digestUtf8(canonicalPackageIdentityMaterial(manifest));
}
function validateCompatibility(manifest, policy) {
    const mismatches = [];
    if (manifest.formatVersion !== policy.formatVersion) {
        mismatches.push(`formatVersion expected=${policy.formatVersion} actual=${manifest.formatVersion}`);
    }
    if (manifest.runtimeContractMajor !== policy.runtimeContractMajor) {
        mismatches.push(`runtimeContractMajor expected=${policy.runtimeContractMajor} actual=${manifest.runtimeContractMajor}`);
    }
    if (manifest.executionEngineMajor !== policy.executionEngineMajor) {
        mismatches.push(`executionEngineMajor expected=${policy.executionEngineMajor} actual=${manifest.executionEngineMajor}`);
    }
    if (policy.targetProfileId !== undefined && manifest.targetProfileId !== policy.targetProfileId) {
        mismatches.push(`targetProfileId expected=${policy.targetProfileId} actual=${manifest.targetProfileId}`);
    }
    const available = new Set(policy.hostCapabilities);
    for (const capability of manifest.requiredCapabilities) {
        if (!available.has(capability))
            mismatches.push(`missing host capability ${capability}`);
    }
    for (const tool of Object.values(manifest.tools)) {
        for (const capability of tool.requiredCapabilities) {
            if (!available.has(capability))
                mismatches.push(`missing host capability ${capability}`);
        }
    }
    if (mismatches.length > 0) {
        throw new PackageActivationError('INCOMPATIBLE_PACKAGE', 'compiled package is incompatible with this runtime/host', [...new Set(mismatches)].sort());
    }
}
export async function validateCompiledPackage(value, policy) {
    if (!isRecord(value)) {
        throw new PackageActivationError('INVALID_COMPILED_PACKAGE', 'compiled package must be an object');
    }
    validateManifestShape(value.manifest);
    validateBindings(value.manifest, value.bindings);
    validateCompatibility(value.manifest, policy);
    const calculatedPackageId = await computeCompiledPackageId(value.manifest, policy.sha256);
    if (calculatedPackageId !== value.manifest.packageId) {
        throw new PackageActivationError('PACKAGE_ID_MISMATCH', 'compiled package identity does not match canonical manifest identity', [`expected=${value.manifest.packageId}`, `actual=${calculatedPackageId}`]);
    }
    return value;
}
//# sourceMappingURL=validation.js.map