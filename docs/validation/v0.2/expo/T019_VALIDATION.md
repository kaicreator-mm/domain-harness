# T-019 Expo Android/Hermes validation record

Status: **IMPLEMENTATION READY — REAL DEVICE EVIDENCE REQUIRED**

Authority: Issue #132, T-019 Task Pack, Frozen PRD AC-42, Frozen L2 AD-10, G4/G30.

## What this task proves

T-019 must prove that the same frozen T-017 product-semantic conformance suite executes through a materially non-Node runtime path:

- React Native / Expo on Android;
- Hermes JavaScript engine;
- `expo-sqlite` persistence;
- statically registered Expo Script Tool binding (no `node:worker_threads`, runtime TypeScript compilation, or Node filesystem loader);
- OS-level force-stop + relaunch against the same installed application and SQLite database.

The source harness is intentionally inside the T-019 write set. Runtime contracts and shared expected semantics are not modified.

## Source/static validation

Run from repository root:

```bash
npm ci
npm run build
node tests/hosts/expo/check-runtime-boundary.mjs
cd examples/expo-conformance
npm install
npm run typecheck
```

Expected static marker:

```text
T019_RUNTIME_BOUNDARY_PASS
```

This is necessary but **not sufficient** for G4/G30/AC-42.

## Mandatory real Android evidence

Record all of the following against the exact PR HEAD SHA:

```text
candidate_sha=
device_or_emulator=
android_api_level=
android_build_identity=
expo_package=~55.0.31
react_native_package=0.83.10
hermes=true
expo_sqlite_package=~55.0.20
expo_crypto_package=~55.0.19
application_id=mm.kaicreator.domainharness.t019
```

Then attach/copy the complete JSON blocks emitted for:

```text
DOMAIN_HARNESS_T019_G30_PASS
DOMAIN_HARNESS_T019_RESTART_PREPARE_PREPARED
DOMAIN_HARNESS_T019_RESTART_VERIFY_PASS
```

The restart evidence must include this exact lifecycle:

```text
prepare revision 1
→ real Android force-stop
→ relaunch same installed app / same DB
→ rehydrate revision 1
→ approve
→ completed revision 2
```

A Fast Refresh, Metro reload, test-process recreation, mock driver, or fresh database cannot satisfy the restart requirement.

## Gate disposition rule

- **G4 PASS** only after the real Android/Hermes run above.
- **G30 PASS** only after the shared T-017 suite returns its frozen expected report on that host.
- **PRD AC-42 PASS** only when G4 and G30 are bound to the exact candidate SHA and the Runtime Core path remains free of Node built-ins.
- Until those artifacts exist, report the task as `BLOCKED(real-device-validation)` rather than inferring PASS from source/build checks.
