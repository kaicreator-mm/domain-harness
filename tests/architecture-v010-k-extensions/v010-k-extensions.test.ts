/**
 * #1150 — v0.10 K-extension feasibility spike (E2, exact research HEAD).
 *
 * Executable falsifier for L2 R0 §C 'K_EXTENSION_FEASIBILITY_HOLD': a
 * v0.10-candidate loader/Host seam over the REAL selected v0.9 kernel bytes
 * (kernel-mechanism-v1.mjs imported through per-activation data: URLs), the
 * real Standard SDK (vendored pure Router), the real Business approval
 * package and the real capability-quote-tools package, plus PHYSICALLY
 * distinct kernel-extension ESM modules.
 *
 *  R1 Tiny    — Basic-only closure: zero extension import/evaluation, ONE K
 *               runtime factory call, stable ordinary admission.
 *  R2 Rich    — two independently sealed extensions (admission-budget-advice/v1
 *               + recovery-diagnostics/v1): distinct identities/bytes, advice
 *               bounded by the Primary's OWN hard ceiling, data-only recovery
 *               hints over real outstanding-UNKNOWN journal records.
 *  R3 Negatives — duplicate primary/provider, forged privileged init return,
 *               protected-port probes, oversize/smuggled/malformed advice,
 *               forged recovery terminal, over-hard work units: each typed or
 *               ignored/clamped BEFORE any K authority change.
 *  R4 Preflight — changed digest in a required transitive module, missing
 *               dependency, cycle, invalid ABI, unmet required feature: typed
 *               refusal with import/evaluation sentinel count ZERO across the
 *               ENTIRE closure (positive control proves the sentinel works).
 *  R5 Faults  — absent optional extension falls back to Basic; post-preflight
 *               init failure disposes ONLY initialized modules in reverse,
 *               never rolls back durable K state, leaks no Host port.
 *  R6 Repair  — review R1 P1: unchanged messageId retry reaches REAL K
 *               idempotent replay (zero new activity); a distinct target
 *               reusing the same messageId admits independently (advisory
 *               records scoped to full occurrence+turn, no collision); the
 *               same target+messageId with CHANGED input replays the
 *               original receipt because the real v0.9 turn identity EXCLUDES
 *               the input payload — recorded honestly as the #1110 v0.10 K02
 *               gap, NOT claimed as working; a conflicting advisory record is
 *               a typed observation that never alters the authoritative ACK.
 *
 * NOT claimed: malicious-JS isolation (same-realm trusted JS is not a
 * sandbox), SQLite/process-kill/network effects, #1124/#1126 principal and
 * permit machinery, multi-Host CAS interleaving — those belong to K01/C01.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { FailTerminalEffectCompletions, MemoryCasStore } from './harness/memory-cas-store.js';
import {
  BUSINESS_PACKAGE_ID,
  CAPABILITY_PACKAGE_ID,
  KERNEL_PACKAGE_ID,
  STANDARD_PACKAGE_ID,
  buildSubject,
  extensionEntry,
  type V10Subject,
} from './harness/v10-subject.js';
import {
  V10ActivationError,
  activateV10Subject,
  clearEvalSentinels,
  evalSentinels,
  freshCounters,
} from './harness/v10-loader.js';
import { V10PrimaryError, advisoryDocKey } from './harness/v10-kernel-primary.js';

const BASE_MS = Date.UTC(2026, 9, 18, 9, 0, 0);
const TENANT = 'tenant:spike';
const WORKFLOW_ID = 'order-quote'; // the sealed Business approval workflowKey

type ExtensionSubjectEntry = Awaited<ReturnType<typeof extensionEntry>>;

function tickingClock(): { now: () => number } {
  let tick = 0;
  return { now: (): number => BASE_MS + (tick += 1) * 1000 };
}

const intent = (instanceKey: string, messageId: string, amount = 30) => ({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey,
  messageId,
  input: { amount, requestId: `R-${messageId}` },
});

/** Full physical path of a turn's advisory observation document. */
function advisoryDocFullPath(activation: { digest: string }, instanceKey: string, messageId: string): string {
  return `v10/k/${activation.digest}/${TENANT}/${advisoryDocKey(WORKFLOW_ID, instanceKey, messageId)}`;
}

async function adviceFixture(overrides: { packageId?: string; dependencies?: readonly string[]; requires?: readonly string[]; abiVersion?: string } = {}): Promise<ExtensionSubjectEntry> {
  return extensionEntry({
    fixture: 'kext-admission-budget-advice-v1.mjs',
    hookExport: 'adviseAdmissionBudget',
    hook: 'admission-budget-advice/v1',
    ...overrides,
  });
}

async function recoveryFixture(dependencies: readonly string[] = []): Promise<ExtensionSubjectEntry> {
  return extensionEntry({
    fixture: 'kext-recovery-diagnostics-v1.mjs',
    hookExport: 'diagnoseRecovery',
    hook: 'recovery-diagnostics/v1',
    dependencies,
  });
}

