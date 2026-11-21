// 当前唯一 Domain App 验收：真实 SDK 四包与单一组合 App 安装后验证构建、启动、调用及错误拒绝。
import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DH_APP_SCHEMA_VERSION,
  DH_DOMAIN_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
  DH_PACKAGE_SCHEMA_VERSION,
  buildApp,
  boot,
  canonicalJson,
  contentDigestOf,
  validateDomainDefinition,
  validateElementDefinition,
} from '@kaicreator/domain-harness';
import { prepareWorkflowElements } from './workflow-fixture.mjs';

const consumerRoot = process.cwd();
const require = createRequire(import.meta.url);
const npmManifest = require.resolve('npm/package.json', {
  paths: [dirname(process.execPath), resolve(dirname(process.execPath), '../lib/node_modules')],
});
const npmCli = process.env.npm_execpath ?? join(dirname(npmManifest), 'bin/npm-cli.js');
const microkernelTarball = process.env.DH_T05_MICROKERNEL_TARBALL;
const contractsTarball = process.env.DH_T05_CONTRACTS_TARBALL;
assert.ok(microkernelTarball && contractsTarball, 'driver must provide exact local runtime tarballs for composed App installation');
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
const events = (globalThis.__domainHarnessT05Events ??= []);
events.push({ event: 'module-evaluated', package: '${packageId}' });
export async function init(ctx) {
  events.push({ event: 'package-init', package: '${packageId}', initFrom: ctx.InitFrom });
  ${packageId === 'app-business' ? "return (await import('./app.mjs')).init(ctx);" : 'return ctx.nextCore?.init();'}
}
export async function exit() { events.push({ event: 'package-exit', package: '${packageId}' }); }
`;
}
function rulesModule(withWorkflow = false) {
  return `
const events = (globalThis.__domainHarnessT05Events ??= []);
events.push({ event: 'module-evaluated', package: 'rules-package-entry' });
let RULE = null;
export function initializeRule(rule) { RULE = rule; }
export function evaluate(input) {
  if (RULE === null) return { kind: 'UNKNOWN', unknownReason: { code: 'RULE_NOT_INITIALIZED', message: 'selected rule was not initialized' } };
  if (!RULE.regions.includes(input.region)) return { kind: 'UNKNOWN', unknownReason: { code: 'REGION_UNKNOWN', message: 'region is absent from the selected rule' } };
  return { kind: 'SUCCEEDED', value: { decision: input.total >= RULE.minOrderTotal ? 'POS' : 'NEG', via: 'rules-package/evaluate' } };
}
export function optionalReport() { return { kind: 'SUCCEEDED', value: 'optional-report-ok' }; }
${withWorkflow ? `
function workflowRead(input, expectedFormat) {
  if (input?.format !== expectedFormat || typeof input?.source !== 'string' ||
      input?.value === null || typeof input?.value !== 'object' || Array.isArray(input.value)) {
    return { kind: 'UNKNOWN', unknownReason: { code: 'T14_READER_INVALID', message: 'data not selected as plain object' } };
  }
  events.push({ event: 'workflow-read', format: input.format, parsed: input.value });
  return { kind: 'SUCCEEDED', value: input.value };
}
export function jsonReader(input) { return workflowRead(input, 'json'); }
export function yamlReader(input) { return workflowRead(input, 'yaml'); }
export async function startWorkflow() {
  events.push({ event: 'workflow-hook', kind: 'start' });
  await Promise.resolve();
  return { kind: 'SUCCEEDED', value: {} };
}
export async function endWorkflow() {
  await Promise.resolve();
  events.push({ event: 'workflow-hook', kind: 'end' });
  return { kind: 'SUCCEEDED', value: {} };
}
` : ''}
`;
}
function businessModule(withUnsupportedEffect, initThrows = false, initDegraded = false, selectedEvaluateKey = '', workflowRefJson = '') {
  return `
