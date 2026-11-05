import { loadVerifiedDemo } from './verified-loader.mjs';
import { runPipeline } from './runner.mjs';

const loaded = await loadVerifiedDemo();
const examples = [
  { label: 'known', input: { url: 'https://example.test/watch', signals: ['jwplayer.setup({})'] } },
  { label: 'ambiguous', input: { url: 'https://example.test/watch', signals: ['jwplayer', 'videojs'] } },
  { label: 'unknown', input: { url: 'https://example.test/watch', signals: ['custom-player'] } },
];
for (const example of examples) {
  const result = await runPipeline(example.input, loaded);
  console.log(JSON.stringify({ case: example.label, outcome: result.outcome, trace: result.trace.map((entry) => entry.nodeId) }, null, 2));
}
