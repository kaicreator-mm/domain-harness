/**
 * #1005 T-F — two REAL Domain Apps, one REAL packed-consumer E2E.
 * ================================================================
 *
 * The terminal dual-App journey the Controller unlocked at #1005@
 * 6159465043 (after Kernel PR #1034 merged): the ORIGINAL PR #1012
 * Business packages — `examples/v08-domain-apps/business-approval.mjs` and
 * `examples/v08-domain-apps/business-engineering.mjs` (the latter now
 * carrying the stage-declared contextProjection lineage) — sealed through
 * the compiler BUILD path over the SAME selected K/S payload bytes, then
 * executed by a CLEAN npm-packed stock-Node consumer:
 *
 *   - `npm pack`ed core+node tarballs installed into a fresh temp
 *     consumer (no workspace links, no repo src);
 *   - REAL SQLite storage, authenticated UX principals (issuer-signed
 *     credentials, minted roles per app), Genesis activation;
 *   - stage1 — D2 Approval golden quote (requester, amount 30) and D3
 *     review(A,a) admit on the SAME kernel attribution; CROSS-SOURCE
 *     validations (self-consistent envelopes for another change / another
 *     SHA pair) deny with zero State/Journal/Effect residue; the genuine
 *     validation commits its lineage; a D2-role caller is refused on D3;
 *   - stage2 — a NEW process on the SAME SQLite file: both instances read
 *     back durably (the D3 lineage survives the restart because K
 *     committed it in the instance CAS document); CROSS-SOURCE releases
 *     deny with zero residue; the genuine release qualifies and pins
 *     qualifiedSha; replaying the committed release message (and the D2
 *     quote message) is refused with no new dispatch.
 *
 * No test-only D3 substitute: the sealed bytes ARE the examples source
 * bytes, and this file additionally pins that the v08-integration
 * engineering fixture is byte-identical to them (one canonical D3 policy).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNewWorkspacePackagesInstalled,
  stageNewWorkspaceTarballs,
  verifiedLocalWorkspaceTarballs,
} from '../../../domain-harness-compiler/tests/packed-fixture-stage.js';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

/**
 * CI robustness (same guard as the #1013 R2 packed-consumer tests): the
 * clean consumer installs better-sqlite3 from the npm registry; workers
 * without registry egress SKIP explicitly rather than hang.
 */
