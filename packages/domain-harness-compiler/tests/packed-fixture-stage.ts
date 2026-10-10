/**
 * #953 (Controller 090) — immutable pack staging shared by every test that
 * consumes packed @kaicreator/domain-harness / -compiler / -node tarballs.
 *
 * History: the e8a/e8b/public-consumer fixtures each ran
 * `npm run build --workspace @kaicreator/domain-harness` INSIDE their test
 * files. `node --import tsx --test tests/*.test.ts` executes test files in
 * parallel, so one file's `npm pack` read `packages/domain-harness/dist`
 * while another file's `tsc -p tsconfig.build.json` was rewriting it —
 * Woodpecker 1083/1 failed 4 E8b vectors with `npm error encountered
 * unexpected EOF` (mid-rewrite read of dist/application-manifest/guards.js;
 * the same class of in-suite live-dist rewrite raced the N08 workers'
 * module loads in the node workspace suite).
 *
 * Invariant enforced here: TESTS NEVER WRITE THE LIVE WORKSPACE DIST. Each
 * stage is a private mkdtemp copy — the core/node dists are produced by a
 * direct `tsc -p <pkg>/tsconfig.build.json --outDir <stage>` invocation
 * (byte-equivalent to the workspace build script, which is exactly that
 * tsc), and the compiler dist is copied read-only from the committed live
 * dist (the historical fixtures never rebuilt it in-test either). `npm pack`
 * then runs inside the staged directory, so no pack reader anywhere can
 * race a rebuild writer.
 *
 * The stage is memoized per test process (all vectors of one file share the
 * same immutable tarballs; every vector still installs them into its own
 * fresh clean consumer) and removed at process exit.
 *
 * #953 (Controller 093, P2-01) staleness guard: the staged NODE build still
 * type-resolves `@kaicreator/domain-harness` declarations from the LIVE
 * workspace dist (npm workspace resolution), not from the staged core dist.
 * If that live dist were stale or missing relative to the sources the staged
 * core was just built from, the staged core and node tarballs would form a
 * silently mismatched set. stageOnce therefore verifies that every file of
 * the freshly staged core dist exists in the live dist with identical bytes
 * (freshDistProblems) and FAILS CLOSED on any difference instead of packing
 * a mismatched trio. Two further P2-01 findings are handled here: staged
 * source maps are canonicalized to the in-place build layout (redirecting
 * --outDir otherwise leaks machine-local paths into the tarball and breaks
 * byte-equivalence), and the committed live core dist additionally carries
 * legacy v0.1 "shipped orphans" that the production closure no longer emits —
 * tolerated by the guard (their disposition belongs to the
 * check-committed-dist policy owner) but pinned and reported by the
 * equivalence evidence test in the node package. The compiler dist is a
 * verbatim copy of the committed live tree (#299; its source freshness is
 * owned by the CI `check-committed-dist` gate, not re-derived here).
 *
 * #953 (Controller 093, P2-02) crash leftovers: a hard-killed test process
 * (SIGKILL / taskkill /F) CANNOT run any cleanup — no exit handler fires
 * and no signal handler for SIGKILL exists or is claimed. The honest
 * bounded mitigation is lazy scavenging: every NEW stage sweeps tmpdir for
 * `dh-packed-stage-*` roots older than the age bound below (a stage still in
 * use by a concurrent process is always far younger; suites run for
 * minutes, the bound is a day).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const CORE_PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'domain-harness');
const NODE_PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'domain-harness-node');

const STAGE_DIRECTORY_PREFIX = 'dh-packed-stage-';
const STAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface PackedTarball {
  readonly path: string;
  readonly fileName: string;
  readonly sha256: string;
}

export interface StagedPacks {
  readonly root: string;
  readonly packsDirectory: string;
  readonly coreTarball: PackedTarball;
  readonly compilerTarball: PackedTarball;
  readonly nodeTarball?: PackedTarball;
}

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') {
    return run('npm', args, cwd);
  }
  // Windows resolves npm to npm.cmd and Node refuses to spawn batch files
  // without a shell (same accepted pattern as tests/public-consumer.test.ts).
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  } as Parameters<typeof execFileSync>[1]) as string;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Every file under `root` as `relative/posix/path -> sha256` (recursive). */
export function directoryDigest(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), relative);
      } else {
        files.set(relative, sha256File(join(directory, entry.name)));
      }
    }
  };
  walk(root, '');
  return files;
}

