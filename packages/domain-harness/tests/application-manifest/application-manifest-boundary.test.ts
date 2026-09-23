// Issue #310 / A2 I-007 authority-boundary tests: the Application Manifest
// stays narrow composition metadata and never becomes a fourth semantic
// pillar or a promotion/selection/compatibility/binding/activation/Runtime
// execution/external-operation authority (PRD A2 §7 / L2 A2 §7; DAC
// APPLICATION_MANIFEST §§1-3,12,14; A2 negative cases N17/N18 and C38).
// These tests pin the STRUCTURAL guarantees: exported surface allowlist, no
// lifecycle-role minting, source-level import/concern separation, no
// instance-state field anywhere on adopted records, and no parallel
// identity hierarchy beyond the DAC §3 identity set.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as manifestModule from '../../src/application-manifest/index.js';
import {
  APPLICATION_MANIFEST_ADAPTER_VERSION,
  APPLICATION_MANIFEST_CONTRACT_VERSION,
  adoptApplicationManifest,
  computeApplicationManifestDigest,
  type ApplicationManifestAdoptionInput,
} from '../../src/application-manifest/index.js';
import { DAC_REFERENCE_BASELINE } from '../../src/dac/index.js';
import {
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
} from '../../src/dac/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

const sha256 = createSha256Fake();
const baseline = { ...DAC_REFERENCE_BASELINE };

// ------------------------------------------------------- exported surface

test('I-007 boundary: the module exports exactly the frozen adapter surface (allowlist snapshot)', () => {
  assert.deepEqual(Object.keys(manifestModule).sort(), [
    'APPLICATION_MANIFEST_ADAPTER_VERSION',
    'APPLICATION_MANIFEST_CONTRACT_VERSION',
    'ApplicationManifestError',
    'MANIFEST_ACTIVATION_CORRELATION_VERSION',
    'MANIFEST_BINDING_CORRELATION_VERSION',
    'MANIFEST_COMPOSITION_ADAPTER_VERSION',
    'MANIFEST_INSTANCE_STATE_FIELD_VOCABULARY',
    'MANIFEST_UX_CONTRACT_ROLES',
    'adoptApplicationManifest',
    'composeSelectedApplicationManifest',
    'computeApplicationManifestDigest',
    'correlateManifestRuntimeActivation',
    'correlateManifestRuntimeBinding',
    'isApplicationManifest',
    'isManifestCompositionEvidence',
    'isManifestRuntimeActivationCorrelation',
    'isManifestRuntimeBindingCorrelation',
    'manifestIdentityOf',
  ]);
});

test('I-007 boundary: no exported function mints or converts a DAC lifecycle role', () => {
  // A manifest adapter that could mint/convert lifecycle roles would be a
  // parallel selection/binding authority. None of these may exist.
  const forbidden = [
    'adoptPromotionDecisionRef',
    'adoptApplicationSelectionRef',
    'adoptSelectedDomainDataRef',
    'adoptRuntimeContractRef',
    'adoptRuntimeImplementationRef',
    'adoptCompatibilityTargetRef',
    'adoptRuntimeBindingRef',
    'adoptRuntimeActivationRef',
    'selectDomainData',
    'selectApplication',
    'promoteDomainData',
    'bindComposition',
    'activateComposition',
    'validateCompatibility',
  ];
  for (const name of forbidden) {
    assert.equal(
      name in manifestModule,
      false,
      `application-manifest must never expose ${name} (lifecycle/selection authority)`,
    );
  }
  // The only adoption constructor is the manifest adapter's own; nothing
  // else on the surface mints adopted references of any kind.
  for (const [name, exported] of Object.entries(manifestModule)) {
    if (typeof exported !== 'function' || name === 'adoptApplicationManifest') continue;
    assert.equal(
      exported.name.startsWith('adopt'),
      false,
      `${name}: only adoptApplicationManifest may adopt`,
    );
  }
});

// -------------------------------------------------- source-level separation

