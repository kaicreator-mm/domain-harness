// Issue #305 / A2 I-002 clean external-consumer proof: packs the portable SDK
// tarball, installs it into a throwaway consumer exactly like a downstream
// package (Domain Simulator / application-composition shape), and drives the
// DAC cross-layer reference adapter surface using ONLY public package imports
// — never src/ paths.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

const CONSUMER_PROGRAM = `
import assert from 'node:assert/strict';
import {
  DAC_REFERENCE_ADAPTER_VERSION,
  DAC_REFERENCE_BASELINE,
  DAC_REFERENCE_ROLES,
  DacReferenceError,
  adoptPromotionDecisionRef,
  adoptApplicationSelectionRef,
  adoptSelectedDomainDataRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptCompatibilityTargetRef,
  adoptRuntimeBindingRef,
  adoptRuntimeActivationRef,
  isApplicationSelectionRef,
  isRuntimeBindingRef,
  isRuntimeImplementationRef,
  verifyDacReferenceIdentity,
  refuteExternalBusinessSoRIdentity,
} from '@kaicreator/domain-harness';

assert.equal(DAC_REFERENCE_BASELINE.baselineCommit, '9c3ef91b8b40d893e4fe2b0370200e765816ec2b');
assert.equal(DAC_REFERENCE_ROLES.length, 8);

const baseline = { ...DAC_REFERENCE_BASELINE };
const input = (over = {}) => ({
  baseline,
  semanticIdentity: 'domain:consumer:rules',
  authorityScope: 'dac://consumer/app',
  revisionIdentity: 'rev-000007',
  contentDigest: 'sha256:consumer-exact',
  ...over,
});

const promotion = adoptPromotionDecisionRef(input());
const selection = adoptApplicationSelectionRef(input());
const selected = adoptSelectedDomainDataRef(input());
const contract = adoptRuntimeContractRef(input());
const implementation = adoptRuntimeImplementationRef(input());
const target = adoptCompatibilityTargetRef(input());
const binding = adoptRuntimeBindingRef(input());
const activation = adoptRuntimeActivationRef(input());

// Every adopted ref carries exact provenance and the adapter identity.
for (const ref of [promotion, selection, selected, contract, implementation, target, binding, activation]) {
  assert.equal(ref.adapter, DAC_REFERENCE_ADAPTER_VERSION);
  assert.equal(ref.authorityScope, 'dac://consumer/app');
  assert.ok(Object.isFrozen(ref));
}

// Role inequality: promotion can never be consumed as selection or binding.
assert.equal(isApplicationSelectionRef(promotion), false);
assert.equal(isRuntimeBindingRef(selection), false);
assert.throws(() => refuteExternalBusinessSoRIdentity(implementation), DacReferenceError);

// Exact identity verification passes and fails closed on mismatch.
verifyDacReferenceIdentity(selected, { revisionIdentity: 'rev-000007' });
assert.throws(() => verifyDacReferenceIdentity(selected, { contentDigest: 'sha256:wrong' }), DacReferenceError);

// Mutable alias and unsupported baseline fail closed in the packed package too.
assert.throws(() => adoptSelectedDomainDataRef(input({ revisionIdentity: 'latest' })), (e) => e.code === 'MUTABLE_ALIAS_REJECTED');
assert.throws(() => adoptSelectedDomainDataRef(input({ baseline: { ...baseline, version: 'v0.9.9' } })), (e) => e.code === 'UNSUPPORTED_DAC_BASELINE');

console.log('dac-consumer-ok');
`;

test('#305 packed package delivers the public DAC reference adapter surface to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t305-consumer-'));
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
      name: 'domain-harness-t305-external-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
    assert.equal(
      existsSync(join(consumer, 'node_modules', 'better-sqlite3')),
      false,
      'portable core consumer must not install better-sqlite3',
    );

    writeFileSync(join(consumer, 'index.mjs'), CONSUMER_PROGRAM);
    const stdout = run(process.execPath, ['index.mjs'], consumer);
    assert.ok(stdout.includes('dac-consumer-ok'), `consumer program must pass; got: ${stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
