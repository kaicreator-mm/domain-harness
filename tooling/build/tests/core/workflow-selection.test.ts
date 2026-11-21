/** v0.11.1 T12：复用现有 BUILD/Lock/Package 安装闭包的 Workflow 静态选定反例。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  DH_WORKFLOW_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
  DOMAIN_APP_LOCK_JSON_SCHEMA,
  DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
  contentDigestOf,
  type DomainPackageManifest,
  type FunctionRef,
  type ElementDefinition,
  type JsonValue,
  type WorkflowDefinition,
} from '@kaicreator/domain-harness-contracts';
import { buildApp, type BuildResult } from '../../src/index.js';
import { elementRefOf, functionRefOf, sha256OfBytes, writeRaw } from './fixtures.js';
import { standardCase } from './standard-case.js';

const textEncoder = new TextEncoder();
const YAML_BYTES = textEncoder.encode('record: order-7\nvalid: true\n');
const JSON_BYTES = textEncoder.encode('{"record":"order-7","valid":true}');

function workflowCase(
  t: import('node:test').TestContext,
  options: {
    readonly format?: 'json' | 'yaml';
    readonly withData?: boolean;
    readonly dataMaxBytes?: number;
    readonly sourcePackage?: string;
    readonly badNodeFunction?: boolean;
    readonly workflowElementId?: string;
    readonly rawData?: Uint8Array;
    readonly foreignOwner?: 'orders-ext' | 'aaa-ext';
  } = {},
) {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const bytes = options.rawData ?? (options.format === 'yaml' ? YAML_BYTES : JSON_BYTES);
  const resource = {
    packageId: options.sourcePackage ?? 'orders-business',
    path: options.format === 'yaml' ? 'data/order.yml' : 'data/order.json',
    digest: sha256OfBytes(bytes),
  };
  let workflow: WorkflowDefinition | undefined;
  let selectedForeignRef: FunctionRef | undefined;
  scenario.beforeSeal = () => {
    if (options.foreignOwner) {
      // 由 standardCase.finalize() 构造确定性的 Package 生命周期测试数据。
      const foreignElement: ElementDefinition = {
        kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
        id: `${options.foreignOwner}.lifecycle`, version: '1.0.0',
        description: 'Package-owned lifecycle and selected Hook Functions.',
        content: [],
        functions: ['init', 'exit', 'audit'].map((id) => ({
          id, contractVersion: '1',
          inputSchemaRef: { inline: { type: 'object' } },
          outputSchemaRef: { inline: { type: 'object' } },
          outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] as const,
          effects: 'none' as const,
        })),
      };
      selectedForeignRef = functionRefOf(foreignElement, 'audit');
    }
    const check = functionRefOf(scenario.eligibility as ElementDefinition, 'evaluate');
    workflow = {
      kind: 'Workflow',
      schemaVersion: DH_WORKFLOW_SCHEMA_VERSION,
      id: 'order-verification',
      entryNodeId: 'assess',
      maxElementCalls: 4,
      maxDescendantWorkflowDepth: 0,
      nodes: [{
        id: 'assess', kind: 'function',
        function: options.badNodeFunction ? { ...check, functionId: 'missing' } : selectedForeignRef ?? check,
        ...(options.withData ? { data: {
          format: options.format ?? 'json', resource,
          maxBytes: options.dataMaxBytes ?? 4096,
        } } : {}),
        switch: { exits: [
          { label: 'SUCCEEDED', target: { terminal: 'COMPLETE' } },
          { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
          { label: 'FAILED', target: { terminal: 'FAILED' } },
        ] },
      }],
    };
    scenario.appMain.content.push({
      id: 'business-flow', contentKind: 'workflow-definition',
      schemaRef: { inline: { type: 'object' } },
      required: true, value: workflow as unknown as JsonValue,
    });
  };
  const { input } = scenario.finalize();
  if (options.withData && scenario.ws.packageRoots[resource.packageId]) {
    const onDisk = writeRaw(scenario.ws.packageRoots[resource.packageId]!, resource.path, bytes);
    assert.equal(onDisk.digest, resource.digest);
  }
  const ref = elementRefOf(scenario.appMain as ElementDefinition);
  const packages: DomainPackageManifest[] = (input.packages as readonly DomainPackageManifest[]).map((pkg) =>
    pkg.id === 'orders-business'
      ? { ...pkg, workflowRoots: [{
        element: options.workflowElementId ? { ...ref, id: options.workflowElementId } : ref,
        contentId: 'business-flow',
      }] }
      : pkg);
  if (workflow === undefined) throw new Error('fixture: beforeSeal did not create Workflow');
  return {
    input: {
      ...input,
      packages,
      runtimeDependencies: { ...input.runtimeDependencies, xstate: '5.33.2', yaml: '2.9.1' },
    },
    ref, resource, workflow, foreignRef: selectedForeignRef,
  };
}

/** 在真实 Extension 元数据中封存另一份 Workflow，用来测试跨 Owner 与子流程权限。 */
function crossOwnerWorkflowCase(t: import('node:test').TestContext,
  options: { privateRoot?: boolean; transitiveOnly?: boolean; nested?: boolean; authorizeNested?: boolean } = {},
) {
  const { input, workflow, foreignRef } = workflowCase(t, { foreignOwner: 'orders-ext' });
  assert.ok(foreignRef);
  const rootDir = input.packageRoots['orders-ext']!;
  const nestedDir = input.packageRoots['aaa-ext']!;
  const makeElement = (id: string, contentId: string, definition: WorkflowDefinition): ElementDefinition => ({
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id, version: '1.0.0', description: '跨 Package 权限测试 Workflow。',
    content: [{ id: contentId, contentKind: 'workflow-definition',
      schemaRef: { inline: { type: 'object' } }, required: true,
      value: definition as unknown as JsonValue }],
    functions: [],
  });
  let nestedRef: { element: ReturnType<typeof elementRefOf>; contentId: string } | undefined;
  let nestedEntry: DomainPackageManifest['elements'][number] | undefined;
  if (options.nested) {
    const aaaLifecycle: ElementDefinition = {
      kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
      id: 'aaa-ext.lifecycle', version: '1.0.0',
      description: 'Package-owned lifecycle and selected Hook Functions.',
      content: [], functions: ['init', 'exit', 'audit'].map((id) => ({
        id, contractVersion: '1', inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'object' } },
        outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] as const, effects: 'none' as const,
      })),
    };
    const childWorkflow: WorkflowDefinition = {
      ...workflow, id: 'nested-external', entryNodeId: 'leaf', maxDescendantWorkflowDepth: 0,
      nodes: [{ id: 'leaf', kind: 'function',
        function: functionRefOf(aaaLifecycle, 'audit'),
        switch: { exits: [
          { label: 'SUCCEEDED', target: { terminal: 'COMPLETE' } },
          { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
          { label: 'FAILED', target: { terminal: 'FAILED' } },
        ] } }],
    };
    const nested = makeElement('aaa-ext.nested-flow', 'child-flow', childWorkflow);
    const file = writeRaw(nestedDir, 'definitions/nested-flow.json',
      textEncoder.encode(JSON.stringify(nested)));
    nestedRef = { element: elementRefOf(nested), contentId: 'child-flow' };
    nestedEntry = { id: nested.id, version: nested.version, definitionRef: file, visibility: 'public' };
  }
  const parentWorkflow: WorkflowDefinition = options.nested
    ? { ...workflow, id: 'cross-owner-parent', entryNodeId: 'child', maxDescendantWorkflowDepth: 1,
      nodes: [{ id: 'child', kind: 'workflow', workflow: nestedRef!,
        switch: { exits: [
          { label: 'COMPLETE', target: { terminal: 'COMPLETE' } },
          { label: 'UNKNOWN', target: { terminal: 'UNKNOWN' } },
          { label: 'FAILED', target: { terminal: 'FAILED' } },
        ] } }] }
    : { ...workflow, id: 'cross-owner-parent', nodes: [
      { id: 'assess', kind: 'function', function: foreignRef, switch: workflow.nodes[0]!.switch },
    ] };
  const parent = makeElement('orders-ext.external-flow', 'external-flow', parentWorkflow);
  const parentFile = writeRaw(rootDir, 'definitions/external-flow.json',
    textEncoder.encode(JSON.stringify(parent)));
  const parentEntry: DomainPackageManifest['elements'][number] = {
    id: parent.id, version: parent.version, definitionRef: parentFile,
    visibility: options.privateRoot ? 'private' : 'public',
  };
  const rootRef = { element: elementRefOf(parent), contentId: 'external-flow' };
  const packages = input.packages.map((pkg) => {
    if (pkg.id === 'orders-business') return {
      ...pkg, workflowRoots: [rootRef],
      dependsOn: options.transitiveOnly
        ? pkg.dependsOn.filter((dep) => dep.package !== 'orders-ext')
        : pkg.dependsOn,
    };
    if (pkg.id === 'orders-ext') return {
      ...pkg, elements: [...pkg.elements, parentEntry],
      exports: [...pkg.exports, { elementId: parent.id }],
      dependsOn: options.authorizeNested
        ? [...pkg.dependsOn, { package: 'aaa-ext', version: '1.0.0', interface: 'aaa.audit' }]
        : pkg.dependsOn,
    };
    if (pkg.id === 'aaa-ext') return {
      ...pkg,
      elements: nestedEntry ? [...pkg.elements, nestedEntry] : pkg.elements,
      exports: nestedEntry ? [...pkg.exports, { elementId: nestedEntry.id }] : pkg.exports,
      dependsOn: options.transitiveOnly
        ? [...pkg.dependsOn, { package: 'orders-ext', version: '1.0.0', interface: 'orders.audit' }]
        : pkg.dependsOn,
    };
    return pkg;
  });
  return { ...input, packages, runtimeDependencies: { ...input.runtimeDependencies, xstate: '5.33.2', yaml: '2.9.1' } };
}

