/**
 * DomainHarness v0.11.0 T03 (#1577) — microkernel/v011 canonical entry.
 *
 * Public runtime face of the 0.11.0 Boot + KDP + Package System
 * (L2 §8.2 ruling: the package root flips to this v011 entry at T04 final
 * wiring; until then consumers inside the workspace import this source
 * tree and the T05 packed consumer imports the T04-wired package).
 *
 * Runtime exports:
 *   - `boot` — the minimal verification ladder (L2 §6.2); loads nothing
 *     before every pin/record/byte check passes (REFUSED = zero side
 *     effects).
 *   - `bootstrap` — the ONE pinned KDP Primary entry (frozen named export,
 *     L2 §6.1/§6.2d). Boot dynamically imports exactly this export from
 *     the install-record-pinned artifact bytes.
 *
 * No second Kernel/Runtime, no Package DAG parsing in Boot, no caller
 * replacement callbacks, no Main Workflow, no retry/recovery/stop engine,
 * no PKI/sandbox (PRD K01–K08, A01/A02, A07). Zero third-party runtime
 * dependencies: only `@kaicreator/domain-harness-contracts/v011` and
 * Node built-ins.
 */
export { boot } from './boot.js';
export { bootstrap } from './kdp.js';
