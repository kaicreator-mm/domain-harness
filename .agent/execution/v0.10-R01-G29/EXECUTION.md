# R01 Tier-3 G29 test-only restoration — Issue #1214

Base: fed515be45c4e48233f20dcbc76d6f3410780f34, target v0.10, ADS v4.13.1. Source-of-truth historical fix: 7c367188.
The only production-adjacent write is tests/integration/package-versioning/t022-package-versioning.test.ts, restoring only the old G29 test block exactly from accepted v0.6 SHA. It asserts typed INCOMPATIBLE_PACKAGE, truthful profile-pregate message, exact details ['actual=0.2/99/2'], and zero persisted pins. All G28 and other G29 tests unchanged; no runtime/host/provider changes.

## Tests
On real LOCAL Node24 + SQLite, run:
node --import tsx --test tests/integration/package-versioning/t022-package-versioning.test.ts
Require 4/4 green with exit 0 and one faithful G29 incompatible-profile denial witness. Run build, lint, typecheck, and use exact-HEAD Woodpecker CI. Independent read-only source review against actual PR HEAD P0/P1=0 before merge into v0.10.

## Failure handling
If the updated G29 test fails, do not weaken message/code/details or fabricate a waiver. Record actual error, code, details, pin count and Node native SQLite version. No runtime modifications in this PR. R01 release full suite and Hidden were executed on preceding candidate fed515be45c4e48233f20dcbc76d6f3410780f34; this test-only change requires explicit new SHA binding/requalification, not silent promotion of old evidence. Release Qualification NO until independent acceptance and the required final checks.
