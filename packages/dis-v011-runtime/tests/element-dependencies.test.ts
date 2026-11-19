import assert from 'node:assert/strict';
import { test } from 'node:test';
// Element contract modules have runtime sibling imports, so tests consume the
// compiled dist output (same idiom as kdp-primary.test.ts for boot/bindings).
import { resolveDependencyClosure, validateSemanticRelations } from '../dist/element/dependencies.js';
import { ElementContractError } from '../dist/element/errors.js';
import { ELEMENT_MANIFEST_SCHEMA, parseElementManifest } from '../dist/element/manifest.js';

// Same PR #1497 cross-project Element shape as the manifest fixture:
// tally.release -> tally.tasks and downloads.acquisition -> downloads.confirmation.
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
      sources: [{ file: 'tally/business.mjs', originalPath: 'packages/tally-engineering-business/src/index.mjs', gitBlob: '54015fb63ffb13b4f4e562f660d2172098b5f7f4' }],
      elements: [
        { id: 'tally.tasks', description: '工程 Task 的 Claim/Evidence 评估', functions: [
          { id: 'assessTaskEvidence', exportName: 'assessTaskEvidence', source: 'tally/business.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/task-evidence.input.json', outputSchemaRef: 'schemas/tally/task-evidence.output.json' },
        ] },
        { id: 'tally.release', description: '独立 RQ 授权前的证据投影', dependsOn: ['tally.tasks'], functions: [
          { id: 'projectReleaseReadiness', exportName: 'projectReleaseReadiness', source: 'tally/business.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/release-readiness.input.json', outputSchemaRef: 'schemas/tally/release-readiness.output.json' },
        ] },
      ],
    },
    {
      id: 'xdownload',
      repository: 'kaicreator-mm/xDownload',
      sourceCommit: 'e904f08c478b15147b1c07fbe53c610d2d81851f',
      domainId: 'downloads',
      sources: [{ file: 'xdownload/business.mjs', originalPath: 'packages/download-domain-app/src/business/business-download.mjs', gitBlob: 'a7dba9a896de0b84fc6d54093563adca2ccbcdfc' }],
      elements: [
        { id: 'downloads.confirmation', description: '确认下载 Intent 与字节预算', functions: [
          { id: 'describeDownloadPolicy', exportName: 'getPolicy', source: 'xdownload/business.mjs', implementation: 'knowledge', effects: 'none', inputSchemaRef: 'schemas/xdownload/download-policy.input.json', outputSchemaRef: 'schemas/xdownload/download-policy.output.json' },
        ] },
        { id: 'downloads.acquisition', description: '受 KDP permit 约束的真实外部采集 Effect', dependsOn: ['downloads.confirmation'], functions: [
          { id: 'acquire', exportName: 'acquire', source: 'xdownload/business.mjs', implementation: 'external-effect', effects: 'non-idempotent', inputSchemaRef: 'schemas/xdownload/acquisition.input.json', outputSchemaRef: 'schemas/xdownload/acquisition.output.json' },
        ] },
      ],
    },
  ],
};

const parse = (change?: (manifest: typeof RAW) => void) => {
  const manifest = structuredClone(RAW) as typeof RAW;
  if (change) change(manifest);
  return parseElementManifest(manifest);
};
const throwsCode = (fn: () => unknown, code: string, detail?: RegExp): void => {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof ElementContractError) || error.code !== code) return false;
    return detail === undefined || detail.test(error.detail);
  });
};

test('static closure resolves #1497 chains in dependency-first order with exact transitive sets', () => {
  const closure = resolveDependencyClosure(parse());
  assert.deepEqual(closure.order, ['tally.tasks', 'tally.release', 'downloads.confirmation', 'downloads.acquisition']);
  assert.deepEqual(closure.closure['tally.tasks'], []);
  assert.deepEqual(closure.closure['tally.release'], ['tally.tasks']);
  assert.deepEqual(closure.closure['downloads.acquisition'], ['downloads.confirmation']);
});

test('semantic collaboration cycles are legal metadata and never enter the static closure (R3)', () => {
  const manifest = parse((m) => {
    m.relations.push(
      { from: 'downloads.acquisition', to: 'downloads.confirmation', kind: 'cooperates' },
      { from: 'tally.tasks', to: 'tally.release', kind: 'constrains' },
      { from: 'tally.release', to: 'tally.tasks', kind: 'cooperates' },
    );
  });
  const relations = validateSemanticRelations(manifest);
  assert.equal(relations.length, 4);
  assert.ok(relations.some((relation) => relation.from === 'downloads.acquisition' && relation.to === 'downloads.confirmation'));
  const closure = resolveDependencyClosure(manifest);
  assert.deepEqual(closure.closure['downloads.acquisition'], ['downloads.confirmation']);
  assert.deepEqual(closure.order, ['tally.tasks', 'tally.release', 'downloads.confirmation', 'downloads.acquisition']);
});

test('missing dependency reference fails closed with the dangling edge as detail', () => {
  throwsCode(() => resolveDependencyClosure(parse((m) => {
    m.consumers[0].elements[1].dependsOn.push('tally.missing');
  })), 'ELEMENT_DEPENDENCY_UNRESOLVED', /tally\.release->tally\.missing/);
});

test('self dependency fails closed', () => {
  throwsCode(() => resolveDependencyClosure(parse((m) => {
    m.consumers[0].elements[0].dependsOn = ['tally.tasks'];
  })), 'ELEMENT_DEPENDENCY_SELF', /tally\.tasks/);
});

test('static dependency cycle A->B->A fails closed with the cycle path as detail', () => {
  throwsCode(() => resolveDependencyClosure(parse((m) => {
    m.consumers[1].elements[0].dependsOn = ['downloads.acquisition'];
  })), 'ELEMENT_DEPENDENCY_CYCLE', /downloads\.(confirmation|acquisition)->downloads\.(confirmation|acquisition)->/);
});

test('three-element static dependency cycle fails closed', () => {
  throwsCode(() => resolveDependencyClosure(parse((m) => {
    m.consumers[0].elements[0].dependsOn = ['tally.release'];
    m.consumers[0].elements[1].dependsOn = ['tally.tasks', 'downloads.confirmation'];
    m.consumers[1].elements[0].dependsOn = ['tally.tasks'];
  })), 'ELEMENT_DEPENDENCY_CYCLE');
});

test('semantic relation endpoint outside declared Elements fails closed', () => {
  throwsCode(() => validateSemanticRelations(parse((m) => {
    m.relations.push({ from: 'downloads.acquisition', to: 'ghost.element', kind: 'cooperates' });
  })), 'ELEMENT_RELATION_ENDPOINT_INVALID', /relations\[1\]\.to:ghost\.element/);
});
