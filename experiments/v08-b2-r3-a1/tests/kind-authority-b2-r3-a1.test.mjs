// #984 V08-B2-R3-A1: executable A3 matrix — trust-preserving physical→native
// projection (P1-02) + non-overridable Host authority ports (P1-03).
// Research-only tests; the ORIGINAL v0.7 Central Admission + its Journal stay
// the ONE effect authority. Every negative runs on a FRESH native occurrence.
//
// Derived from experiments/v08-gatea-repair-942/tests/kind-authority-b2-r2.test.mjs
// at base SHA e11a0510134903d6f05a20dd024f3740429edc33 (fixture candidate()
// construction and B2 physical profile bytes are reused verbatim from there
// and additionally attributed; the R2 fixture occurrence is NOT reused — A1
// arms its own occurrence bound to the real physical package identity).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createFixture } from '../../v08-gatea-b1-955-r2/tests/fixtures.mjs';
import { establishTrustedB1Host } from '../../v08-gatea-b1-955-r2/bridge/attested-binding.mjs';
import { packageDigest, hashBytes } from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
import { establishTrustedPackageKindHost } from '../../v08-gatea-repair-942/package-kind/host.mjs';
import {
  projectPhysicalComponentToNative,
  deriveNativeEffectType,
} from '../authority/native-projection.mjs';
import {
  bindProjectedPhysicalToNativeAuthority,
  createNativeAuthorityHostForTrustedResearch,
} from '../authority/native-authority-host.mjs';

const sha = (x) => createHash('sha256').update(x).digest('hex');

// Physical B profiles. 'physical-charge' is the R2 profile reused verbatim
// (attributed to e11a051); 'foreign-charge' and the options below are new.
const profiles = [
  { id: 'workflow-old', kind: 'demo.approval', component: 'flow.old',
    impl: 'impl.flow.old', op: 'run', effect: 'none', threshold: 70,
    result: 'APPROVED', fallback: 'WAIT', cap: 'flow.evaluate',
    body: "export const kindValidators={'demo.approval@1.0.0':({semanticBody:b})=>{if(b.threshold!==70)throw Error('bad');}};export const implementations={'impl.flow.old':b=>({run:({score})=>({status:score>=b.threshold?'APPROVED':'WAIT',source:'old'})})};" },
  { id: 'physical-charge', kind: 'demo.native-charge', component: 'tool.physical',
    impl: 'impl.charge.physical', op: 'op.charge', effect: 'non-idempotent',
    threshold: 42, cap: 'cap.charge',
    body: "export const kindValidators={'demo.native-charge@1.0.0':({semanticBody:b})=>{if(b.threshold!==42)throw Error('bad');}};export const implementations={'impl.charge.physical':b=>({'op.charge':({amount})=>({charged:amount===b.threshold,fromPhysicalB:true})})};" },
  { id: 'foreign-charge', kind: 'demo.foreign-charge', component: 'tool.foreign',
    impl: 'impl.charge.foreign', op: 'op.charge.foreign', effect: 'non-idempotent',
    threshold: 7, cap: 'cap.foreign',
    body: "export const kindValidators={'demo.foreign-charge@1.0.0':({semanticBody:b})=>{if(b.threshold!==7)throw Error('bad');}};export const implementations={'impl.charge.foreign':b=>({'op.charge.foreign':({amount})=>({charged:amount===b.threshold,fromForeign:true})})};" },
];

function candidate(p) {
  const component = { schemaVersion: 'ucb/1', componentId: p.component, packageId: p.id,
    kindRef: { kindId: p.kind, version: '1.0.0' }, semanticBody: { threshold: p.threshold },
    requiredSemanticContracts: [], requiresCapabilities: [],
    providesCapabilities: [{ capabilityId: p.cap, version: '1.0.0', operations: [p.op] }],
    relations: [], operations: [{ operationId: p.op, inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
      failures: [], effect: p.effect, callers: ['business'], exposure: 'internal' }] };
  const m = { formatVersion: 'dhpkg/0.8-candidate-1', packageId: p.id, packageVersion: '1.0.0',
    targetAbi: 'dh.node22/1', hostRequirements: [], dependencies: [], imports: [], exports: [p.component],
    components: [component], implementations: [{ implementationId: p.impl,
      componentId: p.component, path: 'modules/impl.mjs',
      sha256: 'sha256:' + hashBytes(Buffer.from(p.body)) }], integrity: '' };
  m.integrity = packageDigest(m, { 'modules/impl.mjs': p.body });
  return { bCandidate: m, bKinds: [{ kindId: p.kind, version: '1.0.0', componentId: p.component,
    implementationId: p.impl, operationId: p.op }], moduleSha256: 'sha256:' + sha(p.body) };
}