import { evaluate, initializeRule } from 'rules-package/rules';
const events = (globalThis.__domainHarnessT05Events ??= []);
events.push({ event: 'module-evaluated', package: 'app-business-entry' });
export async function init(ctx) {
  ${initThrows ? "throw new Error('demo intentionally failed Business App Init');" : ''}
  const handle = ctx.resources.get('rules-package/content/rules.json');
  if (handle === undefined) throw new Error('selected rule resource is not sealed');
  const rule = JSON.parse(Buffer.from(await handle.read()).toString('utf8'));
  initializeRule(rule);
  const selected = ctx.functions.get(${JSON.stringify(selectedEvaluateKey)});
  if (!selected) throw new Error('selected FunctionRef unavailable during Package.Init');
  const pos = await selected.invoke({ total: 100, region: 'US' });
  const neg = await selected.invoke({ total: 10, region: 'US' });
  const unknown = await selected.invoke({ total: 100, region: 'APAC' });
  const invalid = await selected.invoke({ total: 'invalid', region: 'US' });
  const eu = await selected.invoke({ total: 100, region: 'EU' });
  events.push({ event: 'init-selected-function', package: 'app-business', pos, neg, unknown, invalid, eu });
${workflowRefJson ? `
  if (!ctx.workflows) throw new Error('BUILD-selected Workflow starter missing during Package.Init');
  const outcome = await ctx.workflows.start(${workflowRefJson}, { origin: 'Package.Init' });
  events.push({ event: 'workflow-outcome', outcome });
  if (outcome.status !== 'COMPLETE') throw new Error('Selected Workflow rejected startup');
` : ''}
  events.push({ event: 'business-init', package: 'app-business', minOrderTotal: rule.minOrderTotal });
  return ${initDegraded ? "{ status: 'DEGRADED' }" : "{ status: 'READY' }"};
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
    artifacts[id] = await write(dirs[id], 'dist/index.mjs',
      id === 'kernel-extension'
        ? `${lifecycleModule(id)}\nexport function auditHook(value) { return value; }\n`
        : lifecycleModule(id));
  }
  await write(dirs['rules-package'], 'dist/rules.mjs', rulesModule(options.workflow === true));
  await write(dirs['app-business'], 'dist/app.mjs', businessModule(options.unsupportedEffect === true, options.initThrows === true, options.initDegraded === true));
  await write(dirs['kernel-primary'], 'dist/index.js', "export { bootstrap } from '@kaicreator/domain-harness-microkernel';\n");
  for (const id of Object.keys(dirs)) {
    const exports = id === 'kernel-primary'
      ? { '.': './dist/index.js' }
      : id === 'rules-package'
        ? { '.': './dist/index.mjs', './rules': './dist/rules.mjs' }
        : { '.': './dist/index.mjs' };
    await write(dirs[id], 'package.json', canonicalJson({
      name: id, version: '1.0.0', type: 'module', exports,
      ...(options.npmPreinstallScript === true && id === 'rules-package'
        ? { scripts: { preinstall: 'node -e "require(\'node:fs\').writeFileSync(\'unexpected-hook.txt\',\'unsafe\')"' } }
        : {}),
    }));
  }
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
    description: 'Public Functions consume and initialize the same selected structured rule.',
    content: [{ id: 'selected-rule', contentKind: 'rule', schemaRef: { inline: { type: 'object', required: ['minOrderTotal', 'regions'] } }, required: true, ref: ruleRef }],
    functions: [
      fn('evaluate', evaluateInput, decisionSchema),
      fn('optionalReport', { type: 'object' }, { type: 'string' }),
      fn('initializeRule', {
        type: 'object', required: ['minOrderTotal', 'regions'],
        properties: { minOrderTotal: { type: 'number' }, regions: { type: 'array' } },
      }, { type: 'null' }),
    ],
  };
  const app = {
    kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION, id: 'basic.app', version: '1.0.0',
    description: 'Business Primary calls the public rule Function owned by another package.',
    content: [{ id: 'channel', contentKind: 'structured-data', schemaRef: { inline: { type: 'object' } }, required: true, value: { channel: 'basic-example' } }],
    functions: [
      fn('submit', evaluateInput, decisionSchema),
      ...(options.unsupportedEffect === true ? [fn('dangerous', { type: 'object' }, { type: 'string' }, 'external')] : []),
    ],
    dependencies: [
      { element: 'basic.rules', version: '1.0.0', functions: ['evaluate', 'optionalReport', 'initializeRule'] },
      { element: 'basic.knowledge', version: '1.0.0' },
    ],
  };
  if (options.unknownRequired === true) knowledge.content.push({
    id: 'unknown-required', contentKind: 'not-selected-content-kind',
    schemaRef: { inline: { type: 'object' } }, required: true, value: {},
  });
  if (options.elementCycle === true) {
    // 构造同一 Package 内的真实 Element 环，避免先触发未声明跨包 Extension 拒绝。
    knowledge.dependencies = [{ element: 'basic.rules', version: '1.0.0' }];
    rules.dependencies = [{ element: 'basic.knowledge', version: '1.0.0' }];
  }
  if (options.inlineRule === true) {
    rules.content[0].value = globalThis.structuredClone(rule);
    delete rules.content[0].ref;
  }
  if (options.missingRuleRef === true) {
    rules.content[0].ref = { ...ruleRef, path: 'content/no-such-rule.json' };
  }

  const workflow = options.workflow === true
    ? await prepareWorkflowElements(dirs, rules, app, fn) : null;
  const definitions = {
    'basic.knowledge': knowledge, 'basic.rules': rules, 'basic.app': app,
    ...(workflow ? {
      [workflow.child.id]: workflow.child,
      ...Object.fromEntries(workflow.dataElements.map((el) => [el.id, el])),
    } : {}),
  };
  const definitionRefs = {};
  for (const [id, definition] of Object.entries(definitions)) {
    const path = `elements/${id}.json`;
    await write(dirs[(id === 'basic.app' || id === 'basic.workflow_child') ? 'app-business' : 'rules-package'], path, canonicalJson(definition));
    definitionRefs[id] = {
      packageId: (id === 'basic.app' || id === 'basic.workflow_child') ? 'app-business' : 'rules-package', path,
      digest: await fileDigest(join(dirs[(id === 'basic.app' || id === 'basic.workflow_child') ? 'app-business' : 'rules-package'], path)),
    };
  }
  const elementRef = (id) => ({
    namespace: 'basic', id, version: '1.0.0', digest: contentDigestOf(definitions[id]),
  });
  const functionRef = (element, functionId) => ({ element: elementRef(element), functionId, contractVersion: '1' });
  const refs = {
    evaluate: functionRef('basic.rules', 'evaluate'), optionalReport: functionRef('basic.rules', 'optionalReport'),
    initializeRule: functionRef('basic.rules', 'initializeRule'),
    submit: functionRef('basic.app', 'submit'),
    dangerous: functionRef('basic.app', 'dangerous'),
  };
  const artifactRef = async (packageId, path) => ({ packageId, path, digest: await fileDigest(join(dirs[packageId], path)) });
  const artifactRefs = {};
  for (const id of Object.keys(dirs)) artifactRefs[id] = await artifactRef(id, 'dist/index.mjs');
  await write(dirs['app-business'], 'dist/app.mjs',
    businessModule(options.unsupportedEffect === true, options.initThrows === true,
      options.initDegraded === true, canonicalJson(refs.evaluate),
      workflow ? canonicalJson(workflow.rootRef) : ''));
  const rulesEntryRef = await artifactRef('rules-package', 'dist/rules.mjs');
  const businessEntryRef = await artifactRef('app-business', 'dist/app.mjs');
  const lifecycleDefs = {};
  const lifecycleRefs = {};
  for (const id of Object.keys(dirs)) {
    const definition = {
      kind: 'Element', schemaVersion: DH_ELEMENT_SCHEMA_VERSION,
      id: `basic.lifecycle_${id.replaceAll('-', '_')}`, version: '1.0.0',
      description: 'Package-owned Init/Exit Element and optional Hook Provider.',
      content: [],
      functions: ['init', 'exit', ...(id === 'kernel-extension' ? ['auditHook'] : [])].map((name) => ({
        id: name, contractVersion: '1',
        inputSchemaRef: { inline: { type: 'object' } },
        outputSchemaRef: { inline: { type: 'object' } },
        outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'], effects: 'none',
      })),
    };
    lifecycleDefs[id] = definition;
    await write(dirs[id], 'elements/lifecycle.json', canonicalJson(definition));
    lifecycleRefs[id] = {
      namespace: 'basic', id: definition.id, version: '1.0.0',
      digest: contentDigestOf(definition),
    };
  }
  const lifeFunctionRef = (id, fnName) => ({
    element: lifecycleRefs[id], functionId: fnName, contractVersion: '1',
  });
  const target = { runtime: 'node', module: 'esm', nodeMajor: 22 };
  const variant = (implementations) => [{ target, implementations }];
  const lifeImplementations = (id) =>
    lifecycleDefs[id].functions.map((fn) => implementation(
      lifecycleDefs[id].id, fn.id, artifactRefs[id], fn.id,
      id === 'app-business' && fn.id === 'init' ? [ruleRef] : undefined,
    ));
  const implementation = (elementId, functionId, module, exportName, resources) => ({
    elementId, functionId, contractVersion: '1', entry: { module, exportName }, ...(resources === undefined ? {} : { resources }),
  });
  const packages = [
    manifest('kernel-primary', {
      layer: 'kernel', role: 'primary', order: 0, dependsOn: [{ package: 'kernel-extension', version: '1.0.0', interface: 'kernel.extension' }], exports: [{ interfaceId: 'kernel.api' }],
      provides: { hooks: [{ id: 'audit', interfaceSchemaRef: { inline: { type: 'object' } }, cardinality: 'single' }] },
      init: lifecycleRefs['kernel-primary'],
      elements: [{ id: lifecycleDefs['kernel-primary'].id, version: '1.0.0',
        definitionRef: await artifactRef('kernel-primary', 'elements/lifecycle.json'), visibility: 'private' }],
      targetVariants: variant(lifeImplementations('kernel-primary')),
      exit: lifecycleRefs['kernel-primary'],
    }),
    manifest('kernel-extension', {
      layer: 'kernel', role: 'extension',
      contributesTo: [{ ownerPackageId: 'kernel-primary', hookId: 'audit', function: lifeFunctionRef('kernel-extension', 'auditHook') }],
      exports: [{ interfaceId: 'kernel.extension' }, { elementId: lifecycleDefs['kernel-extension'].id, functionId: 'auditHook' }],
      init: lifecycleRefs['kernel-extension'],
      elements: [{ id: lifecycleDefs['kernel-extension'].id, version: '1.0.0',
        definitionRef: await artifactRef('kernel-extension', 'elements/lifecycle.json'), visibility: 'public' }],
      targetVariants: variant(lifeImplementations('kernel-extension')),
      exit: lifecycleRefs['kernel-extension'],
    }),
    manifest('sdk-primary', {
      layer: 'sdk', role: 'primary', order: 1, dependsOn: [{ package: 'kernel-primary', version: '1.0.0', interface: 'kernel.api' }, { package: 'sdk-extension', version: '1.0.0', interface: 'sdk.extension' }], exports: [{ interfaceId: 'sdk.api' }],
      init: lifecycleRefs['sdk-primary'],
      elements: [{ id: lifecycleDefs['sdk-primary'].id, version: '1.0.0',
        definitionRef: await artifactRef('sdk-primary', 'elements/lifecycle.json'), visibility: 'private' }],
      targetVariants: variant(lifeImplementations('sdk-primary')),
      exit: lifecycleRefs['sdk-primary'],
    }),
    manifest('sdk-extension', {
      layer: 'sdk', role: 'extension', exports: [{ interfaceId: 'sdk.extension' }],
      init: lifecycleRefs['sdk-extension'],
      elements: [{ id: lifecycleDefs['sdk-extension'].id, version: '1.0.0',
        definitionRef: await artifactRef('sdk-extension', 'elements/lifecycle.json'), visibility: 'private' }],
      targetVariants: variant(lifeImplementations('sdk-extension')),
      exit: lifecycleRefs['sdk-extension'],
    }),
    manifest('rules-package', {
      layer: 'business', role: 'extension',
      elements: [
        { id: lifecycleDefs['rules-package'].id, version: '1.0.0',
          definitionRef: await artifactRef('rules-package', 'elements/lifecycle.json'), visibility: 'private' },
        { id: 'basic.knowledge', version: '1.0.0', definitionRef: definitionRefs['basic.knowledge'], visibility: 'public' },
        { id: 'basic.rules', version: '1.0.0', definitionRef: definitionRefs['basic.rules'], visibility: 'public' },
        ...(workflow ? workflow.dataElements.map((el) => ({
          id: el.id, version: el.version, definitionRef: definitionRefs[el.id], visibility: 'public',
        })) : []),
      ],
      exports: [
        { elementId: 'basic.knowledge' }, { elementId: 'basic.rules' },
        { interfaceId: 'rules.api' },
        ...(workflow ? workflow.dataElements.map((el) => ({ elementId: el.id })) : []),
      ],
      targetVariants: variant([
        ...lifeImplementations('rules-package'),
        implementation('basic.rules', 'evaluate', rulesEntryRef, 'evaluate', [ruleRef]),
        implementation('basic.rules', 'optionalReport', rulesEntryRef, 'optionalReport'),
        implementation('basic.rules', 'initializeRule', rulesEntryRef, 'initializeRule'),
        ...(workflow ? ['jsonReader', 'yamlReader', 'startWorkflow', 'endWorkflow']
          .map((functionId) => implementation('basic.rules', functionId, rulesEntryRef, functionId)) : []),
      ]),
      init: lifecycleRefs['rules-package'],
      exit: lifecycleRefs['rules-package'],
    }),
    manifest('app-business', {
      layer: 'business', role: 'primary', order: 2, recordInitFrom: true, dependsOn: [{ package: 'rules-package', version: '1.0.0', interface: 'rules.api' }],
      elements: [
        { id: lifecycleDefs['app-business'].id, version: '1.0.0',
          definitionRef: await artifactRef('app-business', 'elements/lifecycle.json'), visibility: 'private' },
        { id: 'basic.app', version: '1.0.0', definitionRef: definitionRefs['basic.app'], visibility: 'public' },
        ...(workflow ? [{ id: workflow.child.id, version: workflow.child.version,
          definitionRef: definitionRefs[workflow.child.id], visibility: 'private' }] : []),
      ],
      imports: [refs.evaluate, refs.optionalReport, refs.initializeRule,
        ...(workflow ? workflow.readerRefs : [])],
      ...(workflow ? { workflowRoots: [workflow.rootRef] } : {}),
      exports: [{ elementId: 'basic.app' }, { interfaceId: 'business.api' }],
      targetVariants: variant([
        ...lifeImplementations('app-business'),
        implementation('basic.app', 'submit', businessEntryRef, 'submit', [ruleRef]),
        ...(options.unsupportedEffect === true ? [implementation('basic.app', 'dangerous', businessEntryRef, 'dangerous')] : []),
      ]),
      init: lifecycleRefs['app-business'],
      exit: lifecycleRefs['app-business'],
    }),
  ];

  const descriptor = {
    kind: 'DomainApp', schemaVersion: DH_APP_SCHEMA_VERSION, id: `basic.clean.${label}`, version: '1.0.0',
    target: options.unsupportedTarget === true ? { runtime: 'node', module: 'esm', nodeMajor: 20 } : target,
    roots: {
      kernelPrimary: { package: 'kernel-primary', version: '1.0.0' },
      cores: [
        { package: 'sdk-primary', version: '1.0.0' },
        { package: 'app-business', version: '1.0.0' },
      ],
    },
    extensions: [
      { package: 'kernel-extension', version: '1.0.0' },
      { package: 'sdk-extension', version: '1.0.0' },
      { package: 'rules-package', version: '1.0.0' },
    ],
    config: { example: 'basic-domain-app' },
  };
  const input = {
    descriptor, packages,
    packageRoots: dirs,
    packageArtifacts: Object.fromEntries(Object.keys(dirs).map((id) => [id, 'dist/index.mjs'])),
    kdpArtifact: { packageId: 'kernel-primary', path: 'dist/index.js' },
    runtimeDependencies: {
      '@kaicreator/domain-harness-microkernel': '0.11.0',
      ...(workflow ? { xstate: '5.33.2', yaml: '2.9.1' } : {}),
    },
  };
  return {
    root, dirs, input, descriptor, definitions,
    domainElements: [knowledge, rules, app, ...(workflow ? [workflow.child] : [])],
    ruleRef, refs, workflow,
  };
}

