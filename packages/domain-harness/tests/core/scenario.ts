// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import { mkdtemp, mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  DH_APP_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
  DH_PACKAGE_SCHEMA_VERSION,
  canonicalJson,
  contentDigestOf,
} from '@kaicreator/domain-harness-contracts';
import type {
  BootstrapPin,
  DomainAppDescriptor,
  DomainAppLock,
  DomainPackageManifest,
  ElementDefinition,
  FunctionRef,
  InstalledRecord,
  JsonValue,
  KdpBootstrapContext,
  ResourceRef,
} from '@kaicreator/domain-harness-contracts';
import { buildApp } from '@kaicreator/domain-harness';
import type { BuildInput, BuildFailure } from '@kaicreator/domain-harness';

const HERE = dirname(fileURLToPath(import.meta.url));
const MICROKERNEL_DIR = join(HERE, '../../../microkernel');
const CONTRACTS_DIR = join(HERE, '../../../contracts');
const MICROKERNEL_PACKAGE_ID = '@kaicreator/domain-harness-microkernel';
const KDP_PACKAGE_ID = 'kdp-kernel';
const TARGET_SELECTOR = { runtime: 'node', module: 'esm', nodeMajor: 22 } as const;
const LOCK_RELATIVE_PATH = 'dh-lock/app.lock.json';
const DESCRIPTOR_RELATIVE_PATH = 'descriptor/app.json';

export interface T04Scenario {
  readonly rule: { readonly minOrderTotal: number; readonly regions: readonly string[] };
  readonly init: { readonly status: 'READY' | 'DEGRADED' | 'FAILED' };
  readonly withUnsupportedEffect?: boolean;
  readonly withUnsupportedTarget?: boolean;
}

export interface T04Install {
  readonly installRoot: string;
  readonly pin: BootstrapPin;
  readonly context: KdpBootstrapContext;
  readonly lock: DomainAppLock;
  readonly descriptor: DomainAppDescriptor;
  readonly lockBytes: Uint8Array;
  cleanup(): Promise<void>;
}

export class T04BuildRefusedError extends Error {
  readonly failure: BuildFailure;
  constructor(failure: BuildFailure) {
    super(`buildApp refused: ${failure.code}: ${failure.message}`);
    this.name = 'T04BuildRefusedError';
    this.failure = failure;
  }
}

declare global {
  var __domainHarnessT04Events: Array<Record<string, unknown>> | undefined;
}

export function events(): Array<Record<string, unknown>> {
  return globalThis.__domainHarnessT04Events ?? [];
}

export function resetEvents(): void {
  globalThis.__domainHarnessT04Events = [];
}

function bytesDigest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function fileBytesDigest(path: string): Promise<`sha256:${string}`> {
  return bytesDigest(await readFile(path));
}


function kernelModuleSource(): string {
  return `
const events = (globalThis.__domainHarnessT04Events ??= []);
events.push({ event: 'module-evaluated', package: 'kdp-kernel' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: 'kdp-kernel' });
  return ctx.nextCore?.init();
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: 'kdp-kernel' });
}
`;
}

function sdkModuleSource(): string {
  return `
const events = (globalThis.__domainHarnessT04Events ??= []);
events.push({ event: 'module-evaluated', package: 'sdk-core' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: 'sdk-core' });
  return ctx.nextCore?.init();
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: 'sdk-core' });
}
`;
}

function extensionModuleSource(): string {
  return `
const events = (globalThis.__domainHarnessT04Events ??= []);
events.push({ event: 'module-evaluated', package: 'orders-ext' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: 'orders-ext' });
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: 'orders-ext' });
}
`;
}

function businessArtifactModuleSource(): string {
  return `
const events = (globalThis.__domainHarnessT04Events ??= []);
events.push({ event: 'module-evaluated', package: 'orders-business' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: 'orders-business', initFrom: ctx.InitFrom });
  return (await import('./evaluate.mjs')).init(ctx);
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: 'orders-business' });
}
`;
}

