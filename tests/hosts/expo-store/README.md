# T-004 Expo RuntimeStore host validation

This is the **store-only** real-host harness for DomainHarness v0.2 T-004. It is not the T-019 full runtime conformance app.

## Required host

- real Android device or emulator;
- Expo SDK 55;
- Hermes enabled (`app.json` pins `jsEngine: hermes`);
- SDK-compatible `expo-sqlite` (SDK 55 recommends `~55.0.20`).

## Run

From this directory on the Build Host:

```bash
npm install
npx expo install --check
npm run typecheck
npm run android
```

The first clean run executes the complete store conformance suite and prints:

```text
DOMAIN_HARNESS_T004_VALIDATION { "status": "RESTART_REQUIRED", ... }
```

That result is **not** final PASS. Force-stop the Android application process (not merely Metro reload / Fast Refresh), then relaunch the same installed app without clearing app data. For example, record the package identity and use the Build Host's normal `adb shell am force-stop <package>` + relaunch procedure.

The second process launch reopens the fixed database `domain-harness-t004-validation.db` and must print:

```text
DOMAIN_HARNESS_T004_VALIDATION { "status": "PASS", ..., "processRestartPersistence": true }
```

For a completely fresh rerun, clear the validation app's Android app data before phase 1.

## Evidence to record

Bind the report to the exact task-branch HEAD SHA and include:

- Android device/emulator identity and API level;
- Hermes runtime confirmation;
- Expo SDK version;
- `expo-sqlite` version;
- exact Git commit SHA;
- phase-1 `RESTART_REQUIRED` JSON;
- the force-stop/relaunch command or equivalent real process-restart procedure;
- phase-2 `PASS` JSON;
- 32-way concurrent acceptance result;
- connection close/reopen and process-restart persistence results.

Browser/web evidence is invalid because `withExclusiveTransactionAsync()` is a native Expo transaction API and T-004 explicitly requires Android/Hermes validation.
