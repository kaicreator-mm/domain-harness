import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DH_APP_SCHEMA_VERSION,
  DH_DOMAIN_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
  DH_PACKAGE_SCHEMA_VERSION,
  buildV011App,
  boot,
  canonicalJson,
  contentDigestOf,
  validateDomainDefinition,
  validateElementDefinition,
} from '@kaicreator/domain-harness';

const consumerRoot = process.cwd();
const evidenceDir = process.env.DH_T05_EVIDENCE ?? join(consumerRoot, 'evidence');
const eventsPath = join(evidenceDir, 'consumer-events.ndjson');
await mkdir(evidenceDir, { recursive: true });
await writeFile(eventsPath, '');
const events = [];
const installRoots = new Set();
async function evidence(step, detail = {}) {
  const event = { step, ...detail };
  events.push(event);
  await appendFile(eventsPath, `${JSON.stringify(event)}\n`);
}
function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
async function fileDigest(path) {
  return digest(await readFile(path));
}
async function write(root, relative, content) {
  const path = join(root, ...relative.split('/'));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}
function manifest(id, options) {
  return {
    kind: 'DomainPackage', schemaVersion: DH_PACKAGE_SCHEMA_VERSION,
    id, version: '1.0.0', elements: [], dependsOn: [], imports: [], exports: [],
    contributesTo: [], targetVariants: [], ...options,
  };
}
function lifecycleModule(packageId) {
  return `
const events = (globalThis.__v011T05Events ??= []);
events.push({ event: 'module-evaluated', package: '${packageId}' });
export async function technicalInit() { events.push({ event: 'technical-init', package: '${packageId}' }); }
export async function technicalDispose() { events.push({ event: 'technical-dispose', package: '${packageId}' }); }
`;
}
function rulesModule() {
  return `
const events = (globalThis.__v011T05Events ??= []);
events.push({ event: 'module-evaluated', package: 'rules-package-entry' });
let RULE = null;
export function initializeRule(rule) { RULE = rule; }
export function evaluate(input) {
  if (RULE === null) return { kind: 'UNKNOWN', unknownReason: { code: 'RULE_NOT_INITIALIZED', message: 'selected rule was not initialized' } };
  if (!RULE.regions.includes(input.region)) return { kind: 'UNKNOWN', unknownReason: { code: 'REGION_UNKNOWN', message: 'region is absent from the selected rule' } };
  return { kind: 'SUCCEEDED', value: { decision: input.total >= RULE.minOrderTotal ? 'POS' : 'NEG', via: 'rules-package/evaluate' } };
}
export function optionalReport() { return { kind: 'SUCCEEDED', value: 'optional-report-ok' }; }
`;
}
function businessModule(withUnsupportedEffect) {
  return `
import { evaluate, initializeRule } from 'rules-package/rules';
const events = (globalThis.__v011T05Events ??= []);
events.push({ event: 'module-evaluated', package: 'app-business-entry' });
export async function businessAppInit(ctx) {
  const handle = ctx.resources.get('rules-package/content/rules.json');
  if (handle === undefined) throw new Error('selected rule resource is not sealed');
  const rule = JSON.parse(Buffer.from(await handle.read()).toString('utf8'));
  initializeRule(rule);
  events.push({ event: 'business-init', package: 'app-business', minOrderTotal: rule.minOrderTotal });
  return { status: 'READY' };
}
export function submit(input) { return evaluate(input); }
${withUnsupportedEffect ? "export function dangerous() { return { kind: 'SUCCEEDED', value: 'must-not-run' }; }" : ''}
`;
}
function fn(id, input, output, effects = 'none') {
  return {
    id, contractVersion: '1', inputSchemaRef: { inline: input }, outputSchemaRef: { inline: output },
    outcomes: ['SUCCEEDED', 'UNKNOWN'], effects,
  };
}
const decisionSchema = {
  type: 'object', required: ['decision', 'via'],
  properties: { decision: { enum: ['POS', 'NEG', 'UNKNOWN'] }, via: { type: 'string' } },
};
const evaluateInput = {
  type: 'object', required: ['total', 'region'],
  properties: { total: { type: 'number' }, region: { type: 'string' } },
};