function npmRegistryReachable(): boolean {
  const probe = spawnSync('npm', ['ping', '--registry', process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org'], {
    encoding: 'utf8', timeout: 15_000, shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

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

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const nodePackageRoot = fileURLToPath(new URL('../../../domain-harness-node', import.meta.url));
const examplesDir = fileURLToPath(new URL('../../../../examples/v08-domain-apps/', import.meta.url));

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Seal ONE REAL app from its ORIGINAL examples bytes over the CURRENT
 * selected K/S payload bytes (the same physical kernel/SDK files for both
 * apps — that is the shared-K/S BUILD precondition of this E2E).
 */
async function sealOriginalApp(kind: 'approval' | 'engineering'): Promise<{
  root: Record<string, any>;
  kernelSha: string;
  sdkSha: string;
  businessSha: string;
}> {
  // The ORIGINAL app bytes — the examples source, not a test fixture.
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(join(examplesDir, `business-${kind}.mjs`), 'utf8'),
  ]);
  // The business module namespace (identity/endpoints/intents) comes from
  // the same exact bytes the sealed package will carry.
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const kernelModule = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const sdkModule = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`) as Record<string, any>;
  const submissionPackages = [
    { packageId: kernelModule.MODULE_ID, kind: 'kernel' as const, abiVersion: kernelModule.ABI_VERSION, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernelModule.ENDPOINTS },
    { packageId: sdkModule.MODULE_ID, kind: 'standard-sdk' as const, abiVersion: sdkModule.ABI_VERSION, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdkModule.ENDPOINTS },
    { packageId: business.MODULE_ID, kind: 'business' as const, abiVersion: business.ABI_VERSION, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
  ];
  const submission = {
    rootPackageId: `app:v08:tf-e2e:${kind}`,
    packages: submissionPackages,
    bindings: [
      { role: 'kernel' as const, packageId: kernelModule.MODULE_ID, endpointId: kernelModule.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdkModule.MODULE_ID, endpointId: sdkModule.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER, issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-12T00:00:00.000Z',
  });
  const root = buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submissionPackages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'pr-1012-tf-packed-e2e',
  }) as Record<string, any>;
  const byKind = (kindValue: string) => (root.packages as { kind: string; moduleSha256: string }[]).find((pkg) => pkg.kind === kindValue)!;
  return {
    root,
    kernelSha: byKind('kernel').moduleSha256,
    sdkSha: byKind('standard-sdk').moduleSha256,
    businessSha: byKind('business').moduleSha256,
  };
}

test('T-F E2E: both REAL #1012 Apps on one REAL SQLite via the npm-packed authenticated Host — lineage denies cross-source, restart keeps lineage, replay refused', { timeout: 420_000 }, async (t) => {
  if (!npmRegistryReachable()) {
    t.skip('PACKED CONSUMER NOT_RUN(NETWORK): npm registry unreachable from this execution environment');
    return;
  }

  // ---- One canonical D3 policy: the integration fixture IS the examples
  // bytes (this E2E seals the examples directly; the pin catches drift). ----
  const [examplesEngineering, fixtureEngineering] = await Promise.all([
    readFile(join(examplesDir, 'business-engineering.mjs'), 'utf8'),
    readFile(new URL('./fixtures/business-engineering.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(sha256Hex(examplesEngineering), sha256Hex(fixtureEngineering),
    'examples/v08-domain-apps/business-engineering.mjs and the v08-integration fixture must stay byte-identical');

  // ---- Seal BOTH apps from the ORIGINAL examples bytes over the SAME K/S. ----
  const [d2, d3] = await Promise.all([sealOriginalApp('approval'), sealOriginalApp('engineering')]);
  assert.equal(d2.kernelSha, d3.kernelSha, 'both apps are sealed over the exact same selected Kernel bytes');
  assert.equal(d2.sdkSha, d3.sdkSha, 'both apps are sealed over the exact same selected Standard SDK bytes');
  assert.equal(d2.kernelSha, sha256Hex(await readFile(new URL('../../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8')));
  assert.notEqual(d2.businessSha, d3.businessSha, 'the two Business packages remain genuinely distinct');

  // ---- Pack + clean-consumer install (stock Node, no workspace links). ----
  const root = mkdtempSync(join(tmpdir(), 'dh1005-tf-packed-e2e-'));
  const packs = join(root, 'packs');
  const consumer = join(root, 'consumer');
  try {
    mkdirSync(packs, { recursive: true });
    mkdirSync(consumer, { recursive: true });
    runNpm(['pack', '--pack-destination', packs], packageRoot);
    runNpm(['pack', '--pack-destination', packs], nodePackageRoot);
    const tarballs = readdirSync(packs).filter((name) => name.endsWith('.tgz'));
    assert.equal(tarballs.length, 2, 'core + node packs (the node pack carries the better-sqlite3 dependency)');
    // #1337 (T07a2): this fixture keeps its own isolated legacy pack, and
    // the exact local new-workspace tarballs from the shared verified stage
    // join the SAME clean npm install transaction (verified dependency
    // closure), so the @kaicreator/* closure resolves from local bytes once
    // the legacy manifests gain their new-workspace dependency edges (T07b)
    // instead of E404-ing on the unpublished rc.0 registry artifacts.
    const newPacks = await stageNewWorkspaceTarballs();
    const bridgePaths = verifiedLocalWorkspaceTarballs(newPacks, ['hostNode']);
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'dh1005-tf-packed-e2e-consumer',
      private: true,
      type: 'module',
      allowScripts: { 'better-sqlite3': true },
    }, null, 2));
    runNpm([
      'install', ...tarballs.map((name) => join(packs, name)), ...bridgePaths,
      '--no-audit', '--no-fund', '--ignore-scripts=false',
      ...(process.env.NPM_REGISTRY ? ['--registry', process.env.NPM_REGISTRY] : []),
    ], consumer);
    assertNewWorkspacePackagesInstalled(consumer, [newPacks.contracts, newPacks.microkernel, newPacks.hostNode]);

    writeFileSync(join(consumer, 'sealed-approval-root.json'), JSON.stringify(d2.root), 'utf8');
    writeFileSync(join(consumer, 'sealed-engineering-root.json'), JSON.stringify(d3.root), 'utf8');
    writeFileSync(join(consumer, 'stage1.mjs'), STAGE1);
    writeFileSync(join(consumer, 'stage2.mjs'), STAGE2);

    // ---- stage1: D2 golden quote + D3 review/validation lineage. ----
    const stage1 = await runStage('stage1.mjs', consumer);
    assert.equal(stage1.ok, true, `stage1 failed: ${String(stage1.error)}`);
    assert.equal(stage1.d2Quote.status, 'admitted', 'the #994 golden Approval scenario admits in the packed consumer');
    assert.equal(stage1.d2Quote.targetState, 'approved');
    assert.equal(stage1.d3Review.status, 'admitted');
    assert.deepEqual(stage1.d3Review.context, { changeId: 'E2E-1', reviewedSha: 'sha256:e2e-head' });
    assert.deepEqual(stage1.d2Quote.kernel, stage1.d3Review.kernel, 'both Apps execute the SAME physical Kernel bytes');
    assert.equal(typeof stage1.d3Review.kernel.moduleSha256, 'string');
    for (const label of ['d3ValidationCrossChange', 'd3ValidationCrossSha']) {
      assert.equal(stage1[label].status, 'denied', label);
      assert.equal(stage1[label].reason, 'guard', label);
      assert.equal(stage1[label].unchanged, true, `${label}: zero State/Journal/Effect residue`);
    }
    assert.equal(stage1.d3Validation.status, 'admitted');
    assert.deepEqual(stage1.d3Validation.context, {
      changeId: 'E2E-1', reviewedSha: 'sha256:e2e-head', validationId: 'VAL-E2E-1', testedSha: 'sha256:e2e-head',
    });
    assert.equal(stage1.d3WrongRole.status, 'threw');
    assert.equal(stage1.d3WrongRole.code, 'PRINCIPAL_ROLE_NOT_BOUND',
      'the D2 trusted requester role is not bound to any D3 intent — typed refusal before any K activity');
    assert.equal(stage1.d3WrongRole.unchanged, true);
    assert.equal(stage1.ledgerEffects, 1);
    assert.equal(stage1.evidenceEffects, 2);
    assert.equal(stage1.journalTotal, 3);

    // ---- stage2: NEW process, SAME SQLite — durability + release lineage. ----
    const stage2 = await runStage('stage2.mjs', consumer);
    assert.equal(stage2.ok, true, `stage2 failed: ${String(stage2.error)}`);
    assert.deepEqual(stage2.d2Restarted, { stateKey: 'approved', context: {}, stateRevision: 1, lifecycle: 'completed' },
      'the Approval instance is read back durably from SQLite');
    assert.deepEqual(stage2.d3Restarted, {
      stateKey: 'validation-passed',
      context: { changeId: 'E2E-1', reviewedSha: 'sha256:e2e-head', validationId: 'VAL-E2E-1', testedSha: 'sha256:e2e-head' },
      stateRevision: 2,
      lifecycle: 'active',
    }, 'the D3 lineage committed by stage1 survives the process restart');
    for (const label of ['d3ReleaseCrossChange', 'd3ReleaseCrossValidation', 'd3ReleaseCrossSha']) {
      assert.equal(stage2[label].status, 'denied', label);
      assert.equal(stage2[label].reason, 'guard', label);
      assert.equal(stage2[label].unchanged, true, `${label}: zero State/Journal/Effect residue`);
    }
    assert.equal(stage2.d3Release.status, 'admitted');
    assert.equal(stage2.d3Release.lifecycle, 'completed');
    assert.deepEqual(stage2.d3Release.context, {
      changeId: 'E2E-1', reviewedSha: 'sha256:e2e-head', validationId: 'VAL-E2E-1', testedSha: 'sha256:e2e-head', qualifiedSha: 'sha256:e2e-head',
    });
    // [v0.8.1 R01] committed messageIds replay their durable ACKs.
    assert.equal(stage2.d3ReleaseReplay.status, 'admitted', 'replaying the committed release message replays its durable ACK');
    assert.equal(stage2.d3ReleaseReplay.unchanged, true, 'the replay adds no State/Journal/Effect');
    assert.equal(stage2.d2QuoteReplay.status, 'admitted', 'replaying the committed Approval message replays its durable ACK');
    assert.equal(stage2.d2QuoteReplay.unchanged, true);
    assert.equal(stage2.evidenceEffects, 1, 'exactly one release evidence dispatch in stage2');
    assert.equal(stage2.journalTotal, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Run one consumer stage script and parse its `JSON_RESULT:` verdict. */
function runStage(script: string, cwd: string): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      const line = stdout.split('\n').find((candidate) => candidate.startsWith('JSON_RESULT: '));
      if (line === undefined) {
        reject(new Error(`stage ${script} produced no verdict (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line.slice('JSON_RESULT: '.length)) as Record<string, any>);
    });
  });
}