const MEASUREMENTS: Record<string, unknown>[] = [];
function record(scenario: string, data: Record<string, unknown>): void {
  MEASUREMENTS.push({ scenario, ...data });
}

function activationCode(error: unknown): string {
  assert.ok(error instanceof V10ActivationError, `expected V10ActivationError, got ${String(error)}`);
  return error.code;
}

async function journalRecords(memory: MemoryCasStore): Promise<Record<string, unknown>[]> {
  const keys = memory.keys().filter((key) => key.includes('v08-kernel:effect-journal:'));
  const envelopes = await Promise.all(keys.map((key) => memory.rawGet(key)));
  return envelopes.map((envelope) => (envelope.value as { record: Record<string, unknown> }).record);
}

function kJournalKeys(memory: MemoryCasStore): string[] {
  return memory.keys().filter((key) => key.includes('v08-kernel:effect-journal:'));
}

// ---------------------------------------------------------------------------

test('R1 Tiny: Basic K/S/B/C only — zero extension activity, one runtime, stable ordinary admission', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const store = new FailTerminalEffectCompletions(memory);
  const clock = tickingClock();
  const { subject } = await buildSubject();
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store, tenantId: TENANT, now: clock.now, counters });

  // Zero OPTIONAL-extension activity: no extension bytes exist in the subject.
  assert.equal(counters.extensionImports, 0);
  assert.deepEqual(counters.importsByPackage, {
    [KERNEL_PACKAGE_ID]: 1,
    [STANDARD_PACKAGE_ID]: 1,
    [BUSINESS_PACKAGE_ID]: 1,
    [CAPABILITY_PACKAGE_ID]: 1,
  });
  assert.deepEqual(evalSentinels(), []);
  assert.deepEqual(activation.facade.selectedExtensions, []);

  // One K runtime; three ordinary admissions with real journal + effect.
  for (let index = 1; index <= 3; index += 1) {
    const receipt = await activation.facade.send(intent(`instance:r1-${index}`, `msg:r1-${index}`));
    assert.equal(receipt.status, 'admitted', `turn ${index} must be admitted`);
  }
  assert.equal(counters.runtimeFactoryInvocations, 1);
  const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
  assert.equal(k.admissions, 3);
  assert.equal(k.journalBegins, 3);
  assert.equal(k.journalCompletes, 3);
  assert.equal(k.effectDispatches, 3);

  // Basic budget behavior: no provider, hard ceiling only, durably recorded
  // (review R1 P1 repair: scoped to the full occurrence+turn identity and
  // appended only AFTER the authoritative K admission).
  const advisory = await memory.rawGet(advisoryDocFullPath(activation, 'instance:r1-1', 'msg:r1-1'));
  assert.equal(advisory.value.disposition, 'none');
  assert.equal(advisory.value.providerId, null);
  assert.equal(advisory.value.effectiveCeiling, 8);
  assert.equal(advisory.value.hardCeiling, 8);

  record('R1-tiny', {
    extensionImports: counters.extensionImports,
    runtimeFactoryInvocations: counters.runtimeFactoryInvocations,
    kCounters: activation.facade.kCounters(BUSINESS_PACKAGE_ID),
    moduleSha256: {
      kernel: subject.entries[0]?.moduleSha256,
      standard: subject.entries[1]?.moduleSha256,
      business: subject.entries[2]?.moduleSha256,
      capability: subject.entries[3]?.moduleSha256,
    },
  });
});

