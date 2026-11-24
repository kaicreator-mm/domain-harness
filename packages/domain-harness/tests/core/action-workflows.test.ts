import test from 'node:test';
import { actionCases } from '../../../../examples/native-domain-app/action/verify.js';

for (const [name, verify] of actionCases) test('T06 ' + name, verify);
