import assert from 'node:assert/strict';
import { test } from 'node:test';
// Element contract modules have runtime sibling imports, so tests consume the
// compiled dist output (same idiom as kdp-primary.test.ts for boot/bindings);
// `npm test` always runs the package build before the strip-types runner.
import { ElementContractError } from '../dist/element/errors.js';
import { ELEMENT_MANIFEST_SCHEMA, parseElementManifest } from '../dist/element/manifest.js';

// Real Element/Function manifest shape from PR #1497
// (examples/dis-v020-cross-project/manifest.json, Tally + Runx + xDownload),
// extended with the typed input/output schema refs mandated by issue #1530.
const RAW = {
  schema: ELEMENT_MANIFEST_SCHEMA,
  origin: 'kaicreator-mm',
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
        {
          id: 'tally.tasks',
          description: '工程 Task 的 Claim/Evidence 评估',
          functions: [
            { id: 'assessTaskEvidence', exportName: 'assessTaskEvidence', source: 'tally/business.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/task-evidence.input.json', outputSchemaRef: 'schemas/tally/task-evidence.output.json' },
            { id: 'describeBusinessPolicy', exportName: 'getPolicy', source: 'tally/business.mjs', implementation: 'knowledge', effects: 'none', inputSchemaRef: 'schemas/tally/policy.input.json', outputSchemaRef: 'schemas/tally/policy.output.json' },
          ],
        },
        {
          id: 'tally.release',
          description: '独立 RQ 授权前的证据投影',
          dependsOn: ['tally.tasks'],
          functions: [
            { id: 'projectReleaseReadiness', exportName: 'projectReleaseReadiness', source: 'tally/release-readiness.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/release-readiness.input.json', outputSchemaRef: 'schemas/tally/release-readiness.output.json' },
          ],
        },
      ],
    },
    {
      id: 'runx',
      repository: 'kaicreator-mm/runx',
      sourceCommit: 'b9e0c953d9bfd5834315012426fd8e10c21bdd7c',
      domainId: 'execution-environment',
      sources: [
        { file: 'runx/environment-agent-presence.ts', originalPath: 'packages/control-plane/src/environment-agent-presence.ts', gitBlob: 'b2c669537a56638aeead4f55914533b00fe3935e' },
      ],
      elements: [
        {
          id: 'runx.agent.presence',
          description: '已观察 Agent incarnation 的进程内状态型能力',
          functions: [
            { id: 'createPresenceObserver', exportName: 'EnvironmentAgentPresence', source: 'runx/environment-agent-presence.ts', implementation: 'stateful', effects: 'none', inputSchemaRef: 'schemas/runx/presence.input.json', outputSchemaRef: 'schemas/runx/presence.output.json' },
          ],
        },
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
        {
          id: 'downloads.confirmation',
          description: '确认下载 Intent 与字节预算',
          functions: [
            { id: 'describeDownloadPolicy', exportName: 'getPolicy', source: 'xdownload/business-download.mjs', implementation: 'knowledge', effects: 'none', inputSchemaRef: 'schemas/xdownload/download-policy.input.json', outputSchemaRef: 'schemas/xdownload/download-policy.output.json' },
          ],
        },
        {
          id: 'downloads.acquisition',
          description: '受 KDP permit 约束的真实外部采集 Effect',
          dependsOn: ['downloads.confirmation'],
          functions: [
            { id: 'acquire', exportName: 'acquire', source: 'xdownload/capability-acquisition-stub.mjs', implementation: 'external-effect', effects: 'non-idempotent', inputSchemaRef: 'schemas/xdownload/acquisition.input.json', outputSchemaRef: 'schemas/xdownload/acquisition.output.json' },
          ],
        },
      ],
    },
  ],
};

const fresh = () => structuredClone(RAW) as typeof RAW;
const mutate = (change: (manifest: typeof RAW) => void): unknown => {
  const manifest = fresh();
  change(manifest);
  return manifest;
};
const throwsCode = (fn: () => unknown, code: string, detail?: RegExp): void => {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof ElementContractError) || error.code !== code) return false;
    return detail === undefined || detail.test(error.detail);
  });
};

