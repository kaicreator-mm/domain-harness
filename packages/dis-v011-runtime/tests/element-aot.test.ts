import assert from 'node:assert/strict';
import { test } from 'node:test';
// Element contract modules have runtime sibling imports, so tests consume the
// compiled dist output (same idiom as kdp-primary.test.ts for boot/bindings).
import { assertFunctionBindings, lockAot, resolveLockedFunction } from '../dist/element/aot.js';
import type { AotArtifactPin, AotImplementationCandidate } from '../dist/element/aot.js';
import { resolveDependencyClosure } from '../dist/element/dependencies.js';
import { ElementContractError } from '../dist/element/errors.js';
import { ELEMENT_MANIFEST_SCHEMA, parseElementManifest } from '../dist/element/manifest.js';
import { digest } from '../src/knowledge.ts';

// Same PR #1497 cross-project Element shape (Tally + xDownload) as the other
// element fixtures, plus implementation bytes per public Function.
const RAW = {
  schema: ELEMENT_MANIFEST_SCHEMA,
  relations: [
    { from: 'downloads.confirmation', to: 'downloads.acquisition', kind: 'constrains' },
  ],
  consumers: [
    {
      id: 'tally',
      repository: 'kaicreator-mm/tally',
      sourceCommit: 'e988321439f65b55936a691c02250b6d62a29409',
      domainId: 'tally-engineering',
      sources: [
        { file: 'tally/business.mjs', originalPath: 'packages/tally-engineering-business/src/index.mjs', gitBlob: '54015fb63ffb13b4f4e562f660d2172098b5f7f4' },
        { file: 'tally/release-readiness.mjs', originalPath: 'packages/tally-engineering-business/src/release-readiness.mjs', gitBlob: '2d4d6e7462156e4466192a0ed3207ac76fd288e1' },
      ],
      elements: [
        { id: 'tally.tasks', description: '工程 Task 的 Claim/Evidence 评估', functions: [
          { id: 'assessTaskEvidence', exportName: 'assessTaskEvidence', source: 'tally/business.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/task-evidence.input.json', outputSchemaRef: 'schemas/tally/task-evidence.output.json' },
          { id: 'describeBusinessPolicy', exportName: 'getPolicy', source: 'tally/business.mjs', implementation: 'knowledge', effects: 'none', inputSchemaRef: 'schemas/tally/policy.input.json', outputSchemaRef: 'schemas/tally/policy.output.json' },
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
        { file: 'xdownload/business-download.mjs', originalPath: 'packages/download-domain-app/src/business/business-download.mjs', gitBlob: 'a7dba9a896de0b84fc6d54093563adca2ccbcdfc' },
        { file: 'xdownload/capability-acquisition-stub.mjs', originalPath: 'packages/download-domain-app/src/business/capability-acquisition-stub.mjs', gitBlob: '2bfa722f88abade392b33964820ea178c072ef39' },
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

const FUNCTION_IDS = ['assessTaskEvidence', 'describeBusinessPolicy', 'projectReleaseReadiness',
  'describeDownloadPolicy', 'acquire'];
const CONTENT: Record<string, string> = Object.fromEntries(FUNCTION_IDS.map((id) => [id,
  `export function ${id}(input) { /* ${id} selected implementation bytes */ return input; }\n`]));
const TARGET = 'node24';

const parse = (change?: (manifest: typeof RAW) => void) => {
  const manifest = structuredClone(RAW) as typeof RAW;
  if (change) change(manifest);
  return parseElementManifest(manifest);
};
const pins = (changes: Record<string, Partial<AotArtifactPin>> = {}): Record<string, AotArtifactPin> =>
  Object.fromEntries(FUNCTION_IDS.map((id) => [id, {
    path: 'impl/' + id + '.mjs', sha256: digest(CONTENT[id]), target: TARGET, ...changes[id] }]));
const candidates = (changes: Record<string, Partial<AotImplementationCandidate>> = {}): Record<string, AotImplementationCandidate> =>
  Object.fromEntries(FUNCTION_IDS.map((id) => [id, {
    path: 'impl/' + id + '.mjs', target: TARGET, content: CONTENT[id], ...changes[id] }]));
const throwsCode = (fn: () => unknown, code: string, detail?: RegExp): void => {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof ElementContractError) || error.code !== code) return false;
    return detail === undefined || detail.test(error.detail);
  });
};

test('full contract chain passes on the #1497 shape: parse, closure, AOT lock, resolve and bindings', () => {
  const manifest = parse();
  const closure = resolveDependencyClosure(manifest);
  const lock = lockAot(manifest, pins(), { expectedTarget: TARGET });
  assert.match(lock.lockSha256, /^[a-f0-9]{64}$/);
  assert.match(lock.manifestSha256, /^[a-f0-9]{64}$/);
  assert.equal(lock.schema, ELEMENT_MANIFEST_SCHEMA);
  assert.deepEqual(lock.closure, closure.order);
  assert.deepEqual(Object.keys(lock.entries).sort(), [...FUNCTION_IDS].sort());
  // The sealed lock is frozen: no hot mutation of sealed entries.
  assert.equal(Object.isFrozen(lock), true);
  assert.equal(Object.isFrozen(lock.entries), true);
  assert.equal(Object.isFrozen(lock.entries['acquire']), true);
  assertFunctionBindings(lock, candidates());
  for (const id of FUNCTION_IDS) {
    const entry = resolveLockedFunction(lock, id);
    assert.deepEqual([entry.functionId, entry.path, entry.target],
      [id, 'impl/' + id + '.mjs', TARGET]);
    assert.equal(entry.sha256, digest(CONTENT[id]));
  }
});

test('lock digest is deterministic for identical input and changes with any sealed byte', () => {
  const manifest = parse();
  const first = lockAot(manifest, pins());
  const second = lockAot(parse(), pins());
  assert.equal(first.lockSha256, second.lockSha256);
  const drifted = lockAot(manifest, pins({ acquire: { sha256: digest(CONTENT['acquire'] + '\n// drift') } }));
  assert.notEqual(first.lockSha256, drifted.lockSha256);
  const dependencyDrift = lockAot(parse((m) => {
    m.consumers[0].elements[1].dependsOn = [];
  }), pins());
  assert.notEqual(first.lockSha256, dependencyDrift.lockSha256);
});

test('unbound Function is refused at lock time', () => {
  const incomplete = pins();
  delete incomplete['acquire'];
  throwsCode(() => lockAot(parse(), incomplete), 'ELEMENT_FUNCTION_UNBOUND', /acquire/);
});

test('malformed artifact digest or path is refused at lock time', () => {
  throwsCode(() => lockAot(parse(), pins({ acquire: { sha256: 'deadbeef' } })),
    'ELEMENT_AOT_DIGEST_INVALID', /acquire/);
  throwsCode(() => lockAot(parse(), pins({ acquire: { path: '../escape/acquire.mjs' } })),
    'ELEMENT_AOT_PATH_INVALID', /acquire/);
  throwsCode(() => lockAot(parse(), pins({ acquire: { path: 'impl//acquire.mjs' } })),
    'ELEMENT_AOT_PATH_INVALID');
});

test('artifact target outside the expected target is refused at lock time', () => {
  throwsCode(() => lockAot(parse(), pins({ acquire: { target: 'wasm32' } }), { expectedTarget: TARGET }),
    'ELEMENT_FUNCTION_TARGET_MISMATCH', /acquire:wasm32/);
});

test('resolution and binding only accept sealed entries (no hot insertion)', () => {
  const lock = lockAot(parse(), pins());
  throwsCode(() => resolveLockedFunction(lock, 'hotInsert'), 'ELEMENT_AOT_NOT_LOCKED', /hotInsert/);
  throwsCode(() => assertFunctionBindings(lock, {
    ...candidates(),
    hotInsert: { path: 'impl/hotInsert.mjs', target: TARGET, content: 'export {}\n' },
  }), 'ELEMENT_AOT_NOT_LOCKED', /hotInsert/);
});

test('binding verification fails closed on a Function presented without implementation bytes', () => {
  const lock = lockAot(parse(), pins());
  const partial = candidates();
  delete partial['describeDownloadPolicy'];
  throwsCode(() => assertFunctionBindings(lock, partial), 'ELEMENT_FUNCTION_UNBOUND', /describeDownloadPolicy/);
});

test('binding verification refuses digest drift between sealed pin and presented bytes', () => {
  const lock = lockAot(parse(), pins());
  throwsCode(() => assertFunctionBindings(lock, candidates({
    acquire: { content: CONTENT['acquire'] + '\n// forged bytes' },
  })), 'ELEMENT_FUNCTION_DIGEST_MISMATCH', /acquire/);
});

test('binding verification refuses a target different from the sealed target', () => {
  const lock = lockAot(parse(), pins());
  throwsCode(() => assertFunctionBindings(lock, candidates({
    acquire: { target: 'node22' },
  })), 'ELEMENT_FUNCTION_TARGET_MISMATCH', /acquire:node22/);
});

test('binding verification refuses implementation paths outside the sealed lock', () => {
  const lock = lockAot(parse(), pins());
  throwsCode(() => assertFunctionBindings(lock, candidates({
    acquire: { path: 'impl/unlocked/acquire.mjs' },
  })), 'ELEMENT_AOT_PATH_NOT_LOCKED', /acquire:impl\/unlocked\/acquire\.mjs/);
});
