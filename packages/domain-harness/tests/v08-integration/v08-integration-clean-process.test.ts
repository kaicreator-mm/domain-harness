/**
 * #1013 clean-process integrated E2E — PARENT.
 *
 * Seals the two REAL T-F Business app closures in this process, then a
 * stock-Node child (no test imports, package-subpath consumer) runs the
 * full journey over a REAL SQLite file: bootstrap → protected ports →
 * public one-arg load → protected Genesis (both apps) → authenticated
 * send/query through the typed UX transport → D3 staged lifecycle →
 * forged-role/cross-tenant/UNKNOWN/revocation negatives, and reports one
 * JSON verdict the parent asserts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INTEG_ISSUER, INTEG_ISSUER_SECRET, sealRealApp } from './helpers.js';

interface ChildVerdict {
  ok: boolean;
  error?: string;
  publicOneArgLoad?: boolean;
  d2GenesisState?: string;
  d3GenesisState?: string;
  d2Admitted?: boolean;
  d2AuthenticatedRoles?: string[];
  d2GuardDenied?: boolean;
  d2EffectKeys?: { requestId: string }[];
  d2InstanceState?: string;
  d3FinalState?: string;
  d3EvidenceCount?: number;
  negatives?: Record<string, string>;
}

function runChild(script: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: join(fileURLToPath(new URL('../../../../', import.meta.url))) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code: code ?? -1 }));
  });
}

test('I01–I04 clean-process journey: two REAL apps on one REAL SQLite Host', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1013-clean-'));
  try {
    const [approval, engineering] = await Promise.all([sealRealApp('approval'), sealRealApp('engineering')]);
    const rootsPath = join(dir, 'roots.json');
    await writeFile(rootsPath, JSON.stringify({ approval, engineering }), 'utf8');
    const sqlitePath = join(dir, 'clean.sqlite');

    const { stdout, stderr, code } = await runChild(
      fileURLToPath(new URL('./clean-process-child.mjs', import.meta.url)),
      [sqlitePath, rootsPath, INTEG_ISSUER, INTEG_ISSUER_SECRET],
    );
    const line = stdout.split('\n').find((candidate) => candidate.startsWith('JSON_RESULT: '));
    if (line === undefined) {
      assert.fail(`child produced no verdict (code ${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }
    const verdict = JSON.parse(line.slice('JSON_RESULT: '.length)) as ChildVerdict;
    assert.equal(verdict.ok, true, `child journey failed: ${verdict.error ?? 'unknown'}`);
    assert.equal(verdict.publicOneArgLoad, true);
    assert.equal(verdict.d2GenesisState, 'review');
    assert.equal(verdict.d3GenesisState, 'change-proposed');
    assert.equal(verdict.d2Admitted, true);
    assert.deepEqual(verdict.d2AuthenticatedRoles, ['requester']);
    assert.equal(verdict.d2GuardDenied, true);
    assert.deepEqual(verdict.d2EffectKeys, [{ amount: 30, requestId: 'CLEAN-R1' }]);
    assert.equal(verdict.d2InstanceState, 'approved');
    assert.equal(verdict.d3FinalState, 'release-qualified');
    assert.equal(verdict.d3EvidenceCount, 3);
    assert.equal(verdict.negatives?.forgedRole, 'PRINCIPAL_ROLE_NOT_BOUND');
    assert.equal(verdict.negatives?.crossTenant, 'HOST_SCOPE_DENIED');
    assert.equal(verdict.negatives?.unknownIntent, 'INTENT_UNBOUND');
    assert.equal(verdict.negatives?.revokedCredential, 'HOST_CREDENTIAL_REVOKED');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
