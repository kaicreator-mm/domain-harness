// K02 multiprocess race worker — REAL stock-node child (no tsx).
//
// Protocol (NDJSON lines on stdout):
//   {"event":"outcome","mode":...,"status":"admitted"|"replayed"|"conflict"|"error","code":?,"turns":?,"dispatches":N,"originalReceipt":{...}|null,"stateRevision":N}
// Modes:
//   submit    — one admitTurn; on an honest HOST_CAS_CONFLICT race loss, retry
//               once and report the replay outcome (competing writers never
//               block or lie).
//   sequence  — N sequential turns with messageIds `<prefix>-1..N`, report
//               totals; plus a final replay probe of `probeMessageId`.
import { createHash } from 'node:crypto';
import { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';
import {
  ReceiptCarryingEngine,
} from '../../../../../tests/fixtures/k02-fragment/durable-receipt-carrier-v1.mjs';

const sha256 = { digestUtf8: (value) => createHash('sha256').update(value, 'utf8').digest('hex') };
const SCOPE = { deployedAppId: 'app-k02-mp', tenantId: 'tenant-1', appId: 'app-1', businessPackageId: 'pkg-quote-1.0.0' };

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function decideCounter(state, input) {
  if (input.deny === true) return { status: 'denied', denial: { reason: 'policy' } };
  return {
    status: 'admitted',
    nextState: { stateKey: 'review', count: (state?.count ?? 0) + 1 },
    admitted: { targetState: 'review', transitionKey: 'note' },
    effects: Array.isArray(input.effects) ? input.effects : [],
  };
}

const [mode, sqlitePath, instanceKey, messageId, intentType, inputJson, turnsArg, messagePrefix, probeMessageId] = process.argv.slice(2);
const target = { workflowId: 'quote', instanceKey };
const store = await openSqliteCasStore({ path: sqlitePath });
const engine = new ReceiptCarryingEngine(store, { scope: SCOPE, sha256 });
const localDispatches = [];

async function dispatchEffect({ effect, turnId, messageId: mid }) {
  const outcome = { executedFor: turnId, messageId: mid, effect };
  localDispatches.push(outcome);
  return outcome;
}

function isRaceLoss(error) {
  return typeof error === 'object' && error !== null && error.code === 'HOST_CAS_CONFLICT';
}

try {
  if (mode === 'submit') {
    const input = JSON.parse(inputJson);
    let outcome;
    let raceLosses = 0;
    try {
      outcome = await engine.admitTurn({ target, messageId, intentType, input, decide: decideCounter, dispatch: dispatchEffect });
    } catch (error) {
      if (isRaceLoss(error)) {
        raceLosses += 1;
        outcome = await engine.admitTurn({ target, messageId, intentType, input, decide: decideCounter, dispatch: dispatchEffect });
      } else {
        throw error;
      }
    }
    emit({
      event: 'outcome',
      mode,
      status: outcome.status === 'admitted' && outcome.idempotentReplay === true ? 'replayed' : outcome.status,
      raceLosses,
      dispatches: localDispatches.length,
      originalReceipt: outcome.originalReceipt ?? null,
      stateRevision: outcome.stateRevision ?? outcome.originalReceipt?.instance?.stateRevision ?? null,
    });
  } else if (mode === 'sequence') {
    const turns = Number(turnsArg);
    let admitted = 0;
    for (let index = 1; index <= turns; index += 1) {
      const outcome = await engine.admitTurn({
        target,
        messageId: `${messagePrefix}-${String(index)}`,
        intentType: 'note',
        input: { seq: index },
        decide: decideCounter,
        dispatch: dispatchEffect,
      });
      if (outcome.status === 'admitted' && outcome.idempotentReplay === false) admitted += 1;
    }
    let probe = null;
    if (probeMessageId !== undefined && probeMessageId !== '') {
      const probeOutcome = await engine.admitTurn({
        target,
        messageId: probeMessageId,
        intentType: 'note',
        input: { seq: Number(probeMessageId.split('-').pop()) },
        decide: decideCounter,
        dispatch: dispatchEffect,
      });
      probe = probeOutcome.idempotentReplay === true ? 'replayed' : 'other';
    }
    const snapshot = await engine.getSnapshot(target);
    emit({
      event: 'outcome',
      mode,
      status: 'sequence',
      admitted,
      probe,
      dispatches: localDispatches.length,
      stateRevision: snapshot.stateRevision,
    });
  } else {
    emit({ event: 'outcome', mode, status: 'error', code: 'WORKER_MODE_UNKNOWN' });
  }
} catch (error) {
  emit({
    event: 'outcome',
    mode,
    status: 'error',
    code: error && typeof error === 'object' && error.code ? error.code : String(error instanceof Error ? error.message : error),
    dispatches: localDispatches.length,
  });
} finally {
  await store.close();
}
