// SX wave #458 build-host fixture compiler. Runs under tsx in the repo
// workspace AFTER `npm run build` (the public compiler import below resolves
// '@kaicreator/domain-harness/v2' through the workspace dist). Everything the
// real device app consumes is produced here through the PUBLIC compiler entry
// (`compileDomainPackage`) or the public identity seam
// (`computeCompiledPackageId`) — the device never hand-types a manifest.
//
// Outputs one JSON document on stdout: successor package, retained 0.2/2/2
// package, build-time negative-compile facts, packageId material-sensitivity
// facts, the shared data-only schema corpus and canonical digest vectors.
import { createHash } from 'node:crypto';
import {
  compileDomainPackage,
  PUBLIC_COMPILER_OUTPUT_PROFILE,
} from '../../../packages/domain-harness-compiler/src/index.js';
import type {
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawToolDefinition,
  RawWorkflow,
  TargetHostProfile,
} from '../../../packages/domain-harness-compiler/src/raw/types.js';
import type { DomainDataCompileEntry, BusinessSourceCompileEntry } from '../../../packages/domain-harness-compiler/src/index.js';
import { computeCompiledPackageId } from '../../../packages/domain-harness/src/package/validation.js';

const sha256 = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const CAP_CRYPTO = 'crypto-hash-sha256@1';
const CAP_MODULE = 'compiled-package-module@1';
const CAP_INVENTORY = 'inventory-native@1';
export const BINDING_INVENTORY = 'sx-inventory-native-v1';

export const BINDING_CONTENTS: Readonly<Record<string, string>> = {
  'sx-sha256-v1': 'successor expo host sha256 adapter artifact',
  'sx-module-v1': 'successor expo host compiled module loader artifact',
  [BINDING_INVENTORY]: 'successor expo host inventory adapter artifact',
};

export const PACKAGE_BOUNDS = {
  maxDomainDataEntries: 16,
  maxDomainDataEntryCanonicalBytes: 2048,
  maxTotalDomainDataCanonicalBytes: 8192,
  maxBusinessSources: 8,
  maxSchemaCanonicalBytes: 4096,
} as const;

/** Host maxima the device runtime declares; strictly above package bounds. */
export const HOST_MAXIMA = {
  maxDomainDataEntries: 32,
  maxDomainDataEntryCanonicalBytes: 4096,
  maxTotalDomainDataCanonicalBytes: 16384,
  maxBusinessSources: 32,
  maxSchemaCanonicalBytes: 8192,
} as const;

const target: TargetHostProfile = {
  id: 'successor-expo-host@1',
  capabilities: [CAP_CRYPTO, CAP_MODULE, CAP_INVENTORY],
  bindings: {
    [CAP_CRYPTO]: 'sx-sha256-v1',
    [CAP_MODULE]: 'sx-module-v1',
    [CAP_INVENTORY]: BINDING_INVENTORY,
  },
  packageDataBounds: { ...PACKAGE_BOUNDS },
};

const inventoryTool: RawToolDefinition = {
  toolId: 'inventory.reserve',
  inputSchema: { type: 'object', additionalProperties: true },
  outputSchema: { type: 'object', additionalProperties: true },
  effect: 'idempotent',
  executionKind: 'host-local-domain-tool@1',
  bindingCapability: CAP_INVENTORY,
  requiredCapabilities: [CAP_INVENTORY],
};

interface WorkflowSpec {
  readonly workflowId: string;
  readonly effectTarget?: string;
  readonly messageType?: string;
  readonly payloadExpression?: string;
  readonly contractVersion?: string;
  readonly rejected?: readonly { readonly target: string; readonly when?: string }[];
  readonly tool?: RawToolDefinition;
  readonly simple?: boolean;
  readonly notifySchema?: Record<string, unknown>;
}

function rawWorkflow(spec: WorkflowSpec): [string, RawWorkflow] {
  const id = spec.workflowId;
  if (spec.simple === true) {
    const events: Record<string, { routes: { target: string }[]; schema?: Record<string, unknown> }> = {
      BEGIN: { routes: [{ target: 'done' }] },
      NOTIFY: { routes: [{ target: 'done' }], ...(spec.notifySchema === undefined ? {} : { schema: spec.notifySchema }) },
    };
    return [id, {
      id,
      sourcePath: `/authoring/${id}.yaml`,
      initial: 'start',
      states: {
        start: { id: 'start', final: false, done: [], error: [], events },
        done: { id: 'done', final: true, done: [], error: [], events: {} },
      },
    } as never];
  }
  const rejected = spec.rejected ?? [{ target: 'rejected' }];
  return [id, {
    id,
    sourcePath: `/authoring/${id}.yaml`,
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        done: [],
        error: [],
        events: { BEGIN: { routes: [{ target: 'acting' }] } },
      },
      acting: {
        id: 'acting',
        final: false,
        ...(spec.tool === undefined ? {} : { invoke: { kind: 'tool', ref: spec.tool.toolId } as never }),
        done: [{ target: 'done' }],
        error: [],
        events: {},
        effects: [{
          kind: 'domain-message',
          targetExpression: spec.effectTarget ?? '$.child',
          messageType: spec.messageType ?? 'NOTIFY',
          ...(spec.payloadExpression === undefined ? {} : { payloadExpression: spec.payloadExpression }),
          ...(spec.contractVersion === undefined ? {} : { contractVersion: spec.contractVersion }),
          rejected,
        }],
      },
      done: { id: 'done', final: true, done: [], error: [], events: {} },
      rejected: { id: 'rejected', final: true, done: [], error: [], events: {} },
    },
  } as never];
}