test('R2 Rich: two independently sealed K extensions — bounded useful advice, data-only recovery diagnostics, one runtime', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const store = new FailTerminalEffectCompletions(memory);
  const clock = tickingClock();
  const budget = await adviceFixture();
  const recovery = await recoveryFixture();
  const { subject } = await buildSubject({ extensions: [budget, recovery] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store, tenantId: TENANT, now: clock.now, counters });

  // Two distinct, independently sealed/evaluated extension modules.
  assert.notEqual(budget.packageId, recovery.packageId);
  assert.notEqual(budget.moduleSha256, recovery.moduleSha256);
  assert.equal(counters.extensionImports, 2);
  assert.deepEqual(counters.initCalls.sort(), [budget.packageId, recovery.packageId].sort());
  assert.deepEqual(
    activation.facade.selectedExtensions.map((extension) => extension.hook).sort(),
    ['admission-budget-advice/v1', 'recovery-diagnostics/v1'],
  );

  // Useful budget advice honored and bounded by the Primary's OWN ceiling.
  const admitted = await activation.facade.send(intent('instance:r2-1', 'msg:r2-1'));
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.budget.providerId, 'admission-budget-advice');
  assert.equal(admitted.budget.disposition, 'honored');
  assert.equal(admitted.budget.adviceCeiling, 5);
  assert.equal(admitted.budget.effectiveCeiling, 5);
  assert.ok((admitted.budget.effectiveCeiling as number) <= (admitted.budget.hardCeiling as number));
  const advisory = await memory.rawGet(advisoryDocFullPath(activation, 'instance:r2-1', 'msg:r2-1'));
  assert.equal(advisory.value.providerId, 'admission-budget-advice');
  assert.equal(advisory.value.disposition, 'honored');
  assert.equal(advisory.value.effectiveCeiling, 5);

  // Real outstanding UNKNOWNs: terminal journal completions fail physically.
  store.arm();
  const unknownFirst = await activation.facade.send(intent('instance:r2-u1', 'msg:r2-u1'));
  assert.equal(unknownFirst.status, 'UNKNOWN');
  const unknownSecond = await activation.facade.send(intent('instance:r2-u2', 'msg:r2-u2'));
  assert.equal(unknownSecond.status, 'UNKNOWN');

  const started = (await journalRecords(memory)).filter((entry) => entry.status === 'started');
  assert.equal(started.length, 2);

  // Data-only recovery diagnostics over the real UNKNOWN projection.
  const effectsBefore = activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches;
  const journalKeysBefore = kJournalKeys(memory);
  const diagnosis = await activation.facade.diagnoseRecovery();
  assert.equal(diagnosis.outstanding, 2);
  assert.equal(diagnosis.consulted, true);
  assert.equal(diagnosis.providerId, 'recovery-diagnostics');
  assert.equal((diagnosis.accepted as unknown[]).length, 2);
  // Oldest outstanding UNKNOWN first (deterministic useful ordering).
  const oldestFirst = [...started].sort((left, right) => String(left.startedAt) < String(right.startedAt) ? -1 : 1);
  assert.deepEqual(diagnosis.ordering, oldestFirst.map((entry) => entry.effectId));

  // Observation-only: no journal write, no effect dispatch, UNKNOWN intact.
  assert.deepEqual(kJournalKeys(memory), journalKeysBefore);
  assert.equal(activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches, effectsBefore);
  const stillStarted = (await journalRecords(memory)).filter((entry) => entry.status === 'started');
  assert.equal(stillStarted.length, 2);
  const observation = await memory.rawGet(`v10/k/${activation.digest}/${TENANT}/kext-recovery-observation:1`);
  assert.equal(observation.value.consulted, true);

  // Still exactly ONE runtime factory call after diagnostics.
  assert.equal(counters.runtimeFactoryInvocations, 1);
  const advisory2 = activation.facade.advisoryCounters;
  assert.equal(advisory2.advisoryConsultations, 3);
  assert.equal(advisory2.recoveryConsultations, 1);

  record('R2-rich', {
    extensionImports: counters.extensionImports,
    selectedModules: activation.facade.selectedExtensions,
    moduleSha256: { budget: budget.moduleSha256, recovery: recovery.moduleSha256 },
    runtimeFactoryInvocations: counters.runtimeFactoryInvocations,
    advisoryCounters: advisory2,
    kCounters: activation.facade.kCounters(BUSINESS_PACKAGE_ID),
    unknownOutstanding: 2,
  });
});

// ---------------------------------------------------------------------------
// R3 — role and privilege negatives
// ---------------------------------------------------------------------------

test('R3: duplicate kernel-primary refuses typed with zero imports across the closure', async () => {
  clearEvalSentinels();
  const { subject } = await buildSubject();
  const kernel = subject.entries.find((entry) => entry.role === 'kernel-primary');
  assert.ok(kernel !== undefined);
  const tampered: V10Subject = { ...subject, entries: [...subject.entries, { ...kernel, packageId: 'k-duplicate-primary@1' }] };
  const counters = freshCounters();
  await assert.rejects(
    activateV10Subject(tampered, { store: new MemoryCasStore(), tenantId: TENANT, counters }),
    (error: unknown) => activationCode(error) === 'V10_ROLE_PRIMARY_CARDINALITY',
  );
  assert.deepEqual(counters.importsByPackage, {});
  assert.deepEqual(evalSentinels(), []);
  record('R3-duplicate-primary', { refusal: counters.activationRefusals[0]?.code, importsByPackage: counters.importsByPackage });
});

test('R3: duplicate provider/hook refuses typed with zero imports across the closure', async () => {
  clearEvalSentinels();
  const first = await adviceFixture();
  const clone = await adviceFixture('kext:advice-clone@1');
  const { subject } = await buildSubject({ extensions: [first, clone] });
  const counters = freshCounters();
  await assert.rejects(
    activateV10Subject(subject, { store: new MemoryCasStore(), tenantId: TENANT, counters }),
    (error: unknown) => activationCode(error) === 'V10_PROVIDER_COLLISION',
  );
  assert.deepEqual(counters.importsByPackage, {});
  assert.deepEqual(evalSentinels(), []);
  record('R3-duplicate-provider', { refusal: counters.activationRefusals[0]?.code, importsByPackage: counters.importsByPackage });
});