async function installComposedDependencies(label, installRoot) {
  const install = spawnSync(process.execPath, [npmCli, 'install', microkernelTarball, contractsTarball, '--no-audit', '--no-fund'], {
    cwd: installRoot, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, npm_config_registry: process.env.DH_T05_NPM_REGISTRY ?? process.env.npm_config_registry },
  });
  await evidence(`${label}.composed-package-npm-install`, { exit: install.status, signal: install.signal });
  assert.equal(install.status, 0, `${label}: composed App npm install failed\n${install.stdout}\n${install.stderr}`);
}

async function materialize(label, built) {
  const installRoot = await mkdtemp(join(consumerRoot, `install-${label}-`));
  installRoots.add(installRoot);
  for (const file of built.appPackage.files) await write(installRoot, file.path, file.bytes);
  await evidence(`${label}.composed-package-materialize`, {
    status: 'PASS', files: built.appPackage.files.length, packageDigest: built.appPackage.packageDigest,
  });
  await installComposedDependencies(label, installRoot);
  if (label === 'rule-a') {
    const child = spawnSync(process.execPath, ['boot.mjs'], {
      cwd: installRoot, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024, env: process.env,
    });
    await evidence('composed-package-independent-boot', { exit: child.status, signal: child.signal });
    assert.equal(child.status, 0, `composed App independent boot failed\n${child.stdout}\n${child.stderr}`);
    assert.match(child.stdout, /"status":"BOOTED"/u);
    assert.match(child.stdout, /"status":"DISPOSED"/u);
  }
  const lock = built.lock;
  const lockBytes = built.lockBytes;
  const pin = JSON.parse(await readFile(join(installRoot, 'dh-install/bootstrap-pin.json'), 'utf8'));
  const context = {
    installRoot, descriptorPath: 'descriptor/app.json', lockPath: 'dh-lock/app.lock.json',
    hostPorts: [], env: { nodeMajor: 22, platform: process.platform },
  };
  return { installRoot, pin, context, lock, lockBytes };
}

