// T008 (issue #594): Node REAL-host validation wave shared fixture.
//
// The ONE v0.6 composed runtime (createDomainRuntimeV3: compiled T001
// semantic-decision package → resolveAndAdmitTurn seam → existing DecisionResolver
// → Central Admission → T006 Decision Resolution Receipt → Runtime Observation)
// assembled over REAL better-sqlite3 files: NodeSqliteRuntimeStore +
// openNodeSqliteAuthorityStores bind every durable port (runtime store,
// observation stream, processed-command extension, durable execution,
// governance baselines, activation/exact-CDI authorities, admission effect
// journal, harness journal, exact semantic cache, promoted artifacts, dynamic
// child pins, evidence) to ONE SQLite database file on disk.
//
// This is validation tooling only: every product authority is the existing
// packages/** surface, imported unmodified. Restart semantics: close() really
// closes the better-sqlite3 handles; a fresh fixture over the same file path
// is a genuinely fresh runtime assembly over the same durable state.
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  StaticPackageRegistry,
} from '../../../packages/domain-harness/src/package/registry.js';
import { ExpressionRuntime } from '../../../packages/domain-harness/src/expression/index.js';
import {
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  runtimePackageIdentityFromManifest,
  type DecisionResolutionReceipt,
  type RuntimeObservationRecord,
  type RuntimeObservationStreamRef,
} from '../../../packages/domain-harness/src/observation/index.js';
import { prepareProcessedCommandTurn } from '../../../packages/domain-harness/src/runtime/process-command.js';
import {
  createDomainRuntimeV3,
} from '../../../packages/domain-harness/src/runtime/create-domain-runtime-v3.js';
import type { DomainIntelligencePackageIdentity } from '../../../packages/domain-harness/src/observation/contracts.js';
import type {
  CommandOutcomeSnapshot,
  ProcessedCommandTurnCommit,
} from '../../../packages/domain-harness/src/contracts/process-command.js';
import type { CompiledSemanticDecisionDescriptor } from '../../../packages/domain-harness/src/v2/index.js';
import type {
  DomainMessage,
  MessageAcceptedAck,
  WorkflowAddress,
} from '../../../packages/domain-harness/src/v2/index.js';
import {
  CAP_INVARIANT,
  ScriptedEffectTools,
  makeBaseline,
  target,
  workflowInstanceId,
  NOW,
} from '../../../packages/domain-harness/tests/admission/helpers.js';
import { createRuntimeHostFake } from '../../../packages/domain-harness/tests/helpers/runtime-host-fake.js';
import {
  ALL_SUCCESSOR_CAPABILITIES,
  quoteDecisionDescriptor,
  successorPackage,
  turnRequest,
  type ConformanceFixture,
  type DeclarationOverrides,
} from '../../../packages/domain-harness/tests/v06-conformance/fixtures.js';
import { NodeSqliteRuntimeStore } from '../../../packages/domain-harness-node/src/store/node-sqlite-runtime-store.js';
import {
  openNodeSqliteAuthorityStores,
  type NodeSqliteAuthorityStores,
} from '../../../packages/domain-harness-node/src/store/node-sqlite-authority-stores.js';

// The compiled-declaration identity contract requires REAL lowercase sha256
// hex (repo-standard test port shared by every focused v0.6 suite).
export const sha256 = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

export { target, workflowInstanceId, NOW, CAP_INVARIANT };

export interface T594Fixture {
  readonly directory: string;
  readonly path: string;
  readonly store: NodeSqliteRuntimeStore;
  readonly authorities: NodeSqliteAuthorityStores;
  readonly assembly: Awaited<ReturnType<typeof createDomainRuntimeV3>>;
  readonly tools: ScriptedEffectTools;
  readonly packageId: string;
  readonly packageIdentity: DomainIntelligencePackageIdentity;
  readonly b1: import('../../../packages/domain-harness/src/governance/index.js').GovernanceBaselineBody;
  close(): void;
}

