// 当前架构的可证伪测试：断言实际行为而非历史兼容。
import { mkdtemp, mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { contentDigestOf, canonicalJson } from '@kaicreator/domain-harness-contracts';
import type {
  BootstrapPin,
  ContentDigest,
  DomainAppDescriptor,
  DomainAppLock,
  ElementDefinition,
  ElementRef,
  FunctionRef,
  InstalledRecord,
  KdpBootstrapContext,
  ResolvedTarget,
} from '@kaicreator/domain-harness-contracts';
import { boot } from '../../../src/index.js';

export { boot };

const MICROKERNEL_DIST = fileURLToPath(new URL('../../../dist/', import.meta.url));
const CONTRACTS_DIST = fileURLToPath(
  new URL('../../../../contracts/dist/', import.meta.url),
);
const XSTATE_DIR = dirname(fileURLToPath(import.meta.resolve('xstate/package.json')));
const YAML_DIR = dirname(fileURLToPath(import.meta.resolve('yaml/package.json')));

export const KDP_PACKAGE_ID = 'fixture-kernel';
export const TARGET: ResolvedTarget = {
  runtime: 'node',
  module: 'esm',
  nodeMajor: 22,
  profile: 'node22-esm/1',
};
export const LOCK_RELATIVE_PATH = 'dh-lock/app.lock.json';
export const DESCRIPTOR_RELATIVE_PATH = 'descriptor/app.json';

const FIXTURE_KERNEL = 'fixture-kernel';
const FIXTURE_SDK = '@fixture/sdk';
const FIXTURE_BUSINESS = 'fixture-business';
const FIXTURE_EXT = 'fixture-ext';

export type FunctionBehavior =
  | { readonly behavior: 'succeed'; readonly value: unknown }
  | { readonly behavior: 'unknown' }
  | { readonly behavior: 'failed' }
  | { readonly behavior: 'throw' }
  | { readonly behavior: 'garbage' }
  | { readonly behavior: 'proxy-outcome' }
  | { readonly behavior: 'proxy-value' };

export interface FixtureInit {
  readonly status: 'READY' | 'DEGRADED' | 'BLOCKED' | 'FAILED';
  readonly throw?: boolean;
}

export interface FixtureScenario {
  readonly init: FixtureInit;
  readonly functions: Readonly<Record<string, FunctionBehavior>>;
  readonly readResource?: string;
  readonly kernelDisposeThrow?: boolean;
  readonly sdkInitThrow?: boolean;
}

export const DEFAULT_SCENARIO: FixtureScenario = {
  init: { status: 'READY' },
  functions: {
    evaluate: { behavior: 'succeed', value: { decision: 'POS' } },
    optionalReport: { behavior: 'succeed', value: 'report-ok' },
  },
};

export interface FixtureInstall {
  readonly installRoot: string;
  readonly pin: BootstrapPin;
  readonly context: KdpBootstrapContext;
  readonly lock: DomainAppLock;
  readonly record: InstalledRecord;
  readRecord(): Promise<Record<string, unknown>>;
  writeRecord(record: unknown): Promise<void>;
  writeRecordText(text: string): Promise<void>;
  readLockBytes(): Promise<Buffer>;
  writeLockBytes(bytes: Buffer): Promise<void>;
  readKdpEntryBytes(): Promise<Buffer>;
  writeKdpEntryBytes(bytes: Buffer): Promise<void>;
  writeKdpManifest(manifest: unknown): Promise<void>;
  writePackageFile(packageId: string, path: string, bytes: Buffer): Promise<void>;
  cleanup(): Promise<void>;
}

declare global {
  var __domainHarnessEvents: Array<Record<string, unknown>> | undefined;
}

export function events(): Array<Record<string, unknown>> {
  return globalThis.__domainHarnessEvents ?? [];
}

export function resetEvents(): void {
  globalThis.__domainHarnessEvents = [];
}

function bytesDigest(bytes: Buffer | Uint8Array): ContentDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function digestOf(value: unknown): ContentDigest {
  return contentDigestOf(value as Parameters<typeof contentDigestOf>[0]);
}

async function fileBytesDigest(path: string): Promise<ContentDigest> {
  return bytesDigest(await readFile(path));
}


function behaviorDispatch(): string {
  return `
function behave(name) {
  const b = SCENARIO.functions[name] ?? { behavior: 'succeed', value: { decision: 'POS' } };
  switch (b.behavior) {
    case 'succeed':
      return { kind: 'SUCCEEDED', value: b.value };
    case 'unknown':
      return { kind: 'UNKNOWN', unknownReason: { code: 'FIXTURE_UNKNOWN', message: 'fixture unknown outcome' } };
    case 'failed':
      return { kind: 'FAILED', failure: { code: 'FIXTURE_FAILED', message: 'fixture failed outcome' } };
    case 'throw':
      throw new Error('fixture function threw TOKEN_SECRET_CANARY_8029');
    case 'garbage':
      return 42;
    case 'proxy-outcome': {
      const outcome = {};
      Object.defineProperty(outcome, 'kind', {
        get() { throw new Error('evil outcome getter'); },
      });
      return outcome;
    }
    case 'proxy-value':
      return {
        kind: 'SUCCEEDED',
        value: new Proxy({ decision: 'POS' }, { get() { throw new Error('evil value getter'); } }),
      };
    default:
      throw new Error('unknown fixture behavior ' + b.behavior);
  }
}
`;
}

function kernelModuleSource(scenario: FixtureScenario): string {
  return `
const events = (globalThis.__domainHarnessEvents ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_KERNEL}' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: '${FIXTURE_KERNEL}', initFrom: ctx.InitFrom, hostPortCount: (ctx.hostPorts ?? []).length, visibleFunctions: [...ctx.functions.keys()] });
  return ctx.nextCore?.init();
}
export async function hold(ctx) {
  events.push({ event: 'package-init', package: '${FIXTURE_KERNEL}', droppedNextCore: true });
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: '${FIXTURE_KERNEL}' });
  if (${JSON.stringify(scenario.kernelDisposeThrow ?? false)}) {
    throw new Error('fixture kernel Exit threw TOKEN_SECRET_CANARY_8029');
  }
}
`;
}

function sdkModuleSource(scenario: FixtureScenario): string {
  return `
const events = (globalThis.__domainHarnessEvents ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_SDK}' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: '${FIXTURE_SDK}', initFrom: ctx.InitFrom, visibleFunctions: [...ctx.functions.keys()] });
  if (${JSON.stringify(scenario.sdkInitThrow ?? false)}) {
    throw new Error('fixture sdk Init threw TOKEN_SECRET_CANARY_8029');
  }
  return ctx.nextCore?.init();
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: '${FIXTURE_SDK}' });
}
`;
}

function businessModuleSource(scenario: FixtureScenario, evaluateRef?: FunctionRef): string {
  return `
const events = (globalThis.__domainHarnessEvents ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_BUSINESS}' });
const SCENARIO = ${JSON.stringify({ init: scenario.init, functions: scenario.functions, readResource: scenario.readResource ?? null })};
${behaviorDispatch()}
export async function init(ctx) {
  events.push({ event: 'package-init', package: '${FIXTURE_BUSINESS}', initFrom: ctx.InitFrom, visibleFunctions: [...ctx.functions.keys()] });
  return businessAppInit(ctx);
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: '${FIXTURE_BUSINESS}' });
}
async function businessAppInit(initCtx) {
  const selectedRefKey = ${JSON.stringify(evaluateRef ? canonicalJson(evaluateRef) : '')};
  if (selectedRefKey) {
    const handle = initCtx.functions.get(selectedRefKey);
    if (!handle) throw new Error('BUILD-selected FunctionRef unavailable during Init');
    const result = await handle.invoke({ total: 100, region: 'EU' });
    events.push({ event: 'init-selected-function', package: '${FIXTURE_BUSINESS}', kind: result.kind,
      value: result.kind === 'SUCCEEDED' ? result.value : null });
  }
  events.push({
    event: 'business-init',
    package: '${FIXTURE_BUSINESS}',
    appId: initCtx.appId,
    hasActivationId: typeof initCtx.activationId === 'string' && initCtx.activationId.length > 0,
    lockDigest: initCtx.lockDigest,
    config: initCtx.config,
    ingress: [...initCtx.functions.keys()],
    resourceKeys: [...initCtx.resources.keys()],
  });
  if (SCENARIO.readResource) {
    const handle = initCtx.resources.get(SCENARIO.readResource);
    const bytes = await handle.read();
    events.push({ event: 'resource-read', package: '${FIXTURE_BUSINESS}', key: SCENARIO.readResource, bytes: bytes.length });
  }
  const init = SCENARIO.init;
  if (init.throw) throw new Error('fixture business init threw');
  const result = { status: init.status };
  if (init.suppressed) result.suppressedIngress = init.suppressed;
  return result;
}
export function evaluate(input) {
  return behave('evaluate');
}
export function optionalReport(input) {
  return behave('optionalReport');
}
`;
}

function extensionModuleSource(): string {
  return `
const events = (globalThis.__domainHarnessEvents ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_EXT}' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: '${FIXTURE_EXT}', initFrom: ctx.InitFrom, visibleFunctions: [...ctx.functions.keys()], hasNextCore: ctx.nextCore !== undefined });
}
export async function exit(ctx) {
  events.push({ event: 'package-exit', package: '${FIXTURE_EXT}' });
}
`;
}

function hookProviderModuleSource(): string {
  return `
const events = (globalThis.__domainHarnessEvents ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_EXT}:hook' });
export function telemetryHook() {
  events.push({ event: 'hook-provider-invoked', package: '${FIXTURE_EXT}' });
}
`;
}


const APP_ID = 'fixture.orders-app';
const APP_VERSION = '1.0.0';

export const OPTIONAL_REPORT_SCHEMA_PATH = 'schemas/optional-report-input.schema.json';
const OPTIONAL_REPORT_SCHEMA_TEXT = JSON.stringify({ type: 'object' });

function elementDefinition(optionalReportSchemaDigest: ContentDigest): ElementDefinition {
  return {
    kind: 'Element',
    schemaVersion: 'dh.element/0.11',
    id: 'orders.eligibility',
    version: '1.0.0',
    description: 'Fixture eligibility element with two ingress functions and one app init.',
    content: [
      {
        id: 'policy-rules',
        contentKind: 'rule',
        schemaRef: { inline: { type: 'object', required: ['minOrderTotal'] } },
        required: true,
        value: { minOrderTotal: 50, regions: ['EU'] },
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
        inputSchemaRef: {
          packageId: FIXTURE_BUSINESS,
          path: OPTIONAL_REPORT_SCHEMA_PATH,
          digest: optionalReportSchemaDigest,
        },
        outputSchemaRef: { inline: { type: 'string' } },
        outcomes: ['SUCCEEDED', 'UNKNOWN'],
        effects: 'none',
      },
    ],
  };
}


export async function buildFixtureInstall(
  scenario: FixtureScenario = DEFAULT_SCENARIO,
): Promise<FixtureInstall> {
  resetEvents();
  const installRoot = await mkdtemp(join(tmpdir(), 'dh-current-t03-'));

  const write = async (relativePath: string, content: string): Promise<string> => {
    const absolute = join(installRoot, ...relativePath.split('/'));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
    return absolute;
  };

  const kdpPackageDir = join(installRoot, 'node_modules', KDP_PACKAGE_ID);
  await mkdir(kdpPackageDir, { recursive: true });
  await writeFile(
    join(kdpPackageDir, 'package.json'),
    JSON.stringify({
      name: KDP_PACKAGE_ID,
      version: '0.11.0',
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    }),
  );
  // 测试用 KDP 也只包含真正可证明的两节点 Host ESM 薄层。
  // SDK Microkernel 的真正实现安装在独立、受信的同一 App node_modules 中。
  await mkdir(join(kdpPackageDir, 'dist'), { recursive: true });
  await writeFile(join(kdpPackageDir, 'dist', 'index.js'),
    "export { bootstrap } from './bootstrap.js';\n");
  await writeFile(join(kdpPackageDir, 'dist', 'bootstrap.js'),
    "export { bootstrap } from '@kaicreator/domain-harness-microkernel';\n");
  const trustedSdkDir = join(installRoot, 'node_modules', '@kaicreator', 'domain-harness-microkernel');
  await mkdir(trustedSdkDir, { recursive: true });
  await writeFile(join(trustedSdkDir, 'package.json'), JSON.stringify({
    name: '@kaicreator/domain-harness-microkernel',
    version: '0.11.0', type: 'module',
    exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
  }));
  await cp(MICROKERNEL_DIST, join(trustedSdkDir, 'dist'), { recursive: true });

  const contractsPackageDir = join(installRoot, 'node_modules', '@kaicreator/domain-harness-contracts');
  await mkdir(contractsPackageDir, { recursive: true });
  await writeFile(
    join(contractsPackageDir, 'package.json'),
    JSON.stringify({
      name: '@kaicreator/domain-harness-contracts',
      version: '0.11.0',
      type: 'module',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
    }),
  );
  await cp(CONTRACTS_DIST, join(contractsPackageDir, 'dist'), { recursive: true });
  // 手工安装器也必须包含 Microkernel 的精确 XState/YAML 生产依赖。
  await cp(XSTATE_DIR, join(installRoot, 'node_modules', 'xstate'), { recursive: true });
  await cp(YAML_DIR, join(installRoot, 'node_modules', 'yaml'), { recursive: true });

  const kernelPath = await write(`node_modules/${FIXTURE_KERNEL}/dist/index.mjs`, kernelModuleSource(scenario));
  const sdkPath = await write(`node_modules/${FIXTURE_SDK}/dist/index.mjs`, sdkModuleSource(scenario));
  const businessPath = await write(`node_modules/${FIXTURE_BUSINESS}/dist/index.mjs`, businessModuleSource(scenario));
  const extPath = await write(`node_modules/${FIXTURE_EXT}/dist/index.mjs`, extensionModuleSource());
  const hookPath = await write(`node_modules/${FIXTURE_EXT}/dist/hook.mjs`, hookProviderModuleSource());
  await write(
    `node_modules/${FIXTURE_BUSINESS}/content/rules.json`,
    JSON.stringify({ minOrderTotal: 50, regions: ['EU'] }),
  );

  const definition = elementDefinition(bytesDigest(Buffer.from(OPTIONAL_REPORT_SCHEMA_TEXT, 'utf8')));
  const definitionText = JSON.stringify(definition);
  await write(
    `node_modules/${FIXTURE_BUSINESS}/elements/orders.eligibility.json`,
    definitionText,
  );
  await write(
    `node_modules/${FIXTURE_BUSINESS}/${OPTIONAL_REPORT_SCHEMA_PATH}`,
    OPTIONAL_REPORT_SCHEMA_TEXT,
  );
  const definitionDigest = digestOf(JSON.parse(definitionText));

  const evaluateRef: FunctionRef = {
    element: { namespace: 'orders', id: 'orders.eligibility', version: '1.0.0', digest: definitionDigest },
    functionId: 'evaluate',
    contractVersion: '1',
  };
  const optionalReportRef: FunctionRef = {
    element: { namespace: 'orders', id: 'orders.eligibility', version: '1.0.0', digest: definitionDigest },
    functionId: 'optionalReport',
    contractVersion: '1',
  };
  const elementRef = evaluateRef.element;
  // 让真实业务 Init（仍处于 NOT_READY）使用 KDP 的已选 FunctionRef 能力，不经过 DomainApp.invoke。
  await write(`node_modules/${FIXTURE_BUSINESS}/dist/index.mjs`, businessModuleSource(scenario, evaluateRef));

  const descriptor: DomainAppDescriptor = {
    kind: 'DomainApp',
    schemaVersion: 'dh.app/0.11',
    id: APP_ID,
    version: APP_VERSION,
    target: { runtime: 'node', module: 'esm', nodeMajor: 22 },
    roots: {
      kernelPrimary: { package: FIXTURE_KERNEL, version: '1.0.0' },
      cores: [
        { package: FIXTURE_SDK, version: '1.0.0' },
        { package: FIXTURE_BUSINESS, version: '1.0.0' },
      ],
    },
    extensions: [{ package: FIXTURE_EXT, version: '1.0.0' }],
    config: { region: 'EU', featureFlag: true },
  };
  const descriptorBytes = Buffer.from(JSON.stringify(descriptor), 'utf8');
  await write(DESCRIPTOR_RELATIVE_PATH, descriptorBytes.toString('utf8'));

  const kdpEntryDigest = await fileBytesDigest(join(kdpPackageDir, 'dist', 'index.js'));
  const artifactRef = (packageId: string, artifactPath: string): { packageId: string; path: string; digest: ContentDigest } => ({
    packageId,
    path: artifactPath,
    digest: 'sha256:0' as ContentDigest,
  });
  const kernelArtifact = artifactRef(FIXTURE_KERNEL, 'dist/index.mjs');
  const sdkArtifact = artifactRef(FIXTURE_SDK, 'dist/index.mjs');
  const businessArtifact = artifactRef(FIXTURE_BUSINESS, 'dist/index.mjs');
  const extArtifact = artifactRef(FIXTURE_EXT, 'dist/index.mjs');
  kernelArtifact.digest = await fileBytesDigest(kernelPath);
  sdkArtifact.digest = await fileBytesDigest(sdkPath);
  businessArtifact.digest = await fileBytesDigest(businessPath);
  extArtifact.digest = await fileBytesDigest(extPath);
  const hookDigest = await fileBytesDigest(hookPath);

  const lifeNames: readonly [string, string][] = [
    [FIXTURE_KERNEL, 'kernel'], [FIXTURE_SDK, 'sdk'], [FIXTURE_BUSINESS, 'business'], [FIXTURE_EXT, 'extension'],
  ];
  const lifecycleDefs: Record<string, ElementDefinition> = {};
  const lifecycleRefs: Record<string, ElementRef> = {};
  for (const [id, name] of lifeNames) {
    const definition: ElementDefinition = {
      kind: 'Element', schemaVersion: 'dh.element/0.11', id: `fixture.${name}-lifecycle`,
      version: '1.0.0', description: 'Package-owned selected lifecycle and Hook Function',
      content: [], functions: ['init', 'exit', ...(id === FIXTURE_EXT ? ['telemetryHook'] : [])].map((fn) => ({
        id: fn, contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'object' } },
        outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] as const,
        effects: 'none' as const,
      })),
    };
    lifecycleDefs[id] = definition;
    lifecycleRefs[id] = {
      namespace: 'fixture', id: definition.id, version: definition.version, digest: digestOf(definition),
    };
    await write(`node_modules/${id}/elements/lifecycle.json`, JSON.stringify(definition));
  }
  const lifeFunction = (id: string, fn: string): FunctionRef => ({
    element: lifecycleRefs[id]!, functionId: fn, contractVersion: '1',
  });
  const lifeSelected = (id: string, artifact: { packageId: string; path: string; digest: ContentDigest },
    initResources: readonly { packageId: string; path: string; digest: ContentDigest }[] = []) =>
    lifecycleDefs[id]!.functions.map((fn) => ({
      ref: lifeFunction(id, fn.id), outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] as const,
      effects: 'none' as const,
      implementation: { module: id === FIXTURE_EXT && fn.id === 'telemetryHook'
        ? { packageId: FIXTURE_EXT, path: 'dist/hook.mjs', digest: hookDigest }
        : artifact, exportName: fn.id },
      resources: fn.id === 'init' ? [...initResources] : [],
    }));
  const businessRuleResource = {
    packageId: FIXTURE_BUSINESS, path: 'content/rules.json',
    digest: await fileBytesDigest(join(installRoot, 'node_modules', FIXTURE_BUSINESS, 'content', 'rules.json')),
  };

  // 采用真实静态根→相对子模块→受控 SDK bare import，测试不再用空边超集
  // 偷换 BUILD 图证明。每条边均由 Boot 独立解析实际源码核对。
  const pinnedKdpEntry = {
    packageId: KDP_PACKAGE_ID, path: 'dist/index.js',
    digest: await fileBytesDigest(join(kdpPackageDir, 'dist', 'index.js')),
  };
  const pinnedKdpChild = {
    packageId: KDP_PACKAGE_ID, path: 'dist/bootstrap.js',
    digest: await fileBytesDigest(join(kdpPackageDir, 'dist', 'bootstrap.js')),
  };
  const trustedKdpModuleClosure = [
    { module: pinnedKdpChild, dependencies: [], trustedImports: ['@kaicreator/domain-harness-microkernel'] },
    { module: pinnedKdpEntry, dependencies: [pinnedKdpChild], trustedImports: [] },
  ];

  const resourceDigests: Record<string, ContentDigest> = {
    [`${KDP_PACKAGE_ID}/package.json`]: await fileBytesDigest(join(kdpPackageDir, 'package.json')),
    ...Object.fromEntries(trustedKdpModuleClosure.map((node) => [`${KDP_PACKAGE_ID}/${node.module.path}`, node.module.digest])),
    [`${FIXTURE_KERNEL}/dist/index.mjs`]: kernelArtifact.digest,
    [`${FIXTURE_SDK}/dist/index.mjs`]: sdkArtifact.digest,
    [`${FIXTURE_BUSINESS}/dist/index.mjs`]: businessArtifact.digest,
    [`${FIXTURE_BUSINESS}/elements/orders.eligibility.json`]: bytesDigest(Buffer.from(definitionText, 'utf8')),
    [`${FIXTURE_BUSINESS}/${OPTIONAL_REPORT_SCHEMA_PATH}`]: bytesDigest(Buffer.from(OPTIONAL_REPORT_SCHEMA_TEXT, 'utf8')),
    [`${FIXTURE_BUSINESS}/content/rules.json`]: await fileBytesDigest(
      join(installRoot, 'node_modules', FIXTURE_BUSINESS, 'content', 'rules.json'),
    ),
    [`${FIXTURE_EXT}/dist/index.mjs`]: extArtifact.digest,
    [`${FIXTURE_EXT}/dist/hook.mjs`]: hookDigest,
    ...Object.fromEntries(lifeNames.map(([id]) => [
      `${id}/elements/lifecycle.json`, bytesDigest(Buffer.from(JSON.stringify(lifecycleDefs[id]!), 'utf8')),
    ])),
  };

  const lockBase = {
    kind: 'DomainAppLock',
    schemaVersion: 'dh.lock/0.11',
    appIdentity: {
      id: APP_ID,
      version: APP_VERSION,
      descriptorDigest: bytesDigest(descriptorBytes),
    },
    target: TARGET,
    bootstrapKdpPin: {
      kdpPackageId: KDP_PACKAGE_ID,
      kdpPrimaryEntry: 'bootstrap',
      kdpPrimaryDigest: kdpEntryDigest,
    },
    trustedKdpModuleClosure,
    selectedPackages: [
      { packageId: FIXTURE_KERNEL, version: '1.0.0', recordInitFrom: true, order: 0, layer: 'kernel', role: 'primary', artifact: kernelArtifact,
        init: lifecycleRefs[FIXTURE_KERNEL]!, initFunction: lifeFunction(FIXTURE_KERNEL, 'init'),
        exit: lifecycleRefs[FIXTURE_KERNEL]!, exitFunction: lifeFunction(FIXTURE_KERNEL, 'exit'), initResources: [], imports: [], dependsOn: [] },
      { packageId: FIXTURE_SDK, version: '1.0.0', recordInitFrom: true, order: 1, layer: 'sdk', role: 'primary', artifact: sdkArtifact,
        init: lifecycleRefs[FIXTURE_SDK]!, initFunction: lifeFunction(FIXTURE_SDK, 'init'),
        exit: lifecycleRefs[FIXTURE_SDK]!, exitFunction: lifeFunction(FIXTURE_SDK, 'exit'), initResources: [], imports: [], dependsOn: [FIXTURE_KERNEL] },
      { packageId: FIXTURE_BUSINESS, version: '1.0.0', recordInitFrom: true, order: 2, layer: 'business', role: 'primary', artifact: businessArtifact,
        init: lifecycleRefs[FIXTURE_BUSINESS]!, initFunction: lifeFunction(FIXTURE_BUSINESS, 'init'),
        exit: lifecycleRefs[FIXTURE_BUSINESS]!, exitFunction: lifeFunction(FIXTURE_BUSINESS, 'exit'), initResources: [businessRuleResource], imports: [], dependsOn: [FIXTURE_SDK, FIXTURE_EXT] },
      { packageId: FIXTURE_EXT, version: '1.0.0', recordInitFrom: true, layer: 'business', role: 'extension', artifact: extArtifact,
        init: lifecycleRefs[FIXTURE_EXT]!, initFunction: lifeFunction(FIXTURE_EXT, 'init'),
        exit: lifecycleRefs[FIXTURE_EXT]!, exitFunction: lifeFunction(FIXTURE_EXT, 'exit'), initResources: [], imports: [], dependsOn: [] },
    ],
    selectedElements: [
      { ref: elementRef, ownerPackageId: FIXTURE_BUSINESS, visibility: 'public',
        contentDigests: [digestOf({ minOrderTotal: 50, regions: ['EU'] })],
        contractDigests: [digestOf(definition.functions[0]), digestOf(definition.functions[1])] },
      ...lifeNames.map(([id]) => ({
        ref: lifecycleRefs[id]!, ownerPackageId: id, visibility: 'private' as const,
        contentDigests: [],
        contractDigests: lifecycleDefs[id]!.functions.map((fn) => digestOf(fn)),
      })),
    ],
    selectedFunctions: [
      {
        ref: evaluateRef, outcomes: ['SUCCEEDED', 'UNKNOWN'], effects: 'none',
        implementation: { module: businessArtifact, exportName: 'evaluate' }, resources: [],
      },
      {
        ref: optionalReportRef, outcomes: ['SUCCEEDED', 'UNKNOWN'], effects: 'none',
        implementation: { module: businessArtifact, exportName: 'optionalReport' }, resources: [],
      },
      ...lifeSelected(FIXTURE_KERNEL, kernelArtifact),
      ...lifeSelected(FIXTURE_SDK, sdkArtifact),
      ...lifeSelected(FIXTURE_BUSINESS, businessArtifact, [businessRuleResource]),
      ...lifeSelected(FIXTURE_EXT, extArtifact),
    ],
    hookBindings: [{
      ownerPackageId: FIXTURE_KERNEL, hookId: 'telemetry', cardinality: 'multi',
      providers: [lifeFunction(FIXTURE_EXT, 'telemetryHook')],
    }],
    coreOrder: [FIXTURE_KERNEL, FIXTURE_SDK, FIXTURE_BUSINESS],
    resourceDigests,
    excludedUnknownContent: [],
  };
  const closureDigest = digestOf(lockBase);
  const lock: DomainAppLock = {
    ...(lockBase as unknown as DomainAppLock),
    closureDigest,
  };
  const lockText = JSON.stringify(lock);
  await write(LOCK_RELATIVE_PATH, lockText);

  const recordBase = {
    kind: 'DomainAppInstallRecord',
    schemaVersion: 'dh.install/0.11',
    appId: APP_ID,
    appVersion: APP_VERSION,
    target: TARGET,
    lockPath: LOCK_RELATIVE_PATH,
    lockDigest: closureDigest,
    kdpPackageId: KDP_PACKAGE_ID,
    kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: lockBase.bootstrapKdpPin.kdpPrimaryDigest,
  };
  const record: InstalledRecord = {
    ...(recordBase as unknown as InstalledRecord),
    recordDigest: digestOf(recordBase),
  };
  await write('dh-install/installed-record.json', JSON.stringify(record));

  const pin: BootstrapPin = {
    schemaVersion: 'dh.pin/0.11',
    target: TARGET,
    kdpPackageId: KDP_PACKAGE_ID,
    kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: record.kdpPrimaryDigest,
    lockDigest: closureDigest,
    lockPath: LOCK_RELATIVE_PATH,
  };
  const context: KdpBootstrapContext = {
    installRoot,
    descriptorPath: DESCRIPTOR_RELATIVE_PATH,
    lockPath: LOCK_RELATIVE_PATH,
    hostPorts: [{ name: 'fixture-channel', port: 0 }],
    env: { nodeMajor: 22, platform: process.platform },
  };

  const recordPath = join(installRoot, 'dh-install', 'installed-record.json');
  const lockPath = join(installRoot, ...LOCK_RELATIVE_PATH.split('/'));
  const kdpEntryPath = join(kdpPackageDir, 'dist', 'index.js');

  return {
    installRoot,
    pin,
    context,
    lock,
    record,
    readRecord: async () => JSON.parse(await readFile(recordPath, 'utf8')) as Record<string, unknown>,
    writeRecord: async (value) => {
      await writeFile(recordPath, JSON.stringify(value));
    },
    writeRecordText: async (text) => {
      await writeFile(recordPath, text);
    },
    readLockBytes: () => readFile(lockPath),
    writeLockBytes: async (bytes) => {
      await writeFile(lockPath, bytes);
    },
    readKdpEntryBytes: () => readFile(kdpEntryPath),
    writeKdpEntryBytes: async (bytes) => {
      await writeFile(kdpEntryPath, bytes);
    },
    writeKdpManifest: async (manifest) => {
      await writeFile(join(kdpPackageDir, 'package.json'), JSON.stringify(manifest));
    },
    writePackageFile: async (packageId, path, bytes) => {
      const absolute = join(installRoot, 'node_modules', ...packageId.split('/'), ...path.split('/'));
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, bytes);
    },
    cleanup: async () => {
      const { rm } = await import('node:fs/promises');
      await rm(installRoot, { recursive: true, force: true });
    },
  };
}
