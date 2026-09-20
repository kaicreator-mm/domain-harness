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

## Verified emulator toolchain (Windows build host, 2026-09)

The exact combination proven to work on this repository's Windows build host with AVD `dh_t004_api36` (API 36, google_apis x86_64):

1. **JDK 21** (e.g. Temurin at `C:\Users\<user>\.jdks\jdk-21.0.12.1+1`) as `JAVA_HOME`. Android Studio's bundled JBR is JDK 25, whose class-file major version 69 breaks Gradle 8 ("Unsupported class file major version 69").
2. **Gradle wrapper pinned to 8.14.3** in `android/gradle/wrapper/gradle-wrapper.properties` after `expo prebuild` (the SDK 55 template emits Gradle 9.0.0, whose removal of `JvmVendorSpec.IBM_SEMERU` breaks the RN/expo plugin configuration phase).
3. **Short filesystem paths.** Deep checkouts (e.g. `.claude/worktrees/<name>/tests/hosts/expo-store`) exceed Windows MAX_PATH during the expo-modules-core CMake/ninja build ("ninja: error: mkdir(...): No such file or directory"). Copy this self-contained app directory (sources + `generated/` from `npm run build:validation` + `package.json`) to a short path such as `C:\Dev\dh-t013-app`, run `npm install` there, and build from that copy. `subst` drive mapping does NOT work (expo autolinking mis-resolves the substituted root).
4. Build + install:
   ```bash
   npx expo prebuild -p android --no-install
   # re-pin gradle-8.14.3-bin.zip here (prebuild regenerates the wrapper)
   cd android && ./gradlew.bat app:assembleRelease -x lint -x test -PreactNativeArchitectures=x86_64 -PenableMinifyInReleaseBuilds=false
   adb install -r app/build/outputs/apk/release/app-release.apk
   ```
   The **release APK embeds the Hermes bundle** and needs no Metro/dev server (emulator NAT to the host dev server is unreliable on this setup); release builds use the debug signing config per the Expo template. `jsEngine: hermes` applies to release bundles, so store/Hermes evidence remains valid; record the build variant in the evidence.
5. Collect evidence:
   ```bash
   adb logcat -c && adb shell am start -n com.kaicreator.domainharness.t004storevalidation/.MainActivity
   adb logcat -d -s ReactNativeJS:* | grep DOMAIN_HARNESS
   ```
   Phase 2: `adb shell am force-stop com.kaicreator.domainharness.t004storevalidation`, relaunch, capture the `PASS` line.

The app also runs `runReadPathProbe()` (issue #173) before validation and prints `DOMAIN_HARNESS_T013_READPATH`; include both lines in evidence. A fresh emulator (`-wipe-data`) ensures phase 1 runs the suite instead of returning the restart-path PASS.
