/**
 * #1119 — external clean packed two-B consumer journey proof.
 *
 * Packs the exact built package, installs the tarball into an ISOLATED temp
 * directory outside this repository, copies the checked-in example modules
 * plus the sealed payload bytes, and runs the operator+consumer journey in a
 * real Node process against the installed artifact only. No monorepo source
 * import, no workspace symlink, no fake verifier.
 *
 * This is NOT #1037's full regression/Hidden/Critical Journeys.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNewWorkspacePackagesInstalled,
  stageNewWorkspaceTarballs,
  verifiedLocalWorkspaceTarballs,
} from '../../domain-harness-compiler/tests/packed-fixture-stage.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const exampleDir = fileURLToPath(new URL('../../../examples/v09-clean-consumer/', import.meta.url));
const payloadSources = [
  'domain-packages/kernel/basic/kernel-mechanism-v1.mjs',
  'domain-packages/standard/basic/standard-sdk-v1.mjs',
  'domain-packages/standard/basic/workflow-router.mjs',
  'examples/v08-domain-apps/business-approval.mjs',
  'examples/v08-domain-apps/business-engineering.mjs',
  'examples/v08-domain-apps/capability-quote-tools.mjs',
];

function npm(args: readonly string[], options: { cwd: string }): string {
  if (process.platform === 'win32') {
    const command = ['npm.cmd', ...args.map((a: string) => `"${a}"`)].join(' ');
    return execFileSync(command, { shell: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
  }
  return execFileSync('npm', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
}

test('V09-EXT-CONSUMER01: clean packed two-B load/send/query/subscribe/stop journey outside the repository', { timeout: 240_000 }, async () => {
  const packDir = mkdtempSync(join(tmpdir(), 'dh-v09-ext-pack-'));
  const consumerDir = mkdtempSync(join(tmpdir(), 'dh-v09-ext-consumer-'));
  try {
    const packReports = JSON.parse(npm(
      ['pack', '-w', '@kaicreator/domain-harness', '--pack-destination', packDir, '--json'],
      { cwd: repoRoot },
    ));
    assert.ok(Array.isArray(packReports) && packReports.length === 1);
    const tarballPath = join(packDir, packReports[0].filename);
    const sha256 = createHash('sha256').update(readFileSync(tarballPath)).digest('hex');
    console.info(`V09_EXT_CONSUMER_TARBALL_SHA256=${sha256} FILES=${packReports[0].files.length}`);

    // #1337 (T07a2): this fixture keeps its own isolated legacy pack, and
    // the exact local new-workspace tarballs from the shared verified stage
    // join the SAME clean npm install transaction (verified dependency
    // closure), so the @kaicreator/* closure resolves from local bytes once
    // the legacy manifests gain their new-workspace dependency edges (T07b)
    // instead of E404-ing on the unpublished rc.0 registry artifacts.
    const newPacks = await stageNewWorkspaceTarballs();
    const bridgePaths = verifiedLocalWorkspaceTarballs(newPacks, ['hostNode']);

    writeFileSync(join(consumerDir, 'package.json'), JSON.stringify({
      name: 'v09-external-consumer-proof', private: true, type: 'module',
    }, null, 2));
    npm(['install', tarballPath, ...bridgePaths, '--no-fund', '--no-audit', '--loglevel=error'], { cwd: consumerDir });
    assertNewWorkspacePackagesInstalled(consumerDir, [newPacks.contracts, newPacks.microkernel, newPacks.hostNode]);

    cpSync(join(exampleDir, 'operator.mjs'), join(consumerDir, 'operator.mjs'));
    cpSync(join(exampleDir, 'consumer.mjs'), join(consumerDir, 'consumer.mjs'));
    mkdirSync(join(consumerDir, 'payload'), { recursive: true });
    for (const source of payloadSources) {
      cpSync(join(repoRoot, source), join(consumerDir, 'payload', basename(source)), { recursive: true });
    }

    const run = execFileSync(process.execPath, ['operator.mjs'], {
      cwd: consumerDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    const resultLine = run.split(/\r?\n/u).find((line) => line.startsWith('JOURNEY_RESULT '));
    assert.ok(resultLine !== undefined, `operator must print a JOURNEY_RESULT line, got: ${run.slice(-400)}`);
    const journey = JSON.parse(resultLine.slice('JOURNEY_RESULT '.length));
    const stepNames = journey.steps.map((step: { name: string; ok: boolean }) => step.name);
    assert.equal(journey.steps.length, 20, 'the journey is exactly its pinned 20 steps');
    for (const expected of [
      'install.twoBusinessClosure',
      'install.foreignSingleBusinessApp',
      'negative.wrongRuntimeAbiLoadRefused',
      'consumer.surface',
      'negative.loadRefusesWithoutDeploymentScope',
      'negative.rawAndObjectReferenceRefused',
      'negative.smuggledAuthorityRefused',
      'positive.loadTwoBusinessFacade',
      'negative.foreignScopeCannotBorrowReference',
      'positive.subscribeReceiptObserver',
      'positive.approvalSendCommitsRealEffect',
      'positive.receiptDeliveredToObserver',
      'positive.approvalInstanceSnapshot',
      'positive.engineeringIntentRealDispatchTruthfulBusinessDenial',
      'positive.unsubscribeInsideSameScope',
      'positive.noDeliveryAfterUnsubscribe',
      'negative.unapprovedToolCallRefused',
      'positive.stopIsIdempotentAndFailsClosed',
      'negative.capturedFacadeDiesOutsideTrustedScope',
      'teardown.deploymentCloseDetachesSynchronously',
    ]) {
      assert.ok(stepNames.includes(expected), `journey must include ${expected}`);
    }
    const failed = journey.steps.filter((step: { name: string; ok: boolean }) => !step.ok);
    assert.deepEqual(failed, [], `every journey step must pass: ${JSON.stringify(failed)}`);
    assert.equal(journey.ok, true);
    console.info(`V09_EXT_CONSUMER_STEPS=${journey.steps.length} ALL_OK`);
  } finally {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(consumerDir, { recursive: true, force: true });
  }
});
