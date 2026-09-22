import { Ajv } from 'ajv';
import { STANDARD_CAPABILITIES } from '../../v2/contracts/capability.js';
export const REMOTE_HTTP_JSON_BINDING_KIND = 'remote-http-json@1';
export const REMOTE_HTTP_JSON_TRANSPORT = STANDARD_CAPABILITIES.httpTransport;
export class RemoteToolBindingError extends Error {
    code = 'REMOTE_TOOL_BINDING_INVALID';
    constructor(message) {
        super(message);
        this.name = 'RemoteToolBindingError';
    }
}
export class RemoteToolValidationError extends Error {
    code = 'REMOTE_TOOL_JSON_INVALID';
    phase;
    issues;
    constructor(phase, issues) {
        super(`Remote Tool ${phase} failed JSON Schema validation`);
        this.name = 'RemoteToolValidationError';
        this.phase = phase;
        this.issues = issues;
    }
}
const LOGICAL_BINDING_KEYS = new Set(['transport', 'resourceKey', 'path', 'method']);
function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function assertLogicalBindingOnly(config) {
    for (const key of Object.keys(config)) {
        if (!LOGICAL_BINDING_KEYS.has(key)) {
            throw new RemoteToolBindingError(`Remote HTTP/JSON binding config.${key} is not a logical binding field; runtime values belong in Runtime Resources`);
        }
    }
}
function isLogicalPath(value) {
    return value.startsWith('/') && !value.startsWith('//');
}
export function parseRemoteHttpJsonBinding(binding) {
    if (binding.kind !== REMOTE_HTTP_JSON_BINDING_KIND) {
        throw new RemoteToolBindingError(`Unsupported Remote Tool binding kind: ${binding.kind}`);
    }
    if (!isJsonObject(binding.config)) {
        throw new RemoteToolBindingError('Remote HTTP/JSON binding config must be a JSON object');
    }
    assertLogicalBindingOnly(binding.config);
    const transport = binding.config.transport;
    const resourceKey = binding.config.resourceKey;
    const path = binding.config.path;
    const method = binding.config.method;
    if (transport !== REMOTE_HTTP_JSON_TRANSPORT) {
        throw new RemoteToolBindingError(`Remote HTTP/JSON binding requires ${REMOTE_HTTP_JSON_TRANSPORT}`);
    }
    if (typeof resourceKey !== 'string' || resourceKey.length === 0) {
        throw new RemoteToolBindingError('Remote HTTP/JSON binding requires a non-empty resourceKey');
    }
    if (typeof path !== 'string' || !isLogicalPath(path)) {
        throw new RemoteToolBindingError('Remote HTTP/JSON binding path must be a single-root logical path beginning with /');
    }
    if (method !== undefined && method !== 'POST') {
        throw new RemoteToolBindingError('Remote HTTP/JSON v1 supports POST only');
    }
    return {
        transport: REMOTE_HTTP_JSON_TRANSPORT,
        resourceKey,
        path,
        ...(method === undefined ? {} : { method }),
    };
}
function assertRemoteDescriptor(descriptor) {
    if (!descriptor.requiredCapabilities.includes(REMOTE_HTTP_JSON_TRANSPORT)) {
        throw new RemoteToolBindingError(`Remote Tool ${descriptor.toolId} must require ${REMOTE_HTTP_JSON_TRANSPORT}`);
    }
    return parseRemoteHttpJsonBinding(descriptor.execution);
}
function validateJson(schema, value, phase) {
    if (schema === undefined)
        return;
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    if (validate(value))
        return;
    const issues = (validate.errors ?? []).map((error) => {
        const location = error.instancePath || '/';
        return `${location} ${error.message ?? 'is invalid'}`;
    });
    throw new RemoteToolValidationError(phase, issues);
}
/**
 * Creates the Remote Tool executor that plugs into the frozen ToolExecutorPort effect seam.
 * Journaling, retries and recovery remain owned by the runtime effect layer; this executor
 * performs exactly one transport call for one ToolExecutionRequest.
 */
export function createRemoteHttpJsonToolExecutor(options) {
    return {
        async execute(request) {
            const config = assertRemoteDescriptor(request.descriptor);
            validateJson(request.descriptor.inputSchema, request.input, 'input');
            const transport = options.host.remoteTransports?.[config.transport];
            if (transport === undefined) {
                throw new RemoteToolBindingError(`Runtime host does not provide ${config.transport}`);
            }
            const output = await transport.execute({
                binding: request.descriptor.execution,
                input: request.input,
                resourceKey: config.resourceKey,
                // [L2-4]: the durable effect context (idempotency key, attempt, effect
                // and source identity) must reach the execution edge, not stop at the
                // journal layer.
                context: request.context,
                ...(request.context.signal === undefined ? {} : { signal: request.context.signal }),
            });
            validateJson(request.descriptor.outputSchema, output, 'output');
            return output;
        },
    };
}
//# sourceMappingURL=index.js.map