test('PR #1497 cross-project manifest shape parses with Tally, Runx and xDownload Elements intact', () => {
  const manifest = parseElementManifest(fresh());
  assert.equal(manifest.schema, ELEMENT_MANIFEST_SCHEMA);
  assert.equal(manifest.origin, 'kaicreator-mm');
  assert.deepEqual(manifest.consumers.map((consumer) => consumer.id), ['tally', 'runx', 'xdownload']);
  const [tally, runx, xdownload] = manifest.consumers;
  assert.deepEqual(tally.elements.map((element) => element.id), ['tally.tasks', 'tally.release']);
  assert.deepEqual(tally.elements[1].dependsOn, ['tally.tasks']);
  assert.deepEqual(tally.elements[0].functions.map((fn) => [fn.id, fn.implementation, fn.effects]), [
    ['assessTaskEvidence', 'rule', 'none'],
    ['describeBusinessPolicy', 'knowledge', 'none'],
  ]);
  assert.equal(tally.elements[0].functions[1].exportName, 'getPolicy');
  assert.equal(runx.elements[0].functions[0].implementation, 'stateful');
  assert.deepEqual(xdownload.elements.map((element) => element.id), ['downloads.confirmation', 'downloads.acquisition']);
  const acquire = xdownload.elements[1].functions[0];
  assert.deepEqual([acquire.id, acquire.implementation, acquire.effects], ['acquire', 'external-effect', 'non-idempotent']);
  assert.equal(acquire.inputSchemaRef, 'schemas/xdownload/acquisition.input.json');
  assert.equal(acquire.outputSchemaRef, 'schemas/xdownload/acquisition.output.json');
  assert.deepEqual(tally.sources[0], { file: 'tally/business.mjs', originalPath: 'packages/tally-engineering-business/src/index.mjs', gitBlob: '54015fb63ffb13b4f4e562f660d2172098b5f7f4' });
  assert.deepEqual(manifest.relations, [{ from: 'downloads.confirmation', to: 'downloads.acquisition', kind: 'constrains' }]);
});

test('all five implementation kinds and all three effect modes are accepted', () => {
  const manifest = fresh();
  manifest.consumers = [{
    id: 'matrix',
    repository: 'kaicreator-mm/domain-harness',
    sourceCommit: 'b1b2c182c1cb49c1b63b1efaf57ff9132d9cf4b0',
    domainId: 'matrix',
    sources: [{ file: 'matrix/all.mjs', originalPath: 'packages/matrix/src/all.mjs', gitBlob: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
    elements: [
      { id: 'matrix.rule', description: 'rule', functions: [{ id: 'm.rule', exportName: 'rule', source: 'matrix/all.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/m.in.json', outputSchemaRef: 'schemas/m.out.json' }] },
      { id: 'matrix.knowledge', description: 'knowledge', functions: [{ id: 'm.knowledge', exportName: 'knowledge', source: 'matrix/all.mjs', implementation: 'knowledge', effects: 'idempotent', inputSchemaRef: 'schemas/m.in.json', outputSchemaRef: 'schemas/m.out.json' }] },
      { id: 'matrix.code', description: 'code', functions: [{ id: 'm.code', exportName: 'code', source: 'matrix/all.mjs', implementation: 'code', effects: 'non-idempotent', inputSchemaRef: 'schemas/m.in.json', outputSchemaRef: 'schemas/m.out.json' }] },
      { id: 'matrix.stateful', description: 'stateful', functions: [{ id: 'm.stateful', exportName: 'stateful', source: 'matrix/all.mjs', implementation: 'stateful', effects: 'none', inputSchemaRef: 'schemas/m.in.json', outputSchemaRef: 'schemas/m.out.json' }] },
      { id: 'matrix.external', description: 'external-effect', functions: [{ id: 'm.external', exportName: 'external', source: 'matrix/all.mjs', implementation: 'external-effect', effects: 'non-idempotent', inputSchemaRef: 'schemas/m.in.json', outputSchemaRef: 'schemas/m.out.json' }] },
    ],
  }];
  manifest.relations = [];
  const parsed = parseElementManifest(manifest);
  assert.deepEqual(parsed.consumers[0].elements.map((element) => element.functions[0].implementation),
    ['rule', 'knowledge', 'code', 'stateful', 'external-effect']);
  assert.deepEqual(parsed.consumers[0].elements.map((element) => element.functions[0].effects),
    ['none', 'idempotent', 'non-idempotent', 'none', 'non-idempotent']);
});

test('unknown Function field is rejected with its exact locator', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.consumers[0].elements[0].functions[0] as Record<string, unknown>).retryPolicy = 'none';
  })), 'ELEMENT_FIELD_UNKNOWN', /\.functions\[0\]\.retryPolicy/);
});

