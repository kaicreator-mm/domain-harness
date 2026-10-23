/**
 * K02 phase-2 (#1168) combined-splice worker child — REAL stock-node process,
 * no tsx, no loader flags. One worker = one independent runtime process over
 * ONE shared SQLite file (openSqliteCasStore: WAL + IMMEDIATE transactions),
 * running the EXACT current SPLICED selected kernel payload (the durable
 * original-receipt carrier integrated after the K01 release) imported from
 * the compiler source tree, byte-identical to the data-URL installer
 * discipline.
 *
 * Differences from the K01 fence worker (k02-specific seams):
 *   --scope <deployedAppId>  wire the K02 deployment scope (the scoped key
 *                            grammar `v010-k02:...` + scope-joined turn
 *                            identity); without it the unscoped compatibility
 *                            wiring runs.
 *   --input-json '<json>'    the occurrence input (default {}); the changed-
 *                            input conflict legs send a DIFFERENT canonical
 *                            input under the SAME messageId.
 *
 * The result line reports the receipt surface the splice commits:
 *   status, stateRevision/stateKey (the instance projection carried by the
 *   receipt — the ORIGINAL projection on a replay), idempotentReplay,
 *   turnId, error_code.
 *
 * Prints exactly one JSON result line as the last stdout line.
 */

import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

import { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';

const KERNEL_URL = new URL(
  '../../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs',
  import.meta.url,
);
const KERNEL_SOURCE = await readFile(KERNEL_URL, 'utf8');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');
const kernel = await import(KERNEL_URL.href);

const NOW = '2026-10-19T00:00:00.000Z';
const WORKFLOW_ID = 'quote';
const SCOPE_TENANT = 't-scope';
const SCOPE_APP = 'a-scope';
const SCOPE_PACKAGE = 'pkg:quote:scoped';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const hasFlag = (name) => process.argv.includes(`--${name}`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const emit = (result) => {
  console.log(JSON.stringify(result));
};

/** The Business policy of R02, verbatim semantics: approve carries ONE
 * non-idempotent reserve effect; note is effect-free. */
const policy = {
  packageId: 'biz:quote@1.0.0',
  policyId: 'quote',
  domainId: 'sales',
  workflowDefinition: {
    workflowKey: 'quote',
    initialState: 'review',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'approve', trigger: { kind: 'event', eventType: 'APPROVED' }, targetState: 'approved',
            effectIntents: [{ effectType: 'effect:reserve', input: { amount: 42 }, idempotencyKey: 'reserve:q1' }],
          },
          { transitionKey: 'reject', trigger: { kind: 'event', eventType: 'REJECTED' }, targetState: 'rejected' },
          { transitionKey: 'note', trigger: { kind: 'event', eventType: 'NOTED' }, targetState: 'review' },
        ],
      },
      { stateKey: 'approved', kind: 'final' },
      { stateKey: 'rejected', kind: 'final' },
    ],
  },
  decisionSchema: { isValid: (value) => typeof value?.event?.type === 'string' },
  governanceSemantics: { hardInvariants: [] },
  initialStateKey: 'review',
  initialContext: {},
  rules: {
    'rule:approve': { ruleId: 'rule:approve', eventType: 'APPROVED', payloadFromInput: {} },
    'rule:reject': { ruleId: 'rule:reject', eventType: 'REJECTED', payloadFromInput: {} },
    'rule:note': { ruleId: 'rule:note', eventType: 'NOTED', payloadFromInput: {} },
  },
  intentBindings: {
    approve: { trigger: { kind: 'event', eventType: 'APPROVED' }, ruleId: 'rule:approve', roles: ['approver'] },
    reject: { trigger: { kind: 'event', eventType: 'REJECTED' }, ruleId: 'rule:reject', roles: ['approver'] },
    note: { trigger: { kind: 'event', eventType: 'NOTED' }, ruleId: 'rule:note', roles: ['approver'] },
  },
  effectBindings: {
    'effect:reserve': {
      semantics: 'non-idempotent',
      handler: async ({ input, effectId, resources }) => {
        if (arg('fail') === 'before') {
          throw new Error(`pre-dispatch handler refusal (${String(effectId)})`);
        }
        return resources.call('ledger', 'reserve', { ...input, effectId });
      },
    },
  },
};

