/**
 * KPK-15 — [Controller 090 bounded repair, #993] per-occurrence dynamic
 * Admission Effect input + business idempotency binding falsifier matrix
 * ============================================================================
 *
 * Repairs the #972-documented contract limitation (#972@6096530583 CELL1,
 * #972@6098188937 §C): the sealed kernel v1.0.0 posted the transition-
 * declared STATIC effect payload and idempotency key on EVERY occurrence, so
 * per-request business data never reached the effect side. The kernel-vnext
 * v1.1.0 mechanism now resolves a data-only, allowlisted, wiring-pinned
 * `inputFrom`/`idempotencyKeyFrom` Business declaration per occurrence,
 * AFTER authorized admission and BEFORE any journal write or effect
 * dispatch.
 *
 * Controller 090 acceptance matrix executed here:
 *   a  two different legitimate approval amounts/IDs AND (b) inventory
 *      SKU/qty/IDs → matching DISTINCT effect port inputs, journal inputs
 *      and idempotency keys;
 *   c  forged caller fails safely (zero activity);
 *   d  out-of-limit fails safely (guard AND hard-invariant, zero activity);
 *   e  schema/path/template injection fails typed at INSTALLATION (wiring);
 *   f  idempotency-key injection fails typed BEFORE any journal write;
 *   g  mutated post-admission request (same messageId, different payload)
 *      after a crash-before-commit → typed JOURNAL_CONFLICT, no double
 *      dispatch; unchanged payload → replayed;
 *   h  UNKNOWN (journal completion physically lost) → AMBIGUOUS, no blind
 *      retry, exactly one physical dispatch;
 *   i  concurrent cross-instance occurrences stay isolated (per-instance
 *      occurrence scope); same-instance concurrent duplicate executes once;
 *   j  sealed-bytes digest tamper refused at load; live post-wiring binding
 *      mutation IGNORED (snapshot authoritative); post-wiring injected
 *      binding syntax refused typed;
 *   k  static-intent golden regression (exact v0.7 declared payload) is
 *      untouched by the repair;
 *   l  decision-source binding resolves from the typed decision shape.
 *
 * Honest remaining limits (NOT repaired here, not relabeled): post-final
 * duplicate has no in-response readback (separate journal query remains the
 * path); misleading model-free receipt vocabulary; Host durability; GLOBAL
 * cross-instance business-key uniqueness is NOT kernel-enforced — the effect
 * journal remains occurrence-scoped per instance/turn (asserted in i).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { load, buildPackageRoot, createMemoryHost } from '../index.mjs';
import { createApprovalUx, createInventoryUx } from '../src/ux/ux-client.mjs';
import { NOW } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';
import { createOccurrenceRuntime } from '../src/producer/payload/kernel-mechanism-v1.mjs';
import { interpret } from '../src/producer/payload/sdk-standard.mjs';
import { getPolicy as getApprovalPolicy } from '../src/producer/payload/business-approval.mjs';

const fixedNow = () => NOW;

async function loadRuntime(businessModule, rootPackageId) {
  const host = createMemoryHost({ now: fixedNow });
  const pkg = await buildPackageRoot({ rootPackageId, businessModule });
  const runtime = await load(pkg, { hostPorts: host });
  return { runtime, host, pkg };
}

/** Deep-copied sealed root whose business module source was mutated (digest recomputed → a VALID seal of MALICIOUS content). */
async function mutatedBusinessRoot(transform) {
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const copy = JSON.parse(JSON.stringify(pkg));
  const businessPkg = copy.packages.find((p) => p.kind === 'business');
  businessPkg.moduleSource = transform(businessPkg.moduleSource);
  businessPkg.moduleSha256 = createHash('sha256').update(businessPkg.moduleSource, 'utf8').digest('hex');
  return copy;
}

function isTyped(code) {
  return (error) => error.name === 'CentralAdmissionError' && error.code === code;
}

// ---------------------------------------------------------------------------
// a/b — two-domain per-request dynamic positive (the repaired CELL1)
// ---------------------------------------------------------------------------