test('R3: forged privileged init return refuses typed BEFORE any K runtime or journal exists', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const forged = await extensionEntry({
    fixture: 'kext-init-privileged-returns.mjs',
    hookExport: 'adviseAdmissionBudget',
    hook: 'admission-budget-advice/v1',
  });
  const { subject } = await buildSubject({ extensions: [forged] });
  const counters = freshCounters();
  await assert.rejects(
    activateV10Subject(subject, { store: memory, tenantId: TENANT, counters }),
    (error: unknown) => activationCode(error) === 'V10_INIT_CONTRACT_REFUSED',
  );
  // The module WAS imported+initialized (preflight passed; bytes are valid),
  // but no authority followed: no runtime, no journal, no commit anywhere.
  assert.equal(counters.extensionImports, 1);
  assert.equal(counters.runtimeFactoryInvocations, 0);
  assert.deepEqual(kJournalKeys(memory), []);
  assert.deepEqual(counters.disposals, []);
  record('R3-forged-init-return', { refusal: counters.activationRefusals[0]?.code, runtimeFactoryInvocations: 0, journalKeys: 0 });
});

test('R3: protected-port probes are denied typed at the Host boundary while the subject stays usable', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const probing = await extensionEntry({
    fixture: 'kext-init-requests-ports.mjs',
    hookExport: 'adviseAdmissionBudget',
    hook: 'admission-budget-advice/v1',
  });
  const { subject } = await buildSubject({ extensions: [probing] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: memory, tenantId: TENANT, now: tickingClock().now, counters });

  // Every protected Host port name was probed and every call denied typed.
  const probedNames = counters.portProbes.map((probe) => probe.name).sort();
  assert.deepEqual(probedNames, ['cas', 'docs', 'hostPorts', 'permit', 'principal', 'resources', 'sha256', 'store']);
  assert.equal(counters.portDenials, 8);

  // No authority changed: ordinary admission still works, only real effects.
  const receipt = await activation.facade.send(intent('instance:r3-ports', 'msg:r3-ports'));
  assert.equal(receipt.status, 'admitted');
  assert.equal(activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches, 1);
  record('R3-port-probes', { portProbes: counters.portProbes.length, portDenials: counters.portDenials, admitted: receipt.status });
});

test('R3: oversize advice clamps and smuggled authority fields void the advice — never a permit', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const malicious = await extensionEntry({
    fixture: 'kext-advice-oversize-smuggled.mjs',
    hookExport: 'adviseAdmissionBudget',
    hook: 'admission-budget-advice/v1',
  });
  const { subject } = await buildSubject({ extensions: [malicious] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: memory, tenantId: TENANT, now: tickingClock().now, counters });

  const clamped = await activation.facade.send(intent('instance:r3-os1', 'msg:r3-os1'));
  assert.equal(clamped.status, 'admitted');
  assert.equal(clamped.budget.disposition, 'clamped');
  assert.equal(clamped.budget.adviceCeiling, 8);
  assert.equal(clamped.budget.effectiveCeiling, 8);

  const smuggled = await activation.facade.send(intent('instance:r3-os2', 'msg:r3-os2'));
  assert.equal(smuggled.status, 'admitted');
  assert.equal(smuggled.budget.disposition, 'ignored-fields');
  assert.equal(smuggled.budget.adviceCeiling, null);
  assert.equal(smuggled.budget.effectiveCeiling, 8);

  const advisory = activation.facade.advisoryCounters;
  assert.equal(advisory.adviceClamped, 1);
  assert.equal(advisory.adviceIgnoredFields, 1);
  // Only the two REAL turns' effects exist; no forged permit/effect landed.
  assert.equal(activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches, 2);
  assert.ok(memory.keys().every((key) => !key.includes('forged') && !key.includes('permit')));
  record('R3-oversize-smuggled', { advisoryCounters: advisory, effectDispatches: 2 });
});

test('R3: malformed advisory returns are ignored typed; turns keep Basic behavior', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const malformed = await extensionEntry({
    fixture: 'kext-advice-malformed.mjs',
    hookExport: 'adviseAdmissionBudget',
    hook: 'admission-budget-advice/v1',
  });
  const { subject } = await buildSubject({ extensions: [malformed] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: memory, tenantId: TENANT, now: tickingClock().now, counters });

  const dispositions: string[] = [];
  for (let index = 1; index <= 6; index += 1) {
    const receipt = await activation.facade.send(intent(`instance:r3-m${index}`, `msg:r3-m${index}`));
    assert.equal(receipt.status, 'admitted', `malformed advice must not break turn ${index}`);
    dispositions.push(String(receipt.budget.disposition));
  }
  assert.deepEqual(dispositions, [
    'ignored-malformed', // -5
    'ignored-malformed', // 3.5
    'ignored-malformed', // '9'
    'ignored-malformed', // Promise instead of a plain record
    'ignored-fields',    // missing required fields
    'ignored-error',     // hook threw
  ]);
  const advisory = activation.facade.advisoryCounters;
  assert.equal(advisory.advisoryConsultations, 6);
  assert.equal(advisory.adviceIgnoredMalformed + advisory.adviceIgnoredFields + advisory.adviceIgnoredError, 6);
  assert.equal(activation.facade.kCounters(BUSINESS_PACKAGE_ID).admissions, 6);
  record('R3-malformed-advice', { dispositions, advisoryCounters: advisory });
});

