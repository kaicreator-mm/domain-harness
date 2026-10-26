/**
 * Issue #1379 authoring-template physical acceptance check (#1305 minimal).
 * =====================================================================
 *
 * Local Node24 Validator driver. Run from the repository root AFTER
 * `npm ci && npm run build`:
 *
 *   node examples/v0102-package-authoring/authoring-template-check.mjs \
 *     [--evidence <file.json>] [--keep]
 *
 * It proves, with real npm tarballs and real processes (no repo-relative
 * import ever enters the producer or consumer):
 *
 *   1. pack  — `npm pack` of the four selected public workspaces and the
 *              three selected Domain Packages (kernel basic, standard basic,
 *              semantic-decision feature);
 *   2. BUILD — an isolated producer root installs ONLY those tarballs and
 *              seals the #1305 minimal authoring App through the PUBLIC
 *              `projectSelectedComponents` + `buildV10App` (S non-Tool
 *              Feature + B private helper + read-only/effect C modules),
 *              after fail-closed graph probes and six typed binding/route
 *              negatives;
 *   3. pack  — the sealed App becomes a real tarball;
 *   4. run   — a clean consumer root installs contracts + microkernel +
 *              the Domain Packages + the sealed App (NO BUILD, NO Compiler,
 *              NO Host-node, NO better-sqlite3) and executes the
 *              authoring-basic journey: selection, non-Tool S Feature,
 *              private-helper + read-only C, GOVERNED permitted effect
 *              dispatch, PERMITLESS typed refusal with zero adapter
 *              dispatch, closed facade;
 *   5. seals — installed provenance: every sealed module's bytes equal the
 *              sha256 of what the CONSUMER installed (Domain Packages) or
 *              the staged App sources.
 *
 * Exit code 0 only when every stage passes; the evidence JSON records the
 * literal exit codes, SHAs and step names. T09 (#1330) remains the separate
 * Tiny/Rich physical evidence — this template does not replace or re-run it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TEMPLATE_DIR = join(REPO_ROOT, 'examples', 'v0102-package-authoring');
const CLEAN_RUNTIME_DIR = join(REPO_ROOT, 'examples', 'v010-clean-consumer', 'runtime');
const NPM_REGISTRY = process.env.T11_NPM_REGISTRY ?? 'http://localhost:14873';
const SOURCE_SHA = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const args = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 || args[index + 1] === undefined ? fallback : args[index + 1];
};
const evidencePath = flagValue('--evidence', null);
const keepRoots = args.includes('--keep');

/** Exactly the T09 npm discipline: run the npm CLI JS with THIS node binary. */
function resolveNpmCli() {
  const execpath = process.env.npm_execpath;
  if (execpath !== undefined && execpath.endsWith('.js') && existsSync(execpath)) return execpath;
  if (process.platform === 'win32') {
    const candidates = execFileSync('where', ['npm.cmd'], { encoding: 'utf8' })
      .split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
    for (const candidate of candidates) {
      const cli = join(dirname(candidate), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (existsSync(cli)) return cli;
    }
  }
  const which = execFileSync('which', ['npm'], { encoding: 'utf8' }).trim();
  const resolved = execFileSync('node', ['-e', `console.log(require('fs').realpathSync(${JSON.stringify(which)}))`], { encoding: 'utf8' }).trim();
  if (resolved.endsWith('.js')) return resolved;
  throw new Error('cannot resolve the npm CLI JavaScript');
}
const NPM_CLI = resolveNpmCli();

function npm(args, cwd) {
  return execFileSync(process.execPath, [NPM_CLI, ...args], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, npm_config_registry: NPM_REGISTRY }, timeout: 600_000,
  });
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function pack(target, destination, cwd = REPO_ROOT) {
  const report = JSON.parse(npm(['pack', target, '--pack-destination', destination, '--json'], cwd));
  assert.equal(report.length, 1, `npm pack ${target} produced ${report.length} tarballs`);
  const tarball = join(destination, report[0].filename);
  return { tarball, sha256: sha256File(tarball) };
}
function packWorkspace(name, destination) {
  const report = JSON.parse(npm(['pack', '-w', name, '--pack-destination', destination, '--json'], REPO_ROOT));
  assert.equal(report.length, 1, `npm pack -w ${name} produced ${report.length} tarballs`);
  const tarball = join(destination, report[0].filename);
  return { tarball, sha256: sha256File(tarball) };
}