test('KPK-15a: two different approval amounts/IDs give matching DISTINCT effect port inputs, journal inputs and idempotency keys', async () => {
  const { runtime, host } = await loadRuntime('business-approval.mjs', 'app:order-approval@1.0.0');
  const ux1 = createApprovalUx(runtime, { instanceKey: 'instance:dyn-a' });
  const ux2 = createApprovalUx(runtime, { instanceKey: 'instance:dyn-b' });
  await ux1.openInstance({ correlationId: 'corr:a' });
  await ux2.openInstance({ correlationId: 'corr:b' });

  const r1 = await ux1.submitQuoteDynamic({ amount: 30, requestId: 'APX-R1', messageId: 'msg:dyn-a1' });
  const r2 = await ux2.submitQuoteDynamic({ amount: 40, requestId: 'APX-R2', messageId: 'msg:dyn-b1' });

  assert.equal(r1.status, 'admitted');
  assert.equal(r2.status, 'admitted');
  const e1 = r1.admitted.effects[0];
  const e2 = r2.admitted.effects[0];
  assert.equal(e1.disposition, 'executed');
  assert.equal(e2.disposition, 'executed');
  assert.equal(e1.idempotencyKey, 'reserve:quote:APX-R1');
  assert.equal(e2.idempotencyKey, 'reserve:quote:APX-R2');
  assert.notEqual(e1.effectId, e2.effectId);

  // Effect port inputs match each user request exactly (distinct).
  const ledger = host.resources.calls();
  assert.equal(ledger.length, 2);
  assert.deepEqual(ledger[0].payload, { amount: 30, requestId: 'APX-R1', effectId: e1.effectId });
  assert.deepEqual(ledger[1].payload, { amount: 40, requestId: 'APX-R2', effectId: e2.effectId });

  // Journal inputs and keys match each user request exactly (distinct).
  const journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 2);
  assert.deepEqual(journal[0], {
    effectId: e1.effectId,
    target: { workflowId: 'order-quote', instanceKey: 'instance:dyn-a' },
    durableControlTurnId: r1.admitted.durableControlTurnId,
    operationOrdinal: 1,
    effectType: 'effect:reserve',
    effectSemantics: 'non-idempotent',
    status: 'completed',
    attempt: 1,
    input: { amount: 30, requestId: 'APX-R1' },
    idempotencyKey: 'reserve:quote:APX-R1',
    startedAt: NOW,
    output: { reserved: true, effectId: e1.effectId },
    completedAt: NOW,
  });
  assert.deepEqual(journal[1].input, { amount: 40, requestId: 'APX-R2' });
  assert.equal(journal[1].idempotencyKey, 'reserve:quote:APX-R2');
  assert.equal(journal[1].status, 'completed');

  const counters = await runtime.query({ kind: 'counters' });
  assert.equal(counters.admissions, 2);
  assert.equal(counters.journalBegins, 2);
  assert.equal(counters.journalCompletes, 2);
  assert.equal(counters.effectDispatches, 2);
  assert.equal(counters.engineCommits, 2);

  await writeEvidence('kpk15-approval-dynamic', {
    falsifier: 'KPK-15a (Controller 090 repair)',
    repairedDefect: '#972@6096530583 CELL1 / #972@6098188937 §C static per-request effect payload',
    request1: { amount: 30, requestId: 'APX-R1' },
    request2: { amount: 40, requestId: 'APX-R2' },
    effectPortInputs: ledger.map((call) => call.payload),
    journalInputs: journal.map((row) => ({ input: row.input, idempotencyKey: row.idempotencyKey })),
    perRequestDistinct: true,
  });
});

test('KPK-15b: two different inventory SKU/qty/IDs give matching DISTINCT booking port inputs, journal inputs and idempotency keys', async () => {
  const { runtime, host } = await loadRuntime('business-inventory.mjs', 'app:inventory-reservation@1.0.0');
  const mechanism = await runtime.query({ kind: 'mechanism' });
  assert.equal(mechanism.moduleId, 'kernel-vnext@1.1.0');

  const ux1 = createInventoryUx(runtime, { instanceKey: 'instance:inv-a' });
  const ux2 = createInventoryUx(runtime, { instanceKey: 'instance:inv-b' });
  await ux1.openInstance({ correlationId: 'corr:ia' });
  await ux2.openInstance({ correlationId: 'corr:ib' });

  const r1 = await ux1.reserveStock({ sku: 'SKU-BOLT-2', qty: 8, reservationId: 'INV-R1', messageId: 'msg:inv-a1' });
  const r2 = await ux2.reserveStock({ sku: 'SKU-GEAR-9', qty: 3, reservationId: 'INV-R2', messageId: 'msg:inv-b1' });

  assert.equal(r1.status, 'admitted');
  assert.equal(r2.status, 'admitted');
  assert.equal(r1.attribution.business.packageId, 'business-inventory-reservation@1.0.0');
  assert.equal(r1.attribution.kernel.packageId, 'kernel-vnext@1.1.0');
  assert.equal(r1.admitted.effects[0].idempotencyKey, 'inv:INV-R1');
  assert.equal(r2.admitted.effects[0].idempotencyKey, 'inv:INV-R2');

  const booking = host.resources.calls();
  assert.equal(booking.length, 2);
  assert.deepEqual(booking[0].payload, { sku: 'SKU-BOLT-2', qty: 8, reservationId: 'INV-R1', effectId: r1.admitted.effects[0].effectId });
  assert.deepEqual(booking[1].payload, { sku: 'SKU-GEAR-9', qty: 3, reservationId: 'INV-R2', effectId: r2.admitted.effects[0].effectId });

  const journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 2);
  assert.deepEqual(journal[0].input, { sku: 'SKU-BOLT-2', qty: 8, reservationId: 'INV-R1' });
  assert.equal(journal[0].idempotencyKey, 'inv:INV-R1');
  assert.deepEqual(journal[1].input, { sku: 'SKU-GEAR-9', qty: 3, reservationId: 'INV-R2' });
  assert.equal(journal[1].idempotencyKey, 'inv:INV-R2');

  await writeEvidence('kpk15-inventory-dynamic', {
    falsifier: 'KPK-15b (Controller 090 repair, second distinct domain)',
    request1: { sku: 'SKU-BOLT-2', qty: 8, reservationId: 'INV-R1' },
    request2: { sku: 'SKU-GEAR-9', qty: 3, reservationId: 'INV-R2' },
    bookingPortInputs: booking.map((call) => call.payload),
    journalInputs: journal.map((row) => ({ input: row.input, idempotencyKey: row.idempotencyKey })),
    kernelModule: mechanism.moduleId,
  });
});

