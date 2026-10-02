// #463 I-EXPO-REPAIR-A regression: the Expo wave (#458) findings 1-2 are
// host-independent product defects, reproduced here against the assembled Node
// runtime driving the exact fixture journeys.
//
// SX-E07: a valid 2020-12 pinned contract the compiler accepts (required
// without properties) used to throw at ajv strict-mode compile
// (invalid_pinned_contract), so payload_contract_violation never reached the
// typed send taxonomy and the source landed in technical recovery_required.
// It must instead durably complete as a permanent rejection routed through
// the compiled total rejected route, without retrying the effect.
//
// SX-E08: a recovery retry used to conflict with its own effect journal
// (the recomputed input embeds the volatile stateRevision), so the retried
// logical send never re-ran and the child target never received the message.
// The replay must consume the journalled input: same effect identity, same
// child message identity, send accepted after target recovery.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { compileDomainPackage } from '../../../../packages/domain-harness-compiler/src/index.js';
import type {
  BusinessSourceCompileEntry,
  DomainDataCompileEntry,
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawToolDefinition,
  RawWorkflow,
  TargetHostProfile,
} from '../../../../packages/domain-harness-compiler/src/index.js';
import { StaticPackageRegistry } from '../../../../packages/domain-harness/src/public-v2/index.js';
import { createNodeDomainRuntime } from '../../src/index.js';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import type { DomainRuntime } from '@kaicreator/domain-harness/v2';
import {
  BINDING_CONTENTS,
  CRM_SNAPSHOT,
  HOST_MAXIMA,
  INVENTORY_BINDING_ID,
  SX_CRYPTO,
  SX_INVENTORY,
  SX_MODULE,
  freshDbPath,
  openStore,
  rawSql,
} from './helper.ts';

const NOW = () => '2026-10-03T00:00:00.000Z';

const sha256 = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
} as const;

const inventoryTool: RawToolDefinition = {
  toolId: 'inventory.reserve',
  inputSchema: { type: 'object', additionalProperties: true },
  outputSchema: { type: 'object', additionalProperties: true },
  effect: 'idempotent',
  executionKind: 'host-local-domain-tool@1',
  bindingCapability: SX_INVENTORY,
  requiredCapabilities: [SX_INVENTORY],
};

function targetProfile(): TargetHostProfile {
  return {
    id: 'sx-e07e08-regression@1',
    capabilities: [SX_CRYPTO, SX_MODULE, SX_INVENTORY],
    bindings: {
      [SX_CRYPTO]: 'sx-sha256-v1',
      [SX_MODULE]: 'sx-module-v1',
      [SX_INVENTORY]: INVENTORY_BINDING_ID,
    },
    packageDataBounds: { ...HOST_MAXIMA },
  } as TargetHostProfile;
}

function rawPackage(workflows: readonly RawWorkflow[]): LoadedRawDomainPackage {
  return {
    root: '/sx-e07e08-regression',
    schemaVersion: '0.1',
    domainId: 'sx.e07e08.regression',
    limits: { maxSteps: 16 },
    workflows: new Map(workflows.map((workflow) => [workflow.id, workflow])),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(workflows.map((workflow) => [workflow.id, []])),
  };
}

function parentWorkflow(id: string, targetExpression: string): RawWorkflow {
  return {
    id,
    sourcePath: `/authoring/${id}.yaml`,
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        done: [],
        error: [],
        events: { BEGIN: { routes: [{ target: 'acting' }] } },
      },
      acting: {
        id: 'acting',
        final: false,
        done: [{ target: 'done' }],
        error: [],
        events: {},
        effects: [{
          kind: 'domain-message',
          targetExpression,
          messageType: 'NOTIFY',
          payloadExpression: '$',
          rejected: [{ target: 'rejected' }],
        }],
      },
      done: { id: 'done', final: true, done: [], error: [], events: {} },
      rejected: { id: 'rejected', final: true, done: [], error: [], events: {} },
    },
  } as never;
}

function childWorkflow(id: string, notifySchema: Record<string, unknown>): RawWorkflow {
  return {
    id,
    sourcePath: `/authoring/${id}.yaml`,
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        done: [],
        error: [],
        events: {
          BEGIN: { routes: [{ target: 'done' }] },
          NOTIFY: { routes: [{ target: 'done' }], schema: notifySchema },
        },
      },
      done: { id: 'done', final: true, done: [], error: [], events: {} },
    },
  } as never;
}

