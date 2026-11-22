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
assert.equal(verified.rejection, 'REJECT', 'Rule Content must drive actual negative Workflow outcome');
const ruleDefinition = JSON.parse(await readFile(join(root, 'packages/reference-business/definitions/rule.json'), 'utf8'));
const scope = ruleDefinition.content.find((item) => item.id === 'scope');
assert.equal(verified.threshold, scope.value.threshold, 'runtime threshold must come from selected Rule Content');
assert.equal(verified.unknown, 'UNKNOWN');
assert.equal(verified.denied, 'DH_WORKFLOW_UNSELECTED');
await result.app.dispose();
const exit = events.filter((item) => item.phase === 'exit').map((item) => item.packageId);
assert.deepEqual(exit, [...init].reverse());
console.log(`REFERENCE_DOMAIN_APP_PASS ${JSON.stringify({
  appStatus: 'READY', workflow: verified.workflow, unknown: verified.unknown,
  denied: verified.denied, initOrder: init, exitOrder: exit,
})}`);
