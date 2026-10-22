/**
 * T11 (#1180) — the PHYSICAL clean-packed consumer suite.
 * ======================================================
 *
 * Two independently BUILT, PACKED, CLEAN-INSTALLED, actually EXECUTED Node24
 * Domain Apps:
 *
 *   Tiny  — K Primary Basic + S Primary Basic + one Business + its necessary
 *           Capability, with zero advanced module installed or imported.
 *   Rich  — one K Primary + two physical K extensions + four/five physical S
 *           features + four Businesses + four Capabilities, over ONE
 *           file-backed SQLite K store.
 *
 * Each consumer is an isolated temp directory whose node_modules contains
 * ONLY the packed runtime tarballs, the packed App tarball and the native
 * SQLite driver. The BUILD runs in a THIRD isolated directory that has only
 * the packed compiler/core tarballs installed. No repository path is on any
 * runtime resolution edge; every report records the physical ESM graph and
 * asserts that every file: URL stayed inside its deployment root.
 *
 * Scope honesty: this is the focused Task suite. R01 remains the sole
 * full-regression/hidden/security/release qualifier. Ubuntu Build Host and the
 * optional T09/T10B edges are NOT_RUN here and are recorded in `notRun`.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import Database from 'better-sqlite3';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EXAMPLE_DIR = join(REPO_ROOT, 'examples', 'v010-clean-consumer');
const NPM_REGISTRY = process.env.T11_NPM_REGISTRY ?? 'http://localhost:14873';
const SOURCE_SHA = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const ADVANCED_PACKAGE_MARKERS = ['sfeature-', 'kext-', 'business-agent', 'capability-agent', 'business-wait-resume', 'extjob', 'extnotify'];

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

function pack(target: string, destination: string, cwd = REPO_ROOT): { tarball: string; sha256: string } {
  const report = JSON.parse(npm(['pack', target, '--pack-destination', destination, '--json'], cwd)) as { filename: string }[];
  assert.equal(report.length, 1);
  const tarball = join(destination, report[0]!.filename);
  const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  return { tarball, sha256 };
}

function packWorkspace(name: string, destination: string): { tarball: string; sha256: string } {
  const report = JSON.parse(npm(['pack', '-w', name, '--pack-destination', destination, '--json'], REPO_ROOT)) as { filename: string }[];
  assert.equal(report.length, 1);
  const tarball = join(destination, report[0]!.filename);
  const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
  return { tarball, sha256 };
}

function writeConsumer(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: `t11-${basename(dir)}`, private: true, type: 'module' }, null, 2)}\n`);
}

function installRuntime(consumerDir: string, tarballs: readonly string[], appTarballs: readonly string[]): void {
  npm(['install', ...tarballs, ...appTarballs, 'better-sqlite3@^12.0.0', '--no-fund', '--no-audit', '--loglevel=error'], consumerDir);
  npm(['install-scripts', 'approve', 'better-sqlite3'], consumerDir);
  npm(['rebuild', 'better-sqlite3'], consumerDir);
  // The native driver must physically load before any App is executed.
  execFileSync(process.execPath, ['-e', "const D=require('better-sqlite3');const d=new D(':memory:');d.exec('create table t(x)');if(d.prepare('select 1 as x').get().x!==1)process.exit(1);d.close()"], {
    cwd: consumerDir, encoding: 'utf8',
  });
}

function runScenario(appEntry: string, scenario: string, workdir: string, reportPath: string, extra: string[] = []): ScenarioReport {
  const result = spawnSync(process.execPath, [appEntry, '--scenario', scenario, '--workdir', workdir, '--report', reportPath, ...extra], {
    encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.ok(existsSync(reportPath), `${scenario} produced no report (exit ${String(result.status)}): ${String(result.stderr).slice(-1200)}`);
  return JSON.parse(readFileSync(reportPath, 'utf8')) as ScenarioReport;
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
    assert.fail(`${label} failed: ${JSON.stringify(report.failure ?? report.steps?.filter((step) => !step.ok))}`);
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

test('T11-CLEAN-CONSUMERS: Tiny and Rich are independently packed, clean-installed and physically executed on Node24 + SQLite', { timeout: 1_800_000 }, async () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 24, `this suite targets Node24 (running ${process.versions.node})`);
  const root = mkdtempSync(join(tmpdir(), 'dh-t11-clean-'));
  const packDir = join(root, 'pack');
  const builderDir = join(root, 'builder');
  const tinyDir = join(root, 'tiny-consumer');
  const richDir = join(root, 'rich-consumer');
  const tinyWork = join(root, 'tiny-work');
  const richWork = join(root, 'rich-work');
  const raceWork = join(root, 'race-work');
  for (const dir of [packDir, builderDir, tinyDir, richDir, tinyWork, richWork, raceWork]) mkdirSync(dir, { recursive: true });

  try {
    // ---- (1) pack the exact runtime packages -----------------------------
    const core = packWorkspace('@kaicreator/domain-harness', packDir);
    const compiler = packWorkspace('@kaicreator/domain-harness-compiler', packDir);

    // ---- (2) BUILD both Apps in an isolated builder installation ---------
    writeConsumer(builderDir);
    npm(['install', core.tarball, compiler.tarball, '--no-fund', '--no-audit', '--loglevel=error'], builderDir);
    cpSync(EXAMPLE_DIR, join(builderDir, 'example'), {
      recursive: true,
      filter: (source) => !/[\\/]out([\\/]|$)/u.test(source) && !/[\\/]node_modules([\\/]|$)/u.test(source),
    });
    const buildOutput = execFileSync(process.execPath, ['example/build-apps.mjs', '--out', 'out', '--source-sha', SOURCE_SHA], {
      cwd: builderDir, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 600_000,
    });
    const buildReport = JSON.parse(buildOutput.trim().split(/\r?\n/u).pop() ?? '{}') as { ok: boolean; apps: { buildId: string; subjectDigest: string; packageClosureDigest: string; modules: number }[] };
    assert.equal(buildReport.ok, true);
    assert.equal(buildReport.apps.length, 3, 'the BUILD must produce Tiny v1, Rich v1 and Rich v2');
    assert.equal(new Set(buildReport.apps.map((app) => app.subjectDigest)).size, 3, 'the three BUILDs must be byte-distinct');

    const tinyApp = pack(join(builderDir, 'out', 'tiny'), packDir, builderDir);
    const richV1App = pack(join(builderDir, 'out', 'rich-v1'), packDir, builderDir);
    const richV2App = pack(join(builderDir, 'out', 'rich-v2'), packDir, builderDir);

    // ---- (3) two ISOLATED clean installations ---------------------------
    writeConsumer(tinyDir);
    installRuntime(tinyDir, [core.tarball, compiler.tarball], [tinyApp.tarball]);
    writeConsumer(richDir);
    installRuntime(richDir, [core.tarball, compiler.tarball], [richV1App.tarball, richV2App.tarball]);

    // Tiny's installed graph physically contains no advanced package.
    const tinyTopLevel = readdirSync(join(tinyDir, 'node_modules')).flatMap((name) => name.startsWith('@') ? readdirSync(join(tinyDir, 'node_modules', name)).map((child) => `${name}/${child}`) : [name]);
    const tinyAdvanced = tinyTopLevel.filter((name) => ADVANCED_PACKAGE_MARKERS.some((marker) => name.includes(marker)));
    assert.deepEqual(tinyAdvanced, [], `Tiny installed an advanced package: ${tinyAdvanced.join(', ')}`);
    assert.ok(!tinyTopLevel.includes('@kaicreator-example/v010-rich-app'), 'the Rich App leaked into the Tiny installation');
    assert.ok(!existsSync(join(tinyDir, 'node_modules', '@kaicreator-example', 'v010-rich-app-v2')), 'Rich v2 leaked into Tiny');

    const tinyEntry = join(tinyDir, 'node_modules', '@kaicreator-example', 'v010-tiny-app', 'app.mjs');
    const richEntry = join(richDir, 'node_modules', '@kaicreator-example', 'v010-rich-app', 'app.mjs');

    // ---- (4) Tiny: execute, query, restart, replay ----------------------
    const tinyReport = runScenario(tinyEntry, 'tiny-basic', tinyWork, join(tinyWork, 'report.json'));
    assertReport(tinyReport, 'Tiny', [
      'selection.tiny', 'send.basic', 'query.scoped', 'query.deniedForeignB',
      'restart.reopen', 'replay.originalReceipt', 'replay.changedInputConflict',
    ]);
    assert.equal(tinyReport.final?.manifest?.modules?.length, 4, 'Tiny must install exactly K/S/B/C');
    const tinyBare = tinyReport.resolution?.bareSpecifiers ?? [];
    assert.ok(!tinyBare.some((specifier) => ADVANCED_PACKAGE_MARKERS.some((marker) => specifier.includes(marker))), `Tiny physically resolved an advanced package: ${tinyBare.join(', ')}`);

    // ---- (5) Rich: the full L2 R3 §H consumer journey --------------------
    const main = runScenario(richEntry, 'rich-main', richWork, join(richWork, 'report-main.json'));
    assertReport(main, 'Rich main', [
      'RICH_P1.selection', 'RICH_P1.advisoryConsultation', 'RICH_P1.invokeFeatures', 'RICH_P4.modelCallTruth', 'RICH_P5.agentMemoryContext',
      'EX04_P1.twoAdapters', 'RICH_P2.twoBIsolation', 'RICH_P3.queryAuthority', 'K02_P1.eighteenTurnsOriginalReceipt',
      'EX04_F1.duplicateCallbackAndLostAck', 'DENY_N1.permitlessAdapter', 'RICH_P2.restart',
    ]);

    const waitA = runScenario(richEntry, 'rich-wait-a', richWork, join(richWork, 'report-wait-a.json'));
    assertReport(waitA, 'Rich WAIT park', ['WAIT.open']);
    const waitB = runScenario(richEntry, 'rich-wait-b', richWork, join(richWork, 'report-wait-b.json'));
    assertReport(waitB, 'Rich WAIT/RESUME restart', ['WAIT.resumeAfterRestart']);
    assert.equal(waitB.result?.state, 'resumed');
    assert.equal(waitB.result?.timedOut, 'timedOut');
    assert.equal(waitB.result?.duplicate, true);

    const t08a = runScenario(richEntry, 'rich-t08-a', richWork, join(richWork, 'report-t08-a.json'));
    assertReport(t08a, 'Rich T08 old BUILD', ['VERSION_P1.oldOccurrence']);
    const t08b = runScenario(richEntry, 'rich-t08-b', richWork, join(richWork, 'report-t08-b.json'));
    assertReport(t08b, 'Rich T08 promotion', ['VERSION_P1.newBuildActivation', 'VERSION_P1.oldPinRestore', 'VERSION_P1.revokedCandidate']);
    assert.notEqual(t08b.result?.v1, t08b.result?.v2, 'the two BUILD versions must be distinct');

    const shadow = runScenario(richEntry, 'rich-shadow', richWork, join(richWork, 'report-shadow.json'));
    assertReport(shadow, 'Rich Shadow L4', ['SHADOW_P1.zeroProductionWrites']);
    assert.equal(shadow.result?.match, 'match');
    assert.equal(shadow.result?.difference, 'difference');
    assert.equal(shadow.result?.writes, true);
    assert.equal(shadow.result?.canPromote, false);

    // ---- (6) K01: two REAL competing Node processes ---------------------
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
      // #1264 R1 made advisory consultation synchronous (one await fewer on
      // the loser path), so the losing writer can now fail closed typed at
      // the genesis window (GOVERNANCE_EXECUTION_PIN_MISSING) instead of the
      // admission-fence CAS ladder. The gate's intent is unchanged: the
      // loser must carry a TYPED kernel refusal, never a fake ACK.
      assert.match(String(loser?.outcome?.code), /ADMISSION_|K02_|GOVERNANCE_/u, `the losing writer must fail closed typed: ${raceForensics}`);
    }
    const raceJobDb = join(raceWork, 'extjob.sqlite');
    const raceDispatches = queryRows(raceJobDb, "SELECT COUNT(*) AS n FROM job_dispatch_log WHERE op = 'job.submit'")[0]!.n as number;
    const raceJobs = queryRows(raceJobDb, 'SELECT COUNT(*) AS n FROM jobs')[0]!.n as number;
    assert.equal(raceDispatches, 1, 'the external provider physically dispatched exactly once across two processes');
    assert.equal(raceJobs, 1, 'the external provider holds exactly one job row');
    const racePermits = queryRows(join(raceWork, 'rich-k.sqlite'), "SELECT COUNT(*) AS n FROM docs WHERE key LIKE '%effect-permit%'")[0]!.n as number;
    assert.equal(racePermits, 1, 'the K store holds exactly one race permit');

    // ---- (7) physical Rich witnesses on the SAME installed SQLite files --
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

    // ---- (8) evidence record --------------------------------------------
    const evidence = {
      schema: 'dh.v10.t11.clean-consumer-evidence/1',
      sourceSha: SOURCE_SHA,
      node: process.versions.node,
      platform: process.platform,
      npmRegistry: NPM_REGISTRY,
      tarballs: Object.fromEntries(Object.entries({ core, compiler, tinyApp, richV1App, richV2App }).map(([key, value]) => [key, {
        file: basename(value.tarball), sha256: value.sha256,
      }])),
      builds: buildReport.apps,
      scenarios: {
        tiny: { ok: tinyReport.ok, steps: tinyReport.steps?.map((step) => step.name), final: tinyReport.final, resolution: tinyReport.resolution },
        richMain: { ok: main.ok, steps: main.steps?.map((step) => step.name), final: main.final },
        wait: waitB.result,
        t08: t08b.result,
        shadow: shadow.result,
        race: { outcomes: races.map((report) => report.outcome), dispatches: raceDispatches, jobs: raceJobs, permits: racePermits },
      },
      physical: { richPermits: permits, richInstances: instances, richJournals: journals, jobDispatches, notifyDispatches },
      hiddenNotAvailable: [],
      notRun: [
        'Ubuntu Build Host (this session is a Windows Node24 host with real file-backed SQLite)',
        'R01 full regression / hidden validation / release qualification',
        'T09 and T10B optional DAG nodes (not selected)',
        'a JS network sandbox (deliberately NOT claimed; private npm/HTTP bypass is a code-review violation)',
      ],
      result: 'PASS_LOCAL_NODE24_SQLITE_FOCUSED',
    };
    const evidencePath = process.env.T11_EVIDENCE_PATH
      ?? join(tmpdir(), `dh-t11-evidence-${SOURCE_SHA.slice(0, 12)}.json`);
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    console.info(`T11_EVIDENCE ${evidencePath}`);
    console.info(`T11_SUMMARY ${JSON.stringify({ tiny: tinyReport.ok, richMain: main.ok, wait: waitB.ok, t08: t08b.ok, shadow: shadow.ok, race: raceA.code === 0 || raceB.code === 0, jobDispatches, notifyDispatches, permits })}`);
  } finally {
    // Best-effort cleanup; Windows keeps handles briefly, leftovers age out.
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* bounded best effort */
    }
  }
});
