import { loadVerifiedDemo } from './verified-loader.mjs';
import { runPipeline } from './runner.mjs';

const loaded = await loadVerifiedDemo();
const cases = [
  { label: 'known', input: { url: 'https://example.test/watch', signals: ['jwplayer.setup({})'] } },
  { label: 'ambiguous', input: { url: 'https://example.test/watch', signals: ['jwplayer', 'videojs'] } },
  { label: 'unknown', input: { url: 'https://example.test/watch', signals: ['custom-player'] } },
  { label: 'fixture-hls', input: { url: 'https://example.test/watch', signals: ['hls.js'] } },
];
const results = [];
for (const item of cases) {
  results.push({ label: item.label, input: item.input, packageIdentity: loaded.packageIdentity, ...(await runPipeline(item.input, loaded)) });
}
console.log(JSON.stringify(results));