/** Shared authenticated-consumer journey prelude for both stage scripts. */
const CONSUMER_PRELUDE = `
import { readFile } from 'node:fs/promises';
import { bootstrapTrustedHost, createKernelGateway, mintPrincipalCredential } from '@kaicreator/domain-harness/v8/host';

const ISSUER = ${JSON.stringify(INTEG_ISSUER)};
const SECRET = ${JSON.stringify(INTEG_ISSUER_SECRET)};
const AUDIENCE = 'dh-v08-tf-packed-e2e';
const TENANT = 't1';
const D2_APP = 'order-approval';
const D3_APP = 'domainharness-engineering';
const D2_KEY = 'q-e2e';
const D3_KEY = 'change-e2e';
const sqlitePath = './tf-e2e.sqlite';

const credential = (appId, subject, roles) => mintPrincipalCredential({
  issuerId: ISSUER, grantId: \`g-\${subject}\`, tenantId: TENANT, appId, subject, audience: AUDIENCE, roles,
  issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
}, SECRET);

const outcome = { };
try {
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[ISSUER, SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  const ledgerCalls = [];
  const evidenceCalls = [];
  handle.host.resources.provision('ledger', (_op, payload) => { ledgerCalls.push(payload); return { reserved: true }; });
  handle.host.resources.provision('engineering-evidence', (_op, payload) => { evidenceCalls.push(payload); return { recorded: true }; });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({
    appId: D2_APP,
    packageRoot: JSON.parse(await readFile('./sealed-approval-root.json', 'utf8')),
    genesisRoles: ['platform-operator'],
    authorityClass: 'PRODUCTION',
  });
  await gateway.registerApp({
    appId: D3_APP,
    packageRoot: JSON.parse(await readFile('./sealed-engineering-root.json', 'utf8')),
    genesisRoles: ['platform-operator'],
    authorityClass: 'PRODUCTION',
  });
  const operator = (appId) => credential(appId, 'op', ['platform-operator']);
  const send = async (appId, roles, intentType, messageId, input, instanceKey) => {
    try {
      const receipt = await gateway.send(credential(appId, roles[0], roles), {
        intentType, messageId, input,
        target: { tenantId: TENANT, appId, instanceKey },
      });
      return { receipt, sent: true };
    } catch (error) {
      return { sent: false, code: error?.code ?? error?.message };
    }
  };
  const readInstance = async (appId, roles, instanceKey) => {
    const snapshot = await gateway.queryInstance(credential(appId, roles[0], roles), { tenantId: TENANT, appId, instanceKey });
    return { stateKey: snapshot.state.stateKey, context: snapshot.state.context, stateRevision: snapshot.stateRevision, lifecycle: snapshot.lifecycle };
  };
  const journalTotal = async () => (await handle.host.docs.list('v08-kernel:effect-journal:')).length;
  const step = async (label, appId, roles, intentType, messageId, input, instanceKey) => {
    const before = { instance: await readInstance(appId, roles, instanceKey), journal: await journalTotal(), effects: evidenceCalls.length };
    const { receipt, sent, code } = await send(appId, roles, intentType, messageId, input, instanceKey);
    const after = { instance: await readInstance(appId, roles, instanceKey), journal: await journalTotal(), effects: evidenceCalls.length };
    outcome[label] = {
      status: sent ? receipt.status : 'threw',
      reason: receipt?.denial?.reason,
      code,
      unchanged: JSON.stringify(before) === JSON.stringify(after),
      after,
    };
    return receipt;
  };
`;