test('R3: forged recovery-terminal hints are dropped typed; UNKNOWN stays UNKNOWN', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const store = new FailTerminalEffectCompletions(memory);
  const forged = await extensionEntry({
    fixture: 'kext-recovery-forged-terminal.mjs',
    hookExport: 'diagnoseRecovery',
    hook: 'recovery-diagnostics/v1',
  });
  const { subject } = await buildSubject({ extensions: [forged] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store, tenantId: TENANT, now: tickingClock().now, counters });

  store.arm();
  assert.equal((await activation.facade.send(intent('instance:r3-f1', 'msg:r3-f1'))).status, 'UNKNOWN');
  assert.equal((await activation.facade.send(intent('instance:r3-f2', 'msg:r3-f2'))).status, 'UNKNOWN');

  const effectsBefore = activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches;
  const journalBefore = kJournalKeys(memory);
  const diagnosis = await activation.facade.diagnoseRecovery();
  assert.equal(diagnosis.outstanding, 2);
  assert.equal((diagnosis.accepted as unknown[]).length, 0);

  const advisory = activation.facade.advisoryCounters;
  assert.equal(advisory.hintsDroppedFields, 2); // action/terminalStatus smuggled
  assert.equal(advisory.hintsDroppedUnknown, 1); // forged correlation id
  assert.equal(advisory.hintsAccepted, 0);

  // Conservative fallback ordering over the projection; journal untouched.
  const started = (await journalRecords(memory)).filter((entry) => entry.status === 'started');
  assert.equal(started.length, 2);
  assert.deepEqual(diagnosis.ordering, started.map((entry) => entry.effectId).sort());
  assert.deepEqual(kJournalKeys(memory), journalBefore);
  assert.equal(activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches, effectsBefore);
  record('R3-forged-terminal', { hintsDroppedFields: 2, hintsDroppedUnknown: 1, outstandingStillStarted: 2 });
});

test('R3: over-hard work units refuse typed BEFORE any K admission activity', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const { subject } = await buildSubject();
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: memory, tenantId: TENANT, now: tickingClock().now, counters });

  await assert.rejects(
    activation.facade.send({ ...intent('instance:r3-w1', 'msg:r3-w1'), budget: { workUnits: 65 } }),
    (error: unknown) => {
      assert.ok(error instanceof V10PrimaryError);
      return error.code === 'ADMISSION_BUDGET_EXCEEDED';
    },
  );
  assert.equal(activation.facade.advisoryCounters.budgetRefusals, 1);
  assert.equal(counters.runtimeFactoryInvocations, 0);
  assert.deepEqual(kJournalKeys(memory), []);

  // Invalid requested ceilings are clamped to the hard ceiling, never fatal.
  for (const requestedCeiling of [0, -3, 2.5, '8']) {
    const receipt = await activation.facade.send({ ...intent(`instance:r3-c${String(requestedCeiling)}`, `msg:r3-c${String(requestedCeiling)}`), budget: { requestedCeiling } });
    assert.equal(receipt.status, 'admitted');
    assert.equal(receipt.budget.requestedCeiling, 8);
    assert.equal(receipt.budget.effectiveCeiling, 8);
  }
  record('R3-over-hard-budget', { budgetRefusals: 1, journalKeysAtRefusal: 0 });
});

// ---------------------------------------------------------------------------
// R4 — preflight negatives: zero import/evaluation activity across the closure
// ---------------------------------------------------------------------------

async function refuseWithZeroImports(name: string, build: () => Promise<V10Subject>, expectedCode: string): Promise<void> {
  clearEvalSentinels();
  const counters = freshCounters();
  await assert.rejects(
    activateV10Subject(await build(), { store: new MemoryCasStore(), tenantId: TENANT, counters }),
    (error: unknown) => activationCode(error) === expectedCode,
  );
  assert.deepEqual(counters.importsByPackage, {}, `${name}: no module of the closure may be imported`);
  assert.deepEqual(counters.initCalls, [], `${name}: no init may run`);
  assert.deepEqual(evalSentinels(), [], `${name}: the evaluation sentinel must stay at zero`);
  record(`R4-${name}`, { refusal: expectedCode, importsByPackage: counters.importsByPackage, evalSentinels: evalSentinels() });
}

