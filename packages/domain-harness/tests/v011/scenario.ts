/**
 * DomainHarness v0.11.0 T04 (#1578) — focused integration fixture builder.
 *
 * Unlike the T03 helper (which hand-assembles a Lock), this builder drives
 * the REAL T02 BUILD (`buildV011App`) over a real on-disk authoring
 * workspace, then materializes a trusted install (PRD K02 / L2 §8.5 step 3
 * shape) that the REAL T03 Boot/KDP (`boot`) loads. Every byte on disk is
 * real: content digests, artifact digests and the Lock closure digest are
 * all computed by BUILD itself from the actual files.
 */
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
} from '@kaicreator/domain-harness-contracts/v011';
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
} from '@kaicreator/domain-harness-contracts/v011';
import { buildV011App } from '@kaicreator/domain-harness-build';
import type { V011BuildInput, V011BuildFailure } from '@kaicreator/domain-harness-build';

const HERE = dirname(fileURLToPath(import.meta.url));
const MICROKERNEL_DIR = join(HERE, '../../../microkernel');
const CONTRACTS_DIR = join(HERE, '../../../contracts');
const KDP_PACKAGE_ID = '@kaicreator/domain-harness-microkernel';
const TARGET_SELECTOR = { runtime: 'node', module: 'esm', nodeMajor: 24 } as const;
const LOCK_RELATIVE_PATH = 'dh-lock/app.lock.json';
const DESCRIPTOR_RELATIVE_PATH = 'descriptor/app.json';

