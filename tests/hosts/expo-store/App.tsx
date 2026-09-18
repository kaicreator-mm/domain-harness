import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { runExpoStoreValidation, type ExpoStoreValidationResult } from './run-expo-store-validation';

export default function App() {
  const [output, setOutput] = useState('RUNNING T-004 Expo RuntimeStore validation...');

  useEffect(() => {
    void runExpoStoreValidation()
      .then((result: ExpoStoreValidationResult) => {
        const serialized = JSON.stringify(result, null, 2);
        console.log('DOMAIN_HARNESS_T004_VALIDATION', serialized);
        setOutput(serialized);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
        console.error('DOMAIN_HARNESS_T004_VALIDATION_FAIL', message);
        setOutput(`FAIL\n${message}`);
      });
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text selectable>{output}</Text>
    </ScrollView>
  );
}
