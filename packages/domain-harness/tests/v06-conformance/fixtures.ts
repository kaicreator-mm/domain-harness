// v0.6 T007 (issue #585, frozen L2 C5): portable cross-delta conformance,
// compatibility and recovery integration across ALL v0.6 deltas —
// T001 compiled declarations + T004 resolver→admission seam + T005 declared
// unavailable disposition + T006 receipt/observation + T002 A8 accepted-message
// collision hardening + T003 A9 processed-command revision guard.
//
// Shared fixture vocabulary. Every journey composes the EXISTING v0.6
// authorities end-to-end (compiled declaration → resolveAndAdmitTurn seam →
// existing resolver → Central Admission → receipt → Runtime Observation, with
// the A8/A9 portable store-boundary guards composed into the host turn loop).
//
// Portability posture (issue #585 scenario 14): the fixtures exercise ONLY the
// portable product surface of packages/domain-harness; there are no real
// SQLite/Hermes/Node-host durability claims anywhere (host durability belongs
// to T008/T009). node:test/node:assert are the repo-standard test runner; the
// sha256 test port is the repo-standard one shared by every existing focused
// v0.6 suite (the compiled declaration digest contract requires real
// lowercase sha256 hex, so a fake digest port cannot drive these journeys).
import assert from 'node:assert/strict';
import { canonicalJsonStringify, computeCanonicalJsonDigest } from '../../src/contracts/identity.js';
import type { JsonObject } from '../../src/contracts/json.js';
import type {
  CommandOutcomeSnapshot,
  DurableProcessData,
  DurableProcessDataSnapshot,
  ProcessedCommandTurnCommit,
  RuntimeStoreProcessCommandExtension,
} from '../../src/contracts/process-command.js';
import { assertProcessedCommandTurnRevisionProgression } from '../../src/runtime/process-command.js';
import { prepareProcessedCommandTurn } from '../../src/runtime/process-command.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import type { CentralAdmissionOutcome } from '../../src/admission/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/index.js';
import type {
  DecisionResolverPorts,
  DecisionResolverRuleInput,
  DecisionResolverRulePort,
} from '../../src/decision-resolver/index.js';
import { VolatileHarnessExecutionJournalStore } from '../../src/harness/execution-journal.js';
import {
  MemoryGovernanceBaselineStore,
  type GovernanceBaselineBody,
} from '../../src/governance/index.js';
import { VolatileRuntimeEvidenceStore } from '../../src/runtime-evidence/index.js';
import { ExpressionRuntime } from '../../src/expression/index.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1 } from '../../src/schema/domainharness-json-schema-v1.js';
import {
  SEMANTIC_DECISION_CAPABILITY,
  SEMANTIC_DECISION_CONTRACT_VERSION_V1,
  requireAcceptedMessageIdentityCompatible,
  type CapabilityId,
  type CompiledSemanticDecisionDescriptor,
  type SemanticDecisionCachePolicy,
  type SemanticDecisionUnavailableDisposition,
} from '../../src/v2/index.js';
import type { TargetCompiledDomainPackage } from '../../src/v2/index.js';
import type {
  DomainMessage,
  MessageAcceptedAck,
  MessageDispositionSnapshot,
} from '../../src/v2/contracts/message.js';
import type {
  CommitProcessedMessageRequest,
  FailMessageProcessingRequest,
  StoredAcceptedMessage,
  TerminalizeInstanceRequest,
} from '../../src/v2/contracts/store.js';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '../../src/v2/contracts/workflow.js';
import {
  createDomainRuntimeV3,
  type ResolvedTurnAdmissionOutcome,
} from '../../src/runtime/create-domain-runtime-v3.js';
import type {
  ResolveAndAdmitTurnRequest,
  RuntimeHarnessDecisionTurnMaterial,
} from '../../src/runtime/decision-resolver-binding.js';
import {
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  runtimePackageIdentityFromManifest,
  type DecisionResolutionReceipt,
  type RuntimeObservationRecord,
  type RuntimeObservationStreamRef,
} from '../../src/observation/index.js';
import { InMemoryObservationStore } from '../observation/in-memory-observation-store.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';
import {
  CAP_INVARIANT,
  MemoryDurableExecutionStore,
  ScriptedEffectTools,
  makeBaseline,
  makeDefinition,
  quoteEvent,
  sha256,
  target,
  workflowInstanceId,
  NOW,
} from '../admission/helpers.js';
import type { QuoteDecisionResult } from '../decision-resolver/helpers.js';
import {
  HARNESS_PRODUCER,
  ScriptedModel,
  finalResponse,
  makeFixture,
} from '../decision-resolver/helpers.js';