/**
 * Compare two directory trees by relative path + per-file sha256. Returns one
 * human-readable problem per missing file, extra file, unreadable tree, or
 * content mismatch; an empty list means the trees are file- and
 * content-identical. Exported for the P2-01 equivalence/negative tests.
 */
export function compareDirectoryDigests(actualRoot: string, expectedRoot: string): readonly string[] {
  const problems: string[] = [];
  let actual: Map<string, string>;
  let expected: Map<string, string>;
  try {
    actual = directoryDigest(actualRoot);
  } catch (error) {
    return [`actual tree ${actualRoot} unreadable: ${String(error)}`];
  }
  try {
    expected = directoryDigest(expectedRoot);
  } catch (error) {
    return [`expected tree ${expectedRoot} unreadable: ${String(error)}`];
  }
  for (const [path, digest] of expected) {
    if (!actual.has(path)) {
      problems.push(`missing file: ${path}`);
    } else if (actual.get(path) !== digest) {
      problems.push(`content differs: ${path} (expected sha256 ${digest.slice(0, 16)}…, got ${String(actual.get(path)).slice(0, 16)}…)`);
    }
  }
  for (const path of actual.keys()) {
    if (!expected.has(path)) problems.push(`extra file: ${path}`);
  }
  return problems;
}

/**
 * Freshness comparison with documented-orphan tolerance (#953 P2-01): every
 * file a FRESH source build produces must exist in the live/committed dist
 * with identical bytes. Files present only on the live side are NOT flagged
 * here — the committed core dist still carries the legacy v0.1 module
 * outputs that tsconfig.build.json no longer compiles (the "shipped
 * orphans" reported by the P2-01 equivalence evidence; their disposition
 * belongs to the CI check-committed-dist policy owner, not to staging).
 * Missing or content-diverged fresh outputs ARE staleness and fail closed.
 */
export function freshDistProblems(freshRoot: string, liveRoot: string): readonly string[] {
  const problems: string[] = [];
  let fresh: Map<string, string>;
  let live: Map<string, string>;
  try {
    fresh = directoryDigest(freshRoot);
  } catch (error) {
    return [`fresh tree ${freshRoot} unreadable: ${String(error)}`];
  }
  try {
    live = directoryDigest(liveRoot);
  } catch (error) {
    return [`live tree ${liveRoot} unreadable: ${String(error)}`];
  }
  for (const [path, digest] of fresh) {
    if (!live.has(path)) {
      problems.push(`missing from live dist: ${path}`);
    } else if (live.get(path) !== digest) {
      problems.push(`content differs: ${path} (fresh sha256 ${digest.slice(0, 16)}…, live ${String(live.get(path)).slice(0, 16)}…)`);
    }
  }
  return problems;
}

/**
 * #953 P2-02 — bounded scavenging of orphaned stages. A hard-killed process
 * cannot clean up after itself (no SIGKILL handler exists or is claimed);
 * instead the next staging process lazily sweeps tmpdir for stage roots
 * older than `maxAgeMs`. Returns what it removed and what it kept (locked
 * files are left for a later sweep, not force-deleted past failures).
 */
