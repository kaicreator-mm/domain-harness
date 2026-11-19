/**
 * I0 (#1543) — public-SDK Domain App composition over A1 (#1541) + A2 (#1542)
 * with the REAL dual-domain source-pinned bytes (dev.2 lane of #1529/#1540).
 *
 * The whole chain runs through the package's public export entry
 * (`dist/index.js`): one BUILD-prepared composition (snapshot bytes verified
 * against their originating Git blobs, D1 manifest/AOT lock, D2 envelope and
 * the A2 invoker with pre-compiled validators) is wrapped in an A1 App
 * session; selected no-effect Functions are invoked only while READY, and
 * everything is disposed in reverse order on stop. Negative cases pin the
 * gates: calls before/after the session, unknown & prototype-member ids,
 * the unauthorized external-effect Function (zero execution, zero budget),
 * budget exhaustion, invalid dynamic input and the ref-only schema that must
 * fail closed as UNAVAILABLE instead of pretending validation happened.
 * Revised-but-unsealed bytes stay rejected by the BUILD boundary
 * (assertFunctionBindings), not by runtime hashing. No Host, no Permit and
 * no external effect is ever minted here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  ELEMENT_MANIFEST_SCHEMA, parseElementManifest, resolveDependencyClosure,
  validateSemanticRelations, lockAot, assertFunctionBindings, ElementContractError,
  createBoundedEnvelope, digest,
  createFunctionInvoker, createDomainAppSession, AppSessionError,
} from '../../../packages/dis-v011-runtime/dist/index.js';
import { gitBlobSha, PINNED } from '../consumer.mjs';

const TARGET = 'linux-x64-node24';
const snapshotBytes = async (file) => await readFile(new URL('../snapshots/' + file, import.meta.url));

const TALLY_INPUT = {
  issueRef: 'https://github.com/kaicreator-mm/tally/issues/331',
  issueNumber: 331,
  sourceSha: 'a'.repeat(40),
  claimRef: 'claim:dev2-app-call-not-authority',
  dependenciesComplete: true,
};
const RELEASE_INPUT = {
  repository: 'kaicreator-mm/tally',
  sourceSha: TALLY_INPUT.sourceSha,
  observedAsOf: new Date(0).toISOString(),
  gates: {},
};
const ACQUIRE_INPUT = { url: 'https://example.invalid/x', bytes: 1 };

const FUNCTION_PINS = {
  assessTaskEvidence: 'tally/business.mjs',
  projectReleaseReadiness: 'tally/release-readiness.mjs',
  describeDownloadPolicy: 'xdownload/business-download.mjs',
  acquire: 'xdownload/capability-acquisition-stub.mjs',
};

const MANIFEST = {
  schema: ELEMENT_MANIFEST_SCHEMA,
  relations: [
    { from: 'downloads.confirmation', to: 'downloads.acquisition', kind: 'constrains' },
    { from: 'downloads.acquisition', to: 'downloads.confirmation', kind: 'cooperates-with' },
  ],
  consumers: [
    {
      id: 'tally',
      repository: 'kaicreator-mm/tally',
      sourceCommit: 'e988321439f65b55936a691c02250b6d62a29409',
      domainId: 'tally-engineering',
      sources: [
        { file: 'tally/business.mjs', originalPath: PINNED['tally/business.mjs'].originalPath, gitBlob: PINNED['tally/business.mjs'].gitBlob },
        { file: 'tally/release-readiness.mjs', originalPath: PINNED['tally/release-readiness.mjs'].originalPath, gitBlob: PINNED['tally/release-readiness.mjs'].gitBlob },
      ],
      elements: [
        { id: 'tally.tasks', description: '工程 Task 的 Claim/Evidence 评估', functions: [
          { id: 'assessTaskEvidence', exportName: 'assessTaskEvidence', source: 'tally/business.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/task-evidence.input.json', outputSchemaRef: 'schemas/tally/task-evidence.output.json' },
        ] },
        { id: 'tally.release', description: '独立 RQ 授权前的证据投影', dependsOn: ['tally.tasks'], functions: [
          { id: 'projectReleaseReadiness', exportName: 'projectReleaseReadiness', source: 'tally/release-readiness.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/release-readiness.input.json', outputSchemaRef: 'schemas/tally/release-readiness.output.json' },
        ] },
      ],
    },
    {
      id: 'xdownload',
      repository: 'kaicreator-mm/xDownload',
      sourceCommit: 'e904f08c478b15147b1c07fbe53c610d2d81851f',
      domainId: 'downloads',
      sources: [
        { file: 'xdownload/business-download.mjs', originalPath: PINNED['xdownload/business-download.mjs'].originalPath, gitBlob: PINNED['xdownload/business-download.mjs'].gitBlob },
        { file: 'xdownload/capability-acquisition-stub.mjs', originalPath: PINNED['xdownload/capability-acquisition-stub.mjs'].originalPath, gitBlob: PINNED['xdownload/capability-acquisition-stub.mjs'].gitBlob },
      ],
      elements: [
        { id: 'downloads.confirmation', description: '确认下载 Intent 与字节预算', functions: [
          { id: 'describeDownloadPolicy', exportName: 'getPolicy', source: 'xdownload/business-download.mjs', implementation: 'knowledge', effects: 'none', inputSchemaRef: 'schemas/xdownload/download-policy.input.json', outputSchemaRef: 'schemas/xdownload/download-policy.output.json' },
        ] },
        { id: 'downloads.acquisition', description: '受 KDP permit 约束的真实外部采集 Effect', dependsOn: ['downloads.confirmation'], functions: [
          { id: 'acquire', exportName: 'acquire', source: 'xdownload/capability-acquisition-stub.mjs', implementation: 'external-effect', effects: 'non-idempotent', inputSchemaRef: 'schemas/xdownload/acquisition.input.json', outputSchemaRef: 'schemas/xdownload/acquisition.output.json' },
        ] },
      ],
    },
  ],
};

/** Pre-compiled dynamic-input validators (real functions, no schema refs). */
const HEX40 = /^[0-9a-f]{40}$/;
const VALIDATORS = {
  assessTaskEvidence: (input) => input !== null && typeof input === 'object'
    && typeof input.issueRef === 'string' && input.issueRef.startsWith('https://')
    && Number.isInteger(input.issueNumber) && input.issueNumber > 0
    && typeof input.sourceSha === 'string' && HEX40.test(input.sourceSha)
    && typeof input.claimRef === 'string' && input.claimRef.length > 0
    && typeof input.dependenciesComplete === 'boolean',
  // getPolicy() takes no dynamic input; anything else is invalid input.
  describeDownloadPolicy: (input) => input === undefined,
  acquire: (input) => input !== null && typeof input === 'object'
    && typeof input.url === 'string' && input.url.startsWith('https://')
    && Number.isInteger(input.bytes) && input.bytes > 0,
  // projectReleaseReadiness deliberately has NO pre-compiled validator here:
  // its ref-only schema must fail closed as INPUT_VALIDATION_UNAVAILABLE.
};

