/**
 * Audited npm tarball byte pins for the two first-party-approved 0.11.1 Workflow dependencies.
 * These are the exact sha512 SRI digests from the reviewed monorepo package-lock.json.
 * All third-party executable bytes must be installed through an integrity-checking npm
 * client and independently validated against this BUILD-sealed manifest before App Boot.
 * Neither business Packages nor their manifests can change these pins.
 */
import { canonicalJson, type JsonValue } from '@kaicreator/domain-harness-contracts';

export const TRUSTED_WORKFLOW_NPM_ARCHIVES = Object.freeze([
  Object.freeze({
    name: 'xstate', version: '5.33.2',
    integrity: 'sha512-8tC7yXgeCvpT8gKEeEje6ikJJG1wpnoLiXe+HfECW8m10ubMd3QxKOwWA8KxPJVBcLwfdRoMKYxIBGYKmo37/A==',
  }),
  Object.freeze({
    name: 'yaml', version: '2.9.1',
    integrity: 'sha512-3NxN8+78OdzbT7C/WjGsyfPAtJaN3FNDsWxv7Y7mcDsT/oOmgW8BpyQQFFBnvZE3j9Y2Sdz1ULFLezL7Eb2yFw==',
  }),
] as const);

/**
 * A trusted dependency is installed only when the actual npm install lock records
 * the audited exact version AND the tarball SRI. The payload is inside the
 * composed AppPackage byte digest; DomainAppLock separately binds the same pins.
 */
export function trustedWorkflowInstallManifest(): JsonValue {
  return {
    kind: 'DomainHarnessTrustedRuntime',
    schemaVersion: 'dh.runtime-integrity/0.11',
    archives: TRUSTED_WORKFLOW_NPM_ARCHIVES.map((archive) => ({ ...archive })),
  };
}

/** Executable first-party verification is packaged with the App; it uses no npm hooks. */
export const TRUSTED_RUNTIME_VERIFY_MODULE = `import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('./trusted-runtime.json', import.meta.url), 'utf8'));
if (manifest.kind !== 'DomainHarnessTrustedRuntime' ||
    manifest.schemaVersion !== 'dh.runtime-integrity/0.11' ||
    !Array.isArray(manifest.archives) || manifest.archives.length !== 2) {
  throw new Error('DH_TRUSTED_RUNTIME_MANIFEST_INVALID');
}
let lock;
try {
  lock = JSON.parse(await readFile(join(appRoot, 'package-lock.json'), 'utf8'));
} catch {
  throw new Error('DH_TRUSTED_RUNTIME_INSTALL_LOCK_MISSING');
}
if (lock.lockfileVersion !== 3 || typeof lock.packages !== 'object' || !lock.packages) {
  throw new Error('DH_TRUSTED_RUNTIME_INSTALL_LOCK_INVALID');
}
for (const archive of manifest.archives) {
  if (typeof archive.name !== 'string' || typeof archive.version !== 'string' ||
      typeof archive.integrity !== 'string' ||
      !/^sha512-[a-zA-Z0-9+/]+={0,2}$/.test(archive.integrity)) {
    throw new Error('DH_TRUSTED_RUNTIME_PIN_INVALID');
  }
  const installed = lock.packages['node_modules/' + archive.name];
  if (!installed || installed.version !== archive.version ||
      installed.integrity !== archive.integrity) {
    throw new Error('DH_TRUSTED_RUNTIME_INTEGRITY_MISMATCH');
  }
  const pkg = JSON.parse(await readFile(join(appRoot, 'node_modules', archive.name, 'package.json'), 'utf8'));
  if (pkg.name !== archive.name || pkg.version !== archive.version ||
      Object.hasOwn(pkg, 'scripts') && Object.keys(pkg.scripts).some((name) =>
        ['preinstall', 'install', 'postinstall', 'prepare'].includes(name))) {
    throw new Error('DH_TRUSTED_RUNTIME_INSTALLED_PACKAGE_INVALID');
  }
}
export const verified = true;
`;

/** For BUILD tests: exact immutable binary archive evidence can be checked without registry access. */
export const TRUSTED_RUNTIME_MANIFEST_BYTES = new TextEncoder().encode(
  canonicalJson(trustedWorkflowInstallManifest()),
);
