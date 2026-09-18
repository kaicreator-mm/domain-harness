import * as SQLite from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Button, Platform, ScrollView, Text, View } from 'react-native';

import { runRuntimeConformanceSuite } from '../../tests/conformance/suite.ts';
import { PORTABLE_RUNTIME_FIXTURE } from '../../tests/conformance/fixtures.ts';
import { ExpoRuntimeConformanceHost } from '../../tests/hosts/expo/runtime-conformance-host.ts';
import {
  prepareRestartCriticalJourney,
  T019_RESTART_DATABASE,
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

function environmentIdentity() {
  const hermesInternal = (globalThis as { HermesInternal?: unknown }).HermesInternal;
  return {
    task: 'T-019',
    platform: Platform.OS,
    androidApiLevel: Platform.OS === 'android' ? Platform.Version : null,
    hermes: hermesInternal !== undefined,
    expoSdk: '55 (expo package pin ~55.0.31)',
    expoPackage: '~55.0.31',
    expoSqlitePackage: '~55.0.20',
    expoCryptoPackage: '~55.0.19',
    reactNativePackage: '0.83.10',
    applicationId: 'mm.kaicreator.domainharness.t019',
    runtimeCoreNodeBuiltinsExpected: false,
  };
}