async function prepare() {
  const base = await createFixture();
  const root = await mkdtemp(join(tmpdir(), 'v08-b2-r3-a1-'));
  const pins = {};
  for (const p of profiles) {
    await mkdir(join(root, p.id, 'modules'), { recursive: true });
    const data = JSON.stringify(candidate(p), null, 2) + '\n';
    await writeFile(join(root, p.id, 'manifest.json'), data);
    await writeFile(join(root, p.id, 'modules', 'impl.mjs'), p.body);
    pins[p.id] = { manifestSha256: sha(data), moduleSha256: sha(p.body), packageVersion: '1.0.0' };
  }
  const b1Host = establishTrustedB1Host({ root: base.root, approvedPins: base.pins });
  const host = establishTrustedPackageKindHost({ root, approvedPins: pins, b1Host });
  const select = (p) => ({ packageId: p.id, componentId: p.component,
    kindRef: { kindId: p.kind, version: '1.0.0' } });
  return { root, pins, host, select, base, b1Host };
}

let ordinalCounter = 0;
const nextOrdinal = () => ordinalCounter += 1;
const ARMED = Object.freeze({ amount: 42 });
const ARMED_FOREIGN = Object.freeze({ amount: 7 });
const AUTHORIZED = Object.freeze([{ callerId: 'caller.session-1', callerKind: 'business' }]);

async function buildResearchHost(fx, overrides = {}) {
  return createNativeAuthorityHostForTrustedResearch({
    trustedBHost: fx.host,
    selector: fx.select(profiles[1]),
    armedIntentInput: ARMED,
    authorizedCallers: AUTHORIZED,
    instanceOrdinal: nextOrdinal(),
    ...overrides,
  });
}

const armedInvoke = (facade) => facade.invoke({
  input: { ...ARMED }, caller: { callerId: 'caller.session-1', callerKind: 'business' },
});

function rejectsCode(code) {
  return (e) => {
    assert.equal(e?.code, code, 'expected ' + code + ', got ' + String(e) + ' :: ' + String(e?.message));
    return true;
  };
}

/** Every denial: typed rejection + 0 unauthorized dispatch + 0 journal effect rows. */
function assertNoEffect(host, completedBefore = 0) {
  assert.equal(host.facade.getDispatchCount(), 0, 'unauthorized dispatch happened');
  assert.equal(host.facade.journalCompletedCount(), completedBefore, 'journal effect row appeared');
}

// ---------------------------------------------------------------------------
// P1-02: trust-preserving projection + trusted Host policy + real identity
// ---------------------------------------------------------------------------