function compileFixture(): { readonly manifest: import('@kaicreator/domain-harness/v2').TargetCompiledDomainPackage['manifest']; readonly domainData: Record<string, unknown> } {
  const compiled = compileDomainPackage({
    raw: rawPackage([
      childWorkflow('child', {}),
      childWorkflow('strict-child', { additionalProperties: false, required: ['orderId'], type: 'object' }),
      parentWorkflow('strict-parent', '$.strictChild'),
      parentWorkflow('missing-parent', '$.missingChild'),
    ]),
    domainVersion: '1.0.0-sx-e07e08',
    target: targetProfile(),
    bindingContents: BINDING_CONTENTS,
    tools: [inventoryTool],
    domainData: [{ key: 'tier', value: { level: 1 } }] as readonly DomainDataCompileEntry[],
    businessSources: [{ source: 'crm', valueSchema: { type: 'object', additionalProperties: true } }] as readonly BusinessSourceCompileEntry[],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [
        { kind: 'domain-data', key: 'tier' },
        { kind: 'business', source: 'crm', selector: {} },
      ],
      outputSchema: { type: 'object', additionalProperties: true },
    }] as readonly RawProjectionDefinition[],
  });
  return { manifest: compiled.manifest, domainData: compiled.domainData as Record<string, unknown> };
}

const hostBindings = {
  capabilities: [SX_CRYPTO, SX_MODULE, SX_INVENTORY],
  sha256,
  secureRandom: { randomId: () => `sx-${Math.random().toString(36).slice(2)}` },
  expression: {
    async evaluate(request: { readonly expression: string; readonly input: unknown }): Promise<unknown> {
      if (request.expression === '$.child') return { workflowId: 'child', instanceKey: 'child-1' };
      if (request.expression === '$.missingChild') return { workflowId: 'child', instanceKey: 'missing-child' };
      if (request.expression === '$.strictChild') return { workflowId: 'strict-child', instanceKey: 'strict-1' };
      return request.input;
    },
  },
  hostLocalDomainTools: {
    [INVENTORY_BINDING_ID]: {
      capability: SX_INVENTORY,
      digest: createHash('sha256').update(JSON.stringify({
        bindingId: INVENTORY_BINDING_ID,
        contentDigest: createHash('sha256').update(BINDING_CONTENTS[INVENTORY_BINDING_ID] ?? '', 'utf8').digest('hex'),
      })).digest('hex'),
      async execute(request: { readonly context: { readonly effectId: string } }) {
        return { reserved: true, effectId: request.context.effectId };
      },
    },
  },
};

async function boot(path: string): Promise<{ readonly runtime: DomainRuntime; readonly store: NodeSqliteRuntimeStore; readonly packageId: string }> {
  const fixture = compileFixture();
  const store = openStore(path);
  const runtime = await createNodeDomainRuntime({
    packageRegistry: new StaticPackageRegistry(
      [{ manifest: fixture.manifest, bindings: { [INVENTORY_BINDING_ID]: { opaque: 'host-local-slot' } }, domainData: fixture.domainData }],
      fixture.manifest.packageId,
    ),
    store,
    bindings: hostBindings as never,
    businessSnapshots: CRM_SNAPSHOT,
    supportedPackageDataBounds: HOST_MAXIMA,
    now: NOW,
  });
  return { runtime, store, packageId: fixture.manifest.packageId };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function snapshot(store: NodeSqliteRuntimeStore, workflowId: string, instanceKey: string): Promise<{ lifecycle: string; stateId: string | null } | null> {
  const instance = await store.getInstance({ workflowId, instanceKey });
  return instance === null
    ? null
    : { lifecycle: instance.lifecycle, stateId: (instance.state as { stateId?: string } | null)?.stateId ?? null };
}

function domainMessageJournal(sql: ReturnType<typeof rawSql>, sourceMessageId: string): Array<{ status: string; attempt: number; output_json: string | null }> {
  return sql.rows(
    "SELECT status, attempt, output_json FROM dh_v2_effect_journal WHERE effect_kind = 'domain-message' AND source_message_id = ?",
    [sourceMessageId],
  ) as Array<{ status: string; attempt: number; output_json: string | null }>;
}

test('SX-E07 regression: payload-contract violation durably completes as a routed permanent rejection', async () => {
  const { path } = freshDbPath('e07');
  const first = await boot(path);
  const begin = (messageId: string, workflowId: string) => ({
    messageId,
    target: { workflowId, instanceKey: 'strict-1' },
    type: 'BEGIN' as const,
    payload: {},
    correlationId: 'corr-e07',
  });

  await first.runtime.openInstance({ address: { workflowId: 'strict-child', instanceKey: 'strict-1' }, correlationId: 'corr-e07', input: {} });
  await first.runtime.openInstance({ address: { workflowId: 'strict-parent', instanceKey: 'strict-1' }, correlationId: 'corr-e07', input: {} });
  await first.runtime.send(begin('p-strict', 'strict-parent'));
  await sleep(600);

  const parent = await snapshot(first.store, 'strict-parent', 'strict-1');
  assert.deepEqual(parent, { lifecycle: 'completed', stateId: 'rejected' }, 'the source instance takes the compiled total rejected route');

  const sql = rawSql(path);
  const journal = domainMessageJournal(sql, 'p-strict');
  sql.close();
  assert.equal(journal.length, 1, 'the effect executed exactly once');
  assert.equal(journal[0]?.status, 'completed', 'the rejection is durably completed, not left started');
  const outcome = JSON.parse(journal[0]?.output_json ?? '{}') as { status: string; rejection?: { code: string } };
  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.rejection?.code, 'payload_contract_violation');
  await first.store.close();

  // Reopen on a fresh Runtime: the completed rejection replays from the
  // journal, the source stays routed, and the effect never re-executes.
  const reopened = await boot(path);
  const parentAfterReopen = await snapshot(reopened.store, 'strict-parent', 'strict-1');
  assert.deepEqual(parentAfterReopen, { lifecycle: 'completed', stateId: 'rejected' });
  const sqlReopen = rawSql(path);
  assert.equal(domainMessageJournal(sqlReopen, 'p-strict').length, 1, 'reopen does not re-execute the completed effect');
  sqlReopen.close();
  await reopened.store.close();
}, 120_000);