export { DomainRuntimeV3Error } from '../../src/runtime/runtime-v3-errors.js';
export { DecisionResolverError } from '../../src/decision-resolver/index.js';
export { CentralAdmissionError } from '../../src/admission/index.js';
export { target, workflowInstanceId, NOW, sha256, makeDefinition, quoteEvent };
export type { CentralAdmissionOutcome };

const CAPS = {
  hash: 'crypto-hash-sha256@1',
  random: 'secure-random@1',
  expression: 'expression-jsonata@1',
} as const;

export const ALL_SUCCESSOR_CAPABILITIES = [
  CAPS.hash,
  CAPS.random,
  CAPS.expression,
  SEMANTIC_DECISION_CAPABILITY,
] as const;

/** Without semantic-decision@1: a host that does not support semantic decisions. */
export const NON_SEMANTIC_HOST_CAPABILITIES = [CAPS.hash, CAPS.random, CAPS.expression] as const;

export const QUOTE_RESULT_SCHEMA: JsonObject = {
  type: 'object',
  required: ['decision', 'event'],
  properties: {
    decision: {
      type: 'object',
      required: ['outcome'],
      properties: { outcome: { enum: ['approve', 'reject'] } },
    },
    event: {
      type: 'object',
      required: ['type'],
      properties: { type: { enum: ['QUOTE_DECIDED'] } },
    },
  },
};

/* ------------------------------------------------------------------------ */
/* Compiled T001 declarations + successor package                            */
/* ------------------------------------------------------------------------ */

export interface DeclarationOverrides {
  readonly decisionId?: string;
  readonly inputSelection?: string;
  readonly queryCapabilityIds?: readonly string[];
  readonly dependencyMaterial?: CompiledSemanticDecisionDescriptor['dependencyMaterial'];
  readonly cachePolicy?: SemanticDecisionCachePolicy;
  readonly resultSchema?: JsonObject;
  readonly unavailable?: SemanticDecisionUnavailableDisposition;
  readonly maxSteps?: number;
}