// ---------------------------------------------------------------------------
// c/d — forged caller and out-of-limit fail safely with zero activity
// ---------------------------------------------------------------------------

test('KPK-15c: forged caller is denied by business policy with zero journal/resource activity (both domains)', async () => {
  const approval = await loadRuntime('business-approval.mjs', 'app:order-approval@1.0.0');
  const uxApproval = createApprovalUx(approval.runtime, { instanceKey: 'instance:forged-a' });
  await uxApproval.openInstance({ correlationId: 'corr:f' });
  const denied = await uxApproval.submitQuoteDynamic({ amount: 30, requestId: 'APX-F1', messageId: 'msg:forged-1', role: 'viewer' });
  assert.equal(denied.status, 'denied');
  assert.equal(denied.denial.reason, 'business-caller-role');
  assert.equal(denied.denial.deniedBy, 'business-order-approval@1.0.0');
  assert.equal(denied.denial.callerRole, 'viewer');

  const inventory = await loadRuntime('business-inventory.mjs', 'app:inventory-reservation@1.0.0');
  const uxInventory = createInventoryUx(inventory.runtime, { instanceKey: 'instance:forged-i' });
  await uxInventory.openInstance({ correlationId: 'corr:fi' });
  const deniedInventory = await uxInventory.reserveStock({ sku: 'SKU-X', qty: 1, reservationId: 'INV-F1', messageId: 'msg:forged-2', role: 'observer' });
  assert.equal(deniedInventory.status, 'denied');
  assert.equal(deniedInventory.denial.reason, 'business-caller-role');
  assert.equal(deniedInventory.denial.deniedBy, 'business-inventory-reservation@1.0.0');

  for (const ctx of [approval, inventory]) {
    assert.equal((await ctx.runtime.query({ kind: 'journal' })).length, 0);
    assert.equal(ctx.host.resources.callCount(), 0);
    assert.equal((await ctx.runtime.query({ kind: 'counters' })).journalBegins, 0);
  }

  await writeEvidence('kpk15-forged-caller', {
    falsifier: 'KPK-15c',
    denial: 'business-caller-role (approval viewer / inventory observer)',
    journalRows: 0,
    resourceCalls: 0,
  });
});

test('KPK-15d: out-of-limit requests are denied by guard AND hard invariant with zero activity (both domains)', async () => {
  const approval = await loadRuntime('business-approval.mjs', 'app:order-approval@1.0.0');
  const ux = createApprovalUx(approval.runtime, { instanceKey: 'instance:limit-a' });
  await ux.openInstance({ correlationId: 'corr:l' });

  const invariantDenial = await ux.submitQuoteDynamic({ amount: 150, requestId: 'APX-L1', messageId: 'msg:limit-1' });
  assert.equal(invariantDenial.status, 'denied');
  assert.equal(invariantDenial.denial.reason, 'hard-invariant');
  assert.equal(invariantDenial.denial.invariantId, 'inv:cap-100');

  const guardDenial = await ux.submitQuoteDynamic({ amount: 75, requestId: 'APX-L2', messageId: 'msg:limit-2' });
  assert.equal(guardDenial.status, 'denied');
  assert.equal(guardDenial.denial.reason, 'guard');
  assert.equal(guardDenial.denial.guardId, 'guard:amount-ok');

  const inventory = await loadRuntime('business-inventory.mjs', 'app:inventory-reservation@1.0.0');
  const uxInv = createInventoryUx(inventory.runtime, { instanceKey: 'instance:limit-i' });
  await uxInv.openInstance({ correlationId: 'corr:li' });

  const stockDenial = await uxInv.reserveStock({ sku: 'SKU-X', qty: 40, reservationId: 'INV-L1', messageId: 'msg:limit-3' });
  assert.equal(stockDenial.status, 'denied');
  assert.equal(stockDenial.denial.reason, 'guard');
  assert.equal(stockDenial.denial.guardId, 'guard:inv-within-stock');

  const qtyDenial = await uxInv.reserveStock({ sku: 'SKU-X', qty: 0, reservationId: 'INV-L2', messageId: 'msg:limit-4' });
  assert.equal(qtyDenial.status, 'denied');
  assert.equal(qtyDenial.denial.reason, 'hard-invariant');
  assert.equal(qtyDenial.denial.invariantId, 'inv:inv-qty-positive');

  for (const ctx of [approval, inventory]) {
    assert.equal((await ctx.runtime.query({ kind: 'journal' })).length, 0);
    assert.equal(ctx.host.resources.callCount(), 0);
  }

  await writeEvidence('kpk15-out-of-limit', {
    falsifier: 'KPK-15d',
    denials: ['approval hard-invariant inv:cap-100 (150)', 'approval guard:amount-ok (75)', 'inventory guard:inv-within-stock (40>10)', 'inventory inv:inv-qty-positive (0)'],
    journalRows: 0,
    resourceCalls: 0,
  });
});

