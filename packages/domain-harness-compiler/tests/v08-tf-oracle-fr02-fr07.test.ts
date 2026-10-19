/**
 * WEB-ORACLE-1 — FR02 / FR07 historical usable-behavior differential.
 *
 * CURRENT_SELECTED_PATH_ORACLE. Seven historical FR02/FR07 GAP sentinels
 * have been replaced with real executable selected K/S/Host P/N tests.
 * Original v0.7 oracle source and test blob pins remain immutable.
 *
 * Historical authority (version/v0.7):
 *   commit 86110c616b8cb18c730553e4cdab7ef555214521
 *   expression-runtime.ts          c37cf23d4987088df8218a124d5a29efdd758e7c
 *   portable-expression.test.ts    c9cf11e3114ccf5f1174cf77d174032de15cf6c7
 *   harness-machine.ts             f2fe5d49138be550555e6b88863961778cb2ce0f
 *   business-harness-machine.test  0c5622b5206ec15622f3ad706c67a4545f6e418b
 *
 * Original WEB-ORACLE-1 source-prep base (historical record, no longer the
 * selected bytes):
 *   v0.8@557e8ba53f90309c9d370d32b77d2dff070b8a5b
 *   standard-sdk-v1.mjs            fa01e3cc70bc9a08bf14bd497dfb3fba79bd067f
 *   kernel-mechanism-v1.mjs        f74f77ba6fbd882f9e4fdf0a6d661ce3fd348555
 *
 * #1003 / PR #1018 selected-path rebind (dispatch #1003@6151642076):
 *   v0.8@8d7ef905275d4b270ff76206db935cbd6fc70fe0 (includes FR02 #1019,
 *   FR07-S1 #1022, FR07-KH2 #1025 at b9d0a14)
 *   standard-sdk-v1.mjs            905d29183efb94bafd3bd2cb2d5a8dfbcf9e4b2a
 *   kernel-mechanism-v1.mjs        2dfec0c44c26d05635751dd13cd970906473d23d
 *
 * #1003 FR08 SD1/SD2 + NF05 rebind (both payloads carry the additive
 * semantic-decision interpreter / trusted-boundary wiring; every FR02/FR07
 * oracle row is re-run unchanged over the new bytes by this file):
 *   standard-sdk-v1.mjs            58b14aa080331998cf2e26e8be22507fde8bf0a4
 *   kernel-mechanism-v1.mjs        de1620eb6ba1c5dc5e07ae10a55e8b19ae7500ad
 *
 * #1003 NF06 rebind (additive decision-receipt projection in S + K-owned
 * observational append / mandatory pre-admission refusal / authorized read;
 * all FR02/FR07 oracle rows re-run unchanged below):
 *   standard-sdk-v1.mjs            06c7988992478fb0614bf6e4d106f3ec6f7f8c44
 *   kernel-mechanism-v1.mjs        ba609647dbfccbf958537ff2e5c9eef0205dcc85
 *
 * The seven former test.todo GAP sentinels are now REAL executable tests at
 * two levels:
 *   1) here, an in-memory K→S differential over the exact selected payload
 *      modules (deterministic, no Host);
 *   2) the selected K/S/Host PHYSICAL path — compiler BUILD → approved root →
 *      trusted Host bootstrap → authenticated gateway → K → S, real SQLite,
 *      physical ModelPort — in
 *      packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-physical.test.ts
 *      (+ the stock-Node dist consumer leg
 *      v08-tf-fr02-fr07-selected-clean-process.test.ts).
 * The REBIND test below fails if any sentinel loses its physical test.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as kernel from '../src/qualified-package/payload/kernel-mechanism-v1.mjs';
import * as sdk from '../src/qualified-package/payload/standard-sdk-v1.mjs';

// Historical WEB-ORACLE-1 source-prep pins (kept verbatim as the record).
const V08_BASE = '557e8ba53f90309c9d370d32b77d2dff070b8a5b';
const V08_S_BLOB_SOURCE_PREP = 'fa01e3cc70bc9a08bf14bd497dfb3fba79bd067f';
const V08_K_BLOB_SOURCE_PREP = 'f74f77ba6fbd882f9e4fdf0a6d661ce3fd348555';
// Current selected bytes this rebind is bound to (a later K/S byte change
// must re-review and rebind; it is never silently inherited).
// K_BLOB_PIN_REBOUND_AFTER_PR1034_D3K: selected K current after merge.
// S/K_BLOB_PIN_REBOUND_AFTER_FR08_SD_NF05: #1003 FR08 SD1/SD2 + NF05 —
// additive semantic-decision interpreter (S) and trusted-boundary
// digest wiring (K); all FR02/FR07 oracle rows re-run unchanged below.
// S/K_BLOB_PIN_REBOUND_AFTER_NF06_RECEIPT: #1003 NF06 — additive
// decision-receipt projection (S) and K-owned observational append /
// mandatory pre-admission refusal / authorized read (K).
// K_BLOB_PIN_REBOUND_AFTER_1055_R1: #1055 R1 P1-01/P1-02 repair — per-record
// frozen reader scope on the receipt read + HOST_KEY_EXISTS re-read bounded
// inside the optional observation boundary (S bytes unchanged).
// K_BLOB_PIN_REBOUND_AFTER_FR08_FR09_FR12: #1003 FR08 general + FR09 + FR12
// — additive K-side decision-source composition (trusted-boundary wiring +
// lazy leg assembly + exact-cache/promoted-pin durable records; S bytes
// unchanged — the retained S decision-source semantics were already
// exported); all FR02/FR07 oracle rows re-run unchanged below.
// K_BLOB_PIN_REBOUND_AFTER_1057_R2_FASTFIX: source-only gate repair: WeakMap actual count
// and postcommit cache reread exception isolation; see #1057 review #5527917178.
// K_BLOB_PIN_REBOUND_AFTER_1062_TURN_SEAM: #1062 shared non-message durable
// control turn seam — strictTurnSource + occurrenceTurnOf at every turn-id
// derivation site + K-owned turn dispositions (S bytes unchanged); all
// FR02/FR07 oracle rows re-run unchanged below.
// K_BLOB_PIN_REBOUND_AFTER_1066_R1_P1B: #1066 R1 P1-B — bounded same-CAS
// non-message turn admission history inside the instance state CAS +
// history-replay of a lost turn disposition (S bytes unchanged); all
// FR02/FR07 oracle rows re-run unchanged below.
// K_BLOB_PIN_REBOUND_AFTER_1066_R2_EVICTION: fail closed BEFORE evicting
// a same-CAS control-turn identity whose optional disposition is absent;
// only an independently durable matching disposition makes eviction safe.
// K_BLOB_PIN_REBOUND_AFTER_1063_HF20: #1063 HF20 — same-CAS ordered durable
// mutation-observation window (INSTANCE_OPENED at create, MUTATION_COMMITTED
// inside every state CAS) + K-validated opaque cursor read + outward
// instance snapshot redaction of the K-only carrier fields (S bytes
// unchanged); all FR02/FR07 oracle rows re-run unchanged below.
// The physical selected-path tests seal the current payload bytes.
// [#1006 HF16] K blob re-pinned for the authorized poison-recovery turn
// source (strictTurnSource admits kind:'recovery'); S bytes unchanged.
// K_BLOB_PIN_REBOUND_AFTER_1089_R2: #1089 R2 P1 repair — the selected-K
// production Effect/Journal authority gate is FAIL-CLOSED on the exact class
// (only an exact PRODUCTION pin grants; SIMULATION and classless pins refuse
// typed before any production Effect/Journal); S bytes unchanged.
// K_BLOB_PIN_REBOUND_AFTER_V081_R02: v0.8.1 R02 — the commit honors the
// admission's expectedTargetSequence and every admission claims the
// per-instance admission fence (CAS) before any journal/effect, so a stale
// admission from a second runtime over the same store refuses typed
// ADMISSION_STATE_CAS_CONFLICT (S bytes unchanged); all FR02/FR07 oracle
// rows re-run unchanged below.
// K_BLOB_PIN_REBOUND_AFTER_V081_R01: v0.8.1 R01 — message turns pass the
// #1062 turn-disposition / #1066 same-CAS admission-history gate (durable
// (target, messageId) dedup restored: a re-send replays the stored receipt,
// a different intentType under the same messageId refuses typed); S bytes
// unchanged; all FR02/FR07 oracle rows re-run unchanged below. Pinned to
// the combined R02+R01 blob.
const V08_REBIND_BASE = '8d7ef905275d4b270ff76206db935cbd6fc70fe0';
// FR11/HF24 adds the selected SDK compiled-data READ endpoint; FR02/FR07 semantics unchanged.
// CI #1304 executed all prior affected oracle behavior but found the stale exact S pin.
const V08_S_BLOB = '9b86835bf12262ef53548e0031550fcecd97a7f2';
// K_BLOB_PIN_REBOUND_AFTER_1108_R2: #1108 R2 P1 — the zero-external-effect
// proof no longer trusts thrown error codes at all; only the trusted host
// dispatcher's own per-call pre-handler attestation (kernel-minted,
// dispatcher-marked, never adapter-visible) proves it; FR02/FR07 semantics
// unchanged.
// K_BLOB_PIN_REBOUND_AFTER_1168_PHASE2: the K02 durable original-receipt
// carrier spliced into the selected kernel (input-complete deployment-scoped
// turn identity, same-CAS original receipts, scoped key grammar, ring-backed
// disposition liveness); FR02/FR07 semantics unchanged.
const V08_K_BLOB = 'd7909b8ff8071e1f15d8b55fe6f967d883f6b4ac';

const LEGACY_CLOCK = '2026-09-17T02:00:00.123Z';
const LEGACY_FR02_EXPRESSION =
  '{"value": input.value * 2, "now": $now(), "millis": $millis()}';
const LEGACY_FR02_EXPECTED = Object.freeze({
  value: 42,
  now: LEGACY_CLOCK,
  millis: Date.parse(LEGACY_CLOCK),
});

async function gitBlobSha(url: URL): Promise<string> {
  const bytes = await readFile(url);
  // Git object format is the ASCII header followed by one literal NUL byte.
  const header = Buffer.concat([Buffer.from(`blob ${bytes.byteLength}`, 'utf8'), Buffer.from([0])]);
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function code(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function casError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'HOST_CAS_CONFLICT' });
}

function oracleHostPorts() {
  const store = new Map<string, { value: unknown; revision: number }>();
  return {
    docs: {
      async get(key: string) {
        const row = store.get(key);
        return row === undefined ? null : { value: clone(row.value), revision: row.revision };
      },
      async put(
        key: string,
        value: unknown,
        conditions: { mustBeAbsent?: boolean; mustMatchRevision?: number } = {},
      ) {
        const previous = store.get(key);
        if (conditions.mustBeAbsent === true && previous !== undefined) {
          throw casError(`${key} already exists`);
        }
        if (
          conditions.mustMatchRevision !== undefined
          && previous?.revision !== conditions.mustMatchRevision
        ) {
          throw casError(`${key} revision mismatch`);
        }
        const revision = previous === undefined ? 0 : previous.revision + 1;
        store.set(key, { value: clone(value), revision });
        return { revision };
      },
      async list(prefix: string) {
        return [...store.keys()].filter((key) => key.startsWith(prefix)).sort();
      },
    },
    sha256: {
      async digestUtf8(value: string) {
        return createHash('sha256').update(value, 'utf8').digest('hex');
      },
    },
    clock: () => '2026-10-12T00:00:00.000Z',
    resources: {
      async call() {
        throw new Error('FR07 oracle policy declares no physical effect');
      },
    },
  };
}

function fr07BusinessPolicy() {
  const workflowDefinition = {
    workflowKey: 'oracle-fr07',
    initialState: 'review',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'accept',
            trigger: { kind: 'event', eventType: 'ORACLE_DECIDED' },
            targetState: 'accepted',
          },
        ],
      },
      { stateKey: 'accepted', kind: 'final' },
    ],
  };

  return {
    packageId: 'business:oracle-fr07@1',
    policyId: 'oracle-fr07',
    domainId: 'oracle',
    workflowDefinition,
    decisionSchema: {
      isValid(value: unknown) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
        const row = value as { decision?: { outcome?: unknown }; event?: { type?: unknown } };
        return typeof row.decision?.outcome === 'string' && typeof row.event?.type === 'string';
      },
    },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:oracle-fr07': {
        ruleId: 'rule:oracle-fr07',
        eventType: 'ORACLE_DECIDED',
        payloadFromInput: { value: 'value' },
      },
    },
    intentBindings: {
      submit: {
        trigger: { kind: 'event', eventType: 'ORACLE_DECIDED' },
        ruleId: 'rule:oracle-fr07',
        roles: ['requester'],
      },
    },
    effectBindings: {},
  };
}

function createFr07Runtime() {
  let sdkInterpretCalls = 0;
  let observedSdkPayload: unknown;
  const sdkEndpoint = {
    packageId: sdk.MODULE_ID,
    interpret(declaration: unknown, input: unknown, context: unknown) {
      sdkInterpretCalls += 1;
      const resolved = sdk.interpret(declaration, input, context);
      observedSdkPayload = structuredClone(resolved.structuredDecision.event.payload);
      return resolved;
    },
  };
  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: {
      packageId: 'kernel:oracle-fr07@1',
      moduleSha256: V08_K_BLOB,
    },
    hostPorts: oracleHostPorts(),
    sdkEndpoint,
    businessEndpoint: fr07BusinessPolicy(),
  });
  return { runtime, sdkInterpretCalls: () => sdkInterpretCalls, observedSdkPayload: () => observedSdkPayload };
}

test('WEB-ORACLE-1 META: the rebind is bound to the exact physically selected v0.8 K/S blobs', async () => {
  assert.equal(V08_BASE, '557e8ba53f90309c9d370d32b77d2dff070b8a5b');
  assert.equal(V08_S_BLOB_SOURCE_PREP, 'fa01e3cc70bc9a08bf14bd497dfb3fba79bd067f');
  assert.equal(V08_K_BLOB_SOURCE_PREP, 'f74f77ba6fbd882f9e4fdf0a6d661ce3fd348555');
  assert.equal(V08_REBIND_BASE, '8d7ef905275d4b270ff76206db935cbd6fc70fe0');
  assert.equal(
    await gitBlobSha(new URL('../src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url)),
    V08_S_BLOB,
  );
  assert.equal(
    await gitBlobSha(new URL('../src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url)),
    V08_K_BLOB,
  );
  assert.equal(sdk.MODULE_ID, 'standard-sdk@v08.1.0.0');
  assert.equal(kernel.MODULE_ID, 'v08-kernel-mechanism@1.0.0');
});

test('V08-FR02-P-CONTROL-01: physical K preserves deterministic bounded predicate replay for legacy input value=21', () => {
  const predicate = kernel.prepareDomainPredicate({
    op: 'eq',
    left: { source: 'context', path: ['input', 'value'] },
    right: { source: 'literal', value: 21 },
  });
  const context = kernel.prepareDomainPredicateContext({ input: { value: 21 } });
  const event = kernel.prepareDomainPredicateEvent({ type: 'ORACLE', payload: {} });
  const input = kernel.createPreparedDomainPredicateEvaluationInput(context, event);

  const first = kernel.evaluateDomainPredicate(predicate, input);
  const second = kernel.evaluateDomainPredicate(predicate, input);
  assert.equal(first, true);
  assert.equal(second, first);

  // Differential truth: this is a boolean predicate slice only. It is NOT
  // the v0.7 JSONata expression result {value:42, now, millis}.
  assert.equal(typeof first, 'boolean');
  assert.notDeepEqual(first, LEGACY_FR02_EXPECTED);
});

test('V08-FR02-N-CONTROL-01: physical S rejects non-portable JSON and accessor input before Rule interpretation', () => {
  const declaration = {
    id: 'rule:oracle-fr02',
    kind: 'rule',
    eventType: 'ORACLE',
    payloadFromInput: {},
  };

  assert.throws(
    () => sdk.interpret(declaration, { bad: Number.NaN }),
    (error: unknown) => code(error) === 'SDK_DATA_UNSAFE',
  );

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.throws(
    () => sdk.interpret(declaration, cyclic),
    (error: unknown) => code(error) === 'SDK_DATA_BOUNDS',
  );

  let getterReads = 0;
  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, 'value', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 21;
    },
  });
  assert.throws(
    () => sdk.interpret(declaration, accessor),
    (error: unknown) => code(error) === 'SDK_DATA_UNSAFE',
  );
  assert.equal(getterReads, 0);
});

test('V08-FR02-DIFF-01: selected S Kind inventory has no free-form expression/script execution surface', () => {
  assert.deepEqual(
    sdk.STANDARD_KINDS,
    ['schema', 'rule', 'decision', 'workflow', 'operation'],
  );

  // The exact v0.7 positive oracle remains explicit so a future owner cannot
  // substitute boolean predicate success for the richer delivered behavior.
  assert.equal(LEGACY_FR02_EXPRESSION.includes('$now()'), true);
  assert.deepEqual(LEGACY_FR02_EXPECTED, {
    value: 42,
    now: LEGACY_CLOCK,
    millis: Date.parse(LEGACY_CLOCK),
  });
});

// ---------------------------------------------------------------------------
// Former FR02 GAP sentinels — K→S differential over the selected payloads.
// The Host/SQLite physical leg of each ID lives in
// packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-physical.test.ts
// ---------------------------------------------------------------------------

const PHYSICAL_TEST_FILE = new URL(
  '../../domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-physical.test.ts',
  import.meta.url,
);
const FORMER_SENTINELS = [
  'V08-FR02-P-F01', 'V08-FR02-N-F02', 'V08-FR02-N-F03',
  'V08-FR07-P-F01', 'V08-FR07-N-F02', 'V08-FR07-N-F03', 'V08-FR07-N-F04',
] as const;

function eventEquals(field: string, value: unknown) {
  return { op: 'eq', left: { source: 'event', path: ['payload', field] }, right: { source: 'literal', value } };
}

function fr02BusinessPolicy() {
  const expressionRule = (id: string, payloadExpression: Record<string, unknown>) => ({
    kind: 'rule', id, eventType: 'ORACLE_EVALUATED', payloadExpression,
  });
  const rules: Record<string, unknown> = {
    'rule:legacy': expressionRule('rule:legacy', { source: LEGACY_FR02_EXPRESSION, logicalTime: LEGACY_CLOCK }),
    'rule:eval': expressionRule('rule:eval', { source: '$eval("1+1")', logicalTime: LEGACY_CLOCK }),
    'rule:random': expressionRule('rule:random', { source: '$random()', logicalTime: LEGACY_CLOCK }),
    'rule:now-argument': expressionRule('rule:now-argument', { source: '$now("[Y]")', logicalTime: LEGACY_CLOCK }),
    'rule:millis-argument': expressionRule('rule:millis-argument', { source: '$millis("ignored")', logicalTime: LEGACY_CLOCK }),
    'rule:input-bytes': expressionRule('rule:input-bytes', { source: '{"t": input.text}', logicalTime: LEGACY_CLOCK, maxInputBytes: 26 }),
    'rule:output-bytes': expressionRule('rule:output-bytes', { source: '{"t": input.text}', logicalTime: LEGACY_CLOCK, maxOutputBytes: 13 }),
    'rule:budget': expressionRule('rule:budget', {
      source: `{"items": [${Array.from({ length: 1000 }, () => '1').join(',')}]}`,
      logicalTime: LEGACY_CLOCK,
      timeoutMs: 1,
    }),
  };
  const intentBindings: Record<string, unknown> = {};
  for (const ruleId of Object.keys(rules)) {
    intentBindings[ruleId.slice('rule:'.length)] = {
      trigger: { kind: 'event', eventType: 'ORACLE_EVALUATED' },
      ruleId,
      roles: ['requester'],
    };
  }
  return {
    packageId: 'business:oracle-fr02@1',
    policyId: 'oracle-fr02',
    domainId: 'oracle',
    workflowDefinition: {
      workflowKey: 'oracle-fr02',
      initialState: 'review',
      initialContext: {},
      guards: [{
        guardId: 'guard:legacy-exact',
        predicate: {
          op: 'all',
          predicates: [
            eventEquals('value', LEGACY_FR02_EXPECTED.value),
            eventEquals('now', LEGACY_FR02_EXPECTED.now),
            eventEquals('millis', LEGACY_FR02_EXPECTED.millis),
          ],
        },
      }],
      states: [
        {
          stateKey: 'review',
          transitions: [{
            transitionKey: 'evaluate',
            trigger: { kind: 'event', eventType: 'ORACLE_EVALUATED' },
            targetState: 'evaluated',
            guardId: 'guard:legacy-exact',
          }],
        },
        { stateKey: 'evaluated', kind: 'final' },
      ],
    },
    decisionSchema: {
      isValid(value: unknown) {
        const row = value as { event?: { payload?: Record<string, unknown> } };
        const payload = row?.event?.payload;
        return typeof payload === 'object' && payload !== null
          && JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(['millis', 'now', 'value']);
      },
    },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules,
    intentBindings,
    effectBindings: {},
  };
}

function createFr02Runtime() {
  const observed: unknown[] = [];
  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:oracle-fr02@1', moduleSha256: V08_K_BLOB },
    hostPorts: oracleHostPorts(),
    sdkEndpoint: {
      packageId: sdk.MODULE_ID,
      interpret(declaration: unknown, input: unknown, context: unknown) {
        const resolved = sdk.interpret(declaration, input, context);
        observed.push(JSON.stringify(resolved.structuredDecision.event.payload));
        return resolved;
      },
    },
    businessEndpoint: fr02BusinessPolicy(),
  });
  return { runtime, observed };
}

async function submitFr02(runtime: any, instanceKey: string, intentType: string, input: unknown) {
  const target = { workflowId: 'oracle-fr02', instanceKey };
  await runtime.openInstance({ target, correlationId: `corr:${instanceKey}` });
  const receipt = runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType,
    target,
    messageId: `msg:${instanceKey}`,
    input,
    caller: { role: 'requester' },
  });
  return { target, receipt };
}

async function assertFr02Untouched(runtime: any, target: unknown): Promise<void> {
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'review');
  assert.equal(snapshot.stateRevision, 0);
}

test('V08-FR02-P-F01: selected K admits the exact v0.7 portable expression result through S payloadExpression; replay is byte-identical', async () => {
  const { runtime, observed } = createFr02Runtime();
  const first = await submitFr02(runtime, 'legacy-a', 'legacy', { input: { value: 21 } });
  const admitted = await first.receipt;
  assert.equal(admitted.status, 'admitted', JSON.stringify(admitted.denial ?? null));
  assert.equal(admitted.admitted.transitionKey, 'evaluate');
  assert.equal((await runtime.getSnapshot(first.target)).state.stateKey, 'evaluated');

  const replay = await (await submitFr02(runtime, 'legacy-b', 'legacy', { input: { value: 21 } })).receipt;
  assert.equal(replay.status, 'admitted');
  const exactBytes = JSON.stringify(LEGACY_FR02_EXPECTED);
  assert.deepEqual(observed, [exactBytes, exactBytes], 'same logical time ⇒ byte-identical result, exactly the v0.7 bytes');

  // The K guard (not the test) observes the computed value: 22 ⇒ 44 ≠ 42.
  const differential = await submitFr02(runtime, 'legacy-c', 'legacy', { input: { value: 22 } });
  const denied = await differential.receipt;
  assert.equal(denied.status, 'denied');
  assert.equal(denied.denial.reason, 'guard');
  await assertFr02Untouched(runtime, differential.target);
  assert.equal((await runtime.getJournalRecords()).length, 0, 'the policy declares no effect; nothing journaled');
});

test('V08-FR02-N-F02: selected S refuses $eval / $random / clock arguments inside K before any state work', async () => {
  const { runtime } = createFr02Runtime();
  const cases: [string, RegExp][] = [
    ['eval', /\$eval is forbidden/],
    ['random', /\$random is forbidden/],
    ['now-argument', /arguments are not supported/],
    ['millis-argument', /arguments are not supported/],
  ];
  for (const [intentType, message] of cases) {
    const { target, receipt } = await submitFr02(runtime, `deny-${intentType}`, intentType, { input: { value: 21 } });
    await assert.rejects(
      receipt,
      (error: unknown) => code(error) === 'SDK_EXPRESSION_FORBIDDEN' && message.test(String((error as Error).message)),
      intentType,
    );
    await assertFr02Untouched(runtime, target);
  }
  assert.equal((await runtime.getJournalRecords()).length, 0);
});

test('V08-FR02-N-F03: selected S enforces UTF-8 byte limits and the deterministic step budget inside K', async () => {
  const { runtime } = createFr02Runtime();
  const cases: [string, unknown, string, RegExp][] = [
    ['input-bytes', { input: { text: '缅甸' } }, 'SDK_EXPRESSION_BOUNDS', /maxInputBytes/],
    ['output-bytes', { input: { text: '缅甸' } }, 'SDK_EXPRESSION_BOUNDS', /maxOutputBytes/],
    ['budget', { input: {} }, 'SDK_EXPRESSION_TIMEOUT', /timeoutMs=1/],
  ];
  for (const [intentType, input, expected, message] of cases) {
    const { target, receipt } = await submitFr02(runtime, `bounds-${intentType}`, intentType, input);
    await assert.rejects(
      receipt,
      (error: unknown) => code(error) === expected && message.test(String((error as Error).message)),
      intentType,
    );
    await assertFr02Untouched(runtime, target);
  }
  assert.equal((await runtime.getJournalRecords()).length, 0);
});

test('V08-FR07-P-CONTROL-01: physical K→S executes exactly one bounded occurrence and commits only Business-owned target state', async () => {
  const { runtime, sdkInterpretCalls } = createFr07Runtime();
  const target = { workflowId: 'oracle-fr07', instanceKey: 'case:positive' };
  await runtime.openInstance({ target, correlationId: 'corr:oracle-fr07' });

  const receipt = await runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType: 'submit',
    target,
    messageId: 'msg:oracle-fr07:1',
    input: { value: 21 },
    caller: { role: 'requester' },
  });

  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.transitionKey, 'accept');
  assert.equal(receipt.admitted.targetState, 'accepted');
  assert.equal(sdkInterpretCalls(), 1);
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'accepted');
});

test('V08-FR07-N-CONTROL-01: caller/model-shaped authority fields do not override physical K Business state authority', async () => {
  const { runtime, sdkInterpretCalls, observedSdkPayload } = createFr07Runtime();
  const target = { workflowId: 'oracle-fr07', instanceKey: 'case:smuggling' };
  await runtime.openInstance({ target, correlationId: 'corr:oracle-fr07-smuggling' });

  const receipt = await runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType: 'submit',
    target,
    messageId: 'msg:oracle-fr07:smuggle',
    input: {
      value: 21,
      nextState: 'pwned',
      transition: { targetState: 'pwned' },
      mutation: { state: 'pwned' },
      promotion: { approved: true },
      activation: { enabled: true },
      governanceBaseline: { authority: 'caller' },
      privateReasoning: 'must never become runtime authority',
    },
    caller: { role: 'requester' },
  });

  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.targetState, 'accepted');
  assert.equal(sdkInterpretCalls(), 1);
  // The admitted receipt contains authoritative admission metadata, NOT the raw SDK result.
  // Observe the real selected S interpreter result at its scoped invocation boundary.
  assert.deepEqual(observedSdkPayload(), { value: 21 });
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'accepted');
});

test('V08-FR07-N-CONTROL-02: unauthorized role is denied before S interpretation', async () => {
  const { runtime, sdkInterpretCalls } = createFr07Runtime();
  const target = { workflowId: 'oracle-fr07', instanceKey: 'case:role-deny' };
  await runtime.openInstance({ target, correlationId: 'corr:oracle-fr07-role' });

  const receipt = await runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType: 'submit',
    target,
    messageId: 'msg:oracle-fr07:role',
    input: { value: 21 },
    caller: { role: 'auditor' },
  });

  assert.equal(receipt.status, 'denied');
  assert.equal(receipt.denial.reason, 'business-caller-role');
  assert.equal(sdkInterpretCalls(), 0);
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'review');
});

// ---------------------------------------------------------------------------
// Former FR07 GAP sentinels — K continuation over the selected S step
// surface (createHostBoundModelResolver.invokeStep) with a scripted port.
// ---------------------------------------------------------------------------

/** The exact v0.7 oracle final (business-harness-machine.test.ts finalResponse()). */
function legacyFinal(): unknown {
  return {
    kind: 'final',
    result: {
      decision: { outcome: 'QUOTE', data: { reasonCode: 'catalog-match' } },
      event: { type: 'QUOTE_REQUESTED', payload: { sku: 'P-1' } },
    },
  };
}

