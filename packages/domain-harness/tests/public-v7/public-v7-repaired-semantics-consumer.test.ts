/**
 * #570 T001E successor rebind — packed-consumer proof of the repaired public
 * `/v7` semantics (issues #555/#556).
 *
 * `npm pack` the package exactly as shipped, install the tarball into a
 * throwaway consumer outside this workspace, and import
 * `@kaicreator/domain-harness/v7` from the installed `dist`. The assertions
 * below fail against the stale pre-repair dist (which accepted the legacy
 * material-field admission shape and did not exhibit the #555 identity
 * invariants), so a green run proves the packed artifact carries the
 * regenerated repaired semantics — not the output #565 originally shipped:
 *
 * - resolution proof: the `/v7` entry resolves inside the consumer's
 *   `node_modules`, i.e. the packed tarball, not the workspace;
 * - shipped-source proof: the installed `component-admission.js` no longer
 *   contains the pre-repair `materialSemanticBodyFields` identifier and does
 *   contain the closed-world `validateComponent` gate;
 * - #556 contract: a 3-key declaration without the mandatory
 *   `validateComponent` is rejected `INVALID_UNDERSTOOD_KIND_SET` (INPUT);
 *   a required-but-not-understood capability fails `UNKNOWN_CAPABILITY`
 *   (CAPABILITY); the exact Kind's closed-world validator is invoked before
 *   ADMITTED and its failure propagates unchanged; ADMITTED carries fresh
 *   `admittedSemanticContracts`/`admittedCapabilities` copies;
 * - #555 invariants: non-material `nonMaterialExtensions` and required
 *   ref-order permutations do not perturb `computeDefinitionGraphDigest`
 *   identity, while behaviorally material changes do;
 * - legacy spot check from the same tarball: root and `./v2` stay unchanged.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') return run('npm', args, cwd);
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

test('#570 packed consumer imports @kaicreator/domain-harness/v7 with repaired #555/#556 semantics', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-public-v7-rebind-consumer-'));
  const packs = join(root, 'packs');
  const consumer = join(root, 'consumer');

  try {
    mkdirSync(packs, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    runNpm(['pack', '--pack-destination', packs], packageRoot);
    const tarballs = readdirSync(packs).filter((name) => name.endsWith('.tgz'));
    assert.equal(tarballs.length, 1, 'core pack must produce exactly one tarball');
    const tarball = join(packs, tarballs[0]!);

    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-public-v7-rebind-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);

    const installedPackage = join(consumer, 'node_modules', '@kaicreator', 'domain-harness');
    assert.equal(existsSync(join(installedPackage, 'dist', 'public-v7', 'index.js')), true);

    // Shipped-source proof: the installed artifact is the repaired build.
    const admissionSource = readFileSync(
      join(installedPackage, 'dist', 'contracts', 'component-admission.js'),
      'utf8',
    );
    assert.equal(
      admissionSource.includes('materialSemanticBodyFields'),
      false,
      'packed dist must not carry the pre-repair material-field admission shape',
    );
    assert.ok(
      admissionSource.includes('validateComponent'),
      'packed dist must carry the closed-world #556 validator gate',
    );

    writeFileSync(join(consumer, 'index.mjs'), `
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const resolved = import.meta.resolve('@kaicreator/domain-harness/v7');
assert.ok(
  resolved.includes('node_modules/@kaicreator/domain-harness/dist/public-v7/index.js'),
  '/v7 must resolve from the packed consumer install, got: ' + resolved,
);
const v7 = await import('@kaicreator/domain-harness/v7');

const sha256 = {
  digestUtf8: async (value) => createHash('sha256').update(value, 'utf8').digest('hex'),
};

function envelope(overrides = {}) {
  return {
    family: 'semantic',
    componentId: 'consumer.probe.alpha',
    kind: { kindId: 'consumer.kind.rule', version: '1.0.0' },
    requiredSemanticContracts: [{ contractId: 'consumer.contract.alpha', version: '2.0.0' }],
    requiredCapabilities: [{ capabilityId: 'consumer.capability.alpha', version: '1.0.0' }],
    semanticBody: { threshold: 100, tier: 'gold' },
    ...overrides,
  };
}

function declaration(overrides = {}) {
  return {
    kind: { kindId: 'consumer.kind.rule', version: '1.0.0' },
    understoodSemanticContracts: [{ contractId: 'consumer.contract.alpha', version: '2.0.0' }],
    understoodCapabilities: [{ capabilityId: 'consumer.capability.alpha', version: '1.0.0' }],
    validateComponent: (candidate) => {
      const { threshold, tier } = candidate.semanticBody;
      if (typeof threshold !== 'number' || typeof tier !== 'string') {
        throw new Error('consumer.kind.rule@1.0.0 material body must be { threshold: number, tier: string }');
      }
    },
    ...overrides,
  };
}

// --- #556 repaired admission contract -------------------------------------

// Pre-repair dist accepted legacy material-field declarations; the repaired
// contract fail-closes on any declaration that is not exactly the 4-key set.
assert.throws(
  () => v7.admitComponent(envelope(), [declaration({ validateComponent: undefined })]),
  (error) =>
    error instanceof Error &&
    error.name === 'ComponentAdmissionError' &&
    error.code === 'INVALID_UNDERSTOOD_KIND_SET' &&
    error.failureClass === 'INPUT',
);

// A required capability the exact Kind does not understand is a CAPABILITY
// failure (the FIELD class of the pre-repair shape no longer exists).
assert.throws(
  () =>
    v7.admitComponent(envelope({
      requiredCapabilities: [{ capabilityId: 'consumer.capability.beta', version: '1.0.0' }],
    }), [declaration()]),
  (error) =>
    error instanceof Error &&
    error.name === 'ComponentAdmissionError' &&
    error.code === 'UNKNOWN_CAPABILITY' &&
    error.failureClass === 'CAPABILITY',
);

// The closed-world validator is invoked before ADMITTED; its failure
// propagates unchanged (fail-closed, no substitute validator).
assert.throws(
  () =>
    v7.admitComponent(envelope({ semanticBody: { threshold: 'not-a-number', tier: 'gold' } }), [
      declaration(),
    ]),
  /material body must be \\{ threshold: number, tier: string \\}/,
);

// ADMITTED carries fresh exact ref copies of the repaired result shape.
const admitted = v7.admitComponent(envelope(), [declaration()]);
assert.equal(admitted.status, 'ADMITTED');
assert.deepEqual(admitted.admittedKind, { kindId: 'consumer.kind.rule', version: '1.0.0' });
assert.deepEqual(admitted.admittedSemanticContracts, [
  { contractId: 'consumer.contract.alpha', version: '2.0.0' },
]);
assert.deepEqual(admitted.admittedCapabilities, [
  { capabilityId: 'consumer.capability.alpha', version: '1.0.0' },
]);

// --- #555 Definition identity invariants ----------------------------------

function graph(components) {
  return { graphId: 'consumer.probe.graph', components, relations: [] };
}

const base = envelope();
const withExtension = envelope({ nonMaterialExtensions: { display: { label: 'presentation only' } } });
assert.equal(
  await v7.computeDefinitionGraphDigest(graph([base]), sha256),
  await v7.computeDefinitionGraphDigest(graph([withExtension]), sha256),
  'non-material extensions must not perturb Definition graph identity',
);

const permuted = envelope({
  requiredSemanticContracts: [
    { contractId: 'consumer.contract.beta', version: '3.0.0' },
    { contractId: 'consumer.contract.alpha', version: '2.0.0' },
  ],
  requiredCapabilities: [
    { capabilityId: 'consumer.capability.beta', version: '2.0.0' },
    { capabilityId: 'consumer.capability.alpha', version: '1.0.0' },
  ],
});
const reordered = envelope({
  requiredSemanticContracts: [...permuted.requiredSemanticContracts].reverse(),
  requiredCapabilities: [...permuted.requiredCapabilities].reverse(),
});
const permutedDigest = await v7.computeDefinitionGraphDigest(graph([permuted]), sha256);
const reorderedDigest = await v7.computeDefinitionGraphDigest(graph([reordered]), sha256);
assert.equal(
  permutedDigest,
  reorderedDigest,
  'required ref-order permutations must not perturb Definition graph identity',
);
assert.match(permutedDigest, /^[0-9a-f]{64}$/);

// Control: behaviorally material changes do perturb identity.
const materialChanged = envelope({ semanticBody: { threshold: 101, tier: 'gold' } });
assert.notEqual(
  await v7.computeDefinitionGraphDigest(graph([materialChanged]), sha256),
  await v7.computeDefinitionGraphDigest(graph([base]), sha256),
);

// --- legacy entries unchanged on the same tarball --------------------------

const root = await import('@kaicreator/domain-harness');
assert.equal(root.DOMAIN_HARNESS_VERSION, '0.2.0');
const v2 = await import('@kaicreator/domain-harness/v2');
assert.equal(v2.COMPILED_ARTIFACT_KINDS.length, 8);
assert.equal(typeof v2.compileCompiledArtifactIdentity, 'function');
`);

    run(process.execPath, ['index.mjs'], consumer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
