// v0.8 T-G #1006 targeted gap batch 3 — FR11 "Typed compiled Domain Data"
// consumer P/N.
//
// The frozen candidate b151320 already executes the compiler-side emission
// (compiler domain-data-section / domain-data-schema-contract suites) and
// the boot/identity digest refusal on real compiler output
// (n00-n05-static N03 torn body). The two absent consumer observables
// recorded in the successor ledger are added here:
//   P — a real successor runtime on a real SQLite file reads the compiled
//       typed Domain Data of the PUBLIC compiler output through the
//       runtime's CompiledDomainDataPort into a projection query result;
//   N — a fully self-consistent package (tier descriptor digest AND
//       packageId honestly recomputed after tampering) whose bundled value
//       violates its own compiled valueSchema is refused at consumer
//       admission: the boundary holds even against a compromised producer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { createNodeDomainRuntime } from '../../src/index.js';
import { StaticPackageRegistry } from '@kaicreator/domain-harness';
import { canonicalJsonStringify } from '@kaicreator/domain-harness/v2';
import { computeCompiledPackageId } from '../../../../packages/domain-harness/src/package/validation.js';
import type { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import {
  CRM_SNAPSHOT,
  HOST_MAXIMA,
  compileSuccessor,
  createNodeHost,
  freshDbPath,
  openStore,
  sha256,
} from './helper.ts';

const NOW = () => '2026-10-15T00:00:00.000Z';

// Real BusinessSnapshotPort serving the shared CRM fixture record; the
// e07-e08 raw record is NOT a port and only worked there because no
// projection was ever read.
const CRM_SNAPSHOT_PORT = {
  async read(request: { source: string; key: string }) {
    if (request.source !== CRM_SNAPSHOT.source || request.key !== CRM_SNAPSHOT.key) {
      throw new Error(`business snapshot not found: ${request.source}/${request.key}`);
    }
    return { ...CRM_SNAPSHOT };
  },
} as const;

const TIER_SCHEMA = {
  type: 'object',
  required: ['level'],
  additionalProperties: false,
  properties: { level: { type: 'integer', minimum: 0 } },
} as const;

interface CompiledFixture {
  readonly manifest: ReturnType<typeof compileSuccessor>['manifest'];
  readonly domainData: Record<string, unknown>;
}

async function boot(
  fixture: CompiledFixture,
  dbTag: string,
): Promise<{ readonly runtime: Awaited<ReturnType<typeof createNodeDomainRuntime>>; readonly store: NodeSqliteRuntimeStore }> {
  const { path } = freshDbPath(dbTag);
  const store = openStore(path);
  const runtime = await createNodeDomainRuntime({
    packageRegistry: new StaticPackageRegistry(
      [{ manifest: fixture.manifest, bindings: {}, domainData: fixture.domainData }],
      fixture.manifest.packageId,
    ),
    store,
    bindings: createNodeHost(),
    businessSnapshots: CRM_SNAPSHOT_PORT,
    supportedPackageDataBounds: HOST_MAXIMA,
    now: NOW,
  });
  return { runtime, store };
}

function compileTypedTier(): CompiledFixture {
  const compiled = compileSuccessor({
    domainData: [{ key: 'tier', value: { level: 1 }, valueSchema: TIER_SCHEMA }],
  });
  return { manifest: compiled.manifest, domainData: compiled.domainData as Record<string, unknown> };
}

test('FR11-P: a successor runtime reads PUBLIC-compiler typed Domain Data through the runtime port into a projection', async () => {
  const fixture = compileTypedTier();

  // The typed contract itself is compiled into the manifest descriptor.
  const descriptor = fixture.manifest.domainData?.find((entry) => entry.key === 'tier');
  assert.ok(descriptor, 'manifest carries the tier domain-data descriptor');
  assert.equal(descriptor.valueSchema?.type, 'object');
  assert.equal((descriptor.valueSchema as { properties?: { level?: { minimum?: number } } })?.properties?.level?.minimum, 0);

  const { runtime, store } = await boot(fixture, 'fr11-p');
  try {
    const result = await runtime.query({ kind: 'projection', projectionId: 'overview', key: 'case-1' });
    assert.equal(result.kind, 'projection');
    const evaluated = result.value.value as {
      domainData: Array<{ key: string; value: unknown }>;
    };
    // Typed read-through: the exact compiled value reached the evaluator
    // through the runtime's CompiledDomainDataPort, not a host map. (The
    // bundled record is a null-prototype object by compiler design, so the
    // assertion is structural rather than deepStrictEqual.)
    assert.equal(evaluated.domainData.length, 1);
    assert.equal(evaluated.domainData[0]?.key, 'tier');
    assert.deepEqual(JSON.parse(JSON.stringify(evaluated.domainData[0]?.value)), { level: 1 });
    assert.equal(result.value.packageId, fixture.manifest.packageId);
  } finally {
    await store.close();
  }
}, 120_000);

test('FR11-N: a self-consistent package whose bundled value violates its compiled valueSchema fails consumer admission', async () => {
  const fixture = compileTypedTier();

  // Compromised-producer tamper: violate the schema, then recompute every
  // identity-bearing digest honestly so ONLY the schema contract is wrong.
  const manifest = structuredClone(fixture.manifest) as typeof fixture.manifest;
  const domainData = structuredClone(fixture.domainData) as Record<string, { level: number }>;
  domainData.tier = { level: -1 };
  const descriptor = manifest.domainData?.find((entry) => entry.key === 'tier');
  assert.ok(descriptor);
  descriptor.contentDigest = createHash('sha256')
    .update(canonicalJsonStringify({ level: -1 }))
    .digest('hex');
  manifest.packageId = await computeCompiledPackageId(manifest, sha256);
  assert.match(manifest.packageId, /^[0-9a-f]{64}$/u);

  const { path } = freshDbPath('fr11-n');
  const store = openStore(path);
  try {
    await assert.rejects(
      createNodeDomainRuntime({
        packageRegistry: new StaticPackageRegistry(
          [{ manifest, bindings: {}, domainData }],
          manifest.packageId,
        ),
        store,
        bindings: createNodeHost(),
        businessSnapshots: CRM_SNAPSHOT_PORT,
        supportedPackageDataBounds: HOST_MAXIMA,
        now: NOW,
      }),
      (error: unknown) =>
        (error as { code?: string }).code === 'DOMAIN_DATA_SCHEMA_VIOLATION',
      'consumer admission must re-validate valueSchema even when digests and packageId are honestly recomputed',
    );
  } finally {
    await store.close();
  }
}, 120_000);
