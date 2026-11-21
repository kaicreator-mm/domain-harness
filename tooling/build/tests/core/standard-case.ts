// BUILD 正反例：只有符合当前契约的资源才能进入 Lock。
import { canonicalJson } from '@kaicreator/domain-harness-contracts';
import type {
  DomainPackageManifest,
  ElementDefinition,
  ElementVisibility,
  FunctionRef,
  JsonValue,
  TargetSelector,
} from '@kaicreator/domain-harness-contracts';
import type { BuildInput } from '../../src/index.js';
import {
  DH_ELEMENT_SCHEMA_VERSION,
  addPackage,
  makeWorkspace,
  manifest,
  descriptor,
  functionRefOf,
  elementRefOf,
  writeJson,
  writeRaw,
  writeCanonicalJson,
  type Workspace,
} from './fixtures.js';

export interface StandardRefs {
  evaluateRef: FunctionRef;
  initRef: FunctionRef;
}

/** 测试夹具需要构造合法或非法变体；只展开合同对象，在递归 JsonValue 边界停止。 */
type Mutable<T> = [JsonValue] extends [T]
  ? T
  : T extends readonly (infer U)[]
    ? Mutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: Mutable<T[K]> }
      : T;

const TARGET_22: TargetSelector = { runtime: 'node', module: 'esm', nodeMajor: 22 };

function requireValue(value: JsonValue | undefined, key: string): JsonValue {
  if (value === undefined) throw new Error(`fixture: no extraElementFileValues for ${key}`);
  return value;
}

export interface StandardCase {
  ws: Workspace;
  faq: Mutable<ElementDefinition>;
  eligibility: Mutable<ElementDefinition>;
  legacyPrompt: Mutable<ElementDefinition>;
  appMain: Mutable<ElementDefinition>;
  extraElements: ElementDefinition[];
  extraElementFileValues: Record<string, JsonValue>;
  extraElementRawFiles: Record<string, Uint8Array>;
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
  finalize(): { input: BuildInput; refs: StandardRefs };
}

