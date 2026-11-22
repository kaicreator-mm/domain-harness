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
const registryFixtureOnly = process.env.DH_R60_REGISTRY_WORKFLOW_FIXTURE_ONLY === '1';
const sdkTarball = process.env.DH_T05_SDK_TARBALL;
const microkernelTarball = process.env.DH_T05_MICROKERNEL_TARBALL;
const contractsTarball = process.env.DH_T05_CONTRACTS_TARBALL;
if (!registryFixtureOnly) {
  assert.ok(sdkTarball && microkernelTarball && contractsTarball,
    'driver must provide exact SDK and local transitive tarballs for composed App installation');
}
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
function rulesModule(withWorkflow = false, workflowFatalAt = '') {
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
// JSON/YAML 解析由真正选定的 r60.reader Standard Element 负责。
export async function startWorkflow() {
  events.push({ event: 'workflow-hook', kind: 'start' });
  await Promise.resolve();
  if (${JSON.stringify(workflowFatalAt)} === 'start') {
    throw new Error('T14 deliberate selected start Hook fatal');
  }
  return { kind: 'SUCCEEDED', value: {} };
}
export async function endWorkflow() {
  await Promise.resolve();
  events.push({ event: 'workflow-hook', kind: 'end' });
  return { kind: 'SUCCEEDED', value: {} };
}
export function workflowDecision(input) {
  events.push({ event: 'workflow-decision', route: input?.route, session: input?.session });
  if (input?.route === 'UNKNOWN') {
    return { kind: 'UNKNOWN', unknownReason: { code: 'T14_BUSINESS_UNKNOWN', message: 'business fact not known' } };
  }
  if (input?.route === 'FAILED') {
    return { kind: 'FAILED', failure: { code: 'T14_BUSINESS_FAILED', message: 'explicit business failure' } };
  }
  return { kind: 'SUCCEEDED', value: { route: input?.route, session: input?.session ?? null } };
}
` : ''}
`;
}
function businessModule(withUnsupportedEffect, initThrows = false, initDegraded = false, selectedEvaluateKey = '', workflowRefJson = '', workflowCasesJson = '') {
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
  const denied = await ctx.workflows.start({
    ...${workflowRefJson}, contentId: 'unselected-workflow',
  }, { origin: 'unauthorized-root' });
  events.push({ event: 'workflow-unauthorized', outcome: denied });
  if (denied.status !== 'FAILED' || denied.reason.code !== 'DH_WORKFLOW_UNSELECTED') {
    throw new Error('Package.Init illegally started a Workflow not authorized by BUILD');
  }
  const outcome = await ctx.workflows.start(${workflowRefJson}, { origin: 'Package.Init' });
  events.push({ event: 'workflow-outcome', outcome });
  if (outcome.status !== 'COMPLETE') throw new Error('Selected Workflow rejected startup');
` : ''}
${workflowCasesJson ? `
  events.push({ event: 'workflow-cases-begin' });
  const caseRefs = new Map(Object.entries(${workflowCasesJson}));
  const cases = [
    ['single', 'single-flow', {}, 'COMPLETE'],
    ['complete', 'decision-flow', { route: 'COMPLETE', session: 'A' }, 'COMPLETE'],
    ['ask', 'decision-flow', { route: 'ASK', session: 'B' }, 'ASK', 'DH_WORKFLOW_TERMINAL'],
    ['wait', 'decision-flow', { route: 'WAIT', session: 'C' }, 'WAIT', 'DH_WORKFLOW_TERMINAL'],
    ['reject', 'decision-flow', { route: 'REJECT', session: 'D' }, 'REJECT', 'DH_WORKFLOW_TERMINAL'],
    ['unknown', 'decision-flow', { route: 'UNKNOWN', session: 'E' }, 'UNKNOWN', 'T14_BUSINESS_UNKNOWN'],
    ['failed', 'decision-flow', { route: 'FAILED', session: 'F' }, 'FAILED', 'T14_BUSINESS_FAILED'],
    ['unmatched', 'decision-flow', { route: 'UNDECLARED', session: 'G' }, 'FAILED', 'DH_WORKFLOW_ROUTE_UNMATCHED'],
    ['repeat-ask', 'decision-flow', { route: 'ASK', session: 'H' }, 'ASK', 'DH_WORKFLOW_TERMINAL'],
    ['reservation', 'budget-flow', {}, 'FAILED', 'DH_WORKFLOW_CALL_BUDGET'],
    ['shared-budget', 'shared-budget-flow', {}, 'FAILED', 'DH_WORKFLOW_CALL_BUDGET'],
    ['ancestor-depth', 'depth-flow', {}, 'FAILED', 'DH_WORKFLOW_DEPTH_LIMIT'],
  ];
  for (const [name, refId, input, expectedStatus, expectedCode] of cases) {
    const selectedRef = caseRefs.get(refId);
    if (!selectedRef) throw new Error('T14 selected WorkflowRef missing from sealed fixture');
    const result = await ctx.workflows.start(selectedRef, input);
    events.push({ event: 'workflow-case', name, outcome: result });
    if (result.status !== expectedStatus ||
        (expectedCode && result.reason?.code !== expectedCode)) {
      throw new Error('T14 Workflow result failed to preserve named terminal/budget: ' + name +
        ' (' + result.status + '/' + (result.reason?.code ?? 'none') + ')');
    }
    if (name === 'complete' && result.value?.session !== 'A') {
      throw new Error('T14 reused decision node lost its own instance value');
    }
  }
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
  await write(dirs['rules-package'], 'dist/rules.mjs',
    rulesModule(options.workflow === true, options.workflowFatalAt ?? ''));
  await write(dirs['app-business'], 'dist/app.mjs', businessModule(options.unsupportedEffect === true, options.initThrows === true, options.initDegraded === true));
  await write(dirs['kernel-primary'], 'dist/index.js', "export { bootstrap } from '@kaicreator/domain-harness/runtime';\n");
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

  // 从仓库中直接拷贝真实手写的多文件 Standard Reader Domain Package。
  const standardPkgId = 'r60-standard-files';
  const standardRoot = options.workflow === true ? join(root, standardPkgId) : null;
  if (standardRoot) {
    await cp(resolve(dirname(fileURLToPath(import.meta.url)), '../selected-packages/packages/r60-standard-files'),
      standardRoot, { recursive: true });
    // 生产 Standard Reader 源不携带 Demo 全局日志或故障注入；
    // 唯有隔离 E2E 的临时测试副本加入观测，并同步真实 Target 摘要。
    const modulePath = join(standardRoot, 'dist/index.mjs');
    const original = await readFile(modulePath, 'utf8');
    const marker = "    return { kind: 'SUCCEEDED', value };";
    assert.ok(original.includes(marker), 'Standard Reader success seam absent');
    const instrumentation = [
      ...(options.workflowFatalAt === 'leaf'
        ? ["    if (value?.id === 'json-a') throw new Error('T14 deliberate selected Function fatal');"]
        : []),
      "    const events = (globalThis.__domainHarnessT05Events ??= []);",
      "    events.push({ event: 'workflow-read', format, parsed: value });",
    ].join(String.fromCharCode(10));
    await writeFile(modulePath, original.replace(marker, instrumentation +
      String.fromCharCode(10) + marker));
    const manifestPath = join(standardRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const digest = await fileDigest(modulePath);
    for (const variant of manifest.targetVariants) {
      for (const binding of variant.implementations) binding.entry.module.digest = digest;
    }
    await writeFile(manifestPath, canonicalJson(manifest));
  }
  const standardDefinition = standardRoot
    ? {
        json: JSON.parse(await readFile(join(standardRoot, 'definitions/json-file.json'), 'utf8')),
        yaml: JSON.parse(await readFile(join(standardRoot, 'definitions/yaml-file.json'), 'utf8')),
      } : null;
  const standardManifest = standardRoot
    ? JSON.parse(await readFile(join(standardRoot, 'manifest.json'), 'utf8')) : null;
  const workflow = options.workflow === true
    ? await prepareWorkflowElements(dirs, rules, app, fn, standardDefinition) : null;
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
      workflow ? canonicalJson(workflow.rootRef) : '',
      workflow ? canonicalJson(workflow.caseRefs) : ''));
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
        ...(workflow ? ['startWorkflow', 'endWorkflow', 'workflowDecision']
          .map((functionId) => implementation('basic.rules', functionId, rulesEntryRef, functionId)) : []),
      ]),
      init: lifecycleRefs['rules-package'],
      exit: lifecycleRefs['rules-package'],
    }),
    manifest('app-business', {
      layer: 'business', role: 'primary', order: 2,
      ...(options.omitBusinessInitFrom === true ? {} : { recordInitFrom: true }), dependsOn: [{ package: 'rules-package', version: '1.0.0', interface: 'rules.api' },
        ...(workflow ? [{ package: standardPkgId, version: '1.0.0', interface: 'r60.files.api' }] : [])],
      elements: [
        { id: lifecycleDefs['app-business'].id, version: '1.0.0',
          definitionRef: await artifactRef('app-business', 'elements/lifecycle.json'), visibility: 'private' },
        { id: 'basic.app', version: '1.0.0', definitionRef: definitionRefs['basic.app'], visibility: 'public' },
        ...(workflow ? [{ id: workflow.child.id, version: workflow.child.version,
          definitionRef: definitionRefs[workflow.child.id], visibility: 'private' }] : []),
      ],
      imports: [refs.evaluate, refs.optionalReport, refs.initializeRule,
        ...(workflow ? workflow.readerRefs : [])],
      ...(workflow ? { workflowRoots: [workflow.rootRef, ...Object.values(workflow.caseRefs)] } : {}),
      exports: [{ elementId: 'basic.app' }, { interfaceId: 'business.api' }],
      targetVariants: variant([
        ...lifeImplementations('app-business'),
        implementation('basic.app', 'submit', businessEntryRef, 'submit', [ruleRef]),
        ...(options.unsupportedEffect === true ? [implementation('basic.app', 'dangerous', businessEntryRef, 'dangerous')] : []),
      ]),
      init: lifecycleRefs['app-business'],
      ...(options.omitBusinessExit === true ? {} : { exit: lifecycleRefs['app-business'] }),
    }),
    ...(workflow ? [standardManifest] : []),
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
      ...(workflow ? [{ package: standardPkgId, version: '1.0.0' }] : []),
    ],
    config: { example: 'basic-domain-app' },
  };
  const input = {
    descriptor, packages,
    packageRoots: { ...dirs, ...(standardRoot ? { [standardPkgId]: standardRoot } : {}) },
    packageArtifacts: {
      ...Object.fromEntries(Object.keys(dirs).map((id) => [id, 'dist/index.mjs'])),
      ...(standardRoot ? { [standardPkgId]: 'dist/index.mjs' } : {}),
    },
    kdpArtifact: { packageId: 'kernel-primary', path: 'dist/index.js' },
  };
  return {
    root, dirs, input, descriptor, definitions,
    domainElements: [knowledge, rules, app, ...(workflow ? [workflow.child, standardDefinition.json, standardDefinition.yaml] : [])],
    ruleRef, refs, workflow,
  };
}

