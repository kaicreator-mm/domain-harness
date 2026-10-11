/**
 * #953 (Controller 093, P1-01) — the strict worker-report oracle shared by the
 * N08 multi-process provisioning race and its adversarial regression harness.
 *
 * The Controller-092 reviewer proved with an executed counterexample that the
 * previous N08 oracle accepted a worker that printed a perfectly valid JSON
 * report and THEN died abnormally (`code=137`, or `code=null,timedOut=true`
 * after a watchdog kill): the assertions only counted reports and
 * dispositions, and `code/killed/timedOut` were surfaced as diagnostics when
 * JSON was absent — never as a positive pass condition. A real child can
 * print its report before a subsequent abnormal termination; the oracle here
 * fails closed on exactly that class.
 *
 * Pass requires, per launched worker: a normally exited process
 * (`code === 0`, `signal === null`, not killed, not timed out), EXACTLY one
 * machine-readable report line on stdout, a correctly shaped report
 * (`pid` correlating with the child's real pid, `instanceDisposition` ∈
 * {created, existing}, string `provisioningDisposition`, numeric
 * `stateRevision`), and no structured `error` envelope. Disposition counts
 * (one created / rest existing) and the caller's durable singleton
 * assertions are unchanged in strength.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export interface ChildOutcome {
  readonly pid: number;
  readonly instanceDisposition?: string;
  readonly provisioningDisposition?: string;
  readonly stateRevision?: number;
  /** Present when the child died through the fail-closed reporting entry (#953). */
  readonly error?: { readonly name: string; readonly message: string; readonly stack: string };
}

export interface ChildResult {
  readonly pid: number;
  readonly code: number | null;
  readonly signal: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly killed: boolean;
  readonly timedOut: boolean;
}

export interface SpawnChildOptions {
  readonly killAt?: string;
  readonly killSignalFile?: string;
  readonly timeoutMs?: number;
}

/**
 * Rejected ONLY when the OS could not start the process at all — such a
 * worker never touched the provisioning seam, so ONE bounded retry of a
 * `SpawnFailure` cannot replay or mask a launched worker's outcome. A
 * launched process that later dies resolves normally (with its exit state)
 * and must fail the oracle instead of being retried.
 */
export class SpawnFailure extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'SpawnFailure';
  }
}

/**
 * Spawn a real worker process and capture its full exit state plus both
 * output streams. stdout stays pure machine-readable JSON; stderr is
 * captured separately so interleaved loader noise can never corrupt a report
 * line, and stays available verbatim for failure diagnostics.
 */
export function spawnReportedChild(scriptPath: string, args: readonly string[], options: SpawnChildOptions = {}): Promise<ChildResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--import', 'tsx', scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      // Strip the test-runner worker identity: a child of a `node --test`
      // parent must run as a plain process, not inherit NODE_TEST_CONTEXT.
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, SX_BUSY_TIMEOUT_MS: '30000' },
    });
    let stdout = '';
    let stderr = '';
    let killed = false;
    let timedOut = false;
    let launched = false;
    child.on('spawn', () => {
      launched = true;
    });
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const watchdog = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      // #953: a hung worker used to hang the whole suite until the runner
      // timeout with zero diagnostics; kill it and let the oracle surface the
      // exit state plus captured output.
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* raced exit */
      }
    }, options.timeoutMs);
    if (options.killAt !== undefined && options.killSignalFile !== undefined) {
      const timer = setInterval(() => {
        if (!existsSync(options.killSignalFile!)) return;
        try {
          const stages = readFileSync(options.killSignalFile, 'utf8');
          if (!stages.includes(`${child.pid}:${options.killAt}`)) return;
          // Real OS kill per platform (prep N00: Windows taskkill /F /T,
          // POSIX PID-targeted SIGKILL).
          if (process.platform === 'win32') {
            execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
          } else {
            process.kill(child.pid, 'SIGKILL');
          }
          killed = true;
        } catch {
          /* raced exit */
        }
        clearInterval(timer);
      }, 25);
      child.on('exit', () => clearInterval(timer));
    }
    // The 'error' event fires for spawn failures AND for later kill/send
    // failures. Only a process that never started may reject (SpawnFailure);
    // a launched worker always resolves through 'close' so its failure is
    // asserted, never retried away.
    child.on('error', (error) => {
      if (launched) return;
      rejectPromise(new SpawnFailure(String(error), { cause: error }));
    });
    child.on('close', (code, signal) => {
      if (watchdog !== undefined) clearTimeout(watchdog);
      resolvePromise({ pid: child.pid ?? -1, code, signal, stdout, stderr, killed, timedOut });
    });
  });
}

