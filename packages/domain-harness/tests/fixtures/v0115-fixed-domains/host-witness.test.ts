import test from 'node:test';
import { managedActionCases, actionCases, interactiveActionCases } from '../../../../../examples/native-domain-app/action/verify.js';

// Prior authority/approval contracts remain mandatory; new .5 witnesses use the same actual authority.
for(const [name,verify] of [...actionCases,...interactiveActionCases,...managedActionCases])test(name.startsWith('D-C ')?name:'D-C '+name,verify);
