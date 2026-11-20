/**
 * DomainHarness v0.11.0 T03 (#1577) — trusted-install fixture builder.
 *
 * Materializes REAL temporary installs on disk: the actually-built
 * microkernel `dist/v011` and contracts `dist/v011` trees are copied into
 * `<installRoot>/node_modules/...` exactly like a trusted installation
 * process (PRD K02 / L2 §8.5 step 3) would leave them, fixture K/S/B
 * packages are real ESM modules on disk, and the InstalledRecord / Lock /
 * Descriptor carry real recomputed digests (canonical JSON per L2 §2.1/§5.3,
 * artifact byte digests per L2 §6.2c).
 *
 * Boot under test reads only `<installRoot>/dh-install/installed-record.json`;
 * no record content or path is ever passed through the invocation payload.
 */
import { mkdtemp, mkdir, writeFile, cp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { contentDigestOf } from '@kaicreator/domain-harness-contracts/v011';
import type {
  BootstrapPin,
  ContentDigest,
  DomainAppDescriptor,
  DomainAppLock,
  ElementDefinition,
  FunctionRef,
  InstalledRecord,
  KdpBootstrapContext,
  ResolvedTarget,
} from '@kaicreator/domain-harness-contracts/v011';
import { boot } from '../../../src/v011/index.js';

export { boot };

const MICROKERNEL_DIST = fileURLToPath(new URL('../../../dist/v011/', import.meta.url));
const CONTRACTS_DIST = fileURLToPath(
  new URL('../../../../contracts/dist/v011/', import.meta.url),
);

export const KDP_PACKAGE_ID = '@kaicreator/domain-harness-microkernel';
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
  readonly suppressed?: readonly string[];
  readonly throw?: boolean;
}

export interface FixtureScenario {
  readonly init: FixtureInit;
  readonly functions: Readonly<Record<string, FunctionBehavior>>;
  /** When set, businessAppInit reads this init-context resource key. */
  readonly readResource?: string;
  /** When true, the fixture kernel's technicalDispose throws (single-flight negative). */
  readonly kernelDisposeThrow?: boolean;
  /** When true, the fixture SDK's technicalInit throws (init-cleanup negative). */
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
  /** re-read the on-disk installed record (negative tests mutate it). */
  readRecord(): Promise<Record<string, unknown>>;
  writeRecord(record: unknown): Promise<void>;
  /** write raw record bytes (parse-failure negatives). */
  writeRecordText(text: string): Promise<void>;
  readLockBytes(): Promise<Buffer>;
  writeLockBytes(bytes: Buffer): Promise<void>;
  readKdpEntryBytes(): Promise<Buffer>;
  writeKdpEntryBytes(bytes: Buffer): Promise<void>;
  /** replace the installed KDP package manifest (exports-conditions tests). */
  writeKdpManifest(manifest: unknown): Promise<void>;
  /** overwrite an installed package file (post-install tamper negatives). */
  writePackageFile(packageId: string, path: string, bytes: Buffer): Promise<void>;
  cleanup(): Promise<void>;
}

declare global {
  // Fixture package modules (dynamically imported by the KDP under test)
  // record their observable lifecycle events here, in the test process.
  var __v011Events: Array<Record<string, unknown>> | undefined;
}

export function events(): Array<Record<string, unknown>> {
  return globalThis.__v011Events ?? [];
}

export function resetEvents(): void {
  globalThis.__v011Events = [];
}

function bytesDigest(bytes: Buffer | Uint8Array): ContentDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * Digest of an already-plain JSON-compatible value. Test fixtures build
 * values from JSON.parse/JSON.stringify round-trips, so the cast is the
 * honest plain-data contract the canonical digest requires.
 */
export function digestOf(value: unknown): ContentDigest {
  return contentDigestOf(value as Parameters<typeof contentDigestOf>[0]);
}

async function fileBytesDigest(path: string): Promise<ContentDigest> {
  return bytesDigest(await readFile(path));
}

// ---------------------------------------------------------------------------
// fixture package modules (real on-disk ESM)
// ---------------------------------------------------------------------------

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
      throw new Error('fixture function threw');
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
const events = (globalThis.__v011Events ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_KERNEL}' });
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: '${FIXTURE_KERNEL}', hostPortCount: (ctx.hostPorts ?? []).length });
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: '${FIXTURE_KERNEL}' });
  if (${JSON.stringify(scenario.kernelDisposeThrow ?? false)}) {
    throw new Error('fixture kernel technicalDispose threw');
  }
}
`;
}

function sdkModuleSource(scenario: FixtureScenario): string {
  return `
