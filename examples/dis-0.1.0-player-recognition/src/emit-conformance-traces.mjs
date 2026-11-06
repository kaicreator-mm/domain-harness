import { loadVerifiedDemo } from './verified-loader.mjs';
import { runPipeline } from './runner.mjs';

const loaded = await loadVerifiedDemo();
if (process.argv.includes('--scope-probes')) {
  const probes = [
    { url: 'ftp://example.test/page', signals: [] },
    { url: 'https://example.test/page', signals: [], encryptedPlayer: true },
    { url: 'https://example.test/page', signals: [], unsupportedPlayerFamily: true },
  ];
  const result = [];
  for (const input of probes) {
    try { await runPipeline(input, loaded); throw new Error('scope exclusion unexpectedly executed'); }
    catch (error) {
      if (error.code !== 'FAILURE_POLICY_REJECT' || !Array.isArray(error.trace)) throw error;
      result.push({ input, errorCode: error.code, trace: error.trace, output: error.trace.at(-1)?.output });
    }
  }
  console.log(JSON.stringify(result));
  process.exit(0);
}
const cases = [
  { label: 'known', input: { url: 'https://example.test/watch', signals: ['jwplayer.setup({})'] } },
  { label: 'ambiguous', input: { url: 'https://example.test/watch', signals: ['jwplayer', 'videojs'] } },
  { label: 'unknown', input: { url: 'https://example.test/watch', signals: ['custom-player'] } },
  { label: 'fixture-hls', input: { url: 'https://example.test/watch', signals: ['hls.js'] } },
  { label: 'conflict', input: { url: 'https://example.test/watch', signals: ['jwplayer'], claims: [{ sourceId: 'browser', playerId: 'videojs' }] } },
];
const results = [];
for (const item of cases) {
  results.push({ label: item.label, input: item.input, packageIdentity: loaded.packageIdentity, ...(await runPipeline(item.input, loaded)) });
}
console.log(JSON.stringify(results));