function rawPackage(workflows: readonly WorkflowSpec[]): LoadedRawDomainPackage {
  return {
    root: '/successor-expo-fixture',
    schemaVersion: '0.1',
    domainId: 'successor-expo.domain',
    limits: { maxSteps: 16 },
    workflows: new Map(workflows.map((spec) => rawWorkflow(spec))),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(workflows.map((spec) => [spec.workflowId, []])),
  };
}

const domainData: readonly DomainDataCompileEntry[] = [
  { key: 'tier', value: { level: 1 }, valueSchema: { type: 'object', properties: { level: { type: 'number' } }, additionalProperties: false } },
];

const businessSources: readonly BusinessSourceCompileEntry[] = [
  { source: 'crm', valueSchema: { type: 'object', additionalProperties: true } },
];

const projections = [
  {
    projectionId: 'overview',
    expression: '$',
    dependencies: [
      { kind: 'domain-data', key: 'tier' },
      // Business dependency selector: the runtime resolves business
      // dependencies through a single `{ key }` selector (query key fallback
      // when omitted); any other key is rejected as invalid_selector.
      { kind: 'business', source: 'crm', selector: { key: 'acc-1' } },
    ],
    outputSchema: { type: 'object', additionalProperties: true },
  },
];

function compileMain(workflows: readonly WorkflowSpec[], over: {
  readonly domainData?: readonly DomainDataCompileEntry[];
  readonly target?: TargetHostProfile;
} = {}) {
  return compileRaw(rawPackage(workflows), over);
}

function compileRaw(raw: LoadedRawDomainPackage, over: {
  readonly domainData?: readonly DomainDataCompileEntry[];
  readonly target?: TargetHostProfile;
  readonly projections?: readonly RawProjectionDefinition[];
} = {}) {
  return compileDomainPackage({
    raw,
    domainVersion: '1.0.0-successor-expo',
    target: over.target ?? target,
    bindingContents: BINDING_CONTENTS,
    tools: [inventoryTool],
    projections: over.projections ?? projections,
    domainData: over.domainData ?? domainData,
    businessSources,
  });
}

const TIER_ENTRY = { key: 'tier', value: { level: 1 }, valueSchema: { type: 'object', properties: { level: { type: 'number' } }, additionalProperties: false } };
const REGION_ENTRY = { key: 'region', value: { zone: 'eu' }, valueSchema: { type: 'object', properties: { zone: { type: 'string' } }, additionalProperties: false } };
const REGION_PROJECTIONS = [
  ...projections,
  {
    projectionId: 'regions',
    expression: '$',
    dependencies: [{ kind: 'domain-data', key: 'region' }],
    outputSchema: { type: 'object', additionalProperties: true },
  },
];

const MAIN_WORKFLOWS: readonly WorkflowSpec[] = [
  { workflowId: 'parent', tool: inventoryTool, payloadExpression: '$' },
  { workflowId: 'child', simple: true },
  { workflowId: 'strict-parent', effectTarget: '$.strictChild', payloadExpression: '$' },
  { workflowId: 'strict-child', simple: true, notifySchema: { type: 'object', required: ['orderId'], additionalProperties: false } },
  { workflowId: 'ghost-parent', effectTarget: '$.ghostChild', payloadExpression: '$' },
  { workflowId: 'missing-parent', effectTarget: '$.missingChild', payloadExpression: '$' },
  { workflowId: 'version-parent', effectTarget: '$.child', payloadExpression: '$', contractVersion: '2' },
  { workflowId: 'tool-parent', tool: inventoryTool, effectTarget: '$.toolChild', payloadExpression: '$' },
];

const main = compileMain(MAIN_WORKFLOWS);