test('A1 P1-02: projection preserves physical identity, semantic contract, caller/exposure/failure scope verbatim and the Kind validator is real', async () => {
  const fx = await prepare();
  const host = await buildResearchHost(fx);
  const d = host.facade.describe();
  // Real physical B package identity (NOT the fixture pkg-orders-1 identity).
  assert.equal(d.packageId, 'physical-charge');
  assert.equal(d.domainId, 'physical-charge');
  assert.ok(d.occurrenceId.startsWith('physical-charge.op.charge:instance:'));
  assert.equal(d.effectType, 'effect:physical-charge.op.charge'); // derived from binding facts
  assert.equal(d.derivedFromBase, 'e11a0510134903d6f05a20dd024f3740429edc33');
  assert.equal(d.callerScope.join(','), 'business');
  assert.equal(d.occurrencePin.authorityClass, 'PRODUCTION'); // real T002D pin
  assert.equal(d.occurrencePin.assemblyDigest, d.assemblyDigest);
  assert.equal(d.moduleSha256, 'sha256:' + fx.pins['physical-charge'].moduleSha256);
  assert.equal(d.manifestSha256, fx.pins['physical-charge'].manifestSha256);

  const projected = host.trustedResearchPort.internals.projected;
  // The v0.7 Tool semanticBody is a closed shape; the attested physical byte
  // identity travels in the Host-owned provenance export (describe/attested)
  // and in the T003C pin digest, never as an invented envelope field.
  assert.equal(projected.attested.packageId, 'physical-charge');
  assert.equal(projected.nativeTool.componentId, 'tool.physical');
  assert.deepEqual(projected.nativeTool.kind, { kindId: 'demo.native-charge', version: '1.0.0' });
  // Full caller/exposure/failure scope preserved under the explicit mapping.
  const op = projected.projectedOperation;
  assert.deepEqual(op.declaredExposure, { exposure: 'internal', callers: ['business'] });
  assert.deepEqual(op.declaredFailures, []);
  assert.equal(op.effect, 'non-idempotent');
  assert.equal(op.operationId, 'op.charge');
  // Consumed capabilities preserved as exact v0.7 refs (never invented/widened).
  assert.deepEqual(projected.nativeTool.requiredCapabilities, []);
  assert.deepEqual(projected.consumedCapabilities, []);
  // REAL validator (not the R2 empty function): attested passes, drift throws.
  const validator = projected.kindImplementation.validateComponent;
  validator(projected.nativeTool); // must not throw
  assert.throws(() => validator({ ...projected.nativeTool, componentId: 'tool.foreign' }),
    rejectsCode('E_PROJECTION_VALIDATOR_IDENTITY'));
  const mutated = JSON.parse(JSON.stringify(projected.nativeTool));
  mutated.semanticBody.operations[0].effect = 'idempotent';
  assert.throws(() => validator(mutated), rejectsCode('E_PROJECTION_VALIDATOR_CONTRACT'));
  const widened = JSON.parse(JSON.stringify(projected.nativeTool));
  widened.requiredCapabilities.push({ capabilityId: 'cap.extra', version: '1.0.0' });
  assert.throws(() => validator(widened), rejectsCode('E_PROJECTION_VALIDATOR_CONTRACT'));
  // REAL T003C binding mint over the exact attested bytes/handle.
  const binding = host.trustedResearchPort.internals.binding;
  assert.equal(binding.evidence.implementation.implementationDigest,
    'sha256:' + fx.pins['physical-charge'].moduleSha256);
  assert.equal(binding.evidence.implementation.implementationId, 'impl.charge.physical');
  assert.equal(binding.implementationHandle, host.trustedResearchPort.internals.handler);
  // Policy bound to the exact occurrence/domain/package tuple.
  const expected = host.trustedResearchPort.internals.policy.expected;
  assert.equal(expected.domainId, 'physical-charge');
  assert.equal(expected.packageId, 'physical-charge');
  assert.equal(expected.occurrenceId, d.occurrencePin.workflowInstanceId);
  assert.equal(expected.effectType, 'effect:physical-charge.op.charge');
});

test('A1 P1-02: authorized flow = ONE real dispatch + ONE completed record on the ORIGINAL journal; same-occurrence replay adds zero', async () => {
  const fx = await prepare();
  const host = await buildResearchHost(fx);
  const result = await armedInvoke(host.facade);
  assert.equal(result.outcome.status, 'admitted');
  assert.equal(result.outcome.admitted.effects.length, 1);
  assert.equal(result.outcome.admitted.effects[0].effectType, 'effect:physical-charge.op.charge');
  assert.equal(result.outcome.admitted.effects[0].disposition, 'executed');
  assert.deepEqual(result.outcome.admitted.effects[0].output, { charged: true, fromPhysicalB: true });
  assert.equal(result.invocation.implementation.implementationDigest,
    'sha256:' + fx.pins['physical-charge'].moduleSha256);
  assert.equal(result.invocation.effectType, 'effect:physical-charge.op.charge');
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.ok(result.occurrence.workflowInstanceId.startsWith('physical-charge.op.charge:instance:'));
  assert.equal(host.facade.getDispatchCount(), 1);
  const records = host.facade.journalRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'completed');
  assert.equal(records[0].effectType, 'effect:physical-charge.op.charge');
  assert.equal(host.facade.journalCompletedCount(), 1);
  assert.equal(host.facade.policyStats().decisions >= 1, true);
  assert.equal(host.facade.policyStats().denials.length, 0);
  // Same-occurrence replay through the ORIGINAL admission: zero additional.
  const replay = await armedInvoke(host.facade);
  assert.equal(replay.outcome.status, 'admitted');
  assert.equal(replay.outcome.admitted.effects[0].disposition, 'replayed');
  assert.equal(host.facade.getDispatchCount(), 1);
  assert.equal(host.facade.journalRecords().length, 1);
  assert.equal(host.facade.journalCompletedCount(), 1);
});

