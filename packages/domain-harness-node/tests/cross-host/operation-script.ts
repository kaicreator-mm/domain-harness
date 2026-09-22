// T-024 C1 (operation half): one deterministic operation script driving the
// FULL v0.3 durable surface, executed identically against the Node adapter
// stack and the Expo adapter stack (over the parity driver). The script fixes
// every input — ids, timestamps, digests (real SHA-256 of fixed strings) — so
// the resulting databases are byte-comparable. The wall clock is pinned by the
// caller because the v0.2 RuntimeStore surface reads `new Date()` internally.
//
// Honesty boundary: this is logical-parity evidence (see parity-driver.ts).
import {
  canonicalJsonStringify,
  createDomainRuntimeV3,
  HARNESS_OPERATION_IDENTITY_VERSION,
  PromotedArtifactRegistry,
  StaticPackageRegistry,
  prepareExactSemanticInvocation,
  prepareSemanticCacheWrite,
  dynamicChildSlotKey,
  type CreateDomainRuntimeV3AuthorityOptions,
  type DomainMessage,
  type JsonValue,
  type PromotedArtifactBody,
  type WorkflowAddress,
  type WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness';
import { mkdirSync } from 'node:fs';
import {
  ScriptedEffectTools,
  makeBaseline,
  makeRequest,
  sha256,
  target as TARGET,
  workflowInstanceId as WORKFLOW_INSTANCE_ID,
} from '../../../domain-harness/tests/admission/helpers.js';
import { createRuntimeHostFake } from '../../../domain-harness/tests/helpers/runtime-host-fake.js';
import { bootablePackage } from '../v3-host/host-fixture.js';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import { openNodeSqliteAuthorityStores } from '../../src/store/node-sqlite-authority-stores.js';
import { openExpoSqliteRuntimeStore } from '../../../domain-harness-expo/src/store/expo-sqlite-runtime-store.js';
import { openExpoSqliteAuthorityStores } from '../../../domain-harness-expo/src/store/expo-sqlite-authority-stores.js';
import { createParitySqliteModule } from './parity-driver.js';

export const PARITY_NOW = '2026-09-22T00:00:00.000Z';
export const PARITY_NOW_MS = 1_790_035_200_000; // 2026-09-22T00:00:00.000Z
const EXPO_DB_NAME = 'parity.sqlite';

/** Conflict/error codes observed on the fail-closed probes, in order. */
export interface ScriptOutcome {
  readonly conflictCodes: readonly string[];
}

export interface OpenedStack {
  readonly store: NodeSqliteRuntimeStore | ExpoSqliteRuntimeStoreType;
  readonly authorities:
    | ReturnType<typeof openNodeSqliteAuthorityStores>
    | Awaited<ReturnType<typeof openExpoSqliteAuthorityStores>>;
  close(): Promise<void>;
}

// The Expo runtime store class type without a hard import cycle in types.
type ExpoSqliteRuntimeStoreType = Awaited<ReturnType<typeof openExpoSqliteRuntimeStore>>;

/** Open one adapter stack on `directory` (shared by the parity and retention suites). */
export async function openParityStack(kind: 'node' | 'expo', directory: string): Promise<OpenedStack> {
  mkdirSync(directory, { recursive: true });
  if (kind === 'node') {
    const path = `${directory}/parity.sqlite`;
    const store = new NodeSqliteRuntimeStore({ path });
    const authorities = openNodeSqliteAuthorityStores({ path });
    return {
      store,
      authorities,
      async close() {
        authorities.close();
        store.close();
      },
    };
  }
  const sqlite = createParitySqliteModule(directory);
  // One shared database handle, one writer queue — the intended single-file
  // deployment, exactly as the T-023 device app wires it.
  const database = await sqlite.openDatabaseAsync(EXPO_DB_NAME);
  const authorities = await openExpoSqliteAuthorityStores({ database });
  const store = await openExpoSqliteRuntimeStore({
    database,
    writes: authorities.writes,
  });
  return {
    store,
    authorities,
    async close() {
      await store.close();
      await authorities.close();
      // The injected handle is owned by the caller (as on device); close it
      // last so Windows releases the file locks before temp-dir cleanup.
      await database.closeAsync();
    },
  };
}

/**
 * The fixed operation script. Both stacks execute this exact sequence; any
 * behavioral divergence lands in the table dump or in conflictCodes.
 */
export async function runOperationScript(
  kind: 'node' | 'expo',
  directory: string,
): Promise<ScriptOutcome> {
  const conflictCodes: string[] = [];
  /** Return the thrown error code, or 'NO-ERROR' when the probe did not throw. */
  const codeOf = async (probe: () => Promise<unknown>): Promise<string> => {
    try {
      await probe();
      return 'NO-ERROR';
    } catch (error) {
      return (error as { code?: string }).code ?? String(error);
    }
  };

  const stack = await openParityStack(kind, directory);
  try {
    const { store, authorities } = stack;
    const pkg = await bootablePackage();
    const packageId = pkg.manifest.packageId;

    // --- governance baselines + retention reference ------------------------
    const b1 = await makeBaseline('B1', []);
    const b2 = await makeBaseline('B2', []);
    await authorities.baselines.putBody(b1);
    await authorities.baselines.putBody(b2);
    await authorities.baselines.putReference({
      referenceId: 'ref:validation:b1',
      reason: 'validation',
      baseline: b1.identity,
    });

    // --- activation publication + movement (non-torn single record) --------
    const bindingB1 = {
      domainId: 'orders',
      packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: b1.identity,
    } as const;
    await authorities.activation.publishDomainActivationBinding(bindingB1);
    await authorities.activation.readDomainActivationBinding('orders');

    // --- exact package/CDI authority ---------------------------------------
    await authorities.exactPackageCdi.registerExactPackageCdi({
      domainId: 'orders',
      packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
    });
    await authorities.exactPackageCdi.resolveExactPackageCdi({
      domainId: 'orders',
      packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
    });

    // --- authority audit (append-once identity) -----------------------------
    const auditRecord = {
      auditId: 'audit:promote:quote-review:1.0.0',
      actionId: 'action:promote:1',
      action: 'promote',
      actor: { kind: 'human-operator', actorId: 'operator-1' },
      recordedAt: PARITY_NOW,
      artifact: { kind: 'workflow', artifactId: 'workflow:order-quote', contentDigest: 'pending' },
      candidate: {
        candidateKind: 'workflow',
        candidateId: 'candidate:quote-review',
        candidateContentDigest: 'pending',
        validatorContractVersion: 'candidate-validator-v1',
      },
      package: {
        domainId: 'orders',
        packageId,
        domainIntelligenceContentDigest: 'cdi-orders-b1',
      },
      governance: {
        preChangeBaseline: b1.identity,
        targetBaseline: b1.identity,
        evaluatedUnder: b1.identity,
      },
      evaluationId: 'evaluation:1',
      artifactVersion: '1.0.0',
    } as const;
    await authorities.authorityAudit.put(auditRecord as never);
    conflictCodes.push(await codeOf(() => authorities.authorityAudit.put(auditRecord as never)));

    // --- assembled runtime: pin + two admitted turns + bound snapshot -------
    const tools = new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' });
    const v3: CreateDomainRuntimeV3AuthorityOptions = {
      baselines: authorities.baselines,
      activationAuthority: authorities.activation,
      exactPackageCdi: authorities.exactPackageCdi,
      durableExecution: store,
      effectJournal: authorities.admissionEffectJournal,
      effectTools: tools,
      evidence: authorities.evidence,
    };
    const assembly = await createDomainRuntimeV3({
      packageRegistry: new StaticPackageRegistry([pkg], packageId),
      store,
      bindings: createRuntimeHostFake({ sha256 }),
      v3,
    });
    await assembly.governance.pinExecution({
      workflowTarget: TARGET.workflowId,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      binding: bindingB1,
    });
    const first = await assembly.admitTurn(makeRequest());
    if (first.status !== 'admitted') throw new Error('parity: first turn not admitted');
    const second = await assembly.admitTurn(
      makeRequest({ turn: { kind: 'message', sourceMessageId: 'msg:2' } }),
    );
    if (second.status !== 'admitted') throw new Error('parity: second turn not admitted');
    const pin = await assembly.governance.requirePinnedExecution(WORKFLOW_INSTANCE_ID);
    await assembly.governance.persistSnapshot({
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      governanceBindingDigest: pin.bindingDigest,
      snapshot: { marker: 't024-bound-snapshot', packageId },
    });

    // Pin conflict probe (fail closed, never overwrites).
    const pinConflict = await store.bindGovernanceExecutionPin({
      workflowTarget: TARGET.workflowId,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      bindingDigest: 'different',
      domainId: 'orders',
      packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b2',
      governanceBaseline: b2.identity,
    } as never);
    conflictCodes.push(`pin:${pinConflict}`);

    // --- T-009/T-010 seams: process data, outcome, provisioning, external ---
    const e6Target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'e6-command' };
    const e6Snapshot: WorkflowInstanceSnapshot = {
      address: e6Target,
      correlationId: 'corr-e6',
      packageId,
      lifecycle: 'active',
      stateRevision: 0,
      state: { step: 0 },
      createdAt: PARITY_NOW,
      updatedAt: PARITY_NOW,
    };
    await store.createInstance(e6Snapshot);
    const e6Message: DomainMessage = {
      messageId: 'cmd-e6-1',
      target: e6Target,
      type: 'command',
      payload: { approve: true },
    };
    const e6Ack = await store.acceptMessage(e6Message);
    await store.markMessageProcessing(e6Target, 'cmd-e6-1', PARITY_NOW);
    await store.commitProcessedCommandTurn({
      target: e6Target,
      messageId: 'cmd-e6-1',
      expectedTargetSequence: e6Ack.targetSequence,
      expectedStateRevision: 0,
      nextStateRevision: 1,
      nextState: { step: 1 },
      nextProcessData: { cursor: 'e6-cursor', attempt: 1 },
      nextLifecycle: 'active',
      outcome: {
        status: 'applied',
        messageId: 'cmd-e6-1',
        target: e6Target,
        targetSequence: e6Ack.targetSequence,
        packageId,
        correlationId: 'corr-e6',
        acceptedAt: PARITY_NOW,
        resolvedAt: PARITY_NOW,
        result: { approved: true },
      },
      updatedAt: PARITY_NOW,
    });
    await store.getProcessData(e6Target);
    await store.getCommandOutcome(e6Target, 'cmd-e6-1');

    const provisionTarget: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'prov-1' };
    const provision = {
      provisioningKey: 'prov-key-1',
      target: provisionTarget,
      correlationId: 'corr-prov-1',
      packageId,
      input: { seed: 1 },
      requestedAt: PARITY_NOW,
    } as const;
    await store.ensureProvisionedWorkflowInstance(provision);
    await store.ensureProvisionedWorkflowInstance(provision); // replay → existing

    await store.ensureExternalWorkCorrelation({
      externalCorrelationId: 'ext-1',
      target: e6Target,
      deadlineTimerId: 'timer-e6-1',
      dueAt: '2026-09-22T01:00:00.000Z',
      registeredAt: PARITY_NOW,
    });
    await store.listDueExternalWorkCorrelations('2026-09-22T02:00:00.000Z');
    const settled = await store.compareAndSetExternalWorkCorrelation({
      externalCorrelationId: 'ext-1',
      expectedRevision: 0,
      next: {
        externalCorrelationId: 'ext-1',
        target: e6Target,
        deadlineTimerId: 'timer-e6-1',
        dueAt: '2026-09-22T01:00:00.000Z',
        revision: 1,
        createdAt: PARITY_NOW,
        updatedAt: PARITY_NOW,
        status: 'callback_received',
        terminalSource: {
          kind: 'external_callback',
          durableControlTurnId: first.admitted.durableControlTurnId,
          target: e6Target,
          externalCorrelationId: 'ext-1',
          callbackOrdinal: 1,
          payload: { ok: true },
          observedAt: PARITY_NOW,
        },
      },
    } as never);
    if (settled !== true) throw new Error('parity: external-work CAS did not settle');
    const stale = await store.compareAndSetExternalWorkCorrelation({
      externalCorrelationId: 'ext-1',
      expectedRevision: 0,
      next: {
        externalCorrelationId: 'ext-1',
        target: e6Target,
        deadlineTimerId: 'timer-e6-1',
        dueAt: '2026-09-22T01:00:00.000Z',
        revision: 1,
        createdAt: PARITY_NOW,
        updatedAt: PARITY_NOW,
        status: 'timed_out',
        terminalSource: {
          kind: 'deadline',
          durableControlTurnId: first.admitted.durableControlTurnId,
          target: e6Target,
          externalCorrelationId: 'ext-1',
          timerId: 'timer-e6-1',
          fireOrdinal: 1,
          observedAt: PARITY_NOW,
        },
      },
    } as never);
    if (stale !== false) throw new Error('parity: stale external-work CAS must be rejected');

    // --- promoted registry + alias CAS + retention --------------------------
    const registry = new PromotedArtifactRegistry(authorities.promotedArtifacts, sha256);
    const promotedAuthority = {
      domainId: 'orders',
      packageId,
      domainIntelligenceContentDigest: 'cdi-orders-b1',
      governanceBaseline: b1.identity,
    } as const;
    const promoteVersion = async (version: string, marker: string): Promise<PromotedArtifactBody> => {
      const material = {
        schemaVersion: 'candidate-envelope-v1',
        candidateKind: 'workflow',
        candidateId: 'candidate:quote-review',
        marker,
      } as unknown as JsonValue;
      const result = await registry.promote({
        artifactId: 'workflow:order-quote',
        version,
        validation: {
          ok: true,
          identity: {
            candidateKind: 'workflow',
            candidateId: 'candidate:quote-review',
            candidateContentDigest: await sha256.digestUtf8(canonicalJsonStringify(material)),
            validatorContractVersion: 'candidate-validator-v1',
            governanceBaseline: { ...promotedAuthority.governanceBaseline },
          },
          grantsExecutionPermission: false,
        },
        authorityBinding: promotedAuthority,
        semanticMaterial: material,
        promotion: {
          recordId: `promotion:workflow:order-quote:${version}`,
          authorityRef: `audit://promotion/${version}`,
          recordedAt: PARITY_NOW,
        },
      });
      return result.body;
    };
    const v1 = await promoteVersion('1.0.0', 'quote');
    await registry.bindAlias({
      artifactId: 'workflow:order-quote',
      alias: 'stable',
      artifact: v1.identity,
      expectedRevision: 0,
    });
    const v2 = await promoteVersion('1.1.0', 'quote2');
    await registry.bindAlias({
      artifactId: 'workflow:order-quote',
      alias: 'stable',
      artifact: v2.identity,
      expectedRevision: 1,
    });
    await registry.selectAlias({
      artifactId: 'workflow:order-quote',
      alias: 'stable',
      expectedRevision: 2,
      expectedAuthority: promotedAuthority,
    });
    await registry.recoverExact(v1.identity, promotedAuthority);
    conflictCodes.push(
      await codeOf(() =>
        registry.bindAlias({
          artifactId: 'workflow:order-quote',
          alias: 'stable',
          artifact: v1.identity,
          expectedRevision: 0,
        }),
      ),
    );

    await authorities.promotedArtifacts.putRetention({
      referenceId: 'ret:audit:1',
      reason: 'audit',
      artifact: v1.identity,
      authorityBinding: promotedAuthority,
    });
    await authorities.promotedArtifacts.releaseRetention({
      referenceId: 'ret:audit:1',
      reason: 'audit',
      artifact: v1.identity,
      authorityBinding: promotedAuthority,
    });

    // --- dynamic child pin ---------------------------------------------------
    const slot = {
      target: TARGET,
      parentActorId: 'decision:quote',
      childActorId: 'child:quote-review:1',
      invocationOrdinal: 1,
    };
    await authorities.dynamicChildPins.insertOnce(dynamicChildSlotKey(slot), {
      slot,
      invokingPackageId: packageId,
      invokingAuthority: promotedAuthority,
      artifact: v1.identity,
      pinnedAt: PARITY_NOW,
    });

    // --- exact semantic cache ------------------------------------------------
    const producer = {
      kind: 'workflow',
      artifactId: 'workflow:order-quote',
      contentDigest: packageId,
    } as const;
    const invocation = await prepareExactSemanticInvocation(
      {
        namespace: 't024-parity',
        domainId: 'orders',
        decisionId: 'decision:quote',
        selectedInput: { amount: 42 },
        dependencies: { artifacts: [producer], projections: [], revisions: [] },
        cachePolicy: { mode: 'eligible' },
      },
      sha256,
    );
    if (invocation.cacheEligibility.mode !== 'eligible' || invocation.semanticIdentity === undefined) {
      throw new Error('parity: cache invocation not eligible');
    }
    const preparedWrite = await prepareSemanticCacheWrite(
      invocation,
      { quote: 'approve' },
      producer,
      { artifacts: [producer], projections: [], revisions: [] },
      PARITY_NOW_MS,
      sha256,
    );
    if (!preparedWrite.eligible) throw new Error('parity: cache write not eligible');
    await authorities.semanticCache.putIfAbsent(preparedWrite.entry, PARITY_NOW_MS);
    await authorities.semanticCache.read(invocation.semanticIdentity.key, PARITY_NOW_MS);
    const cacheReplay = await authorities.semanticCache.putIfAbsent(
      { ...preparedWrite.entry, result: { quote: 'reject' }, resultDigest: 'different' },
      PARITY_NOW_MS,
    );
    conflictCodes.push(`cache:${cacheReplay.status}`);

    // --- runtime evidence probe ---------------------------------------------
    const probeEvidence = {
      evidenceId: 'ev:t024:probe:0',
      truthClass: 'runtime-evidence',
      executionAuthority: 'none',
      domainId: 'orders',
      sourceKind: 'metric',
      durability: 'durable-audit',
      provenance: { packageId, governanceBaseline: b1.identity },
      payload: { probe: 1 },
    } as const;
    await authorities.evidence.append(probeEvidence as never);
    conflictCodes.push(
      await codeOf(() =>
        authorities.evidence.append({ ...probeEvidence, payload: { probe: 2 } } as never),
      ),
    );

    // V9 (host seam): evidence rows carry their scope discriminators durably
    // and identity is append-once — a foreign-scope record cannot be rewritten
    // under the same id. Isolation ENFORCEMENT is a core use-gate concern
    // (cited); the stores prove scoped bytes persist exactly (byte parity).
    const scopedEvidence = (evidenceId: string, domainId: string, tenantScope: string) =>
      ({
        evidenceId,
        truthClass: 'runtime-evidence',
        executionAuthority: 'none',
        domainId,
        tenantScope,
        sourceKind: 'metric',
        durability: 'durable-audit',
        provenance: { packageId, governanceBaseline: b1.identity },
        payload: { probe: 2 },
      }) as const;
    await authorities.evidence.append(scopedEvidence('ev:t024:tenant:orders-a', 'orders', 'tenant-a') as never);
    await authorities.evidence.append(scopedEvidence('ev:t024:tenant:billing-b', 'billing', 'tenant-b') as never);
    const crossScopeRewrite = await codeOf(() =>
      authorities.evidence.append(scopedEvidence('ev:t024:tenant:orders-a', 'billing', 'tenant-b') as never),
    );
    if (crossScopeRewrite !== 'RUNTIME_EVIDENCE_APPEND_CONFLICT') {
      throw new Error(`parity: cross-scope evidence rewrite must conflict, got ${crossScopeRewrite}`);
    }

    // V8 (host seam): evidence is write-only and never a replay source — an
    // evidence record referencing a slot with no journal fact must not
    // suppress the beginning of that slot's work.
    await authorities.evidence.append({
      ...probeEvidence,
      evidenceId: 'ev:t024:v8:unexecuted',
      sourceExecution: {
        workflowTarget: TARGET.workflowId,
        workflowInstanceId: WORKFLOW_INSTANCE_ID,
        durableControlTurnId: 'turn-without-journal-fact',
      },
      payload: { probe: 3 },
    } as never);
    const v8Begin = await authorities.harnessJournal.begin({
      identityVersion: HARNESS_OPERATION_IDENTITY_VERSION,
      slot: {
        target: TARGET,
        durableControlTurnId: 'turn-without-journal-fact',
        operationKind: 'ai',
        operationOrdinal: 1,
      },
      semanticContractDigest: 'sha256:contract-1',
    } as never);
    if (v8Begin.disposition !== 'created') {
      throw new Error('parity: evidence must not replay/suppress unexecuted work (V8)');
    }

    // --- harness execution journal -------------------------------------------
    const harnessIdentity = {
      identityVersion: HARNESS_OPERATION_IDENTITY_VERSION,
      slot: {
        target: TARGET,
        durableControlTurnId: first.admitted.durableControlTurnId,
        operationKind: 'ai',
        operationOrdinal: 1,
      },
      semanticContractDigest: 'sha256:contract-1',
    } as const;
    const begun = await authorities.harnessJournal.begin(harnessIdentity as never);
    if (begun.disposition !== 'created') throw new Error('parity: harness journal begin');
    const harnessOutcome = { status: 'succeeded', value: { marker: 'm1' } } as const;
    const committed = await authorities.harnessJournal.commit(
      harnessIdentity as never,
      harnessOutcome as never,
    );

    // V12 (replay half): the committed fact is replayable byte-exactly and
    // idempotently — re-begin returns the existing record, re-commit of the
    // same outcome is a no-op returning the committed fact unchanged.
    const rebegun = await authorities.harnessJournal.begin(harnessIdentity as never);
    if (rebegun.disposition !== 'existing') throw new Error('parity: journal replay must be existing');
    if (canonicalJsonStringify(rebegun.record as never) !== canonicalJsonStringify(committed as never)) {
      throw new Error('parity: journal replay must return the committed fact byte-exactly');
    }
    const recommitted = await authorities.harnessJournal.commit(
      harnessIdentity as never,
      harnessOutcome as never,
    );
    if (canonicalJsonStringify(recommitted as never) !== canonicalJsonStringify(committed as never)) {
      throw new Error('parity: idempotent re-commit must return the committed fact byte-exactly');
    }
    await authorities.harnessJournal.getRecords();

    // --- admission effect journal identity-conflict probe --------------------
    conflictCodes.push(
      await codeOf(() =>
        authorities.admissionEffectJournal.beginEffect({
          effectId: `${first.admitted.durableControlTurnId}/effect/0`,
          target: TARGET,
          durableControlTurnId: first.admitted.durableControlTurnId,
          operationOrdinal: 0,
          effectType: 'effect:reserve',
          effectSemantics: 'non-idempotent',
          status: 'started',
          attempt: 1,
          input: { reservation: 'DIFFERENT', amount: 43 },
          idempotencyKey: 'reserve:quote:1',
          startedAt: PARITY_NOW,
        } as never),
      ),
    );

    return { conflictCodes };
  } finally {
    await stack.close();
  }
}