// --- retained (0.2,2,2) package: hand-built engine-2 manifest through the
// public identity seam (the retained historical path; the successor compiler
// is not required to emit legacy packages).
const legacyManifest = {
  formatVersion: '0.2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
  domainId: 'successor-expo.retained-legacy',
  domainVersion: '1.0.0-retained',
  packageId: 'pending',
  targetProfileId: 'successor-expo-host@1',
  requiredCapabilities: [],
  workflows: {
    retained: {
      workflowId: 'retained',
      definition: {
        initial: 'idle',
        states: {
          idle: {
            final: false,
            done: [],
            error: [],
            events: { ADVANCE: { routes: [{ target: 'finished' }] } },
          },
          finished: { final: true, done: [], error: [], events: {} },
        },
        limits: { maxSteps: 8 },
      },
      messageContracts: { ADVANCE: { type: 'ADVANCE', payloadSchema: {} } },
    },
  },
  tools: {},
  projections: {},
  schemas: {},
  bindingDigests: {},
};

// --- build-time facts (each verified again on-device where the surface is
// device-reachable; build facts are evidence, not device substitutes) -------
const buildFacts: Record<string, unknown> = {};

function compileErrorOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
}

buildFacts.profile = PUBLIC_COMPILER_OUTPUT_PROFILE;
buildFacts.rejectsMissingRejectedRoutes = compileErrorOf(() => {
  const raw = rawPackage([{ workflowId: 'parent' }]);
  raw.workflows.get('parent')!.states.acting!.effects = [
    { kind: 'domain-message', targetExpression: '$.child', messageType: 'NOTIFY', payloadExpression: '$' },
  ];
  compileRaw(raw);
});
buildFacts.rejectsNonTotalRejectedRoutes = compileErrorOf(() =>
  compileMain([{ workflowId: 'parent', rejected: [{ target: 'rejected', when: '$.never' }] }]));
buildFacts.rejectsUnknownRejectedTarget = compileErrorOf(() =>
  compileMain([{ workflowId: 'parent', rejected: [{ target: 'nowhere' }] }]));

// packageId material sensitivity (SX-E04 build half): semantic material
// changes the identity, irrelevant ordering does not.
const variantA = compileMain(MAIN_WORKFLOWS);
const variantB = compileMain(MAIN_WORKFLOWS, {
  domainData: [{ key: 'tier', value: { level: 2 }, valueSchema: { type: 'object', properties: { level: { type: 'number' } }, additionalProperties: false } }],
});
buildFacts.domainDataValueChangeGivesDifferentPackageId =
  variantA.manifest.packageId !== variantB.manifest.packageId;

const twoEntryA = compileMain(MAIN_WORKFLOWS, {
  domainData: [TIER_ENTRY, REGION_ENTRY],
  projections: REGION_PROJECTIONS,
});
const twoEntryB = compileMain(MAIN_WORKFLOWS, {
  domainData: [REGION_ENTRY, TIER_ENTRY],
  projections: REGION_PROJECTIONS,
});
buildFacts.domainDataOrderingDoesNotChangePackageId =
  twoEntryA.manifest.packageId === twoEntryB.manifest.packageId;

const boundsVariant = compileMain(MAIN_WORKFLOWS, {
  target: { ...target, packageDataBounds: { ...PACKAGE_BOUNDS, maxDomainDataEntries: 17 } },
});
buildFacts.boundsChangeGivesDifferentPackageId =
  variantA.manifest.packageId !== boundsVariant.manifest.packageId;

// Domain Data fail-closed compile errors (L2-A §3.6/§3.7).
buildFacts.rejectsOrphanDomainDataKey = compileErrorOf(() =>
  compileMain(MAIN_WORKFLOWS, {
    domainData: [
      ...domainData,
      { key: 'orphan', value: { x: 1 }, valueSchema: { type: 'object', additionalProperties: true } },
    ],
  }));
buildFacts.rejectsDuplicateDomainDataKey = compileErrorOf(() =>
  compileMain(MAIN_WORKFLOWS, {
    domainData: [
      ...domainData,
      { key: 'tier', value: { level: 2 }, valueSchema: { type: 'object', additionalProperties: true } },
    ],
  }));
buildFacts.rejectsValueViolatingValueSchema = compileErrorOf(() =>
  compileMain(MAIN_WORKFLOWS, {
    domainData: [{ key: 'tier', value: { level: 'not-a-number' }, valueSchema: { type: 'object', properties: { level: { type: 'number' } }, additionalProperties: false } }],
  }));

