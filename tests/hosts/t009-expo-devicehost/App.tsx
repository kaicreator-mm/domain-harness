import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import {
  runT009DeviceValidation,
  type T009ValidationResult,
} from './t009-device-validation';

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
  const [output, setOutput] = useState('RUNNING T009 v0.6 Expo/Android/Hermes REAL-device validation...');

  useEffect(() => {
    void runT009DeviceValidation()
      .then((result: T009ValidationResult) => {
        emitChunked('T009_DEVICE_VALIDATION', JSON.stringify(result));
        setOutput(JSON.stringify(result, null, 2));
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
        console.error(`T009_DEVICE_VALIDATION_FAIL ${message}`);
        setOutput(`FAIL\n${message}`);
      });
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text selectable>{output}</Text>
    </ScrollView>
  );
}