export interface OpenT594FixtureOptions {
  readonly directory?: string;
  /** Full compiled semantic-decision descriptors (wins over decisionOverrides). */
  readonly decisions?: readonly CompiledSemanticDecisionDescriptor[];
  /** Per-declaration overrides for the plain quote decision. */
  readonly decisionOverrides?: readonly DeclarationOverrides[];
  /**
   * Effect tool port override (the SIGKILL worker binds a file-tracing
   * subclass so external effect executions are counted across processes).
   */
  readonly effectTools?: ScriptedEffectTools;
}

/**
 * Open the T008 real-host fixture: ONE SQLite file, every durable port physical.
 * `decisionOverrides` are applied to a single quote decision descriptor; pass
 * several entries for several declarations.
 */
export async function openT594Fixture(
  options: OpenT594FixtureOptions = {},
): Promise<T594Fixture> {
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), 'domain-harness-t594-'));
  const path = join(directory, 'runtime.sqlite');
  const store = new NodeSqliteRuntimeStore({ path });
  const authorities = openNodeSqliteAuthorityStores({ path });
  const b1 = await makeBaseline('B1', [CAP_INVARIANT]);
  await authorities.baselines.putBody(b1);
  const tools = options.effectTools ?? new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });

  const decisions = options.decisions ?? await Promise.all(
    (options.decisionOverrides ?? [{}]).map((overrides) => quoteDecisionDescriptor(overrides)),
  );
  const compiledPackage = await successorPackage(decisions);
  const expressionRuntime = new ExpressionRuntime();
  const bindings = createRuntimeHostFake({
    sha256,
    capabilities: [...ALL_SUCCESSOR_CAPABILITIES],
    expression: {
      async evaluate(request) {
        return expressionRuntime.evaluate(request.expression, request.input, request.logicalTime);
      },
    },
  });
  const assembly = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId),
    store,
    observation: { mode: 'enabled' as const },
    bindings,
    supportedPackageDataBounds: {
      maxDomainDataEntries: 32,
      maxDomainDataEntryCanonicalBytes: 4096,
      maxTotalDomainDataCanonicalBytes: 16384,
      maxBusinessSources: 32,
      maxSchemaCanonicalBytes: 8192,
    },
    v3: {
      baselines: authorities.baselines,
      activationAuthority: authorities.activation,
      exactPackageCdi: authorities.exactPackageCdi,
      durableExecution: store,
      effectJournal: authorities.admissionEffectJournal,
      effectTools: tools,
      evidence: authorities.evidence,
    },
  });
  let closed = false;
  return {
    directory,
    path,
    store,
    authorities,
    assembly,
    tools,
    packageId: compiledPackage.manifest.packageId,
    packageIdentity: runtimePackageIdentityFromManifest(compiledPackage.manifest),
    b1,
    close() {
      if (closed) return;
      closed = true;
      authorities.close();
      store.close();
    },
  };
}

/** Remove the fixture's scratch directory (only for self-created directories). */
export function disposeT594Directory(fixture: T594Fixture): void {
  rmSync(fixture.directory, { recursive: true, force: true });
}

