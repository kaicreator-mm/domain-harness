import { SchemaValidator } from '../../execution/schema-validator.js';
export const HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND = 'host-local-domain-tool@1';
export class HostLocalDomainToolBindingError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'HostLocalDomainToolBindingError';
        this.code = code;
    }
}
function assertEffectAuthority(request) {
    if (request.descriptor.effect === 'none')
        return;
    const context = request.context;
    if (context.effectId.trim().length === 0
        || context.sourceMessageId.trim().length === 0
        || context.idempotencyKey.trim().length === 0
        || context.logicalTime.trim().length === 0
        || !Number.isSafeInteger(context.attempt)
        || context.attempt < 1) {
        throw new HostLocalDomainToolBindingError('HOST_LOCAL_EFFECT_AUTHORITY_REQUIRED', `Mutation-capable Tool '${request.descriptor.toolId}' requires a valid durable-effect execution context`);
    }
}
function resolveBinding(request, options) {
    const descriptor = request.descriptor;
    if (descriptor.execution.kind !== HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND) {
        throw new HostLocalDomainToolBindingError('HOST_LOCAL_BINDING_KIND_INVALID', `Tool '${descriptor.toolId}' uses '${descriptor.execution.kind}', not ${HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND}`);
    }
    const available = new Set(options.capabilities);
    const missing = descriptor.requiredCapabilities.filter((capability) => !available.has(capability));
    if (missing.length > 0) {
        throw new HostLocalDomainToolBindingError('HOST_LOCAL_CAPABILITY_MISSING', `Tool '${descriptor.toolId}' requires unavailable host capabilities: ${missing.join(', ')}`);
    }
    const binding = options.bindings[descriptor.execution.bindingId];
    if (binding === undefined) {
        throw new HostLocalDomainToolBindingError('HOST_LOCAL_BINDING_MISSING', `Tool '${descriptor.toolId}' has no host-local binding for '${descriptor.execution.bindingId}'`);
    }
    if (!descriptor.requiredCapabilities.includes(binding.capability)) {
        throw new HostLocalDomainToolBindingError('HOST_LOCAL_BINDING_NOT_ALLOWED', `Binding '${descriptor.execution.bindingId}' capability '${binding.capability}' is not declared by Tool '${descriptor.toolId}'`);
    }
    const compiledDigest = descriptor.execution.digest;
    if (compiledDigest === undefined || compiledDigest.length === 0) {
        throw new HostLocalDomainToolBindingError('HOST_LOCAL_BINDING_DIGEST_MISSING', `Tool '${descriptor.toolId}' host-local binding is missing its target-compiled digest`);
    }
    if (binding.digest !== compiledDigest) {
        throw new HostLocalDomainToolBindingError('HOST_LOCAL_BINDING_DIGEST_MISMATCH', `Binding '${descriptor.execution.bindingId}' digest does not match the target-compiled Tool descriptor`);
    }
    return binding;
}
/**
 * Creates the portable adapter used on the existing ToolExecutorPort effect seam.
 *
 * This module deliberately exposes no `execute(toolId, input)` shortcut. A Tool
 * invocation reaches project-local/native code only as a `ToolExecutionRequest`
 * carrying EffectExecutionContext. Mutation-capable Tools additionally fail
 * closed when that durable-effect context is not valid. Effect journaling,
 * retry/idempotency decisions and recovery remain owned by the parent runtime.
 */
export function createHostLocalDomainToolExecutor(options) {
    const validator = new SchemaValidator();
    return {
        async execute(request) {
            const binding = resolveBinding(request, options);
            assertEffectAuthority(request);
            const input = validator.validate(request.descriptor.inputSchema, request.input, 'invalid_input', `Tool ${request.descriptor.toolId} input`);
            const output = await binding.execute({
                toolId: request.descriptor.toolId,
                bindingId: request.descriptor.execution.bindingId,
                input,
                context: request.context,
            });
            return validator.validate(request.descriptor.outputSchema, output, 'invalid_output', `Tool ${request.descriptor.toolId} output`);
        },
    };
}
//# sourceMappingURL=index.js.map