function accepted(result: BuildResult): Extract<BuildResult, { ok: true }> {
  if (!result.ok) assert.fail(`${result.code}: ${result.message}`);
  return result;
}

function rejected(result: BuildResult, code: string): void {
  assert.equal(result.ok, false, result.ok ? 'BUILD must reject' : result.message);
  if (!result.ok) assert.equal(result.code, code);
}

test('T12 R1: the existing BUILD selects and pins one real Workflow definition and Function in one Lock', (t) => {
  const { input, ref, workflow } = workflowCase(t);
  const a = accepted(buildApp(input));
  const b = accepted(buildApp(input));
  assert.deepEqual(a.lockBytes, b.lockBytes, 'only one deterministic Lock is used');
  assert.equal(a.appPackage.packageDigest, b.appPackage.packageDigest);
  const composedManifest = JSON.parse(Buffer.from(a.appPackage.files.find((file) => file.path === 'package.json')!.bytes).toString('utf8'));
  assert.equal(composedManifest.dependencies.xstate, '5.33.2');
  assert.equal(composedManifest.dependencies.yaml, '2.9.1');
  assert.deepEqual(a.lock.trustedRuntimeIntegrity?.map((archive) => archive.name), ['xstate', 'yaml']);
  const attestFile = a.appPackage.files.find((file) => file.path === 'dh-install/trusted-runtime.json');
  const verifyFile = a.appPackage.files.find((file) => file.path === 'dh-install/verify-runtime.mjs');
  assert.ok(attestFile && verifyFile, 'composed package must carry exact executable archive SRI attest + verifier');
  const attest = JSON.parse(Buffer.from(attestFile.bytes).toString('utf8'));
  assert.deepEqual(attest.archives, a.lock.trustedRuntimeIntegrity,
    'trusted runtime byte pins must be sealed in both Lock and App Package');
  assert.ok(attest.archives.every((item: { integrity: string }) => item.integrity.startsWith('sha512-')),
    'third-party executable tarballs must be pinned by actual SHA-512 archive digest');
  const bootModule = a.appPackage.files.find((file) => file.path === 'boot.mjs');
  assert.ok(bootModule);
  const bootSource = Buffer.from(bootModule.bytes).toString('utf8');
  assert.ok(bootSource.indexOf('verify-runtime.mjs') < bootSource.indexOf("import('@kaicreator/domain-harness-microkernel')"),
    'external trusted runtime attestation must run BEFORE dynamic KDP import');
  assert.equal(a.lock.selectedWorkflows?.length, 1);
  const selected = a.lock.selectedWorkflows![0]!;
  assert.deepEqual(selected.ref, { element: ref, contentId: 'business-flow' });
  assert.equal(selected.ownerPackageId, 'orders-business');
  assert.equal(selected.definitionDigest, contentDigestOf(workflow as unknown as JsonValue));
  assert.equal(selected.definition.nodes[0]?.id, 'assess');
  assert.ok(a.lock.selectedPackages.find((pkg) =>
    pkg.packageId === 'orders-business')?.workflowRoots?.some((root) => root.element.digest === ref.digest));
  assert.ok(a.lock.selectedFunctions.some((selectedFunction) =>
    selectedFunction.ref.element.id === 'orders.eligibility' &&
    selectedFunction.ref.functionId === 'evaluate'));
});

