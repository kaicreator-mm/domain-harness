/**
 * DomainHarness v0.11.0 T02 (#1576) — test authoring helpers.
 *
 * Every resource here is written to a REAL temporary directory as REAL bytes;
 * declared digests are computed from those bytes (or deliberately corrupted in
 * the negative cases). No type-level stand-ins for byte-level facts.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  DH_APP_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
  DH_PACKAGE_SCHEMA_VERSION,
  canonicalJson,
  contentDigestOf,
  type ContentDigest,
  type DomainAppDescriptor,
  type DomainPackageManifest,
  type ElementDefinition,
  type FunctionRef,
  type JsonValue,
  type PackageLayer,
  type PackageRole,
  type ResourceRef,
} from '@kaicreator/domain-harness-contracts/v011';

export function sha256OfBytes(bytes: Uint8Array): ContentDigest {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export interface Workspace {
  readonly root: string;
  readonly packageRoots: Record<string, string>;
  dispose(): void;
}

export function makeWorkspace(): Workspace {
  const root = mkdtempSync(join(tmpdir(), 'dh-v011-build-'));
  const packageRoots: Record<string, string> = {};
  return {
    root,
    packageRoots,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function addPackage(ws: Workspace, packageId: string): string {
  const dir = join(ws.root, 'pkgs', ...packageId.split('/'));
  mkdirSync(dir, { recursive: true });
  ws.packageRoots[packageId] = dir;
  return dir;
}

export function writeRaw(pkgDir: string, path: string, bytes: Uint8Array): ResourceRef {
  const target = join(pkgDir, ...path.split('/'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  const packageId = pkgDir.split(/[\\/]/u).pop()!;
  return { packageId, path, digest: sha256OfBytes(bytes) };
}

export function writeJson(pkgDir: string, path: string, value: JsonValue): ResourceRef {
  return writeRaw(pkgDir, path, new TextEncoder().encode(JSON.stringify(value)));
}

/** Write canonical-JSON bytes so inline/ref digest equivalence is byte-honest. */
export function writeCanonicalJson(pkgDir: string, path: string, value: JsonValue): ResourceRef {
  return writeRaw(pkgDir, path, new TextEncoder().encode(canonicalJson(value)));
}

export function elementRefOf(element: ElementDefinition) {
  const dot = element.id.indexOf('.');
  return {
    namespace: element.id.slice(0, dot),
    id: element.id,
    version: element.version,
    digest: contentDigestOf(element as unknown as JsonValue),
  };
}

export function functionRefOf(element: ElementDefinition, functionId: string): FunctionRef {
  const fn = element.functions.find((candidate) => candidate.id === functionId);
  if (!fn) throw new Error(`fixture: no function '${functionId}' on ${element.id}`);
  return { element: elementRefOf(element), functionId, contractVersion: fn.contractVersion };
}

export interface ManifestOptions {
  layer: PackageLayer;
  role: PackageRole;
  elements?: DomainPackageManifest['elements'];
  dependsOn?: DomainPackageManifest['dependsOn'];
  imports?: DomainPackageManifest['imports'];
  exports?: DomainPackageManifest['exports'];
  provides?: DomainPackageManifest['provides'];
  contributesTo?: DomainPackageManifest['contributesTo'];
  targetVariants?: DomainPackageManifest['targetVariants'];
  technicalInit?: DomainPackageManifest['technicalInit'];
  technicalDispose?: DomainPackageManifest['technicalDispose'];
}

export function manifest(id: string, version: string, options: ManifestOptions): DomainPackageManifest {
  return {
    kind: 'DomainPackage',
    schemaVersion: DH_PACKAGE_SCHEMA_VERSION,
    id,
    version: version as DomainPackageManifest['version'],
    layer: options.layer,
    role: options.role,
    elements: options.elements ?? [],
    dependsOn: options.dependsOn ?? [],
    imports: options.imports ?? [],
    exports: options.exports ?? [],
    ...(options.provides ? { provides: options.provides } : {}),
    contributesTo: options.contributesTo ?? [],
    targetVariants: options.targetVariants ?? [],
    ...(options.technicalInit ? { technicalInit: options.technicalInit } : {}),
    ...(options.technicalDispose ? { technicalDispose: options.technicalDispose } : {}),
  };
}

export function descriptor(options: {
  id?: string;
  target?: DomainAppDescriptor['target'];
  roots: DomainAppDescriptor['roots'];
  extensions?: DomainAppDescriptor['extensions'];
  businessAppInit: FunctionRef;
  ingress?: DomainAppDescriptor['ingress'];
}): DomainAppDescriptor {
  return {
    kind: 'DomainApp',
    schemaVersion: DH_APP_SCHEMA_VERSION,
    id: options.id ?? 'orders.basic',
    version: '1.0.0',
    target: options.target ?? { runtime: 'node', module: 'esm', nodeMajor: 24 },
    roots: options.roots,
    extensions: options.extensions ?? [],
    businessAppInit: options.businessAppInit,
    ingress: options.ingress ?? [],
  };
}

export { DH_ELEMENT_SCHEMA_VERSION };