function businessEntryModuleSource(scenario: T04Scenario, selectedEvaluateKey = ''): string {
  const initResult = { status: scenario.init.status };
  return `
const events = (globalThis.__domainHarnessT04Events ??= []);
events.push({ event: 'module-evaluated', package: 'orders-business-entry' });
const INIT_RESULT = ${JSON.stringify(initResult)};
let RULE = null;
export async function init(initCtx) {
  const handle = initCtx.resources.get('orders-business/content/rules.json');
  if (handle === undefined) {
    throw new Error('selected rule content resource is not sealed in the Lock');
  }
  const bytes = await handle.read();
  RULE = JSON.parse(Buffer.from(bytes).toString('utf8'));
  const handleOf = initCtx.functions.get(${JSON.stringify(selectedEvaluateKey)});
  if (!handleOf) throw new Error('selected evaluate FunctionRef unavailable before READY');
  const pos = await handleOf.invoke({ total: 100, region: 'EU' });
  const neg = await handleOf.invoke({ total: 10, region: 'EU' });
  const unknown = await handleOf.invoke({ total: 100, region: 'APAC' });
  const bad = await handleOf.invoke({ total: 'invalid', region: 'EU' });
  events.push({ event: 'init-selected-function', package: 'orders-business', pos, neg, unknown, bad });
  events.push({
    event: 'business-init',
    package: 'orders-business',
    appId: initCtx.appId,
    hasActivationId: typeof initCtx.activationId === 'string' && initCtx.activationId.length > 0,
    lockDigest: initCtx.lockDigest,
    rule: RULE,
    selectedFunctionKeys: [...initCtx.functions.keys()],
  });
  return INIT_RESULT;
}
export function evaluate(input) {
  if (typeof input !== 'object' || input === null) {
    return { kind: 'UNKNOWN', unknownReason: { code: 'FIXTURE_INPUT_UNKNOWN', message: 'evaluate input is not an object' } };
  }
  const total = input['total'];
  const region = input['region'];
  if (typeof total !== 'number' || typeof region !== 'string') {
    return { kind: 'UNKNOWN', unknownReason: { code: 'FIXTURE_INPUT_UNKNOWN', message: 'total/region have unexpected shapes' } };
  }
  if (RULE === null) {
    return { kind: 'UNKNOWN', unknownReason: { code: 'FIXTURE_NO_RULE', message: 'selected rule content was not read at init' } };
  }
  if (!RULE.regions.includes(region)) {
    return { kind: 'UNKNOWN', unknownReason: { code: 'FIXTURE_REGION_UNKNOWN', message: 'region is not covered by the selected rule' } };
  }
  return { kind: 'SUCCEEDED', value: { decision: total >= RULE.minOrderTotal ? 'POS' : 'NEG' } };
}
export function optionalReport(input) {
  return { kind: 'SUCCEEDED', value: 'report-ok' };
}
${scenario.withUnsupportedEffect === true ? `export function dangerous(input) {
  return { kind: 'SUCCEEDED', value: 'should never run' };
}
` : ''}`;
}


const APP_ID = 'fixture.t04-integration-app';
const APP_VERSION = '1.0.0';

