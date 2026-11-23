// 真实 KDP Package 的编译/打包技术步骤：src 类型检查 → esbuild 单文件 ESM 闭包 →
// 重算 Manifest 摘要 → 双 R41 副本字节级同步。生成期正确性仍归 Package 作者；
// 本脚本只做确定性的技术封存，产物字节由 BUILD/Lock 摘要逐字核实。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { contentDigestOf } from '../packages/contracts/dist/index.js';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const CANONICAL = join(repoRoot, 'examples/reference-domain-app/packages/r41-kdp');
const MIRROR = join(repoRoot, 'examples/selected-packages/packages/r41-kdp');
/** 需要在双副本之间保持字节一致的 KDP Package 文件集合。 */
const SYNCED_ENTRIES = ['src', 'definitions', 'dist', 'tests', 'manifest.json', 'package.json', 'tsconfig.json'];

function sha256OfBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fail(message) {
  console.error(`bundle-kdp-packages: ${message}`);
  process.exit(1);
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// 第 1 步：src + tests 类型检查（严格度与四个 Workspace 相同的 base 配置）。
const tscEntry = require.resolve('typescript/bin/tsc');
const tsc = spawnSync(process.execPath, [tscEntry, '-p', join(CANONICAL, 'tsconfig.json'), '--noEmit'], {
  cwd: repoRoot, encoding: 'utf8',
});
if (tsc.status !== 0) {
  fail(`r41-kdp TypeScript typecheck failed:\n${tsc.stdout}\n${tsc.stderr}`);
}

// 第 2 步：单文件 ESM bundle。contracts 与 xstate 全部内联；node:* 内建保持外部引用。
await esbuild.build({
  entryPoints: [join(CANONICAL, 'src/index.ts')],
  outfile: join(CANONICAL, 'dist/index.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
});

// 第 3 步：按真实字节重算 Manifest 摘要（definitionRef=文件字节 sha256；init/exit ElementRef=内容摘要）。
const manifestPath = join(CANONICAL, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const entry of manifest.elements) {
  const bytes = await readFile(join(CANONICAL, ...entry.definitionRef.path.split('/')));
  entry.definitionRef.digest = sha256OfBytes(bytes);
}
const lifecycleDefinition = JSON.parse(
  await readFile(join(CANONICAL, 'definitions/kernel-lifecycle.json'), 'utf8'));
const lifecycleDigest = contentDigestOf(lifecycleDefinition);
const distBytes = await readFile(join(CANONICAL, 'dist/index.mjs'));
const distDigest = sha256OfBytes(distBytes);
for (const variant of manifest.targetVariants) {
  for (const implementation of variant.implementations) {
    implementation.entry.module.digest = distDigest;
  }
}
manifest.init.digest = lifecycleDigest;
manifest.exit.digest = lifecycleDigest;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// 第 4 步：第二份 R41 授权副本与基准副本逐字节同步，防止两份真实 KDP 漂移。
await mkdir(MIRROR, { recursive: true });
for (const entry of await readdir(MIRROR)) {
  await rm(join(MIRROR, entry), { recursive: true, force: true });
}
for (const entry of SYNCED_ENTRIES) {
  const source = join(CANONICAL, entry);
  if (await pathExists(source)) {
    await cp(source, join(MIRROR, entry), { recursive: true });
  }
}

// 第 5 步：双副本一致性自证（同字节才允许离开构建）。
async function assertIdentical(relative) {
  const a = join(CANONICAL, relative);
  const b = join(MIRROR, relative);
  if (!(await pathExists(a))) fail(`canonical entry missing: ${relative}`);
  if (!(await pathExists(b))) fail(`mirror entry missing: ${relative}`);
  const aStat = await stat(a);
  const bStat = await stat(b);
  if (aStat.isDirectory() !== bStat.isDirectory()) fail(`mirror kind mismatch: ${relative}`);
  if (aStat.isDirectory()) {
    const names = await readdir(a);
    const bNames = await readdir(b);
    if (names.length !== bNames.length || names.some((name) => !bNames.includes(name))) {
      fail(`mirror directory listing mismatch: ${relative}`);
    }
    for (const name of names) await assertIdentical(join(relative, name));
    return;
  }
  const aBytes = await readFile(a);
  const bBytes = await readFile(b);
  if (!aBytes.equals(bBytes)) fail(`mirror copy mismatch: ${relative}`);
}
for (const entry of SYNCED_ENTRIES) {
  if (!(await pathExists(join(CANONICAL, entry)))) continue;
  await assertIdentical(entry);
}
console.log(`r41-kdp bundle OK: dist/index.mjs ${distDigest} (${distBytes.length} bytes), mirror synced`);