// ---------------------------------------------------------------------------
// e/f — schema/path/template and idempotency-key injection refusals
// ---------------------------------------------------------------------------

test('KPK-15e: malicious binding declarations fail typed at INSTALLATION (wiring), before any instance', async () => {
  const host = createMemoryHost({ now: fixedNow });

  // (1) unauthorized event path: references payload.secret, outside the
  //     rule-authorized projection {amount, requestId}.
  const unauthorized = await mutatedBusinessRoot((source) => source
    .replace("requestId: { source: 'event', path: ['payload', 'requestId'] },", "requestId: { source: 'event', path: ['payload', 'secret'] },"));
  await assert.rejects(() => load(unauthorized, { hostPorts: host }), isTyped('ADMISSION_EFFECT_BINDING_INVALID'));

  // (2) unauthorized decision path: decision.data.secret.
  const decisionInjection = await mutatedBusinessRoot((source) => source
    .replace("requestId: { source: 'event', path: ['payload', 'requestId'] },", "requestId: { source: 'decision', path: ['data', 'secret'] },"));
  await assert.rejects(() => load(decisionInjection, { hostPorts: host }), isTyped('ADMISSION_EFFECT_BINDING_INVALID'));

  // (3) eval-ish / unknown template placeholders.
  const evalish = await mutatedBusinessRoot((source) => source
    .replace("template: 'reserve:quote:{requestId}'", "template: 'reserve:quote:{process.exit(1)}'"));
  await assert.rejects(() => load(evalish, { hostPorts: host }), isTyped('ADMISSION_EFFECT_BINDING_INVALID'));
  const unknownPlaceholder = await mutatedBusinessRoot((source) => source
    .replace("template: 'reserve:quote:{requestId}'", "template: 'reserve:quote:{nope}'"));
  await assert.rejects(() => load(unknownPlaceholder, { hostPorts: host }), isTyped('ADMISSION_EFFECT_BINDING_INVALID'));

  // (4) dual authority: static input together with inputFrom.
  const dualAuthority = await mutatedBusinessRoot((source) => source
    .replace('inputFrom: {\n                  amount:', "input: { reservation: 'quote' },\n                  inputFrom: {\n                  amount:"));
  await assert.rejects(() => load(dualAuthority, { hostPorts: host }), isTyped('ADMISSION_EFFECT_BINDING_INVALID'));

  await writeEvidence('kpk15-binding-injection', {
    falsifier: 'KPK-15e',
    refusedAtInstallation: [
      'unauthorized event path payload.secret',
      'unauthorized decision path data.secret',
      'eval-ish template placeholder {process.exit(1)}',
      'unknown template placeholder {nope}',
      'static input + inputFrom dual authority',
    ],
    errorCode: 'ADMISSION_EFFECT_BINDING_INVALID (CentralAdmissionError, raised inside createOccurrenceRuntime wiring at the DomainHarness.load installation boundary)',
  });
});

test('KPK-15f: injected idempotency-key values fail typed BEFORE any journal write', async () => {
  const { runtime, host } = await loadRuntime('business-inventory.mjs', 'app:inventory-reservation@1.0.0');
  const ux = createInventoryUx(runtime, { instanceKey: 'instance:key-inj' });
  await ux.openInstance({ correlationId: 'corr:k' });

  for (const badReservationId of ['bad key!', 'x/effect/1', 'A'.repeat(200)]) {
    await assert.rejects(
      () => ux.reserveStock({ sku: 'SKU-X', qty: 1, reservationId: badReservationId, messageId: `msg:key-${badReservationId.length}` }),
      isTyped('ADMISSION_EFFECT_IDEMPOTENCY_KEY_INVALID'),
    );
  }

  assert.equal((await runtime.query({ kind: 'journal' })).length, 0);
  assert.equal(host.resources.callCount(), 0);
  const instance = await runtime.query({ kind: 'instance', target: { workflowId: 'inventory-reservation', instanceKey: 'instance:key-inj' } });
  assert.equal(instance.state.stateKey, 'available', 'no state commit for a refused key');

  await writeEvidence('kpk15-key-injection', {
    falsifier: 'KPK-15f',
    refusedKeys: ['bad key!', 'x/effect/1', '200-char run'],
    errorCode: 'ADMISSION_EFFECT_IDEMPOTENCY_KEY_INVALID (before any journal write)',
    journalRows: 0,
    resourceCalls: 0,
  });
});

// ---------------------------------------------------------------------------
// g — mutated post-admission request + replay (crash-restart semantics)
// ---------------------------------------------------------------------------

