import { readFile } from 'node:fs/promises';
import { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';
import { digest } from './knowledge.js';
import { attachConsumer } from './provider-bindings.js';
import type { startKdpPrimary } from './kdp-primary.js';

export const kernelSha256 = 'e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7';
export const primaryId = 'dis-kdp-primary@0.11.0-dev.0';

export async function bootKdp(descriptor: { primary: string; primarySha256: string; lockSha256: string }, kernelSource: string, sqlitePath: string) {
  if (descriptor.primary !== primaryId || !/^[a-f0-9]{64}$/.test(descriptor.lockSha256)) {
    throw new Error('BOOT_DESCRIPTOR_INVALID');
  }
  const bytes = await readFile(new URL('./kdp-primary.js', import.meta.url));
  if (digest(bytes) !== descriptor.primarySha256) throw new Error('KDP_PRIMARY_DIGEST_MISMATCH');
  const moduleUrl = 'data:text/javascript;base64,' + bytes.toString('base64');
  const primary = await import(moduleUrl) as { startKdpPrimary: typeof startKdpPrimary };
  return primary.startKdpPrimary({ kernelSource, kernelSha256, primarySha256: descriptor.primarySha256,
    lockSha256: descriptor.lockSha256, sqlitePath, openSqliteCasStore, attachConsumer, digest });
}
