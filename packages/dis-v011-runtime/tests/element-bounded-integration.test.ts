import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
// I0 integration (#1529): the D1 element-first contract layer (#1530) and the
// D2 bounded execution envelope (#1531) compose — a locked Function runs
// inside the bounded envelope and every outcome stays unattested. Element
// modules have runtime sibling imports, so tests consume the compiled dist
// output (same idiom as element-*.test.ts); the bounded envelope has zero
// runtime relative imports and is imported from source (same idiom as
// bounded-*.test.ts).
import {
  ELEMENT_MANIFEST_SCHEMA, parseElementManifest, resolveDependencyClosure,
  validateSemanticRelations, lockAot, assertFunctionBindings,
} from '../dist/element/index.js';
import { digest } from '../src/knowledge.ts';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';

// Rule implementations whose exact source bytes are what the AOT lock seals
// and what the bounded envelope executes.
const ASSESS_SOURCE = 'export function assessTaskEvidence(claims) {\n'
  + '  const admitted = claims.filter((c) => c.status === "PASS" || c.status === "FAIL");\n'
  + '  return { admitted: admitted.length, unknown: claims.length - admitted.length };\n'
  + '}\n';
const PROJECT_SOURCE = 'export function projectReleaseReadiness(assessment) {\n'
  + '  return { ready: assessment.admitted > 0 && assessment.unknown === 0 };\n'
  + '}\n';

/** True Git blob object id of the fixture bytes (`git hash-object` semantics). */
function gitBlobOf(content: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(content, 'utf8')}\0${content}`).digest('hex');
}

const MANIFEST = {
  schema: ELEMENT_MANIFEST_SCHEMA,
  relations: [
    { from: 'demo.tasks', to: 'demo.release', kind: 'feeds' },
  ],
  consumers: [
    {
      id: 'demo',
      repository: 'kaicreator-mm/domain-harness',
      sourceCommit: 'b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0',
      domainId: 'dis-runtime-011-integration',
      sources: [
        { file: 'demo/assess.mjs', originalPath: 'packages/dis-v011-runtime/tests/fixtures/assess.mjs', gitBlob: gitBlobOf(ASSESS_SOURCE) },
        { file: 'demo/project.mjs', originalPath: 'packages/dis-v011-runtime/tests/fixtures/project.mjs', gitBlob: gitBlobOf(PROJECT_SOURCE) },
      ],
      elements: [
        { id: 'demo.tasks', description: 'I0 composition: assess pinned claims', functions: [
          { id: 'assessTaskEvidence', exportName: 'assessTaskEvidence', source: 'demo/assess.mjs', implementation: 'rule', effects: 'none',
            inputSchemaRef: 'schemas/demo/task-evidence.input.json', outputSchemaRef: 'schemas/demo/task-evidence.output.json' },
        ] },
        { id: 'demo.release', description: 'I0 composition: project readiness from assessment', dependsOn: ['demo.tasks'], functions: [
          { id: 'projectReleaseReadiness', exportName: 'projectReleaseReadiness', source: 'demo/project.mjs', implementation: 'rule', effects: 'none',
            inputSchemaRef: 'schemas/demo/release-readiness.input.json', outputSchemaRef: 'schemas/demo/release-readiness.output.json' },
        ] },
      ],
    },
  ],
};

function sealDemoAot() {
  const manifest = parseElementManifest(MANIFEST);
  const closure = resolveDependencyClosure(manifest);
  validateSemanticRelations(manifest);
  const lock = lockAot(manifest, {
    assessTaskEvidence: { path: 'demo/assess.mjs', sha256: digest(ASSESS_SOURCE), target: 'linux-x64-node24' },
    projectReleaseReadiness: { path: 'demo/project.mjs', sha256: digest(PROJECT_SOURCE), target: 'linux-x64-node24' },
  }, { expectedTarget: 'linux-x64-node24' });
  assertFunctionBindings(lock, {
    assessTaskEvidence: { path: 'demo/assess.mjs', target: 'linux-x64-node24', content: ASSESS_SOURCE },
    projectReleaseReadiness: { path: 'demo/project.mjs', target: 'linux-x64-node24', content: PROJECT_SOURCE },
  });
  return { manifest, closure, lock };
}

// Mirrors the sealed rule implementations; the envelope executes these while
// the lock guarantees the bytes they were sealed from.
function assess(claims: { status: string }[]): { admitted: number; unknown: number } {
  const admitted = claims.filter((c) => c.status === 'PASS' || c.status === 'FAIL');
  return { admitted: admitted.length, unknown: claims.length - admitted.length };
}
function project(assessment: { admitted: number; unknown: number }): { ready: boolean } {
  return { ready: assessment.admitted > 0 && assessment.unknown === 0 };
}

test('D1 AOT lock composes with the D2 bounded envelope: locked Functions run unattested', async () => {
  const { closure, lock } = sealDemoAot();
  assert.deepEqual(closure.order, ['demo.tasks', 'demo.release']);
  assert.equal(lock.closure.length, 2);

  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 2, maxWorkUnits: 4, wallClockMs: 5_000 },
    providers: [{ kind: 'local-deterministic', id: 'i0-rule-runner' }],
  });

  const assessment = await envelope.execute<{ admitted: number; unknown: number }>({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 2 }, async () => assess([
      { status: 'PASS' }, { status: 'FAIL' }, { status: 'UNKNOWN' },
    ])),
  });
  assert.equal(assessment.status, 'COMPLETED');
  assert.equal(assessment.disposition, 'OBSERVED');
  assert.equal(assessment.attested, false);
  assert.equal(assessment.authority, 'NONE');
  assert.deepEqual(assessment.output, { admitted: 2, unknown: 1 });

  // Second Function of the sealed chain reuses the SAME shared ledger: the
  // remaining single step closes the chain and the envelope then fails
  // closed on further work instead of silently overspending.
  const readiness = await envelope.execute<{ ready: boolean }>({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () => project(assessment.output!)),
  });
  assert.equal(readiness.status, 'COMPLETED');
  assert.deepEqual(readiness.output, { ready: false });

  const exhausted = await envelope.execute<unknown>({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () => project({ admitted: 0, unknown: 0 })),
  });
  assert.equal(exhausted.status, 'BUDGET_EXHAUSTED');
  assert.equal(exhausted.axis, 'steps');
  assert.equal(exhausted.output, null);
  assert.equal(exhausted.attested, false);

  // Sealing is deterministic and rejects drifted bytes: the composed chain
  // stays bound to the exact locked digests.
  const resealed = sealDemoAot();
  assert.equal(resealed.lock.lockSha256, lock.lockSha256);
  assert.throws(
    () => assertFunctionBindings(lock, {
      assessTaskEvidence: { path: 'demo/assess.mjs', target: 'linux-x64-node24', content: ASSESS_SOURCE + ' ' },
      projectReleaseReadiness: { path: 'demo/project.mjs', target: 'linux-x64-node24', content: PROJECT_SOURCE },
    }),
    /ELEMENT_FUNCTION_DIGEST_MISMATCH/,
  );
});
