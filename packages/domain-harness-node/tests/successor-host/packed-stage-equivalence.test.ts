// #953 (Controller 093, P2-01) — staged-tarball package equivalence
// evidence. The Controller-092 reviewer correctly refused to accept
// "identical tsc invocation syntax" as proof of npm package equivalence;
// executing the comparison here surfaced two real divergences, both now
// handled INSIDE the test-infra concern:
//   1. redirected --outDir builds embedded machine-local source-map paths —
//      fixed in packed-fixture-stage.ts by canonicalizing staged .map
//      `sources` to the in-place layout;
//   2. the LIVE/committed core dist ships 184 legacy v0.1 "orphans" that
//      tsconfig.build.json no longer compiles (loader/compiler/engine/…
//      per that config's own header) — a packaging hygiene finding that
//      belongs to the check-committed-dist policy owner, NOT repaired here.
// This file proves, per package (core / compiler / node):
//   - SUBSET EQUIVALENCE: every file of the staged (fresh-source-truth)
//     package exists in the clean live npm pack with identical sha256;
//   - the live-only divergence is pinned: for core, every live-only file
//     must sit under one of the documented legacy v0.1 roots (count
//     reported in the assertion message so drift is loud); for compiler
//     (verbatim committed copy) and node (full-src closure) NO live-only
//     file may exist;
//   - EXACT-SHA reproducibility: a second INDEPENDENT staging process
//     produces byte-identical tarballs (sha256) for all three packages.
// It runs in the NODE package, whose test script builds the live core+node
// dists first; it never writes any live dist.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packTarballFrom, stagePackedWorkspaces } from '../../../../packages/domain-harness-compiler/tests/packed-fixture-stage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NODE_PACKAGE_ROOT = resolve(HERE, '../..');
const CORE_PACKAGE_ROOT = resolve(NODE_PACKAGE_ROOT, '../domain-harness');
const COMPILER_PACKAGE_ROOT = resolve(NODE_PACKAGE_ROOT, '../domain-harness-compiler');

// The legacy v0.1 module roots that tsconfig.build.json documents as "no
// longer compiled into or shipped inside the published artifact" — yet the
// committed dist still carries their outputs. New live-only files under any
// OTHER root fail this evidence test loudly.
const LEGACY_ORPHAN_ROOTS = new Set([
  'compiler', 'contracts', 'create-domain-harness', 'engine', 'execution', 'expression',
  'instance', 'legacy-v1', 'loader', 'package', 'persistence', 'projection', 'public',
  'query', 'recovery', 'recovery-v2', 'runner', 'script', 'subscription',
]);

function extractTarball(tarballPath: string, destination: string): string {
  const packageRoot = join(destination, 'package');
  mkdirSync(destination, { recursive: true });
  // cwd + forward slashes + --force-local keep Windows bsdtar from parsing
  // `C:\…` as a remote host spec; GNU tar on CI accepts the same form.
  execFileSync('tar', ['--force-local', '-xzf', tarballPath.replaceAll('\\', '/')], { cwd: destination });
  return packageRoot;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listFiles(root: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(join(root, entry.name), relative));
    else out.push(relative);
  }
  return out;
}

