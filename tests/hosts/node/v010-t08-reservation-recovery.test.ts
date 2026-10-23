/**
 * v0.10 T08 (#1219) — the corrected governed occurrence-pin reservation and
 * recovery protocol over REAL file-backed SQLite (and a REAL second Node24
 * process for the F2 race). Implements the verification matrix of
 * docs/architecture/V010_GOVERNED_OCCURRENCE_PIN_RECOVERY_PROTOCOL.md:
 *
 *   RES1  a concluded typed Kernel deny (business-caller-role, provably
 *         before any admission activity) compensates its own RESERVED pin
 *         with the guarded exact-revision remove; the instanceKey is then
 *         free for a successor BUILD even though the deny path's
 *         openInstance Genesis row physically exists (F1-safe).
 *   RES2  an admitted send settles the pin ADMITTED; the original BUILD
 *         redirect guard is unchanged.
 *   RES3  an unresolved RESERVED pin refuses every other message, input and
 *         BUILD typed (no second independent active submit; no takeover).
 *   RES4  the crash-after-admission-before-commit durable state (RESERVED
 *         + Kernel-owned same-CAS receipt witness) heals to ADMITTED via
 *         recoverReservation — the witness, never snapshot existence.
 *   RES5  a store without the conditional-remove seam keeps the RESERVED
 *         pin fail-closed and surfaces typed INDETERMINATE.
 *   RES6  F2 in two real processes: a held-slot RESERVED state (the durable
 *         footprint of a stalled writer) survives another process's
 *         recovery attempt (PENDING, no delete); the same-message send in
 *         the second process then admits and settles ADMITTED.
 *   RES7  the heal binds the kernel's own canonical input digest, also for
 *         integer-like keys where the compiler canonicalJson differs.
 *   RES8  a crashed owner + adopter deny stays RESERVED until the Host
 *         asserts the prior writer is dead; the freed slot lets the
 *         same-message owner deny compensate the pin.
 *   RES9  live owner/adopter + competing dynamic non-admission never loses
 *         its pin, even across an explicit Host slot release.
 *   RES10 legacy compiler-digest mismatch is not silently migrated.
 *   RES11 legacy intent-unbound pins cannot authorize compensation.
 *   RES12 a same-message input cannot switch between sealed intents.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  activateGovernedV10Build,
  buildV10App,
  readV10OccurrenceBuildPin,
  sha256Canonical,
  sha256Hex,
  v10BuildPackageClosureDigest,
  v10OccurrenceBuildPinKey,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { canonicalJsonStringify } from '../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs';
import type {
  V10BuildActivationDecision,
  V10BuiltApp,
  V10DocStore,
  V10ModuleInput,
  V10GovernedBuildActivation,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import { basicComposition, sha256HexSource } from '../../assembly/helpers-v010.js';
import {
  T08_APP_ID,
  T08_DEPLOYMENT,
  T08_NOW,
  T08CountingStore,
  createT08AuthorizationAuthority,
  instanceRowsOf,
  readT08Rows,
  t08Decision,
  t08Refusal,
} from './v010-t08-governed-build-fixture.js';

const CHILD_SCRIPT = fileURLToPath(new URL('./v010-t08-reservation-f2-child.ts', import.meta.url));
const ROOT_DIR = fileURLToPath(new URL('../../..', import.meta.url));

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the #1219 reservation witness targets the selected Node24 runtime (running ${process.versions.node})`,
);

const RESTRICTED_BUSINESS = 'business-restricted-approval@v010.1.0.0';

/** One BUILD whose App carries BOTH a normally admitting Business and the
 * role-restricted Business whose REAL kernel role gate answers an honest
 * `denied` receipt before any admission/journal/effect activity. */
async function buildReservationApp(buildId: string, transformStandard?: (source: string) => string): Promise<V10BuiltApp> {
  const composition = await basicComposition({
    routes: [
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
      { intentId: 'submitRestrictedDecision', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ],
  });
  const restrictedSource = await readFile(new URL('../../assembly/fixtures-v010/business-restricted-approval-v1.mjs', import.meta.url), 'utf8');
  const modules: V10ModuleInput[] = composition.modules.map((module) => {
    if (module.role !== 'standard-primary' || transformStandard === undefined) return { ...module };
    const source = transformStandard(module.moduleSource as string);
    return { ...module, moduleSource: source, moduleSha256: sha256HexSource(source) };
  });
  modules.push({
    packageId: RESTRICTED_BUSINESS,
    role: 'business',
    abiVersion: 'v08-business-abi/1',
    moduleSource: restrictedSource,
    moduleSha256: sha256HexSource(restrictedSource),
    endpoint: 'business-policy',
    dependencies: [],
    provides: ['business:policy/1', 'intent:submitRestrictedDecision'],
    requires: [],
  } as unknown as V10ModuleInput);
  return await buildV10App({ ...composition, appId: T08_APP_ID, modules, buildId });
}

const NORMAL_INTENT = (instanceKey: string, messageId: string, amount: number) => Object.freeze({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey,
  messageId,
  input: { amount, requestId: `R-${messageId}` },
});
const RESTRICTED_INTENT = (instanceKey: string, messageId: string) => Object.freeze({
  intentType: 'submitRestrictedDecision',
  instanceKey,
  messageId,
  input: { amount: 5, requestId: `R-${messageId}` },
});

/** The kernel's own canonical input digest (bare hex), as the receipt stores it. */
function kernelInputDigest(input: unknown): string {
  return sha256Hex(canonicalJsonStringify(input));
}

async function refusalError(operation: () => Promise<unknown>): Promise<{ code: string; detail?: Record<string, unknown> }> {
  try {
    await operation();
  } catch (error) {
    const typed = error as { code?: unknown; detail?: Record<string, unknown> };
    return { code: String(typed.code ?? 'NO_CODE'), ...(typed.detail === undefined ? {} : { detail: typed.detail }) };
  }
  return { code: 'NO_REFUSAL' };
}

async function refusalCode(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    return String((error as { code?: unknown }).code ?? 'NO_CODE');
  }
  return 'NO_REFUSAL';
}

