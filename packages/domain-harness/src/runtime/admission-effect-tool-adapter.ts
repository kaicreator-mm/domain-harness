import type { CompiledToolDescriptor } from '../v2/contracts/package.js';
import type { ToolExecutionRequest, ToolExecutorPort } from '../v2/contracts/effect.js';
import type { CompiledArtifactIdentity } from '../contracts/domain-data.js';
import type {
  AdmissionEffectToolPort,
  AdmissionEffectToolRequest,
} from '../admission/contracts.js';
import { HostLocalDomainToolBindingError } from '../tool/host-local-contract/index.js';

export interface AdmissionEffectToolAdapterOptions {
  /** T-008 executor seam (e.g. created by createHostLocalDomainToolExecutor). */
  readonly executor: ToolExecutorPort;
  /** Target-compiled Tool descriptors keyed by admission effect type. */
  readonly descriptors: Readonly<Record<string, CompiledToolDescriptor | undefined>>;
  /** Optional exact producer artifact identity per effect type, for evidence-grade bindings. */
  readonly toolArtifacts?: Readonly<Record<string, CompiledArtifactIdentity | undefined>>;
}

/**
 * T-021 assembly glue between the T-019 admission effect-tool port and the
 * existing v0.2 `ToolExecutorPort` effect seam (T-008 host/local bindings).
 * Effect semantics come from the compiled Tool descriptor — never from a
 * side-channel map. The adapter tracks per-effect execution attempts so the
 * T-008 effect-authority guard receives a truthful attempt ordinal; durable
 * begin/commit/retry truth stays with the admission journal.
 */
export function admissionEffectToolPort(
  options: AdmissionEffectToolAdapterOptions,
): AdmissionEffectToolPort {
  const attempts = new Map<string, number>();
  return {
    resolve(effectType: string) {
      const descriptor = options.descriptors[effectType];
      if (descriptor === undefined) return undefined;
      const toolArtifact = options.toolArtifacts?.[effectType];
      return {
        effectType,
        effectSemantics: descriptor.effect,
        ...(toolArtifact === undefined ? {} : { toolArtifact }),
      };
    },
    async execute(request: AdmissionEffectToolRequest) {
      const descriptor = options.descriptors[request.binding.effectType];
      if (descriptor === undefined) {
        throw new HostLocalDomainToolBindingError(
          'HOST_LOCAL_BINDING_MISSING',
          `no target-compiled Tool descriptor is bound to effect type '${request.binding.effectType}'`,
        );
      }
      const attempt = (attempts.get(request.effectId) ?? 0) + 1;
      attempts.set(request.effectId, attempt);
      const execution: ToolExecutionRequest = {
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
