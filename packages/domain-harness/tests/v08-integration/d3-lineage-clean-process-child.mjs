/**
 * #1005 D3-K clean-process lineage journey — CHILD entry.
 *
 * A stock-Node clean consumer that touches the Host ONLY through the
 * package public subpath `@kaicreator/domain-harness/v8/host` (built dist; no
 * test helpers, no src imports) over a REAL SQLite file.
 * argv: <mode: stage1|stage2> <sqlitePath> <rootJsonPath> <issuerId> <issuerSecret>
 *   stage1: Genesis → review(A,a) → validation(B) DENY → validation(A,…,b) DENY
 *           → validation(A,V1,a) ADMIT
 *   stage2: (a NEW process on the SAME file — durable lineage only)
 *           release(B) / release(V2) / release(b) DENY → release(A,V1,a) ADMIT
 *           → replay of the admitted release message refused, no new effect
 * Prints one `JSON_RESULT: {...}` line for the parent to assert.
 */
import { readFile } from 'node:fs/promises';

import { bootstrapTrustedHost, createKernelGateway, mintPrincipalCredential } from '@kaicreator/domain-harness/v8/host';

const [mode, sqlitePath, rootPath, issuerId, issuerSecret] = process.argv.slice(2);
const root = JSON.parse(await readFile(rootPath, 'utf8'));
const AUDIENCE = 'dh-v08-d3-lineage-child';
const APP = 'd3-engineering';
const TENANT = 't1';
const KEY = 'change-42';
const target = { tenantId: TENANT, appId: APP, instanceKey: KEY };

function credential(subject, roles) {
  return mintPrincipalCredential({
    issuerId, grantId: `g-${subject}`, tenantId: TENANT, appId: APP, subject, audience: AUDIENCE, roles,
    issuedAt: '2026-10-12T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z',
  }, issuerSecret);
}

const outcome = { mode };
try {
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[issuerId, issuerSecret]]),
    audience: AUDIENCE,
    storage: { path: sqlitePath },
  });
  const evidenceCalls = [];
  handle.host.resources.provision('engineering-evidence', (_op, payload) => {
    evidenceCalls.push(payload);
    return { recorded: true };
  });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP, packageRoot: root, genesisRoles: ['platform-operator'] });

  const send = async (intentType, messageId, input, roles) => {
    try {
      const receipt = await gateway.send(credential(roles[0], roles), { intentType, messageId, input, target });
      return { status: receipt.status, reason: receipt.denial?.reason };
    } catch (error) {
      return { status: 'threw', code: error.code ?? error.message };
    }
  };
  const journal = async () => (await handle.host.docs.list('v08-kernel:effect-journal:')).length;
  const read = async () => {
    const snapshot = await gateway.queryInstance(credential('reviewer', ['reviewer']), target);
    return { stateKey: snapshot.state.stateKey, context: snapshot.state.context, stateRevision: snapshot.stateRevision };
  };
  const step = async (label, intentType, messageId, input, roles) => {
    const before = { instance: await read(), journal: await journal(), effects: evidenceCalls.length };
    const result = await send(intentType, messageId, input, roles);
    const after = { instance: await read(), journal: await journal(), effects: evidenceCalls.length };
    outcome[label] = {
      ...result,
      unchanged: JSON.stringify(before) === JSON.stringify(after),
      after,
    };
  };

  const review = { changeId: 'A', reviewedSha: 'sha-a', reviewApproved: true };
  const validation = { changeId: 'A', validationId: 'V1', testedSha: 'sha-a', testsPassed: true };
  const release = { changeId: 'A', validationId: 'V1', testedSha: 'sha-a', qualifiedSha: 'sha-a', releaseApproved: true };

  if (mode === 'stage1') {
    await gateway.activateGenesis(credential('op', ['platform-operator']), { appId: APP, instanceKey: KEY });
    await step('reviewA', 'reviewChange', 'm-review', review, ['reviewer']);
    await step('validationB', 'recordValidation', 'm-validate-B', { ...validation, changeId: 'B' }, ['validator']);
    await step('validationShaB', 'recordValidation', 'm-validate-b', { ...validation, testedSha: 'sha-b' }, ['validator']);
    await step('validationA', 'recordValidation', 'm-validate', validation, ['validator']);
  } else {
    outcome.restartedInstance = await read();
    await step('releaseB', 'qualifyRelease', 'm-release-B', { ...release, changeId: 'B' }, ['release-manager']);
    await step('releaseV2', 'qualifyRelease', 'm-release-V2', { ...release, validationId: 'V2' }, ['release-manager']);
    await step('releaseShaB', 'qualifyRelease', 'm-release-b', { ...release, testedSha: 'sha-b', qualifiedSha: 'sha-b' }, ['release-manager']);
    await step('releaseA', 'qualifyRelease', 'm-release', release, ['release-manager']);
    await step('releaseReplay', 'qualifyRelease', 'm-release', release, ['release-manager']);
  }
  outcome.effectsThisProcess = evidenceCalls.length;
  outcome.journalTotal = await journal();
  await handle.host.close();
  outcome.ok = true;
} catch (error) {
  outcome.ok = false;
  outcome.error = `${error?.code ?? ''} ${error?.message ?? String(error)}`;
}
console.log(`JSON_RESULT: ${JSON.stringify(outcome)}`);
