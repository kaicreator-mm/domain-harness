// Multi-process child fixture ENTRY for the successor Node host wave (#457).
// The real fixture body lives in child-main.ts; this thin entry exists so that
// fail-closed reporting is installed BEFORE the body (and its transitive
// imports, e.g. the packed/workspace `@kaicreator/domain-harness` dist) loads.
//
// #953 (Controller 090, Woodpecker 1083/1): one of the eight N08 racing
// workers died without printing its JSON report and the historical assertion
// kept only 7×200-char stdout slices — no exit code, no stderr, no error
// identity. From now on ANY death prints one machine-readable line on stdout
// (`{"pid":...,"error":{"name","message","stack"}}`, exit code 1), including
// deaths during module resolution of the runtime dist. The only deaths that
// stay silent are hard OS kills (taskkill /F / SIGKILL), which the N10
// windows assert on explicitly.
import { writeFileSync } from 'node:fs';

function reportFailure(error: unknown): void {
  const name = error instanceof Error ? error.name : typeof error;
  const message = String(error instanceof Error ? error.message : error);
  const stack = error instanceof Error ? String(error.stack ?? '').slice(0, 4000) : '';
  try {
    writeFileSync(1, `${JSON.stringify({ pid: process.pid, error: { name, message, stack } })}\n`);
  } catch {
    // stdout is gone; stderr below is the remaining channel.
  }
  console.error(error);
}

process.on('uncaughtException', (error) => {
  reportFailure(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  reportFailure(reason);
  process.exit(1);
});

await import('./child-main.js').catch((error: unknown) => {
  reportFailure(error);
  process.exit(1);
});