function writeConsumer(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: `t1379-${basename(dir)}`, private: true, type: 'module' }, null, 2)}\n`);
}

function lockPackageNames(root) {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const names = new Set();
  for (const key of Object.keys(lock.packages ?? {})) {
    const marker = 'node_modules/';
    const at = key.lastIndexOf(marker);
    if (at < 0) continue;
    const tail = key.slice(at + marker.length);
    if (tail.length === 0) continue;
    names.add(tail.startsWith('@') ? tail.split('/').slice(0, 2).join('/') : tail.split('/')[0]);
  }
  return names;
}
function installedTopLevel(root) {
  return readdirSync(join(root, 'node_modules')).flatMap((name) => name.startsWith('@') ? readdirSync(join(root, 'node_modules', name)).map((child) => `${name}/${child}`) : [name]);
}
function assertInstalledClosure(root, mustInclude, mustExclude) {
  const lockNames = lockPackageNames(root);
  const physical = new Set(installedTopLevel(root));
  for (const name of mustInclude) {
    assert(lockNames.has(name), `required dependency missing from the install lock: ${name}`);
    assert(physical.has(name), `required dependency not physically installed: ${name}`);
    if (name.startsWith('@kaicreator/domain-harness-')) {
      const manifest = JSON.parse(readFileSync(join(root, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'));
      assert.equal(manifest.version, '0.10.2-rc.0', `wrong installed version of ${name}`);
    }
  }
  for (const name of mustExclude) {
    assert(!lockNames.has(name), `forbidden dependency in the install lock: ${name}`);
    assert(!physical.has(name), `forbidden physically installed package: ${name}`);
  }
}

function importProbe(root, specifier) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(specifier)}).then(() => process.exit(0), () => process.exit(1))`], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  return result.status ?? -1;
}

/** The physical payload file a Domain Package exports (root or subpath). */
function installedDomainPayload(root, name, subpath) {
  const packageDir = join(root, 'node_modules', ...name.split('/'));
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  const entry = manifest.exports?.[subpath === null ? '.' : `./${subpath}`];
  const target = typeof entry === 'string' ? entry : entry?.import;
  assert(typeof target === 'string' && target.endsWith('.mjs'), `${name}${subpath ?? ''} has no usable .mjs export`);
  return readFileSync(join(packageDir, target), 'utf8');
}

