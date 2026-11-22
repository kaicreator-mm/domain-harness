/** 从独立安装目录使用公开 SDK Runtime 进行真实 Boot、Workflow 与 Exit 验收。 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { boot } from '@kaicreator/domain-harness/runtime';

const root = dirname(fileURLToPath(import.meta.url));
const pin = JSON.parse(await readFile(join(root, 'dh-install/bootstrap-pin.json'), 'utf8'));
const context = {
  installRoot: root, descriptorPath: 'descriptor/app.json', lockPath: 'dh-lock/app.lock.json',
  hostPorts: [], env: { nodeMajor: Number(process.versions.node.split('.')[0]), platform: process.platform },
  processLifecycle: { timeoutMs: 2000 },
};
const result = await boot(pin, context);
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

// 同一进程、同一受信安装制品顺序启动第二次；第一次 Exit 后的 Rule 状态必须失效。
const business = await import(pathToFileURL(join(root, 'packages/reference-business/dist/index.mjs')).href);
const stale = business.evaluate({ score: 42 });
assert.equal(stale.kind, 'FAILED', 'Rule evaluation after Exit must fail closed');
assert.equal(stale.failure.code, 'REFERENCE_RULE_UNINITIALIZED');
const replayStart = events.length;
const replay = await boot(pin, context);
assert.equal(replay.status, 'BOOTED', JSON.stringify(replay));
if (replay.status !== 'BOOTED') process.exit(1);
assert.equal(replay.app.status, 'READY');
const replayInit = events.slice(replayStart)
  .filter((event) => event.phase === 'init').map((event) => event.packageId);
assert.deepEqual(replayInit, init, 'second activation must re-enter selected Package Init');
const replayVerified = events.slice(replayStart).find((event) => event.phase === 'domain-verified');
assert.equal(replayVerified?.threshold, verified.threshold, 'Rule must be loaded again from selected Content');
await replay.app.dispose();
const replayExit = events.slice(replayStart)
  .filter((event) => event.phase === 'exit').map((event) => event.packageId);
assert.deepEqual(replayExit, [...replayInit].reverse(), 'second activation must clean up independently');
assert.equal(business.evaluate({ score: 42 }).failure?.code, 'REFERENCE_RULE_UNINITIALIZED');

console.log(`REFERENCE_DOMAIN_APP_PASS ${JSON.stringify({
  appStatus: 'READY', workflow: verified.workflow, unknown: verified.unknown,
  denied: verified.denied, initOrder: init, exitOrder: exit, sequentialActivations: 2,
})}`);