function legacyQuery(capabilityId: string, input: unknown = {}): unknown {
  return { kind: 'query', call: { capabilityId, input } };
}

function fr07HarnessPolicy() {
  const capabilities = {
    'catalog.lookup': {
      mode: 'read', source: 'instance-context',
      fields: { available: 'catalogAvailable', sku: 'catalogSku' },
      outputSchema: { available: 'boolean', sku: 'string' },
    },
    'catalog.flakyRead': { mode: 'read', source: 'instance-context', fields: { history: 'quoteHistory' } },
    'catalog.badRead': {
      mode: 'read', source: 'instance-context',
      fields: { available: 'catalogAvailable' }, outputSchema: { available: 'string' },
    },
    'customer.charge': { mode: 'mutation' },
  };
  const harnessRule = (id: string, maxSteps: number) => ({
    kind: 'model-decision',
    id,
    modelOperation: 'quote.harness',
    harness: {
      maxSteps,
      capabilities,
      allowedOutcomes: ['QUOTE', 'REJECT'],
      allowedEvents: ['QUOTE_REQUESTED', 'REJECTED'],
    },
  });
  const workflowDefinition = {
    workflowKey: 'oracle-fr07-harness',
    initialState: 'evaluating',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'evaluating',
        transitions: [{
          transitionKey: 'quote',
          trigger: { kind: 'event', eventType: 'QUOTE_REQUESTED' },
          targetState: 'quoted',
        }],
      },
      { stateKey: 'quoted', kind: 'final' },
    ],
  };
  const binding = (ruleId: string) => ({
    trigger: { kind: 'event', eventType: 'QUOTE_REQUESTED' },
    ruleId,
    roles: ['requester'],
  });
  return {
    packageId: 'business:oracle-fr07-harness@1',
    policyId: 'oracle-fr07-harness',
    domainId: 'oracle',
    workflowDefinition,
    decisionSchema: {
      isValid(value: unknown) {
        const row = value as { decision?: { outcome?: unknown }; event?: { type?: unknown } };
        return typeof row?.decision?.outcome === 'string' && typeof row?.event?.type === 'string';
      },
    },
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'evaluating',
    initialContext: { catalogAvailable: true, catalogSku: 'P-1' },
    rules: {
      'rule:quote': harnessRule('rule:quote', 4),
      'rule:quote-one-step': harnessRule('rule:quote-one-step', 1),
    },
    intentBindings: {
      requestQuote: binding('rule:quote'),
      requestQuoteOneStep: binding('rule:quote-one-step'),
    },
    effectBindings: {},
  };
}

