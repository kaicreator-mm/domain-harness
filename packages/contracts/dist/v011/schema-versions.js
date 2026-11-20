/**
 * DomainHarness v0.11.0 T01 (#1575) — L201 schemaVersion discriminators.
 *
 * Frozen wire spellings (L2 §2.1, blob a5a12d5b@36266559): every v011
 * document carries `<namespace>/<major.minor>` where the namespace is
 * fixed to `dh`, matching the PRD logical examples (`dh.element/0.11`,
 * `dh.package/0.11`, `dh.app/0.11`). Compatible growth inside 0.11.x may
 * only advance the minor segment; any change to existing field semantics
 * requires a minor bump plus a separate Product delta.
 */
export const DH_DOMAIN_SCHEMA_VERSION = 'dh.domain/0.11';
export const DH_ELEMENT_SCHEMA_VERSION = 'dh.element/0.11';
export const DH_PACKAGE_SCHEMA_VERSION = 'dh.package/0.11';
export const DH_APP_SCHEMA_VERSION = 'dh.app/0.11';
export const DH_LOCK_SCHEMA_VERSION = 'dh.lock/0.11';
export const DH_PIN_SCHEMA_VERSION = 'dh.pin/0.11';
export const DH_INSTALL_RECORD_SCHEMA_VERSION = 'dh.install/0.11';
