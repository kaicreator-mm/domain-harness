import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import {
  runSuccessorExpoValidation,
  type SuccessorValidationResult,
} from './run-successor-expo-validation';

/**
 * Emit a machine-readable marker + payload through logcat. Hermes renders
 * multi-argument console.log as `'ARG1', 'ARG2'` (breaking the host-side
 * `MARKER {json}` regex) and logcat truncates single lines around 4KB, so the
 * payload is emitted as one single concatenated string split into numbered
 * chunks the host reassembles: `TAG <i>/<n> <chunk>`.
 */
function emitChunked(tag: string, payload: string): void {
  const chunks = payload.match(/[\s\S]{1,1500}/g) ?? [''];
  chunks.forEach((chunk, index) => {
    console.log(`${tag} ${index}/${chunks.length} ${chunk}`);
  });
}

export default function App() {
  const [output, setOutput] = useState('RUNNING SX-E successor Expo host validation...');

  useEffect(() => {
    void runSuccessorExpoValidation()
      .then((result: SuccessorValidationResult) => {
        emitChunked('SUCCESSOR_EXPO_VALIDATION', JSON.stringify(result));
        if (result.comparator !== undefined) {
          emitChunked('SUCCESSOR_EXPO_COMPARATOR', JSON.stringify(result.comparator));
        }
        setOutput(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
        console.error(`SUCCESSOR_EXPO_VALIDATION_FAIL ${message}`);
        setOutput(`FAIL\n${message}`);
      });
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text selectable>{output}</Text>
    </ScrollView>
  );
}
