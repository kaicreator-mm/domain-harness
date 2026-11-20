/**
 * v0.10.2 T09 (#1330/#1309) — the EXTERNAL BUILD producer.
 *
 * Runs INSIDE an isolated producer install root that has only the four
 * selected public `0.10.2-rc.0` tarballs
 * (`@kaicreator/domain-harness-{contracts,microkernel,host-node,build}`)
 * plus the selected Domain Package tarballs installed. It never imports any
 * repository-relative path: the App sources it compiles are staged next to
 * it (via --apps-source), and the K/S/feature payload bytes are read from
 * the INSTALLED Domain Packages through their public export map.
 *
 * Before building anything it fail-closed probes its own graph: the retired
 * legacy Compiler (root and the `v10build` deep alias the v0.10.1 Feature
 * build-probe.mjs files depended on) and the legacy core must be
 * unreachable, and the four unselected advanced feature packages must not
 * resolve. Every probe outcome is part of the build report.
 *
 * Output per App (same sealed-package layout the clean consumers install):
 *   out/<outDir>/{package.json, app.build.json, manifest.json, provenance.json,
 *                 app.mjs, resolution-log.mjs, runtime-*.mjs|sqlite-open.mjs,
 *                 scenario.mjs, modules/*.mjs, candidates/}
 *
 * Usage:
 *   node producer.mjs --apps-source <dir> [--out <dir>] [--source-sha <sha>]
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { V10_TARGET_PROFILE, sha256Hex } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '@kaicreator/domain-harness-build';
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
mkdirSync(outRoot, { recursive: true });

/** The selected payload packages, addressed ONLY through the public export map. */
const PAYLOAD_SPECIFIERS = Object.freeze({
  kernel: '@kaicreator/domain-kernel-basic',
  sdk: '@kaicreator/domain-standard-basic',
  router: '@kaicreator/domain-standard-basic/workflow-router',
  'sfeature-semantic-decision': '@kaicreator/domain-feature-semantic-decision',
  'sfeature-workflow-control': '@kaicreator/domain-feature-workflow-control',
  'sfeature-context-assembly': '@kaicreator/domain-feature-context-assembly',
  'sfeature-decision-evidence': '@kaicreator/domain-feature-decision-evidence',
});

/** The four v0.10.1 unselected advanced features whose build-probe deep imports stay refused. */
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

const RUNTIME_FILES = Object.freeze({
  Tiny: ['app.mjs', 'resolution-log.mjs', 'runtime-shared.mjs', 'runtime-tiny.mjs', 'plain-store.mjs'],
  Rich: ['app.mjs', 'resolution-log.mjs', 'runtime-shared.mjs', 'runtime-core.mjs', 'sqlite-open.mjs'],
});

function readPayload(name) {
  const url = import.meta.resolve(PAYLOAD_SPECIFIERS[name]);
  return { bytes: readFileSync(fileURLToPath(url), 'utf8'), resolved: url, specifier: PAYLOAD_SPECIFIERS[name] };
}

/** BUILD-style vendored Standard bundle: SDK bytes + the pure WorkflowRouter. */
function standardBundle(sdk, router) {
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.10.2 external-producer BUILD: the pure Standard WorkflowRouter vendored
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
  if (entry.providerId !== undefined) input.providerId = entry.providerId;
  if (entry.hookExport !== undefined) input.hookExport = entry.hookExport;
  if (entry.featureExport !== undefined) input.featureExport = entry.featureExport;
  if (entry.capabilityId !== undefined) input.capabilityId = entry.capabilityId;
  if (entry.handlers !== undefined) input.handlers = entry.handlers.map((handler) => ({ ...handler }));
  if (entry.externalEffect !== undefined) input.externalEffect = entry.externalEffect;
  if (entry.externalImports !== undefined) input.externalImports = entry.externalImports;
  return input;
}