test('A1 P1-02: effect type and occurrence identity derive from binding facts, never hardcoded and never the fixture identity', async () => {
  const fx = await prepare();
  const physical = JSON.parse(JSON.stringify((await buildResearchHost(fx)).trustedResearchPort.internals.physical));
  physical.handler = async () => ({});
  assert.equal(deriveNativeEffectType(physical), 'effect:physical-charge.op.charge');
  const foreign = JSON.parse(JSON.stringify((await buildResearchHost(fx, {
    selector: fx.select(profiles[2]),
    armedIntentInput: ARMED_FOREIGN,
  })).trustedResearchPort.internals.physical));
  foreign.handler = async () => ({});
  assert.equal(deriveNativeEffectType(foreign), 'effect:foreign-charge.op.charge.foreign');
});

// ---------------------------------------------------------------------------
// P1-03: non-overridable Host authority ports (public façade is closed)
// ---------------------------------------------------------------------------

const FORGED_AUTHORITY_KEYS = [
  'dispatch', 'admissionPorts', 'effectJournal', 'activator', 'sha256',
  'effectType', 'binding', 'request', 'admissionRequest', 'currentDefinitionGraph',
  'resourceProvider', 'effectAuthority', 'effectTools', 'policy', 'exposure',
];

test('A1 P1-03: public façade accepts ONLY the closed business input set; every forged authority key is typed-rejected before admission', async () => {
  const forged = { forged: true, invoke() { throw Error('forged authority'); } };
  for (const key of FORGED_AUTHORITY_KEYS) {
    const fx = await prepare();
    const host = await buildResearchHost(fx); // FRESH occurrence per negative
    await assert.rejects(
      () => host.facade.invoke({ input: { ...ARMED }, caller: { callerId: 'caller.session-1', callerKind: 'business' }, [key]: forged }),
      rejectsCode('E_HOST_BUSINESS_INPUT_ONLY'),
    );
    assertNoEffect(host);
  }
});

test('A1 P1-03: unknown caller, wrong callerKind, malformed caller and cross-occurrence non-carry-over are denied by the trusted policy before admission', async () => {
  const fx = await prepare();
  // (a) authorize the armed caller first on its own occurrence.
  const host = await buildResearchHost(fx);
  await armedInvoke(host.facade);
  assert.equal(host.facade.getDispatchCount(), 1);
  // (b) unknown caller on a FRESH occurrence.
  const unknown = await buildResearchHost(fx);
  await assert.rejects(
    () => unknown.facade.invoke({ input: { ...ARMED }, caller: { callerId: 'caller.stranger', callerKind: 'business' } }),
    (e) => {
      assert.equal(e?.code, 'EXPOSURE_NOT_ADMITTED');
      assert.ok(String(e?.message).includes('not authorized'), String(e?.message));
      return true;
    },
  );
  assertNoEffect(unknown);
  // (c) same callerId under a foreign callerKind (workflow): never re-scoped.
  const wrongKind = await buildResearchHost(fx);
  await assert.rejects(
    () => wrongKind.facade.invoke({ input: { ...ARMED }, caller: { callerId: 'caller.session-1', callerKind: 'workflow' } }),
    (e) => {
      assert.equal(e?.code, 'EXPOSURE_NOT_ADMITTED');
      assert.ok(String(e?.message).includes('callerKind'), String(e?.message));
      return true;
    },
  );
  assertNoEffect(wrongKind);
  // (d) malformed caller (no callerId): T004A typed failure.
  const malformed = await buildResearchHost(fx);
  await assert.rejects(
    () => malformed.facade.invoke({ input: { ...ARMED }, caller: { callerKind: 'business' } }),
    rejectsCode('INVALID_INVOCATION_CALLER'),
  );
  assertNoEffect(malformed);
  // (e) cross-occurrence non-carry-over: a fresh occurrence whose trusted
  // Host policy never listed this caller denies it (revocation-by-absence;
  // no ambient trust carry-over between occurrences).
  const other = await buildResearchHost(fx, {
    authorizedCallers: [{ callerId: 'caller.other-1', callerKind: 'business' }],
  });
  await assert.rejects(
    () => other.facade.invoke({ input: { ...ARMED }, caller: { callerId: 'caller.session-1', callerKind: 'business' } }),
    rejectsCode('EXPOSURE_NOT_ADMITTED'),
  );
  assertNoEffect(other);
  // The original occurrence is unaffected by all denials.
  assert.equal(host.facade.getDispatchCount(), 1);
  assert.equal(host.facade.journalCompletedCount(), 1);
});