test('unknown Element field is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.consumers[2].elements[1] as Record<string, unknown>).relations = [];
  })), 'ELEMENT_FIELD_UNKNOWN', /elements\[1\]\.relations/);
});

test('unknown manifest-level field is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m as Record<string, unknown>).signatures = {};
  })), 'ELEMENT_FIELD_UNKNOWN', /manifest\.signatures/);
});

test('unknown implementation kind is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.consumers[0].elements[0].functions[0] as Record<string, unknown>).implementation = 'interaction';
  })), 'ELEMENT_IMPLEMENTATION_KIND_INVALID', /interaction/);
});

test('unknown effect mode is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.consumers[2].elements[1].functions[0] as Record<string, unknown>).effects = 'governed';
  })), 'ELEMENT_EFFECTS_INVALID', /governed/);
});

test('foreign or missing schema identifier is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m as Record<string, unknown>).schema = 'dis.v0.2.other/1';
  })), 'ELEMENT_MANIFEST_SCHEMA_INVALID', /dis\.v0\.2\.other\/1/);
  throwsCode(() => parseElementManifest(mutate((m) => {
    delete (m as Record<string, unknown>).schema;
  })), 'ELEMENT_FIELD_MISSING', /manifest\.schema/);
});

test('duplicate Element id across consumers is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    const clone = structuredClone(m.consumers[0].elements[0]) as typeof m.consumers[0][number];
    for (const fn of clone.functions) fn.source = 'runx/environment-agent-presence.ts';
    m.consumers[1].elements.push(clone);
  })), 'ELEMENT_ID_DUPLICATE');
});

test('duplicate Function id across Elements is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    m.consumers[2].elements[1].functions.push(structuredClone(m.consumers[2].elements[0].functions[0]));
  })), 'ELEMENT_ID_DUPLICATE');
});

test('Function source outside the consumer-declared sources is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.consumers[2].elements[1].functions[0] as Record<string, unknown>).source = 'tally/business.mjs';
  })), 'ELEMENT_SOURCE_UNRESOLVED', /tally\/business\.mjs/);
});

test('missing required Function field is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    delete (m.consumers[0].elements[0].functions[0] as Record<string, unknown>).exportName;
  })), 'ELEMENT_FIELD_MISSING', /exportName/);
});

test('malformed git blob pin is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.consumers[2].sources[0] as Record<string, unknown>).gitBlob = 'not-a-blob';
  })), 'ELEMENT_GIT_BLOB_INVALID');
});

test('duplicate dependsOn entry is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    m.consumers[0].elements[1].dependsOn = ['tally.tasks', 'tally.tasks'];
  })), 'ELEMENT_DEPENDENCY_DUPLICATE');
});

test('malformed dependsOn identifier is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    m.consumers[0].elements[1].dependsOn = ['not an id'];
  })), 'ELEMENT_FIELD_TYPE_INVALID');
});

test('unknown semantic relation field is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.relations[0] as Record<string, unknown>).authority = 'GLOBAL';
  })), 'ELEMENT_FIELD_UNKNOWN', /relations\[0\]\.authority/);
});

test('malformed semantic relation kind is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    (m.relations[0] as Record<string, unknown>).kind = 'depends on';
  })), 'ELEMENT_RELATION_INVALID');
});

test('duplicate semantic relation is rejected', () => {
  throwsCode(() => parseElementManifest(mutate((m) => {
    m.relations.push(structuredClone(m.relations[0]));
  })), 'ELEMENT_RELATION_DUPLICATE');
});

test('non-object manifest input is rejected', () => {
  for (const input of [null, 42, 'manifest', []]) {
    throwsCode(() => parseElementManifest(input), 'ELEMENT_MANIFEST_TYPE_INVALID');
  }
});
