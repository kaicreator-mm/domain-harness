/**
 * DomainHarness v0.11.0 T02 (#1576) — shared AC02/03/04/07 authoring
 * workspace. Every byte on disk is real; negatives mutate the in-memory
 * authoring documents BEFORE finalize() so declared digests and refs stay
 * internally consistent unless the test itself breaks them.
 */
import type {
  DomainAppDescriptor,
  DomainPackageManifest,
  ElementDefinition,
  ElementVisibility,
  FunctionRef,
  JsonValue,
  TargetSelector,
} from '@kaicreator/domain-harness-contracts/v011';
import type { V011BuildInput } from '../../src/v011/index.js';
import {
  DH_ELEMENT_SCHEMA_VERSION,
  addPackage,
  makeWorkspace,
  manifest,
  descriptor,
  functionRefOf,
  writeJson,
  writeRaw,
  writeCanonicalJson,
  type Workspace,
} from './fixtures.js';

export interface StandardRefs {
  evaluateRef: FunctionRef;
  initRef: FunctionRef;
}

const TARGET_22: TargetSelector = { runtime: 'node', module: 'esm', nodeMajor: 22 };

function requireValue(value: JsonValue | undefined, key: string): JsonValue {
  if (value === undefined) throw new Error(`fixture: no extraElementFileValues for ${key}`);
  return value;
}

export interface StandardCase {
  ws: Workspace;
  faq: ElementDefinition;
  eligibility: ElementDefinition;
  legacyPrompt: ElementDefinition;
  appMain: ElementDefinition;
  /** extra business-package elements appended by negatives */
  extraElements: ElementDefinition[];
  /** `<elementId>/<contentBlockId>` -> canonical-JSON value written for a pending ref */
  extraElementFileValues: Record<string, JsonValue>;
  /** `<elementId>/<contentBlockId>` -> RAW bytes written for a pending ref (opaque content) */
  extraElementRawFiles: Record<string, Uint8Array>;
  /** extra implementation bindings appended to the business node24 variant */
  extraImplementations: DomainPackageManifest['targetVariants'][number]['implementations'];
  eligibilityVisibility: ElementVisibility;
  businessExports: DomainPackageManifest['exports'];
  sdkImports: DomainPackageManifest['imports'];
  sdkHookCardinality: 'single' | 'multi';
  aaaContributesTo: DomainPackageManifest['contributesTo'];
  businessDependsOn: DomainPackageManifest['dependsOn'];
  kdpDependsOn: DomainPackageManifest['dependsOn'];
  sdkLifecycle: 'paired' | 'init-only';
  descriptorTarget: TargetSelector;
  ingress: DomainAppDescriptor['ingress'];
  finalize(): { input: V011BuildInput; refs: StandardRefs };
}