export async function quoteDecisionDescriptor(
  overrides: DeclarationOverrides = {},
): Promise<CompiledSemanticDecisionDescriptor> {
  const body = {
    decisionId: overrides.decisionId ?? 'quote-decision',
    inputSelection: overrides.inputSelection ?? '$.order',
    resultSchema: overrides.resultSchema ?? QUOTE_RESULT_SCHEMA,
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['QUOTE_DECIDED'],
    queryCapabilityIds: overrides.queryCapabilityIds ?? ['quotes.lookup'],
    dependencyMaterial: overrides.dependencyMaterial ?? { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: overrides.cachePolicy ?? ({ mode: 'eligible' } as const),
    policy: { maxSteps: overrides.maxSteps ?? 4 },
    unavailable: overrides.unavailable ?? ({ kind: 'fail-closed' } as const),
  };
  return { ...body, declarationDigest: await computeCanonicalJsonDigest(body, sha256) };
}

export interface PackageOverrides {
  readonly semanticDecisionContractVersion?: string;
  readonly domainVersion?: string;
}

export async function successorPackage(
  decisions: readonly CompiledSemanticDecisionDescriptor[] | undefined,
  overrides: PackageOverrides = {},
): Promise<TargetCompiledDomainPackage> {
  const manifest: Record<string, unknown> = {
    formatVersion: '0.3',
    runtimeContractMajor: 2,
    executionEngineMajor: 3,
    domainId: 'orders',
    domainVersion: overrides.domainVersion ?? '0.6.0-t007',
    packageId: 'pending',
    targetProfileId: 't007-conformance@1',
    requiredCapabilities: [...ALL_SUCCESSOR_CAPABILITIES],
    workflows: {
      'order-quote': {
        workflowId: 'order-quote',
        definition: {
          initial: 'review',
          states: {
            review: { final: false, done: [], error: [], events: {} },
            approved: { final: true, done: [], error: [], events: {} },
            rejected: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 32 },
        },
        messageContracts: {},
      },
    },
    tools: {
      'quotes.lookup': {
        toolId: 'quotes.lookup',
        outputSchema: { type: 'object' },
        effect: 'none',
        execution: { kind: 'runtime-read', bindingId: 'bind:quotes.lookup' },
        requiredCapabilities: [CAPS.expression],
      },
    },
    projections: {
      'quote.view': {
        projectionId: 'quote.view',
        expression: '$',
        dependencies: [{ kind: 'business', source: 'quotes.source', selector: {} }],
        outputSchema: { type: 'object' },
      },
    },
    schemas: {},
    bindingDigests: { 'bind:quotes.lookup': 'digest-bind:quotes.lookup' },
    schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
    packageDataBounds: {
      maxDomainDataEntries: 4,
      maxDomainDataEntryCanonicalBytes: 2048,
      maxTotalDomainDataCanonicalBytes: 8192,
      maxBusinessSources: 4,
      maxSchemaCanonicalBytes: 4096,
    },
    domainData: [],
    businessSources: [{ source: 'quotes.source', valueSchema: { type: 'object' } }],
  };
  if (decisions !== undefined) {
    manifest['semanticDecisionContractVersion']
      = overrides.semanticDecisionContractVersion ?? SEMANTIC_DECISION_CONTRACT_VERSION_V1;
    manifest['semanticDecisions'] = decisions;
  }
  const typed = manifest as unknown as TargetCompiledDomainPackage['manifest'];
  typed.packageId = await computeCompiledPackageId(typed, sha256);
  return {
    manifest: typed,
    bindings: { 'bind:quotes.lookup': 'host-read-handle' },
    domainData: {},
  };
}

/* ------------------------------------------------------------------------ */
/* Guarded journey store: A8 + A9 portable boundaries over one store         */
/* ------------------------------------------------------------------------ */

const TERMINAL_LIFECYCLES: ReadonlySet<WorkflowInstanceSnapshot['lifecycle']> = new Set([
  'completed',
  'failed',
  'cancelled',
  'terminated',
]);

interface StoredCommandMessage {
  readonly message: DomainMessage;
  readonly targetSequence: number;
  readonly ack: MessageAcceptedAck;
  disposition: 'accepted' | 'processing' | 'processed';
  readonly acceptedAt: string;
  processingAt: string | null;
  resolvedAt: string | null;
}

interface StoredCommandInstance {
  snapshot: WorkflowInstanceSnapshot;
  nextTargetSequence: number;
  readonly correlationId: string;
  readonly packageId: string;
  readonly messages: Map<string, StoredCommandMessage>;
}

const addressKey = (targetAddress: WorkflowAddress): string =>
  `${targetAddress.workflowId}\u0000${targetAddress.instanceKey}`;

/**
 * The T007 journey store. It composes, in ONE RuntimeStore:
 * - the EXISTING portable Runtime Observation machinery (inherited verbatim
 *   from the T006 fixture store, including the DECISION_RECEIPT append seam);
 * - the A8 accepted-message identity collision boundary at the durable
 *   duplicate-accept edge (the same `requireAcceptedMessageIdentityCompatible`
 *   contract the Node and Expo SQLite adapters run, before any new write);
 * - the A9 exact N→N+1 processed-command revision guard as the FIRST
 *   statement of `commitProcessedCommandTurn` (the same
 *   `assertProcessedCommandTurnRevisionProgression` contract the Node and Expo
 *   adapters run, before any durable mutation), followed by an atomic
 *   logical commit of disposition + state + process data + command outcome.
 *
 * This is test infrastructure over portable product contracts — a logical
 * reference adapter, not a durability claim (T008/T009 own real hosts).
 */
export class GuardedJourneyStore
  extends InMemoryObservationStore
  implements RuntimeStoreProcessCommandExtension
{
  readonly #commandInstances = new Map<string, StoredCommandInstance>();
  readonly #processData = new Map<string, DurableProcessData>();
  readonly #commandOutcomes = new Map<string, CommandOutcomeSnapshot>();

  override async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    await super.createInstance(snapshot);
    const key = addressKey(snapshot.address);
    if (this.#commandInstances.has(key)) {
      throw new Error(`Workflow ${snapshot.address.workflowId}/${snapshot.address.instanceKey} already exists`);
    }
    this.#commandInstances.set(key, {
      snapshot: structuredClone(snapshot),
      nextTargetSequence: 1,
      correlationId: snapshot.correlationId,
      packageId: snapshot.packageId,
      messages: new Map(),
    });
  }

  override async getInstance(targetAddress: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null> {
    const row = this.#commandInstances.get(addressKey(targetAddress));
    return row === undefined ? super.getInstance(targetAddress) : structuredClone(row.snapshot);
  }

  /**
   * A8 (v0.6 T002): a repeated target+messageId is only a valid idempotent
   * replay when the whole AcceptedMessageIdentity tuple is compatible with the
   * durable acceptance; an incompatible replay fails closed BEFORE any new
   * durable write (MESSAGE_IDENTITY_COLLISION). A compatible replay returns
   * the original duplicate ack unchanged.
   */
  override async acceptMessage(message: DomainMessage): Promise<MessageAcceptedAck> {
    const row = this.#requireRow(message.target);
    const instanceAddress = row.snapshot.address;
    const existing = row.messages.get(message.messageId);
    if (existing !== undefined) {
      requireAcceptedMessageIdentityCompatible(
        message,
        {
          workflowId: instanceAddress.workflowId,
          instanceKey: instanceAddress.instanceKey,
          correlationId: row.correlationId,
          packageId: row.packageId,
        },
        {
          workflowId: instanceAddress.workflowId,
          instanceKey: instanceAddress.instanceKey,
          messageId: existing.message.messageId,
          type: existing.message.type,
          payloadJson: canonicalJsonStringify(existing.message.payload),
          correlationId: existing.message.correlationId ?? row.correlationId,
          causationId: existing.message.causationId ?? null,
          contractVersion: existing.message.contractVersion ?? null,
          packageId: row.packageId,
        },
      );
      return { ...existing.ack, status: 'duplicate' };
    }
    if (row.snapshot.lifecycle === 'recovery_required' || TERMINAL_LIFECYCLES.has(row.snapshot.lifecycle)) {
      throw new Error(
        `Workflow ${instanceAddress.workflowId}/${instanceAddress.instanceKey} does not accept new messages in lifecycle ${row.snapshot.lifecycle}`,
      );
    }
    const targetSequence = row.nextTargetSequence;
    const acceptedAt = NOW;
    const ack: MessageAcceptedAck = {
      status: 'accepted',
      messageId: message.messageId,
      target: message.target,
      targetSequence,
      packageId: row.packageId,
      acceptedAt,
    };
    row.messages.set(message.messageId, {
      message: structuredClone(message),
      targetSequence,
      ack,
      disposition: 'accepted',
      acceptedAt,
      processingAt: null,
      resolvedAt: null,
    });
    row.nextTargetSequence = targetSequence + 1;
    return ack;
  }

  override async getMessageDisposition(
    targetAddress: WorkflowAddress,
    messageId: string,
  ): Promise<MessageDispositionSnapshot | null> {
    const row = this.#commandInstances.get(addressKey(targetAddress));
    if (row === undefined) return null;
    const stored = row.messages.get(messageId);
    if (stored === undefined) return null;
    return {
      messageId: stored.message.messageId,
      target: targetAddress,
      targetSequence: stored.targetSequence,
      packageId: row.packageId,
      disposition: stored.disposition,
      correlationId: stored.message.correlationId ?? row.correlationId,
      ...(stored.message.causationId === undefined ? {} : { causationId: stored.message.causationId }),
      acceptedAt: stored.acceptedAt,
      ...(stored.processingAt === null ? {} : { processingAt: stored.processingAt }),
      ...(stored.resolvedAt === null ? {} : { resolvedAt: stored.resolvedAt }),
    };
  }

  override async getNextAcceptedMessage(targetAddress: WorkflowAddress): Promise<StoredAcceptedMessage | null> {
    const row = this.#commandInstances.get(addressKey(targetAddress));
    if (row === undefined) return null;
    if (row.snapshot.lifecycle === 'recovery_required' || TERMINAL_LIFECYCLES.has(row.snapshot.lifecycle)) {
      return null;
    }
    const head = [...row.messages.values()]
      .sort((left, right) => left.targetSequence - right.targetSequence)
      .find((stored) => stored.disposition === 'accepted');
    if (head === undefined) return null;
    return { message: structuredClone(head.message), ack: { ...head.ack } };
  }

  override async markMessageProcessing(
    targetAddress: WorkflowAddress,
    messageId: string,
    processingAt: string,
  ): Promise<boolean> {
    const row = this.#commandInstances.get(addressKey(targetAddress));
    if (row === undefined) return false;
    if (row.snapshot.lifecycle === 'recovery_required' || TERMINAL_LIFECYCLES.has(row.snapshot.lifecycle)) {
      return false;
    }
    const head = [...row.messages.values()]
      .sort((left, right) => left.targetSequence - right.targetSequence)
      .find((stored) => stored.disposition === 'accepted' || stored.disposition === 'processing');
    if (head === undefined || head.message.messageId !== messageId || head.disposition !== 'accepted') {
      return false;
    }
    head.disposition = 'processing';
    head.processingAt = processingAt;
    head.resolvedAt = null;
    return true;
  }

  async commitProcessedMessage(_request: CommitProcessedMessageRequest): Promise<void> {
    throw new Error('commitProcessedMessage is outside the T007 journey surface; journeys commit through the T-009 processed-command extension');
  }

  async failMessageProcessing(_request: FailMessageProcessingRequest): Promise<void> {
    throw new Error('failMessageProcessing is outside the T007 journey surface');
  }

  async terminalizeInstance(_request: TerminalizeInstanceRequest): Promise<void> {
    throw new Error('terminalizeInstance is outside the T007 journey surface');
  }

  async getProcessData(targetAddress: WorkflowAddress): Promise<DurableProcessDataSnapshot | null> {
    const row = this.#commandInstances.get(addressKey(targetAddress));
    const data = this.#processData.get(addressKey(targetAddress));
    if (row === undefined || data === undefined) return null;
    return {
      target: targetAddress,
      instanceStateRevision: row.snapshot.stateRevision,
      data: structuredClone(data),
    };
  }

  async getCommandOutcome(
    targetAddress: WorkflowAddress,
    messageId: string,
  ): Promise<CommandOutcomeSnapshot | null> {
    const outcome = this.#commandOutcomes.get(`${addressKey(targetAddress)}\u0000${messageId}`);
    return outcome === undefined ? null : structuredClone(outcome);
  }

  /**
   * A9 (v0.6 T003): the frozen structural guard runs as the FIRST statement —
   * before any durable mutation — exactly like the Node and Expo adapters.
   * A nonconforming persistence command fails closed with
   * ProcessCommandContractError/STATE_REVISION_MISMATCH and leaves the store
   * byte-identical (no partial commit).
   */
  async commitProcessedCommandTurn(commit: ProcessedCommandTurnCommit): Promise<void> {
    assertProcessedCommandTurnRevisionProgression(commit);
    const row = this.#requireRow(commit.target);
    const stored = row.messages.get(commit.messageId);
    if (
      stored === undefined
      || stored.targetSequence !== commit.expectedTargetSequence
      || stored.disposition !== 'processing'
    ) {
      throw new Error(
        `Message ${commit.messageId} is not the expected processing message at sequence ${commit.expectedTargetSequence}`,
      );
    }
    if (row.snapshot.stateRevision !== commit.expectedStateRevision) {
      throw new Error(
        `Instance state revision ${row.snapshot.stateRevision} does not match the commit's expected revision ${commit.expectedStateRevision}`,
      );
    }
    // Atomic logical apply: disposition + state + process data + outcome in the
    // same logical durability domain; no await between validation and mutation.
    row.messages.set(commit.messageId, {
      ...stored,
      disposition: 'processed',
      resolvedAt: commit.updatedAt,
    });
    row.snapshot = {
      ...row.snapshot,
      lifecycle: commit.nextLifecycle,
      stateRevision: commit.nextStateRevision,
      state: structuredClone(commit.nextState),
      updatedAt: commit.updatedAt,
    };
    this.#processData.set(addressKey(commit.target), structuredClone(commit.nextProcessData));
    this.#commandOutcomes.set(
      `${addressKey(commit.target)}\u0000${commit.messageId}`,
      structuredClone(commit.outcome),
    );
  }

  /** Test-facing durable fact readers for conformance assertions. */
  commandMessageCount(targetAddress: WorkflowAddress): number {
    const row = this.#commandInstances.get(addressKey(targetAddress));
    return row === undefined ? 0 : row.messages.size;
  }

  commandMessageDisposition(targetAddress: WorkflowAddress, messageId: string): string | undefined {
    return this.#commandInstances.get(addressKey(targetAddress))?.messages.get(messageId)?.disposition;
  }

  #requireRow(targetAddress: WorkflowAddress): StoredCommandInstance {
    const row = this.#commandInstances.get(addressKey(targetAddress));
    if (row === undefined) {
      throw new Error(`Unknown workflow ${targetAddress.workflowId}/${targetAddress.instanceKey}`);
    }
    return row;
  }
}