interface CraftedReservation {
  readonly messageId: string;
  readonly intentType?: string;
  readonly legacyDigest?: boolean;
  readonly input: Record<string, unknown>;
  readonly attemptId: string;
  readonly held: boolean;
  /** v3 tracked pin: the registered in-flight attempt ids. Absent = pre-v3. */
  readonly inFlight?: readonly string[];
}

/**
 * Rewrite one occurrence's pin into the exact durable crash state of a
 * mid-submit writer: RESERVED for (messageId, input), writer slot held by a
 * dead attempt. Used to arrange F1/F2/crash windows without timing luck.
 */
async function craftReservedCrashState(
  store: V10DocStore,
  app: V10BuiltApp,
  decision: V10BuildActivationDecision,
  target: { businessPackageId: string; workflowId: string; instanceKey: string },
  crafted: CraftedReservation,
): Promise<void> {
  const key = v10OccurrenceBuildPinKey(T08_DEPLOYMENT, target);
  const doc = await store.get(key);
  await store.put(key, {
    kind: 'v10/occurrence-build-pin',
    deployedAppId: T08_DEPLOYMENT.deployedAppId,
    tenantId: T08_DEPLOYMENT.tenantId,
    appId: T08_DEPLOYMENT.appId,
    businessPackageId: target.businessPackageId,
    workflowId: target.workflowId,
    instanceKey: target.instanceKey,
    subjectDigest: app.subjectDigest,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    buildId: app.buildId,
    decisionId: decision.decisionId,
    approvalRef: decision.approvalRef,
    pinnedAt: new Date(T08_NOW).toISOString(),
    phase: 'RESERVED',
    reservation: {
      messageId: crafted.messageId,
      ...(crafted.intentType === undefined ? {} : { intentType: crafted.intentType }),
      // The reservation binds the SELECTED kernel's canonical digest.
      inputDigest: crafted.legacyDigest ? sha256Canonical(crafted.input) : kernelInputDigest(crafted.input),
      reservedAt: new Date(T08_NOW).toISOString(),
    },
    ...(crafted.held ? { activeAttempt: { attemptId: crafted.attemptId, holder: 'writer' } } : {}),
    ...(crafted.inFlight === undefined ? {} : { inFlight: [...crafted.inFlight] }),
  }, doc === null ? { kind: 'create' } : { kind: 'cas', revision: doc.revision });
}

/** A V10DocStore view WITHOUT the conditional-remove seam (fail-closed path). */
class RemovelessStoreView {
  readonly #inner: V10DocStore;
  constructor(inner: V10DocStore) { this.#inner = inner; }
  async get(key: string) { return await this.#inner.get(key); }
  async put(key: string, value: unknown, condition: import('../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js').V10DocWriteCondition) {
    return await this.#inner.put(key, value, condition);
  }
}

test('RES1: concluded typed deny compensates its own RESERVED pin; the instanceKey stays free despite the Genesis row', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res1-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });

    const denied = await activationA.send(RESTRICTED_INTENT('inst-deny', 'msg:res:deny:1'));
    assert.equal(denied.status, 'denied', `the restricted occurrence must conclude with the honest kernel deny: ${JSON.stringify(denied).slice(0, 400)}`);
    assert.equal((denied.denial as { reason?: unknown }).reason, 'business-caller-role');

