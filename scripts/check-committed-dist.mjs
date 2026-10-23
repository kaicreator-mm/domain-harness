import { execFileSync } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Issue #299 / v0.10.2 L2 section 5 ("Committed dist"): the externally
// consumed packages ship their built dist/ trees from git (exact-SHA git
// installs must deliver a usable package without lifecycle scripts). This
// guard runs after the normal workspace build and fails whenever a fresh build
// of the committed sources differs from the committed dist bytes, or a
// declared entry file is missing — so src changes can never silently ship a
// stale compiled artifact.
//
// The roster is derived from the root workspace globs: every NON-private
// workspace manifest is guarded and its entries are the manifest's own
// main/types files. Private (legacy) workspaces leave the guard.
const neverCommittedDist = new Set([
  '@kaicreator/domain-harness-node',
  '@kaicreator/domain-harness-expo',
]);

async function discoverShipped() {
  const rootManifest = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  const shipped = {};
  for (const glob of rootManifest.workspaces ?? []) {
    if (!glob.endsWith('/*')) {
      throw new Error(`check-committed-dist: unsupported workspace glob ${glob}`);
    }
    const parent = glob.slice(0, -2);
    const dirs = (await readdir(`${root}/${parent}`, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const dir of dirs) {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(`${root}/${parent}/${dir}/package.json`, 'utf8'));
      } catch {
        continue;
      }
      if (manifest.private === true) continue;
      // Legacy host packages that never shipped a committed dist (their dist/
      // is gitignored). They stay unguarded until a later task marks them
      // private (T07b/T08), at which point this entry becomes redundant.
      if (neverCommittedDist.has(manifest.name)) continue;
      // Entries: main/types plus every dist/ target named by the exports map
      // (src/ targets such as the compiler's payload .mjs files are not dist).
      const candidates = [manifest.main, manifest.types];
      const collect = (value) => {
        if (typeof value === 'string') candidates.push(value);
        else if (value !== null && typeof value === 'object') Object.values(value).forEach(collect);
      };
      collect(manifest.exports);
      const entries = [
        ...new Set(
          candidates
            .filter((entry) => typeof entry === 'string')
            .map((entry) => entry.replace(/^\.\//u, ''))
            .filter((entry) => entry.startsWith('dist/')),
        ),
      ];
      shipped[`${parent}/${dir}`] = entries;
    }
  }
  return shipped;
}

const shippedEntries = await discoverShipped();
const shippedRoots = Object.keys(shippedEntries);
if (shippedRoots.length === 0) {
  console.error('check-committed-dist: no non-private workspace found; roster derivation failed');
  process.exit(1);
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

let failures = 0;

try {
  git(['rev-parse', '--is-inside-work-tree']);
} catch {
  console.error('check-committed-dist: not a git worktree; cannot verify shipped dist');
  process.exit(1);
}

for (const [pkg, entries] of Object.entries(shippedEntries)) {
  for (const entry of entries) {
    try {
      await access(`${root}/${pkg}/${entry}`, constants.F_OK);
    } catch {
      console.error(`check-committed-dist: missing ${pkg}/${entry} — run the workspace build`);
      failures += 1;
    }
    const tracked = git(['ls-files', '--', `${pkg}/${entry}`]).trim();
    if (tracked === '') {
      console.error(`check-committed-dist: ${pkg}/${entry} is not committed (git add the dist tree)`);
      failures += 1;
    }
  }
}

const porcelain = git(['status', '--porcelain', '--', ...shippedRoots.map((pkg) => `${pkg}/dist`)]);
if (porcelain !== '') {
  console.error('check-committed-dist: committed dist differs from a fresh build of the committed sources:');
  for (const line of porcelain.split(/\r?\n/u)) {
    if (line !== '') console.error(`  ${line}`);
  }
  console.error('Rebuild (npm run build) and commit the regenerated dist trees together with the source change.');
  failures += 1;
}

if (failures > 0) process.exit(1);
console.log('check-committed-dist: shipped dist trees present, tracked and fresh');
