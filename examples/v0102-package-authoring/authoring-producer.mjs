/**
 * Issue #1379 authoring-template EXTERNAL BUILD producer (#1305 minimal).
 * =====================================================================
 *
 * Runs INSIDE an isolated producer install root that has only the four
 * selected public `0.10.2-rc.0` tarballs
 * (`@kaicreator/domain-harness-{contracts,microkernel,host-node,build}`)
 * plus the selected Domain Package tarballs installed. It never imports any
 * repository-relative path: the App sources are staged next to it (via
 * --apps-source) and the K/S/Feature payload bytes are read from the
 * INSTALLED Domain Packages through their public export map.
 *
 * Differences from the T09 producer (examples/v0102-external-producer):
 * this template composes through the PUBLISHED authoring adapter
 * `projectSelectedComponents` — the S non-Tool Feature declaration and the
 * two C Tool declarations are projected onto the selected modules first and
 * the sealed BUILD consumes the projection's module objects — and it
 * re-proves the typed binding negatives plus one real BUILD route negative
 * inside the isolated root before sealing.
 *
 * Usage:
 *   node authoring-producer.mjs --apps-source <dir> [--out <dir>] [--source-sha <sha>]
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { V10_TARGET_PROFILE, sha256Hex } from '@kaicreator/domain-harness-contracts';
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';
import { v10BuildPackageClosureDigest } from '@kaicreator/domain-harness-host-node';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 || args[index + 1] === undefined ? fallback : args[index + 1];
};
const appsSource = resolve(flagValue('--apps-source', join(HERE, 'apps-source')));
const outRoot = resolve(flagValue('--out', join(HERE, 'out')));
const sourceSha = flagValue('--source-sha', 'UNRECORDED');

/** The selected payload packages, addressed ONLY through the public export map. */
const PAYLOAD_SPECIFIERS = Object.freeze({
  kernel: '@kaicreator/domain-kernel-basic',
  sdk: '@kaicreator/domain-standard-basic',
  router: '@kaicreator/domain-standard-basic/workflow-router',
  'sfeature-semantic-decision': '@kaicreator/domain-feature-semantic-decision',
});

/** The four v0.10.1 unselected advanced features whose imports stay refused. */
const UNSELECTED_FEATURES = Object.freeze([
  '@kaicreator/domain-feature-agent-diagnostics',
  '@kaicreator/domain-feature-bounded-experiment',
  '@kaicreator/domain-feature-candidate-evaluation',
  '@kaicreator/domain-feature-experience-reuse',
]);

/** The retired legacy surfaces that must be unreachable in a producer root. */
const RETIRED_IMPORTS = Object.freeze([
  '@kaicreator/domain-harness-compiler/v10build',
  '@kaicreator/domain-harness-compiler',
  '@kaicreator/domain-harness',
]);

const RUNTIME_FILES = Object.freeze([
  'app.mjs', 'resolution-log.mjs', 'runtime-shared.mjs', 'runtime-authoring.mjs', 'plain-store.mjs',
]);

function readPayload(name) {
  const url = import.meta.resolve(PAYLOAD_SPECIFIERS[name]);
  return { bytes: readFileSync(fileURLToPath(url), 'utf8'), resolved: url, specifier: PAYLOAD_SPECIFIERS[name] };
}