function businessElement(scenario: T04Scenario, ruleRef: ResourceRef): ElementDefinition {
  return {
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.eligibility',
    version: '1.0.0',
    description: 'T04 integration element: one selected rule drives evaluate.',
    content: [
      {
        id: 'policy-rules',
        contentKind: 'rule',
        schemaRef: {
          inline: { type: 'object', required: ['minOrderTotal', 'regions'] },
        },
        required: true,
        ref: ruleRef,
      },
    ],
    functions: [
      {
        id: 'evaluate',
        contractVersion: '1',
        inputSchemaRef: {
          inline: {
            type: 'object',
            required: ['total', 'region'],
            properties: { total: { type: 'number' }, region: { type: 'string' } },
          },
        },
        outputSchemaRef: {
          inline: {
            type: 'object',
            required: ['decision'],
            properties: { decision: { enum: ['POS', 'NEG', 'UNKNOWN'] } },
          },
        },
        outcomes: ['SUCCEEDED', 'UNKNOWN'],
        effects: 'none',
      },
      {
        id: 'optionalReport',
        contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'string' } },
        outcomes: ['SUCCEEDED', 'UNKNOWN'],
        effects: 'none',
      },
      ...(scenario.withUnsupportedEffect === true
        ? [{
            id: 'dangerous',
            contractVersion: '1' as const,
            inputSchemaRef: { inline: { type: 'object' } },
            outputSchemaRef: { inline: { type: 'string' } },
            outcomes: ['SUCCEEDED' as const],
            effects: 'external' as const,
          }]
        : []),
    ],
  };
}

function manifest(id: string, version: string, options: Record<string, unknown>): DomainPackageManifest {
  return {
    kind: 'DomainPackage',
    schemaVersion: DH_PACKAGE_SCHEMA_VERSION,
    id,
    version,
    elements: [],
    dependsOn: [],
    imports: [],
    exports: [],
    contributesTo: [],
    targetVariants: [],
    ...options,
  } as unknown as DomainPackageManifest;
}


