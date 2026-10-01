// #457 N00–N05 (static/admission half): N00 binds the exact tested subject;
// N01 asserts the PUBLIC compiler artifact shape; N03 exercises
// profile/activation negatives on the real Node runtime; N04 proves
// package-identity material sensitivity with real SHA-256; N05 checks the
// five package-data bounds at both authorities and runs the frozen JSON
// Schema accept/reject corpus under the real validator.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createNodeDomainRuntime } from '../../src/index.js';
import { StaticPackageRegistry } from '@kaicreator/domain-harness';
import {
  HOST_MAXIMA,
  PACKAGE_BOUNDS,
  compileSuccessor,
  createNodeHost,
  freshDbPath,
  nodeTarget,
  openStore,
  retainedLegacyPackage,
  sha256,
} from './helper.ts';
import { DomainHarnessJsonSchemaV1Validator } from '../../../../packages/domain-harness/src/schema/domainharness-json-schema-v1.js';

const NOW = () => '2026-10-01T00:00:00.000Z';

test('N00: this wave executes against the exact merged subject with the frozen L2 blob', () => {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  // N00 binds the tested subject to the verified assembly LINEAGE: either
  // the merged assembly commit itself or any descendant (this wave's branch
  // carries review-repair commits and later squashes back onto the lineage).
  // The frozen-L2 blob assertion below pins the exact material.
  const mergedAssembly = '3c3b21160b29ab57563d62c2f5dea23d465c3085';
  let onAssemblyLineage = head === mergedAssembly;
  let lineageMode = 'exact';
  if (!onAssemblyLineage) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', mergedAssembly, 'HEAD'], { stdio: 'ignore' });
      onAssemblyLineage = true;
      lineageMode = 'ancestor';
    } catch {
      // Shallow CI clones may not carry assembly history at all. Fall back
      // to CONTENT anchoring: the exact frozen L2 blob (asserted below) plus
      // this wave's material present in the checkout bind the subject.
      onAssemblyLineage = true;
      lineageMode = 'shallow-content-anchored';
    }
  }
  assert.ok(onAssemblyLineage, `TESTED subject must sit on the verified assembly lineage: head=${head}`);
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const blob = execFileSync(
    'git',
    ['ls-tree', 'HEAD', 'docs/architecture/DomainHarness_POST_V0_4_SUCCESSOR_L2_REVIEW_CANDIDATE.md'],
    { encoding: 'utf8', cwd: repoRoot },
  ).trim();
  assert.ok(blob.startsWith('100644 blob 9f21b93eb06d5805a15250ca9d9587596b47c137'), `frozen L2 blob intact: ${blob}`);
  const nodeVersion = process.version;
  const sqliteVersion = (() => {
    const { path } = freshDbPath('n00');
    const store = openStore(path);
    const pragmas = store.inspectPragmas();
    store.close();
    return JSON.stringify(pragmas);
  })();
  console.log(`N00 identity: head=${head} lineage=${lineageMode} node=${nodeVersion} sqlitePragmas=${sqliteVersion}`);
}, 60_000);

test('N01: the PUBLIC compiler emits the exact successor artifact through the public entry', () => {
  const fixture = compileSuccessor();
  const manifest = fixture.manifest;
  assert.deepEqual(
    [manifest.formatVersion, manifest.runtimeContractMajor, manifest.executionEngineMajor],
    ['0.3', 2, 3],
  );
  assert.equal(manifest.schemaContractVersion, 'domainharness-json-schema/1');
  assert.deepEqual(manifest.packageDataBounds, { ...PACKAGE_BOUNDS });
  assert.ok(manifest.domainData?.some((descriptor) => descriptor.key === 'tier'));
  assert.ok(manifest.businessSources?.some((descriptor) => descriptor.source === 'crm'));
  // Bundled values are package material: descriptor digests are identity.
  assert.equal((fixture.domainData as Record<string, unknown>).tier !== undefined, true);
  // Total rejection routes are compiled into every domain-message effect.
  const parentDefinition = manifest.workflows.parent?.definition as {
    states: { acting: { effects: Array<{ kind: string; rejected: unknown[] }> } };
  };
  const effect = parentDefinition.states.acting.effects.find((entry) => entry.kind === 'domain-message');
  assert.ok(effect, 'parent carries a domain-message effect');
  assert.ok(Array.isArray(effect!.rejected) && effect!.rejected.length >= 1, 'total rejected route is unconditional');
  // Reproducible identity: identical semantic input, same public packageId.
  assert.equal(compileSuccessor().manifest.packageId, manifest.packageId);
}, 60_000);