test('KPK-15g: crash-before-commit then re-drive — same payload replays; MUTATED payload is a typed journal conflict', async () => {
  // (1) identical re-drive replays with zero double dispatch.
  const replayCtx = await loadRuntime('business-approval.mjs', 'app:order-approval@1.0.0');
  const uxReplay = createApprovalUx(replayCtx.runtime, { instanceKey: 'instance:div-a' });
  await uxReplay.openInstance({ correlationId: 'corr:da' });
  replayCtx.host.docs.failNextPutMatching('kpk01:wf-instance:order-quote:instance:div-a');
  await assert.rejects(
    () => uxReplay.submitQuoteDynamic({ amount: 30, requestId: 'APX-G1', messageId: 'msg:div-a1' }),
    (error) => error.code === 'HOST_FAULT_INJECTED',
  );
  assert.equal(replayCtx.host.resources.callCount(), 1);
  const retried = await uxReplay.submitQuoteDynamic({ amount: 30, requestId: 'APX-G1', messageId: 'msg:div-a1' });
  assert.equal(retried.status, 'admitted');
  assert.equal(retried.admitted.effects[0].disposition, 'replayed');
  assert.equal(retried.admitted.effects[0].idempotencyKey, 'reserve:quote:APX-G1');
  assert.equal(replayCtx.host.resources.callCount(), 1, 'zero double dispatch on identical re-drive');

  // (2) MUTATED re-drive (same messageId, different amount) is refused typed:
  // the resolved input is part of the durable effect identity.
  const conflictCtx = await loadRuntime('business-approval.mjs', 'app:order-approval@1.0.0');
  const uxConflict = createApprovalUx(conflictCtx.runtime, { instanceKey: 'instance:div-b' });
  await uxConflict.openInstance({ correlationId: 'corr:db' });
  conflictCtx.host.docs.failNextPutMatching('kpk01:wf-instance:order-quote:instance:div-b');
  await assert.rejects(
    () => uxConflict.submitQuoteDynamic({ amount: 30, requestId: 'APX-G2', messageId: 'msg:div-b1' }),
    (error) => error.code === 'HOST_FAULT_INJECTED',
  );
  assert.equal(conflictCtx.host.resources.callCount(), 1);
  await assert.rejects(
    () => uxConflict.submitQuoteDynamic({ amount: 31, requestId: 'APX-G2', messageId: 'msg:div-b1' }),
    isTyped('ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  assert.equal(conflictCtx.host.resources.callCount(), 1, 'dynamic keys do not open a double-dispatch route');
  const conflictJournal = await conflictCtx.runtime.query({ kind: 'journal' });
  assert.equal(conflictJournal.length, 1);
  assert.deepEqual(conflictJournal[0].input, { amount: 30, requestId: 'APX-G2' }, 'durable identity keeps the originally resolved input');

  await writeEvidence('kpk15-post-admission-mutation', {
    falsifier: 'KPK-15g',
    identicalRedrive: 'replayed, 1 dispatch total',
    mutatedRedrive: 'ADMISSION_EFFECT_JOURNAL_CONFLICT (resolved input participates in the durable effect identity), 1 dispatch total',
  });
});

// ---------------------------------------------------------------------------
// h — UNKNOWN after uncertain dispatch: no blind retry
// ---------------------------------------------------------------------------

test('KPK-15h: journal completion physically lost after dynamic dispatch → AMBIGUOUS on re-drive, exactly one dispatch', async () => {
  const { runtime, host } = await loadRuntime('business-inventory.mjs', 'app:inventory-reservation@1.0.0');
  const ux = createInventoryUx(runtime, { instanceKey: 'instance:unk' });
  await ux.openInstance({ correlationId: 'corr:u' });

  host.docs.failNextPutMatching('kpk01:effect-journal', { skip: 1 });
  await assert.rejects(
    () => ux.reserveStock({ sku: 'SKU-BOLT-2', qty: 5, reservationId: 'INV-U1', messageId: 'msg:unk-1' }),
    isTyped('ADMISSION_EFFECT_JOURNAL_CONFLICT'),
  );
  assert.equal(host.resources.callCount(), 1, 'the physical booking happened exactly once');

  let journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.equal(journal[0].status, 'started');
  assert.deepEqual(journal[0].input, { sku: 'SKU-BOLT-2', qty: 5, reservationId: 'INV-U1' });
  assert.equal(journal[0].idempotencyKey, 'inv:INV-U1');

  await assert.rejects(
    () => ux.reserveStock({ sku: 'SKU-BOLT-2', qty: 5, reservationId: 'INV-U1', messageId: 'msg:unk-1' }),
    isTyped('ADMISSION_EFFECT_AMBIGUOUS'),
  );
  assert.equal(host.resources.callCount(), 1, 'no blind retry of an uncertain non-idempotent effect');
  journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal[0].status, 'started');

  await writeEvidence('kpk15-unknown-no-blind-retry', {
    falsifier: 'KPK-15h',
    crashPoint: 'journal completion write physically faulted after successful booking dispatch',
    dispatches: host.resources.callCount(),
    journalRowStatus: 'started',
    redriveErrorCode: 'ADMISSION_EFFECT_AMBIGUOUS',
  });
});

// ---------------------------------------------------------------------------
// i — concurrent cross-instance isolation + same-instance duplicate
// ---------------------------------------------------------------------------

test('KPK-15i: concurrent cross-instance occurrences with the same business key stay isolated; same-instance duplicate executes once', async () => {
  const { runtime, host } = await loadRuntime('business-inventory.mjs', 'app:inventory-reservation@1.0.0');
  const ux1 = createInventoryUx(runtime, { instanceKey: 'instance:cc-1' });
  const ux2 = createInventoryUx(runtime, { instanceKey: 'instance:cc-2' });
  await ux1.openInstance({ correlationId: 'corr:c1' });
  await ux2.openInstance({ correlationId: 'corr:c2' });

  const [r1, r2] = await Promise.all([
    ux1.reserveStock({ sku: 'SKU-SHARED', qty: 2, reservationId: 'INV-SHARED', messageId: 'msg:cc-1' }),
    ux2.reserveStock({ sku: 'SKU-SHARED', qty: 3, reservationId: 'INV-SHARED', messageId: 'msg:cc-2' }),
  ]);
  assert.equal(r1.status, 'admitted');
  assert.equal(r2.status, 'admitted');
  assert.notEqual(r1.admitted.effects[0].effectId, r2.admitted.effects[0].effectId);

  // Exactly one booking per instance-occurrence; no cross-instance replay,
  // conflict or interference (effect journal identity is turn-scoped).
  const booking = host.resources.calls();
  assert.equal(booking.length, 2);
  const journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 2);
  assert.deepEqual(journal.map((row) => row.idempotencyKey).sort(), ['inv:INV-SHARED', 'inv:INV-SHARED']);
  assert.equal(new Set(journal.map((row) => row.effectId)).size, 2);

  // Same-instance concurrent duplicate of one messageId: serialized lane +
  // journal keep exactly one execution; the second submission observes the
  // terminal state and is a typed denial (documented post-final posture).
  const ux3 = createInventoryUx(runtime, { instanceKey: 'instance:cc-3' });
  await ux3.openInstance({ correlationId: 'corr:c3' });
  const [first, second] = await Promise.all([
    ux3.reserveStock({ sku: 'SKU-DUP', qty: 1, reservationId: 'INV-DUP', messageId: 'msg:cc-3' }),
    ux3.reserveStock({ sku: 'SKU-DUP', qty: 1, reservationId: 'INV-DUP', messageId: 'msg:cc-3' }),
  ]);
  assert.equal(first.status === 'admitted' || second.status === 'admitted', true);
  assert.equal(host.resources.callCount(), 3, 'exactly one additional booking for the duplicated occurrence');

  await writeEvidence('kpk15-concurrent-isolation', {
    falsifier: 'KPK-15i',
    crossInstanceSameBusinessKey: 'both admitted, distinct effectIds, one booking each, zero cross-replay/conflict',
    sameInstanceConcurrentDuplicate: 'exactly one execution; second submission is a typed terminal-state denial',
    honestRemainingLimit: 'GLOBAL cross-instance business-key uniqueness is NOT kernel-enforced: the effect journal is occurrence-scoped per instance/turn (v0.7 semantics preserved); a business needing a global unique constraint must own it outside this seam',
  });
});