test('R4: changed digest in a required transitive module refuses typed with zero evaluation', async () => {
  const sentinel = await extensionEntry({
    fixture: 'kext-side-effect-sentinel.mjs',
    hookExport: 'telemetryPing',
    hook: 'telemetry-sentinel/v1',
  });
  const budget = await adviceFixture({ dependencies: ['kext:side-effect-sentinel@1'] });
  await refuseWithZeroImports(
    'changed-digest',
    async () => {
      const { subject } = await buildSubject({ extensions: [budget, sentinel] });
      // Post-seal byte tamper: the declared digest stays the sealed one.
      const entry = subject.entries.find((candidate) => candidate.packageId === sentinel.packageId);
      assert.ok(entry !== undefined);
      (entry as { moduleSource?: string }).moduleSource = `${entry.moduleSource as string}\n// post-seal byte tamper\n`;
      return subject;
    },
    'V10_DIGEST_MISMATCH',
  );
});

test('R4: missing declared dependency refuses typed with zero evaluation', async () => {
  const budget = await adviceFixture({ dependencies: ['kext:absent@1'] });
  await refuseWithZeroImports('missing-dependency', async () => (await buildSubject({ extensions: [budget] })).subject, 'V10_DEPENDENCY_MISSING');
});

test('R4: dependency cycle refuses typed with zero evaluation', async () => {
  const recovery = await recoveryFixture();
  const budget = await adviceFixture({ dependencies: [recovery.packageId] });
  (recovery as { dependencies: string[] }).dependencies = [budget.packageId];
  await refuseWithZeroImports('cycle', async () => (await buildSubject({ extensions: [budget, recovery] })).subject, 'V10_DEPENDENCY_CYCLE');
});

test('R4: invalid extension ABI refuses typed with zero evaluation', async () => {
  const budget = await adviceFixture({ abiVersion: 'dh.v10.k-extension/9' });
  await refuseWithZeroImports('invalid-abi', async () => (await buildSubject({ extensions: [budget] })).subject, 'V10_ABI_UNSUPPORTED');
});

test('R4: required feature mismatch refuses typed with zero evaluation', async () => {
  const budget = await adviceFixture({ requires: ['kext-feature:not-provided'] });
  await refuseWithZeroImports('feature-mismatch', async () => (await buildSubject({ extensions: [budget] })).subject, 'V10_FEATURE_MISSING');
});

test('R4 positive control: the same closure with intact digests evaluates the sentinel exactly once', async () => {
  clearEvalSentinels();
  const sentinel = await extensionEntry({
    fixture: 'kext-side-effect-sentinel.mjs',
    hookExport: 'telemetryPing',
    hook: 'telemetry-sentinel/v1',
  });
  const budget = await adviceFixture({ dependencies: ['kext:side-effect-sentinel@1'] });
  const { subject } = await buildSubject({ extensions: [budget, sentinel] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: new MemoryCasStore(), tenantId: TENANT, now: tickingClock().now, counters });
  assert.deepEqual(evalSentinels(), ['kext:side-effect-sentinel@1']);
  assert.equal(counters.extensionImports, 2);
  assert.equal(counters.initCalls.length, 2);
  const receipt = await activation.facade.send(intent('instance:r4-ok', 'msg:r4-ok'));
  assert.equal(receipt.status, 'admitted');
  record('R4-sentinel-positive-control', { evalSentinels: evalSentinels(), extensionImports: counters.extensionImports });
});

// ---------------------------------------------------------------------------
// R5 — absent optional extension and post-preflight init fault
// ---------------------------------------------------------------------------

test('R5: absent optional extension falls back to Basic behavior with zero advanced imports', async () => {
  clearEvalSentinels();
  const optional = await extensionEntry({
    fixture: 'kext-side-effect-sentinel.mjs',
    hookExport: 'telemetryPing',
    hook: 'telemetry-sentinel/v1',
    optional: true,
    bytesOnly: true,
  });
  const { subject } = await buildSubject({ extensions: [optional] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: new MemoryCasStore(), tenantId: TENANT, now: tickingClock().now, counters });
  assert.deepEqual(counters.optionalMissing, [optional.packageId]);
  assert.equal(counters.extensionImports, 0);
  assert.deepEqual(evalSentinels(), []);
  const receipt = await activation.facade.send(intent('instance:r5-opt', 'msg:r5-opt'));
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.budget.disposition, 'none');
  record('R5-optional-missing', { optionalMissing: counters.optionalMissing, extensionImports: 0, admitted: receipt.status });
});

