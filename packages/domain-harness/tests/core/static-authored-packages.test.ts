/** R41: 仓库内真实手写 K/S/B Package，不通过 Fixture 生成器创建 Package 文件。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boot, buildApp, canonicalJson, contentDigestOf, type BuildInput,
  type BuildSuccess, type DomainAppDescriptor,
  type DomainAppLock, type DomainPackageManifest, type JsonValue,
} from '@kaicreator/domain-harness';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(HERE, '../../../../examples/selected-packages');
const MICROKERNEL_DIR = resolve(HERE, '../../../microkernel');
const CONTRACTS_DIR = resolve(HERE, '../../../contracts');
const XSTATE_DIR = dirname(fileURLToPath(import.meta.resolve('xstate/package.json')));
const YAML_DIR = dirname(fileURLToPath(import.meta.resolve('yaml/package.json')));
const IDS = ['r41-kdp', 'r41-sdk-base', 'r41-sdk-extra', 'r41-business'] as const;
const KDP = 'r41-kdp';
const MICROKERNEL = '@kaicreator/domain-harness-microkernel';
const CONTRACTS = '@kaicreator/domain-harness-contracts';
const LOCK_PATH = 'dh-lock/app.lock.json';
const DESC_PATH = 'descriptor/app.json';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function authoredInput(name: 'basic' | 'extended', source = SOURCE): BuildInput {
  const packages = IDS.map((id) =>
    readJson(join(source, 'packages', id, 'manifest.json')) as DomainPackageManifest);
  const descriptor = readJson(join(source, 'apps', `${name}.json`)) as DomainAppDescriptor;
  return {
    descriptor, packages,
    packageRoots: Object.fromEntries(IDS.map((id) =>
      [id, join(source, 'packages', id)])),
    packageArtifacts: Object.fromEntries(IDS.map((id) => [id, 'dist/index.mjs'])),
    kdpArtifact: { packageId: KDP, path: 'dist/bootstrap.js' },
  };
}

function accepted(input: BuildInput): BuildSuccess {
  const outcome = buildApp(input);
  assert.equal(outcome.ok, true, outcome.ok ? '' : `${outcome.code}: ${outcome.message}`);
  // assert.equal 在 Node 类型中已把判别式收窄到 BuildSuccess。
  return outcome;
}

test('R41: static authored KDP + App-selected SDK Packages yield two deterministic sealed closures', () => {
  const a = accepted(authoredInput('basic'));
  const b = accepted(authoredInput('extended'));
  assert.deepEqual(a.lock.coreOrder, ['r41-kdp', 'r41-sdk-base', 'r41-business']);
  assert.deepEqual(b.lock.coreOrder, ['r41-kdp', 'r41-sdk-base', 'r41-sdk-extra', 'r41-business']);
  assert.equal(a.lock.selectedPackages.length, 3);
  assert.equal(b.lock.selectedPackages.length, 4);
  assert.ok(!a.lock.selectedPackages.some((pkg) => pkg.packageId === 'r41-sdk-extra'));
  assert.ok(b.lock.selectedPackages.some((pkg) => pkg.packageId === 'r41-sdk-extra'));
  assert.equal(Object.keys(a.lock.resourceDigests).some((key) =>
    key.startsWith('r41-sdk-extra/')), false);
  assert.ok(Object.keys(b.lock.resourceDigests).some((key) =>
    key.startsWith('r41-sdk-extra/')));
  assert.notEqual(a.lock.closureDigest, b.lock.closureDigest);
  assert.deepEqual(accepted(authoredInput('basic')).lockBytes, a.lockBytes);
  const reversed = authoredInput('basic');
  assert.deepEqual(accepted({ ...reversed, packages: [...reversed.packages].reverse() }).lockBytes, a.lockBytes);
});

test('R41: tampered real authored Target ESM is rejected before Boot', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'dh-r41-tamper-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  cpSync(SOURCE, temp, { recursive: true });
  const path = join(temp, 'packages/r41-sdk-base/dist/index.mjs');
  writeFileSync(path, readFileSync(path, 'utf8') + '\nexport const corrupted = true;\n');
  const outcome = buildApp(authoredInput('basic', temp));
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.code, 'DH_BUILD_RESOURCE_DIGEST_MISMATCH');
});

test('R41: selected SDK Extension must satisfy its direct dependency contract', () => {
  const input = authoredInput('extended');
  const packages = input.packages.map((item) => {
    const pkg = item as DomainPackageManifest;
    return pkg.id === 'r41-sdk-extra' ? {
      ...pkg, dependsOn: [{
        package: 'r41-sdk-base', version: '1.0.0',
        interface: 'r41.not-exported',
      }],
    } : pkg;
  });
  const result = buildApp({ ...input, packages });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'DH_BUILD_EXPORT_MISSING');
});

async function copyWorkspaceDependency(
  source: string, installRoot: string, packageId: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const target = join(installRoot, 'node_modules', ...packageId.split('/'));
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'package.json'), JSON.stringify(manifest));
  await cp(join(source, 'dist'), join(target, 'dist'), { recursive: true });
}

async function installAuthoredApp(
  name: 'basic' | 'extended',
  t: import('node:test').TestContext,
  source: string = SOURCE,
): Promise<{ lock: DomainAppLock; app: Awaited<ReturnType<typeof boot>> }> {
  const built = accepted(authoredInput(name, source));
  const installRoot = await mkdtemp(join(tmpdir(), 'dh-r41-boot-'));
  t.after(async () => rm(installRoot, { recursive: true, force: true }));
  const selected = built.lock.selectedPackages.map((pkg) => pkg.packageId);
  for (const id of selected) {
    await cp(join(source, 'packages', id),
      join(installRoot, 'node_modules', id), { recursive: true });
  }
  const exported = { '.': { types: './dist/index.d.ts', import: './dist/index.js' } };
  await copyWorkspaceDependency(MICROKERNEL_DIR, installRoot, MICROKERNEL,
    { name: MICROKERNEL, version: '0.11.0', type: 'module', exports: exported });
  await copyWorkspaceDependency(CONTRACTS_DIR, installRoot, CONTRACTS,
    { name: CONTRACTS, version: '0.11.0', type: 'module', exports: exported });
  await cp(XSTATE_DIR, join(installRoot, 'node_modules/xstate'), { recursive: true });
  await cp(YAML_DIR, join(installRoot, 'node_modules/yaml'), { recursive: true });

  const descriptor = authoredInput(name, source).descriptor as DomainAppDescriptor;
  await mkdir(join(installRoot, 'descriptor'), { recursive: true });
  await mkdir(join(installRoot, 'dh-lock'), { recursive: true });
  await mkdir(join(installRoot, 'dh-install'), { recursive: true });
  // Boot 验证 Descriptor 的规范化原始字节，不接受语义相同但非 canonical 的 JSON。
  await writeFile(join(installRoot, DESC_PATH), canonicalJson(descriptor));
  await writeFile(join(installRoot, LOCK_PATH), built.lockBytes);
  const recordBase = {
    kind: 'DomainAppInstallRecord', schemaVersion: 'dh.install/0.11',
    appId: descriptor.id, appVersion: descriptor.version,
    target: built.lock.target, lockPath: LOCK_PATH,
    lockDigest: built.lock.closureDigest,
    kdpPackageId: KDP, kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: built.lock.bootstrapKdpPin.kdpPrimaryDigest,
  };
  await writeFile(join(installRoot, 'dh-install/installed-record.json'),
    JSON.stringify({ ...recordBase, recordDigest: contentDigestOf(recordBase as unknown as JsonValue) }));
  const pin = {
    schemaVersion: 'dh.pin/0.11' as const,
    target: built.lock.target, kdpPackageId: KDP,
    kdpPrimaryEntry: 'bootstrap' as const,
    kdpPrimaryDigest: recordBase.kdpPrimaryDigest,
    lockDigest: built.lock.closureDigest,
    lockPath: LOCK_PATH,
  };
  globalThis.__dhR41Events = [];
  const app = await boot(pin, {
    installRoot, descriptorPath: DESC_PATH, lockPath: LOCK_PATH,
    hostPorts: [],
    env: { nodeMajor: 22, platform: process.platform },
  });
  return { lock: built.lock, app };
}

declare global {
  var __dhR41Events: Array<{ phase: string; packageId: string }> | undefined;
}

for (const name of ['basic', 'extended'] as const) {
  test(`R41: real authored ${name} App boots KDP with only selected SDK Core and exits in reverse`,
    { timeout: 120_000 }, async (t) => {
      const { lock, app } = await installAuthoredApp(name, t);
      assert.equal(app.status, 'BOOTED', JSON.stringify(app));
      if (app.status !== 'BOOTED') return;
      assert.equal(app.app.status, 'READY');
      const expected = lock.coreOrder;
      assert.deepEqual((globalThis.__dhR41Events ?? [])
        .filter((event) => event.phase === 'init')
        .map((event) => event.packageId), expected);
      await app.app.dispose();
      assert.deepEqual((globalThis.__dhR41Events ?? [])
        .filter((event) => event.phase === 'exit')
        .map((event) => event.packageId), [...expected].reverse());
    });
}

/**
 * R60 W07: directly edit real Package files (no Generator / Forge) into a second
 * SDK generation, then use the identical public Composition + Boot path.
 * A changing implementation is not legitimate until all version/digest/target
 * identities are sealed together; stale or incompatible references must refuse.
 */
