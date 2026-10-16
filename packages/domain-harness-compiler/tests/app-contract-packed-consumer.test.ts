/**
 * v0.8 T-G #1006 / HF25 — packed BUILD delivery boundary for the typed
 * App-contract generator.
 *
 * PR #1085 proved that a TypeScript consumer can use the committed generated
 * artifact (`order-app.generated.ts`, byte-pinned by app-contract-generation
 * tests). What it could NOT prove is that an npm-installed BUILD consumer can
 * actually RUN the generator: the source was only reachable as a private
 * kernel import. This test closes exactly that distribution gap:
 *
 * - a clean consumer installs the PACKED core + compiler tarballs (shared
 *   immutable stage, never the live workspace dist) and runs
 *   `generateTypedAppContracts` against the same frozen order-app inputs,
 *   asserting the output is byte-for-byte the #1085 golden artifact;
 * - the packed generator keeps its fail-closed negative contract
 *   (SOURCE_FORMAT_MISMATCH / PACKAGE_MISMATCH) — reuse of the merged #1085
 *   positive/negative fixture semantics, executed from the tarball;
 * - the generated artifact itself typechecks standalone in the clean consumer
 *   (strict tsc, skipLibCheck: false) next to a typed import of the public
 *   generator surface;
 * - the Microkernel tarball no longer re-exports compiler tooling: the
 *   legacy `/v3` barrel must NOT expose `generateTypedAppContracts`, so the
 *   generator is reachable only from its frozen BUILD owner
 *   (`@kaicreator/domain-harness-compiler`). No runtime authority is
 *   inferred from any of this.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stagePackedWorkspaces } from './packed-fixture-stage.js';
import {
  orderAppContracts,
  orderManifest,
} from './fixtures/app-contracts/order-app-source.js';

/**
 * CI robustness (mirrors public-consumer.test.ts): the clean consumer
 * npm-installs @types/node, so workers without registry egress must SKIP
 * explicitly instead of hanging an install to the step timeout. Setting
 * NPM_REGISTRY both retargets the probe and is passed to the install command
 * so the same declaration governs reachability and installation.
 */
const NPM_REGISTRY = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';

function npmRegistryReachable(): boolean {
  const probe = spawnSync('npm', ['ping', '--registry', NPM_REGISTRY], {
    encoding: 'utf8', timeout: 15_000, shell: process.platform === 'win32',
  });
  return probe.status === 0;
}

const PACKED_CONSUMER_NET_SKIP: string | undefined = npmRegistryReachable()
  ? undefined
  : 'PACKED CONSUMER NOT_RUN(NETWORK): npm registry unreachable from this execution environment';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');

// The golden artifact stays in the kernel test tree beside the #1085 typed
// consumer test that imports it as a module; this packed proof reuses the
// same single committed copy instead of duplicating it.
const GOLDEN_URL = new URL(
  '../../domain-harness/tests/fixtures/app-contracts/order-app.generated.ts',
  import.meta.url,
);

function readCheckoutNormalizedGolden(): string {
  const checkedOut = readFileSync(GOLDEN_URL, 'utf8');
  return checkedOut.replaceAll('\r\n', '\n');
}

