import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

test('T-016 package consumer: packed core/node/expo expose the public v0.2 API to a clean TypeScript consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t016-consumer-'));
  const packDirectory = join(root, 'packs');
  const consumerDirectory = join(root, 'consumer');

  try {
    run('mkdir', ['-p', packDirectory, consumerDirectory], REPO_ROOT);

    run('npm', ['run', 'build', '-w', '@kaicreator/domain-harness'], REPO_ROOT);
    run('npm', ['run', 'build', '-w', '@kaicreator/domain-harness-node'], REPO_ROOT);
    run('npm', ['run', 'build', '-w', '@kaicreator/domain-harness-expo'], REPO_ROOT);

    for (const workspace of [
      '@kaicreator/domain-harness',
      '@kaicreator/domain-harness-node',
      '@kaicreator/domain-harness-expo',
    ]) {
      run('npm', ['pack', '--workspace', workspace, '--pack-destination', packDirectory], REPO_ROOT);
    }

    const tarballs = readdirSync(packDirectory)
      .filter((name) => name.endsWith('.tgz'))
      .sort()
      .map((name) => join(packDirectory, name));
    assert.equal(tarballs.length, 3);

    writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({
      name: 'domain-harness-t016-clean-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '@types/node@^22.0.0',
        ...tarballs,
      ],
      consumerDirectory,
    );

    writeFileSync(join(consumerDirectory, 'index.ts'), `
import {
  createDomainRuntime,
  StaticPackageRegistry,
  type CompiledDomainDataPort,
  type DomainRuntime,
  type PackageRegistry,
  type RuntimeHostBindings,
  type RuntimeResources,
  type RuntimeStore,
  type TargetCompiledDomainPackage,
} from '@kaicreator/domain-harness/v2';
import { createNodeDomainRuntime } from '@kaicreator/domain-harness-node';
import { createExpoDomainRuntime } from '@kaicreator/domain-harness-expo';

const portableFactory: typeof createDomainRuntime = createDomainRuntime;
const nodeFactory: typeof createNodeDomainRuntime = createNodeDomainRuntime;
const expoFactory: typeof createExpoDomainRuntime = createExpoDomainRuntime;

let runtime: DomainRuntime | undefined;
let registry: PackageRegistry | undefined;
let store: RuntimeStore | undefined;
let bindings: RuntimeHostBindings | undefined;
let resources: RuntimeResources | undefined;
let domainData: CompiledDomainDataPort | undefined;
let compiledPackage: TargetCompiledDomainPackage | undefined;

void portableFactory;
void nodeFactory;
void expoFactory;
void runtime;
void registry;
void store;
void bindings;
void resources;
void domainData;
void compiledPackage;
void StaticPackageRegistry;
`);

    writeFileSync(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        types: ['node'],
        lib: ['ES2022', 'DOM'],
      },
      include: ['index.ts'],
    }, null, 2));

    const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    run(process.execPath, [tsc, '--project', 'tsconfig.json'], consumerDirectory);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
