// Node smoke entry: runs the T-023 device suite logic against the
// better-sqlite3 stub. Usage:
//   node --import tsx node-smoke.ts   (phase detected from the stub DB state)
(globalThis as Record<string, unknown>)['HermesInternal'] = { smoke: true };

const { runExpoV3HostValidation } = await import('./run-expo-v3-host-validation');
const { closeAllForSmoke, cleanupSmoke } = await import('./node-smoke-sqlite-stub');

try {
  const result = await runExpoV3HostValidation();
  console.log('SMOKE_RESULT', JSON.stringify(result, null, 2));
} finally {
  await closeAllForSmoke();
  if (process.argv.includes('--cleanup')) cleanupSmoke();
}
