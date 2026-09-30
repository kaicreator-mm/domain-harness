import { SchemaValidator } from '../execution/schema-validator.js';
import { HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND, createHostLocalDomainToolExecutor, } from '../tool/host-local-contract/index.js';
import { REMOTE_HTTP_JSON_BINDING_KIND, createRemoteHttpJsonToolExecutor, } from '../tool/remote-contract/index.js';
export class RuntimeToolBindingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RuntimeToolBindingError';
    }
}
export function createRuntimeToolExecutor(host) {
    const validator = new SchemaValidator();
    const remote = createRemoteHttpJsonToolExecutor({ host });
    const hostLocal = createHostLocalDomainToolExecutor({
        capabilities: host.capabilities,
        bindings: host.hostLocalDomainTools ?? {},
    });
    return {
        async execute(request) {
            const input = validator.validate(request.descriptor.inputSchema, request.input, 'invalid_input', `Tool ${request.descriptor.toolId} input`);
            let output;
            if (request.descriptor.execution.kind === REMOTE_HTTP_JSON_BINDING_KIND) {
                output = await remote.execute({ ...request, input });
            }
            else if (request.descriptor.execution.kind === HOST_LOCAL_DOMAIN_TOOL_BINDING_KIND) {
                // T-008 owns host-local identity/capability/effect-authority checks. The
                // central Runtime dispatcher only selects that already-frozen executor;
                // it never falls back to another execution kind on binding failure.
                output = await hostLocal.execute({ ...request, input });
            }
            else if (isScriptBinding(request.descriptor.execution.kind)) {
                if (host.script === undefined) {
                    throw new RuntimeToolBindingError(`Tool ${request.descriptor.toolId} requires Script execution, but the host did not provide it`);
                }
                output = await host.script.execute({
                    binding: request.descriptor.execution,
                    input,
                    // [L2-4]: the durable effect context reaches every execution kind.
                    context: request.context,
                    ...(request.context.signal === undefined ? {} : { signal: request.context.signal }),
                });
            }
            else {
                throw new RuntimeToolBindingError(`Unsupported Tool binding kind ${request.descriptor.execution.kind} for ${request.descriptor.toolId}`);
            }
            return validator.validate(request.descriptor.outputSchema, output, 'invalid_output', `Tool ${request.descriptor.toolId} output`);
        },
    };
}
function isScriptBinding(kind) {
    return kind === 'script' || kind === 'script@1' || kind.startsWith('script-');
}
//# sourceMappingURL=tool-executor.js.map