function run(command: string, args: readonly string[], cwd: string): void {
  execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): void {
  if (process.platform !== 'win32') {
    run('npm', args, cwd);
    return;
  }
  // Windows resolves npm to npm.cmd and Node refuses to spawn batch files
  // without a shell; one quoted command line keeps space-safe args (same
  // workaround as public-consumer.test.ts).
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

test(
  'HF25: a clean npm-installed consumer runs the packed BUILD generator, reproduces the golden artifact and hits its fail-closed negatives',
  { skip: PACKED_CONSUMER_NET_SKIP },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'dh-hf25-packed-consumer-'));
    const consumerDirectory = join(root, 'consumer');
    const golden = readCheckoutNormalizedGolden();

    try {
      mkdirSync(consumerDirectory, { recursive: true });

      // The generator artifact depends on the authoritative core contracts,
      // so the clean consumer installs both packed tarballs from the shared
      // immutable stage (never a live-dist rebuild).
      const staged = await stagePackedWorkspaces();
      const tarballs = [staged.coreTarball.path, staged.compilerTarball.path];

      writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({
        name: 'domain-harness-hf25-packed-consumer',
        private: true,
        type: 'module',
      }, null, 2));

      runNpm(
        // @types/node mirrors the T-016 consumer: the authoritative core
        // contracts re-exported by the compiler reference AbortSignal, which
        // the consumer typechecks with skipLibCheck: false.
        [
          'install', '--ignore-scripts', '--no-audit', '--no-fund',
          `--registry=${NPM_REGISTRY}`,
          '@types/node@^22.0.0', ...tarballs,
        ],
        consumerDirectory,
      );

      // Runtime positive/negative journey, executed from the packed dist.
      // The frozen order-app inputs are the exact #1085 fixtures; the golden
      // bytes are the exact artifact its typed consumer test imports.
      writeFileSync(join(consumerDirectory, 'run-generator.mjs'), `
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  APP_CONTRACT_SOURCE_FORMAT,
  AppContractGenerationError,
  generateTypedAppContracts,
} from '@kaicreator/domain-harness-compiler';

const manifest = ${JSON.stringify(orderManifest)};
const source = ${JSON.stringify(orderAppContracts)};
const golden = ${JSON.stringify(golden)};

// HF25-P: the packed generator runs and reproduces the golden artifact.
assert.equal(APP_CONTRACT_SOURCE_FORMAT, 'domain-harness.app-contracts.v1');
const generated = generateTypedAppContracts(manifest, source);
assert.doesNotMatch(generated, /\\r/);
assert.equal(generated.match(/\\n+$/)[0], '\\n\\n');
assert.equal(generated, golden);
writeFileSync(new URL('./order-app.generated.ts', import.meta.url), generated);

// HF25-N1: an invented source format fails closed before any output.
assert.throws(
  () => generateTypedAppContracts(manifest, { ...source, format: 'domain-harness.app-contracts.invalid' }),
  (error) => error instanceof AppContractGenerationError && error.code === 'SOURCE_FORMAT_MISMATCH',
);

// HF25-N2: a selector bound to a different package is refused, not widened.
assert.throws(
  () => generateTypedAppContracts(manifest, { ...source, packageId: 'wrong' }),
  (error) => error instanceof AppContractGenerationError && error.code === 'PACKAGE_MISMATCH',
);

// Boundary negative: compiler tooling is NOT delivered by the Microkernel.
// The generator is reachable only through its frozen BUILD owner.
const v3 = await import('@kaicreator/domain-harness/v3');
assert.equal('generateTypedAppContracts' in v3, false, 'the Microkernel /v3 lane must not ship the BUILD generator');
`);

      run(process.execPath, ['run-generator.mjs'], consumerDirectory);

      // Typed consumer journey: the public generator surface and the freshly
      // generated artifact both typecheck in the clean consumer (strict,
      // skipLibCheck: false, same settings as public-consumer.test.ts).
      writeFileSync(join(consumerDirectory, 'index.ts'), `
import {
  APP_CONTRACT_SOURCE_FORMAT,
  AppContractGenerationError,
  generateTypedAppContracts,
} from '@kaicreator/domain-harness-compiler';
import type {
  AppCommandContractSource,
  AppContractGenerationErrorCode,
  AppDomainEventContractSource,
  AppViewContractSource,
  AppWatchContractSource,
  CompiledAppContractSource,
  GeneratedAppContractOptions,
} from '@kaicreator/domain-harness-compiler';

// Frozen format constant keeps its exact literal shape.
const format: 'domain-harness.app-contracts.v1' = APP_CONTRACT_SOURCE_FORMAT;

// The generator/error constructor keep their exact committed signatures.
const generator: typeof generateTypedAppContracts = generateTypedAppContracts;
const errorCtor: typeof AppContractGenerationError = AppContractGenerationError;

// The source-shape types stay nameable and usable by a BUILD consumer.
let commandSource: AppCommandContractSource | undefined;
let viewSource: AppViewContractSource | undefined;
let watchSource: AppWatchContractSource | undefined;
let eventSource: AppDomainEventContractSource | undefined;
let selector: CompiledAppContractSource | undefined;
let options: GeneratedAppContractOptions | undefined;
let errorCode: AppContractGenerationErrorCode | undefined;

void format; void generator; void errorCtor; void commandSource; void viewSource;
void watchSource; void eventSource; void selector; void options; void errorCode;
`);

      writeFileSync(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          lib: ['ES2022'],
        },
        include: ['index.ts', 'order-app.generated.ts'],
      }, null, 2));

      const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
      run(process.execPath, [tsc, '--project', 'tsconfig.json'], consumerDirectory);

      // Compiler deep imports stay closed by the package exports map: the
      // generator module is reachable only through the public root entry.
      run(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          "try { await import('@kaicreator/domain-harness-compiler/dist/app-contracts/app-contracts.js'); throw new Error('generator deep import unexpectedly succeeded'); } catch (error) { if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }",
        ],
        consumerDirectory,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
