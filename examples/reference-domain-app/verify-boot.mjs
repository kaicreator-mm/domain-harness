/** 从独立安装目录使用公开 SDK Runtime 进行真实 Boot、Workflow 与 Exit 验收。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '@kaicreator/domain-harness/runtime';

const root = dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(await readFile(join(root, 'dh-install/bootstrap-pin.json'), 'utf8'));
const result = await boot(pin, {
  installRoot: root, descriptorPath: 'descriptor/app.json', lockPath: 'dh-lock/app.lock.json',
  hostPorts: [], env: { nodeMajor: Number(process.versions.node.split('.')[0]), platform: process.platform },
  processLifecycle: { timeoutMs: 2000 },
});
assert.equal(result.status, 'BOOTED', JSON.stringify(result));
if (result.status !== 'BOOTED') process.exit(1);
assert.equal(result.app.status, 'READY');
const events = globalThis.__dhR41Events ?? [];
const init = events.filter((item) => item.phase === 'init').map((item) => item.packageId);
assert.deepEqual(init, ['r41-kdp', 'r41-sdk-base', 'reference-business']);
const verified = events.find((item) => item.phase === 'domain-verified');
assert.ok(verified, 'actual Standard File/Workflow execution must occur within Package.Init');
assert.equal(verified.workflow, 'COMPLETE');
assert.equal(verified.unknown, 'UNKNOWN');
assert.equal(verified.denied, 'DH_WORKFLOW_UNSELECTED');
assert.equal(verified.knowledgeRecords, 4);
assert.equal(events.filter((item) => item.phase === 'extension-init' &&
  item.packageId === 'reference-knowledge').length, 1, 'real Knowledge Extension Init missing');
assert.match(verified.selectedResourceDigest, /^sha256:[0-9a-f]{64}$/u);
assert.equal(verified.cases.length, 11);
const cases = new Map(verified.cases.map((item) => [item.name, item]));
assert.deepEqual(
  ['US_ACCEPT', 'US_REJECT', 'CA_REJECT', 'CA_ACCEPT'].map((name) =>
    [name, cases.get(name)?.status, cases.get(name)?.decision, cases.get(name)?.threshold]),
  [
    ['US_ACCEPT', 'COMPLETE', 'ACCEPT', 10],
    ['US_REJECT', 'COMPLETE', 'REJECT', 10],
    ['CA_REJECT', 'COMPLETE', 'REJECT', 20],
    ['CA_ACCEPT', 'COMPLETE', 'ACCEPT', 20],
  ],
);
for (const [name, code] of [
  ['CONFLICT', 'REFERENCE_KNOWLEDGE_CONFLICT'],
  ['MISSING', 'REFERENCE_KNOWLEDGE_NOT_APPLICABLE'],
  ['STALE', 'REFERENCE_KNOWLEDGE_STALE'],
  ['VERSION', 'REFERENCE_KNOWLEDGE_VERSION_UNAVAILABLE'],
  ['DOMAIN', 'REFERENCE_DOMAIN_NOT_APPLICABLE'],
  ['UNKNOWN_SCORE', 'REFERENCE_SCORE_UNKNOWN'],
  ['FORGED_FACTS', 'REFERENCE_KNOWLEDGE_DIGEST_MISMATCH'],
]) {
  assert.equal(cases.get(name)?.status, 'UNKNOWN');
  assert.equal(cases.get(name)?.reason, code);
}
for (const name of ['US_ACCEPT', 'US_REJECT', 'CA_REJECT', 'CA_ACCEPT']) {
  assert.ok(cases.get(name)?.evidence.length > 0, 'Decision outcome must contain signed source FactId');
}
await result.app.dispose();
const exit = events.filter((item) => item.phase === 'exit').map((item) => item.packageId);
assert.deepEqual(exit, [...init].reverse());
assert.equal(events.filter((item) => item.phase === 'extension-exit' &&
  item.packageId === 'reference-knowledge').length, 1, 'real Knowledge Extension Exit missing');
console.log(`REFERENCE_DOMAIN_APP_PASS ${JSON.stringify({
  appStatus: 'READY', workflow: verified.workflow, unknown: verified.unknown,
  denied: verified.denied, initOrder: init, exitOrder: exit,
  cases: verified.cases, knowledgeRecords: verified.knowledgeRecords,
  selectedResourceDigest: verified.selectedResourceDigest,
})}`);