/* ------------------------------------------------------------------------ */
/* v3 assembly fixture                                                       */
/* ------------------------------------------------------------------------ */

class MemoryActivationAuthority {
  current: unknown;
  async readDomainActivationBinding(): Promise<unknown> {
    return this.current;
  }
  async publishDomainActivationBinding(binding: unknown): Promise<void> {
    this.current = binding;
  }
}

class MemoryPackageCdiAuthority {
  readonly #records = new Map<string, unknown>();
  add(binding: unknown): void {
    const record = binding as { domainId: string; packageId: string; domainIntelligenceContentDigest: string };
    this.#records.set(`${record.domainId} ${record.packageId} ${record.domainIntelligenceContentDigest}`, binding);
  }
  async resolveExactPackageCdi(binding: unknown): Promise<unknown> {
    const record = binding as { domainId: string; packageId: string; domainIntelligenceContentDigest: string };
    return this.#records.get(`${record.domainId} ${record.packageId} ${record.domainIntelligenceContentDigest}`);
  }
}

/** Durable pieces that survive a simulated runtime reopen (scenario 10). */
export interface SharedDurableStores {
  readonly store: GuardedJourneyStore;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly durableExecution: MemoryDurableExecutionStore;
  readonly tools: ScriptedEffectTools;
  readonly b1: GovernanceBaselineBody;
}

