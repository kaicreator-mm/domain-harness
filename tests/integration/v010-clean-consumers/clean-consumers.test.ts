/**
 * T09 (#1330) — the PHYSICAL clean-packed consumer suite (v0.10.2).
 * =====================================================================
 *
 * One EXTERNAL BUILD producer and two independently clean-installed Node24
 * Domain App consumers, built only from the four selected public
 * `0.10.2-rc.0` tarballs (`@kaicreator/domain-harness-{contracts,
 * microkernel,host-node,build}`) and the selected Domain Packages:
 *
 *   producer — a THIRD isolated install root (public tarballs + Domain
 *           Packages only) runs `examples/v0102-external-producer/
 *           producer.mjs`, fail-closed probes its own graph (retired
 *           Compiler root + the `v10build` deep alias the four v0.10.1
 *           Feature build-probe.mjs files depended on, legacy core, four
 *           unselected advanced features) and compiles the sealed Apps
 *           from payload bytes read through the INSTALLED packages'
 *           public export map — never from a repository source path.
 *
 *   Tiny  — K Primary Basic + S Primary Basic + one Business + its necessary
 *           Capability. Installs ONLY contracts + microkernel + the K/S
 *           Domain Packages + the sealed App: no BUILD, no Compiler, no
 *           Host-node, no `better-sqlite3`, no advanced package. The
 *           journey drives the PUBLIC `load/send/query/subscribe/
 *           unsubscribe/stop` facade over a plain-file durable store
 *           (restart + same-messageId replay + changed-input conflict +
 *           async fail-closed subscription revocation + FACADE_CLOSED).
 *
 *   Rich  — one K Primary + two physical K extensions + four/five physical S
 *           features + four Businesses + four Capabilities, over ONE
 *           file-backed SQLite K store (Host-node + the native driver are
 *           part of the Rich install).
 *
 * Every consumer asserts its physical dependency closure (lock AND
 * node_modules) plus installed provenance: the sealed K/S/feature bytes
 * equal the sha256 of the CONSUMER-installed Domain Package payload, and
 * the Business/Capability bytes equal the staged App sources — the BUILD
 * demonstrably consumed the distributed artifacts, not a local bypass.
 * The `v0102-installed-closure.spec.ts` probe is executed twice as a
 * separate physical process against the two installed roots.
 *
 * Scope honesty: this is the focused T09 Task suite. R01 remains the sole
 * full-regression/hidden/security/release qualifier. Ubuntu Build Host is
 * NOT_RUN here and recorded in `notRun`.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Database from 'better-sqlite3';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EXAMPLE_DIR = join(REPO_ROOT, 'examples', 'v010-clean-consumer');
const PRODUCER_DIR = join(REPO_ROOT, 'examples', 'v0102-external-producer');
const SPEC_PATH = join(REPO_ROOT, 'tests', 'integration', 'v010-clean-consumers', 'v0102-installed-closure.spec.ts');
const NPM_REGISTRY = process.env.T11_NPM_REGISTRY ?? 'http://localhost:14873';
const SOURCE_SHA = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const ADVANCED_PACKAGE_MARKERS = ['sfeature-', 'kext-', 'business-agent', 'capability-agent', 'business-wait-resume', 'extjob', 'extnotify'];

/** The four selected public workspaces (v0.10.2 T07b distribution). */
const SELECTED_WORKSPACES = [
  '@kaicreator/domain-harness-contracts',
  '@kaicreator/domain-harness-microkernel',
  '@kaicreator/domain-harness-host-node',
  '@kaicreator/domain-harness-build',
] as const;
/** The Domain Package payloads the BUILD composes (v0.10.2 L2 section 1.1). */
const DOMAIN_PACKAGE_DIRS = [
  'domain-packages/kernel/basic',
  'domain-packages/standard/basic',
  'domain-packages/standard/features/semantic-decision',
  'domain-packages/standard/features/workflow-control',
  'domain-packages/standard/features/context-assembly',
  'domain-packages/standard/features/decision-evidence',
] as const;
/** The four v0.10.1 unselected advanced features (build-probe negatives). */
const UNSELECTED_FEATURES = [
  '@kaicreator/domain-feature-agent-diagnostics',
  '@kaicreator/domain-feature-bounded-experiment',
  '@kaicreator/domain-feature-candidate-evaluation',
  '@kaicreator/domain-feature-experience-reuse',
] as const;
/** Retired private legacy surfaces that may not enter any consumer graph. */
const RETIRED_PACKAGES = [
  '@kaicreator/domain-harness-compiler',
  '@kaicreator/domain-harness',
] as const;
const TINY_FORBIDDEN = [
  '@kaicreator/domain-harness-build',
  '@kaicreator/domain-harness-compiler',
  '@kaicreator/domain-harness-host-node',
  '@kaicreator/domain-harness',
  'better-sqlite3',
] as const;