async function authoring(label, rule, options = {}) {
  const root = await mkdtemp(join(consumerRoot, `authoring-${label}-`));
  const dirs = {};
  for (const id of ['kernel-primary', 'kernel-extension', 'sdk-primary', 'sdk-extension', 'rules-package', 'app-business']) {
    dirs[id] = join(root, id);
    await mkdir(dirs[id], { recursive: true });
  }
  const artifacts = {};
  for (const id of Object.keys(dirs)) {
    artifacts[id] = await write(dirs[id], 'dist/index.mjs', lifecycleModule(id));
  }
  const rulesEntry = await write(dirs['rules-package'], 'dist/rules.mjs', rulesModule());
  const businessEntry = await write(dirs['app-business'], 'dist/app.mjs', businessModule(options.unsupportedEffect === true));
  await write(dirs['rules-package'], 'package.json', JSON.stringify({
    name: 'rules-package', version: '1.0.0', type: 'module', exports: { './rules': './dist/rules.mjs' },
  }));
  await write(dirs['app-business'], 'package.json', JSON.stringify({ name: 'app-business', version: '1.0.0', type: 'module' }));
  const ruleText = canonicalJson(rule);
  await write(dirs['rules-package'], 'content/rules.json', ruleText);
  const ruleRef = { packageId: 'rules-package', path: 'content/rules.json', digest: await fileDigest(join(dirs['rules-package'], 'content/rules.json')) };

  const knowledge = {
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION, id: 'basic.knowledge', version: '1.0.0',
    description: 'Zero-function structured knowledge selected as a dependency.',
    content: [
      { id: 'architecture', contentKind: 'knowledge', schemaRef: { inline: { type: 'object' } }, required: true,
        value: { summary: 'Trusted prebuilt Domain App composition', revision: 1 } },
      { id: 'optional-unknown', contentKind: 'prompt', schemaRef: { inline: { type: 'object' } }, required: false,
        value: { note: 'unknown optional content is explicitly excluded' } },
    ],
    functions: [],
  };
  const rules = {
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION, id: 'basic.rules', version: '1.0.0',
    description: 'Two Functions consume the same selected structured rule.',
    content: [{ id: 'selected-rule', contentKind: 'rule', schemaRef: { inline: { type: 'object', required: ['minOrderTotal', 'regions'] } }, required: true, ref: ruleRef }],
    functions: [fn('evaluate', evaluateInput, decisionSchema), fn('optionalReport', { type: 'object' }, { type: 'string' })],
  };
  const app = {
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION, id: 'basic.app', version: '1.0.0',
    description: 'Business Primary calls the public rule Function owned by another package.',
    content: [{ id: 'channel', contentKind: 'structured-data', schemaRef: { inline: { type: 'object' } }, required: true, value: { channel: 'basic-example' } }],
    functions: [
      fn('submit', evaluateInput, decisionSchema),
      fn('appInit', { type: 'object' }, { type: 'object' }),
      ...(options.unsupportedEffect === true ? [fn('dangerous', { type: 'object' }, { type: 'string' }, 'external')] : []),
    ],
    dependencies: [
      { element: 'basic.rules', version: '1.0.0', functions: ['evaluate', 'optionalReport'] },
      { element: 'basic.knowledge', version: '1.0.0' },
    ],
  };
  const definitions = { 'basic.knowledge': knowledge, 'basic.rules': rules, 'basic.app': app };
  const definitionRefs = {};
  for (const [id, definition] of Object.entries(definitions)) {
    const path = `elements/${id}.json`;
    await write(dirs[id === 'basic.app' ? 'app-business' : 'rules-package'], path, canonicalJson(definition));
    definitionRefs[id] = {
      packageId: id === 'basic.app' ? 'app-business' : 'rules-package', path,
      digest: await fileDigest(join(dirs[id === 'basic.app' ? 'app-business' : 'rules-package'], path)),
    };
  }
  const elementRef = (id) => ({
    namespace: 'basic', id, version: '1.0.0', digest: contentDigestOf(definitions[id]),
  });
  const functionRef = (element, functionId) => ({ element: elementRef(element), functionId, contractVersion: '1' });
  const refs = {
    evaluate: functionRef('basic.rules', 'evaluate'), optionalReport: functionRef('basic.rules', 'optionalReport'),
    submit: functionRef('basic.app', 'submit'), appInit: functionRef('basic.app', 'appInit'),
    dangerous: functionRef('basic.app', 'dangerous'),
  };
  const artifactRef = async (packageId, path) => ({ packageId, path, digest: await fileDigest(join(dirs[packageId], path)) });
  const artifactRefs = {};
  for (const id of Object.keys(dirs)) artifactRefs[id] = await artifactRef(id, 'dist/index.mjs');
  const rulesEntryRef = await artifactRef('rules-package', 'dist/rules.mjs');
  const businessEntryRef = await artifactRef('app-business', 'dist/app.mjs');
  const target = { runtime: 'node', module: 'esm', nodeMajor: 22 };
  const variant = (implementations) => [{ target, implementations }];
  const implementation = (elementId, functionId, module, exportName, resources) => ({
    elementId, functionId, contractVersion: '1', entry: { module, exportName }, ...(resources === undefined ? {} : { resources }),
  });
  const packages = [
    manifest('kernel-primary', {
      layer: 'kernel', role: 'primary', exports: [{ interfaceId: 'kernel.api' }],
      provides: { hooks: [{ id: 'audit', interfaceSchemaRef: { inline: { type: 'object' } }, cardinality: 'single' }] },
      technicalInit: { module: artifactRefs['kernel-primary'], exportName: 'technicalInit' },
      technicalDispose: { module: artifactRefs['kernel-primary'], exportName: 'technicalDispose' },
    }),
    manifest('kernel-extension', {
      layer: 'kernel', role: 'extension', dependsOn: [{ package: 'kernel-primary', version: '1.0.0', interface: 'kernel.api' }],
      contributesTo: [{ ownerPackageId: 'kernel-primary', hookId: 'audit', entry: { module: artifactRefs['kernel-extension'], exportName: 'auditHook' } }],
      technicalInit: { module: artifactRefs['kernel-extension'], exportName: 'technicalInit' },
      technicalDispose: { module: artifactRefs['kernel-extension'], exportName: 'technicalDispose' },
    }),
    manifest('sdk-primary', {
      layer: 'sdk', role: 'primary', dependsOn: [{ package: 'kernel-primary', version: '1.0.0', interface: 'kernel.api' }], exports: [{ interfaceId: 'sdk.api' }],
      technicalInit: { module: artifactRefs['sdk-primary'], exportName: 'technicalInit' },
      technicalDispose: { module: artifactRefs['sdk-primary'], exportName: 'technicalDispose' },
    }),
    manifest('sdk-extension', {
      layer: 'sdk', role: 'extension', dependsOn: [{ package: 'sdk-primary', version: '1.0.0', interface: 'sdk.api' }],
      technicalInit: { module: artifactRefs['sdk-extension'], exportName: 'technicalInit' },
      technicalDispose: { module: artifactRefs['sdk-extension'], exportName: 'technicalDispose' },
    }),
    manifest('rules-package', {
      layer: 'business', role: 'extension',
      elements: [
        { id: 'basic.knowledge', version: '1.0.0', definitionRef: definitionRefs['basic.knowledge'], visibility: 'public' },
        { id: 'basic.rules', version: '1.0.0', definitionRef: definitionRefs['basic.rules'], visibility: 'public' },
      ],
      exports: [{ elementId: 'basic.knowledge' }, { elementId: 'basic.rules' }, { interfaceId: 'rules.api' }],
      targetVariants: variant([
        implementation('basic.rules', 'evaluate', rulesEntryRef, 'evaluate', [ruleRef]),
        implementation('basic.rules', 'optionalReport', rulesEntryRef, 'optionalReport'),
      ]),
      technicalInit: { module: artifactRefs['rules-package'], exportName: 'technicalInit' },
      technicalDispose: { module: artifactRefs['rules-package'], exportName: 'technicalDispose' },
    }),
    manifest('app-business', {
      layer: 'business', role: 'primary', dependsOn: [{ package: 'rules-package', version: '1.0.0', interface: 'rules.api' }],
      elements: [{ id: 'basic.app', version: '1.0.0', definitionRef: definitionRefs['basic.app'], visibility: 'public' }],
      imports: [refs.evaluate, refs.optionalReport], exports: [{ elementId: 'basic.app' }, { interfaceId: 'business.api' }],
      targetVariants: variant([
        implementation('basic.app', 'submit', businessEntryRef, 'submit', [ruleRef]),
        implementation('basic.app', 'appInit', businessEntryRef, 'businessAppInit', [ruleRef]),
        ...(options.unsupportedEffect === true ? [implementation('basic.app', 'dangerous', businessEntryRef, 'dangerous')] : []),
      ]),
      technicalInit: { module: artifactRefs['app-business'], exportName: 'technicalInit' },
      technicalDispose: { module: artifactRefs['app-business'], exportName: 'technicalDispose' },
    }),
  ];
  // One real Hook provider. It is loaded/sealed by the Package System, not called as an ingress.
  await write(dirs['kernel-extension'], 'dist/index.mjs', `${lifecycleModule('kernel-extension')}\nexport function auditHook(value) { return value; }\n`);
  artifactRefs['kernel-extension'] = await artifactRef('kernel-extension', 'dist/index.mjs');
  packages[1].contributesTo[0].entry.module = artifactRefs['kernel-extension'];
  packages[1].technicalInit.module = artifactRefs['kernel-extension'];
  packages[1].technicalDispose.module = artifactRefs['kernel-extension'];

  const descriptor = {
    kind: 'DomainApp', schemaVersion: DH_APP_SCHEMA_VERSION, id: `basic.clean.${label}`, version: '1.0.0',
    target: options.unsupportedTarget === true ? { runtime: 'node', module: 'esm', nodeMajor: 20 } : target,
    roots: {
      kernelPrimary: { package: 'kernel-primary', version: '1.0.0' },
      sdkPrimary: { package: 'sdk-primary', version: '1.0.0' },
      businessPrimary: { package: 'app-business', version: '1.0.0' },
    },
    extensions: [
      { package: 'kernel-extension', version: '1.0.0' },
      { package: 'sdk-extension', version: '1.0.0' },
      { package: 'rules-package', version: '1.0.0' },
    ],
    businessAppInit: refs.appInit,
    ingress: [
      { id: 'submit', function: refs.submit },
      { id: 'optional-report', function: refs.optionalReport, optional: true },
      ...(options.unsupportedEffect === true ? [{ id: 'dangerous', function: refs.dangerous }] : []),
    ],
    config: { example: 'v011-basic-app' },
  };
  const input = {
    descriptor, packages,
    packageRoots: {
      ...dirs,
      '@kaicreator/domain-harness-microkernel': join(consumerRoot, 'node_modules', '@kaicreator', 'domain-harness-microkernel'),
    },
    packageArtifacts: Object.fromEntries(Object.keys(dirs).map((id) => [id, 'dist/index.mjs'])),
    kdpArtifact: { packageId: '@kaicreator/domain-harness-microkernel', path: 'dist/v011/index.js' },
  };
  return { root, dirs, input, descriptor, definitions, domainElements: [knowledge, rules, app], ruleRef, refs };
}