const events = (globalThis.__v011Events ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_SDK}' });
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: '${FIXTURE_SDK}' });
  if (${JSON.stringify(scenario.sdkInitThrow ?? false)}) {
    throw new Error('fixture sdk technicalInit threw');
  }
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: '${FIXTURE_SDK}' });
}
`;
}

function businessModuleSource(scenario: FixtureScenario): string {
  return `
const events = (globalThis.__v011Events ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_BUSINESS}' });
const SCENARIO = ${JSON.stringify({ init: scenario.init, functions: scenario.functions, readResource: scenario.readResource ?? null })};
${behaviorDispatch()}
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: '${FIXTURE_BUSINESS}' });
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: '${FIXTURE_BUSINESS}' });
}
export async function businessAppInit(initCtx) {
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
    // Un-guarded on purpose: a tampered closure resource must fail the init.
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
const events = (globalThis.__v011Events ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_EXT}' });
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: '${FIXTURE_EXT}' });
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: '${FIXTURE_EXT}' });
}
`;
}

function hookProviderModuleSource(): string {
  return `
const events = (globalThis.__v011Events ??= []);
events.push({ event: 'module-evaluated', package: '${FIXTURE_EXT}:hook' });
export function telemetryHook() {
  events.push({ event: 'hook-provider-invoked', package: '${FIXTURE_EXT}' });
}
`;
}

// ---------------------------------------------------------------------------
// authoring documents
// ---------------------------------------------------------------------------

const APP_ID = 'fixture.orders-app';
const APP_VERSION = '1.0.0';

/** Resource-referenced input schema for `optionalReport` (schema-tamper tests). */
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
        // Resource-referenced schema: exercises the runtime SchemaRef
        // resource-read digest verification on the happy path and under tamper.
        inputSchemaRef: {
          packageId: FIXTURE_BUSINESS,
          path: OPTIONAL_REPORT_SCHEMA_PATH,
          digest: optionalReportSchemaDigest,
        },
        outputSchemaRef: { inline: { type: 'string' } },
        outcomes: ['SUCCEEDED', 'UNKNOWN'],
        effects: 'none',
      },
      {
        id: 'appInit',
        contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'object' } },
        outcomes: ['SUCCEEDED'],
        effects: 'none',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// installer
// ---------------------------------------------------------------------------

export async function buildFixtureInstall(
  scenario: FixtureScenario = DEFAULT_SCENARIO,
): Promise<FixtureInstall> {
  resetEvents();
  const installRoot = await mkdtemp(join(tmpdir(), 'dh-v011-t03-'));

  const write = async (relativePath: string, content: string): Promise<string> => {
    const absolute = join(installRoot, ...relativePath.split('/'));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
    return absolute;
  };

  // 1. The trusted installation content: copies of the real built v011
  //    artifacts, addressed by node_modules-normal package resolution.
  const kdpPackageDir = join(installRoot, 'node_modules', KDP_PACKAGE_ID);
  await mkdir(kdpPackageDir, { recursive: true });
  await writeFile(
    join(kdpPackageDir, 'package.json'),
    JSON.stringify({
      name: KDP_PACKAGE_ID,
      version: '0.11.0',
      type: 'module',
      exports: { '.': { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' } },
    }),
  );
  await cp(MICROKERNEL_DIST, join(kdpPackageDir, 'dist', 'v011'), { recursive: true });

  const contractsPackageDir = join(installRoot, 'node_modules', '@kaicreator/domain-harness-contracts');
  await mkdir(contractsPackageDir, { recursive: true });
  await writeFile(
    join(contractsPackageDir, 'package.json'),
    JSON.stringify({
      name: '@kaicreator/domain-harness-contracts',
      version: '0.11.0',
      type: 'module',
      exports: { './v011': { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' } },
    }),
  );
  await cp(CONTRACTS_DIST, join(contractsPackageDir, 'dist', 'v011'), { recursive: true });

  // 2. Fixture K/S/B/Extension packages — real ESM modules on disk.
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

  // 3. Descriptor (digest-pinned into the Lock identity).
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
  const appInitRef: FunctionRef = {
    element: { namespace: 'orders', id: 'orders.eligibility', version: '1.0.0', digest: definitionDigest },
    functionId: 'appInit',
    contractVersion: '1',
  };
  const elementRef = evaluateRef.element;

  const descriptor: DomainAppDescriptor = {
    kind: 'DomainApp',
    schemaVersion: 'dh.app/0.11',
    id: APP_ID,
    version: APP_VERSION,
    target: { runtime: 'node', module: 'esm', nodeMajor: 22 },
    roots: {
      kernelPrimary: { package: FIXTURE_KERNEL, version: '1.0.0' },
      sdkPrimary: { package: FIXTURE_SDK, version: '1.0.0' },
      businessPrimary: { package: FIXTURE_BUSINESS, version: '1.0.0' },
    },
    extensions: [{ package: FIXTURE_EXT, version: '1.0.0' }],
    businessAppInit: appInitRef,
    ingress: [
      { id: 'evaluate', function: evaluateRef },
      { id: 'optional-report', function: optionalReportRef, optional: true },
    ],
    config: { region: 'EU', featureFlag: true },
  };
  const descriptorBytes = Buffer.from(JSON.stringify(descriptor), 'utf8');
  await write(DESCRIPTOR_RELATIVE_PATH, descriptorBytes.toString('utf8'));

  // 4. Lock — the sole runtime fact (L2 §5.2/§5.3).
  const kdpEntryDigest = await fileBytesDigest(join(kdpPackageDir, 'dist', 'v011', 'index.js'));
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

  const resourceDigests: Record<string, ContentDigest> = {
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
    selectedPackages: [
      { packageId: FIXTURE_KERNEL, version: '1.0.0', technicalLifecycle: true, layer: 'kernel', role: 'primary', artifact: kernelArtifact, dependsOn: [] },
      { packageId: FIXTURE_SDK, version: '1.0.0', technicalLifecycle: true, layer: 'sdk', role: 'primary', artifact: sdkArtifact, dependsOn: [FIXTURE_KERNEL] },
      { packageId: FIXTURE_BUSINESS, version: '1.0.0', technicalLifecycle: true, layer: 'business', role: 'primary', artifact: businessArtifact, dependsOn: [FIXTURE_SDK] },
      { packageId: FIXTURE_EXT, version: '1.0.0', technicalLifecycle: true, layer: 'business', role: 'extension', artifact: extArtifact, dependsOn: [FIXTURE_BUSINESS] },
    ],
    selectedElements: [
      {
        ref: elementRef,
        ownerPackageId: FIXTURE_BUSINESS,
        visibility: 'public',
        contentDigests: [digestOf({ minOrderTotal: 50, regions: ['EU'] })],
        contractDigests: [
          digestOf(definition.functions[0]),
          digestOf(definition.functions[1]),
          digestOf(definition.functions[2]),
        ],
      },
    ],
    selectedFunctions: [
      {
        ref: evaluateRef,
        outcomes: ['SUCCEEDED', 'UNKNOWN'],
        effects: 'none',
        implementation: { module: businessArtifact, exportName: 'evaluate' },
        resources: [],
      },
      {
        ref: optionalReportRef,
        outcomes: ['SUCCEEDED', 'UNKNOWN'],
        effects: 'none',
        implementation: { module: businessArtifact, exportName: 'optionalReport' },
        resources: [],
      },
      {
        ref: appInitRef,
        outcomes: ['SUCCEEDED'],
        effects: 'none',
        implementation: { module: businessArtifact, exportName: 'businessAppInit' },
        resources: [],
      },
    ],
    hookBindings: [
      {
        ownerPackageId: FIXTURE_KERNEL,
        hookId: 'telemetry',
        cardinality: 'multi',
        providers: [
          { module: { packageId: FIXTURE_EXT, path: 'dist/hook.mjs', digest: hookDigest }, exportName: 'telemetryHook' },
        ],
      },
    ],
    technicalInitOrder: [FIXTURE_KERNEL, FIXTURE_SDK, FIXTURE_BUSINESS, FIXTURE_EXT],
    technicalDisposeOrder: [FIXTURE_EXT, FIXTURE_BUSINESS, FIXTURE_SDK, FIXTURE_KERNEL],
    businessAppInit: appInitRef,
    ingress: [
      { id: 'evaluate', function: evaluateRef, optional: false },
      { id: 'optional-report', function: optionalReportRef, optional: true },
    ],
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

  // 5. Installed record — the trust anchor at the fixed relative path.
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
  const kdpEntryPath = join(kdpPackageDir, 'dist', 'v011', 'index.js');

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
