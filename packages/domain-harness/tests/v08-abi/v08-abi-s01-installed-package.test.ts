/**
 * V08-ABI-S01 — #1023 S01: BUILD/deploy-installed immutable content-addressed
 * Domain Package + per-activation approval/issuer currentness.
 * ===========================================================================
 *
 * Minimal L3 contract (#1023@6168603324): trusted deployment INSTALL verifies
 * approval/byte links and atomically publishes ONE self-contained
 * content-addressed immutable linked artifact plus an opaque, nonforgeable
 * per-Host installed reference; `DomainHarness.load(package)` stays EXACTLY
 * one argument and every fresh activation (load/registration/restart) checks
 * deployment approval/issuer CURRENTNESS — including a revoked/withdrawn
 * previously installed approval — BEFORE any package source execution.
 *
 * Vectors (P/N reuse — no new demo suites):
 *   S01-P1  one real installed artifact: deploy is INERT (byte verification
 *           only, zero imports), load(handle) activates the sealed closure,
 *           and the SAME artifact registers TWO real gateway Apps on the
 *           shared Host — both run an authenticated intent end-to-end; a
 *           fresh gateway re-registers the pinned app idempotently.
 *   S01-N1  forged/uninstalled handle, corrupted install record (interrupted
 *           publish), tampered artifact bytes and a pre-occupied artifact
 *           address (CAS collision) all refuse typed BEFORE any package
 *           source executes; the legacy approved-root path keeps every
 *           existing guard in the SAME process (a01/a02 own the deeper
 *           legacy negatives — not duplicated here).
 *   S01-N2  installation-current then REVOKED approval: fresh activation
 *           refuses APPROVAL_REVOKED pre-import for BOTH the installed
 *           reference and the legacy root presentation (approved byte
 *           identity ≠ current authorization); revocation before the first
 *           load never executes a byte; issuer withdrawal refuses only the
 *           withdrawn issuer's artifacts. Restart durability, cross-store
 *           opacity, missing-channel fail-closed and stale-proof currentness
 *           run in the s01-deploy-child.mjs clean children (SQLite,
 *           maxProofAgeMs) — a fresh process cannot reuse one-shot channels.
 *   S01-N3  cross-app substitution: a DIFFERENT closure's installed reference
 *           under a pinned appId refuses GATEWAY_APP_CLOSURE_MISMATCH before
 *           load (its bytes never execute); two installs of the SAME sealed
 *           root publish ONE immutable artifact (create-if-absent, revision
 *           never advances) and both references resolve to identical bytes.
 */

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';

import {
  load,
  QualifiedPackageError,
  sha256Hex,
  canonicalJson,
  type SealedQualifiedPackageRoot,
} from '../../src/public-v8/index.js';
import {
  deployArtifactKey,
  deployInstallKey,
  deployInstallPackage,
  revokeDeployedApproval,
  withdrawDeploymentIssuer,
  type DeployedInstallRecord,
} from '../../src/public-v8/deploy.js';
import {
  bootstrapTrustedHost,
  createKernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import {
  assertFixtureBytes,
  INTEG_ISSUER,
  INTEG_ISSUER_SECRET,
  mintCredential,
  sealRealApp,
} from '../v08-integration/helpers.js';
import {
  b01Clone,
  b01DefaultClosure,
  b01Seal,
  b01SentinelCount,
  type B01ClosureIds,
} from './v08-tb-fixture.js';

const ISSUER = 'dac-issuer:s01';
const ISSUER_SECRET = 'dac-issuer-secret:s01-material';
const ISSUER_TWO = 'dac-issuer:s01-second';
const ISSUER_TWO_SECRET = 'dac-issuer-secret:s01-second-material';
const AUDIENCE = 'dh-v08-s01';
const TENANT = 't-s01';

const HANDLE_SHAPE = /^dhpkg-install\/v1\/[0-9a-f]{64}$/;

// ---------------------------------------------------------------------------
// ONE trusted Host bootstrap per process (every one-shot channel is
// single-install): real SQLite physical store, two trusted issuers, no
// maxProofAgeMs (revocation is the currentness mechanism here; stale-proof
// currentness runs in the dedicated children below).
// ---------------------------------------------------------------------------

interface SharedHost {
  readonly handle: TrustedHostHandle;
  readonly dir: string;
}

let shared: SharedHost;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1023-s01-'));
  const handle = await bootstrapTrustedHost({
    issuers: new Map([
      [ISSUER, ISSUER_SECRET],
      [ISSUER_TWO, ISSUER_TWO_SECRET],
      // The integration issuer seals the REAL Approval app bytes (P1).
      [INTEG_ISSUER, INTEG_ISSUER_SECRET],
    ]),
    audience: AUDIENCE,
    storage: { path: join(dir, 's01.sqlite') },
  });
  shared = { handle, dir };
});