async function materialize(label, prepared, built) {
  const installRoot = await mkdtemp(join(consumerRoot, `install-${label}-`));
  installRoots.add(installRoot);
  for (const id of Object.keys(prepared.dirs)) await cp(prepared.dirs[id], join(installRoot, 'node_modules', id), { recursive: true });
  for (const id of ['@kaicreator/domain-harness-microkernel', '@kaicreator/domain-harness-contracts']) {
    await cp(join(consumerRoot, 'node_modules', ...id.split('/')), join(installRoot, 'node_modules', ...id.split('/')), { recursive: true });
  }
  await write(installRoot, 'descriptor/app.json', canonicalJson(prepared.descriptor));
  const lockBytes = built.lockBytes;
  await write(installRoot, 'dh-lock/app.lock.json', lockBytes);
  const lock = built.lock;
  // L2 §6.2.4 / §8.5.3: THIS acceptance script is the ONE trusted installer.
  // It writes installRoot and the record. A caller that can rewrite installRoot
  // is outside the v0.11.0 threat model; no PKI or second trust service exists.
  const recordBase = {
    kind: 'DomainAppInstallRecord', schemaVersion: 'dh.install/0.11', appId: lock.appIdentity.id, appVersion: lock.appIdentity.version,
    target: lock.target, lockPath: 'dh-lock/app.lock.json', lockDigest: lock.closureDigest,
    kdpPackageId: '@kaicreator/domain-harness-microkernel', kdpPrimaryEntry: 'bootstrap', kdpPrimaryDigest: lock.bootstrapKdpPin.kdpPrimaryDigest,
  };
  const record = { ...recordBase, recordDigest: contentDigestOf(recordBase) };
  await write(installRoot, 'dh-install/installed-record.json', JSON.stringify(record));
  const pin = {
    schemaVersion: 'dh.pin/0.11', target: lock.target, kdpPackageId: record.kdpPackageId, kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: record.kdpPrimaryDigest, lockDigest: record.lockDigest, lockPath: record.lockPath,
  };
  const context = {
    installRoot, descriptorPath: 'descriptor/app.json', lockPath: record.lockPath,
    hostPorts: [], env: { nodeMajor: 22, platform: process.platform },
  };
  return { installRoot, pin, context, lock, lockBytes };
}