test('SX-E08 regression: recovery retry replays the journalled logical send to completion', async () => {
  const { path } = freshDbPath('e08');
  const { runtime, store } = await boot(path);
  const begin = {
    messageId: 'p-missing',
    target: { workflowId: 'missing-parent', instanceKey: 'missing-1' },
    type: 'BEGIN' as const,
    payload: {},
    correlationId: 'corr-e08',
  };

  await runtime.openInstance({ address: { workflowId: 'missing-parent', instanceKey: 'missing-1' }, correlationId: 'corr-e08', input: {} });
  await runtime.send(begin);
  await sleep(600);

  const failed = await snapshot(store, 'missing-parent', 'missing-1');
  assert.equal(failed?.lifecycle, 'recovery_required', 'transient target_not_found stays recovery-owned');

  await runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'missing-child' }, correlationId: 'corr-e08', input: {} });
  await runtime.recover({ target: { workflowId: 'missing-parent', instanceKey: 'missing-1' }, action: 'retry', reason: 'e08 regression: child provisioned' });

  // The retried send must be accepted under the SAME effect/child message
  // identity and the child journey must genuinely complete.
  let child: { lifecycle: string; stateId: string | null } | null = null;
  for (let waited = 0; waited < 10_000; waited += 200) {
    child = await snapshot(store, 'child', 'missing-child');
    if (child?.lifecycle === 'completed') break;
    await sleep(200);
  }
  assert.deepEqual(child, { lifecycle: 'completed', stateId: 'done' }, 'the provisioned child target processed the retried send');
  const parent = await snapshot(store, 'missing-parent', 'missing-1');
  assert.equal(parent?.lifecycle, 'waiting', 'the source instance recovered from the transient failure (this fixture shape settles at acting/waiting; done reachability is the #464 fixture-oracle repair)');
  assert.equal(parent?.stateId, 'acting');

  const sql = rawSql(path);
  const journal = domainMessageJournal(sql, 'p-missing');
  sql.close();
  assert.equal(journal.length, 1, 'exactly one logical send: the retry replays the same journal record, never a new child identity');
  assert.equal(journal[0]?.status, 'completed');
  const outcome = JSON.parse(journal[0]?.output_json ?? '{}') as { status: string; ack?: { status: string; target: { workflowId: string; instanceKey: string } } };
  assert.equal(outcome.status, 'accepted');
  assert.deepEqual(outcome.ack?.target, { workflowId: 'child', instanceKey: 'missing-child' });

  await store.close();
  // Reopen: the accepted send is durable; no duplicate acceptance or effect.
  const reopened = await boot(path);
  const childAfterReopen = await snapshot(reopened.store, 'child', 'missing-child');
  assert.deepEqual(childAfterReopen, { lifecycle: 'completed', stateId: 'done' });
  const sqlReopen = rawSql(path);
  assert.equal(domainMessageJournal(sqlReopen, 'p-missing').length, 1, 'reopen does not duplicate the completed send');
  sqlReopen.close();
  await reopened.store.close();
}, 120_000);