function buildDefinition(target, appDir, payloads, runtimeDir) {
  const provenance = [];
  const modules = target.definition.modules.map((entry) => moduleInput(entry, appDir, payloads, provenance));
  const built = buildV10App({
    appId: target.definition.appId,
    audience: target.definition.audience,
    targetProfile: V10_TARGET_PROFILE,
    modules,
    routes: target.definition.routes.map((route) => ({ ...route })),
    hardBudget: { ...target.definition.hardBudget },
    buildId: target.definition.buildId,
  });
  const closureDigest = v10BuildPackageClosureDigest(built);
  const outDir = join(outRoot, target.outDir);
  const appModules = target.definition.modules.filter((entry) => entry.file !== undefined);
  for (const entry of appModules) {
    mkdirSync(join(outDir, 'modules'), { recursive: true });
    cpSync(join(appDir, 'modules', entry.file), join(outDir, 'modules', entry.file));
  }
  if (existsSync(join(appDir, 'candidates'))) {
    cpSync(join(appDir, 'candidates'), join(outDir, 'candidates'), { recursive: true });
  }
  for (const file of RUNTIME_FILES[target.profile]) {
    cpSync(join(runtimeDir, file), join(outDir, file));
  }
  cpSync(join(appDir, 'scenario.mjs'), join(outDir, 'scenario.mjs'));
  const packageJson = {
    name: target.packageName,
    version: '1.0.0',
    private: true,
    description: target.description,
    type: 'module',
    main: 'app.mjs',
    files: ['app.mjs', 'resolution-log.mjs', 'runtime-shared.mjs', 'runtime-tiny.mjs', 'plain-store.mjs', 'runtime-core.mjs', 'sqlite-open.mjs', 'scenario.mjs', 'app.build.json', 'manifest.json', 'provenance.json', 'modules', 'candidates'],
  };
  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(join(outDir, 'app.build.json'), `${JSON.stringify(built, null, 2)}\n`);
  const manifest = {
    schema: 'dh.v10.clean-app-manifest/1',
    app: target.definition.appId,
    buildId: target.definition.buildId,
    packageName: target.packageName,
    sourceSha,
    targetProfile: V10_TARGET_PROFILE,
    deployment: { ...target.definition.deployment },
    subjectDigest: built.subjectDigest,
    packageClosureDigest: closureDigest,
    loadOrder: [...built.loadOrder],
    modules: built.modules.map((module) => ({
      packageId: module.packageId,
      role: module.role,
      abiVersion: module.abiVersion,
      moduleSha256: module.moduleSha256,
      bytes: Buffer.byteLength(module.moduleSource, 'utf8'),
      externalImports: module.externalImports ?? null,
      externalEffect: module.externalEffect ?? false,
    })),
    buildInputSha256: createHash('sha256').update(JSON.stringify({
      appId: target.definition.appId,
      audience: target.definition.audience,
      buildId: target.definition.buildId,
      modules: modules.map((module) => ({ packageId: module.packageId, moduleSha256: module.moduleSha256, provides: module.provides })),
      routes: target.definition.routes,
    })).digest('hex'),
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDir, 'provenance.json'), `${JSON.stringify({ schema: 'dh.v0102.producer.module-provenance/1', sourceSha, profile: target.profile, modules: provenance }, null, 2)}\n`);
  return { built, closureDigest, manifest, provenance };
}

// ---- (1) fail-closed graph probes -----------------------------------------
const negativeProbes = [];
for (const specifier of RETIRED_IMPORTS) negativeProbes.push(await refuseImport(specifier));
for (const specifier of UNSELECTED_FEATURES) negativeProbes.push(await refuseImport(specifier));
const probeFailures = negativeProbes.filter((probe) => probe.refused !== true);
if (probeFailures.length !== 0) {
  const report = { ok: false, stage: 'graph-probes', failures: probeFailures };
  writeFileSync(join(outRoot, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.error(JSON.stringify(report));
  process.exitCode = 1;
  throw new Error(`external producer graph probes failed: ${JSON.stringify(probeFailures)}`);
}

// ---- (2) read the selected payload from the INSTALLED Domain Packages ------
const kernel = readPayload('kernel');
const sdk = readPayload('sdk');
const router = readPayload('router');
const payloads = {
  kernel,
  sdk,
  router,
  standard: { bytes: standardBundle(sdk.bytes, router.bytes), specifier: null },
};
for (const name of ['sfeature-semantic-decision', 'sfeature-workflow-control', 'sfeature-context-assembly', 'sfeature-decision-evidence']) {
  payloads[name] = readPayload(name);
}

// ---- (3) BUILD every configured App ---------------------------------------
const appTargets = JSON.parse(readFileSync(join(HERE, 'producer-apps.json'), 'utf8'));
const runtimeDir = join(appsSource, 'runtime');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const results = [];
for (const target of appTargets.apps) {
  const appDir = join(appsSource, 'apps', target.name);
  const definitionModule = await import(pathToFileURL(join(appDir, 'app-definition.mjs')).href);
  const definition = definitionModule[target.definitionEntry];
  if (definition === undefined) throw new Error(`${target.name}/${target.definitionEntry} is missing from the staged app definition`);
  mkdirSync(join(outRoot, target.outDir), { recursive: true });
  const result = buildDefinition({ ...target, definition }, appDir, payloads, runtimeDir);
  results.push({
    outDir: target.outDir,
    app: definition.appId,
    buildId: definition.buildId,
    profile: target.profile,
    subjectDigest: result.built.subjectDigest,
    packageClosureDigest: result.closureDigest,
    modules: result.manifest.modules.length,
    provenance: result.provenance,
  });
}

const buildReport = {
  schema: 'dh.v0102.external-producer.build-report/1',
  ok: true,
  sourceSha,
  node: process.versions.node,
  producerRoot: HERE,
  appsSource,
  negativeProbes,
  apps: results.map(({ provenance, ...rest }) => rest),
};
writeFileSync(join(outRoot, 'build-report.json'), `${JSON.stringify(buildReport, null, 2)}\n`);
console.log(JSON.stringify(buildReport));