function rootSegment(relativePath: string): string {
  const withinPackage = relativePath.replace(/^dist\//, '');
  return withinPackage.split('/')[0]!.replace(/\.(js|d\.ts|js\.map|d\.ts\.map)$/, '');
}

test('P2-01: staged core/compiler/node tarballs are content-equivalent to clean live npm packs, with the live-only divergence pinned to documented legacy orphans', async () => {
  const staged = await stagePackedWorkspaces({ includeNodePackage: true });
  assert.notEqual(staged.nodeTarball, undefined, 'the node-inclusive stage must produce a node tarball');
  const liveBase = mkdtempSync(join(tmpdir(), 'dh-live-packs-'));
  const extractBase = mkdtempSync(join(tmpdir(), 'dh-equiv-extract-'));
  try {
    const cases = [
      { label: 'core', stagedTarball: staged.coreTarball, liveRoot: CORE_PACKAGE_ROOT, fragment: 'domain-harness-0.2.0', legacyOrphansAllowed: true },
      { label: 'compiler', stagedTarball: staged.compilerTarball, liveRoot: COMPILER_PACKAGE_ROOT, fragment: 'compiler', legacyOrphansAllowed: false },
      { label: 'node', stagedTarball: staged.nodeTarball!, liveRoot: NODE_PACKAGE_ROOT, fragment: 'domain-harness-node', legacyOrphansAllowed: false },
    ] as const;
    const orphanReport: string[] = [];
    for (const caseEntry of cases) {
      const livePacksDirectory = join(liveBase, caseEntry.label);
      mkdirSync(livePacksDirectory, { recursive: true });
      const liveTarball = packTarballFrom(caseEntry.liveRoot, livePacksDirectory, caseEntry.fragment, 1);
      assert.equal(caseEntry.stagedTarball.fileName, liveTarball.fileName, `${caseEntry.label}: canonical tarball file name must match the clean live npm pack`);

      const stagedPackage = extractTarball(caseEntry.stagedTarball.path, join(extractBase, `${caseEntry.label}-staged`));
      const livePackage = extractTarball(liveTarball.path, join(extractBase, `${caseEntry.label}-live`));
      const stagedFiles = listFiles(stagedPackage);
      const stagedSet = new Set(stagedFiles);
      const liveFiles = new Set(listFiles(livePackage));
      const problems: string[] = [];
      const liveOnly: string[] = [];
      for (const relative of stagedFiles) {
        if (!liveFiles.has(relative)) {
          problems.push(`missing from live pack: ${relative}`);
          continue;
        }
        if (sha256File(join(stagedPackage, relative)) !== sha256File(join(livePackage, relative))) {
          problems.push(`content differs: ${relative}`);
        }
      }
      for (const relative of liveFiles) {
        if (!stagedSet.has(relative)) liveOnly.push(relative);
      }
      assert.deepEqual(problems, [], `${caseEntry.label}: every staged file must exist in the clean live npm pack with identical sha256`);
      if (caseEntry.legacyOrphansAllowed) {
        const undocumented = liveOnly.filter((relative) => !LEGACY_ORPHAN_ROOTS.has(rootSegment(relative)));
        assert.deepEqual(
          undocumented,
          [],
          `${caseEntry.label}: live-only files outside the documented legacy v0.1 roots must be zero (new shipped orphans need explicit adjudication); live-only count=${liveOnly.length}`,
        );
        orphanReport.push(`${caseEntry.label}: ${liveOnly.length} documented legacy v0.1 shipped orphans in the live pack only`);
      } else {
        assert.deepEqual(
          liveOnly,
          [],
          `${caseEntry.label}: no live-only file may exist${caseEntry.label === 'node' ? ' (a non-empty list means a stale local node dist — delete packages/domain-harness-node/dist and rebuild)' : ''}`,
        );
      }
    }
    // Surface the pinned divergence in the test log for the record.
    console.error(`P2_01_ORPHAN_REPORT ${JSON.stringify(orphanReport)}`);
  } finally {
    rmSync(liveBase, { recursive: true, force: true });
    rmSync(extractBase, { recursive: true, force: true });
  }
}, 600_000);

test('P2-01: two independent staging processes produce byte-identical (exact-SHA) tarballs', async () => {
  const stagedHere = await stagePackedWorkspaces({ includeNodePackage: true });
  // A second, genuinely independent stage: fresh process, fresh mkdtemp root.
  const runner = mkdtempSync(join(tmpdir(), 'dh-stage-probe-'));
  try {
    const stageHelperUrl = new URL(`file:///${resolve(NODE_PACKAGE_ROOT, '../domain-harness-compiler/tests/packed-fixture-stage.ts').replace(/\\/g, '/')}`).href;
    const runnerScript = join(runner, 'stage-once.ts');
    // No top-level await: the runner lives in tmpdir without a `type: module`
    // package.json, so tsx would compile it as CJS and reject TLA.
    writeFileSync(runnerScript, `import { stagePackedWorkspaces } from '${stageHelperUrl}';
stagePackedWorkspaces({ includeNodePackage: true }).then((staged) => {
  console.log(JSON.stringify({
    core: staged.coreTarball.sha256,
    compiler: staged.compilerTarball.sha256,
    node: staged.nodeTarball?.sha256,
    coreName: staged.coreTarball.fileName,
    compilerName: staged.compilerTarball.fileName,
    nodeName: staged.nodeTarball?.fileName,
  }));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
`);
    const probe = spawnSync(process.execPath, ['--import', 'tsx', runnerScript], {
      cwd: NODE_PACKAGE_ROOT,
      encoding: 'utf8',
      timeout: 480_000,
    });
    assert.equal(probe.status, 0, `independent stage probe failed: ${probe.stderr?.slice(-2000)}`);
    const lines = probe.stdout.trim().split('\n');
    const report = JSON.parse(lines[lines.length - 1]!) as { core: string; compiler: string; node?: string; coreName: string; compilerName: string; nodeName?: string };
    assert.equal(report.core, stagedHere.coreTarball.sha256, 'core tarball must be byte-identical across independent stages');
    assert.equal(report.compiler, stagedHere.compilerTarball.sha256, 'compiler tarball must be byte-identical across independent stages');
    assert.equal(report.node, stagedHere.nodeTarball?.sha256, 'node tarball must be byte-identical across independent stages');
    assert.equal(report.coreName, stagedHere.coreTarball.fileName);
    assert.equal(report.compilerName, stagedHere.compilerTarball.fileName);
    assert.equal(report.nodeName, stagedHere.nodeTarball?.fileName);
  } finally {
    rmSync(runner, { recursive: true, force: true });
  }
}, 600_000);
