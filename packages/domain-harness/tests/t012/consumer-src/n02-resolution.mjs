/* eslint-disable -- T012 evidence-only clean-room consumer source; lint posture is not the evidence subject. */
/**
 * T12-N02 — clean external packed-consumer lane: resolution-path proof,
 * symlink/workspace-substitution assertion, public export/subpath/condition
 * matrix, and deep-import closedness negatives.
 *
 * Everything below resolves ONLY inside this consumer's node_modules, which
 * was installed from the exact packed tarballs (see ../tarballs/SHA256SUMS.txt).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const consumerRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactsDir = resolve(consumerRoot, '..', 'artifacts');
const repoRootPrefix = 'C:\\xDev\\kAiCreator\\domain-harness';

const PACKAGES = [
  '@kaicreator/domain-harness',
  '@kaicreator/domain-harness-node',
  '@kaicreator/domain-harness-compiler',
  '@kaicreator/domain-harness-expo',
];

const results = {
  case: 'T12-N02',
  consumerRoot,
  assertions: [],
  exportMatrix: [],
  deepImportNegatives: [],
  npmLs: null,
};

function record(name, pass, detail) {
  results.assertions.push({ name, verdict: pass ? 'PASS' : 'FAIL', detail });
  if (!pass) {
    console.error(`FAIL: ${name} — ${detail}`);
    process.exitCode = 1;
  } else {
    console.log(`ok - ${name}`);
  }
}

// --- 0. The consumer lives OUTSIDE the repository worktree. ---------------
record(
  'consumer-outside-repo',
  !consumerRoot.toLowerCase().startsWith(repoRootPrefix.toLowerCase() + sep) &&
    !consumerRoot.toLowerCase().startsWith(repoRootPrefix.toLowerCase()),
  `consumerRoot=${consumerRoot}`,
);

// --- 1. npm ls (dependency tree from installed node_modules only). --------
// npm-as-a-library: spawn node on the npm-cli.js that ships with this node
// (avoids the npm.cmd shell-wrapper spawn pitfalls on Windows).
const npmCliJs = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmLs = execFileSync(process.execPath, [npmCliJs, 'ls', '--all', '--json'], {
  cwd: consumerRoot,
  encoding: 'utf8',
});
results.npmLs = JSON.parse(npmLs);
writeFileSync(join(artifactsDir, 'n02-npm-ls.json'), npmLs);

// --- 2. No symlinks, no workspace leakage: every installed @kaicreator -----
// ---    package is a real directory inside this consumer. ------------------
for (const name of PACKAGES) {
  const pkgDir = join(consumerRoot, 'node_modules', ...name.split('/'));
  const stat = lstatSync(pkgDir, { throwIfNoEntry: false });
  record(`${name}:installed`, stat !== undefined && stat.isDirectory(), pkgDir);
  if (stat === undefined) continue;
  record(`${name}:not-symlink`, !stat.isSymbolicLink(), `lstat.isSymbolicLink=${stat.isSymbolicLink()}`);
  const rp = realpathSync(pkgDir);
  record(
    `${name}:realpath-inside-consumer`,
    rp.toLowerCase().startsWith(consumerRoot.toLowerCase()),
    `realpath=${rp}`,
  );
  record(
    `${name}:not-workspace-source`,
    !rp.toLowerCase().includes('\\domain-harness\\dh-'),
    `realpath=${rp}`,
  );
  // Installed tree must contain dist (packed artifact material), never src/.
  const entries = readdirSync(pkgDir);
  record(`${name}:has-dist`, entries.includes('dist'), entries.join(','));
  record(`${name}:no-src`, !entries.includes('src'), entries.join(','));
}

// --- 3. Public export/subpath/condition matrix. ---------------------------
// Re-enumerated from the INSTALLED package.json files (not review-time data).
async function importSubpath(specifier) {
  return import(specifier);
}

for (const name of PACKAGES) {
  const pkgJson = JSON.parse(
    readFileSync(join(consumerRoot, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'),
  );
  const exportMap =
    pkgJson.exports !== undefined
      ? pkgJson.exports
      : { '.': { import: pkgJson.main, require: pkgJson.main, types: pkgJson.types } };
  for (const [subpath, conditions] of Object.entries(exportMap)) {
    const specifier = subpath === '.' ? name : `${name}/${subpath.slice(2)}`;
    const row = { package: name, subpath, specifier, conditions: Object.keys(conditions) };
    if (conditions.import !== undefined) {
      try {
        const mod = await importSubpath(specifier);
        row.import = { verdict: 'PASS', exportNames: Object.keys(mod).length };
      } catch (error) {
        row.import = { verdict: 'FAIL', error: String(error) };
        process.exitCode = 1;
      }
    }
    if (conditions.require !== undefined) {
      try {
        const mod = require(specifier);
        row.require = { verdict: 'PASS', exportNames: Object.keys(mod).length };
      } catch (error) {
        row.require = { verdict: 'FAIL', error: String(error) };
        process.exitCode = 1;
      }
    }
    results.exportMatrix.push(row);
    console.log(
      `ok - export ${specifier} import=${row.import?.verdict ?? 'n/a'} require=${row.require?.verdict ?? 'n/a'}`,
    );
  }
}

// --- 4. Deep-import closedness negatives (accepted T008C boundary: the ----
// ---    package boundary is the declared export map). ---------------------
const deepTargets = [
  ['@kaicreator/domain-harness/dist/contracts/invocation-request.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['@kaicreator/domain-harness/dist/contracts/effectful-invocation.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['@kaicreator/domain-harness/dist/contracts/non-effectful-invocation.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['@kaicreator/domain-harness/dist/contracts/tool-implementation-binding.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['@kaicreator/domain-harness/dist/contracts/runtime-assembly.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['@kaicreator/domain-harness/dist/contracts/capability-provision.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['@kaicreator/domain-harness/dist/adapters/ux-tool-request.js', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
  ['@kaicreator/domain-harness/src/index.ts', 'ERR_PACKAGE_PATH_NOT_EXPORTED'],
];
for (const [specifier, expectedCode] of deepTargets) {
  try {
    await import(specifier);
    results.deepImportNegatives.push({ specifier, verdict: 'FAIL', detail: 'deep import unexpectedly resolved' });
    record(`deep-import-closed:${specifier}`, false, 'resolved (must refuse)');
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined;
    const pass = code === expectedCode;
    results.deepImportNegatives.push({ specifier, verdict: pass ? 'PASS' : 'FAIL', code });
    record(`deep-import-closed:${specifier}`, pass, `code=${code}`);
  }
}

writeFileSync(join(artifactsDir, 'n02-resolution.json'), JSON.stringify(results, null, 2));
console.log('T12-N02 complete');