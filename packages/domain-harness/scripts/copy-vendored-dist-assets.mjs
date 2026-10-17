/**
 * Copy vendored non-TypeScript dist assets that `tsc -p tsconfig.build.json`
 * does not emit. The v0.9 public runtime bridge (issue #1132/#1118) compiles
 * `src/host-v9/ast-gate.ts` into `dist/host-v9/ast-gate.js`, which imports
 * the pinned self-contained acorn parser module `./generated/acorn.mjs`.
 * tsc never copies hand-vendored `.mjs`/`.d.mts` files into `outDir`, so a
 * fresh build without this step yields a `dist/host-v9/` whose runtime and
 * type resolution is broken — the committed-dist guard and the packed
 * tarball would both ship an incomplete tree.
 *
 * The copy is byte-exact and idempotent, keeping the committed-dist
 * byte-identity guard deterministic across rebuilds.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** Vendored assets mirrored verbatim from src/ into the emitted dist tree. */
const VENDORED_DIST_ASSETS = [
  'host-v9/generated/acorn.mjs',
  'host-v9/generated/acorn.d.mts',
];

for (const asset of VENDORED_DIST_ASSETS) {
  const source = join(packageRoot, 'src', asset);
  const destination = join(packageRoot, 'dist', asset);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
}