test('A1 P1-03: privileged material injection still fail-closes in the ORIGINAL v0.7 seam (fresh occurrence per negative)', async () => {
  const fx = await prepare();
  const host = await buildResearchHost(fx);
  const port = host.trustedResearchPort;
  const internals = port.internals;
  const { admitted } = await port.admitArmed();

  // Forged T003C lookalike binding (never minted) — 0 dispatch, 0 rows.
  const lookalike = { evidence: { ...internals.binding.evidence },
    successorAssembly: internals.binding.successorAssembly,
    implementationHandle: internals.binding.implementationHandle };
  await assert.rejects(() => port.invokeWithMaterial({ binding: lookalike }),
    rejectsCode('UNMINTED_TOOL_IMPLEMENTATION_BINDING'));
  assertNoEffect(host);

  // Fake T002B Assembly (self-consistent spread copy, no mint).
  const fake = { ...internals.binding, successorAssembly: { ...internals.binding.successorAssembly } };
  await assert.rejects(() => port.invokeWithMaterial({ binding: fake }),
    rejectsCode('ASSEMBLY_PROVENANCE_UNVERIFIED'));
  assertNoEffect(host);

  // Foreign occurrence: never-activated instance id in the admission request.
  const foreignRequest = { ...internals.occurrence.admissionRequest,
    workflowInstanceId: 'physical-charge.op.charge:instance:foreign' };
  await assert.rejects(() => port.invokeWithMaterial({ admissionRequest: foreignRequest }),
    rejectsCode('GOVERNANCE_EXECUTION_PIN_MISSING'));
  assertNoEffect(host);

  // Bad operation: admitted request moved to an unbound operation — the T004A
  // seam first refuses the exposure-evidence transfer across targets.
  await assert.rejects(() => port.invokeWithMaterial({ request: { ...admitted, operationId: 'op.foreign' } }),
    rejectsCode('INVOCATION_BINDING_MISMATCH'));
  assertNoEffect(host);

  // Forged effectType: the armed intent can never be re-typed by a caller.
  await assert.rejects(() => port.invokeWithMaterial({ effectType: 'effect:forge' }),
    rejectsCode('ADMISSION_EFFECT_TOOL_UNBOUND'));
  assertNoEffect(host);

  // Malformed dispatch port: v0.7 shape gate.
  await assert.rejects(() => port.invokeWithMaterial({ dispatch: {} }),
    rejectsCode('INVALID_TOOL_DISPATCH_PORT'));
  assertNoEffect(host);

  // Malformed admission ports (effectJournal removed): v0.7 closed shape.
  await assert.rejects(() => port.invokeWithMaterial({
    admissionPorts: { governance: internals.occurrence.coordinator, baselines: internals.occurrence.baselines },
  }), rejectsCode('INVALID_INVOCATION_INPUT'));
  assertNoEffect(host);

  // Forged exposure evidence (no T004A mint): typed before any admission work.
  await assert.rejects(() => port.invokeWithMaterial({
    request: { ...admitted, exposure: { ...admitted.exposure, exposureDigest: 'sha256:' + '0'.repeat(64) } },
  }), rejectsCode('FORGED_EXPOSURE_EVIDENCE'));
  assertNoEffect(host);
});

