// #953 (Controller 093, P1-01) — DELIBERATELY MISBEHAVING worker fixture for
// the N08 oracle adversarial regression harness. Each mode reproduces one
// class of "report lies about the process" that the strict oracle must
// reject: a perfectly valid JSON report printed before an abnormal death, a
// silent clean exit, a typed failure envelope, a report from the wrong pid,
// or a duplicated report. This fixture must NEVER be used as a positive
// worker: every mode is asserted to FAIL assertHealthyWorkerReports.
import { writeFileSync } from 'node:fs';

const mode = process.argv[2];

function report(body: Record<string, unknown>): void {
  writeFileSync(1, `${JSON.stringify({
    pid: process.pid,
    instanceDisposition: 'existing',
    provisioningDisposition: 'attached',
    stateRevision: 0,
    ...body,
  })}\n`);
}

switch (mode) {
  // (a) valid report, then nonzero exit — the reviewer's executed counterexample.
  case 'valid-then-exit': {
    report({});
    process.exit(Number(process.argv[3] ?? '137'));
    break;
  }
  // (b) valid report, then hang until the parent watchdog kills the process.
  case 'valid-then-hang': {
    report({});
    setInterval(() => {
      /* hold the event loop; the watchdog must fire */
    }, 60_000);
    break;
  }
  // (b') valid report, then a hard self-kill (taskkill / SIGKILL class).
  case 'valid-then-selfkill': {
    report({});
    process.kill(process.pid, 'SIGKILL');
    break;
  }
  // (c) silent worker: clean exit, zero machine-readable output.
  case 'silent': {
    process.exit(0);
    break;
  }
  // (d) typed failure: the fail-closed error envelope with a nonzero exit.
  case 'typed-failure': {
    writeFileSync(1, `${JSON.stringify({
      pid: process.pid,
      error: { name: 'Error', message: 'adversarial typed failure', stack: '' },
    })}\n`);
    process.exit(1);
    break;
  }
  // A report claiming a pid that is not this process (forged correlation).
  case 'pid-mismatch': {
    report({ pid: process.pid + 4321 });
    process.exit(0);
    break;
  }
  // Two well-formed reports from one child (replay/duplicate class).
  case 'multi-report': {
    report({});
    report({});
    process.exit(0);
    break;
  }
  default:
    throw new Error(`unknown adversarial mode ${String(mode)}`);
}