interface ScenarioReport {
  ok: boolean;
  scenario: string;
  steps?: { name: string; ok: boolean; error?: unknown; detail?: unknown }[];
  failure?: { code: string | null; message: string };
  final?: Record<string, any>;
  resolution?: { deploymentRoot: string; outsideDeploymentRoot: string[]; bareSpecifiers: string[]; count: number };
  [key: string]: any;
}

/**
 * Resolve the real npm CLI JavaScript and run it with THIS node binary.
 * Going through a shell/npm.cmd is fragile: on the fnm shim the quoted
 * command resolves its own prefix against the caller's cwd. Direct
 * `node <npm-cli.js>` is deterministic on Windows and Linux.
 */
function resolveNpmCli(): string {
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
  const resolved = realpathSync(which);
  if (resolved.endsWith('.js')) return resolved;
  throw new Error(`cannot resolve the npm CLI JavaScript (which npm = ${which}, realpath = ${resolved})`);
}

const NPM_CLI = resolveNpmCli();

function npm(args: readonly string[], cwd: string, extraEnv: NodeJS.ProcessEnv = {}): string {
  const env = { ...process.env, npm_config_registry: NPM_REGISTRY, ...extraEnv };
  return execFileSync(process.execPath, [NPM_CLI, ...args], {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env, timeout: 600_000,
  });
}

interface PackedTarball { readonly tarball: string; readonly sha256: string }

function pack(target: string, destination: string, cwd = REPO_ROOT): PackedTarball {
  const report = JSON.parse(npm(['pack', target, '--pack-destination', destination, '--json'], cwd)) as { filename: string }[];
  assert.equal(report.length, 1);
  const tarball = join(destination, report[0]!.filename);
  return { tarball, sha256: sha256File(tarball) };
}

function packWorkspace(name: string, destination: string): PackedTarball {
  const report = JSON.parse(npm(['pack', '-w', name, '--pack-destination', destination, '--json'], REPO_ROOT)) as { filename: string }[];
  assert.equal(report.length, 1);
  const tarball = join(destination, report[0]!.filename);
  return { tarball, sha256: sha256File(tarball) };
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function writeConsumer(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: `t09-${basename(dir)}`, private: true, type: 'module' }, null, 2)}\n`);
}

function runScenario(appEntry: string, scenario: string, workdir: string, reportPath: string, extra: string[] = []): { report: ScenarioReport; exitCode: number | null; stderr: string } {
  const result = spawnSync(process.execPath, [appEntry, '--scenario', scenario, '--workdir', workdir, '--report', reportPath, ...extra], {
    encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.ok(existsSync(reportPath), `${scenario} produced no report (exit ${String(result.status)}): ${String(result.stderr).slice(-1200)}`);
  return { report: JSON.parse(readFileSync(reportPath, 'utf8')) as ScenarioReport, exitCode: result.status, stderr: String(result.stderr) };
}

function runScenarioAsync(appEntry: string, scenario: string, workdir: string, reportPath: string, extra: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [appEntry, '--scenario', scenario, '--workdir', workdir, '--report', reportPath, ...extra], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stderr }));
    child.on('error', () => resolve({ code: -1, stderr }));
  });
}

function assertReport(report: ScenarioReport, label: string, expectedSteps: readonly string[]): void {
  if (report.ok !== true) {
    assert.fail(`${label} failed: ${JSON.stringify(report.failure ?? report.error ?? report.steps?.filter((step) => !step.ok))}`);
  }
  const names = (report.steps ?? []).map((step) => step.name);
  for (const expected of expectedSteps) {
    assert.ok(names.includes(expected), `${label} is missing step ${expected}; got ${names.join(', ')}`);
    assert.ok(report.steps?.find((step) => step.name === expected)?.ok === true, `${label} step ${expected} did not pass`);
  }
  assert.deepEqual(report.resolution?.outsideDeploymentRoot ?? [], [], `${label} resolved a file OUTSIDE its deployment root (monorepo leak)`);
}

function queryRows(dbPath: string, sql: string, params: unknown[] = []): any[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

/** Every package name the consumer's lockfile records. */
function lockPackageNames(root: string): Set<string> {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as {
    packages?: Record<string, unknown>;
  };
  const names = new Set<string>();
  for (const key of Object.keys(lock.packages ?? {})) {
    const marker = 'node_modules/';
    const at = key.lastIndexOf(marker);
    if (at < 0) continue;
    const tail = key.slice(at + marker.length);
    if (tail.length === 0) continue;
    names.add(tail.startsWith('@') ? tail.split('/').slice(0, 2).join('/') : tail.split('/')[0]!);
  }
  return names;
}

/** Physically installed top-level package names under <root>/node_modules. */
function installedTopLevel(root: string): string[] {
  return readdirSync(join(root, 'node_modules')).flatMap((name) => name.startsWith('@') ? readdirSync(join(root, 'node_modules', name)).map((child) => `${name}/${child}`) : [name]);
}

/**
 * The T09 closure gate: `mustExclude` is checked BOTH in the lockfile and
 * physically (an entry that hides from the lock but ships in node_modules
 * still fails); `mustInclude` must be physically present with the exact
 * staged local-tarball identity (version 0.10.2-rc.0, resolved NOT http).
 */
function assertInstalledClosure(
  root: string,
  mustInclude: readonly string[],
  mustExclude: readonly string[],
): void {
  const lockNames = lockPackageNames(root);
  const physical = new Set(installedTopLevel(root));
  for (const name of mustInclude) {
    assert.ok(lockNames.has(name), `required dependency missing from the install lock: ${name}`);
    assert.ok(physical.has(name), `required dependency not physically installed: ${name}`);
    if (name.startsWith('@kaicreator/domain-harness-')) {
      const manifest = JSON.parse(readFileSync(join(root, 'node_modules', ...name.split('/'), 'package.json'), 'utf8')) as { version?: string };
      assert.equal(manifest.version, '0.10.2-rc.0', `wrong installed version of ${name}`);
    }
  }
  for (const name of mustExclude) {
    assert.equal(lockNames.has(name), false, `forbidden dependency in the install lock: ${name}`);
    assert.equal(physical.has(name), false, `forbidden physically installed package: ${name}`);
  }
  for (const name of installedTopLevel(root)) {
    assert.ok(!name.startsWith('@kaicreator/domain-harness-compiler') && name !== '@kaicreator/domain-harness',
      `a retired private legacy workspace entered the consumer graph: ${name}`);
  }
}

/**
 * A specifier import executed INSIDE the consumer root: exit 0 when it
 * resolves, exit 1 when it is refused (ERR_MODULE_NOT_FOUND /
 * ERR_PACKAGE_PATH_NOT_EXPORTED both refuse).
 */
function importProbe(root: string, specifier: string): number {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import(${JSON.stringify(specifier)}).then(() => process.exit(0), () => process.exit(1))`], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  return result.status ?? -1;
}

