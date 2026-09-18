# T-004 Expo RuntimeStore host validation

This directory is a store-only real-host validation entry for DomainHarness v0.2 T-004. It is **not** the T-019 full runtime conformance app.

Run it inside a real Expo SDK 55 Android app with Hermes and `expo-sqlite` installed (`npx expo install expo-sqlite`). Use `App.tsx` as the app entry, or invoke `runExpoStoreValidation()` from an equivalent host shell.

Required evidence must bind the result to the exact task-branch HEAD SHA and record:

- Android device/emulator identity and API level;
- Hermes enabled/runtime identity;
- Expo SDK version;
- `expo-sqlite` version;
- exact Git commit SHA;
- the `DOMAIN_HARNESS_T004_VALIDATION` JSON result;
- restart/reopen persistence result;
- concurrent acceptance stress result.

A browser/web run is not valid evidence because `withExclusiveTransactionAsync()` is a native Expo transaction API and T-004 explicitly requires Android/Hermes validation.