type HarnessScript = (turn: Record<string, any>, signal: AbortSignal | undefined) => unknown;

function createFr07HarnessRuntime(script: HarnessScript) {
  const turns: Record<string, any>[] = [];
  const port = async (request: { operation: string; input: unknown; signal?: AbortSignal }) => {
    const turn = JSON.parse(JSON.stringify(request.input)) as Record<string, any>;
    turns.push(turn);
    return script(turn, request.signal);
  };
  const resolverFor = (control?: { signal?: AbortSignal }) => sdk.createHostBoundModelResolver({
    invoke: (request: { operation: string; input: unknown }) => port({ ...request, signal: control?.signal }),
  });
  const runtime = kernel.createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel:oracle-fr07-harness@1', moduleSha256: V08_K_BLOB },
    hostPorts: oracleHostPorts(),
    sdkEndpoint: {
      packageId: sdk.MODULE_ID,
      interpret: (declaration: unknown, input: unknown, context: unknown) => resolverFor().interpret(declaration, input, context),
      invokeStep: (declaration: unknown, input: unknown, context: unknown, control?: { signal?: AbortSignal }) =>
        resolverFor(control).invokeStep(declaration, input, context),
    },
    businessEndpoint: fr07HarnessPolicy(),
  });
  return { runtime, turns };
}

