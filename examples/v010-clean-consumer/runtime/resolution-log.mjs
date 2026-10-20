/**
 * Physical ESM resolution log for an INSTALLED consumer process (#1180 T11).
 * Imports only node builtins, so it can be started before the App, its
 * runtime and its sealed modules are resolved.
 */
import { registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const APP_DIR = dirname(fileURLToPath(import.meta.url));

export function findDeploymentRoot(from) {
  let current = from;
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(current, 'node_modules'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

export function startResolutionLog(deploymentRoot = findDeploymentRoot(APP_DIR)) {
  const resolutions = [];
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);
      resolutions.push({
        specifier,
        parent: context.parentURL === undefined ? null : context.parentURL,
        url: result.url,
        format: result.format ?? null,
      });
      return result;
    },
  });
  const isBare = (specifier) => !specifier.startsWith('.') && !specifier.startsWith('node:') && !specifier.startsWith('file:') && !specifier.startsWith('data:');
  return {
    deploymentRoot,
    resolutions,
    stop() {
      hook.deregister();
    },
    /** file: URLs physically resolved outside the deployment root (must be empty). */
    fileUrlsOutsideRoot() {
      return resolutions
        .filter((entry) => entry.url.startsWith('file:'))
        .map((entry) => fileURLToPath(entry.url))
        .filter((path) => !path.startsWith(deploymentRoot));
    },
    bareSpecifiers() {
      return [...new Set(resolutions.filter((entry) => isBare(entry.specifier)).map((entry) => entry.specifier))].sort();
    },
  };
}