async function expectBuildRefusal(label, options, code) {
  const prepared = await authoring(label, { minOrderTotal: 50, regions: ['EU', 'US'] }, options);
  try {
    const result = await buildV011App(prepared.input);
    assert.equal(result.ok, false, `${label}: BUILD unexpectedly accepted the unsupported profile`);
    assert.equal(result.code, code, JSON.stringify(result));
    await evidence(label, { status: 'PASS', code });
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

async function runPositive(label, rule) {
  const prepared = await authoring(label, rule);
  try {
    const domain = {
      kind: 'Domain', schemaVersion: DH_DOMAIN_SCHEMA_VERSION, id: 'basic', version: '1.0.0',
      elements: prepared.domainElements,
      semanticRelations: [
        { relation: 'documents', from: 'basic.knowledge', to: 'basic.rules' },
        { relation: 'references', from: 'basic.rules', to: 'basic.knowledge' },
      ],
      constraints: [{ rule: 'no-external-effects', version: 1 }],
    };
    assert.deepEqual(validateDomainDefinition(domain), { ok: true });
    assert.equal(prepared.domainElements[0].functions.length, 0);
    assert.equal(prepared.domainElements[2].functions.length, 2);
    assert.equal(new Set(prepared.domainElements.flatMap((element) => element.content.map((block) => block.contentKind))).size >= 2, true);
    assert.equal(contentDigestOf(rule), prepared.ruleRef.digest);
    assert.equal(validateDomainDefinition({ ...domain, schemaVersion: 'invalid' }).ok, false);
    assert.equal(validateDomainDefinition({ ...domain, elements: [prepared.domainElements[0], prepared.domainElements[0]] }).issues[0].code, 'DH_BUILD_ELEMENT_ID_INVALID');
    const unknown = structuredClone(prepared.domainElements[0]);
    unknown.content[0].contentKind = 'unknown-required-kind';
    assert.equal(validateElementDefinition(unknown).issues.some((issue) => issue.code === 'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED'), true);
    await evidence(`${label}.domain-and-content`, { status: 'PASS', zeroFunction: true, twoFunction: true, semanticCycle: true, unknownRequiredRefused: true });

    const first = await buildV011App(prepared.input);
    const second = await buildV011App(prepared.input);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(second.ok, true, JSON.stringify(second));
    if (!first.ok || !second.ok) throw new Error('positive BUILD failed');
    assert.deepEqual(second.lockBytes, first.lockBytes, 'identical inputs must produce byte-identical Lock');
    assert.equal(second.lock.closureDigest, first.lock.closureDigest);
    assert.equal(first.lock.selectedPackages.filter((pkg) => pkg.role === 'primary').length, 3);
    assert.equal(first.lock.selectedPackages.filter((pkg) => pkg.role === 'extension').length, 3);
    assert.equal(first.lock.hookBindings.length, 1);
    assert.equal(first.lock.selectedElements.some((element) => element.ref.id === 'basic.knowledge'), true);
    assert.equal(first.lock.excludedUnknownContent.includes('basic.knowledge/optional-unknown'), true);
    const knowledgeLock = first.lock.selectedElements.find((element) => element.ref.id === 'basic.knowledge');
    assert.equal(knowledgeLock.contentDigests.length, 1, 'only the required knowledge block may be selected');
    assert.equal(knowledgeLock.contentDigests.includes(contentDigestOf({ note: 'unknown optional content is explicitly excluded' })), false);
    await evidence(`${label}.build-determinism`, { status: 'PASS', closureDigest: first.lock.closureDigest, hookBindings: 1, primary: 3, extension: 3 });

    const install = await materialize(label, prepared, first);
    globalThis.__v011T05Events = [];
    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') throw new Error('boot did not BOOT');
    const app = result.app;
    assert.equal(app.status, 'READY');
    const runtimeEvents = globalThis.__v011T05Events;
    const technical = runtimeEvents.filter((event) => event.event === 'technical-init').map((event) => event.package);
    assert.deepEqual(technical, install.lock.technicalInitOrder);
    const businessInitIndex = runtimeEvents.findIndex((event) => event.event === 'business-init');
    const lastTechnicalIndex = runtimeEvents.map((event) => event.event).lastIndexOf('technical-init');
    assert.ok(lastTechnicalIndex >= 0 && businessInitIndex > lastTechnicalIndex, 'the one Business App Init must run after every technical init');
    assert.equal(runtimeEvents.filter((event) => event.event === 'business-init').length, 1);
    await evidence(`${label}.boot-kdp-app-init`, { status: 'PASS', technicalInitOrder: technical, businessInitCount: 1 });

    const pos = await app.invoke('submit', { total: 100, region: 'US' });
    const neg = await app.invoke('submit', { total: 10, region: 'US' });
    const unknownOutcome = await app.invoke('submit', { total: 100, region: 'APAC' });
    assert.deepEqual(pos, { kind: 'SUCCEEDED', value: { decision: 100 >= rule.minOrderTotal ? 'POS' : 'NEG', via: 'rules-package/evaluate' } });
    assert.deepEqual(neg, { kind: 'SUCCEEDED', value: { decision: 'NEG', via: 'rules-package/evaluate' } });
    assert.equal(unknownOutcome.kind, 'UNKNOWN');
    assert.equal(unknownOutcome.unknownReason.code, 'REGION_UNKNOWN');
    if (!rule.regions.includes('EU')) {
      const excluded = await app.invoke('submit', { total: 100, region: 'EU' });
      assert.equal(excluded.kind, 'UNKNOWN');
      assert.equal(excluded.unknownReason.code, 'REGION_UNKNOWN');
    }
    await evidence(`${label}.cross-package-pos-neg-unknown`, { status: 'PASS', pos: pos.value, neg: neg.value, unknown: unknownOutcome.unknownReason });

    const inspection = await app.inspect();
    assert.equal(inspection.appIdentity.lockDigest, install.lock.closureDigest);
    assert.equal(inspection.target.profile, 'node22-esm/1');
    assert.deepEqual(await app.dispose(), { status: 'DISPOSED' });
    const disposed = runtimeEvents.filter((event) => event.event === 'technical-dispose').map((event) => event.package);
    assert.deepEqual(install.lock.technicalDisposeOrder, [...install.lock.technicalInitOrder].reverse());
    assert.deepEqual(disposed, install.lock.technicalDisposeOrder);
    assert.deepEqual(disposed, [...technical].reverse(), 'runtime disposal must be the exact reverse of technical init');
    const afterDispose = await app.invoke('submit', { total: 100, region: 'EU' });
    assert.equal(afterDispose.kind, 'FAILED');
    assert.equal(afterDispose.failure.code, 'DH_RUNTIME_INGRESS_NOT_CALLABLE');
    await evidence(`${label}.inspect-dispose`, { status: 'PASS', technicalDisposeOrder: disposed, postDisposeCode: afterDispose.failure.code });
    return { prepared, install };
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

async function cloneInstall(source) {
  const installRoot = await mkdtemp(join(consumerRoot, 'negative-install-'));
  installRoots.add(installRoot);
  await cp(source.installRoot, installRoot, { recursive: true });
  return { ...source, installRoot, context: { ...source.context, installRoot } };
}

async function main() {
  const sdkEntry = fileURLToPath(import.meta.resolve('@kaicreator/domain-harness'));
  assert.ok(sdkEntry.startsWith(join(consumerRoot, 'node_modules') + (process.platform === 'win32' ? '\\' : '/')), `SDK escaped external root: ${sdkEntry}`);
  await evidence('consumer.external-root', { status: 'PASS', sdkEntry });
  for (const specifier of ['@kaicreator/domain-harness/v7', '@kaicreator/domain-harness/legacy', '@kaicreator/domain-harness-microkernel/legacy']) {
    await assert.rejects(import(specifier), (error) => error?.code === 'ERR_MODULE_NOT_FOUND', `${specifier} must be unreachable`);
    await evidence('negative.legacy-import', { status: 'PASS', specifier, code: 'ERR_MODULE_NOT_FOUND' });
  }
  const contracts = await import('@kaicreator/domain-harness-contracts/v011');
  assert.equal(typeof contracts.contentDigestOf, 'function');
  await evidence('positive.contracts-v011-import', { status: 'PASS' });

  const a = await runPositive('rule-a', { minOrderTotal: 50, regions: ['EU', 'US'] });
  const b = await runPositive('rule-b', { minOrderTotal: 500, regions: ['US'] });
  assert.notDeepEqual(a.install.lockBytes, b.install.lockBytes);
  assert.notEqual(a.install.lock.closureDigest, b.install.lock.closureDigest);
  await evidence('content-exchange.lock-and-output', { status: 'PASS', a: a.install.lock.closureDigest, b: b.install.lock.closureDigest, observed: 'A POS vs B NEG for total=100; B EU UNKNOWN' });

  await expectBuildRefusal('unsupported-effect', { unsupportedEffect: true }, 'DH_BUILD_EFFECT_PROFILE_UNSUPPORTED');
  await expectBuildRefusal('unsupported-target', { unsupportedTarget: true }, 'DH_BUILD_TARGET_INVALID');

  // Every negative uses a NEW installRoot: module URLs cannot be hidden by the
  // earlier positive boot's ESM cache, so any accidental package import is visible.
  const tamperInstall = await cloneInstall(a.install);
  const originalLock = await readFile(join(tamperInstall.installRoot, 'dh-lock/app.lock.json'));
  const tampered = new Uint8Array(originalLock);
  tampered[20] ^= 1;
  assert.doesNotThrow(() => JSON.parse(Buffer.from(tampered).toString('utf8')), 'tamper must preserve JSON syntax so digest verification is exercised');
  await writeFile(join(tamperInstall.installRoot, 'dh-lock/app.lock.json'), tampered);
  let before = globalThis.__v011T05Events.length;
  let refused = await boot(tamperInstall.pin, tamperInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(globalThis.__v011T05Events.length, before, 'tampered Lock must not load packages');
  await evidence('negative.lock-byte-tamper', { status: 'PASS', code: refused.code, freshInstall: true });

  const missingInstall = await cloneInstall(a.install);
  const recordPath = join(missingInstall.installRoot, 'dh-install/installed-record.json');
  const hiddenPath = join(missingInstall.installRoot, 'dh-install/installed-record.hidden.json');
  await rename(recordPath, hiddenPath);
  before = globalThis.__v011T05Events.length;
  refused = await boot(missingInstall.pin, missingInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_RECORD_MISSING');
  assert.equal(globalThis.__v011T05Events.length, before, 'missing record must not load packages');
  await evidence('negative.missing-installed-record', { status: 'PASS', code: refused.code, freshInstall: true });

  const invalidInstall = await cloneInstall(a.install);
  const invalidRecordPath = join(invalidInstall.installRoot, 'dh-install/installed-record.json');
  const originalRecord = await readFile(invalidRecordPath, 'utf8');
  await writeFile(invalidRecordPath, JSON.stringify({ ...JSON.parse(originalRecord), lockDigest: `sha256:${'0'.repeat(64)}` }));
  before = globalThis.__v011T05Events.length;
  refused = await boot(invalidInstall.pin, invalidInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_RECORD_INVALID');
  assert.equal(globalThis.__v011T05Events.length, before, 'invalid record digest must not load packages');
  await evidence('negative.record-digest-invalid', { status: 'PASS', code: refused.code, freshInstall: true });

  const kdpTamperInstall = await cloneInstall(a.install);
  const kdpEntry = join(kdpTamperInstall.installRoot, 'node_modules', '@kaicreator', 'domain-harness-microkernel', 'dist', 'v011', 'index.js');
  const originalKdp = await readFile(kdpEntry);
  await writeFile(kdpEntry, `${originalKdp.toString('utf8')}\n// post-install KDP tamper\n`);
  before = globalThis.__v011T05Events.length;
  refused = await boot(kdpTamperInstall.pin, kdpTamperInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(globalThis.__v011T05Events.length, before, 'KDP byte tamper must not load packages');
  await evidence('negative.kdp-artifact-tamper', { status: 'PASS', code: refused.code, freshInstall: true });

  const forgedInstall = await cloneInstall(a.install);
  before = globalThis.__v011T05Events.length;
  refused = await boot({ ...forgedInstall.pin, lockDigest: `sha256:${'0'.repeat(64)}` }, forgedInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(globalThis.__v011T05Events.length, before, 'forged pin must not load packages');
  await evidence('negative.forged-pin', { status: 'PASS', code: refused.code, freshInstall: true });

  const upstream = (task, tests) => ({
    source: 'UPSTREAM_REUSED_NOT_RERUN_IN_T05', task,
    reviewedHead: 'd1f686558061df268c18f9643c6be1043cd81a06',
    integratedHead: '08f99c79b3b32b0541622e14393f3a044fbf7915',
    tree: 'ca6b8eb20838cda40c1125c3ee817af16c6155d3',
    ci: 'Woodpecker pipeline 2732 (SUCCESS)', tests,
  });
  const ac = {
    AC01: { status: 'PASS_E2E', e2e: ['Domain/Element structure, 0/2 Function Elements, duplicate/discriminator negatives'], upstream: [] },
    AC02: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['typed content/ref digest', 'legal semantic cycle', 'unknown required refusal', 'unknown optional exclusion'],
      upstream: [upstream('T01+T02', 'packages/contracts/tests/v011/*.test.ts; tooling/build/tests/v011/*.test.ts (remaining cross-resource negatives)')],
    },
    AC03: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['real app-business -> rules-package ESM public Function call'],
      upstream: [upstream('T02', 'tooling/build/tests/v011/*.test.ts (ownership/export/implementation negatives)')],
    },
    AC04: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['3 Primary + 3 Extension', 'one sealed Hook', 'deterministic technical init/dispose order'],
      upstream: [upstream('T02', 'tooling/build/tests/v011/*.test.ts (Primary/Hook cardinality negatives)')],
    },
    AC05: {
      status: 'PASS_E2E',
      e2e: ['trusted installer -> Boot/KDP/init order', 'Lock byte tamper', 'missing/invalid record', 'KDP artifact tamper', 'forged pin', 'zero package load on every refusal'],
      scope: 'The acceptance script is the trusted installer per L2 §6.2.4/§8.5.3; caller-writable installRoot forgery and PKI are outside the frozen threat model.',
      upstream: [],
    },
    AC06: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['one App Init after all technical init', 'direct cross-package POS/NEG/UNKNOWN', 'same-code content exchange'],
      upstream: [upstream('T04', 'packages/domain-harness/tests/v011/final-integration.test.ts (required-ingress suppression and DEGRADED negatives)')],
    },
    AC07: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['exact repeated Lock bytes', 'JSON-preserving one-byte Lock tamper refusal'],
      upstream: [upstream('T02', 'tooling/build/tests/v011/*.test.ts (remaining Target/version/resource digest negatives)')],
    },
    AC08: { status: 'PASS_E2E', e2e: ['actual four-tarball external install + per-entry realpath and byte equality', 'legacy import fences', 'contracts/v011'], upstream: [] },
    AC09: { status: 'PASS_E2E', e2e: ['unsupported effect and target typed BUILD refusals', 'no unimplemented success path'], upstream: [] },
    AC10: { status: 'PASS_E2E', e2e: ['bilingual v011-only author docs', 'executable canonical-source business-word scan (driver)'], upstream: [] },
  };
  const result = { status: 'PASS', ac, events: events.length, sdkEntry };
  await writeFile(join(evidenceDir, 'consumer-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

try {
  await main();
} catch (error) {
  const result = { status: 'FAIL', error: String(error?.stack ?? error), events: events.length };
  await evidence('consumer.failure', result);
  await writeFile(join(evidenceDir, 'consumer-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.error(result.error);
  process.exitCode = 1;
} finally {
  for (const root of installRoots) {
    await rm(root, { recursive: true, force: true });
  }
}
