// Foundation A6/R130 可证伪证据：引擎唯一物理归属是真实受选 KDP Package 私有闭包，
// 公开 SDK 只保留最小可信 Boot 面；两份真实 KDP 授权副本字节一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { BootResult } from '@kaicreator/domain-harness-contracts';
import {
  boot, buildFixtureInstall, DEFAULT_SCENARIO, events,
  type FixtureInstall,
} from './helpers/install.js';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const MICROKERNEL_DIR = join(REPO_ROOT, 'packages', 'microkernel');
const KDP_CANONICAL = join(REPO_ROOT, 'examples', 'reference-domain-app', 'packages', 'r41-kdp');
const KDP_MIRROR = join(REPO_ROOT, 'examples', 'selected-packages', 'packages', 'r41-kdp');

/** SDK microkernel 发行物中不允许再出现的引擎实现标识（迁移后物理缺席）。 */
const ENGINE_TOKENS = [
  'new PackageSystem(',
  'KdpLoadError',
  'startWorkflowRun(',
  'executeDefinition(',
  'createDomainApp(',
  'installProcessExitHandoff',
  'activateSelectedKdpHostInit',
  'validateBusinessCoreResults(',
] as const;

test('A6: installed SDK microkernel dist carries no executable engine implementation', async () => {
  const distDir = join(MICROKERNEL_DIR, 'dist');
  const files = (await readdir(distDir)).filter((name) => name.endsWith('.js'));
  assert.ok(files.length > 0, 'microkernel dist must be built before this test');
  const sources = await Promise.all(files.map((name) => readFile(join(distDir, name), 'utf8')));
  for (const token of ENGINE_TOKENS) {
    assert.ok(
      sources.every((source) => !source.includes(token)),
      `engine token '${token}' must not remain in SDK microkernel dist after the ownership migration`,
    );
  }
});

test('A6: SDK microkernel package declares no engine runtime dependencies', async () => {
  const manifest = JSON.parse(await readFile(join(MICROKERNEL_DIR, 'package.json'), 'utf8')) as {
    readonly dependencies?: Record<string, string>;
    readonly exports?: Record<string, unknown>;
  };
  assert.deepEqual(manifest.dependencies, { '@kaicreator/domain-harness-contracts': '0.11.0' });
  assert.deepEqual(Object.keys(manifest.exports ?? {}), ['.'],
    'microkernel keeps a single package-root export; engine subpaths belong to the KDP');
});

test('A6: public SDK runtime surface is the trusted Boot plus public contracts only', async () => {
  const runtime = await import(pathToFileURL(join(MICROKERNEL_DIR, 'dist', 'index.js')).href);
  const valueKeys = Object.keys(runtime).sort();
  assert.deepEqual(valueKeys, ['boot'],
    'microkernel public values must be exactly the trusted Boot surface');
});

test('A6: both authored real KDP copies are byte-identical', async () => {
  const relative = [
    'dist/index.mjs', 'manifest.json', 'package.json',
    'definitions/kernel-lifecycle.json', 'definitions/kernel-runtime.json',
    'definitions/workflow-runtime.json', 'definitions/app-lifecycle.json',
  ];
  for (const path of relative) {
    const canonical = await readFile(join(KDP_CANONICAL, ...path.split('/')));
    const mirror = await readFile(join(KDP_MIRROR, ...path.split('/')));
    assert.ok(canonical.equals(mirror), `real KDP copy drift at ${path}`);
  }
});

test('A6: KDP engine bundle is a self-contained ESM closure (no unpinned runtime imports)', async () => {
  const bundle = await readFile(join(KDP_CANONICAL, 'dist', 'index.mjs'), 'utf8');
  for (const forbidden of [
    'from "@kaicreator/', "from '@kaicreator/", 'from "xstate"', "from 'xstate'",
    'from "yaml"', "from 'yaml'", 'require(', 'import "../', "import '../",
  ]) {
    assert.ok(!bundle.includes(forbidden), `engine bundle must not carry unpinned runtime import: ${forbidden}`);
  }
  assert.ok(bundle.includes('from "node:'), 'engine bundle keeps only node:* builtins as external imports');
});

test('A6: runtime trace — engine activation executes from the selected KDP package closure', async (t) => {
  const fixture: FixtureInstall = await buildFixtureInstall(DEFAULT_SCENARIO);
  t.after(async () => fixture.cleanup());
  const engineEventsBefore = (globalThis as { __dhR41Events?: unknown[] }).__dhR41Events?.length ?? 0;
  const result: BootResult = await boot(fixture.pin, fixture.context);
  assert.equal(result.status, 'BOOTED', JSON.stringify(result));
  if (result.status !== 'BOOTED') return;
  // 引擎观测事件由 KDP bundle 自己写入 __dhR41Events；SDK Boot 不产生该事件流。
  const engineEvents = (globalThis as { __dhR41Events?: Array<Record<string, unknown>> }).__dhR41Events ?? [];
  const fresh = engineEvents.slice(engineEventsBefore);
  assert.ok(fresh.some((entry) =>
    entry['phase'] === 'init' && entry['packageId'] === 'fixture-kernel'),
    'the selected KDP bundle must record its own kernel Init entry');
  assert.deepEqual(await result.app.dispose(), { status: 'DISPOSED' });
  const exits = events().filter((event) => event['event'] === 'package-exit').map((event) => event['package']);
  assert.deepEqual(exits, ['fixture-ext', 'fixture-business', '@fixture/sdk', 'fixture-kernel'],
    'reverse Exit still ends with the selected KDP package last');
});