after(async () => {
  await shared.handle.host.close();
  await rm(shared.dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

function sealed(tag: string, issuerId: string = ISSUER, issuerSecret: string = ISSUER_SECRET): { root: SealedQualifiedPackageRoot } & B01ClosureIds {
  const closure = b01DefaultClosure(tag);
  return { ...closure, root: b01Seal(closure.input, issuerId, issuerSecret) };
}

/** Sentinel-side "this closure's bytes never executed" assertion. */
function assertNeverExecuted(ids: B01ClosureIds): void {
  for (const id of [ids.kernelId, ids.sdkId, ids.businessId]) {
    assert.equal(b01SentinelCount(id), 0, `module ${id} must never evaluate for a refused closure`);
  }
}

async function refuse(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(
    () => promise,
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError with ${code}, got ${String(error)}`);
      assert.equal(error.code, code);
      return true;
    },
  );
}

function credential(appId: string, subject: string, roles: readonly string[] = ['requester']): unknown {
  return mintCredential({
    tenantId: TENANT,
    appId,
    subject,
    audience: AUDIENCE,
    grantId: `grant:${appId}:${subject}`,
    roles,
  });
}

async function readInstallRecord(handle: string): Promise<DeployedInstallRecord & { revision: number }> {
  const entry = await shared.handle.host.docs.get(deployInstallKey(handle));
  assert.ok(entry !== null, 'install record must exist in the trusted deployment store');
  return { ...(entry.value as DeployedInstallRecord), revision: entry.revision };
}

// ---------------------------------------------------------------------------
// S01-P1 — one real installed artifact, dual App, idempotent re-registration.
// ---------------------------------------------------------------------------

/** The S01-P1 installed reference (later vectors reuse its still-valid closure). */
let p1Handle: string | undefined;

test('S01-P1 one REAL Approval app artifact activates through the installed reference and serves TWO real gateway Apps on the shared Host', async () => {
  // The REAL selected K/S bytes + the exact adopted Approval business bytes
  // (SHA-pinned) — the same closure the T-F journey runs, no test-only
  // kernel. Deployment inertness (zero imports at install) is pinned by the
  // S01-N1 vectors below on sentinel-instrumented closures.
  await assertFixtureBytes('approval');
  const root = await sealRealApp('approval');
  const handle = await deployInstallPackage(root);
  p1Handle = handle;
  assert.match(handle, HANDLE_SHAPE, 'install mints an opaque content-scoped installed reference');
  const loaded = await load(handle);
  assert.equal(loaded.rootPackageId, 'app:v08:order-approval');
  assert.equal(loaded.installedPackages.length, 3, 'the real K/S/B closure installed whole');

  const gateway = createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
  // The Approval business policy's effect:reserve routes through the Host
  // physical resource dispatcher (exactly like the T-F clean consumer).
  const ledgerCalls: unknown[] = [];
  shared.handle.host.resources.provision('ledger', (_operation: string, payload: unknown) => {
    ledgerCalls.push(payload);
    return { reserved: true };
  });
  const appIds = ['s01-order-alpha', 's01-order-beta'];
  for (const appId of appIds) {
    await gateway.registerApp({ appId, packageRoot: handle, genesisRoles: ['platform-operator'] });
    const genesis = (await gateway.activateGenesis(credential(appId, `op:${appId}`, ['platform-operator', 'requester']), {
      appId,
      instanceKey: 'quote-s01',
    })) as { state: { stateKey: string } };
    assert.ok(typeof genesis.state?.stateKey === 'string', `genesis opens the instance for ${appId}`);
    const receipt = (await gateway.send(credential(appId, `req:${appId}`), {
      intentType: 'submitQuoteDecision',
      messageId: `m:${appId}:1`,
      target: { tenantId: TENANT, appId, instanceKey: 'quote-s01' },
      input: { amount: 30 },
    })) as { status: string };
    assert.equal(receipt.status, 'admitted', `app ${appId} runs an authenticated intent end-to-end through the shared installed closure`);
  }
  assert.equal(ledgerCalls.length, 2, 'both apps drove their own physical effect through the shared closure');
  // A FRESH gateway over the SAME durable store re-registers the pinned app
  // idempotently: the pre-load pin check must resolve the installed reference
  // to its claimed closure identity (never refuse its own pinned closure).
  const gateway2 = createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
  await gateway2.registerApp({ appId: 's01-order-alpha', packageRoot: handle, genesisRoles: ['platform-operator'] });
  assert.ok(gateway2.hasApp('s01-order-alpha'));
});

// ---------------------------------------------------------------------------
// S01-N1 — forged references, interrupted publish, tampered bytes, CAS
// collision: every refusal happens BEFORE any package source execution.
// ---------------------------------------------------------------------------

test('S01-N1 a forged or uninstalled reference is refused fail-closed (no fallback to another artifact)', async () => {
  const forged = `dhpkg-install/v1/${'ab'.repeat(32)}`;
  await refuse(load(forged), 'INSTALL_HANDLE_UNKNOWN');
  // Shape-invalid presentations are not installed references at all: they
  // hit the legacy shape refusal (unchanged old guard).
  await refuse(load('dhpkg-install/v1/short'), 'LOAD_NOT_A_QUALIFIED_ROOT');
  await refuse(load(''), 'LOAD_NOT_A_QUALIFIED_ROOT');
});

test('S01-N1 an install record without its artifact (interrupted publish) refuses and never substitutes another artifact', async () => {
  const orphan = `dhpkg-install/v1/${'cd'.repeat(32)}`;
  await shared.handle.host.docs.put(deployInstallKey(orphan), {
    artifactDigest: sha256Hex('never-published-artifact'),
    rootPackageId: 'app:b01-never@1.0.0',
    issuerId: ISSUER,
    proofDigest: sha256Hex('proof-of-never-published'),
    subjectDigest: sha256Hex('subject-of-never-published'),
    installedAt: '2026-10-14T00:00:00.000Z',
  }, { mustBeAbsent: true });
  await refuse(load(orphan), 'INSTALL_RECORD_INVALID');
  // A structurally corrupted record (missing digest fields) refuses the same way.
  const corrupt = `dhpkg-install/v1/${'ef'.repeat(32)}`;
  await shared.handle.host.docs.put(deployInstallKey(corrupt), { artifactDigest: 42 }, { mustBeAbsent: true });
  await refuse(load(corrupt), 'INSTALL_RECORD_INVALID');
});

test('S01-N1 tampered installed artifact bytes are refused by the content address before any import', async () => {
  const b = sealed('s01n1tamper');
  const handle = await deployInstallPackage(b.root);
  assert.equal((await load(handle)).rootPackageId, b.root.rootPackageId, 'the untampered artifact activates first');
  const record = await readInstallRecord(handle);
  const artifactEntry = await shared.handle.host.docs.get(deployArtifactKey(record.artifactDigest));
  assert.ok(artifactEntry !== null);
  const artifact = artifactEntry.value as { artifactBytes: string };
  const parsed = JSON.parse(artifact.artifactBytes) as { packages: { moduleSource: string }[] };
  const firstPackage = parsed.packages[0];
  assert.ok(firstPackage !== undefined, 'the artifact carries the sealed packages array');
  firstPackage.moduleSource = `${firstPackage.moduleSource}\n// tampered\n`;
  await shared.handle.host.docs.put(
    deployArtifactKey(record.artifactDigest),
    { artifactBytes: JSON.stringify(parsed) },
    { mustMatchRevision: artifactEntry.revision },
  );
  await refuse(load(handle), 'INSTALL_ARTIFACT_MUTATED');
});

test('S01-N1 a pre-occupied artifact address (CAS collision) refuses the install and never substitutes the hostile bytes', async () => {
  const c = sealed('s01n1cas');
  // The deployer computes the artifact digest over the CANONICAL snapshot of
  // the sealed root (public canonicalJson) — reproduced here to pre-occupy
  // the content address with hostile bytes.
  const digest = sha256Hex(canonicalJson(b01Clone(c.root)));
  await shared.handle.host.docs.put(deployArtifactKey(digest), { artifactBytes: 'hostile-pre-occupied' }, { mustBeAbsent: true });
  await refuse(deployInstallPackage(c.root), 'INSTALL_ARTIFACT_CONFLICT');
  assertNeverExecuted(c);
});

// ---------------------------------------------------------------------------
// S01-N2 — revocation and issuer withdrawal at activation currentness.
// ---------------------------------------------------------------------------

test('S01-N2 a revoked previously installed approval refuses BOTH reference and legacy activation (byte identity is not current authorization)', async () => {
  const d = sealed('s01n2rev');
  const handle = await deployInstallPackage(d.root);
  assert.equal((await load(handle)).rootPackageId, d.root.rootPackageId, 'installation-current activation succeeds first');
  await revokeDeployedApproval({ handle, reason: 'governance-withdrawal' });
  await refuse(load(handle), 'APPROVAL_REVOKED');
  // The legacy approved-root presentation of the SAME approval is equally
  // refused: every fresh load checks deployment currentness.
  await refuse(load(b01Clone(d.root)), 'APPROVAL_REVOKED');
  // Typed double-revoke (durable store record is write-once).
  await assert.rejects(
    () => revokeDeployedApproval({ handle }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal((error as QualifiedPackageError).code, 'APPROVAL_ALREADY_REVOKED');
      return true;
    },
  );
});

test('S01-N2 revocation BEFORE the first activation never executes a single package byte', async () => {
  const e = sealed('s01n2pre');
  const handle = await deployInstallPackage(e.root);
  await revokeDeployedApproval({ handle });
  await refuse(load(handle), 'APPROVAL_REVOKED');
  assertNeverExecuted(e);
});

test('S01-N2 issuer withdrawal refuses only the withdrawn issuer\'s artifacts; the other issuer keeps activating', async () => {
  const f = sealed('s01n2wd', ISSUER_TWO, ISSUER_TWO_SECRET);
  const handle = await deployInstallPackage(f.root);
  assert.equal((await load(handle)).rootPackageId, f.root.rootPackageId);
  await withdrawDeploymentIssuer({ issuerId: ISSUER_TWO });
  await refuse(load(handle), 'ISSUER_WITHDRAWN');
  // The FIRST issuer's closure (installed in S01-P1) still activates.
  assert.ok(p1Handle !== undefined, 'S01-P1 must have run first (node:test runs top-level tests in order)');
  assert.equal((await load(p1Handle)).rootPackageId, 'app:v08:order-approval');
  await assert.rejects(
    () => withdrawDeploymentIssuer({ issuerId: ISSUER_TWO }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal((error as QualifiedPackageError).code, 'ISSUER_ALREADY_WITHDRAWN');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// S01-N3 — cross-app substitution and immutable single-artifact publishing.
// ---------------------------------------------------------------------------

test('S01-N3 a different closure under a pinned appId is refused before load and its bytes never execute', async () => {
  const g = sealed('s01n3x');
  const handleG = await deployInstallPackage(g.root);
  const gateway = createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
  // s01-order-alpha is durably pinned to the S01-P1 closure by the previous test.
  await assert.rejects(
    () => gateway.registerApp({ appId: 's01-order-alpha', packageRoot: handleG, genesisRoles: ['ops'] }),
    (error: unknown) => {
      const code = (error as { code?: unknown }).code;
      assert.equal(code, 'GATEWAY_APP_CLOSURE_MISMATCH');
      return true;
    },
  );
  assertNeverExecuted(g);
  // The same closure registers cleanly under its OWN appId.
  await gateway.registerApp({ appId: 's01-order-gamma', packageRoot: handleG, genesisRoles: ['ops'] });
});

test('S01-N3 reinstalling the SAME sealed root publishes ONE immutable artifact and never advances its revision', async () => {
  const h = sealed('s01n3idem');
  const first = await deployInstallPackage(h.root);
  const second = await deployInstallPackage(h.root);
  assert.notEqual(first, second, 'each install mints its own opaque reference');
  const recordA = await readInstallRecord(first);
  const recordB = await readInstallRecord(second);
  assert.equal(recordA.artifactDigest, recordB.artifactDigest, 'both references resolve to the SAME content address');
  const artifact = await shared.handle.host.docs.get(deployArtifactKey(recordA.artifactDigest));
  assert.ok(artifact !== null);
  assert.equal(artifact.revision, 0, 'the immutable artifact was written exactly once (create-if-absent, never overwritten)');
  assert.equal((await load(second)).rootPackageId, h.root.rootPackageId);
});

// ---------------------------------------------------------------------------
// S01-P1-legacy — coexistence: the old approved-root path keeps ALL guards in
// the SAME process (the reviewed cutover is a separate bounded decision).
// ---------------------------------------------------------------------------

test('S01-P1-legacy the legacy approved-root presentation still loads with every existing guard beside the installed path', async () => {
  const i = sealed('s01legacy');
  const loaded = await load(b01Clone(i.root));
  assert.equal(loaded.rootPackageId, i.root.rootPackageId);
  // And a hostile legacy presentation (uncontrolled producer identity)
  // still refuses statically — the old guard surface is untouched (a01 owns
  // the full legacy negative matrix).
  const hostile = b01Clone(i.root) as unknown as Record<string, unknown>;
  const build = hostile.build as Record<string, unknown>;
  build.producerId = 'attacker-producer:forge';
  await refuse(load(hostile), 'LOAD_PRODUCER_UNTRUSTED');
});

// ---------------------------------------------------------------------------
// S01-N2-restart — clean children: durable revocation across process
// restart, per-Store opacity, missing-channel fail-closed, stale-proof
// currentness (a fresh process cannot reuse one-shot channels, so every leg
// is an independent node child over real SQLite).
// ---------------------------------------------------------------------------

interface ChildOutcome {
  readonly ok: boolean;
  readonly [key: string]: unknown;
}

async function runChild(mode: string, ...args: string[]): Promise<ChildOutcome> {
  const childPath = fileURLToPath(new URL('./s01-deploy-child.mjs', import.meta.url));
  const cwd = fileURLToPath(new URL('../../', import.meta.url));
  const child = spawn(process.execPath, ['--import', 'tsx', childPath, mode, ...args], { cwd });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });
  const timeout = setTimeout(() => child.kill(), 60_000);
  const [code] = await Promise.race([
    new Promise<[number | null]>((resolve) => {
      child.on('close', (exitCode) => resolve([exitCode]));
    }),
    new Promise<[number | null]>((resolve) => {
      child.on('error', () => resolve([-1]));
    }),
  ]);
  clearTimeout(timeout);
  const marker = stdout.split('\n').find((line) => line.startsWith('JSON_RESULT: '));
  assert.ok(marker !== undefined, `child ${mode} must print a JSON_RESULT line (exit=${String(code)}) stderr=${stderr.slice(0, 400)}`);
  return JSON.parse(marker.slice('JSON_RESULT: '.length)) as ChildOutcome;
}

test('S01-N2-restart approval revocation and reference opacity survive process restarts (clean children over real SQLite)', async () => {
  const sqlite = join(shared.dir, 'restart.sqlite');
  const deployed = await runChild('deploy', sqlite, 's01restart');
  assert.ok(deployed.ok && typeof deployed.handle === 'string', `deploy leg ok: ${JSON.stringify(deployed)}`);
  const handle = deployed.handle as string;
  assert.match(handle, HANDLE_SHAPE);

  const fresh = await runChild('load', sqlite, handle);
  assert.ok(fresh.ok, `activation in a restarted process succeeds while installation-current: ${JSON.stringify(fresh)}`);

  await runChild('revoke', sqlite, handle);

  const refused = await runChild('load', sqlite, handle);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'APPROVAL_REVOKED', `post-restart activation refuses pre-import: ${JSON.stringify(refused)}`);

  // The opaque reference never resolves outside its own deployment store.
  const foreign = await runChild('load', join(shared.dir, 'other-store.sqlite'), handle);
  assert.equal(foreign.ok, false);
  assert.equal(foreign.code, 'INSTALL_HANDLE_UNKNOWN');

  // A process without the trusted deployment channel fails closed on every
  // installed reference (the trust gate alone is not a deployment authority).
  const nochannel = await runChild('nochannel', handle);
  assert.equal(nochannel.ok, false);
  assert.equal(nochannel.code, 'INSTALL_CHANNEL_UNAVAILABLE');

  // Stale-proof currentness on the installed path (maxProofAgeMs policy).
  const staleInstall = await runChild('stale-install', join(shared.dir, 'stale.sqlite'));
  assert.equal(staleInstall.ok, false);
  assert.equal(staleInstall.code, 'APPROVAL_STALE', `already-stale proof refuses at INSTALL: ${JSON.stringify(staleInstall)}`);

  const staleActivation = await runChild('stale-activation', join(shared.dir, 'stale2.sqlite'));
  assert.equal(staleActivation.ok, false);
  assert.equal(staleActivation.code, 'APPROVAL_STALE', `installation-current proof that ages out refuses at ACTIVATION: ${JSON.stringify(staleActivation)}`);
});