test('T12 R4: actual packaged first-party verifier refuses altered xstate/yaml sha512 before Boot', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true });
  const app = accepted(buildApp(input));
  const get = (path: string): Uint8Array => {
    const file = app.appPackage.files.find((item) => item.path === path);
    assert.ok(file, `composed App omitted '${path}'`);
    return file.bytes;
  };
  const root = mkdtempSync(join(tmpdir(), 'dh-t12-trust-integrity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path: string, bytes: Uint8Array | string): void => {
    const location = join(root, ...path.split('/'));
    mkdirSync(join(location, '..'), { recursive: true });
    writeFileSync(location, bytes);
  };
  write('dh-install/trusted-runtime.json', get('dh-install/trusted-runtime.json'));
  write('dh-install/verify-runtime.mjs', get('dh-install/verify-runtime.mjs'));
  write('dh-lock/app.lock.json', app.lockBytes);
  const pins = app.lock.trustedRuntimeIntegrity!;
  for (const pin of pins) {
    write(`node_modules/${pin.name}/package.json`,
      JSON.stringify({ name: pin.name, version: pin.version, type: 'module' }));
  }
  const npmLock = {
    name: 't12-trust-verified', version: '1.0.0', lockfileVersion: 3,
    packages: Object.fromEntries(pins.map((pin) => [
      `node_modules/${pin.name}`,
      { version: pin.version, integrity: pin.integrity, resolved:
        `https://registry.npmjs.org/${pin.name}/-/${pin.name}-${pin.version}.tgz` },
    ])),
  };
  const runVerifier = () => spawnSync(process.execPath,
    [join(root, 'dh-install', 'verify-runtime.mjs')],
    { cwd: root, encoding: 'utf8', timeout: 15000 });
  write('package-lock.json', JSON.stringify(npmLock));
  const valid = runVerifier();
  assert.equal(valid.status, 0, `精确 npm Lock 与已安装版本必须通过校验：${valid.stderr}`);

  const bad = structuredClone(npmLock);
  bad.packages['node_modules/xstate']!.integrity = 'sha512-INVALID_ARCHIVE_BYTES';
  write('package-lock.json', JSON.stringify(bad));
  const refused = runVerifier();
  assert.notEqual(refused.status, 0, 'tampered third-party npm tarball SRI MUST fail');
  assert.match(refused.stderr, /DH_TRUSTED_RUNTIME_INTEGRITY_MISMATCH/);

  write('package-lock.json', JSON.stringify(npmLock));
  const forgedLock = {
    ...structuredClone(app.lock),
    trustedRuntimeIntegrity: [{ ...pins[0]!, integrity: 'sha512-FAKE' }, pins[1]!],
  };
  write('dh-lock/app.lock.json', JSON.stringify(forgedLock));
  const refusedSealed = runVerifier();
  assert.notEqual(refusedSealed.status, 0, 'unmatched Lock archive bytes cannot be silently trusted');
  assert.match(refusedSealed.stderr, /DH_TRUSTED_RUNTIME_LOCK_MISMATCH/);
});

