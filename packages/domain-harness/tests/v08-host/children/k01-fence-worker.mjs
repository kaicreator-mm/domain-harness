/**
 * K01 (#1108) fence-race worker child — REAL stock-node process, no tsx, no
 * loader flags. One worker = one independent Host process over ONE shared
 * SQLite file (openSqliteCasStore: WAL + IMMEDIATE transactions), running the
 * EXACT current selected kernel payload imported from the compiler source
 * tree (byte-identical to the R02 data-URL installer discipline).
 *
 * The external non-idempotent effect is an append-only ledger FILE: one
 * appended line = one real external call. Cross-process interleave control
 * rides control documents in the same SQLite file (park/release/entered
 * keys) — the parent orchestrates deterministic interleavings.
 *
 * Modes:
 *   open   --db --instance <key>
 *       Open a PRODUCTION instance and exit.
 *   submit --db --instance <key> --intent approve|note --message <id> \
 *           [--park <enteredKey>:<goKey>] [--fail before|after] [--kill-at-commit]
 *       Submit one occurrence. --park parks INSIDE the effect handler after
 *       the admission fence claim and journal begin, before the external
 *       dispatch: publish ctrl:<enteredKey>, wait for ctrl:<goKey>. --fail
 *       throws before (no ledger line) / after (ledger line) the external
 *       dispatch. --kill-at-commit exits(70) at the instance-document commit
 *       CAS seam (after journal completion, before the state write lands).
 *
 * Prints exactly one JSON result line as the last stdout line.
 */

import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

import { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';

const KERNEL_URL = new URL(
  '../../../../domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs',
  import.meta.url,
);
const KERNEL_SOURCE = await readFile(KERNEL_URL, 'utf8');
const KERNEL_SHA256 = createHash('sha256').update(KERNEL_SOURCE, 'utf8').digest('hex');
const kernel = await import(KERNEL_URL.href);

const NOW = '2026-10-19T00:00:00.000Z';
const WORKFLOW_ID = 'quote';

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
      handler: async ({ input, effectId, resources }) =>
        resources.call('ledger', 'reserve', { ...input, effectId }),
    },
  },
};

async function main() {
  const dbPath = arg('db');
  const instanceKey = arg('instance');
  const workerName = arg('worker') ?? `w-${String(process.pid)}`;
  const ledgerPath = arg('ledger');
  const store = await openSqliteCasStore({ path: dbPath });

  // Deterministic crash injection at the commit seam: the FIRST conditional
  // write of the instance document in a submit occurrence IS the state-CAS
  // commit (createInstance writes mustBeAbsent and runs in the `open` child).
  // A plain delegating wrapper (not a Proxy): SqliteCasStore private fields
  // reject any foreign `this` receiver.
  const docs = hasFlag('kill-at-commit')
    ? {
        get: (key) => store.get(key),
        put: async (key, value, conditions) => {
          if (key.startsWith(`v08-kernel:wf-instance:${WORKFLOW_ID}:`) && conditions?.mustMatchRevision !== undefined) {
            emit({ worker: workerName, phase: 'kill-before-commit', key });
            process.exit(70);
          }
          return store.put(key, value, conditions);
        },
        remove: (key, conditions) => store.remove(key, conditions),
        list: (prefix) => store.list(prefix),
        close: () => store.close(),
      }
    : store;

  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:k01', moduleSha256: KERNEL_SHA256 },
    hostPorts: {
      docs,
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
          const failMode = arg('fail');
          if (failMode === 'before') {
            throw new Error(`external dispatch refused before the call (${String(payload.effectId)})`);
          }
          await appendFile(ledgerPath, `${JSON.stringify({ worker: workerName, effectId: payload.effectId, at: NOW })}\n`, 'utf8');
          if (failMode === 'after') {
            throw new Error(`external dispatch transport failed after the call (${String(payload.effectId)})`);
          }
          return { reserved: true };
        },
      },
      sha256: { digestUtf8: (value) => createHash('sha256').update(value, 'utf8').digest('hex') },
      clock: () => NOW,
    },
    sdkEndpoint: {
      packageId: 'std:k01',
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
  const caller = { role: 'approver', subject: 'u', tenantId: 't', appId: 'a' };

  try {
    if (arg('mode') === 'open') {
      await runtime.openInstance({ target, authorityClass: 'PRODUCTION' });
      emit({ worker: workerName, phase: 'open', status: 'ok' });
      return;
    }
    const receipt = await runtime.submitOccurrence({
      intentType: arg('intent'),
      messageId: arg('message'),
      input: {},
      target,
      caller,
    });
    emit({
      worker: workerName,
      phase: 'submit',
      status: receipt.status,
      stateRevision: receipt.instance?.stateRevision,
      stateKey: receipt.instance?.state?.stateKey,
      effects: receipt.admitted?.effects,
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
