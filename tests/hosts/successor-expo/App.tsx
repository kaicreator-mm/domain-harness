import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import {
  runSuccessorExpoValidation,
  type SuccessorValidationResult,
} from './run-successor-expo-validation';

export default function App() {
  const [output, setOutput] = useState('RUNNING SX-E successor Expo host validation...');

  useEffect(() => {
    void runSuccessorExpoValidation()
      .then((result: SuccessorValidationResult) => {
        const serialized = JSON.stringify(result);
        // Machine-readable terminal line consumed by run-device-validation.mjs
        // through logcat. Also prints the normalized cross-host comparator
        // payload when one is present (SX-E16).
        console.log('SUCCESSOR_EXPO_VALIDATION', serialized);
        if (result.comparator !== undefined) {
          console.log('SUCCESSOR_EXPO_COMPARATOR', JSON.stringify(result.comparator));
        }
        setOutput(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
        console.error('SUCCESSOR_EXPO_VALIDATION_FAIL', message);
        setOutput(`FAIL\n${message}`);
      });
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text selectable>{output}</Text>
    </ScrollView>
  );
}
