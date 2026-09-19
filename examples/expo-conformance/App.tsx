import expoPackage from 'expo/package.json';
import expoCryptoPackage from 'expo-crypto/package.json';
import * as SQLite from 'expo-sqlite';
import expoSqlitePackage from 'expo-sqlite/package.json';
import { useMemo, useState } from 'react';
import { Button, Platform, ScrollView, Text, View } from 'react-native';

import { runRuntimeConformanceSuite } from '../../tests/conformance/suite.ts';
import { PORTABLE_RUNTIME_FIXTURE } from '../../tests/conformance/fixtures.ts';
import { ExpoRuntimeConformanceHost } from '../../tests/hosts/expo/runtime-conformance-host.ts';
import {
  prepareReclaimCriticalJourney,
  prepareRestartCriticalJourney,
  T019_RECLAIM_DATABASE,
  T019_RESTART_DATABASE,
  verifyReclaimCriticalJourney,
  verifyRestartCriticalJourney,
} from '../../tests/hosts/expo/restart-critical-journey.ts';

const G30_DATABASE = 'domain-harness-t019-g30.db';

interface ValidationOutput {
  status: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL' | 'PREPARED';
  action?: string;
  environment: ReturnType<typeof environmentIdentity>;
  evidence?: unknown;
  error?: string;
}

export default function App() {
  const environment = useMemo(environmentIdentity, []);
  const [output, setOutput] = useState<ValidationOutput>({ status: 'IDLE', environment });

  const execute = async (action: string, work: () => Promise<unknown>, prepared = false) => {
    setOutput({ status: 'RUNNING', action, environment });
    try {
      assertTargetEnvironment(environment);
      const evidence = await work();
      const next: ValidationOutput = {
        status: prepared ? 'PREPARED' : 'PASS',
        action,
        environment,
        evidence,
      };
      console.log(`DOMAIN_HARNESS_T019_${action}_${next.status}`, JSON.stringify(next));
      setOutput(next);
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
      const next: ValidationOutput = { status: 'FAIL', action, environment, error: message };
      console.error(`DOMAIN_HARNESS_T019_${action}_FAIL`, JSON.stringify(next));
      setOutput(next);
    }
  };

  const runG30 = () => execute('G30', async () => {
    await deleteDatabase(G30_DATABASE);
    const host = new ExpoRuntimeConformanceHost({
      databaseName: G30_DATABASE,
      label: 'expo-android-hermes:shared-g30',
    });
    const report = await runRuntimeConformanceSuite(host);
    return {
      gate: 'G30',
      fixture: PORTABLE_RUNTIME_FIXTURE.id,
      databaseName: G30_DATABASE,
      report,
    };
  });

  const prepareRestart = () => execute('RESTART_PREPARE', async () => {
    await deleteDatabase(T019_RESTART_DATABASE);
    return prepareRestartCriticalJourney();
  }, true);

  const verifyRestart = () => execute('RESTART_VERIFY', verifyRestartCriticalJourney);

  const prepareReclaim = () => execute('RECLAIM_PREPARE', async () => {
    await deleteDatabase(T019_RECLAIM_DATABASE);
    return prepareReclaimCriticalJourney();
  }, true);

  const verifyReclaim = () => execute('RECLAIM_VERIFY', verifyReclaimCriticalJourney);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>DomainHarness v0.2 — T-019</Text>
      <Text selectable>{JSON.stringify(environment, null, 2)}</Text>

      <View style={{ gap: 8 }}>
        <Button title="1. Run shared G30 conformance" onPress={() => { void runG30(); }} />
        <Button title="2. Prepare restart journey" onPress={() => { void prepareRestart(); }} />
        <Text>
          After PREPARED: force-stop the Android app from adb/device settings, then relaunch the same installed app. Do not use Fast Refresh or a Metro reload.
        </Text>
        <Button title="3. Verify after real relaunch" onPress={() => { void verifyRestart(); }} />
        <Button title="4. Prepare processing-reclaim journey (#135)" onPress={() => { void prepareReclaim(); }} />
        <Text>
          After RECLAIM PREPARED: force-stop the Android app from adb/device settings, then relaunch the same installed app. Verification must reclaim and drain the interrupted message with no resend.
        </Text>
        <Button title="5. Verify reclaim after real relaunch" onPress={() => { void verifyReclaim(); }} />
      </View>

      <Text selectable>{JSON.stringify(output, null, 2)}</Text>
    </ScrollView>
  );
}

async function deleteDatabase(databaseName: string): Promise<void> {
  try {
    await SQLite.deleteDatabaseAsync(databaseName);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes('not found') && !message.includes('no such')) throw error;
  }
}

interface HermesInternalLike {
  getRuntimeProperties?: () => Record<string, unknown>;
}

/** Identities observed by the running app, not copied from package.json ranges. */
function environmentIdentity() {
  const hermesInternal = (globalThis as { HermesInternal?: HermesInternalLike }).HermesInternal;
  const android = Platform.OS === 'android'
    ? Platform.constants as typeof Platform.constants & {
        Release?: string;
        Model?: string;
        Brand?: string;
        Manufacturer?: string;
        Fingerprint?: string;
      }
    : null;
  const rn = Platform.constants.reactNativeVersion;
  return {
    task: 'T-019',
    platform: Platform.OS,
    androidApiLevel: Platform.OS === 'android' ? Platform.Version : null,
    androidRelease: android?.Release ?? null,
    androidModel: android?.Model ?? null,
    androidBrand: android?.Brand ?? null,
    androidManufacturer: android?.Manufacturer ?? null,
    androidBuildFingerprint: android?.Fingerprint ?? null,
    hermes: hermesInternal !== undefined,
    hermesRuntimeProperties: hermesInternal?.getRuntimeProperties === undefined
      ? null
      : JSON.parse(JSON.stringify(hermesInternal.getRuntimeProperties())) as Record<string, unknown>,
    jsBuild: __DEV__ ? 'debug' : 'release',
    expoPackage: expoPackage.version,
    expoSqlitePackage: expoSqlitePackage.version,
    expoCryptoPackage: expoCryptoPackage.version,
    reactNative: `${rn.major}.${rn.minor}.${rn.patch}${rn.prerelease ? `-${rn.prerelease}` : ''}`,
    applicationId: 'mm.kaicreator.domainharness.t019',
    runtimeCoreNodeBuiltinsExpected: false,
  };
}

function assertTargetEnvironment(environment: ReturnType<typeof environmentIdentity>): void {
  if (environment.platform !== 'android') {
    throw new Error(`T-019 requires Android, received ${environment.platform}`);
  }
  if (!environment.hermes) {
    throw new Error('T-019 requires Hermes; the current JavaScript engine is not Hermes');
  }
}
