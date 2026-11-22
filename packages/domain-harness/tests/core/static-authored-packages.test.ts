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
const STANDARD_READER = 'r60-standard-readers';
const MICROKERNEL = '@kaicreator/domain-harness-microkernel';
const CONTRACTS = '@kaicreator/domain-harness-contracts';
const LOCK_PATH = 'dh-lock/app.lock.json';
const DESC_PATH = 'descriptor/app.json';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function authoredInput(name: 'basic' | 'extended', source = SOURCE, withReader = false): BuildInput {
  const ids: readonly string[] = withReader ? [...IDS, STANDARD_READER] : IDS;
  const packages = ids.map((id) =>
    readJson(join(source, 'packages', id, 'manifest.json')) as DomainPackageManifest);
  const descriptor = readJson(join(source, 'apps', `${name}.json`)) as DomainAppDescriptor;
  return {
    descriptor, packages,
    packageRoots: Object.fromEntries(ids.map((id) =>
      [id, join(source, 'packages', id)])),
    packageArtifacts: Object.fromEntries(ids.map((id) => [id, 'dist/index.mjs'])),
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
  withReader = false,
): Promise<{ lock: DomainAppLock; app: Awaited<ReturnType<typeof boot>> }> {
  const built = accepted(authoredInput(name, source, withReader));
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

  const descriptor = authoredInput(name, source, withReader).descriptor as DomainAppDescriptor;
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

/** R60 W02：另一真实领域 r41 在 Package.Init 中直接调用已选的公共 Reader Function。 */
async function r60OtherDomain(t: import('node:test').TestContext): Promise<string> {
  const source = await mkdtemp(join(tmpdir(), 'dh-r60-second-domain-'));
  t.after(async () => rm(source, { recursive: true, force: true }));
  await cp(SOURCE, source, { recursive: true });
  const businessDir = join(source, 'packages/r41-business');
  const modulePath = join(businessDir, 'dist/index.mjs');
  const oldModule = readFileSync(modulePath, 'utf8');
  const oldReturn = "  return { status: 'READY' };";
  assert.ok(oldModule.includes(oldReturn), 'second Domain must preserve real business Init body');
  const moduleText = `import { jsonReader } from 'r60-standard-readers';\n` +
    oldModule.replace(oldReturn, `
  const readerResult = jsonReader({ format: 'json', source: '{"customer":"r41"}' });
  if (readerResult.kind !== 'SUCCEEDED' || readerResult.value.customer !== 'r41') {
    throw new Error('R60 failed to execute selected reader');
  }
  globalThis.__dhR41Events.push({ phase: 'standard-reader', packageId: 'r41-business' });
  return { status: 'READY' };`);
  writeFileSync(modulePath, moduleText);
  const digest: `sha256:${string}` = `sha256:${createHash('sha256').update(moduleText).digest('hex')}`;
  const manifestPath = join(businessDir, 'manifest.json');
  const manifest = readJson(manifestPath) as DomainPackageManifest;
  const definition = readJson(join(source, 'packages', STANDARD_READER, 'definitions/json-reader.json')) as
    import('@kaicreator/domain-harness-contracts').ElementDefinition;
  const readerRef = {
    element: { namespace: definition.id.split('.')[0]!, id: definition.id, version: definition.version,
      digest: contentDigestOf(definition as unknown as JsonValue) },
    functionId: 'jsonReader', contractVersion: '1',
  };
  const updated: DomainPackageManifest = {
    ...manifest,
    dependsOn: [...manifest.dependsOn,
      { package: STANDARD_READER, version: '1.0.0', interface: 'r60.readers.api' }],
    imports: [...manifest.imports, readerRef],
    targetVariants: manifest.targetVariants.map((variant) => ({
      ...variant, implementations: variant.implementations.map((fn) => ({
        ...fn, entry: { ...fn.entry, module: { ...fn.entry.module, digest } },
      })),
    })),
  };
  writeFileSync(manifestPath, canonicalJson(updated as unknown as JsonValue));
  const appPath = join(source, 'apps/extended.json');
  const app = readJson(appPath) as DomainAppDescriptor;
  writeFileSync(appPath, canonicalJson({
    ...app, extensions: [...app.extensions, { package: STANDARD_READER, version: '1.0.0' }],
  } as unknown as JsonValue));
  return source;
}

test('R60 W02: second domain r41 App boots and actually invokes same ordinary Standard Reader', {
  timeout: 120_000,
}, async (t) => {
  const source = await r60OtherDomain(t);
  const input = authoredInput('extended', source, true);
  const built = accepted(input);
  assert.ok(built.lock.selectedPackages.some((pkg) => pkg.packageId === STANDARD_READER));
  const selected = built.lock.selectedFunctions.find((fn) =>
    fn.ref.element.id === 'dh.std.reader.json' && fn.ref.functionId === 'jsonReader');
  assert.ok(selected, 'cross-domain exact Reader FunctionRef selected by BUILD');
  const result = await installAuthoredApp('extended', t, source, true);
  assert.equal(result.app.status, 'BOOTED', JSON.stringify(result.app));
  if (result.app.status !== 'BOOTED') return;
  assert.equal(result.app.app.status, 'READY');
  assert.ok((globalThis.__dhR41Events ?? []).some((event) =>
    event.phase === 'standard-reader' && event.packageId === 'r41-business'),
  'another bounded domain must run the same Reader Function in its real Init');
  await result.app.app.dispose();
});

test('R60 W02: another Domain cannot import unselected or undeclared Standard Reader', async (t) => {
  const source = await r60OtherDomain(t);
  const input = authoredInput('extended', source, true);
  const selectedPool = input.packages as readonly DomainPackageManifest[];
  const unimported = buildApp({ ...input, packages: selectedPool.map((pkg) =>
    pkg.id === 'r41-business' ? { ...pkg, imports: [] } : pkg) });
  assert.equal(unimported.ok, false, 'a public Reader still requires an exact manifest import');
  const unselected = buildApp({ ...input, packages: selectedPool.filter((pkg) =>
    pkg.id !== STANDARD_READER) });
  assert.equal(unselected.ok, false, 'omitting a selected Standard Package cannot silently grant access');

  const staleDigest = buildApp({ ...input, packages: selectedPool.map((pkg) =>
    pkg.id === 'r41-business' ? {
      ...pkg, imports: pkg.imports.map((item) => item.functionId === 'jsonReader'
        ? { ...item, element: { ...item.element, digest: `sha256:${'0'.repeat(64)}` as `sha256:${string}` } : item),
    } : pkg) });
  assert.equal(staleDigest.ok, false, 'wrong Standard Element digest is not an authorized FunctionRef');

  const privateSource = await r60OtherDomain(t);
  const manifestFile = join(privateSource, 'packages', STANDARD_READER, 'manifest.json');
  const original = readJson(manifestFile) as DomainPackageManifest;
  const privatized = { ...original,
    elements: original.elements.map((item) => item.id === 'dh.std.reader.json'
      ? { ...item, visibility: 'private' as const } : item),
  };
  writeFileSync(manifestFile, canonicalJson(privatized as unknown as JsonValue));
  const denied = buildApp(authoredInput('extended', privateSource, true));
  assert.equal(denied.ok, false, 'public Function name cannot bypass private Standard Element visibility');
});