async function installComposedDependencies(label, installRoot) {
  // Workflow App 优先通过 BUILD 封存的受控安装器：先只解析 Lock，再验 SRI，最后 npm ci。
  const installer = join(installRoot, 'dh-install', 'install-runtime.mjs');
  let isWorkflowInstaller = false;
  try {
    await readFile(installer);
    isWorkflowInstaller = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const installArgs = isWorkflowInstaller
    ? [installer, sdkTarball, microkernelTarball, contractsTarball]
    : [npmCli, 'install', sdkTarball, microkernelTarball, contractsTarball, '--no-audit', '--no-fund', '--ignore-scripts'];
  const install = spawnSync(process.execPath, installArgs, {
    cwd: installRoot, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, npm_config_registry: process.env.DH_T05_NPM_REGISTRY ?? process.env.npm_config_registry },
  });
  await evidence(`${label}.composed-package-npm-install`, {
    exit: install.status, signal: install.signal,
    method: isWorkflowInstaller ? 'sealed-lock-first-ci' : 'sdk-only-non-workflow',
  });
  assert.equal(install.status, 0, `${label}: composed App npm install failed\n${install.stdout}\n${install.stderr}`);
  // An admitted Workflow App seals the exact archive SRI pins in the same Lock
  // and ships a first-party verifier; check the resulting external npm install
  // before importing the KDP or any selected third-party executable bytes.
  const trustScript = join(installRoot, 'dh-install', 'verify-runtime.mjs');
  try {
    await readFile(trustScript);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return;
  }
  const verified = spawnSync(process.execPath, [trustScript], {
    cwd: installRoot, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(verified.status, 0,
    `${label}: trusted third-party runtime archive SRI verification failed: ${verified.stderr}`);
  await evidence(`${label}.trusted-runtime-install-sri`, { status: 'PASS', sha512Verified: true });

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

/** T14: full external tarball install → BUILD → Boot/KDP → Package.Init → real XState Workflow. */
async function runWorkflowE2E() {
  const prepared = await authoring('workflow-real-install', { minOrderTotal: 50, regions: ['EU', 'US'] },
    { workflow: true });
  try {
    const first = await buildApp(prepared.input);
    const second = await buildApp(prepared.input);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(second.ok, true, JSON.stringify(second));
    if (!first.ok || !second.ok) throw new Error('T14 selected Workflow must pass real BUILD');
    assert.deepEqual(first.lockBytes, second.lockBytes, 'two actual Workflow BUILDs must yield exact Lock bytes');
    assert.deepEqual(first.appPackage, second.appPackage, 'two actual Workflow BUILDs must yield exact package bytes');
    assert.equal(first.lock.selectedWorkflows?.length, 7, 'parent, child and five independent acceptance roots share one sealed Lock');
    assert.equal(first.lock.selectedElements.filter((item) => item.ref.id.startsWith('basic.data_')).length, 4,
      'two JSON and two YAML Data Elements must be selected, not only files');
    for (const fnName of ['readJson', 'readYaml', 'startWorkflow', 'endWorkflow', 'workflowDecision']) {
      assert.equal(first.lock.selectedFunctions.filter((item) => item.ref.functionId === fnName).length, 1,
        `one selected FunctionRef for ${fnName}, reusable across distinct data Elements`);
    }
    const installed = await materialize('workflow-real-install', first);
    for (const pkg of ['xstate', 'yaml']) {
      const resolved = require.resolve(`${pkg}/package.json`, { paths: [installed.installRoot] });
      assert.ok(resolved.startsWith(join(installed.installRoot, 'node_modules')),
        `${pkg} must be installed in the exact composed consumer root`);
    }
    globalThis.__domainHarnessT05Events = [];
    const booted = await boot(installed.pin, installed.context);
    assert.equal(booted.status, 'BOOTED', JSON.stringify(booted));
    if (booted.status !== 'BOOTED') throw new Error('T14 Workflow App failed real Boot');
    assert.equal(booted.app.status, 'READY');
    const timeline = globalThis.__domainHarnessT05Events;
    const caseBegin = timeline.findIndex((item) => item.event === 'workflow-cases-begin');
    assert.ok(caseBegin > 0, 'acceptance root cases must run after real parent/child XState Workflow');
    const initialTimeline = timeline.slice(0, caseBegin);
    const actualReaders = initialTimeline.filter((item) => item.event === 'workflow-read');
    assert.deepEqual(actualReaders.map((item) => [item.format, item.parsed.id, item.parsed.result]), [
      ['json', 'json-a', 1],
      ['yaml', 'yaml-a', 3],
      ['json', 'json-b', 2],
      ['yaml', 'yaml-b', 4],
    ], 'two JSON and two YAML values must actually drive the same Reader Functions through real XState actors');
    const hooks = initialTimeline.filter((item) => item.event === 'workflow-hook');
    assert.deepEqual(hooks.map((item) => item.kind), ['start', 'end']);
    const startIndex = timeline.findIndex((item) => item.event === 'workflow-hook' && item.kind === 'start');
    const endIndex = timeline.findIndex((item) => item.event === 'workflow-hook' && item.kind === 'end');
    assert.ok(startIndex >= 0 && startIndex < endIndex && endIndex < timeline.findIndex(
      (item) => item.event === 'workflow-read' && item.parsed.id === 'yaml-a'),
    'end must be awaited before the next Workflow Node');
    const outcome = initialTimeline.filter((item) => item.event === 'workflow-outcome');
    assert.equal(outcome.length, 1, 'Package.Init must start exactly one main parent Workflow');
    assert.deepEqual(outcome[0].outcome, {
      status: 'COMPLETE', value: { id: 'yaml-b', result: 4 },
    });
    assert.equal(timeline.filter((item) =>
      item.event === 'package-init' && item.package === 'app-business').length, 1,
    'Workflow children must never reenter Package.Init');
    assert.equal(typeof booted.app.invoke, 'undefined', 'Workflow does not reintroduce public ingress');
    await evidence('t14.workflow.clean-packed-actor', {
      status: 'PASS', selectedWorkflows: 7, dataElements: 4, readerCalls: 4,
      hooks: 2, outcome: outcome[0].outcome, lockDigest: installed.lock.closureDigest,
    });
    const observedCases = timeline.filter((item) => item.event === 'workflow-case');
    assert.deepEqual(observedCases.map((item) => [item.name, item.outcome.status]), [
      ['single', 'COMPLETE'], ['complete', 'COMPLETE'], ['ask', 'ASK'], ['wait', 'WAIT'],
      ['reject', 'REJECT'], ['unknown', 'UNKNOWN'], ['failed', 'FAILED'],
      ['unmatched', 'FAILED'], ['repeat-ask', 'ASK'], ['reservation', 'FAILED'],
      ['shared-budget', 'FAILED'], ['ancestor-depth', 'FAILED'],
    ]);
    const expectCode = (name, code) => {
      const found = observedCases.find((item) => item.name === name);
      assert.equal(found?.outcome?.reason?.code, code, name + ': no valid reason was preserved');
    };
    for (const name of ['ask', 'wait', 'reject', 'repeat-ask']) expectCode(name, 'DH_WORKFLOW_TERMINAL');
    expectCode('unknown', 'T14_BUSINESS_UNKNOWN');
    expectCode('failed', 'T14_BUSINESS_FAILED');
    expectCode('unmatched', 'DH_WORKFLOW_ROUTE_UNMATCHED');
    for (const name of ['reservation', 'shared-budget']) expectCode(name, 'DH_WORKFLOW_CALL_BUDGET');
    expectCode('ancestor-depth', 'DH_WORKFLOW_DEPTH_LIMIT');
    assert.deepEqual(timeline.filter((item) => item.event === 'workflow-decision').map((item) => item.session),
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      'repeated selected WorkflowRef must not share mutable input or stale Route state across independent runs');
    assert.equal(timeline.filter((item) => item.event === 'workflow-hook').length, 2,
      'insufficient leaf budget must refuse before start/end side effects');
    assert.deepEqual(timeline.filter((item) => item.event === 'workflow-read').slice(4).map((item) => item.parsed.id),
      ['yaml-b', 'json-a'],
      'single node executes; nested call budget denies the child before any further Reader');
    const businessEntry = timeline.find((item) => item.event === 'package-init' && item.package === 'app-business');
    assert.ok(Array.isArray(businessEntry?.initFrom) && businessEntry.initFrom.length > 0,
      'enabled InitFrom must provide caller records to Business Package.Init');
    await evidence('t14.workflow.full-terminal-budget-matrix', {
      status: 'PASS', caseCount: observedCases.length, outcomeKinds: [...new Set(observedCases.map((item) => item.outcome.status))],
      unmatchedRejected: true, rootBudgetRejected: true, ancestorDepthRejected: true,
      nodeReuseIsolated: true, initFromPresent: true,
    });
    await booted.app.dispose();
    assert.ok(timeline.findIndex((item) => item.event === 'package-exit') > timeline.findIndex(
      (item) => item.event === 'workflow-outcome'),
    'business Workflow end must not trigger Package.Exit');

    // Tamper only an installed selected data resource. BUILD and signed Lock remain unchanged.
    const tampered = await cloneInstall(installed);
    const dataPath = join(tampered.installRoot, 'node_modules', 'rules-package',
      'content', 'workflow-json-a.json');
    await writeFile(dataPath, '{"id":"tampered","result":999}\n');
    globalThis.__domainHarnessT05Events = [];
    const refused = await boot(tampered.pin, tampered.context);
    assert.notEqual(refused.status, 'BOOTED', 'tampered BUILD-selected Reader data must never reach READY');
    assert.equal(globalThis.__domainHarnessT05Events.some((item) =>
      item.event === 'workflow-read' && item.parsed.id === 'tampered'), false);
    await evidence('t14.workflow.negative-resource-digest', {
      status: 'PASS', resultStatus: refused.status,
      code: refused.code, executedTamperedReader: false,
    });
    return { dataElements: 4, distinctFiles: 4, readerFunctions: 2, childActors: 1,
      selectedWorkflowDefinitions: 7, caseCount: observedCases.length, terminalMatrix: true,
      rootBudgetRefusal: true, ancestorDepthRefusal: true, scopedNodeReuse: true,
      hookCalls: 2, cleanPacked: true, outcome: 'COMPLETE', tamperRejected: true };
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

/** 可选 Exit/InitFrom 走真正组合安装与 Package.Init，不改 KDP/Kernel 实现。 */
async function runOptionalLifecycleWorkflowE2E() {
  const prepared = await authoring('workflow-no-exit-no-initfrom',
    { minOrderTotal: 50, regions: ['EU', 'US'] },
    { workflow: true, omitBusinessExit: true, omitBusinessInitFrom: true });
  try {
    const built = await buildApp(prepared.input);
    assert.equal(built.ok, true, JSON.stringify(built));
    if (!built.ok) throw new Error('optional lifecycle Workflow did not BUILD');
    const selectedBusiness = built.lock.selectedPackages.find((pkg) => pkg.packageId === 'app-business');
    assert.ok(selectedBusiness, 'selected business Package must be present');
    const installed = await materialize('workflow-no-exit-no-initfrom', built);
    globalThis.__domainHarnessT05Events = [];
    const booted = await boot(installed.pin, installed.context);
    assert.equal(booted.status, 'BOOTED', JSON.stringify(booted));
    if (booted.status !== 'BOOTED') throw new Error('optional lifecycle Workflow did not Boot');
    assert.equal(booted.app.status, 'READY');
    const timeline = globalThis.__domainHarnessT05Events;
    const businessInit = timeline.find((entry) => entry.event === 'package-init' && entry.package === 'app-business');
    assert.ok(businessInit, 'optional business Package.Init must actually execute');
    assert.equal(businessInit.initFrom, undefined, 'InitFrom remains truly absent when not enabled');
    assert.equal(timeline.filter((event) => event.event === 'workflow-outcome').length, 1);
    assert.equal(timeline.find((event) => event.event === 'workflow-outcome')?.outcome?.status, 'COMPLETE');
    assert.equal(timeline.filter((event) => event.event === 'workflow-case').length, 12,
      'all selected Task execution scenarios still work without Package.Exit/InitFrom');
    assert.deepEqual(await booted.app.dispose(), { status: 'DISPOSED' });
    assert.equal(timeline.filter((event) => event.event === 'package-exit' && event.package === 'app-business').length,
      0, 'missing Package.Exit must be a no-op even after all ElementRun.end Hooks');
    assert.ok(timeline.filter((event) => event.event === 'package-exit').length > 0,
      'other Packages retain their separately declared Exit behavior');
    await evidence('t14.workflow.optional-exit-initfrom', {
      status: 'PASS', booted: true, workflow: 'COMPLETE', businessExitCount: 0,
      noInitFrom: true, otherPackageExitRetained: true,
    });
    return { booted: true, businessExitOmitted: true, initFromOmitted: true };
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

/** Actual production KDP ordering, not a mock SelectedWorkflowDriver. */
async function runFatalWorkflowIntegration(fatalAt) {
  const prepared = await authoring(`workflow-fatal-${fatalAt}`,
    { minOrderTotal: 50, regions: ['EU', 'US'] },
    { workflow: true, workflowFatalAt: fatalAt });
  try {
    const built = await buildApp(prepared.input);
    assert.equal(built.ok, true, JSON.stringify(built));
    if (!built.ok) throw new Error('T13 fatal Workflow fixture BUILD failed');
    const install = await materialize(`workflow-fatal-${fatalAt}`, built);
    globalThis.__domainHarnessT05Events = [];
    const failed = await boot(install.pin, install.context);
    assert.equal(failed.status, 'FAILED', `fatal ${fatalAt} must fail through real KDP`);
    assert.equal(failed.code, 'DH_RUNTIME_NOT_READY');
    const timeline = globalThis.__domainHarnessT05Events;
    const hooks = timeline.filter((entry) => entry.event === 'workflow-hook').map((entry) => entry.kind);
    assert.deepEqual(hooks, ['start', 'end'], 'fatal Hook/leaf must attempt end once');
    const startIndex = timeline.findIndex((entry) => entry.event === 'workflow-hook' && entry.kind === 'start');
    const endIndex = timeline.findIndex((entry) => entry.event === 'workflow-hook' && entry.kind === 'end');
    const exitIndex = timeline.findIndex((entry) => entry.event === 'package-exit');
    assert.ok(startIndex >= 0 && endIndex > startIndex && exitIndex > endIndex,
      'production Workflow end MUST complete before first Package.Exit');
    assert.equal(timeline.filter((entry) =>
      entry.event === 'package-init' && entry.package === 'app-business').length, 1);
    assert.equal(timeline.filter((entry) =>
      entry.event === 'package-exit' && entry.package === 'app-business').length, 1,
    'one reverse KDP Exit per entered business Package');
    const unauthorized = timeline.find((entry) => entry.event === 'workflow-unauthorized');
    assert.equal(unauthorized?.outcome?.reason?.code, 'DH_WORKFLOW_UNSELECTED');
    await evidence(`t13.workflow-fatal-${fatalAt}.real-package-init-order`, {
      status: 'PASS', startIndex, endIndex, exitIndex, exitedBusinessOnce: true,
    });
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
  const workflowAcceptance = await runWorkflowE2E();
  await evidence('t14.workflow.acceptance-matrix', { status: 'PASS', ...workflowAcceptance });
  const lifecycleAcceptance = await runOptionalLifecycleWorkflowE2E();
  await runFatalWorkflowIntegration('start');
  await runFatalWorkflowIntegration('leaf');

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
    // AC11–AC20 逐字对应 Product #1605 F01–F10，不沿用旧 Demo 的任意编号。
    // 此处只在所有上方真实断言完成后生成 PASS；上游限定证据明确声明为复用。
    AC11: {
      status: 'PASS_E2E',
      evidence: ['Package.Init→parent 4 nodes→child XState Actor', 'single-node selected root COMPLETE',
        'one Business Init, no second entry', 't14.workflow.clean-packed-actor',
        't14.workflow.full-terminal-budget-matrix'],
    },
    AC12: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['named decision Switch → COMPLETE/ASK/WAIT/REJECT and two non-success routes',
        'unmatched route refused DH_WORKFLOW_ROUTE_UNMATCHED', 'parent node routing and child COMPLETE'],
      upstream: ['T11 #1631 scoped acceptance: contracts workflow-validate tests',
        'T13 #1639 CI2910: workflow-execution.test.ts no silent priority routing'],
    },
    AC13: {
      status: 'PASS_E2E',
      evidence: ['ASK and WAIT are distinct terminal reason outcomes', 'no Resume API/continuation created',
        'workflow-case:ask', 'workflow-case:wait'],
    },
    AC14: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['COMPLETE vs REJECT, UNKNOWN(T14_BUSINESS_UNKNOWN), FAILED(T14_BUSINESS_FAILED)',
        'unmatched label -> FAILED(DH_WORKFLOW_ROUTE_UNMATCHED)', 'fatal errors end before Package.Exit'],
      upstream: ['T13 #1639 CI2910: UNKNOWN/FAILED reason preservation and no success laundering'],
    },
    AC15: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['unselected WorkflowRoot rejected in actual Package.Init',
        'tampered selected JSON Reader resource rejected before Function execution'],
      upstream: ['T11 #1631: workflow validation negative targets, recursion and Switch',
        'T12 #1632 R13 ACCEPT_SCOPED CI2908: tooling/build/tests/core/workflow-selection.test.ts',
        'T12 BUILD direct Extension/private/transitive child and exact FunctionRef import refusals'],
    },
    AC16: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['budget-flow: reservation refused before start Hook',
        'shared-budget-flow: parent Reader consumes last root call; child refused',
        'depth-flow: ancestor maxDescendantWorkflowDepth=0 rejects nested child',
        'main parent/child with legal distinct depth succeeds'],
      upstream: ['T13 #1639 CI2910: packages/microkernel/tests/core/workflow-execution.test.ts',
        'root-shared budgets and multi-ancestor depth validation'],
    },
    AC17: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['main Business InitFrom caller records are present',
        'second clean-packed Workflow App has neither Exit nor InitFrom and still Boots',
        'other Package Exit retained; ElementRun.end never triggers Business Exit',
        lifecycleAcceptance],
      upstream: ['0.11.0 Foundation #1625 ACCEPT_SCOPED: duplicate InitFrom records and reverse Exit order'],
    },
    AC18: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['Boot→KDP Order 0→SDK→Business primary Init', 'no public app.invoke',
        'Init before READY, same BUILD Lock, reverse Package.Exit',
        'no deprecated technicalInit/technicalDispose or second BusinessAppInit'],
      upstream: ['0.11.0 Foundation #1625 ACCEPT_SCOPED',
        'T12 #1632 R13 ACCEPT_SCOPED', 'T13 #1639 CI2910'],
    },
    AC19: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['one selected workflowDecision FunctionRef used eight times with independent A–H inputs',
        'same Reader FunctionRef across two JSON/two YAML content sites',
        'two identical BUILD inputs generate byte-identical whole App Package',
        'fatal start/leaf correctly enter Kernel cleanup after awaited end'],
      upstream: ['T13 #1639 CI2910: concurrent root/child XState Actor instances independent'],
    },
    AC20: {
      status: 'PASS_E2E_WITH_UPSTREAM',
      evidence: ['real independent installed AppPackage + locked npm ci with SRI/ignore-scripts',
        '2 distinct JSON Data Elements → one JsonReader; 2 YAML → one YamlReader',
        'real XState parent/child, start/end Hooks, named Switch, shared budget/depth negatives',
        'T14 clean-packed resource/Pin/KDP/executable tampering refusals',
        workflowAcceptance, lifecycleAcceptance],
      upstream: ['T12 #1632 CI2908: real tampered npm tgz/SRI and disabled install hook',
        'T13 #1639 CI2910: selected Actor failure/UNKNOWN/Reader negatives'],
    },
  };
  const result = { status: 'PASS', ac, events: events.length, sdkEntry };
  await writeFile(join(evidenceDir, 'consumer-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
}

/** R70: reuse the actual T14 authoring fixture inside the Registry-installed SDK consumer. */
async function prepareRegistryWorkflowFixture() {
  const prepared = await authoring('registry-workflow',
    { minOrderTotal: 50, regions: ['EU', 'US'] }, { workflow: true });
  try {
    const built = buildApp(prepared.input);
    assert.equal(built.ok, true, built.ok ? '' : JSON.stringify(built));
    assert.equal(built.lock.selectedWorkflows?.length, 7);
    assert.equal(built.lock.selectedElements.filter((item) =>
      item.ref.id.startsWith('basic.data_')).length, 4);
    assert.deepEqual(built.lock.trustedRuntimeIntegrity?.map((entry) =>
      [entry.name, entry.version]), [['xstate', '5.33.2'], ['yaml', '2.9.1']]);
    const installRoot = join(consumerRoot, 'registry-workflow-app');
    for (const file of built.appPackage.files) await write(installRoot, file.path, file.bytes);
    assert.equal(JSON.parse(await readFile(join(installRoot, 'package.json'), 'utf8'))
      .dependencies['@kaicreator/domain-harness'], '0.11.0');
    console.log('DH_R70_REGISTRY_WORKFLOW_FIXTURE ' + JSON.stringify({
      selectedWorkflows: 7, selectedResources: 4,
      lockDigest: built.lock.closureDigest,
    }));
  } finally {
    await rm(prepared.root, { recursive: true, force: true });
  }
}

try {
  if (registryFixtureOnly) await prepareRegistryWorkflowFixture();
  else await main();
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