function declarationOf(manifest, functionId) {
  for (const consumer of manifest.consumers) {
    for (const element of consumer.elements) {
      for (const fn of element.functions) if (fn.id === functionId) return fn;
    }
  }
  throw new Error('function not declared: ' + functionId);
}

/**
 * BUILD step (outside the session): verify the pinned bytes against their
 * originating Git blobs, seal the dual-domain AOT lock, and prepare the D2
 * envelope + A2 invoker with pre-bound real snapshot callables.
 */
async function buildDualDomainBundle({ sourceOverrides = {}, budget } = {}) {
  const text = {};
  const modules = {};
  for (const [functionId, file] of Object.entries(FUNCTION_PINS)) {
    const bytes = await snapshotBytes(file);
    assert.equal(gitBlobSha(bytes), PINNED[file].gitBlob, `${file} bytes must match its originating Git blob`);
    const overridden = sourceOverrides[file] !== undefined;
    text[file] = overridden ? sourceOverrides[file] : bytes.toString('utf8');
    // A legal re-seal executes the revised bytes themselves (the lock and the
    // callable must be the same selection); untouched files keep importing
    // their pinned snapshot module.
    modules[functionId] = overridden
      ? await import('data:text/javascript;base64,' + Buffer.from(text[file], 'utf8').toString('base64'))
      : await import(new URL('../snapshots/' + file, import.meta.url).href);
  }
  const manifest = parseElementManifest(MANIFEST);
  const closure = resolveDependencyClosure(manifest);
  const relations = validateSemanticRelations(manifest);
  const lock = lockAot(
    manifest,
    Object.fromEntries(Object.entries(FUNCTION_PINS).map(([functionId, file]) => [functionId, {
      path: file, sha256: digest(text[file]), target: TARGET,
    }])),
    { expectedTarget: TARGET },
  );
  const envelope = createBoundedEnvelope({
    budget: budget ?? { maxSteps: 8, maxWorkUnits: 32, wallClockMs: 10_000 },
    providers: [{ kind: 'local-deterministic', id: 'dev2-app-call-runner' }],
  });
  const bindings = Object.fromEntries(Object.entries(FUNCTION_PINS).map(([functionId]) => {
    const binding = {
      declaration: declarationOf(manifest, functionId),
      lockEntry: lock.entries[functionId],
      callable: (input) => {
        const module = modules[functionId];
        switch (functionId) {
          case 'assessTaskEvidence': return module.assessTaskEvidence(input);
          case 'projectReleaseReadiness': return module.projectReleaseReadiness(input);
          case 'describeDownloadPolicy': return module.getPolicy();
          case 'acquire': return module.acquire(input, undefined);
          default: throw new Error('unbound: ' + functionId);
        }
      },
    };
    if (VALIDATORS[functionId] !== undefined) binding.validator = VALIDATORS[functionId];
    return [functionId, binding];
  }));
  const invoker = createFunctionInvoker({
    manifest, lock, expectedTarget: TARGET, envelope,
    providerKind: 'local-deterministic', bindings,
  });
  return { manifest, closure, relations, lock, envelope, invoker, text };
}