async function submitFr07(
  runtime: any,
  instanceKey: string,
  intentType = 'requestQuote',
  input: Record<string, unknown> = {},
  control?: { signal: AbortSignal },
) {
  const target = { workflowId: 'oracle-fr07-harness', instanceKey };
  await runtime.openInstance({ target, correlationId: `corr:${instanceKey}` });
  const receipt = await runtime.submitOccurrence({
    kind: 'v08/oracle-intent',
    intentType,
    target,
    messageId: `msg:${instanceKey}`,
    input: { requestId: 'rfq-42', sku: 'P-1', ...input },
    caller: { role: 'requester' },
  }, control);
  return { target, receipt };
}

async function assertFr07Untouched(runtime: any, target: unknown): Promise<void> {
  const snapshot = await runtime.getSnapshot(target);
  assert.equal(snapshot.state.stateKey, 'evaluating');
  assert.equal(snapshot.stateRevision, 0);
}

test('V08-FR07-P-F01: selected K runs the v0.7 model→query→model loop: two turns, K-attested dependency, QUOTE / QUOTE_REQUESTED admitted', async () => {
  const { runtime, turns } = createFr07HarnessRuntime((turn) =>
    (turn.step === 1 ? legacyQuery('catalog.lookup') : legacyFinal()));
  const { target, receipt } = await submitFr07(runtime, 'p-f01', 'requestQuote', { freshModelCallCount: 99 });
  assert.equal(receipt.status, 'admitted');
  assert.equal(turns.length, 2, 'v0.7: model.requests.length === 2');
  assert.deepEqual(turns[0]?.capabilities, ['catalog.badRead', 'catalog.flakyRead', 'catalog.lookup'], 'mutation never advertised');
  assert.deepEqual(turns[1]?.observations, [
    { step: 1, capabilityId: 'catalog.lookup', ok: true, output: { available: true, sku: 'P-1' } },
  ]);
  assert.deepEqual(receipt.admitted.resolver.modelCallEvidence, { status: 'measured', count: 2, scope: 'bound-model-port-invocations' });
  assert.equal(receipt.admitted.resolver.continuation.dependencies.length, 1);
  assert.equal(receipt.admitted.resolver.continuation.dependencies[0].capabilityId, 'catalog.lookup');
  assert.equal((await runtime.getSnapshot(target)).state.stateKey, 'quoted');
});

