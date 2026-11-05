import { loadDemo, DisExecutionError } from './runner.mjs';

export function verifyResourceClosure(closure, manifest) {
  if (manifest.schemaVersion !== 'dis.resource-closure/0.1.0') throw new DisExecutionError('UNSUPPORTED_RESOURCE_CLOSURE', manifest.schemaVersion);
  const declared = new Map(manifest.resources.map((item) => [item.path, item.sha256]));
  if (declared.size !== manifest.resources.length) throw new DisExecutionError('DUPLICATE_RESOURCE_CLOSURE_ENTRY', 'resource paths must be unique');
  if (declared.size !== closure.resources.size) throw new DisExecutionError('RESOURCE_CLOSURE_SET_MISMATCH', 'declared and resolved resource sets differ');
  for (const [resourcePath, digest] of closure.resources) {
    if (declared.get(resourcePath) !== digest) throw new DisExecutionError('RESOURCE_DIGEST_MISMATCH', resourcePath);
  }
  return true;
}

export async function loadVerifiedDemo() {
  const loaded = await loadDemo();
  verifyResourceClosure({ resources: loaded.resources }, loaded.closureManifest);
  return loaded;
}