test('A1: same handler can never be re-attested under a wrong identity; foreign package stays isolated with its own occurrence', async () => {
  const fx = await prepare();
  // (a) wrong component identity on the same package selector: typed reject
  // at the trusted physical seal (handler identity is authenticated there).
  await assert.rejects(() => fx.host.seal({
    packageId: 'physical-charge', componentId: 'tool.foreign',
    kindRef: { kindId: 'demo.native-charge', version: '1.0.0' },
  }), rejectsCode('E_SELECTED_KIND'));
  // (b) projection-level identity: implementation/component drift typed reject.
  const good = await buildResearchHost(fx);
  const physical = JSON.parse(JSON.stringify(good.trustedResearchPort.internals.physical));
  physical.implementation.componentId = 'tool.foreign';
  assert.throws(() => projectPhysicalComponentToNative({
    ...physical, handler: good.trustedResearchPort.internals.handler,
  }), rejectsCode('E_PROJECTION_IDENTITY'));
  // (c) foreign package: its OWN trusted Host occurrence, fully isolated.
  const foreign = await buildResearchHost(fx, {
    selector: fx.select(profiles[2]),
    armedIntentInput: ARMED_FOREIGN,
  });
  const foreignDescribe = foreign.facade.describe();
  assert.equal(foreignDescribe.packageId, 'foreign-charge');
  assert.equal(foreignDescribe.effectType, 'effect:foreign-charge.op.charge.foreign');
  assert.notEqual(foreignDescribe.occurrenceId, good.facade.describe().occurrenceId);
  const foreignResult = await foreign.facade.invoke({
    input: { ...ARMED_FOREIGN }, caller: { callerId: 'caller.session-1', callerKind: 'business' },
  });
  assert.deepEqual(foreignResult.outcome.admitted.effects[0].output, { charged: true, fromForeign: true });
  assert.equal(foreign.facade.getDispatchCount(), 1);
  // No cross-occurrence bleed into the physical-charge occurrence.
  assert.equal(good.facade.getDispatchCount(), 0);
  assert.equal(good.facade.journalRecords().length, 0);
});

test('A1: post-Seal physical module tamper refuses before admission, dispatch and journal', async () => {
  const fx = await prepare();
  const host = await buildResearchHost(fx);
  await writeFile(join(fx.root, 'physical-charge', 'modules', 'impl.mjs'),
    "export const implementations={'impl.charge.physical':()=>({'op.charge':()=>({forged:true})})};");
  await assert.rejects(() => armedInvoke(host.facade), rejectsCode('E_APPROVED_BYTES_STALE'));
  assertNoEffect(host);
  await assert.rejects(() => host.facade.requirePhysicalCurrentness(), rejectsCode('E_APPROVED_BYTES_STALE'));
});