/** Installed provenance: sealed bytes must equal the CONSUMER-installed payloads / staged App sources. */
function assertInstalledProvenance(consumerRoot, stagedAppSource) {
  const appDir = join(consumerRoot, 'node_modules', '@kaicreator-example', 'v0102-authoring-app');
  const built = JSON.parse(readFileSync(join(appDir, 'app.build.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(join(appDir, 'provenance.json'), 'utf8'));
  assert.equal(provenance.modules.length, built.modules.length, 'provenance does not cover every sealed module');
  const byPackageId = new Map(built.modules.map((module) => [module.packageId, module]));
  for (const record of provenance.modules) {
    const sealed = byPackageId.get(record.packageId);
    assert(sealed !== undefined, `provenance names an unsealed module: ${record.packageId}`);
    assert.equal(sealed.moduleSha256, record.sha256, `sealed sha256 differs from producer provenance: ${record.packageId}`);
    if (record.origin.kind === 'installed-domain-package') {
      const spec = record.origin.specifier;
      const parts = spec.split('/');
      const [name, subpath] = spec.startsWith('@') ? [parts.slice(0, 2).join('/'), parts.slice(2).join('/') || null] : [parts[0], parts.slice(1).join('/') || null];
      const installedBytes = installedDomainPayload(consumerRoot, name, subpath);
      assert.equal(sha256Text(installedBytes), sealed.moduleSha256, `sealed ${record.packageId} bytes differ from the CONSUMER-installed ${name}${subpath ?? ''} payload`);
    } else if (record.origin.kind === 'app-file') {
      const staged = readFileSync(join(stagedAppSource, 'modules', basename(record.origin.file ?? '')), 'utf8');
      assert.equal(sha256Text(staged), sealed.moduleSha256, `sealed ${record.packageId} bytes differ from the staged App source`);
    } else if (record.origin.kind === 'derived-bundle') {
      assert.equal(record.packageId, 'standard-sdk@v08.1.0.0');
    }
  }
}

function runScenario(appEntry, scenario, workdir, reportPath) {
  const result = spawnSync(process.execPath, [appEntry, '--scenario', scenario, '--workdir', workdir, '--report', reportPath], {
    encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert(existsSync(reportPath), `the scenario produced no report (exit ${String(result.status)}): ${String(result.stderr).slice(-1500)}`);
  return { report: JSON.parse(readFileSync(reportPath, 'utf8')), exitCode: result.status, stderr: String(result.stderr) };
}

const SELECTED_WORKSPACES = [
  '@kaicreator/domain-harness-contracts',
  '@kaicreator/domain-harness-microkernel',
  '@kaicreator/domain-harness-host-node',
  '@kaicreator/domain-harness-build',
];
const DOMAIN_PACKAGES = {
  '@kaicreator/domain-kernel-basic': join(REPO_ROOT, 'domain-packages/kernel/basic'),
  '@kaicreator/domain-standard-basic': join(REPO_ROOT, 'domain-packages/standard/basic'),
  '@kaicreator/domain-feature-semantic-decision': join(REPO_ROOT, 'domain-packages/standard/features/semantic-decision'),
};
const UNSELECTED_FEATURES = [
  '@kaicreator/domain-feature-agent-diagnostics',
  '@kaicreator/domain-feature-bounded-experiment',
  '@kaicreator/domain-feature-candidate-evaluation',
  '@kaicreator/domain-feature-experience-reuse',
];
const CONSUMER_FORBIDDEN = [
  '@kaicreator/domain-harness-build',
  '@kaicreator/domain-harness-compiler',
  '@kaicreator/domain-harness-host-node',
  '@kaicreator/domain-harness',
  'better-sqlite3',
];
const EXPECTED_STEPS = [
  'selection.authoring', 'feature.nonToolSemantic', 'b.privateHelperReadonly',
  'effect.permittedDispatch', 'deny.permitlessEffect', 'stop.closed',
];

// ---------------------------------------------------------------------------
async function main() {
  assert.equal(Number(process.versions.node.split('.')[0]), 24, `this check targets Node24 (running ${process.versions.node})`);
  const root = mkdtempSync(join(tmpdir(), 'dh-i1379-authoring-'));
  const packDir = join(root, 'pack');
  const producerDir = join(root, 'producer');
  const consumerDir = join(root, 'consumer');
  const workDir = join(root, 'work');
  for (const dir of [packDir, producerDir, consumerDir, workDir]) mkdirSync(dir, { recursive: true });

  try {
    // ---- (1) pack the exact four public workspaces + Domain Packages ----
    const selected = Object.fromEntries(SELECTED_WORKSPACES.map((name) => [name, packWorkspace(name, packDir)]));
    const domainPackages = Object.fromEntries(Object.entries(DOMAIN_PACKAGES).map(([name, dir]) => [name, pack(dir, packDir)]));

    // ---- (2) the EXTERNAL authoring BUILD producer in its own root -------
    writeConsumer(producerDir);
    npm(['install',
      ...SELECTED_WORKSPACES.map((name) => selected[name].tarball),
      ...Object.values(domainPackages).map((entry) => entry.tarball),
      '--no-fund', '--no-audit', '--loglevel=error'], producerDir);
    cpSync(join(TEMPLATE_DIR, 'authoring-app'), join(producerDir, 'apps-source', 'apps', 'authoring'), { recursive: true });
    mkdirSync(join(producerDir, 'apps-source', 'runtime'), { recursive: true });
    for (const file of ['app.mjs', 'resolution-log.mjs', 'runtime-shared.mjs', 'plain-store.mjs']) {
      copyFileSync(join(CLEAN_RUNTIME_DIR, file), join(producerDir, 'apps-source', 'runtime', file));
    }
    // The authoring runtime rides with the staged App sources (T09 layout keeps
    // app-owned runtime files under the app directory).
    copyFileSync(join(TEMPLATE_DIR, 'authoring-app', 'runtime-authoring.mjs'), join(producerDir, 'apps-source', 'runtime', 'runtime-authoring.mjs'));
    copyFileSync(join(TEMPLATE_DIR, 'authoring-producer.mjs'), join(producerDir, 'authoring-producer.mjs'));
    const producerRun = spawnSync(process.execPath, ['authoring-producer.mjs', '--apps-source', 'apps-source', '--out', 'out', '--source-sha', SOURCE_SHA], {
      cwd: producerDir, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(producerRun.status, 0, `authoring producer failed: ${String(producerRun.stderr).slice(-3000)}`);
    const buildReport = JSON.parse(producerRun.stdout.trim().split(/\r?\n/u).pop() ?? '{}');
    assert.equal(buildReport.ok, true, 'the authoring producer report is not ok');
    for (const probe of buildReport.negativeProbes) {
      assert.equal(probe.refused, true, `producer graph probe did not refuse: ${probe.specifier}`);
    }
    assert.equal(buildReport.projection.bindingNegatives.length, 6, 'the producer did not prove all six typed binding/route negatives');

    // ---- (3) the sealed App becomes a real tarball ------------------------
    const authoringApp = pack(join(producerDir, 'out', 'authoring'), packDir, producerDir);

    // ---- (4) clean consumer install: the two public runtime packages -----
    writeConsumer(consumerDir);
    npm(['install',
      selected['@kaicreator/domain-harness-contracts'].tarball,
      selected['@kaicreator/domain-harness-microkernel'].tarball,
      ...Object.values(domainPackages).map((entry) => entry.tarball),
      authoringApp.tarball,
      '--no-fund', '--no-audit', '--loglevel=error'], consumerDir);
    assertInstalledClosure(consumerDir,
      ['@kaicreator/domain-harness-contracts', '@kaicreator/domain-harness-microkernel',
        '@kaicreator/domain-kernel-basic', '@kaicreator/domain-standard-basic', '@kaicreator/domain-feature-semantic-decision'],
      CONSUMER_FORBIDDEN);
    const probes = {};
    for (const specifier of [
      '@kaicreator/domain-harness-contracts',
      '@kaicreator/domain-harness-microkernel',
      '@kaicreator/domain-harness-microkernel/host-seam',
      ...UNSELECTED_FEATURES,
      '@kaicreator/domain-harness-compiler/v10build',
      '@kaicreator/domain-harness-compiler',
      '@kaicreator/domain-harness',
      '@kaicreator/domain-harness-build',
      '@kaicreator/domain-harness-host-node',
    ]) {
      probes[specifier] = importProbe(consumerDir, specifier);
    }
    assert.equal(probes['@kaicreator/domain-harness-contracts'], 0, 'the public Contracts entry must import');
    assert.equal(probes['@kaicreator/domain-harness-microkernel'], 0, 'the public Microkernel entry must import');
    assert.equal(probes['@kaicreator/domain-harness-microkernel/host-seam'], 0, 'the bounded host-seam subpath must import');
    for (const [specifier, exitCode] of Object.entries(probes)) {
      if (!specifier.startsWith('@kaicreator/domain-harness-contracts') && !specifier.startsWith('@kaicreator/domain-harness-microkernel')) {
        assert.equal(exitCode, 1, `unselected/retired package must not resolve in the authoring consumer: ${specifier}`);
      }
    }

    // Sealed bytes equal what THIS consumer installed (no local bypass).
    assertInstalledProvenance(consumerDir, join(TEMPLATE_DIR, 'authoring-app'));

    // ---- (5) run the authoring journey ------------------------------------
    const appEntry = join(consumerDir, 'node_modules', '@kaicreator-example', 'v0102-authoring-app', 'app.mjs');
    const scenarioRun = runScenario(appEntry, 'authoring-basic', workDir, join(workDir, 'report.json'));
    assert.equal(scenarioRun.exitCode, 0, `the authoring scenario must exit 0: ${JSON.stringify(scenarioRun.report.failure ?? scenarioRun.report.error ?? null).slice(0, 800)}`);
    assert.equal(scenarioRun.report.ok, true, 'the authoring scenario report is not ok');
    const stepNames = (scenarioRun.report.steps ?? []).map((step) => step.name);
    for (const expected of EXPECTED_STEPS) {
      assert(stepNames.includes(expected), `the journey is missing step ${expected}; got ${stepNames.join(', ')}`);
      assert(scenarioRun.report.steps.find((step) => step.name === expected).ok === true, `step ${expected} did not pass`);
    }
    assert.deepEqual(scenarioRun.report.final?.resolution?.outsideDeploymentRoot ?? [], [], 'the scenario resolved a file OUTSIDE its deployment root (monorepo leak)');
    const bareSpecifiers = scenarioRun.report.final?.resolution?.bareSpecifiers ?? [];
    for (const specifier of bareSpecifiers) {
      assert(/^@kaicreator\/domain-harness-(contracts|microkernel)(\/host-seam)?$/u.test(specifier),
        `the consumer physically resolved an unexpected bare specifier: ${specifier}`);
    }

    // ---- (6) evidence record ----------------------------------------------
    const evidence = {
      schema: 'dh.v0102.authoring-template-check/1',
      sourceSha: SOURCE_SHA,
      node: process.versions.node,
      platform: process.platform,
      npmRegistry: NPM_REGISTRY,
      tarballs: Object.fromEntries(Object.entries({ ...selected, ...domainPackages, authoringApp: authoringApp })
        .map(([name, value]) => [name, { file: basename(value.tarball), sha256: value.sha256 }])),
      producer: {
        exitCode: producerRun.status,
        ok: buildReport.ok,
        negativeProbes: buildReport.negativeProbes,
        bindingNegatives: buildReport.projection.bindingNegatives,
        app: buildReport.app,
      },
      consumer: {
        closure: { mustExclude: CONSUMER_FORBIDDEN, verified: true },
        importProbes: probes,
        lockSha256: sha256File(join(consumerDir, 'package-lock.json')),
      },
      scenario: {
        exitCode: scenarioRun.exitCode,
        steps: stepNames,
        subjectDigest: scenarioRun.report.final?.manifest?.subjectDigest ?? null,
        packageClosureDigest: scenarioRun.report.final?.manifest?.packageClosureDigest ?? null,
        bareSpecifiers,
      },
      notRun: [
        'R01 full/hidden/critical/packaging regression (separate gate, #1331)',
        'T09 Tiny/Rich journeys (separate established evidence, #1330)',
        'independent exact-HEAD review (requested separately)',
      ],
      result: 'PASS_LOCAL_NODE24_AUTHORING_TEMPLATE',
    };
    const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
    if (evidencePath !== null) {
      mkdirSync(dirname(evidencePath), { recursive: true });
      writeFileSync(evidencePath, serialized);
    }
    console.log(`AUTHORING_TEMPLATE_EVIDENCE ${evidencePath ?? '(stdout only)'}`);
    console.log(`AUTHORING_TEMPLATE_SUMMARY ${JSON.stringify({
      producer: buildReport.ok,
      subjectDigest: buildReport.app.subjectDigest,
      bindingNegatives: buildReport.projection.bindingNegatives.length,
      scenarioExit: scenarioRun.exitCode,
      steps: stepNames.length,
      probes: Object.values(probes).filter((code) => code === 1).length,
    })}`);
  } finally {
    if (keepRoots) {
      console.error(`KEEP_ROOTS roots kept under ${root}`);
    } else {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* bounded best effort */
      }
    }
  }
}

main().catch((error) => {
  console.error(`AUTHORING_TEMPLATE_CHECK_FAILED ${error?.stack ?? String(error)}`);
  process.exitCode = 1;
});
