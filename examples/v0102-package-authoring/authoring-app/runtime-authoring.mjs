/**
 * Issue #1379 authoring-template sealed-App runtime.
 *
 * The authoring consumer installs exactly `@kaicreator/domain-harness-
 * contracts` and `@kaicreator/domain-harness-microkernel` (plus the selected
 * Domain Packages and this sealed App). Activation goes through the bounded
 * trusted bootstrap subpath `@kaicreator/domain-harness-microkernel/
 * host-seam` (`activateV10App`) so the scenario can drive the selected
 * non-Tool S Feature (`invokeSelectedStandardFeature`) and the kernel
 * counters — with NO Host-node, SQLite, BUILD or Compiler package present.
 */
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';

export { activateV10App };
export { PlainFileDocStore } from './plain-store.mjs';
export { loadBuiltApp, loadManifest, writeReport, readJson } from './runtime-shared.mjs';
