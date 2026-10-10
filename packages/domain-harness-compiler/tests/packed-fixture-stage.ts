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
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const CORE_PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'domain-harness');
const NODE_PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'domain-harness-node');

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

/** Emit one package's build output into the stage (never the live dist). */
function tscBuildToStage(buildConfigPath: string, stageDistDirectory: string): void {
  const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tsc, '-p', buildConfigPath, '--outDir', stageDistDirectory], REPO_ROOT);
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

function packStage(stageRoot: string, packsDirectory: string, nameFragment: string, expectedCount: number): PackedTarball {
  runNpm(['pack', '--pack-destination', packsDirectory], stageRoot);
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

async function stageOnce(includeNodePackage: boolean): Promise<StagedPacks> {
  const root = mkdtempSync(join(tmpdir(), 'dh-packed-stage-'));
  try {
    const packsDirectory = join(root, 'packs');
    mkdirSync(packsDirectory, { recursive: true });

    stagePackageSkeleton(CORE_PACKAGE_ROOT, join(root, 'core'), true);
    tscBuildToStage(join(CORE_PACKAGE_ROOT, 'tsconfig.build.json'), join(root, 'core', 'dist'));

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
