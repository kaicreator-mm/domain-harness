// T-025 SDK examples — shared VOLATILE scaffolding.
//
// Everything in this file is in-memory and non-durable. It exists so the
// consumer-facing examples stay small and readable. Host durability is a
// different concern: durable SQLite adapters for Node and Expo hosts are
// covered by docs/integration/DomainHarness_v0.3_HOST_INTEGRATION.md, and
// durability claims are established only by the dedicated validation evidence
// cited there (never by this file).
//
// All imports come from the published package name, exactly as a downstream
// consumer writes them.
import { createHash } from 'node:crypto';
import {
  canonicalJsonStringify,
  computeCompiledPackageId,
  STANDARD_CAPABILITIES,
  type AdmissionEffectToolBinding,
  type AdmissionEffectToolPort,
  type AdmissionEffectToolRequest,
  type BeginEffectRequest,
  type BindGovernanceExecutionPinResult,
  type CommitProcessedMessageRequest,
  type CompleteEffectRequest,
  type DomainActivationAuthority,
  type DomainActivationBinding,
  type DomainMessage,
  type DurableExecutionStore,
  type EffectJournalRecord,
  type ExactPackageCdiAuthority,
  type FailMessageProcessingRequest,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
  type JsonValue,
  type MessageAcceptedAck,
  type RuntimeHostBindings,
  type RuntimeStore,
  type Sha256Port,
  type TargetCompiledDomainPackage,
  type TerminalizeInstanceRequest,
  type WorkflowAddress,
  type WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness';

/** Real SHA-256 port for examples (consumers inject their platform's hash). */
export const exampleSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

/** Deterministic host bindings: real hashing, counter ids, echo expressions. */
export function exampleHostBindings(): RuntimeHostBindings {
  let randomIdCounter = 0;
  return {
    capabilities: [
      STANDARD_CAPABILITIES.cryptoHashSha256,
      STANDARD_CAPABILITIES.secureRandom,
      STANDARD_CAPABILITIES.expressionJsonata,
    ],
    sha256: exampleSha256,
    secureRandom: {
      randomId(): string {
        randomIdCounter += 1;
        return `example-id-${randomIdCounter}`;
      },
    },
    expression: {
      async evaluate(request) {
        return request.input;
      },
    },
  };
}

/**
 * The build step: produce a compiled Domain Package. Outside examples this is
 * the offline compiler/toolchain's job — the host receives this artifact and
 * consumes it at startup. The manifest carries its own content-derived
 * packageId; `computeCompiledPackageId` derives it canonically.
 */
export async function buildCompiledPackage(): Promise<TargetCompiledDomainPackage> {
  const manifest: TargetCompiledDomainPackage['manifest'] = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'orders',
    domainVersion: '1.0.0-example',
    packageId: 'pending',
    targetProfileId: 'example-host@1',
    requiredCapabilities: [],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  manifest.packageId = await computeCompiledPackageId(manifest, exampleSha256);
  return { manifest, bindings: {} };
}

const addressKey = (address: WorkflowAddress): string =>
  JSON.stringify([address.workflowId, address.instanceKey]);

/**
 * Volatile in-memory RuntimeStore (the v0.2 durable-store port). A real host
 * injects the Node or Expo SQLite adapter instead; this exists only so the
 * examples run anywhere without I/O.
 */
export class VolatileRuntimeStore implements RuntimeStore {
  readonly instances = new Map<string, WorkflowInstanceSnapshot>();
  readonly #effects = new Map<string, EffectJournalRecord>();

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    this.instances.set(addressKey(snapshot.address), structuredClone(snapshot));
  }

  async getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const snapshot = this.instances.get(addressKey(target));
    return snapshot === undefined ? null : structuredClone(snapshot);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    return [...new Set([...this.instances.values()].map((snapshot) => snapshot.packageId))];
  }

  async acceptMessage(_message: DomainMessage): Promise<MessageAcceptedAck> {
    throw new Error('VolatileRuntimeStore.acceptMessage is outside the example surface');
  }

  async getMessageDisposition(): Promise<null> {
    return null;
  }

  async getNextAcceptedMessage(): Promise<null> {
    return null;
  }

  async markMessageProcessing(): Promise<boolean> {
    return true;
  }

  async commitProcessedMessage(_request: CommitProcessedMessageRequest): Promise<void> {}

  async failMessageProcessing(_request: FailMessageProcessingRequest): Promise<void> {}

  async terminalizeInstance(_request: TerminalizeInstanceRequest): Promise<void> {}

  async listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]> {
    return [];
  }

  async reclaimInterruptedProcessing(): Promise<readonly string[]> {
    return [];
  }

  async getEffect(effectId: string): Promise<EffectJournalRecord | null> {
    const record = this.#effects.get(effectId);
    return record === undefined ? null : structuredClone(record);
  }

  async beginEffect(request: BeginEffectRequest): Promise<EffectJournalRecord> {
    const record: EffectJournalRecord = structuredClone(request);
    this.#effects.set(record.effectId, structuredClone(record));
    return record;
  }

  async completeEffect(request: CompleteEffectRequest): Promise<EffectJournalRecord> {
    const existing = this.#effects.get(request.effectId);
    if (existing === undefined) throw new Error(`unknown effect ${request.effectId}`);
    const completed: EffectJournalRecord = {
      ...existing,
      status: request.status,
      ...(request.output === undefined ? {} : { output: request.output }),
      ...(request.error === undefined ? {} : { error: request.error }),
      completedAt: request.completedAt,
    };
    this.#effects.set(completed.effectId, structuredClone(completed));
    return structuredClone(completed);
  }

  async resetRecovery(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot> {
    const snapshot = this.instances.get(addressKey(target));
    if (snapshot === undefined) throw new Error('unknown instance');
    return structuredClone(snapshot);
  }
}

