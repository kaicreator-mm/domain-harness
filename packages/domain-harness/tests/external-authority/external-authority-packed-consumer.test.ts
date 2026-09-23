// Issue #309 / A2 I-006 clean external-consumer proof: packs the portable
// SDK tarball, installs it into a throwaway consumer exactly like a
// downstream package (Domain Simulator / application-composition shape), and
// drives the external authority evidence/correlation adapter surface using
// ONLY public package imports — never src/ paths.
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
  EXTERNAL_AUTHORITY_ADAPTER_VERSION,
  EXTERNAL_AUTHORITY_BASELINE,
  ExternalAuthorityError,
  adoptExternalAuthorityRef,
  adoptRuntimeLogicalOperationRef,
  adoptProviderOperationRef,
  adoptExternalObservationRef,
  adoptExternalReconciliationRef,
  correlateExternalEffect,
  verifyExternalEffectCorrelation,
  adoptExternalDispatchAttemptEvidence,
  adoptExternalObservationEvidence,
  adoptExternalReconciliationOutcome,
  maxClaimableForExternalObservation,
  observationSupportsCommitClaim,
  observationSupportsNonCommitClaim,
  refuteNonExternalAuthorityIdentity,
} from '@kaicreator/domain-harness';

assert.equal(EXTERNAL_AUTHORITY_ADAPTER_VERSION, 'external-authority-adapter/1');
assert.equal(EXTERNAL_AUTHORITY_BASELINE.baselineCommit, '9c3ef91b8b40d893e4fe2b0370200e765816ec2b');

const baseline = { ...EXTERNAL_AUTHORITY_BASELINE };
const authority = adoptExternalAuthorityRef({
  baseline,
  authorityId: 'sor://erp',
  authorityScope: 'plant-7/invoices',
});
const runtimeOperation = adoptRuntimeLogicalOperationRef({
  baseline,
  effectId: 'effect:v2:packed',
  attempt: 1,
  effectSemantics: 'non-idempotent',
  idempotencyKey: 'effect:v2:packed',
});
const providerOperation = adoptProviderOperationRef({
  baseline,
  providerOperationId: 'erp-op-9',
  idempotencyKey: 'effect:v2:packed',
});
const correlation = correlateExternalEffect({
  correlationId: 'corr-packed',
  runtimeOperation,
  externalAuthority: authority,
  providerOperation,
});
verifyExternalEffectCorrelation(correlation, {
  effectId: 'effect:v2:packed',
  authorityId: 'sor://erp',
  providerOperationId: 'erp-op-9',
});

// Dispatch evidence proves dispatch only.
const dispatch = adoptExternalDispatchAttemptEvidence({ correlation, attempt: 1 });
assert.equal(dispatch.proves, 'dispatch-attempt-only');
assert.equal(dispatch.executionAuthority, 'none');

// External observation claims are derived ceilings; unknown never collapses.
const unknown = adoptExternalObservationEvidence({
  correlation,
  classification: 'unknown-ambiguous',
  rawStatement: 'erp status: ???',
});
assert.equal(unknown.claim, 'no-claim');
assert.equal(observationSupportsCommitClaim(unknown), false);
assert.equal(observationSupportsNonCommitClaim(unknown), false);
assert.equal(maxClaimableForExternalObservation('commit-observed'), 'commit-observed-within-authority-scope');

// Local timeout material is forbidden as external evidence.
assert.throws(
  () => adoptExternalObservationEvidence({
    correlation,
    classification: 'unknown-ambiguous',
    rawStatement: 'x',
    timedOut: true,
  }),
  (e) => e instanceof ExternalAuthorityError && e.code === 'LOCAL_CAUSE_FORBIDDEN',
);

// Reconciliation: commit requires authoritative commit observation.
const reconciliation = adoptExternalReconciliationRef({ baseline, reconciliationId: 'recon-packed' });
assert.throws(
  () => adoptExternalReconciliationOutcome({
    correlation,
    reconciliation,
    result: 'RECONCILED_COMMITTED',
    basis: [adoptExternalObservationEvidence({
      correlation,
      classification: 'effect-succeeded-provider-scope',
      rawStatement: 'erp: success',
    })],
  }),
  (e) => e instanceof ExternalAuthorityError && e.code === 'EVIDENCE_CONFLICT',
);
const reconciled = adoptExternalReconciliationOutcome({
  correlation,
  reconciliation,
  result: 'RECONCILED_COMMITTED',
  basis: [adoptExternalObservationEvidence({
    correlation,
    observation: adoptExternalObservationRef({ baseline, observationId: 'obs-packed' }),
    classification: 'commit-observed',
    rawStatement: 'erp: committed',
  })],
});
assert.equal(reconciled.remoteTruth, 'committed');

// Terminal abandonment is a local stop only.
const abandoned = adoptExternalReconciliationOutcome({
  correlation,
  reconciliation: adoptExternalReconciliationRef({ baseline, reconciliationId: 'recon-abandon' }),
  result: 'TERMINAL_ABANDONMENT',
});
assert.equal(abandoned.remoteTruth, 'unresolved');

// Runtime identity never substitutes external authority identity.
assert.throws(() => refuteNonExternalAuthorityIdentity(runtimeOperation), ExternalAuthorityError);

console.log('external-authority-consumer-ok');
`;

test('#309 packed package delivers the external authority adapter surface to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t309-consumer-'));
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
      name: 'domain-harness-t309-external-consumer',
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
    assert.ok(stdout.includes('external-authority-consumer-ok'), `consumer program must pass; got: ${stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