test('V08-FR07-N-F02: selected K refuses unknown and mutation capabilities before any read or second turn', async () => {
  for (const [capabilityId, expected] of [
    ['catalog.unknownRead', 'UNKNOWN_CAPABILITY'],
    ['customer.charge', 'MUTATION_CAPABILITY_FORBIDDEN'],
  ] as const) {
    const { runtime, turns } = createFr07HarnessRuntime(() => legacyQuery(capabilityId, { amount: 100 }));
    const { target, receipt } = await submitFr07(runtime, `n-f02-${expected}`);
    assert.equal(receipt.status, 'terminated');
    assert.equal(receipt.terminal.code, expected);
    assert.equal(receipt.resolver.continuation.queries, 0, 'the K query executor never ran');
    assert.equal(turns.length, 1);
    await assertFr07Untouched(runtime, target);
  }
});

test('V08-FR07-N-F03: selected K exhausts maxSteps (incl. recovery turns) and honours an active-turn cancellation', async () => {
  const oneStep = createFr07HarnessRuntime((turn) => (turn.step === 1 ? legacyQuery('catalog.lookup') : legacyFinal()));
  const exhausted = await submitFr07(oneStep.runtime, 'n-f03-one', 'requestQuoteOneStep');
  assert.equal(exhausted.receipt.terminal.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(oneStep.turns.length, 1);
  assert.equal(exhausted.receipt.resolver.continuation.queries, 1, 'v0.7: queryExecutions === 1');
  await assertFr07Untouched(oneStep.runtime, exhausted.target);

  const recovery = createFr07HarnessRuntime(() => legacyQuery('catalog.flakyRead'));
  const recovered = await submitFr07(recovery.runtime, 'n-f03-recovery');
  assert.equal(recovered.receipt.terminal.code, 'MAX_STEPS_EXHAUSTED');
  assert.equal(recovery.turns.length, 4, 'recovery turns consume the same absolute budget');
  await assertFr07Untouched(recovery.runtime, recovered.target);

  const controller = new AbortController();
  let observedAbort = false;
  const cancelling = createFr07HarnessRuntime((_turn, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      observedAbort = true;
      reject(new Error('model aborted'));
    }, { once: true });
    queueMicrotask(() => controller.abort());
  }));
  const cancelled = await submitFr07(cancelling.runtime, 'n-f03-cancel', 'requestQuote', {}, { signal: controller.signal });
  assert.equal(cancelled.receipt.status, 'terminated');
  assert.equal(cancelled.receipt.terminal.code, 'CANCELLED');
  assert.equal(observedAbort, true, 'v0.7: aborted === true');
  await assertFr07Untouched(cancelling.runtime, cancelled.target);
});