export interface ConformanceFixture {
  readonly assembly: Awaited<ReturnType<typeof createDomainRuntimeV3>>;
  readonly store: GuardedJourneyStore;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly tools: ScriptedEffectTools;
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly durableExecution: MemoryDurableExecutionStore;
  readonly packageId: string;
  readonly packageIdentity: ReturnType<typeof runtimePackageIdentityFromManifest>;
  readonly b1: GovernanceBaselineBody;
  readonly declarations: readonly CompiledSemanticDecisionDescriptor[];
  readonly receiptErrors: unknown[];
}

export interface FixtureOptions {
  readonly capabilities?: readonly CapabilityId[];
  readonly shared?: SharedDurableStores;
  readonly observation?: boolean;
  readonly packageOverrides?: PackageOverrides;
}

export async function conformanceFixture(
  decisions: readonly CompiledSemanticDecisionDescriptor[],
  options: FixtureOptions = {},
): Promise<ConformanceFixture> {
  const journal = options.shared?.journal ?? new VolatileAdmissionEffectJournal();
  const tools = options.shared?.tools ?? new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });
  const baselines = options.shared?.baselines ?? new MemoryGovernanceBaselineStore();
  const durableExecution = options.shared?.durableExecution ?? new MemoryDurableExecutionStore();
  const store = options.shared?.store ?? new GuardedJourneyStore();
  let b1 = options.shared?.b1;
  if (b1 === undefined) {
    b1 = await makeBaseline('B1', [CAP_INVARIANT]);
    await baselines.putBody(b1);
  }
  // An empty list means the package carries NO semantic-decision material at
  // all (the compiled field is omitted; an empty present array fails
  // activation by contract).
  const compiledPackage = await successorPackage(
    decisions.length === 0 ? undefined : decisions,
    options.packageOverrides,
  );
  const expressionRuntime = new ExpressionRuntime();
  const receiptErrors: unknown[] = [];
  const observation = options.observation === false ? undefined : { mode: 'enabled' as const };
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store,
    ...(observation === undefined ? {} : { observation }),
    bindings: createRuntimeHostFake({
      sha256,
      // Default: a host that supports the full successor capability set
      // (including the compiled semantic-decision capability).
      capabilities: options.capabilities ?? [...ALL_SUCCESSOR_CAPABILITIES],
      expression: {
        async evaluate(request) {
          return expressionRuntime.evaluate(request.expression, request.input, request.logicalTime);
        },
      },
    }),
    supportedPackageDataBounds: {
      maxDomainDataEntries: 32,
      maxDomainDataEntryCanonicalBytes: 4096,
      maxTotalDomainDataCanonicalBytes: 16384,
      maxBusinessSources: 32,
      maxSchemaCanonicalBytes: 8192,
    },
    v3: {
      baselines,
      activationAuthority: new MemoryActivationAuthority() as never,
      exactPackageCdi: new MemoryPackageCdiAuthority() as never,
      durableExecution,
      effectJournal: journal,
      effectTools: tools,
      evidence: new VolatileRuntimeEvidenceStore(),
      onEvidenceError: (error: unknown) => {
        receiptErrors.push(error);
      },
    },
  });
  return {
    assembly,
    store,
    journal,
    tools,
    baselines,
    durableExecution,
    packageId: compiledPackage.manifest.packageId,
    packageIdentity: runtimePackageIdentityFromManifest(compiledPackage.manifest),
    b1,
    declarations: decisions,
    receiptErrors,
  };
}

