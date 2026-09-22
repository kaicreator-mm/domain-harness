import { execFileSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Issue #299: @kaicreator/domain-harness and @kaicreator/domain-harness-compiler
// ship their built dist/ trees from git (exact-SHA git installs must deliver a
// usable package without lifecycle scripts). This guard runs after the normal
// workspace build and fails whenever a fresh build of the committed sources
// differs from the committed dist bytes, or a declared entry file is missing —
// so src changes can never silently ship a stale compiled artifact.
const shippedEntries = {
  'packages/domain-harness': [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/public-v2/index.js',
    'dist/public-v3/index.js',
    'dist/workflow/index.js',
  ],
  'packages/domain-harness-compiler': [
    'dist/index.js',
    'dist/index.d.ts',
  ],
};
const shippedRoots = Object.keys(shippedEntries);

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