async function main() {
  const dbPath = arg('db');
  const instanceKey = arg('instance');
  const workerName = arg('worker') ?? `w-${String(process.pid)}`;
  const ledgerPath = arg('ledger');
  const scopeApp = arg('scope');
  const store = await openSqliteCasStore({ path: dbPath });

  const deploymentScope = scopeApp === undefined
    ? undefined
    : { deployedAppId: scopeApp, tenantId: SCOPE_TENANT, appId: SCOPE_APP, businessPackageId: SCOPE_PACKAGE };

  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:k02-splice', moduleSha256: KERNEL_SHA256 },
    ...(deploymentScope === undefined ? {} : { deploymentScope }),
    hostPorts: {
      docs: store,
      resources: {
        async call(_key, _op, payload) {
          const park = arg('park');
          if (park !== undefined) {
            const [enteredKey, goKey] = park.split(':');
            await store.put(`ctrl:${enteredKey}`, { worker: workerName }, { mustBeAbsent: true });
            const deadline = Date.now() + 60_000;
            while ((await store.get(`ctrl:${goKey}`)) === null) {
              if (Date.now() > deadline) throw new Error(`park go key ctrl:${goKey} never appeared`);
              await sleep(10);
            }
          }
          // The physical non-idempotent ledger: one appended line = one real
          // external call.
          await appendFile(ledgerPath, `${JSON.stringify({ worker: workerName, effectId: payload.effectId, at: NOW })}\n`, 'utf8');
          if (hasFlag('fail-lost-ack-tagged')) {
            throw Object.assign(
              new Error(`lost ACK (tagged refusal HOST_RESOURCE_MALFORMED) after the external dispatch (${String(payload.effectId)})`),
              { code: 'HOST_RESOURCE_MALFORMED' },
            );
          }
          return { reserved: true };
        },
      },
      sha256: { digestUtf8: (value) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: {
      packageId: 'std:k02-splice',
      async interpret(declaration) {
        return {
          source: 'harness-machine',
          structuredDecision: { decision: { outcome: 'decide', data: {} }, event: { type: declaration.eventType, payload: {} } },
          provenance: { ruleId: declaration.ruleId },
          llmAvoided: true,
          cacheDisposition: { read: 'disabled' },
          telemetry: [],
        };
      },
    },
    businessEndpoint: policy,
  });

  const target = { workflowId: WORKFLOW_ID, instanceKey };
  const caller = { role: 'approver', subject: 'u', tenantId: deploymentScope?.tenantId ?? 't', appId: deploymentScope?.appId ?? 'a' };
  let input = {};
  const inputJson = arg('input-json');
  if (inputJson !== undefined) input = JSON.parse(inputJson);

  try {
    if (arg('mode') === 'open') {
      await runtime.openInstance({ target, authorityClass: 'PRODUCTION' });
      emit({ worker: workerName, phase: 'open', status: 'ok' });
      return;
    }
    const receipt = await runtime.submitOccurrence({
      intentType: arg('intent'),
      messageId: arg('message'),
      input,
      target,
      caller,
    });
    emit({
      worker: workerName,
      phase: 'submit',
      status: receipt.status,
      stateRevision: receipt.instance?.stateRevision,
      stateKey: receipt.instance?.state?.stateKey,
      idempotentReplay: receipt.idempotentReplay === true,
      turnId: receipt.turnId ?? receipt.admitted?.durableControlTurnId ?? null,
    });
  } catch (error) {
    emit({
      worker: workerName,
      phase: 'submit',
      status: 'error',
      error_code: error?.code,
      error_name: error?.name,
      error_message: error instanceof Error ? error.message : String(error),
    });
  }
}

main().catch((error) => {
  emit({ worker: 'main', phase: 'crash', status: 'error', error_message: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
