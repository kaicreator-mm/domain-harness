/**
 * Installed clean-consumer entry point (#1180 T11).
 *
 * Usage:
 *   node app.mjs --scenario <name> --workdir <dir> [--report <file>] [--arg k=v]
 *
 * Starts the physical ESM resolution log FIRST, then dynamically imports the
 * installed runtime and this App's scenario module, so the report contains
 * the actual module graph of a clean-installed process. Any thrown error is
 * still written to the report; the process exit code is 0 only for an
 * explicit `ok: true` report.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { startResolutionLog } from './resolution-log.mjs';

function parseArgs(argv) {
  const options = { scenario: null, workdir: null, report: null, args: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--scenario') options.scenario = argv[++index];
    else if (token === '--workdir') options.workdir = argv[++index];
    else if (token === '--report') options.report = argv[++index];
    else if (token === '--arg') {
      const pair = argv[++index] ?? '';
      const separator = pair.indexOf('=');
      if (separator > 0) options.args[pair.slice(0, separator)] = pair.slice(separator + 1);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const workdir = options.workdir ?? join(process.cwd(), 'work');
mkdirSync(workdir, { recursive: true });
const reportPath = options.report ?? join(workdir, `report-${options.scenario ?? 'unset'}.json`);
const log = startResolutionLog();

let report;
try {
  const runtime = await import('./runtime-core.mjs');
  const scenarioModule = await import('./scenario.mjs');
  const app = runtime.loadBuiltApp();
  const manifest = runtime.loadManifest();
  const result = await scenarioModule.run({
    scenario: options.scenario,
    workdir,
    app,
    manifest,
    log,
    args: options.args,
    runtime,
  });
  report = { scenario: options.scenario, ...result, ok: result?.failure === undefined };
} catch (error) {
  report = {
    ok: false,
    scenario: options.scenario,
    error: {
      name: error?.name ?? 'Error',
      code: error?.code ?? null,
      message: error?.message ?? String(error),
      stack: typeof error?.stack === 'string' ? error.stack.split('\n').slice(0, 12) : null,
    },
  };
}

log.stop();
report.resolution = {
  deploymentRoot: log.deploymentRoot,
  outsideDeploymentRoot: log.fileUrlsOutsideRoot(),
  bareSpecifiers: log.bareSpecifiers(),
  count: log.resolutions.length,
};
try {
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
} catch (error) {
  process.stderr.write(`failed to write report ${reportPath}: ${String(error)}\n`);
}
process.stdout.write(`SCENARIO_RESULT ${JSON.stringify(report)}\n`);
process.exitCode = report.ok === true ? 0 : 1;