async function nextGenerationSource(t: import('node:test').TestContext): Promise<string> {
  const source = await mkdtemp(join(tmpdir(), 'dh-r60-sdk-generation2-'));
  t.after(async () => rm(source, { recursive: true, force: true }));
  await cp(SOURCE, source, { recursive: true });
  const pkgRoot = join(source, 'packages/r41-sdk-extra');
  const definitionPath = join(pkgRoot, 'definitions/lifecycle.json');
  const modulePath = join(pkgRoot, 'dist/index.mjs');
  const descriptorPath = join(source, 'apps/extended.json');
  const oldDefinition = readJson(definitionPath) as Record<string, unknown>;
  const version = '1.0.1';
  const definition = { ...oldDefinition, version,
    description: 'Second-generation directly authored SDK Extension lifecycle' };
  const definitionBytes = Buffer.from(canonicalJson(definition as unknown as JsonValue), 'utf8');
  await writeFile(definitionPath, definitionBytes);
  const definitionSha = `sha256:${createHash('sha256').update(definitionBytes).digest('hex')}`;
  const definitionIdentity = contentDigestOf(definition as unknown as JsonValue);

  const before = readFileSync(modulePath, 'utf8');
  const oldMarker = "events.push({ phase: 'init', packageId: 'r41-sdk-extra' });";
  assert.ok(before.includes(oldMarker), 'second generation requires original actual Init implementation');
  const moduleBytes = Buffer.from(before.replace(oldMarker,
    "events.push({ phase: 'init', packageId: 'r41-sdk-extra-v2' });"), 'utf8');
  await writeFile(modulePath, moduleBytes);
  const moduleSha = `sha256:${createHash('sha256').update(moduleBytes).digest('hex')}`;

  const manifest = readJson(join(pkgRoot, 'manifest.json')) as DomainPackageManifest;
  const upgraded = {
    ...manifest, version,
    elements: manifest.elements.map((item) => ({
      ...item, version, definitionRef: { ...item.definitionRef, digest: definitionSha },
    })),
    init: { ...manifest.init, version, digest: definitionIdentity },
    ...(manifest.exit ? { exit: { ...manifest.exit, version, digest: definitionIdentity } } : {}),
    targetVariants: manifest.targetVariants.map((variant) => ({
      ...variant,
      implementations: variant.implementations.map((impl) => ({
        ...impl,
        entry: { ...impl.entry, module: { ...impl.entry.module, digest: moduleSha } },
      })),
    })),
  };
  await writeFile(join(pkgRoot, 'manifest.json'), canonicalJson(upgraded as unknown as JsonValue));
  const packageJson = readJson(join(pkgRoot, 'package.json')) as Record<string, unknown>;
  await writeFile(join(pkgRoot, 'package.json'), canonicalJson({
    ...packageJson, version,
  } as unknown as JsonValue));
  const oldDescriptor = readJson(descriptorPath) as DomainAppDescriptor;
  const updatedDescriptor = {
    ...oldDescriptor, version,
    roots: { ...oldDescriptor.roots,
      cores: oldDescriptor.roots.cores.map((core) =>
        core.package === 'r41-sdk-extra' ? { ...core, version } : core),
    },
  };
  await writeFile(descriptorPath, canonicalJson(updatedDescriptor as unknown as JsonValue));
  return source;
}

