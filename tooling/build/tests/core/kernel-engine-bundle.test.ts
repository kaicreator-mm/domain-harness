// Foundation A6/R130 生成期证据：真实 r41-kdp 引擎 bundle 以受信 Kernel Profile 准入
// 通过静态闭包核验并封入确定性 Lock；其可执行闭包由生成期逐字扫描。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../src/index.js';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const KDP_ROOT = join(REPO_ROOT, 'examples', 'reference-domain-app', 'packages', 'r41-kdp');

test('A6: the real bundled KDP engine closure passes Kernel-Profile admission into a sealed Lock', async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), 'r130-kernel-bundle-'));
  t.after(async () => { await rm(workspace, { recursive: true, force: true }); });
  const kdpDir = join(workspace, 'node_modules', 'r41-kdp');
  for (const path of [
    'manifest.json', 'package.json',
    'definitions/kernel-lifecycle.json', 'definitions/kernel-runtime.json',
    'definitions/workflow-runtime.json', 'definitions/app-lifecycle.json',
    'dist/index.mjs',
  ]) {
    const bytes = await readFile(join(KDP_ROOT, ...path.split('/')));
    const dest = join(kdpDir, ...path.split('/'));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
  }
  const manifest = JSON.parse(await readFile(join(kdpDir, 'manifest.json'), 'utf8'));
  const descriptor = {
    kind: 'DomainApp', schemaVersion: 'dh.app/0.11', id: 'kernel.bundle.acceptance', version: '1.0.0',
    target: { runtime: 'node', module: 'esm', nodeMajor: 22 },
    config: { purpose: 'kernel-profile-admission' },
    roots: { kernelPrimary: { package: 'r41-kdp', version: '1.0.0' }, cores: [] },
    extensions: [],
  };
  const result = buildApp({
    descriptor,
    packages: [manifest],
    packageRoots: { 'r41-kdp': kdpDir },
    packageArtifacts: { 'r41-kdp': 'dist/index.mjs' },
  });
  assert.equal(result.ok, true, result.ok ? '' : `${result.code}: ${result.message}`);
  if (!result.ok) return;
  // 受选 Host Target 必须精确绑定 bundle 字节；闭包摘要包含引擎与全部定义文件。
  assert.equal(result.lock.selectedKdpHost.kdpPackageId, 'r41-kdp');
  assert.ok(result.lock.resourceDigests['r41-kdp/dist/index.mjs']);
  assert.ok(result.lock.resourceDigests['r41-kdp/definitions/kernel-lifecycle.json']);
  const engineDigest = result.lock.resourceDigests['r41-kdp/dist/index.mjs'];
  const actualBytes = await readFile(join(kdpDir, 'dist', 'index.mjs'));
  const { createHash } = await import('node:crypto');
  assert.equal(engineDigest,
    `sha256:${createHash('sha256').update(actualBytes).digest('hex')}`,
    'sealed engine closure bytes must be pinned exactly');
});