test('R5 fault: post-preflight init failure — bounded reverse disposal, durable K state intact, no port leak', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const clock = tickingClock();

  // First: a fully successful activation with real durable K state.
  const okExtension = await adviceFixture();
  const { subject: okSubject } = await buildSubject({ extensions: [okExtension], appId: 'app:r5-ok' });
  const okActivation = await activateV10Subject(okSubject, { store: memory, tenantId: TENANT, now: clock.now, counters: freshCounters() });
  assert.equal((await okActivation.facade.send(intent('instance:r5-keep', 'msg:r5-keep'))).status, 'admitted');
  const before = memory.snapshot();
  assert.ok(kJournalKeys(memory).length > 0, 'the durable journal must already hold committed K state');

  // Then: a faulted activation on the SAME physical store. Preflight passes
  // (bytes and digests are valid); only init fails — AFTER the first
  // extension initialized successfully.
  const throwing = await extensionEntry({
    fixture: 'kext-init-throws.mjs',
    hookExport: 'diagnoseRecovery',
    hook: 'recovery-diagnostics/v1',
    dependencies: [okExtension.packageId],
  });
  const { subject: faultSubject } = await buildSubject({ extensions: [okExtension, throwing], appId: 'app:r5-fault' });
  const counters = freshCounters();
  await assert.rejects(
    activateV10Subject(faultSubject, { store: memory, tenantId: TENANT, now: clock.now, counters }),
    (error: unknown) => activationCode(error) === 'V10_EXTENSION_INIT_FAILED',
  );
  assert.deepEqual(counters.initCalls, [okExtension.packageId, throwing.packageId]);
  // Reverse disposal of ONLY the initialized module.
  assert.deepEqual(counters.disposals, [okExtension.packageId]);
  // No K authority ever existed in the faulted activation.
  assert.equal(counters.runtimeFactoryInvocations, 0);
  // No false rollback and no leak writes: the physical store is byte-stable.
  assert.deepEqual(memory.snapshot(), before);
  assert.deepEqual(counters.portProbes, []);
  record('R5-init-fault', { disposals: counters.disposals, runtimeFactoryInvocations: 0, storeByteStable: true });
});

// ---------------------------------------------------------------------------
// R6 — review R1 P1 repair: real-K replay/isolation through the seam
// ---------------------------------------------------------------------------

test('R6 repair P: unchanged messageId retry reaches real K idempotent replay — zero new K activity, idempotent advisory observation', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const store = new FailTerminalEffectCompletions(memory);
  const clock = tickingClock();
  const budget = await adviceFixture();
  const recovery = await recoveryFixture();
  const { subject } = await buildSubject({ extensions: [budget, recovery] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store, tenantId: TENANT, now: clock.now, counters });

  const first = await activation.facade.send(intent('instance:r6-a', 'msg:r6-m'));
  assert.equal(first.status, 'admitted');
  assert.equal(first.budget.record, 'recorded');
  const kAfterFirst = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
  assert.equal(kAfterFirst.admissions, 1);
  assert.equal(kAfterFirst.effectDispatches, 1);

  // Unchanged retry (lost ACK / client retry) must reach the REAL kernel and
  // replay the original receipt — the advisory observation can never sit as a
  // CAS gate in front of K replay.
  const retry = await activation.facade.send(intent('instance:r6-a', 'msg:r6-m'));
  assert.equal(retry.status, 'admitted');
  assert.equal(retry.idempotentReplay, true);
  const kAfterRetry = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
  // 'admissions' counts submit ATTEMPTS at the kernel seam (the retry passed
  // through submitOccurrence); the once-only truth is the unchanged durable
  // journal/effect activity plus the replayed receipt itself.
  assert.equal(kAfterRetry.admissions, 2);
  assert.equal(kAfterRetry.journalBegins, 1);
  assert.equal(kAfterRetry.journalCompletes, 1);
  assert.equal(kAfterRetry.effectDispatches, 1);
  assert.equal((await journalRecords(memory)).length, 1);

  // The advisory observation replays idempotently under its own turn key.
  assert.equal(retry.budget.record, 'replayed');
  assert.equal(retry.budget.disposition, 'honored');
  assert.deepEqual(memory.keys().filter((key) => key.includes('kext-advisory:')), [
    advisoryDocFullPath(activation, 'instance:r6-a', 'msg:r6-m'),
  ]);
  const advisory = activation.facade.advisoryCounters;
  assert.equal(advisory.advisoryRecords, 1);
  assert.equal(advisory.advisoryRecordReplays, 1);
  assert.equal(advisory.advisoryRecordConflicts, 0);

  record('R6-retry-idempotent', {
    retryReceipt: 'idempotentReplay=true',
    submitAttempts: kAfterRetry.admissions,
    journalBegins: kAfterRetry.journalBegins,
    effectDispatches: kAfterRetry.effectDispatches,
    advisoryRecord: 'replayed',
  });
});