const STAGE1 = `${CONSUMER_PRELUDE}
  // ---- D2 Approval: the #994 golden scenario, authenticated requester ----
  await gateway.activateGenesis(operator(D2_APP), { appId: D2_APP, instanceKey: D2_KEY });
  const d2Receipt = await step('d2Quote', D2_APP, ['requester'], 'submitQuoteDecisionDynamic', 'm-d2-quote', { amount: 30, requestId: 'E2E-APX-1' }, D2_KEY);

  // ---- D3 Engineering: review, cross-source falsifiers, validation ----
  await gateway.activateGenesis(operator(D3_APP), { appId: D3_APP, instanceKey: D3_KEY });
  const d3Review = await step('d3Review', D3_APP, ['reviewer'], 'reviewChange', 'm-d3-review', {
    changeId: 'E2E-1', reviewId: 'REV-E2E-1', reviewedSha: 'sha256:e2e-head', reviewApproved: true, revoked: false,
  }, D3_KEY);
  // Self-consistent envelope for ANOTHER change (its own reviewedSha === its own testedSha).
  await step('d3ValidationCrossChange', D3_APP, ['validator'], 'recordValidation', 'm-d3-val-cross-change', {
    changeId: 'E2E-2', validationId: 'VAL-E2E-2', reviewedSha: 'sha256:other-head', testedSha: 'sha256:other-head', testsPassed: true, revoked: false,
  }, D3_KEY);
  // Same change identity, forged different SHA pair.
  await step('d3ValidationCrossSha', D3_APP, ['validator'], 'recordValidation', 'm-d3-val-cross-sha', {
    changeId: 'E2E-1', validationId: 'VAL-E2E-1', reviewedSha: 'sha256:other-head', testedSha: 'sha256:other-head', testsPassed: true, revoked: false,
  }, D3_KEY);
  // The genuine same-source validation.
  const d3Validation = await step('d3Validation', D3_APP, ['validator'], 'recordValidation', 'm-d3-validate', {
    changeId: 'E2E-1', validationId: 'VAL-E2E-1', reviewedSha: 'sha256:e2e-head', testedSha: 'sha256:e2e-head', testsPassed: true, revoked: false,
  }, D3_KEY);
  // A D2 trusted role must not drive a D3 stage.
  await step('d3WrongRole', D3_APP, ['requester'], 'recordValidation', 'm-d3-wrong-role', {
    changeId: 'E2E-1', validationId: 'VAL-E2E-9', reviewedSha: 'sha256:e2e-head', testedSha: 'sha256:e2e-head', testsPassed: true, revoked: false,
  }, D3_KEY);

  outcome.d2Quote.targetState = d2Receipt?.admitted?.targetState;
  outcome.d2Quote.kernel = d2Receipt?.attribution?.kernel;
  outcome.d3Review.context = d3Review?.instance?.state?.context;
  outcome.d3Review.kernel = d3Review?.attribution?.kernel;
  outcome.d3Validation.context = d3Validation?.instance?.state?.context;
  outcome.ledgerEffects = ledgerCalls.length;
  outcome.evidenceEffects = evidenceCalls.length;
  outcome.journalTotal = await journalTotal();
  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = \`\${error?.code ?? ''} \${error?.message ?? String(error)}\`;
}
console.log(\`JSON_RESULT: \${JSON.stringify(outcome)}\`);
`;