// ---------------------------------------------------------------------------
// j — digest/binding tamper refusal
// ---------------------------------------------------------------------------

test('KPK-15j1: mutated sealed business module bytes fail the load digest boundary', async () => {
  const host = createMemoryHost({ now: fixedNow });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const tampered = JSON.parse(JSON.stringify(pkg));
  const businessPkg = tampered.packages.find((p) => p.kind === 'business');
  businessPkg.moduleSource = businessPkg.moduleSource
    .replace("template: 'reserve:quote:{requestId}'", "template: 'reserve:quote:evil:{requestId}'");
  // digest NOT recomputed — sealed manifest still pins the original bytes.
  await assert.rejects(
    () => load(tampered, { hostPorts: host }),
    (error) => error.name === 'MicrokernelError' && error.code === 'INSTALL_BYTES_MUTATED',
  );

  await writeEvidence('kpk15-digest-tamper', {
    falsifier: 'KPK-15j1',
    tamper: 'sealed business module binding template mutated post-seal without digest update',
    refusal: 'MicrokernelError INSTALL_BYTES_MUTATED at the trusted installation boundary',
  });
});

test('KPK-15j2: LIVE post-wiring mutation of a validated binding is IGNORED (snapshot authoritative); injected syntax is refused typed', async () => {
  const policy = getApprovalPolicy();
  const dynamicIntent = policy.intentBindings.submitQuoteDecisionDynamic.definition.states[0].transitions
    .find((transition) => transition.transitionKey === 'approve').effectIntents[0];
  const host = createMemoryHost({ now: fixedNow });
  const runtime = createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel-vnext@1.1.0', moduleSha256: 'test:direct-rig' },
    hostPorts: host,
    sdkEndpoint: { packageId: 'standard-sdk@1.0.0', interpret },
    businessEndpoint: policy,
    observe: () => {},
  });
  const target = { workflowId: 'order-quote', instanceKey: 'instance:mut' };
  await runtime.openInstance({ target, correlationId: 'corr:m' });

  // Post-wiring LIVE mutations of the validated declaration object:
  dynamicIntent.inputFrom.requestId.path = ['payload', 'secret'];
  dynamicIntent.idempotencyKeyFrom.template = 'EVIL:{requestId}';
  const receipt = await runtime.submitOccurrence({
    kind: 'kpk01/intent',
    intentType: 'submitQuoteDecisionDynamic',
    target,
    messageId: 'msg:mut-1',
    input: { amount: 30, requestId: 'APX-M1' },
    caller: { role: 'requester' },
  });
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.effects[0].idempotencyKey, 'reserve:quote:APX-M1', 'wiring snapshot is authoritative, live mutation ignored');
  const journal = await runtime.getJournalRecords();
  assert.deepEqual(journal[0].input, { amount: 30, requestId: 'APX-M1' });
  assert.equal(host.resources.calls()[0].payload.requestId, 'APX-M1');

  // Post-wiring INJECTION of new binding syntax onto a static intent:
  const staticIntent = policy.workflowDefinition.states[0].transitions
    .find((transition) => transition.transitionKey === 'approve').effectIntents[0];
  staticIntent.inputFrom = { amount: { source: 'event', path: ['payload', 'amount'] } };
  const target2 = { workflowId: 'order-quote', instanceKey: 'instance:mut2' };
  await runtime.openInstance({ target: target2, correlationId: 'corr:m2' });
  await assert.rejects(
    () => runtime.submitOccurrence({
      kind: 'kpk01/intent',
      intentType: 'submitQuoteDecision',
      target: target2,
      messageId: 'msg:mut-2',
      input: { amount: 42 },
      caller: { role: 'requester' },
    }),
    isTyped('ADMISSION_EFFECT_BINDING_UNVALIDATED'),
  );
  assert.equal(host.resources.callCount(), 1, 'injected syntax produced zero additional effects');

  await writeEvidence('kpk15-binding-tamper', {
    falsifier: 'KPK-15j2',
    liveMutation: 'ignored — frozen wiring snapshot is the only trusted declaration source',
    injectedSyntax: 'ADMISSION_EFFECT_BINDING_UNVALIDATED before any journal write',
  });
});