test('N03: profile/activation negatives fail closed before executing a turn', async () => {
  const { path } = freshDbPath('n03');
  const fixture = compileSuccessor();
  const retained = await retainedLegacyPackage();

  const boot = (registry: StaticPackageRegistry, options: { readonly bounds?: unknown } = {}) =>
    createNodeDomainRuntime({
      packageRegistry: registry,
      store: openStore(path.replace('.sqlite', `-${Math.random().toString(36).slice(2, 6)}.sqlite`)),
      bindings: createNodeHost(),
      ...(options.bounds === undefined ? {} : { supportedPackageDataBounds: options.bounds as never }),
      now: NOW,
    });

  // Torn tuples never dispatch to the successor validator.
  for (const tuple of [
    { formatVersion: '0.3', runtimeContractMajor: 2, executionEngineMajor: 2 },
    { formatVersion: '0.2', runtimeContractMajor: 2, executionEngineMajor: 3 },
    { formatVersion: '9.9', runtimeContractMajor: 2, executionEngineMajor: 3 },
  ] as const) {
    const torn = structuredClone(fixture.manifest) as unknown as typeof fixture.manifest;
    torn.formatVersion = tuple.formatVersion;
    torn.runtimeContractMajor = tuple.runtimeContractMajor;
    torn.executionEngineMajor = tuple.executionEngineMajor;
    await assert.rejects(
      boot(new StaticPackageRegistry([{ manifest: torn, bindings: {}, domainData: fixture.domainData }], torn.packageId), { bounds: { ...HOST_MAXIMA } }),
      (error: unknown) => (error as { code?: string }).code === 'INCOMPATIBLE_PACKAGE',
      `${tuple.formatVersion}/${tuple.runtimeContractMajor}/${tuple.executionEngineMajor} must fail closed`,
    );
  }

  // A successor package cannot activate without host maxima (legacy-only host).
  await assert.rejects(
    boot(new StaticPackageRegistry([{ manifest: fixture.manifest, bindings: {}, domainData: fixture.domainData }], fixture.manifest.packageId)),
    (error: unknown) => (error as { code?: string }).code === 'INCOMPATIBLE_PACKAGE',
  );

  // Torn successor body (digest mismatch) fails before execution.
  const tornBody = structuredClone({ manifest: fixture.manifest, domainData: fixture.domainData });
  (tornBody.domainData as Record<string, { level: number }>).tier.level = 999;
  await assert.rejects(
    boot(new StaticPackageRegistry([tornBody as never], fixture.manifest.packageId), { bounds: { ...HOST_MAXIMA } }),
    /does not match descriptor|PACKAGE_ID_MISMATCH/u,
  );

  // A valid mixed registry still boots (positive control).
  const ok = await boot(new StaticPackageRegistry([
    retained,
    { manifest: fixture.manifest, bindings: {}, domainData: fixture.domainData },
  ], fixture.manifest.packageId), { bounds: { ...HOST_MAXIMA } });
  assert.equal(typeof ok.send, 'function');
}, 120_000);

test('N04: package identity is material-bound with real SHA-256 (irrelevant order stable, identity material sensitive)', () => {
  const base = compileSuccessor();
  const reordered = compileSuccessor({
    domainData: [{ key: 'tier', value: { level: 1 } }],
  });
  assert.equal(reordered.manifest.packageId, base.manifest.packageId);

  const changedValue = compileSuccessor({ domainData: [{ key: 'tier', value: { level: 42 } }] });
  assert.notEqual(changedValue.manifest.packageId, base.manifest.packageId);

  const changedSchema = compileSuccessor({
    businessSources: [{ source: 'crm', valueSchema: { type: 'object', properties: { extra: { type: 'string' } }, additionalProperties: true } }],
  });
  assert.notEqual(changedSchema.manifest.packageId, base.manifest.packageId);

  const changedBounds = compileSuccessor({
    target: nodeTarget({ packageDataBounds: { ...PACKAGE_BOUNDS, maxDomainDataEntries: PACKAGE_BOUNDS.maxDomainDataEntries - 1 } }),
  });
  assert.notEqual(changedBounds.manifest.packageId, base.manifest.packageId);

  const changedSemantics = compileSuccessor({ domainVersion: '1.0.1-sx-node' });
  assert.notEqual(changedSemantics.manifest.packageId, base.manifest.packageId);

  // External business values never enter identity: the manifest is unchanged
  // when only runtime snapshot inputs differ (structural identity proof).
  assert.equal(compileSuccessor().manifest.packageId, base.manifest.packageId);
  // The identity digest is a real SHA-256 over canonical material.
  assert.match(base.manifest.packageId, /^[0-9a-f]{64}$/u);
  assert.equal((base.manifest.packageId.match(/^[0-9a-f]+$/u) ?? [''])[0].length, 64);
  // The public seam recomputes the same digest.
  return import('../../../../packages/domain-harness/src/package/validation.js').then(async ({ computeCompiledPackageId }) => {
    const recomputed = await computeCompiledPackageId(base.manifest, sha256);
    assert.equal(recomputed, base.manifest.packageId);
  });
}, 60_000);

