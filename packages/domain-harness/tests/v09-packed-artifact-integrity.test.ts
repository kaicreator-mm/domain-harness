/**
 * v0.9 N06-PKG (#1118): real shipped-tarball identity / reproducibility proof.
 *
 * Run after `npm run build` on the selected Node24 build host. This checks
 * TWO actual npm-produced tgz archives, not a dry-run or a source/workspace
 * import. The emitted digest is for the exact packed bytes consumed later by
 * #1119's outside-repository two-B App and #1037's final release candidate.
 *
 * This is NOT the executable send/query/subscribe/stop clean-consumer test
 * (#1119), nor a substitute for #1037 Full/Hidden/Critical Journeys.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const packageDir = fileURLToPath(new URL('../', import.meta.url));
const packageName = '@kaicreator/domain-harness';

interface NpmPackedFile {
  readonly path: string;
}
interface NpmPackReport {
  readonly filename: string;
  readonly name: string;
  readonly version: string;
  readonly shasum: string;
  readonly integrity: string;
  readonly files: readonly NpmPackedFile[];
}

function runNpmPack(destination: string): NpmPackReport {
  const args = ['pack', '-w', packageName, '--pack-destination', destination, '--json'];
  const options = { cwd: repoRoot, encoding: 'utf8' as const, maxBuffer: 16 * 1024 * 1024 };
  // Windows needs a shell for npm.cmd; selected Node24 Linux uses direct exec.
  const stdout = process.platform === 'win32'
    ? execFileSync(['npm.cmd', ...args.map(a => `"${a}"`)].join(' '), { ...options, shell: true })
    : execFileSync('npm', args, options);
  const reports = JSON.parse(stdout) as NpmPackReport[];
  assert.ok(Array.isArray(reports) && reports.length === 1, 'npm pack --json must report exactly one actual artifact');
  const report = reports[0];
  assert.ok(report, 'npm pack --json must report a present first artifact record');
  assert.ok(typeof report.filename === 'string' && report.filename.endsWith('.tgz'));
  assert.equal(report.filename, basename(report.filename), 'npm archive filename must be local to the output directory');
  assert.equal(report.name, packageName);
  assert.ok(Array.isArray(report.files));
  return report;
}

function verifyArchive(destination: string, report: NpmPackReport): string {
  const bytes = readFileSync(join(destination, report.filename));
  assert.ok(bytes.length > 0, 'npm pack must physically create a nonempty tarball');
  const sha1 = createHash('sha1').update(bytes).digest('hex');
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(report.shasum, sha1, 'npm-reported shasum must match the actual tarball');
  assert.equal(report.integrity, `sha512-${sha512}`, 'npm-reported integrity must match actual tarball bytes');
  return sha256;
}

test('V09-PKG-ARC01: two real npm packs preserve exact ./v9 JS/types and reproducible archive SHA256', () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    exports: Record<string, { import?: string; types?: string; require?: string }>;
  };
  assert.equal(manifest.name, packageName);
  assert.deepEqual(manifest.exports['./v9'], {
    types: './dist/public-v9/index.d.ts',
    import: './dist/public-v9/index.js',
  }, 'published ./v9 must remain ESM-only with a real types entry');
  assert.deepEqual(manifest.exports['./v9/deployment'], {
    types: './dist/public-v9/deployment.d.ts',
    import: './dist/public-v9/deployment.js',
  }, 'published ./v9/deployment must remain ESM-only with a real types entry');

  const firstDir = mkdtempSync(join(tmpdir(), 'dh-v09-pack-a-'));
  const secondDir = mkdtempSync(join(tmpdir(), 'dh-v09-pack-b-'));
  try {
    const first = runNpmPack(firstDir);
    const second = runNpmPack(secondDir);
    assert.equal(first.version, manifest.version);
    assert.equal(second.version, manifest.version);
    assert.equal(first.filename, second.filename);

    const included = new Set(first.files.map(file => file.path));
    for (const subpath of ['./v9', './v9/deployment'] as const) {
      const entry = manifest.exports[subpath];
      assert.ok(entry !== undefined, `${subpath} must be declared`);
      for (const exportPath of [entry.import, entry.types]) {
        assert.ok(typeof exportPath === 'string', `${subpath} must declare both import and types`);
        assert.ok(exportPath.startsWith('./dist/public-v9/'), `${subpath} exports must resolve into its public dist leaf`);
        assert.ok(included.has(exportPath.slice(2)), `actual packed tarball is missing ${exportPath}`);
      }
    }
    assert.ok(included.has('dist/public-v9/errors.js'), 'pack must include v9 typed public error implementation');
    // The deployment entry statically imports the vendored parser assets;
    // a files-narrowing regression would otherwise ship an unimportable
    // ./v9/deployment while both packs stay self-consistent.
    assert.ok(included.has('dist/host-v9/generated/acorn.mjs'), 'pack must include the vendored host-v9 parser asset');
    assert.ok(included.has('dist/host-v9/generated/acorn.d.mts'), 'pack must include the vendored host-v9 parser types');
    assert.ok(included.has('package.json'), 'npm pack must include its own versioned manifest');
    for (const file of included) {
      assert.equal(file.startsWith('src/'), false, `source file mistakenly published: ${file}`);
      assert.equal(file.startsWith('tests/'), false, `test file mistakenly published: ${file}`);
    }
    assert.deepEqual(
      second.files.map(file => file.path).sort(),
      first.files.map(file => file.path).sort(),
      'repeat pack must contain identical file inventory',
    );

    const firstSha256 = verifyArchive(firstDir, first);
    const secondSha256 = verifyArchive(secondDir, second);
    assert.equal(secondSha256, firstSha256, 'unchanged exact-built package must produce byte-identical npm tgz');
    // User/Release may pin this SHA256 but must never infer runtime/Release PASS.
    console.info(`V09_PACKED_ARTIFACT_SHA256=${firstSha256} VERSION=${manifest.version} FILES=${included.size}`);
  } finally {
    rmSync(firstDir, { recursive: true, force: true });
    rmSync(secondDir, { recursive: true, force: true });
  }
});