test('T12 R11 P1: BUILD seals a preinstall verifier and script-free lock-first installer', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true });
  const built = accepted(buildApp(input));
  const get = (path: string): Uint8Array => {
    const file = built.appPackage.files.find((entry) => entry.path === path);
    assert.ok(file, `缺少受控安装工件：${path}`);
    return file.bytes;
  };
  const root = mkdtempSync(join(tmpdir(), 'dh-t12-preinstall-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path: string, bytes: Uint8Array | string): void => {
    const destination = join(root, ...path.split('/'));
    mkdirSync(join(destination, '..'), { recursive: true });
    writeFileSync(destination, bytes);
  };
  const manifest = JSON.parse(Buffer.from(get('package.json')).toString('utf8')) as {
    name: string; version: string; dependencies: Record<string, string>;
  };
  write('package.json', get('package.json'));
  write('dh-lock/app.lock.json', built.lockBytes);
  write('dh-install/trusted-runtime.json', get('dh-install/trusted-runtime.json'));
  write('dh-install/verify-preinstall.mjs', get('dh-install/verify-preinstall.mjs'));
  const installSource = Buffer.from(get('dh-install/install-runtime.mjs')).toString('utf8');
  assert.match(installSource, /--package-lock-only/u);
  assert.match(installSource, /--ignore-scripts/u);
  assert.match(installSource, /'ci'/u);
  const pins = built.lock.trustedRuntimeIntegrity!;
  const packages: Record<string, unknown> = {
    '': { name: manifest.name, version: manifest.version, dependencies: manifest.dependencies },
  };
  for (const pkg of built.lock.selectedPackages) {
    packages[`packages/${pkg.packageId}`] = { name: pkg.packageId, version: pkg.version };
    packages[`node_modules/${pkg.packageId}`] = { resolved: `packages/${pkg.packageId}`, link: true };
  }
  for (const name of ['@kaicreator/domain-harness-microkernel', '@kaicreator/domain-harness-contracts']) {
    packages[`node_modules/${name}`] = { version: '0.11.0', resolved: 'file:trusted-first-party.tgz' };
  }
  for (const pin of pins) {
    packages[`node_modules/${pin.name}`] = {
      version: pin.version, integrity: pin.integrity,
      resolved: `https://registry.npmjs.org/${pin.name}/-/${pin.name}-${pin.version}.tgz`,
    };
  }
  const npmLock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages };
  const run = (registry?: string) => spawnSync(process.execPath, [join(root, 'dh-install/verify-preinstall.mjs')],
    { cwd: root, encoding: 'utf8', timeout: 15000,
      env: registry ? { ...process.env, npm_config_registry: registry } : process.env });
  write('package-lock.json', JSON.stringify(npmLock));
  const pass = run();
  assert.equal(pass.status, 0, `已审核的 npm Lock 应通过：${pass.stderr}`);
  // 真实 Woodpecker 使用 Docker 内部 HTTP Registry，必须匹配显式配置且不放松 SRI。
  const localRegistry = 'http://host.docker.internal:14873';
  const localLock = structuredClone(npmLock);
  for (const pin of pins) {
    (localLock.packages[`node_modules/${pin.name}`] as { resolved: string }).resolved =
      `${localRegistry}/${pin.name}/-/${pin.name}-${pin.version}.tgz`;
  }
  write('package-lock.json', JSON.stringify(localLock));
  const localPass = run(localRegistry);
  assert.equal(localPass.status, 0, `显式本地 CI Registry 与相同 SRI 应通过：${localPass.stderr}`);
  // WHATWG URL.hostname 将 IPv6 loopback 表示为 [::1]；仅允许显式配置的精确 HTTP origin。
  const ipv6Registry = 'http://[::1]:14873';
  const ipv6Lock = structuredClone(npmLock);
  for (const pin of pins) {
    (ipv6Lock.packages[`node_modules/${pin.name}`] as { resolved: string }).resolved =
      `${ipv6Registry}/${pin.name}/-/${pin.name}-${pin.version}.tgz`;
  }
  write('package-lock.json', JSON.stringify(ipv6Lock));
  const ipv6Pass = run(ipv6Registry);
  assert.equal(ipv6Pass.status, 0,
    `显式配置的 IPv6 回环地址与精确 SRI 必须被接受：${ipv6Pass.stderr}`);
  const ipv6WrongOrigin = run('http://[::1]:14874');
  assert.notEqual(ipv6WrongOrigin.status, 0,
    '即使同为 IPv6 回环地址，Registry origin 不匹配也必须拒绝');
  assert.match(ipv6WrongOrigin.stderr, /DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH/u);
  write('package-lock.json', JSON.stringify(localLock));
  const unconfiguredLocal = run('https://registry.npmjs.org');
  assert.notEqual(unconfiguredLocal.status, 0, '不得允许与已声明 Registry 不符的 HTTP 源');
  assert.match(unconfiguredLocal.stderr, /DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH/u);
  const untrustedOrigin = structuredClone(localLock);
  (untrustedOrigin.packages['node_modules/xstate'] as { resolved: string }).resolved =
    'http://untrusted.example/xstate/-/xstate-5.33.2.tgz';
  write('package-lock.json', JSON.stringify(untrustedOrigin));
  const remoteRefused = run(localRegistry);
  assert.notEqual(remoteRefused.status, 0, '任意外部 HTTP Registry 必须在下载前被拒绝');
  assert.match(remoteRefused.stderr, /DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH/u);
  write('package-lock.json', JSON.stringify(npmLock));
  const altered = structuredClone(npmLock);
  (altered.packages['node_modules/xstate'] as { integrity: string }).integrity = 'sha512-UNAPPROVED';
  write('package-lock.json', JSON.stringify(altered));
  const refused = run();
  assert.notEqual(refused.status, 0, '下载前必须拒绝与批准 SRI 不同的归档');
  assert.match(refused.stderr, /DH_TRUSTED_RUNTIME_PREINSTALL_SRI_MISMATCH/u);
  const extra = structuredClone(npmLock);
  extra.packages['node_modules/unselected-module'] = { version: '1.0.0' };
  write('package-lock.json', JSON.stringify(extra));
  const noExtension = run();
  assert.notEqual(noExtension.status, 0, '下载前必须拒绝未选择的传递依赖');
  assert.match(noExtension.stderr, /DH_TRUSTED_RUNTIME_UNSELECTED_DEPENDENCY/u);
});