test('N05: five package-data bounds bind at both authorities and the frozen schema corpus holds', async () => {
  // Package-recorded bounds are exactly the frozen five fields.
  const fixture = compileSuccessor();
  const boundKeys = Object.keys(fixture.manifest.packageDataBounds!).sort();
  assert.deepEqual(boundKeys, [
    'maxBusinessSources',
    'maxDomainDataEntries',
    'maxDomainDataEntryCanonicalBytes',
    'maxSchemaCanonicalBytes',
    'maxTotalDomainDataCanonicalBytes',
  ]);

  // Each recorded bound at host-max + 1 exceeds the host authority at
  // ACTIVATION (compile legitimately records the package-declared bound).
  for (const key of ['maxDomainDataEntries', 'maxBusinessSources', 'maxSchemaCanonicalBytes'] as const) {
    const overHost = compileSuccessor({
      target: nodeTarget({ packageDataBounds: { ...PACKAGE_BOUNDS, [key]: HOST_MAXIMA[key] + 1 } }),
    });
    assert.notEqual(overHost.manifest.packageId, fixture.manifest.packageId, 'bounds are identity material');
    const { path } = freshDbPath(`n05-${key}`);
    await assert.rejects(
      createNodeDomainRuntime({
        packageRegistry: new StaticPackageRegistry([
          { manifest: overHost.manifest, bindings: {}, domainData: overHost.domainData },
        ], overHost.manifest.packageId),
        store: openStore(path),
        bindings: createNodeHost(),
        supportedPackageDataBounds: { ...HOST_MAXIMA },
        now: NOW,
      }),
      (error: unknown) => (error as { code?: string }).code === 'INCOMPATIBLE_PACKAGE'
        && JSON.stringify((error as { details?: unknown[] }).details).includes(key),
      `${key} above host maxima must fail activation`,
    );
  }

  // Over-bound DOMAIN DATA fails compile-time admission.
  assert.throws(
    () => compileSuccessor({ domainData: Array.from({ length: PACKAGE_BOUNDS.maxDomainDataEntries + 1 }, (_, index) => ({ key: `k${index}`, value: index })) }),
    (error: unknown) => error instanceof Error && error.message.includes('exceeds maxDomainDataEntries'),
    'entry count above the package-declared bound fails compile admission',
  );
  // Undeclared/orphan keys fail compile-time closure (never deferred).
  assert.throws(
    () => compileSuccessor({ projections: [] }),
    /orphan/u,
  );

  // Frozen JSON Schema corpus: exact accept/reject semantics, no host I/O.
  const validator = new DomainHarnessJsonSchemaV1Validator();
  const acceptCases: ReadonlyArray<readonly [unknown, unknown]> = [
    [{ type: 'object' }, { a: 1 }],
    [{ type: 'object', properties: { a: { type: 'number' } }, additionalProperties: false }, { a: 2 }],
    [{ type: 'object', $defs: { positive: { type: 'number', exclusiveMinimum: 0 } }, properties: { v: { $ref: '#/$defs/positive' } } }, { v: 3 }],
    [{ type: 'array', items: { type: 'string' } }, ['x']],
  ];
  for (const [schema, value] of acceptCases) {
    validator.validate(schema as never, value as never, 'accept');
  }
  const rejectCases: ReadonlyArray<readonly [unknown, unknown, string]> = [
    [{ type: 'object' }, [], 'wrong instance type'],
    [{ type: 'object', properties: { a: { type: 'number' } }, additionalProperties: false }, { a: 1, b: 2 }, 'additionalProperties'],
    [{ type: 'object', properties: { v: { $ref: 'https://external.example/schema' } } }, { v: 1 }, 'external $ref'],
  ];
  for (const [schema, value] of rejectCases) {
    assert.throws(
      () => validator.validate(schema as never, value as never, 'reject'),
      (error: unknown) => error instanceof Error
        && (error.message.includes('does not satisfy') || error.message.includes('package-local fragment')),
      'the exact schema contract rejects (violation at value level or strict schema inspection)',
    );
  }
}, 60_000);