/** Retry a launch ONLY across an OS-level spawn failure (never a launched worker). */
export async function withSpawnOnlyRetry<T>(launch: () => Promise<T>, label?: string): Promise<T> {
  try {
    return await launch();
  } catch (error) {
    if (!(error instanceof SpawnFailure)) throw error;
    if (label !== undefined) console.error('SPAWN_RETRY', label, String(error));
    return launch();
  }
}

export interface WorkerReportExpectation {
  readonly workers: number;
  readonly created: number;
  readonly existing: number;
}

/** Full per-worker forensics for oracle failures — exit state plus real stream tails. */
export function workerDiagnostics(result: ChildResult): Record<string, unknown> {
  return {
    pid: result.pid,
    code: result.code,
    signal: result.signal,
    killed: result.killed,
    timedOut: result.timedOut,
    stderrTail: result.stderr.slice(-2000),
    stdoutTail: result.stdout.slice(-2000),
  };
}

/**
 * The strict pass oracle: every launched worker must have exited cleanly AND
 * printed exactly one correctly shaped, pid-correlated, error-free report.
 * Throws (fail-closed) with full per-worker diagnostics on ANY violation;
 * returns the parsed outcomes only when the whole set is healthy.
 */
export function assertHealthyWorkerReports(results: readonly ChildResult[], expectation: WorkerReportExpectation): readonly ChildOutcome[] {
  const problems: string[] = [];
  if (results.length !== expectation.workers) {
    problems.push(`worker-count: got ${results.length} results for ${expectation.workers} launched workers — a dropped result is a lost report`);
  }
  const outcomes: ChildOutcome[] = [];
  results.forEach((result, index) => {
    const workerProblems: string[] = [];
    if (result.code !== 0 || result.signal !== null || result.killed || result.timedOut) {
      workerProblems.push(
        `abnormal exit: code=${result.code} signal=${result.signal} killed=${result.killed} timedOut=${result.timedOut} — a worker that printed a valid report and then died must FAIL, not pass`,
      );
    }
    const reportLines = result.stdout.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('{'));
    if (reportLines.length === 0) {
      workerProblems.push('silent worker: no machine-readable report line on stdout');
    } else {
      if (reportLines.length > 1) {
        workerProblems.push(`${reportLines.length} report lines on stdout: exactly one per child — duplicate or replayed reports are rejected`);
      }
      let outcome: ChildOutcome | undefined;
      try {
        outcome = JSON.parse(reportLines[0]!) as ChildOutcome;
      } catch (error) {
        workerProblems.push(`unparsable report line: ${String(error)}`);
      }
      if (outcome !== undefined) {
        if (outcome.error !== undefined) {
          workerProblems.push(`structured failure report: ${outcome.error.name}: ${outcome.error.message}`);
        }
        if (typeof outcome.pid !== 'number' || outcome.pid !== result.pid) {
          workerProblems.push(`pid correlation failed: report pid ${JSON.stringify(outcome.pid)} vs child pid ${result.pid}`);
        }
        if (outcome.instanceDisposition !== 'created' && outcome.instanceDisposition !== 'existing') {
          workerProblems.push(`malformed report: instanceDisposition must be 'created'|'existing', got ${JSON.stringify(outcome.instanceDisposition)}`);
        }
        if (typeof outcome.provisioningDisposition !== 'string') {
          workerProblems.push(`malformed report: provisioningDisposition must be a string, got ${JSON.stringify(outcome.provisioningDisposition)}`);
        }
        if (typeof outcome.stateRevision !== 'number') {
          workerProblems.push(`malformed report: stateRevision must be a number, got ${JSON.stringify(outcome.stateRevision)}`);
        }
        if (workerProblems.length === 0) outcomes.push(outcome);
      }
    }
    if (workerProblems.length > 0) {
      problems.push(`worker #${index}: ${workerProblems.join('; ')} | diagnostics: ${JSON.stringify(workerDiagnostics(result))}`);
    }
  });
  if (problems.length > 0) {
    throw new Error(`unhealthy worker results — the oracle fails closed on any abnormal worker:\n${problems.join('\n')}`);
  }
  const created = outcomes.filter((outcome) => outcome.instanceDisposition === 'created').length;
  const existing = outcomes.filter((outcome) => outcome.instanceDisposition === 'existing').length;
  if (created !== expectation.created || existing !== expectation.existing) {
    throw new Error(`disposition counts must be exactly ${expectation.created} created / ${expectation.existing} existing, got ${created} created / ${existing} existing`);
  }
  return outcomes;
}
