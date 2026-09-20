/**
 * Contract validation suite — 领域契约验证.
 *
 * Runs every pack under `packs/`:
 * - structural validation (all tiers): business snapshots satisfy the
 *   declared value schemas ([G2/L2-8] embodiment), projection expressions
 *   compile, tool declarations are well-formed, scenarios use known actions;
 * - executable tier: compile the Raw Domain Package with the real compiler,
 *   validate the compiled package, then run the scenarios against a real
 *   createDomainRuntime assembly and collect findings.
 *
 * Findings are aggregated into `reports/findings.json` / `findings.md` —
 * the evidence base for GitHub issues.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import jsonata from 'jsonata';

import { loadPack, type LoadedPack } from './runner/pack.js';
import { runExecutablePack, type Finding, type RunResult } from './runner/execute.js';

const here = dirname(fileURLToPath(import.meta.url));
const packsDir = join(here, 'packs');
const reportsDir = join(here, 'reports');

const KNOWN_ACTIONS = new Set([
  'open', 'send', 'settle', 'expect-instance', 'expect-disposition', 'expect-projection',
  'expect-business', 'expect-ai-calls', 'expect-transport-context', 'invalidate',
  'watch-projection', 'expect-watch', 'restart', 'recover', 'advance-clock', 'expect-throw',
  'finding',
]);

const runResults: RunResult[] = [];
const loadedPacks: LoadedPack[] = [];

async function discoverPackDirs(): Promise<string[]> {
  const entries = await readdir(packsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packsDir, entry.name))
    .sort();
}

function validateStructural(pack: LoadedPack): void {
  const where = pack.meta.project;
  assert.ok(where.length > 0, 'pack.json must declare project');
  assert.ok(['executable', 'data-only'].includes(pack.meta.tier), where + ': invalid tier');
  assert.ok(pack.meta.domainId.length > 0, where + ': domainId required');
  assert.ok(pack.meta.domainVersion.length > 0, where + ': domainVersion required');

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const declared = new Map(pack.businessSources.map((entry) => [entry.source, entry]));

  for (const [source, entries] of Object.entries(pack.businessSeeds)) {
    const declaration = declared.get(source);
    assert.ok(declaration, where + ': business source ' + source + ' has seeds but no declaration in business-sources.json [G2]');
    const validate = ajv.compile(declaration.valueSchema);
    for (const entry of entries) {
      assert.ok(validate(entry.value), where + ': ' + source + '/' + entry.key + ' seed violates its declared value schema: ' + ajv.errorsText(validate.errors));
      assert.ok(entry.revision.length > 0, where + ': ' + source + '/' + entry.key + ' seed needs a revision (B1)');
    }
  }

  for (const tool of pack.tools) {
    assert.ok(tool.toolId.length > 0, where + ': tool without id');
    assert.ok(['none', 'idempotent', 'non-idempotent'].includes(tool.effect), where + ': tool ' + tool.toolId + ' invalid effect');
    assert.ok(tool.outputSchema && typeof tool.outputSchema === 'object', where + ': tool ' + tool.toolId + ' must declare outputSchema');
    assert.ok(tool.executionKind.length > 0, where + ': tool ' + tool.toolId + ' must declare executionKind');
  }

  for (const projection of pack.projections) {
    try {
      jsonata(projection.expression);
    } catch (error) {
      assert.fail(where + ': projection ' + projection.projectionId + ' JSONata does not compile: ' + String(error));
    }
    assert.ok(projection.outputSchema && typeof projection.outputSchema === 'object', where + ': projection ' + projection.projectionId + ' needs outputSchema');
    for (const dependency of projection.dependencies) {
      if (dependency.kind === 'business') {
        assert.ok(declared.has(dependency.source), where + ': projection ' + projection.projectionId + ' depends on undeclared business source ' + dependency.source);
      } else if (dependency.kind === 'workflow') {
        const selector = dependency.selector as { workflowId?: unknown };
        assert.equal(typeof selector.workflowId, 'string', where + ': workflow dependency needs selector.workflowId');
      } else {
        assert.equal(dependency.kind, 'domain-data', where + ': unknown dependency kind');
      }
    }
  }

  for (const scenario of pack.scenarios) {
    assert.ok(scenario.id.length > 0, where + ': scenario without id');
    assert.ok(scenario.steps.length > 0, where + ': scenario ' + scenario.id + ' has no steps');
    for (const step of scenario.steps) {
      assert.ok(KNOWN_ACTIONS.has(step.action), where + ': scenario ' + scenario.id + ' unknown action ' + String(step.action));
    }
  }

  if (pack.meta.tier === 'executable') {
    assert.ok(pack.compiled, where + ': executable pack must compile');
    assert.match(pack.compiled.manifest.packageId, /^[0-9a-f]{64}$/, where + ': packageId must be canonical sha256');
  }
}

test('contract validation: load and structurally validate every pack', async (t) => {
  const dirs = await discoverPackDirs();
  assert.ok(dirs.length >= 13, 'expected the 13 screened projects, found ' + dirs.length);
  for (const dir of dirs) {
    await t.test('pack ' + basename(dir), async () => {
      const pack = await loadPack(dir);
      validateStructural(pack);
      loadedPacks.push(pack);
    });
  }
});

test('contract validation: execute executable-tier packs against the SDK', async (t) => {
  const executable = loadedPacks.filter((pack) => pack.meta.tier === 'executable');
  assert.ok(executable.length >= 1, 'expected at least one executable pack');
  for (const pack of executable) {
    await t.test('run ' + pack.meta.project, async () => {
      const result = await runExecutablePack(pack);
      runResults.push(result);
    });
  }
});

test('contract validation: findings report', async () => {
  await mkdir(reportsDir, { recursive: true });
  const findings: Finding[] = runResults.flatMap((result) => result.findings);
  const summary = {
    generatedBy: 'tests/contract-validation',
    packs: loadedPacks.map((pack) => ({
      project: pack.meta.project,
      tier: pack.meta.tier,
      domainVersion: pack.meta.domainVersion,
      ...(pack.compiled === undefined ? {} : { packageId: pack.compiled.manifest.packageId }),
      ...(pack.meta.blockers === undefined ? {} : { blockers: pack.meta.blockers }),
    })),
    runs: runResults.map((result) => ({
      pack: result.pack,
      packageId: result.packageId,
      requiredCapabilities: result.requiredCapabilities,
      scenariosRun: result.scenariosRun,
      stepsRun: result.stepsRun,
      findings: result.findings.length,
    })),
    findings,
  };
  await writeFile(join(reportsDir, 'findings.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

  const lines: string[] = [
    '# Contract validation findings',
    '',
    'Generated by `tests/contract-validation` (do not edit by hand).',
    '',
    '## Runs',
    '',
    '| pack | tier | packageId | scenarios | steps | findings |',
    '|---|---|---|---|---|---|',
  ];
  for (const pack of summary.packs) {
    const run = summary.runs.find((entry) => entry.pack === pack.project);
    lines.push('| ' + pack.project + ' | ' + pack.tier + ' | ' + (run?.packageId?.slice(0, 12) ?? '—') + ' | ' + (run?.scenariosRun ?? '—') + ' | ' + (run?.stepsRun ?? '—') + ' | ' + (run?.findings ?? 0) + ' |');
  }
  lines.push('', '## Findings', '');
  const severities: Finding['severity'][] = ['defect', 'divergence', 'info'];
  for (const severity of severities) {
    const group = findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    lines.push('### ' + severity, '');
    for (const finding of group) {
      lines.push('- **' + finding.id + '** (' + finding.pack + '/' + finding.scenario + ' step ' + finding.step + ')' + (finding.related ? ' [related: ' + finding.related + ']' : ''));
      lines.push('  ' + finding.summary);
    }
    lines.push('');
  }
  await writeFile(join(reportsDir, 'findings.md'), lines.join('\n') + '\n', 'utf8');
  assert.ok(true);
});