export function standardCase(): StandardCase {
  const ws = makeWorkspace();

  const faq: ElementDefinition = {
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.faq',
    version: '1.0.0',
    description: 'Order FAQ knowledge.',
    content: [
      {
        id: 'faq-knowledge',
        contentKind: 'knowledge',
        schemaRef: { inline: { type: 'object', required: ['entries'] } },
        required: true,
        ref: { packageId: 'orders-business', path: 'content/faq.json', digest: 'sha256:pending' },
      },
    ],
    functions: [],
  };

  const eligibility: ElementDefinition = {
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.eligibility',
    version: '1.0.0',
    description: 'Order eligibility rules.',
    content: [
      {
        id: 'policy-rules',
        contentKind: 'rule',
        schemaRef: {
          inline: {
            type: 'object',
            required: ['minOrderTotal', 'regions'],
            properties: { minOrderTotal: { type: 'number' }, regions: { type: 'array' } },
          },
        },
        required: true,
        value: { minOrderTotal: 50, regions: ['EU', 'US'] },
      },
      {
        id: 'shipping-zones',
        contentKind: 'structured-data',
        schemaRef: { packageId: 'orders-business', path: 'schemas/zones.schema.json', digest: 'sha256:pending' },
        required: true,
        ref: { packageId: 'orders-business', path: 'content/zones.json', digest: 'sha256:pending' },
      },
      {
        id: 'explanation-doc',
        contentKind: 'document',
        schemaRef: { inline: { type: 'string' } },
        required: false,
        ref: { packageId: 'orders-business', path: 'docs/eligibility.md', digest: 'sha256:pending' },
      },
    ],
    functions: [
      {
        id: 'evaluate',
        contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object', required: ['total', 'region'] } },
        outputSchemaRef: {
          inline: {
            type: 'object',
            required: ['decision'],
            properties: { decision: { enum: ['POS', 'NEG', 'UNKNOWN'] } },
          },
        },
        outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'],
        effects: 'none',
      },
      {
        id: 'explain',
        contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'string' } },
        outcomes: ['SUCCEEDED', 'UNKNOWN'],
        effects: 'none',
      },
    ],
    dependencies: [{ element: 'orders.faq', version: '^1.0.0' }],
  };

  const legacyPrompt: ElementDefinition = {
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.legacy-prompt-notes',
    version: '1.0.0',
    description: 'Optional unknown-kind prompt notes (excluded from the Lock).',
    content: [
      {
        id: 'prompt-note',
        contentKind: 'prompt' as ElementDefinition['content'][number]['contentKind'],
        schemaRef: { inline: { type: 'string' } },
        required: false,
        value: 'Summarize for support.',
      },
    ],
    functions: [],
  };

  const appMain: ElementDefinition = {
    kind: 'Element',
    schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
    id: 'orders.app-main',
    version: '1.0.0',
    description: 'Business App Init element.',
    content: [],
    functions: [
      {
        id: 'init',
        contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'string' } },
        outcomes: ['SUCCEEDED', 'FAILED'],
        effects: 'none',
      },
    ],
  };

  const case_: StandardCase = {
    ws,
    faq,
    eligibility,
    legacyPrompt,
    appMain,
    extraElements: [],
    extraElementFileValues: {},
    extraElementRawFiles: {},
    extraImplementations: [],
    eligibilityVisibility: 'public',
    businessExports: [
      { elementId: 'orders.eligibility', functionId: 'evaluate' },
      { elementId: 'orders.app-main' },
      { interfaceId: 'orders.api' },
    ],
    sdkImports: [],
    sdkHookCardinality: 'multi',
    aaaContributesTo: [],
    businessDependsOn: [{ package: 'sdk-core', version: '1.0.0', interface: 'sdk.api' }],
    kdpDependsOn: [],
    sdkLifecycle: 'paired',
    descriptorTarget: TARGET_22,
    ingress: [],
    finalize,
  };

  function finalize(): { input: V011BuildInput; refs: StandardRefs } {
    const businessDir = addPackage(ws, 'orders-business');
    const sdkDir = addPackage(ws, 'sdk-core');
    const kdpDir = addPackage(ws, 'kdp-kernel');
    const aaaDir = addPackage(ws, 'aaa-ext');
    const extDir = addPackage(ws, 'orders-ext');
    const mkDir = addPackage(ws, '@kaicreator/domain-harness-microkernel');

    // real content bytes: files are always written; refs are patched only
    // when a negative has not already replaced them.
    const pending = (ref: { digest: string } | undefined): boolean => ref?.digest === 'sha256:pending';
    const faqFile = writeJson(businessDir, 'content/faq.json', {
      entries: [{ q: 'shipping?', a: 'EU US' }],
    });
    if (pending(faq.content[0]!.ref)) faq.content[0]!.ref = faqFile;
    const zonesSchemaFile = writeJson(businessDir, 'schemas/zones.schema.json', {
      type: 'object',
      required: ['zones'],
      properties: { zones: { type: 'array' } },
    });
    if (pending(eligibility.content[1]!.schemaRef as { digest: string })) {
      eligibility.content[1]!.schemaRef = zonesSchemaFile;
    }
    const zonesFile = writeJson(businessDir, 'content/zones.json', {
      zones: ['EU', 'US', 'APAC'],
    });
    if (pending(eligibility.content[1]!.ref)) eligibility.content[1]!.ref = zonesFile;
    const docFile = writeRaw(
      businessDir,
      'docs/eligibility.md',
      new TextEncoder().encode('# Eligibility\n\nOrders above 50 are eligible.\n'),
    );
    if (pending(eligibility.content[2]!.ref)) eligibility.content[2]!.ref = docFile;

    // element definition files (real bytes, digests computed from them)
    for (const element of case_.extraElements) {
      for (const block of element.content) {
        if (block.ref && block.ref.digest === 'sha256:pending') {
          const key = `${element.id}/${block.id}`;
          const raw = case_.extraElementRawFiles[key];
          const path = `content/${element.id.split('.')[1]}-${block.id}.bin`;
          (block as { ref?: unknown }).ref = raw
            ? writeRaw(businessDir, path, raw)
            : writeCanonicalJson(businessDir, path, requireValue(case_.extraElementFileValues[key], key));
        }
      }
    }
    const allBusiness = [faq, eligibility, legacyPrompt, appMain, ...case_.extraElements];
    const entries: DomainPackageManifest['elements'] = [];
    for (const [index, element] of allBusiness.entries()) {
      const fileName = `definitions/${element.id.split('.')[1]}-${element.version}-${index}.json`;
      const definitionRef = writeJson(businessDir, fileName, element as unknown as JsonValue);
      const visibility: ElementVisibility =
        element === eligibility
          ? case_.eligibilityVisibility
          : element === legacyPrompt
            ? 'private'
            : 'public';
      entries.push({ id: element.id, version: element.version, definitionRef, visibility });
    }

    // implementation modules + artifacts (real bytes)
    const evaluateModule = writeRaw(businessDir, 'dist/evaluate.mjs', new TextEncoder().encode('export function evaluate() { return { decision: "POS" }; }\n'));
    const evaluateLegacyModule = writeRaw(businessDir, 'dist/evaluate-node20.mjs', new TextEncoder().encode('export function evaluate() { return { decision: "LEGACY" }; }\n'));
    const initModule = writeRaw(businessDir, 'dist/init.mjs', new TextEncoder().encode('export function init() { return "ready"; }\n'));
    writeRaw(businessDir, 'dist/business.mjs', new TextEncoder().encode('export const artifact = "orders-business";\n'));
    const sdkArtifact = writeRaw(sdkDir, 'dist/sdk.mjs', new TextEncoder().encode('export const artifact = "sdk-core";\nexport function technicalInit() {}\nexport function technicalDispose() {}\n'));
    writeRaw(kdpDir, 'dist/kdp.mjs', new TextEncoder().encode('export const artifact = "kdp-kernel";\n'));
    const aaaArtifact = writeRaw(aaaDir, 'dist/aaa.mjs', new TextEncoder().encode('export const artifact = "aaa-ext";\n'));
    const auditModule = writeRaw(extDir, 'dist/audit.mjs', new TextEncoder().encode('export function audit() {}\n'));
    writeRaw(extDir, 'dist/ext.mjs', new TextEncoder().encode('export const artifact = "orders-ext";\n'));
    writeRaw(mkDir, 'dist/v011/index.js', new TextEncoder().encode('export async function bootstrap() { return { status: "BOOTED" }; }\n'));

    // contributions with pending module digests bind to the real artifact bytes
    const aaaContributesTo = case_.aaaContributesTo.map((contribution) => ({
      ...contribution,
      entry:
        contribution.entry.module.digest === 'sha256:pending'
          ? { ...contribution.entry, module: aaaArtifact }
          : contribution.entry,
    }));

    const evaluateRef = functionRefOf(eligibility, 'evaluate');
    const initRef = functionRefOf(appMain, 'init');

    const extraModules = case_.extraImplementations.map((binding, index) =>
      writeRaw(
        businessDir,
        `dist/extra-${index}.mjs`,
        new TextEncoder().encode(`export function ${binding.functionId}() {}\n`),
      ),
    );
    const extraImplementations = case_.extraImplementations.map((binding, index) => ({
      ...binding,
      entry: { ...binding.entry, module: extraModules[index]! },
    }));

    const businessManifest = manifest('orders-business', '1.0.0', {
      layer: 'business',
      role: 'primary',
      elements: entries,
      dependsOn: case_.businessDependsOn,
      exports: case_.businessExports,
      targetVariants: [
        {
          target: TARGET_22,
          implementations: [
            {
              elementId: 'orders.eligibility',
              functionId: 'evaluate',
              contractVersion: '1',
              entry: { module: evaluateModule, exportName: 'evaluate' },
              resources: [eligibility.content[1]!.ref!],
            },
            {
              elementId: 'orders.app-main',
              functionId: 'init',
              contractVersion: '1',
              entry: { module: initModule, exportName: 'init' },
            },
            ...extraImplementations,
          ],
        },
        {
          target: { runtime: 'node', module: 'esm', nodeMajor: 20 },
          implementations: [
            {
              elementId: 'orders.eligibility',
              functionId: 'evaluate',
              contractVersion: '1',
              entry: { module: evaluateLegacyModule, exportName: 'evaluate' },
            },
          ],
        },
      ],
    });

    const sdkManifest = manifest('sdk-core', '1.0.0', {
      layer: 'sdk',
      role: 'primary',
      dependsOn: [{ package: 'kdp-kernel', version: '1.0.0', interface: 'kernel.api' }],
      imports: case_.sdkImports,
      exports: [{ interfaceId: 'sdk.api' }],
      provides: {
        hooks: [
          {
            id: 'audit',
            interfaceSchemaRef: { inline: { type: 'object' } },
            cardinality: case_.sdkHookCardinality,
          },
        ],
      },
      targetVariants: [],
      ...(case_.sdkLifecycle === 'paired'
        ? {
            technicalInit: { module: sdkArtifact, exportName: 'technicalInit' },
            technicalDispose: { module: sdkArtifact, exportName: 'technicalDispose' },
          }
        : { technicalInit: { module: sdkArtifact, exportName: 'technicalInit' } }),
    });

    const kdpManifest = manifest('kdp-kernel', '1.0.0', {
      layer: 'kernel',
      role: 'primary',
      dependsOn: case_.kdpDependsOn,
      exports: [{ interfaceId: 'kernel.api' }],
    });

    const aaaManifest = manifest('aaa-ext', '1.0.0', {
      layer: 'business',
      role: 'extension',
      contributesTo: aaaContributesTo,
    });

    const extManifest = manifest('orders-ext', '1.0.0', {
      layer: 'business',
      role: 'extension',
      contributesTo: [
        { ownerPackageId: 'sdk-core', hookId: 'audit', entry: { module: auditModule, exportName: 'audit' } },
      ],
    });

    const appDescriptor = descriptor({
      target: case_.descriptorTarget,
      roots: {
        kernelPrimary: { package: 'kdp-kernel', version: '1.0.0' },
        sdkPrimary: { package: 'sdk-core', version: '1.0.0' },
        businessPrimary: { package: 'orders-business', version: '1.0.0' },
      },
      extensions: [
        { package: 'orders-ext', version: '1.0.0' },
        { package: 'aaa-ext', version: '1.0.0' },
      ],
      businessAppInit: initRef,
      ingress: case_.ingress.length > 0 ? case_.ingress : [{ id: 'evaluate', function: evaluateRef }],
    });

    const input: V011BuildInput = {
      descriptor: appDescriptor,
      packages: [businessManifest, sdkManifest, kdpManifest, aaaManifest, extManifest],
      packageRoots: ws.packageRoots,
      packageArtifacts: {
        'orders-business': 'dist/business.mjs',
        'sdk-core': 'dist/sdk.mjs',
        'kdp-kernel': 'dist/kdp.mjs',
        'aaa-ext': 'dist/aaa.mjs',
        'orders-ext': 'dist/ext.mjs',
      },
      kdpArtifact: { packageId: '@kaicreator/domain-harness-microkernel', path: 'dist/v011/index.js' },
    };
    return { input, refs: { evaluateRef, initRef } };
  }

  return case_;
}
