/**
 * D3 (#1532) — source-pin qualification and canonical BUILD selection tests
 * for the dual-domain (tally-engineering + downloads) consumer example.
 *
 * Positives prove the four pinned snapshots are byte-identical to their
 * originating Git blobs and that the real BUILD deterministically seals
 * them. Negatives prove fail-closed refusals: tampered snapshot bytes,
 * forged Function bindings, broken Element dependencies, relabeled external
 * effects, and BUILD-level byte/route substitution.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { PINNED, PROJECTS, gitBlobSha, qualifyProjectConsumers } from '../consumer.mjs';
import { buildDownloadDomainApp, buildTallyDomainApp } from '../build.mjs';

const declaration = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
const denial = (code) => (error) => error?.code === code;
const changed = (fn) => { const v = structuredClone(declaration); fn(v); return v; };
const snapshotBytes = async (file) => await readFile(new URL('../snapshots/' + file, import.meta.url));
const tamperedReader = (mutate) => async (file) => {
  const bytes = await snapshotBytes(file);
  return mutate(bytes);
};

test('P1: four pinned snapshots are byte-identical to their originating Git blobs', async () => {
  const qualified = await qualifyProjectConsumers(declaration);
  assert.equal(qualified.verified.length, 4);
  const manifestSources = declaration.consumers.flatMap((c) => c.sources);
  assert.equal(manifestSources.length, 4);
  for (const { file, gitBlob, project } of qualified.verified) {
    const bytes = await snapshotBytes(file);
    assert.equal(gitBlobSha(bytes), gitBlob, `snapshot ${file} must equal its pinned blob`);
    const declared = manifestSources.find((s) => s.file === file);
    assert.equal(declared.gitBlob, gitBlob);
    assert.ok(/^[a-f0-9]{40}$/.test(gitBlob), 'blob ids are git object ids');
    const pinnedOrigin = PINNED[file];
    assert.equal(pinnedOrigin.repository, PROJECTS[project].repository);
    assert.ok(pinnedOrigin.originalPath.length > 0);
  }
});

test('P2: two real project domains expose exactly the four selected DIS Function bindings', async () => {
  const qualified = await qualifyProjectConsumers(declaration);
  assert.deepEqual(qualified.declaration.consumers.map((c) => c.id), ['tally', 'xdownload']);
  assert.deepEqual(qualified.functionIds, [
    'tally.tasks.assessTaskEvidence',
    'tally.release.projectReleaseReadiness',
    'downloads.confirmation.describeDownloadPolicy',
    'downloads.acquisition.acquire',
  ]);
  assert.equal(qualified.describe('tally.release.projectReleaseReadiness').implementation, 'rule');
  assert.equal(qualified.describe('downloads.acquisition.acquire').implementation, 'external-effect');
  assert.equal(qualified.describe('downloads.acquisition.acquire').effects, 'non-idempotent');
  // Static Element dependencies are declared inside one project each.
  const tallyRelease = qualified.declaration.consumers[0].elements[1];
  assert.deepEqual(tallyRelease.dependsOn, ['tally.tasks']);
  const acquisition = qualified.declaration.consumers[1].elements[1];
  assert.deepEqual(acquisition.dependsOn, ['downloads.confirmation']);
});

test('P3: real BUILD selection is deterministic for exact source-qualified inputs', async () => {
  const a = await buildTallyDomainApp();
  const b = await buildTallyDomainApp();
  assert.equal(a.built.subjectDigest, b.built.subjectDigest);
  assert.deepEqual(a.built.routes, b.built.routes);
  const c = await buildDownloadDomainApp();
  const d = await buildDownloadDomainApp();
  assert.equal(c.built.subjectDigest, d.built.subjectDigest);
  assert.deepEqual(c.built.routes, d.built.routes);
});

test('N1: a tampered Tally snapshot byte refuses qualification before assembly', async () => {
  await assert.rejects(
    qualifyProjectConsumers(declaration, {
      readSnapshot: tamperedReader((bytes) => {
        const tampered = Buffer.from(bytes);
        tampered[0] = tampered[0] === 0x2f ? 0x2e : 0x2f; // flip one leading comment byte
        return tampered;
      }),
    }),
    denial('DIS_SOURCE_BYTES_DRIFT'),
  );
});

test('N2: a tampered acquisition-stub snapshot byte refuses qualification', async () => {
  await assert.rejects(
    qualifyProjectConsumers(declaration, {
      readSnapshot: tamperedReader((bytes) => {
        const tampered = Buffer.from(bytes);
        tampered[tampered.length - 1] = tampered.at(-1) === 0x0a ? 0x0b : 0x0a; // flip one trailing byte
        return tampered;
      }),
    }),
    denial('DIS_SOURCE_BYTES_DRIFT'),
  );
});

test('N3: a forged Function export is rejected before the runtime can call it', async () => {
  const v = changed((x) => { x.consumers[0].elements[0].functions[0].exportName = 'unselectedFunction'; });
  await assert.rejects(qualifyProjectConsumers(v), denial('DIS_FUNCTION_EXPORT_MISSING'));
});

test('N4: a missing tally.tasks Element dependency fails closed', async () => {
  // The declared dependency target no longer exists in the manifest.
  const v = changed((x) => { x.consumers[0].elements = x.consumers[0].elements.filter((el) => el.id !== 'tally.tasks'); });
  await assert.rejects(qualifyProjectConsumers(v), denial('DIS_DEPENDENCY_MISSING'));
  // The release Element itself loses its declared dependency anchor.
  const w = changed((x) => { x.consumers[0].elements[1].dependsOn = ['tally.tasks.gone']; });
  await assert.rejects(qualifyProjectConsumers(w), denial('DIS_DEPENDENCY_MISSING'));
});

test('N5: an Element dependency cycle fails closed', async () => {
  const v = changed((x) => { x.consumers[0].elements[0].dependsOn = ['tally.release']; });
  await assert.rejects(qualifyProjectConsumers(v), denial('DIS_DEPENDENCY_CYCLE'));
});

test('N6: dependencies may not quietly import another project Element', async () => {
  const v = changed((x) => { x.consumers[1].elements[1].dependsOn = ['tally.tasks']; });
  await assert.rejects(qualifyProjectConsumers(v), denial('DIS_CROSS_PROJECT_DEPENDENCY'));
});

test('N7: an external Effect cannot be relabeled as a pure Function', async () => {
  const v = changed((x) => { x.consumers[1].elements[1].functions[0].implementation = 'rule'; });
  await assert.rejects(qualifyProjectConsumers(v), denial('DIS_EFFECT_CLASS_MISMATCH'));
});

test('N8: the consumer adapter refuses to invoke the declared external Effect directly', async () => {
  const qualified = await qualifyProjectConsumers(declaration);
  assert.equal(globalThis.__xdownloadAcquisitionStubBridge, undefined,
    'no trusted Host acquisition bridge is ever installed in this demo');
  await assert.rejects(
    qualified.invoke('downloads.acquisition.acquire', { requestId: 'x' }, {}),
    denial('DIS_EXTERNAL_EFFECT_KDP_REQUIRED'),
  );
});

test('N9: actual BUILD refuses a pinned Business source mutated between pin and seal', async () => {
  await assert.rejects(
    buildTallyDomainApp({ override: { modules(modules) {
      const m = modules.find((mod) => mod.packageId === 'business-tally-task-readiness@v2.0.0');
      assert.ok(m, 'the pinned Tally Business module is part of the composition');
      m.moduleSource += '\n// altered between source pin and AOT BUILD';
    } } }),
    (error) => error?.code === 'V10_DIGEST_MISMATCH',
  );
});

test('N10: actual BUILD refuses an unselected acquisition handler route', async () => {
  await assert.rejects(
    buildDownloadDomainApp({ override: { routes(routes) {
      const r = routes.find((route) => route.intentId === 'confirmDownload');
      assert.ok(r, 'the confirmDownload route is part of the composition');
      r.handlerId = 'unselectedHandler';
    } } }),
    (error) => error?.code === 'V10_ROUTE_INVALID',
  );
});

