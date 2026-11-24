import test from 'node:test';
import { intentCases } from '../../../../examples/native-domain-app/intent/verify.js';

for (const [name, verify] of intentCases) test('T05 ' + name, verify);
