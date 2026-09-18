import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

test('packed compiler exposes the stable root build API to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-compiler-consumer-'));
  const packDirectory = join(root, 'packs');
  const consumerDirectory = join(root, 'consumer');

  try {
    mkdirSync(packDirectory, { recursive: true });
    mkdirSync(consumerDirectory, { recursive: true });

    run('npm', ['pack', '--pack-destination', packDirectory], PACKAGE_ROOT);
    const tarballs = readdirSync(packDirectory)
      .filter((name) => name.endsWith('.tgz'))
      .sort()
      .map((name) => join(packDirectory, name));
    assert.equal(tarballs.length, 1);

    writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({
      name: 'domain-harness-compiler-clean-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    run(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarballs[0] ?? ''],
      consumerDirectory,
    );

    writeFileSync(join(consumerDirectory, 'index.ts'), `
import {
  compileDomainPackage,
  emitTargetCompiledPackageModule,
  loadRawDomainPackage,
  type BindingModuleReference,
  type CapabilityId,
  type CompileDomainPackageInput,
  type CompileDomainPackageResult,
  type CompiledPackageManifest,
  type EmitTargetModuleInput,
  type JsonObject,
  type JsonSchema,
  type LoadRawDomainPackageOptions,
  type LoadedRawDomainPackage,
  type LogicalToolBindingConfig,
  type RawProjectionDefinition,
  type RawProjectionDependency,
  type RawToolDefinition,
  type TargetHostProfile,
  type ToolEffectSemantics,
} from '@kaicreator/domain-harness-compiler';

const loader: typeof loadRawDomainPackage = loadRawDomainPackage;
const compiler: typeof compileDomainPackage = compileDomainPackage;
const emitter: typeof emitTargetCompiledPackageModule = emitTargetCompiledPackageModule;

let loadOptions: LoadRawDomainPackageOptions | undefined;
let rawPackage: LoadedRawDomainPackage | undefined;
let compileInput: CompileDomainPackageInput | undefined;
let compileResult: CompileDomainPackageResult | undefined;
let manifest: CompiledPackageManifest | undefined;
let emitInput: EmitTargetModuleInput | undefined;
let bindingModule: BindingModuleReference | undefined;
let capability: CapabilityId | undefined;
let target: TargetHostProfile | undefined;
let tool: RawToolDefinition | undefined;
let projection: RawProjectionDefinition | undefined;
let dependency: RawProjectionDependency | undefined;
let bindingConfig: LogicalToolBindingConfig | undefined;
let effect: ToolEffectSemantics | undefined;
let objectValue: JsonObject | undefined;
let schema: JsonSchema | undefined;

void loader;
void compiler;
void emitter;
void loadOptions;
void rawPackage;
void compileInput;
void compileResult;
void manifest;
void emitInput;
void bindingModule;
void capability;
void target;
void tool;
void projection;
void dependency;
void bindingConfig;
void effect;
void objectValue;
void schema;
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
      include: ['index.ts'],
    }, null, 2));

    const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    run(process.execPath, [tsc, '--project', 'tsconfig.json'], consumerDirectory);

    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const m = await import('@kaicreator/domain-harness-compiler'); for (const key of ['loadRawDomainPackage','compileDomainPackage','emitTargetCompiledPackageModule']) { if (typeof m[key] !== 'function') throw new Error('missing compiler root export: ' + key); }",
      ],
      consumerDirectory,
    );

    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "try { await import('@kaicreator/domain-harness-compiler/dist/raw/types.js'); throw new Error('compiler deep import unexpectedly succeeded'); } catch (error) { if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }",
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
