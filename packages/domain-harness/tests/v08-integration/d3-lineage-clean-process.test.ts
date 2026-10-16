/**
 * #1005 D3-K durable lineage — PARENT (REAL SQLite, two clean processes).
 *
 * Seals the D3 lineage Business closure over the CURRENT selected K/S
 * payload bytes through the compiler BUILD path, then runs two stock-Node
 * dist consumers (`@kaicreator/domain-harness/v8/host`) against the SAME
 * physical SQLite file:
 *   stage1 — authenticated Genesis + review(A,a); cross-lineage validations
 *            deny with zero State/Journal/Effect; validation(A,V1,a) admits;
 *   stage2 — a NEW process: the lineage committed by stage1 is read back from
 *            SQLite; cross-lineage releases deny with zero residue; the
 *            same-lineage release qualifies; its replay adds no effect.
 * The lineage therefore survives a process restart only because K committed
 * it in the durable instance CAS document.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);

async function sealD3App(): Promise<unknown> {
  // @ts-expect-error fixture module has no declaration file (.mjs)
  const business = await import('./fixtures/d3-business-engineering-lineage.mjs') as Record<string, any>;
  // @ts-expect-error selected kernel payload has no declaration file (.mjs)
  const kernel = await import('../../../domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs') as Record<string, any>;
  // @ts-expect-error selected standard-sdk payload has no declaration file (.mjs)
  const sdk = await import('../../../domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs') as Record<string, any>;
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('./fixtures/d3-business-engineering-lineage.mjs', import.meta.url), 'utf8'),
  ]);
  const endpoint = (module: Record<string, any>) => (module.ENDPOINTS as { endpointId: string }[])[0]!.endpointId;
  const packages = [
    { packageId: kernel.MODULE_ID, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
    { packageId: sdk.MODULE_ID, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
    {
      packageId: business.MODULE_ID, kind: 'business' as const, abiVersion: business.ABI_VERSION, modulePath: 'modules/business.mjs',
      moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES,
    },
  ];
  const submission = {
    rootPackageId: 'app:v08:d3-engineering',
    packages,
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID, endpointId: endpoint(kernel) },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID, endpointId: endpoint(sdk) },
      { role: 'business' as const, packageId: business.MODULE_ID, endpointId: endpoint(business) },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID, endpointId: endpoint(business),
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest, issuerId: INTEG_ISSUER, issuerSecret: INTEG_ISSUER_SECRET, issuedAt: '2026-10-12T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-d3-k',
  });
}

function runChild(args: string[]): Promise<Record<string, any>> {
  const script = fileURLToPath(new URL('./d3-lineage-clean-process-child.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: join(fileURLToPath(new URL('../../../../', import.meta.url))) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      const line = stdout.split('\n').find((candidate) => candidate.startsWith('JSON_RESULT: '));
      if (line === undefined) {
        reject(new Error(`child produced no verdict (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        return;
      }
      resolve(JSON.parse(line.slice('JSON_RESULT: '.length)) as Record<string, any>);
    });
  });
}

const LINEAGE_AFTER_VALIDATION = { changeId: 'A', reviewedSha: 'sha-a', validationId: 'V1', testedSha: 'sha-a' };

test('D3-K: durable cross-stage lineage across two clean processes on one REAL SQLite file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1005-d3k-'));
  try {
    const rootPath = join(dir, 'root.json');
    await writeFile(rootPath, JSON.stringify(await sealD3App()), 'utf8');
    const sqlitePath = join(dir, 'd3.sqlite');

    const stage1 = await runChild(['stage1', sqlitePath, rootPath, INTEG_ISSUER, INTEG_ISSUER_SECRET]);
    assert.equal(stage1.ok, true, `stage1 failed: ${String(stage1.error)}`);
    assert.equal(stage1.reviewA.status, 'admitted');
    assert.deepEqual(stage1.reviewA.after.instance.context, { changeId: 'A', reviewedSha: 'sha-a' });
    for (const label of ['validationB', 'validationShaB']) {
      assert.equal(stage1[label].status, 'denied', label);
      assert.equal(stage1[label].reason, 'guard', label);
      assert.equal(stage1[label].unchanged, true, `${label}: zero State/Journal/Effect`);
    }
    assert.equal(stage1.validationA.status, 'admitted');
    assert.deepEqual(stage1.validationA.after.instance, { stateKey: 'validation-passed', context: LINEAGE_AFTER_VALIDATION, stateRevision: 2 });
    assert.equal(stage1.effectsThisProcess, 2);
    assert.equal(stage1.journalTotal, 2);

    const stage2 = await runChild(['stage2', sqlitePath, rootPath, INTEG_ISSUER, INTEG_ISSUER_SECRET]);
    assert.equal(stage2.ok, true, `stage2 failed: ${String(stage2.error)}`);
    assert.deepEqual(stage2.restartedInstance, { stateKey: 'validation-passed', context: LINEAGE_AFTER_VALIDATION, stateRevision: 2 },
      'the lineage committed by stage1 is read back from the durable SQLite instance document');
    for (const label of ['releaseB', 'releaseV2', 'releaseShaB']) {
      assert.equal(stage2[label].status, 'denied', label);
      assert.equal(stage2[label].unchanged, true, `${label}: zero State/Journal/Effect`);
    }
    assert.equal(stage2.releaseA.status, 'admitted');
    assert.deepEqual(stage2.releaseA.after.instance, {
      stateKey: 'release-qualified', context: { ...LINEAGE_AFTER_VALIDATION, qualifiedSha: 'sha-a' }, stateRevision: 3,
    });
    // [v0.8.1 R01] A re-sent committed messageId replays its durable ACK.
    assert.equal(stage2.releaseReplay.status, 'admitted', 'replaying the qualified release replays its durable ACK');
    assert.equal(stage2.releaseReplay.unchanged, true, 'the replay adds no State/Journal/Effect');
    assert.equal(stage2.effectsThisProcess, 1, 'exactly one release evidence dispatch');
    assert.equal(stage2.journalTotal, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
