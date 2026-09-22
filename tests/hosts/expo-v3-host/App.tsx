import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import {
  runExpoV3HostValidation,
  type T023ValidationResult,
} from './run-expo-v3-host-validation';

export default function App() {
  const [output, setOutput] = useState('RUNNING T-023 Expo v0.3 host validation...');

  useEffect(() => {
    void runExpoV3HostValidation()
      .then((result: T023ValidationResult) => {
        const serialized = JSON.stringify(result);
        console.log('DOMAIN_HARNESS_T023_VALIDATION', serialized);
        setOutput(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
        console.error('DOMAIN_HARNESS_T023_VALIDATION_FAIL', message);
        setOutput(`FAIL\n${message}`);
      });
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text selectable>{output}</Text>
    </ScrollView>
  );
}
