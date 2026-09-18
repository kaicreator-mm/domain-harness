# T-019 Expo Android/Hermes host validation

This harness is the real non-Node host adapter for DomainHarness v0.2 T-019. It deliberately imports the frozen shared `tests/conformance/**` suite rather than copying its expected semantics.

## L3 evidence order

1. **Tests** — `runRuntimeConformanceSuite()` plus the two-phase restart Critical Journey.
2. **Contract / Interface** — `RuntimeConformanceHost` / `RuntimeConformanceSession` from T-017.
3. **Core Implementation** — `createExpoDomainRuntime`, `ExpoSqliteRuntimeStore`, and statically registered `ExpoScriptExecutor` modules.
4. **Failure Handling** — rejected message errors are normalized only at the host observation boundary; deterministic settle uses Query + Subscription with a timeout guard; restart validation keeps the prepared store/session live until a real OS force-stop and refuses VERIFY in the same JavaScript process.
5. **Reference** — Frozen PRD AC-42, L2 AD-10, G4/G30, and Issue #132.

The adapter never imports `tests/conformance/reference-host.ts`. The boundary checker traverses relative imports reachable from the portable v2 and Expo/T-019 runtime entry points, so frozen v0.1 compatibility code outside that path does not create false positives.

## Device procedure

From repository root, first build the workspace:

```bash
npm ci
npm run build
node tests/hosts/expo/check-runtime-boundary.mjs
```

Then install the standalone Expo validation app dependencies and build/install the app's own Android process (not Expo Go):

```bash
cd examples/expo-conformance
npm install
npm run typecheck
npm run android
```

`npm run android` uses `expo run:android`, so the installed application ID is `mm.kaicreator.domainharness.t019`.

Use a real Android device or Android emulator running the app with Hermes. Capture `adb shell getprop ro.build.version.sdk`, `adb shell getprop ro.product.model`, app/package identity, Expo/React Native package versions, and the app's environment block.

1. Tap **Run shared G30 conformance**. `DOMAIN_HARNESS_T019_G30_PASS` must appear and the returned report must equal the frozen expected report.
2. Tap **Prepare restart journey**. Wait for `DOMAIN_HARNESS_T019_RESTART_PREPARE_PREPARED`. The prepared RuntimeStore remains open in that process.
3. Force-stop the application using `adb shell am force-stop mm.kaicreator.domainharness.t019` (or Android Settings > Force stop).
4. Relaunch the same installed app without clearing app data or replacing the database.
5. Tap **Verify after real relaunch**. `DOMAIN_HARNESS_T019_RESTART_VERIFY_PASS` must appear. The same `order/restart-order-001` instance must rehydrate at revision 1 and continue to completed revision 2.

If **Verify** is pressed without a real process restart, the harness fails closed instead of accepting same-process evidence. Fast Refresh, Metro reload, Jest, Node, or an in-memory/mock SQLite implementation is not valid restart evidence.