    const target = { ...activationA.resolveIntentTarget('submitRestrictedDecision'), instanceKey: 'inst-deny' };
    assert.equal(await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target), null,
      'the guarded compensation removed the RESERVED pin of the concluded deny');

    // The deny path's facade openInstance left a durable Genesis row — the
    // exact F1 shape. The pin was still safely reclaimable because the
    // decision used the receipt+witness, never snapshot existence.
    const rows = readT08Rows(kPath);
    assert.equal(instanceRowsOf(rows, T08_DEPLOYMENT, target.businessPackageId, target.workflowId, 'inst-deny').length, 1,
      'the denied occurrence physically owns a Genesis instance row (snapshot existence is NOT admission)');

    // The instanceKey is not poisoned: a successor BUILD pins and reaches the
    // Kernel on the very same occurrence address.
    const appB = await buildReservationApp('t08-reservation-b');
    const decisionB = t08Decision(appB, 'B', T08_DEPLOYMENT, { buildId: appB.buildId, approvalRef: 'approval:res:b' });
    authority.grant(decisionB);
    const activationB = await activateGovernedV10Build(appB, {
      store, deployment: T08_DEPLOYMENT, decision: decisionB, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const deniedAgain = await activationB.send(RESTRICTED_INTENT('inst-deny', 'msg:res:deny:2'));
    assert.equal(deniedAgain.status, 'denied', 'the successor BUILD serves the same instanceKey through a fresh reservation');
    assert.equal(await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target), null,
      'the successor deny cycle compensated its own pin too');
    activationA.close();
    activationB.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES2: an admitted send settles the pin ADMITTED and keeps the original-BUILD redirect guard', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res2-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });

    const admitted = await activationA.send(NORMAL_INTENT('inst-admit', 'msg:res:admit:1', 30));
    assert.equal(admitted.status, 'admitted', `the normal occurrence must admit: ${JSON.stringify(admitted).slice(0, 400)}`);

    const target = { ...activationA.resolveIntentTarget('submitQuoteDecisionDynamic'), instanceKey: 'inst-admit' };
    const pin = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
    assert.notEqual(pin, null, 'the admitted occurrence owns its pin');
    assert.equal(pin?.phase, 'ADMITTED', 'the pin settles ADMITTED');
    assert.equal(pin?.reservation, undefined, 'no reservation remains after settlement');
    assert.equal(typeof pin?.admittedAt, 'string', 'the settlement instant is durable');

    // A later turn on the same occurrence cannot admit again (the workflow
    // reached its final state with the first message), but the honest deny
    // never disturbs the ADMITTED pin of the settled occurrence.
    const second = await activationA.send(NORMAL_INTENT('inst-admit', 'msg:res:admit:2', 31));
    assert.equal(second.status, 'denied', 'the final-state workflow denies the second message honestly');
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.phase, 'ADMITTED',
      'a deny after settlement never reopens or removes the ADMITTED pin');

    // The successor BUILD still cannot take an admitted occurrence over.
    const appB = await buildReservationApp('t08-reservation-b');
    const decisionB = t08Decision(appB, 'B', T08_DEPLOYMENT, { buildId: appB.buildId, approvalRef: 'approval:res:b' });
    authority.grant(decisionB);
    const activationB = await activateGovernedV10Build(appB, {
      store, deployment: T08_DEPLOYMENT, decision: decisionB, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    await t08Refusal(activationB.send(NORMAL_INTENT('inst-admit', 'msg:res:admit:3', 32)), 'OCCURRENCE_REDIRECTED_TO_NEW_BUILD');
    activationA.close();
    activationB.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES3: an unresolved RESERVED pin refuses other messages, other inputs and other BUILDs (fail-closed)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res3-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const target = { ...activationA.resolveIntentTarget('submitQuoteDecisionDynamic'), instanceKey: 'inst-pending' };

    // Arrange the crash state of a stalled m-pending submit: the instance
    // also physically holds an EARLIER admitted turn (state exists), so this
    // doubles as the F1 negative — recovery must not call it admitted.
    const earlier = await activationA.send(NORMAL_INTENT('inst-pending', 'msg:res:earlier:1', 30));
    assert.equal(earlier.status, 'admitted');
    const stalledInput = { amount: 44, requestId: 'R-msg:res:pending:9' };
    await craftReservedCrashState(store, appA, decisionA, target, {
      messageId: 'msg:res:pending:9', intentType: 'submitQuoteDecisionDynamic', input: stalledInput, attemptId: 'attempt-stalled-1', held: true,
    });

    const otherMessage = await refusalError(() => activationA.send(NORMAL_INTENT('inst-pending', 'msg:res:other:1', 30)));
    assert.equal(otherMessage.code, 'OCCURRENCE_RESERVATION_PENDING', 'a different message under the unresolved reservation refuses typed');
    assert.equal(otherMessage.detail?.retryable, true, 'the first-admission serialization refusal is marked retryable');
    const sameIdDifferentInput = { ...NORMAL_INTENT('inst-pending', 'msg:res:pending:9', 45), input: { ...stalledInput, amount: 46 } };
    const conflicting = await refusalError(() => activationA.send(sameIdDifferentInput));
    assert.equal(conflicting.code, 'OCCURRENCE_RESERVATION_PENDING', 'the same messageId with different input is a different logical attempt');
    assert.equal(conflicting.detail?.retryable, false, 'a same-messageId input conflict is NOT retryable');

    const appB = await buildReservationApp('t08-reservation-b');
    const decisionB = t08Decision(appB, 'B', T08_DEPLOYMENT, { buildId: appB.buildId, approvalRef: 'approval:res:b' });
    authority.grant(decisionB);
    const activationB = await activateGovernedV10Build(appB, {
      store, deployment: T08_DEPLOYMENT, decision: decisionB, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    assert.equal(await refusalCode(() => activationB.send(NORMAL_INTENT('inst-pending', 'msg:res:pending:9', 44))),
      'OCCURRENCE_RESERVATION_PENDING', 'another BUILD never takes an unresolved reservation over');
    const foreignRecovery = await refusalError(() => activationB.recoverReservation({ intentType: 'submitQuoteDecisionDynamic', instanceKey: 'inst-pending' }));
    assert.equal(foreignRecovery.code, 'OCCURRENCE_RESERVATION_PENDING', 'another BUILD never recovers a foreign reservation');
    assert.equal(foreignRecovery.detail?.retryable, true, 'foreign recovery uses the same retryability contract as send');

    // The owning BUILD's own recovery stays fail-closed: the stalled message
    // has no Kernel admission witness, and the existing instance state from
    // the EARLIER message proves nothing about it (F1).
    assert.equal(await activationA.recoverReservation({ intentType: 'submitQuoteDecisionDynamic', instanceKey: 'inst-pending' }), 'PENDING');
    const pin = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
    assert.equal(pin?.phase, 'RESERVED', 'PENDING keeps the RESERVED pin');
    activationA.close();
    activationB.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES4: crash-after-admission-before-commit heals to ADMITTED through the Kernel witness', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res4-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const target = { ...activationA.resolveIntentTarget('submitQuoteDecisionDynamic'), instanceKey: 'inst-heal' };

    const healInput = { amount: 33, requestId: 'R-msg:res:heal:7' };
    const admitted = await activationA.send({ ...NORMAL_INTENT('inst-heal', 'msg:res:heal:7', 33), input: healInput });
    assert.equal(admitted.status, 'admitted');

    // The exact durable state a crash between admission and pin settlement
    // leaves: the Kernel already holds the same-CAS original receipt, the
    // pin still says RESERVED with a held writer slot.
    await craftReservedCrashState(store, appA, decisionA, target, {
      messageId: 'msg:res:heal:7', intentType: 'submitQuoteDecisionDynamic', input: healInput, attemptId: 'attempt-heal-1', held: true,
    });
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.phase, 'RESERVED');

    assert.equal(await activationA.recoverReservation({ intentType: 'submitQuoteDecisionDynamic', instanceKey: 'inst-heal' }),
      'ADMITTED', 'the witness heals the crash window');
    const healed = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
    assert.equal(healed?.phase, 'ADMITTED');
    assert.equal(healed?.buildId, appA.buildId, 'the heal settles under the ORIGINAL BUILD');
    activationA.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES5: a store without the conditional-remove seam keeps the deny reservation fail-closed', async () => {
  const { PlainCasDocStore } = await import('../../assembly/helpers-v010.js');
  const store = new RemovelessStoreView(new PlainCasDocStore()) as unknown as V10DocStore;
  const appA = await buildReservationApp('t08-reservation-a');
  const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
  const authority = createT08AuthorizationAuthority();
  authority.grant(decisionA);
  const activationA = await activateGovernedV10Build(appA, {
    store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
  });
  const refusal = await t08Refusal(activationA.send(RESTRICTED_INTENT('inst-noremove', 'msg:res:noremove:1')), 'OCCURRENCE_RESERVATION_INDETERMINATE');
  assert.match(refusal.message, /no conditional remove seam/, 'the refusal names the physical limitation');
  const target = { ...activationA.resolveIntentTarget('submitRestrictedDecision'), instanceKey: 'inst-noremove' };
  const pin = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
  assert.equal(pin?.phase, 'RESERVED', 'fail-closed: the pin is retained, never a fake compensation');
  activationA.close();
});

test('RES6: F2 — recovery of a stalled writer never deletes; the second process then admits under the surviving pin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res6-'));
  const kPath = join(dir, 'k.sqlite');
  const outPath = join(dir, 'child-result.json');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const target = { ...activationA.resolveIntentTarget('submitQuoteDecisionDynamic'), instanceKey: 'inst-f2' };

    // The durable footprint of a stalled writer: RESERVED, writer slot held.
    // No prior turn exists on this occurrence — the child's message must be
    // the FIRST (admitting) turn of the instance.
    const f2Input = { amount: 36, requestId: 'R-msg:res:f2:1' };
    await craftReservedCrashState(store, appA, decisionA, target, {
      messageId: 'msg:res:f2:1', intentType: 'submitQuoteDecisionDynamic', input: f2Input, attemptId: 'attempt-f2-stalled', held: true,
    });

    // Process 1 recovery: PENDING, and the pin must survive it (no delete
    // under a possibly-live writer — the F2 fence).
    assert.equal(await activationA.recoverReservation({ intentType: 'submitQuoteDecisionDynamic', instanceKey: 'inst-f2' }), 'PENDING');
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.phase, 'RESERVED',
      'the recovery attempt left the stalled reservation untouched');

    // Process 2: a REAL second Node24 process opens the same SQLite file,
    // continues the exact reserved message (adopt path — the slot is held by
    // the stalled attempt) and must admit onto the SURVIVING pin.
    const child = spawn(process.execPath, [
      '--import', 'tsx', CHILD_SCRIPT,
      kPath, outPath,
    ], { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const exitCode = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    assert.equal(exitCode, 0, `the F2 second-process witness failed: ${stderr.slice(0, 1600)}`);
    const childResult = JSON.parse(await readFile(outPath, 'utf8')) as Record<string, unknown>;
    assert.equal(childResult.ok, true, `the F2 child result: ${JSON.stringify(childResult).slice(0, 1200)} (stdout ${stdout.slice(0, 400)})`);
    assert.equal(childResult.status, 'admitted', 'the same-message continuation admitted exactly once');
    assert.equal(childResult.pinPhase, 'ADMITTED', 'the second process settled the surviving pin ADMITTED');
    assert.equal(childResult.buildId, appA.buildId, 'the admission landed under the ORIGINAL BUILD pin');

    const finalPin = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
    assert.equal(finalPin?.phase, 'ADMITTED', 'the parent observes the settled pin');
    activationA.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES7: the crash heal binds the KERNEL canonical digest, including integer-like input keys', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res7-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const target = { ...activationA.resolveIntentTarget('submitQuoteDecisionDynamic'), instanceKey: 'inst-intkeys' };

    // Integer-like keys are where the compiler's sorted canonicalJson and the
    // kernel's JSON.stringify form diverge; this input exercises exactly that.
    const intKeyInput = { amount: 37, requestId: 'R-msg:res:intkeys:1', tags: { '2': 'b', '10': 'a' } };
    assert.notEqual(sha256Canonical(intKeyInput), kernelInputDigest(intKeyInput),
      'precondition: the two canonical forms really differ for this input');
    const admitted = await activationA.send({ ...NORMAL_INTENT('inst-intkeys', 'msg:res:intkeys:1', 37), input: intKeyInput });
    assert.equal(admitted.status, 'admitted', `the integer-keyed occurrence must admit: ${JSON.stringify(admitted).slice(0, 400)}`);

    await craftReservedCrashState(store, appA, decisionA, target, {
      messageId: 'msg:res:intkeys:1', intentType: 'submitQuoteDecisionDynamic', input: intKeyInput, attemptId: 'attempt-intkeys-1', held: true,
    });
    assert.equal(await activationA.recoverReservation({ intentType: 'submitQuoteDecisionDynamic', instanceKey: 'inst-intkeys' }),
      'ADMITTED', 'the witness matches the reservation digest for integer-like keys');
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.phase, 'ADMITTED');
    activationA.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES8: a crashed owner cannot strand an adopter deny; the Host dead-writer assertion frees the slot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res8-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const intent = { intentType: 'submitRestrictedDecision', instanceKey: 'inst-stranded' } as const;
    const target = { ...activationA.resolveIntentTarget('submitRestrictedDecision'), instanceKey: 'inst-stranded' };
    const crashed = RESTRICTED_INTENT('inst-stranded', 'msg:res:stranded:1');

    // The owner crashed mid-submit: RESERVED, writer slot held by a dead attempt.
    await craftReservedCrashState(store, appA, decisionA, target, {
      messageId: crashed.messageId, intentType: crashed.intentType, input: crashed.input, attemptId: 'attempt-crashed-owner', held: true,
    });

    // Same-message continuation runs as ADOPTER (slot held) and concludes deny:
    // an adopter never compensates, so the pin stays RESERVED.
    const adopted = await activationA.send(crashed);
    assert.equal(adopted.status, 'denied');
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.phase, 'RESERVED',
      'an adopter deny keeps the pin fail-closed');

    // Without the Host assertion recovery still never touches the held slot.
    assert.equal(await activationA.recoverReservation(intent), 'PENDING');
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.activeAttempt?.attemptId, 'attempt-crashed-owner');

    // The Host asserts the prior writer is dead: the slot is freed, nothing deleted.
    assert.equal(await activationA.recoverReservation(intent, { priorWriterTerminated: true }), 'PENDING');
    const freed = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
    assert.equal(freed?.phase, 'RESERVED', 'freeing the slot never deletes the reservation');
    assert.equal(freed?.activeAttempt ?? null, null, 'the stale writer slot is released');

    // The same message now runs as OWNER: its concluded deny compensates the pin,
    // and the instanceKey is free for any other message again.
    const owned = await activationA.send(crashed);
    assert.equal(owned.status, 'denied');
    assert.equal(await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target), null, 'the owner deny compensated the pin');
    const next = await activationA.send(RESTRICTED_INTENT('inst-stranded', 'msg:res:stranded:2'));
    assert.equal(next.status, 'denied', 'a different message reaches the Kernel: the instanceKey is not stranded');
    activationA.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