/** Open the journey instance on the store and pin it durably to the package. */
export async function openAndPinInstance(
  fixture: ConformanceFixture,
  overrides: { readonly instanceKey?: string } = {},
): Promise<void> {
  const address: WorkflowAddress = {
    workflowId: target.workflowId,
    instanceKey: overrides.instanceKey ?? target.instanceKey,
  };
  await fixture.store.createInstance({
    address,
    correlationId: 'corr-t007-journey',
    packageId: fixture.packageId,
    lifecycle: 'waiting',
    stateRevision: 0,
    state: { phase: 'review' },
    createdAt: NOW,
    updatedAt: NOW,
  });
  await fixture.assembly.governance.pinExecution({
    workflowTarget: address.workflowId,
    workflowInstanceId: address.workflowId + ':' + address.instanceKey,
    binding: {
      domainId: 'orders',
      packageId: fixture.packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: fixture.b1.identity,
    },
  });
}

/* ------------------------------------------------------------------------ */
/* Observation stream readers (existing cursor paging semantics)             */
/* ------------------------------------------------------------------------ */

export function streamOf(fixture: ConformanceFixture): RuntimeObservationStreamRef {
  return {
    target,
    package: fixture.packageIdentity,
    epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  };
}

/** Read the full durable stream through the EXISTING cursor paging semantics. */
export async function readAllRecords(fixture: ConformanceFixture): Promise<readonly RuntimeObservationRecord[]> {
  const records: RuntimeObservationRecord[] = [];
  let afterCursor: string | undefined;
  for (;;) {
    const page = await fixture.store.readObservations({
      stream: streamOf(fixture),
      ...(afterCursor === undefined ? {} : { afterCursor }),
      limit: 2,
    });
    records.push(...page.records);
    if (page.nextCursor === undefined) break;
    afterCursor = page.nextCursor;
  }
  return records;
}

