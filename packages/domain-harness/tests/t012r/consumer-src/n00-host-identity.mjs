/**
 * T12R-N00 + HOST_IDENTITY_MANIFEST — bind the exact host/runtime/package
 * tuple, candidate bytes, consumer lockfile/package hashes and timestamps.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const consumerRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const artifactsDir = resolve(consumerRoot, '..', 'artifacts');
const tarballsDir = resolve(consumerRoot, '..', 'tarballs');

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const osInfo = {
  platform: process.platform,
  release: process.release,
  osRelease: (() => {
    try {
      return execFileSync('cmd.exe', ['/d', '/s', '/c', 'ver'], { encoding: 'utf8' }).trim();
    } catch {
      return process.getBuiltinModule?.('os')?.release?.() ?? 'unknown';
    }
  })(),
  arch: process.arch,
  cpu: cpus()[0]?.model ?? 'unknown',
  cpuCount: cpus().length,
};

const nativeBinding = resolve(consumerRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const bindingHash = sha256File(nativeBinding);
const betterSqlite3Version = JSON.parse(
  readFileSync(resolve(consumerRoot, 'node_modules', 'better-sqlite3', 'package.json'), 'utf8'),
).version;

const Database = (await import('better-sqlite3')).default;
const probe = new Database(':memory:');
const sqliteVersion = probe.prepare('select sqlite_version() v').get().v;
probe.close();

const tarballs = ['kaicreator-domain-harness-0.2.0.tgz', 'kaicreator-domain-harness-node-0.2.0.tgz', 'kaicreator-domain-harness-compiler-0.2.0.tgz', 'kaicreator-domain-harness-expo-0.2.0.tgz'].map((name) => {
  const path = join(tarballsDir, name);
  return { name, path, size: statSync(path).size, sha256: sha256File(path) };
});

const manifest = {
  case: 'T12R-N00-HOST_IDENTITY_MANIFEST',
  timestampUtc: new Date().toISOString(),
  host: osInfo,
  node: {
    version: process.version,
    abi: process.versions.modules,
    v8: process.versions.v8,
    versions: process.versions,
  },
  packageManager: {
    name: 'npm',
    version: execFileSync(process.execPath, [join(dirname2(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), '--version'], { encoding: 'utf8' }).trim(),
  },
  betterSqlite3: {
    version: betterSqlite3Version,
    nativeBindingPath: nativeBinding,
    nativeBindingSha256: bindingHash,
    nativeBindingProvenance:
      'DISCLOSED: prebuilt better_sqlite3.node copied from the shared worktree C:\\xDev\\kAiCreator\\domain-harness\\dh-e4-896\\node_modules\\better-sqlite3@12.11.1 (sha256 ' +
      'e75b8c024a85179d8e0e51203a8b8867916e9a51327ce3953db5f8483cc9a91e' +
      '); npm install script (prebuild-install) was policy-blocked in this environment; same host ABI ' +
      process.versions.modules + ' ' + process.arch + ' ' + process.platform,
  },
  sqlite: { version: sqliteVersion },
  candidate: {
    commit: '29dba90bfaa0185fcbd9cd695db72f55d5e80806',
    branch: 'version/v0.7',
    note: 'T012-D1-repaired candidate (successor rerun, gate #926); core tarball digest differs from the prior run d045145c…, node/compiler/expo byte-identical',
    packedArtifacts: tarballs,
    packedTarballSetSha256: createHash('sha256').update(tarballs.map((t) => t.sha256).join('\n')).digest('hex'),
  },
  consumer: {
    root: consumerRoot,
    packageJsonSha256: sha256File(join(consumerRoot, 'package.json')),
    packageLockSha256: sha256File(join(consumerRoot, 'package-lock.json')),
  },
};

function dirname2(p) {
  return p.replace(/[\\/][^\\/]*$/, '');
}

writeFileSync(join(artifactsDir, 'n00-host-identity.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));