test('R60 W07: SDK composes and boots a directly authored second SDK Package generation', {
  timeout: 120_000,
}, async (t) => {
  const source = await nextGenerationSource(t);
  const original = accepted(authoredInput('extended'));
  const newBuild = accepted(authoredInput('extended', source));
  assert.notEqual(newBuild.lock.closureDigest, original.lock.closureDigest);
  assert.notDeepEqual(newBuild.lockBytes, original.lockBytes);
  assert.ok(newBuild.lock.selectedPackages.some((pkg) =>
    pkg.packageId === 'r41-sdk-extra' && pkg.version === '1.0.1'));
  assert.deepEqual(accepted(authoredInput('extended', source)).lockBytes, newBuild.lockBytes);
  const { app } = await installAuthoredApp('extended', t, source);
  assert.equal(app.status, 'BOOTED', JSON.stringify(app));
  if (app.status !== 'BOOTED') return;
  assert.equal(app.app.status, 'READY');
  assert.ok((globalThis.__dhR41Events ?? []).some((e) =>
    e.phase === 'init' && e.packageId === 'r41-sdk-extra-v2'),
  'new authored SDK version must execute actual new selected Init');
  await app.app.dispose();
  assert.ok((globalThis.__dhR41Events ?? []).some((e) =>
    e.phase === 'exit' && e.packageId === 'r41-sdk-extra'));
});

test('R60 W07: second-generation version and Target mismatches fail closed before Boot', async (t) => {
  const source = await nextGenerationSource(t);
  const input = authoredInput('extended', source);
  const descriptor = input.descriptor as DomainAppDescriptor;
  const stale = { ...descriptor,
    roots: { ...descriptor.roots,
      cores: descriptor.roots.cores.map((core) => core.package === 'r41-sdk-extra'
        ? { ...core, version: '1.0.0' } : core),
    },
  };
  const rejectedVersion = buildApp({ ...input, descriptor: stale });
  assert.equal(rejectedVersion.ok, false, 'stale SDK Package reference must never execute');
  const incompatibleTarget = {
    ...descriptor, target: { ...descriptor.target, nodeMajor: 23 },
  };
  const rejectedTarget = buildApp({ ...input, descriptor: incompatibleTarget });
  assert.equal(rejectedTarget.ok, false, 'unselected Node Target must never silently remap');
});