export async function readReceiptRecords(
  fixture: ConformanceFixture,
): Promise<readonly { readonly sequence: number; readonly receipt: DecisionResolutionReceipt }[]> {
  const receipts: { readonly sequence: number; readonly receipt: DecisionResolutionReceipt }[] = [];
  for (const record of await readAllRecords(fixture)) {
    assert.equal(record.kind, 'DECISION_RECEIPT');
    assert.ok(record.decisionReceipt !== undefined, 'receipt records carry the decisionReceipt envelope field');
    receipts.push({ sequence: record.sequence, receipt: record.decisionReceipt });
  }
  return receipts;
}

/* ------------------------------------------------------------------------ */
/* Turn builders (T004/T006 fixture vocabulary)                              */
/* ------------------------------------------------------------------------ */

export class CapturingRule implements DecisionResolverRulePort<QuoteDecisionResult> {
  calls = 0;
  readonly inputs: DecisionResolverRuleInput[] = [];
  readonly producerIdentity = {
    kind: 'rule' as const,
    artifactId: 'rule:quote-rules',
    contentDigest: 'digest-rule:quote-rules',
  };

  constructor(
    private readonly outcome:
      | { readonly status: 'no-match' }
      | { readonly status: 'match'; readonly result: QuoteDecisionResult },
  ) {}

  async evaluate(
    input: DecisionResolverRuleInput,
  ): Promise<{ readonly status: 'no-match' } | { readonly status: 'match'; readonly result: QuoteDecisionResult }> {
    this.calls += 1;
    this.inputs.push(input);
    return this.outcome;
  }
}

export function harnessMaterial(
  model: ScriptedModel,
  journal = new VolatileHarnessExecutionJournalStore(),
): RuntimeHarnessDecisionTurnMaterial {
  return {
    input: { domainFacts: {}, compiledIntelligence: {}, workflowContext: {}, capabilities: [], model },
    journal,
    harnessProducerIdentity: HARNESS_PRODUCER,
  };
}

/** Harness material with one query-only capability bound (declaration-gated). */
export function queryHarnessMaterial(
  model: ScriptedModel,
  journal = new VolatileHarnessExecutionJournalStore(),
): RuntimeHarnessDecisionTurnMaterial {
  return {
    input: {
      domainFacts: {},
      compiledIntelligence: {},
      workflowContext: {},
      capabilities: [{
        capabilityId: 'quotes.lookup',
        description: 'quote lookup',
        kind: 'query' as const,
        execute: async () => ({ value: { ok: true } }),
      }],
      model,
    },
    journal,
    harnessProducerIdentity: HARNESS_PRODUCER,
  };
}

export interface TurnOverrides {
  readonly decisionId?: string;
  readonly turn?: ResolveAndAdmitTurnRequest['turn'];
  readonly definition?: ResolveAndAdmitTurnRequest['definition'];
  readonly context?: JsonObject;
  readonly event?: ResolveAndAdmitTurnRequest['event'];
  readonly currentStateKey?: string;
  readonly rule?: DecisionResolverRulePort<QuoteDecisionResult>;
  readonly resolver?: Partial<DecisionResolverPorts<QuoteDecisionResult>>;
  readonly harness?: RuntimeHarnessDecisionTurnMaterial;
  readonly dependencies?: ResolveAndAdmitTurnRequest['dependencies'];
}

