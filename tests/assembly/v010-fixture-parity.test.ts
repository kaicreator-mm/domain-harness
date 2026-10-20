/** Guard the two independently packaged Rich consumer/assembly fixtures against byte drift. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SHARED_RICH_MODULES = [
  'business-agent-workflow-v1.mjs',
  'business-external-b-second-v1.mjs',
  'business-external-jobs-v1.mjs',
  'capability-agent-memory-v1.mjs',
  'capability-agent-tool-v1.mjs',
  'capability-extjob-runx-v1.mjs',
  'capability-extnotify-provider-v1.mjs',
  'kext-advisory-alpha-v1.mjs',
  'kext-advisory-beta-v1.mjs',
] as const;

// These duplicate files are intentional so that a packed consumer is
// independent of the source checkout. Their byte identity is mandatory.
test('v0.10 #1226: clean-consumer and assembly Rich modules stay byte-identical', async () => {
  for (const filename of SHARED_RICH_MODULES) {
    const [consumer, assembly] = await Promise.all([
      readFile(new URL(`../../examples/v010-clean-consumer/apps/rich/modules/${filename}`, import.meta.url)),
      readFile(new URL(`./fixtures-v010/${filename}`, import.meta.url)),
    ]);
    assert.deepEqual(consumer, assembly, `source fixture drift: ${filename}`);
  }
});
