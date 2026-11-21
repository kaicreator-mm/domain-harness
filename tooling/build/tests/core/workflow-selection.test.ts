/** v0.11.1 T12：复用现有 BUILD/Lock/Package 安装闭包的 Workflow 静态选定反例。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  DH_WORKFLOW_SCHEMA_VERSION,
  DOMAIN_APP_LOCK_JSON_SCHEMA,
  DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
  contentDigestOf,
  type DomainPackageManifest,
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
  scenario.beforeSeal = () => {
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
        function: options.badNodeFunction ? { ...check, functionId: 'missing' } : check,
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
    ref, resource, workflow,
  };
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
  assert.equal(valid.status, 0, valid.stderr, 'exact npm lock + installed versions are accepted');

  const bad = structuredClone(npmLock);
  bad.packages['node_modules/xstate']!.integrity = 'sha512-INVALID_ARCHIVE_BYTES';
  write('package-lock.json', JSON.stringify(bad));
  const refused = runVerifier();
  assert.notEqual(refused.status, 0, 'tampered third-party npm tarball SRI MUST fail');
  assert.match(refused.stderr, /DH_TRUSTED_RUNTIME_INTEGRITY_MISMATCH/);

  write('package-lock.json', JSON.stringify(npmLock));
  const forgedLock = structuredClone(app.lock);
  forgedLock.trustedRuntimeIntegrity = [{ ...pins[0]!, integrity: 'sha512-FAKE' }, pins[1]!];
  write('dh-lock/app.lock.json', JSON.stringify(forgedLock));
  const refusedSealed = runVerifier();
  assert.notEqual(refusedSealed.status, 0, 'unmatched Lock archive bytes cannot be silently trusted');
  assert.match(refusedSealed.stderr, /DH_TRUSTED_RUNTIME_LOCK_MISMATCH/);
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