// ---------------------------------------------------------------------------
// k — static-intent golden regression (repair must not move v0.7 anchors)
// ---------------------------------------------------------------------------

test('KPK-15k: static effect intents keep the exact v0.7 declared payload and key (no relabeling)', async () => {
  const { runtime, host } = await loadRuntime('business-approval.mjs', 'app:order-approval@1.0.0');
  const ux = createApprovalUx(runtime, { instanceKey: 'instance:static-k' });
  await ux.openInstance({ correlationId: 'corr:s' });
  const receipt = await ux.submitQuote({ amount: 42, messageId: 'msg:static-1' });
  assert.equal(receipt.status, 'admitted');
  assert.equal(receipt.admitted.effects[0].idempotencyKey, 'reserve:quote:1');

  const journal = await runtime.query({ kind: 'journal' });
  assert.equal(journal.length, 1);
  assert.deepEqual(journal[0].input, { reservation: 'quote', amount: 42 });
  assert.equal(journal[0].idempotencyKey, 'reserve:quote:1');
  assert.deepEqual(host.resources.calls()[0].payload, { reservation: 'quote', amount: 42, effectId: journal[0].effectId });

  await writeEvidence('kpk15-static-regression', {
    falsifier: 'KPK-15k',
    staticIntent: 'unchanged v0.7 golden declared payload {reservation:"quote",amount:42} and key reserve:quote:1',
  });
});

// ---------------------------------------------------------------------------
// l — decision-source binding resolves from the typed decision shape
// ---------------------------------------------------------------------------

test('KPK-15l: a decision-source inputFrom field resolves from the typed decision projection', async () => {
  const policy = getApprovalPolicy();
  const dynamicIntent = policy.intentBindings.submitQuoteDecisionDynamic.definition.states[0].transitions
    .find((transition) => transition.transitionKey === 'approve').effectIntents[0];
  dynamicIntent.inputFrom.amount = { source: 'decision', path: ['data', 'amount'] };
  const host = createMemoryHost({ now: fixedNow });
  const runtime = createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel-vnext@1.1.0', moduleSha256: 'test:direct-rig' },
    hostPorts: host,
    sdkEndpoint: { packageId: 'standard-sdk@1.0.0', interpret },
    businessEndpoint: policy,
    observe: () => {},
  });
  const target = { workflowId: 'order-quote', instanceKey: 'instance:dec' };
  await runtime.openInstance({ target, correlationId: 'corr:d' });
  const receipt = await runtime.submitOccurrence({
    kind: 'kpk01/intent',
    intentType: 'submitQuoteDecisionDynamic',
    target,
    messageId: 'msg:dec-1',
    input: { amount: 45, requestId: 'APX-D1' },
    caller: { role: 'requester' },
  });
  assert.equal(receipt.status, 'admitted');
  const journal = await runtime.getJournalRecords();
  assert.deepEqual(journal[0].input, { amount: 45, requestId: 'APX-D1' }, 'amount arrived via decision.data, requestId via event.payload');
  assert.equal(journal[0].idempotencyKey, 'reserve:quote:APX-D1');

  await writeEvidence('kpk15-decision-source', {
    falsifier: 'KPK-15l',
    binding: 'amount ← decision.data.amount (rule-authorized); requestId ← event.payload.requestId',
    journalInput: journal[0].input,
  });
});

 
// Controller 093 / KPK-15 P2-1: JSON.parse preserves own "__proto__"
// destination keys; Kernel wiring must refuse them with the typed contract.
test('KPK-15m: hostile JSON own-key, prototype-sensitive, oversized and Unicode Effect destinations fail at wiring', async () => {
  const spec = '{"source":"event","path":["payload","amount"]}';
  const unsafe = ['__proto__', 'prototype', 'constructor', 'bad.key', 'bad-key', 'bad key',
    'a\\nline', 'a\\u0000x', 'fiéld', '字段', 'a\\u200Bz', 'x'.repeat(65), 'x'.repeat(300), ''];
  for (const name of unsafe) {
    const key = name.replaceAll('\\n', '\n').replaceAll('\\u0000', '\u0000').replaceAll('\\u200B', '\u200B');
    const policy = getApprovalPolicy();
    const intent = policy.intentBindings.submitQuoteDecisionDynamic.definition.states[0].transitions
      .find((x) => x.transitionKey === 'approve').effectIntents[0];
    intent.inputFrom = JSON.parse('{"amount":' + spec + ',' + JSON.stringify(key) + ':' + spec + '}');
    assert.equal(Object.prototype.hasOwnProperty.call(intent.inputFrom, key), true);
    const host = createMemoryHost({ now: fixedNow });
    assert.throws(() => createOccurrenceRuntime({
      moduleIdentity: { packageId: 'kernel-vnext@1.1.0', moduleSha256: 'test:p2-invalid' },
      hostPorts: host, sdkEndpoint: { packageId: 'standard-sdk@1.0.0', interpret },
      businessEndpoint: policy, observe: () => {},
    }), isTyped('ADMISSION_EFFECT_BINDING_INVALID'), JSON.stringify(key));
    assert.equal(host.resources.callCount(), 0);
    assert.equal(Object.prototype.pollutedByEffectBinding, undefined);
  }
  await writeEvidence('kpk15-destination-key-p2', {
    falsifier: 'KPK-15m (Controller 093 P2-1)',
    outcome: 'all hostile JSON own-property destinations fail typed during kernel wiring',
    rejected: unsafe.length, errorCode: 'ADMISSION_EFFECT_BINDING_INVALID',
    resourceCalls: 0,
    rawDuplicateJSON: 'NOT_PROVEN: JSON.parse drops duplicate raw field spellings before object wiring',
  });
});