test('I-007 boundary: the module imports only the A2 surfaces it consumes — no engine/observation/control/DAC product code', () => {
  const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  const dir = `${srcRoot}application-manifest`;
  const files = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    text: readFileSync(`${dir}/${entry.name}`, 'utf8'),
  }));
  assert.ok(files.length >= 4, 'application-manifest leaf module files');

  // Validate every import specifier (multi-line imports included): only
  // intra-module, the consumed A2 leaf surfaces and portable contract types.
  const allowedPattern =
    /^(?:\.\/[\w./-]+\.js|\.\.\/(?:dac|dac-bridge|external-authority|composition-intake|runtime-binding)\/[\w./-]+\.js|\.\.\/(?:contracts|v2)(?:\/[\w./-]+)?\.js)$/;
  for (const { name, text } of files) {
    const specifiers = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]!);
    assert.ok(specifiers.length > 0, `${name}: expected imports`);
    for (const specifier of specifiers) {
      assert.ok(
        allowedPattern.test(specifier),
        `${name}: unexpected import outside the consumed A2 surfaces: ${specifier}`,
      );
      assert.ok(!specifier.includes('node:'), `${name}: portable leaf module must not import Node built-ins`);
      for (const forbidden of ['engine', 'observation', 'control', 'harness', 'runner', 'workflow']) {
        assert.ok(
          !specifier.includes(forbidden),
          `${name}: must not import runtime concerns (${forbidden}): ${specifier}`,
        );
      }
    }
  }
});