test('A1 P1-02: consumed physical capabilities are never silently widened (preserved verbatim; unresolved fails closed before binding)', async () => {
  const fx = await prepare();
  const good = await buildResearchHost(fx);
  const base = JSON.parse(JSON.stringify(good.trustedResearchPort.internals.physical));
  const handler = good.trustedResearchPort.internals.handler;
  const trustedSeal = { requirePhysicalCurrentness: async () => true };
  // (a) verbatim preservation in the native projection (exact v0.7 refs).
  const requiring = JSON.parse(JSON.stringify(base));
  requiring.component.requiresCapabilities = [{ capabilityId: 'cap.missing', version: '1.0.0', operations: ['support'] }];
  const projected = projectPhysicalComponentToNative({ ...requiring, handler });
  assert.deepEqual(projected.nativeTool.requiredCapabilities,
    [{ capabilityId: 'cap.missing', version: '1.0.0' }]);
  // (b) unresolved consumed capability fails closed BEFORE T003C binding.
  await assert.rejects(() => bindProjectedPhysicalToNativeAuthority({
    physical: { ...requiring, handler },
    physicalSeal: trustedSeal,
    armedIntentInput: ARMED,
    authorizedCallers: AUTHORIZED,
    instanceOrdinal: nextOrdinal(),
  }), rejectsCode('E_PROJECTION_CONSUMED_CAPABILITY_UNRESOLVED'));
  // (c) unsupported physical types are typed-rejected, never relaxed.
  const multi = JSON.parse(JSON.stringify(base));
  multi.component.operations.push(JSON.parse(JSON.stringify(multi.component.operations[0])));
  assert.throws(() => projectPhysicalComponentToNative({ ...multi, handler }),
    rejectsCode('E_PROJECTION_UNSUPPORTED_MULTI_OPERATION'));
  const unknownEffect = JSON.parse(JSON.stringify(base));
  unknownEffect.component.operations[0].effect = 'sometimes';
  assert.throws(() => projectPhysicalComponentToNative({ ...unknownEffect, handler }),
    rejectsCode('E_PROJECTION_UNSUPPORTED_EFFECT_CLASS'));
  const noCallers = JSON.parse(JSON.stringify(base));
  noCallers.component.operations[0].callers = [];
  assert.throws(() => projectPhysicalComponentToNative({ ...noCallers, handler }),
    rejectsCode('E_PROJECTION_CALLER_SCOPE_REQUIRED'));
  const effectless = JSON.parse(JSON.stringify(base));
  effectless.component.operations[0].effect = 'none';
  assert.throws(() => projectPhysicalComponentToNative({ ...effectless, handler }),
    rejectsCode('E_EFFECTLESS_NATIVE_SELECTION'));
});

test('A1: business input substitution fails closed through the ORIGINAL v0.7 intent-closure gate', async () => {
  const fx = await prepare();
  const host = await buildResearchHost(fx);
  // The ORIGINAL admission owner wraps the intent-closure rejection as a
  // durably FAILED effect (operator recovery owns any retry; uncertainty is
  // never converted into an automatic re-execution).
  await assert.rejects(
    () => host.facade.invoke({ input: { amount: 43 }, caller: { callerId: 'caller.session-1', callerKind: 'business' } }),
    (e) => {
      assert.equal(e?.code, 'ADMISSION_EFFECT_FAILED');
      assert.ok(String(e?.message).includes('different input material'), String(e?.message));
      return true;
    },
  );
  assert.equal(host.facade.getDispatchCount(), 0);
  // The begun-but-never-completed journal row belongs to the ORIGINAL
  // admission owner semantics (uncertainty preserved, never auto-retried).
  assert.equal(host.facade.journalCompletedCount(), 0);
  for (const record of host.facade.journalRecords()) {
    assert.notEqual(record.status, 'completed');
  }
});

test('A1: effectless physical selection is typed-rejected (T004B owns effect=none)', async () => {
  const fx = await prepare();
  await assert.rejects(() => buildResearchHost(fx, {
    selector: fx.select(profiles[0]),
    armedIntentInput: { score: 80 },
  }), rejectsCode('E_EFFECTLESS_NATIVE_SELECTION'));
});

test('A1: public façade rejects malformed business material and rebind; façade carries no privileged port', async () => {
  const fx = await prepare();
  const host = await buildResearchHost(fx);
  await assert.rejects(() => host.facade.invoke({ input: { ...ARMED } }), rejectsCode('E_HOST_BUSINESS_INPUT'));
  await assert.rejects(() => host.facade.invoke({ caller: { callerId: 'caller.session-1', callerKind: 'business' }, input: { ...ARMED }, extra: 1 }),
    rejectsCode('E_HOST_BUSINESS_INPUT_ONLY'));
  assert.throws(() => host.facade.rebind(), rejectsCode('E_HOST_REBIND_FORBIDDEN'));
  for (const key of Object.keys(host.facade)) {
    assert.ok(!key.toLowerCase().includes('override') && key !== 'trustedResearchPort' && key !== 'internals',
      'privileged material leaked on façade key: ' + key);
  }
});