/**
 * Wrap a BUILD bundle in one Domain App session (A1 lifecycle): the two
 * snapshot packages register their byte resources at init and release them
 * on dispose; the App Init activates the Domain-owned session state; dispose
 * order is recorded for the reverse-order assertion.
 */
function wrapDomainAppSession(bundle) {
  const state = { resources: new Map(), sessionView: null, disposeOrder: [] };
  const acquireBytes = async (file) => {
    const bytes = await snapshotBytes(file);
    assert.equal(gitBlobSha(bytes), PINNED[file].gitBlob, `${file} re-verified at session init`);
    return bytes;
  };
  const app = createDomainAppSession({
    invoker: bundle.invoker,
    packages: [
      {
        id: 'pkg:tally-snapshots',
        init: async () => { state.resources.set('tally', [await acquireBytes('tally/business.mjs'), await acquireBytes('tally/release-readiness.mjs')]); },
        dispose: async () => { state.disposeOrder.push('pkg:tally-snapshots'); state.resources.delete('tally'); },
      },
      {
        id: 'pkg:xdownload-snapshots',
        init: async () => { state.resources.set('xdownload', [await acquireBytes('xdownload/business-download.mjs'), await acquireBytes('xdownload/capability-acquisition-stub.mjs')]); },
        dispose: async () => { state.disposeOrder.push('pkg:xdownload-snapshots'); state.resources.delete('xdownload'); },
      },
    ],
    app: {
      id: 'app:dual-domain-dis',
      init: async () => { state.sessionView = { startedAt: Date.now(), calls: 0 }; },
      dispose: async () => { state.disposeOrder.push('app:dual-domain-dis'); state.sessionView = null; },
    },
  });
  return { app, state };
}

const rejectedOf = (outcome, because) => {
  assert.equal(outcome.status, 'REJECTED', because + ': ' + JSON.stringify(outcome).slice(0, 300));
  return outcome;
};

test('P-AC-1: App Init → READY → real Tally + xDownload selected Functions → Result → reverse Dispose', async () => {
  const bundle = await buildDualDomainBundle();
  const { app, state } = wrapDomainAppSession(bundle);

  // Before start: NEW, resources absent, calls rejected.
  assert.equal(app.observe().state, 'NEW');
  assert.equal(state.resources.size, 0);
  await assert.rejects(() => app.invoke({ functionId: 'assessTaskEvidence', input: { ...TALLY_INPUT } }),
    (error) => error instanceof AppSessionError && error.code === 'APP_SESSION_INVALID_STATE' && error.detail === 'run:NEW');

  // Start: package inits then the unique App Init → READY; Domain-owned state visible.
  const started = await app.start();
  assert.equal(started.status, 'READY');
  assert.deepEqual(started.started.map((step) => step.id), ['pkg:tally-snapshots', 'pkg:xdownload-snapshots', 'app:dual-domain-dis']);
  assert.equal(app.observe().state, 'READY');
  assert.equal(state.resources.size, 2, 'session resources registered by package inits');
  assert.ok(state.sessionView, 'Domain-owned session state activated by the App Init');

  // Selected Tally rule Function, real pinned bytes, honest observation.
  const assessment = await app.invoke({ functionId: 'assessTaskEvidence', input: { ...TALLY_INPUT } });
  assert.equal(assessment.status, 'COMPLETED');
  assert.equal(assessment.functionId, 'assessTaskEvidence');
  assert.equal(assessment.attested, false);
  assert.equal(assessment.authority, 'NONE');
  assert.equal(assessment.output.state, 'OBSERVED_INPUT_ONLY');
  assert.equal(assessment.output.admitted, false);

  // Selected xDownload knowledge Function from the second real domain.
  const policy = await app.invoke({ functionId: 'describeDownloadPolicy', input: undefined });
  assert.equal(policy.status, 'COMPLETED');
  assert.equal(policy.output.packageId, 'business-download@0.2.0-t03');
  state.sessionView.calls += 2;

  // Stop: reverse-order dispose (app first, then packages in reverse).
  const stopped = await app.stop();
  assert.equal(stopped.status, 'STOPPED');
  assert.deepEqual(state.disposeOrder, ['app:dual-domain-dis', 'pkg:xdownload-snapshots', 'pkg:tally-snapshots']);
  assert.equal(state.resources.size, 0, 'resources released');
  assert.equal(state.sessionView, null, 'Domain session state closed');
  assert.equal(app.observe().state, 'STOPPED');

  // After dispose: calls stay rejected.
  await assert.rejects(() => app.invoke({ functionId: 'describeDownloadPolicy', input: undefined }),
    (error) => error instanceof AppSessionError && error.code === 'APP_SESSION_INVALID_STATE' && error.detail === 'run:STOPPED');
});