export function standardCase(): StandardCase {
  const ws = makeWorkspace();

  const faq: Mutable<ElementDefinition> = {
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

  const eligibility: Mutable<ElementDefinition> = {
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

  const legacyPrompt: Mutable<ElementDefinition> = {
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

  const appMain: Mutable<ElementDefinition> = {
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
      {
        id: 'exit', contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'object' } },
        outcomes: ['SUCCEEDED', 'FAILED'], effects: 'none',
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
      { interfaceId: 'orders.api' },
    ],
    sdkImports: [],
    sdkHookCardinality: 'multi',
    aaaContributesTo: [],
    businessDependsOn: [
      { package: 'sdk-core', version: '1.0.0', interface: 'sdk.api' },
      { package: 'orders-ext', version: '1.0.0', interface: 'orders.audit' },
      { package: 'aaa-ext', version: '1.0.0', interface: 'aaa.audit' },
    ],
    kdpDependsOn: [],
    sdkLifecycle: 'paired',
    descriptorTarget: { ...TARGET_22 },
    finalize,
  };

  function finalize(): { input: BuildInput; refs: StandardRefs } {
    const businessDir = addPackage(ws, 'orders-business');
    const sdkDir = addPackage(ws, 'sdk-core');
    const kdpDir = addPackage(ws, 'kdp-kernel');
    const aaaDir = addPackage(ws, 'aaa-ext');
    const extDir = addPackage(ws, 'orders-ext');

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
    const entries: DomainPackageManifest['elements'][number][] = [];
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

    const evaluateModule = writeRaw(businessDir, 'dist/evaluate.mjs', new TextEncoder().encode('export function evaluate() { return { decision: "POS" }; }\n'));
    const evaluateLegacyModule = writeRaw(businessDir, 'dist/evaluate-node20.mjs', new TextEncoder().encode('export function evaluate() { return { decision: "LEGACY" }; }\n'));
    writeRaw(businessDir, 'dist/init.mjs', new TextEncoder().encode('export function init() { return "ready"; }\n'));
    const businessArtifact = writeRaw(businessDir, 'dist/business.mjs', new TextEncoder().encode("export const artifact = \"orders-business\";\nexport function init() { return { status: \"READY\" }; }\nexport function exit() {}\n"));
    const sdkArtifact = writeRaw(sdkDir, 'dist/sdk.mjs', new TextEncoder().encode("export const artifact = \"sdk-core\";\nexport function init() {}\nexport function exit() {}\n"));
    const kdpArtifact = writeRaw(kdpDir, 'dist/kdp.mjs', new TextEncoder().encode("export const artifact = \"kdp-kernel\";\nexport function init() {}\nexport function exit() {}\n"));
    const aaaArtifact = writeRaw(aaaDir, 'dist/aaa.mjs', new TextEncoder().encode("export const artifact = \"aaa-ext\";\nexport function init() {}\nexport function exit() {}\nexport function audit() {}\n"));
    const auditModule = writeRaw(extDir, 'dist/audit.mjs', new TextEncoder().encode('export function audit() {}\n'));
    const extArtifact = writeRaw(extDir, 'dist/ext.mjs', new TextEncoder().encode("export const artifact = \"orders-ext\";\nexport function init() {}\nexport function exit() {}\n"));
    writeRaw(kdpDir, 'dist/index.js', new TextEncoder().encode('export async function bootstrap() { return { status: "BOOTED" }; }\n'));
    for (const [dir, id, artifactPath] of [
      [businessDir, 'orders-business', 'dist/business.mjs'],
      [sdkDir, 'sdk-core', 'dist/sdk.mjs'],
      [aaaDir, 'aaa-ext', 'dist/aaa.mjs'],
      [extDir, 'orders-ext', 'dist/ext.mjs'],
    ] as const) {
      writeRaw(dir, 'package.json', new TextEncoder().encode(canonicalJson({
        name: id, version: '1.0.0', type: 'module', exports: { '.': `./${artifactPath}` },
      })));
    }
    writeRaw(kdpDir, 'package.json', new TextEncoder().encode(canonicalJson({
      name: 'kdp-kernel', version: '1.0.0', type: 'module', exports: { '.': './dist/index.js' },
    })));

    // 同一个 Element/Function/Target identity 构建所有 Package 的生命周期合同。
    const lifecycle = (packageId: string, dir: string, artifact: ReturnType<typeof writeRaw>,
      other: readonly { id: string; module: ReturnType<typeof writeRaw> }[] = []) => {
      const definition: ElementDefinition = {
        kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
        id: `${packageId}.lifecycle`, version: '1.0.0',
        description: 'Package-owned lifecycle and selected Hook Functions.',
        content: [],
        functions: ['init', 'exit', ...other.map((fn) => fn.id)].map((id) => ({
          id, contractVersion: '1',
          inputSchemaRef: { inline: { type: 'object' } },
          outputSchemaRef: { inline: { type: 'object' } },
          outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] as const, effects: 'none' as const,
        })),
      };
      const definitionRef = writeJson(dir, 'definitions/lifecycle.json', definition as unknown as JsonValue);
      const entry = { id: definition.id, version: definition.version, definitionRef, visibility: 'public' as const };
      const implementations = definition.functions.map((fn) => ({
        elementId: definition.id, functionId: fn.id, contractVersion: fn.contractVersion,
        entry: { module: other.find((item) => item.id === fn.id)?.module ?? artifact, exportName: fn.id },
      }));
      return { definition, entry, ref: elementRefOf(definition),
        variants: [{ target: { ...TARGET_22 }, implementations }] };
    };
    const sdkLife = lifecycle('sdk-core', sdkDir, sdkArtifact);
    const kdpLife = lifecycle('kdp-kernel', kdpDir, kdpArtifact);
    const aaaLife = lifecycle('aaa-ext', aaaDir, aaaArtifact,
      [{ id: 'audit', module: aaaArtifact }]);
    const extLife = lifecycle('orders-ext', extDir, extArtifact,
      [{ id: 'audit', module: auditModule }]);
    const aaaContributesTo = case_.aaaContributesTo.map((contribution) => ({
      ownerPackageId: contribution.ownerPackageId,
      hookId: contribution.hookId,
      function: functionRefOf(aaaLife.definition, 'audit'),
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
      order: 2,
      init: elementRefOf(appMain),
      exit: elementRefOf(appMain),
      elements: entries,
      dependsOn: case_.businessDependsOn,
      exports: case_.businessExports,
      targetVariants: [
        {
          target: { ...TARGET_22 },
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
              entry: { module: businessArtifact, exportName: 'init' },
            },
            {
              elementId: 'orders.app-main', functionId: 'exit', contractVersion: '1',
              entry: { module: businessArtifact, exportName: 'exit' },
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
      order: 1,
      init: sdkLife.ref,
      elements: [sdkLife.entry],
      dependsOn: [
        { package: 'kdp-kernel', version: '1.0.0', interface: 'kernel.api' },
        { package: 'orders-ext', version: '1.0.0', interface: 'orders.audit' },
        ...(case_.aaaContributesTo.length > 0
          ? [{ package: 'aaa-ext', version: '1.0.0', interface: 'aaa.audit' }] : []),
      ],
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
      targetVariants: sdkLife.variants,
      ...(case_.sdkLifecycle === 'paired' ? { exit: sdkLife.ref } : {}),
    });

    const kdpManifest = manifest('kdp-kernel', '1.0.0', {
      layer: 'kernel',
      role: 'primary',
      order: 0,
      init: kdpLife.ref,
      exit: kdpLife.ref,
      elements: [kdpLife.entry],
      targetVariants: kdpLife.variants,
      dependsOn: case_.kdpDependsOn,
      exports: [{ interfaceId: 'kernel.api' }],
    });

    const aaaManifest = manifest('aaa-ext', '1.0.0', {
      layer: 'business',
      role: 'extension',
      init: aaaLife.ref,
      exit: aaaLife.ref,
      elements: [aaaLife.entry],
      targetVariants: aaaLife.variants,
      exports: [{ interfaceId: 'aaa.audit' }, { elementId: aaaLife.definition.id, functionId: 'audit' }],
      contributesTo: aaaContributesTo,
    });

    const extManifest = manifest('orders-ext', '1.0.0', {
      layer: 'business',
      role: 'extension',
      init: extLife.ref,
      exit: extLife.ref,
      elements: [extLife.entry],
      targetVariants: extLife.variants,
      exports: [{ interfaceId: 'orders.audit' }, { elementId: extLife.definition.id, functionId: 'audit' }],
      contributesTo: [
        { ownerPackageId: 'sdk-core', hookId: 'audit', function: functionRefOf(extLife.definition, 'audit') },
      ],
    });

    const appDescriptor = descriptor({
      target: case_.descriptorTarget,
      roots: {
        kernelPrimary: { package: 'kdp-kernel', version: '1.0.0' },
        cores: [
          { package: 'sdk-core', version: '1.0.0' },
          { package: 'orders-business', version: '1.0.0' },
        ],
      },
      extensions: [
        { package: 'orders-ext', version: '1.0.0' },
        { package: 'aaa-ext', version: '1.0.0' },
      ],
    });

    const input: BuildInput = {
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
      kdpArtifact: { packageId: 'kdp-kernel', path: 'dist/index.js' },
      runtimeDependencies: { '@kaicreator/domain-harness-microkernel': '0.11.0' },
    };
    return { input, refs: { evaluateRef, initRef } };
  }

  return case_;
}