/** The physical payload file a Domain Package exports (root or subpath). */
function installedDomainPayload(root: string, name: string, subpath: string | null): string {
  const packageDir = join(root, 'node_modules', ...name.split('/'));
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    exports?: Record<string, unknown>;
  };
  const entry = manifest.exports?.[subpath === null ? '.' : `./${subpath}`];
  const target = typeof entry === 'string' ? entry : (entry as { import?: string } | undefined)?.import;
  assert.ok(typeof target === 'string' && target.endsWith('.mjs'), `${name}${subpath ?? ''} has no usable .mjs export`);
  return readFileSync(join(packageDir, target), 'utf8');
}

/** The exact Standard Primary bundle the producer derives from installed bytes. */
function standardBundleOf(sdk: string, router: string): string {
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

interface ProvenanceRecord {
  packageId: string;
  role: string;
  sha256: string;
  origin: { kind: 'installed-domain-package' | 'app-file' | 'derived-bundle'; specifier?: string; file?: string; from?: string[] };
}

/**
 * Installed provenance: every sealed module's bytes must equal the sha256 of
 * the bytes the CONSUMER itself installed (Domain Packages through their
 * public export map) or of the staged App sources the producer compiled —
 * never a repository-relative compiler source bypass.
 */
function assertInstalledProvenance(consumerRoot: string, appName: string, stagedAppSource: string): void {
  const appDir = join(consumerRoot, 'node_modules', '@kaicreator-example', appName);
  const built = JSON.parse(readFileSync(join(appDir, 'app.build.json'), 'utf8')) as {
    modules: { packageId: string; role: string; moduleSha256: string; moduleSource: string }[];
  };
  const byPackageId = new Map(built.modules.map((module) => [module.packageId, module]));
  const provenance = JSON.parse(readFileSync(join(appDir, 'provenance.json'), 'utf8')) as { modules: ProvenanceRecord[] };
  assert.ok(provenance.modules.length === built.modules.length, 'provenance does not cover every sealed module');
  for (const record of provenance.modules) {
    const sealed = byPackageId.get(record.packageId);
    assert.ok(sealed, `provenance names an unsealed module: ${record.packageId}`);
    assert.equal(sealed.moduleSha256, record.sha256, `sealed sha256 differs from producer provenance: ${record.packageId}`);
    if (record.origin.kind === 'installed-domain-package') {
      assert.ok(record.origin.specifier, 'installed-package origin lacks its specifier');
      const [name, subpath] = (() => {
        const spec = record.origin.specifier!;
        const parts = spec.split('/');
        return spec.startsWith('@') ? [parts.slice(0, 2).join('/'), parts.slice(2).join('/') || null] : [parts[0]!, parts.slice(1).join('/') || null];
      })();
      const installedBytes = installedDomainPayload(consumerRoot, name, subpath);
      assert.equal(sha256Text(installedBytes), sealed.moduleSha256,
        `sealed ${record.packageId} bytes differ from the CONSUMER-installed ${name}${subpath ?? ''} payload`);
    } else if (record.origin.kind === 'app-file') {
      const staged = readFileSync(join(stagedAppSource, 'modules', basename(record.origin.file ?? '')), 'utf8');
      assert.equal(sha256Text(staged), sealed.moduleSha256, `sealed ${record.packageId} bytes differ from the staged App source`);
    } else if (record.origin.kind === 'derived-bundle') {
      assert.equal(record.packageId, 'standard-sdk@v08.1.0.0');
      const sdk = installedDomainPayload(consumerRoot, '@kaicreator/domain-standard-basic', null);
      const router = installedDomainPayload(consumerRoot, '@kaicreator/domain-standard-basic', 'workflow-router');
      const reconstructed = standardBundleOf(sdk, router);
      assert.equal(sealed.moduleSource, reconstructed,
        'the sealed Standard Primary is not the exact bundle of the CONSUMER-installed SDK + WorkflowRouter bytes');
      assert.equal(sha256Text(reconstructed), sealed.moduleSha256);
    }
  }
}

test('T09-CLEAN-CONSUMERS: external-producer Tiny/Rich clean Node24 installs, public journeys and physical SQLite evidence', { timeout: 3_600_000 }, async () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 24, `this suite targets Node24 (running ${process.versions.node})`);
  const root = mkdtempSync(join(tmpdir(), 'dh-t09-clean-'));
  const keepRoots = process.env.DH_T09_KEEP_ROOTS === '1';
  const packDir = join(root, 'pack');
  const producerDir = join(root, 'producer');
  const tinyDir = join(root, 'tiny-consumer');
  const richDir = join(root, 'rich-consumer');
  const tinyWork = join(root, 'tiny-work');
  const richWork = join(root, 'rich-work');
  const raceWork = join(root, 'race-work');
  for (const dir of [packDir, producerDir, tinyDir, richDir, tinyWork, richWork, raceWork]) mkdirSync(dir, { recursive: true });

  try {
    // ---- (1) pack the exact four public workspaces + Domain Packages ----
    const selected = Object.fromEntries(SELECTED_WORKSPACES.map((name) => [name, packWorkspace(name, packDir)]));
    const kernelBasic = pack(join(REPO_ROOT, 'domain-packages/kernel/basic'), packDir);
    const standardBasic = pack(join(REPO_ROOT, 'domain-packages/standard/basic'), packDir);
    const featurePacks = Object.fromEntries(DOMAIN_PACKAGE_DIRS.slice(2).map((dir) => [`@kaicreator/domain-feature-${basename(dir)}`, pack(join(REPO_ROOT, dir), packDir)]));
    const domainPackages = {
      '@kaicreator/domain-kernel-basic': kernelBasic,
      '@kaicreator/domain-standard-basic': standardBasic,
      ...featurePacks,
    };
    const allDomainTarballs = Object.values(domainPackages).map((entry) => entry.tarball);

    // ---- (2) the EXTERNAL BUILD producer in its own isolated root -------
    writeConsumer(producerDir);
    npm(['install', ...SELECTED_WORKSPACES.map((name) => selected[name]!.tarball), ...allDomainTarballs, '--no-fund', '--no-audit', '--loglevel=error'], producerDir);
    cpSync(PRODUCER_DIR, join(producerDir, 'producer'), {
      recursive: true,
      filter: (source) => !/[\\/]out([\\/]|$)/u.test(source) && !/[\\/]node_modules([\\/]|$)/u.test(source) && !basename(source).startsWith('README'),
    });
    cpSync(join(EXAMPLE_DIR, 'apps'), join(producerDir, 'apps-source', 'apps'), {
      recursive: true,
      filter: (source) => !/[\\/]node_modules([\\/]|$)/u.test(source),
    });
    cpSync(join(EXAMPLE_DIR, 'runtime'), join(producerDir, 'apps-source', 'runtime'), { recursive: true });
    const producerRun = spawnSync(process.execPath, ['producer/producer.mjs', '--apps-source', 'apps-source', '--out', 'out', '--source-sha', SOURCE_SHA], {
      cwd: producerDir, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(producerRun.status, 0, `external producer failed: ${String(producerRun.stderr).slice(-3000)}`);
    const buildReport = JSON.parse(producerRun.stdout.trim().split(/\r?\n/u).pop() ?? '{}') as {
      ok: boolean;
      negativeProbes: { specifier: string; refused: boolean }[];
      apps: { buildId: string; subjectDigest: string; packageClosureDigest: string; modules: number; profile: string }[];
    };
    assert.equal(buildReport.ok, true);
    assert.equal(buildReport.apps.length, 3, 'the producer must build Tiny v1, Rich v1 and Rich v2');
    assert.equal(new Set(buildReport.apps.map((app) => app.subjectDigest)).size, 3, 'the three BUILDs must be byte-distinct');
    for (const probe of buildReport.negativeProbes) {
      assert.equal(probe.refused, true, `producer graph probe did not refuse: ${probe.specifier}`);
    }
    assert.ok(buildReport.negativeProbes.some((probe) => probe.specifier === '@kaicreator/domain-harness-compiler/v10build'),
      'the retired v10build deep alias (the four v0.10.1 build-probe imports) was not probed');

    const tinyApp = pack(join(producerDir, 'out', 'tiny'), packDir, producerDir);
    const richV1App = pack(join(producerDir, 'out', 'rich-v1'), packDir, producerDir);
    const richV2App = pack(join(producerDir, 'out', 'rich-v2'), packDir, producerDir);

    // ---- (3) Tiny: clean install WITHOUT BUILD/Compiler/Host/SQLite ----
    writeConsumer(tinyDir);
    npm(['install',
      selected['@kaicreator/domain-harness-contracts']!.tarball,
      selected['@kaicreator/domain-harness-microkernel']!.tarball,
      kernelBasic.tarball,
      standardBasic.tarball,
      tinyApp.tarball,
      '--no-fund', '--no-audit', '--loglevel=error'], tinyDir);
    assertInstalledClosure(tinyDir,
      ['@kaicreator/domain-harness-contracts', '@kaicreator/domain-harness-microkernel', '@kaicreator/domain-kernel-basic', '@kaicreator/domain-standard-basic'],
      [...TINY_FORBIDDEN]);
    assertInstalledProvenance(tinyDir, 'v010-tiny-app', join(EXAMPLE_DIR, 'apps', 'tiny'));

    // The retired Compiler deep alias the four v0.10.1 build-probe.mjs files
    // imported must refuse here, while the public runtime still imports.
    assert.equal(importProbe(tinyDir, '@kaicreator/domain-harness-contracts'), 0, 'the public Contracts entry must import');
    assert.equal(importProbe(tinyDir, '@kaicreator/domain-harness-microkernel'), 0, 'the public Microkernel entry must import');
    assert.equal(importProbe(tinyDir, '@kaicreator/domain-harness-compiler/v10build'), 1, 'the retired v10build deep import must refuse in the Tiny consumer');
    for (const specifier of [...UNSELECTED_FEATURES, ...RETIRED_PACKAGES]) {
      assert.equal(importProbe(tinyDir, specifier), 1, `unselected/retired package must not resolve in the Tiny consumer: ${specifier}`);
    }

    const tinyTopLevel = installedTopLevel(tinyDir);
    const tinyAdvanced = tinyTopLevel.filter((name) => ADVANCED_PACKAGE_MARKERS.some((marker) => name.includes(marker)));
    assert.deepEqual(tinyAdvanced, [], `Tiny installed an advanced package: ${tinyAdvanced.join(', ')}`);
    assert.ok(!tinyTopLevel.includes('@kaicreator-example/v010-rich-app'), 'the Rich App leaked into the Tiny installation');

    const tinyEntry = join(tinyDir, 'node_modules', '@kaicreator-example', 'v010-tiny-app', 'app.mjs');

    // ---- (4) Tiny: the public load/send/query/subscribe/stop journey ----
    const tinyRun = runScenario(tinyEntry, 'tiny-basic', tinyWork, join(tinyWork, 'report.json'));
    assertReport(tinyRun.report, 'Tiny', [
      'selection.tiny', 'send.basic', 'query.scoped', 'query.deniedForeignB',
      'subscribe.delivery', 'unsubscribe.silence', 'subscribe.revocation',
      'restart.reopen', 'replay.originalReceipt', 'replay.changedInputConflict', 'stop.closed',
    ]);
    assert.equal(tinyRun.exitCode, 0, 'the Tiny scenario process must exit 0');
    assert.equal(tinyRun.report.final?.manifest?.modules?.length, 4, 'Tiny must install exactly K/S/B/C');
    const tinyBare = tinyRun.report.resolution?.bareSpecifiers ?? [];
    assert.ok(tinyBare.includes('@kaicreator/domain-harness-microkernel'), 'Tiny must drive the PUBLIC Microkernel entry');
    assert.ok(!tinyBare.some((specifier) => specifier.includes('host-node') || specifier.includes('better-sqlite3')),
      `Tiny physically resolved a Host/SQLite package: ${tinyBare.join(', ')}`);
    assert.ok(!tinyBare.some((specifier) => ADVANCED_PACKAGE_MARKERS.some((marker) => specifier.includes(marker))), `Tiny physically resolved an advanced package: ${tinyBare.join(', ')}`);

    // ---- (5) Rich: clean install with Host-node + physical SQLite -------
    writeConsumer(richDir);
    npm(['install',
      selected['@kaicreator/domain-harness-contracts']!.tarball,
      selected['@kaicreator/domain-harness-microkernel']!.tarball,
      selected['@kaicreator/domain-harness-host-node']!.tarball,
      ...allDomainTarballs,
      richV1App.tarball,
      richV2App.tarball,
      'better-sqlite3@^12.0.0',
      '--no-fund', '--no-audit', '--loglevel=error'], richDir);
    npm(['install-scripts', 'approve', 'better-sqlite3'], richDir);
    npm(['rebuild', 'better-sqlite3'], richDir);
    // The native driver must physically load before any App is executed.
    execFileSync(process.execPath, ['-e', "const D=require('better-sqlite3');const d=new D(':memory:');d.exec('create table t(x)');if(d.prepare('select 1 as x').get().x!==1)process.exit(1);d.close()"], {
      cwd: richDir, encoding: 'utf8',
    });
    assertInstalledClosure(richDir,
      ['@kaicreator/domain-harness-contracts', '@kaicreator/domain-harness-microkernel', '@kaicreator/domain-harness-host-node', 'better-sqlite3', '@kaicreator/domain-kernel-basic', '@kaicreator/domain-standard-basic'],
      ['@kaicreator/domain-harness-build', '@kaicreator/domain-harness-compiler', '@kaicreator/domain-harness']);
    assertInstalledProvenance(richDir, 'v010-rich-app', join(EXAMPLE_DIR, 'apps', 'rich'));
    assertInstalledProvenance(richDir, 'v010-rich-app-v2', join(EXAMPLE_DIR, 'apps', 'rich'));
    assert.equal(importProbe(richDir, '@kaicreator/domain-harness-compiler/v10build'), 1, 'the retired v10build deep import must refuse in the Rich consumer');
    for (const specifier of UNSELECTED_FEATURES) {
      assert.equal(importProbe(richDir, specifier), 1, `unselected advanced feature must not resolve in the Rich consumer: ${specifier}`);
    }

    const richEntry = join(richDir, 'node_modules', '@kaicreator-example', 'v010-rich-app', 'app.mjs');

    // ---- (6) Rich: the full L2 R3 §H consumer journey --------------------
    const main = runScenario(richEntry, 'rich-main', richWork, join(richWork, 'report-main.json'));
    assertReport(main.report, 'Rich main', [
      'RICH_P1.selection', 'RICH_P1.invokeFeatures', 'RICH_P4.modelCallTruth', 'RICH_P5.agentMemoryContext',
      'EX04_P1.twoAdapters', 'RICH_P2.twoBIsolation', 'RICH_P3.queryAuthority', 'K02_P1.eighteenTurnsOriginalReceipt',
      'EX04_F1.duplicateCallbackAndLostAck', 'DENY_N1.permitlessAdapter', 'RICH_P2.restart',
    ]);
    assert.equal(main.exitCode, 0, 'the Rich main journey must exit 0');

    const waitA = runScenario(richEntry, 'rich-wait-a', richWork, join(richWork, 'report-wait-a.json'));
    assertReport(waitA.report, 'Rich WAIT park', ['WAIT.open']);
    const waitB = runScenario(richEntry, 'rich-wait-b', richWork, join(richWork, 'report-wait-b.json'));
    assertReport(waitB.report, 'Rich WAIT/RESUME restart', ['WAIT.resumeAfterRestart']);
    assert.equal(waitB.report.result?.state, 'resumed');
    assert.equal(waitB.report.result?.timedOut, 'timedOut');
    assert.equal(waitB.report.result?.duplicate, true);

    const t08a = runScenario(richEntry, 'rich-t08-a', richWork, join(richWork, 'report-t08-a.json'));
    assertReport(t08a.report, 'Rich T08 old BUILD', ['VERSION_P1.oldOccurrence']);
    const t08b = runScenario(richEntry, 'rich-t08-b', richWork, join(richWork, 'report-t08-b.json'));
    assertReport(t08b.report, 'Rich T08 promotion', ['VERSION_P1.newBuildActivation', 'VERSION_P1.oldPinRestore', 'VERSION_P1.revokedCandidate']);
    assert.notEqual(t08b.report.result?.v1, t08b.report.result?.v2, 'the two BUILD versions must be distinct');

    const shadow = runScenario(richEntry, 'rich-shadow', richWork, join(richWork, 'report-shadow.json'));
    assertReport(shadow.report, 'Rich Shadow L4', ['SHADOW_P1.zeroProductionWrites']);
    assert.equal(shadow.report.result?.match, 'match');
    assert.equal(shadow.report.result?.difference, 'difference');
    assert.equal(shadow.report.result?.writes, true);
    assert.equal(shadow.report.result?.canPromote, false);

    // ---- (7) K01: two REAL competing Node processes ---------------------
    const raceReports = [join(raceWork, 'report-a.json'), join(raceWork, 'report-b.json')];
    const [raceA, raceB] = await Promise.all([
      runScenarioAsync(richEntry, 'rich-race', raceWork, raceReports[0]!, ['--arg', 'worker=A']),
      runScenarioAsync(richEntry, 'rich-race', raceWork, raceReports[1]!, ['--arg', 'worker=B']),
    ]);
    // R01-R2 #1209: an outcome-less report is NOT a Kernel receipt.
    // Preserve the original 3/3 T11 gate and show the first physical failure
    // (including failures before race() reaches its K01 step).
    const childForensics = { exits: [raceA.code, raceB.code], stderr: [raceA.stderr.slice(-2000), raceB.stderr.slice(-2000)] };
    for (const path of raceReports) {
      assert.ok(existsSync(path), 'race child emitted no report: ' + path + ' ' + JSON.stringify(childForensics));
    }
    const races = raceReports.map((path) => JSON.parse(readFileSync(path, 'utf8')) as ScenarioReport);
    const raceForensics = JSON.stringify({
      children: childForensics,
      reports: races.map((report) => ({ ok: report.ok, failure: report.failure, steps: report.steps, outcome: report.outcome })),
    });
    const winners = races.filter((report) => report.outcome?.ok === true);
    assert.ok(winners.length >= 1, `at least one competing writer must admit: ${raceForensics}`);
    if (winners.length === 2) {
      assert.equal(winners[0]!.outcome.effectId, winners[1]!.outcome.effectId, 'two identical competing writers must resolve the SAME logical turn');
    } else {
      const loser = races.find((report) => report.outcome?.ok !== true);
      assert.match(String(loser?.outcome?.code), /ADMISSION_|K02_/u, `the losing writer must fail closed typed: ${raceForensics}`);
    }
    const raceJobDb = join(raceWork, 'extjob.sqlite');
    const raceDispatches = queryRows(raceJobDb, "SELECT COUNT(*) AS n FROM job_dispatch_log WHERE op = 'job.submit'")[0]!.n as number;
    const raceJobs = queryRows(raceJobDb, 'SELECT COUNT(*) AS n FROM jobs')[0]!.n as number;
    assert.equal(raceDispatches, 1, 'the external provider physically dispatched exactly once across two processes');
    assert.equal(raceJobs, 1, 'the external provider holds exactly one job row');
    const racePermits = queryRows(join(raceWork, 'rich-k.sqlite'), "SELECT COUNT(*) AS n FROM docs WHERE key LIKE '%effect-permit%'")[0]!.n as number;
    assert.equal(racePermits, 1, 'the K store holds exactly one race permit');

    // ---- (8) physical Rich witnesses on the SAME installed SQLite files --
    const richDb = join(richWork, 'rich-k.sqlite');
    const permits = queryRows(richDb, "SELECT COUNT(*) AS n FROM docs WHERE key LIKE '%effect-permit%'")[0]!.n as number;
    const instances = queryRows(richDb, "SELECT COUNT(*) AS n FROM docs WHERE key LIKE '%wf-instance%'")[0]!.n as number;
    const journals = queryRows(richDb, "SELECT COUNT(*) AS n FROM docs WHERE key LIKE '%effect-journal%'")[0]!.n as number;
    assert.ok(permits > 0 && instances >= 8 && journals > 0, `physical K rows are missing: permits=${permits} instances=${instances} journals=${journals}`);
    const jobDispatches = queryRows(join(richWork, 'extjob.sqlite'), "SELECT COUNT(*) AS n FROM job_dispatch_log WHERE op = 'job.submit'")[0]!.n as number;
    const notifyDispatches = queryRows(join(richWork, 'extnotify.sqlite'), "SELECT COUNT(*) AS n FROM notify_dispatch_log WHERE op = 'notify.send'")[0]!.n as number;
    // 1 main submit + 2 two-B + 18 K02 turns + 1 lost-ACK + 1 T08 old + 1 T08 new.
    assert.ok(jobDispatches >= 24, `expected >=24 real job submissions across the journeys, got ${jobDispatches}`);
    // One notify in the two-adapter step, one on the WAIT resume.
    assert.ok(notifyDispatches >= 2, `expected >=2 real notify deliveries across the journeys, got ${notifyDispatches}`);

    // ---- (9) the closure spec, twice, as separate physical processes -----
    const specRuns: { profile: string; exitCode: number | null; stdoutTail: string }[] = [];
    for (const [profile, installedRoot] of [['Tiny', tinyDir], ['Rich', richDir]] as const) {
      const logPath = join(root, `closure-spec-${profile.toLowerCase()}.log`);
      const specRun = spawnSync(process.execPath, ['--import', 'tsx', '--test', SPEC_PATH], {
        cwd: REPO_ROOT, encoding: 'utf8', timeout: 300_000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, DH_V0102_INSTALLED_ROOT: installedRoot, DH_V0102_PROFILE: profile },
      });
      writeFileSync(logPath, `${specRun.stdout ?? ''}\n${specRun.stderr ?? ''}`);
      specRuns.push({ profile, exitCode: specRun.status, stdoutTail: String(specRun.stdout).slice(-400) });
      assert.equal(specRun.status, 0, `the installed-closure spec failed for the ${profile} root: ${String(specRun.stderr).slice(-2000)}`);
    }

    // ---- (10) evidence record --------------------------------------------
    const tarballs = {
      ...Object.fromEntries(Object.entries(selected).map(([name, value]) => [name, { file: basename(value.tarball), sha256: value.sha256 }])),
      ...Object.fromEntries(Object.entries(domainPackages).map(([name, value]) => [name, { file: basename(value.tarball), sha256: value.sha256 }])),
      tinyApp: { file: basename(tinyApp.tarball), sha256: tinyApp.sha256 },
      richV1App: { file: basename(richV1App.tarball), sha256: richV1App.sha256 },
      richV2App: { file: basename(richV2App.tarball), sha256: richV2App.sha256 },
    };
    const evidence = {
      schema: 'dh.v0102.t09.clean-consumer-evidence/1',
      sourceSha: SOURCE_SHA,
      node: process.versions.node,
      platform: process.platform,
      npmRegistry: NPM_REGISTRY,
      tarballs,
      producer: {
        negativeProbes: buildReport.negativeProbes,
        builds: buildReport.apps,
        exitCode: producerRun.status,
      },
      installs: {
        tiny: { root: tinyDir, lockSha256: sha256File(join(tinyDir, 'package-lock.json')), closure: 'contracts+microkernel+K+S+tinyApp' },
        rich: { root: richDir, lockSha256: sha256File(join(richDir, 'package-lock.json')), closure: 'contracts+microkernel+host-node+K+S+4features+richV1+richV2+better-sqlite3' },
        producer: { root: producerDir, lockSha256: sha256File(join(producerDir, 'package-lock.json')) },
      },
      scenarios: {
        tiny: { ok: tinyRun.report.ok, exitCode: tinyRun.exitCode, steps: tinyRun.report.steps?.map((step) => step.name), final: tinyRun.report.final, resolution: tinyRun.report.resolution },
        richMain: { ok: main.report.ok, exitCode: main.exitCode, steps: main.report.steps?.map((step) => step.name), final: main.report.final, resolution: main.report.resolution },
        wait: waitB.report.result,
        t08: t08b.report.result,
        shadow: shadow.result ?? shadow.report.result,
        race: { outcomes: races.map((report) => report.outcome), exits: childForensics.exits, dispatches: raceDispatches, jobs: raceJobs, permits: racePermits },
      },
      closureSpec: specRuns,
      physical: { richPermits: permits, richInstances: instances, richJournals: journals, jobDispatches, notifyDispatches },
      notRun: [
        'Ubuntu Build Host (this session is a Windows Node24 host with real file-backed SQLite)',
        'R01 full regression / hidden validation / release qualification',
        'a JS network sandbox (deliberately NOT claimed; private npm/HTTP bypass is a code-review violation)',
      ],
      result: 'PASS_LOCAL_NODE24_FOCUSED_T09',
    };
    const evidencePath = process.env.T09_EVIDENCE_PATH
      ?? join(tmpdir(), `dh-t09-evidence-${SOURCE_SHA.slice(0, 12)}.json`);
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    for (const [name, consumerDir] of [['tiny', tinyDir], ['rich', richDir], ['producer', producerDir]] as const) {
      copyFileSync(join(consumerDir, 'package-lock.json'), join(dirname(evidencePath), `t09-${name}-package-lock.json`));
    }
    console.info(`T09_EVIDENCE ${evidencePath}`);
    console.info(`T09_SUMMARY ${JSON.stringify({
      producer: buildReport.ok,
      tiny: tinyRun.report.ok,
      richMain: main.report.ok,
      wait: waitB.report.ok,
      t08: t08b.report.ok,
      shadow: shadow.report.ok,
      race: raceA.code === 0 || raceB.code === 0,
      closureSpecTiny: specRuns[0]?.exitCode,
      closureSpecRich: specRuns[1]?.exitCode,
      jobDispatches,
      notifyDispatches,
      permits,
    })}`);
  } finally {
    if (keepRoots) {
      console.info(`T09_KEEP_ROOTS roots kept under ${root}`);
    } else {
      // Best-effort cleanup; Windows keeps handles briefly, leftovers age out.
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* bounded best effort */
      }
    }
  }
});