test('T12 R11 P1: real npm ci rejects a corrupted local tarball without executing install hooks', (t) => {
  const npmCli = process.env['npm_execpath'];
  assert.ok(npmCli, '本测试应通过 npm test 运行以取得实际 npm CLI 路径');
  const root = mkdtempSync(join(tmpdir(), 'dh-t12-npm-integrity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'probe-src');
  const app = join(root, 'probe-app');
  mkdirSync(source, { recursive: true });
  mkdirSync(app, { recursive: true });
  writeFileSync(join(source, 'package.json'), JSON.stringify({
    name: 'dh-install-integrity-probe', version: '1.0.0',
    scripts: { install: 'node install-marker.cjs' },
  }));
  writeFileSync(join(source, 'install-marker.cjs'), 'require("fs").writeFileSync("unexpected-script.txt", "ran");');
  writeFileSync(join(source, 'index.js'), 'module.exports = 1;');
  const pack = spawnSync(process.execPath,
    [npmCli, 'pack', '--ignore-scripts', '--pack-destination', root, '--silent'],
    { cwd: source, encoding: 'utf8', timeout: 60000, env: { ...process.env, npm_config_cache: join(root, 'pack-cache') } });
  assert.equal(pack.status, 0, `无法创建隔离测试归档：${pack.stderr}`);
  const tarball = join(root, pack.stdout.trim().split('\n').at(-1)!);
  const sourceBytes = readFileSync(tarball);
  const digest = 'sha512-' + createHash('sha512').update(sourceBytes).digest('base64');
  const dependency = 'file:' + tarball;
  writeFileSync(join(app, 'package.json'),
    JSON.stringify({ name: 'dh-probe-app', version: '1.0.0', dependencies: { 'dh-install-integrity-probe': dependency } }));
  const lock = {
    name: 'dh-probe-app', version: '1.0.0', lockfileVersion: 3, requires: true,
    packages: {
      '': { name: 'dh-probe-app', version: '1.0.0', dependencies: { 'dh-install-integrity-probe': dependency } },
      'node_modules/dh-install-integrity-probe': {
        version: '1.0.0', resolved: dependency, integrity: digest,
      },
    },
  };
  writeFileSync(join(app, 'package-lock.json'), JSON.stringify(lock));
  const ci = (cache: string) => spawnSync(process.execPath,
    [npmCli, 'ci', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'],
    { cwd: app, encoding: 'utf8', timeout: 60000, env: { ...process.env, npm_config_cache: join(root, cache) } });
  const positive = ci('good-cache');
  assert.equal(positive.status, 0, `原始归档应可校验安装：${positive.stderr}`);
  assert.equal(existsSync(join(app, 'node_modules/dh-install-integrity-probe/unexpected-script.txt')), false,
    '即使归档自带安装 Hook，--ignore-scripts 也不得执行');
  appendFileSync(tarball, Buffer.from('tampered archive payload'));
  const negative = ci('bad-cache');
  assert.notEqual(negative.status, 0, '与锁定 SHA-512 不符的真实归档必须在执行前拒绝');
  assert.equal(existsSync(join(app, 'node_modules/dh-install-integrity-probe/unexpected-script.txt')), false,
    '损坏的归档不得执行任何安装脚本');
});

test('T12 R1: expanded existing Manifest/Lock machine schemas accept actually selected Workflow closure', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true });
  const built = accepted(buildApp(input));
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const checkLock = ajv.compile(DOMAIN_APP_LOCK_JSON_SCHEMA as never);
  const checkManifest = ajv.compile(DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA as never);
  assert.equal(checkLock(built.lock), true, JSON.stringify(checkLock.errors));
  for (const pkg of input.packages) {
    assert.equal(checkManifest(pkg), true, JSON.stringify(checkManifest.errors));
  }
});

