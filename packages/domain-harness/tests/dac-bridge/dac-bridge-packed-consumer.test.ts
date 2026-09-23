// Issue #308 / A2 I-005 clean external-consumer proof: packs the portable
// SDK tarball, installs it into a throwaway consumer exactly like a
// downstream package (Domain UX / application-composition shape), and drives
// the DAC UX<->Runtime correlation bridge surface using ONLY public package
// imports — never src/ paths.
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
  DAC_BRIDGE_ADAPTER_VERSION,
  DAC_BRIDGE_BASELINE,
  DAC_BRIDGE_ROLES,
  DacBridgeError,
  adoptDomainIntentRef,
  adoptSemanticTargetRef,
  commandRefFromDomainMessage,
  correlateDomainCommand,
  outcomeRefFromMessageDisposition,
  correlateDomainOutcome,
  viewRefFromQueryResult,
  snapshotRefFromWorkflowInstanceSnapshot,
  watchRefFromSubscription,
  watchRefFromObservedChange,
  classifyObservedBasis,
  isCommandRef,
  isOutcomeRef,
  isDomainCommandCorrelation,
} from '@kaicreator/domain-harness';

assert.equal(DAC_REFERENCE_BASELINE_COMMIT(), '9c3ef91b8b40d893e4fe2b0370200e765816ec2b');
assert.equal(DAC_BRIDGE_ROLES.length, 7);

const baseline = { ...DAC_BRIDGE_BASELINE };
const address = { workflowId: 'billing', instanceKey: 'inv-42' };
const message = {
  messageId: 'msg-2001',
  target: address,
  type: 'ApproveInvoice',
  payload: { amount: 7 },
  correlationId: 'corr-9',
};

// UX-authored intent + semantic target + snapshot basis.
const snapshotRef = snapshotRefFromWorkflowInstanceSnapshot({
  address,
  correlationId: 'corr-9',
  packageId: 'pkg-sha256:c0',
  lifecycle: 'active',
  stateRevision: 4,
  state: { status: 'draft' },
  createdAt: '2026-09-23T11:00:00.000Z',
  updatedAt: '2026-09-23T11:00:00.000Z',
});
const semanticTarget = adoptSemanticTargetRef({
  baseline,
  semanticIdentity: 'domain:billing:invoice-approval',
  authorityScope: 'dac://ux/consumer',
});
const intent = adoptDomainIntentRef({
  baseline,
  semanticIdentity: 'intent:approve-invoice',
  authorityScope: 'dac://ux/consumer',
  semanticTarget,
  observedBasis: { kind: 'snapshot-ref', snapshotRef },
});

// Command correlation over the existing DomainMessage identity.
const correlation = correlateDomainCommand(message, { intent });
assert.ok(isDomainCommandCorrelation(correlation));
assert.equal(correlation.command.messageId, 'msg-2001');
assert.ok(isCommandRef(correlation.command));
assert.equal(correlation.command.adapter, DAC_BRIDGE_ADAPTER_VERSION);

// Stale-basis classification fail-safe matrix.
assert.deepEqual(
  classifyObservedBasis(
    correlation,
    { kind: 'workflow-instance', snapshot: {
      address, correlationId: 'corr-9', packageId: 'pkg-sha256:c0', lifecycle: 'active',
      stateRevision: 4, state: {}, createdAt: 't', updatedAt: 't' } },
    { requireBasis: true },
  ),
  { status: 'CURRENT' },
);
const stale = classifyObservedBasis(
  correlation,
  { kind: 'workflow-instance', snapshot: {
    address, correlationId: 'corr-9', packageId: 'pkg-sha256:c0', lifecycle: 'active',
    stateRevision: 5, state: {}, createdAt: 't', updatedAt: 't' } },
  { requireBasis: true },
);
assert.equal(stale.status, 'STALE');
assert.throws(
  () => classifyObservedBasis(undefined, { kind: 'revision', sourceKind: 'x', revision: '1' }, { requireBasis: true }),
  (e) => e instanceof DacBridgeError && e.code === 'BASIS_REQUIRED',
);

// Outcome correlation: Runtime-logical scope only, external outcome not claimed.
const outcome = outcomeRefFromMessageDisposition({
  messageId: 'msg-2001',
  target: address,
  targetSequence: 1,
  packageId: 'pkg-sha256:c0',
  disposition: 'processed',
  correlationId: 'corr-9',
  acceptedAt: 't1',
  resolvedAt: 't2',
});
assert.ok(isOutcomeRef(outcome));
assert.equal(outcome.outcomeScope, 'runtime-logical');
assert.equal(outcome.externalAuthorityOutcome, 'not-claimed');
const chain = correlateDomainOutcome({
  disposition: {
    messageId: 'msg-2001', target: address, targetSequence: 1, packageId: 'pkg-sha256:c0',
    disposition: 'processed', correlationId: 'corr-9', acceptedAt: 't1', resolvedAt: 't2',
  },
  correlation,
});
assert.equal(chain.intent, intent);

// View/watch adapters stay renderer-independent.
const view = viewRefFromQueryResult(
  { kind: 'message-disposition', target: address, messageId: 'msg-2001' },
  { kind: 'message-disposition', value: null },
);
assert.equal(view.viewKind, 'message-disposition');
assert.equal(view.valuePresent, false);
const watch = watchRefFromObservedChange(
  { kind: 'projection', projectionId: 'invoice-summary', key: 'inv-42' },
  { kind: 'projection', revision: 'rev-2' },
);
assert.equal(watch.observedRevision, 'rev-2');
assert.ok(watchRefFromSubscription({ kind: 'instance', target: address }).watchKind === 'instance');

// Fail-closed negatives work in the packed package too.
assert.throws(
  () => adoptDomainIntentRef({ baseline: { ...baseline, version: 'v9' }, semanticIdentity: 'i', authorityScope: 's' }),
  (e) => e instanceof DacBridgeError && e.code === 'UNSUPPORTED_DAC_BASELINE',
);
assert.throws(
  () => correlateDomainCommand(message, { intent: { role: 'domain-intent' } }),
  (e) => e instanceof DacBridgeError && e.code === 'INVALID_CORRELATION',
);

function DAC_REFERENCE_BASELINE_COMMIT() {
  return DAC_BRIDGE_BASELINE.baselineCommit;
}

console.log('dac-bridge-consumer-ok');
`;

test('#308 packed package delivers the public DAC correlation bridge surface to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t308-consumer-'));
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
      name: 'domain-harness-t308-external-consumer',
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
    assert.ok(stdout.includes('dac-bridge-consumer-ok'), `consumer program must pass; got: ${stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