export function scavengeStaleStages(options: {
  readonly directory?: string;
  readonly maxAgeMs?: number;
  readonly now?: () => number;
} = {}): { readonly removed: readonly string[]; readonly kept: readonly string[] } {
  const directory = options.directory ?? tmpdir();
  const maxAgeMs = options.maxAgeMs ?? STAGE_MAX_AGE_MS;
  const now = options.now?.() ?? Date.now();
  const removed: string[] = [];
  const kept: string[] = [];
  let entries: readonly string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return { removed, kept };
  }
  for (const name of entries) {
    if (!name.startsWith(STAGE_DIRECTORY_PREFIX)) continue;
    const full = join(directory, name);
    let mtimeMs: number;
    try {
      const stats = statSync(full);
      if (!stats.isDirectory()) continue;
      mtimeMs = stats.mtimeMs;
    } catch {
      continue;
    }
    if (!Number.isFinite(mtimeMs)) continue;
    if (now - mtimeMs > maxAgeMs) {
      try {
        rmSync(full, { recursive: true, force: true });
        removed.push(name);
      } catch {
        kept.push(name);
      }
    } else {
      kept.push(name);
    }
  }
  return { removed, kept };
}

/**
 * Canonicalize the `sources` of every .map in a freshly staged dist to the
 * layout a clean in-place build produces (#953 P1 repair evidence: the
 * Controller-092 reviewer correctly refused to infer byte equivalence from
 * identical tsc syntax — and indeed the redirected --outDir made tsc emit
 * machine-local source paths, e.g.
 * `../../../../../../…/dh-i953-ti090/packages/…/src/x.ts`, both leaking the
 * build host into the packed tarball and breaking byte-equivalence with the
 * clean npm pack). With rootDir=src the output subpath under dist mirrors
 * the source subpath under src, so the canonical entry is exactly what the
 * in-place build writes: `../`×depth + `src/<subpath>`. Maps whose sources
 * are not the single expected `.ts` entry are left untouched — the P2-01
 * equivalence test (not silent normalization) surfaces any residue.
 */
function canonicalizeStageSourceMaps(stageDistDirectory: string): number {
  let rewritten = 0;
  const walk = (directory: string, relativeParts: readonly string[]): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), [...relativeParts, entry.name]);
        continue;
      }
      if (!entry.name.endsWith('.map')) continue;
      const mapPath = join(directory, entry.name);
      let map: { sources?: unknown };
      try {
        map = JSON.parse(readFileSync(mapPath, 'utf8')) as { sources?: unknown };
      } catch {
        continue;
      }
      const sources = map.sources;
      if (!Array.isArray(sources) || sources.length !== 1 || typeof sources[0] !== 'string' || !sources[0].endsWith('.ts')) continue;
      const sourceName = sources[0]!;
      const canonical = `${'../'.repeat(relativeParts.length + 1)}src/${[...relativeParts, sourceName.split('/').pop()!].join('/')}`;
      if (sourceName === canonical) continue;
      map.sources = [canonical];
      writeFileSync(mapPath, JSON.stringify(map));
      rewritten += 1;
    }
  };
  walk(stageDistDirectory, []);
  return rewritten;
}

/** Emit one package's build output into the stage (never the live dist). */
function tscBuildToStage(buildConfigPath: string, stageDistDirectory: string): void {
  const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tsc, '-p', buildConfigPath, '--outDir', stageDistDirectory], REPO_ROOT);
  canonicalizeStageSourceMaps(stageDistDirectory);
}

/**
 * Copy the pack-relevant skeleton of one package into its stage root. The
 * shipped `files` entries are exactly dist (+ README.md where declared);
 * no package defines prepack/postpack scripts or a LICENSE, so this is the
 * complete set npm pack would pick up from the live package root.
 */
function stagePackageSkeleton(packageRoot: string, stageRoot: string, readme: boolean): void {
  mkdirSync(stageRoot, { recursive: true });
  cpSync(join(packageRoot, 'package.json'), join(stageRoot, 'package.json'));
  if (readme) {
    cpSync(join(packageRoot, 'README.md'), join(stageRoot, 'README.md'));
  }
}

/**
 * Run `npm pack` inside `packageRoot` and return the single resulting
 * tarball. Exported so the P2-01 equivalence test can pack the LIVE
 * workspace roots the exact same way (pack reads only; it never writes the
 * live dist).
 */