/** Open the journey instance on the REAL store and pin it durably to the package. */
export async function openAndPinT594Instance(
  fixture: T594Fixture,
  overrides: { readonly instanceKey?: string } = {},
): Promise<WorkflowAddress> {
  const address: WorkflowAddress = {
    workflowId: target.workflowId,
    instanceKey: overrides.instanceKey ?? target.instanceKey,
  };
  await fixture.store.createInstance({
    address,
    correlationId: 'corr-t008-node-real-host',
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
  return address;
}

/* ------------------------------------------------------------------------ */
/* Durable observation/receipt readers (existing cursor paging semantics)    */
/* ------------------------------------------------------------------------ */

export function t594Stream(fixture: T594Fixture): RuntimeObservationStreamRef {
  return {
    target,
    package: fixture.packageIdentity,
    epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  };
}

/** Read the full durable stream through the EXISTING cursor paging semantics. */
export async function readAllT594Records(
  fixture: T594Fixture,
): Promise<readonly RuntimeObservationRecord[]> {
  const records: RuntimeObservationRecord[] = [];
  let afterCursor: string | undefined;
  for (;;) {
    const page = await fixture.store.readObservations({
      stream: t594Stream(fixture),
      ...(afterCursor === undefined ? {} : { afterCursor }),
      limit: 2,
    });
    records.push(...page.records);
    if (page.nextCursor === undefined) break;
    afterCursor = page.nextCursor;
  }
  return records;
}

export async function readT594ReceiptRecords(
  fixture: T594Fixture,
): Promise<readonly { readonly sequence: number; readonly receipt: DecisionResolutionReceipt }[]> {
  const receipts: { sequence: number; receipt: DecisionResolutionReceipt }[] = [];
  for (const record of await readAllT594Records(fixture)) {
    if (record.kind !== 'DECISION_RECEIPT') continue;
    if (record.decisionReceipt === undefined) {
      throw new Error('DECISION_RECEIPT record without a decisionReceipt envelope field');
    }
    receipts.push({ sequence: record.sequence, receipt: record.decisionReceipt });
  }
  return receipts;
}

export function t594RecordKinds(records: readonly RuntimeObservationRecord[]): string[] {
  return records.map((record) => record.kind);
}

/* ------------------------------------------------------------------------ */
/* The composed host command-turn loop: A8 accept → mark → seam → A9 commit  */
/* ------------------------------------------------------------------------ */

export type T594TurnOverrides = Parameters<typeof turnRequest>[0];

export type T594TurnResult =
  | {
      readonly kind: 'duplicate-ack';
      readonly ack: MessageAcceptedAck;
      readonly existingOutcome: CommandOutcomeSnapshot | null;
    }
  | {
      readonly kind: 'processed';
      readonly ack: MessageAcceptedAck;
      readonly outcome: Awaited<ReturnType<T594Assembly['resolveAndAdmitTurn']>>;
      readonly commit: ProcessedCommandTurnCommit | null;
    };

/**
 * The composed host turn loop over the REAL store, EXISTING authorities only:
 * A8 acceptance boundary → processing mark → resolveAndAdmitTurn seam →
 * runtime-core processed-command preparation → A9-guarded store commit.
 * Mirrors the T007 journey loop with the physical adapters in place of the
 * in-memory reference store.
 */
export async function t594ProcessCommandTurn(
  fixture: T594Fixture,
  message: DomainMessage,
  turnOverrides: T594TurnOverrides = {},
): Promise<T594TurnResult> {
  // The composed loop drives the store's own observation seam exactly like the
  // v2 runtime does: the acceptance is observed onto the REAL durable stream.
  const { ack } = await fixture.store.acceptMessageWithObservation(message, {
    kind: 'MESSAGE_ACCEPTED',
    packageIdentity: fixture.packageIdentity,
    observedAt: NOW,
  });
  if (ack.status === 'duplicate') {
    const existingOutcome = await fixture.store.getCommandOutcome(message.target, message.messageId);
    return { kind: 'duplicate-ack', ack, existingOutcome };
  }
  const marked = await fixture.store.markMessageProcessing(message.target, message.messageId, NOW);
  if (marked !== true) throw new Error('the head accepted message must mark processing');
  const outcome = await fixture.assembly.resolveAndAdmitTurn(turnRequest({
    ...turnOverrides,
    turn: { kind: 'message', sourceMessageId: message.messageId },
  }));

  const instance = await fixture.store.getInstance(message.target);
  const disposition = await fixture.store.getMessageDisposition(message.target, message.messageId);
  const existingOutcome = await fixture.store.getCommandOutcome(message.target, message.messageId);
  if (instance === null || disposition === null) {
    throw new Error('durable turn state must exist before commit');
  }
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

/** Fixture-shaped adapter for helpers that expect the T007 fixture surface. */
export function asConformanceFixtureShim(fixture: T594Fixture): ConformanceFixture {
  // Only the identity fields are consumed (packageId/packageIdentity/b1);
  // journeys never use the in-memory store/journal of the T007 fixture.
  return {
    assembly: fixture.assembly,
    store: undefined as never,
    journal: undefined as never,
    tools: fixture.tools,
    baselines: undefined as never,
    durableExecution: undefined as never,
    packageId: fixture.packageId,
    packageIdentity: fixture.packageIdentity,
    b1: fixture.b1,
    declarations: [],
    receiptErrors: [],
  } as unknown as ConformanceFixture;
}