test('P-AC-2: a legally re-sealed rule revision observably changes the result through the same entry', async () => {
  const revisionSource = 'export function assessTaskEvidence(input) {\n'
    + '  if (!input || input.dependenciesComplete !== true) {\n'
    + "    return Object.freeze({ state: 'UNQUALIFIED_INPUT', reason: 'DEPENDENCIES_UNVERIFIED', admitted: false, taskPass: false });\n"
    + '  }\n'
    + "  return Object.freeze({ state: 'REVISED_OBSERVATION', reason: 'REVISION_ADMITS_COMPLETE_DEPENDENCIES', issueRef: input.issueRef, sourceSha: input.sourceSha, admitted: true, taskPass: true });\n"
    + '}\n';
  const original = await buildDualDomainBundle();
  const revised = await buildDualDomainBundle({ sourceOverrides: { 'tally/business.mjs': revisionSource } });
  assert.notEqual(revised.lock.lockSha256, original.lock.lockSha256, 'a re-seal is a different lock');

  const runOnce = async (bundle) => {
    const { app } = wrapDomainAppSession(bundle);
    await app.start();
    try {
      return await app.invoke({ functionId: 'assessTaskEvidence', input: { ...TALLY_INPUT } });
    } finally {
      await app.stop();
    }
  };
  const fromOriginal = await runOnce(original);
  const fromRevised = await runOnce(revised);
  assert.equal(fromOriginal.status, 'COMPLETED');
  assert.equal(fromOriginal.output.state, 'OBSERVED_INPUT_ONLY');
  assert.equal(fromRevised.status, 'COMPLETED');
  assert.equal(fromRevised.output.state, 'REVISED_OBSERVATION');
  assert.equal(fromRevised.output.admitted, true);
});

test('N-AC-3: un-re-sealed drift bytes are refused at the BUILD boundary, not by runtime hashing', async () => {
  const forged = 'export function assessTaskEvidence(input) {\n'
    + "  return Object.freeze({ state: 'FORGED', admitted: true });\n}\n";
  const bundle = await buildDualDomainBundle();
  const candidates = Object.fromEntries(Object.entries(FUNCTION_PINS).map(([functionId, file]) => [functionId, {
    path: file, target: TARGET,
    content: functionId === 'assessTaskEvidence' ? forged : bundle.text[file],
  }]));
  assert.throws(
    () => assertFunctionBindings(bundle.lock, candidates),
    (error) => error instanceof ElementContractError && error.code === 'ELEMENT_FUNCTION_DIGEST_MISMATCH',
  );
});

test('N-AC-4: unknown and prototype-member ids are rejected with zero execution', async () => {
  const bundle = await buildDualDomainBundle();
  const { app } = wrapDomainAppSession(bundle);
  await app.start();
  try {
    for (const badId of ['__proto__', 'toString', 'constructor', 'no.such.function', '']) {
      const outcome = rejectedOf(await app.invoke({ functionId: badId, input: {} }), `id ${badId}`);
      assert.equal(outcome.code, 'FUNCTION_ID_UNKNOWN');
      assert.equal(outcome.output, null);
      assert.equal(outcome.effectDispatched, false);
    }
    assert.deepEqual(bundle.envelope.remaining(), { steps: 8, workUnits: 32 }, 'unknown ids spend no budget');
  } finally {
    await app.stop();
  }
});

