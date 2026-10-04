// T008 (issue #594) J9 worker: the composed v0.6 turn loop over the REAL node
// SQLite store inside a REAL child process that the parent SIGKILLs at a
// durable boundary; a SECOND process then reopens the same files and verifies
// no duplicate decision / effect / state mutation on replay.
//
//   crash:  t594-kill-worker.mts crash  <fixtureDir> <tracePath>
//   resume: t594-kill-worker.mts resume <fixtureDir> <tracePath>
import { appendFileSync, readFileSync } from 'node:fs';

import { ScriptedEffectTools } from '../../../../packages/domain-harness/tests/admission/helpers.js';
import { CapturingRule, commandMessage } from '../../../../packages/domain-harness/tests/v06-conformance/fixtures.js';
import { quoteResult } from '../../../../packages/domain-harness/tests/decision-resolver/helpers.js';
import {
  disposeT594Directory,
  openAndPinT594Instance,
  openT594Fixture,
  readAllT594Records,
  t594ProcessCommandTurn,
  target,
  type T594Fixture,
} from '../t594-real-host-fixture.ts';

const [mode, fixtureDir, tracePath] = process.argv.slice(2) as [string, string, string];

const MESSAGE_ID = 'msg-t594-kill';

/** Effect tools that leave one durable line per external execution on disk. */
class FileTracingEffectTools extends ScriptedEffectTools {
  readonly #tracePath: string;

  constructor(tracePath: string) {
    super({ 'effect:reserve': 'non-idempotent' });
    this.#tracePath = tracePath;
  }

  override async execute(request: Parameters<ScriptedEffectTools['execute']>[0]) {
    const result = await super.execute(request);
    appendFileSync(
      this.#tracePath,
      `${JSON.stringify({
        effectId: request.effectId,
        effectType: request.binding.effectType,
        durableControlTurnId: request.durableControlTurnId,
      })}\n`,
      'utf8',
    );
    return result;
  }
}

function ruleFor(): CapturingRule {
  return new CapturingRule({ status: 'match', result: quoteResult('approve', { via: 'rule' }) });
}

function messageFor() {
  return commandMessage(MESSAGE_ID);
}

function traceCount(path: string): number {
  try {
    const raw = readFileSync(path, 'utf8');
    return raw.length === 0 ? 0 : raw.split('\n').filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

async function runCrash(fixtureDir: string, tracePath: string): Promise<never> {
  const fixture = await openT594Fixture({
    directory: fixtureDir,
    effectTools: new FileTracingEffectTools(tracePath),
  });
  await openAndPinT594Instance(fixture);
  const result = await t594ProcessCommandTurnFor(fixture);
  if (result.kind !== 'processed') {
    throw new Error(`T594 crash worker expected the composed turn to process, got ${result.kind}`);
  }
  // The durable boundary is crossed: acceptance, admission transition, effect
  // journal, command outcome and observations are committed (WAL, synchronous
  // FULL). BOUNDARY is only printed AFTER the commit; the parent then SIGKILLs
  // this process WITHOUT any clean close of the SQLite handles.
  process.stdout.write(`BOUNDARY ${JSON.stringify({
    stage: 'after-processed-commit',
    messageId: MESSAGE_ID,
  })}\n`);
  await new Promise<never>(() => {
    // Hold the process (and its open SQLite handles) until the parent SIGKILLs it.
  });
}

async function runResume(fixtureDir: string, tracePath: string): Promise<void> {
  // Fresh runtime assembly over the SAME files left by the killed process.
  const fixture: T594Fixture = await openT594Fixture({
    directory: fixtureDir,
    effectTools: new FileTracingEffectTools(tracePath),
  });
  try {
    const instance = await fixture.store.getInstance(target);
    const disposition = await fixture.store.getMessageDisposition(target, MESSAGE_ID);
    const outcome = await fixture.store.getCommandOutcome(target, MESSAGE_ID);
    const journal = fixture.authorities.admissionEffectJournal.getRecords();
    const observations = await readAllT594Records(fixture);
    const traceBefore = traceCount(tracePath);

    // Replay the exact same message through the composed loop: the A8
    // acceptance boundary must classify it as a valid duplicate and the
    // original outcome must be reused — no duplicate decision, no duplicate
    // effect, no duplicate state mutation.
    const replay = await t594ProcessCommandTurnFor(fixture);

    const journalAfter = fixture.authorities.admissionEffectJournal.getRecords();
    const observationsAfter = await readAllT594Records(fixture);
    const instanceAfter = await fixture.store.getInstance(target);

    emitResult({
      before: {
        instanceFound: instance !== null,
        stateRevision: instance?.stateRevision ?? null,
        lifecycle: instance?.lifecycle ?? null,
        disposition: disposition?.disposition ?? null,
        outcomeStatus: outcome?.status ?? null,
        journalRecords: journal.length,
        observationRecords: observations.length,
        observationKinds: observations.map((record) => record.kind),
        traceLines: traceBefore,
      },
      replay: replay.kind === 'duplicate-ack'
        ? {
            kind: 'duplicate-ack',
            status: replay.ack.status,
            targetSequence: replay.ack.targetSequence,
            existingOutcomeStatus: replay.existingOutcome?.status ?? null,
          }
        : { kind: replay.kind, unexpected: true },
      after: {
        stateRevision: instanceAfter?.stateRevision ?? null,
        journalRecords: journalAfter.length,
        observationRecords: observationsAfter.length,
        traceLines: traceCount(tracePath),
      },
    });
  } finally {
    fixture.close();
    disposeT594Directory(fixture);
  }
}

async function t594ProcessCommandTurnFor(fixture: T594Fixture) {
  return t594ProcessCommandTurn(fixture, messageFor(), { rule: ruleFor() });
}

function emitResult(payload: unknown): void {
  process.stdout.write(`RESULT ${JSON.stringify(payload)}\n`);
}

if (mode === 'crash') {
  await runCrash(fixtureDir, tracePath);
} else if (mode === 'resume') {
  await runResume(fixtureDir, tracePath);
} else {
  throw new Error(`Usage: t594-kill-worker.mts <crash|resume> <fixtureDir> <tracePath>`);
}
