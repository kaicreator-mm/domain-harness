import { HostLocalDomainToolBindingError } from '../tool/host-local-contract/index.js';
/**
 * T-021 assembly glue between the T-019 admission effect-tool port and the
 * existing v0.2 `ToolExecutorPort` effect seam (T-008 host/local bindings).
 * Effect semantics come from the compiled Tool descriptor — never from a
 * side-channel map. The adapter tracks per-effect execution attempts so the
 * T-008 effect-authority guard receives a truthful attempt ordinal; durable
 * begin/commit/retry truth stays with the admission journal.
 */
export function admissionEffectToolPort(options) {
    const attempts = new Map();
    return {
        resolve(effectType) {
            const descriptor = options.descriptors[effectType];
            if (descriptor === undefined)
                return undefined;
            const toolArtifact = options.toolArtifacts?.[effectType];
            return {
                effectType,
                effectSemantics: descriptor.effect,
                ...(toolArtifact === undefined ? {} : { toolArtifact }),
            };
        },
        async execute(request) {
            const descriptor = options.descriptors[request.binding.effectType];
            if (descriptor === undefined) {
                throw new HostLocalDomainToolBindingError('HOST_LOCAL_BINDING_MISSING', `no target-compiled Tool descriptor is bound to effect type '${request.binding.effectType}'`);
            }
            // Fail closed if a caller hands execute() a binding whose semantics do not
            // match the compiled descriptor for the same effect type. The wired
            // admission path always passes its own resolve() output, so this cannot
            // fire legitimately; it makes descriptor-truth structural for any other
            // caller.
            if (request.binding.effectSemantics !== descriptor.effect) {
                throw new HostLocalDomainToolBindingError('HOST_LOCAL_BINDING_SEMANTICS_MISMATCH', `binding effect semantics '${request.binding.effectSemantics}' do not match the compiled Tool descriptor '${descriptor.effect}' for effect type '${request.binding.effectType}'`);
            }
            const attempt = (attempts.get(request.effectId) ?? 0) + 1;
            attempts.set(request.effectId, attempt);
            const execution = {
                descriptor,
                input: request.input,
                context: {
                    effectId: request.effectId,
                    target: request.target,
                    sourceMessageId: request.durableControlTurnId,
                    logicalTime: request.logicalTime,
                    attempt,
                    idempotencyKey: request.idempotencyKey ?? request.effectId,
                },
            };
            return options.executor.execute(execution);
        },
    };
}
//# sourceMappingURL=admission-effect-tool-adapter.js.map