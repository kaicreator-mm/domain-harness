import { loadVerifiedDemo } from './verified-loader.mjs';
import { runPipeline, recognizePlayer } from './runner.mjs';

const loaded = await loadVerifiedDemo();
if (process.argv.includes('--scope-probes')) {
  const unit = loaded.unitsById.get('xdownload.player.recognizer');
  const probes = [
    { url: 'ftp://example.test/page', signals: [] },
    { url: 'https://example.test/page', signals: [], encryptedPlayer: true },
    { url: 'https://example.test/page', signals: [], unsupportedPlayerFamily: true },
  ];
  const result = probes.map((input) => ({ input, output: recognizePlayer(input, { unit, knowledge: loaded.knowledge }) }));
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
