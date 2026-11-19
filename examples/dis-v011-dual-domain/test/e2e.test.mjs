/**
 * D3 (#1532) — dual-domain real end-to-end consumption tests.
 *
 * Tally: manifest + real `buildV10App` assembly over the byte-locked
 * snapshot bytes → public microkernel boot (`load()`) → send the sealed
 * `inspectTaskReadiness` intent → the selected rule Function
 * `tally.tasks.assessTaskEvidence` executes INSIDE the real Kernel effect
 * chain → the durable effect journal is read back from the same store.
 * `tally.release.projectReleaseReadiness` then consumes that observed task
 * output (the declared `tally.tasks` Element dependency) and honestly stays
 * BLOCKED with zero authority.
 *
 * Downloads: same assembly/boot chain; the selected knowledge Function
 * `downloads.confirmation.describeDownloadPolicy` is consumed; the declared
 * external-effect Function `downloads.acquisition.acquire` is NEVER
 * authorized: the adapter refuses direct calls, the K→C gate refuses any
 * no-permit dispatch with zero adapter invocation, the pinned policy's own
 * guard refuses an over-budget intent before any effect, and no trusted
 * Host acquisition bridge is ever installed — zero external effect.
 *
 * The store is the example's own in-process plain CAS store, honestly NOT
 * physical-host evidence; no real provider call, download traffic, Claim,
 * Release, download authorization, production DB or user data is touched.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { dispatchThroughExternalEffectGate } from '../../../packages/microkernel/dist/internal/external-effect.js';
import { buildDownloadDomainApp, buildTallyDomainApp } from '../build.mjs';
import { openDownloadApp, openTallyApp } from '../app.mjs';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const snapshotText = async (file) => await (await readFile(new URL('../snapshots/' + file, import.meta.url))).toString('utf8');
const effectOf = (receipt) => {
  assert.equal(receipt.status, 'admitted', `receipt must be admitted: ${JSON.stringify(receipt).slice(0, 400)}`);
  const effect = receipt.admitted?.effects?.[0];
  assert.ok(effect, 'the admitted receipt carries at least one effect outcome');
  return effect;
};
const TALLY_INPUT = {
  issueRef: 'https://github.com/kaicreator-mm/tally/issues/331',
  issueNumber: 331,
  sourceSha: 'a'.repeat(40),
  claimRef: 'claim:d3-demo-not-authority',
  dependenciesComplete: true,
};

test('P4: Tally E2E — pinned rule Function executes through the real Kernel chain with durable readback', async () => {
  const { built, qualified, origins } = await buildTallyDomainApp();
  // The selected business bytes ARE the pinned snapshot bytes.
  const pinned = await snapshotText('tally/business.mjs');
  const business = built.modules.find((m) => m.packageId === origins[0].packageId && m.role === 'business');
  assert.ok(business, 'the pinned Tally Business module is sealed in the BUILD');
  assert.equal(business.moduleSha256, sha256(pinned));
  assert.equal(business.moduleSource, pinned);
  // Boot through the public facade.
  const opened = await openTallyApp(built);
  try {
    assert.deepEqual(Object.keys(opened.app).sort(), ['query', 'send', 'stop', 'subscribe']);
    const receipt = await opened.app.send({
      intentType: 'inspectTaskReadiness',
      instanceKey: 'instance:d3-tally-e2e',
      messageId: 'msg:d3-tally-e2e-1',
      input: { ...TALLY_INPUT },
    });
    const effect = effectOf(receipt);
    assert.equal(effect.disposition, 'executed');
    // The selected rule Function `assessTaskEvidence` ran inside the effect chain:
    const output = effect.output;
    assert.equal(output.state, 'OBSERVED_INPUT_ONLY');
    assert.equal(output.reason, 'REQUIRES_NATIVE_CLAIM_AND_KERNEL_ADMISSION');
    assert.equal(output.admitted, false, 'observation never mints Task Claim authority');
    assert.equal(output.taskPass, false);
    assert.equal(output.issueRef, TALLY_INPUT.issueRef);
    assert.equal(output.sourceSha, TALLY_INPUT.sourceSha);
    // The read-only observation fixture answered; the pinned Business diagnosed it honestly.
    assert.equal(output.sourceObservation.claimStatus, 'NOT_VERIFIED');
    assert.equal(output.sourceObservation.workItem.admitted, false);
    assert.equal(output.pairDiagnosis.state, 'NOT_ADMITTED');
    assert.equal(output.pairDiagnosis.reason, 'LOCAL_AGENT_UNAVAILABLE');
    assert.equal(output.pairDiagnosis.claimState, 'NOT_VERIFIED');
    // Durable readback: the Kernel's effect journal at its issued address.
    const journal = await opened.readEffectJournal(effect.effectId);
    assert.ok(journal, 'the effect journal document exists at its kernel-issued address');
    assert.equal(journal.value.record.effectId, effect.effectId);
    assert.equal(journal.value.record.status, 'completed');
    assert.equal(journal.value.record.effectType, 'effect:tally-readiness-observation');
    assert.deepEqual(journal.value.record.output, output);
    assert.equal(journal.value.kernelModuleSha256,
      built.modules.find((m) => m.role === 'kernel-primary').moduleSha256);
    // A read-only observation never mints a Kernel external-effect permit.
    assert.equal(await opened.readEffectPermit(effect.effectId), null,
      'no K external-effect permit is minted for a read-only observation');
  } finally {
    opened.close();
  }
});

test('P5: tally.release statically consumes the tally.tasks E2E output and stays BLOCKED with zero authority', async () => {
  const { built, qualified } = await buildTallyDomainApp();
  const opened = await openTallyApp(built);
  let journal;
  try {
    const receipt = await opened.app.send({
      intentType: 'inspectTaskReadiness',
      instanceKey: 'instance:d3-tally-release',
      messageId: 'msg:d3-tally-release-1',
      input: { ...TALLY_INPUT },
    });
    const effect = effectOf(receipt);
    journal = await opened.readEffectJournal(effect.effectId);
  } finally {
    opened.close();
  }
  // The declared static dependency: tally.release consumes tally.tasks output.
  const taskOutput = journal.value.record.output;
  assert.equal(taskOutput.state, 'OBSERVED_INPUT_ONLY');
  assert.equal(taskOutput.admitted, false);
  const { RELEASE_READINESS_REQUIRED_GATES } = qualified.modules.get('tally/release-readiness.mjs');
  const observedAsOf = journal.value.record.completedAt;
  // The only gate this demo observed is the native-Claims one, derived from
  // the pinned rule's own output: an unadmitted observation is UNKNOWN there
  // and NOT_RUN everywhere else — honest incompleteness, never PASS.
  const gates = Object.fromEntries(RELEASE_READINESS_REQUIRED_GATES.map((name) => [name,
    name === 'nativeClaims'
      ? { status: taskOutput.admitted === false && taskOutput.taskPass === false ? 'UNKNOWN' : 'PASS',
          observedAsOf, evidenceRef: TALLY_INPUT.issueRef }
      : undefined]));
  const readiness = await qualified.invoke('tally.release.projectReleaseReadiness', {
    repository: 'kaicreator-mm/tally',
    sourceSha: TALLY_INPUT.sourceSha,
    observedAsOf,
    gates,
  });
  assert.equal(readiness.status, 'BLOCKED');
  assert.equal(readiness.reason, 'REQUIRED_EVIDENCE_INCOMPLETE');
  assert.equal(readiness.authorization, 'NONE');
  assert.equal(readiness.independentRQRequired, true);
  assert.equal(readiness.advisoryOnly, true);
  assert.equal(readiness.taskPass, false);
  assert.equal(readiness.releasePass, false);
  assert.equal(readiness.canMerge, false);
  assert.equal(readiness.canTag, false);
  assert.equal(readiness.canPublish, false);
  assert.equal(readiness.gateCounts.required, RELEASE_READINESS_REQUIRED_GATES.length);
  assert.equal(readiness.gateCounts.reportedPass, 0);
  assert.equal(readiness.gateCounts.missingOrUnqualified, RELEASE_READINESS_REQUIRED_GATES.length);
  assert.equal(readiness.gates.find((g) => g.name === 'nativeClaims').status, 'UNKNOWN');
});

test('N11: the pinned Tally rule fails closed when dependencies are not verified', async () => {
  const { qualified } = await buildTallyDomainApp();
  const rejected = await qualified.invoke('tally.tasks.assessTaskEvidence', {
    ...TALLY_INPUT,
    dependenciesComplete: false,
  });
  assert.equal(rejected.state, 'UNQUALIFIED_INPUT');
  assert.equal(rejected.reason, 'DEPENDENCIES_UNVERIFIED');
  assert.equal(rejected.admitted, false);
  assert.equal(rejected.taskPass, false);
});

test('P6: Downloads E2E — assembly, boot and the selected knowledge Function consumed', async () => {
  const { built, qualified, origins } = await buildDownloadDomainApp();
  // Both pinned sources are sealed byte-for-byte.
  const downloadPinned = await snapshotText('xdownload/business-download.mjs');
  const acquisitionPinned = await snapshotText('xdownload/capability-acquisition-stub.mjs');
  const business = built.modules.find((m) => m.packageId === origins[0].packageId && m.role === 'business');
  const capability = built.modules.find((m) => m.packageId === origins[1].packageId && m.role === 'capability');
  assert.equal(business.moduleSha256, sha256(downloadPinned));
  assert.equal(business.moduleSource, downloadPinned);
  assert.equal(capability.moduleSha256, sha256(acquisitionPinned));
  assert.equal(capability.moduleSource, acquisitionPinned);
  assert.equal(capability.externalEffect, true, 'the acquisition stub is sealed exactly as declared');
  const route = built.routes.find((r) => r.intentId === 'confirmDownload');
  assert.deepEqual(route, { intentId: 'confirmDownload', operationId: 'acquisition.acquire', capabilityId: 'acquisition', handlerId: 'acquire' });
  // Boot through the public facade.
  const opened = await openDownloadApp(built);
  try {
    assert.deepEqual(Object.keys(opened.app).sort(), ['query', 'send', 'stop', 'subscribe']);
    // The selected knowledge Function `describeDownloadPolicy` is consumed:
    const policy = await qualified.invoke('downloads.confirmation.describeDownloadPolicy');
    assert.equal(policy.packageId, 'business-download@0.2.0-t03');
    assert.equal(policy.domainId, 'downloads');
    assert.equal(policy.intentBindings.confirmDownload.trigger.eventType, 'DOWNLOAD_CONFIRMED');
    const effectBinding = policy.effectBindings['effect:acquire'];
    assert.deepEqual(effectBinding.resource, { key: 'acquisition', operation: 'acquisition.acquire' });
    assert.deepEqual(effectBinding.external, { permitTtlMs: 60_000, await: 'terminal' });
    const downloadsModule = qualified.modules.get('xdownload/business-download.mjs');
    assert.equal(downloadsModule.DECLARED_BYTES_PROFILE_BOUND, 1_048_576);
  } finally {
    opened.close();
  }
});

test('N12: the pinned policy guard refuses an over-budget confirmDownload before any effect', async () => {
  const { built } = await buildDownloadDomainApp();
  const opened = await openDownloadApp(built);
  try {
    const receipt = await opened.app.send({
      intentType: 'confirmDownload',
      instanceKey: 'instance:d3-dl-oversize',
      messageId: 'msg:d3-dl-oversize-1',
      input: {
        requestId: 'R-D3-OVERSIZE', lineageId: 'lineage:d3-demo',
        targetRef: 'https://example.test/media/file.iso',
        outputRootScope: 'scope:d3-demo', allowedOperation: 'http.get', slice: 'full',
        digestAnchor: 'sha256:' + 'b'.repeat(64),
        declaredBytes: 2 * 1_048_576, caller: 'd3-demo',
      },
    });
    assert.equal(receipt.status, 'admitted');
    assert.equal(receipt.admitted.transitionKey, 'refuse');
    assert.equal(receipt.admitted.targetState, 'refused');
    assert.deepEqual(receipt.admitted.effects, [], 'the guarded intent produces zero effects');
    assert.equal(receipt.instance?.state?.stateKey, 'refused');
    // No effect ran, so the store holds no journal or permit documents.
    const journalKeys = opened.store.keys().filter((k) => k.includes('effect-journal') || k.includes('effect-permit'));
    assert.deepEqual(journalKeys, []);
  } finally {
    opened.close();
  }
});

test('N13: acquire is never authorized — no permit fails closed with zero adapter dispatch and zero effect', async () => {
  assert.equal(globalThis.__xdownloadAcquisitionStubBridge, undefined,
    'no trusted Host acquisition bridge is ever installed in this demo');
  const { built, qualified } = await buildDownloadDomainApp();
  const opened = await openDownloadApp(built);
  try {
    // (a) the consumer adapter refuses direct external-effect invocation.
    await assert.rejects(
      qualified.invoke('downloads.acquisition.acquire', { requestId: 'R-NOPERM' }, {}),
      (error) => error?.code === 'DIS_EXTERNAL_EFFECT_KDP_REQUIRED',
    );
    // (b) the trusted K→C gate refuses a dispatch that carries no K permit:
    // typed refusal, and the sealed stub handler is never invoked.
    const kernelUrl = new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url);
    const kernelBytes = await readFile(kernelUrl);
    assert.equal(sha256(kernelBytes.toString('utf8')), 'e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7',
      'the authority view is read from the exact trusted Kernel bytes');
    const kernel = await import(kernelUrl.href);
    let invoked = 0;
    await assert.rejects(
      dispatchThroughExternalEffectGate(
        {
          docs: { get: async (_businessPackageId, _key) => null },
          readAuthorityView: kernel.readEffectAuthorityView,
          nowIso: () => new Date().toISOString(),
          onDispatch: () => { invoked += 100; },
          onRefusal: () => {},
        },
        {
          capabilityId: 'acquisition', operationId: 'acquisition.acquire',
          payload: { requestId: 'R-NOPERM', effectId: 'turn:d3-demo/effect/1' },
          invoke: async () => { invoked += 1; return { phase: 'terminal' }; },
          // No attest: the no-permit path. This demo never mints one for acquire.
        },
      ),
      (error) => error?.code === 'V10_EFFECT_PERMIT_REQUIRED',
    );
    assert.equal(invoked, 0, 'the acquisition stub handler physically dispatched zero times');
    // (c) the download store holds no effect journal and no permit at all.
    const authorityKeys = opened.store.keys().filter((k) => k.includes('effect-journal') || k.includes('effect-permit'));
    assert.deepEqual(authorityKeys, []);
  } finally {
    opened.close();
  }
  assert.equal(globalThis.__xdownloadAcquisitionStubBridge, undefined,
    'still no bridge after every fail-closed path');
});
