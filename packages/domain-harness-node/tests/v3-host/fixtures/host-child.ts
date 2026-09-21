import {
  ScriptedEffectTools,
  makeRequest,
} from '../../../../domain-harness/tests/admission/helpers.js';
import { openHostFixture, pinInstance } from '../host-fixture.js';

const [mode, databasePath] = process.argv.slice(2);
if (!mode || !databasePath) {
  throw new Error('usage: host-child <mode> <databasePath>');
}

if (mode === 'admit-crash-after-effect') {
  // V8 crash window: the durable effect commit lands, then the process dies
  // before any later turn bookkeeping (evidence) can complete.
  const fixture = await openHostFixture(databasePath, {
    wrapEffectJournal: (inner) => ({
      getEffect: (effectId) => inner.getEffect(effectId),
      beginEffect: (record) => inner.beginEffect(record),
      async completeEffect(effectId, outcome) {
        const record = await inner.completeEffect(effectId, outcome);
        if (outcome.status === 'completed') {
          process.stdout.write('crash:after-effect-commit\n');
          process.exit(137);
        }
        return record;
      },
    }),
  });
  await pinInstance(fixture);
  const outcome = await fixture.assembly.admitTurn(makeRequest());
  process.stdout.write(`unexpected:${outcome.status}\n`);
  process.exit(1);
}

if (mode === 'admit-crash-mid-execute') {
  // V9 crash window: the journal holds a started record and the process dies
  // inside tool execution, before the outcome is committed.
  const tools = new ScriptedEffectTools({ 'effect:reserve': 'non-idempotent' }, () => {
    process.stdout.write('crash:mid-execute\n');
    process.exit(137);
  });
  const fixture = await openHostFixture(databasePath, { effectTools: tools });
  await pinInstance(fixture);
  const outcome = await fixture.assembly.admitTurn(makeRequest());
  process.stdout.write(`unexpected:${outcome.status}\n`);
  process.exit(1);
}

throw new Error(`unknown mode ${mode}`);