export function turnRequest(overrides: TurnOverrides = {}): ResolveAndAdmitTurnRequest<QuoteDecisionResult> {
  const resolver: DecisionResolverPorts<QuoteDecisionResult> = {
    ...(overrides.rule === undefined ? {} : { rule: overrides.rule }),
    ...(overrides.resolver === undefined ? {} : overrides.resolver),
  };
  return {
    decisionId: overrides.decisionId ?? 'quote-decision',
    target,
    turn: overrides.turn ?? { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId,
    definition: overrides.definition ?? makeDefinition(),
    currentStateKey: overrides.currentStateKey ?? 'review',
    context: overrides.context ?? { order: { sku: 'P-1', quantity: 3 } },
    event: overrides.event ?? quoteEvent(42),
    now: NOW,
    resolver,
    ...(overrides.harness === undefined ? {} : { harness: overrides.harness }),
    ...(overrides.dependencies === undefined ? {} : { dependencies: overrides.dependencies }),
  };
}

export function expectAdmitted(outcome: ResolvedTurnAdmissionOutcome): Extract<ResolvedTurnAdmissionOutcome, { status: 'admitted' }> {
  if (outcome.status !== 'admitted') assert.fail(`expected admitted outcome, got ${JSON.stringify(outcome)}`);
  return outcome;
}

export function expectDenied(outcome: ResolvedTurnAdmissionOutcome): Extract<ResolvedTurnAdmissionOutcome, { status: 'denied' }> {
  if (outcome.status !== 'denied') assert.fail(`expected denied outcome, got ${JSON.stringify(outcome)}`);
  return outcome;
}

/** Fresh rule-less resolver fixture whose Harness fallback runs a scripted model. */
export function resolverFixture(): ReturnType<typeof makeFixture> & { readonly model: ScriptedModel } {
  const fixture = makeFixture();
  const model = new ScriptedModel([finalResponse('approve', { via: 'harness' })]);
  return { ...fixture, model };
}

/* ------------------------------------------------------------------------ */
/* The composed host command-turn loop: A8 accept → mark → seam → A9 commit  */
/* ------------------------------------------------------------------------ */

export type CommandTurnOverrides = TurnOverrides;

export function commandMessage(messageId: string, overrides: Partial<DomainMessage> = {}): DomainMessage {
  return {
    messageId,
    target,
    type: 'QUOTE_DECIDED',
    payload: { amount: 42 },
    ...overrides,
  };
}

export type JourneyTurnResult =
  | {
      readonly kind: 'duplicate-ack';
      readonly ack: MessageAcceptedAck;
      readonly existingOutcome: CommandOutcomeSnapshot | null;
    }
  | {
      readonly kind: 'processed';
      readonly ack: MessageAcceptedAck;
      readonly outcome: ResolvedTurnAdmissionOutcome;
      readonly commit: ProcessedCommandTurnCommit | null;
    };

/**
 * The host turn loop of the composed journey, over EXISTING authorities only:
 * A8 acceptance boundary → processing mark → resolveAndAdmitTurn seam →
 * runtime-core processed-command preparation → A9-guarded store commit.
 */
export async function processCommandTurn(
  fixture: ConformanceFixture,
  message: DomainMessage,
  turnOverrides: CommandTurnOverrides = {},
): Promise<JourneyTurnResult> {
  const ack = await fixture.store.acceptMessage(message);
  if (ack.status === 'duplicate') {
    const existingOutcome = await fixture.store.getCommandOutcome(message.target, message.messageId);
    return { kind: 'duplicate-ack', ack, existingOutcome };
  }
  const marked = await fixture.store.markMessageProcessing(message.target, message.messageId, NOW);
  assert.equal(marked, true, 'the head accepted message must mark processing');
  const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    ...turnOverrides,
    turn: { kind: 'message', sourceMessageId: message.messageId },
  }));

  // Derive the processed-command commit through the EXISTING runtime-core
  // authority (RUNTIME_CORE owns the N→N+1 revision derivation), then hand it
  // to the A9-guarded store boundary.
  const instance = await fixture.store.getInstance(message.target);
  const disposition = await fixture.store.getMessageDisposition(message.target, message.messageId);
  const existingOutcome = await fixture.store.getCommandOutcome(message.target, message.messageId);
  assert.ok(instance !== null && disposition !== null, 'durable turn state must exist before commit');
  const resolution = outcome.status === 'admitted'
    ? ({ status: 'applied', result: { transitionKey: outcome.admitted.transitionKey } } as const)
    : ({ status: 'rejected', rejection: { code: 'admission-denied', message: `reason: ${outcome.denial.reason}` } } as const);
  const prepared = prepareProcessedCommandTurn(
    { instance, disposition, existingOutcome },
    {
      target: message.target,
      messageId: message.messageId,
      expectedTargetSequence: disposition.targetSequence,
      expectedStateRevision: instance.stateRevision,
      nextState: { phase: outcome.status === 'admitted' ? outcome.admitted.targetState : 'review' },
      nextProcessData: {},
      nextLifecycle: 'waiting',
      resolution,
      updatedAt: NOW,
    },
  );
  if (prepared.kind === 'commit') {
    await fixture.store.commitProcessedCommandTurn(prepared.commit);
    return { kind: 'processed', ack, outcome, commit: prepared.commit };
  }
  return { kind: 'processed', ack, outcome, commit: null };
}