/** BUILD-style vendored Standard bundle: SDK bytes + the pure WorkflowRouter. */
function standardBundle(sdk, router) {
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.10.2 authoring-template BUILD: the pure Standard WorkflowRouter vendored
// into the selected Standard Primary bytes (the v0.9 bridge strategy).
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

async function refuseImport(specifier) {
  try {
    await import(specifier);
    return { specifier, refused: false, problem: 'the import unexpectedly resolved' };
  } catch (error) {
    const code = error?.code ?? null;
    const refused = code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED';
    return { specifier, refused, code, problem: refused ? null : `unexpected failure mode: ${code ?? error?.name}` };
  }
}

function moduleInput(entry, appDir, payloads, provenance) {
  let source;
  let origin;
  if (entry.role === 'kernel-primary') {
    source = payloads.kernel.bytes;
    origin = { kind: 'installed-domain-package', specifier: payloads.kernel.specifier, resolved: payloads.kernel.resolved };
  } else if (entry.role === 'standard-primary') {
    source = payloads.standard.bytes;
    origin = { kind: 'derived-bundle', from: [payloads.sdk.specifier, payloads.router.specifier] };
  } else if (entry.payload !== undefined) {
    const payload = payloads[entry.payload];
    source = payload.bytes;
    origin = { kind: 'installed-domain-package', specifier: payload.specifier, resolved: payload.resolved };
  } else {
    source = readFileSync(join(appDir, 'modules', entry.file), 'utf8');
    origin = { kind: 'app-file', file: `modules/${entry.file}` };
  }
  provenance.push({ packageId: entry.packageId, role: entry.role, sha256: sha256Hex(source), origin });
  const input = {
    packageId: entry.packageId,
    role: entry.role,
    abiVersion: entry.abiVersion,
    moduleSource: source,
    moduleSha256: sha256Hex(source),
    endpoint: entry.endpoint,
    dependencies: [],
    provides: [...entry.provides],
    requires: [],
  };
  if (entry.featureExport !== undefined) input.featureExport = entry.featureExport;
  if (entry.capabilityId !== undefined) input.capabilityId = entry.capabilityId;
  if (entry.handlers !== undefined) input.handlers = entry.handlers.map((handler) => ({ ...handler }));
  if (entry.externalEffect !== undefined) input.externalEffect = entry.externalEffect;
  return input;
}

function refuses(fn, code) {
  try {
    fn();
  } catch (error) {
    if (error?.code !== code) throw new Error(`expected typed refusal ${code}, got ${String(error?.code)}: ${String(error?.message).slice(0, 200)}`);
    return;
  }
  throw new Error(`expected typed refusal ${code}, but the call succeeded`);
}

// ---- (1) fail-closed graph probes -----------------------------------------
const negativeProbes = [];
for (const specifier of RETIRED_IMPORTS) negativeProbes.push(await refuseImport(specifier));
for (const specifier of UNSELECTED_FEATURES) negativeProbes.push(await refuseImport(specifier));
const probeFailures = negativeProbes.filter((probe) => probe.refused !== true);
if (probeFailures.length !== 0) {
  mkdirSync(outRoot, { recursive: true });
  const report = { ok: false, stage: 'graph-probes', failures: probeFailures };
  writeFileSync(join(outRoot, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report));
  process.exitCode = 1;
  throw new Error(`authoring producer graph probes failed: ${JSON.stringify(probeFailures)}`);
}

// ---- (2) read the selected payload from the INSTALLED Domain Packages ------
const payloads = {
  kernel: readPayload('kernel'),
  sdk: readPayload('sdk'),
  router: readPayload('router'),
  'sfeature-semantic-decision': readPayload('sfeature-semantic-decision'),
};
payloads.standard = { bytes: standardBundle(payloads.sdk.bytes, payloads.router.bytes), specifier: null };

// ---- (3) assemble the selected modules and project the Components ---------
const appDir = join(appsSource, 'apps', 'authoring');
const definitionModule = await import(pathToFileURL(join(appDir, 'app-definition.mjs')).href);
const definition = definitionModule.definition;
if (definition === undefined) throw new Error('authoring app-definition.mjs is missing the `definition` export');
const provenance = [];
const kernelInput = moduleInput(definition.modules[0], appDir, payloads, provenance);
const standardInput = moduleInput(definition.modules[1], appDir, payloads, provenance);
const featureInput = moduleInput(definition.modules[2], appDir, payloads, provenance);
const businessInput = moduleInput(definition.modules[3], appDir, payloads, provenance);
const inventoryInput = moduleInput(definition.modules[4], appDir, payloads, provenance);
const jobsInput = moduleInput(definition.modules[5], appDir, payloads, provenance);

// The #1305 authoring path: the published BUILD adapter maps the S non-Tool
// semantic declaration and the two C Tool declarations onto the selected
// modules; the sealed BUILD below consumes the projection's module objects.
const declarations = [
  { class: 'semantic', kind: 'decision', componentId: 'semantic.authoring-decision', modulePackageId: featureInput.packageId, entry: featureInput.featureExport },
  { class: 'tool', kind: 'package-operation', componentId: 'tool.inventory-read', modulePackageId: inventoryInput.packageId, operationId: 'inventory.get', handler: 'getInventory', externalEffect: false },
  { class: 'tool', kind: 'package-operation', componentId: 'tool.jobs-submit', modulePackageId: jobsInput.packageId, operationId: 'jobs.submit', handler: 'submitJob', externalEffect: true },
];
const selectedForProjection = [featureInput, inventoryInput, jobsInput];
const projection = projectSelectedComponents(declarations, selectedForProjection);
if (projection.modules.length !== 3 || projection.modules[0] !== featureInput ||
    projection.modules[1] !== inventoryInput || projection.modules[2] !== jobsInput) {
  throw new Error('the projection did not return the original selected module objects');
}
if (projection.bindings.map((binding) => binding.class).join(',') !== 'semantic,tool,tool') {
  throw new Error(`unexpected projection classes: ${JSON.stringify(projection.bindings)}`);
}

// Typed binding negatives, re-proved inside this isolated public-tarball root.
const bindingNegatives = [];
const recordNegative = (label, fn, code) => {
  try {
    fn();
  } catch (error) {
    if (error?.code !== code) throw new Error(`${label}: expected ${code}, got ${String(error?.code)}`);
    bindingNegatives.push({ label, code });
    return;
  }
  throw new Error(`${label}: expected typed refusal ${code}, but the call succeeded`);
};
recordNegative('semantic-wrong-entry', () => projectSelectedComponents([{ ...declarations[0], entry: 'privateHelper' }], [featureInput]), 'V10_EXPORT_CONTRACT_REFUSED');
recordNegative('tool-undeclared-operation', () => projectSelectedComponents([{ ...declarations[1], operationId: 'private.helper' }], [inventoryInput]), 'V10_EXPORT_CONTRACT_REFUSED');
recordNegative('tool-effect-parity', () => projectSelectedComponents([{ ...declarations[2], externalEffect: false }], [jobsInput]), 'V10_EXPORT_CONTRACT_REFUSED');
recordNegative('duplicate-component', () => projectSelectedComponents([declarations[1], declarations[1]], [inventoryInput]), 'BUILD_GRAPH_INVALID');
recordNegative('remote-operation-unsupported', () => projectSelectedComponents([{ ...declarations[1], kind: 'remote-operation' }], [inventoryInput]), 'V10_EXPORT_CONTRACT_REFUSED');

// ---- (4) seal the App through the public BUILD ----------------------------
const sealedModules = [
  kernelInput,
  standardInput,
  projection.modules[0],
  businessInput,
  projection.modules[1],
  projection.modules[2],
];
const buildInput = {
  appId: definition.appId,
  audience: definition.audience,
  buildId: definition.buildId,
  targetProfile: V10_TARGET_PROFILE,
  modules: sealedModules,
  routes: definition.routes.map((route) => ({ ...route })),
  hardBudget: { ...definition.hardBudget },
};
const built = buildV10App(buildInput);

// One REAL BUILD negative: a route claiming a handler the sealed binding
// does not pin must refuse typed (wrong binding at the BUILD layer).
recordNegative('build-wrong-route-handler', () => buildV10App({
  ...buildInput,
  routes: [definition.routes[0], { ...definition.routes[1], handlerId: 'notTheSealedHandler' }],
}), 'V10_ROUTE_INVALID');

// ---- (5) stage the sealed App package -------------------------------------
rmSync(outRoot, { recursive: true, force: true });
const outDir = join(outRoot, 'authoring');
mkdirSync(join(outDir, 'modules'), { recursive: true });
for (const entry of definition.modules.filter((module) => module.file !== undefined)) {
  const source = readFileSync(join(appDir, 'modules', entry.file));
  writeFileSync(join(outDir, 'modules', entry.file), source);
}
const runtimeDir = join(appsSource, 'runtime');
for (const file of RUNTIME_FILES) {
  if (!existsSync(join(runtimeDir, file))) throw new Error(`missing staged runtime file ${file}`);
  cpSync(join(runtimeDir, file), join(outDir, file));
}
cpSync(join(appDir, 'scenario.mjs'), join(outDir, 'scenario.mjs'));
const packageJson = {
  name: '@kaicreator-example/v0102-authoring-app',
  version: '1.0.0',
  private: true,
  description: 'v0.10.2 #1379/#1305 minimal authoring-template Domain App (S non-Tool Feature + B private helper + read-only and external-effect C modules)',
  type: 'module',
  main: 'app.mjs',
  files: ['app.mjs', 'resolution-log.mjs', 'runtime-shared.mjs', 'runtime-authoring.mjs', 'plain-store.mjs', 'scenario.mjs', 'app.build.json', 'manifest.json', 'provenance.json', 'modules'],
};
writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(join(outDir, 'app.build.json'), `${JSON.stringify(built, null, 2)}\n`);
const closureDigest = v10BuildPackageClosureDigest(built);
const manifest = {
  schema: 'dh.v0102.authoring.app-manifest/1',
  app: definition.appId,
  buildId: definition.buildId,
  packageName: packageJson.name,
  sourceSha,
  targetProfile: V10_TARGET_PROFILE,
  deployment: { ...definition.deployment },
  subjectDigest: built.subjectDigest,
  packageClosureDigest: closureDigest,
  loadOrder: [...built.loadOrder],
  modules: built.modules.map((module) => ({
    packageId: module.packageId,
    role: module.role,
    abiVersion: module.abiVersion,
    moduleSha256: module.moduleSha256,
    bytes: Buffer.byteLength(module.moduleSource, 'utf8'),
    externalEffect: module.externalEffect ?? false,
  })),
  buildInputSha256: createHash('sha256').update(JSON.stringify({
    appId: definition.appId,
    audience: definition.audience,
    buildId: definition.buildId,
    modules: sealedModules.map((module) => ({ packageId: module.packageId, moduleSha256: module.moduleSha256, provides: module.provides })),
    routes: definition.routes,
  })).digest('hex'),
};
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(outDir, 'provenance.json'), `${JSON.stringify({ schema: 'dh.v0102.authoring.module-provenance/1', sourceSha, modules: provenance }, null, 2)}\n`);

const buildReport = {
  schema: 'dh.v0102.authoring-producer.build-report/1',
  ok: true,
  sourceSha,
  node: process.versions.node,
  producerRoot: HERE,
  appsSource,
  negativeProbes,
  projection: {
    declarations: declarations.map((declaration) => ({ class: declaration.class, componentId: declaration.componentId })),
    selected: projection.modules.map((module) => module.packageId),
    bindingNegatives,
  },
  app: {
    appId: definition.appId,
    buildId: definition.buildId,
    subjectDigest: built.subjectDigest,
    packageClosureDigest: closureDigest,
    modules: built.modules.length,
    loadOrder: [...built.loadOrder],
  },
};
writeFileSync(join(outRoot, 'build-report.json'), `${JSON.stringify(buildReport, null, 2)}\n`);
console.log(JSON.stringify(buildReport));