export interface T04Scenario {
  /** Selected rule content — swapped between scenarios (content-swap proof). */
  readonly rule: { readonly minOrderTotal: number; readonly regions: readonly string[] };
  /** READY app init, or DEGRADED suppressing only the optional ingress. */
  readonly init: { readonly status: 'READY' | 'DEGRADED' };
  /** Select a function declaring a non-'none' effect profile (BUILD refusal). */
  readonly withUnsupportedEffect?: boolean;
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

/** BUILD refusal surfaced to negative tests without materializing an install. */
export class T04BuildRefusedError extends Error {
  readonly failure: V011BuildFailure;
  constructor(failure: V011BuildFailure) {
    super(`buildV011App refused: ${failure.code}: ${failure.message}`);
    this.name = 'T04BuildRefusedError';
    this.failure = failure;
  }
}

declare global {
  var __v011T04Events: Array<Record<string, unknown>> | undefined;
}

export function events(): Array<Record<string, unknown>> {
  return globalThis.__v011T04Events ?? [];
}

export function resetEvents(): void {
  globalThis.__v011T04Events = [];
}

function bytesDigest(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function fileBytesDigest(path: string): Promise<`sha256:${string}`> {
  return bytesDigest(await readFile(path));
}

// ---------------------------------------------------------------------------
// fixture package module sources (real ESM on disk)
// ---------------------------------------------------------------------------

function kernelModuleSource(): string {
  return `
const events = (globalThis.__v011T04Events ??= []);
events.push({ event: 'module-evaluated', package: 'kdp-kernel' });
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: 'kdp-kernel' });
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: 'kdp-kernel' });
}
`;
}

function sdkModuleSource(): string {
  return `
const events = (globalThis.__v011T04Events ??= []);
events.push({ event: 'module-evaluated', package: 'sdk-core' });
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: 'sdk-core' });
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: 'sdk-core' });
}
`;
}

function extensionModuleSource(): string {
  return `
const events = (globalThis.__v011T04Events ??= []);
events.push({ event: 'module-evaluated', package: 'orders-ext' });
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: 'orders-ext' });
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: 'orders-ext' });
}
`;
}

/**
 * The business Primary artifact module (package identity + technical
 * lifecycle). The stateful Function/App-Init exports live in ONE separate
 * module (dist/evaluate.mjs) so `businessAppInit` and `evaluate` share the
 * same module state (the selected rule content).
 */
function businessArtifactModuleSource(): string {
  return `
const events = (globalThis.__v011T04Events ??= []);
events.push({ event: 'module-evaluated', package: 'orders-business' });
export async function technicalInit(ctx) {
  events.push({ event: 'technical-init', package: 'orders-business' });
}
export async function technicalDispose(ctx) {
  events.push({ event: 'technical-dispose', package: 'orders-business' });
}
`;
}

/**
 * The business Primary entry module. `businessAppInit` reads the SELECTED
 * rule content resource through the sealed init-context handle and keeps it
 * in module state; `evaluate` computes POS/NEG/UNKNOWN FROM THAT CONTENT —
 * the L2 §7.3 content-exchange proof (same implementation, swapped selected
 * content → different observable output).
 */
function businessEntryModuleSource(scenario: T04Scenario): string {
  const initResult =
    scenario.init.status === 'DEGRADED'
      ? { status: 'DEGRADED', suppressedIngress: ['optional-report'] }
      : { status: 'READY' };
  return `
const events = (globalThis.__v011T04Events ??= []);
events.push({ event: 'module-evaluated', package: 'orders-business-entry' });
const INIT_RESULT = ${JSON.stringify(initResult)};
let RULE = null;
export async function businessAppInit(initCtx) {
  const handle = initCtx.resources.get('orders-business/content/rules.json');
  if (handle === undefined) {
    throw new Error('selected rule content resource is not sealed in the Lock');
  }
  const bytes = await handle.read();
  RULE = JSON.parse(Buffer.from(bytes).toString('utf8'));
  events.push({
    event: 'business-init',
    package: 'orders-business',
    appId: initCtx.appId,
    hasActivationId: typeof initCtx.activationId === 'string' && initCtx.activationId.length > 0,
    lockDigest: initCtx.lockDigest,
    rule: RULE,
    ingress: [...initCtx.functions.keys()],
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

// ---------------------------------------------------------------------------
// authoring documents
// ---------------------------------------------------------------------------

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
      {
        id: 'appInit',
        contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'object' } },
        outcomes: ['SUCCEEDED'],
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

// ---------------------------------------------------------------------------
// build + install
// ---------------------------------------------------------------------------

/**
 * Run the real BUILD over a fresh authoring workspace and materialize a
 * trusted install. Returns everything Boot needs; `lockBytes` are BUILD's
 * own canonical bytes. A BUILD refusal (e.g. the unsupported-effect
 * negative) surfaces as {@link T04BuildRefusedError} with the typed failure.
 */
export async function buildScenarioInstall(scenario: T04Scenario): Promise<T04Install> {
  resetEvents();
  const { rm } = await import('node:fs/promises');
  const wsRoot = await mkdtemp(join(tmpdir(), 'dh-v011-t04-ws-'));
  const installRoot = await mkdtemp(join(tmpdir(), 'dh-v011-t04-install-'));
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

    // 1. Authoring workspace: fixture K/S/B/Extension packages, REAL bytes.
    const kernelDir = join(wsRoot, 'packages/kdp-kernel');
    const sdkDir = join(wsRoot, 'packages/sdk-core');
    const businessDir = join(wsRoot, 'packages/orders-business');
    const extDir = join(wsRoot, 'packages/orders-ext');

    const kernelModule = await write(kernelDir, 'dist/index.mjs', kernelModuleSource());
    const sdkModule = await write(sdkDir, 'dist/index.mjs', sdkModuleSource());
    const businessModule = await write(businessDir, 'dist/business.mjs', businessArtifactModuleSource());
    const evaluateModule = await write(businessDir, 'dist/evaluate.mjs', businessEntryModuleSource(scenario));
    const extModule = await write(extDir, 'dist/index.mjs', extensionModuleSource());
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
    const appInitRef = ref('appInit');
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

    const businessManifest = manifest('orders-business', '1.0.0', {
      layer: 'business',
      role: 'primary',
      elements: [
        {
          id: 'orders.eligibility',
          version: '1.0.0',
          definitionRef: { packageId: 'orders-business', path: 'elements/orders.eligibility.json', digest: bytesDigest(elementBytes) },
          visibility: 'public',
        },
      ],
      exports: [{ elementId: 'orders.eligibility' }, { interfaceId: 'orders.api' }],
      technicalInit: { module: businessModuleRef, exportName: 'technicalInit' },
      technicalDispose: { module: businessModuleRef, exportName: 'technicalDispose' },
      targetVariants: [
        {
          target: TARGET_SELECTOR,
          implementations: [
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
            {
              elementId: 'orders.eligibility',
              functionId: 'appInit',
              contractVersion: '1',
              entry: { module: evaluateModuleRef, exportName: 'businessAppInit' },
              resources: [ruleRef],
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
      dependsOn: [{ package: 'kdp-kernel', version: '1.0.0', interface: 'kernel.api' }],
      exports: [{ interfaceId: 'sdk.api' }],
      technicalInit: { module: { packageId: 'sdk-core', path: 'dist/index.mjs', digest: await fileBytesDigest(sdkModule) }, exportName: 'technicalInit' },
      technicalDispose: { module: { packageId: 'sdk-core', path: 'dist/index.mjs', digest: await fileBytesDigest(sdkModule) }, exportName: 'technicalDispose' },
    });

    const kernelManifest = manifest('kdp-kernel', '1.0.0', {
      layer: 'kernel',
      role: 'primary',
      exports: [{ interfaceId: 'kernel.api' }],
      technicalInit: { module: { packageId: 'kdp-kernel', path: 'dist/index.mjs', digest: await fileBytesDigest(kernelModule) }, exportName: 'technicalInit' },
      technicalDispose: { module: { packageId: 'kdp-kernel', path: 'dist/index.mjs', digest: await fileBytesDigest(kernelModule) }, exportName: 'technicalDispose' },
    });

    const extManifest = manifest('orders-ext', '1.0.0', {
      layer: 'business',
      role: 'extension',
      dependsOn: [{ package: 'orders-business', version: '1.0.0', interface: 'orders.api' }],
      technicalInit: { module: { packageId: 'orders-ext', path: 'dist/index.mjs', digest: await fileBytesDigest(extModule) }, exportName: 'technicalInit' },
      technicalDispose: { module: { packageId: 'orders-ext', path: 'dist/index.mjs', digest: await fileBytesDigest(extModule) }, exportName: 'technicalDispose' },
    });

    const descriptor: DomainAppDescriptor = {
      kind: 'DomainApp',
      schemaVersion: DH_APP_SCHEMA_VERSION,
      id: APP_ID,
      version: APP_VERSION,
      target: TARGET_SELECTOR,
      roots: {
        kernelPrimary: { package: 'kdp-kernel', version: '1.0.0' },
        sdkPrimary: { package: 'sdk-core', version: '1.0.0' },
        businessPrimary: { package: 'orders-business', version: '1.0.0' },
      },
      extensions: [{ package: 'orders-ext', version: '1.0.0' }],
      businessAppInit: appInitRef,
      ingress: [
        { id: 'evaluate', function: evaluateRef },
        { id: 'optional-report', function: optionalReportRef, optional: true },
        ...(scenario.withUnsupportedEffect === true ? [{ id: 'dangerous', function: dangerousRef }] : []),
      ],
      config: { region: 'EU', suite: 't04-final' },
    };

    const input: V011BuildInput = {
      descriptor,
      packages: [businessManifest, sdkManifest, kernelManifest, extManifest],
      packageRoots: {
        'orders-business': businessDir,
        'sdk-core': sdkDir,
        'kdp-kernel': kernelDir,
        'orders-ext': extDir,
        [KDP_PACKAGE_ID]: MICROKERNEL_DIR,
      },
      packageArtifacts: {
        'orders-business': 'dist/business.mjs',
        'sdk-core': 'dist/index.mjs',
        'kdp-kernel': 'dist/index.mjs',
        'orders-ext': 'dist/index.mjs',
      },
      kdpArtifact: { packageId: KDP_PACKAGE_ID, path: 'dist/v011/index.js' },
    };

    const built = await buildV011App(input);
    if (!built.ok) {
      throw new T04BuildRefusedError(built);
    }
    const lock = built.lock;

    // 2. Materialize the trusted install from the authoring workspace.
    const copyPackage = async (packageId: string, sourceDir: string): Promise<void> => {
      await cp(sourceDir, join(installRoot, 'node_modules', ...packageId.split('/')), { recursive: true });
    };
    await copyPackage('orders-business', businessDir);
    await copyPackage('sdk-core', sdkDir);
    await copyPackage('kdp-kernel', kernelDir);
    await copyPackage('orders-ext', extDir);

    // 3. Installed KDP + contracts packages (node_modules-normal resolution).
    const kdpInstallDir = join(installRoot, 'node_modules', KDP_PACKAGE_ID);
    await mkdir(kdpInstallDir, { recursive: true });
    await writeFile(
      join(kdpInstallDir, 'package.json'),
      JSON.stringify({
        name: KDP_PACKAGE_ID,
        version: '0.11.0',
        type: 'module',
        exports: { '.': { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' } },
      }),
    );
    await cp(join(MICROKERNEL_DIR, 'dist/v011'), join(kdpInstallDir, 'dist/v011'), { recursive: true });

    const contractsInstallDir = join(installRoot, 'node_modules', '@kaicreator/domain-harness-contracts');
    await mkdir(contractsInstallDir, { recursive: true });
    await writeFile(
      join(contractsInstallDir, 'package.json'),
      JSON.stringify({
        name: '@kaicreator/domain-harness-contracts',
        version: '0.11.0',
        type: 'module',
        exports: { './v011': { types: './dist/v011/index.d.ts', import: './dist/v011/index.js' } },
      }),
    );
    await cp(join(CONTRACTS_DIR, 'dist/v011'), join(contractsInstallDir, 'dist/v011'), { recursive: true });

    // 4. Descriptor + Lock bytes (canonical JSON, digest-pinned by BUILD).
    await write(installRoot, DESCRIPTOR_RELATIVE_PATH, canonicalJson(descriptor as unknown as JsonValue));
    await mkdir(join(installRoot, 'dh-lock'), { recursive: true });
    await writeFile(join(installRoot, ...LOCK_RELATIVE_PATH.split('/')), built.lockBytes);

    // 5. Installed record — the trust anchor.
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
      env: { nodeMajor: 24, platform: process.platform },
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