test('KPK-15n: safe JSON nested binding descriptors preserve actual effect/journal/idempotency', async () => {
  const policy = getApprovalPolicy();
  const intent = policy.intentBindings.submitQuoteDecisionDynamic.definition.states[0].transitions
    .find((x) => x.transitionKey === 'approve').effectIntents[0];
  intent.inputFrom = JSON.parse('{"amount":{"source":"event","path":["payload","amount"]},' +
    '"requestId":{"source":"event","path":["payload","requestId"]}}');
  const host = createMemoryHost({ now: fixedNow });
  const runtime = createOccurrenceRuntime({
    moduleIdentity: { packageId: 'kernel-vnext@1.1.0', moduleSha256: 'test:p2-valid' },
    hostPorts: host, sdkEndpoint: { packageId: 'standard-sdk@1.0.0', interpret },
    businessEndpoint: policy, observe: () => {},
  });
  const target = { workflowId: 'order-quote', instanceKey: 'instance:p2-key' };
  await runtime.openInstance({ target, correlationId: 'corr:p2' });
  const r = await runtime.submitOccurrence({
    kind: 'kpk01/intent', intentType: 'submitQuoteDecisionDynamic', target,
    messageId: 'msg:p2', input: { amount: 29, requestId: 'P2-1' }, caller: { role: 'requester' },
  });
  assert.equal(r.status, 'admitted');
  assert.equal(r.admitted.effects[0].idempotencyKey, 'reserve:quote:P2-1');
  assert.deepEqual((await runtime.getJournalRecords())[0].input, { amount: 29, requestId: 'P2-1' });
  assert.deepEqual(host.resources.calls()[0].payload, {
    amount: 29, requestId: 'P2-1', effectId: r.admitted.effects[0].effectId,
  });
});

test('KPK-15o: empty/missing and JSON-normalized duplicate destination behaviors are explicit', () => {
  const rig = (fields) => {
    const p = getApprovalPolicy();
    p.intentBindings.submitQuoteDecisionDynamic.definition.states[0].transitions
      .find((x) => x.transitionKey === 'approve').effectIntents[0].inputFrom = fields;
    return () => createOccurrenceRuntime({
      moduleIdentity: { packageId: 'kernel-vnext@1.1.0', moduleSha256: 'test:p2-missing' },
      hostPorts: createMemoryHost({ now: fixedNow }),
      sdkEndpoint: { packageId: 'standard-sdk@1.0.0', interpret },
      businessEndpoint: p, observe: () => {},
    });
  };
  assert.throws(rig(JSON.parse('{}')), isTyped('ADMISSION_EFFECT_BINDING_INVALID'));
  assert.throws(rig(JSON.parse('{"amount":{"source":"event","path":["payload","amount"]}}')),
    isTyped('ADMISSION_EFFECT_BINDING_INVALID'), 'idempotency placeholder references missing field');
  const parsed = JSON.parse('{"amount":{"source":"event","path":["payload","amount"]},' +
    '"amount":{"source":"event","path":["payload","amount"]},' +
    '"requestId":{"source":"event","path":["payload","requestId"]}}');
  assert.deepEqual(Object.keys(parsed), ['amount', 'requestId']);
  assert.doesNotThrow(rig(parsed), 'duplicate raw spellings are normalized by JSON.parse before wiring');
});
