/**
 * Machine-readable evidence receipts (experiment KPK-01)
 * ======================================================
 * Every falsifier writes its receipt into experiments/.../evidence/ as JSON.
 * CI uploads the directory; the Builder Terminal references these files.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVIDENCE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'evidence',
);

export async function writeEvidence(name, payload) {
  await mkdir(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.json`);
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}