test('I-007 boundary: no Node built-in or host API usage inside the leaf module source', () => {
  const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  const dir = `${srcRoot}application-manifest`;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const text = readFileSync(`${dir}/${entry.name}`, 'utf8');
    assert.ok(!/require\(['"]node:/.test(text), `${entry.name}: no node: require`);
    assert.ok(!/from ['"]node:/.test(text), `${entry.name}: no node: import`);
    assert.ok(!/process\./.test(text), `${entry.name}: no process access`);
  }
});

// ------------------------------------------------------- no 4th pillar

async function manifestFixture(): Promise<
  Awaited<ReturnType<typeof adoptApplicationManifest>>
> {
  const compiled = await createCompiledPackage('rev-000042');
  const input = {
    baseline,
    semanticIdentity: compiled.manifest.domainId,
    authorityScope: 'dac://app-composition/acme',
    revisionIdentity: compiled.manifest.domainVersion,
    contentDigest: compiled.manifest.packageId,
  };
  const draft: Omit<ApplicationManifestAdoptionInput, 'manifestContentDigest'> = {
    baseline,
    contractVersion: APPLICATION_MANIFEST_CONTRACT_VERSION,
    applicationSemanticIdentity: 'app:acme:boundary',
    applicationRevisionIdentity: 'app-rev-1',
    manifestIdentity: 'manifest:acme:boundary:1',
    selectedDomainData: [
      {
        selected: adoptSelectedDomainDataRef(input),
        promotionDecision: adoptPromotionDecisionRef(input),
        applicationSelection: adoptApplicationSelectionRef(input),
      },
    ],
    runtimeContract: adoptRuntimeContractRef({
      baseline,
      semanticIdentity: 'runtime-contract',
      authorityScope: 'domain-harness://runtime/contract',
      revisionIdentity: '2',
    }),
    runtimeImplementation: adoptRuntimeImplementationRef({
      baseline,
      semanticIdentity: 'domain-harness-runtime',
      authorityScope: 'domain-harness://runtime/implementation',
      revisionIdentity: '0.3.0',
      contentDigest: 'build-1',
    }),
    compatibilityTarget: adoptCompatibilityTargetRef({
      baseline,
      semanticIdentity: 'domain-harness/compatibility-target/node-test',
      authorityScope: 'domain-harness://runtime/compatibility',
      revisionIdentity: 'node-test',
    }),
  };
  const digest = await computeApplicationManifestDigest(draft as unknown as ApplicationManifestAdoptionInput, {
    sha256,
  });
  return adoptApplicationManifest({ ...draft, manifestContentDigest: digest }, { sha256 });
}

test('I-007 boundary: the manifest identity set is exactly the DAC §3 four roles — no locator, no fifth identity role', async () => {
  const manifest = await manifestFixture();
  const identityKeys = Object.keys(manifest)
    .filter((key) => key.toLowerCase().includes('identity') || key.toLowerCase().includes('digest'))
    .sort();
  assert.deepEqual(identityKeys, [
    'applicationRevisionIdentity',
    'applicationSemanticIdentity',
    'manifestContentDigest',
    'manifestIdentity',
  ]);
  // No locator concept anywhere on the surface.
  const serialized = JSON.stringify(Object.keys(manifest));
  for (const locatorNoun of ['url', 'path', 'branch', 'mirror', 'alias', 'locator']) {
    assert.ok(!serialized.includes(locatorNoun), `no locator field (${locatorNoun}) may exist`);
  }
});

test('I-007 boundary: adopted records carry no execution/lifecycle authority field (N17/N18 structural)', async () => {
  const manifest = await manifestFixture();
  const authorityNouns = [
    'activation',
    'binding',
    'executed',
    'instancestate',
    'processstate',
    'uxstate',
    'currentstep',
    'recovery',
  ];
  const reachable = (value: unknown, into: Set<string> = new Set()): Set<string> => {
    if (Array.isArray(value)) {
      for (const item of value) reachable(item, into);
      return into;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        into.add(key.toLowerCase());
        reachable(child, into);
      }
    }
    return into;
  };
  // Every key reachable from the adopted manifest definition (its own fields
  // AND the fixed key sets of the #305-adopted references it carries) stays
  // free of execution/lifecycle/instance-state authority vocabulary.
  const ownKeys = reachable(manifest);
  for (const noun of authorityNouns) {
    const offenders = [...ownKeys].filter((key) => key.includes(noun));
    assert.deepEqual(
      offenders,
      [],
      `manifest definition must carry no ${noun} field (offenders: ${offenders.join(', ')})`,
    );
  }
  // Guard-level: the manifest can never pass as composition evidence and
  // vice versa (no role collapse between record classes).
  assert.equal(manifestModule.isManifestCompositionEvidence(manifest), false);
  assert.equal(manifestModule.isApplicationManifest({ ...manifest }), false);
});

test('I-007 boundary: composition request exposes no selection knob — the only selection is upstream pass-through', async () => {
  // Source-level: composeSelectedApplicationManifest's request type contains
  // manifest/exactSelected/compiledPackage/environment only; there is no
  // option to pick "index", "first", "default" or "latest" anywhere.
  const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  const composeText = readFileSync(`${srcRoot}application-manifest/compose.ts`, 'utf8');
  for (const forbidden of ['selectedIndex', 'firstEntry', 'defaultEntry', 'latestEntry', 'pickEntry']) {
    assert.ok(!composeText.includes(forbidden), `compose.ts must not contain ${forbidden}`);
  }
  // Behavior-level: even a manifest whose FIRST entry matches the stated
  // identity never consults order — proven by the compose suite; here the
  // exported compose function accepts no order/default option at all.
  assert.equal(manifestModule.composeSelectedApplicationManifest.length, 1);
  assert.equal(typeof manifestModule.composeSelectedApplicationManifest, 'function');
  assert.equal(manifestModule.adoptApplicationManifest.length, 2);
});

test('I-007 boundary: adapter versions are distinct per record class and frozen as values', () => {
  assert.equal(manifestModule.APPLICATION_MANIFEST_ADAPTER_VERSION, 'application-manifest-adapter/1');
  assert.equal(manifestModule.MANIFEST_COMPOSITION_ADAPTER_VERSION, 'manifest-composition/1');
  assert.equal(manifestModule.MANIFEST_BINDING_CORRELATION_VERSION, 'manifest-binding-correlation/1');
  assert.equal(manifestModule.MANIFEST_ACTIVATION_CORRELATION_VERSION, 'manifest-activation-correlation/1');
  assert.equal(APPLICATION_MANIFEST_CONTRACT_VERSION, 'dac-application-manifest/v0.0.2');
  assert.equal(APPLICATION_MANIFEST_ADAPTER_VERSION, 'application-manifest-adapter/1');
  // A record of one class never passes another class's guard (nominal, not
  // structural): the three evidence record kinds stay separately referrable.
  const fake = { manifestComposition: 'manifest-composition/1' } as never;
  assert.equal(manifestModule.isManifestCompositionEvidence(fake), false);
  assert.equal(manifestModule.isManifestRuntimeBindingCorrelation(fake), false);
  assert.equal(manifestModule.isManifestRuntimeActivationCorrelation(fake), false);
});

test('I-007 boundary: composeSelectedApplicationManifest is the only #306 consumer and never re-implements validation', () => {
  const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  const composeText = readFileSync(`${srcRoot}application-manifest/compose.ts`, 'utf8');
  assert.ok(
    composeText.includes('validateSelectedComposition'),
    'composition must delegate to the #306 intake rather than re-implement compatibility validation',
  );
  // No private re-implementation of package/identity validation primitives.
  for (const forbidden of ['computeCompiledPackageId', 'validateCompiledPackage', 'deriveEffectId']) {
    assert.ok(!composeText.includes(forbidden), `compose.ts must not re-implement ${forbidden}`);
  }
});