test('T12 R1: raw YAML data in a directly declared Extension is eligible but not transitive', (t) => {
  const { input, resource } = workflowCase(t, {
    format: 'yaml', withData: true, sourcePackage: 'orders-ext',
  });
  const built = accepted(buildApp(input));
  assert.equal(built.lock.resourceDigests[`${resource.packageId}/${resource.path}`], resource.digest);
});

test('T12 R1: strict UTF-8 rejects malformed YAML bytes even if their digest matches', (t) => {
  const { input } = workflowCase(t, {
    format: 'yaml', withData: true, rawData: Uint8Array.from([0xc3, 0x28]),
  });
  rejected(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('T12 R1: selected JSON resource must actually parse before sealing', (t) => {
  const { input } = workflowCase(t, {
    format: 'json', withData: true, rawData: textEncoder.encode('{not json}'),
  });
  rejected(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('T12 R1: real YAML resource bytes are sealed without pretending a generic ContentBlock.ref is JSON', (t) => {
  const { input, resource } = workflowCase(t, { format: 'yaml', withData: true });
  const a = accepted(buildApp(input));
  assert.equal(a.lock.resourceDigests[`${resource.packageId}/${resource.path}`], resource.digest);
  assert.ok(a.appPackage.files.some((file) => file.digest === resource.digest),
    'verified YAML bytes must enter actual composed App Package');
});

test('T12 R1: real JSON reader data is also sealed into the existing package', (t) => {
  const { input, resource } = workflowCase(t, { format: 'json', withData: true });
  const a = accepted(buildApp(input));
  assert.equal(a.lock.resourceDigests[`${resource.packageId}/${resource.path}`], resource.digest);
});

test('T12 R1: malformed selected Workflow identity is rejected before Runtime', (t) => {
  const { input } = workflowCase(t, { workflowElementId: 'orders.missing' });
  rejected(buildApp(input), 'DH_BUILD_REF_UNRESOLVED');
});

test('T12 R4 P2: a selected WorkflowRoot cannot be started by unrelated Core Package', (t) => {
  const { input, ref } = workflowCase(t);
  const wrongCaller = {
    ...input, packages: input.packages.map((pkg) => {
      if (pkg.id === 'orders-business') return { ...pkg, workflowRoots: [] };
      if (pkg.id === 'sdk-core') return { ...pkg, workflowRoots: [{
        element: ref, contentId: 'business-flow',
      }] };
      return pkg;
    }),
  };
  rejected(buildApp(wrongCaller), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('T12 R4 P2: selected cross-Extension workflow Function requires explicit FunctionRef import', (t) => {
  const { input, foreignRef } = workflowCase(t, { foreignOwner: 'orders-ext' });
  assert.ok(foreignRef);
  rejected(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
  const legal = {
    ...input, packages: input.packages.map((pkg) =>
      pkg.id === 'orders-business'
        ? { ...pkg, imports: [...pkg.imports, foreignRef] }
        : pkg),
  };
  accepted(buildApp(legal));
});

test('T12 R4 P2: private cross-owner Function never becomes callable from Workflow node', (t) => {
  const { input, foreignRef } = workflowCase(t, { foreignOwner: 'aaa-ext' });
  assert.ok(foreignRef);
  const privateExtension = {
    ...input, packages: input.packages.map((pkg) => {
      if (pkg.id === 'orders-business') return { ...pkg, imports: [...pkg.imports, foreignRef] };
      if (pkg.id === 'aaa-ext') return {
        ...pkg, elements: pkg.elements.map((element) =>
          element.id === 'aaa-ext.lifecycle' ? { ...element, visibility: 'private' as const } : element),
      };
      return pkg;
    }),
  };
  rejected(buildApp(privateExtension), 'DH_BUILD_EXPORT_MISSING');
});

test('T12 R11 P2: directly declared public cross-owner WorkflowRoot is selected', (t) => {
  accepted(buildApp(crossOwnerWorkflowCase(t)));
});

test('T12 R11 P2: direct Extension cannot export a private cross-owner WorkflowRoot', (t) => {
  rejected(buildApp(crossOwnerWorkflowCase(t, { privateRoot: true })), 'DH_BUILD_EXPORT_MISSING');
});

test('T12 R11 P2: A→B→C transitive-only access cannot start a C WorkflowRoot', (t) => {
  rejected(buildApp(crossOwnerWorkflowCase(t, { transitiveOnly: true })), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('T12 R11 P2: parent Workflow cannot invoke child Workflow from an undeclared Extension', (t) => {
  rejected(buildApp(crossOwnerWorkflowCase(t, { nested: true })), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('T12 R11 P2: child Workflow from a directly declared public Extension is selected', (t) => {
  const result = accepted(buildApp(crossOwnerWorkflowCase(t, { nested: true, authorizeNested: true })));
  assert.equal(result.lock.selectedWorkflows?.length, 2);
});

test('T12 R1: the existing BUILD rejects a selected workflow node without real FunctionRef', (t) => {
  const { input } = workflowCase(t, { badNodeFunction: true });
  rejected(buildApp(input), 'DH_BUILD_REF_UNRESOLVED');
});

test('T12 R1: Reader data cannot grow past declared UTF-8 size', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true, dataMaxBytes: 2 });
  rejected(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
});

test('T12 R1: a Workflow cannot read unselected or undeclared Extension data', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true, sourcePackage: 'unauthorized-provider' });
  rejected(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('T12 R1: YAML anchors and aliases can resolve to bounded plain data', (t) => {
  const { input, resource } = workflowCase(t, {
    format: 'yaml', withData: true,
    rawData: textEncoder.encode('base: &base {min: 50}\ncopy: *base\n'),
  });
  const built = accepted(buildApp(input));
  assert.equal(built.lock.resourceDigests[`${resource.packageId}/${resource.path}`], resource.digest);
});

for (const [label, raw] of [
  ['unknown custom tag', '!Foo {a: 1}\n'],
  ['duplicate mapping key', 'a: 1\na: 2\n'],
  ['unresolved alias', 'value: *missing\n'],
  ['cyclic alias', 'a: &a [*a]\n'],
  ['non-finite number', 'value: .inf\n'],
] as const) {
  test(`T12 R1: safe YAML parsing rejects ${label}`, (t) => {
    const { input } = workflowCase(t, { format: 'yaml', withData: true, rawData: textEncoder.encode(raw) });
    rejected(buildApp(input), 'DH_BUILD_SCHEMA_INVALID');
  });
}

test('T12 R1: selected Workflow refuses a composed package without exact trusted runtime dependencies', (t) => {
  const { input } = workflowCase(t, { format: 'yaml', withData: true });
  const { xstate: ignored, ...runtimeDependencies } = input.runtimeDependencies;
  void ignored;
  rejected(buildApp({ ...input, runtimeDependencies }), 'DH_BUILD_TARGET_INVALID');
});

test('T12 R1: a Package without Workflow is still valid and has no synthetic Task', (t) => {  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const result = accepted(buildApp(input));
  assert.equal(result.lock.selectedWorkflows, undefined);
  assert.equal(result.lock.selectedPackages.some((pkg) => pkg.workflowRoots !== undefined), false);
});