const STAGE2 = `${CONSUMER_PRELUDE}
  // ---- Restarted process: durable readback of BOTH Apps ----
  outcome.d2Restarted = await readInstance(D2_APP, ['requester'], D2_KEY);
  outcome.d3Restarted = await readInstance(D3_APP, ['validator'], D3_KEY);

  // ---- Cross-source release falsifiers ----
  await step('d3ReleaseCrossChange', D3_APP, ['release-manager'], 'qualifyRelease', 'm-d3-rel-cross-change', {
    changeId: 'E2E-2', validationId: 'VAL-E2E-1', testedSha: 'sha256:e2e-head', qualifiedSha: 'sha256:e2e-head', releaseApproved: true, revoked: false,
  }, D3_KEY);
  await step('d3ReleaseCrossValidation', D3_APP, ['release-manager'], 'qualifyRelease', 'm-d3-rel-cross-validation', {
    changeId: 'E2E-1', validationId: 'VAL-E2E-2', testedSha: 'sha256:e2e-head', qualifiedSha: 'sha256:e2e-head', releaseApproved: true, revoked: false,
  }, D3_KEY);
  await step('d3ReleaseCrossSha', D3_APP, ['release-manager'], 'qualifyRelease', 'm-d3-rel-cross-sha', {
    changeId: 'E2E-1', validationId: 'VAL-E2E-1', testedSha: 'sha256:other-head', qualifiedSha: 'sha256:other-head', releaseApproved: true, revoked: false,
  }, D3_KEY);

  // ---- The genuine same-source release, then message replay ----
  const d3Release = await step('d3Release', D3_APP, ['release-manager'], 'qualifyRelease', 'm-d3-release', {
    changeId: 'E2E-1', validationId: 'VAL-E2E-1', testedSha: 'sha256:e2e-head', qualifiedSha: 'sha256:e2e-head', releaseApproved: true, revoked: false,
  }, D3_KEY);
  await step('d3ReleaseReplay', D3_APP, ['release-manager'], 'qualifyRelease', 'm-d3-release', {
    changeId: 'E2E-1', validationId: 'VAL-E2E-1', testedSha: 'sha256:e2e-head', qualifiedSha: 'sha256:e2e-head', releaseApproved: true, revoked: false,
  }, D3_KEY);
  await step('d2QuoteReplay', D2_APP, ['requester'], 'submitQuoteDecisionDynamic', 'm-d2-quote', { amount: 30, requestId: 'E2E-APX-1' }, D2_KEY);

  outcome.d3Release.lifecycle = d3Release?.instance?.lifecycle;
  outcome.d3Release.context = d3Release?.instance?.state?.context;
  outcome.evidenceEffects = evidenceCalls.length;
  outcome.journalTotal = await journalTotal();
  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = \`\${error?.code ?? ''} \${error?.message ?? String(error)}\`;
}
console.log(\`JSON_RESULT: \${JSON.stringify(outcome)}\`);
`;