test('N-AC-5: the unauthorized external-effect Function requires an existing Permit with zero execution and zero budget', async () => {
  const bundle = await buildDualDomainBundle();
  const { app } = wrapDomainAppSession(bundle);
  await app.start();
  try {
    const outcome = rejectedOf(await app.invoke({ functionId: 'acquire', input: { ...ACQUIRE_INPUT } }), 'acquire is gated');
    assert.equal(outcome.code, 'EFFECT_PERMIT_REQUIRED');
    assert.equal(outcome.permitRequired, true);
    assert.ok(outcome.detail.includes('implementation:external-effect'));
    assert.equal(outcome.output, null);
    assert.equal(outcome.effectDispatched, false, 'zero effect dispatch without a real Permit');
    assert.ok(!outcome.trace, 'gated call reserves no budget trace');
    assert.deepEqual(bundle.envelope.remaining(), { steps: 8, workUnits: 32 }, 'zero budget spend');
  } finally {
    await app.stop();
  }
});

test('N-AC-6: budget exhaustion fails closed with no partial success', async () => {
  const bundle = await buildDualDomainBundle({ budget: { maxSteps: 1, maxWorkUnits: 1, wallClockMs: 10_000 } });
  const { app } = wrapDomainAppSession(bundle);
  await app.start();
  try {
    const first = await app.invoke({ functionId: 'assessTaskEvidence', input: { ...TALLY_INPUT } });
    assert.equal(first.status, 'COMPLETED');
    const second = await app.invoke({ functionId: 'describeDownloadPolicy', input: undefined });
    assert.equal(second.status, 'BUDGET_EXHAUSTED');
    assert.equal(second.axis, 'steps');
    assert.equal(second.output, null);
    assert.equal(second.attested, false);
    // The session itself stays READY and cleanly stoppable after exhaustion.
    assert.equal(app.observe().state, 'READY');
  } finally {
    const stopped = await app.stop();
    assert.equal(stopped.status, 'STOPPED');
  }
});

test('N-AC-7: invalid dynamic input and ref-only schemas both fail closed (never pretend validation)', async () => {
  const bundle = await buildDualDomainBundle();
  const { app } = wrapDomainAppSession(bundle);
  await app.start();
  try {
    const invalid = rejectedOf(
      await app.invoke({ functionId: 'assessTaskEvidence', input: { ...TALLY_INPUT, sourceSha: 'not-a-sha' } }),
      'invalid dynamic input');
    assert.equal(invalid.code, 'INPUT_VALIDATION_FAILED');
    assert.equal(invalid.inputValidation, 'FAILED');

    const refOnly = rejectedOf(
      await app.invoke({ functionId: 'projectReleaseReadiness', input: { ...RELEASE_INPUT } }),
      'ref-only schema without a selected validator');
    assert.equal(refOnly.code, 'INPUT_VALIDATION_UNAVAILABLE');
    assert.equal(refOnly.inputValidation, 'UNAVAILABLE');
    assert.ok(refOnly.detail.includes('inputSchemaRef'), 'the rejection names the ref that was never validated');
  } finally {
    await app.stop();
  }
});

test('N-AC-8: a failing package init cleans up in reverse and reports the failing step honestly', async () => {
  const bundle = await buildDualDomainBundle();
  const disposeOrder = [];
  const app = createDomainAppSession({
    invoker: bundle.invoker,
    packages: [
      { id: 'pkg:first', init: async () => {}, dispose: async () => { disposeOrder.push('pkg:first'); } },
      { id: 'pkg:second', init: async () => { throw new Error('second package resource unavailable'); }, dispose: async () => { disposeOrder.push('pkg:second'); } },
    ],
    app: { id: 'app:x', init: async () => {}, dispose: async () => { disposeOrder.push('app:x'); } },
  });
  const result = await app.start();
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'APP_SESSION_INIT_FAILED');
  assert.equal(result.failedStepId, 'pkg:second');
  assert.equal(result.failedPhase, 'package');
  assert.equal(result.error.message, 'second package resource unavailable');
  assert.deepEqual(result.disposed.map((step) => step.id), ['pkg:first'], 'only the started step is disposed');
  assert.deepEqual(disposeOrder, ['pkg:first'], 'the failing step and the app are never disposed');
  assert.equal(app.observe().state, 'FAILED');
});