export async function buildScenarioInstall(scenario: T04Scenario): Promise<T04Install> {
  resetEvents();
  const { rm } = await import('node:fs/promises');
  const wsRoot = await mkdtemp(join(tmpdir(), 'dh-current-t04-ws-'));
  const installRoot = await mkdtemp(join(tmpdir(), 'dh-current-t04-install-'));
  const dispose = async (): Promise<void> => {
    await rm(wsRoot, { recursive: true, force: true });
    await rm(installRoot, { recursive: true, force: true });
  };

  try {
    const write = async (root: string, relativePath: string, content: string): Promise<string> => {
      const absolute = join(root, ...relativePath.split('/'));
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, content);
      return absolute;
    };

    const kernelDir = join(wsRoot, 'packages/kdp-kernel');
    const sdkDir = join(wsRoot, 'packages/sdk-core');
    const businessDir = join(wsRoot, 'packages/orders-business');
    const extDir = join(wsRoot, 'packages/orders-ext');

    const kernelModule = await write(kernelDir, 'dist/index.mjs', kernelModuleSource());
    const sdkModule = await write(sdkDir, 'dist/index.mjs', sdkModuleSource());
    const businessModule = await write(businessDir, 'dist/business.mjs', businessArtifactModuleSource());
    const evaluateModule = await write(businessDir, 'dist/evaluate.mjs', businessEntryModuleSource(scenario));
    const extModule = await write(extDir, 'dist/index.mjs', extensionModuleSource());
    await write(
      kernelDir,
      'dist/index.js',
      `export { bootstrap } from '${MICROKERNEL_PACKAGE_ID}';\n`,
    );
    for (const [dir, id, artifactPath] of [
      [kernelDir, 'kdp-kernel', 'dist/index.js'],
      [sdkDir, 'sdk-core', 'dist/index.mjs'],
      [businessDir, 'orders-business', 'dist/business.mjs'],
      [extDir, 'orders-ext', 'dist/index.mjs'],
    ] as const) {
      await write(dir, 'package.json', canonicalJson({
        name: id, version: '1.0.0', type: 'module', exports: { '.': `./${artifactPath}` },
      }));
    }
    const ruleText = canonicalJson(scenario.rule as unknown as JsonValue);
    await write(businessDir, 'content/rules.json', ruleText);

    const ruleRef = {
      packageId: 'orders-business',
      path: 'content/rules.json',
      digest: await fileBytesDigest(join(businessDir, 'content/rules.json')),
    };
    const element = businessElement(scenario, ruleRef);
    const definitionDigest = contentDigestOf(element as unknown as JsonValue);
    const elementText = canonicalJson(element as unknown as JsonValue);
    const elementBytes = new TextEncoder().encode(elementText);
    await write(businessDir, 'elements/orders.eligibility.json', elementText);

    const ref = (functionId: string): FunctionRef => ({
      element: { namespace: 'orders', id: 'orders.eligibility', version: '1.0.0', digest: definitionDigest },
      functionId,
      contractVersion: '1',
    });
    const evaluateRef = ref('evaluate');
    const optionalReportRef = ref('optionalReport');
    await write(businessDir, 'dist/evaluate.mjs',
      businessEntryModuleSource(scenario, canonicalJson(evaluateRef)));
    const dangerousRef = ref('dangerous');
    const evaluateModuleRef = {
      packageId: 'orders-business',
      path: 'dist/evaluate.mjs',
      digest: await fileBytesDigest(evaluateModule),
    };
    const businessModuleRef = {
      packageId: 'orders-business',
      path: 'dist/business.mjs',
      digest: await fileBytesDigest(businessModule),
    };

    const lifecycle = {};
    const lifecycleEntry = {};
    const lifecycleRef = {};
    for (const [id, dir] of [
      ['kdp-kernel', kernelDir], ['sdk-core', sdkDir],
      ['orders-business', businessDir], ['orders-ext', extDir],
    ] as const) {
      const definition: ElementDefinition = {
        kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
        id: `orders.lifecycle_${id.replaceAll('-', '_')}`, version: '1.0.0',
        description: 'Selected Package lifecycle Element',
        content: [],
        functions: ['init', 'exit'].map((name) => ({
          id: name, contractVersion: '1',
          inputSchemaRef: { inline: { type: 'object' } },
          outputSchemaRef: { inline: { type: 'object' } },
          outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] as const, effects: 'none' as const,
        })),
      };
      lifecycle[id] = definition;
      const bytes = canonicalJson(definition as unknown as JsonValue);
      await write(dir, 'elements/lifecycle.json', bytes);
      lifecycleEntry[id] = {
        id: definition.id, version: definition.version,
        definitionRef: { packageId: id, path: 'elements/lifecycle.json',
          digest: await fileBytesDigest(join(dir, 'elements/lifecycle.json')) },
        visibility: 'private' as const,
      };
      lifecycleRef[id] = {
        namespace: 'orders', id: definition.id, version: '1.0.0', digest: contentDigestOf(definition as unknown as JsonValue),
      };
    }
    const targetLife = (id: string, module: ResourceRef, initResources: readonly ResourceRef[] = []) =>
      (lifecycle[id] as ElementDefinition).functions.map((fn) => ({
        elementId: (lifecycle[id] as ElementDefinition).id,
        functionId: fn.id, contractVersion: fn.contractVersion,
        entry: { module, exportName: fn.id }, ...(fn.id === 'init' ? { resources: initResources } : {}),
      }));
    const kernelRef = {
      packageId: 'kdp-kernel', path: 'dist/index.mjs', digest: await fileBytesDigest(kernelModule),
    };
    const sdkRef = {
      packageId: 'sdk-core', path: 'dist/index.mjs', digest: await fileBytesDigest(sdkModule),
    };
    const extRef = {
      packageId: 'orders-ext', path: 'dist/index.mjs', digest: await fileBytesDigest(extModule),
    };
    const businessManifest = manifest('orders-business', '1.0.0', {
      layer: 'business',
      role: 'primary',
      order: 2,
      dependsOn: [{ package: 'orders-ext', version: '1.0.0', interface: 'ext.api' }],
      elements: [
        lifecycleEntry['orders-business'],
        {
          id: 'orders.eligibility',
          version: '1.0.0',
          definitionRef: { packageId: 'orders-business', path: 'elements/orders.eligibility.json', digest: bytesDigest(elementBytes) },
          visibility: 'public',
        },
      ],
      exports: [{ elementId: 'orders.eligibility' }, { interfaceId: 'orders.api' }],
      init: lifecycleRef['orders-business'],
      exit: lifecycleRef['orders-business'],
      targetVariants: [
        {
          target: TARGET_SELECTOR,
          implementations: [
            ...targetLife('orders-business', businessModuleRef, [ruleRef]),
            {
              elementId: 'orders.eligibility',
              functionId: 'evaluate',
              contractVersion: '1',
              entry: { module: evaluateModuleRef, exportName: 'evaluate' },
              resources: [ruleRef],
            },
            {
              elementId: 'orders.eligibility',
              functionId: 'optionalReport',
              contractVersion: '1',
              entry: { module: evaluateModuleRef, exportName: 'optionalReport' },
            },
            ...(scenario.withUnsupportedEffect === true
              ? [{
                  elementId: 'orders.eligibility',
                  functionId: 'dangerous',
                  contractVersion: '1',
                  entry: { module: evaluateModuleRef, exportName: 'dangerous' },
                }]
              : []),
          ],
        },
      ],
    });

    const sdkManifest = manifest('sdk-core', '1.0.0', {
      layer: 'sdk',
      role: 'primary',
      order: 1,
      dependsOn: [{ package: 'kdp-kernel', version: '1.0.0', interface: 'kernel.api' }],
      exports: [{ interfaceId: 'sdk.api' }],
      init: lifecycleRef['sdk-core'],
      exit: lifecycleRef['sdk-core'],
      elements: [lifecycleEntry['sdk-core']],
      targetVariants: [{ target: TARGET_SELECTOR, implementations: targetLife('sdk-core', sdkRef) }],
    });

    const kernelManifest = manifest('kdp-kernel', '1.0.0', {
      layer: 'kernel',
      role: 'primary',
      order: 0,
      exports: [{ interfaceId: 'kernel.api' }],
      init: lifecycleRef['kdp-kernel'],
      exit: lifecycleRef['kdp-kernel'],
      elements: [lifecycleEntry['kdp-kernel']],
      targetVariants: [{ target: TARGET_SELECTOR, implementations: targetLife('kdp-kernel', kernelRef) }],
    });

    const extManifest = manifest('orders-ext', '1.0.0', {
      layer: 'business',
      role: 'extension',
      exports: [{ interfaceId: 'ext.api' }],
      init: lifecycleRef['orders-ext'],
      exit: lifecycleRef['orders-ext'],
      elements: [lifecycleEntry['orders-ext']],
      targetVariants: [{ target: TARGET_SELECTOR, implementations: targetLife('orders-ext', extRef) }],
    });

    const descriptor: DomainAppDescriptor = {
      kind: 'DomainApp',
      schemaVersion: DH_APP_SCHEMA_VERSION,
      id: APP_ID,
      version: APP_VERSION,
      target: scenario.withUnsupportedTarget === true
        ? { runtime: 'node', module: 'esm', nodeMajor: 20 }
        : TARGET_SELECTOR,
      roots: {
        kernelPrimary: { package: 'kdp-kernel', version: '1.0.0' },
        cores: [
          { package: 'sdk-core', version: '1.0.0' },
          { package: 'orders-business', version: '1.0.0' },
        ],
      },
      extensions: [{ package: 'orders-ext', version: '1.0.0' }],
      config: { region: 'EU', suite: 't04-final' },
    };

    const input: BuildInput = {
      descriptor,
      packages: [businessManifest, sdkManifest, kernelManifest, extManifest],
      packageRoots: {
        'orders-business': businessDir,
        'sdk-core': sdkDir,
        'kdp-kernel': kernelDir,
        'orders-ext': extDir,
        [MICROKERNEL_PACKAGE_ID]: MICROKERNEL_DIR,
      },
      packageArtifacts: {
        'orders-business': 'dist/business.mjs',
        'sdk-core': 'dist/index.mjs',
        'kdp-kernel': 'dist/index.mjs',
        'orders-ext': 'dist/index.mjs',
      },
      kdpArtifact: { packageId: KDP_PACKAGE_ID, path: 'dist/index.js' },
      runtimeDependencies: { [MICROKERNEL_PACKAGE_ID]: '0.11.0' },
    };

    const built = await buildApp(input);
    if (!built.ok) {
      throw new T04BuildRefusedError(built);
    }
    const lock = built.lock;

    const copyPackage = async (packageId: string, sourceDir: string): Promise<void> => {
      await cp(sourceDir, join(installRoot, 'node_modules', ...packageId.split('/')), { recursive: true });
    };
    await copyPackage('orders-business', businessDir);
    await copyPackage('sdk-core', sdkDir);
    await copyPackage('kdp-kernel', kernelDir);
    await copyPackage('orders-ext', extDir);

    const kdpInstallDir = join(installRoot, 'node_modules', MICROKERNEL_PACKAGE_ID);
    await mkdir(kdpInstallDir, { recursive: true });
    await writeFile(
      join(kdpInstallDir, 'package.json'),
      JSON.stringify({
        name: MICROKERNEL_PACKAGE_ID,
        version: '0.11.0',
        type: 'module',
        exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      }),
    );
    await cp(join(MICROKERNEL_DIR, 'dist'), join(kdpInstallDir, 'dist'), { recursive: true });

    const contractsInstallDir = join(installRoot, 'node_modules', '@kaicreator/domain-harness-contracts');
    await mkdir(contractsInstallDir, { recursive: true });
    await writeFile(
      join(contractsInstallDir, 'package.json'),
      JSON.stringify({
        name: '@kaicreator/domain-harness-contracts',
        version: '0.11.0',
        type: 'module',
        exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      }),
    );
    await cp(join(CONTRACTS_DIR, 'dist'), join(contractsInstallDir, 'dist'), { recursive: true });

    await write(installRoot, DESCRIPTOR_RELATIVE_PATH, canonicalJson(descriptor as unknown as JsonValue));
    await mkdir(join(installRoot, 'dh-lock'), { recursive: true });
    await writeFile(join(installRoot, ...LOCK_RELATIVE_PATH.split('/')), built.lockBytes);

    const recordBase = {
      kind: 'DomainAppInstallRecord',
      schemaVersion: 'dh.install/0.11',
      appId: APP_ID,
      appVersion: APP_VERSION,
      target: lock.target,
      lockPath: LOCK_RELATIVE_PATH,
      lockDigest: lock.closureDigest,
      kdpPackageId: KDP_PACKAGE_ID,
      kdpPrimaryEntry: 'bootstrap',
      kdpPrimaryDigest: lock.bootstrapKdpPin.kdpPrimaryDigest,
    };
    const record: InstalledRecord = {
      ...(recordBase as unknown as InstalledRecord),
      recordDigest: contentDigestOf(recordBase as unknown as JsonValue),
    };
    await write(installRoot, 'dh-install/installed-record.json', JSON.stringify(record));

    const pin: BootstrapPin = {
      schemaVersion: 'dh.pin/0.11',
      target: lock.target,
      kdpPackageId: KDP_PACKAGE_ID,
      kdpPrimaryEntry: 'bootstrap',
      kdpPrimaryDigest: record.kdpPrimaryDigest,
      lockDigest: lock.closureDigest,
      lockPath: LOCK_RELATIVE_PATH,
    };
    const context: KdpBootstrapContext = {
      installRoot,
      descriptorPath: DESCRIPTOR_RELATIVE_PATH,
      lockPath: LOCK_RELATIVE_PATH,
      hostPorts: [{ name: 'fixture-channel', port: 0 }],
      env: { nodeMajor: 22, platform: process.platform },
    };

    return {
      installRoot,
      pin,
      context,
      lock,
      descriptor,
      lockBytes: built.lockBytes,
      cleanup: dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