// --- shared data-only schema corpus (domainharness-json-schema/1) ----------
const DRAFT = 'https://json-schema.org/draft/2020-12/schema';
const schemaCorpus = [
  { id: 'sx-s01-object-basic-accept', schema: { type: 'object', properties: { a: { type: 'integer' } }, required: ['a'] }, instance: { a: 1 }, expect: 'accept' },
  { id: 'sx-s02-integer-float-reject', schema: { type: 'object', properties: { a: { type: 'integer' } } }, instance: { a: 1.5 }, expect: 'reject:INSTANCE_VALIDATION_FAILED' },
  { id: 'sx-s03-nested-array-accept', schema: { type: 'object', properties: { list: { type: 'array', items: { type: 'number' } } } }, instance: { list: [1, 2, 3] }, expect: 'accept' },
  { id: 'sx-s04-array-mixed-reject', schema: { type: 'object', properties: { list: { type: 'array', items: { type: 'number' } } } }, instance: { list: [1, 'x'] }, expect: 'reject:INSTANCE_VALIDATION_FAILED' },
  { id: 'sx-s05-schema-draft-uri-accept', schema: { $schema: DRAFT, type: 'string' }, instance: 'ok', expect: 'accept' },
  { id: 'sx-s06-schema-wrong-draft-reject', schema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'string' }, instance: 'ok', expect: 'reject:INVALID_SCHEMA_CONTRACT' },
  { id: 'sx-s07-local-ref-accept', schema: { type: 'object', $defs: { child: { type: 'integer' } }, properties: { c: { $ref: '#/$defs/child' } } }, instance: { c: 7 }, expect: 'accept' },
  { id: 'sx-s08-custom-keyword-reject', schema: { type: 'object', xCustom: true }, instance: {}, expect: 'reject:INVALID_SCHEMA_CONTRACT' },
  { id: 'sx-s09-format-annotation-accept', schema: { type: 'string', format: 'date-time' }, instance: 'not-a-date', expect: 'accept' },
  { id: 'sx-s10-vocabulary-reject', schema: { $schema: DRAFT, $vocabulary: { 'https://example.com/v': true }, type: 'string' }, instance: 'x', expect: 'reject:INVALID_SCHEMA_CONTRACT' },
  { id: 'sx-s11-external-ref-reject', schema: { type: 'object', properties: { c: { $ref: 'https://example.com/remote.schema.json' } } }, instance: { c: 1 }, expect: 'reject:INVALID_SCHEMA_CONTRACT' },
  { id: 'sx-s12-const-accept', schema: { const: 'fixed' }, instance: 'fixed', expect: 'accept' },
  { id: 'sx-s13-const-reject', schema: { const: 'fixed' }, instance: 'other', expect: 'reject:INSTANCE_VALIDATION_FAILED' },
  { id: 'sx-s14-root-type-mismatch-reject', schema: { type: 'integer' }, instance: 'text', expect: 'reject:INSTANCE_VALIDATION_FAILED' },
];

// --- canonical digest vectors (SX-E01/E04) ---------------------------------
// The digests are computed over the CANONICAL form of the vector material
// (recursively key-sorted JSON, arrays preserved) exactly like the device-side
// core `canonicalJsonStringify`; non-JSON texts digest raw UTF-8 bytes. This
// is what makes d04/d05 (same object, different key order) digest-equal.
const canonicalVectors = [
  { id: 'sx-d01-empty', text: '' },
  { id: 'sx-d02-abc', text: 'abc' },
  { id: 'sx-d03-unicode', text: 'héllo→世界' },
  { id: 'sx-d04-key-order-a', text: JSON.stringify({ a: 1, b: 2 }) },
  { id: 'sx-d05-key-order-b', text: JSON.stringify({ b: 2, a: 1 }) },
];
function canonicalVectorMaterial(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object') {
      const sortKeys = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(sortKeys);
        if (value !== null && typeof value === 'object') {
          return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = sortKeys((value as Record<string, unknown>)[key]);
            return acc;
          }, {});
        }
        return value;
      };
      return JSON.stringify(sortKeys(parsed));
    }
  } catch {
    // not JSON: digest the raw text
  }
  return text;
}
const canonicalDigests = Object.fromEntries(
  canonicalVectors.map((vector) => [vector.id, createHash('sha256').update(canonicalVectorMaterial(vector.text), 'utf8').digest('hex')]),
);

const legacyPackageId = await computeCompiledPackageId(legacyManifest, sha256);

process.stdout.write(JSON.stringify({
  successor: {
    packageId: main.manifest.packageId,
    manifest: main.manifest,
    domainData: main.domainData,
    requiredBindingIds: main.requiredBindingIds,
  },
  retained: {
    packageId: legacyPackageId,
    manifest: { ...legacyManifest, packageId: legacyPackageId },
  },
  buildFacts,
  schemaCorpus,
  canonicalVectors,
  canonicalDigests,
  bounds: { package: PACKAGE_BOUNDS, host: HOST_MAXIMA },
  bindingContents: BINDING_CONTENTS,
  inventoryBindingId: BINDING_INVENTORY,
}));
process.stdout.write('\n');