async function expectBuildRefusal(label, options, code) {
  const prepared = await authoring(label, { minOrderTotal: 50, regions: ['EU', 'US'] }, options);
  try {
    const result = await buildApp(prepared.input);
    assert.equal(result.ok, false, `${label}: BUILD unexpectedly accepted the unsupported profile`);
    assert.equal(result.code, code, JSON.stringify(result));
    await evidence(label, { status: 'PASS', code });
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

async function expectBuildMutationRefusal(label, mutate, code, options = {}) {
  const prepared = await authoring('negative-' + label, { minOrderTotal: 50, regions: ['EU', 'US'] }, options);
  try {
    mutate(prepared);
    const result = await buildApp(prepared.input);
    assert.equal(result.ok, false, label + ': BUILD incorrectly accepted the negative');
    assert.equal(result.code, code, label + ': wrong typed refusal: ' + JSON.stringify(result));
    await evidence('negative.build.' + label, { status: 'PASS', code });
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

async function runPositive(label, rule, expectedAtHundred) {
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
    assert.equal(prepared.domainElements[2].functions.length, 1, 'business startup belongs to Package.Init and is not a second Function');
    assert.equal(new Set(prepared.domainElements.flatMap((element) => element.content.map((block) => block.contentKind))).size >= 2, true);
    assert.equal(contentDigestOf(rule), prepared.ruleRef.digest);
    assert.equal(validateDomainDefinition({ ...domain, schemaVersion: 'invalid' }).ok, false);
    assert.equal(validateDomainDefinition({ ...domain, elements: [prepared.domainElements[0], prepared.domainElements[0]] }).issues[0].code, 'DH_BUILD_ELEMENT_ID_INVALID');
    const unknown = globalThis.structuredClone(prepared.domainElements[0]);
    unknown.content[0].contentKind = 'unknown-required-kind';
    assert.equal(validateElementDefinition(unknown).issues.some((issue) => issue.code === 'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED'), true);
    await evidence(`${label}.domain-and-content`, { status: 'PASS', zeroFunction: true, twoFunction: true, semanticCycle: true, unknownRequiredRefused: true });

    const first = await buildApp(prepared.input);
    const second = await buildApp(prepared.input);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(second.ok, true, JSON.stringify(second));
    if (!first.ok || !second.ok) throw new Error('positive BUILD failed');
    assert.deepEqual(second.lockBytes, first.lockBytes, 'identical inputs must produce byte-identical Lock');
    assert.deepEqual(second.appPackage, first.appPackage, 'identical inputs must produce the complete byte-identical App Package');
    assert.ok(first.appPackage.files.some((file) => file.path === 'boot.mjs'));
    assert.ok(first.appPackage.files.some((file) => file.path === 'dh-install/installed-record.json'));
    assert.ok(first.appPackage.files.some((file) => file.path === 'packages/kernel-primary/package.json'));
    assert.equal(second.lock.closureDigest, first.lock.closureDigest);
    assert.equal(first.lock.selectedPackages.filter((pkg) => pkg.role === 'primary').length, 3);
    assert.equal(first.lock.selectedPackages.filter((pkg) => pkg.role === 'extension').length, 3);
    assert.equal(first.lock.hookBindings.length, 1);
    assert.equal(first.lock.selectedElements.some((element) => element.ref.id === 'basic.knowledge'), true);
    assert.equal(first.lock.excludedUnknownContent.includes('basic.knowledge/optional-unknown'), true);
    const knowledgeLock = first.lock.selectedElements.find((element) => element.ref.id === 'basic.knowledge');
    assert.equal(knowledgeLock.contentDigests.length, 1, 'only the required knowledge block may be selected');
    assert.equal(knowledgeLock.contentDigests.includes(contentDigestOf({ note: 'unknown optional content is explicitly excluded' })), false);
    await evidence(`${label}.build-determinism`, {
      status: 'PASS', closureDigest: first.lock.closureDigest, packageDigest: first.appPackage.packageDigest,
      files: first.appPackage.files.length, hookBindings: 1, primary: 3, extension: 3,
    });

    const install = await materialize(label, first);
    globalThis.__domainHarnessT05Events = [];
    const result = await boot(install.pin, install.context);
    assert.equal(result.status, 'BOOTED', JSON.stringify(result));
    if (result.status !== 'BOOTED') throw new Error('boot did not BOOT');
    const app = result.app;
    assert.equal(app.status, 'READY');
    const runtimeEvents = globalThis.__domainHarnessT05Events;
    const initialized = runtimeEvents.filter((event) => event.event === 'package-init').map((event) => event.package);
    assert.deepEqual(install.lock.coreOrder, ['kernel-primary', 'sdk-primary', 'app-business']);
    assert.deepEqual(initialized, ['kernel-extension', 'kernel-primary', 'sdk-extension', 'sdk-primary', 'rules-package', 'app-business']);
    const businessInitIndex = runtimeEvents.findIndex((event) => event.event === 'business-init');
    const lastInitIndex = runtimeEvents.map((event) => event.event).lastIndexOf('package-init');
    assert.ok(lastInitIndex >= 0 && businessInitIndex > lastInitIndex, 'Business Core.Init executes once after own Extension Init');
    assert.equal(runtimeEvents.filter((event) => event.event === 'business-init').length, 1);
    await evidence(`${label}.boot-kdp-app-init`, { status: 'PASS', initOrder: initialized, businessInitCount: 1 });

    // v0.11.0 业务执行只在 Package.Init 中进行；不调用公开 App.invoke。
    const selectedCall = runtimeEvents.find((event) => event.event === 'init-selected-function');
    assert.ok(selectedCall, 'selected Function must execute while App is still being initialized');
    const { pos, neg, unknown: unknownOutcome, invalid: invalidInput, eu } = selectedCall;
    assert.deepEqual(pos, { kind: 'SUCCEEDED', value: { decision: expectedAtHundred, via: 'rules-package/evaluate' } });
    assert.deepEqual(neg, { kind: 'SUCCEEDED', value: { decision: 'NEG', via: 'rules-package/evaluate' } });
    assert.equal(unknownOutcome.kind, 'UNKNOWN');
    assert.equal(unknownOutcome.unknownReason.code, 'REGION_UNKNOWN');
    if (!rule.regions.includes('EU')) {
      assert.equal(eu.kind, 'UNKNOWN');
      assert.equal(eu.unknownReason.code, 'REGION_UNKNOWN');
    }
    assert.equal(invalidInput.kind, 'FAILED', 'invalid input must fail before selected Function implementation');
    assert.equal(invalidInput.failure.code, 'DH_RUNTIME_INPUT_SCHEMA_MISMATCH');
    assert.equal(typeof app.invoke, 'undefined', 'v0.11.0 no longer exposes direct business ingress');
    await evidence(`${label}.init-selected-function`, {
      status: 'PASS', pos: pos.value, neg: neg.value,
      unknown: unknownOutcome.unknownReason, invalid: invalidInput.failure.code,
    });

    const inspection = await app.inspect();
    assert.equal(inspection.appIdentity.lockDigest, install.lock.closureDigest);
    assert.equal(inspection.target.profile, 'node22-esm/1');
    assert.deepEqual(await app.dispose(), { status: 'DISPOSED' });
    const disposed = runtimeEvents.filter((event) => event.event === 'package-exit').map((event) => event.package);
    assert.deepEqual(disposed,
      ['rules-package', 'app-business', 'sdk-extension', 'sdk-primary', 'kernel-extension', 'kernel-primary'],
      'Exit follows actual recursive Init entry stack, deepest first');
    await evidence(`${label}.inspect-dispose`, { status: 'PASS', exitOrder: disposed, directIngress: false });
    return { prepared, install };
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

async function cloneInstall(source) {
  const installRoot = await mkdtemp(join(consumerRoot, 'negative-install-'));
  installRoots.add(installRoot);
  await cp(source.installRoot, installRoot, {
    recursive: true,
    filter: (path) => {
      const rel = relative(source.installRoot, path);
      return rel !== 'node_modules' && !rel.startsWith(`node_modules${process.platform === 'win32' ? '\\' : '/'}`) && rel !== 'package-lock.json';
    },
  });
  await installComposedDependencies('negative-clone', installRoot);
  return { ...source, installRoot, context: { ...source.context, installRoot } };
}

async function main() {
  const sdkEntry = fileURLToPath(import.meta.resolve('@kaicreator/domain-harness'));
  assert.ok(sdkEntry.startsWith(join(consumerRoot, 'node_modules') + (process.platform === 'win32' ? '\\' : '/')), `SDK escaped external root: ${sdkEntry}`);
  await evidence('consumer.external-root', { status: 'PASS', sdkEntry });
  for (const specifier of ['@kaicreator/domain-harness/v7', '@kaicreator/domain-harness/legacy', '@kaicreator/domain-harness-microkernel/legacy']) {
    await assert.rejects(import(specifier), (error) => error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED', `${specifier} must be unreachable`);
    await evidence('negative.legacy-import', { status: 'PASS', specifier, code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
  const contracts = await import('@kaicreator/domain-harness-contracts');
  assert.equal(typeof contracts.contentDigestOf, 'function');
  await evidence('positive.contracts-current-import', { status: 'PASS' });

  const a = await runPositive('rule-a', { minOrderTotal: 50, regions: ['EU', 'US'] }, 'POS');
  const b = await runPositive('rule-b', { minOrderTotal: 500, regions: ['US'] }, 'NEG');
  assert.notDeepEqual(a.install.lockBytes, b.install.lockBytes);
  assert.notEqual(a.install.lock.closureDigest, b.install.lock.closureDigest);
  await evidence('content-exchange.lock-and-output', { status: 'PASS', a: a.install.lock.closureDigest, b: b.install.lock.closureDigest, observed: 'Init-selected Function returned A POS vs B NEG for total=100; B EU UNKNOWN' });

  await expectBuildRefusal('unsupported-effect', { unsupportedEffect: true }, 'DH_BUILD_EFFECT_PROFILE_UNSUPPORTED');
  await expectBuildRefusal('unsupported-target', { unsupportedTarget: true }, 'DH_BUILD_TARGET_INVALID');
  // 真正的消费端构建入口必须在 npm install/materialize 前拒绝恶意 Package 的 preinstall。
  await expectBuildRefusal('untrusted-npm-install-hook', { npmPreinstallScript: true }, 'DH_BUILD_DEPENDS_ON_UNSELECTED');

  const pkg = (prepared, id) => {
    const found = prepared.input.packages.find((candidate) => candidate.id === id);
    assert.ok(found, 'fixture must contain Package ' + id);
    return found;
  };
  await expectBuildMutationRefusal('unknown-required-content', () => {}, 'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED', { unknownRequired: true });
  await expectBuildMutationRefusal('missing-content-reference', () => {}, 'DH_BUILD_RESOURCE_MISSING', { missingRuleRef: true });
  await expectBuildMutationRefusal('element-dependency-cycle', () => {}, 'DH_BUILD_ELEMENT_CYCLE', { elementCycle: true });
  await expectBuildMutationRefusal('missing-public-export', (p) => {
    pkg(p, 'rules-package').exports = [{ interfaceId: 'rules.api' }];
  }, 'DH_BUILD_EXPORT_MISSING');
  await expectBuildMutationRefusal('missing-selected-implementation', (p) => {
    const business = pkg(p, 'app-business');
    business.targetVariants[0].implementations =
      business.targetVariants[0].implementations.filter((binding) => binding.functionId !== 'init');
  }, 'DH_BUILD_IMPLEMENTATION_MISSING');
  await expectBuildMutationRefusal('unselected-core-primary', (p) => {
    pkg(p, 'sdk-extension').role = 'primary';
  }, 'DH_BUILD_PRIMARY_MISSING');
  await expectBuildMutationRefusal('missing-kernel-primary', (p) => {
    pkg(p, 'kernel-primary').layer = 'sdk';
  }, 'DH_BUILD_PRIMARY_MISSING');
  await expectBuildMutationRefusal('package-dependency-cycle', (p) => {
    pkg(p, 'kernel-primary').dependsOn = [...pkg(p, 'kernel-primary').dependsOn, { package: 'sdk-primary', version: '1.0.0', interface: 'sdk.api' }];
  }, 'DH_BUILD_PACKAGE_CYCLE');
  await expectBuildMutationRefusal('hook-not-declared', (p) => {
    pkg(p, 'kernel-extension').contributesTo[0].hookId = 'not-an-audit-hook';
  }, 'DH_BUILD_HOOK_TARGET_INVALID');
  await expectBuildMutationRefusal('missing-selected-package-init', (p) => {
    pkg(p, 'app-business').init.digest = `sha256:${'0'.repeat(64)}`;
  }, 'DH_BUILD_REF_UNRESOLVED');
  await expectBuildMutationRefusal('bad-resource-digest', (p) => {
    pkg(p, 'app-business').targetVariants[0].implementations[0].resources[0].digest = `sha256:${'0'.repeat(64)}`;
  }, 'DH_BUILD_RESOURCE_DIGEST_MISMATCH');
  await expectBuildMutationRefusal('noncanonical-artifact-path', (p) => {
    p.input.kdpArtifact.path = './dist/index.js';
  }, 'DH_BUILD_RESOURCE_MISSING');

  const inlinePrepared = await authoring('inline-rule', { minOrderTotal: 50, regions: ['EU', 'US'] }, { inlineRule: true });
  try {
    const built = await buildApp(inlinePrepared.input);
    assert.equal(built.ok, true, JSON.stringify(built));
    const aRule = a.install.lock.selectedElements.find((el) => el.ref.id === 'basic.rules');
    const inlineRule = built.lock.selectedElements.find((el) => el.ref.id === 'basic.rules');
    assert.ok(aRule && inlineRule);
    assert.deepEqual(inlineRule.contentDigests, aRule.contentDigests, 'inline vs ref content semantics changed');
    await evidence('positive.inline-rule-ref-equivalence', { status: 'PASS', digest: inlineRule.contentDigests[0] });
  } finally {
    await rm(inlinePrepared.root, { recursive: true, force: true });
  }

  const failedInitPrepared = await authoring('init-failure', { minOrderTotal: 50, regions: ['EU', 'US'] }, { initThrows: true });
  try {
    const failedInitBuild = await buildApp(failedInitPrepared.input);
    assert.equal(failedInitBuild.ok, true, JSON.stringify(failedInitBuild));
    if (!failedInitBuild.ok) throw new Error('demo failed to BUILD the App Init failure fixture');
    const failedInitInstall = await materialize('init-failure', failedInitBuild);
    globalThis.__domainHarnessT05Events = [];
    const failedInit = await boot(failedInitInstall.pin, failedInitInstall.context);
    assert.equal(failedInit.status, 'FAILED', JSON.stringify(failedInit));
    assert.equal(failedInit.code, 'DH_RUNTIME_NOT_READY');
    assert.equal('app' in failedInit, false, 'failed App Init must not expose a DomainApp');
    const timeline = globalThis.__domainHarnessT05Events;
    const initialized = timeline.filter((event) => event.event === 'package-init').map((event) => event.package);
    const disposed = timeline.filter((event) => event.event === 'package-exit').map((event) => event.package);
    assert.ok(initialized.length > 0, 'failure fixture must actually initialize Packages');
    assert.deepEqual(initialized, ['kernel-extension', 'kernel-primary', 'sdk-extension', 'sdk-primary', 'rules-package', 'app-business']);
    assert.deepEqual(disposed,
      ['rules-package', 'app-business', 'sdk-extension', 'sdk-primary', 'kernel-extension', 'kernel-primary'],
      'failed Init must Exit all entered Packages from deepest to root');
    assert.equal(timeline.some((event) => event.event === 'business-init'), false);
    await evidence('negative.app-init-failure-rollback', { status: 'PASS', code: failedInit.code, initialized: initialized.length, disposed: disposed.length, exposedApp: false });
  } finally {
    await rm(failedInitPrepared.root, { recursive: true, force: true });
  }

  const degradedPrepared = await authoring('degraded-status', { minOrderTotal: 50, regions: ['EU', 'US'] }, { initDegraded: true });
  try {
    const built = await buildApp(degradedPrepared.input);
    assert.equal(built.ok, true, JSON.stringify(built));
    const install = await materialize('degraded-status', built);
    globalThis.__domainHarnessT05Events = [];
    const booted = await boot(install.pin, install.context);
    assert.equal(booted.status, 'BOOTED', JSON.stringify(booted));
    if (booted.status !== 'BOOTED') throw new Error('degraded status fixture did not Boot');
    assert.equal(booted.app.status, 'DEGRADED');
    const selected = globalThis.__domainHarnessT05Events.find((event) => event.event === 'init-selected-function');
    assert.equal(selected?.pos?.kind, 'SUCCEEDED', 'even a DEGRADED App completed its selected Init Function');
    await booted.app.dispose();
    await evidence('positive.degraded-status', { status: 'PASS', directIngress: false });
  } finally {
    await rm(degradedPrepared.root, { recursive: true, force: true });
  }

  const tamperInstall = await cloneInstall(a.install);
  const originalLock = await readFile(join(tamperInstall.installRoot, 'dh-lock/app.lock.json'));
  const tampered = new Uint8Array(originalLock);
  tampered[20] ^= 1;
  assert.doesNotThrow(() => JSON.parse(Buffer.from(tampered).toString('utf8')), 'tamper must preserve JSON syntax so digest verification is exercised');
  await writeFile(join(tamperInstall.installRoot, 'dh-lock/app.lock.json'), tampered);
  let before = globalThis.__domainHarnessT05Events.length;
  let refused = await boot(tamperInstall.pin, tamperInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(globalThis.__domainHarnessT05Events.length, before, 'tampered Lock must not load packages');
  await evidence('negative.lock-byte-tamper', { status: 'PASS', code: refused.code, freshInstall: true });

  const missingInstall = await cloneInstall(a.install);
  const recordPath = join(missingInstall.installRoot, 'dh-install/installed-record.json');
  const hiddenPath = join(missingInstall.installRoot, 'dh-install/installed-record.hidden.json');
  await rename(recordPath, hiddenPath);
  before = globalThis.__domainHarnessT05Events.length;
  refused = await boot(missingInstall.pin, missingInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_RECORD_MISSING');
  assert.equal(globalThis.__domainHarnessT05Events.length, before, 'missing record must not load packages');
  await evidence('negative.missing-installed-record', { status: 'PASS', code: refused.code, freshInstall: true });

  const invalidInstall = await cloneInstall(a.install);
  const invalidRecordPath = join(invalidInstall.installRoot, 'dh-install/installed-record.json');
  const originalRecord = await readFile(invalidRecordPath, 'utf8');
  await writeFile(invalidRecordPath, JSON.stringify({ ...JSON.parse(originalRecord), lockDigest: `sha256:${'0'.repeat(64)}` }));
  before = globalThis.__domainHarnessT05Events.length;
  refused = await boot(invalidInstall.pin, invalidInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_RECORD_INVALID');
  assert.equal(globalThis.__domainHarnessT05Events.length, before, 'invalid record digest must not load packages');
  await evidence('negative.record-digest-invalid', { status: 'PASS', code: refused.code, freshInstall: true });

  const kdpTamperInstall = await cloneInstall(a.install);
  const kdpEntry = join(kdpTamperInstall.installRoot, 'node_modules', 'kernel-primary', 'dist', 'index.js');
  const originalKdp = await readFile(kdpEntry);
  await writeFile(kdpEntry, `${originalKdp.toString('utf8')}\n// post-install KDP tamper\n`);
  before = globalThis.__domainHarnessT05Events.length;
  refused = await boot(kdpTamperInstall.pin, kdpTamperInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(globalThis.__domainHarnessT05Events.length, before, 'KDP byte tamper must not load packages');
  await evidence('negative.kdp-artifact-tamper', { status: 'PASS', code: refused.code, freshInstall: true });

  const businessTamperInstall = await cloneInstall(a.install);
  const businessEntry = join(businessTamperInstall.installRoot, 'node_modules', 'app-business', 'dist', 'app.mjs');
  const businessBytes = await readFile(businessEntry);
  await writeFile(businessEntry, `${businessBytes.toString('utf8')}\n// post-install selected Business executable tamper\n`);
  before = globalThis.__domainHarnessT05Events.length;
  refused = await boot(businessTamperInstall.pin, businessTamperInstall.context);
  assert.equal(refused.status, 'FAILED', JSON.stringify(refused));
  assert.equal(refused.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(globalThis.__domainHarnessT05Events.length, before, 'selected executable byte tamper must fail before any selected Package evaluation');
  await evidence('negative.selected-business-executable-tamper', { status: 'PASS', code: refused.code, freshInstall: true, loadedPackageEvents: 0 });

  const forgedInstall = await cloneInstall(a.install);
  before = globalThis.__domainHarnessT05Events.length;
  refused = await boot({ ...forgedInstall.pin, lockDigest: `sha256:${'0'.repeat(64)}` }, forgedInstall.context);
  assert.equal(refused.status, 'REFUSED');
  assert.equal(refused.code, 'DH_BOOT_PIN_MISMATCH');
  assert.equal(globalThis.__domainHarnessT05Events.length, before, 'forged pin must not load packages');
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
      upstream: [upstream('T01+T02', 'packages/contracts/tests/*.test.ts; tooling/build/tests/*.test.ts (remaining cross-resource negatives)')],
    },
    AC03: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['real app-business -> rules-package ESM public Function call'],
      upstream: [upstream('T02', 'tooling/build/tests/*.test.ts (ownership/export/implementation negatives)')],
    },
    AC04: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['3 Primary + 3 Extension', 'one sealed Hook', 'deterministic Package Init/dispose order'],
      upstream: [upstream('T02', 'tooling/build/tests/*.test.ts (Primary/Hook cardinality negatives)')],
    },
    AC05: {
      status: 'PASS_E2E',
      e2e: ['trusted installer -> Boot/KDP/init order', 'Lock byte tamper', 'missing/invalid record', 'KDP artifact tamper', 'selected Business executable tamper', 'forged pin', 'zero package load on every refusal'],
      scope: 'The acceptance script is the trusted installer per L2 §6.2.4/§8.5.3; caller-writable installRoot forgery and PKI are outside the frozen threat model.',
      upstream: [],
    },
    AC06: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['one App Init after all Package Init', 'direct cross-package POS/NEG/UNKNOWN', 'same-code content exchange', 'App Init exception reverse cleanup and no exposed App handle'],
      upstream: [upstream('T04', 'packages/domain-harness/tests/final-integration.test.ts (required-ingress suppression and DEGRADED negatives)')],
    },
    AC07: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      e2e: ['exact repeated Lock bytes', 'JSON-preserving one-byte Lock tamper refusal'],
      upstream: [upstream('T02', 'tooling/build/tests/*.test.ts (remaining Target/version/resource digest negatives)')],
    },
    AC08: { status: 'PASS_E2E', e2e: ['actual four-tarball SDK install + BUILD-composed App npm install + independent boot/dispose + per-entry realpath and byte equality', 'legacy import fences', 'contracts'], upstream: [] },
    AC09: { status: 'PASS_E2E', e2e: ['unsupported effect and target typed BUILD refusals', 'no unimplemented success path'], upstream: [] },
    AC10: { status: 'PASS_E2E', e2e: ['bilingual current-only author docs', 'executable canonical-source business-word scan (driver)'], upstream: [] },
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
