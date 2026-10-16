/**
 * #1003 / PR #1018 selected-path FR02/FR07 clean-process leg — PARENT.
 *
 * Seals the #1018 FR02 expression and FR07 harness Business closures over
 * the CURRENT selected K/S payload bytes through the compiler BUILD API, then
 * a stock-Node child (package-subpath consumer of the built dist
 * `@kaicreator/domain-harness/v8/host`, no test imports, no tsx) runs the
 * selected-path journeys over a REAL SQLite file and reports one JSON
 * verdict the parent asserts.
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
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

function firstEndpointId(endpoints: unknown): string {
  const first = (endpoints as { endpointId?: unknown }[])[0];
  if (typeof first?.endpointId !== 'string' || first.endpointId.length === 0) {
    throw new Error('fixture: package declares no first endpoint');
  }
  return first.endpointId;
}

/** Local sealed closure (compiler BUILD API; helpers.ts is not edited by this PR). */
async function sealSelectedApp(fixtureFile: string, appId: string): Promise<SealedQualifiedPackageRoot> {
  const businessModule = await import(new URL(fixtureFile, fixtureDir).href) as Record<string, unknown>;
  const kernelMeta = await import(new URL('kernel-mechanism-v1.mjs', payloadDir).href) as Record<string, unknown>;
  const sdkMeta = await import(new URL('standard-sdk-v1.mjs', payloadDir).href) as Record<string, unknown>;
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL(fixtureFile, fixtureDir), 'utf8'),
  ]);
  const kernelId = kernelMeta.MODULE_ID as string;
  const sdkId = sdkMeta.MODULE_ID as string;
  const businessId = businessModule.MODULE_ID as string;
  const businessEndpointId = firstEndpointId(businessModule.ENDPOINTS);
  const intentTypes = businessModule.INTENT_TYPES as string[];
  const submission = {
    rootPackageId: `app:v08:${appId}`,
    packages: [
      {
        packageId: kernelId, kind: 'kernel' as const, abiVersion: kernelMeta.ABI_VERSION as string,
        modulePath: 'modules/kernel.mjs', moduleSource: kernelSource,
        endpoints: kernelMeta.ENDPOINTS as { endpointId: string; kind: string }[],
      },
      {
        packageId: sdkId, kind: 'standard-sdk' as const, abiVersion: sdkMeta.ABI_VERSION as string,
        modulePath: 'modules/standard.mjs', moduleSource: sdkSource,
        endpoints: sdkMeta.ENDPOINTS as { endpointId: string; kind: string }[],
      },
      {
        packageId: businessId, kind: 'business' as const, abiVersion: businessModule.ABI_VERSION as string,
        modulePath: 'modules/business.mjs', moduleSource: businessSource,
        endpoints: businessModule.ENDPOINTS as { endpointId: string; kind: string }[],
        intentTypes,
      },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernelId, endpointId: firstEndpointId(kernelMeta.ENDPOINTS) },
      { role: 'standard-sdk' as const, packageId: sdkId, endpointId: firstEndpointId(sdkMeta.ENDPOINTS) },
      { role: 'business' as const, packageId: businessId, endpointId: businessEndpointId },
      ...intentTypes.map((intentType) => ({
        role: 'intent' as const, intentType, packageId: businessId, endpointId: businessEndpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-12T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-tf-1018-selected',
  });
}

function runChild(script: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    // Stock Node: the parent's execPath WITHOUT the tsx loader (no execArgv).
    const child = spawn(process.execPath, [script, ...args], { cwd: join(fileURLToPath(new URL('../../../../', import.meta.url))) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

test('V08-FR02/FR07 selected-path clean-process: stock-Node dist consumer runs FR02 expression + FR07 continuation/cancel on REAL SQLite', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1018-sel-clean-'));
  try {
    const fr02Root = join(dir, 'fr02-root.json');
    const fr07Root = join(dir, 'fr07-root.json');
    await writeFile(fr02Root, JSON.stringify(await sealSelectedApp('tf-fr02-fr07-expression.mjs', 'tf-fr02-expression')), 'utf8');
    await writeFile(fr07Root, JSON.stringify(await sealSelectedApp('tf-fr02-fr07-harness.mjs', 'tf-fr07-harness')), 'utf8');
    const { stdout, stderr, code } = await runChild(
      fileURLToPath(new URL('./v08-tf-fr02-fr07-selected-clean-process-child.mjs', import.meta.url)),
      [join(dir, 'tf1018.sqlite'), fr02Root, fr07Root, INTEG_ISSUER, INTEG_ISSUER_SECRET],
    );
    const line = stdout.split('\n').find((candidate) => candidate.startsWith('JSON_RESULT: '));
    if (line === undefined) {
      assert.fail(`child produced no verdict (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    assert.equal(code, 0, `child exit code\nstderr:\n${stderr}`);
    const verdict = JSON.parse(line.slice('JSON_RESULT: '.length)) as Record<string, unknown>;
    assert.equal(verdict.ok, true, `child journey failed: ${String(verdict.error)}`);

    // FR02 (V08-FR02-P-F01 / N-F02 legs).
    assert.equal(verdict.fr02Status, 'admitted');
    assert.equal(verdict.fr02TransitionKey, 'evaluate:FR02_LEGACY');
    assert.deepEqual(verdict.fr02Evidence, { status: 'measured', count: 0, scope: 'bound-model-port-invocations' });
    assert.equal(verdict.fr02State, 'evaluated');
    assert.equal(verdict.fr02Ledger, 1);
    assert.equal(verdict.fr02DifferentialStatus, 'denied');
    assert.equal(verdict.fr02DifferentialGuard, 'guard:fr02-legacy-exact');
    assert.equal(verdict.fr02EvalCode, 'SDK_EXPRESSION_FORBIDDEN');
    assert.equal(verdict.fr02EvalState, 'review');
    assert.equal(verdict.fr02LedgerAfterNegatives, 1, 'FR02 negatives dispatched no effect');
    assert.equal(verdict.fr02ModelCalls, 0);

    // FR07 (V08-FR07-P-F01 / N-F02 / N-F03 legs).
    assert.equal(verdict.fr07Status, 'admitted');
    assert.equal(verdict.fr07Turns, 2, 'two physical ModelPort turns');
    assert.deepEqual(verdict.fr07Evidence, { status: 'measured', count: 2, scope: 'bound-model-port-invocations' });
    assert.equal(verdict.fr07Dependencies, 1);
    assert.equal(verdict.fr07State, 'quoted');
    assert.equal(verdict.fr07Ledger, 2);
    assert.equal(verdict.mutationCode, 'MUTATION_CAPABILITY_FORBIDDEN');
    assert.equal(verdict.mutationState, 'evaluating');
    assert.equal(verdict.cancelRequest, 'cancel-requested');
    assert.equal(verdict.cancelStatus, 'terminated');
    assert.equal(verdict.cancelCode, 'CANCELLED');
    assert.equal(verdict.cancelObservedAbort, true);
    assert.equal(verdict.cancelState, 'evaluating');
    assert.equal(verdict.ledgerFinal, 2, 'refused/cancelled occurrences dispatched no effect');
    assert.equal(verdict.journalDocs, 2, 'only the two admitted occurrences journaled');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
