/**
 * v0.10 clean-consumer BUILD recipe (#1180 T11).
 *
 * Runs INSIDE an isolated builder directory that has only the packed
 * `@kaicreator/domain-harness-contracts`, `@kaicreator/domain-harness-build`,
 * `@kaicreator/domain-harness-microkernel` and `@kaicreator/domain-harness-host-node` tarballs plus the packed Domain Package tarballs (`@kaicreator/domain-kernel-basic`,
 * `-standard-basic`, `-feature-*`) installed — no repository source path is imported.
 * For each App it reads the selected payload bytes from the INSTALLED Domain Packages, the
 * App-owned Business/Capability/K-extension/S-feature bytes from its own
 * `modules/` directory, calls the once-only static BUILD, and writes a
 * self-contained installable App directory:
 *
 *   out/<app>/{package.json, app.build.json, manifest.json, app.mjs,
 *              runtime-core.mjs, scenario.mjs, modules/*.mjs}
 *
 * Usage: node build-apps.mjs [--out <dir>] [--source-sha <sha>]
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { V10_TARGET_PROFILE, sha256Hex } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '@kaicreator/domain-harness-build';
import { v10BuildPackageClosureDigest } from '@kaicreator/domain-harness-host-node';

import { definition as tinyDefinition } from './apps/tiny/app-definition.mjs';
import { definitionV1 as richV1Definition, definitionV2 as richV2Definition } from './apps/rich/app-definition.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 || args[index + 1] === undefined ? fallback : args[index + 1];
};
const outRoot = resolve(flagValue('--out', join(HERE, 'out')));
const sourceSha = flagValue('--source-sha', 'UNRECORDED');

const PAYLOAD_SPECIFIERS = Object.freeze({
  kernel: '@kaicreator/domain-kernel-basic',
  sdk: '@kaicreator/domain-standard-basic',
  router: '@kaicreator/domain-standard-basic/workflow-router',
  'sfeature-semantic-decision': '@kaicreator/domain-feature-semantic-decision',
  'sfeature-workflow-control': '@kaicreator/domain-feature-workflow-control',
  'sfeature-context-assembly': '@kaicreator/domain-feature-context-assembly',
  'sfeature-decision-evidence': '@kaicreator/domain-feature-decision-evidence',
});

function readPayload(name) {
  const url = import.meta.resolve(PAYLOAD_SPECIFIERS[name]);
  return readFileSync(fileURLToPath(url), 'utf8');
}

/** BUILD-style vendored Standard bundle: SDK bytes + the pure WorkflowRouter. */
function standardBundle(sdk, router) {
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.10 clean-consumer BUILD: the pure Standard WorkflowRouter vendored into
// the selected Standard Primary bytes (the v0.9 bridge strategy).
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

function readAppModule(appDir, file) {
  return readFileSync(join(appDir, 'modules', file), 'utf8');
}

function moduleInput(entry, appDir, payloads) {
  let source;
  if (entry.role === 'kernel-primary') source = payloads.kernel;
  else if (entry.role === 'standard-primary') source = payloads.standard;
  else if (entry.payload !== undefined) source = payloads[entry.payload];
  else source = readAppModule(appDir, entry.file);
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

function buildDefinition(definition, appDir, payloads, runtimeDir) {
  const modules = definition.modules.map((entry) => moduleInput(entry, appDir, payloads));
  const built = buildV10App({
    appId: definition.appId,
    audience: definition.audience,
    targetProfile: V10_TARGET_PROFILE,
    modules,
    routes: definition.routes.map((route) => ({ ...route })),
    hardBudget: { ...definition.hardBudget },
    buildId: definition.buildId,
  });
  const closureDigest = v10BuildPackageClosureDigest(built);
  const appModules = definition.modules.filter((entry) => entry.file !== undefined);
  for (const entry of appModules) {
    mkdirSync(join(definition.outDir, 'modules'), { recursive: true });
    cpSync(join(appDir, 'modules', entry.file), join(definition.outDir, 'modules', entry.file));
  }
  if (existsSync(join(appDir, 'candidates'))) {
    cpSync(join(appDir, 'candidates'), join(definition.outDir, 'candidates'), { recursive: true });
  }
  cpSync(join(runtimeDir, 'app.mjs'), join(definition.outDir, 'app.mjs'));
  cpSync(join(runtimeDir, 'runtime-core.mjs'), join(definition.outDir, 'runtime-core.mjs'));
  cpSync(join(runtimeDir, 'sqlite-open.mjs'), join(definition.outDir, 'sqlite-open.mjs'));
  cpSync(join(runtimeDir, 'resolution-log.mjs'), join(definition.outDir, 'resolution-log.mjs'));
  cpSync(join(appDir, 'scenario.mjs'), join(definition.outDir, 'scenario.mjs'));
  const packageJson = {
    name: definition.packageName,
    version: '1.0.0',
    private: true,
    description: definition.description,
    type: 'module',
    main: 'app.mjs',
    files: ['app.mjs', 'runtime-core.mjs', 'sqlite-open.mjs', 'resolution-log.mjs', 'scenario.mjs', 'app.build.json', 'manifest.json', 'modules', 'candidates'],
  };
  writeFileSync(join(definition.outDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(join(definition.outDir, 'app.build.json'), `${JSON.stringify(built, null, 2)}\n`);
  const manifest = {
    schema: 'dh.v10.clean-app-manifest/1',
    app: definition.appId,
    buildId: definition.buildId,
    packageName: definition.packageName,
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
      externalImports: module.externalImports ?? null,
      externalEffect: module.externalEffect ?? false,
    })),
    buildInputSha256: createHash('sha256').update(JSON.stringify({
      appId: definition.appId,
      audience: definition.audience,
      buildId: definition.buildId,
      modules: modules.map((module) => ({ packageId: module.packageId, moduleSha256: module.moduleSha256, provides: module.provides })),
      routes: definition.routes,
    })).digest('hex'),
  };
  writeFileSync(join(definition.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { built, closureDigest, manifest };
}

const runtimeDir = join(HERE, 'runtime');
const payloads = {
  kernel: readPayload('kernel'),
  sdk: readPayload('sdk'),
  router: readPayload('router'),
};
payloads.standard = standardBundle(payloads.sdk, payloads.router);
for (const name of ['sfeature-semantic-decision', 'sfeature-workflow-control', 'sfeature-context-assembly', 'sfeature-decision-evidence']) {
  payloads[name] = readPayload(name);
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const targets = [
  {
    ...tinyDefinition,
    outDir: join(outRoot, 'tiny'),
    appDirName: 'tiny',
    packageName: '@kaicreator-example/v010-tiny-app',
    description: 'v0.10 T11 Tiny clean-packed Domain App (K/S Basic + one B + its necessary C)',
  },
  {
    ...richV1Definition,
    outDir: join(outRoot, 'rich-v1'),
    appDirName: 'rich',
    packageName: '@kaicreator-example/v010-rich-app',
    description: 'v0.10 T11 Rich clean-packed Domain App BUILD v1',
  },
  {
    ...richV2Definition,
    outDir: join(outRoot, 'rich-v2'),
    appDirName: 'rich',
    packageName: '@kaicreator-example/v010-rich-app-v2',
    description: 'v0.10 T11 Rich clean-packed Domain App BUILD v2 (new approved version)',
  },
];

const results = [];
for (const target of targets) {
  mkdirSync(target.outDir, { recursive: true });
  const appDir = join(HERE, 'apps', target.appDirName);
  const result = buildDefinition(target, appDir, payloads, runtimeDir);
  results.push({
    outDir: target.outDir,
    app: target.appId,
    buildId: target.buildId,
    subjectDigest: result.built.subjectDigest,
    packageClosureDigest: result.closureDigest,
    modules: result.manifest.modules.length,
  });
}

writeFileSync(join(outRoot, 'build-report.json'), `${JSON.stringify({ schema: 'dh.v10.clean-build-report/1', sourceSha, apps: results }, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, sourceSha, apps: results }));