test('R6 repair P: a distinct authorized target reusing the same messageId admits independently — no cross-occurrence advisory collision', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const budget = await adviceFixture();
  const { subject } = await buildSubject({ extensions: [budget] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: memory, tenantId: TENANT, now: tickingClock().now, counters });

  const a = await activation.facade.send(intent('instance:r6-b1', 'msg:r6-shared'));
  assert.equal(a.status, 'admitted');
  assert.notEqual(a.idempotentReplay, true);
  const b = await activation.facade.send(intent('instance:r6-b2', 'msg:r6-shared'));
  assert.equal(b.status, 'admitted');
  assert.notEqual(b.idempotentReplay, true);

  // Distinct K identities: both admit, both dispatch their own single effect.
  const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
  assert.equal(k.admissions, 2);
  assert.equal(k.effectDispatches, 2);
  // Each turn holds its own advisory record under its own occurrence+turn key.
  assert.equal(b.budget.record, 'recorded');
  assert.deepEqual(memory.keys().filter((key) => key.includes('kext-advisory:')), [
    advisoryDocFullPath(activation, 'instance:r6-b1', 'msg:r6-shared'),
    advisoryDocFullPath(activation, 'instance:r6-b2', 'msg:r6-shared'),
  ]);
  const advisory = activation.facade.advisoryCounters;
  assert.equal(advisory.advisoryRecords, 2);
  assert.equal(advisory.advisoryRecordConflicts, 0);

  record('R6-cross-instance-reuse', {
    admissions: k.admissions,
    effectDispatches: k.effectDispatches,
    advisoryKeys: 2,
    advisoryRecordConflicts: 0,
  });
});

test('R6 repair N (gap record): same target+messageId with CHANGED input replays the original receipt — real v0.9 K does NOT detect changed-payload resubmission', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const budget = await adviceFixture();
  const { subject } = await buildSubject({ extensions: [budget] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: memory, tenantId: TENANT, now: tickingClock().now, counters });

  const original = await activation.facade.send(intent('instance:r6-c', 'msg:r6-mc', 30));
  assert.equal(original.status, 'admitted');
  assert.notEqual(original.idempotentReplay, true);

  // OBSERVED real-K behavior, recorded honestly: the durable turn identity
  // binds (kernelSha, target, messageId, intentType) and EXCLUDES the input
  // payload, so a changed-input resubmission replays the original receipt
  // with zero new activity. This test does NOT claim #1110 changed-payload
  // conflict refusal — that remains a v0.10 K02 implementation gap in the
  // selected kernel (documented in REPORT.md; no production K02 here).
  const changed = await activation.facade.send(intent('instance:r6-c', 'msg:r6-mc', 45));
  assert.equal(changed.status, 'admitted');
  assert.equal(changed.idempotentReplay, true);
  const k = activation.facade.kCounters(BUSINESS_PACKAGE_ID);
  // Two submit attempts, but only the ORIGINAL admission's durable activity.
  assert.equal(k.admissions, 2);
  assert.equal(k.journalBegins, 1);
  assert.equal(k.effectDispatches, 1);

  record('R6-changed-input-gap', {
    changedInputDetectedByRealK: false,
    observed: 'idempotent replay of the original receipt (turn identity excludes the input payload)',
    gap: '#1110 changed-payload conflict refusal is NOT implemented by the selected v0.9 kernel; v0.10 K02 obligation',
  });
});

test('R6 repair N: a conflicting pre-existing advisory record is a typed observation and never alters the authoritative ACK', async () => {
  clearEvalSentinels();
  const memory = new MemoryCasStore();
  const budget = await adviceFixture();
  const { subject } = await buildSubject({ extensions: [budget] });
  const counters = freshCounters();
  const activation = await activateV10Subject(subject, { store: memory, tenantId: TENANT, now: tickingClock().now, counters });

  // A different record already occupies this turn's advisory key (a prior
  // observation with different advice): the create must lose, surface as a
  // typed conflict observation, and leave the K receipt fully intact.
  const key = advisoryDocFullPath(activation, 'instance:r6-d', 'msg:r6-md');
  await memory.put(key, {
    turn: { workflowId: WORKFLOW_ID, instanceKey: 'instance:r6-d', messageId: 'msg:r6-md' },
    intentType: 'submitQuoteDecisionDynamic',
    providerId: 'admission-budget-advice',
    disposition: 'stale-different',
    adviceCeiling: 3,
    hardCeiling: 8,
    requestedCeiling: 8,
    effectiveCeiling: 3,
    at: '2026-10-18T00:00:00.000Z',
  }, { kind: 'create' });

  const receipt = await activation.facade.send(intent('instance:r6-d', 'msg:r6-md'));
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.budget.disposition, 'honored');
  assert.equal(receipt.budget.record, 'conflict');
  assert.equal(activation.facade.kCounters(BUSINESS_PACKAGE_ID).effectDispatches, 1);

  // The conflicting winner is never overwritten (revision still 0).
  const stored = await memory.rawGet(key);
  assert.equal(stored.value.disposition, 'stale-different');
  assert.equal(stored.revision, 0);
  assert.equal(activation.facade.advisoryCounters.advisoryRecordConflicts, 1);

  record('R6-advisory-conflict-observation', {
    ack: 'admitted, unchanged by the advisory conflict',
    advisoryRecord: 'conflict',
    winnerOverwritten: false,
  });
});

test('measurements dump (evidence materialization)', async () => {
  const dir = process.env.V10_EVIDENCE_DIR;
  if (dir === undefined || dir.length === 0) {
    return;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'measurements.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    node: process.version,
    scenarioCount: MEASUREMENTS.length,
    measurements: MEASUREMENTS,
  }, null, 2)}\n`);
});