export function packTarballFrom(packageRoot: string, packsDirectory: string, nameFragment: string, expectedCount: number): PackedTarball {
  runNpm(['pack', '--pack-destination', packsDirectory], packageRoot);
  const matches = readdirSync(packsDirectory)
    .filter((fileName) => fileName.endsWith('.tgz') && fileName.includes(nameFragment))
    .sort();
  if (matches.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} staged ${nameFragment} tarball(s), found ${matches.length}`);
  }
  const fileName = matches[0]!;
  const path = join(packsDirectory, fileName);
  return { path, fileName, sha256: sha256File(path) };
}

function packStage(stageRoot: string, packsDirectory: string, nameFragment: string, expectedCount: number): PackedTarball {
  return packTarballFrom(stageRoot, packsDirectory, nameFragment, expectedCount);
}

async function stageOnce(includeNodePackage: boolean): Promise<StagedPacks> {
  // P2-02: lazily sweep stages orphaned by hard-killed processes first.
  scavengeStaleStages();
  const root = mkdtempSync(join(tmpdir(), STAGE_DIRECTORY_PREFIX));
  try {
    const packsDirectory = join(root, 'packs');
    mkdirSync(packsDirectory, { recursive: true });

    stagePackageSkeleton(CORE_PACKAGE_ROOT, join(root, 'core'), true);
    tscBuildToStage(join(CORE_PACKAGE_ROOT, 'tsconfig.build.json'), join(root, 'core', 'dist'));

    // P2-01 fail-closed staleness guard: the staged node build type-resolves
    // core declarations from the LIVE workspace dist, so a live dist that is
    // stale or missing relative to the fresh source build would silently
    // produce a mismatched core+node pack set. Refuse to pack instead.
    // (freshDistProblems tolerates the committed legacy v0.1 "shipped
    // orphans" — see its docblock and the P2-01 equivalence evidence.)
    const staleness = freshDistProblems(join(root, 'core', 'dist'), join(CORE_PACKAGE_ROOT, 'dist'));
    if (staleness.length > 0) {
      throw new Error(
        `live workspace core dist does not match a fresh source build (stale or missing) — refusing to stage a mismatched pack set; run \`npm run build\` first. Differences (fresh vs live):\n${staleness.slice(0, 20).join('\n')}`,
      );
    }

    stagePackageSkeleton(PACKAGE_ROOT, join(root, 'compiler'), true);
    // The compiler dist ships committed from git (#299) and no test rebuilds
    // it: stage a read-only copy of the live tree.
    cpSync(join(PACKAGE_ROOT, 'dist'), join(root, 'compiler', 'dist'), { recursive: true });

    const coreTarball = packStage(join(root, 'core'), packsDirectory, 'domain-harness-0.2.0', 1);
    const compilerTarball = packStage(join(root, 'compiler'), packsDirectory, 'compiler', 1);

    let nodeTarball: PackedTarball | undefined;
    if (includeNodePackage) {
      stagePackageSkeleton(NODE_PACKAGE_ROOT, join(root, 'node'), false);
      tscBuildToStage(join(NODE_PACKAGE_ROOT, 'tsconfig.build.json'), join(root, 'node', 'dist'));
      nodeTarball = packStage(join(root, 'node'), packsDirectory, 'domain-harness-node', 1);
    }

    process.once('exit', () => rmSync(root, { recursive: true, force: true }));
    return { root, packsDirectory, coreTarball, compilerTarball, nodeTarball };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

const stagedCache = new Map<string, Promise<StagedPacks>>();

/**
 * Stage (and memoize per test process) the immutable packed tarballs of the
 * candidate tree. Compiler/public-compatibility fixtures need core+compiler;
 * the node successor-host consumer additionally needs @kaicreator/domain-harness-node.
 */
export function stagePackedWorkspaces(options: { readonly includeNodePackage?: boolean } = {}): Promise<StagedPacks> {
  const key = options.includeNodePackage === true ? 'core+node+compiler' : 'core+compiler';
  let staged = stagedCache.get(key);
  if (staged === undefined) {
    staged = stageOnce(options.includeNodePackage === true);
    stagedCache.set(key, staged);
    staged.catch(() => stagedCache.delete(key));
  }
  return staged;
}
