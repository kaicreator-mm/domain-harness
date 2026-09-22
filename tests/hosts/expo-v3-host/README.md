# T-023 Expo Android/Hermes v0.3 host validation (issue #241)

Real-device evidence for the v0.3 authority/durability stack on
**Expo Android + Hermes + expo-sqlite**: the 13 Expo SQLite adapters
(`packages/domain-harness-expo/src/store`, compiled to `generated/`), the
vendored portable core (`@kaicreator/domain-harness` dist → `vendor/`,
resolved through the `file:vendor/domain-harness` dependency), and a
pure-TypeScript SHA-256 host capability (`device-sha256.ts` — no native
module, no Node built-in).

No Node-based mock is part of the evidence. `node-smoke.ts` +
`node-smoke-sqlite-stub.ts` are a builder-side logic pre-check only (a
better-sqlite3 stand-in behind the `expo-sqlite` specifier); they prove
nothing about Hermes/expo-sqlite and are never cited as host evidence.

## What the app prints

`DOMAIN_HARNESS_T023_VALIDATION <json>` via `console.log` (logcat tag
`ReactNativeJS`):

- **phase 1** (fresh install / wiped emulator): `status: "RESTART_REQUIRED"`,
  `phase: 1` — E1 (pure-TS SHA-256 KATs, Hermes live), E2 (full v0.2
  RuntimeStore conformance checklist + exclusive-queue unit check), E10
  (fresh migrate → meta 2; fabricated v1 store upgraded in place, v1-era row
  preserved, 24 `dh_v3_*` tables), then durable writes: E4 (governance
  execution pin, digest-guarded bound snapshot, live-instance package pin),
  E8 (two admitted turns through the assembled `createDomainRuntimeV3`
  runtime; tool executed once per turn; two decision evidence records), E5
  (two completed ordered journal records), E6 (process data, applied command
  outcome, external-work deadline listed), E3 (promoted v1/v2, alias `stable`
  at revision 2 selecting v2, `recoverExact` v1, dynamic child pin, semantic
  cache insert + hit), E9 (pin conflict, evidence append conflict, effect
  journal identity conflict, stale alias revision, cache first-writer-wins —
  all fail-closed with the Node-host error codes). `details.pinCanonical` /
  `details.snapshotCanonical` record canonical bytes for cross-phase
  comparison.
- **phase 2** (after `am force-stop` + relaunch): `status: "PASS"`,
  `phase: 2` — pin/snapshot/package-pin/child-pin survive the kill (E4);
  re-admitted turn 1 is `replayed` with zero tool executions and no new
  journal/evidence records (E5); process data/outcome/deadline survive and
  the external-work CAS settles exactly once (E6); alias/recoverExact/cache
  hit survive with exact digests (E3); meta still 2 (E10); conflicts still
  fail-closed (E9).

`details.packageId` must equal the build-time constant computed with Node
crypto (`build-device-fixture.mjs`): the package loads on device only if the
pure-TS SHA-256 reproduces that digest — cross-host digest parity is proven
by the load path itself.

## Build prerequisites

- the verified toolchain in `../expo-store/README.md` (JDK 21 as JAVA_HOME,
  Gradle wrapper pinned to 8.14.3 after prebuild, short filesystem path for
  the CMake/ninja build — copy this directory to e.g. `C:\Dev\dh-t023-app`),
- Android SDK (`C:\Android\Sdk`: platform-tools, emulator, platforms;android-36,
  system-images;android-36;google_apis;x86_64, build-tools;36.0.0), AVD
  `dh_t004_api36`.

## Reproduce

```bash
npm install                 # proxy-free shell (env -u HTTPS_PROXY -u HTTP_PROXY ...)
npm run build:validation    # tsc generated/ + vendor core + packageId codegen + static E1/E7 gates
npm run typecheck           # optional local check
```

The static gate scans `generated/` and the import closure of the vendored
core barrel for `node:*` / `better-sqlite3` / `@kaicreator/domain-harness-node`
references and fails the build on any hit (E1/E7). Legacy Node-bound core
entry points (`dist/loader`, `dist/runner`, `dist/persistence`,
`dist/script`) are **not** reachable from the public barrel — the closure
walk is the proof.

Then at the short-path copy (sources + `generated/` + `vendor/` +
`fixture-constants.ts` + `package.json` + `package-lock.json`):

```bash
npm install
npx expo prebuild -p android --no-install
# re-pin gradle-8.14.3-bin.zip in android/gradle/wrapper/gradle-wrapper.properties
cd android && ./gradlew.bat app:assembleRelease -x lint -x test -PreactNativeArchitectures=x86_64 -PenableMinifyInReleaseBuilds=false
adb install -r app/build/outputs/apk/release/app-release.apk
```

## Evidence protocol (bind to the exact PR HEAD)

1. Fresh emulator (`-wipe-data`) or `adb uninstall` first, so phase 1 runs.
2. `adb logcat -c && adb shell am start -n com.kaicreator.domainharness.t023v3host/.MainActivity`
3. `adb logcat -d -s ReactNativeJS:* | grep DOMAIN_HARNESS` → capture the
   phase-1 `RESTART_REQUIRED` line.
4. `adb shell am force-stop com.kaicreator.domainharness.t023v3host`
5. Relaunch (`am start`), capture the phase-2 `PASS` line.
6. Record: emulator/AVD identity, API level, build variant (release APK with
   embedded Hermes bundle), and the git HEAD the app was built from.