type ReservationInterpreter = (...args: unknown[]) => unknown;
const reservationTestHost = globalThis as typeof globalThis & {
  __dhReservationInterpret?: (original: ReservationInterpreter, args: unknown[]) => Promise<unknown>;
};

for (const crashedOwner of [false, true]) {
  for (const outcome of ['unavailable', 'denied'] as const) {
    test(`RES9: ${crashedOwner ? 'live adopter after owner death' : 'false dead-writer assertion'} + ${outcome} retry preserves the admitting submit's pin`, async () => {
      const dir = await mkdtemp(join(tmpdir(), 'dh-res9-'));
      const kPath = join(dir, 'k.sqlite');
      const inner = await openSqliteCasStore({ path: kPath });
      const store = new T08CountingStore(inner);
      let release!: () => void;
      let started!: () => void;
      const wait = new Promise<void>((resolve) => { release = resolve; });
      const entered = new Promise<void>((resolve) => { started = resolve; });
      let calls = 0;
      // Only the selected Standard dependency response/timing is controlled.
      // Both submits use the actual Kernel, receipts and physical SQLite CAS.
      reservationTestHost.__dhReservationInterpret = async (original, args) => {
        calls += 1;
        if (calls === 1) {
          started();
          await wait;
          return original(...args);
        }
        if (outcome === 'unavailable') {
          return {
            semanticStatus: 'unavailable', source: 'rule', llmAvoided: true,
            modelCallEvidence: { status: 'unmeasured' }, cacheDisposition: { read: 'not-applicable' }, telemetry: [],
          };
        }
        const resolved = await original(...args) as { structuredDecision: { event: { payload: Record<string, unknown> } } };
        // A different semantic answer fails the selected Business amount guard;
        // the real Kernel, not this wrapper, decides the resulting denial.
        return { ...resolved, structuredDecision: {
          ...resolved.structuredDecision, event: {
            ...resolved.structuredDecision.event, payload: { ...resolved.structuredDecision.event.payload, amount: 75 },
          },
        } };
      };
      let activationA: V10GovernedBuildActivation | undefined;
      let activationB: V10GovernedBuildActivation | undefined;
      let live: Promise<Record<string, unknown>> | undefined;
      try {
        const app = await buildReservationApp('t08-reservation-race', (source) => {
          const anchor = 'export function interpret(';
          assert.equal(source.split(anchor).length, 2, 'wrap exactly the selected Standard interpreter');
          return source.replace(anchor, 'function __reservationInterpret(')
            + '\nexport async function interpret(...args) { return globalThis.__dhReservationInterpret(__reservationInterpret, args); }\n';
        });
        const decision = t08Decision(app, 'A', T08_DEPLOYMENT, { buildId: app.buildId, approvalRef: 'approval:res:race' });
        const authority = createT08AuthorizationAuthority();
        authority.grant(decision);
        activationA = await activateGovernedV10Build(app, {
          store, deployment: T08_DEPLOYMENT, decision, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
        });
        activationB = await activateGovernedV10Build(app, {
          store, deployment: T08_DEPLOYMENT, decision, authorization: authority, selection: 'PINNED_ONLY', now: () => T08_NOW,
        });
        const intent = NORMAL_INTENT('inst-race', 'msg:res:race:1', 37);
        const target = { ...activationA.resolveIntentTarget(intent.intentType), instanceKey: intent.instanceKey };
        if (crashedOwner) {
          await craftReservedCrashState(store, app, decision, target, {
            messageId: intent.messageId, intentType: intent.intentType, input: intent.input, attemptId: 'dead-owner', held: true,
          });
        }
        live = activationA.send(intent);
        await Promise.race([entered, live.then(() => { assert.fail('first submit must pause before admission'); })]);
        assert.equal(await activationB.recoverReservation(intent, { priorWriterTerminated: true }), 'PENDING');
        const retry = await activationB.send(intent);
        assert.equal(retry.status, outcome === 'unavailable' ? 'terminated' : 'denied');
        assert.equal((await activationB.readPin(intent))?.phase, 'RESERVED', 'non-admission cannot delete under a live evaluator');
        assert.equal(store.removeKeys.includes(v10OccurrenceBuildPinKey(T08_DEPLOYMENT, target)), false);

        release();
        assert.equal((await live).status, 'admitted', 'the first submit still owns its genuine K admission');
        assert.equal((await activationA.readPin(intent))?.phase, 'ADMITTED', 'admission settles the surviving pin');
        const rows = instanceRowsOf(readT08Rows(kPath), T08_DEPLOYMENT, target.businessPackageId, target.workflowId, intent.instanceKey);
        assert.equal(rows.length, 1);
        const document = JSON.parse(rows[0]!.value) as { durableOriginalReceipts: Record<string, { receipt: { status: string; occurrence: { messageId: string } } }> };
        assert.ok(Object.values(document.durableOriginalReceipts).some(({ receipt }) =>
          receipt.status === 'admitted' && receipt.occurrence.messageId === intent.messageId), 'real same-CAS original receipt is durable');
      } finally {
        release();
        await live?.catch(() => {});
        activationA?.close();
        activationB?.close();
        inner.close();
        delete reservationTestHost.__dhReservationInterpret;
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    });
  }
}

test('RES10: legacy compiler-digest pins stay fail-closed through resend and Host slot release', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res10-'));
  const inner = await openSqliteCasStore({ path: join(dir, 'k.sqlite') });
  const store = new T08CountingStore(inner);
  let activation: V10GovernedBuildActivation | undefined;
  try {
    const app = await buildReservationApp('t08-reservation-legacy');
    const decision = t08Decision(app, 'A', T08_DEPLOYMENT, { buildId: app.buildId, approvalRef: 'approval:res:legacy' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decision);
    activation = await activateGovernedV10Build(app, {
      store, deployment: T08_DEPLOYMENT, decision, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const intent = { ...NORMAL_INTENT('inst-legacy', 'msg:res:legacy:1', 37), input: { amount: 37, requestId: 'R-legacy', tags: { '2': 'b', '10': 'a' } } };
    const target = { ...activation.resolveIntentTarget(intent.intentType), instanceKey: intent.instanceKey };
    assert.equal((await activation.send(intent)).status, 'admitted');
    await craftReservedCrashState(store, app, decision, target, {
      messageId: intent.messageId, input: intent.input, legacyDigest: true, attemptId: 'legacy-owner', held: true,
    });
    assert.equal(await activation.recoverReservation(intent), 'PENDING');
    const active = activation;
    for (const releaseSlot of [false, true]) {
      if (releaseSlot) assert.equal(await active.recoverReservation(intent, { priorWriterTerminated: true }), 'PENDING');
      const error = await refusalError(() => active.send(intent));
      assert.equal(error.code, 'OCCURRENCE_RESERVATION_PENDING');
      assert.equal(error.detail?.retryable, false);
      const pin = await active.readPin(intent);
      assert.equal(pin?.phase, 'RESERVED');
      assert.equal(pin?.reservation?.inputDigest, sha256Canonical(intent.input), 'neither API migrates stored digest bytes');
    }
  } finally {
    activation?.close(); inner.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES11: an old reservation without intent binding cannot authorize compensation of a role denial', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res11-'));
  const inner = await openSqliteCasStore({ path: join(dir, 'k.sqlite') });
  const store = new T08CountingStore(inner);
  let activation: V10GovernedBuildActivation | undefined;
  try {
    const app = await buildReservationApp('t08-reservation-unbound');
    const decision = t08Decision(app, 'A', T08_DEPLOYMENT, { buildId: app.buildId, approvalRef: 'approval:res:unbound' });
    const authority = createT08AuthorizationAuthority(); authority.grant(decision);
    activation = await activateGovernedV10Build(app, {
      store, deployment: T08_DEPLOYMENT, decision, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const intent = RESTRICTED_INTENT('inst-unbound', 'msg:res:unbound:1');
    const target = { ...activation.resolveIntentTarget(intent.intentType), instanceKey: intent.instanceKey };
    await craftReservedCrashState(store, app, decision, target, {
      messageId: intent.messageId, input: intent.input, attemptId: 'legacy-owner', held: true,
    });
    await activation.recoverReservation(intent, { priorWriterTerminated: true });
    assert.equal((await activation.send(intent)).status, 'denied');
    assert.equal((await activation.readPin(intent))?.phase, 'RESERVED', 'unknown original intent cannot prove all submits incapable of admission');
    assert.equal(store.removes, 0);
  } finally {
    activation?.close(); inner.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES12: reservation intent binding rejects a different sealed intent on the same Business/workflow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res12-'));
  const inner = await openSqliteCasStore({ path: join(dir, 'k.sqlite') });
  const store = new T08CountingStore(inner);
  let activation: V10GovernedBuildActivation | undefined;
  try {
    const composition = await basicComposition({ routes: [
      { intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
      { intentId: 'submitQuoteDecisionStrict', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ] });
    const modules = composition.modules.map((module) => module.role === 'business'
      ? { ...module, provides: [...module.provides, 'intent:submitQuoteDecisionStrict'] } : module);
    const app = await buildV10App({ ...composition, modules, appId: T08_APP_ID, buildId: 't08-reservation-intent' });
    const decision = t08Decision(app, 'A', T08_DEPLOYMENT, { buildId: app.buildId, approvalRef: 'approval:res:intent' });
    const authority = createT08AuthorizationAuthority(); authority.grant(decision);
    activation = await activateGovernedV10Build(app, {
      store, deployment: T08_DEPLOYMENT, decision, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const intent = NORMAL_INTENT('inst-intent', 'msg:res:intent:1', 37);
    const strict = { ...intent, intentType: 'submitQuoteDecisionStrict' };
    const target = { ...activation.resolveIntentTarget(intent.intentType), instanceKey: intent.instanceKey };
    assert.deepEqual(activation.resolveIntentTarget(strict.intentType), activation.resolveIntentTarget(intent.intentType));
    await craftReservedCrashState(store, app, decision, target, {
      messageId: intent.messageId, intentType: strict.intentType, input: intent.input, attemptId: 'strict-owner', held: false,
    });
    const active = activation;
    const error = await refusalError(() => active.send(intent));
    assert.equal(error.code, 'OCCURRENCE_RESERVATION_PENDING');
    assert.equal(error.detail?.retryable, false);
    assert.equal(store.kPuts(), 0, 'intent mismatch refuses before Kernel I/O');
    assert.equal((await activation.readPin(intent))?.reservation?.intentType, strict.intentType);
    assert.equal((await activation.send(strict)).status, 'admitted', 'the actual reserved intent can continue');

    // An old pin without the new field is still readable and healable when
    // the existing message/input witness matches; no intent is backfilled.
    await craftReservedCrashState(store, app, decision, target, {
      messageId: intent.messageId, input: intent.input, attemptId: 'legacy-admitted-owner', held: true,
    });
    assert.equal(await activation.recoverReservation(strict), 'ADMITTED');
  } finally {
    activation?.close(); inner.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES13: a lone dynamic Guard denial compensates its pin; the instance accepts the next message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res13-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const target = { ...activationA.resolveIntentTarget('submitQuoteDecisionDynamic'), instanceKey: 'inst-guard' };

    // amount 75 fails the actual selected Business Guard: a DYNAMIC denial.
    const denied = await activationA.send(NORMAL_INTENT('inst-guard', 'msg:res:guard:1', 75));
    assert.equal(denied.status, 'denied');
    assert.equal((denied.denial as { reason?: unknown }).reason, 'guard', 'precondition: a dynamic Guard denial, not the static role gate');
    assert.equal(await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target), null,
      'the last registered in-flight submit concluded non-admitted: nothing can still admit, the pin is compensated');

    const next = await activationA.send(NORMAL_INTENT('inst-guard', 'msg:res:guard:2', 30));
    assert.equal(next.status, 'admitted', `the instance is not stranded: ${JSON.stringify(next).slice(0, 300)}`);
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.phase, 'ADMITTED');
    activationA.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES14: a crashed registered submit blocks compensation until the Host asserts all attempts terminated', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res14-'));
  const kPath = join(dir, 'k.sqlite');
  try {
    const inner = await openSqliteCasStore({ path: kPath });
    const store = new T08CountingStore(inner);
    const appA = await buildReservationApp('t08-reservation-a');
    const decisionA = t08Decision(appA, 'A', T08_DEPLOYMENT, { buildId: appA.buildId, approvalRef: 'approval:res:a' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decisionA);
    const activationA = await activateGovernedV10Build(appA, {
      store, deployment: T08_DEPLOYMENT, decision: decisionA, authorization: authority, selection: 'CURRENT', now: () => T08_NOW,
    });
    const crashed = NORMAL_INTENT('inst-crash-guard', 'msg:res:crashguard:1', 75);
    const target = { ...activationA.resolveIntentTarget(crashed.intentType), instanceKey: crashed.instanceKey };
    await craftReservedCrashState(store, appA, decisionA, target, {
      messageId: crashed.messageId, intentType: crashed.intentType, input: crashed.input,
      attemptId: 'dead-owner', held: true, inFlight: ['dead-owner'],
    });

    // The dead attempt is still registered: a concluded Guard denial of the
    // retry proves nothing about it, so the pin stays RESERVED.
    assert.equal((await activationA.send(crashed)).status, 'denied');
    let pin = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
    assert.equal(pin?.phase, 'RESERVED', 'a registered (possibly live) submit blocks compensation');
    assert.deepEqual(pin?.inFlight, ['dead-owner'], 'the retry deregistered itself and nothing else');

    // The slot-only assertion never clears registered submits.
    assert.equal(await activationA.recoverReservation(crashed, { priorWriterTerminated: true }), 'PENDING');
    assert.equal((await activationA.send(crashed)).status, 'denied');
    assert.equal((await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target))?.phase, 'RESERVED',
      'priorWriterTerminated alone cannot authorize compensation under a registered submit');

    // The Host asserts EVERY registered attempt terminated: the set empties.
    assert.equal(await activationA.recoverReservation(crashed, { allAttemptsTerminated: true }), 'PENDING');
    pin = await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target);
    assert.equal(pin?.phase, 'RESERVED', 'the assertion itself never deletes');
    assert.deepEqual(pin?.inFlight, [], 'the in-flight set is emptied');

    assert.equal((await activationA.send(crashed)).status, 'denied');
    assert.equal(await readV10OccurrenceBuildPin(store, T08_DEPLOYMENT, target), null,
      'the now-last registered submit compensates its concluded denial');
    const next = await activationA.send(NORMAL_INTENT('inst-crash-guard', 'msg:res:crashguard:2', 30));
    assert.equal(next.status, 'admitted', 'the instance accepts the next message');
    activationA.close();
    inner.close();
  } finally {
    // Best-effort: Windows may keep SQLite WAL handles briefly after close.
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

/** Builds the race App whose selected Standard interpreter is routed through the test hook. */
async function buildHookedReservationApp(buildId: string): Promise<V10BuiltApp> {
  return await buildReservationApp(buildId, (source) => {
    const anchor = 'export function interpret(';
    assert.equal(source.split(anchor).length, 2, 'wrap exactly the selected Standard interpreter');
    return source.replace(anchor, 'function __reservationInterpret(')
      + '\nexport async function interpret(...args) { return globalThis.__dhReservationInterpret(__reservationInterpret, args); }\n';
  });
}

/** Rewrites the resolved semantic amount so the actual Business Guard denies. */
async function guardFailingInterpretation(original: ReservationInterpreter, args: unknown[]): Promise<unknown> {
  const resolved = await original(...args) as { structuredDecision: { event: { payload: Record<string, unknown> } } };
  return { ...resolved, structuredDecision: {
    ...resolved.structuredDecision, event: {
      ...resolved.structuredDecision.event, payload: { ...resolved.structuredDecision.event.payload, amount: 75 },
    },
  } };
}

test('RES15: a post-commit lost ACK never lets a stale negative witness delete the admitted pin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res15-'));
  const kPath = join(dir, 'k.sqlite');
  const inner = await openSqliteCasStore({ path: kPath });
  const base = new T08CountingStore(inner);
  let releaseA!: () => void;
  let enteredA!: () => void;
  let releaseB!: () => void;
  let enteredB!: () => void;
  const waitA = new Promise<void>((resolve) => { releaseA = resolve; });
  const startA = new Promise<void>((resolve) => { enteredA = resolve; });
  const waitB = new Promise<void>((resolve) => { releaseB = resolve; });
  const startB = new Promise<void>((resolve) => { enteredB = resolve; });
  let calls = 0;
  let injected = false;
  let blockB = false;
  // Process A's store: the actual SQLite write of the Kernel's admitted
  // original receipt COMMITS, then the Host wrapper loses the ACK.
  const storeA: V10DocStore = {
    get: async (key) => await base.get(key),
    remove: async (key, condition) => { await base.remove(key, condition); },
    put: async (key, value, condition) => {
      const result = await base.put(key, value, condition);
      const ring = (value as { durableOriginalReceipts?: Record<string, { receipt?: { status?: string } }> } | null)?.durableOriginalReceipts;
      if (!injected && key.startsWith('v10/k/') && Object.values(ring ?? {}).some((entry) => entry.receipt?.status === 'admitted')) {
        injected = true;
        throw Object.assign(new Error('injected post-commit I/O failure'), { code: 'HOST_IO_FAILURE' });
      }
      return result;
    },
  };
  // Process B's store: B captures an ABSENT witness, then pauses before concluding.
  const storeB: V10DocStore = {
    put: async (key, value, condition) => await base.put(key, value, condition),
    remove: async (key, condition) => { await base.remove(key, condition); },
    get: async (key) => {
      const doc = await base.get(key);
      if (blockB && key.includes('receipt-archive') && doc === null) {
        blockB = false;
        enteredB();
        await waitB;
      }
      return doc;
    },
  };
  reservationTestHost.__dhReservationInterpret = async (original, args) => {
    calls += 1;
    if (calls === 1) {
      enteredA();
      await waitA;
      return await original(...args);
    }
    blockB = true;
    return await guardFailingInterpretation(original, args);
  };
  let activationA: V10GovernedBuildActivation | undefined;
  let activationB: V10GovernedBuildActivation | undefined;
  let live: Promise<{ receipt?: Record<string, unknown>; error?: string }> | undefined;
  let retry: Promise<Record<string, unknown>> | undefined;
  try {
    const app = await buildHookedReservationApp('t08-reservation-lostack');
    const decision = t08Decision(app, 'A', T08_DEPLOYMENT, { buildId: app.buildId, approvalRef: 'approval:res:lostack' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decision);
    activationA = await activateGovernedV10Build(app, { store: storeA, deployment: T08_DEPLOYMENT, decision, authorization: authority, now: () => T08_NOW });
    activationB = await activateGovernedV10Build(app, { store: storeB, deployment: T08_DEPLOYMENT, decision, authorization: authority, selection: 'PINNED_ONLY', now: () => T08_NOW });
    const intent = NORMAL_INTENT('inst-lostack', 'msg:res:lostack:1', 37);
    const target = { ...activationA.resolveIntentTarget(intent.intentType), instanceKey: intent.instanceKey };

    live = activationA.send(intent).then((receipt) => ({ receipt }), (error: { code?: string }) => ({ error: String(error.code) }));
    await startA;
    retry = activationB.send(intent);
    await startB; // B saw no admission witness and is paused before concluding.

    releaseA();
    const a = await live;
    assert.equal(injected, true, 'precondition: the actual Kernel admission committed, then its ACK was lost');
    assert.equal(a.error, 'HOST_IO_FAILURE', 'A surfaces its genuine Host failure');
    assert.equal((await activationA.readPin(intent))?.phase, 'ADMITTED', 'A healed its pin from the durable witness despite the throw');

    releaseB();
    const b = await retry.then((receipt) => String(receipt.status), (error: { code?: string }) => String(error.code));
    assert.ok(b === 'denied' || b === 'OCCURRENCE_RESERVATION_INDETERMINATE', `B concludes honestly: ${b}`);
    const finalPin = await activationA.readPin(intent);
    assert.equal(finalPin?.phase, 'ADMITTED', 'the admitted occurrence keeps its immutable BUILD pin');
    assert.equal(base.removeKeys.includes(v10OccurrenceBuildPinKey(T08_DEPLOYMENT, target)), false, 'no pin delete was ever issued');
    const rows = instanceRowsOf(readT08Rows(kPath), T08_DEPLOYMENT, target.businessPackageId, target.workflowId, intent.instanceKey);
    const document = JSON.parse(rows[0]!.value) as { durableOriginalReceipts: Record<string, { receipt: { status: string } }> };
    assert.ok(Object.values(document.durableOriginalReceipts).some(({ receipt }) => receipt.status === 'admitted'), 'the admission is physically durable');
  } finally {
    releaseA();
    releaseB();
    await live?.catch(() => {});
    await retry?.catch(() => {});
    activationA?.close();
    activationB?.close();
    inner.close();
    delete reservationTestHost.__dhReservationInterpret;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test('RES16: an ambiguous throw keeps its in-flight marker; a competing denial cannot delete; the same message then settles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh-res16-'));
  const kPath = join(dir, 'k.sqlite');
  const inner = await openSqliteCasStore({ path: kPath });
  const base = new T08CountingStore(inner);
  let failNextAdmission = true;
  // The Kernel's admission write fails BEFORE reaching SQLite: the caller
  // cannot tell whether such a write might still land.
  const store: V10DocStore = {
    get: async (key) => await base.get(key),
    remove: async (key, condition) => { await base.remove(key, condition); },
    put: async (key, value, condition) => {
      const ring = (value as { durableOriginalReceipts?: Record<string, unknown> } | null)?.durableOriginalReceipts;
      if (failNextAdmission && key.startsWith('v10/k/') && Object.keys(ring ?? {}).length > 0) {
        failNextAdmission = false;
        throw Object.assign(new Error('injected ambiguous I/O failure'), { code: 'HOST_IO_FAILURE' });
      }
      return await base.put(key, value, condition);
    },
  };
  let calls = 0;
  reservationTestHost.__dhReservationInterpret = async (original, args) => {
    calls += 1;
    // The 2nd evaluation (the competing retry) is denied by the actual Guard.
    return calls === 2 ? await guardFailingInterpretation(original, args) : await original(...args);
  };
  let activation: V10GovernedBuildActivation | undefined;
  try {
    const app = await buildHookedReservationApp('t08-reservation-ambiguous');
    const decision = t08Decision(app, 'A', T08_DEPLOYMENT, { buildId: app.buildId, approvalRef: 'approval:res:ambiguous' });
    const authority = createT08AuthorizationAuthority();
    authority.grant(decision);
    const governed = await activateGovernedV10Build(app, { store, deployment: T08_DEPLOYMENT, decision, authorization: authority, now: () => T08_NOW });
    activation = governed;
    const intent = NORMAL_INTENT('inst-ambiguous', 'msg:res:ambiguous:1', 37);

    assert.equal(await refusalCode(() => governed.send(intent)), 'HOST_IO_FAILURE');
    let pin = await governed.readPin(intent);
    assert.equal(pin?.phase, 'RESERVED');
    assert.equal(pin?.inFlight?.length, 1, 'the ambiguous attempt stays registered as possibly-admitting');
    assert.equal(pin?.activeAttempt ?? null, null, 'it releases only its writer slot');

    const denied = await governed.send(intent);
    assert.equal(denied.status, 'denied', 'the competing evaluation is denied by the actual Guard');
    pin = await governed.readPin(intent);
    assert.equal(pin?.phase, 'RESERVED', 'a denial is never the last in-flight submit under an ambiguous marker');
    assert.equal(pin?.inFlight?.length, 1, 'the denial deregistered only itself');

    const admitted = await governed.send(intent);
    assert.equal(admitted.status, 'admitted', 'the same reserved message reconciles by admitting');
    pin = await governed.readPin(intent);
    assert.equal(pin?.phase, 'ADMITTED', 'admission settles the pin and drops every marker');
    assert.equal(pin?.inFlight, undefined);
  } finally {
    activation?.close();
    inner.close();
    delete reservationTestHost.__dhReservationInterpret;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