test('V08-FR07-N-F04: selected K turns an ordinary read failure into an observation and recovers; invalid read output is QUERY_OUTPUT_INVALID', async () => {
  const recovering = createFr07HarnessRuntime((turn) =>
    (turn.observations.length === 0 ? legacyQuery('catalog.flakyRead') : legacyFinal()));
  const recovered = await submitFr07(recovering.runtime, 'n-f04-recovers');
  assert.equal(recovered.receipt.status, 'admitted');
  assert.equal(recovering.turns.length, 2);
  assert.deepEqual(recovering.turns[1]?.observations, [
    { step: 1, capabilityId: 'catalog.flakyRead', ok: false, error: { code: 'QUERY_SOURCE_MISSING' } },
  ]);

  const invalid = createFr07HarnessRuntime(() => legacyQuery('catalog.badRead'));
  const refused = await submitFr07(invalid.runtime, 'n-f04-invalid');
  assert.equal(refused.receipt.status, 'terminated');
  assert.equal(refused.receipt.terminal.code, 'QUERY_OUTPUT_INVALID');
  assert.equal(invalid.turns.length, 1);
  await assertFr07Untouched(invalid.runtime, refused.target);
});

test('WEB-ORACLE-1 REBIND: every former GAP sentinel has a selected K/S/Host physical test and no test.todo remains', async () => {
  const physical = await readFile(PHYSICAL_TEST_FILE, 'utf8');
  for (const id of FORMER_SENTINELS) {
    assert.match(physical, new RegExp(`\\ntest\\('${id}: `), `${id} has a physical selected-path test`);
  }
  const self = await readFile(new URL(import.meta.url), 'utf8');
  assert.equal(self.includes(['test', 'todo('].join('.')), false, 'no TODO sentinel can masquerade as a test');
});
