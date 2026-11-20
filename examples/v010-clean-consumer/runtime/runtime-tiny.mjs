/**
 * v0.10.2 T09 — the Tiny-profile sealed-App runtime.
 *
 * The Tiny consumer installs exactly `@kaicreator/domain-harness-contracts`
 * and `@kaicreator/domain-harness-microkernel` (plus the selected Domain
 * Packages and this sealed App). Every import below is either a node
 * builtin, a file inside the sealed App, or one of those two public
 * packages — importing this module in a Tiny install must succeed with no
 * Host-node, SQLite, BUILD or Compiler package present.
 */
import { load as loadPublic } from '@kaicreator/domain-harness-microkernel';

export { loadPublic as load };
export { PlainFileDocStore } from './plain-store.mjs';
export { loadBuiltApp, loadManifest, writeReport, readJson } from './runtime-shared.mjs';