/** Volatile GovernanceExecutionPin + bound-snapshot store (T-014 port). */
export class VolatileDurableExecutionStore implements DurableExecutionStore {
  readonly #pins = new Map<string, GovernanceExecutionPin>();
  readonly #snapshots = new Map<string, GovernanceBoundSnapshot>();

  async getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown> {
    return this.#pins.get(workflowInstanceId);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<BindGovernanceExecutionPinResult> {
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    // Exact-pin rebind is idempotent; any other pin for the instance conflicts.
    return canonicalJsonStringify(existing as unknown as JsonValue)
        === canonicalJsonStringify(pin as unknown as JsonValue)
      ? 'existing'
      : 'conflict';
  }

  async getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown> {
    return this.#snapshots.get(workflowInstanceId);
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

/** Volatile live activation-binding authority (T-014 port). */
export class VolatileActivationAuthority implements DomainActivationAuthority {
  readonly #bindings = new Map<string, DomainActivationBinding>();

  async readDomainActivationBinding(domainId: string): Promise<unknown> {
    return this.#bindings.get(domainId);
  }

  async publishDomainActivationBinding(binding: DomainActivationBinding): Promise<void> {
    this.#bindings.set(binding.domainId, binding);
  }
}

/**
 * Volatile exact package/CDI authority (T-014 port). Resolution is exact-tuple
 * only — there is deliberately no name, `latest`, or `current` lookup.
 */
export class VolatileExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #tuples = new Map<string, GovernancePackageCdiBinding>();

  registerExactPackageCdi(binding: GovernancePackageCdiBinding): void {
    this.#tuples.set(
      JSON.stringify([binding.domainId, binding.packageId, binding.domainIntelligenceContentDigest]),
      binding,
    );
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    return this.#tuples.get(
      JSON.stringify([binding.domainId, binding.packageId, binding.domainIntelligenceContentDigest]),
    );
  }
}

/** Volatile effect-tool port: fixed semantics map, echo execution. */
export class VolatileEffectTools implements AdmissionEffectToolPort {
  constructor(private readonly semantics: Readonly<Record<string, AdmissionEffectToolBinding['effectSemantics']>>) {}

  resolve(effectType: string): AdmissionEffectToolBinding | undefined {
    const effectSemantics = this.semantics[effectType];
    return effectSemantics === undefined ? undefined : { effectType, effectSemantics };
  }

  async execute(request: AdmissionEffectToolRequest): Promise<JsonValue> {
    return { echoed: request.input };
  }
}
